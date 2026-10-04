import type { BufferChunk, EphemeralBufferStore } from '../../buffer/types';
import type { ChunkStore, ChunkStoreConstructor } from './types';

/**
 * Adapts an EphemeralBufferStore (memory or IndexedDB) to the
 * abstract-chunk-store interface WebTorrent expects. Pieces are keyed by the
 * session id so `clear()` drops everything the session held.
 *
 * Eviction is NOT done here: WebTorrent assumes every verified piece stays
 * readable, so removing pieces behind its back would corrupt uploads and
 * reads. Memory limits are enforced by the session (restart from the current
 * position), which is the honest way to free memory in a browser.
 */
export function createEphemeralChunkStoreClass(
  bufferStore: EphemeralBufferStore,
  sessionId: string,
  onPiece?: (index: number, bytes: number) => void,
): ChunkStoreConstructor {
  return class EphemeralChunkStore implements ChunkStore {
    chunkLength: number;
    private closed = false;

    constructor(chunkLength: number) {
      this.chunkLength = chunkLength;
    }

    put(index: number, buf: Uint8Array, cb: (err?: Error | null) => void) {
      if (this.closed) return cb(new Error('Store cerrado'));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const chunk: BufferChunk = {
        sessionId,
        index,
        offset: index * this.chunkLength,
        timestamp: index,
        data,
        createdAt: Date.now(),
      };
      bufferStore
        .write(chunk)
        .then(() => {
          onPiece?.(index, buf.byteLength);
          cb(null);
        })
        .catch((err: unknown) => cb(err instanceof Error ? err : new Error(String(err))));
    }

    get(
      index: number,
      opts: { offset?: number; length?: number } | null,
      cb: (err: Error | null, buf?: Uint8Array) => void,
    ) {
      if (this.closed) return cb(new Error('Store cerrado'));
      bufferStore
        .read({ sessionId, fromTimestamp: index, toTimestamp: index })
        .then((chunk) => {
          if (!chunk || chunk.index !== index)
            return cb(new Error(`Pieza ${index} no disponible en el búfer temporal`));
          const offset = opts?.offset ?? 0;
          const length = opts?.length ?? chunk.data.byteLength - offset;
          cb(
            null,
            new Uint8Array(chunk.data, offset, Math.min(length, chunk.data.byteLength - offset)),
          );
        })
        .catch((err: unknown) => cb(err instanceof Error ? err : new Error(String(err))));
    }

    close(cb: (err?: Error | null) => void) {
      this.closed = true;
      cb(null);
    }

    destroy(cb: (err?: Error | null) => void) {
      this.closed = true;
      bufferStore
        .clear()
        .then(() => cb(null))
        .catch((err: unknown) => cb(err instanceof Error ? err : new Error(String(err))));
    }
  };
}
