import { useState } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { formatBytes } from '@/components/format';
import { createMediaItem } from '@/core/import/json';
import { guessPlayableByName } from '@/core/media/compat';
import { sanitizeText } from '@/core/security/sanitize';
import { MAX_TITLE_LENGTH } from '@/core/schemas/media';
import { useLibraryStore } from '@/state/libraryStore';
import { useSessionStore } from '@/state/sessionStore';
import { FolderImport } from './FolderImport';

export function LocalFileImport({
  onImported,
}: {
  onImported: (msg: string, to?: string) => void;
}) {
  const add = useLibraryStore((s) => s.add);
  const attachFile = useSessionStore((s) => s.attachFile);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const save = (play: boolean) => {
    setError(null);
    let lastId: string | null = null;
    for (const file of files) {
      const title =
        sanitizeText(file.name.replace(/\.[^.]+$/, ''), MAX_TITLE_LENGTH) || 'Archivo local';
      const item = createMediaItem({ sourceType: 'file', source: file.name, title, tags: [] });
      if (add(item)) {
        attachFile(item.id, file);
        lastId = item.id;
      }
    }
    if (!lastId) {
      setError('No se pudo añadir ningún archivo.');
      return;
    }
    setFiles([]);
    onImported(
      `${files.length} archivo(s) añadidos. Solo se guarda el nombre: tendrás que volver a seleccionarlos en futuras sesiones.`,
      play && files.length === 1 ? `/player/${lastId}` : undefined,
    );
  };

  return (
    <div>
      <Field
        label="Archivos multimedia locales"
        htmlFor="local-file"
        hint="Se reproducen directamente desde el disco mediante una URL de objeto temporal. No se copian al almacenamiento del navegador."
        error={error ?? undefined}
      >
        <Input
          id="local-file"
          type="file"
          multiple
          accept="video/*,audio/*,.mkv,.mp4,.webm,.mp3,.m4a,.ogg,.opus"
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
        />
      </Field>
      {files.length > 0 ? (
        <ul className="mb-4 text-sm">
          {files.map((f) => (
            <li key={f.name} className="flex justify-between gap-2">
              <span className="truncate">{f.name}</span>
              <span className="ovt-muted shrink-0">
                {formatBytes(f.size)}
                {guessPlayableByName(f.name) === 'unlikely'
                  ? ' · es posible que el navegador no lo reproduzca'
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Notice kind="info">
        El navegador no puede reabrir un archivo local sin que vuelvas a seleccionarlo. La
        biblioteca recordará el nombre y te pedirá el archivo cuando quieras reproducirlo de nuevo.
      </Notice>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={files.length === 0} onClick={() => save(true)}>
          Añadir y reproducir
        </Button>
        <Button disabled={files.length === 0} onClick={() => save(false)}>
          Solo añadir
        </Button>
      </div>
      <FolderImport onImported={onImported} />
    </div>
  );
}
