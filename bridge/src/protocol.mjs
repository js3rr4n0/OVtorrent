import { createHash } from 'node:crypto';

/**
 * Pairing protocol shared with the web app (src/core/streaming/webtorrent/bridge/protocol.ts).
 * Both sides join a "rendezvous" torrent whose info hash derives from the
 * pairing code; they discover each other through public WebSocket trackers
 * and talk over a BitTorrent extension message (`ovt_bridge`) carrying JSON.
 * No server is involved: the trackers only introduce the two peers.
 */
export const PROTOCOL_VERSION = 1;
export const EXTENSION_NAME = 'ovt_bridge';
export const PAIRING_PREFIX = 'ovtorrent-bridge-v1:';
export const DEFAULT_WS_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.files.fm:7073/announce',
  'wss://tracker.novage.com.ua',
];

export function normalizeCode(code) {
  return String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

export function pairingInfoHash(code) {
  const normalized = normalizeCode(code);
  if (normalized.length < 6)
    throw new Error('El código de emparejamiento debe tener al menos 6 caracteres');
  return createHash('sha1')
    .update(PAIRING_PREFIX + normalized, 'utf8')
    .digest('hex');
}

export function pairingMagnet(code, trackers = DEFAULT_WS_TRACKERS) {
  const parts = [`xt=urn:btih:${pairingInfoHash(code)}`, 'dn=ovtorrent-bridge'];
  for (const t of trackers) parts.push(`tr=${encodeURIComponent(t)}`);
  return `magnet:?${parts.join('&')}`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMessage(message) {
  return encoder.encode(JSON.stringify(message));
}

export function decodeMessage(buffer) {
  try {
    const parsed = JSON.parse(decoder.decode(buffer));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isValidMagnet(magnet) {
  return (
    typeof magnet === 'string' &&
    magnet.length < 4096 &&
    /^magnet:\?xt=urn:btih:[0-9a-z]{32,40}/i.test(magnet)
  );
}
