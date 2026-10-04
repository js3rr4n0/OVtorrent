import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasMediaSource, hasWebRTC } from '../capabilities';
import { HtmlMediaEngine } from '../HtmlMediaEngine';
import { resolveEngine } from '../registry';
import { StreamingUnavailableError } from '../types';
import type { MediaItem } from '@/core/schemas/media';
import { FakeStreamingEngine } from '@/test/fakes';
import { DEFAULT_SETTINGS } from '@/core/schemas/settings';

const getSettings = () => DEFAULT_SETTINGS;

const item = (sourceType: MediaItem['sourceType'], source = 'x'): MediaItem => ({
  id: crypto.randomUUID(),
  sourceType,
  source,
  title: 't',
  description: '',
  tags: [],
  position: 0,
});

describe('capabilities', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g.RTCPeerConnection;
    delete g.MediaSource;
  });
  it('reports missing WebRTC and MediaSource honestly', () => {
    expect(hasWebRTC()).toBe(false);
    expect(hasMediaSource()).toBe(false);
    g.RTCPeerConnection = function () {};
    g.MediaSource = function () {};
    expect(hasWebRTC()).toBe(true);
    expect(hasMediaSource()).toBe(true);
  });
});

describe('resolveEngine', () => {
  it('uses the HTML5 engine for files and URLs', () => {
    expect(resolveEngine('file', getSettings).engine?.name).toBe('html5');
    expect(resolveEngine('url', getSettings).engine?.name).toBe('html5');
  });
  it('explains why magnets cannot play without WebRTC', () => {
    const r = resolveEngine('magnet', getSettings);
    expect(r.engine).toBeNull();
    expect(r.reasons.join(' ')).toMatch(/WebRTC/);
  });
  it('uses the WebTorrent engine when WebRTC, DataChannels and Service Worker exist', () => {
    const g = globalThis as Record<string, unknown>;
    const PC = function () {} as unknown as { prototype: Record<string, unknown> };
    PC.prototype.createDataChannel = () => undefined;
    g.RTCPeerConnection = PC;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    try {
      const r = resolveEngine('magnet', getSettings);
      expect(r.engine?.name).toBe('webtorrent');
    } finally {
      delete g.RTCPeerConnection;
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    }
  });
});

describe('HtmlMediaEngine', () => {
  it('requires a File object for local items', async () => {
    const engine = new HtmlMediaEngine();
    await expect(engine.createSession({ item: item('file', 'a.mp4') })).rejects.toBeInstanceOf(
      StreamingUnavailableError,
    );
  });
  it('refuses unsupported source types', async () => {
    const engine = new HtmlMediaEngine();
    await expect(engine.createSession({ item: item('magnet') })).rejects.toThrow(/magnet/);
  });
  it('plays a URL, reports metrics and releases resources on stop', async () => {
    const engine = new HtmlMediaEngine();
    const session = await engine.createSession({ item: item('url', 'https://example.org/v.mp4') });
    const video = document.createElement('video');
    const playSpy = vi.spyOn(video, 'play');
    const states: string[] = [];
    session.subscribe((s) => states.push(s.state));
    await session.start({
      videoElement: video,
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    expect(playSpy).toHaveBeenCalled();
    expect(video.src).toContain('https://example.org/v.mp4');
    expect(session.metrics().peers).toBe(0);
    await session.stop();
    expect(session.state).toBe('stopped');
    expect(video.getAttribute('src')).toBeNull();
    await session.destroy();
  });
  it('creates and revokes object URLs for local files', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const engine = new HtmlMediaEngine();
    const file = new File(['abc'], 'a.mp4', { type: 'video/mp4' });
    const session = await engine.createSession({ item: item('file', 'a.mp4'), file });
    expect((await session.metadata()).files[0]?.name).toBe('a.mp4');
    await session.start({
      videoElement: document.createElement('video'),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    expect(create).toHaveBeenCalledWith(file);
    await session.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    create.mockRestore();
    revoke.mockRestore();
  });
});

describe('FakeStreamingEngine', () => {
  it('surfaces peer errors through warnings', async () => {
    const engine = new FakeStreamingEngine({ peers: 0 });
    const s = await engine.createSession({ item: item('magnet') });
    expect(s.metrics().warnings).toContain('Sin peers disponibles');
  });
  it('propagates codec errors from start()', async () => {
    const engine = new FakeStreamingEngine({ failWith: new Error('codec no soportado') });
    const s = await engine.createSession({ item: item('magnet') });
    await expect(
      s.start({
        videoElement: document.createElement('video'),
        bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
      }),
    ).rejects.toThrow(/codec/);
    expect(s.state).toBe('error');
  });
});
