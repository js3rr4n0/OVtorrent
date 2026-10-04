import { createBufferStore, MemoryBufferStore, type EphemeralBufferStore } from '../../buffer';
import type { MediaItem } from '../../schemas/media';
import type { Settings } from '../../schemas/settings';
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
import { bridgeClient, reannounce, type BridgeClient } from './bridge/BridgeClient';
import { planBuffer, type EffectiveBufferPlan } from '../../memory/memoryPolicy';
import { parseWorker } from '../../../workers/workerClient';
import type { WorkerJob } from '../../../workers/protocol';
import { getSharedClient, getStreamingRegistration } from './loadWebTorrent';
import {
  DEFAULT_WEBSOCKET_TRACKERS,
  isBrowserUsableTracker,
  normalizeTrackerList,
} from './trackers';
import type { WtAddOptions, WtBrowserServer, WtClient, WtTorrent } from './types';
import {
  computeWindow,
  isPlayableName,
  pickDefaultFileIndex,
  pieceRangeOf,
  UNLIMITED_RATE,
} from './windowPolicy';
import { MAX_SUBTITLE_BYTES, toWebVtt, vttObjectUrl } from '../../subtitles/srtToVtt';
import type { TrackOption } from '../types';

export const NO_PEERS_MESSAGE =
  'Esta fuente no tiene peers compatibles con el transporte web disponible en este navegador.';

/** What the user can actually do when a swarm has no WebRTC peers. Honest: no proxy, no server. */
export const NO_PEERS_GUIDANCE =
  'Un navegador solo puede conectar con peers WebTorrent (WebRTC); los peers BitTorrent clásicos de este torrent no son accesibles. Solución: ejecuta el puente gratuito ovtorrent-bridge en tu PC o NAS (carpeta bridge/ del proyecto) y empareja este navegador con su código en Ajustes → Calidad y búfer → Puente; a partir de ahí basta con pegar el magnet y reproducir. Alternativa: abrir el magnet en un cliente híbrido como WebTorrent Desktop.';

export interface TrackerStatus {
  /** Trackers announced to (WebSocket only). */
  websocket: number;
  /** Trackers that answered at least once. */
  responded: number;
  /** Trackers that failed to connect. */
  failed: string[];
  /** UDP/HTTP trackers from the magnet that a browser cannot use. */
  ignored: number;
}

export interface WebTorrentEngineDeps {
  getSettings: () => Settings;
  /** Returns the shared client (injected in tests). */
  getClient?: (settings: Settings) => Promise<WtClient>;
  /** Ensures the streaming Service Worker is active and returns its registration. */
  getRegistration?: () => Promise<ServiceWorkerRegistration>;
  createBufferStore?: (settings: Settings) => EphemeralBufferStore;
  now?: () => number;
  /** Buffer plan resolver (memory policy by default; injected in tests). */
  planBuffer?: (settings: Settings) => EffectiveBufferPlan;
  /** Bridge client (shared singleton by default; injected in tests). */
  bridge?: BridgeClient;
  /** Availability job runner (worker by default; injected in tests). */
  runAvailability?: (job: AvailabilityJob) => Promise<{ availability: number; sampled: number }>;
}

type AvailabilityJob = Extract<WorkerJob, { kind: 'availability' }>;

/** Serialises a bitfield-like object (`get(i)` or a raw buffer) into MSB-first bytes. */
export function bitfieldBytes(
  source: { get(index: number): boolean; buffer?: Uint8Array } | null | undefined,
  pieceCount: number,
): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(pieceCount / 8));
  if (!source) return bytes;
  if (source.buffer instanceof Uint8Array && source.buffer.length >= bytes.length) {
    bytes.set(source.buffer.subarray(0, bytes.length));
    return bytes;
  }
  for (let i = 0; i < pieceCount; i++) {
    if (source.get(i)) bytes[i >> 3]! |= 0x80 >> (i & 7);
  }
  return bytes;
}

const SUPPORTED: MediaItem['sourceType'][] = ['magnet', 'torrent'];
const METADATA_TIMEOUT_MS = 90_000;
/** Message type understood by public/webtorrent-sw.js. */
export const STREAM_CONFIG_MESSAGE = 'ovtorrent-stream-config';
/** Media errors this soon after a memory restart are retried once by reloading the stream. */
const RESTART_RECOVERY_MS = 15_000;

