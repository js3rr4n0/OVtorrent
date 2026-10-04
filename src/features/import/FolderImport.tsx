import { useRef, useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { createMediaItem } from '@/core/import/json';
import { guessPlayableByName } from '@/core/media/compat';
import { sanitizeText } from '@/core/security/sanitize';
import { MAX_TITLE_LENGTH } from '@/core/schemas/media';
import { hasFileSystemAccess } from '@/core/streaming/capabilities';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSessionStore } from '@/state/sessionStore';
import {
  collectMediaFiles,
  MAX_DEPTH,
  MAX_FOLDER_FILES,
  MEDIA_EXT,
  type DirectoryHandleLike,
} from './folderScan';

/**
 * Imports a whole local folder: File System Access API when available,
 * otherwise the widely supported <input webkitdirectory>. Files are never
 * copied; only names are stored and the File objects live in this tab.
 */
export function FolderImport({ onImported }: { onImported: (msg: string, to?: string) => void }) {
  const addMany = useLibraryStore((s) => s.addMany);
  const attachFile = useSessionStore((s) => s.attachFile);
  const createPlaylist = usePlaylistStore((s) => s.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const fsa = hasFileSystemAccess() && 'showDirectoryPicker' in window;

  const finish = (entries: Array<{ file: File; path: string }>, folderName: string) => {
    if (entries.length === 0) {
      setError('La carpeta no contiene archivos multimedia reconocibles.');
      return;
    }
    const items = entries.map(({ file, path }) =>
      createMediaItem({
        sourceType: 'file',
        source: path,
        title: sanitizeText(file.name.replace(/\.[^.]+$/, ''), MAX_TITLE_LENGTH) || 'Archivo local',
        tags: guessPlayableByName(file.name) === 'unlikely' ? ['contenedor-dudoso'] : [],
      }),
    );
    items.forEach((item, i) => attachFile(item.id, entries[i]!.file));
    const added = addMany(items);
    const playlist = createPlaylist(
      sanitizeText(folderName, MAX_TITLE_LENGTH) || 'Carpeta local',
      'Importada desde una carpeta local',
      items,
    );
    onImported(
      `${added} archivo(s) añadidos desde la carpeta «${folderName}». Solo se guardan los nombres: tendrás que volver a seleccionarlos en otra sesión.`,
      playlist ? `/playlists/${playlist.id}` : undefined,
    );
  };

  const pickWithFsa = async () => {
    setError(null);
    setBusy(true);
    try {
      const picker = (
        window as unknown as {
          showDirectoryPicker: (o?: { mode?: string }) => Promise<DirectoryHandleLike>;
        }
      ).showDirectoryPicker;
      const dir = await picker({ mode: 'read' });
      finish(await collectMediaFiles(dir), dir.name);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'No se pudo leer la carpeta.');
    } finally {
      setBusy(false);
    }
  };

  const onFallbackFiles = (list: FileList | null) => {
    setError(null);
    if (!list) return;
    const entries: Array<{ file: File; path: string }> = [];
    for (const file of Array.from(list)) {
      if (entries.length >= MAX_FOLDER_FILES) break;
      if (MEDIA_EXT.test(file.name)) {
        const rel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        entries.push({ file, path: rel });
      }
    }
    const folder = entries[0]?.path.split('/')[0] ?? 'Carpeta local';
    finish(entries, folder);
  };

  return (
    <div className="mt-4">
      <h3 className="mb-2 font-medium">Carpeta completa</h3>
      <div className="flex flex-wrap gap-2">
        {fsa ? (
          <Button onClick={() => void pickWithFsa()} disabled={busy}>
            {busy ? 'Leyendo carpeta…' : 'Seleccionar carpeta (File System Access)'}
          </Button>
        ) : null}
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          aria-hidden
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => onFallbackFiles(e.target.files)}
        />
        <Button onClick={() => input.current?.click()}>
          {fsa ? 'Seleccionar carpeta (método clásico)' : 'Seleccionar carpeta'}
        </Button>
      </div>
      <p className="ovt-muted mt-1 text-xs tv:text-base">
        Se exploran hasta {MAX_DEPTH} niveles y {MAX_FOLDER_FILES} archivos. Se crea una playlist
        con el nombre de la carpeta.
        {fsa
          ? ''
          : ' Este navegador no expone File System Access API; se usa el selector clásico de carpetas.'}
      </p>
      {error ? (
        <div className="mt-2">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
    </div>
  );
}
