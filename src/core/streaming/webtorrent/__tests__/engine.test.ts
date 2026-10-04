import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryBufferStore } from '@/core/buffer/MemoryBufferStore';
import type { MediaItem } from '@/core/schemas/media';
import { DEFAULT_SETTINGS, type Settings } from '@/core/schemas/settings';
import { createEphemeralChunkStoreClass } from '../EphemeralChunkStore';
import {
  NO_PEERS_MESSAGE,
  trackersFor,
  WebTorrentStreamingEngine,
} from '../WebTorrentStreamingEngine';
import { THROTTLED_RATE_BPS } from '../windowPolicy';
import { FakeWebTorrentClient, type FakeTorrent } from '@/test/fakes';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';
const MB = 1024 * 1024;
const item: MediaItem = {
  id: '7b1c2b0e-7f2a-4c3a-9d2a-1f3d4e5f6a7b',
  sourceType: 'magnet',
  source: `magnet:?xt=urn:btih:${HASH}&tr=wss://t/announce`,
  title: 'Demo',
  description: '',
  tags: [],
  position: 0,
};

function makeClient(
  spec?: Partial<{ autoReady: boolean; files: Array<{ name: string; length: number }> }>,
) {
  return new FakeWebTorrentClient({
    demo: {
      infoHash: HASH,
      name: 'Demo torrent',
      pieceLength: MB,
      files: spec?.files ?? [
        { name: 'readme.txt', length: 100 },
        { name: 'video.mp4', length: 50 * MB },
      ],
      autoReady: spec?.autoReady,
    },
  });
}

function makeEngine(
  client: FakeWebTorrentClient,
  settings: Settings = DEFAULT_SETTINGS,
  now = () => Date.now(),
) {
  return new WebTorrentStreamingEngine({
    getSettings: () => settings,
    getClient: async () => client,
    getRegistration: async () => ({ scope: 'http://localhost/' }) as ServiceWorkerRegistration,
    createBufferStore: () => new MemoryBufferStore(Number.POSITIVE_INFINITY),
    now,
  });
}

function video(ahead?: () => number): HTMLVideoElement {
  const v = document.createElement('video');
  Object.defineProperty(v, 'buffered', {
    configurable: true,
    get: () =>
      ahead
        ? { length: 1, start: () => 0, end: () => ahead() }
        : { length: 0, start: () => 0, end: () => 0 },
  });
  return v;
}

const secure = () =>
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
const withApis = () => {
  const g = globalThis as Record<string, unknown>;
  const PC = function () {} as unknown as { prototype: Record<string, unknown> };
  PC.prototype.createDataChannel = () => undefined;
  g.RTCPeerConnection = PC;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  secure();
};

