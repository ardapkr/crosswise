// Demo walk (?demo=1): simulated GPS along the recommended real route, crossing alerts spoken.
import { test, expect } from '@playwright/test';
import { fakeSpeech, mockOrs } from './helpers.js';

test('demo walk announces crossings and arrival, then returns to the planner', async ({ page }) => {
  test.setTimeout(60_000);
  await fakeSpeech(page);
  await mockOrs(page);
  // speed=60 m/s and start 1450 m into the route, so the last ~780 m take ~13 s
  await page.goto('/?demo=1&speed=60&at=1450');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);

  await page.locator('#routes > li').first().getByRole('button', { name: /Start the Recommended route/ }).click();
  await expect(page.locator('#nav-section')).toBeVisible();
  await expect(page.locator('#where-section')).toBeHidden();
  await expect(page.locator('#nav-next')).not.toHaveText('Waiting for your location…');

  await page.waitForFunction(() => window.__guide?.arrived === true, null, { timeout: 30_000 });
  const spoken = await page.evaluate(() => window.__spoken);
  const crossingsNow = spoken.filter((t) => t.startsWith('Crossing now'));
  expect(crossingsNow.length).toBeGreaterThanOrEqual(3);
  expect(spoken.some((t) => t.includes('Press the button under the box'))).toBe(true);
  expect(spoken.some((t) => t.startsWith('Crossing now: zebra crossing'))).toBe(true);
  expect(spoken.join(' ')).not.toMatch(/safe to cross/i);
  expect(spoken.at(-1)).toBe('You have arrived at your destination.');

  await expect(page.locator('#where-section')).toBeVisible({ timeout: 8000 });
});

test('stop button ends guidance and speaks it', async ({ page }) => {
  await fakeSpeech(page);
  await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await page.locator('#routes > li').first().getByRole('button', { name: /Start the/ }).click();
  await expect(page.locator('#nav-section')).toBeVisible();
  await page.getByRole('button', { name: 'Stop route' }).click();
  await expect(page.locator('#nav-section')).toBeHidden();
  await expect(page.locator('#status')).toHaveText('Route stopped.');
});

test('real GPS mode: mocked position at HOIV starts guidance with the first instruction', async ({ page, context }) => {
  await fakeSpeech(page);
  await mockOrs(page);
  await context.setGeolocation({ latitude: 48.17612, longitude: 16.39519 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await page.locator('#routes > li').first().getByRole('button', { name: /Start the/ }).click();
  await expect.poll(() => page.evaluate(() => window.__spoken.join(' | '))).toContain('Head south on Hüttenbrennergasse');
  await expect(page.locator('#nav-remaining')).toContainText('left');
});
