import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

type Registrar = (reload?: boolean) => Promise<void>;

/**
 * Registers the Service Worker (app shell only) and offers a reload when a
 * new version is available. The import is dynamic so unit tests and
 * environments without the PWA plugin keep working.
 */
export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<Registrar | null>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'test' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
        });
        setUpdate(() => updateSW);
      })
      .catch(() => {
        /* Service Worker not available (e.g. dev server, file://) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh) return null;
  return (
    <div
      className="ovt-surface fixed bottom-4 right-4 z-40 max-w-sm rounded-lg p-4 shadow-lg"
      role="status"
    >
      <p className="font-medium">Hay una nueva versión de OVtorrent.</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={() => void update?.(true)}>
          Actualizar
        </Button>
        <Button onClick={() => setNeedRefresh(false)}>Más tarde</Button>
      </div>
    </div>
  );
}
