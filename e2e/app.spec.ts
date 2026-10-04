import { expect, test } from '@playwright/test';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

test.describe('OVtorrent static PWA', () => {
  test('loads the library with hash routing and no backend calls', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Biblioteca local' })).toBeVisible();
    await page.getByRole('link', { name: 'Importar', exact: true }).click();
    await expect(page).toHaveURL(/#\/import$/);
    // Every request stays on the static origin: no API, no third party.
    for (const url of requests) expect(url.startsWith('http://127.0.0.1:4173')).toBe(true);
  });

  test('deep links reload correctly on a static host', async ({ page }) => {
    await page.goto('/#/settings/playback');
    await expect(page.getByRole('heading', { name: 'Calidad y búfer' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Calidad y búfer' })).toBeVisible();
  });

  test('imports a magnet, persists it locally and starts the P2P engine', async ({ page }) => {
    await page.goto('/#/import');
    await page
      .getByLabel('Enlace magnet')
      .fill(`magnet:?xt=urn:btih:${HASH}&dn=Demo&tr=wss://tracker.example/announce`);
    await page.getByRole('button', { name: 'Añadir a la biblioteca' }).click();
    await expect(page.getByText(/añadido a la biblioteca/)).toBeVisible();
    await page.goto('/#/');
    await expect(page.getByRole('link', { name: 'Demo' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Demo' })).toBeVisible();
    await page.getByRole('link', { name: 'Reproducir' }).first().click();
    // The engine loads, registers the streaming worker and starts looking for peers.
    await expect(page.getByText('webtorrent', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/buscando peers compatibles con WebRTC/)).toBeVisible();
  });

  test('creates a playlist and exports it as JSON', async ({ page }) => {
    await page.goto('/#/playlists');
    await page.getByLabel('Nueva playlist').fill('Mi lista');
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('link', { name: 'Mi lista' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar' }).first().click();
    expect((await download).suggestedFilename()).toBe('Mi_lista.json');
  });

  test('D-pad navigation works in TV mode and Escape goes back', async ({ page }) => {
    await page.goto('/#/settings/tv');
    await page.getByLabel('Activación').selectOption('on');
    await expect(page.locator('html')).toHaveClass(/tv-mode/);
    await page.goto('/#/settings');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'SELECT', 'INPUT']).toContain(focused);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Modo TV y TV boxes' })).toBeVisible();
  });

  test('clears all local data after confirmation', async ({ page }) => {
    await page.goto('/#/import');
    await page.getByLabel('Enlace magnet').fill(`magnet:?xt=urn:btih:${HASH}`);
    await page.getByRole('button', { name: 'Añadir a la biblioteca' }).click();
    await page.goto('/#/settings/storage');
    await expect(page.getByText('Biblioteca: 1 elementos')).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar toda la información local' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Biblioteca: 0 elementos')).toBeVisible();
    expect(
      await page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith('ovtorrent:')).length,
      ),
    ).toBe(0);
  });

  test('the interface keeps working offline', async ({ page, context }) => {
    await page.goto('/#/');
    // Let the Service Worker install, precache the whole shell and activate.
    await page.waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active?.state !== 'activated' || reg.installing) return false;
        const keys = await caches.keys();
        const precache = keys.find((k) => k.includes('precache'));
        if (!precache) return false;
        const cache = await caches.open(precache);
        return (await cache.keys()).length >= 20;
      },
      null,
      { timeout: 20_000 },
    );
    // clientsClaim makes the active worker control this page without a reload.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { name: 'Biblioteca local' })).toBeVisible();
    await context.setOffline(true);
    await page.goto('/#/about');
    await expect(page.getByRole('heading', { name: 'Acerca de OVtorrent' })).toBeVisible();
    await expect(page.getByText(/Sin conexión/)).toBeVisible();
    await context.setOffline(false);
  });

  test('diagnostics page reports real capabilities', async ({ page }) => {
    await page.goto('/#/diagnostics');
    await expect(page.getByText('WebRTC (RTCPeerConnection)')).toBeVisible();
    await expect(page.getByText('MP4 H.264/AAC')).toBeVisible();
  });
});
