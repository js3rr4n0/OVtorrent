import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/core/storage/keys';
import { DEFAULT_SETTINGS } from '@/core/schemas/settings';
import { createMediaItem } from '@/core/import/json';
import {
  buildExportBundle,
  clearEverything,
  clearHistoryOnly,
  clearPlaylistsOnly,
  importBundle,
  reloadAllStores,
  resetSettingsOnly,
} from '@/state/dataManagement';
import { useHistoryStore } from '@/state/historyStore';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSettingsStore } from '@/state/settingsStore';
import { getStorageAdapter, setStorageAdapter } from '@/state/storage';
import { FakeStorageAdapter } from '@/test/fakes';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';
const magnetItem = () =>
  createMediaItem({
    sourceType: 'magnet',
    source: `magnet:?xt=urn:btih:${HASH}`,
    title: 'Demo',
    tags: ['a'],
  });

describe('settings store', () => {
  it('persists valid updates and ignores invalid ones', () => {
    const s = useSettingsStore.getState();
    s.update((c) => ({ ...c, theme: 'dark' }));
    expect(useSettingsStore.getState().settings.theme).toBe('dark');
    expect(JSON.parse(getStorageAdapter().get(STORAGE_KEYS.settings)!).theme).toBe('dark');
    s.update((c) => ({ ...c, buffer: { ...c.buffer, memoryLimitBytes: 1 } }));
    expect(useSettingsStore.getState().settings.buffer.memoryLimitBytes).toBe(
      DEFAULT_SETTINGS.buffer.memoryLimitBytes,
    );
  });
  it('falls back to defaults when stored data is corrupted', () => {
    getStorageAdapter().set(STORAGE_KEYS.settings, '{"version":99}');
    useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
    getStorageAdapter().set(STORAGE_KEYS.settings, 'not json');
    useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().settings.theme).toBe('system');
  });
  it('keeps working when writes fail (quota / disabled storage)', () => {
    const adapter = new FakeStorageAdapter();
    adapter.failWrites = true;
    setStorageAdapter(adapter);
    reloadAllStores();
    useSettingsStore.getState().update((c) => ({ ...c, theme: 'light' }));
    expect(useSettingsStore.getState().settings.theme).toBe('light');
    expect(useSettingsStore.getState().persisted).toBe(false);
  });
});

describe('library store', () => {
  it('adds, favorites, updates and removes items with persistence', () => {
    const lib = useLibraryStore.getState();
    const item = magnetItem();
    expect(lib.add(item)).toBe(true);
    expect(lib.add(item)).toBe(false);
    lib.toggleFavorite(item.id);
    expect(useLibraryStore.getState().favorites).toContain(item.id);
    lib.update(item.id, { title: 'Nuevo' });
    expect(useLibraryStore.getState().items[0]?.title).toBe('Nuevo');
    lib.update(item.id, { title: '<x>' });
    expect(useLibraryStore.getState().items[0]?.title).toBe('Nuevo');
    useLibraryStore.getState().reload();
    expect(useLibraryStore.getState().items).toHaveLength(1);
    lib.remove(item.id);
    expect(useLibraryStore.getState().items).toHaveLength(0);
    expect(useLibraryStore.getState().favorites).toHaveLength(0);
  });
});

describe('playlist store', () => {
  it('supports create / rename / duplicate / reorder / remove items / delete', () => {
    const ps = usePlaylistStore.getState();
    const p = ps.create('Lista', 'desc', [magnetItem(), magnetItem()]);
    expect(p).not.toBeNull();
    const id = p!.id;
    ps.rename(id, 'Lista 2');
    expect(usePlaylistStore.getState().playlists[0]?.name).toBe('Lista 2');
    const first = usePlaylistStore.getState().playlists[0]!.items[0]!.id;
    ps.reorder(id, 0, 1);
    expect(usePlaylistStore.getState().playlists[0]!.items[1]!.id).toBe(first);
    expect(usePlaylistStore.getState().playlists[0]!.items.map((i) => i.position)).toEqual([0, 1]);
    const dup = ps.duplicate(id);
    expect(dup?.name).toBe('Lista 2 (copia)');
    expect(usePlaylistStore.getState().playlists).toHaveLength(2);
    ps.removeItem(id, first);
    expect(usePlaylistStore.getState().playlists.find((x) => x.id === id)!.items).toHaveLength(1);
    expect(ps.addItem(id, magnetItem())).toBe(true);
    ps.remove(id);
    expect(usePlaylistStore.getState().playlists).toHaveLength(1);
    expect(ps.create('', '')).toBeNull();
  });
});

describe('history store', () => {
  it('records progress per item, newest first', () => {
    const h = useHistoryStore.getState();
    const a = crypto.randomUUID();
    h.record({ itemId: a, title: 'A', sourceType: 'url', positionSeconds: 10, completed: false });
    h.record({ itemId: a, title: 'A', sourceType: 'url', positionSeconds: 20, completed: false });
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(h.getProgress(a)?.positionSeconds).toBe(20);
    h.removeEntry(a);
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });
});

describe('data management', () => {
  it('exports and re-imports a full bundle', async () => {
    useLibraryStore.getState().add(magnetItem());
    usePlaylistStore.getState().create('P', '', [magnetItem()]);
    useHistoryStore.getState().record({
      itemId: crypto.randomUUID(),
      title: 'x',
      sourceType: 'url',
      positionSeconds: 1,
      completed: false,
    });
    useSettingsStore.getState().update((c) => ({ ...c, theme: 'dark' }));
    const bundle = buildExportBundle();
    const json = JSON.stringify(bundle);
    await clearEverything();
    expect(useLibraryStore.getState().items).toHaveLength(0);
    expect(useSettingsStore.getState().settings.theme).toBe('system');
    const r = importBundle(json, { merge: false });
    expect(r.ok).toBe(true);
    expect(r.imported).toEqual({ settings: true, library: 1, playlists: 1, history: 1 });
    expect(useSettingsStore.getState().settings.theme).toBe('dark');
    expect(usePlaylistStore.getState().playlists[0]?.name).toBe('P');
  });
  it('rejects bundles with forbidden keys or wrong format', () => {
    expect(importBundle('{"format":"other"}', { merge: true }).ok).toBe(false);
    expect(
      importBundle(
        JSON.stringify({
          format: 'ovtorrent-export',
          version: 1,
          exportedAt: new Date().toISOString(),
          __proto__x: 1,
          library: [{ script: 1 }],
        }),
        { merge: true },
      ).ok,
    ).toBe(false);
    expect(importBundle('nope', { merge: true }).errors[0]).toMatch(/JSON/);
  });
  it('supports partial clears', () => {
    useLibraryStore.getState().add(magnetItem());
    usePlaylistStore.getState().create('P');
    useHistoryStore.getState().record({
      itemId: crypto.randomUUID(),
      title: 'x',
      sourceType: 'url',
      positionSeconds: 1,
      completed: false,
    });
    useSettingsStore.getState().update((c) => ({ ...c, theme: 'dark' }));
    clearHistoryOnly();
    expect(useHistoryStore.getState().entries).toHaveLength(0);
    clearPlaylistsOnly();
    expect(usePlaylistStore.getState().playlists).toHaveLength(0);
    resetSettingsOnly();
    expect(useSettingsStore.getState().settings.theme).toBe('system');
    expect(useLibraryStore.getState().items).toHaveLength(1);
  });
});