describe('WebTorrentStreamingEngine', () => {
  beforeEach(() => {
    vi.useRealTimers();
    withApis();
  });

  it('reports capabilities honestly when WebRTC is missing', async () => {
    delete (globalThis as Record<string, unknown>).RTCPeerConnection;
    const caps = await makeEngine(makeClient()).capabilities();
    expect(caps.available).toBe(false);
    expect(caps.limitations.join(' ')).toMatch(/WebRTC/);
    expect(caps.supportedSourceTypes).toEqual(['magnet', 'torrent']);
  });

  it('refuses non-P2P sources', async () => {
    await expect(
      makeEngine(makeClient()).createSession({ item: { ...item, sourceType: 'url' } }),
    ).rejects.toThrow(/WebTorrent/);
  });

  it('lists torrent files and preselects the playable one', async () => {
    const client = makeClient();
    const session = await makeEngine(client).createSession({ item });
    const meta = await session.metadata();
    expect(meta.title).toBe('Demo torrent');
    expect(meta.files).toHaveLength(2);
    expect(meta.selectedFileIndex).toBe(1);
    expect(meta.files[0]?.isPlayable).toBe(false);
    expect(client.torrents[0]?.announce).toEqual(trackersFor(DEFAULT_SETTINGS));
  });

  it('starts streaming the selected file through the service worker server and prioritises the head', async () => {
    const client = makeClient();
    const session = await makeEngine(client).createSession({ item });
    const v = video();
    await session.start({
      videoElement: v,
      bufferWindow: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
    });
    const t = client.torrents[0] as FakeTorrent;
    expect(client.servers).toBe(1);
    expect(v.getAttribute('src')).toContain(`/webtorrent/${HASH}/video.mp4`);
    expect(t.calls).toContain('deselect:readme.txt');
    expect(t.calls).toContain('select:video.mp4');
    expect(t.calls.some((c) => c.startsWith('critical:0-'))).toBe(true);
    expect(client.uploadRate).toBe(-1);
    await session.destroy();
    expect(t.destroyed).toBe(true);
    expect(v.getAttribute('src')).toBeNull();
  });

  it('honours an explicit file index and the upload setting', async () => {
    const client = makeClient();
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      p2p: { ...DEFAULT_SETTINGS.p2p, uploadEnabled: false },
    };
    const session = await makeEngine(client, settings).createSession({ item });
    await session.start({
      videoElement: video(),
      fileIndex: 0,
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    expect(client.torrents[0]?.calls).toContain('select:readme.txt');
    expect(client.uploadRate).toBe(0);
    await session.destroy();
  });

  it('warns about missing peers after the configured timeout and clears the warning when peers appear', async () => {
    vi.useFakeTimers();
    let nowMs = 0;
    const client = makeClient();
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      p2p: { ...DEFAULT_SETTINGS.p2p, noPeersTimeoutSeconds: 5 },
    };
    const session = await makeEngine(client, settings, () => nowMs).createSession({ item });
    await session.start({
      videoElement: video(),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    nowMs = 6000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.metrics().warnings).toContain(NO_PEERS_MESSAGE);
    (client.torrents[0] as FakeTorrent).addPeer();
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.metrics().warnings).not.toContain(NO_PEERS_MESSAGE);
    expect(session.metrics().peers).toBe(1);
    await session.destroy();
    vi.useRealTimers();
  });

  it('throttles downloads once the future window is buffered and releases the throttle after a seek', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const session = await makeEngine(client).createSession({ item });
    let ahead = 200;
    const v = video(() => ahead);
    Object.defineProperty(v, 'duration', { value: 500 });
    await session.start({
      videoElement: v,
      bufferWindow: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.downloadRate).toBe(THROTTLED_RATE_BPS);
    ahead = 5;
    await session.seek(300);
    expect(client.downloadRate).toBe(-1);
    await session.destroy();
    vi.useRealTimers();
  });

  it('restarts the torrent from the current position when the memory limit is exceeded', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      buffer: { ...DEFAULT_SETTINGS.buffer, memoryLimitBytes: 16 * MB },
    };
    const session = await makeEngine(client, settings).createSession({ item });
    const v = video();
    await session.start({
      videoElement: v,
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const first = client.torrents[0] as FakeTorrent;
    first.downloaded = 20 * MB;
    v.currentTime = 42;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(client.added).toHaveLength(2));
    expect(first.destroyed).toBe(true);
    expect(session.metrics().warnings.join(' ')).toMatch(/Reinicios por memoria/);
    await session.destroy();
    vi.useRealTimers();
  });

  it('computes availability from peers and reports metrics', async () => {
    const client = makeClient();
    const session = await makeEngine(client).createSession({ item });
    await session.start({
      videoElement: video(),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const t = client.torrents[0] as FakeTorrent;
    expect(Number.isNaN(session.metrics().availability)).toBe(true);
    t.addPeer((i) => i < 25);
    t.downloadSpeed = 1234;
    const m = session.metrics();
    expect(m.peers).toBe(1);
    expect(m.downloadSpeedBps).toBe(1234);
    expect(m.availability).toBeGreaterThan(0.4);
    expect(m.availability).toBeLessThan(0.6);
    await session.destroy();
  });

  it('fails with the no-peers explanation when metadata never arrives', async () => {
    vi.useFakeTimers();
    const client = makeClient({ autoReady: false });
    const session = await makeEngine(client).createSession({ item });
    const pending = session.metadata();
    const assertion = expect(pending).rejects.toThrow(/metadatos/);
    await vi.advanceTimersByTimeAsync(95_000);
    await assertion;
    vi.useRealTimers();
  });

  it('stores pieces in the ephemeral buffer store when configured and clears it on stop', async () => {
    const client = makeClient();
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      buffer: { ...DEFAULT_SETTINGS.buffer, storeKind: 'memory' },
    };
    const session = await makeEngine(client, settings).createSession({ item });
    await session.start({
      videoElement: video(),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const t = client.torrents[0] as FakeTorrent;
    expect(t.store).not.toBeNull();
    await t.receivePiece(0);
    await t.receivePiece(1);
    expect(session.metrics().bufferedBytes).toBe(2 * MB);
    await new Promise<void>((resolve, reject) =>
      t.store!.get(1, { offset: 10, length: 5 }, (err, buf) =>
        err ? reject(err) : (expect(buf?.byteLength).toBe(5), resolve()),
      ),
    );
    await session.stop();
    expect(session.metrics().bufferedBytes).toBe(0);
    await session.destroy();
  });
});

describe('EphemeralChunkStore', () => {
  it('round-trips pieces and reports missing ones as errors', async () => {
    const buffer = new MemoryBufferStore(Number.POSITIVE_INFINITY);
    const Store = createEphemeralChunkStoreClass(buffer, 's1');
    const store = new Store(4);
    await new Promise<void>((r) => store.put(2, new Uint8Array([1, 2, 3, 4]), () => r()));
    const got = await new Promise<Uint8Array | undefined>((r) =>
      store.get(2, null, (_e, b) => r(b)),
    );
    expect([...(got ?? [])]).toEqual([1, 2, 3, 4]);
    const missing = await new Promise<Error | null>((r) => store.get(3, null, (e) => r(e)));
    expect(missing?.message).toMatch(/no disponible/);
    await new Promise<void>((r) => store.destroy(() => r()));
    expect((await buffer.getUsage()).chunks).toBe(0);
  });
});
