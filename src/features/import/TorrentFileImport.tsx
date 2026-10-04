import { useState } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { formatBytes } from '@/components/format';
import { createMediaItem } from '@/core/import/json';
import {
  magnetFromTorrent,
  MAX_TORRENT_BYTES,
  parseTorrentFile,
  type TorrentSummary,
} from '@/core/import/torrentFile';
import { guessPlayableByName } from '@/core/media/compat';
import { useLibraryStore } from '@/state/libraryStore';

export function TorrentFileImport({
  onImported,
}: {
  onImported: (msg: string, to?: string) => void;
}) {
  const add = useLibraryStore((s) => s.add);
  const [summary, setSummary] = useState<TorrentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setSummary(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_TORRENT_BYTES) {
      setError('El archivo .torrent supera 4 MB.');
      return;
    }
    setBusy(true);
    try {
      setSummary(await parseTorrentFile(await file.arrayBuffer()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el torrent.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!summary) return;
    const item = createMediaItem({
      sourceType: 'magnet',
      source: magnetFromTorrent(summary),
      title: summary.name,
      tags: [],
    });
    if (add(item))
      onImported(
        `«${item.title}» añadido a la biblioteca a partir del .torrent (no se guarda el archivo).`,
      );
    else setError('No se pudo añadir el elemento.');
  };

  return (
    <div>
      <Field
        label="Archivo .torrent"
        htmlFor="torrent-file"
        hint="Se analiza localmente para extraer nombre, archivos y hash. El archivo .torrent no se guarda."
        error={error ?? undefined}
      >
        <Input
          id="torrent-file"
          type="file"
          accept=".torrent,application/x-bittorrent"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </Field>
      {busy ? <p role="status">Analizando…</p> : null}
      {summary ? (
        <div className="mb-4 text-sm">
          <p className="font-medium">{summary.name}</p>
          <p className="ovt-muted">
            {summary.files.length} archivo(s) · {formatBytes(summary.totalLength)} · hash{' '}
            {summary.infoHash}
          </p>
          <ul className="mt-2 max-h-48 overflow-auto rounded border border-[var(--ovt-border)] p-2">
            {summary.files.slice(0, 200).map((f) => (
              <li key={f.path} className="flex justify-between gap-2">
                <span className="truncate">{f.path}</span>
                <span className="ovt-muted shrink-0">
                  {formatBytes(f.length)}{' '}
                  {guessPlayableByName(f.path) === 'unlikely'
                    ? '· contenedor probablemente no reproducible'
                    : ''}
                </span>
              </li>
            ))}
          </ul>
          {summary.webSocketTrackers.length === 0 ? (
            <div className="mt-2">
              <Notice kind="warning">
                El torrent no declara trackers WebSocket. Desde el navegador no se podrá contactar
                con trackers UDP/HTTP ni con peers TCP: puede que no haya peers accesibles.
              </Notice>
            </div>
          ) : null}
          <div className="mt-4">
            <Button variant="primary" onClick={save}>
              Añadir a la biblioteca
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
