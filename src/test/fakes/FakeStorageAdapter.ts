import { MemoryStorageAdapter } from '@/core/storage/StorageAdapter';

/** In-memory adapter that can simulate quota errors. */
export class FakeStorageAdapter extends MemoryStorageAdapter {
  failWrites = false;
  override set(key: string, value: string): boolean {
    if (this.failWrites) return false;
    return super.set(key, value);
  }
}
