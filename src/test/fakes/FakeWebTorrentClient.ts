import type {
  ChunkStore,
  WtAddOptions,
  WtBrowserServer,
  WtClient,
  WtFile,
  WtTorrent,
  WtWire,
} from '@/core/streaming/webtorrent/types';

type Listener = (...args: never[]) => void;

class Emitter {
  private map = new Map<string, Set<Listener>>();
  on(event: string, l: Listener) {
    if (!this.map.has(event)) this.map.set(event, new Set());
    this.map.get(event)!.add(l);
  }
  once(event: string, l: Listener) {
    const wrapped: Listener = (...args) => {
      this.removeListener(event, wrapped);
      (l as (...a: unknown[]) => void)(...args);
    };
    this.on(event, wrapped);
  }
  removeListener(event: string, l: Listener) {
    this.map.get(event)?.delete(l);
  }
  emit(event: string, ...args: unknown[]) {
    for (const l of [...(this.map.get(event) ?? [])]) (l as (...a: unknown[]) => void)(...args);
  }
}

export interface FakeTorrentSpec {
  infoHash: string;
  name: string;
  pieceLength: number;
  files: Array<{ name: string; length: number }>;
  /** Resolve `ready` immediately (default true). */
  autoReady?: boolean;
}

export class FakeFile implements WtFile {
  downloaded = 0;
  selected = false;
  priority: number | undefined;
  constructor(
    public name: string,
    public length: number,
    public offset: number,
    private readonly torrent: FakeTorrent,
  ) {}
  get path() {
    return this.name;
  }
  get progress() {
    return this.length ? this.downloaded / this.length : 0;
  }
  get streamURL() {
    return `/webtorrent/${this.torrent.infoHash}/${encodeURIComponent(this.name)}`;
  }
  select(priority?: number) {
    this.selected = true;
    this.priority = priority;
    this.torrent.calls.push(`select:${this.name}`);
  }
  deselect() {
    this.selected = false;
    this.torrent.calls.push(`deselect:${this.name}`);
  }
  content: Uint8Array | null = null;
  async arrayBuffer(): Promise<ArrayBuffer> {
    this.torrent.calls.push(`arrayBuffer:${this.name}`);
    const bytes = this.content ?? new Uint8Array(this.length);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
}

export class FakeTorrent extends Emitter implements WtTorrent {
  infoHash: string;
  name: string;
  length: number;
  pieceLength: number;
  lastPieceLength: number;
  pieces: Array<unknown | null>;
  files: FakeFile[];
  wires: WtWire[] = [];
  downloaded = 0;
  uploaded = 0;
  downloadSpeed = 0;
  uploadSpeed = 0;
  ready = false;
  destroyed = false;
  announce: string[];
  torrentFile: Uint8Array;
  calls: string[] = [];
  critical = (start: number, end: number) => {
    this.calls.push(`critical:${start}-${end}`);
  };
  have = new Set<number>();
  bitfield = { get: (i: number) => this.have.has(i) };
  store: ChunkStore | null = null;
  onDestroy: (() => void) | null = null;

  constructor(spec: FakeTorrentSpec, opts: WtAddOptions) {
    super();
    this.infoHash = spec.infoHash;
    this.name = spec.name;
    this.pieceLength = spec.pieceLength;
    this.announce = opts.announce ?? [];
    this.torrentFile = new TextEncoder().encode(`fake-torrent-file:${spec.infoHash}`);
    let offset = 0;
    this.files = spec.files.map((f) => {
      const file = new FakeFile(f.name, f.length, offset, this);
      offset += f.length;
      return file;
    });
    this.length = offset;
    const count = Math.max(1, Math.ceil(this.length / this.pieceLength));
    this.pieces = new Array(count).fill(null);
    this.lastPieceLength = this.length - (count - 1) * this.pieceLength;
    if (opts.store) this.store = new opts.store(this.pieceLength, {});
  }
  get numPeers() {
    return this.wires.length;
  }
  get progress() {
    return this.length ? this.downloaded / this.length : 0;
  }
  select(start: number, end: number) {
    this.calls.push(`selectRange:${start}-${end}`);
  }
  deselect(start: number, end: number) {
    this.calls.push(`deselectRange:${start}-${end}`);
  }
  destroy(_opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void) {
    this.destroyed = true;
    this.calls.push('destroy');
    this.onDestroy?.();
    if (this.store) this.store.destroy(() => cb?.());
    else cb?.();
  }
  /** Test helpers */
  markReady() {
    this.ready = true;
    this.emit('ready');
  }
  addPeer(havePieces: (i: number) => boolean = () => true) {
    this.wires.push({ peerPieces: { get: havePieces }, downloadSpeed: () => 0 });
  }
  receivePiece(index: number, data = new Uint8Array(this.pieceLength)) {
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        this.have.add(index);
        this.downloaded += data.byteLength;
        resolve();
      };
      if (this.store) this.store.put(index, data, (err) => (err ? reject(err) : done()));
      else done();
    });
  }
}

export class FakeWebTorrentClient extends Emitter implements WtClient {
  torrents: FakeTorrent[] = [];
  /** Every torrent ever added, including destroyed ones. */
  added: FakeTorrent[] = [];
  /** How each add() was identified: magnet URI or bencoded torrent file. */
  addCalls: Array<'magnet' | 'torrentFile'> = [];
  destroyed = false;
  downloadRate = -1;
  uploadRate = -1;
  servers = 0;
  _server?: WtBrowserServer;
  constructor(private readonly specs: Record<string, FakeTorrentSpec>) {
    super();
  }
  add(
    torrentId: string | Uint8Array,
    opts: WtAddOptions = {},
    onTorrent?: (t: WtTorrent) => void,
  ): WtTorrent {
    const id = typeof torrentId === 'string' ? torrentId : new TextDecoder().decode(torrentId);
    this.addCalls.push(typeof torrentId === 'string' ? 'magnet' : 'torrentFile');
    const spec = Object.values(this.specs).find((s) => id.toLowerCase().includes(s.infoHash));
    if (!spec) throw new Error('Torrent desconocido en el cliente falso');
    const t = new FakeTorrent(spec, opts);
    this.torrents.push(t);
    this.added.push(t);
    t.onDestroy = () => {
      this.torrents = this.torrents.filter((x) => x !== t);
    };
    if (spec.autoReady !== false) queueMicrotask(() => t.markReady());
    onTorrent?.(t);
    return t;
  }
  remove(
    torrent: WtTorrent | string,
    _opts?: { destroyStore?: boolean },
    cb?: (err?: Error) => void,
  ) {
    const hash = typeof torrent === 'string' ? torrent : torrent.infoHash;
    this.torrents = this.torrents.filter((t) => t.infoHash !== hash);
    cb?.();
  }
  createServer(_opts: { controller: ServiceWorkerRegistration }): WtBrowserServer {
    this.servers++;
    this._server = { pathname: '/webtorrent', destroy: (cb?: () => void) => cb?.() };
    return this._server;
  }
  throttleDownload(rate: number) {
    this.downloadRate = rate;
  }
  throttleUpload(rate: number) {
    this.uploadRate = rate;
  }
  destroy(cb?: (err?: Error) => void) {
    this.destroyed = true;
    cb?.();
  }
}
