import { z } from 'zod';

export const BUFFER_PRESETS = ['data-saver', 'balanced', 'stable-4k', 'custom'] as const;
export type BufferPreset = (typeof BUFFER_PRESETS)[number];

export const bufferWindowSchema = z
  .object({
    /** Seconds requested before playback starts. */
    initialSeconds: z.number().int().min(1).max(600),
    /** Seconds kept ahead of the current position. */
    aheadSeconds: z.number().int().min(1).max(1800),
    /** Seconds kept behind the current position. */
    behindSeconds: z.number().int().min(0).max(600),
  })
  .strict();
export type BufferWindowConfig = z.infer<typeof bufferWindowSchema>;

export const BUFFER_PRESET_VALUES: Record<Exclude<BufferPreset, 'custom'>, BufferWindowConfig> = {
  'data-saver': { initialSeconds: 15, aheadSeconds: 45, behindSeconds: 5 },
  balanced: { initialSeconds: 30, aheadSeconds: 90, behindSeconds: 15 },
  'stable-4k': { initialSeconds: 60, aheadSeconds: 180, behindSeconds: 30 },
};

/** Hard ceiling for temporary buffers held in memory (bytes). */
export const MAX_MEMORY_BUFFER_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MEMORY_BUFFER_BYTES = 256 * 1024 * 1024;

export const QUALITY_MODES = ['auto', 'data-saver', 'balanced', 'max'] as const;
export const RESOLUTIONS = ['auto', '480p', '720p', '1080p', '1440p', '2160p'] as const;
export const QUALITY_PRIORITIES = ['stability', 'quality', 'fast-start'] as const;

export const qualitySettingsSchema = z
  .object({
    mode: z.enum(QUALITY_MODES),
    preferredResolution: z.enum(RESOLUTIONS),
    /** kbps, 0 = unlimited */
    maxBitrateKbps: z.number().int().min(0).max(200_000),
    /** kbps, 0 = no minimum */
    minBitrateKbps: z.number().int().min(0).max(200_000),
    priority: z.enum(QUALITY_PRIORITIES),
  })
  .strict();
export type QualitySettings = z.infer<typeof qualitySettingsSchema>;

export const BUFFER_STORE_KINDS = ['no-persistence', 'memory', 'indexeddb'] as const;
export type BufferStoreKind = (typeof BUFFER_STORE_KINDS)[number];

export const THEMES = ['system', 'dark', 'light'] as const;

export const settingsSchema = z
  .object({
    version: z.literal(1),
    theme: z.enum(THEMES),
    language: z.literal('es'),
    player: z
      .object({
        autoplayNext: z.boolean(),
        defaultVolume: z.number().min(0).max(1),
        defaultRate: z.number().min(0.25).max(4),
        rememberProgress: z.boolean(),
        showDiagnosticsOverlay: z.boolean(),
      })
      .strict(),
    quality: qualitySettingsSchema,
    buffer: z
      .object({
        preset: z.enum(BUFFER_PRESETS),
        custom: bufferWindowSchema,
        storeKind: z.enum(BUFFER_STORE_KINDS),
        memoryLimitBytes: z
          .number()
          .int()
          .min(16 * 1024 * 1024)
          .max(MAX_MEMORY_BUFFER_BYTES),
        /** Assumed bitrate used only for the on-screen space estimate (kbps). */
        estimateBitrateKbps: z.number().int().min(100).max(200_000),
        maxPeers: z.number().int().min(1).max(200),
        maxConcurrentRequests: z.number().int().min(1).max(64),
      })
      .strict(),
    tv: z
      .object({
        mode: z.enum(['auto', 'on', 'off']),
        hideDiagnostics: z.boolean(),
        largeText: z.boolean(),
        highContrast: z.boolean(),
      })
      .strict(),
    privacy: z
      .object({
        confirmExternalUrls: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: 'system',
  language: 'es',
  player: {
    autoplayNext: true,
    defaultVolume: 1,
    defaultRate: 1,
    rememberProgress: true,
    showDiagnosticsOverlay: false,
  },
  quality: {
    mode: 'auto',
    preferredResolution: 'auto',
    maxBitrateKbps: 0,
    minBitrateKbps: 0,
    priority: 'stability',
  },
  buffer: {
    preset: 'balanced',
    custom: { ...BUFFER_PRESET_VALUES.balanced },
    storeKind: 'no-persistence',
    memoryLimitBytes: DEFAULT_MEMORY_BUFFER_BYTES,
    estimateBitrateKbps: 5000,
    maxPeers: 30,
    maxConcurrentRequests: 8,
  },
  tv: { mode: 'auto', hideDiagnostics: false, largeText: true, highContrast: true },
  privacy: { confirmExternalUrls: true },
};

export function resolveBufferWindow(settings: Settings): BufferWindowConfig {
  return settings.buffer.preset === 'custom'
    ? settings.buffer.custom
    : BUFFER_PRESET_VALUES[settings.buffer.preset];
}

/**
 * Rough temporary-space estimate. The real figure varies with codec,
 * container, piece size and protocol overhead.
 */
export function estimateBufferBytes(bitrateKbps: number, window: BufferWindowConfig): number {
  const seconds = window.aheadSeconds + window.behindSeconds;
  return Math.round((bitrateKbps * 1000 * seconds) / 8);
}
