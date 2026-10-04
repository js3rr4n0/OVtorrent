import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryBufferStore } from '@/core/buffer/MemoryBufferStore';
import type { MediaItem } from '@/core/schemas/media';
import { DEFAULT_SETTINGS, type Settings } from '@/core/schemas/settings';
import { createEphemeralChunkStoreClass } from '../EphemeralChunkStore';
import {
  countTrackers,
  NO_PEERS_GUIDANCE,
  NO_PEERS_MESSAGE,
  STREAM_CONFIG_MESSAGE,
  trackersFor,
  WebTorrentStreamingEngine,
} from '../WebTorrentStreamingEngine';
import { computeAvailability } from '@/workers/protocol';
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

/** Messages the engine posted to the (fake) streaming Service Worker. */
const swMessages: unknown[] = [];
const fakeRegistration = {
  scope: 'http://localhost/',
  active: { postMessage: (m: unknown) => swMessages.push(m) },
} as unknown as ServiceWorkerRegistration;

function makeEngine(
  client: FakeWebTorrentClient,
  settings: Settings = DEFAULT_SETTINGS,
  now = () => Date.now(),
  store: MemoryBufferStore = new MemoryBufferStore(Number.POSITIVE_INFINITY),
) {
  return new WebTorrentStreamingEngine({
    getSettings: () => settings,
    getClient: async () => client,
    getRegistration: async () => fakeRegistration,
    createBufferStore: () => store,
    now,
    runAvailability: async (job) => computeAvailability(job),
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
    // Nothing but the playhead window is requested: 51 pieces deselected, then
    // [0, keepEnd] selected (90 s × 625 000 B/s fallback ≈ 54 pieces → capped at 50).
    expect(t.calls[0]).toBe('deselectRange:0-50');
    expect(t.calls).toContain('selectRange:0-50');
    expect(t.calls.some((c) => c.startsWith('critical:0-'))).toBe(true);
    expect(t.calls.some((c) => c.startsWith('select:'))).toBe(false);
    expect(swMessages.at(-1)).toEqual({ type: STREAM_CONFIG_MESSAGE, rangeBytes: 54 * MB });
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
    expect(client.torrents[0]?.calls).toContain('selectRange:0-0');
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
    expect(session.metrics().warnings).toContain(`${NO_PEERS_MESSAGE} ${NO_PEERS_GUIDANCE}`);
    (client.torrents[0] as FakeTorrent).addPeer();
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.metrics().warnings.join(' ')).not.toContain(NO_PEERS_MESSAGE);
    expect(session.metrics().peers).toBe(1);
    await session.destroy();
    vi.useRealTimers();
  });

  it('moves the download window with the playhead and tells the worker the range size', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const session = await makeEngine(client).createSession({ item });
    const v = video();
    Object.defineProperty(v, 'duration', { value: 500 }); // 50 MB / 500 s → 1 piece ≈ 10 s
    await session.start({
      videoElement: v,
      bufferWindow: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
    });
    const t = client.torrents[0] as FakeTorrent;
    expect(t.calls).toContain('selectRange:0-9');
    expect(swMessages.at(-1)).toEqual({ type: STREAM_CONFIG_MESSAGE, rangeBytes: 9 * MB });
    v.currentTime = 300;
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.calls).toContain('deselectRange:0-9');
    expect(t.calls).toContain('selectRange:30-39');
    expect(t.calls).toContain('critical:30-33');
    // A seek re-centres the window immediately, before the element reports the new position.
    await session.seek(100);
    expect(t.calls.at(-2)).toBe('selectRange:10-19');
    expect(t.calls.at(-1)).toBe('critical:10-13');
    await session.destroy();
    vi.useRealTimers();
  });

  it('restarts the torrent in place when the memory limit is exceeded, keeping the element and freeing the old pieces', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const store = new MemoryBufferStore(Number.POSITIVE_INFINITY);
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      buffer: { ...DEFAULT_SETTINGS.buffer, storeKind: 'memory', memoryLimitBytes: 16 * MB },
    };
    const session = await makeEngine(client, settings, () => Date.now(), store).createSession({
      item,
    });
    const v = video();
    await session.start({
      videoElement: v,
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const first = client.torrents[0] as FakeTorrent;
    for (let i = 0; i < 20; i++) await first.receivePiece(i);
    expect(session.metrics().bufferedBytes).toBe(20 * MB);
    expect((await store.getUsage()).bytes).toBe(20 * MB);
    const src = v.getAttribute('src');
    v.currentTime = 42;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(client.added).toHaveLength(2));
    expect(first.destroyed).toBe(true);
    // Re-added from the cached metadata (no new metadata exchange), same stream URL.
    expect(client.addCalls).toEqual(['magnet', 'torrentFile']);
    expect(v.getAttribute('src')).toBe(src);
    const second = client.torrents[0] as FakeTorrent;
    expect(second).not.toBe(first);
    // 42 s × 625 000 B/s (fallback) ≈ piece 25: the window resumes at the playhead.
    expect(second.calls).toContain('selectRange:25-50');
    await vi.waitFor(async () => expect((await store.getUsage()).bytes).toBe(0));
    expect(session.metrics().bufferedBytes).toBe(0);
    expect(session.metrics().warnings.join(' ')).toMatch(/Reinicios por memoria en esta sesión: 1/);
    expect(session.metrics().warnings.join(' ')).not.toMatch(/reproducción automáticamente/);
    // Pieces of the new incarnation count again from zero.
    await second.receivePiece(25);
    expect(session.metrics().bufferedBytes).toBe(MB);
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
    session.metrics(); // schedules the async availability job
    await new Promise((r) => setTimeout(r, 0));
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

describe('tracker status and protocol warnings', () => {
  const UDP_MAGNET = `magnet:?xt=urn:btih:${HASH}&tr=udp%3A%2F%2Ftracker.a%3A1337&tr=udp%3A%2F%2Ftracker.b%3A6969%2Fannounce&tr=wss%3A%2F%2Fextra.example`;

  it('counts WebSocket trackers in use and UDP/HTTP trackers the browser must ignore', () => {
    const status = countTrackers(UDP_MAGNET, ['wss://a', 'wss://b']);
    expect(status).toEqual({ websocket: 3, responded: 0, failed: [], ignored: 2 });
  });

  it('hides per-tracker "Unsupported tracker protocol" noise and reports a status line instead', async () => {
    const client = makeClient();
    const session = await makeEngine(client).createSession({
      item: { ...item, source: UDP_MAGNET },
    });
    await session.start({
      videoElement: video(),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const t = client.torrents[0] as FakeTorrent;
    t.emit('warning', new Error('Unsupported tracker protocol: udp://tracker.a:1337'));
    t.emit('warning', new Error('Unsupported tracker protocol: udp://tracker.b:6969/announce'));
    expect(session.metrics().warnings).toEqual([]);
    expect(session.metrics().status).toContain('2 trackers UDP/HTTP del magnet ignorados');
    expect(session.metrics().status).toContain('Trackers WebSocket: 5 (0 respondieron)');
    t.emit('trackerAnnounce');
    t.emit('trackerAnnounce');
    expect(session.metrics().status).toContain('(1 respondieron)');
    await session.destroy();
  });

  it('only warns about tracker connection errors when every WebSocket tracker failed', async () => {
    const client = makeClient();
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      p2p: {
        ...DEFAULT_SETTINGS.p2p,
        useDefaultTrackers: false,
        customTrackers: ['wss://one.example', 'wss://two.example'],
      },
    };
    const session = await makeEngine(client, settings).createSession({ item });
    await session.start({
      videoElement: video(),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const t = client.torrents[0] as FakeTorrent;
    t.emit('warning', new Error('Error connecting to wss://one.example'));
    expect(session.metrics().warnings).toEqual([]);
    expect(session.metrics().status).toContain('1 sin conexión');
    t.emit('warning', new Error('Error connecting to wss://two.example'));
    // The magnet itself declares wss://t/announce: one tracker is still alive, so no alarm yet.
    expect(session.metrics().warnings).toEqual([]);
    t.emit('warning', new Error('Error connecting to wss://t/announce'));
    expect(session.metrics().warnings.join(' ')).toMatch(/Ningún tracker WebSocket responde/);
    t.emit('warning', new Error('invalid scrape response'));
    expect(session.metrics().warnings.join(' ')).toMatch(
      /Aviso del protocolo: invalid scrape response/,
    );
    await session.destroy();
  });

  it('explains what to do when metadata never arrives', async () => {
    vi.useFakeTimers();
    const client = makeClient({ autoReady: false });
    const session = await makeEngine(client).createSession({ item });
    const pending = session.metadata();
    const assertion = expect(pending).rejects.toMatchObject({
      reasons: expect.arrayContaining([NO_PEERS_GUIDANCE]),
    });
    await vi.advanceTimersByTimeAsync(95_000);
    await assertion;
    vi.useRealTimers();
  });
});
