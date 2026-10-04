import type { BufferStoreKind } from '../schemas/settings';
import { isIndexedDbAvailable } from '../storage/indexedDb';
import { IndexedDbBufferStore } from './IndexedDbBufferStore';
import { MemoryBufferStore } from './MemoryBufferStore';
import { NoPersistenceBufferStore } from './NoPersistenceBufferStore';
import type { EphemeralBufferStore } from './types';

/** Factory honouring the user's choice while degrading when a backend is missing. */
export function createBufferStore(kind: BufferStoreKind, limitBytes: number): EphemeralBufferStore {
  switch (kind) {
    case 'memory':
      return new MemoryBufferStore(limitBytes);
    case 'indexeddb':
      return isIndexedDbAvailable()
        ? new IndexedDbBufferStore(limitBytes)
        : new MemoryBufferStore(limitBytes);
    case 'no-persistence':
    default:
      return new NoPersistenceBufferStore();
  }
}
