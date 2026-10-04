import type { BufferWindowConfig, QualitySettings } from '../../schemas/settings';
import type { HlsConfigLike, HlsLevelLike } from './types';

export const RESOLUTION_HEIGHTS: Record<QualitySettings['preferredResolution'], number | null> = {
  auto: null,
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

/** Levels (indexes) allowed by the user's quality settings; empty means "all". */
export function allowedLevelIndexes(levels: HlsLevelLike[], quality: QualitySettings): number[] {
  const maxHeight = RESOLUTION_HEIGHTS[quality.preferredResolution];
  const presetMaxHeight =
    quality.mode === 'data-saver' ? 480 : quality.mode === 'balanced' ? 1080 : null;
  const capHeight = [maxHeight, presetMaxHeight]
    .filter((h): h is number => h !== null)
    .reduce((a, b) => Math.min(a, b), Infinity);
  const out: number[] = [];
  levels.forEach((l, i) => {
    const kbps = l.bitrate / 1000;
    if (Number.isFinite(capHeight) && l.height > capHeight) return;
    if (quality.maxBitrateKbps > 0 && kbps > quality.maxBitrateKbps) return;
    if (quality.minBitrateKbps > 0 && kbps < quality.minBitrateKbps) return;
    out.push(i);
  });
  return out;
}

/** Highest allowed level index for `autoLevelCapping` (-1 = no cap). */
export function autoLevelCap(levels: HlsLevelLike[], quality: QualitySettings): number {
  const allowed = allowedLevelIndexes(levels, quality);
  if (allowed.length === 0 || allowed.length === levels.length) return -1;
  // hls.js levels are sorted by bitrate ascending; cap at the highest allowed.
  return Math.max(...allowed);
}

/** Start level according to the priority setting (-1 lets hls.js choose). */
export function startLevelFor(levels: HlsLevelLike[], quality: QualitySettings): number {
  const allowed = allowedLevelIndexes(levels, quality);
  const pool = allowed.length > 0 ? allowed : levels.map((_, i) => i);
  if (pool.length === 0) return -1;
  switch (quality.priority) {
    case 'fast-start':
      return Math.min(...pool);
    case 'quality':
      return Math.max(...pool);
    case 'stability':
    default:
      return -1;
  }
}

/** hls.js config derived from the buffer window and the player priorities. */
export function hlsConfigFor(
  window: BufferWindowConfig,
  quality: QualitySettings,
  preferManagedMediaSource: boolean,
): HlsConfigLike {
  return {
    maxBufferLength: window.aheadSeconds,
    maxMaxBufferLength: Math.max(window.aheadSeconds, window.initialSeconds),
    backBufferLength: window.behindSeconds,
    startLevel: quality.priority === 'fast-start' ? 0 : -1,
    capLevelToPlayerSize: quality.mode === 'auto' || quality.mode === 'data-saver',
    enableWorker: true,
    preferManagedMediaSource,
    lowLatencyMode: false,
  };
}

export function levelLabel(level: HlsLevelLike): string {
  const parts: string[] = [];
  if (level.height) parts.push(`${level.height}p`);
  if (level.bitrate) parts.push(`${Math.round(level.bitrate / 1000)} kbps`);
  if (level.name && !parts.includes(level.name)) parts.push(level.name);
  return parts.join(' · ') || 'Variante';
}
