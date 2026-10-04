import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The "paste a magnet and play" promise, end to end and offline:
 *  - a local tracker speaks HTTP (classic peers) and WebSocket (web peers);
 *  - a classic Node seeder (TCP only, no WebRTC) has the video;
 *  - the self-hosted bridge (Node + WebRTC) is paired with a code;
 *  - the browser pastes a magnet that only names the classic tracker. The
 *    engine asks the bridge for it, the bridge fetches it over TCP and seeds
 *    it back to the browser over WebRTC, and the video plays.
 */

interface TrackerLike {
  listen(port: number, host: string, cb: () => void): void;
  close(cb?: () => void): void;
  http: { address(): { port: number } };
}
interface NodeTorrent {
  magnetURI: string;
  infoHash: string;
  numPeers: number;
  on(event: string, cb: (...args: unknown[]) => void): void;
}
interface NodeClient {
  seed(input: Buffer, opts: Record<string, unknown>, cb: (t: NodeTorrent) => void): void;
  destroy(cb: () => void): void;
}
interface BridgeLike {
  peers: Set<unknown>;
  destroy(): Promise<void>;
}

let tracker: TrackerLike | null = null;
let httpTracker = '';
let wsTracker = '';
let seeder: NodeClient | null = null;
let bridge: BridgeLike | null = null;
let dir = '';

test.beforeAll(async () => {
  const { default: Server } = (await import('bittorrent-tracker/server')) as unknown as {
    default: new (opts: Record<string, unknown>) => TrackerLike;
  };
  tracker = new Server({ udp: false, http: true, ws: true, stats: false });
  await new Promise<void>((resolve) => tracker!.listen(0, '127.0.0.1', resolve));
  const port = tracker.http.address().port;
  httpTracker = `http://127.0.0.1:${port}/announce`;
  wsTracker = `ws://127.0.0.1:${port}`;
  dir = mkdtempSync(join(tmpdir(), 'ovtorrent-bridge-'));
});

test.afterAll(async () => {
  await bridge?.destroy();
  await new Promise<void>((resolve) => (seeder ? seeder.destroy(resolve) : resolve()));
  await new Promise<void>((resolve) => (tracker ? tracker.close(() => resolve()) : resolve()));
  rmSync(dir, { recursive: true, force: true });
});

test('plays a classic-swarm magnet through the self-hosted bridge', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  // 1. Record a clip in a throwaway browser context (no fixtures, no ffmpeg).
  const ctx = await browser.newContext();
  const recorderPage = await ctx.newPage();
  await recorderPage.goto(`${baseURL}/robots.txt`);
  const base64 = await recorderPage.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const g = canvas.getContext('2d')!;
    const rec = new MediaRecorder(canvas.captureStream(15), {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 300_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let f = 0;
    const timer = setInterval(() => {
      g.fillStyle = `hsl(${(f * 13) % 360}, 70%, 45%)`;
      g.fillRect(0, 0, 320, 180);
      g.fillStyle = '#fff';
      g.font = '48px sans-serif';
      g.fillText(String(f++), 24, 110);
    }, 66);
    rec.start(250);
    await new Promise((r) => setTimeout(r, 6000));
    await new Promise<void>((r) => {
      rec.onstop = () => r();
      rec.stop();
    });
    clearInterval(timer);
    const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
    let s = '';
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s);
  });
  await ctx.close();
  const video = Buffer.from(base64, 'base64');
  expect(video.length).toBeGreaterThan(10_000);

  // 2. Classic seeder: Node WebTorrent without WebRTC, HTTP tracker only.
  const { default: WebTorrent } = (await import('webtorrent')) as unknown as {
    default: new (o: Record<string, unknown>) => NodeClient;
  };
  seeder = new WebTorrent({
    tracker: { wrtc: false },
    dht: false,
    lsd: false,
    utp: false,
    natUpnp: false,
    natPmp: false,
    webSeeds: false,
  });
  const seeded = await new Promise<NodeTorrent>((resolve) =>
    seeder!.seed(
      Object.assign(video, { name: 'bridge-e2e.webm' }),
      { name: 'bridge-e2e.webm', announce: [httpTracker], private: true },
      resolve,
    ),
  );
  const classicMagnet = `magnet:?xt=urn:btih:${seeded.infoHash}&dn=bridge-e2e.webm&tr=${encodeURIComponent(httpTracker)}`;

  // 3. The bridge: Node + node-datachannel, paired with a code, using the local WebSocket tracker.
  const { createBridge } = (await import('../bridge/src/bridge.mjs')) as unknown as {
    createBridge: (o: Record<string, unknown>) => Promise<BridgeLike>;
  };
  const code = 'e2e-bridge-code';
  const logs: string[] = [];
  bridge = await createBridge({
    code,
    dir,
    trackers: [wsTracker],
    name: 'bridge-e2e',
    log: (l: string) => logs.push(l),
  });

  // 4. Browser: only the local tracker, pair with the code, paste the magnet, play.
  await page.goto('/#/settings/playback');
  await page.getByLabel('Usar los trackers WebSocket públicos por defecto').uncheck();
  await page.getByLabel('Trackers WebSocket adicionales (uno por línea)').fill(wsTracker);
  await page.getByRole('button', { name: 'Guardar trackers' }).click();
  await page.getByLabel('Código de emparejamiento').fill(code);
  await expect(page.getByText(/conectado \(bridge-e2e\)/)).toBeVisible({ timeout: 60_000 });

  await page.goto('/#/import');
  await page.getByLabel('Enlace magnet').fill(classicMagnet);
  await page.getByRole('button', { name: 'Añadir a la biblioteca' }).click();
  await page.goto('/#/');
  await page.getByRole('link', { name: 'Reproducir' }).first().click();

  await expect(page.getByText(/Puente bridge-e2e/)).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0), {
      timeout: 90_000,
    })
    .toBeGreaterThan(1);
  expect(logs.join('\n')).toMatch(/añadido/);
  expect(logs.join('\n')).toMatch(/peer tcpOutgoing/);
  expect(logs.join('\n')).toMatch(/peer webrtc/);
  expect(await page.evaluate(() => document.querySelector('video')?.getAttribute('src'))).toMatch(
    /\/webtorrent\//,
  );
});
