import { describe, expect, it } from 'vitest';
import {
  computeWindow,
  MAX_STREAM_RANGE_BYTES,
  MIN_STREAM_RANGE_BYTES,
  pickDefaultFileIndex,
  pieceRangeOf,
  secondsToPieces,
  streamRangeBytes,
} from '../windowPolicy';
import { DEFAULT_WEBSOCKET_TRACKERS, isWebSocketTracker, normalizeTrackerList } from '../trackers';

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

  it('computes head, keep window, critical pieces, range size and expired pieces', () => {
    const file = { name: 'v.mp4', length: 100 * MB, offset: 0 };
    const have = new Set([0, 1, 2, 3, 40, 41, 90]);
    const w = computeWindow({
      file,
      pieceLength: MB,
      positionSeconds: 400, // 40 % of 1000 s → piece 40
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
    // 90 s × 104 857.6 B/s = 9 MiB exactly (whole pieces)
    expect(w.rangeBytes).toBe(9 * MB);
    expect(w.expiredPieces).toEqual([0, 1, 2, 3, 90]);
  });

  it('uses the fallback bitrate while the duration is unknown', () => {
    const file = { name: 'v.mp4', length: 100 * MB, offset: 0 };
    const w = computeWindow({
      file,
      pieceLength: MB,
      positionSeconds: 0,
      fallbackKbps: 8000, // 1 000 000 B/s → 90 s ≈ 85.8 MiB pieces → 86
      window: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
      havePiece: () => false,
    });
    expect(w.keepEnd).toBe(86);
    expect(w.rangeBytes).toBe(MAX_STREAM_RANGE_BYTES); // 86 MiB wanted, capped at 64 MiB
  });

  it('bounds the streamed range between 1 MiB and 64 MiB in whole pieces', () => {
    expect(streamRangeBytes(1000, 10, 16 * 1024)).toBe(MIN_STREAM_RANGE_BYTES);
    expect(streamRangeBytes(10_000_000, 600, MB)).toBe(MAX_STREAM_RANGE_BYTES);
    expect(streamRangeBytes(500_000, 30, MB)).toBe(15 * MB); // 15 000 000 B → 15 MiB
    expect(streamRangeBytes(500_000, 30, 0)).toBe(15_000_000);
  });
});

describe('trackers', () => {
  it('ships only wss defaults and no longer lists the dead btorrent.xyz tracker', () => {
    expect(DEFAULT_WEBSOCKET_TRACKERS.every((t) => t.startsWith('wss://'))).toBe(true);
    expect(DEFAULT_WEBSOCKET_TRACKERS.some((t) => t.includes('btorrent.xyz'))).toBe(false);
  });
  it('accepts only WebSocket trackers and dedupes', () => {
    expect(isWebSocketTracker('wss://tracker.example/announce')).toBe(true);
    expect(isWebSocketTracker('udp://tracker.example:1337')).toBe(false);
    expect(normalizeTrackerList([' wss://a ', 'wss://a', 'http://b', 'ws://c:8000'])).toEqual([
      'wss://a',
      'ws://c:8000',
    ]);
  });
});
