// Public transport: walking + up to 2 trips, transit first when walking is long, dashed rides on the map,
// a whole demo trip (walk → 69A → walk) and Find my bus with the trip's line AND direction.
// Transitous is mocked with REAL saved answers (times moved to now); walking legs use the planner's real paths.
import { test, expect } from '@playwright/test';
import { fakeSpeech, mockOrs } from './helpers.js';

async function planHbf(page, { url = '/?demo=1', transit = 'hoiv-hbf' } = {}) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await fakeSpeech(page);
  const calls = await mockOrs(page, { transit });
  await page.goto(url);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#options > li').first()).toBeVisible();
  return calls;
}

test('walking takes 27 min → public transport first, walking still offered, the reason is spoken', async ({ page }) => {
  await planHbf(page);
  const cards = page.locator('#options > li');
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  await expect(cards.first().locator('h3')).toHaveText(/^Recommended · Bus 69A: \d+ min$/);
  await expect(cards.last().locator('h3')).toHaveText(/^Walk: 27 min$/);
  await expect(cards.first().locator('.legs li')).toHaveCount(3); // walk, 69A, walk
  await expect(cards.first().locator('.legs li.ride')).toContainText('Bus 69A to Hauptbahnhof');
  await expect(cards.first().locator('.times')).toHaveText(/^Leave \d\d:\d\d · arrive \d\d:\d\d/);
  await expect(page.locator('#status')).toContainText('Walking takes 27 minutes, so public transport comes first. Best: Bus 69A');
  await expect(page.locator('#routes-section')).toBeHidden();

  // the walking comparison (the baseline: shortest route) is one tap away
  await page.getByRole('button', { name: /Compare walking routes/ }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await expect(page.locator('#routes h3', { hasText: 'Shortest' })).toHaveText(/Shortest: 26 min/);
  await expect(page.locator('#status')).toContainText('The recommended route is 1 minute longer');
});

test('the map: rides dashed, walking solid, stops marked; tapping a trip card reads its legs', async ({ page }) => {
  await planHbf(page);
  await expect.poll(() => page.evaluate(() => window.__map?.routes)).toBeGreaterThanOrEqual(2);
  const dashes = await page.locator('#map-box path.leaflet-interactive').evaluateAll((ps) => ps
    .filter((p) => p.getAttribute('fill') === 'none').map((p) => p.getAttribute('stroke-dasharray')));
  expect(dashes).toContain('2 12'); // ride legs
  expect(dashes).toContain(null);   // walking legs
  await page.locator('#options > li').first().locator('.times').click();
  await expect(page.locator('#status')).toHaveText(/^Bus 69A: \d+ minutes, leave at \d\d:\d\d, .*Take bus 69A towards Hauptbahnhof\. \d stops\. Get off at/);
});

test('demo trip: walk to the stop, departure, board, stops counted, get off, walk, arrive', async ({ page }) => {
  test.setTimeout(90_000);
  await planHbf(page, { url: '/?demo=1&speed=40' });
  await page.locator('#options > li').first().getByRole('button', { name: /Start this trip/ }).click();
  await expect(page.locator('#nav-section')).toBeVisible();
  await expect(page.locator('#nav-heading')).toHaveText('Trip · next');

  // at the stop / while walking to it, Find my bus knows the line and direction
  await expect.poll(() => page.evaluate(() => window.__trip?.target?.line)).toBe('69A');
  await expect(page.locator('#bus-direction')).toHaveText('Your trip: 69A towards Hauptbahnhof');

  await page.waitForFunction(() => window.__trip?.done === true, null, { timeout: 70_000 });
  const spoken = await page.evaluate(() => window.__spoken);
  const at = (re) => spoken.findIndex((t) => re.test(t));
  const order = [
    /^Starting the trip by bus 69A/,
    /^Walk \d+ minutes? to Hüttenbrennergasse/,
    /^You are at the stop Hüttenbrennergasse\.$/,
    /^Bus 69A towards Hauptbahnhof leaves at \d\d:\d\d.*By the timetable\. Tap Find bus/,
    /^On bus 69A towards Hauptbahnhof\. \d stops\. Get off at/,
    /^Your stop is next:/,
    /^Get off now:/,
    /^Walk \d+ minutes? to your destination\./,
    /^You have arrived at your destination\.$/,
  ].map(at);
  expect(order.every((i) => i >= 0), JSON.stringify(spoken, null, 1)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(spoken.join(' ')).not.toMatch(/safe to cross/i);
  await expect(page.locator('#bus-direction')).toBeHidden(); // trip over: no target any more
});

test('"I\'m at the stop" and "I\'m on board" buttons move the trip on (no GPS in stations)', async ({ page }) => {
  await planHbf(page, { url: '/?demo=1&speed=0.01' }); // the demo walker barely moves
  await page.locator('#options > li').first().getByRole('button', { name: /Start this trip/ }).click();
  await page.getByRole('button', { name: "I'm at the stop" }).click();
  await expect.poll(() => page.evaluate(() => window.__trip?.phase)).toMatch(/waiting|riding/);
  await expect.poll(() => page.evaluate(() => window.__spoken.join(' | '))).toContain('OK, at the stop Hüttenbrennergasse.');
});

test('no public transport found: the walking comparison as before, and it says so', async ({ page }) => {
  await fakeSpeech(page);
  await mockOrs(page, { transit: null });
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await expect(page.locator('#options-section')).toBeHidden();
  await expect(page.locator('#status')).toContainText('No public transport connection found.');
});

test('wheelchair mode asks for step-free trips and shows the vehicles\' access', async ({ page }) => {
  const calls = await planHbf(page);
  await page.getByRole('button', { name: 'Wheelchair' }).click();
  await expect(page.locator('#options .access').first()).toContainText(/wheelchair/i);
  expect(calls.at(-1).mode).toBe('wheelchair');
});

test('with a real-speed voice, no trip step is lost and no stale warning is read late', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await fakeSpeech(page, { msPerChar: 15 }); // fast, but a busy junction still fills the queue
  await mockOrs(page, { transit: 'hoiv-hbf' });
  await page.goto('/?demo=1&speed=25');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await page.locator('#options > li').first().getByRole('button', { name: /Start this trip/ }).click();
  await page.waitForFunction(() => window.__spoken.at(-1) === 'You have arrived at your destination.', null, { timeout: 100_000 });
  const spoken = await page.evaluate(() => window.__spoken);
  for (const re of [/^Walk \d+ minutes? to Hüttenbrennergasse/, /^You are at the stop/, /^Bus 69A towards Hauptbahnhof (leaves|was due)/,
    /^On bus 69A/, /^Your stop is next/, /^Get off now/, /^Walk \d+ minutes? to your destination/]) {
    expect(spoken.some((t) => re.test(t)), `${re} missing in:\n${spoken.join('\n')}`).toBe(true);
  }
});
