import { createBufferStore, MemoryBufferStore, type EphemeralBufferStore } from '../../buffer';
import type { MediaItem } from '../../schemas/media';
import { resolveBufferWindow, type Settings } from '../../schemas/settings';
import { hasRTCDataChannel, hasServiceWorker, hasWebRTC } from '../capabilities';
import { describeMediaError } from '../HtmlMediaEngine';
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
} from '../types';
import { StreamingUnavailableError } from '../types';
import { createEphemeralChunkStoreClass } from './EphemeralChunkStore';
import { getSharedClient, getStreamingRegistration } from './loadWebTorrent';
import { DEFAULT_WEBSOCKET_TRACKERS, normalizeTrackerList } from './trackers';
import type { WtAddOptions, WtBrowserServer, WtClient, WtTorrent } from './types';
import {
  computeWindow,
  isPlayableName,
  pickDefaultFileIndex,
  pieceRangeOf,
  THROTTLED_RATE_BPS,
  UNLIMITED_RATE,
} from './windowPolicy';
import { MAX_SUBTITLE_BYTES, toWebVtt, vttObjectUrl } from '../../subtitles/srtToVtt';
import type { TrackOption } from '../types';

export const NO_PEERS_MESSAGE =
  'Esta fuente no tiene peers compatibles con el transporte web disponible en este navegador.';

export interface WebTorrentEngineDeps {
  getSettings: () => Settings;
  /** Returns the shared client (injected in tests). */
  getClient?: (settings: Settings) => Promise<WtClient>;
  /** Ensures the streaming Service Worker is active and returns its registration. */
  getRegistration?: () => Promise<ServiceWorkerRegistration>;
  createBufferStore?: (settings: Settings) => EphemeralBufferStore;
  now?: () => number;
}

const SUPPORTED: MediaItem['sourceType'][] = ['magnet', 'torrent'];
const METADATA_TIMEOUT_MS = 90_000;

export function trackersFor(settings: Settings): string[] {
  const list = settings.p2p.useDefaultTrackers ? [...DEFAULT_WEBSOCKET_TRACKERS] : [];
  return normalizeTrackerList([...list, ...settings.p2p.customTrackers]);
}

/**
 * Browser-only P2P engine built on WebTorrent (WebRTC DataChannels + WebSocket
 * trackers). It streams the selected file to the <video> element through the
 * Service Worker handler, keeps requests near the playhead (sequential
 * strategy + critical pieces), throttles downloads once the future window is
 * full and restarts the torrent to free memory when the configured limit is
 * exceeded. Nothing is written to disk and everything is dropped on stop.
 */
export class WebTorrentStreamingEngine implements StreamingEngine {
  readonly name = 'webtorrent';
  constructor(private readonly deps: WebTorrentEngineDeps) {}

  async capabilities(): Promise<StreamingCapabilities> {
    const limitations: string[] = [];
    const webrtc = hasWebRTC() && hasRTCDataChannel();
    if (!webrtc)
      limitations.push(
        'Sin WebRTC DataChannels no es posible conectar con peers desde el navegador.',
      );
    if (!hasServiceWorker())
      limitations.push('Sin Service Worker no es posible entregar el stream P2P al reproductor.');
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      limitations.push(
        'Se requiere un contexto seguro (HTTPS o localhost) para WebRTC y Service Worker.',
      );
    }
    limitations.push(
      'Solo se alcanzan peers compatibles con WebRTC/WebTorrent; los peers BitTorrent TCP/UDP tradicionales no son accesibles desde un navegador.',
    );
    return {
      engine: this.name,
      available:
        webrtc && hasServiceWorker() && (typeof window === 'undefined' || window.isSecureContext),
      webrtc,
      mediaSource: false,
      limitations,
      supportedSourceTypes: SUPPORTED,
    };
  }

  async createSession(source: StreamingSource): Promise<StreamingSession> {
    if (!SUPPORTED.includes(source.item.sourceType)) {
      throw new StreamingUnavailableError(
        `El motor WebTorrent no reproduce fuentes de tipo "${source.item.sourceType}".`,
      );
    }
    const caps = await this.capabilities();
    if (!caps.available) {
      throw new StreamingUnavailableError(
        'WebTorrent no está disponible en este navegador.',
        caps.limitations,
      );
    }
    return new WebTorrentSession(source, this.deps);
  }
}

