import { create } from 'zustand';
import type { MediaItem } from '@/core/schemas/media';

/**
 * In-memory only: local File objects selected by the user live here for the
 * current tab session. They are never written to storage.
 */
interface SessionState {
  files: Map<string, File>;
  /** Items queued for playback (playlist context). */
  queue: MediaItem[];
  queuePlaylistId?: string;
  attachFile: (itemId: string, file: File) => void;
  getFile: (itemId: string) => File | undefined;
  detachFile: (itemId: string) => void;
  setQueue: (items: MediaItem[], playlistId?: string) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  files: new Map(),
  queue: [],
  queuePlaylistId: undefined,
  attachFile: (itemId, file) => {
    const files = new Map(get().files);
    files.set(itemId, file);
    set({ files });
  },
  getFile: (itemId) => get().files.get(itemId),
  detachFile: (itemId) => {
    const files = new Map(get().files);
    files.delete(itemId);
    set({ files });
  },
  setQueue: (items, playlistId) => set({ queue: items, queuePlaylistId: playlistId }),
  clear: () => set({ files: new Map(), queue: [], queuePlaylistId: undefined }),
}));
