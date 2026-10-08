// Phone-sized screenshots of every screen state (for the README, the demo video and design reviews).
// Needs the local server running: `npm run dev` (port 3000). Real OSM tiles, saved demo routes, mocked camera answers.
// Usage: node scripts/screenshots.js [outDir]      (default docs/screenshots)

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'docs/screenshots';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--use-file-for-fake-video-capture=test/fixtures/bus-69a.y4m'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  geolocation: { latitude: 48.1761, longitude: 16.3954 }, permissions: ['geolocation', 'camera'],
});
const page = await context.newPage();
await page.addInitScript(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true, value: { speak(u) { setTimeout(() => u.onend?.(), 20); }, cancel() {}, getVoices() { return []; } },
  });
});
await page.route('**/api/autocomplete?*', (route) => route.fulfill({ json: { results: [
  { name: 'Stephansdom', detail: 'Stephansplatz 3, Inner City, Vienna', layer: 'venue', lon: 16.37301, lat: 48.20849 },
  { name: 'Stephansplatz', detail: 'Inner City, Vienna', layer: 'venue', lon: 16.3715, lat: 48.2081 },
  { name: 'Hotel am Stephansplatz', detail: 'Stephansplatz 9, Inner City, Vienna', layer: 'venue', lon: 16.372, lat: 48.2089 },
] } }));
await page.route('**/api/look', (route) => route.fulfill({ json: { mode: 'bus', result: { status: 'unreadable', line: '', destination: '', vehicle: 'bus', confidence: 0.2 } } }));

const shot = async (name) => {
  await page.waitForTimeout(900); // tiles + transitions
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('saved', name);
};

await page.goto(`${BASE}/?demo=1`);
await shot('1-start');
await page.getByRole('button', { name: 'Start' }).click();
await shot('2-home');
await page.getByLabel('Destination', { exact: true }).pressSequentially('Steph', { delay: 40 });
await page.getByRole('button', { name: /^Stephansdom,/ }).waitFor();
await shot('3-search');
await page.getByRole('button', { name: 'Close search' }).click();
await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
await page.locator('#routes > li').first().waitFor({ state: 'attached' });
await page.waitForTimeout(1500);
await page.locator('#sheet').evaluate((el) => { el.scrollTop = 0; });
await shot('4-routes');
await page.getByRole('button', { name: 'Show more' }).click();
await page.locator('#routes-heading').evaluate((el) => el.scrollIntoView());
await shot('5-routes-expanded');
await page.getByRole('button', { name: 'Show less' }).click();
await page.getByRole('button', { name: /^Start this (route|trip)/ }).first().click();
await page.waitForTimeout(3000);
await shot('6-walking');
await page.getByRole('button', { name: 'Stop route' }).click();
await page.getByRole('button', { name: 'Find bus' }).click();
await page.locator('#camera-box').waitFor();
await page.waitForTimeout(2500);
await shot('7-find-bus');
await page.getByRole('button', { name: 'Stop camera' }).click();
await page.getByRole('button', { name: 'Settings' }).click();
await shot('8-settings');

await browser.close();
