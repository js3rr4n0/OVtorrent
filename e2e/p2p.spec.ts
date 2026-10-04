import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Real browser-to-browser streaming: one context seeds a WebM it records
 * itself, a local WebSocket tracker (bittorrent-tracker, a WebTorrent
 * dependency) introduces the peers, and the application plays the torrent
 * over WebRTC through the Service Worker streaming handler. No public
 * torrents, trackers or network are involved.
 */

interface TrackerLike {
  listen(port: number, host: string, cb: () => void): void;
  close(cb?: () => void): void;
  ws: { address(): { port: number } };
}

let tracker: TrackerLike | null = null;
let trackerUrl = '';

test.beforeAll(async () => {
  const { default: Server } = (await import('bittorrent-tracker/server')) as unknown as {
    default: new (opts: Record<string, unknown>) => TrackerLike;
  };
  tracker = new Server({ udp: false, http: false, ws: true, stats: false });
  await new Promise<void>((resolve) => tracker!.listen(0, '127.0.0.1', resolve));
  trackerUrl = `ws://127.0.0.1:${tracker.ws.address().port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (tracker ? tracker.close(() => resolve()) : resolve()));
});

interface ClipOptions {
  /** Recording length in seconds. */
  seconds: number;
  /** Fill every frame with random pixels so the encoder produces large files. */
  noise?: boolean;
  bitsPerSecond?: number;
}

/**
 * Opens a second browser context that records a VP8 clip with MediaRecorder
 * (no fixtures, no ffmpeg) and seeds it on the local tracker. Returns the
 * magnet URI and the clip size in bytes; the context must be closed by the caller.
 */
async function seedClip(
  browser: Browser,
  baseURL: string | undefined,
  clip: ClipOptions,
): Promise<{ context: BrowserContext; magnet: string; size: number }> {
  const context = await browser.newContext();
  const seeder = await context.newPage();
  await seeder.route('**/wt-lib.js', (route) =>
    route.fulfill({
      path: 'node_modules/webtorrent/dist/webtorrent.min.js',
      contentType: 'text/javascript',
    }),
  );
  await seeder.goto(`${baseURL}/robots.txt`);
  const result = await seeder.evaluate(
    async ({ lib, announce, clip }) => {
      const { default: WebTorrent } = (await import(/* @vite-ignore */ lib)) as {
        default: new (o: Record<string, unknown>) => {
          seed: (
            f: File,
            o: Record<string, unknown>,
            cb: (t: { magnetURI: string }) => void,
          ) => void;
        };
      };
      const canvas = document.createElement('canvas');
      canvas.width = clip.noise ? 640 : 320;
      canvas.height = clip.noise ? 360 : 180;
      const ctx = canvas.getContext('2d')!;
      const recorder = new MediaRecorder(canvas.captureStream(15), {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: clip.bitsPerSecond ?? 300_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      let frame = 0;
      const noise = clip.noise ? ctx.createImageData(canvas.width, canvas.height) : null;
      const timer = setInterval(() => {
        if (noise) {
          // crypto.getRandomValues() is limited to 64 KiB per call.
          for (let i = 0; i < noise.data.length; i += 65536) {
            crypto.getRandomValues(noise.data.subarray(i, Math.min(i + 65536, noise.data.length)));
          }
          ctx.putImageData(noise, 0, 0);
        } else {
          ctx.fillStyle = `hsl(${(frame * 11) % 360}, 80%, 45%)`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = '#fff';
        ctx.font = '48px sans-serif';
        ctx.fillText(String(frame++), 24, 110);
      }, 66);
      recorder.start(250);
      await new Promise((r) => setTimeout(r, clip.seconds * 1000));
      await new Promise<void>((r) => {
        recorder.onstop = () => r();
        recorder.stop();
      });
      clearInterval(timer);
      const file = new File(chunks, 'ovtorrent-e2e.webm', { type: 'video/webm' });
      const client = new WebTorrent({
        dht: false,
        lsd: false,
        utp: false,
        natUpnp: false,
        natPmp: false,
      });
      (window as unknown as { __seeder: unknown }).__seeder = client;
      return new Promise<{ magnet: string; size: number }>((resolve) =>
        client.seed(file, { announce: [announce], name: 'OVtorrent e2e' }, (t) =>
          resolve({ magnet: t.magnetURI, size: file.size }),
        ),
      );
    },
    { lib: `${baseURL}/wt-lib.js`, announce: trackerUrl, clip },
  );
  expect(result.magnet).toMatch(/^magnet:\?xt=urn:btih:/);
  return { context, ...result };
}

/** Imports the magnet with only the local tracker enabled and opens the player. */
async function playMagnet(page: Page, magnet: string, beforeImport?: () => Promise<void>) {
  await page.goto('/#/settings/playback');
  // Only the local tracker: the public defaults are unreachable and irrelevant here.
  await page.getByLabel('Usar los trackers WebSocket públicos por defecto').uncheck();
  await beforeImport?.();
  await page.goto('/#/import');
  await page.getByLabel('Enlace magnet').fill(magnet);
  await page.getByRole('button', { name: 'Añadir a la biblioteca' }).click();
  await page.goto('/#/');
  await page.getByRole('link', { name: 'Reproducir' }).first().click();
  await expect(page.getByText('webtorrent', { exact: true })).toBeVisible({ timeout: 30_000 });
}

const currentTime = (page: Page) =>
  page.evaluate(() => document.querySelector('video')?.currentTime ?? 0);

test('streams a torrent from another browser peer over WebRTC', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { context: seederContext, magnet } = await seedClip(browser, baseURL, { seconds: 6 });

  await playMagnet(page, magnet);
  await expect.poll(() => currentTime(page), { timeout: 60_000 }).toBeGreaterThan(1);
  const peers = await page.evaluate(() => {
    const dt = [...document.querySelectorAll('dt')].find((d) => d.textContent === 'Peers');
    return dt?.nextElementSibling?.textContent ?? '';
  });
  expect(Number(peers)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.querySelector('video')?.getAttribute('src'))).toMatch(
    /\/webtorrent\/[0-9a-f]{40}\//,
  );

  // The streaming handler bounds open-ended ranges: ask for 64 KiB windows and
  // check that "bytes=0-" is answered with exactly that much, full size declared.
  const probe = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    navigator.serviceWorker.controller!.postMessage({
      type: 'ovtorrent-stream-config',
      rangeBytes: 65536,
    });
    await new Promise((r) => setTimeout(r, 300));
    const res = await fetch(video.src, { headers: { Range: 'bytes=0-' } });
    const body = await res.arrayBuffer();
    return {
      status: res.status,
      contentRange: res.headers.get('Content-Range'),
      length: body.byteLength,
    };
  });
  expect(probe.status).toBe(206);
  expect(probe.length).toBe(65536);
  expect(probe.contentRange).toMatch(/^bytes 0-65535\/\d+$/);
  // Playback keeps working across many small ranges (the clip is several of them).
  await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    video.currentTime = 0;
    await video.play();
  });
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(4);
  expect(await page.evaluate(() => document.querySelector('video')?.error)).toBeNull();

  await page.getByRole('button', { name: 'Detener' }).click();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.getAttribute('src')))
    .toBeNull();
  await seederContext.close();
});

test('restarts the torrent in place when the memory limit is hit and keeps playing', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  // Random frames at a high bitrate: comfortably above the 16 MB minimum limit.
  const {
    context: seederContext,
    magnet,
    size,
  } = await seedClip(browser, baseURL, { seconds: 12, noise: true, bitsPerSecond: 30_000_000 });
  expect(size).toBeGreaterThan(18 * 1024 * 1024);

  await playMagnet(page, magnet, async () => {
    await page.evaluate(() => {
      const input = document.getElementById('b-mem') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, String(16 * 1024 * 1024));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.getByText(/Límite de memoria para el búfer: 16/)).toBeVisible();
  });

  await expect(page.getByText(/Reinicios por memoria en esta sesión: [1-9]/)).toBeVisible({
    timeout: 90_000,
  });
  const atRestart = await currentTime(page);
  await expect
    .poll(() => currentTime(page), { timeout: 60_000 })
    .toBeGreaterThan(Math.max(atRestart + 2, 5));
  expect(await page.evaluate(() => document.querySelector('video')?.error)).toBeNull();
  await expect(page.getByText(/No se pudo iniciar la reproducción/)).toHaveCount(0);
  await expect(page.getByText(/Error de red|no pudo decodificar|Formato o fuente no soportada/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Detener' }).click();
  await seederContext.close();
});
