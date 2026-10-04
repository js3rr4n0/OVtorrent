import { createDefaultStorageAdapter, type StorageAdapter } from '@/core/storage/StorageAdapter';

let adapter: StorageAdapter = createDefaultStorageAdapter();

/** Allows tests (and the fake adapter) to replace the persistence layer. */
export function setStorageAdapter(next: StorageAdapter) {
  adapter = next;
}

export function getStorageAdapter(): StorageAdapter {
  return adapter;
}
