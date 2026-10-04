import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { MemoryStorageAdapter } from '@/core/storage/StorageAdapter';
import { setStorageAdapter } from '@/state/storage';
import { reloadAllStores } from '@/state/dataManagement';

beforeEach(() => {
  setStorageAdapter(new MemoryStorageAdapter());
  reloadAllStores();
});

afterEach(() => {
  cleanup();
});

// jsdom lacks these; the app feature-detects them, tests just need stubs.
if (!('createObjectURL' in URL)) {
  Object.assign(URL, { createObjectURL: () => 'blob:mock', revokeObjectURL: () => undefined });
}
if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: () => undefined,
  });
}
