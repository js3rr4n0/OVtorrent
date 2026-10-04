import { useEffect, useState } from 'react';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Card, Field, Input, Notice, PageHeader, Toggle } from '@/components/ui';
import { formatBytes } from '@/components/format';
import { storageEstimate } from '@/core/streaming/capabilities';
import {
  clearEverything,
  clearHistoryOnly,
  clearPlaylistsOnly,
  clearTemporaryCache,
  importBundle,
  resetSettingsOnly,
  type ImportBundleResult,
} from '@/state/dataManagement';
import { useHistoryStore } from '@/state/historyStore';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { downloadText } from '@/features/playlists/playlistExport';
import {
  buildPartialExport,
  EXPORT_SECTIONS,
  previewBundle,
  SECTION_LABELS,
  type ExportSection,
  type ImportPreview,
} from './exportSections';

type Action = 'all' | 'history' | 'playlists' | 'cache' | 'settings' | null;

export function StorageSettingsPage() {
  useDocumentTitle('Almacenamiento');
  const libraryCount = useLibraryStore((s) => s.items.length);
  const playlistCount = usePlaylistStore((s) => s.playlists.length);
  const historyCount = useHistoryStore((s) => s.entries.length);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number }>({});
  const [pending, setPending] = useState<Action>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportBundleResult | null>(null);
  const [merge, setMerge] = useState(true);
  const [sections, setSections] = useState<ExportSection[]>([...EXPORT_SECTIONS]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);

  useEffect(() => {
    void storageEstimate().then(setEstimate);
  }, [status]);

  const run = async (action: Action) => {
    switch (action) {
      case 'all':
        await clearEverything();
        setStatus('Se eliminó toda la información local.');
        break;
      case 'history':
        clearHistoryOnly();
        setStatus('Historial eliminado.');
        break;
      case 'playlists':
        clearPlaylistsOnly();
        setStatus('Playlists eliminadas.');
        break;
      case 'cache':
        await clearTemporaryCache();
        setStatus('Caché temporal eliminada (best effort).');
        break;
      case 'settings':
        resetSettingsOnly();
        setStatus('Configuración restablecida.');
        break;
      default:
        break;
    }
    setPending(null);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setImportResult(null);
    const p = previewBundle(text);
    setPreview(p);
    setPendingText(p.ok ? text : null);
  };

  const applyImport = () => {
    if (!pendingText) return;
    const r = importBundle(pendingText, { merge });
    setImportResult(r);
    setPendingText(null);
    setPreview(null);
    if (r.ok) setStatus('Importación completada.');
  };

  const labels: Record<Exclude<Action, null>, { title: string; body: string }> = {
    all: {
      title: 'Eliminar toda la información local',
      body: 'Biblioteca, playlists, favoritos, historial, ajustes y caché temporal desaparecerán de este navegador. No hay copia en ningún servidor.',
    },
    history: {
      title: 'Eliminar solo el historial',
      body: 'Se borrará el progreso de reproducción guardado.',
    },
    playlists: {
      title: 'Eliminar solo las playlists',
      body: 'Las playlists locales se eliminarán. La biblioteca se conserva.',
    },
    cache: {
      title: 'Eliminar solo la caché temporal',
      body: 'Se vacía el búfer efímero (memoria/IndexedDB) y las cachés de ejecución. El app shell de la PWA se mantiene.',
    },
    settings: {
      title: 'Restablecer configuración',
      body: 'Los ajustes volverán a sus valores por defecto. Biblioteca, playlists e historial se conservan.',
    },
  };

  return (
    <div>
      <PageHeader
        title="Almacenamiento y limpieza"
        subtitle="Todo lo que la aplicación guarda está en este navegador. Borrar los datos del sitio desde el navegador tiene el mismo efecto que «Eliminar todo»."
      />
      {status ? (
        <div className="mb-4">
          <Notice kind="success">{status}</Notice>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Qué hay guardado</h2>
          <ul className="text-sm tv:text-xl">
            <li>Biblioteca: {libraryCount} elementos</li>
            <li>Playlists: {playlistCount}</li>
            <li>Historial: {historyCount} entradas</li>
            <li>
              Uso estimado del origen:{' '}
              {estimate.usage !== undefined ? formatBytes(estimate.usage) : 'n/d'}
              {estimate.quota !== undefined ? ` de ${formatBytes(estimate.quota)}` : ''}
            </li>
          </ul>
          <p className="ovt-muted mt-2 text-xs tv:text-base">
            No se guardan deliberadamente torrents ni vídeos completos. El navegador o el sistema
            operativo pueden limpiar este almacenamiento en cualquier momento.
          </p>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Exportar / importar</h2>
          <fieldset className="mb-3">
            <legend className="mb-1 text-sm font-medium">Secciones a exportar</legend>
            {EXPORT_SECTIONS.map((sec) => (
              <div key={sec} className="flex items-center gap-2">
                <input
                  id={`exp-${sec}`}
                  type="checkbox"
                  className="h-6 w-6"
                  checked={sections.includes(sec)}
                  onChange={(e) =>
                    setSections((prev) =>
                      e.target.checked ? [...prev, sec] : prev.filter((x) => x !== sec),
                    )
                  }
                />
                <label htmlFor={`exp-${sec}`} className="min-h-12 py-1 text-sm tv:text-lg">
                  {SECTION_LABELS[sec]}
                </label>
              </div>
            ))}
          </fieldset>
          <Button
            variant="primary"
            disabled={sections.length === 0}
            onClick={() =>
              downloadText(
                `ovtorrent-export-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(buildPartialExport(sections), null, 2),
              )
            }
          >
            Exportar{' '}
            {sections.length === EXPORT_SECTIONS.length
              ? 'toda la configuración'
              : 'las secciones elegidas'}{' '}
            a JSON
          </Button>
          <div className="mt-4">
            <Toggle
              id="merge"
              label="Fusionar con los datos actuales"
              hint="Desactívalo para reemplazar biblioteca, playlists e historial."
              checked={merge}
              onChange={setMerge}
            />
            <Field label="Importar desde JSON" htmlFor="import-file">
              <Input
                id="import-file"
                type="file"
                accept="application/json,.json"
                onChange={(e) => void onImport(e.target.files?.[0])}
              />
            </Field>
          </div>
          {preview ? (
            preview.ok ? (
              <div className="mb-3">
                <Notice kind="info" title="Vista previa de la importación">
                  <p>
                    Exportado el{' '}
                    {preview.exportedAt ? new Date(preview.exportedAt).toLocaleString('es') : '?'}.
                  </p>
                  <ul className="list-disc pl-5">
                    {EXPORT_SECTIONS.filter((sec) => preview.counts[sec] !== undefined).map(
                      (sec) => (
                        <li key={sec}>
                          {SECTION_LABELS[sec]}: {preview.counts[sec]}
                        </li>
                      ),
                    )}
                  </ul>
                  <p className="mt-1">
                    {merge
                      ? 'Se fusionará con los datos actuales.'
                      : 'Reemplazará biblioteca, playlists e historial actuales.'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="primary" onClick={applyImport}>
                      Aplicar importación
                    </Button>
                    <Button
                      onClick={() => {
                        setPreview(null);
                        setPendingText(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </Notice>
              </div>
            ) : (
              <Notice kind="error" title="No se pudo leer el archivo">
                <ul className="list-disc pl-5">
                  {preview.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Notice>
            )
          ) : null}
          {importResult ? (
            importResult.ok ? (
              <Notice kind="success">
                Importado: ajustes {importResult.imported.settings ? 'sí' : 'no'},{' '}
                {importResult.imported.library} elementos, {importResult.imported.playlists}{' '}
                playlists, {importResult.imported.history} entradas de historial.
              </Notice>
            ) : (
              <Notice kind="error" title="No se pudo importar">
                <ul className="list-disc pl-5">
                  {importResult.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Notice>
            )
          ) : null}
        </Card>
        <Card className="md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Limpieza</h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPending('cache')}>Eliminar solo caché temporal</Button>
            <Button onClick={() => setPending('history')}>Eliminar solo historial</Button>
            <Button onClick={() => setPending('playlists')}>Eliminar solo playlists</Button>
            <Button onClick={() => setPending('settings')}>Restablecer configuración</Button>
            <Button variant="danger" onClick={() => setPending('all')}>
              Eliminar toda la información local
            </Button>
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending ? labels[pending].title : ''}
        danger={pending === 'all'}
        confirmLabel="Confirmar"
        onCancel={() => setPending(null)}
        onConfirm={() => void run(pending)}
      >
        {pending ? labels[pending].body : null}
      </ConfirmDialog>
    </div>
  );
}
