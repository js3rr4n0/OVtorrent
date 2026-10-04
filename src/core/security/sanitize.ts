/**
 * Metadata is plain text only. Nothing imported is ever rendered as HTML or
 * executed; React escapes strings by default and these helpers strip what
 * should never reach the UI or storage.
 */
export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return (
    input
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, maxLength)
  );
}

export function sanitizeTags(input: unknown, maxTags: number, maxLen: number): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    const t = sanitizeText(raw, maxLen);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxTags) break;
  }
  return out;
}

const BLOCKED_SCHEMES = ['javascript:', 'vbscript:', 'file:', 'about:', 'chrome:', 'ftp:'];
const MEDIA_SCHEMES = ['http:', 'https:', 'blob:'];

export interface UrlValidation {
  ok: boolean;
  url?: URL;
  reason?: string;
  /** True for http(s) URLs pointing to a third-party host: requires a user confirmation. */
  isExternal: boolean;
}

/** Validates a user-entered media URL. `data:` is rejected: it is not needed for media sources. */
export function validateMediaUrl(raw: string): UrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'URL vacía', isExternal: false };
  if (trimmed.length > 4096) return { ok: false, reason: 'URL demasiado larga', isExternal: false };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'URL no válida', isExternal: false };
  }
  const scheme = url.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.includes(scheme)) {
    return { ok: false, reason: `Esquema bloqueado: ${scheme}`, isExternal: false };
  }
  if (scheme === 'data:') {
    return {
      ok: false,
      reason: 'Las URLs data: no están permitidas como fuente',
      isExternal: false,
    };
  }
  if (!MEDIA_SCHEMES.includes(scheme)) {
    return { ok: false, reason: `Esquema no soportado: ${scheme}`, isExternal: false };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'No se admiten credenciales en la URL', isExternal: false };
  }
  const isExternal = scheme === 'http:' || scheme === 'https:';
  return { ok: true, url, isExternal };
}

export function isSafeHref(raw: string): boolean {
  const v = validateMediaUrl(raw);
  return v.ok;
}
