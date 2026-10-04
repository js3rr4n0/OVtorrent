import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '@/features/library/LibraryPage';
import { ImportPage } from '@/features/import/ImportPage';
import { PlaylistsPage } from '@/features/playlists/PlaylistsPage';
import { PlaybackSettingsPage } from '@/features/settings/PlaybackSettingsPage';
import { StorageSettingsPage } from '@/features/settings/StorageSettingsPage';
import { PlayerPage } from '@/features/player/PlayerPage';
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage';
import { createMediaItem } from '@/core/import/json';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSettingsStore } from '@/state/settingsStore';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

function renderAt(path: string, routes: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{routes}</Routes>
    </MemoryRouter>,
  );
}

describe('LibraryPage', () => {
  it('shows the empty state and then imported items', async () => {
    renderAt('/', <Route path="/" element={<LibraryPage />} />);
    expect(screen.getByText('Tu biblioteca está vacía')).toBeInTheDocument();
    useLibraryStore.getState().add(
      createMediaItem({
        sourceType: 'magnet',
        source: `magnet:?xt=urn:btih:${HASH}`,
        title: 'Demo',
        tags: [],
      }),
    );
    expect(await screen.findByText('Demo')).toBeInTheDocument();
  });
});

describe('ImportPage', () => {
  it('imports a magnet link into the library', async () => {
    const user = userEvent.setup();
    renderAt('/import', <Route path="/import" element={<ImportPage />} />);
    await user.type(
      screen.getByLabelText('Enlace magnet'),
      `magnet:?xt=urn:btih:${HASH}&dn=Demo&tr=wss://t/announce`,
    );
    await user.click(screen.getByRole('button', { name: 'Añadir a la biblioteca' }));
    expect(useLibraryStore.getState().items[0]?.title).toBe('Demo');
    expect(await screen.findByText(/añadido a la biblioteca/)).toBeInTheDocument();
  });
  it('rejects an invalid magnet with a field error', async () => {
    const user = userEvent.setup();
    renderAt('/import', <Route path="/import" element={<ImportPage />} />);
    await user.type(screen.getByLabelText('Enlace magnet'), 'https://not-a-magnet');
    await user.click(screen.getByRole('button', { name: 'Añadir a la biblioteca' }));
    expect(screen.getAllByText(/magnet:\?/).length).toBeGreaterThan(0);
    expect(useLibraryStore.getState().items).toHaveLength(0);
  });
  it('validates and imports a JSON playlist', async () => {
    const user = userEvent.setup();
    renderAt('/import', <Route path="/import" element={<ImportPage />} />);
    await user.click(screen.getByRole('tab', { name: 'Playlist JSON' }));
    const json = JSON.stringify({
      version: 1,
      name: 'Lista JSON',
      items: [
        {
          id: crypto.randomUUID(),
          sourceType: 'magnet',
          source: `magnet:?xt=urn:btih:${HASH}`,
          title: 'Item',
        },
      ],
    });
    await user.click(screen.getByLabelText('O pega el JSON'));
    await user.paste(json);
    await user.click(screen.getByRole('button', { name: 'Validar' }));
    await user.click(await screen.findByRole('button', { name: /Importar «Lista JSON»/ }));
    expect(usePlaylistStore.getState().playlists[0]?.name).toBe('Lista JSON');
    expect(useLibraryStore.getState().items).toHaveLength(1);
  });
});

describe('PlaylistsPage', () => {
  it('creates a playlist from the form', async () => {
    const user = userEvent.setup();
    renderAt('/playlists', <Route path="/playlists" element={<PlaylistsPage />} />);
    await user.type(screen.getByLabelText('Nueva playlist'), 'Favoritas');
    await user.click(screen.getByRole('button', { name: 'Crear' }));
    expect(usePlaylistStore.getState().playlists[0]?.name).toBe('Favoritas');
    expect(screen.getByRole('link', { name: 'Favoritas' })).toBeInTheDocument();
  });
});

describe('PlaybackSettingsPage', () => {
  it('changes the buffer preset and quality resolution', async () => {
    const user = userEvent.setup();
    renderAt(
      '/settings/playback',
      <Route path="/settings/playback" element={<PlaybackSettingsPage />} />,
    );
    await user.selectOptions(screen.getByLabelText('Preset'), 'stable-4k');
    expect(useSettingsStore.getState().settings.buffer.preset).toBe('stable-4k');
    expect(screen.getByText(/180s futuro/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Resolución preferida'), '1080p');
    expect(useSettingsStore.getState().settings.quality.preferredResolution).toBe('1080p');
  });
});

describe('StorageSettingsPage', () => {
  it('resets everything after confirmation', async () => {
    const user = userEvent.setup();
    useLibraryStore
      .getState()
      .add(
        createMediaItem({ sourceType: 'url', source: 'https://e.org/a.mp4', title: 'A', tags: [] }),
      );
    renderAt(
      '/settings/storage',
      <Route path="/settings/storage" element={<StorageSettingsPage />} />,
    );
    await user.click(screen.getByRole('button', { name: 'Eliminar toda la información local' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Se eliminó toda la información local.')).toBeInTheDocument();
    expect(useLibraryStore.getState().items).toHaveLength(0);
  });
});

describe('PlayerPage', () => {
  it('explains honestly why a magnet cannot be played yet', async () => {
    const item = createMediaItem({
      sourceType: 'magnet',
      source: `magnet:?xt=urn:btih:${HASH}`,
      title: 'Magnet demo',
      tags: [],
    });
    useLibraryStore.getState().add(item);
    renderAt(`/player/${item.id}`, <Route path="/player/:id" element={<PlayerPage />} />);
    expect(
      await screen.findByText('Esta fuente no se puede reproducir todavía'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Fase 2/)).toBeInTheDocument();
    expect(screen.getByText(/WebRTC DataChannels/)).toBeInTheDocument();
  });
  it('asks to re-select a local file that is not attached', async () => {
    const item = createMediaItem({
      sourceType: 'file',
      source: 'pelicula.mp4',
      title: 'Película',
      tags: [],
    });
    useLibraryStore.getState().add(item);
    renderAt(`/player/${item.id}`, <Route path="/player/:id" element={<PlayerPage />} />);
    expect(await screen.findByText('Selecciona de nuevo el archivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seleccionar archivo/ })).toBeInTheDocument();
  });
  it('renders controls for a URL item', async () => {
    const item = createMediaItem({
      sourceType: 'url',
      source: 'https://e.org/a.mp4',
      title: 'URL demo',
      tags: [],
    });
    useLibraryStore.getState().add(item);
    renderAt(`/player/${item.id}`, <Route path="/player/:id" element={<PlayerPage />} />);
    expect(await screen.findByRole('button', { name: /Pausar|Reproducir/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adelantar 30 segundos' })).toBeInTheDocument();
    expect(screen.getByText('html5')).toBeInTheDocument();
  });
});

describe('DiagnosticsPage', () => {
  it('reports missing WebRTC / MediaSource as limitations in jsdom', () => {
    renderAt('/diagnostics', <Route path="/diagnostics" element={<DiagnosticsPage />} />);
    expect(screen.getByText(/Sin WebRTC DataChannels/)).toBeInTheDocument();
    expect(screen.getByText(/Sin MediaSource Extensions/)).toBeInTheDocument();
  });
});
