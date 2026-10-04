import { z } from 'zod';
import { playlistSchema } from './playlist';
import { settingsSchema } from './settings';
import { historyEntrySchema } from './history';
import { mediaItemSchema } from './media';

export const EXPORT_FORMAT_VERSION = 1;

/** Full local-state export. Never sent anywhere; produced as a downloadable file. */
export const exportBundleSchema = z
  .object({
    format: z.literal('ovtorrent-export'),
    version: z.literal(EXPORT_FORMAT_VERSION),
    exportedAt: z.string().datetime(),
    settings: settingsSchema.optional(),
    library: z.array(mediaItemSchema).max(5000).optional(),
    playlists: z.array(playlistSchema).max(200).optional(),
    favorites: z.array(z.uuid()).max(5000).optional(),
    history: z.array(historyEntrySchema).max(500).optional(),
  })
  .strict();

export type ExportBundle = z.infer<typeof exportBundleSchema>;
