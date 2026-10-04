import type {
  BufferChunk,
  BufferWindow,
  EphemeralBufferStore,
  MediaRange,
  StorageUsage,
} from './types';

/**
 * Default store: the application keeps nothing itself. The streaming library
 * and the browser still need to hold pieces in memory to play them; this store
 * just refuses to add a second copy.
 */
export class NoPersistenceBufferStore implements EphemeralBufferStore {
  readonly kind = 'none' as const;
  async write(_chunk: BufferChunk): Promise<void> {
    /* intentionally discarded */
  }
  async read(_range: MediaRange): Promise<BufferChunk | null> {
    return null;
  }
  async removeBefore(_timestamp: number): Promise<void> {}
  async removeOutsideWindow(_window: BufferWindow): Promise<void> {}
  async clearSession(_sessionId: string): Promise<void> {}
  async clear(): Promise<void> {}
  async getUsage(): Promise<StorageUsage> {
    return { bytes: 0, chunks: 0, limitBytes: 0, kind: 'none' };
  }
}
