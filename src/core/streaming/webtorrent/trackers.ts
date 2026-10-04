/**
 * Public WebSocket trackers. They are a dependency of the WebTorrent protocol
 * (the only way a browser can discover peers), not services operated by this
 * application. The user can disable or replace them in Settings → Playback.
 */
export const DEFAULT_WEBSOCKET_TRACKERS: readonly string[] = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
];

export function isWebSocketTracker(url: string): boolean {
  return /^wss?:\/\/[^\s/]+/i.test(url.trim());
}

export function normalizeTrackerList(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const t = raw.trim();
    if (!t || t.length > 512 || !isWebSocketTracker(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}
