import { z } from 'zod';
import { mediaItemSchema } from './media';

export const MAX_HISTORY_ENTRIES = 500;

export const historyEntrySchema = z
  .object({
    itemId: z.uuid(),
    title: z.string().max(200),
    sourceType: mediaItemSchema.shape.sourceType,
    playlistId: z.uuid().optional(),
    /** Last known playback position in seconds. */
    positionSeconds: z.number().nonnegative().finite(),
    durationSeconds: z.number().nonnegative().finite().optional(),
    lastPlayedAt: z.string().datetime(),
    completed: z.boolean(),
  })
  .strict();
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
