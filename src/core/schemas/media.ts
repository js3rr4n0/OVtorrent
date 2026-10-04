import { z } from 'zod';

/** Source kinds supported by the application. Only local-first sources exist. */
export const SOURCE_TYPES = ['magnet', 'torrent', 'file', 'url', 'hls', 'm3u'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const sourceTypeSchema = z.enum(SOURCE_TYPES);

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_SOURCE_LENGTH = 4096;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 32;
export const MAX_PLAYLIST_ITEMS = 500;
export const MAX_PLAYLISTS = 200;
export const LARGE_IMPORT_THRESHOLD = 50;

/** Plain text only: control characters and angle brackets are rejected (no HTML in metadata). */
const plainText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'No se permite HTML en los metadatos' })
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), {
      message: 'Caracteres de control no permitidos',
    });

export const tagSchema = plainText(MAX_TAG_LENGTH).min(1);

export const mediaItemSchema = z
  .object({
    id: z.uuid(),
    sourceType: sourceTypeSchema,
    source: z.string().min(1).max(MAX_SOURCE_LENGTH),
    title: plainText(MAX_TITLE_LENGTH).min(1),
    description: plainText(MAX_DESCRIPTION_LENGTH).optional().default(''),
    tags: z.array(tagSchema).max(MAX_TAGS).optional().default([]),
    position: z.number().int().min(0).optional().default(0),
    /** Optional user-provided metadata; never fetched from third parties. */
    durationSeconds: z.number().nonnegative().finite().optional(),
    /** Declared variant height (480, 720, 1080, 1440, 2160) when the user knows it. */
    qualityLabel: z.string().max(16).optional(),
    addedAt: z.string().datetime().optional(),
  })
  .strict();

export type MediaItem = z.infer<typeof mediaItemSchema>;
export type MediaItemInput = z.input<typeof mediaItemSchema>;
