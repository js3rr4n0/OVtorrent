import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Field, Input, Notice } from '@/components/ui';
import { createMediaItem } from '@/core/import/json';
import { sanitizeText, validateMediaUrl } from '@/core/security/sanitize';
import { MAX_TITLE_LENGTH } from '@/core/schemas/media';
import { useLibraryStore } from '@/state/libraryStore';
import { useSettingsStore } from '@/state/settingsStore';

export function UrlImport({ onImported }: { onImported: (msg: string, to?: string) => void }) {
  const add = useLibraryStore((s) => s.add);
  const confirmExternal = useSettingsStore((s) => s.settings.privacy.confirmExternalUrls);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<URL | null>(null);

  const commit = (u: URL) => {
    const item = createMediaItem({
      sourceType: 'url',
      source: u.toString(),
      title: sanitizeText(title, MAX_TITLE_LENGTH) || u.pathname.split('/').pop() || u.hostname,
      tags: [],
    });
    if (add(item)) {
      setUrl('');
      setTitle('');
      onImported(`«${item.title}» añadido a la biblioteca.`);
    } else setError('No se pudo añadir el elemento.');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validateMediaUrl(url);
    if (!v.ok || !v.url) {
      setError(v.reason ?? 'URL no válida');
      return;
    }
    if (v.isExternal && confirmExternal) setPending(v.url);
    else commit(v.url);
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label="URL de archivo multimedia"
        htmlFor="url-input"
        hint="Solo http:// y https://. Se bloquean javascript:, data: y otros esquemas."
        error={error ?? undefined}
      >
        <Input
          id="url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://ejemplo.org/video.mp4"
          autoComplete="off"
          required
        />
      </Field>
      <Field label="Título (opcional)" htmlFor="url-title">
        <Input
          id="url-title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Notice kind="warning">
        Al reproducir una URL remota, tu navegador se conectará directamente a ese servidor y éste
        podrá ver tu dirección IP. La aplicación no usa ningún proxy.
      </Notice>
      <div className="mt-4">
        <Button type="submit" variant="primary">
          Añadir a la biblioteca
        </Button>
      </div>
      <ConfirmDialog
        open={pending !== null}
        title="Confirmar fuente externa"
        confirmLabel="Añadir"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) commit(pending);
          setPending(null);
        }}
      >
        Vas a añadir contenido de <strong>{pending?.hostname}</strong>. Asegúrate de tener derecho a
        reproducirlo. El servidor verá tu IP al reproducir.
      </ConfirmDialog>
    </form>
  );
}
