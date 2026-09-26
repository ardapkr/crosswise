// "Where am I?" — button and voice. /api/where is mocked (its handler is unit-tested on the real snapshots).
import { test, expect } from '@playwright/test';
import { fakeSpeech } from './helpers.js';

const ANSWER = {
  city: 'vienna',
  street: { street: 'Arsenalstraße', housenumber: '11', distance: 8 },
  stops: [
    { name: 'Hüttenbrennergasse', kind: 'bus', lines: [], distance: 46 },
    { name: 'Gräßlplatz', kind: 'bus', lines: [], distance: 169 },
  ],
  crossing: { kind: 'signals', sound: 'yes', vibration: 'yes', kerb: 'lowered', distance: 28 },
};
const SPOKEN = 'You are on Arsenalstraße, near number 11. Nearest stop: Hüttenbrennergasse, bus, 50 metres. ' +
  'Also Gräßlplatz, bus, 170 metres. Nearest crossing in 30 metres: traffic light with acoustic signal.';

async function mockWhere(page) {
  const calls = [];
  await page.route('**/api/where?*', (route) => {
    calls.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    route.fulfill({ json: ANSWER });
  });
  return calls;
}

test('button uses the real GPS position and speaks street, stops and crossing', async ({ page, context }) => {
  await fakeSpeech(page);
  await context.setGeolocation({ latitude: 48.17615, longitude: 16.39545 });
  const calls = await mockWhere(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Where am I?' }).click();
  await expect(page.locator('#status')).toHaveText(SPOKEN);
  expect(calls[0]).toEqual({ lon: '16.395450', lat: '48.176150' });
});

test('voice "where am I" in demo mode uses HOIV', async ({ page }) => {
  await fakeSpeech(page);
  await page.addInitScript(() => {
    class FakeRecognition {
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: 'where am I' }]] }); this.onend?.(); }, 50); }
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition;
  });
  const calls = await mockWhere(page);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#status')).toHaveText(SPOKEN);
  expect(calls[0]).toEqual({ lon: '16.395400', lat: '48.176100' });
});

test('location permission denied is spoken', async ({ page, context }) => {
  await fakeSpeech(page);
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (ok, fail) => fail({ code: 1 });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Where am I?' }).click();
  await expect(page.locator('#status')).toHaveText('Location permission is off. Allow location for this site in your browser settings.');
});
