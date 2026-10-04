import { openEphemeralDb, requestToPromise, txDone } from '../storage/indexedDb';
import { IDB_STORE_CHUNKS } from '../storage/keys';
import type {
  BufferChunk,
  BufferWindow,
  EphemeralBufferStore,
  MediaRange,
  StorageUsage,
} from './types';

interface StoredChunk extends BufferChunk {
  key: string;
}

interface Meta {
  sessionId: string;
  index: number;
  timestamp: number;
  bytes: number;
  createdAt: number;
}

/**
 * Ephemeral IndexedDB-backed buffer for devices with very little RAM.
 * It is *local* browser storage, never a remote database, and the application
 * clears it on stop, source change, session end and page hide (best effort).
 *
 * Piece metadata (not data) is mirrored in memory so that window decisions and
 * usage reports never need to read piece payloads back from IndexedDB.
 */
export class IndexedDbBufferStore implements EphemeralBufferStore {
  readonly kind = 'indexeddb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private meta = new Map<string, Meta>();
  private bytes = 0;

  constructor(private readonly limitBytes: number) {}

  private db() {
    this.dbPromise ??= openEphemeralDb();
    return this.dbPromise;
  }

  private key(sessionId: string, index: number) {
    return `${sessionId}:${index}`;
  }

  private async deleteKeys(keys: string[]) {
    if (keys.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(IDB_STORE_CHUNKS);
    for (const k of keys) {
      store.delete(k);
      const m = this.meta.get(k);
      if (m) {
        this.bytes -= m.bytes;
        this.meta.delete(k);
      }
    }
    await txDone(tx);
  }

  async write(chunk: BufferChunk): Promise<void> {
    const db = await this.db();
    const key = this.key(chunk.sessionId, chunk.index);
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readwrite');
    const row: StoredChunk = { ...chunk, key };
    tx.objectStore(IDB_STORE_CHUNKS).put(row);
    await txDone(tx);
    const previous = this.meta.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.meta.set(key, {
      sessionId: chunk.sessionId,
      index: chunk.index,
      timestamp: chunk.timestamp,
      bytes: chunk.data.byteLength,
      createdAt: chunk.createdAt,
    });
    this.bytes += chunk.data.byteLength;
    if (Number.isFinite(this.limitBytes)) await this.enforceLimit();
  }

  private async enforceLimit() {
    if (this.bytes <= this.limitBytes) return;
    const sorted = [...this.meta.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toDelete: string[] = [];
    let bytes = this.bytes;
    for (const [key, m] of sorted) {
      if (bytes <= this.limitBytes) break;
      toDelete.push(key);
      bytes -= m.bytes;
    }
    await this.deleteKeys(toDelete);
  }

  async read(range: MediaRange): Promise<BufferChunk | null> {
    let best: Meta | null = null;
    for (const m of this.meta.values()) {
      if (m.sessionId !== range.sessionId) continue;
      if (m.timestamp < range.fromTimestamp || m.timestamp > range.toTimestamp) continue;
      if (!best || m.timestamp < best.timestamp) best = m;
    }
    if (!best) return null;
    const db = await this.db();
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readonly');
    const row = (await requestToPromise(
      tx.objectStore(IDB_STORE_CHUNKS).get(this.key(best.sessionId, best.index)),
    )) as StoredChunk | undefined;
    if (!row) return null;
    const { key: _key, ...chunk } = row;
    return chunk;
  }

  async removeBefore(timestamp: number): Promise<void> {
    await this.deleteKeys(
      [...this.meta.entries()].filter(([, m]) => m.timestamp < timestamp).map(([k]) => k),
    );
  }

  async removeOutsideWindow(window: BufferWindow): Promise<void> {
    const from = window.position - window.behindSeconds;
    const to = window.position + window.aheadSeconds;
    await this.deleteKeys(
      [...this.meta.entries()]
        .filter(
          ([, m]) => m.sessionId === window.sessionId && (m.timestamp < from || m.timestamp > to),
        )
        .map(([k]) => k),
    );
  }

  async clear(): Promise<void> {
    this.meta.clear();
    this.bytes = 0;
    try {
      const db = await this.db();
      const tx = db.transaction(IDB_STORE_CHUNKS, 'readwrite');
      tx.objectStore(IDB_STORE_CHUNKS).clear();
      await txDone(tx);
    } catch {
      /* IndexedDB unavailable: nothing to clear */
    }
  }

  async getUsage(): Promise<StorageUsage> {
    return {
      bytes: this.bytes,
      chunks: this.meta.size,
      limitBytes: this.limitBytes,
      kind: this.kind,
    };
  }
}
