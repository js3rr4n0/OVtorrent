import { z } from 'zod';
import {
  LARGE_IMPORT_THRESHOLD,
  MAX_PLAYLIST_ITEMS,
  mediaItemSchema,
  type MediaItem,
} from '../schemas/media';
import { containsForbiddenKeys, playlistSchema, type Playlist } from '../schemas/playlist';
import { createId } from '../streaming/sessionId';
import { parseMagnet } from './magnet';
import { validateMediaUrl } from '../security/sanitize';

export interface FieldError {
  path: string;
  message: string;
}

export interface JsonImportResult {
  ok: boolean;
  playlist?: Playlist;
  errors: FieldError[];
  warnings: string[];
  /** True when the number of items exceeds the confirmation threshold. */
  needsConfirmation: boolean;
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function zodErrors(error: z.ZodError): FieldError[] {
  return error.issues.slice(0, 50).map((i) => ({
    path: i.path.map(String).join('.') || '(raíz)',
    message: i.message,
  }));
}

/** Validates each item's source according to its type. Never resolves anything remotely. */
export function validateItemSource(item: MediaItem): string | null {
  switch (item.sourceType) {
    case 'magnet': {
      const r = parseMagnet(item.source);
      return r.ok ? null : r.reason;
    }
    case 'url':
    case 'hls': {
      const r = validateMediaUrl(item.source);
      return r.ok ? null : (r.reason ?? 'URL no válida');
    }
    case 'file':
      // Local files only keep a display name; the user must re-select them to play.
      return item.source.length > 0 ? null : 'Nombre de archivo vacío';
    case 'torrent':
    case 'm3u':
      return null;
    default:
      return 'Tipo de fuente desconocido';
  }
}

export function importPlaylistJson(text: string): JsonImportResult {
  const errors: FieldError[] = [];
  const warnings: string[] = [];
  if (text.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      errors: [{ path: '(archivo)', message: 'El archivo supera 2 MB' }],
      warnings,
      needsConfirmation: false,
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [{ path: '(raíz)', message: 'JSON no válido' }],
      warnings,
      needsConfirmation: false,
    };
  }
  const forbidden = containsForbiddenKeys(data);
  if (forbidden) {
    return {
      ok: false,
      errors: [{ path: forbidden, message: 'Campo no permitido por seguridad' }],
      warnings,
      needsConfirmation: false,
    };
  }
  const parsed = playlistSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error), warnings, needsConfirmation: false };
  }
  const items: MediaItem[] = [];
  parsed.data.items.forEach((item, idx) => {
    const problem = validateItemSource(item);
    if (problem) errors.push({ path: `items.${idx}.source`, message: problem });
    else items.push({ ...item, position: idx, addedAt: item.addedAt ?? new Date().toISOString() });
  });
  if (errors.length > 0) return { ok: false, errors, warnings, needsConfirmation: false };
  if (items.length > MAX_PLAYLIST_ITEMS) {
    return {
      ok: false,
      errors: [{ path: 'items', message: `Máximo ${MAX_PLAYLIST_ITEMS} elementos` }],
      warnings,
      needsConfirmation: false,
    };
  }
  // Items ids are regenerated to avoid collisions with existing local data.
  const seen = new Set<string>();
  const dedupedItems = items.map((it) => {
    const id = seen.has(it.id) ? createId() : it.id;
    seen.add(id);
    return { ...it, id };
  });
  const now = new Date().toISOString();
  const playlist: Playlist = {
    ...parsed.data,
    id: createId(),
    items: dedupedItems,
    createdAt: parsed.data.createdAt ?? now,
    updatedAt: now,
  };
  return {
    ok: true,
    playlist,
    errors,
    warnings,
    needsConfirmation: playlist.items.length > LARGE_IMPORT_THRESHOLD,
  };
}

/** Builds a MediaItem from validated form input. */
export function createMediaItem(
  input: Omit<z.input<typeof mediaItemSchema>, 'id' | 'addedAt'>,
): MediaItem {
  return mediaItemSchema.parse({ ...input, id: createId(), addedAt: new Date().toISOString() });
}
