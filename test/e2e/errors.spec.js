// Error states must be spoken, never silent.
import { test, expect } from '@playwright/test';
import { fakeSpeech } from './helpers.js';

test('no internet connection is spoken (route planning and camera assistant)', async ({ page, context }) => {
  await fakeSpeech(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await expect(page.locator('#status')).toHaveText('No internet connection.');
  await page.getByRole('button', { name: 'Check light' }).click();
  await expect(page.locator('#status')).toHaveText('No internet connection.');
  await context.setOffline(false);
});

test('GPS unavailable during guidance is spoken', async ({ page }) => {
  await fakeSpeech(page);
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (ok, fail) => { setTimeout(() => fail({ code: 2 }), 50); return 1; };
    navigator.geolocation.clearWatch = () => {};
  });
  await page.route('**/api/route?*', (route) => route.fulfill({
    json: { routes: [{ id: 'r1', duration: 300, distance: 400, geometry: [[16.3954, 48.1761], [16.3970, 48.1761]], steps: [] }] },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wien Hauptbahnhof' }).click();
  await page.locator('#routes > li').first().getByRole('button', { name: /Start this route/ }).click();
  await expect(page.locator('#status')).toHaveText('Your location is not available right now. Keep your phone uncovered.');
});
