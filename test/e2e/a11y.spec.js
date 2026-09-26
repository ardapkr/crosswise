// Automated accessibility audit (axe-core, WCAG 2.1 A/AA) of every screen state.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fakeSpeech, mockOrs } from './helpers.js';

async function audit(page, name) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(problems, `${name}:\n${problems.join('\n')}`).toEqual([]);
}

test('start screen', async ({ page }) => {
  await page.goto('/');
  await audit(page, 'start screen');
});

test('main screen, route cards and walking panel', async ({ page }) => {
  await fakeSpeech(page);
  await mockOrs(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await audit(page, 'main screen');
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await audit(page, 'route cards');
  await page.locator('#routes > li').first().getByRole('button', { name: /Start this route/ }).click();
  await expect(page.locator('#nav-section')).toBeVisible();
  await audit(page, 'walking panel');
});

test('search panel with suggestions, and the settings dialog', async ({ page }) => {
  await fakeSpeech(page);
  await page.route('**/api/autocomplete?*', (route) => route.fulfill({
    json: { results: [{ name: 'Karlsplatz', detail: 'Wieden, Vienna', layer: 'venue', lon: 16.3697, lat: 48.2004 }] },
  }));
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByLabel('Destination', { exact: true }).fill('Karl');
  await expect(page.getByRole('button', { name: 'Karlsplatz, Wieden, Vienna' })).toBeVisible();
  await audit(page, 'search panel');
  await page.getByRole('button', { name: 'Close search' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await audit(page, 'settings dialog');
});

test('camera panel open', async ({ page }) => {
  await fakeSpeech(page);
  await page.route('**/api/look', (route) => route.fulfill({ json: { mode: 'bus', result: { status: 'not_visible' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Find bus' }).click();
  await expect(page.locator('#camera-box')).toBeVisible();
  await audit(page, 'camera panel');
});

test('App voice off: messages go to the screen reader live regions instead of the app voice', async ({ page }) => {
  await page.addInitScript(() => {
    window.__synthCalls = 0;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak(u) { window.__synthCalls++; setTimeout(() => u.onend && u.onend(), 20); }, cancel() {}, getVoices() { return []; } },
    });
  });
  await page.goto('/');
  // the visible status is not a live region (no double speech with the app voice on)
  await expect(page.locator('#status')).not.toHaveAttribute('aria-live', /polite|assertive/);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Settings' }).click(); // the toggle lives in Settings (and on the start screen)
  const toggle = page.getByRole('dialog').getByRole('button', { name: /App voice/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  const before = await page.evaluate(() => window.__synthCalls);

  await page.evaluate(() => window.crosswise.speak('Crossing now: zebra crossing without lights.', 'crossing'));
  await expect(page.locator('#live-assertive')).toHaveText('Crossing now: zebra crossing without lights.');
  await page.evaluate(() => window.crosswise.speak('Route stopped.', 'info'));
  await expect(page.locator('#live-polite')).toHaveText('Route stopped.');
  await expect(page.locator('#status')).toHaveText('Route stopped.'); // still shown as big text
  expect(await page.evaluate(() => window.__synthCalls)).toBe(before); // app voice silent

  await page.reload(); // the choice is remembered, and shown on the start screen before the app talks
  await expect(page.getByRole('button', { name: /App voice/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: /App voice/ })).toHaveText('App voice: off');
});

test('public transport options, walking comparison and the trip panel', async ({ page }) => {
  await fakeSpeech(page);
  await mockOrs(page, { transit: 'hoiv-hbf' });
  await page.goto('/?demo=1&speed=0.01');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#options > li').first()).toBeVisible();
  await audit(page, 'trip options');
  await page.getByRole('button', { name: /Compare walking routes/ }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await audit(page, 'walking comparison');
  await page.locator('#options > li').first().getByRole('button', { name: /Start this trip/ }).click();
  await expect(page.getByRole('button', { name: "I'm at the stop" })).toBeVisible();
  await audit(page, 'trip panel');
});
