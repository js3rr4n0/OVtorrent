import type { WebTorrentClientConstructor, WtClient, WtClientOptions } from './types';

let constructorPromise: Promise<WebTorrentClientConstructor> | null = null;
let client: WtClient | null = null;

/** Loads the WebTorrent browser bundle lazily (separate chunk, ~220 KB). */
export function loadWebTorrentConstructor(): Promise<WebTorrentClientConstructor> {
  constructorPromise ??= import('webtorrent/dist/webtorrent.min.js').then((m) => m.default);
  return constructorPromise;
}

/** One client per page: peers and trackers are shared by consecutive sessions. */
export async function getSharedClient(options: WtClientOptions): Promise<WtClient> {
  if (client && !client.destroyed) return client;
  const WebTorrent = await loadWebTorrentConstructor();
  client = new WebTorrent({
    dht: false, // not possible in browsers anyway
    lsd: false,
    utp: false,
    natUpnp: false,
    natPmp: false,
    ...options,
  });
  return client;
}

export function destroySharedClient(): Promise<void> {
  return new Promise((resolve) => {
    const c = client;
    client = null;
    if (!c || c.destroyed) return resolve();
    c.destroy(() => resolve());
  });
}

const SW_FILE = 'webtorrent-sw.js';

function waitForActive(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (reg.active?.state === 'activated') return resolve();
    const worker = reg.installing ?? reg.waiting ?? reg.active;
    if (!worker) return reject(new Error('No hay Service Worker en la registración'));
    const timer = setTimeout(
      () => reject(new Error('El Service Worker tardó demasiado en activarse')),
      timeoutMs,
    );
    const onChange = () => {
      if (worker.state === 'activated') {
        clearTimeout(timer);
        worker.removeEventListener('statechange', onChange);
        resolve();
      } else if (worker.state === 'redundant') {
        clearTimeout(timer);
        reject(new Error('El Service Worker quedó redundante'));
      }
    };
    worker.addEventListener('statechange', onChange);
  });
}

function waitForController(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (navigator.serviceWorker.controller) return resolve();
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            'La página no está controlada por el Service Worker. Recarga la página e inténtalo de nuevo.',
          ),
        ),
      timeoutMs,
    );
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Returns the Service Worker registration that serves `webtorrent/` URLs.
 * In production that is the app-shell worker (which imports the handler);
 * in development, where the PWA worker is disabled, the handler is registered
 * on its own at the same scope.
 */
export async function getStreamingRegistration(
  timeoutMs = 15_000,
): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador no soporta Service Worker');
  const scope = new URL('./', document.baseURI);
  let reg = await navigator.serviceWorker.getRegistration(scope.toString());
  if (!reg) {
    reg = await navigator.serviceWorker.register(new URL(SW_FILE, document.baseURI).toString(), {
      scope: scope.toString(),
    });
  }
  await waitForActive(reg, timeoutMs);
  await waitForController(timeoutMs);
  return reg;
}
