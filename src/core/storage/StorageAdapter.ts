/**
 * Minimal key/value adapter over browser-local storage.
 * Implementations: LocalStorageAdapter (production), MemoryStorageAdapter (tests/fallback).
 * There is no remote implementation on purpose: all persistence is local to the browser.
 */
export interface StorageAdapter {
  readonly kind: 'localStorage' | 'memory';
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
  clear(): void;
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = 'memory' as const;
  private map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
    return true;
  }
  remove(key: string) {
    this.map.delete(key);
  }
  keys() {
    return [...this.map.keys()];
  }
  clear() {
    this.map.clear();
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'localStorage' as const;
  constructor(private readonly storage: Storage) {}
  get(key: string) {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      // Quota exceeded or storage disabled (private mode, policy). Caller decides.
      return false;
    }
  }
  remove(key: string) {
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  keys() {
    const out: string[] = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k) out.push(k);
      }
    } catch {
      /* ignore */
    }
    return out;
  }
  clear() {
    for (const k of this.keys()) this.remove(k);
  }
}

export function isLocalStorageAvailable(): boolean {
  try {
    const probe = '__ovt_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Returns localStorage when usable, otherwise an in-memory adapter (app keeps working). */
export function createDefaultStorageAdapter(): StorageAdapter {
  if (typeof window !== 'undefined' && isLocalStorageAvailable()) {
    return new LocalStorageAdapter(window.localStorage);
  }
  return new MemoryStorageAdapter();
}
