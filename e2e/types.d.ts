declare module 'bittorrent-tracker/server';
declare module '*/bridge/src/bridge.mjs' {
  export function createBridge(options: Record<string, unknown>): Promise<{
    client: unknown;
    infoHash: string;
    peers: Set<unknown>;
    addMagnet(magnet: string): Promise<{ ok: boolean; infoHash?: string; message?: string }>;
    status(): unknown;
    destroy(): Promise<void>;
  }>;
}
declare module 'webtorrent';
