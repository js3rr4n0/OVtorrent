import { describe, expect, it } from 'vitest';
import { importM3u, parseM3u } from '../m3u';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

const MEDIA_LIST = `#EXTM3U
#EXTINF:120,Primer vídeo
https://example.org/videos/uno.mp4
#EXTINF:-1,Directo <b>HLS</b>
https://example.org/live/stream.m3u8
#EXTINF:30,Magnet autorizado
magnet:?xt=urn:btih:${HASH}&dn=Demo
relativo.mp4
javascript:alert(1)
`;

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,NAME="360p"
360/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720/index.m3u8
`;

const MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
seg0.ts
#EXTINF:9.009,
seg1.ts
`;

describe('parseM3u', () => {
  it('parses media lists with titles, durations, magnets and relative URLs against a base', () => {
    const r = parseM3u(MEDIA_LIST, 'https://example.org/lists/');
    expect(r.kind).toBe('media-list');
    expect(r.entries.map((e) => e.url)).toEqual([
      'https://example.org/videos/uno.mp4',
      'https://example.org/live/stream.m3u8',
      `magnet:?xt=urn:btih:${HASH}&dn=Demo`,
      'https://example.org/lists/relativo.mp4',
      'javascript:alert(1)',
    ]);
    expect(r.entries[0]?.title).toBe('Primer vídeo');
    expect(r.entries[0]?.durationSeconds).toBe(120);
    expect(r.entries[1]?.title).toBe('Directo bHLS/b');
    expect(r.entries[1]?.durationSeconds).toBeUndefined();
  });

  it('reports relative URLs without base as errors', () => {
    const r = parseM3u('relativo.mp4\nhttps://a.org/b.mp4');
    expect(r.errors).toHaveLength(1);
    expect(r.entries).toHaveLength(1);
  });

  it('recognises HLS master and media playlists', () => {
    const master = parseM3u(MASTER, 'https://cdn.example/stream/');
    expect(master.kind).toBe('hls-master');
    expect(master.entries[0]).toMatchObject({
      url: 'https://cdn.example/stream/360/index.m3u8',
      bandwidth: 800000,
      resolution: { width: 640, height: 360 },
      title: '360p',
    });
    expect(parseM3u(MEDIA_PLAYLIST, 'https://cdn.example/stream/').kind).toBe('hls-media');
  });
});

describe('importM3u', () => {
  it('creates validated items with the right source types and rejects dangerous URLs', () => {
    const r = importM3u(MEDIA_LIST, { sourceUrl: 'https://example.org/lists/lista.m3u' });
    expect(r.ok).toBe(false); // javascript: line rejected
    expect(r.items.map((i) => i.sourceType)).toEqual(['url', 'hls', 'magnet', 'url']);
    expect(r.items[2]?.source.startsWith(`magnet:?xt=urn:btih:${HASH}`)).toBe(true);
    expect(r.errors[0]?.message).toMatch(/URL rechazada/);
  });

  it('imports a clean media list and asks confirmation for large ones', () => {
    const clean =
      '#EXTM3U\n' +
      Array.from({ length: 60 }, (_, i) => `#EXTINF:1,Item ${i}\nhttps://a.org/${i}.mp4`).join(
        '\n',
      );
    const r = importM3u(clean);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(60);
    expect(r.needsConfirmation).toBe(true);
    expect(r.items[3]?.title).toBe('Item 3');
    expect(r.items[3]?.position).toBe(3);
  });

  it('turns an HLS master playlist into a single hls item with declared variants, only when a URL is known', () => {
    const noUrl = importM3u(MASTER);
    expect(noUrl.ok).toBe(false);
    expect(noUrl.errors[0]?.message).toMatch(/URL/);
    const r = importM3u(MASTER, {
      sourceUrl: 'https://cdn.example/stream/master.m3u8',
      fallbackTitle: 'Canal',
    });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('hls-master');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      sourceType: 'hls',
      source: 'https://cdn.example/stream/master.m3u8',
      title: 'Canal',
    });
    expect(r.items[0]?.description).toContain('360p');
    expect(r.items[0]?.description).toContain('720p');
  });

  it('rejects empty and oversized lists', () => {
    expect(importM3u('#EXTM3U\n').ok).toBe(false);
    expect(importM3u('x'.repeat(2 * 1024 * 1024 + 1)).errors[0]?.message).toMatch(/2 MB/);
  });
});
