/**
 * Pairing protocol shared with the self-hosted bridge (bridge/src/protocol.mjs).
 * Both sides join a rendezvous torrent derived from the pairing code, meet
 * through public WebSocket trackers and exchange JSON over the `ovt_bridge`
 * BitTorrent extension. No server of ours is involved.
 */
export const PROTOCOL_VERSION = 1;
export const EXTENSION_NAME = 'ovt_bridge';
export const PAIRING_PREFIX = 'ovtorrent-bridge-v1:';
export const MIN_CODE_LENGTH = 6;

export type BridgeMessage =
  | { t: 'hello'; v: number; name?: string }
  | { t: 'add'; magnet: string }
  | { t: 'list' }
  | { t: 'added'; infoHash: string }
  | { t: 'error'; message: string }
  | { t: 'status'; v: number; name?: string; torrents: BridgeTorrentStatus[] };

export interface BridgeTorrentStatus {
  infoHash: string;
  name: string;
  progress: number;
  numPeers: number;
  downloadSpeed: number;
  uploadSpeed: number;
  done: boolean;
  ready: boolean;
}

export function normalizeCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

export async function pairingInfoHash(code: string): Promise<string> {
  const normalized = normalizeCode(code);
  if (normalized.length < MIN_CODE_LENGTH) {
    throw new Error(
      `El código de emparejamiento debe tener al menos ${MIN_CODE_LENGTH} caracteres`,
    );
  }
  const data = new TextEncoder().encode(PAIRING_PREFIX + normalized);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function pairingMagnet(code: string, trackers: readonly string[]): Promise<string> {
  const parts = [`xt=urn:btih:${await pairingInfoHash(code)}`, 'dn=ovtorrent-bridge'];
  for (const t of trackers) parts.push(`tr=${encodeURIComponent(t)}`);
  return `magnet:?${parts.join('&')}`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMessage(message: BridgeMessage): Uint8Array {
  return encoder.encode(JSON.stringify(message));
}

export function decodeMessage(buffer: ArrayBufferView | ArrayBuffer): BridgeMessage | null {
  try {
    const view =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const parsed: unknown = JSON.parse(decoder.decode(view));
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { t?: unknown }).t !== 'string')
      return null;
    return parsed as BridgeMessage;
  } catch {
    return null;
  }
}
