import { describe, expect, it } from 'vitest';
import { IndexedDbBufferStore } from '../IndexedDbBufferStore';
import { MemoryBufferStore } from '../MemoryBufferStore';
import { NoPersistenceBufferStore } from '../NoPersistenceBufferStore';
import { createBufferStore } from '../createBufferStore';
import { computeWindowPolicy, type BufferChunk } from '../types';

function chunk(index: number, timestamp: number, size = 10, sessionId = 's1'): BufferChunk {
  return {
    sessionId,
    index,
    offset: index * size,
    timestamp,
    data: new ArrayBuffer(size),
    createdAt: index,
  };
}

describe('MemoryBufferStore', () => {
  it('writes, reads by range, removes outside window and reports usage', async () => {
    const store = new MemoryBufferStore(1000);
    for (let i = 0; i < 10; i++) await store.write(chunk(i, i * 10));
    expect((await store.getUsage()).chunks).toBe(10);
    const hit = await store.read({ sessionId: 's1', fromTimestamp: 25, toTimestamp: 45 });
    expect(hit?.timestamp).toBe(30);
    await store.removeOutsideWindow({
      sessionId: 's1',
      position: 50,
      behindSeconds: 10,
      aheadSeconds: 20,
    });
    const usage = await store.getUsage();
    expect(usage.chunks).toBe(4); // 40,50,60,70
    await store.removeBefore(60);
    expect((await store.getUsage()).chunks).toBe(2);
    await store.clear();
    expect((await store.getUsage()).bytes).toBe(0);
  });

  it('evicts the oldest chunks when the memory limit is exceeded', async () => {
    const store = new MemoryBufferStore(35);
    for (let i = 0; i < 5; i++) await store.write(chunk(i, i));
    const usage = await store.getUsage();
    expect(usage.bytes).toBeLessThanOrEqual(35);
    expect(await store.read({ sessionId: 's1', fromTimestamp: 0, toTimestamp: 0 })).toBeNull();
  });
});

describe('IndexedDbBufferStore', () => {
  it('persists chunks in the ephemeral database and clears them', async () => {
    const store = new IndexedDbBufferStore(1000);
    await store.write(chunk(1, 10));
    await store.write(chunk(2, 20));
    expect((await store.read({ sessionId: 's1', fromTimestamp: 15, toTimestamp: 25 }))?.index).toBe(
      2,
    );
    await store.removeOutsideWindow({
      sessionId: 's1',
      position: 20,
      behindSeconds: 2,
      aheadSeconds: 2,
    });
    expect((await store.getUsage()).chunks).toBe(1);
    await store.clear();
    expect((await store.getUsage()).chunks).toBe(0);
  });
});

describe('NoPersistenceBufferStore / factory', () => {
  it('discards everything', async () => {
    const store = new NoPersistenceBufferStore();
    await store.write(chunk(1, 1));
    expect(await store.read({ sessionId: 's1', fromTimestamp: 0, toTimestamp: 10 })).toBeNull();
    expect((await store.getUsage()).kind).toBe('none');
  });
  it('builds the configured kind', () => {
    expect(createBufferStore('no-persistence', 1).kind).toBe('none');
    expect(createBufferStore('memory', 1).kind).toBe('memory');
    expect(createBufferStore('indexeddb', 1).kind).toBe('indexeddb');
  });
});

describe('computeWindowPolicy', () => {
  it('classifies pieces as priority, normal or expired', () => {
    const r = computeWindowPolicy({
      position: 100,
      behindSeconds: 10,
      aheadSeconds: 30,
      pieceCount: 20,
      secondsPerPiece: 10,
    });
    expect(r.historyStart).toBe(90);
    expect(r.futureEnd).toBe(130);
    expect(r.priorityPieces[0]).toBe(10);
    expect(r.expiredPieces).toContain(0);
    expect(r.expiredPieces).toContain(19);
    expect(r.expiredPieces).not.toContain(9);
    expect([...r.priorityPieces, ...r.normalPieces, ...r.expiredPieces]).toHaveLength(20);
  });
});
