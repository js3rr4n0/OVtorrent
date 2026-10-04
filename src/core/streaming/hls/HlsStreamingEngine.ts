import type { MediaItem } from '../../schemas/media';
import { resolveBufferWindow, type Settings } from '../../schemas/settings';
import { hasManagedMediaSource, hasMseForHls, hasNativeHls } from '../capabilities';
import { describeMediaError, readAudioTracks, selectAudioTrack } from '../HtmlMediaEngine';
import { createSessionId } from '../sessionId';
import type {
  MediaMetadata,
  SessionState,
  StartPlaybackOptions,
  StreamingCapabilities,
  StreamingEngine,
  StreamingMetrics,
  StreamingSession,
  StreamingSource,
  TrackOption,
  VariantOption,
} from '../types';
import { StreamingUnavailableError } from '../types';
import { loadHls } from './loadHls';
import { autoLevelCap, hlsConfigFor, levelLabel, startLevelFor } from './qualityPolicy';
import type { HlsConstructorLike, HlsErrorData, HlsLike } from './types';

export interface HlsEngineDeps {
  getSettings: () => Settings;
  /** Injected in tests; defaults to the lazy hls.js import. */
  loadHls?: () => Promise<HlsConstructorLike>;
  /** Force a transport (tests / diagnostics). */
  mode?: 'native' | 'mse';
}

const SUPPORTED: MediaItem['sourceType'][] = ['hls'];

/**
 * HLS playback. Uses the browser's native support when it exists (Safari,
 * some TV browsers) and hls.js over MediaSource Extensions otherwise. Only
 * variants declared by the playlist can be selected: there is no transcoding.
 */
export class HlsStreamingEngine implements StreamingEngine {
  readonly name = 'hls';
  constructor(private readonly deps: HlsEngineDeps) {}

  mode(): 'native' | 'mse' | 'none' {
    if (this.deps.mode) return this.deps.mode;
    if (hasNativeHls()) return 'native';
    if (hasMseForHls()) return 'mse';
    return 'none';
  }

  async capabilities(): Promise<StreamingCapabilities> {
    const mode = this.mode();
    const limitations: string[] = [];
    if (mode === 'none') {
      limitations.push(
        'Este navegador no reproduce HLS de forma nativa ni expone MediaSource Extensions para hls.js.',
      );
    }
    if (mode === 'native') {
      limitations.push(
        'HLS nativo: la selección de variante la decide el navegador; los controles de calidad solo informan.',
      );
    }
    limitations.push(
      'El servidor HLS debe permitir CORS; las listas protegidas con DRM no son compatibles.',
    );
    return {
      engine: this.name,
      available: mode !== 'none',
      webrtc: false,
      mediaSource: mode === 'mse',
      limitations,
      supportedSourceTypes: SUPPORTED,
    };
  }

  async createSession(source: StreamingSource): Promise<StreamingSession> {
    if (!SUPPORTED.includes(source.item.sourceType)) {
      throw new StreamingUnavailableError(
        `El motor HLS no reproduce fuentes de tipo "${source.item.sourceType}".`,
      );
    }
    const mode = this.mode();
    if (mode === 'none') {
      throw new StreamingUnavailableError(
        'HLS no está disponible en este navegador.',
        (await this.capabilities()).limitations,
      );
    }
    return new HlsSession(source, mode, this.deps);
  }
}

class HlsSession implements StreamingSession {
  readonly id = createSessionId();
  readonly engine = 'hls';
  state: SessionState = 'idle';
  private listeners = new Set<(s: StreamingSession) => void>();
  private video: HTMLVideoElement | null = null;
  private hls: HlsLike | null = null;
  private warnings = new Map<string, string>();
  private cleanupFns: Array<() => void> = [];
  private readonly settings: Settings;
  private manualLevel: number | null = null;
  private recoveries = 0;

  constructor(
    private readonly source: StreamingSource,
    private readonly mode: 'native' | 'mse',
    private readonly deps: HlsEngineDeps,
  ) {
    this.settings = deps.getSettings();
  }

