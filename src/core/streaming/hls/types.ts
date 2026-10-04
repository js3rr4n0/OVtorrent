/** Structural subset of the hls.js API used by the HLS engine (also implemented by the test fake). */
export interface HlsLevelLike {
  height: number;
  width: number;
  bitrate: number;
  name?: string;
  codecSet?: string;
  videoCodec?: string;
  audioCodec?: string;
}

export interface HlsTrackLike {
  id: number;
  name: string;
  lang?: string;
  default?: boolean;
}

export interface HlsErrorData {
  type: string;
  details: string;
  fatal: boolean;
  reason?: string;
  response?: { code?: number };
}

export interface HlsLike {
  levels: HlsLevelLike[];
  currentLevel: number;
  nextLevel: number;
  loadLevel: number;
  startLevel: number;
  autoLevelEnabled: boolean;
  autoLevelCapping: number;
  capLevelToPlayerSize: boolean;
  audioTracks: HlsTrackLike[];
  audioTrack: number;
  subtitleTracks: HlsTrackLike[];
  subtitleTrack: number;
  subtitleDisplay: boolean;
  bandwidthEstimate: number;
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  detachMedia(): void;
  startLoad(startPosition?: number): void;
  stopLoad(): void;
  recoverMediaError(): void;
  destroy(): void;
  on(event: string, listener: (event: string, data: never) => void): void;
  off(event: string, listener: (event: string, data: never) => void): void;
}

export interface HlsConfigLike {
  maxBufferLength?: number;
  maxMaxBufferLength?: number;
  backBufferLength?: number;
  startLevel?: number;
  capLevelToPlayerSize?: boolean;
  enableWorker?: boolean;
  preferManagedMediaSource?: boolean;
  lowLatencyMode?: boolean;
}

export interface HlsConstructorLike {
  new (config?: HlsConfigLike): HlsLike;
  isSupported(): boolean;
  Events: {
    MANIFEST_PARSED: string;
    ERROR: string;
    LEVEL_SWITCHED: string;
    AUDIO_TRACKS_UPDATED: string;
    SUBTITLE_TRACKS_UPDATED: string;
  };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string; OTHER_ERROR?: string };
}