class WebTorrentSession implements StreamingSession {
  readonly id = createSessionId();
  readonly engine = 'webtorrent';
  state: SessionState = 'idle';
  private listeners = new Set<(s: StreamingSession) => void>();
  private client: WtClient | null = null;
  private torrent: WtTorrent | null = null;
  private server: WtBrowserServer | null = null;
  private video: HTMLVideoElement | null = null;
  private bufferStore: EphemeralBufferStore;
  private fileIndex = -1;
  private tick: ReturnType<typeof setInterval> | null = null;
  private throttled = false;
  private warnings = new Map<string, string>();
  private startedAt = 0;
  private restarts = 0;
  private bytesInStore = 0;
  private lastCriticalHead = -1;
  private availabilityCache = { at: 0, value: Number.NaN };
  private cleanupFns: Array<() => void> = [];
  private destroyed = false;
  private readonly settings: Settings;
  private readonly now: () => number;

  constructor(
    private readonly source: StreamingSource,
    private readonly deps: WebTorrentEngineDeps,
  ) {
    this.settings = deps.getSettings();
    this.now = deps.now ?? (() => Date.now());
    // WebTorrent must hold pieces somewhere to play them. Its browser default
    // is the Origin Private File System (disk), which this application never
    // uses: "no-persistence" and "memory" both mean RAM for the session only,
    // "indexeddb" means the ephemeral local database. The store is cleared on
    // stop; the memory limit is enforced by restarting the torrent.
    this.bufferStore = deps.createBufferStore
      ? deps.createBufferStore(this.settings)
      : this.settings.buffer.storeKind === 'indexeddb'
        ? createBufferStore('indexeddb', Number.POSITIVE_INFINITY)
        : new MemoryBufferStore(Number.POSITIVE_INFINITY);
  }

  private emit() {
    for (const l of this.listeners) l(this);
  }

