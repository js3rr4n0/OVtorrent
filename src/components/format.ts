export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 KB/s';
  return `${formatBytes(bps)}/s`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es');
  } catch {
    return iso;
  }
}

export const SOURCE_LABELS: Record<string, string> = {
  magnet: 'Magnet',
  torrent: 'Torrent',
  file: 'Archivo local',
  url: 'URL',
  hls: 'HLS',
  m3u: 'M3U',
};
