import type { JsonImportResult } from '../core/import/json';
import type { M3uImportResult } from '../core/import/m3u';
import type { TorrentSummary } from '../core/import/torrentFile';

/**
 * Message protocol between the UI and the optional parsing/metrics worker.
 * Every job is a pure function of its payload so the main-thread fallback
 * behaves identically.
 */
export type WorkerJob =
  | { kind: 'parse-m3u'; text: string; sourceUrl?: string; fallbackTitle?: string }
  | { kind: 'parse-json-playlist'; text: string }
  | { kind: 'parse-torrent'; buffer: ArrayBuffer }
  | {
      kind: 'availability';
      /** Bitfield of pieces this client already has (1 bit per piece, MSB first). */
      have: Uint8Array;
      /** One bitfield per connected peer. */
      peers: Uint8Array[];
      start: number;
      end: number;
      /** Sample at most this many pieces. */
      maxSamples: number;
    }
  | { kind: 'ping' };

export type WorkerResultFor<J extends WorkerJob> = J extends { kind: 'parse-m3u' }
  ? M3uImportResult
  : J extends { kind: 'parse-json-playlist' }
    ? JsonImportResult
    : J extends { kind: 'parse-torrent' }
      ? TorrentSummary
      : J extends { kind: 'availability' }
        ? { availability: number; sampled: number }
        : J extends { kind: 'ping' }
          ? { pong: true; at: number }
          : never;

export interface WorkerRequest {
  id: number;
  job: WorkerJob;
}

export type WorkerResponse =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export function bitAt(bits: Uint8Array, index: number): boolean {
  const byte = bits[index >> 3];
  return byte === undefined ? false : (byte & (0x80 >> (index & 7))) !== 0;
}

/** Shared implementation for availability (used by the worker and the fallback). */
export function computeAvailability(job: Extract<WorkerJob, { kind: 'availability' }>): {
  availability: number;
  sampled: number;
} {
  const total = job.end - job.start + 1;
  if (total <= 0) return { availability: Number.NaN, sampled: 0 };
  const step = Math.max(1, Math.floor(total / Math.max(1, job.maxSamples)));
  let sampled = 0;
  let available = 0;
  for (let i = job.start; i <= job.end; i += step) {
    sampled++;
    if (bitAt(job.have, i) || job.peers.some((p) => bitAt(p, i))) available++;
  }
  if (job.peers.length === 0 && available === 0) return { availability: Number.NaN, sampled };
  return { availability: available / Math.max(1, sampled), sampled };
}
