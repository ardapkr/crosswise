// The visual map: routes + coloured crossings, walker dot while walking. Hidden from assistive tech.
import { test, expect } from '@playwright/test';
import { fakeSpeech, mockOrs } from './helpers.js';

test('map shows the 3 routes and the recommended route’s crossings, then follows the walker', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort()); // no map tiles needed
  await fakeSpeech(page);
  await mockOrs(page);
  await page.goto('/?demo=1&speed=40');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#map-box')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__map)).toEqual({ routes: 3, crossings: 9 });
  await expect(page.locator('#map-box')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#map-box').evaluate((el) => el.inert)).toBe(true);
  await expect(page.locator('#map-box path.leaflet-interactive')).toHaveCount(3 + 9 + 2); // 3 lines, 9 crossings, start + end

  await page.locator('#routes > li').first().getByRole('button', { name: /Start the/ }).click();
  await expect(page.locator('#nav-section #map-box')).toBeVisible(); // the map moved into the walking panel
  const a = await page.evaluate(() => window.__walker);
  await page.waitForTimeout(600);
  const b = await page.evaluate(() => window.__walker);
  expect(a).toBeTruthy();
  expect(b).not.toEqual(a); // the dot moves
});

test('the app still works when the map library cannot load', async ({ page }) => {
  await page.route('**/vendor/leaflet/leaflet.min.js', (route) => route.abort());
  await fakeSpeech(page);
  await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await expect(page.locator('#map-box')).toBeHidden();
});
