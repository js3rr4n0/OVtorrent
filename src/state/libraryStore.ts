import { create } from 'zustand';
import { z } from 'zod';
import { mediaItemSchema, type MediaItem } from '@/core/schemas/media';
import { STORAGE_KEYS } from '@/core/storage/keys';
import { readJson, writeJson } from '@/core/storage/jsonStore';
import { getStorageAdapter } from './storage';

const librarySchema = z.array(mediaItemSchema).max(5000);
const favoritesSchema = z.array(z.uuid()).max(5000);

export const MAX_LIBRARY_ITEMS = 5000;

interface LibraryState {
  items: MediaItem[];
  favorites: string[];
  persisted: boolean;
  add: (item: MediaItem) => boolean;
  addMany: (items: MediaItem[]) => number;
  update: (id: string, patch: Partial<MediaItem>) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  replaceAll: (items: MediaItem[], favorites: string[]) => void;
  clear: () => void;
  reload: () => void;
}

function persist(items: MediaItem[], favorites: string[]) {
  const a = getStorageAdapter();
  const ok1 = writeJson(a, STORAGE_KEYS.library, items);
  const ok2 = writeJson(a, STORAGE_KEYS.favorites, favorites);
  return ok1 && ok2;
}

function load() {
  const a = getStorageAdapter();
  return {
    items: readJson(a, STORAGE_KEYS.library, librarySchema, []),
    favorites: readJson(a, STORAGE_KEYS.favorites, favoritesSchema, []),
  };
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...load(),
  persisted: true,
  add: (item) => {
    const { items, favorites } = get();
    if (items.length >= MAX_LIBRARY_ITEMS) return false;
    if (items.some((i) => i.id === item.id)) return false;
    const next = [item, ...items];
    set({ items: next, persisted: persist(next, favorites) });
    return true;
  },
  addMany: (incoming) => {
    const { items, favorites } = get();
    const existing = new Set(items.map((i) => i.id));
    const fresh = incoming
      .filter((i) => !existing.has(i.id))
      .slice(0, MAX_LIBRARY_ITEMS - items.length);
    const next = [...fresh, ...items];
    set({ items: next, persisted: persist(next, favorites) });
    return fresh.length;
  },
  update: (id, patch) => {
    const { items, favorites } = get();
    const next = items.map((i) => {
      if (i.id !== id) return i;
      const merged = mediaItemSchema.safeParse({ ...i, ...patch });
      return merged.success ? merged.data : i;
    });
    set({ items: next, persisted: persist(next, favorites) });
  },
  remove: (id) => {
    const { items, favorites } = get();
    const next = items.filter((i) => i.id !== id);
    const fav = favorites.filter((f) => f !== id);
    set({ items: next, favorites: fav, persisted: persist(next, fav) });
  },
  toggleFavorite: (id) => {
    const { items, favorites } = get();
    const fav = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    set({ favorites: fav, persisted: persist(items, fav) });
  },
  replaceAll: (items, favorites) => {
    const parsedItems = librarySchema.safeParse(items);
    const parsedFav = favoritesSchema.safeParse(favorites);
    const nextItems = parsedItems.success ? parsedItems.data : [];
    const nextFav = parsedFav.success ? parsedFav.data : [];
    set({ items: nextItems, favorites: nextFav, persisted: persist(nextItems, nextFav) });
  },
  clear: () => {
    const a = getStorageAdapter();
    a.remove(STORAGE_KEYS.library);
    a.remove(STORAGE_KEYS.favorites);
    set({ items: [], favorites: [], persisted: true });
  },
  reload: () => set(load()),
}));
