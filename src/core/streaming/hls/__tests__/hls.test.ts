import { describe, expect, it } from 'vitest';
import type { MediaItem } from '@/core/schemas/media';
import { DEFAULT_SETTINGS, type Settings } from '@/core/schemas/settings';
import { HlsStreamingEngine } from '../HlsStreamingEngine';
import {
  allowedLevelIndexes,
  autoLevelCap,
  hlsConfigFor,
  levelLabel,
  startLevelFor,
} from '../qualityPolicy';
import { createFakeHls } from '@/test/fakes';

const LEVELS = [
  { height: 360, width: 640, bitrate: 800_000, name: '360p' },
  { height: 720, width: 1280, bitrate: 2_800_000 },
  { height: 1080, width: 1920, bitrate: 6_000_000 },
  { height: 2160, width: 3840, bitrate: 16_000_000 },
];

const item: MediaItem = {
  id: '7b1c2b0e-7f2a-4c3a-9d2a-1f3d4e5f6a7b',
  sourceType: 'hls',
  source: 'https://cdn.example/master.m3u8',
  title: 'Canal',
  description: '',
  tags: [],
  position: 0,
};

const settingsWith = (quality: Partial<Settings['quality']>): Settings => ({
  ...DEFAULT_SETTINGS,
  quality: { ...DEFAULT_SETTINGS.quality, ...quality },
});

