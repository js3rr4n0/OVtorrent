import type { BufferWindowConfig } from '../../schemas/settings';

export interface FileLike {
  name: string;
  length: number;
  offset: number;
}

const PLAYABLE_EXT = [
  'mp4',
  'm4v',
  'webm',
  'ogv',
  'mkv',
  'mov',
  'mp3',
  'm4a',
  'ogg',
  'opus',
  'wav',
  'flac',
  'aac',
];
const PREFERRED_EXT = ['mp4', 'm4v', 'webm', 'ogv', 'mp3', 'm4a', 'ogg', 'opus', 'wav'];

export function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function isPlayableName(name: string): boolean {
  return PLAYABLE_EXT.includes(extensionOf(name));
}

/** Picks the default file: the largest one with a container browsers can usually play. */
export function pickDefaultFileIndex(files: FileLike[]): number {
  if (files.length === 0) return -1;
  let best = -1;
  let bestScore = -1;
  files.forEach((f, i) => {
    const ext = extensionOf(f.name);
    const score =
      (PREFERRED_EXT.includes(ext) ? 2 : PLAYABLE_EXT.includes(ext) ? 1 : 0) * 1e15 + f.length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export function pieceRangeOf(file: FileLike, pieceLength: number): { start: number; end: number } {
  const start = Math.floor(file.offset / pieceLength);
  const end = Math.max(
    start,
    Math.floor((file.offset + Math.max(file.length - 1, 0)) / pieceLength),
  );
  return { start, end };
}

/** Estimated bytes per second of the file: real duration when known, otherwise the configured bitrate. */
export function bytesPerSecond(
  fileLength: number,
  durationSeconds: number | undefined,
  fallbackKbps: number,
): number {
  if (durationSeconds && durationSeconds > 0 && Number.isFinite(durationSeconds))
    return fileLength / durationSeconds;
  return (fallbackKbps * 1000) / 8;
}

export function secondsToPieces(seconds: number, bps: number, pieceLength: number): number {
  return Math.max(1, Math.ceil((seconds * bps) / pieceLength));
}

export interface WindowState {
  /** Piece index that corresponds to the current playback position. */
  headPiece: number;
  /** First and last piece to keep (history + future). */
  keepStart: number;
  keepEnd: number;
  /** Pieces requested with high priority right now. */
  criticalStart: number;
  criticalEnd: number;
  /** True when enough future data is buffered and downloads should be throttled. */
  throttle: boolean;
  /** Bytes held by pieces of this file outside the keep window (candidates for cleanup). */
  expiredPieces: number[];
}

export interface WindowInput {
  file: FileLike;
  pieceLength: number;
  positionSeconds: number;
  bufferedAheadSeconds: number;
  durationSeconds?: number;
  fallbackKbps: number;
  window: BufferWindowConfig;
  /** Which pieces are already downloaded (verified). */
  havePiece: (index: number) => boolean;
}

/**
 * Pure window computation used every tick by the WebTorrent session.
 *
 * - The sequential strategy of WebTorrent plus `critical()` keeps pieces near
 *   the playhead first.
 * - When the browser already has more than `aheadSeconds` buffered we throttle
 *   downloads so the swarm is not asked for data far beyond the window.
 * - Pieces outside [keepStart, keepEnd] are reported as expired so the session
 *   can account for them and restart the torrent when the memory limit is hit.
 */
export function computeWindow(input: WindowInput): WindowState {
  const { file, pieceLength, window } = input;
  const range = pieceRangeOf(file, pieceLength);
  const bps = bytesPerSecond(file.length, input.durationSeconds, input.fallbackKbps);
  const headByte = file.offset + Math.min(file.length, Math.max(0, input.positionSeconds * bps));
  const headPiece = Math.min(range.end, Math.max(range.start, Math.floor(headByte / pieceLength)));
  const behind = secondsToPieces(window.behindSeconds, bps, pieceLength);
  const ahead = secondsToPieces(window.aheadSeconds, bps, pieceLength);
  const initial = secondsToPieces(window.initialSeconds, bps, pieceLength);
  const keepStart = Math.max(range.start, headPiece - behind);
  const keepEnd = Math.min(range.end, headPiece + ahead);
  const criticalEnd = Math.min(range.end, headPiece + initial);
  const expiredPieces: number[] = [];
  for (let i = range.start; i <= range.end; i++) {
    if ((i < keepStart || i > keepEnd) && input.havePiece(i)) expiredPieces.push(i);
  }
  return {
    headPiece,
    keepStart,
    keepEnd,
    criticalStart: headPiece,
    criticalEnd,
    throttle: input.bufferedAheadSeconds >= window.aheadSeconds,
    expiredPieces,
  };
}

/** Download rate applied while throttled (bytes/s): enough to keep wires alive, far below video bitrate. */
export const THROTTLED_RATE_BPS = 64 * 1024;
export const UNLIMITED_RATE = -1;
