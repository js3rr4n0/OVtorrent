import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { MediaItem } from '@/core/schemas/media';
import { Badge, Button, LinkButton } from '@/components/ui';
import { SOURCE_LABELS } from '@/components/format';
import { useSessionStore } from '@/state/sessionStore';

export function MediaItemRow({
  item,
  favorite,
  onToggleFavorite,
  onRemove,
  onAddToPlaylist,
  playTo,
  progressLabel,
}: {
  item: MediaItem;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onRemove?: () => void;
  onAddToPlaylist?: () => void;
  playTo: string;
  progressLabel?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const attachedFile = useSessionStore((s) => s.files.get(item.id));
  const attachFile = useSessionStore((s) => s.attachFile);
  const needsFile = item.sourceType === 'file' && !attachedFile;

  return (
    <li className="ovt-surface flex flex-col gap-3 rounded-lg p-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <Link
          to={playTo}
          className="block truncate text-base font-medium hover:underline tv:text-2xl"
        >
          {item.title}
        </Link>
        <div className="ovt-muted mt-1 flex flex-wrap items-center gap-2 text-xs tv:text-base">
          <Badge>{SOURCE_LABELS[item.sourceType] ?? item.sourceType}</Badge>
          {item.qualityLabel ? <Badge tone="ok">{item.qualityLabel}</Badge> : null}
          {item.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {progressLabel ? <span>{progressLabel}</span> : null}
          {needsFile ? <Badge tone="warn">Requiere volver a seleccionar el archivo</Badge> : null}
        </div>
        <p className="ovt-muted mt-1 truncate text-xs" title={item.source}>
          {item.source}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {needsFile ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attachFile(item.id, f);
              }}
            />
            <Button onClick={() => fileInput.current?.click()}>Seleccionar archivo</Button>
          </>
        ) : null}
        <LinkButton to={playTo} variant="primary">
          Reproducir
        </LinkButton>
        {onAddToPlaylist ? <Button onClick={onAddToPlaylist}>A playlist</Button> : null}
        {onToggleFavorite ? (
          <Button
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            {favorite ? '★' : '☆'}
          </Button>
        ) : null}
        {onRemove ? (
          <Button variant="ghost" onClick={onRemove} aria-label={`Eliminar ${item.title}`}>
            Eliminar
          </Button>
        ) : null}
      </div>
    </li>
  );
}
