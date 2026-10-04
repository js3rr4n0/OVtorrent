import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div
      className="mb-4 rounded-md border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm"
      role="status"
    >
      Sin conexión. La interfaz, tus playlists y ajustes siguen disponibles, pero el streaming P2P y
      las URLs remotas necesitan Internet.
    </div>
  );
}
