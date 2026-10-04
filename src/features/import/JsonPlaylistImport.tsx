import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Field, Input, Notice } from '@/components/ui';
import { importPlaylistJson, type JsonImportResult } from '@/core/import/json';
import { usePlaylistStore } from '@/state/playlistStore';
import { useLibraryStore } from '@/state/libraryStore';

export function JsonPlaylistImport({
  onImported,
}: {
  onImported: (msg: string, to?: string) => void;
}) {
  const upsert = usePlaylistStore((s) => s.upsert);
  const addMany = useLibraryStore((s) => s.addMany);
  const [text, setText] = useState('');
  const [result, setResult] = useState<JsonImportResult | null>(null);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [alsoLibrary, setAlsoLibrary] = useState(true);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setResult({
        ok: false,
        errors: [{ path: '(archivo)', message: 'El archivo supera 2 MB' }],
        warnings: [],
        needsConfirmation: false,
      });
      return;
    }
    setText(await file.text());
  };

  const validate = () => {
    const r = importPlaylistJson(text);
    setResult(r);
    if (r.ok && r.needsConfirmation) setConfirmLarge(true);
  };

  const commit = () => {
    if (!result?.ok || !result.playlist) return;
    const ok = upsert(result.playlist);
    if (!ok) {
      setResult({
        ...result,
        ok: false,
        errors: [{ path: '(playlists)', message: 'Límite de playlists alcanzado' }],
      });
      return;
    }
    if (alsoLibrary) addMany(result.playlist.items);
    setText('');
    setResult(null);
    onImported(
      `Playlist «${result.playlist.name}» importada con ${result.playlist.items.length} elementos.`,
      `/playlists/${result.playlist.id}`,
    );
  };

  return (
    <div>
      <Field
        label="Archivo JSON"
        htmlFor="json-file"
        hint="Esquema versionado (ver PLAYLIST-SCHEMA.md). Se valida con Zod; ningún valor importado se ejecuta ni se envía a terceros."
      >
        <Input
          id="json-file"
          type="file"
          accept="application/json,.json"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </Field>
      <Field label="O pega el JSON" htmlFor="json-text">
        <textarea
          id="json-text"
          className="min-h-40 w-full rounded-md border border-[var(--ovt-border)] bg-[var(--ovt-surface)] p-2 font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <div className="mb-4 flex items-center gap-2">
        <input
          id="json-also-library"
          type="checkbox"
          className="h-6 w-6"
          checked={alsoLibrary}
          onChange={(e) => setAlsoLibrary(e.target.checked)}
        />
        <label htmlFor="json-also-library">Añadir también los elementos a la biblioteca</label>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!text.trim()} onClick={validate}>
          Validar
        </Button>
        {result?.ok && !result.needsConfirmation ? (
          <Button variant="primary" onClick={commit}>
            Importar «{result.playlist?.name}»
          </Button>
        ) : null}
        <Button
          onClick={() => {
            setText('');
            setResult(null);
          }}
        >
          Cancelar
        </Button>
      </div>
      {result && !result.ok ? (
        <div className="mt-4">
          <Notice kind="error" title="El JSON no es válido">
            <ul className="list-disc pl-5">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <code>{e.path}</code>: {e.message}
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      ) : null}
      {result?.ok ? (
        <div className="mt-4">
          <Notice kind="success">
            Validado: «{result.playlist?.name}» con {result.playlist?.items.length} elementos.
          </Notice>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmLarge}
        title="Lista grande"
        confirmLabel="Importar"
        onCancel={() => {
          setConfirmLarge(false);
          setResult(null);
        }}
        onConfirm={() => {
          setConfirmLarge(false);
          commit();
        }}
      >
        La lista contiene {result?.playlist?.items.length} elementos. ¿Quieres importarla?
      </ConfirmDialog>
    </div>
  );
}
