import { expect, test } from '@playwright/test';

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

test('streams a torrent from another browser peer over WebRTC', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const seederContext = await browser.newContext();
  const seeder = await seederContext.newPage();
  await seeder.route('**/wt-lib.js', (route) =>
    route.fulfill({
      path: 'node_modules/webtorrent/dist/webtorrent.min.js',
      contentType: 'text/javascript',
    }),
  );
  await seeder.goto(`${baseURL}/robots.txt`);
  const magnet = await seeder.evaluate(
    async ({ lib, announce }) => {
      const { default: WebTorrent } = (await import(/* @vite-ignore */ lib)) as {
        default: new (o: Record<string, unknown>) => {
          seed: (
            f: File,
            o: Record<string, unknown>,
            cb: (t: { magnetURI: string }) => void,
          ) => void;
        };
      };
      // Record a short VP8 clip with the browser itself: no fixtures, no ffmpeg.
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      const recorder = new MediaRecorder(canvas.captureStream(15), {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 300_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      let frame = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = `hsl(${(frame * 11) % 360}, 80%, 45%)`;
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = '#fff';
        ctx.font = '48px sans-serif';
        ctx.fillText(String(frame++), 24, 110);
      }, 66);
      recorder.start(250);
      await new Promise((r) => setTimeout(r, 6000));
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
      return new Promise<string>((resolve) =>
        client.seed(file, { announce: [announce], name: 'OVtorrent e2e' }, (t) =>
          resolve(t.magnetURI),
        ),
      );
    },
    { lib: `${baseURL}/wt-lib.js`, announce: trackerUrl },
  );
  expect(magnet).toMatch(/^magnet:\?xt=urn:btih:/);

  await page.goto('/#/settings/playback');
  // Only the local tracker: the public defaults are unreachable and irrelevant here.
  await page.getByLabel('Usar los trackers WebSocket públicos por defecto').uncheck();
  await page.goto('/#/import');
  await page.getByLabel('Enlace magnet').fill(magnet);
  await page.getByRole('button', { name: 'Añadir a la biblioteca' }).click();
  await page.goto('/#/');
  await page.getByRole('link', { name: 'Reproducir' }).first().click();

  await expect(page.getByText('webtorrent', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);
  const peers = await page.evaluate(() => {
    const dt = [...document.querySelectorAll('dt')].find((d) => d.textContent === 'Peers');
    return dt?.nextElementSibling?.textContent ?? '';
  });
  expect(Number(peers)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.querySelector('video')?.getAttribute('src'))).toMatch(
    /\/webtorrent\/[0-9a-f]{40}\//,
  );

  await page.getByRole('button', { name: 'Detener' }).click();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.getAttribute('src')))
    .toBeNull();
  await seederContext.close();
});
