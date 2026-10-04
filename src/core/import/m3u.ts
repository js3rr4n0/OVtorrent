import { MAX_PLAYLIST_ITEMS, MAX_TITLE_LENGTH, type MediaItem } from '../schemas/media';
import { sanitizeText, validateMediaUrl } from '../security/sanitize';
import { createId } from '../streaming/sessionId';
import { parseMagnet } from './magnet';

export const MAX_M3U_BYTES = 2 * 1024 * 1024;

export type M3uKind = 'media-list' | 'hls-master' | 'hls-media';

export interface M3uEntry {
  url: string;
  title?: string;
  durationSeconds?: number;
  /** Declared HLS variant attributes when the line came from EXT-X-STREAM-INF. */
  bandwidth?: number;
  resolution?: { width: number; height: number };
}

export interface M3uParseResult {
  kind: M3uKind;
  entries: M3uEntry[];
  errors: Array<{ line: number; message: string }>;
  warnings: string[];
}

function parseAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]!] = m[3] ?? m[2] ?? '';
  }
  return out;
}

function resolveUrl(raw: string, baseUrl?: string): string | null {
  const value = raw.trim();
  if (/^magnet:\?/i.test(value)) return value;
  try {
    return (baseUrl ? new URL(value, baseUrl) : new URL(value)).toString();
  } catch {
    return null;
  }
}

/**
 * Parses M3U / M3U8 text. Three shapes are recognised:
 * - a plain list of media URLs or magnets (`#EXTINF` optional) → `media-list`;
 * - an HLS master playlist (`#EXT-X-STREAM-INF`) → `hls-master`;
 * - an HLS media playlist (`#EXT-X-TARGETDURATION`, segments) → `hls-media`.
 * Nothing is fetched: relative URLs are only resolved against `baseUrl`.
 */
export function parseM3u(text: string, baseUrl?: string): M3uParseResult {
  const errors: M3uParseResult['errors'] = [];
  const warnings: string[] = [];
  const entries: M3uEntry[] = [];
  if (text.length > MAX_M3U_BYTES) {
    return {
      kind: 'media-list',
      entries,
      errors: [{ line: 0, message: 'El archivo supera 2 MB' }],
      warnings,
    };
  }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const state: { kind: M3uKind } = { kind: 'media-list' };
  let pending: Partial<M3uEntry> = {};
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      if (line.startsWith('#EXTINF:')) {
        const body = line.slice('#EXTINF:'.length);
        const comma = body.indexOf(',');
        const durationRaw = comma >= 0 ? body.slice(0, comma) : body;
        const title = comma >= 0 ? body.slice(comma + 1) : '';
        const duration = Number.parseFloat(durationRaw);
        pending = {
          ...pending,
          title: sanitizeText(title, MAX_TITLE_LENGTH) || undefined,
          durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : undefined,
        };
      } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        state.kind = 'hls-master';
        const attrs = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
        const bw = Number.parseInt(attrs.BANDWIDTH ?? '', 10);
        const res = /^(\d+)x(\d+)$/.exec(attrs.RESOLUTION ?? '');
        pending = {
          ...pending,
          bandwidth: Number.isFinite(bw) ? bw : undefined,
          resolution: res ? { width: Number(res[1]), height: Number(res[2]) } : undefined,
          title:
            pending.title ?? (attrs.NAME ? sanitizeText(attrs.NAME, MAX_TITLE_LENGTH) : undefined),
        };
      } else if (
        line.startsWith('#EXT-X-TARGETDURATION') ||
        line.startsWith('#EXT-X-MEDIA-SEQUENCE')
      ) {
        if (state.kind !== 'hls-master') state.kind = 'hls-media';
      }
      return;
    }
    if (entries.length >= MAX_PLAYLIST_ITEMS) {
      if (
        errors.length === 0 ||
        errors[errors.length - 1]!.message !== 'Límite de elementos alcanzado'
      ) {
        errors.push({ line: i + 1, message: 'Límite de elementos alcanzado' });
      }
      return;
    }
    const url = resolveUrl(line, baseUrl);
    if (!url) {
      errors.push({
        line: i + 1,
        message: baseUrl ? 'URL no válida' : 'URL relativa sin URL base',
      });
      pending = {};
      return;
    }
    entries.push({ url, ...pending });
    pending = {};
  });
  const kind = state.kind;
  if (kind === 'hls-media' && entries.length > 0) {
    warnings.push('Es una playlist HLS de segmentos: se importará como una única fuente HLS.');
  }
  return { kind, entries, errors, warnings };
}

