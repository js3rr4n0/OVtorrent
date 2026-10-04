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

/**
 * Ephemeral IndexedDB-backed buffer for devices with very little RAM.
 * It is *local* browser storage, never a remote database, and the application
 * clears it on stop, source change, session end and page hide (best effort).
 */
export class IndexedDbBufferStore implements EphemeralBufferStore {
  readonly kind = 'indexeddb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly limitBytes: number) {}

  private db() {
    this.dbPromise ??= openEphemeralDb();
    return this.dbPromise;
  }

  private key(sessionId: string, index: number) {
    return `${sessionId}:${index}`;
  }

  private async all(): Promise<StoredChunk[]> {
    const db = await this.db();
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readonly');
    const rows = await requestToPromise(tx.objectStore(IDB_STORE_CHUNKS).getAll());
    return rows as StoredChunk[];
  }

  private async deleteKeys(keys: string[]) {
    if (keys.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(IDB_STORE_CHUNKS);
    for (const k of keys) store.delete(k);
    await txDone(tx);
  }

  async write(chunk: BufferChunk): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readwrite');
    const row: StoredChunk = { ...chunk, key: this.key(chunk.sessionId, chunk.index) };
    tx.objectStore(IDB_STORE_CHUNKS).put(row);
    await txDone(tx);
    await this.enforceLimit();
  }

  private async enforceLimit() {
    const rows = await this.all();
    let bytes = rows.reduce((acc, r) => acc + r.data.byteLength, 0);
    if (bytes <= this.limitBytes) return;
    rows.sort((a, b) => a.createdAt - b.createdAt);
    const toDelete: string[] = [];
    for (const r of rows) {
      if (bytes <= this.limitBytes) break;
      toDelete.push(r.key);
      bytes -= r.data.byteLength;
    }
    await this.deleteKeys(toDelete);
  }

  async read(range: MediaRange): Promise<BufferChunk | null> {
    const rows = await this.all();
    let best: StoredChunk | null = null;
    for (const r of rows) {
      if (r.sessionId !== range.sessionId) continue;
      if (r.timestamp < range.fromTimestamp || r.timestamp > range.toTimestamp) continue;
      if (!best || r.timestamp < best.timestamp) best = r;
    }
    if (!best) return null;
    const { key: _key, ...chunk } = best;
    return chunk;
  }

  async removeBefore(timestamp: number): Promise<void> {
    const rows = await this.all();
    await this.deleteKeys(rows.filter((r) => r.timestamp < timestamp).map((r) => r.key));
  }

  async removeOutsideWindow(window: BufferWindow): Promise<void> {
    const from = window.position - window.behindSeconds;
    const to = window.position + window.aheadSeconds;
    const rows = await this.all();
    await this.deleteKeys(
      rows
        .filter((r) => r.sessionId === window.sessionId && (r.timestamp < from || r.timestamp > to))
        .map((r) => r.key),
    );
  }

  async clear(): Promise<void> {
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
    try {
      const rows = await this.all();
      return {
        bytes: rows.reduce((acc, r) => acc + r.data.byteLength, 0),
        chunks: rows.length,
        limitBytes: this.limitBytes,
        kind: this.kind,
      };
    } catch {
      return { bytes: 0, chunks: 0, limitBytes: this.limitBytes, kind: this.kind };
    }
  }
}
