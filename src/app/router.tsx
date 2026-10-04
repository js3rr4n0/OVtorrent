import { lazy, Suspense } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';
import { LibraryPage } from '@/features/library/LibraryPage';

// Hash routing: every route reloads correctly on any static host without
// server-side fallback configuration.
const ImportPage = lazy(() =>
  import('@/features/import/ImportPage').then((m) => ({ default: m.ImportPage })),
);
const PlaylistsPage = lazy(() =>
  import('@/features/playlists/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })),
);
const PlaylistDetailPage = lazy(() =>
  import('@/features/playlists/PlaylistDetailPage').then((m) => ({
    default: m.PlaylistDetailPage,
  })),
);
const PlayerPage = lazy(() =>
  import('@/features/player/PlayerPage').then((m) => ({ default: m.PlayerPage })),
);
const HistoryPage = lazy(() =>
  import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const PlaybackSettingsPage = lazy(() =>
  import('@/features/settings/PlaybackSettingsPage').then((m) => ({
    default: m.PlaybackSettingsPage,
  })),
);
const StorageSettingsPage = lazy(() =>
  import('@/features/settings/StorageSettingsPage').then((m) => ({
    default: m.StorageSettingsPage,
  })),
);
const TvSettingsPage = lazy(() =>
  import('@/features/settings/TvSettingsPage').then((m) => ({ default: m.TvSettingsPage })),
);
const DiagnosticsPage = lazy(() =>
  import('@/features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })),
);
const AboutPage = lazy(() =>
  import('@/features/about/AboutPage').then((m) => ({ default: m.AboutPage })),
);

function Loading() {
  return (
    <p className="ovt-muted p-4" role="status">
      Cargando…
    </p>
  );
}

function RouteError() {
  return (
    <div role="alert">
      <h1 className="text-2xl font-semibold">No se pudo cargar esta pantalla</h1>
      <p className="ovt-muted mt-2">
        Si estás sin conexión, es posible que esta parte de la aplicación aún no se hubiera guardado
        para uso offline. Vuelve a conectarte y recarga la página.
      </p>
      <a href="#/" className="mt-4 inline-block underline">
        Ir a la biblioteca
      </a>
    </div>
  );
}

function NotFound() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="ovt-muted mt-2">La ruta no existe en esta aplicación.</p>
    </div>
  );
}

const wrap = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: 'import', element: wrap(<ImportPage />) },
      { path: 'playlists', element: wrap(<PlaylistsPage />) },
      { path: 'playlists/:id', element: wrap(<PlaylistDetailPage />) },
      { path: 'player/:id', element: wrap(<PlayerPage />) },
      { path: 'history', element: wrap(<HistoryPage />) },
      { path: 'settings', element: wrap(<SettingsPage />) },
      { path: 'settings/playback', element: wrap(<PlaybackSettingsPage />) },
      { path: 'settings/storage', element: wrap(<StorageSettingsPage />) },
      { path: 'settings/tv', element: wrap(<TvSettingsPage />) },
      { path: 'diagnostics', element: wrap(<DiagnosticsPage />) },
      { path: 'about', element: wrap(<AboutPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
