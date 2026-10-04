import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Field, Input, Notice } from '@/components/ui';
import { importM3u, MAX_M3U_BYTES, type M3uImportResult } from '@/core/import/m3u';
import { sanitizeText, validateMediaUrl } from '@/core/security/sanitize';
import { MAX_TITLE_LENGTH } from '@/core/schemas/media';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSettingsStore } from '@/state/settingsStore';

const KIND_LABEL = {
  'media-list': 'Lista de medios',
  'hls-master': 'HLS multivariant (master)',
  'hls-media': 'HLS (lista de segmentos)',
} as const;

export function M3uImport({ onImported }: { onImported: (msg: string, to?: string) => void }) {
  const addMany = useLibraryStore((s) => s.addMany);
  const createPlaylist = usePlaylistStore((s) => s.create);
  const confirmExternal = useSettingsStore((s) => s.settings.privacy.confirmExternalUrls);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [createList, setCreateList] = useState(true);
  const [result, setResult] = useState<M3uImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFetch, setPendingFetch] = useState<URL | null>(null);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setError(null);
    setResult(null);
    if (!file) return;
    if (file.size > MAX_M3U_BYTES) {
      setError('El archivo supera 2 MB.');
      return;
    }
    setText(await file.text());
    if (!playlistName)
      setPlaylistName(sanitizeText(file.name.replace(/\.[^.]+$/, ''), MAX_TITLE_LENGTH));
  };

  const validate = (sourceText: string, sourceUrl?: string) => {
    const r = importM3u(sourceText, {
      sourceUrl: sourceUrl || baseUrl || undefined,
      fallbackTitle: playlistName,
    });
    setResult(r);
    if (r.ok && r.needsConfirmation) setConfirmLarge(true);
  };

  const fetchUrl = async (target: URL) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(target.toString(), { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
      const body = await res.text();
      if (body.length > MAX_M3U_BYTES) throw new Error('La lista supera 2 MB.');
      setText(body);
      if (!playlistName)
        setPlaylistName(
          target.pathname
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') ?? 'Lista',
        );
      validate(body, target.toString());
    } catch (err) {
      setError(
        `No se pudo descargar la lista: ${err instanceof Error ? err.message : 'error'}. Si es HLS, el servidor debe permitir CORS; también puedes añadir la URL como fuente HLS en la pestaña «URL multimedia».`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onFetch = () => {
    const v = validateMediaUrl(url);
    if (!v.ok || !v.url) {
      setError(v.reason ?? 'URL no válida');
      return;
    }
    if (v.isExternal && confirmExternal) setPendingFetch(v.url);
    else void fetchUrl(v.url);
  };

  const commit = () => {
    if (!result?.ok) return;
    const added = addMany(result.items);
    let to: string | undefined;
    if (createList && result.items.length > 1) {
      const p = createPlaylist(
        sanitizeText(playlistName, MAX_TITLE_LENGTH) || 'Lista M3U',
        '',
        result.items,
      );
      if (p) to = `/playlists/${p.id}`;
    }
    setText('');
    setResult(null);
    onImported(
      `${added} elemento(s) añadidos desde la lista M3U${to ? ' y playlist creada' : ''}.`,
      to,
    );
  };

  return (
    <div>
      <Field
        label="Archivo .m3u / .m3u8"
        htmlFor="m3u-file"
        hint="Listas de medios (URLs http/https o magnets) o playlists HLS. Se analizan localmente."
      >
        <Input
          id="m3u-file"
          type="file"
          accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,application/x-mpegURL"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </Field>
      <Field
        label="O URL de la lista"
        htmlFor="m3u-url"
        hint="Se descarga una sola vez para leerla. Las playlists HLS se añaden como una única fuente reproducible por esa URL."
      >
        <div className="flex gap-2">
          <Input
            id="m3u-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://ejemplo.org/lista.m3u8"
            autoComplete="off"
          />
          <Button onClick={onFetch} disabled={!url.trim() || busy}>
            {busy ? 'Descargando…' : 'Descargar'}
          </Button>
        </div>
      </Field>
      <Field label="O pega el contenido" htmlFor="m3u-text">
        <textarea
          id="m3u-text"
          className="min-h-32 w-full rounded-md border border-[var(--ovt-border)] bg-[var(--ovt-surface)] p-2 font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <Field label="URL base para rutas relativas (opcional)" htmlFor="m3u-base">
        <Input
          id="m3u-base"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://ejemplo.org/carpeta/"
          autoComplete="off"
        />
      </Field>
      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <Field label="Nombre de la playlist" htmlFor="m3u-name">
          <Input
            id="m3u-name"
            value={playlistName}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(e) => setPlaylistName(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2">
          <input
            id="m3u-create"
            type="checkbox"
            className="h-6 w-6"
            checked={createList}
            onChange={(e) => setCreateList(e.target.checked)}
          />
          <label htmlFor="m3u-create">Crear playlist además de añadir a la biblioteca</label>
        </div>
      </div>
      {error ? (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!text.trim()} onClick={() => validate(text)}>
          Validar
        </Button>
        {result?.ok && !result.needsConfirmation ? (
          <Button variant="primary" onClick={commit}>
            Importar {result.items.length} elemento(s)
          </Button>
        ) : null}
        <Button
          onClick={() => {
            setText('');
            setResult(null);
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
      {result ? (
        <div className="mt-4">
          <Notice
            kind={result.ok ? 'success' : 'error'}
            title={`${KIND_LABEL[result.kind]}: ${result.items.length} elemento(s)`}
          >
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            {result.errors.length > 0 ? (
              <ul className="list-disc pl-5">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    {e.line > 0 ? `Línea ${e.line}: ` : ''}
                    {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.items.length > 0 ? (
              <ul className="mt-2 max-h-48 overflow-auto rounded border border-[var(--ovt-border)] p-2 text-xs">
                {result.items.slice(0, 100).map((it) => (
                  <li key={it.id} className="truncate">
                    [{it.sourceType}] {it.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}
      <ConfirmDialog
        open={pendingFetch !== null}
        title="Descargar lista externa"
        confirmLabel="Descargar"
        onCancel={() => setPendingFetch(null)}
        onConfirm={() => {
          const t = pendingFetch;
          setPendingFetch(null);
          if (t) void fetchUrl(t);
        }}
      >
        Se descargará la lista desde <strong>{pendingFetch?.hostname}</strong>. El servidor verá tu
        IP. No se enviará nada más.
      </ConfirmDialog>
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
        La lista contiene {result?.items.length} elementos. ¿Quieres importarla?
      </ConfirmDialog>
    </div>
  );
}
