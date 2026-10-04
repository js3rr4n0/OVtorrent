/**
 * Minimal typings for the prebuilt browser bundle of WebTorrent (v3).
 * Only the surface used by OVtorrent is declared; everything else is `unknown`.
 */
declare module 'webtorrent/dist/webtorrent.min.js' {
  import type { WebTorrentClientConstructor } from '@/core/streaming/webtorrent/types';
  const WebTorrent: WebTorrentClientConstructor;
  export default WebTorrent;
}
