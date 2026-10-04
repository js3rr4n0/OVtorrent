import { describe, expect, it } from 'vitest';
import { importPlaylistJson } from '../json';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';
const valid = {
  version: 1,
  name: 'Mi playlist local',
  description: '',
  items: [
    {
      id: '7b1c2b0e-7f2a-4c3a-9d2a-1f3d4e5f6a7b',
      sourceType: 'magnet',
      source: `magnet:?xt=urn:btih:${HASH}`,
      title: 'Contenido autorizado',
      tags: [],
      position: 0,
    },
    {
      id: '8b1c2b0e-7f2a-4c3a-9d2a-1f3d4e5f6a7c',
      sourceType: 'url',
      source: 'https://example.org/a.mp4',
      title: 'URL',
      tags: ['demo'],
      position: 1,
    },
  ],
};

describe('importPlaylistJson', () => {
  it('imports a valid playlist and assigns a local id', () => {
    const r = importPlaylistJson(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    expect(r.playlist?.id).toBeDefined();
    expect(r.playlist?.items).toHaveLength(2);
    expect(r.needsConfirmation).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const r = importPlaylistJson('{nope');
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.message).toMatch(/JSON/);
  });

  it('reports per-field errors', () => {
    const bad = { ...valid, items: [{ ...valid.items[0], title: '' }] };
    const r = importPlaylistJson(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('title'))).toBe(true);
  });

  it('rejects unknown and dangerous fields', () => {
    const r1 = importPlaylistJson(JSON.stringify({ ...valid, script: 'alert(1)' }));
    expect(r1.ok).toBe(false);
    const r2 = importPlaylistJson(JSON.stringify({ ...valid, extra: 1 }));
    expect(r2.ok).toBe(false);
  });

  it('rejects javascript: sources and HTML in titles', () => {
    const r = importPlaylistJson(
      JSON.stringify({ ...valid, items: [{ ...valid.items[1], source: 'javascript:alert(1)' }] }),
    );
    expect(r.ok).toBe(false);
    const r2 = importPlaylistJson(
      JSON.stringify({ ...valid, items: [{ ...valid.items[1], title: '<b>x</b>' }] }),
    );
    expect(r2.ok).toBe(false);
  });

  it('rejects unsupported schema versions', () => {
    expect(importPlaylistJson(JSON.stringify({ ...valid, version: 2 })).ok).toBe(false);
  });

  it('asks for confirmation for large lists and enforces the item limit', () => {
    const many = {
      ...valid,
      items: Array.from({ length: 60 }, (_, i) => ({
        ...valid.items[1],
        id: crypto.randomUUID(),
        position: i,
      })),
    };
    const r = importPlaylistJson(JSON.stringify(many));
    expect(r.ok).toBe(true);
    expect(r.needsConfirmation).toBe(true);
    const tooMany = {
      ...valid,
      items: Array.from({ length: 501 }, (_, i) => ({
        ...valid.items[1],
        id: crypto.randomUUID(),
        position: i,
      })),
    };
    expect(importPlaylistJson(JSON.stringify(tooMany)).ok).toBe(false);
  });
});
