import { create } from 'zustand';
import { z } from 'zod';
import { historyEntrySchema, MAX_HISTORY_ENTRIES, type HistoryEntry } from '@/core/schemas/history';
import { STORAGE_KEYS } from '@/core/storage/keys';
import { readJson, writeJson } from '@/core/storage/jsonStore';
import { getStorageAdapter } from './storage';

const historySchema = z.array(historyEntrySchema).max(MAX_HISTORY_ENTRIES);

interface HistoryState {
  entries: HistoryEntry[];
  persisted: boolean;
  record: (entry: Omit<HistoryEntry, 'lastPlayedAt'>) => void;
  getProgress: (itemId: string) => HistoryEntry | undefined;
  removeEntry: (itemId: string) => void;
  replaceAll: (entries: HistoryEntry[]) => void;
  clear: () => void;
  reload: () => void;
}

function persist(entries: HistoryEntry[]) {
  return writeJson(getStorageAdapter(), STORAGE_KEYS.history, entries);
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: readJson(getStorageAdapter(), STORAGE_KEYS.history, historySchema, []),
  persisted: true,
  record: (entry) => {
    const parsed = historyEntrySchema.safeParse({
      ...entry,
      lastPlayedAt: new Date().toISOString(),
    });
    if (!parsed.success) return;
    const rest = get().entries.filter((e) => e.itemId !== entry.itemId);
    const next = [parsed.data, ...rest].slice(0, MAX_HISTORY_ENTRIES);
    set({ entries: next, persisted: persist(next) });
  },
  getProgress: (itemId) => get().entries.find((e) => e.itemId === itemId),
  removeEntry: (itemId) => {
    const next = get().entries.filter((e) => e.itemId !== itemId);
    set({ entries: next, persisted: persist(next) });
  },
  replaceAll: (entries) => {
    const parsed = historySchema.safeParse(entries);
    const next = parsed.success ? parsed.data : [];
    set({ entries: next, persisted: persist(next) });
  },
  clear: () => {
    getStorageAdapter().remove(STORAGE_KEYS.history);
    set({ entries: [], persisted: true });
  },
  reload: () =>
    set({ entries: readJson(getStorageAdapter(), STORAGE_KEYS.history, historySchema, []) }),
}));
