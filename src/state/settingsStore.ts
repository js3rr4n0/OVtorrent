import { create } from 'zustand';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@/core/schemas/settings';
import { STORAGE_KEYS } from '@/core/storage/keys';
import { readJson, writeJson } from '@/core/storage/jsonStore';
import { getStorageAdapter } from './storage';

interface SettingsState {
  settings: Settings;
  persisted: boolean;
  update: (patch: (current: Settings) => Settings) => void;
  replace: (next: Settings) => void;
  reset: () => void;
  reload: () => void;
}

function load(): Settings {
  return readJson(getStorageAdapter(), STORAGE_KEYS.settings, settingsSchema, DEFAULT_SETTINGS);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: load(),
  persisted: true,
  update: (patch) => {
    const next = settingsSchema.safeParse(patch(get().settings));
    if (!next.success) return;
    const persisted = writeJson(getStorageAdapter(), STORAGE_KEYS.settings, next.data);
    set({ settings: next.data, persisted });
  },
  replace: (next) => {
    const parsed = settingsSchema.safeParse(next);
    if (!parsed.success) return;
    const persisted = writeJson(getStorageAdapter(), STORAGE_KEYS.settings, parsed.data);
    set({ settings: parsed.data, persisted });
  },
  reset: () => {
    getStorageAdapter().remove(STORAGE_KEYS.settings);
    set({ settings: DEFAULT_SETTINGS, persisted: true });
  },
  reload: () => set({ settings: load() }),
}));
