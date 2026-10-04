/** Feature detection. Nothing here assumes support: every check is explicit. */

export function hasWebRTC(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return (
    typeof w.RTCPeerConnection === 'function' ||
    typeof w.webkitRTCPeerConnection === 'function' ||
    typeof w.mozRTCPeerConnection === 'function'
  );
}

export function hasRTCDataChannel(): boolean {
  if (!hasWebRTC()) return false;
  try {
    const PC = (window as unknown as { RTCPeerConnection: typeof RTCPeerConnection })
      .RTCPeerConnection;
    return typeof PC.prototype.createDataChannel === 'function';
  } catch {
    return false;
  }
}

export function hasMediaSource(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof w.MediaSource === 'function' || typeof w.WebKitMediaSource === 'function';
}

export function hasManagedMediaSource(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as unknown as Record<string, unknown>).ManagedMediaSource === 'function';
}

export function hasServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

export function hasPictureInPicture(): boolean {
  if (typeof document === 'undefined') return false;
  return 'pictureInPictureEnabled' in document && Boolean(document.pictureInPictureEnabled);
}

export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

export function hasFullscreen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
}

export function hasWebWorkers(): boolean {
  return typeof Worker === 'function';
}

export function hasStorageEstimate(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.storage?.estimate);
}

export function hasWakeLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export interface NetworkInfo {
  effectiveType?: string;
  downlinkMbps?: number;
  saveData?: boolean;
}

export function networkInfo(): NetworkInfo {
  if (typeof navigator === 'undefined') return {};
  const conn = (navigator as unknown as { connection?: Record<string, unknown> }).connection;
  if (!conn) return {};
  return {
    effectiveType: typeof conn.effectiveType === 'string' ? conn.effectiveType : undefined,
    downlinkMbps: typeof conn.downlink === 'number' ? conn.downlink : undefined,
    saveData: typeof conn.saveData === 'boolean' ? conn.saveData : undefined,
  };
}

export function deviceMemoryGb(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' ? mem : undefined;
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number }> {
  try {
    if (!hasStorageEstimate()) return {};
    const est = await navigator.storage.estimate();
    return { usage: est.usage, quota: est.quota };
  } catch {
    return {};
  }
}
