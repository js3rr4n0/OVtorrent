import type {
  BufferChunk,
  BufferWindow,
  EphemeralBufferStore,
  MediaRange,
  StorageUsage,
} from '@/core/buffer/types';

export class FakeBufferStore implements EphemeralBufferStore {
  readonly kind = 'memory' as const;
  chunks: BufferChunk[] = [];
  calls: string[] = [];
  async write(chunk: BufferChunk) {
    this.calls.push('write');
    this.chunks.push(chunk);
  }
  async read(range: MediaRange) {
    this.calls.push('read');
    return (
      this.chunks.find(
        (c) =>
          c.sessionId === range.sessionId &&
          c.timestamp >= range.fromTimestamp &&
          c.timestamp <= range.toTimestamp,
      ) ?? null
    );
  }
  async removeBefore(timestamp: number) {
    this.calls.push('removeBefore');
    this.chunks = this.chunks.filter((c) => c.timestamp >= timestamp);
  }
  async removeOutsideWindow(w: BufferWindow) {
    this.calls.push('removeOutsideWindow');
    this.chunks = this.chunks.filter(
      (c) =>
        c.timestamp >= w.position - w.behindSeconds && c.timestamp <= w.position + w.aheadSeconds,
    );
  }
  async clearSession(sessionId: string) {
    this.calls.push('clearSession');
    this.chunks = this.chunks.filter((c) => c.sessionId !== sessionId);
  }
  async clear() {
    this.calls.push('clear');
    this.chunks = [];
  }
  async getUsage(): Promise<StorageUsage> {
    return {
      bytes: this.chunks.reduce((a, c) => a + c.data.byteLength, 0),
      chunks: this.chunks.length,
      limitBytes: 1024 * 1024,
      kind: this.kind,
    };
  }
}
