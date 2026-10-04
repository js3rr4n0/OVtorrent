import type { MediaItem } from '../schemas/media';
import { hasMediaSource, hasWebRTC } from './capabilities';
import { createSessionId } from './sessionId';
import type {
  MediaMetadata,
  SessionState,
  StartPlaybackOptions,
  StreamingCapabilities,
  StreamingEngine,
  StreamingMetrics,
  StreamingSession,
  StreamingSource,
} from './types';
import { StreamingUnavailableError } from './types';

const SUPPORTED: MediaItem['sourceType'][] = ['file', 'url'];

/**
 * Plays local files (via Blob URLs) and user-confirmed direct media URLs with
 * the native HTML5 video element. No P2P here — this engine exists so the
 * player works end-to-end in Phase 1 and as a reference implementation of
 * the StreamingSession contract.
 */
export class HtmlMediaEngine implements StreamingEngine {
  readonly name = 'html5';

  async capabilities(): Promise<StreamingCapabilities> {
    const limitations: string[] = [];
    if (!hasMediaSource()) {
      limitations.push('MediaSource Extensions no disponible: solo reproducción progresiva.');
    }
    return {
      engine: this.name,
      available: typeof HTMLVideoElement === 'function',
      webrtc: hasWebRTC(),
      mediaSource: hasMediaSource(),
      limitations,
      supportedSourceTypes: SUPPORTED,
    };
  }

  async createSession(source: StreamingSource): Promise<StreamingSession> {
    if (!SUPPORTED.includes(source.item.sourceType)) {
      throw new StreamingUnavailableError(
        `El motor HTML5 no reproduce fuentes de tipo "${source.item.sourceType}".`,
      );
    }
    if (source.item.sourceType === 'file' && !source.file) {
      throw new StreamingUnavailableError(
        'Los archivos locales no se guardan en el navegador: vuelve a seleccionar el archivo.',
        [
          'El navegador no permite reabrir un archivo local sin una selección explícita del usuario.',
        ],
      );
    }
    return new HtmlMediaSession(source);
  }
}

class HtmlMediaSession implements StreamingSession {
  readonly id = createSessionId();
  readonly engine = 'html5';
  state: SessionState = 'idle';
  private objectUrl: string | null = null;
  private video: HTMLVideoElement | null = null;
  private listeners = new Set<(s: StreamingSession) => void>();
  private cleanupFns: Array<() => void> = [];
  private isBuffering = false;
  private warnings: string[] = [];

  constructor(private readonly source: StreamingSource) {}

  private emit() {
    for (const l of this.listeners) l(this);
  }

  subscribe(listener: (s: StreamingSession) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async metadata(): Promise<MediaMetadata> {
    const { item, file } = this.source;
    return {
      title: item.title,
      files: [
        {
          index: 0,
          name: file?.name ?? item.source,
          length: file?.size ?? 0,
          isPlayable: true,
        },
      ],
      selectedFileIndex: 0,
      totalBytes: file?.size,
      mimeType: file?.type || undefined,
    };
  }

  async start(options: StartPlaybackOptions): Promise<void> {
    this.state = 'loading';
    this.emit();
    const video = options.videoElement;
    this.video = video;
    const { item, file } = this.source;
    if (file) {
      this.objectUrl = URL.createObjectURL(file);
      video.src = this.objectUrl;
    } else {
      video.src = item.source;
    }
    const onWaiting = () => {
      this.isBuffering = true;
      this.emit();
    };
    const onPlaying = () => {
      this.isBuffering = false;
      this.state = 'playing';
      this.emit();
    };
    const onPause = () => {
      if (this.state !== 'stopped') this.state = 'paused';
      this.emit();
    };
    const onError = () => {
      this.state = 'error';
      this.warnings = [describeMediaError(video.error)];
      this.emit();
    };
    const onCanPlay = () => {
      if (this.state === 'loading') this.state = 'ready';
      this.emit();
    };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    video.addEventListener('canplay', onCanPlay);
    this.cleanupFns.push(() => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      video.removeEventListener('canplay', onCanPlay);
    });
    if (options.startAtSeconds && options.startAtSeconds > 0) {
      const onMeta = () => {
        video.currentTime = options.startAtSeconds ?? 0;
      };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
      this.cleanupFns.push(() => video.removeEventListener('loadedmetadata', onMeta));
    }
    try {
      await video.play();
    } catch (err) {
      // Autoplay policies: the user can press play manually. Not an error.
      this.state = 'ready';
      this.warnings = [
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'El navegador bloqueó la reproducción automática. Pulsa reproducir.'
          : 'No se pudo iniciar la reproducción automáticamente.',
      ];
      this.emit();
    }
  }

  async pause(): Promise<void> {
    this.video?.pause();
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.video) this.video.currentTime = Math.max(0, positionSeconds);
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    await this.clearTemporaryData();
    this.emit();
  }

  async destroy(): Promise<void> {
    await this.stop();
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    this.listeners.clear();
    this.video = null;
  }

  async clearTemporaryData(): Promise<void> {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  metrics(): StreamingMetrics {
    const v = this.video;
    let bufferedSeconds = 0;
    if (v && v.buffered.length > 0) {
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= v.currentTime && v.currentTime <= v.buffered.end(i)) {
          bufferedSeconds = v.buffered.end(i) - v.currentTime;
        }
      }
    }
    return {
      peers: 0,
      downloadSpeedBps: 0,
      uploadSpeedBps: 0,
      availability: Number.NaN,
      bufferedSeconds,
      bufferedBytes: 0,
      isBuffering: this.isBuffering,
      resolution: v && v.videoWidth ? { width: v.videoWidth, height: v.videoHeight } : undefined,
      warnings: this.warnings,
    };
  }
}

export function describeMediaError(error: MediaError | null): string {
  if (!error) return 'Error de reproducción desconocido.';
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'La reproducción fue cancelada.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Error de red al obtener el contenido.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'El navegador no pudo decodificar el contenido (codec no soportado o archivo dañado).';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Formato o fuente no soportada por este navegador. No se realiza conversión automática.';
    default:
      return 'Error de reproducción.';
  }
}
