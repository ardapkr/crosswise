// Find my bus with REAL footage: a 69A arriving at a stop near HOIV (test-material/new-test/bus video.MOV)
// is Chromium's fake camera (project "bus-video" in playwright.config.js).
// /api/look replays the answers the real model gave for frames of this clip (test/fixtures/look-bus-69a.json:
// far away "unreadable", then "69A" twice), so this checks the whole browser side end to end:
// real video frames → downscaled JPEG → scan pacing + 2-frame agreement → spoken result.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fakeSpeech } from './helpers.js';

const replay = JSON.parse(readFileSync('test/fixtures/look-bus-69a.json', 'utf8')).frames;

test('real 69A clip: frames from the clip are sent, "This is your bus, 69A, to Simmering" after 2 agreeing answers', async ({ page }) => {
  await fakeSpeech(page);
  const calls = [];
  await page.route('**/api/look', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const frame = replay[Math.min(calls.length - 1, replay.length - 1)];
    await route.fulfill({ json: { mode: 'bus', result: frame.result, observation: frame.observation, ms: 1700 } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => window.crosswise.look.findBus('69a')); // = voice "find my bus 69 a"
  await expect(page.locator('#camera-box')).toBeVisible();
  await expect(page.getByLabel(/Your line/)).toHaveValue('69A');

  await expect(page.locator('#status')).toHaveText('This is your bus, 69A, to Simmering.', { timeout: 15_000 });
  expect(calls).toHaveLength(4); // unreadable, unreadable, 69A, 69A → announced on the 2nd agreeing frame
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.filter((t) => /^(This is|Bus )/.test(t))).toEqual(['This is your bus, 69A, to Simmering.']); // no early guess

  // The frames really come from the clip: portrait 270x480 JPEGs (the app keeps them ≤ 768 px wide).
  const size = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, calls[0].image);
  expect(size).toEqual([270, 480]);
  for (const c of calls) expect(c.context.targetLine).toBe('69A');
});

// The same line stops in both directions: with a trip, the destination display decides.
const replayLook = async (page) => {
  const calls = [];
  await page.route('**/api/look', async (route) => {
    calls.push(route.request().postDataJSON());
    const frame = replay[Math.min(calls.length - 1, replay.length - 1)];
    await route.fulfill({ json: { mode: 'bus', result: frame.result, observation: frame.observation, ms: 1700 } });
  });
  return calls;
};

test('real 69A clip, trip towards Hauptbahnhof: "69A, but the wrong direction" (the clip shows Simmering)', async ({ page }) => {
  await fakeSpeech(page);
  await replayLook(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  // what the trip guidance sets while walking to the stop (HOIV → Hauptbahnhof by 69A)
  await page.evaluate(() => window.crosswise.look.setTarget({ line: '69A', headsign: 'Hauptbahnhof', origin: 'Simmering' }));
  await page.getByRole('button', { name: 'Find bus' }).click();
  await expect(page.getByLabel(/Your line/)).toHaveValue('69A');
  await expect(page.locator('#bus-direction')).toHaveText('Your trip: 69A towards Hauptbahnhof');
  await expect(page.locator('#status')).toHaveText('69A, but the wrong direction: it goes to Simmering. Your bus goes towards Hauptbahnhof.', { timeout: 15_000 });
  await expect(page.locator('#camera-box')).toBeVisible(); // keeps scanning for the right one
});

test('real 69A clip, trip towards Simmering: "This is 69A towards Simmering, your bus."', async ({ page }) => {
  await fakeSpeech(page);
  await replayLook(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => window.crosswise.look.setTarget({ line: '69A', headsign: 'Simmering', origin: 'Hauptbahnhof' }));
  await page.getByRole('button', { name: 'Find bus' }).click();
  await expect(page.locator('#status')).toHaveText('This is 69A towards Simmering, your bus.', { timeout: 15_000 });
});
