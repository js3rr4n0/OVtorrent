/**
 * Structural types for the subset of the WebTorrent browser API that the
 * engine uses. Declared here (instead of @types/webtorrent, which targets v1)
 * so that fakes in tests implement exactly the same contract.
 */
export interface WtWire {
  peerPieces: { get(index: number): boolean; buffer?: Uint8Array };
  downloadSpeed(): number;
  type?: string;
}

export interface WtFile {
  name: string;
  path: string;
  length: number;
  offset: number;
  downloaded: number;
  progress: number;
  readonly streamURL: string;
  select(priority?: number): void;
  deselect(): void;
  /** Downloads the whole file (used only for small subtitle files). */
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export interface WtTorrent {
  infoHash: string;
  name: string;
  length: number;
  pieceLength: number;
  lastPieceLength: number;
  pieces: Array<unknown | null>;
  files: WtFile[];
  wires: WtWire[];
  numPeers: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ready: boolean;
  destroyed: boolean;
  bitfield?: { get(index: number): boolean; buffer?: Uint8Array } | null;
  announce?: string[];
  /** torrent-discovery instance; `tracker.update()` re-announces with fresh WebRTC offers. */
  discovery?: { tracker?: { update?: () => void } | null } | null;
  select(start: number, end: number, priority?: number, notify?: () => void): void;
  deselect(start: number, end: number): void;
  critical(start: number, end: number): void;
  destroy(opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void;
  on(event: string, listener: (...args: never[]) => void): void;
  once(event: string, listener: (...args: never[]) => void): void;
  removeListener(event: string, listener: (...args: never[]) => void): void;
}

export interface WtAddOptions {
  announce?: string[];
  store?: ChunkStoreConstructor;
  storeCacheSlots?: number;
  strategy?: 'sequential' | 'rarest';
  maxWebConns?: number;
  deselect?: boolean;
  private?: boolean;
  destroyStoreOnDestroy?: boolean;
}

export interface WtClientOptions {
  maxConns?: number;
  tracker?: boolean | { rtcConfig?: RTCConfiguration; announce?: string[] };
  dht?: boolean;
  lsd?: boolean;
  utp?: boolean;
  natUpnp?: boolean;
  natPmp?: boolean;
  webSeeds?: boolean;
  downloadLimit?: number;
  uploadLimit?: number;
}

export interface WtBrowserServer {
  pathname: string;
  destroy(cb?: () => void): void;
}

export interface WtClient {
  torrents: WtTorrent[];
  destroyed: boolean;
  add(
    torrentId: string | Uint8Array,
    opts?: WtAddOptions,
    onTorrent?: (t: WtTorrent) => void,
  ): WtTorrent;
  remove(
    torrent: WtTorrent | string,
    opts?: { destroyStore?: boolean },
    cb?: (err?: Error) => void,
  ): void;
  createServer(opts: { controller: ServiceWorkerRegistration }, force?: 'browser'): WtBrowserServer;
  throttleDownload(rate: number): void;
  throttleUpload(rate: number): void;
  destroy(cb?: (err?: Error) => void): void;
  on(event: string, listener: (...args: never[]) => void): void;
}

export type WebTorrentClientConstructor = new (opts?: WtClientOptions) => WtClient;

/** abstract-chunk-store contract used by WebTorrent for piece storage. */
export interface ChunkStore {
  chunkLength: number;
  put(index: number, buf: Uint8Array, cb: (err?: Error | null) => void): void;
  get(
    index: number,
    opts: { offset?: number; length?: number } | null,
    cb: (err: Error | null, buf?: Uint8Array) => void,
  ): void;
  close(cb: (err?: Error | null) => void): void;
  destroy(cb: (err?: Error | null) => void): void;
}

export type ChunkStoreConstructor = new (
  chunkLength: number,
  opts?: Record<string, unknown>,
) => ChunkStore;
