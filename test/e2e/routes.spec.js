// Route comparison UI. ORS is mocked with REAL saved responses; crossings come from the real
// Vienna snapshot via the local /api/crossings (no API key needed).
import { test, expect } from '@playwright/test';
import { mockOrs, mockTransit } from './helpers.js';

test('quick destination → safest route first, shortest route marked, summary spoken', async ({ page }) => {
  await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();

  const cards = page.locator('#routes > li');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator('h3')).toHaveText(/^Recommended: 27 min/);
  await expect(page.locator('#routes h3', { hasText: 'Shortest' })).toHaveText(/Shortest: 26 min/);
  await expect(cards.nth(0)).toHaveClass(/level-caution/);
  await expect(page.locator('#routes li', { hasText: 'Shortest' })).toHaveClass(/level-risky/);

  await expect(page.locator('#status')).toContainText('The recommended route is 1 minute longer and avoids the unmarked crossing');
});

test('typed destination with a single search result plans directly', async ({ page }) => {
  const calls = await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByLabel('Destination', { exact: true }).fill('Hauptbahnhof');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  expect(calls[0]).toMatchObject({ from: '16.3954,48.1761', to: '16.3755,48.185', mode: 'blind' });
});

test('switching to wheelchair re-plans with the wheelchair profile and mentions kerbs', async ({ page }) => {
  const calls = await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);

  await page.getByRole('button', { name: 'Wheelchair' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(1);
  expect(calls.at(-1).mode).toBe('wheelchair');
  await expect(page.locator('#routes .worst')).toContainText('kerb');
  await expect(page.locator('#status')).toContainText(/kerb height unknown/i);
});

test('server errors are spoken, not silent', async ({ page }) => {
  await page.route('**/api/route?*', (route) => route.fulfill({ status: 502, json: { error: 'Route service error 503' } }));
  await mockTransit(page, null);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Oberes Belvedere' }).click();
  await expect(page.locator('#status')).toContainText('Route service error 503');
  await expect(page.locator('#find')).toBeEnabled(); // the search button is usable again
});
