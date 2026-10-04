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

export const MAX_TRACKERS = 20;

export const p2pSettingsSchema = z
  .object({
    /** Use the public WebSocket trackers bundled as protocol defaults. */
    useDefaultTrackers: z.boolean(),
    /** Extra WebSocket trackers (ws:// or wss://) added by the user. */
    customTrackers: z.array(z.string().max(512)).max(MAX_TRACKERS),
    /** Seed pieces back to other peers while playing (BitTorrent reciprocity). */
    uploadEnabled: z.boolean(),
    /** Seconds without peers before the player shows the no-peers notice. */
    noPeersTimeoutSeconds: z.number().int().min(5).max(300),
    /** Restart the torrent (freeing memory) when downloaded data exceeds the memory limit. */
    restartOnMemoryLimit: z.boolean(),
  })
  .strict();
export type P2pSettings = z.infer<typeof p2pSettingsSchema>;

export const DEFAULT_P2P_SETTINGS: P2pSettings = {
  useDefaultTrackers: true,
  customTrackers: [],
  uploadEnabled: true,
  noPeersTimeoutSeconds: 30,
  restartOnMemoryLimit: true,
};

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
        /** Reduce window and memory limit automatically on devices with ≤ 2 GB. */
        autoLowMemory: z.boolean().optional().default(true),
      })
      .strict(),
    tv: z
      .object({
        mode: z.enum(['auto', 'on', 'off']),
        hideDiagnostics: z.boolean(),
        largeText: z.boolean(),
        highContrast: z.boolean(),
        /** Show only the essential player controls in TV mode (the rest behind "Más"). */
        simplifiedPlayer: z.boolean().optional().default(true),
        /** Move focus to the play button when the player opens in TV mode. */
        autoFocusPlayer: z.boolean().optional().default(true),
      })
      .strict(),
    privacy: z
      .object({
        confirmExternalUrls: z.boolean(),
      })
      .strict(),
    p2p: p2pSettingsSchema.optional().default(DEFAULT_P2P_SETTINGS),
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
    autoLowMemory: true,
  },
  tv: {
    mode: 'auto',
    hideDiagnostics: false,
    largeText: true,
    highContrast: true,
    simplifiedPlayer: true,
    autoFocusPlayer: true,
  },
  privacy: { confirmExternalUrls: true },
  p2p: DEFAULT_P2P_SETTINGS,
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
