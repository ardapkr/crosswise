// The map: each route in its own colour, crossings as coloured dots, tapping a card highlights its route.
// Hidden from assistive tech (the cards and the speech carry the same information).
import { test, expect } from '@playwright/test';
import { fakeSpeech, mockOrs } from './helpers.js';

const ROUTE_COLORS = ['#a78bfa', '#38bdf8', '#f0abfc'];
const DOT_COLORS = ['#3ddc84', '#ffd23f', '#ff9f1c', '#ff5a5a'];

/** stroke colour + width of every route line on the map */
const lineStyles = (page) => page.locator('#map-box path.leaflet-interactive').evaluateAll((paths) => paths
  .filter((p) => p.getAttribute('fill') === 'none')
  .map((p) => ({ color: p.getAttribute('stroke'), width: Number(p.getAttribute('stroke-width')), dash: p.getAttribute('stroke-dasharray') })));

test('routes in 3 colours, recommended thickest, crossings coloured by type; tapping a card highlights its route', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort()); // no map tiles needed
  await fakeSpeech(page);
  await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#map-box')).toBeVisible();
  const cards = page.locator('#routes > li');
  const firstId = await cards.nth(0).getAttribute('data-id');
  await expect.poll(() => page.evaluate(() => window.__map)).toEqual({ routes: 3, crossings: 9, selected: firstId });
  await expect(page.locator('#map-box')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#map-box path.leaflet-interactive')).toHaveCount(3 + 9 + 2); // 3 lines, 9 crossings, start + end

  // every route its own colour and pattern; the recommended (selected) one is the thickest
  const before = await lineStyles(page);
  expect(before.map((l) => l.color).sort()).toEqual([...ROUTE_COLORS].sort());
  const rec = before.find((l) => l.color === ROUTE_COLORS[0]);
  expect(rec.width).toBe(Math.max(...before.map((l) => l.width)));
  expect(rec.dash).toBeNull();
  expect(new Set(before.map((l) => l.dash)).size).toBe(3);

  // dots: only the 4 legend colours
  const fills = await page.locator('#map-box path.leaflet-interactive[fill-opacity="1"]').evaluateAll((ps) => ps.map((p) => p.getAttribute('fill')));
  const dotFills = fills.filter((f) => f !== '#ffffff' && f !== '#0b0b10');
  expect(dotFills).toHaveLength(9);
  for (const f of dotFills) expect(DOT_COLORS).toContain(f);
  expect(dotFills).toContain('#3ddc84'); // the recommended route has lights + sound crossings

  // the cards show the same colour as the map line
  await expect(cards.nth(1).locator('.swatch line')).toHaveAttribute('stroke', ROUTE_COLORS[1]);

  // tap the 2nd card: its route becomes the thick one, its crossings are drawn, the card is read out
  const secondId = await cards.nth(1).getAttribute('data-id');
  await cards.nth(1).locator('.meta').click();
  await expect.poll(() => page.evaluate(() => window.__map.selected)).toBe(secondId);
  await expect(cards.nth(1)).toHaveClass(/selected/);
  await expect(cards.nth(1).locator('.route-pick')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.nth(0).locator('.route-pick')).toHaveAttribute('aria-pressed', 'false');
  const after = await lineStyles(page);
  const second = after.find((l) => l.color === ROUTE_COLORS[1]);
  expect(second.width).toBe(Math.max(...after.map((l) => l.width)));
  await expect(page.locator('#status')).toHaveText(/^(Shortest|Alternative) route: \d+ minutes/);
});

test('walking: the map shows the chosen route and follows the walker', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await fakeSpeech(page);
  await mockOrs(page);
  await page.goto('/?demo=1&speed=40');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await page.locator('#routes > li').first().getByRole('button', { name: /Start the/ }).click();
  await expect(page.locator('#nav-section #map-box')).toBeVisible(); // the map moved into the walking panel
  await expect.poll(() => page.evaluate(() => window.__walker)).toBeTruthy();
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
  await page.locator('#routes > li').nth(1).locator('.meta').click(); // tapping a card without a map is harmless
  await expect(page.locator('#status')).toHaveText(/route: \d+ minutes/);
});