  private emit() {
    for (const l of this.listeners) l(this);
  }
  subscribe(listener: (s: StreamingSession) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private warn(key: string, message: string) {
    this.warnings.set(key, message);
    this.emit();
  }

  async metadata(): Promise<MediaMetadata> {
    return {
      title: this.source.item.title,
      files: [{ index: 0, name: this.source.item.source, length: 0, isPlayable: true }],
      selectedFileIndex: 0,
      mimeType: 'application/vnd.apple.mpegurl',
    };
  }

  async start(options: StartPlaybackOptions): Promise<void> {
    const video = options.videoElement;
    this.video = video;
    this.state = 'loading';
    this.emit();
    this.detach();
    const onWaiting = () => this.emit();
    const onPlaying = () => {
      this.state = 'playing';
      this.emit();
    };
    const onPause = () => {
      if (this.state !== 'stopped') this.state = 'paused';
      this.emit();
    };
    const onError = () => {
      if (this.mode === 'native') {
        this.state = 'error';
        this.warn('media', describeMediaError(video.error));
      }
    };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    this.cleanupFns.push(() => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
    });

    if (this.mode === 'native') {
      video.src = this.source.item.source;
      if (options.startAtSeconds && options.startAtSeconds > 0) {
        const onMeta = () => {
          video.currentTime = options.startAtSeconds ?? 0;
        };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
        this.cleanupFns.push(() => video.removeEventListener('loadedmetadata', onMeta));
      }
    } else {
      await this.startWithHlsJs(video, options.startAtSeconds ?? 0);
    }
    this.state = 'ready';
    this.emit();
    try {
      await video.play();
    } catch (err) {
      this.warn(
        'autoplay',
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'El navegador bloqueó la reproducción automática. Pulsa reproducir.'
          : 'No se pudo iniciar la reproducción automáticamente.',
      );
    }
  }

