import { useState } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { parseMagnet } from '@/core/import/magnet';
import { createMediaItem } from '@/core/import/json';
import { sanitizeTags, sanitizeText } from '@/core/security/sanitize';
import { MAX_TAG_LENGTH, MAX_TAGS, MAX_TITLE_LENGTH } from '@/core/schemas/media';
import { useLibraryStore } from '@/state/libraryStore';

export function MagnetImport({ onImported }: { onImported: (msg: string, to?: string) => void }) {
  const add = useLibraryStore((s) => s.add);
  const [magnet, setMagnet] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsed = magnet.trim() ? parseMagnet(magnet) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = parseMagnet(magnet);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    const finalTitle =
      sanitizeText(title, MAX_TITLE_LENGTH) ||
      result.magnet.displayName ||
      `Magnet ${result.magnet.infoHash.slice(0, 8)}`;
    try {
      const item = createMediaItem({
        sourceType: 'magnet',
        source: result.magnet.normalized,
        title: finalTitle,
        tags: sanitizeTags(tags.split(','), MAX_TAGS, MAX_TAG_LENGTH),
      });
      if (!add(item)) {
        setError('No se pudo añadir (biblioteca llena o elemento duplicado).');
        return;
      }
      setMagnet('');
      setTitle('');
      setTags('');
      onImported(`«${item.title}» añadido a la biblioteca.`);
    } catch {
      setError('Datos no válidos.');
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label="Enlace magnet"
        htmlFor="magnet-input"
        hint="Formato: magnet:?xt=urn:btih:… El enlace se valida y normaliza localmente."
        error={error ?? undefined}
      >
        <Input
          id="magnet-input"
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          placeholder="magnet:?xt=urn:btih:…"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </Field>
      {parsed && parsed.ok ? (
        <div className="mb-4 text-sm">
          <p>
            Info hash: <code>{parsed.magnet.infoHash}</code>
          </p>
          <p>
            Trackers: {parsed.magnet.trackers.length} (compatibles con navegador:{' '}
            {parsed.magnet.webSocketTrackers.length})
          </p>
          {parsed.magnet.webSocketTrackers.length === 0 ? (
            <Notice kind="warning">
              Este magnet no declara trackers WebSocket (ws:// o wss://). Desde un navegador solo es
              posible descubrir peers mediante trackers WebSocket compatibles con WebTorrent; sin
              ellos es probable que no haya peers accesibles.
            </Notice>
          ) : null}
        </div>
      ) : null}
      {parsed && !parsed.ok && magnet.trim() ? (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-300">{parsed.reason}</p>
      ) : null}
      <Field label="Título (opcional)" htmlFor="magnet-title">
        <Input
          id="magnet-title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Etiquetas (separadas por comas, opcional)" htmlFor="magnet-tags">
        <Input id="magnet-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <Notice kind="info">
        La reproducción usa WebTorrent en el navegador: solo se conecta con peers compatibles con
        WebRTC a través de trackers WebSocket. Muchos torrents tradicionales no tendrán peers
        accesibles desde la web.
      </Notice>
      <div className="mt-4">
        <Button type="submit" variant="primary">
          Añadir a la biblioteca
        </Button>
      </div>
    </form>
  );
}
