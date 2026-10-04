import type { ZodType } from 'zod';
import type { StorageAdapter } from './StorageAdapter';

/**
 * Reads a validated JSON document from local storage. Corrupted or
 * incompatible data is discarded and the fallback is returned, so the
 * application keeps working after the user clears or tampers with storage.
 */
export function readJson<T>(
  adapter: StorageAdapter,
  key: string,
  schema: ZodType<T>,
  fallback: T,
): T {
  const raw = adapter.get(key);
  if (raw === null) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(adapter: StorageAdapter, key: string, value: unknown): boolean {
  try {
    return adapter.set(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
