import {
  runDecodeProbes,
  summarizeProbes,
  type DecodeProbeResult,
} from '@/core/compat/mediaCapabilities';
import { readMemoryProfile, type MemoryProfile } from '@/core/memory/memoryPolicy';
import { parseWorker } from '@/workers/workerClient';

export interface ExtendedReport {
  memory: MemoryProfile;
  worker: { mode: 'worker' | 'main-thread'; roundTripMs: number | null; error?: string };
  storagePersisted: boolean | null;
  serviceWorker: { registered: boolean; controlling: boolean; state?: string };
  decode: DecodeProbeResult[];
  decodeSummary: string[];
}

export async function collectExtendedReport(): Promise<ExtendedReport> {
  const memory = readMemoryProfile();
  let worker: ExtendedReport['worker'] = { mode: parseWorker.mode(), roundTripMs: null };
  try {
    const t = performance.now();
    await parseWorker.run({ kind: 'ping' });
    worker = {
      mode: parseWorker.mode(),
      roundTripMs: Math.round((performance.now() - t) * 10) / 10,
    };
  } catch (err) {
    worker = {
      mode: parseWorker.mode(),
      roundTripMs: null,
      error: err instanceof Error ? err.message : 'error',
    };
  }
  let storagePersisted: boolean | null = null;
  try {
    storagePersisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    storagePersisted = null;
  }
  let serviceWorker: ExtendedReport['serviceWorker'] = { registered: false, controlling: false };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      serviceWorker = {
        registered: Boolean(reg),
        controlling: Boolean(navigator.serviceWorker.controller),
        state: reg?.active?.state ?? reg?.installing?.state ?? reg?.waiting?.state,
      };
    }
  } catch {
    /* ignore */
  }
  const decode = await runDecodeProbes();
  return {
    memory,
    worker,
    storagePersisted,
    serviceWorker,
    decode,
    decodeSummary: summarizeProbes(decode),
  };
}