  subscribe(listener: (s: StreamingSession) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private warn(key: string, message: string) {
    if (this.warnings.get(key) === message) return;
    this.warnings.set(key, message);
    this.emit();
  }

  private clearWarning(key: string) {
    if (this.warnings.delete(key)) this.emit();
  }

  private async ensureClient(): Promise<WtClient> {
    if (this.client) return this.client;
    const getClient =
      this.deps.getClient ??
      ((s: Settings) => getSharedClient({ maxConns: s.buffer.maxPeers, webSeeds: true }));
    this.client = await getClient(this.settings);
    this.client.throttleUpload(this.settings.p2p.uploadEnabled ? UNLIMITED_RATE : 0);
    return this.client;
  }

  private addOptions(): WtAddOptions {
    const opts: WtAddOptions = {
      announce: trackersFor(this.settings),
      strategy: 'sequential',
      maxWebConns: this.settings.buffer.maxConcurrentRequests,
      destroyStoreOnDestroy: true,
    };
    opts.store = createEphemeralChunkStoreClass(this.bufferStore, this.id, (_i, bytes) => {
      this.bytesInStore += bytes;
    });
    // IndexedDB benefits from WebTorrent's small LRU in front of it; RAM does not.
    opts.storeCacheSlots = this.bufferStore.kind === 'indexeddb' ? 20 : 0;
    return opts;
  }

  /** Adds the torrent (idempotent) and resolves once metadata is known. */
  private async ensureTorrent(): Promise<WtTorrent> {
    if (this.torrent && !this.torrent.destroyed) return this.torrent;
    const client = await this.ensureClient();
    if (this.state === 'idle') {
      this.state = 'loading';
      this.emit();
    }
    const torrent = await new Promise<WtTorrent>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new StreamingUnavailableError(
            'No se pudieron obtener los metadatos del torrent (sin peers accesibles).',
            [NO_PEERS_MESSAGE],
          ),
        );
      }, METADATA_TIMEOUT_MS);
      const existing = client.torrents.find(
        (t) => !t.destroyed && this.source.item.source.toLowerCase().includes(t.infoHash),
      );
      const t = existing ?? client.add(this.source.item.source, this.addOptions());
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      const onWarning = (err: Error) =>
        this.warn(`warning:${err.message.slice(0, 40)}`, `Aviso del protocolo: ${err.message}`);
      const onReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(t);
      };
      t.on('warning', onWarning as never);
      t.on('error', onError as never);
      this.cleanupFns.push(() => {
        t.removeListener('warning', onWarning as never);
        t.removeListener('error', onError as never);
      });
      if (t.ready) onReady();
      else t.once('ready', onReady);
    });
    this.torrent = torrent;
    if (this.state === 'loading') {
      this.state = 'ready';
      this.emit();
    }
    return torrent;
  }

  async metadata(): Promise<MediaMetadata> {
    const torrent = await this.ensureTorrent();
    const files = torrent.files.map((f, index) => ({
      index,
      name: f.path,
      length: f.length,
      isPlayable: isPlayableName(f.name),
    }));
    const selected = this.fileIndex >= 0 ? this.fileIndex : pickDefaultFileIndex(torrent.files);
    return {
      title: torrent.name || this.source.item.title,
      files,
      selectedFileIndex: selected,
      totalBytes: torrent.length,
    };
  }

  private async ensureServer(client: WtClient): Promise<WtBrowserServer> {
    if (this.server) return this.server;
    const getRegistration = this.deps.getRegistration ?? getStreamingRegistration;
    const registration = await getRegistration();
    // The client keeps one server; reuse it across sessions.
    const existing = (client as unknown as { _server?: WtBrowserServer })._server;
    this.server = existing ?? client.createServer({ controller: registration }, 'browser');
    return this.server;
  }

  async start(options: StartPlaybackOptions): Promise<void> {
    const torrent = await this.ensureTorrent();
    const client = await this.ensureClient();
    await this.ensureServer(client);
    const index =
      options.fileIndex ??
      (this.fileIndex >= 0 ? this.fileIndex : pickDefaultFileIndex(torrent.files));
    const file = torrent.files[index];
    if (!file)
      throw new StreamingUnavailableError('El torrent no contiene el archivo seleccionado.');
    this.fileIndex = index;
    this.video = options.videoElement;
    this.startedAt = this.now();
    this.warnings.clear();

    // Only the chosen file is downloaded; the playhead region is critical.
    torrent.files.forEach((f, i) => (i === index ? f.select(1) : f.deselect()));
    const range = pieceRangeOf(file, torrent.pieceLength);
    torrent.critical(range.start, Math.min(range.end, range.start + 2));

    const video = this.video;
    this.detachVideo();
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
      this.state = 'error';
      this.warn('media', describeMediaError(video.error));
    };
    const onSeeking = () => this.scheduleCritical(true);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    video.addEventListener('seeking', onSeeking);
    this.cleanupFns.push(() => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      video.removeEventListener('seeking', onSeeking);
    });
    if (options.startAtSeconds && options.startAtSeconds > 0) {
      const onMeta = () => {
        video.currentTime = options.startAtSeconds ?? 0;
      };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
      this.cleanupFns.push(() => video.removeEventListener('loadedmetadata', onMeta));
    }
    video.src = file.streamURL;
    this.state = 'ready';
    this.emit();
    this.startTick();
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

  private detachVideo() {
    for (const fn of this.cleanupFns.splice(0)) fn();
  }

  private startTick() {
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => this.onTick(), 1000);
  }

  private onTick() {
    const torrent = this.torrent;
    const video = this.video;
    if (!torrent || torrent.destroyed || !video) return;
    // Peer watchdog.
    const peers = torrent.numPeers;
    if (peers > 0) {
      this.clearWarning('no-peers');
    } else if (
      this.now() - this.startedAt > this.settings.p2p.noPeersTimeoutSeconds * 1000 &&
      !this.hasEnoughForPlayback()
    ) {
      this.warn('no-peers', NO_PEERS_MESSAGE);
    }
    this.scheduleCritical(false);
    this.checkMemoryLimit();
    this.emit();
  }

  private hasEnoughForPlayback(): boolean {
    const file = this.torrent?.files[this.fileIndex];
    return Boolean(file && file.progress >= 0.999);
  }

  private windowState() {
    const torrent = this.torrent;
    const video = this.video;
    const file = torrent?.files[this.fileIndex];
    if (!torrent || !video || !file) return null;
    return computeWindow({
      file,
      pieceLength: torrent.pieceLength,
      positionSeconds: video.currentTime || 0,
      bufferedAheadSeconds: bufferedAhead(video),
      durationSeconds:
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
      fallbackKbps: this.settings.buffer.estimateBitrateKbps,
      window: resolveBufferWindow(this.settings),
      havePiece: (i) => Boolean(torrent.bitfield?.get(i)),
    });
  }

  /** Marks pieces near the playhead as critical and applies window throttling. */
  private scheduleCritical(force: boolean) {
    const torrent = this.torrent;
    const client = this.client;
    const w = this.windowState();
    if (!torrent || torrent.destroyed || !client || !w) return;
    if (force || w.headPiece !== this.lastCriticalHead) {
      this.lastCriticalHead = w.headPiece;
      torrent.critical(w.criticalStart, w.criticalEnd);
    }
    if (w.throttle !== this.throttled) {
      this.throttled = w.throttle;
      client.throttleDownload(w.throttle ? THROTTLED_RATE_BPS : UNLIMITED_RATE);
    }
  }

  private checkMemoryLimit() {
    const torrent = this.torrent;
    if (!torrent || !this.settings.p2p.restartOnMemoryLimit) return;
    if (torrent.downloaded <= this.settings.buffer.memoryLimitBytes) return;
    void this.restartForMemory();
  }

  private restarting = false;
  /** Frees every downloaded piece by recreating the torrent and resuming at the current position. */
  private async restartForMemory() {
    if (this.restarting || !this.video || !this.torrent) return;
    this.restarting = true;
    const position = this.video.currentTime;
    const fileIndex = this.fileIndex;
    const video = this.video;
    this.warn(
      'memory',
      'Límite de memoria alcanzado: se reinicia la sesión P2P desde la posición actual para liberar piezas.',
    );
    try {
      await this.dropTorrent();
      this.restarts++;
      await this.start({
        videoElement: video,
        startAtSeconds: position,
        fileIndex,
        bufferWindow: resolveBufferWindow(this.settings),
      });
    } finally {
      this.restarting = false;
    }
  }

  private dropTorrent(): Promise<void> {
    const torrent = this.torrent;
    this.torrent = null;
    this.lastCriticalHead = -1;
    if (this.client && this.throttled) {
      this.client.throttleDownload(UNLIMITED_RATE);
      this.throttled = false;
    }
    return new Promise((resolve) => {
      if (!torrent || torrent.destroyed) return resolve();
      torrent.destroy({ destroyStore: true }, () => resolve());
    });
  }

  async pause(): Promise<void> {
    this.video?.pause();
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.video) this.video.currentTime = Math.max(0, positionSeconds);
    this.scheduleCritical(true);
  }

  async stop(): Promise<void> {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
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
    if (this.destroyed) return;
    this.destroyed = true;
    await this.stop();
    this.detachVideo();
    this.listeners.clear();
    this.video = null;
  }

  async clearTemporaryData(): Promise<void> {
    if (this.subtitleUrl) {
      URL.revokeObjectURL(this.subtitleUrl);
      this.subtitleUrl = null;
      this.activeSubtitle = null;
    }
    await this.dropTorrent();
    await this.bufferStore.clear();
    this.bytesInStore = 0;
  }

  private subtitleUrl: string | null = null;
  private activeSubtitle: string | null = null;

  /** .srt / .vtt files shipped inside the torrent, downloadable on demand (small files only). */
  subtitleTracks(): TrackOption[] {
    const torrent = this.torrent;
    if (!torrent) return [];
    return torrent.files
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => /\.(srt|vtt)$/i.test(f.name) && f.length <= MAX_SUBTITLE_BYTES)
      .map(({ f, index }) => ({
        id: String(index),
        label: f.name,
        active: this.activeSubtitle === String(index),
        detail: /\.srt$/i.test(f.name) ? 'SRT (convertido localmente a WebVTT)' : 'WebVTT',
      }));
  }

  async selectSubtitleTrack(id: string | null): Promise<string | null> {
    if (this.subtitleUrl) {
      URL.revokeObjectURL(this.subtitleUrl);
      this.subtitleUrl = null;
    }
    this.activeSubtitle = null;
    if (id === null || !this.torrent) return null;
    const file = this.torrent.files[Number(id)];
    if (!file || typeof file.arrayBuffer !== 'function') return null;
    file.select(2);
    const text = new TextDecoder().decode(await file.arrayBuffer());
    const converted = toWebVtt(text);
    if (!converted) {
      this.warn('subtitle', `No se pudo interpretar el archivo de subtítulos ${file.name}.`);
      return null;
    }
    this.clearWarning('subtitle');
    this.subtitleUrl = vttObjectUrl(converted.vtt);
    this.activeSubtitle = id;
    this.emit();
    return this.subtitleUrl;
  }

  private availability(): number {
    const torrent = this.torrent;
    const file = torrent?.files[this.fileIndex];
    if (!torrent || !file) return Number.NaN;
    if (torrent.wires.length === 0 && torrent.downloaded === 0) return Number.NaN;
    if (this.now() - this.availabilityCache.at < 5000) return this.availabilityCache.value;
    const range = pieceRangeOf(file, torrent.pieceLength);
    const total = range.end - range.start + 1;
    // Sample at most 500 pieces to keep the check cheap on TV boxes.
    const step = Math.max(1, Math.floor(total / 500));
    let sampled = 0;
    let available = 0;
    for (let i = range.start; i <= range.end; i += step) {
      sampled++;
      if (torrent.bitfield?.get(i) || torrent.wires.some((w) => w.peerPieces.get(i))) available++;
    }
    const value =
      torrent.wires.length === 0 && available === 0 ? Number.NaN : available / Math.max(1, sampled);
    this.availabilityCache = { at: this.now(), value };
    return value;
  }

  metrics(): StreamingMetrics {
    const torrent = this.torrent;
    const video = this.video;
    const file = torrent?.files[this.fileIndex];
    const bufferedSeconds = video ? bufferedAhead(video) : 0;
    const warnings = [...this.warnings.values()];
    const bps =
      file && video && Number.isFinite(video.duration) && video.duration > 0
        ? (file.length / video.duration) * 8
        : undefined;
    return {
      peers: torrent?.numPeers ?? 0,
      downloadSpeedBps: torrent?.downloadSpeed ?? 0,
      uploadSpeedBps: torrent?.uploadSpeed ?? 0,
      availability: this.availability(),
      bufferedSeconds,
      bufferedBytes: this.bytesInStore,
      isBuffering: Boolean(video && video.readyState < 3 && !video.paused),
      resolution:
        video && video.videoWidth
          ? { width: video.videoWidth, height: video.videoHeight }
          : undefined,
      bitrateKbps: bps ? Math.round(bps / 1000) : undefined,
      warnings:
        this.restarts > 0
          ? [...warnings, `Reinicios por memoria en esta sesión: ${this.restarts}`]
          : warnings,
    };
  }
}

function bufferedAhead(video: HTMLVideoElement): number {
  try {
    for (let i = 0; i < video.buffered.length; i++) {
      if (
        video.buffered.start(i) <= video.currentTime &&
        video.currentTime <= video.buffered.end(i)
      ) {
        return video.buffered.end(i) - video.currentTime;
      }
    }
  } catch {
    /* buffered not available */
  }
  return 0;
}
