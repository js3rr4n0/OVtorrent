import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, LinkButton, Notice, PageHeader } from '@/components/ui';
import { formatDate } from '@/components/format';
import type { Playlist } from '@/core/schemas/playlist';
import { usePlaylistStore } from '@/state/playlistStore';
import { downloadText, playlistToJson, safeFilename } from './playlistExport';

export function PlaylistsPage() {
  useDocumentTitle('Playlists');
  const playlists = usePlaylistStore((s) => s.playlists);
  const persisted = usePlaylistStore((s) => s.persisted);
  const create = usePlaylistStore((s) => s.create);
  const duplicate = usePlaylistStore((s) => s.duplicate);
  const remove = usePlaylistStore((s) => s.remove);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Playlist | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const created = create(name.trim());
    if (!created) {
      setError('Nombre no válido o límite de playlists alcanzado.');
      return;
    }
    setName('');
    setError(null);
  };

  return (
    <div>
      <PageHeader
        title="Playlists locales"
        subtitle="Cada playlist se guarda solo en este navegador. Exporta a JSON para llevarla a otro dispositivo; no hay cuentas ni sincronización."
        actions={<LinkButton to="/import">Importar JSON</LinkButton>}
      />
      {!persisted ? (
        <div className="mb-4">
          <Notice kind="warning">
            No se pudo guardar en el almacenamiento local; los cambios se perderán al cerrar.
          </Notice>
        </div>
      ) : null}
      <form onSubmit={submit} className="ovt-surface mb-6 rounded-lg p-4" noValidate>
        <Field label="Nueva playlist" htmlFor="new-playlist" error={error ?? undefined}>
          <div className="flex gap-2">
            <Input
              id="new-playlist"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              required
            />
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              Crear
            </Button>
          </div>
        </Field>
      </form>
      {playlists.length === 0 ? (
        <EmptyState title="No tienes playlists">
          Crea una arriba o importa un archivo JSON.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {playlists.map((p) => (
            <li
              key={p.id}
              className="ovt-surface flex flex-col gap-2 rounded-lg p-3 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/playlists/${p.id}`}
                  className="block truncate text-base font-medium hover:underline tv:text-2xl"
                >
                  {p.name}
                </Link>
                <p className="ovt-muted text-xs tv:text-base">
                  {p.items.length} elementos
                  {p.updatedAt ? ` · actualizada ${formatDate(p.updatedAt)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <LinkButton to={`/playlists/${p.id}`} variant="primary">
                  Abrir
                </LinkButton>
                <Button onClick={() => duplicate(p.id)}>Duplicar</Button>
                <Button
                  onClick={() => downloadText(`${safeFilename(p.name)}.json`, playlistToJson(p))}
                >
                  Exportar
                </Button>
                <Button variant="ghost" onClick={() => setToDelete(p)}>
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar playlist"
        danger
        confirmLabel="Eliminar"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove(toDelete.id);
          setToDelete(null);
        }}
      >
        Se eliminará «{toDelete?.name}» de este navegador. No se puede deshacer.
      </ConfirmDialog>
    </div>
  );
}
