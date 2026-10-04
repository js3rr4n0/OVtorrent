import { z } from 'zod';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_PLAYLIST_ITEMS,
  MAX_TITLE_LENGTH,
  mediaItemSchema,
} from './media';

export const PLAYLIST_SCHEMA_VERSION = 1;

const plain = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'No se permite HTML' });

/** Versioned local playlist schema (see docs/PLAYLIST-SCHEMA.md). */
export const playlistSchema = z
  .object({
    version: z.literal(PLAYLIST_SCHEMA_VERSION),
    id: z.uuid().optional(),
    name: plain(MAX_TITLE_LENGTH).min(1),
    description: plain(MAX_DESCRIPTION_LENGTH).optional().default(''),
    items: z.array(mediaItemSchema).max(MAX_PLAYLIST_ITEMS),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type Playlist = z.infer<typeof playlistSchema> & { id: string };
export type PlaylistInput = z.input<typeof playlistSchema>;

/** Fields that are never accepted from imports (defence in depth; `.strict()` already rejects them). */
export const FORBIDDEN_IMPORT_KEYS = [
  'script',
  'html',
  'onload',
  'onerror',
  'eval',
  '__proto__',
  'constructor',
  'prototype',
] as const;

export function containsForbiddenKeys(value: unknown, depth = 0): string | null {
  if (depth > 10 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = containsForbiddenKeys(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if ((FORBIDDEN_IMPORT_KEYS as readonly string[]).includes(key.toLowerCase())) return key;
    const hit = containsForbiddenKeys((value as Record<string, unknown>)[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}
