import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMediaItem } from '@/core/import/json';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSettingsStore } from '@/state/settingsStore';
import { buildPartialExport, previewBundle } from '@/features/settings/exportSections';
import { collectMediaFiles, MAX_FOLDER_FILES } from '@/features/import/folderScan';
import { VirtualList } from '@/components/VirtualList';

describe('exportación selectiva y vista previa', () => {
  it('exports only the chosen sections and previews a bundle before applying it', () => {
    useLibraryStore
      .getState()
      .add(
        createMediaItem({ sourceType: 'url', source: 'https://e.org/a.mp4', title: 'A', tags: [] }),
      );
    usePlaylistStore.getState().create('P');
    useSettingsStore.getState().update((s) => ({ ...s, theme: 'dark' }));
    const partial = buildPartialExport(['library', 'playlists']);
    expect(partial.library).toHaveLength(1);
    expect(partial.playlists).toHaveLength(1);
    expect(partial.settings).toBeUndefined();
    expect(partial.history).toBeUndefined();
    const preview = previewBundle(
      JSON.stringify(buildPartialExport(['settings', 'library', 'history'])),
    );
    expect(preview.ok).toBe(true);
    expect(preview.counts).toMatchObject({ settings: 'sí', library: 1, history: 0 });
    expect(preview.counts.playlists).toBeUndefined();
    expect(previewBundle('{"format":"x"}').ok).toBe(false);
    expect(previewBundle('{bad').errors[0]).toMatch(/JSON/);
    expect(
      previewBundle(
        JSON.stringify({
          format: 'ovtorrent-export',
          version: 1,
          exportedAt: new Date().toISOString(),
          __proto__x: 1,
          library: [{ onload: 1 }],
        }),
      ).errors[0],
    ).toMatch(/seguridad/);
  });
});

describe('collectMediaFiles', () => {
  const file = (name: string) => ({
    kind: 'file' as const,
    name,
    getFile: async () => new File(['x'], name),
  });
  const dir = (name: string, entries: unknown[]) => ({
    kind: 'directory' as const,
    name,
    values: async function* () {
      for (const e of entries) yield e as never;
    },
  });
  it('walks nested folders, keeps only media and respects the limits', async () => {
    const root = dir('root', [
      file('a.mp4'),
      file('notes.txt'),
      dir('sub', [file('b.mkv'), dir('deep', [file('c.mp3')])]),
    ]);
    const out = await collectMediaFiles(root);
    expect(out.map((e) => e.path)).toEqual(['a.mp4', 'sub/b.mkv', 'sub/deep/c.mp3']);
    const many = dir(
      'many',
      Array.from({ length: MAX_FOLDER_FILES + 20 }, (_, i) => file(`${i}.mp4`)),
    );
    expect((await collectMediaFiles(many)).length).toBe(MAX_FOLDER_FILES);
  });
});

describe('VirtualList', () => {
  it('renders every row for short lists and only a window for long ones', () => {
    const short = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    const { unmount } = render(
      <VirtualList
        items={short}
        rowHeight={40}
        getKey={(x) => x.id}
        renderRow={(x) => <span>fila {x.id}</span>}
      />,
    );
    expect(screen.getAllByText(/fila /)).toHaveLength(10);
    unmount();
    const long = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    render(
      <VirtualList
        items={long}
        rowHeight={40}
        getKey={(x) => x.id}
        renderRow={(x) => <span>fila {x.id}</span>}
      />,
    );
    const rendered = screen.getAllByText(/fila /).length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    expect(screen.getByRole('status')).toHaveTextContent(/de 500/);
  });
});
