import { z } from 'zod';

export interface ParsedMagnet {
  infoHash: string;
  displayName?: string;
  trackers: string[];
  webSeeds: string[];
  /** Trackers using ws:// or wss:// — the only ones a browser can use for WebTorrent peer discovery. */
  webSocketTrackers: string[];
  normalized: string;
}

const HEX40 = /^[0-9a-f]{40}$/i;
const BASE32 = /^[a-z2-7]{32}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/i;

export function base32ToHex(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error('base32 inválido');
    bits += idx.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.slice(0, 40);
}

export function parseMagnet(
  raw: string,
): { ok: true; magnet: ParsedMagnet } | { ok: false; reason: string } {
  const value = raw.trim();
  if (!value.toLowerCase().startsWith('magnet:?')) {
    return { ok: false, reason: 'El enlace debe empezar por magnet:?' };
  }
  if (value.length > 4096) return { ok: false, reason: 'Magnet demasiado largo' };
  const params = new URLSearchParams(value.slice('magnet:?'.length));
  const xts = params.getAll('xt');
  let infoHash: string | null = null;
  for (const xt of xts) {
    const m = /^urn:btih:(.+)$/i.exec(xt);
    if (m && m[1]) {
      const h = m[1];
      if (HEX40.test(h)) infoHash = h.toLowerCase();
      else if (BASE32.test(h)) {
        try {
          infoHash = base32ToHex(h);
        } catch {
          /* fallthrough */
        }
      }
    }
    const v2 = /^urn:btmh:1220([0-9a-f]{64})$/i.exec(xt);
    if (!infoHash && v2 && v2[1] && SHA256_HEX.test(v2[1])) {
      // BitTorrent v2 hashes are not supported by browser WebTorrent; keep a truncated id for display.
      return {
        ok: false,
        reason: 'Los magnets BitTorrent v2 (btmh) no son compatibles con WebTorrent en navegador.',
      };
    }
  }
  if (!infoHash)
    return { ok: false, reason: 'El magnet no contiene un info hash válido (urn:btih)' };

  const trackers = params.getAll('tr').filter((t) => t.length < 512);
  const webSeeds = params.getAll('ws').filter((t) => t.length < 2048);
  const webSocketTrackers = trackers.filter((t) => /^wss?:\/\//i.test(t));
  const dn = params.get('dn') ?? undefined;
  const displayName = dn ? dn.replace(/[<>]/g, '').slice(0, 200) : undefined;

  // `xt` must stay literal (`urn:btih:`): torrent parsers reject a percent-encoded urn.
  const parts = [`xt=urn:btih:${infoHash}`];
  if (displayName) parts.push(`dn=${encodeURIComponent(displayName)}`);
  for (const t of trackers) parts.push(`tr=${encodeURIComponent(t)}`);
  for (const w of webSeeds) parts.push(`ws=${encodeURIComponent(w)}`);

  return {
    ok: true,
    magnet: {
      infoHash,
      displayName,
      trackers,
      webSeeds,
      webSocketTrackers,
      normalized: `magnet:?${parts.join('&')}`,
    },
  };
}

export const magnetSchema = z.string().refine((v) => parseMagnet(v).ok, {
  message: 'Magnet link no válido',
});
