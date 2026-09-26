// Camera assistant with Chromium's fake camera (a .y4m file) and a mocked /api/look.
// The real model is tested separately by `npm run eval:vision`.
import { test, expect } from '@playwright/test';
import { fakeSpeech } from './helpers.js';

const bus = (line, destination = '') => ({ status: 'found', line, destination, vehicle: 'bus', confidence: 0.9 });
const NOT_VISIBLE = { status: 'not_visible', line: '', destination: '', vehicle: 'unknown', confidence: 0 };

/** Answers /api/look calls from a list (the last answer repeats). Returns the recorded request bodies. */
async function mockLook(page, mode, answers, delayMs = 150) {
  const calls = [];
  await page.route('**/api/look', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ ...body, at: Date.now() });
    const result = answers[Math.min(calls.length - 1, answers.length - 1)];
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ json: { mode, result, observation: '', ms: delayMs } });
  });
  return calls;
}

async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
}

test('find my bus: announces the wrong bus, then "This is your bus" after 2 agreeing frames', async ({ page }) => {
  await fakeSpeech(page);
  const calls = await mockLook(page, 'bus', [NOT_VISIBLE, bus('26A'), bus('26A'), bus('13A', 'Hauptbahnhof'), bus('13A', 'Hauptbahnhof')]);
  await start(page);
  await page.getByLabel(/My bus or tram line/).fill('13a');
  await page.getByRole('button', { name: 'Find my bus' }).click();
  await expect(page.locator('#camera-box')).toBeVisible();

  await expect(page.locator('#status')).toHaveText('This is your bus, 13A, to Hauptbahnhof.', { timeout: 15_000 });
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken).toContain('This is 26A, not your bus.');
  expect(spoken.filter((t) => t.startsWith('This is your bus'))).toHaveLength(1);

  // 5 frames, all real JPEGs from the camera, never two requests at once (≥ 1.2 s apart)
  expect(calls).toHaveLength(5);
  for (const c of calls) {
    expect(c.mode).toBe('bus');
    expect(c.image.startsWith('/9j/')).toBe(true); // base64 of a JPEG header
    expect(c.context.targetLine).toBe('13A');
  }
  for (let i = 1; i < calls.length; i++) expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(1100);

  await expect(page.locator('#camera-box')).toBeHidden(); // camera stops on success
});

test('find my bus without a target line announces the first line that 2 frames agree on', async ({ page }) => {
  await fakeSpeech(page);
  await mockLook(page, 'bus', [bus('13A'), bus('18A'), bus('18A')]);
  await start(page);
  await page.getByRole('button', { name: 'Find my bus' }).click();
  await expect(page.locator('#status')).toHaveText('Bus 18A.', { timeout: 15_000 });
});

test('find my bus gives up after 60 s, saying "still looking" on the way', async ({ page }) => {
  await page.clock.install();
  await fakeSpeech(page);
  await mockLook(page, 'bus', [NOT_VISIBLE], 0);
  await start(page);
  await page.getByRole('button', { name: 'Find my bus' }).click();
  // The camera starts in real time: wait until the scan is running before moving the fake clock.
  await expect(page.locator('#status')).toContainText('Looking for a bus or tram');
  for (let i = 0; i < 13; i++) await page.clock.runFor(5_000); // 65 s in steps, so answers can arrive
  await expect(page.locator('#status')).toHaveText("I couldn't find it. You may want to ask someone nearby.");
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.filter((t) => t === 'Still looking.').length).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#camera-box')).toBeHidden();
});

test('stop camera ends the scan', async ({ page }) => {
  await fakeSpeech(page);
  const calls = await mockLook(page, 'bus', [NOT_VISIBLE]);
  await start(page);
  await page.getByRole('button', { name: 'Find my bus' }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect(page.locator('#status')).toHaveText('Scan stopped.');
  const n = calls.length;
  await page.waitForTimeout(2500);
  expect(calls.length).toBe(n); // no more frames after stopping
});

test('check light: one photo, says what it sees plus the traffic warning, never "safe"', async ({ page }) => {
  await fakeSpeech(page);
  const calls = await mockLook(page, 'light', [{ status: 'green', confidence: 0.9, note: 'It is safe to cross' }]);
  await start(page);
  await page.getByRole('button', { name: 'Check crossing light' }).click();
  await expect(page.locator('#status')).toHaveText('The pedestrian light looks green. Listen for traffic before crossing.');
  expect(calls).toHaveLength(1);
  expect(calls[0].mode).toBe('light');
  const spoken = (await page.evaluate(() => window.__spoken)).join(' ');
  expect(spoken.toLowerCase()).not.toContain('safe');
  await expect(page.locator('#camera-box')).toBeHidden();
});

test('read text and describe surroundings speak the result', async ({ page }) => {
  await fakeSpeech(page);
  await page.route('**/api/look', async (route) => {
    const { mode } = route.request().postDataJSON();
    const result = mode === 'read'
      ? { status: 'found', text: 'Bahnhof City Wien Hauptbahnhof', summary: 'Parking sign pointing left: Bahnhof City Wien Hauptbahnhof.' }
      : { description: 'A zebra crossing is ahead. A tram stop is on the right.', hazards: ['bicycle lane before the crossing'] };
    await route.fulfill({ json: { mode, result } });
  });
  await start(page);
  await page.getByRole('button', { name: 'Read text' }).click();
  await expect(page.locator('#status')).toHaveText('Parking sign pointing left: Bahnhof City Wien Hauptbahnhof.');
  await page.getByRole('button', { name: 'Describe surroundings' }).click();
  await expect(page.locator('#status')).toHaveText(
    'Careful: bicycle lane before the crossing. A zebra crossing is ahead. A tram stop is on the right.',
  );
});

test('camera permission denied is spoken, not silent', async ({ page }) => {
  await fakeSpeech(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await start(page);
  await page.getByRole('button', { name: 'Check crossing light' }).click();
  await expect(page.locator('#status')).toHaveText('Camera permission is off. Allow the camera for this site in your browser settings.');
  await expect(page.locator('#camera-box')).toBeHidden();
});

test('server trouble during a scan is spoken once, the scan keeps going', async ({ page }) => {
  await fakeSpeech(page);
  let n = 0;
  await page.route('**/api/look', async (route) => {
    n++;
    if (n === 1) return route.fulfill({ status: 429, json: { error: 'The camera assistant is busy. Try again in a moment.' } });
    return route.fulfill({ json: { mode: 'bus', result: bus('13A') } });
  });
  await start(page);
  await page.getByRole('button', { name: 'Find my bus' }).click();
  await expect(page.locator('#status')).toHaveText('Bus 13A.', { timeout: 15_000 });
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken).toContain('Too many requests right now. Please try again in a minute.');
});
