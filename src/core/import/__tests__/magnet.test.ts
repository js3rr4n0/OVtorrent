import { describe, expect, it } from 'vitest';
import { base32ToHex, parseMagnet } from '../magnet';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

describe('parseMagnet', () => {
  it('accepts a hex btih magnet and extracts trackers', () => {
    const r = parseMagnet(
      `magnet:?xt=urn:btih:${HASH}&dn=Big+Buck+Bunny&tr=wss://tracker.example/announce&tr=udp://tracker.example:1337`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.magnet.infoHash).toBe(HASH);
    expect(r.magnet.displayName).toBe('Big Buck Bunny');
    expect(r.magnet.trackers).toHaveLength(2);
    expect(r.magnet.webSocketTrackers).toEqual(['wss://tracker.example/announce']);
    expect(r.magnet.normalized.startsWith('magnet:?xt=urn%3Abtih%3A')).toBe(true);
  });

  it('accepts base32 hashes', () => {
    const b32 = 'ORSFYNZAO2DJJ5SZTKQLFNK33B4Y6EAG';
    const r = parseMagnet(`magnet:?xt=urn:btih:${b32}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.magnet.infoHash).toHaveLength(40);
    expect(base32ToHex(b32)).toHaveLength(40);
  });

  it('rejects non-magnet strings and missing hashes', () => {
    expect(parseMagnet('https://example.org').ok).toBe(false);
    expect(parseMagnet('magnet:?dn=hello').ok).toBe(false);
    expect(parseMagnet('magnet:?xt=urn:btih:nothex').ok).toBe(false);
  });

  it('rejects BitTorrent v2 only magnets with an explanation', () => {
    const r = parseMagnet('magnet:?xt=urn:btmh:1220' + 'a'.repeat(64));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/v2/);
  });

  it('strips HTML from display names', () => {
    const r = parseMagnet(`magnet:?xt=urn:btih:${HASH}&dn=<script>alert(1)</script>`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.magnet.displayName).not.toMatch(/[<>]/);
  });
});
