import type {
  BufferChunk,
  BufferWindow,
  EphemeralBufferStore,
  MediaRange,
  StorageUsage,
} from './types';

/**
 * RAM-only buffer. Evicts the oldest chunks when the limit is exceeded.
 * Nothing survives a page reload.
 */
export class MemoryBufferStore implements EphemeralBufferStore {
  readonly kind = 'memory' as const;
  private chunks = new Map<string, BufferChunk>();
  private bytes = 0;

  constructor(private readonly limitBytes: number) {}

  private key(sessionId: string, index: number) {
    return `${sessionId}:${index}`;
  }

  async write(chunk: BufferChunk): Promise<void> {
    const key = this.key(chunk.sessionId, chunk.index);
    const previous = this.chunks.get(key);
    if (previous) this.bytes -= previous.data.byteLength;
    this.chunks.set(key, chunk);
    this.bytes += chunk.data.byteLength;
    this.enforceLimit();
  }

  private enforceLimit() {
    if (this.bytes <= this.limitBytes) return;
    const sorted = [...this.chunks.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [key, chunk] of sorted) {
      if (this.bytes <= this.limitBytes) break;
      this.chunks.delete(key);
      this.bytes -= chunk.data.byteLength;
    }
  }

  async read(range: MediaRange): Promise<BufferChunk | null> {
    let best: BufferChunk | null = null;
    for (const chunk of this.chunks.values()) {
      if (chunk.sessionId !== range.sessionId) continue;
      if (chunk.timestamp < range.fromTimestamp || chunk.timestamp > range.toTimestamp) continue;
      if (!best || chunk.timestamp < best.timestamp) best = chunk;
    }
    return best;
  }

  async removeBefore(timestamp: number): Promise<void> {
    for (const [key, chunk] of this.chunks) {
      if (chunk.timestamp < timestamp) {
        this.chunks.delete(key);
        this.bytes -= chunk.data.byteLength;
      }
    }
  }

  async removeOutsideWindow(window: BufferWindow): Promise<void> {
    const from = window.position - window.behindSeconds;
    const to = window.position + window.aheadSeconds;
    for (const [key, chunk] of this.chunks) {
      if (chunk.sessionId !== window.sessionId) continue;
      if (chunk.timestamp < from || chunk.timestamp > to) {
        this.chunks.delete(key);
        this.bytes -= chunk.data.byteLength;
      }
    }
  }

  async clearSession(sessionId: string): Promise<void> {
    for (const [key, chunk] of this.chunks) {
      if (chunk.sessionId !== sessionId) continue;
      this.chunks.delete(key);
      this.bytes -= chunk.data.byteLength;
    }
  }

  async clear(): Promise<void> {
    this.chunks.clear();
    this.bytes = 0;
  }

  async getUsage(): Promise<StorageUsage> {
    return {
      bytes: this.bytes,
      chunks: this.chunks.size,
      limitBytes: this.limitBytes,
      kind: this.kind,
    };
  }
}
