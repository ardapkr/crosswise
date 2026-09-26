// Live destination suggestions while typing (/api/autocomplete is mocked with ORS-like answers).
import { test, expect } from '@playwright/test';
import { fakeSpeech, mockOrs } from './helpers.js';

const ORS = {
  steph: [
    { name: 'Stephansdom', detail: 'Stephansplatz 3, Inner City, Vienna', layer: 'venue', lon: 16.37301, lat: 48.20849 },
    { name: 'Stephansplatz', detail: 'Inner City, Vienna', layer: 'venue', lon: 16.3715, lat: 48.2081 },
  ],
  hau: [ // what ORS really answers: the car-train terminal first
    { name: 'Wien Hauptbahnhof Autoreisezug', detail: 'Sudbahnhof, Vienna', layer: 'venue', lon: 16.3911, lat: 48.178 },
    { name: 'Wien Hauptbahnhof', detail: 'Favoriten, Vienna', layer: 'venue', lon: 16.3779, lat: 48.185 },
  ],
  karl: [{ name: 'Karlsplatz', detail: 'Wieden, Vienna', layer: 'venue', lon: 16.3697, lat: 48.2004 }],
};

async function mockAutocomplete(page) {
  const calls = [];
  await page.route('**/api/autocomplete?*', (route) => {
    const u = new URL(route.request().url());
    calls.push(Object.fromEntries(u.searchParams));
    const q = u.searchParams.get('q').toLowerCase();
    const key = Object.keys(ORS).find((k) => q.startsWith(k));
    route.fulfill({ json: { results: key ? ORS[key] : [] } });
  });
  return calls;
}

async function start(page, url = '/') {
  await fakeSpeech(page);
  const routeCalls = await mockOrs(page);
  const calls = await mockAutocomplete(page);
  await page.goto(url);
  await page.getByRole('button', { name: 'Start' }).click();
  return { calls, routeCalls };
}

test('typing shows big suggestion buttons after 3 letters, one debounced request, biased to the GPS position', async ({ page }) => {
  const { calls, routeCalls } = await start(page);
  const to = page.getByLabel('Destination', { exact: true });
  await to.pressSequentially('St', { delay: 40 });
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(0); // 2 letters: no request yet

  await to.pressSequentially('ephansdom', { delay: 40 });
  const first = page.getByRole('button', { name: 'Stephansdom, Stephansplatz 3, Inner City, Vienna' });
  await expect(first).toBeVisible();
  expect(calls).toHaveLength(1); // typed fast: one request for the whole word
  expect(calls[0]).toEqual({ q: 'Stephansdom', focus: '16.39540,48.17610' });
  await expect(page.locator('#suggest-status')).toHaveText('2 suggestions below.');
  const box = await first.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(64);

  await first.click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  expect(routeCalls.at(-1)).toMatchObject({ from: '16.3954,48.1761', to: '16.37301,48.20849' });
  await expect(page.locator('#to-suggestions')).toBeHidden();
  await expect(to).toHaveValue('Stephansdom');
});

test('"Hauptbahnhof": the station entrance comes first, not the car-train terminal ORS lists first', async ({ page }) => {
  const { routeCalls } = await start(page, '/?demo=1');
  await page.getByLabel('Destination', { exact: true }).pressSequentially('Hauptb', { delay: 30 });
  const rows = page.locator('#to-suggestions button');
  await expect(rows.first()).toHaveAccessibleName('Wien Hauptbahnhof, Main station, Favoriten, Vienna');
  await expect(rows).toHaveCount(2); // ORS's own "Wien Hauptbahnhof" (180 m away) is the same place → merged
  await rows.first().click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  expect(routeCalls.at(-1).to).toBe('16.3755,48.185');
});

test('"HOIV" (not in OpenStreetMap) is suggested from 2 letters without a request', async ({ page }) => {
  const { calls } = await start(page, '/?demo=1');
  await page.getByLabel('Destination', { exact: true }).fill('ho');
  await expect(page.getByRole('button', { name: /^HOIV, Arsenalstraße 11/ })).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('keyboard: arrow down moves into the suggestions, Escape closes them', async ({ page }) => {
  await start(page, '/?demo=1');
  const to = page.getByLabel('Destination', { exact: true });
  await to.fill('Karl');
  await expect(page.getByRole('button', { name: 'Karlsplatz, Wieden, Vienna' })).toBeVisible();
  await to.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Karlsplatz, Wieden, Vienna' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#to-suggestions')).toBeHidden();
  await expect(to).toBeFocused();
});

test('"Current location" is the default start; another start can be picked from suggestions', async ({ page }) => {
  const { routeCalls } = await start(page, '/?demo=1');
  const from = page.getByLabel('From', { exact: true });
  await expect(from).toHaveValue('Current location');

  await page.getByLabel('Destination', { exact: true }).click(); // opens the search panel with the start field
  await expect(from).toBeVisible();
  await from.fill('Karl');
  const rows = page.locator('#from-suggestions button');
  await expect(rows.first()).toHaveAccessibleName('Current location, Demo: HOIV'); // way back to GPS
  await page.getByRole('button', { name: 'Karlsplatz, Wieden, Vienna' }).click();
  await expect(from).toHaveValue('Karlsplatz');
  await expect(page.locator('#status')).toHaveText('Starting from Karlsplatz.');

  await page.getByRole('button', { name: /^Wien Hauptbahnhof, Quick destination/ }).click(); // suggested in the empty search
  await expect(page.locator('#routes > li')).toHaveCount(3);
  expect(routeCalls.at(-1).from).toBe('16.3697,48.2004');

  await page.getByLabel('Destination', { exact: true }).click(); // the start field is in the search panel
  await from.fill('Kar');
  await rows.first().click(); // "Current location"
  await expect(from).toHaveValue('Current location');
  await expect(page.locator('#routes > li')).toHaveCount(3);
  expect(routeCalls.at(-1).from).toBe('16.3954,48.1761'); // re-planned from the (demo) current location
});
