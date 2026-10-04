/**
 * Compatibility probes built on the MediaCapabilities API. Every result is
 * what the browser reports for *this* device; nothing is assumed. When the
 * API is missing the probe says so instead of guessing.
 */
export interface DecodeProbe {
  id: string;
  label: string;
  type: 'file' | 'media-source';
  video: { contentType: string; width: number; height: number; bitrate: number; framerate: number };
}

export interface DecodeProbeResult extends DecodeProbe {
  supported: boolean | null;
  smooth: boolean | null;
  powerEfficient: boolean | null;
  note?: string;
}

export const DECODE_PROBES: DecodeProbe[] = [
  {
    id: 'h264-1080p',
    label: 'H.264 1080p30',
    type: 'file',
    video: {
      contentType: 'video/mp4; codecs="avc1.640028"',
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
    },
  },
  {
    id: 'h264-4k',
    label: 'H.264 2160p30',
    type: 'file',
    video: {
      contentType: 'video/mp4; codecs="avc1.640033"',
      width: 3840,
      height: 2160,
      bitrate: 25_000_000,
      framerate: 30,
    },
  },
  {
    id: 'vp9-1080p',
    label: 'VP9 1080p30',
    type: 'file',
    video: {
      contentType: 'video/webm; codecs="vp09.00.40.08"',
      width: 1920,
      height: 1080,
      bitrate: 6_000_000,
      framerate: 30,
    },
  },
  {
    id: 'vp9-4k',
    label: 'VP9 2160p30',
    type: 'file',
    video: {
      contentType: 'video/webm; codecs="vp09.00.50.08"',
      width: 3840,
      height: 2160,
      bitrate: 18_000_000,
      framerate: 30,
    },
  },
  {
    id: 'hevc-4k',
    label: 'HEVC 2160p30',
    type: 'file',
    video: {
      contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
      width: 3840,
      height: 2160,
      bitrate: 20_000_000,
      framerate: 30,
    },
  },
  {
    id: 'av1-1080p',
    label: 'AV1 1080p30',
    type: 'file',
    video: {
      contentType: 'video/mp4; codecs="av01.0.08M.08"',
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 30,
    },
  },
  {
    id: 'av1-4k',
    label: 'AV1 2160p30',
    type: 'file',
    video: {
      contentType: 'video/mp4; codecs="av01.0.12M.08"',
      width: 3840,
      height: 2160,
      bitrate: 15_000_000,
      framerate: 30,
    },
  },
  {
    id: 'h264-1080p-mse',
    label: 'H.264 1080p30 (MediaSource, HLS)',
    type: 'media-source',
    video: {
      contentType: 'video/mp4; codecs="avc1.640028"',
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
    },
  },
];

interface MediaCapabilitiesLike {
  decodingInfo(config: {
    type: 'file' | 'media-source';
    video: DecodeProbe['video'];
  }): Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }>;
}

export function getMediaCapabilities(): MediaCapabilitiesLike | null {
  const mc = (
    globalThis.navigator as unknown as { mediaCapabilities?: MediaCapabilitiesLike } | undefined
  )?.mediaCapabilities;
  return mc && typeof mc.decodingInfo === 'function' ? mc : null;
}

export async function runDecodeProbes(
  api: MediaCapabilitiesLike | null = getMediaCapabilities(),
  probes: DecodeProbe[] = DECODE_PROBES,
): Promise<DecodeProbeResult[]> {
  if (!api) {
    return probes.map((p) => ({
      ...p,
      supported: null,
      smooth: null,
      powerEfficient: null,
      note: 'MediaCapabilities no disponible',
    }));
  }
  return Promise.all(
    probes.map(async (p) => {
      try {
        const r = await api.decodingInfo({ type: p.type, video: p.video });
        return { ...p, supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient };
      } catch (err) {
        return {
          ...p,
          supported: null,
          smooth: null,
          powerEfficient: null,
          note: err instanceof Error ? err.message : 'error',
        };
      }
    }),
  );
}

export function summarizeProbes(results: DecodeProbeResult[]): string[] {
  const out: string[] = [];
  const by = (id: string) => results.find((r) => r.id === id);
  const h4k = by('h264-4k');
  if (h4k && h4k.supported === false)
    out.push(
      'Este dispositivo no decodifica H.264 a 2160p: el contenido 4K en H.264 no se reproducirá.',
    );
  if (h4k && h4k.supported && h4k.smooth === false)
    out.push('H.264 2160p se decodifica pero no de forma fluida: espera saltos en 4K.');
  const hevc = by('hevc-4k');
  if (hevc && hevc.supported === false)
    out.push('HEVC 2160p no soportado: no hay transcodificación, elige una versión H.264/VP9/AV1.');
  const av1 = by('av1-1080p');
  if (av1 && av1.supported === false) out.push('AV1 no soportado por este navegador o hardware.');
  const vp9 = by('vp9-4k');
  if (vp9 && vp9.supported && vp9.powerEfficient === false)
    out.push(
      'VP9 2160p se decodifica por software: mayor consumo y posible calentamiento en TV boxes.',
    );
  return out;
}
