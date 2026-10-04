import { describe, expect, it } from 'vitest';
import {
  computeWindow,
  pickDefaultFileIndex,
  pieceRangeOf,
  secondsToPieces,
} from '../windowPolicy';
import { isWebSocketTracker, normalizeTrackerList } from '../trackers';

const MB = 1024 * 1024;

describe('windowPolicy', () => {
  it('picks the largest browser-friendly file by default', () => {
    const files = [
      { name: 'sample.txt', length: 10, offset: 0 },
      { name: 'movie.mkv', length: 900 * MB, offset: 10 },
      { name: 'movie.mp4', length: 800 * MB, offset: 900 * MB + 10 },
    ];
    expect(pickDefaultFileIndex(files)).toBe(2);
    expect(pickDefaultFileIndex([])).toBe(-1);
  });

  it('maps file byte ranges to piece ranges', () => {
    expect(pieceRangeOf({ name: 'a', length: 10 * MB, offset: 5 * MB }, MB)).toEqual({
      start: 5,
      end: 14,
    });
    expect(secondsToPieces(30, 500_000, MB)).toBe(15);
  });

  it('computes head, keep window, critical pieces, throttle and expired pieces', () => {
    const file = { name: 'v.mp4', length: 100 * MB, offset: 0 };
    const have = new Set([0, 1, 2, 3, 40, 41, 90]);
    const w = computeWindow({
      file,
      pieceLength: MB,
      positionSeconds: 400, // 40 % of 1000 s → piece 40
      bufferedAheadSeconds: 10,
      durationSeconds: 1000,
      fallbackKbps: 5000,
      window: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
      havePiece: (i) => have.has(i),
    });
    expect(w.headPiece).toBe(40);
    expect(w.keepStart).toBe(38); // 15 s behind = 1.5 pieces → 2
    expect(w.keepEnd).toBe(49); // 90 s ahead = 9 pieces
    expect(w.criticalStart).toBe(40);
    expect(w.criticalEnd).toBe(43);
    expect(w.throttle).toBe(false);
    expect(w.expiredPieces).toEqual([0, 1, 2, 3, 90]);
  });

  it('throttles when the future window is already buffered and uses the fallback bitrate without duration', () => {
    const file = { name: 'v.mp4', length: 100 * MB, offset: 0 };
    const w = computeWindow({
      file,
      pieceLength: MB,
      positionSeconds: 0,
      bufferedAheadSeconds: 120,
      fallbackKbps: 8000, // 1 000 000 B/s → 90 s ≈ 85.8 MiB pieces → 86
      window: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
      havePiece: () => false,
    });
    expect(w.throttle).toBe(true);
    expect(w.keepEnd).toBe(86);
  });
});

describe('trackers', () => {
  it('accepts only WebSocket trackers and dedupes', () => {
    expect(isWebSocketTracker('wss://tracker.example/announce')).toBe(true);
    expect(isWebSocketTracker('udp://tracker.example:1337')).toBe(false);
    expect(normalizeTrackerList([' wss://a ', 'wss://a', 'http://b', 'ws://c:8000'])).toEqual([
      'wss://a',
      'ws://c:8000',
    ]);
  });
});
