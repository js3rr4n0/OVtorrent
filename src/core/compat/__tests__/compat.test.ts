import { describe, expect, it } from 'vitest';
import { DECODE_PROBES, runDecodeProbes, summarizeProbes } from '../mediaCapabilities';
import { probeWebRtc } from '../webrtcProbe';

describe('mediaCapabilities probes', () => {
  it('reports the API as missing instead of guessing', async () => {
    const r = await runDecodeProbes(null);
    expect(r).toHaveLength(DECODE_PROBES.length);
    expect(r.every((p) => p.supported === null && p.note)).toBe(true);
  });
  it('maps decodingInfo answers and summarises limitations', async () => {
    const api = {
      decodingInfo: async (cfg: { video: { contentType: string; height: number } }) => ({
        supported: !cfg.video.contentType.includes('hvc1'),
        smooth: cfg.video.height <= 1080,
        powerEfficient: !cfg.video.contentType.includes('vp09'),
      }),
    };
    const r = await runDecodeProbes(api);
    expect(r.find((p) => p.id === 'hevc-4k')?.supported).toBe(false);
    expect(r.find((p) => p.id === 'h264-4k')?.smooth).toBe(false);
    const summary = summarizeProbes(r);
    expect(summary.join(' ')).toMatch(/HEVC/);
    expect(summary.join(' ')).toMatch(/no de forma fluida/);
    expect(summary.join(' ')).toMatch(/VP9 2160p se decodifica por software/);
  });
  it('isolates probe errors', async () => {
    const api = {
      decodingInfo: async () => {
        throw new Error('boom');
      },
    };
    const r = await runDecodeProbes(api, [DECODE_PROBES[0]!]);
    expect(r[0]?.note).toBe('boom');
  });
});

describe('probeWebRtc', () => {
  it('reports missing RTCPeerConnection honestly', async () => {
    const r = await probeWebRtc({ timeoutMs: 10 });
    expect(r.supported).toBe(false);
    expect(r.error).toMatch(/RTCPeerConnection/);
  });
  it('counts gathered candidates with a fake peer connection', async () => {
    class FakePC {
      onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
      createDataChannel() {
        return { send() {} };
      }
      async createOffer() {
        return {};
      }
      async setLocalDescription() {
        queueMicrotask(() => {
          this.onicecandidate?.({
            candidate: { candidate: 'candidate:1 1 udp 2 192.168.1.2 5000 typ host' },
          });
          this.onicecandidate?.({
            candidate: { candidate: 'candidate:2 1 udp 2 2001:db8::1 5000 typ host' },
          });
          this.onicecandidate?.({
            candidate: { candidate: 'candidate:3 1 udp 1 203.0.113.1 5000 typ srflx' },
          });
          this.onicecandidate?.({ candidate: null });
        });
      }
      close() {}
    }
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakePC;
    try {
      const r = await probeWebRtc();
      expect(r).toMatchObject({
        supported: true,
        dataChannel: true,
        hostCandidates: 2,
        srflxCandidates: 1,
        relayCandidates: 0,
        ipv6: true,
      });
    } finally {
      delete (globalThis as Record<string, unknown>).RTCPeerConnection;
    }
  });
});
