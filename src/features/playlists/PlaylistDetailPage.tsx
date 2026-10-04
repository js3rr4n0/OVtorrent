import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge, Button, EmptyState, Field, Input, LinkButton, PageHeader } from '@/components/ui';
import { SOURCE_LABELS } from '@/components/format';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSessionStore } from '@/state/sessionStore';
import { downloadText, playlistToJson, safeFilename } from './playlistExport';

export function PlaylistDetailPage() {
  const { id = '' } = useParams();
  const playlist = usePlaylistStore((s) => s.playlists.find((p) => p.id === id));
  useDocumentTitle(playlist?.name ?? 'Playlist');
  const updateMeta = usePlaylistStore((s) => s.updateMeta);
  const removeItem = usePlaylistStore((s) => s.removeItem);
  const reorder = usePlaylistStore((s) => s.reorder);
  const remove = usePlaylistStore((s) => s.remove);
  const setQueue = useSessionStore((s) => s.setQueue);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!playlist) {
    return (
      <EmptyState title="Playlist no encontrada">
        <Link to="/playlists" className="underline">
          Volver a playlists
        </Link>
      </EmptyState>
    );
  }

  const playFrom = (itemId: string, shuffle = false) => {
    const items = shuffle ? [...playlist.items].sort(() => Math.random() - 0.5) : playlist.items;
    setQueue(items, playlist.id);
    navigate(`/player/${itemId}?playlist=${playlist.id}${shuffle ? '&shuffle=1' : ''}`);
  };

  return (
    <div>
      <PageHeader
        title={playlist.name}
        subtitle={playlist.description || undefined}
        actions={
          <>
            {playlist.items[0] ? (
              <>
                <Button variant="primary" onClick={() => playFrom(playlist.items[0]!.id)}>
                  Reproducir todo
                </Button>
                <Button
                  onClick={() =>
                    playFrom(
                      playlist.items[Math.floor(Math.random() * playlist.items.length)]!.id,
                      true,
                    )
                  }
                >
                  Aleatorio
                </Button>
              </>
            ) : null}
            <Button
              onClick={() =>
                downloadText(`${safeFilename(playlist.name)}.json`, playlistToJson(playlist))
              }
            >
              Exportar JSON
            </Button>
            <Button onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cerrar edición' : 'Editar'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Eliminar
            </Button>
          </>
        }
      />
      {editing ? (
        <form
          className="ovt-surface mb-6 rounded-lg p-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateMeta(playlist.id, { name: name.trim() || playlist.name, description });
            setEditing(false);
          }}
        >
          <Field label="Nombre" htmlFor="pl-name">
            <Input
              id="pl-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Descripción" htmlFor="pl-desc">
            <Input
              id="pl-desc"
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary">
            Guardar
          </Button>
        </form>
      ) : null}
      {playlist.items.length === 0 ? (
        <EmptyState title="Playlist vacía">
          Añade elementos desde la{' '}
          <Link to="/" className="underline">
            biblioteca
          </Link>{' '}
          con el botón «A playlist».
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Elementos de la playlist">
          {playlist.items.map((item, idx) => (
            <li
              key={item.id}
              className="ovt-surface flex flex-col gap-2 rounded-lg p-3 md:flex-row md:items-center"
            >
              <span className="ovt-muted w-8 text-sm">{idx + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium tv:text-2xl">{item.title}</p>
                <p className="ovt-muted text-xs tv:text-base">
                  <Badge>{SOURCE_LABELS[item.sourceType] ?? item.sourceType}</Badge>{' '}
                  {item.qualityLabel ? <Badge tone="ok">{item.qualityLabel}</Badge> : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => playFrom(item.id)}>
                  Reproducir
                </Button>
                <Button
                  aria-label="Subir"
                  disabled={idx === 0}
                  onClick={() => reorder(playlist.id, idx, idx - 1)}
                >
                  ↑
                </Button>
                <Button
                  aria-label="Bajar"
                  disabled={idx === playlist.items.length - 1}
                  onClick={() => reorder(playlist.id, idx, idx + 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => removeItem(playlist.id, item.id)}
                  aria-label={`Quitar ${item.title}`}
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6">
        <LinkButton to="/playlists">← Todas las playlists</LinkButton>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar playlist"
        danger
        confirmLabel="Eliminar"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove(playlist.id);
          navigate('/playlists');
        }}
      >
        Se eliminará «{playlist.name}» de este navegador.
      </ConfirmDialog>
    </div>
  );
}
