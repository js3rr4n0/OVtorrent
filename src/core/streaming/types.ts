import type { MediaItem } from '../schemas/media';

export interface StreamingCapabilities {
  engine: string;
  /** True when this engine can run in the current browser. */
  available: boolean;
  webrtc: boolean;
  mediaSource: boolean;
  /** Human-readable reasons why something is unavailable. */
  limitations: string[];
  supportedSourceTypes: MediaItem['sourceType'][];
}

export interface StreamingSource {
  item: MediaItem;
  /** Local File object for `file` sources (never persisted). */
  file?: File;
}

export interface MediaFileInfo {
  index: number;
  name: string;
  length: number;
  isPlayable: boolean;
}

export interface MediaMetadata {
  title: string;
  files: MediaFileInfo[];
  selectedFileIndex: number;
  totalBytes?: number;
  durationSeconds?: number;
  mimeType?: string;
}

export interface StartPlaybackOptions {
  videoElement: HTMLVideoElement;
  /** Start position in seconds. */
  startAtSeconds?: number;
  fileIndex?: number;
  bufferWindow: { initialSeconds: number; aheadSeconds: number; behindSeconds: number };
}

export interface StreamingMetrics {
  peers: number;
  downloadSpeedBps: number;
  uploadSpeedBps: number;
  /** 0..1 fraction of the active file available across known peers (NaN when unknown). */
  availability: number;
  bufferedSeconds: number;
  bufferedBytes: number;
  isBuffering: boolean;
  resolution?: { width: number; height: number };
  bitrateKbps?: number;
  warnings: string[];
}

export type SessionState =
  'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';

/** A selectable rendition declared by the source (HLS variant). */
export interface VariantOption {
  id: string;
  label: string;
  height?: number;
  bitrateKbps?: number;
  codecs?: string;
  active: boolean;
}

/** A selectable audio or subtitle track exposed by the engine. */
export interface TrackOption {
  id: string;
  label: string;
  lang?: string;
  active: boolean;
  detail?: string;
}

export interface StreamingSession {
  readonly id: string;
  readonly engine: string;
  readonly state: SessionState;
  metadata(): Promise<MediaMetadata>;
  start(options: StartPlaybackOptions): Promise<void>;
  pause(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  metrics(): StreamingMetrics;
  clearTemporaryData(): Promise<void>;
  /** Subscribe to state/metric changes. Returns an unsubscribe function. */
  subscribe(listener: (session: StreamingSession) => void): () => void;
  /** Declared renditions (HLS multivariant). `auto` is included when the engine can adapt. Absent when the source has none. */
  variants?(): VariantOption[];
  selectVariant?(id: string): Promise<void>;
  /** Alternative audio tracks when the browser or the engine exposes them. */
  audioTracks?(): TrackOption[];
  selectAudioTrack?(id: string): Promise<void>;
  /** Subtitle tracks provided by the source (HLS tracks, .srt/.vtt inside a torrent). */
  subtitleTracks?(): TrackOption[];
  /**
   * Selects a subtitle track. Resolves to a WebVTT URL the player must attach
   * as a <track>, or null when the engine renders the track itself or the
   * selection was cleared.
   */
  selectSubtitleTrack?(id: string | null): Promise<string | null>;
}

export interface StreamingEngine {
  readonly name: string;
  capabilities(): Promise<StreamingCapabilities>;
  createSession(source: StreamingSource): Promise<StreamingSession>;
}

export class StreamingUnavailableError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[] = [],
  ) {
    super(message);
    this.name = 'StreamingUnavailableError';
  }
}
