import type { HlsConstructorLike } from './types';

let promise: Promise<HlsConstructorLike> | null = null;

/** Loads hls.js lazily (separate chunk) only when native HLS is unavailable. */
export function loadHls(): Promise<HlsConstructorLike> {
  promise ??= import('hls.js').then((m) => m.default as unknown as HlsConstructorLike);
  return promise;
}
