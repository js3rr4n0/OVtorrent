import { create } from 'zustand';
import { z } from 'zod';
import { MAX_PLAYLISTS, type MediaItem } from '@/core/schemas/media';
import { PLAYLIST_SCHEMA_VERSION, playlistSchema, type Playlist } from '@/core/schemas/playlist';
import { STORAGE_KEYS } from '@/core/storage/keys';
import { readJson, writeJson } from '@/core/storage/jsonStore';
import { createId } from '@/core/streaming/sessionId';
import { getStorageAdapter } from './storage';

const storedPlaylistSchema = playlistSchema.extend({ id: z.uuid() });
const playlistsSchema = z.array(storedPlaylistSchema).max(MAX_PLAYLISTS);

interface PlaylistState {
  playlists: Playlist[];
  persisted: boolean;
  create: (name: string, description?: string, items?: MediaItem[]) => Playlist | null;
  upsert: (playlist: Playlist) => boolean;
  rename: (id: string, name: string) => void;
  updateMeta: (id: string, patch: { name?: string; description?: string }) => void;
  duplicate: (id: string) => Playlist | null;
  remove: (id: string) => void;
  addItem: (id: string, item: MediaItem) => boolean;
  removeItem: (id: string, itemId: string) => void;
  reorder: (id: string, fromIndex: number, toIndex: number) => void;
  replaceAll: (playlists: Playlist[]) => void;
  clear: () => void;
  reload: () => void;
}

function persist(playlists: Playlist[]) {
  return writeJson(getStorageAdapter(), STORAGE_KEYS.playlists, playlists);
}

function load(): Playlist[] {
  return readJson(getStorageAdapter(), STORAGE_KEYS.playlists, playlistsSchema, []);
}

function touch(p: Playlist): Playlist {
  return { ...p, updatedAt: new Date().toISOString() };
}

function renumber(items: MediaItem[]): MediaItem[] {
  return items.map((it, idx) => ({ ...it, position: idx }));
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: load(),
  persisted: true,
  create: (name, description = '', items = []) => {
    const { playlists } = get();
    if (playlists.length >= MAX_PLAYLISTS) return null;
    const now = new Date().toISOString();
    const candidate = storedPlaylistSchema.safeParse({
      version: PLAYLIST_SCHEMA_VERSION,
      id: createId(),
      name,
      description,
      items: renumber(items),
      createdAt: now,
      updatedAt: now,
    });
    if (!candidate.success) return null;
    const next = [candidate.data, ...playlists];
    set({ playlists: next, persisted: persist(next) });
    return candidate.data;
  },
  upsert: (playlist) => {
    const parsed = storedPlaylistSchema.safeParse(playlist);
    if (!parsed.success) return false;
    const { playlists } = get();
    const exists = playlists.some((p) => p.id === parsed.data.id);
    if (!exists && playlists.length >= MAX_PLAYLISTS) return false;
    const next = exists
      ? playlists.map((p) => (p.id === parsed.data.id ? parsed.data : p))
      : [parsed.data, ...playlists];
    set({ playlists: next, persisted: persist(next) });
    return true;
  },
  rename: (id, name) => get().updateMeta(id, { name }),
  updateMeta: (id, patch) => {
    const next = get().playlists.map((p) => {
      if (p.id !== id) return p;
      const merged = storedPlaylistSchema.safeParse(touch({ ...p, ...patch }));
      return merged.success ? merged.data : p;
    });
    set({ playlists: next, persisted: persist(next) });
  },
  duplicate: (id) => {
    const source = get().playlists.find((p) => p.id === id);
    if (!source) return null;
    return get().create(
      `${source.name} (copia)`.slice(0, 200),
      source.description,
      source.items.map((i) => ({ ...i, id: createId() })),
    );
  },
  remove: (id) => {
    const next = get().playlists.filter((p) => p.id !== id);
    set({ playlists: next, persisted: persist(next) });
  },
  addItem: (id, item) => {
    let added = false;
    const next = get().playlists.map((p) => {
      if (p.id !== id) return p;
      if (p.items.length >= 500) return p;
      added = true;
      return touch({ ...p, items: renumber([...p.items, { ...item, id: createId() }]) });
    });
    set({ playlists: next, persisted: persist(next) });
    return added;
  },
  removeItem: (id, itemId) => {
    const next = get().playlists.map((p) =>
      p.id === id ? touch({ ...p, items: renumber(p.items.filter((i) => i.id !== itemId)) }) : p,
    );
    set({ playlists: next, persisted: persist(next) });
  },
  reorder: (id, fromIndex, toIndex) => {
    const next = get().playlists.map((p) => {
      if (p.id !== id) return p;
      if (fromIndex < 0 || fromIndex >= p.items.length || toIndex < 0 || toIndex >= p.items.length)
        return p;
      const items = [...p.items];
      const [moved] = items.splice(fromIndex, 1);
      if (!moved) return p;
      items.splice(toIndex, 0, moved);
      return touch({ ...p, items: renumber(items) });
    });
    set({ playlists: next, persisted: persist(next) });
  },
  replaceAll: (playlists) => {
    const parsed = playlistsSchema.safeParse(playlists);
    const next = parsed.success ? parsed.data : [];
    set({ playlists: next, persisted: persist(next) });
  },
  clear: () => {
    getStorageAdapter().remove(STORAGE_KEYS.playlists);
    set({ playlists: [], persisted: true });
  },
  reload: () => set({ playlists: load() }),
}));
