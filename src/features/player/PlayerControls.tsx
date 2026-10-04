import { Button, Select } from '@/components/ui';
import { formatTime } from '@/components/format';

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlayerControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  repeat: RepeatMode;
  shuffle: boolean;
  hasQueue: boolean;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (delta: number) => void;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
  onRate: (r: number) => void;
  onRepeat: (m: RepeatMode) => void;
  onToggleShuffle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onFullscreen: () => void;
  onPip: () => void;
}

export function PlayerControls(p: PlayerControlsProps) {
  return (
    <div className="ovt-surface rounded-lg p-3" aria-label="Controles del reproductor" role="group">
      <div className="flex items-center gap-2">
        <span className="w-14 text-right text-sm tabular-nums tv:text-xl">
          {formatTime(p.currentTime)}
        </span>
        <input
          type="range"
          aria-label="Posición de reproducción"
          className="min-h-12 flex-1"
          min={0}
          max={Number.isFinite(p.duration) && p.duration > 0 ? p.duration : 0}
          step={0.5}
          value={Math.min(p.currentTime, p.duration || 0)}
          onChange={(e) => p.onSeek(Number(e.target.value))}
        />
        <span className="w-14 text-sm tabular-nums tv:text-xl">{formatTime(p.duration)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button onClick={p.onPrev} disabled={!p.hasQueue} aria-label="Anterior">
          ⏮
        </Button>
        <Button onClick={() => p.onSkip(-30)} aria-label="Retroceder 30 segundos">
          −30s
        </Button>
        <Button onClick={() => p.onSkip(-10)} aria-label="Retroceder 10 segundos">
          −10s
        </Button>
        <Button
          variant="primary"
          onClick={p.onTogglePlay}
          aria-label={p.playing ? 'Pausar' : 'Reproducir'}
          autoFocus
          className="min-w-20"
        >
          {p.playing ? '⏸ Pausa' : '▶ Play'}
        </Button>
        <Button onClick={p.onStop} aria-label="Detener">
          ⏹ Stop
        </Button>
        <Button onClick={() => p.onSkip(10)} aria-label="Adelantar 10 segundos">
          +10s
        </Button>
        <Button onClick={() => p.onSkip(30)} aria-label="Adelantar 30 segundos">
          +30s
        </Button>
        <Button onClick={p.onNext} disabled={!p.hasQueue} aria-label="Siguiente">
          ⏭
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          onClick={p.onToggleMute}
          aria-label={p.muted ? 'Activar sonido' : 'Silenciar'}
          aria-pressed={p.muted}
        >
          {p.muted ? '🔇' : '🔊'}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Volumen</span>
          <input
            type="range"
            aria-label="Volumen"
            min={0}
            max={1}
            step={0.05}
            value={p.muted ? 0 : p.volume}
            onChange={(e) => p.onVolume(Number(e.target.value))}
            className="min-h-12 w-28"
          />
        </label>
        <label className="flex items-center gap-1 text-sm">
          Velocidad
          <Select
            aria-label="Velocidad"
            value={String(p.rate)}
            onChange={(e) => p.onRate(Number(e.target.value))}
            className="w-24"
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          Repetir
          <Select
            aria-label="Repetición"
            value={p.repeat}
            onChange={(e) => p.onRepeat(e.target.value as RepeatMode)}
            className="w-32"
          >
            <option value="off">No</option>
            <option value="one">Elemento</option>
            <option value="all">Playlist</option>
          </Select>
        </label>
        <Button onClick={p.onToggleShuffle} aria-pressed={p.shuffle} disabled={!p.hasQueue}>
          🔀 Aleatorio
        </Button>
        <Button
          onClick={p.onFullscreen}
          disabled={!p.fullscreenAvailable}
          aria-label="Pantalla completa"
        >
          ⛶ Pantalla completa
        </Button>
        {p.pipAvailable ? (
          <Button onClick={p.onPip} aria-label="Picture-in-picture">
            ▣ PiP
          </Button>
        ) : null}
      </div>
    </div>
  );
}
