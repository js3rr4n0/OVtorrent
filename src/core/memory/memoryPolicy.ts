import type { BufferWindowConfig, Settings } from '../schemas/settings';
import { BUFFER_PRESET_VALUES, resolveBufferWindow } from '../schemas/settings';
import { deviceMemoryGb } from '../streaming/capabilities';

export const LOW_MEMORY_GB = 2;
export const LOW_MEMORY_BUFFER_BYTES = 64 * 1024 * 1024;

export interface MemoryProfile {
  deviceMemoryGb?: number;
  /** JS heap in use when the browser exposes performance.memory (Chromium). */
  usedJsHeapBytes?: number;
  jsHeapLimitBytes?: number;
  lowMemory: boolean;
}

export function readMemoryProfile(): MemoryProfile {
  const mem = deviceMemoryGb();
  const perf = (
    globalThis.performance as unknown as
      { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } } | undefined
  )?.memory;
  return {
    deviceMemoryGb: mem,
    usedJsHeapBytes: perf?.usedJSHeapSize,
    jsHeapLimitBytes: perf?.jsHeapSizeLimit,
    lowMemory: mem !== undefined && mem <= LOW_MEMORY_GB,
  };
}

export interface EffectiveBufferPlan {
  window: BufferWindowConfig;
  memoryLimitBytes: number;
  /** Explanation shown to the user when the plan was reduced automatically. */
  adjustedReason?: string;
}

/**
 * Buffer plan actually applied to a session: the user's settings, reduced on
 * low-memory devices when "autoLowMemory" is on. Never silently: the reason
 * is reported through session warnings.
 */
export function planBuffer(
  settings: Settings,
  profile: MemoryProfile = readMemoryProfile(),
): EffectiveBufferPlan {
  const window = resolveBufferWindow(settings);
  const limit = settings.buffer.memoryLimitBytes;
  if (!settings.buffer.autoLowMemory || !profile.lowMemory)
    return { window, memoryLimitBytes: limit };
  const saver = BUFFER_PRESET_VALUES['data-saver'];
  const reduced: BufferWindowConfig = {
    initialSeconds: Math.min(window.initialSeconds, saver.initialSeconds),
    aheadSeconds: Math.min(window.aheadSeconds, saver.aheadSeconds),
    behindSeconds: Math.min(window.behindSeconds, saver.behindSeconds),
  };
  const reducedLimit = Math.min(limit, LOW_MEMORY_BUFFER_BYTES);
  const changed =
    reducedLimit !== limit ||
    reduced.aheadSeconds !== window.aheadSeconds ||
    reduced.initialSeconds !== window.initialSeconds ||
    reduced.behindSeconds !== window.behindSeconds;
  return {
    window: reduced,
    memoryLimitBytes: reducedLimit,
    adjustedReason: changed
      ? `Dispositivo con poca memoria (${profile.deviceMemoryGb} GB): se aplica la ventana «Ahorro de datos» y un límite de ${Math.round(reducedLimit / 1024 / 1024)} MB. Puedes desactivarlo en Ajustes → Calidad y búfer.`
      : undefined,
  };
}
