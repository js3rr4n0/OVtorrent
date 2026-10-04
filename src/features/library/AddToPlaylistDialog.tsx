import { useState } from 'react';
import type { MediaItem } from '@/core/schemas/media';
import { Button, Field, Input, Select } from '@/components/ui';
import { usePlaylistStore } from '@/state/playlistStore';

export function AddToPlaylistDialog({
  item,
  onClose,
}: {
  item: MediaItem | null;
  onClose: () => void;
}) {
  const playlists = usePlaylistStore((s) => s.playlists);
  const addItem = usePlaylistStore((s) => s.addItem);
  const create = usePlaylistStore((s) => s.create);
  const [target, setTarget] = useState<string>(playlists[0]?.id ?? '__new__');
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  if (!item) return null;

  const submit = () => {
    if (target === '__new__') {
      const name = newName.trim();
      if (!name) {
        setMessage('Indica un nombre para la nueva playlist');
        return;
      }
      const created = create(name, '', [item]);
      setMessage(created ? `Añadido a «${created.name}»` : 'No se pudo crear la playlist');
    } else {
      const ok = addItem(target, item);
      setMessage(ok ? 'Añadido a la playlist' : 'La playlist está llena (máx. 500)');
    }
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="atp-title"
        className="ovt-surface w-full max-w-md rounded-lg p-5"
      >
        <h2 id="atp-title" className="text-lg font-semibold">
          Añadir «{item.title}» a una playlist
        </h2>
        <div className="mt-4">
          <Field label="Playlist" htmlFor="atp-select">
            <Select
              id="atp-select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
            >
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.items.length})
                </option>
              ))}
              <option value="__new__">Nueva playlist…</option>
            </Select>
          </Field>
          {target === '__new__' ? (
            <Field label="Nombre de la nueva playlist" htmlFor="atp-name">
              <Input
                id="atp-name"
                value={newName}
                maxLength={200}
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
          ) : null}
          {message ? (
            <p className="text-sm" role="status">
              {message}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>
            Añadir
          </Button>
        </div>
      </div>
    </div>
  );
}
