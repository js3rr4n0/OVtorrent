import type {
  MediaMetadata,
  SessionState,
  StartPlaybackOptions,
  StreamingCapabilities,
  StreamingEngine,
  StreamingMetrics,
  StreamingSession,
  StreamingSource,
} from '@/core/streaming/types';

export interface FakeEngineOptions {
  available?: boolean;
  webrtc?: boolean;
  mediaSource?: boolean;
  failWith?: Error;
  peers?: number;
}

export class FakeStreamingSession implements StreamingSession {
  readonly id = `fake-${Math.random().toString(36).slice(2)}`;
  readonly engine = 'fake';
  state: SessionState = 'idle';
  calls: string[] = [];
  position = 0;
  private listeners = new Set<(s: StreamingSession) => void>();
  constructor(
    private readonly source: StreamingSource,
    private readonly opts: FakeEngineOptions,
  ) {}
  private emit() {
    for (const l of this.listeners) l(this);
  }
  subscribe(l: (s: StreamingSession) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  async metadata(): Promise<MediaMetadata> {
    this.calls.push('metadata');
    return {
      title: this.source.item.title,
      files: [{ index: 0, name: 'video.mp4', length: 1000, isPlayable: true }],
      selectedFileIndex: 0,
    };
  }
  async start(_o: StartPlaybackOptions) {
    this.calls.push('start');
    if (this.opts.failWith) {
      this.state = 'error';
      this.emit();
      throw this.opts.failWith;
    }
    this.state = 'playing';
    this.emit();
  }
  async pause() {
    this.calls.push('pause');
    this.state = 'paused';
    this.emit();
  }
  async seek(p: number) {
    this.calls.push(`seek:${p}`);
    this.position = p;
  }
  async stop() {
    this.calls.push('stop');
    this.state = 'stopped';
    this.emit();
  }
  async destroy() {
    this.calls.push('destroy');
    this.listeners.clear();
  }
  async clearTemporaryData() {
    this.calls.push('clearTemporaryData');
  }
  metrics(): StreamingMetrics {
    return {
      peers: this.opts.peers ?? 3,
      downloadSpeedBps: 1_000_000,
      uploadSpeedBps: 0,
      availability: 1,
      bufferedSeconds: 30,
      bufferedBytes: 4_000_000,
      isBuffering: false,
      warnings: this.opts.peers === 0 ? ['Sin peers disponibles'] : [],
    };
  }
}

export class FakeStreamingEngine implements StreamingEngine {
  readonly name = 'fake';
  sessions: FakeStreamingSession[] = [];
  constructor(private readonly opts: FakeEngineOptions = {}) {}
  async capabilities(): Promise<StreamingCapabilities> {
    return {
      engine: this.name,
      available: this.opts.available ?? true,
      webrtc: this.opts.webrtc ?? true,
      mediaSource: this.opts.mediaSource ?? true,
      limitations: [],
      supportedSourceTypes: ['magnet', 'file', 'url'],
    };
  }
  async createSession(source: StreamingSource) {
    const s = new FakeStreamingSession(source, this.opts);
    this.sessions.push(s);
    return s;
  }
}