/**
 * `null` when no warning is due: an AbortError only means the attempt was
 * superseded (the user paused or the stream was reloaded after a restart).
 */
function describeAutoplayError(err: unknown): string | null {
  if (err instanceof Error && err.name === 'AbortError') return null;
  if (err instanceof Error && err.name === 'NotAllowedError')
    return 'El navegador bloqueó la reproducción automática. Pulsa reproducir.';
  const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
  return `No se pudo iniciar la reproducción automáticamente${detail}. Pulsa reproducir.`;
}

/** Counts WebSocket trackers in use and non-browser trackers present in the magnet. */
export function countTrackers(magnet: string, configured: string[]): TrackerStatus {
  let ignored = 0;
  const ws = new Set(configured);
  try {
    const params = new URLSearchParams(magnet.slice(magnet.indexOf('?') + 1));
    for (const tr of params.getAll('tr')) {
      if (isBrowserUsableTracker(tr)) ws.add(tr.trim());
      else ignored++;
    }
  } catch {
    /* ignore */
  }
  return { websocket: ws.size, responded: 0, failed: [], ignored };
}

export function trackersFor(settings: Settings): string[] {
  const list = settings.p2p.useDefaultTrackers ? [...DEFAULT_WEBSOCKET_TRACKERS] : [];
  return normalizeTrackerList([...list, ...settings.p2p.customTrackers]);
}

