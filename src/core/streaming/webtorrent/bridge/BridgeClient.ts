import type { WtClient, WtTorrent } from '../types';
import {
  decodeMessage,
  encodeMessage,
  EXTENSION_NAME,
  PROTOCOL_VERSION,
  pairingMagnet,
  type BridgeMessage,
  type BridgeTorrentStatus,
} from './protocol';

/** bittorrent-protocol wire surface used for the extension. */
export interface WireLike {
  use(extension: unknown): void;
  extended(name: string, payload: Uint8Array): void;
  once(event: 'close', listener: () => void): void;
  on?(event: string, listener: (...args: never[]) => void): void;
}

export interface BridgeState {
  code: string | null;
  connected: boolean;
  name?: string;
  torrents: BridgeTorrentStatus[];
  lastError?: string;
  lastSeenAt?: number;
}

type Listener = (state: BridgeState) => void;

/**
 * Browser side of the pairing: joins the rendezvous torrent on the shared
 * WebTorrent client, talks to the bridge over the `ovt_bridge` extension and
 * forwards every magnet the user plays so the bridge fetches it from the
 * classic swarm and seeds it back over WebRTC.
 */
export class BridgeClient {
  private state: BridgeState = { code: null, connected: false, torrents: [] };
  private listeners = new Set<Listener>();
  private wires = new Set<WireLike>();
  private torrent: WtTorrent | null = null;
  private pending = new Set<string>();
  private addedListeners = new Set<(infoHash: string) => void>();
  private reannounceTimer: ReturnType<typeof setInterval> | null = null;

  getState(): BridgeState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<BridgeState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Joins (or re-joins) the rendezvous torrent for `code`. */
  async connect(client: WtClient, code: string, trackers: readonly string[]): Promise<void> {
    await this.disconnect();
    const magnet = await pairingMagnet(code, trackers);
    this.update({ code, connected: false, torrents: [], lastError: undefined });
    const torrent = client.add(magnet, { announce: [...trackers], deselect: true });
    this.torrent = torrent;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the extension class is instantiated by WebTorrent per wire
    const self = this;
    class BrowserBridgeExtension {
      constructor(private readonly wire: WireLike) {
        wire.once('close', () => {
          self.wires.delete(wire);
          if (self.wires.size === 0) self.update({ connected: false });
        });
      }
      onHandshake() {}
      onExtendedHandshake(handshake: { m?: Record<string, unknown> }) {
        if (!handshake?.m || !(EXTENSION_NAME in handshake.m)) return;
        self.wires.add(this.wire);
        self.send(this.wire, { t: 'hello', v: PROTOCOL_VERSION });
        for (const magnet of self.pending) self.send(this.wire, { t: 'add', magnet });
        self.pending.clear();
      }
      onMessage(buffer: Uint8Array) {
        const message = decodeMessage(buffer);
        if (message) self.onMessage(message);
      }
    }
    (BrowserBridgeExtension.prototype as { name?: string }).name = EXTENSION_NAME;
    torrent.on('wire', ((wire: WireLike) => wire.use(BrowserBridgeExtension)) as never);
    // The bridge never offers: while no bridge is connected, re-announce with
    // fresh offers so a bridge started later can answer.
    this.reannounceTimer = setInterval(() => {
      if (this.wires.size === 0) reannounce(this.torrent);
    }, 15_000);
    torrent.on('warning', (() => undefined) as never);
    torrent.on('error', ((err: Error) => this.update({ lastError: err.message })) as never);
  }

  async disconnect(): Promise<void> {
    const torrent = this.torrent;
    this.torrent = null;
    if (this.reannounceTimer) {
      clearInterval(this.reannounceTimer);
      this.reannounceTimer = null;
    }
    this.wires.clear();
    this.pending.clear();
    this.update({ code: null, connected: false, torrents: [], name: undefined });
    await new Promise<void>((resolve) => {
      if (!torrent || torrent.destroyed) return resolve();
      torrent.destroy({ destroyStore: true }, () => resolve());
    });
  }

  private send(wire: WireLike, message: BridgeMessage) {
    try {
      wire.extended(EXTENSION_NAME, encodeMessage(message));
    } catch (err) {
      this.update({ lastError: err instanceof Error ? err.message : String(err) });
    }
  }

  private onMessage(message: BridgeMessage) {
    switch (message.t) {
      case 'hello':
        this.update({ connected: true, name: message.name, lastSeenAt: Date.now() });
        break;
      case 'status':
        this.update({
          connected: true,
          name: message.name ?? this.state.name,
          torrents: message.torrents,
          lastSeenAt: Date.now(),
        });
        break;
      case 'added':
        this.update({ lastSeenAt: Date.now() });
        for (const l of this.addedListeners) l(message.infoHash.toLowerCase());
        break;
      case 'error':
        this.update({ lastError: message.message, lastSeenAt: Date.now() });
        break;
      default:
        break;
    }
  }

  /** Asks the bridge to fetch a magnet. Queued until a bridge is connected. */
  requestMagnet(magnet: string): void {
    if (!this.state.code) return;
    if (this.wires.size === 0) {
      this.pending.add(magnet);
      return;
    }
    for (const wire of this.wires) this.send(wire, { t: 'add', magnet });
  }

  /** Notifies when the bridge has announced a torrent (time to re-offer). */
  onAdded(listener: (infoHash: string) => void): () => void {
    this.addedListeners.add(listener);
    return () => this.addedListeners.delete(listener);
  }

  /** Status of a torrent on the bridge, when known. */
  statusFor(infoHash: string): BridgeTorrentStatus | undefined {
    return this.state.torrents.find((t) => t.infoHash === infoHash.toLowerCase());
  }

  /** Test hook: simulate a message from the bridge. */
  _receive(message: BridgeMessage) {
    this.onMessage(message);
  }
}

export const bridgeClient = new BridgeClient();

/** Re-announces a torrent to its trackers so the browser sends fresh WebRTC offers. */
export function reannounce(torrent: WtTorrent | null): boolean {
  const update = torrent?.discovery?.tracker?.update;
  if (!torrent || torrent.destroyed || typeof update !== 'function') return false;
  try {
    update.call(torrent.discovery!.tracker);
    return true;
  } catch {
    return false;
  }
}
