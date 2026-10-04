import { useMemo, useState } from 'react';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { EmptyState, Input, LinkButton, Notice, PageHeader, Select } from '@/components/ui';
import { formatTime } from '@/components/format';
import { SOURCE_TYPES, type MediaItem } from '@/core/schemas/media';
import { useHistoryStore } from '@/state/historyStore';
import { useLibraryStore } from '@/state/libraryStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { MediaItemRow } from './MediaItemRow';
import { VirtualList } from '@/components/VirtualList';

/** Approximate row height used only when the list is long enough to virtualise. */
const ROW_HEIGHT = 96;

export function LibraryPage() {
  useDocumentTitle('Biblioteca');
  const items = useLibraryStore((s) => s.items);
  const favorites = useLibraryStore((s) => s.favorites);
  const persisted = useLibraryStore((s) => s.persisted);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const remove = useLibraryStore((s) => s.remove);
  const history = useHistoryStore((s) => s.entries);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'favorites' | MediaItem['sourceType']>('all');
  const [toRemove, setToRemove] = useState<MediaItem | null>(null);
  const [toPlaylist, setToPlaylist] = useState<MediaItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (type === 'favorites' && !favorites.includes(i.id)) return false;
      if (type !== 'all' && type !== 'favorites' && i.sourceType !== type) return false;
      if (
        q &&
        !i.title.toLowerCase().includes(q) &&
        !i.tags.some((t) => t.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [items, favorites, query, type]);

  return (
    <div>
      <PageHeader
        title="Biblioteca local"
        subtitle="Todo lo que ves aquí vive únicamente en este navegador. No hay servidor, cuenta ni sincronización."
        actions={
          <LinkButton to="/import" variant="primary">
            Importar fuente
          </LinkButton>
        }
      />
      {!persisted ? (
        <div className="mb-4">
          <Notice kind="warning" title="No se pudo guardar en el navegador">
            El almacenamiento local está lleno o deshabilitado. La biblioteca funcionará solo
            durante esta sesión.
          </Notice>
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <Input
          type="search"
          placeholder="Buscar por título o etiqueta"
          aria-label="Buscar en la biblioteca"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="Filtrar por tipo"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="md:w-56"
        >
          <option value="all">Todos los tipos</option>
          <option value="favorites">Favoritos</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Tu biblioteca está vacía">
          Importa un magnet, un archivo .torrent, un archivo local, una URL o una playlist JSON
          desde la pestaña Importar.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin resultados" />
      ) : (
        <VirtualList
          items={filtered}
          rowHeight={ROW_HEIGHT}
          getKey={(item) => item.id}
          className="flex flex-col gap-2"
          aria-label="Elementos de la biblioteca"
          renderRow={(item) => {
            const h = history.find((e) => e.itemId === item.id);
            return (
              <MediaItemRow
                item={item}
                favorite={favorites.includes(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
                onRemove={() => setToRemove(item)}
                onAddToPlaylist={() => setToPlaylist(item)}
                playTo={`/player/${item.id}`}
                progressLabel={
                  h
                    ? h.completed
                      ? 'Completado'
                      : `Visto hasta ${formatTime(h.positionSeconds)}`
                    : undefined
                }
              />
            );
          }}
        />
      )}
      <ConfirmDialog
        open={toRemove !== null}
        title="Eliminar de la biblioteca"
        danger
        confirmLabel="Eliminar"
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) remove(toRemove.id);
          setToRemove(null);
        }}
      >
        Se eliminará «{toRemove?.title}» de la biblioteca local. Las playlists que lo contengan
        conservan su copia.
      </ConfirmDialog>
      {toPlaylist ? (
        <AddToPlaylistDialog item={toPlaylist} onClose={() => setToPlaylist(null)} />
      ) : null}
    </div>
  );
}