/**
 * Browser-only P2P engine built on WebTorrent (WebRTC DataChannels + WebSocket
 * trackers). It streams the selected file to the <video> element through the
 * Service Worker handler, selects only the pieces of the current window
 * (sequential strategy + critical pieces, bounded byte ranges for the
 * <video> element) and restarts the torrent in place to free memory when the
 * configured limit is exceeded. Nothing is written to disk and everything is
 * dropped on stop.
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
  private registration: ServiceWorkerRegistration | null = null;
  /** Bencoded metadata kept so a memory restart re-adds the torrent instantly. */
  private torrentFile: Uint8Array | null = null;
  /** Store namespace of the current torrent incarnation (changes on every memory restart). */
  private storeSessionId: string;
  private generation = 0;
  private restartedAt = 0;
  private recoveredAfterRestart = false;
  private rangeBytesSent = 0;
  /** Piece range currently selected for download (the playhead window). */
  private selection: { start: number; end: number } | null = null;
  private warnings = new Map<string, string>();
  private startedAt = 0;
  private restarts = 0;
  private trackerStatus: TrackerStatus = { websocket: 0, responded: 0, failed: [], ignored: 0 };
  private lastReannounceAt = 0;
  private unsubscribeBridge: (() => void) | null = null;
  private announcedOnce = false;
  private bytesInStore = 0;
  private lastCriticalHead = -1;
  private availabilityCache = { at: 0, value: Number.NaN };
  private cleanupFns: Array<() => void> = [];
  /** Torrent-level listeners: survive video re-attachment, cleared when the torrent is dropped. */
  private torrentCleanupFns: Array<() => void> = [];
  private destroyed = false;
  private readonly settings: Settings;
  private readonly plan: EffectiveBufferPlan;
  private readonly now: () => number;

  constructor(
    private readonly source: StreamingSource,
    private readonly deps: WebTorrentEngineDeps,
  ) {
    this.settings = deps.getSettings();
    this.storeSessionId = this.id;
    this.plan = deps.planBuffer ? deps.planBuffer(this.settings) : planBuffer(this.settings);
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

  /** Consolidates protocol noise into a few honest messages. */
  private onProtocolWarning(err: Error) {
    const msg = err.message;
    if (/Unsupported tracker protocol/i.test(msg)) {
      // Expected: UDP/HTTP trackers cannot be used from a browser. Counted once in the status line.
      return;
    }
    const failed = /(?:Error connecting to|Connection error:?)\s*(wss?:\/\/\S+)?/i.exec(msg);
    if (failed) {
      const url = failed[1] ?? 'tracker';
      if (!this.trackerStatus.failed.includes(url)) this.trackerStatus.failed.push(url);
      if (
        this.trackerStatus.websocket > 0 &&
        this.trackerStatus.failed.length >= this.trackerStatus.websocket
      ) {
        this.warn(
          'trackers',
          `Ningún tracker WebSocket responde (${this.trackerStatus.failed.join(', ')}). Sin trackers no es posible descubrir peers web; revisa la conexión o añade otros en Ajustes → Calidad y búfer → P2P.`,
        );
      } else {
        this.emit();
      }
      return;
    }
    this.warn(`warning:${msg.slice(0, 40)}`, `Aviso del protocolo: ${msg}`);
  }

  private bridge(): BridgeClient {
    return this.deps.bridge ?? bridgeClient;
  }

  /**
   * The bridge only answers WebRTC offers, so the browser must offer after
   * the bridge joined the swarm: re-announce now (forced) or every 15 s while
   * the bridge holds the torrent and we still have no peers.
   */
  private reofferToBridge(force: boolean) {
    const torrent = this.torrent;
    if (!torrent || torrent.destroyed) return;
    const state = this.bridge().getState();
    if (!state.code || !state.connected) return;
    if (!force) {
      if (torrent.numPeers > 0 || !this.bridge().statusFor(torrent.infoHash)) return;
      if (this.now() - this.lastReannounceAt < 15_000) return;
    }
    this.lastReannounceAt = this.now();
    if (reannounce(torrent)) this.emit();
  }

  /** Human-readable discovery status shown while connecting. */
  private discoveryStatus(): string {
    const t = this.trackerStatus;
    const peers = this.torrent?.numPeers ?? 0;
    const bridge = this.bridge().getState();
    const parts = [
      `Trackers WebSocket: ${t.websocket} (${t.responded} respondieron${t.failed.length ? `, ${t.failed.length} sin conexión` : ''})`,
    ];
    if (t.ignored > 0)
      parts.push(
        `${t.ignored} trackers UDP/HTTP del magnet ignorados: un navegador no puede usarlos`,
      );
    parts.push(`Peers web: ${peers}`);
    if (bridge.code) {
      if (!bridge.connected)
        parts.push('Puente: emparejando… (¿está en marcha ovtorrent-bridge con el mismo código?)');
      else {
        const hash = /urn:btih:([0-9a-z]{32,40})/i
          .exec(this.source.item.source)?.[1]
          ?.toLowerCase();
        const st = hash ? this.bridge().statusFor(hash) : undefined;
        parts.push(
          st
            ? `Puente ${bridge.name ?? ''}: ${st.done ? 'completado' : `descargando ${Math.round(st.progress * 100)} %`} · peers clásicos ${st.numPeers}`
            : `Puente ${bridge.name ?? ''}: conectado, solicitando el torrent…`,
        );
      }
    }
    return parts.join(' · ');
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
    const generation = this.generation;
    opts.store = createEphemeralChunkStoreClass(
      this.bufferStore,
      this.storeSessionId,
      (_i, bytes) => {
        if (generation === this.generation) this.bytesInStore += bytes;
      },
    );
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
            [NO_PEERS_MESSAGE, NO_PEERS_GUIDANCE, this.discoveryStatus()],
          ),
        );
      }, METADATA_TIMEOUT_MS);
      this.trackerStatus = countTrackers(this.source.item.source, trackersFor(this.settings));
      this.bridge().requestMagnet(this.source.item.source);
      this.unsubscribeBridge?.();
      this.unsubscribeBridge = this.bridge().onAdded((hash) => {
        if (this.torrent && this.torrent.infoHash === hash) this.reofferToBridge(true);
      });
      const existing = client.torrents.find(
        (t) => !t.destroyed && this.source.item.source.toLowerCase().includes(t.infoHash),
      );
      const t =
        existing ?? client.add(this.torrentFile ?? this.source.item.source, this.addOptions());
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      const onWarning = (err: Error) => this.onProtocolWarning(err);
      const onAnnounce = () => {
        if (!this.announcedOnce) this.trackerStatus.responded += 1;
        this.announcedOnce = true;
        this.emit();
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(t);
      };
      t.on('warning', onWarning as never);
      t.on('trackerAnnounce', onAnnounce as never);
      t.on('error', onError as never);
      this.torrentCleanupFns.push(() => {
        t.removeListener('warning', onWarning as never);
        t.removeListener('trackerAnnounce', onAnnounce as never);
        t.removeListener('error', onError as never);
      });
      if (t.ready) onReady();
      else t.once('ready', onReady);
    });
    this.torrent = torrent;
    this.torrentFile = torrent.torrentFile ?? this.torrentFile;
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
    this.registration = registration;
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
    if (this.plan.adjustedReason) this.warnings.set('memory-plan', this.plan.adjustedReason);

    // Nothing is selected by default (WebTorrent would otherwise fetch the
    // whole torrent sequentially, web seeds included); only the playhead
    // window of the chosen file is requested, and it moves with playback.
    torrent.deselect(0, Math.max(0, torrent.pieces.length - 1));
    this.selection = null;
    this.lastCriticalHead = -1;
    this.applyWindow(true, options.startAtSeconds);

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
      // A restart interrupts the stream the element was reading; browsers
      // usually re-request the range on their own, otherwise reload once.
      if (this.now() - this.restartedAt < RESTART_RECOVERY_MS && !this.recoveredAfterRestart) {
        this.recoveredAfterRestart = true;
        void this.reloadVideo(video.currentTime, !video.paused);
        return;
      }
      this.state = 'error';
      this.warn('media', describeMediaError(video.error));
    };
    const onSeeking = () => this.applyWindow(true);
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
    await this.playOrWarn(video);
  }

  private async playOrWarn(video: HTMLVideoElement) {
    try {
      await video.play();
      this.clearWarning('autoplay');
    } catch (err) {
      const message = describeAutoplayError(err);
      if (message) this.warn('autoplay', message);
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
    // Background tabs: keep the download window and memory checks, skip
    // UI-oriented work (metrics emission) to save CPU on TV boxes.
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (hidden) {
      this.applyWindow(false);
      this.checkMemoryLimit();
      return;
    }
    // Peer watchdog.
    const peers = torrent.numPeers;
    if (peers > 0) {
      this.clearWarning('no-peers');
    } else if (
      this.now() - this.startedAt > this.settings.p2p.noPeersTimeoutSeconds * 1000 &&
      !this.hasEnoughForPlayback()
    ) {
      this.warn('no-peers', `${NO_PEERS_MESSAGE} ${NO_PEERS_GUIDANCE}`);
    }
    this.applyWindow(false);
    this.checkMemoryLimit();
    this.reofferToBridge(false);
    this.emit();
  }

  private hasEnoughForPlayback(): boolean {
    const file = this.torrent?.files[this.fileIndex];
    return Boolean(file && file.progress >= 0.999);
  }

  private windowState(positionOverride?: number) {
    const torrent = this.torrent;
    const video = this.video;
    const file = torrent?.files[this.fileIndex];
    if (!torrent || !video || !file) return null;
    return computeWindow({
      file,
      pieceLength: torrent.pieceLength,
      positionSeconds: positionOverride ?? video.currentTime ?? 0,
      durationSeconds:
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
      fallbackKbps: this.settings.buffer.estimateBitrateKbps,
      window: this.plan.window,
      havePiece: (i) => Boolean(torrent.bitfield?.get(i)),
    });
  }

  /**
   * Selects the playhead window [head, keepEnd] (deselecting the previous
   * one), marks the first seconds critical and tells the Service Worker how
   * large the byte ranges served to the <video> element may be.
   */
  private applyWindow(force: boolean, positionOverride?: number) {
    const torrent = this.torrent;
    const w = this.windowState(positionOverride);
    if (!torrent || torrent.destroyed || !w) return;
    if (force || w.headPiece !== this.lastCriticalHead) {
      this.lastCriticalHead = w.headPiece;
      const next = { start: w.headPiece, end: Math.max(w.headPiece, w.keepEnd) };
      const prev = this.selection;
      if (prev && (prev.start !== next.start || prev.end !== next.end))
        torrent.deselect(prev.start, prev.end);
      if (!prev || prev.start !== next.start || prev.end !== next.end)
        torrent.select(next.start, next.end, 1);
      this.selection = next;
      torrent.critical(w.criticalStart, w.criticalEnd);
    }
    this.sendRangeConfig(w.rangeBytes);
  }

  /** The streaming handler bounds open-ended range requests to this many bytes. */
  private sendRangeConfig(rangeBytes: number) {
    if (rangeBytes === this.rangeBytesSent) return;
    const worker = this.registration?.active;
    if (!worker || typeof worker.postMessage !== 'function') return;
    worker.postMessage({ type: STREAM_CONFIG_MESSAGE, rangeBytes });
    this.rangeBytesSent = rangeBytes;
  }

  private checkMemoryLimit() {
    const torrent = this.torrent;
    if (!torrent || !this.settings.p2p.restartOnMemoryLimit) return;
    if (this.bytesInStore <= this.plan.memoryLimitBytes) return;
    void this.restartForMemory();
  }

  private restarting = false;
  /**
   * Frees every downloaded piece by replacing the torrent in place: the old
   * one is destroyed (removed from the client synchronously) and the new one
   * is added from the cached metadata right away, so the Service Worker keeps
   * finding the torrent. The <video> element is left alone — it keeps playing
   * from its own buffer and re-requests ranges as needed — unless it already
   * failed, in which case it is reloaded at the same position.
   */
  private async restartForMemory() {
    const video = this.video;
    const old = this.torrent;
    if (this.restarting || !video || !old) return;
    this.restarting = true;
    const position = video.currentTime;
    const wasPlaying = !video.paused && !video.ended;
    this.warn(
      'memory',
      'Límite de memoria alcanzado: se reinicia la sesión P2P desde la posición actual para liberar piezas.',
    );
    try {
      const oldStore = this.bufferStore;
      const oldSession = this.storeSessionId;
      this.generation += 1;
      this.storeSessionId = `${this.id}#${this.generation}`;
      this.bytesInStore = 0;
      this.restarts += 1;
      this.restartedAt = this.now();
      this.recoveredAfterRestart = false;
      this.selection = null;
      this.lastCriticalHead = -1;
      this.torrent = null;
      for (const fn of this.torrentCleanupFns.splice(0)) fn();
      this.unsubscribeBridge?.();
      this.unsubscribeBridge = null;
      this.announcedOnce = false;
      // The old pieces live in their own store namespace: they are released
      // once the torrent is gone without touching what the new one writes.
      const released = new Promise<void>((resolve) =>
        old.destroy({ destroyStore: false }, () => resolve()),
      );
      void released.then(() => oldStore.clearSession(oldSession));
      await this.ensureTorrent();
      this.applyWindow(true, position);
      this.emit();
      if (video.error || video.readyState === 0) await this.reloadVideo(position, wasPlaying);
    } finally {
      this.restarting = false;
    }
  }

  /** Points the element at the stream again and resumes at `position`. */
  private async reloadVideo(position: number, play: boolean) {
    const video = this.video;
    const file = this.torrent?.files[this.fileIndex];
    if (!video || !file) return;
    const onMeta = () => {
      video.currentTime = position;
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    this.cleanupFns.push(() => video.removeEventListener('loadedmetadata', onMeta));
    video.src = file.streamURL;
    this.emit();
    if (play) await this.playOrWarn(video);
  }

  private dropTorrent(): Promise<void> {
    const torrent = this.torrent;
    this.torrent = null;
    for (const fn of this.torrentCleanupFns.splice(0)) fn();
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = null;
    this.announcedOnce = false;
    this.lastCriticalHead = -1;
    this.selection = null;
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
    this.applyWindow(true, Math.max(0, positionSeconds));
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

  private availabilityPending = false;

  /**
   * Availability of the active file across known peers. The bitfields are
   * copied and handed to the parsing/metrics worker (main-thread fallback)
   * so TV boxes never scan thousands of pieces on the UI thread; the value is
   * refreshed at most every 5 s and reported from the cache in between.
   */
  private availability(): number {
    const torrent = this.torrent;
    const file = torrent?.files[this.fileIndex];
    if (!torrent || !file) return Number.NaN;
    if (torrent.wires.length === 0 && torrent.downloaded === 0) return Number.NaN;
    if (this.now() - this.availabilityCache.at < 5000 || this.availabilityPending) {
      return this.availabilityCache.value;
    }
    const range = pieceRangeOf(file, torrent.pieceLength);
    const have = bitfieldBytes(torrent.bitfield, torrent.pieces.length);
    const peers = torrent.wires.map((w) => bitfieldBytes(w.peerPieces, torrent.pieces.length));
    this.availabilityPending = true;
    const run = this.deps.runAvailability ?? ((job: AvailabilityJob) => parseWorker.run(job));
    run({ kind: 'availability', have, peers, start: range.start, end: range.end, maxSamples: 500 })
      .then((r) => {
        this.availabilityCache = { at: this.now(), value: r.availability };
      })
      .catch(() => {
        this.availabilityCache = { at: this.now(), value: Number.NaN };
      })
      .finally(() => {
        this.availabilityPending = false;
      });
    return this.availabilityCache.value;
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
      status: this.discoveryStatus(),
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
