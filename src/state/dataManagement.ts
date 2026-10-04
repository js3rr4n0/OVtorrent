import {
  EXPORT_FORMAT_VERSION,
  exportBundleSchema,
  type ExportBundle,
} from '@/core/schemas/export';
import { containsForbiddenKeys } from '@/core/schemas/playlist';
import { deleteEphemeralDb } from '@/core/storage/indexedDb';
import { STORAGE_PREFIX } from '@/core/storage/keys';
import { sessionCleanup } from '@/core/cleanup/SessionCleanup';
import { getStorageAdapter } from './storage';
import { useHistoryStore } from './historyStore';
import { useLibraryStore } from './libraryStore';
import { usePlaylistStore } from './playlistStore';
import { useSettingsStore } from './settingsStore';
import { useSessionStore } from './sessionStore';

/** Builds the export document from local state. Nothing leaves the browser. */
export function buildExportBundle(): ExportBundle {
  return {
    format: 'ovtorrent-export',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: useSettingsStore.getState().settings,
    library: useLibraryStore.getState().items,
    playlists: usePlaylistStore.getState().playlists,
    favorites: useLibraryStore.getState().favorites,
    history: useHistoryStore.getState().entries,
  };
}

export interface ImportBundleResult {
  ok: boolean;
  errors: string[];
  imported: { settings: boolean; library: number; playlists: number; history: number };
}

export function importBundle(text: string, options: { merge: boolean }): ImportBundleResult {
  const result: ImportBundleResult = {
    ok: false,
    errors: [],
    imported: { settings: false, library: 0, playlists: 0, history: 0 },
  };
  if (text.length > 10 * 1024 * 1024) {
    result.errors.push('El archivo supera 10 MB');
    return result;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    result.errors.push('JSON no válido');
    return result;
  }
  const forbidden = containsForbiddenKeys(data);
  if (forbidden) {
    result.errors.push(`Campo no permitido por seguridad: ${forbidden}`);
    return result;
  }
  const parsed = exportBundleSchema.safeParse(data);
  if (!parsed.success) {
    result.errors.push(
      ...parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
    return result;
  }
  const bundle = parsed.data;
  if (bundle.settings) {
    useSettingsStore.getState().replace(bundle.settings);
    result.imported.settings = true;
  }
  if (bundle.library) {
    if (options.merge) result.imported.library = useLibraryStore.getState().addMany(bundle.library);
    else {
      useLibraryStore.getState().replaceAll(bundle.library, bundle.favorites ?? []);
      result.imported.library = bundle.library.length;
    }
  }
  if (bundle.favorites && options.merge) {
    const lib = useLibraryStore.getState();
    for (const id of bundle.favorites) if (!lib.favorites.includes(id)) lib.toggleFavorite(id);
  }
  if (bundle.playlists) {
    const store = usePlaylistStore.getState();
    if (options.merge) {
      for (const p of bundle.playlists) {
        if (store.upsert({ ...p, id: p.id ?? crypto.randomUUID() })) result.imported.playlists++;
      }
    } else {
      store.replaceAll(bundle.playlists.map((p) => ({ ...p, id: p.id ?? crypto.randomUUID() })));
      result.imported.playlists = bundle.playlists.length;
    }
  }
  if (bundle.history) {
    if (options.merge) {
      const h = useHistoryStore.getState();
      for (const e of bundle.history) h.record(e);
    } else useHistoryStore.getState().replaceAll(bundle.history);
    result.imported.history = bundle.history.length;
  }
  result.ok = true;
  return result;
}

export async function clearTemporaryCache(): Promise<void> {
  await sessionCleanup.run('manual');
  await deleteEphemeralDb();
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      // Only runtime caches: the app shell precache is managed by the Service Worker.
      await Promise.all(keys.filter((k) => !k.includes('precache')).map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}

export function clearHistoryOnly() {
  useHistoryStore.getState().clear();
}

export function clearPlaylistsOnly() {
  usePlaylistStore.getState().clear();
}

export function resetSettingsOnly() {
  useSettingsStore.getState().reset();
}

export async function clearEverything(): Promise<void> {
  await clearTemporaryCache();
  useSessionStore.getState().clear();
  useHistoryStore.getState().clear();
  usePlaylistStore.getState().clear();
  useLibraryStore.getState().clear();
  useSettingsStore.getState().reset();
  const adapter = getStorageAdapter();
  for (const key of adapter.keys()) if (key.startsWith(STORAGE_PREFIX)) adapter.remove(key);
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

export function reloadAllStores() {
  useSettingsStore.getState().reload();
  useLibraryStore.getState().reload();
  usePlaylistStore.getState().reload();
  useHistoryStore.getState().reload();
}
