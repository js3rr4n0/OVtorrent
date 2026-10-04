import { useState } from 'react';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatDate, formatTime, SOURCE_LABELS } from '@/components/format';
import { Badge, Button, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { useHistoryStore } from '@/state/historyStore';
import { useLibraryStore } from '@/state/libraryStore';

export function HistoryPage() {
  useDocumentTitle('Historial');
  const entries = useHistoryStore((s) => s.entries);
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const clear = useHistoryStore((s) => s.clear);
  const library = useLibraryStore((s) => s.items);
  const [confirm, setConfirm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Historial local"
        subtitle="Progreso de reproducción guardado solo en este navegador. Nunca se envía a ningún servicio."
        actions={
          entries.length > 0 ? (
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Borrar historial
            </Button>
          ) : null
        }
      />
      {entries.length === 0 ? (
        <EmptyState title="Todavía no has reproducido nada" />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => {
            const exists = library.some((i) => i.id === e.itemId);
            return (
              <li
                key={e.itemId}
                className="ovt-surface flex flex-col gap-2 rounded-lg p-3 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium tv:text-2xl">{e.title}</p>
                  <p className="ovt-muted text-xs tv:text-base">
                    <Badge>{SOURCE_LABELS[e.sourceType] ?? e.sourceType}</Badge>{' '}
                    {e.completed ? 'Completado' : `Posición ${formatTime(e.positionSeconds)}`}
                    {e.durationSeconds ? ` / ${formatTime(e.durationSeconds)}` : ''} ·{' '}
                    {formatDate(e.lastPlayedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {exists ? (
                    <LinkButton
                      to={`/player/${e.itemId}${e.playlistId ? `?playlist=${e.playlistId}` : ''}`}
                      variant="primary"
                    >
                      Continuar
                    </LinkButton>
                  ) : (
                    <Badge tone="warn">Ya no está en la biblioteca</Badge>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => removeEntry(e.itemId)}
                    aria-label={`Quitar ${e.title} del historial`}
                  >
                    Quitar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirm}
        title="Borrar todo el historial"
        danger
        confirmLabel="Borrar"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clear();
          setConfirm(false);
        }}
      >
        Se eliminará el progreso de reproducción guardado localmente. Esta acción no se puede
        deshacer.
      </ConfirmDialog>
    </div>
  );
}
