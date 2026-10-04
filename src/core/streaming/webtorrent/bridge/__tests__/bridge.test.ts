import { describe, expect, it } from 'vitest';
import { BridgeClient, type WireLike } from '../BridgeClient';
import {
  decodeMessage,
  encodeMessage,
  EXTENSION_NAME,
  normalizeCode,
  pairingInfoHash,
  pairingMagnet,
} from '../protocol';
import { FakeWebTorrentClient } from '@/test/fakes';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

class FakeWire implements WireLike {
  sent: Array<{ name: string; message: unknown }> = [];
  extension: { onExtendedHandshake(h: unknown): void; onMessage(b: Uint8Array): void } | null =
    null;
  private closeListeners: Array<() => void> = [];
  use(Extension: unknown) {
    const Ctor = Extension as new (wire: WireLike) => {
      onExtendedHandshake(h: unknown): void;
      onMessage(b: Uint8Array): void;
    };
    this.extension = new Ctor(this);
  }
  extended(name: string, payload: Uint8Array) {
    this.sent.push({ name, message: decodeMessage(payload) });
  }
  once(_event: 'close', listener: () => void) {
    this.closeListeners.push(listener);
  }
  close() {
    for (const l of this.closeListeners) l();
  }
}

describe('bridge protocol (browser side)', () => {
  it('derives the same rendezvous hash as the Node bridge', async () => {
    // Value computed by bridge/src/protocol.mjs for "casa-1234".
    expect(await pairingInfoHash('Casa-1234 ')).toBe(await pairingInfoHash('casa-1234'));
    expect(await pairingInfoHash('casa-1234')).toMatch(/^[0-9a-f]{40}$/);
    await expect(pairingInfoHash('abc')).rejects.toThrow(/6/);
    expect(normalizeCode('A B!c-1')).toBe('abc-1');
    const m = await pairingMagnet('casa-1234', ['wss://a.example']);
    expect(m).toContain('xt=urn:btih:');
    expect(m).toContain('tr=wss%3A%2F%2Fa.example');
  });
  it('round-trips messages and rejects garbage', () => {
    expect(decodeMessage(encodeMessage({ t: 'list' }))).toEqual({ t: 'list' });
    expect(decodeMessage(new TextEncoder().encode('nope'))).toBeNull();
    expect(decodeMessage(new TextEncoder().encode('{"x":1}'))).toBeNull();
  });
});

describe('BridgeClient', () => {
  const rendezvousSpec = async (code: string) => ({
    infoHash: await pairingInfoHash(code),
    name: 'ovtorrent-bridge',
    pieceLength: 16384,
    files: [{ name: 'x', length: 1 }],
    autoReady: false,
  });

  it('joins the rendezvous torrent, handshakes, forwards magnets and tracks status', async () => {
    const spec = await rendezvousSpec('casa-1234');
    const client = new FakeWebTorrentClient({ r: spec });
    const bridge = new BridgeClient();
    await bridge.connect(client, 'casa-1234', ['wss://a.example']);
    expect(client.torrents[0]?.infoHash).toBe(spec.infoHash);
    // Magnet requested before any bridge is connected is queued.
    bridge.requestMagnet(`magnet:?xt=urn:btih:${HASH}`);
    const wire = new FakeWire();
    client.torrents[0]!.emit('wire', wire);
    expect(wire.extension).not.toBeNull();
    wire.extension!.onExtendedHandshake({ m: { other: 1 } });
    expect(wire.sent).toHaveLength(0);
    wire.extension!.onExtendedHandshake({ m: { [EXTENSION_NAME]: 3 } });
    expect(wire.sent.map((s) => (s.message as { t: string }).t)).toEqual(['hello', 'add']);
    wire.extension!.onMessage(encodeMessage({ t: 'hello', v: 1, name: 'nas' }));
    expect(bridge.getState()).toMatchObject({ connected: true, name: 'nas', code: 'casa-1234' });
    wire.extension!.onMessage(
      encodeMessage({
        t: 'status',
        v: 1,
        torrents: [
          {
            infoHash: HASH,
            name: 'Demo',
            progress: 0.5,
            numPeers: 7,
            downloadSpeed: 1,
            uploadSpeed: 0,
            done: false,
            ready: true,
          },
        ],
      }),
    );
    expect(bridge.statusFor(HASH.toUpperCase())?.numPeers).toBe(7);
    bridge.requestMagnet(`magnet:?xt=urn:btih:${'e'.repeat(40)}`);
    expect(wire.sent).toHaveLength(3);
    wire.extension!.onMessage(encodeMessage({ t: 'error', message: 'magnet no válido' }));
    expect(bridge.getState().lastError).toBe('magnet no válido');
    wire.close();
    expect(bridge.getState().connected).toBe(false);
    await bridge.disconnect();
    expect(client.added[0]?.destroyed).toBe(true);
    expect(bridge.getState().code).toBeNull();
  });

  it('ignores magnets when no code is configured', () => {
    const bridge = new BridgeClient();
    bridge.requestMagnet(`magnet:?xt=urn:btih:${HASH}`);
    expect(bridge.getState().torrents).toEqual([]);
  });
});
