/**
 * OVtorrent — streaming handler for WebTorrent's BrowserServer.
 *
 * Readable re-implementation of the protocol in webtorrent/dist/sw.min.js
 * (MIT). It is imported into the app-shell Service Worker on production
 * builds (Workbox `importScripts`) and registered on its own during
 * development. Unlike the upstream file it never calls skipWaiting(), so the
 * PWA update prompt keeps working.
 *
 * Flow: the page sets <video src="<scope>webtorrent/<infoHash>/<path>">.
 * This worker asks the window client (where the WebTorrent client lives) for
 * the response over a MessageChannel and streams the chunks it receives.
 * Nothing here touches the network and nothing is cached.
 *
 * Media elements ask for open-ended ranges ("bytes=N-"), which would make
 * WebTorrent select every piece up to the end of the file. The worker bounds
 * each range to `maxRangeBytes` (about the future buffer window; the page
 * updates it with an `ovtorrent-stream-config` message) and answers with a
 * 206 whose Content-Range still carries the full size, so the element simply
 * asks for the next range when it needs more.
 */
(() => {
  'use strict';
  let cancelSupported = false;
  const STREAM_PULL_TIMEOUT_MS = 5000;
  const DEFAULT_RANGE_BYTES = 16 * 1024 * 1024;
  const MIN_RANGE_BYTES = 64 * 1024;
  let maxRangeBytes = DEFAULT_RANGE_BYTES;

  self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'ovtorrent-stream-config') return;
    const bytes = Number(data.rangeBytes);
    if (Number.isFinite(bytes) && bytes >= MIN_RANGE_BYTES) maxRangeBytes = Math.floor(bytes);
  });

  /** "bytes=N-" or an oversized "bytes=N-M" becomes "bytes=N-(N+maxRangeBytes-1)". */
  function boundRange(value) {
    const match = /^\s*bytes=(\d+)-(\d*)\s*$/i.exec(value || '');
    if (!match) return value;
    const start = Number(match[1]);
    const limit = start + maxRangeBytes - 1;
    if (match[2] !== '' && Number(match[2]) <= limit) return value;
    return `bytes=${start}-${limit}`;
  }

  const prefix = () => self.registration.scope + 'webtorrent/';

  async function askWindow(request) {
    const { url, method, destination } = request;
    const headers = Object.fromEntries(request.headers.entries());
    if (headers.range && destination !== 'document') headers.range = boundRange(headers.range);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return new Promise((resolve) => {
      for (const client of clients) {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = ({ data }) => resolve([data, port1]);
        client.postMessage(
          {
            url,
            method,
            headers,
            scope: self.registration.scope,
            destination,
            type: 'webtorrent',
          },
          [port2],
        );
      }
    });
  }

  async function streamResponse(event) {
    const [meta, port] = await askWindow(event.request);
    let timer = null;
    const finish = () => {
      port.postMessage(false);
      clearTimeout(timer);
      port.onmessage = null;
    };
    if (meta.body !== 'STREAM') {
      finish();
      return new Response(meta.body, meta);
    }
    const destination = event.request.destination;
    const body = new ReadableStream({
      pull: (controller) =>
        new Promise((done) => {
          port.onmessage = ({ data }) => {
            if (data) controller.enqueue(data);
            else {
              finish();
              controller.close();
            }
            done();
          };
          if (!cancelSupported) {
            clearTimeout(timer);
            // Browsers that cannot cancel a worker stream would otherwise keep
            // pulling forever after the media element let go of the request.
            if (destination !== 'document') {
              timer = setTimeout(() => {
                finish();
                done();
              }, STREAM_PULL_TIMEOUT_MS);
            }
          }
          port.postMessage(true);
        }),
      cancel() {
        finish();
      },
    });
    return new Response(body, meta);
  }

  self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    if (!url.includes(prefix())) return;
    if (url.includes(prefix() + 'keepalive/')) {
      event.respondWith(new Response());
      return;
    }
    if (url.includes(prefix() + 'cancel/')) {
      event.respondWith(
        new Response(
          new ReadableStream({
            cancel() {
              cancelSupported = true;
            },
          }),
        ),
      );
      return;
    }
    event.respondWith(streamResponse(event));
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });
})();
