import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionCleanup } from '@/core/cleanup/SessionCleanup';
import { createBufferStore, type EphemeralBufferStore } from '@/core/buffer';
import type { MediaItem } from '@/core/schemas/media';
import { resolveBufferWindow } from '@/core/schemas/settings';
import {
  resolveEngine,
  StreamingUnavailableError,
  type StreamingMetrics,
  type StreamingSession,
} from '@/core/streaming';
import { useSettingsStore } from '@/state/settingsStore';
import { useSessionStore } from '@/state/sessionStore';

export interface PlaybackSessionState {
  session: StreamingSession | null;
  metrics: StreamingMetrics | null;
  state: StreamingSession['state'] | 'unavailable';
  reasons: string[];
  futureNote?: string;
  bufferStore: EphemeralBufferStore | null;
  error: string | null;
}

const EMPTY_METRICS: StreamingMetrics = {
  peers: 0,
  downloadSpeedBps: 0,
  uploadSpeedBps: 0,
  availability: Number.NaN,
  bufferedSeconds: 0,
  bufferedBytes: 0,
  isBuffering: false,
  warnings: [],
};

/**
 * Owns the lifecycle of one StreamingSession bound to a <video>. Creates it
 * when the item changes, polls metrics (throttled) and guarantees cleanup
 * on unmount, item change and page lifecycle events.
 */
export function usePlaybackSession(
  item: MediaItem | undefined,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  startAt: number,
) {
  const settings = useSettingsStore((s) => s.settings);
  const file = useSessionStore((s) => (item ? s.files.get(item.id) : undefined));
  const [state, setState] = useState<PlaybackSessionState>({
    session: null,
    metrics: null,
    state: 'idle',
    reasons: [],
    bufferStore: null,
    error: null,
  });
  const sessionRef = useRef<StreamingSession | null>(null);
  const [farSeekCount, setFarSeekCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!item) return;
    const video = videoRef.current;
    if (!video) return;

    const resolution = resolveEngine(item.sourceType);
    if (!resolution.engine) {
      setState({
        session: null,
        metrics: null,
        state: 'unavailable',
        reasons: resolution.reasons,
        futureNote: resolution.futureNote,
        bufferStore: null,
        error: null,
      });
      return;
    }
    const bufferStore = createBufferStore(
      settings.buffer.storeKind,
      settings.buffer.memoryLimitBytes,
    );
    const window = resolveBufferWindow(settings);
    const engine = resolution.engine;
    let unsubscribe: (() => void) | null = null;
    let unregister: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const session = await engine.createSession({ item, file });
        if (cancelled) {
          await session.destroy();
          return;
        }
        sessionRef.current = session;
        unregister = sessionCleanup.register(`session:${session.id}`, async () => {
          await session.clearTemporaryData();
          await bufferStore.clear();
        });
        unsubscribe = session.subscribe((s) => {
          if (!cancelled) setState((prev) => ({ ...prev, state: s.state, metrics: s.metrics() }));
        });
        setState({
          session,
          metrics: EMPTY_METRICS,
          state: 'loading',
          reasons: [],
          bufferStore,
          error: null,
        });
        await session.start({ videoElement: video, startAtSeconds: startAt, bufferWindow: window });
        // Metrics are throttled to one update per second to keep TV boxes responsive.
        timer = setInterval(() => {
          if (!cancelled)
            setState((prev) => ({ ...prev, metrics: session.metrics(), state: session.state }));
        }, 1000);
      } catch (err) {
        if (cancelled) return;
        const reasons = err instanceof StreamingUnavailableError ? err.reasons : [];
        setState({
          session: null,
          metrics: null,
          state: 'unavailable',
          reasons: [err instanceof Error ? err.message : 'No se pudo crear la sesión', ...reasons],
          bufferStore: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      unsubscribe?.();
      unregister?.();
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        void session.destroy();
        void bufferStore.clear();
        void sessionCleanup.run('item-change');
      }
    };
    // `settings` intentionally read once per item: changing buffer settings mid-playback
    // takes effect on the next session rather than restarting the current one.
  }, [item?.id, file, startAt]);

  /** Seeks; a jump beyond the buffer window clears temporary data outside it. */
  const seek = useCallback(
    async (seconds: number) => {
      const session = sessionRef.current;
      const video = videoRef.current;
      if (!session || !video) return;
      const window = resolveBufferWindow(settings);
      const delta = Math.abs(seconds - video.currentTime);
      await session.seek(seconds);
      if (delta > window.aheadSeconds) {
        await state.bufferStore?.removeOutsideWindow({
          sessionId: session.id,
          position: seconds,
          behindSeconds: window.behindSeconds,
          aheadSeconds: window.aheadSeconds,
        });
        await sessionCleanup.run('far-seek');
        setFarSeekCount((c) => c + 1);
      }
    },
    [settings, state.bufferStore, videoRef],
  );

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      await session.stop();
      await state.bufferStore?.clear();
      await sessionCleanup.run('stop');
      setState((prev) => ({ ...prev, state: 'stopped', metrics: session.metrics() }));
    }
  }, [state.bufferStore]);

  return { ...state, seek, stop, farSeekCount };
}