  private async startWithHlsJs(video: HTMLVideoElement, startAt: number) {
    const Hls = await (this.deps.loadHls ?? loadHls)();
    if (!Hls.isSupported()) {
      throw new StreamingUnavailableError(
        'hls.js no es compatible con este navegador (MediaSource no utilizable).',
      );
    }
    const window = resolveBufferWindow(this.settings);
    const hls = new Hls(hlsConfigFor(window, this.settings.quality, hasManagedMediaSource()));
    this.hls = hls;
    const onManifest = () => {
      const levels = hls.levels;
      hls.autoLevelCapping = autoLevelCap(levels, this.settings.quality);
      const start = startLevelFor(levels, this.settings.quality);
      if (start >= 0) hls.startLevel = start;
      this.emit();
    };
    const onError = (_e: string, data: HlsErrorData) => {
      if (!data.fatal) {
        if (data.details === 'bufferStalledError') return; // routine stall, hls.js recovers
        this.warn(`hls:${data.details}`, `Aviso HLS: ${data.details}`);
        return;
      }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (this.recoveries < 3) {
          this.recoveries++;
          this.warn(
            'hls-net',
            `Error de red HLS (${data.details}); reintentando (${this.recoveries}/3).`,
          );
          hls.startLoad();
          return;
        }
        this.state = 'error';
        this.warn(
          'hls-fatal',
          `Error de red HLS: ${data.details}. Comprueba la URL y que el servidor permita CORS.`,
        );
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        if (this.recoveries < 3) {
          this.recoveries++;
          this.warn(
            'hls-media',
            `Error de decodificación (${data.details}); intentando recuperar.`,
          );
          hls.recoverMediaError();
          return;
        }
        this.state = 'error';
        this.warn(
          'hls-fatal',
          `El navegador no pudo decodificar el contenido HLS (${data.details}). No hay conversión automática.`,
        );
      } else {
        this.state = 'error';
        this.warn('hls-fatal', `Error HLS irrecuperable: ${data.details}`);
      }
    };
    const onLevel = () => this.emit();
    hls.on(Hls.Events.MANIFEST_PARSED, onManifest as never);
    hls.on(Hls.Events.ERROR, onError as never);
    hls.on(Hls.Events.LEVEL_SWITCHED, onLevel as never);
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, onLevel as never);
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, onLevel as never);
    this.cleanupFns.push(() => {
      hls.off(Hls.Events.MANIFEST_PARSED, onManifest as never);
      hls.off(Hls.Events.ERROR, onError as never);
      hls.off(Hls.Events.LEVEL_SWITCHED, onLevel as never);
      hls.off(Hls.Events.AUDIO_TRACKS_UPDATED, onLevel as never);
      hls.off(Hls.Events.SUBTITLE_TRACKS_UPDATED, onLevel as never);
    });
    hls.subtitleDisplay = true;
    hls.attachMedia(video);
    hls.loadSource(this.source.item.source);
    if (startAt > 0) {
      hls.startLoad(startAt);
    }
  }

  private detach() {
    for (const fn of this.cleanupFns.splice(0)) fn();
  }

  variants(): VariantOption[] {
    const hls = this.hls;
    if (!hls || hls.levels.length === 0) return [];
    const auto: VariantOption = {
      id: 'auto',
      label: `Auto${hls.autoLevelEnabled && hls.currentLevel >= 0 ? ` (${levelLabel(hls.levels[hls.currentLevel]!)})` : ''}`,
      active: this.manualLevel === null,
    };
    const list = hls.levels.map((l, i) => ({
      id: String(i),
      label: levelLabel(l),
      height: l.height || undefined,
      bitrateKbps: l.bitrate ? Math.round(l.bitrate / 1000) : undefined,
      codecs: l.codecSet,
      active: this.manualLevel === i,
    }));
    return [auto, ...list];
  }

  async selectVariant(id: string): Promise<void> {
    const hls = this.hls;
    if (!hls) return;
    if (id === 'auto') {
      this.manualLevel = null;
      hls.currentLevel = -1;
    } else {
      const index = Number(id);
      if (!hls.levels[index]) return;
      this.manualLevel = index;
      hls.currentLevel = index;
    }
    this.emit();
  }

  audioTracks(): TrackOption[] {
    const hls = this.hls;
    if (hls) {
      if (hls.audioTracks.length <= 1) return [];
      return hls.audioTracks.map((t) => ({
        id: String(t.id),
        label: t.name || t.lang || `Pista ${t.id + 1}`,
        lang: t.lang,
        active: hls.audioTrack === t.id,
      }));
    }
    return readAudioTracks(this.video);
  }

  async selectAudioTrack(id: string): Promise<void> {
    if (this.hls) this.hls.audioTrack = Number(id);
    else selectAudioTrack(this.video, id);
    this.emit();
  }

  subtitleTracks(): TrackOption[] {
    const hls = this.hls;
    if (!hls || hls.subtitleTracks.length === 0) return [];
    return hls.subtitleTracks.map((t) => ({
      id: String(t.id),
      label: t.name || t.lang || `Subtítulos ${t.id + 1}`,
      lang: t.lang,
      active: hls.subtitleTrack === t.id,
      detail: 'HLS',
    }));
  }

  async selectSubtitleTrack(id: string | null): Promise<string | null> {
    if (this.hls) {
      this.hls.subtitleTrack = id === null ? -1 : Number(id);
      this.hls.subtitleDisplay = id !== null;
      this.emit();
    }
    return null;
  }

  async pause(): Promise<void> {
    this.video?.pause();
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.video) this.video.currentTime = Math.max(0, positionSeconds);
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.hls) {
      this.hls.stopLoad();
      this.hls.detachMedia();
      this.hls.destroy();
      this.hls = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.emit();
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.detach();
    this.listeners.clear();
    this.video = null;
  }

  async clearTemporaryData(): Promise<void> {
    // hls.js keeps its buffers inside the MediaSource of the <video>; stopping releases them.
    if (this.hls) {
      this.hls.stopLoad();
    }
  }

  metrics(): StreamingMetrics {
    const v = this.video;
    const hls = this.hls;
    let bufferedSeconds = 0;
    if (v && v.buffered.length > 0) {
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= v.currentTime && v.currentTime <= v.buffered.end(i)) {
          bufferedSeconds = v.buffered.end(i) - v.currentTime;
        }
      }
    }
    const level = hls && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : undefined;
    return {
      peers: 0,
      downloadSpeedBps: hls ? Math.round(hls.bandwidthEstimate / 8) : 0,
      uploadSpeedBps: 0,
      availability: Number.NaN,
      bufferedSeconds,
      bufferedBytes: 0,
      isBuffering: Boolean(v && v.readyState < 3 && !v.paused),
      resolution:
        v && v.videoWidth
          ? { width: v.videoWidth, height: v.videoHeight }
          : level
            ? { width: level.width, height: level.height }
            : undefined,
      bitrateKbps: level?.bitrate ? Math.round(level.bitrate / 1000) : undefined,
      warnings: [...this.warnings.values()],
    };
  }
}
