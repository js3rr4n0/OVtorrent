import type {
  HlsConfigLike,
  HlsConstructorLike,
  HlsLevelLike,
  HlsLike,
  HlsTrackLike,
} from '@/core/streaming/hls/types';

type Listener = (event: string, data: never) => void;

export class FakeHlsInstance implements HlsLike {
  levels: HlsLevelLike[] = [];
  currentLevel = -1;
  nextLevel = -1;
  loadLevel = -1;
  startLevel = -1;
  autoLevelEnabled = true;
  autoLevelCapping = -1;
  capLevelToPlayerSize = false;
  audioTracks: HlsTrackLike[] = [];
  audioTrack = -1;
  subtitleTracks: HlsTrackLike[] = [];
  subtitleTrack = -1;
  subtitleDisplay = false;
  bandwidthEstimate = 0;
  calls: string[] = [];
  media: HTMLMediaElement | null = null;
  destroyed = false;
  private listeners = new Map<string, Set<Listener>>();
  constructor(public config: HlsConfigLike = {}) {}
  loadSource(url: string) {
    this.calls.push(`loadSource:${url}`);
  }
  attachMedia(media: HTMLMediaElement) {
    this.media = media;
    this.calls.push('attachMedia');
  }
  detachMedia() {
    this.media = null;
    this.calls.push('detachMedia');
  }
  startLoad(pos?: number) {
    this.calls.push(`startLoad:${pos ?? ''}`);
  }
  stopLoad() {
    this.calls.push('stopLoad');
  }
  recoverMediaError() {
    this.calls.push('recoverMediaError');
  }
  destroy() {
    this.destroyed = true;
    this.calls.push('destroy');
  }
  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }
  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, data?: unknown) {
    for (const l of [...(this.listeners.get(event) ?? [])]) l(event, data as never);
  }
  /** Simulates a parsed manifest. */
  manifest(levels: HlsLevelLike[], audio: HlsTrackLike[] = [], subs: HlsTrackLike[] = []) {
    this.levels = levels;
    this.audioTracks = audio;
    this.subtitleTracks = subs;
    this.audioTrack = audio[0]?.id ?? -1;
    this.emit('hlsManifestParsed', { levels });
  }
}

export function createFakeHls(
  options: { supported?: boolean } = {},
): HlsConstructorLike & { instances: FakeHlsInstance[] } {
  const instances: FakeHlsInstance[] = [];
  const Ctor = function (this: unknown, config?: HlsConfigLike) {
    const inst = new FakeHlsInstance(config);
    instances.push(inst);
    return inst;
  } as unknown as HlsConstructorLike & { instances: FakeHlsInstance[] };
  Ctor.isSupported = () => options.supported ?? true;
  Ctor.Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    ERROR: 'hlsError',
    LEVEL_SWITCHED: 'hlsLevelSwitched',
    AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
    SUBTITLE_TRACKS_UPDATED: 'hlsSubtitleTracksUpdated',
  };
  Ctor.ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };
  Ctor.instances = instances;
  return Ctor;
}
