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
  await page.getByLabel(/My bus or tram line/).fill('69a');
  await page.getByRole('button', { name: 'Find my bus' }).click();

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