export interface M3uImportResult {
  ok: boolean;
  items: MediaItem[];
  kind: M3uKind;
  errors: Array<{ line: number; message: string }>;
  warnings: string[];
  needsConfirmation: boolean;
}

function sourceTypeFor(url: string): MediaItem['sourceType'] | null {
  if (/^magnet:\?/i.test(url)) return 'magnet';
  const v = validateMediaUrl(url);
  if (!v.ok || !v.url) return null;
  if (/\.m3u8?(\?|#|$)/i.test(v.url.pathname + v.url.search)) return 'hls';
  return 'url';
}

/**
 * Turns parsed M3U content into validated MediaItems. HLS playlists (master
 * or media) become one `hls` item pointing at `sourceUrl`, which must be
 * provided because an HLS playlist cannot be played from pasted text.
 */
export function importM3u(
  text: string,
  options: { sourceUrl?: string; fallbackTitle?: string } = {},
): M3uImportResult {
  const parsed = parseM3u(text, options.sourceUrl);
  const items: MediaItem[] = [];
  const errors = [...parsed.errors];
  if (parsed.kind !== 'media-list') {
    if (!options.sourceUrl) {
      errors.push({
        line: 0,
        message: 'Esta es una playlist HLS: introdúcela por su URL para poder reproducirla.',
      });
      return {
        ok: false,
        items,
        kind: parsed.kind,
        errors,
        warnings: parsed.warnings,
        needsConfirmation: false,
      };
    }
    const v = validateMediaUrl(options.sourceUrl);
    if (!v.ok) {
      errors.push({ line: 0, message: v.reason ?? 'URL no válida' });
      return {
        ok: false,
        items,
        kind: parsed.kind,
        errors,
        warnings: parsed.warnings,
        needsConfirmation: false,
      };
    }
    const variants = parsed.entries.filter((e) => e.resolution || e.bandwidth);
    items.push({
      id: createId(),
      sourceType: 'hls',
      source: options.sourceUrl,
      title:
        sanitizeText(options.fallbackTitle ?? '', MAX_TITLE_LENGTH) ||
        v.url?.pathname.split('/').pop() ||
        'HLS',
      description:
        variants.length > 0
          ? `Variantes declaradas: ${variants
              .map((e) =>
                e.resolution
                  ? `${e.resolution.height}p`
                  : e.bandwidth
                    ? `${Math.round(e.bandwidth / 1000)} kbps`
                    : '?',
              )
              .join(', ')}`
          : '',
      tags: ['hls'],
      position: 0,
      qualityLabel: undefined,
      addedAt: new Date().toISOString(),
    });
    return {
      ok: errors.length === 0,
      items,
      kind: parsed.kind,
      errors,
      warnings: parsed.warnings,
      needsConfirmation: false,
    };
  }
  parsed.entries.forEach((entry, idx) => {
    if (entry.url.startsWith('magnet:')) {
      const r = parseMagnet(entry.url);
      if (!r.ok) {
        errors.push({ line: idx + 1, message: `Magnet no válido: ${r.reason}` });
        return;
      }
      items.push({
        id: createId(),
        sourceType: 'magnet',
        source: r.magnet.normalized,
        title: entry.title ?? r.magnet.displayName ?? `Magnet ${r.magnet.infoHash.slice(0, 8)}`,
        description: '',
        tags: [],
        position: items.length,
        durationSeconds: entry.durationSeconds,
        addedAt: new Date().toISOString(),
      });
      return;
    }
    const type = sourceTypeFor(entry.url);
    if (!type) {
      errors.push({ line: idx + 1, message: `URL rechazada: ${entry.url.slice(0, 80)}` });
      return;
    }
    let title = entry.title;
    if (!title) {
      try {
        title =
          decodeURIComponent(new URL(entry.url).pathname.split('/').pop() || '') ||
          new URL(entry.url).hostname;
      } catch {
        title = 'Elemento';
      }
    }
    items.push({
      id: createId(),
      sourceType: type,
      source: entry.url,
      title: sanitizeText(title, MAX_TITLE_LENGTH) || 'Elemento',
      description: '',
      tags: type === 'hls' ? ['hls'] : [],
      position: items.length,
      durationSeconds: entry.durationSeconds,
      addedAt: new Date().toISOString(),
    });
  });
  if (items.length === 0 && errors.length === 0)
    errors.push({ line: 0, message: 'La lista no contiene elementos' });
  return {
    ok: errors.length === 0 && items.length > 0,
    items,
    kind: parsed.kind,
    errors,
    warnings: parsed.warnings,
    needsConfirmation: items.length > 50,
  };
}
