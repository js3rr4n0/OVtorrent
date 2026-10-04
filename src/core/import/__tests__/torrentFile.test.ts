import { describe, expect, it } from 'vitest';
import { magnetFromTorrent, parseTorrentFile } from '../torrentFile';

function bencode(value: unknown): string {
  if (typeof value === 'number') return `i${value}e`;
  if (typeof value === 'string') return `${new TextEncoder().encode(value).length}:${value}`;
  if (Array.isArray(value)) return `l${value.map(bencode).join('')}e`;
  const obj = value as Record<string, unknown>;
  return `d${Object.keys(obj)
    .sort()
    .map((k) => bencode(k) + bencode(obj[k]))
    .join('')}e`;
}

describe('parseTorrentFile', () => {
  it('extracts name, files, trackers and a 40-char info hash', async () => {
    const torrent = bencode({
      announce: 'wss://tracker.example/announce',
      'announce-list': [['udp://a:1'], ['wss://b/announce']],
      info: {
        name: 'Demo',
        'piece length': 16384,
        pieces: '',
        files: [
          { path: ['a', 'video.mp4'], length: 100 },
          { path: ['b.srt'], length: 5 },
        ],
      },
    });
    const summary = await parseTorrentFile(new TextEncoder().encode(torrent).buffer as ArrayBuffer);
    expect(summary.name).toBe('Demo');
    expect(summary.files).toEqual([
      { path: 'a/video.mp4', length: 100 },
      { path: 'b.srt', length: 5 },
    ]);
    expect(summary.totalLength).toBe(105);
    expect(summary.infoHash).toMatch(/^[0-9a-f]{40}$/);
    expect(summary.webSocketTrackers).toEqual([
      'wss://tracker.example/announce',
      'wss://b/announce',
    ]);
    expect(magnetFromTorrent(summary)).toContain(`xt=urn:btih:${summary.infoHash}`);
  });

  it('handles single-file torrents', async () => {
    const torrent = bencode({
      info: { name: 'one.mp4', length: 42, 'piece length': 1, pieces: '' },
    });
    const summary = await parseTorrentFile(new TextEncoder().encode(torrent).buffer as ArrayBuffer);
    expect(summary.files).toEqual([{ path: 'one.mp4', length: 42 }]);
  });

  it('rejects garbage and oversized input', async () => {
    await expect(
      parseTorrentFile(new TextEncoder().encode('not bencode').buffer as ArrayBuffer),
    ).rejects.toThrow();
    await expect(parseTorrentFile(new ArrayBuffer(5 * 1024 * 1024))).rejects.toThrow(/grande/);
  });
});
