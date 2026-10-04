import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { useTvMode } from './hooks/useTvMode';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { OfflineBanner } from './OfflineBanner';

const NAV = [
  { to: '/', label: 'Biblioteca', end: true },
  { to: '/import', label: 'Importar' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/history', label: 'Historial' },
  { to: '/settings', label: 'Ajustes' },
  { to: '/diagnostics', label: 'Diagnóstico' },
  { to: '/about', label: 'Acerca de' },
];

export function AppShell() {
  useTheme();
  const { active: tvActive } = useTvMode();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only sr-only-focusable fixed left-2 top-2 z-50 rounded bg-blue-600 px-3 py-2 text-white"
      >
        Saltar al contenido
      </a>
      <nav
        aria-label="Navegación principal"
        className="ovt-nav ovt-surface flex shrink-0 flex-row gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:border-b-0 md:border-r"
      >
        <div className="hidden px-3 py-2 md:block">
          <span className="text-lg font-bold">OVtorrent</span>
          <span className="ovt-muted block text-xs">Local-first · sin servidor</span>
          {tvActive ? (
            <span className="ovt-accent block text-xs font-semibold">Modo TV activo</span>
          ) : null}
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `min-h-12 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium tv:text-xl ${
                isActive ? 'bg-blue-600 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main id="main" className="flex-1 p-4 md:p-6" tabIndex={-1}>
        <OfflineBanner />
        <Outlet />
      </main>
      <PwaUpdatePrompt />
    </div>
  );
}
