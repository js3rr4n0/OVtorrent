import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Automated accessibility audit (axe-core) over every screen, in both the
 * default mode and TV mode. Serious and critical violations fail the test;
 * everything else is reported in the console for the manual audit.
 */
const ROUTES = [
  '/',
  '/import',
  '/playlists',
  '/history',
  '/settings',
  '/settings/playback',
  '/settings/storage',
  '/settings/tv',
  '/diagnostics',
  '/about',
];

async function audit(page: import('@playwright/test').Page, route: string, label: string) {
  await page.goto(`/#${route}`);
  await page.waitForSelector('main h1');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const minor = results.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
  if (minor.length > 0) {
    console.log(
      `[a11y ${label} ${route}] menores: ${minor.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`,
    );
  }
  expect(
    blocking.map(
      (v) =>
        `${v.id}: ${v.help} → ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
    `${label} ${route}`,
  ).toEqual([]);
}

test.describe('auditoría de accesibilidad', () => {
  for (const route of ROUTES) {
    test(`sin violaciones graves en ${route}`, async ({ page }) => {
      await audit(page, route, 'escritorio');
    });
  }

  test('sin violaciones graves en modo TV y en el reproductor', async ({ page }) => {
    await page.goto('/#/settings/tv');
    await page.getByLabel('Activación').selectOption('on');
    await audit(page, '/settings', 'tv');
    await page.goto('/#/import');
    await page.getByRole('tab', { name: 'URL multimedia' }).click();
    await page.getByLabel('URL de archivo multimedia').fill('https://example.org/a11y.mp4');
    await page.getByRole('button', { name: 'Añadir a la biblioteca' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Añadir' }).click();
    await page.goto('/#/');
    await page.getByRole('link', { name: 'Reproducir' }).first().click();
    await page.waitForSelector('video');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      blocking.map(
        (v) =>
          `${v.id}: ${v.help} → ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(' | ')}`,
      ),
    ).toEqual([]);
  });
});