describe('qualityPolicy', () => {
  it('filters levels by preferred resolution, preset and bitrate bounds', () => {
    expect(allowedLevelIndexes(LEVELS, DEFAULT_SETTINGS.quality)).toEqual([0, 1, 2, 3]);
    expect(
      allowedLevelIndexes(LEVELS, settingsWith({ preferredResolution: '720p' }).quality),
    ).toEqual([0, 1]);
    expect(allowedLevelIndexes(LEVELS, settingsWith({ mode: 'data-saver' }).quality)).toEqual([0]);
    expect(allowedLevelIndexes(LEVELS, settingsWith({ mode: 'balanced' }).quality)).toEqual([
      0, 1, 2,
    ]);
    expect(
      allowedLevelIndexes(
        LEVELS,
        settingsWith({ maxBitrateKbps: 3000, minBitrateKbps: 1000 }).quality,
      ),
    ).toEqual([1]);
  });
  it('derives the auto cap and the start level from the priority', () => {
    expect(autoLevelCap(LEVELS, DEFAULT_SETTINGS.quality)).toBe(-1);
    expect(autoLevelCap(LEVELS, settingsWith({ preferredResolution: '1080p' }).quality)).toBe(2);
    expect(startLevelFor(LEVELS, settingsWith({ priority: 'fast-start' }).quality)).toBe(0);
    expect(
      startLevelFor(
        LEVELS,
        settingsWith({ priority: 'quality', preferredResolution: '720p' }).quality,
      ),
    ).toBe(1);
    expect(startLevelFor(LEVELS, DEFAULT_SETTINGS.quality)).toBe(-1);
  });
  it('maps the buffer window to hls.js config and labels levels', () => {
    const c = hlsConfigFor(
      { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
      DEFAULT_SETTINGS.quality,
      false,
    );
    expect(c).toMatchObject({
      maxBufferLength: 90,
      backBufferLength: 15,
      capLevelToPlayerSize: true,
      enableWorker: true,
    });
    expect(levelLabel(LEVELS[0]!)).toBe('360p · 800 kbps');
    expect(levelLabel({ height: 720, width: 1280, bitrate: 2_800_000, name: 'HD' })).toBe(
      '720p · 2800 kbps · HD',
    );
    expect(levelLabel({ height: 0, width: 0, bitrate: 0 })).toBe('Variante');
  });
});

describe('HlsStreamingEngine (hls.js over MSE)', () => {
  const makeEngine = (settings = DEFAULT_SETTINGS, supported = true) => {
    const Fake = createFakeHls({ supported });
    const engine = new HlsStreamingEngine({
      getSettings: () => settings,
      loadHls: async () => Fake,
      mode: 'mse',
    });
    return { engine, Fake };
  };

  it('reports capabilities and refuses other source types', async () => {
    const { engine } = makeEngine();
    const caps = await engine.capabilities();
    expect(caps.available).toBe(true);
    expect(caps.mediaSource).toBe(true);
    await expect(engine.createSession({ item: { ...item, sourceType: 'url' } })).rejects.toThrow(
      /HLS/,
    );
    const none = new HlsStreamingEngine({ getSettings: () => DEFAULT_SETTINGS, mode: undefined });
    expect((await none.capabilities()).available).toBe(false);
  });

  it('attaches hls.js, applies quality limits on manifest and exposes variants, audio and subtitle tracks', async () => {
    const { engine, Fake } = makeEngine(
      settingsWith({ preferredResolution: '1080p', priority: 'fast-start' }),
    );
    const session = await engine.createSession({ item });
    const video = document.createElement('video');
    await session.start({
      videoElement: video,
      startAtSeconds: 42,
      bufferWindow: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
    });
    const hls = Fake.instances[0]!;
    expect(hls.calls).toContain('attachMedia');
    expect(hls.calls).toContain(`loadSource:${item.source}`);
    expect(hls.calls).toContain('startLoad:42');
    expect(hls.config.maxBufferLength).toBe(90);
    hls.manifest(
      LEVELS,
      [
        { id: 0, name: 'Español', lang: 'es' },
        { id: 1, name: 'English', lang: 'en' },
      ],
      [{ id: 0, name: 'Castellano', lang: 'es' }],
    );
    expect(hls.autoLevelCapping).toBe(2);
    expect(hls.startLevel).toBe(0);
    const variants = session.variants!();
    expect(variants[0]?.id).toBe('auto');
    expect(variants[0]?.active).toBe(true);
    expect(variants).toHaveLength(5);
    await session.selectVariant!('2');
    expect(hls.currentLevel).toBe(2);
    expect(session.variants!().find((v) => v.id === '2')?.active).toBe(true);
    await session.selectVariant!('auto');
    expect(hls.currentLevel).toBe(-1);
    expect(session.audioTracks!().map((t) => t.label)).toEqual(['Español', 'English']);
    await session.selectAudioTrack!('1');
    expect(hls.audioTrack).toBe(1);
    expect(session.subtitleTracks!()).toHaveLength(1);
    expect(await session.selectSubtitleTrack!('0')).toBeNull();
    expect(hls.subtitleTrack).toBe(0);
    expect(hls.subtitleDisplay).toBe(true);
    hls.currentLevel = 1;
    expect(session.metrics().bitrateKbps).toBe(2800);
    await session.destroy();
    expect(hls.destroyed).toBe(true);
    expect(video.getAttribute('src')).toBeNull();
  });

  it('retries network errors, recovers media errors and gives up with a clear message', async () => {
    const { engine, Fake } = makeEngine();
    const session = await engine.createSession({ item });
    await session.start({
      videoElement: document.createElement('video'),
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    const hls = Fake.instances[0]!;
    const before = hls.calls.filter((c) => c.startsWith('startLoad')).length;
    hls.emit('hlsError', { type: 'networkError', details: 'manifestLoadError', fatal: true });
    expect(hls.calls.filter((c) => c.startsWith('startLoad'))).toHaveLength(before + 1);
    expect(session.metrics().warnings.join(' ')).toMatch(/reintentando/);
    hls.emit('hlsError', { type: 'mediaError', details: 'bufferAppendError', fatal: true });
    expect(hls.calls).toContain('recoverMediaError');
    hls.emit('hlsError', { type: 'mediaError', details: 'x', fatal: true });
    hls.emit('hlsError', {
      type: 'otherError',
      details: 'manifestIncompatibleCodecsError',
      fatal: true,
    });
    expect(session.state).toBe('error');
    expect(session.metrics().warnings.join(' ')).toMatch(/irrecuperable/);
    hls.emit('hlsError', { type: 'mediaError', details: 'bufferStalledError', fatal: false });
    expect(session.metrics().warnings.join(' ')).not.toMatch(/bufferStalledError/);
    await session.destroy();
  });

  it('fails clearly when hls.js reports no MSE support', async () => {
    const { engine } = makeEngine(DEFAULT_SETTINGS, false);
    const session = await engine.createSession({ item });
    await expect(
      session.start({
        videoElement: document.createElement('video'),
        bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
      }),
    ).rejects.toThrow(/MediaSource/);
  });

  it('uses the native <video> path without loading hls.js', async () => {
    const engine = new HlsStreamingEngine({
      getSettings: () => DEFAULT_SETTINGS,
      mode: 'native',
      loadHls: async () => {
        throw new Error('no debe cargarse');
      },
    });
    const session = await engine.createSession({ item });
    const video = document.createElement('video');
    await session.start({
      videoElement: video,
      bufferWindow: { initialSeconds: 1, aheadSeconds: 1, behindSeconds: 1 },
    });
    expect(video.src).toBe(item.source);
    expect(session.variants!()).toEqual([]);
    expect((await engine.capabilities()).limitations.join(' ')).toMatch(/nativo/);
    await session.destroy();
  });
});
