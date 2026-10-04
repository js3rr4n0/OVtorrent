import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { Notice, PageHeader } from '@/components/ui';
import { MagnetImport } from './MagnetImport';
import { TorrentFileImport } from './TorrentFileImport';
import { LocalFileImport } from './LocalFileImport';
import { UrlImport } from './UrlImport';
import { JsonPlaylistImport } from './JsonPlaylistImport';
import { M3uImport } from './M3uImport';

const TABS = [
  { id: 'magnet', label: 'Magnet link' },
  { id: 'torrent', label: 'Archivo .torrent' },
  { id: 'file', label: 'Archivo local' },
  { id: 'url', label: 'URL multimedia' },
  { id: 'm3u', label: 'M3U / M3U8' },
  { id: 'json', label: 'Playlist JSON' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function ImportPage() {
  useDocumentTitle('Importar');
  const [tab, setTab] = useState<Tab>('magnet');
  const navigate = useNavigate();
  const [done, setDone] = useState<string | null>(null);

  const onImported = (message: string, to?: string) => {
    setDone(message);
    if (to) navigate(to);
  };

  return (
    <div>
      <PageHeader
        title="Importar fuentes y listas"
        subtitle="Solo contenido que tengas derecho a reproducir. Nada de lo que importes se envía a ningún servicio: no hay buscador, indexador ni catálogo remoto."
      />
      <div role="tablist" aria-label="Tipo de importación" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => {
              setTab(t.id);
              setDone(null);
            }}
            className={`min-h-12 rounded-md px-4 py-2 text-sm font-medium tv:text-xl ${
              tab === t.id ? 'bg-blue-600 text-white' : 'ovt-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {done ? (
        <div className="mb-4">
          <Notice kind="success">{done}</Notice>
        </div>
      ) : null}
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="ovt-surface rounded-lg p-4"
      >
        {tab === 'magnet' ? <MagnetImport onImported={onImported} /> : null}
        {tab === 'torrent' ? <TorrentFileImport onImported={onImported} /> : null}
        {tab === 'file' ? <LocalFileImport onImported={onImported} /> : null}
        {tab === 'url' ? <UrlImport onImported={onImported} /> : null}
        {tab === 'm3u' ? <M3uImport onImported={onImported} /> : null}
        {tab === 'json' ? <JsonPlaylistImport onImported={onImported} /> : null}
      </div>
    </div>
  );
}
