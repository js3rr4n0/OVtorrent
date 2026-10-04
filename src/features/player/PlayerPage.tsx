import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { Button, EmptyState, Field, Notice, Select } from '@/components/ui';
import { formatBytes, formatTime } from '@/components/format';
import { hasFullscreen, hasPictureInPicture } from '@/core/streaming/capabilities';
import type { MediaItem } from '@/core/schemas/media';
import { useHistoryStore } from '@/state/historyStore';
import { useLibraryStore } from '@/state/libraryStore';
import { usePlaylistStore } from '@/state/playlistStore';
import { useSessionStore } from '@/state/sessionStore';
import { useSettingsStore } from '@/state/settingsStore';
import { PlayerControls, type RepeatMode } from './PlayerControls';
import { PlayerIndicators } from './PlayerIndicators';
import { TrackSelectors } from './TrackSelectors';
import { usePlaybackSession } from './usePlaybackSession';

export function PlayerPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const playlistId = params.get('playlist') ?? undefined;
  const navigate = useNavigate();
  const libraryItem = useLibraryStore((s) => s.items.find((i) => i.id === id));
  const playlist = usePlaylistStore((s) =>
    playlistId ? s.playlists.find((p) => p.id === playlistId) : undefined,
  );
  const queue = useSessionStore((s) => s.queue);
  const attachFile = useSessionStore((s) => s.attachFile);
  const settings = useSettingsStore((s) => s.settings);
  const record = useHistoryStore((s) => s.record);
  const getProgress = useHistoryStore((s) => s.getProgress);

  const items: MediaItem[] = useMemo(() => {
    if (playlist)
      return queue.length > 0 && queue.every((q) => playlist.items.some((i) => i.id === q.id))
        ? queue
        : playlist.items;
    return [];
  }, [playlist, queue]);
  const item = useMemo(
    () => items.find((i) => i.id === id) ?? libraryItem,
    [items, id, libraryItem],
  );
  useDocumentTitle(item?.title ?? 'Reproductor');

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [startAt] = useState(() => {
    if (!settings.player.rememberProgress) return 0;
    const p = getProgress(id);
    return p && !p.completed ? p.positionSeconds : 0;
  });
  const [fileIndex, setFileIndex] = useState<number | undefined>(undefined);
  const playback = usePlaybackSession(item, videoRef, startAt, fileIndex);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(settings.player.defaultVolume);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(settings.player.defaultRate);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [shuffle, setShuffle] = useState(params.get('shuffle') === '1');
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [bufferUsage, setBufferUsage] = useState<
    { bytes: number; limitBytes: number; kind: string } | undefined
  >();
  const fileInput = useRef<HTMLInputElement>(null);

  const index = items.findIndex((i) => i.id === id);
  const hasQueue = items.length > 1;

  const goTo = useCallback(
    (target: MediaItem | undefined) => {
      if (!target) return;
      navigate(`/player/${target.id}?playlist=${playlistId}${shuffle ? '&shuffle=1' : ''}`);
    },
    [navigate, playlistId, shuffle],
  );
  const next = useCallback(() => {
    if (!hasQueue) return;
    if (shuffle) {
      const candidates = items.filter((i) => i.id !== id);
      goTo(candidates[Math.floor(Math.random() * candidates.length)]);
      return;
    }
    const n = items[index + 1] ?? (repeat === 'all' ? items[0] : undefined);
    goTo(n);
  }, [hasQueue, shuffle, items, id, goTo, index, repeat]);
  const prev = useCallback(() => {
    if (!hasQueue) return;
    goTo(items[index - 1] ?? (repeat === 'all' ? items[items.length - 1] : undefined));
  }, [hasQueue, goTo, items, index, repeat]);

  // Video element event wiring (time, duration, play state, ended → next).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      if (item)
        record({
          itemId: item.id,
          title: item.title,
          sourceType: item.sourceType,
          playlistId,
          positionSeconds: v.duration || 0,
          durationSeconds: v.duration || undefined,
          completed: true,
        });
      if (repeat === 'one') {
        v.currentTime = 0;
        void v.play();
      } else if (settings.player.autoplayNext) next();
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
    };
  }, [item, playlistId, record, repeat, next, settings.player.autoplayNext, volume, muted, rate]);

  // Progress persistence every 5 s and on unmount.
  useEffect(() => {
    if (!item || !settings.player.rememberProgress) return;
    const save = () => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.currentTime) || v.currentTime < 1) return;
      record({
        itemId: item.id,
        title: item.title,
        sourceType: item.sourceType,
        playlistId,
        positionSeconds: v.currentTime,
        durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
        completed: false,
      });
    };
    const t = setInterval(save, 5000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [item, playlistId, record, settings.player.rememberProgress]);

  // Buffer usage polling (throttled).
  useEffect(() => {
    const store = playback.bufferStore;
    if (!store) {
      setBufferUsage(undefined);
      return;
    }
    let active = true;
    const tick = async () => {
      const u = await store.getUsage();
      if (active) setBufferUsage({ bytes: u.bytes, limitBytes: u.limitBytes, kind: u.kind });
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [playback.bufferStore]);

  // Keyboard shortcuts on the player container (space, arrows handled by TV mode).
  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'MediaPlayPause') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'MediaTrackNext') next();
    else if (e.key === 'MediaTrackPrevious') prev();
    else if (e.key === 'f') void fullscreen();
    else if (e.key === 'm') setMuted((m) => !m);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };
  const skip = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    void playback.seek(Math.max(0, Math.min(v.duration || Infinity, v.currentTime + delta)));
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      /* unsupported */
    }
  };
  const pip = async () => {
    try {
      const v = videoRef.current as
        (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v?.requestPictureInPicture?.();
    } catch {
      /* unsupported */
    }
  };

  // Quality variants: only items in the same playlist with the same title and a different declared quality.
  const variants = useMemo(
    () =>
      item ? items.filter((i) => i.title === item.title && i.qualityLabel && i.id !== item.id) : [],
    [items, item],
  );

  if (!item) {
    return (
      <EmptyState title="Elemento no encontrado">
        <Link to="/" className="underline">
          Volver a la biblioteca
        </Link>
      </EmptyState>
    );
  }

  const needsFile = item.sourceType === 'file' && playback.state === 'unavailable';
  const tvActive = document.documentElement.classList.contains('tv-mode');
  const hideDiagnostics = settings.tv.hideDiagnostics && tvActive;

  return (
    <div ref={containerRef} onKeyDown={onKey} className="flex flex-col gap-3 bg-[var(--ovt-bg)]">
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-xl font-semibold tv:text-3xl">{item.title}</h1>
        {playlist ? (
          <Link to={`/playlists/${playlist.id}`} className="ovt-muted shrink-0 text-sm underline">
            {playlist.name} ({index + 1}/{items.length})
          </Link>
        ) : null}
      </div>
      <video
        ref={videoRef}
        className="aspect-video w-full rounded-lg"
        playsInline
        preload="metadata"
        crossOrigin={item.sourceType === 'url' ? 'anonymous' : undefined}
      >
        {subtitleUrl ? (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="es"
            label="Subtítulos locales"
            default
          />
        ) : null}
      </video>

      {playback.state === 'unavailable' ? (
        <Notice
          kind="warning"
          title={
            needsFile
              ? 'Selecciona de nuevo el archivo'
              : 'Esta fuente no se puede reproducir todavía'
          }
        >
          <ul className="list-disc pl-5">
            {playback.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {playback.futureNote ? <p className="mt-2">{playback.futureNote}</p> : null}
          {needsFile ? (
            <div className="mt-3">
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
              <Button variant="primary" onClick={() => fileInput.current?.click()}>
                Seleccionar archivo «{item.source}»
              </Button>
            </div>
          ) : null}
        </Notice>
      ) : null}
      {playback.session?.engine === 'webtorrent' && playback.state === 'loading' ? (
        <Notice kind="info">
          <p>
            Conectando con trackers WebSocket y buscando peers compatibles con WebRTC… Puede tardar;
            si la fuente no tiene peers web, no será posible reproducirla.
          </p>
          {playback.metrics?.status ? (
            <p className="mt-1 text-xs tv:text-base">{playback.metrics.status}</p>
          ) : null}
        </Notice>
      ) : null}
      {playback.metrics?.warnings.length ? (
        <Notice kind={playback.state === 'error' ? 'error' : 'warning'}>
          <ul className="list-disc pl-5">
            {playback.metrics.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <PlayerControls
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        muted={muted}
        rate={rate}
        repeat={repeat}
        shuffle={shuffle}
        hasQueue={hasQueue}
        pipAvailable={hasPictureInPicture()}
        fullscreenAvailable={hasFullscreen()}
        onTogglePlay={togglePlay}
        onStop={() => void playback.stop()}
        onSeek={(s) => void playback.seek(s)}
        onSkip={skip}
        onVolume={(v) => {
          setVolume(v);
          setMuted(v === 0);
        }}
        onToggleMute={() => setMuted((m) => !m)}
        onRate={setRate}
        onRepeat={setRepeat}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onNext={next}
        onPrev={prev}
        onFullscreen={() => void fullscreen()}
        onPip={() => void pip()}
        simplified={tvActive && settings.tv.simplifiedPlayer}
        autoFocusPlay={!tvActive || settings.tv.autoFocusPlayer}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {playback.metadata && playback.metadata.files.length > 1 ? (
            <div className="ovt-surface rounded-lg p-3">
              <Field
                label="Archivo dentro del torrent"
                htmlFor="torrent-file"
                hint="Solo se descargan piezas del archivo elegido. Los contenedores marcados como no reproducibles pueden fallar en este navegador."
              >
                <Select
                  id="torrent-file"
                  value={fileIndex ?? playback.metadata.selectedFileIndex}
                  onChange={(e) => setFileIndex(Number(e.target.value))}
                >
                  {playback.metadata.files.map((f) => (
                    <option key={f.index} value={f.index}>
                      {f.name} · {formatBytes(f.length)}
                      {f.isPlayable ? '' : ' · probablemente no reproducible'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <TrackSelectors
            session={playback.session}
            playlistVariants={variants}
            currentItem={item}
            onPlaylistVariant={(target) => goTo(target)}
            onSubtitleUrl={setSubtitleUrl}
          />
        </div>
        {!hideDiagnostics ? (
          <PlayerIndicators
            metrics={playback.metrics}
            engine={playback.session?.engine ?? '—'}
            state={playback.state}
            bufferUsage={bufferUsage}
          />
        ) : null}
      </div>
      <p className="ovt-muted text-xs tv:text-base">
        Posición guardada localmente cada 5 s
        {startAt > 0 ? ` · reanudado desde ${formatTime(startAt)}` : ''}. Al detener o cambiar de
        elemento se liberan la sesión, las URLs de objeto y el búfer temporal (limpiezas ejecutadas
        por seek lejano: {playback.farSeekCount}).
      </p>
    </div>
  );
}
