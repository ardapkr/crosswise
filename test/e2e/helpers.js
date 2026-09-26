// Shared helpers for Playwright tests.
import { readFileSync } from 'node:fs';
import { normalizeOrsRoutes } from '../../public/lib/ors.js';

export const fixtureRoutes = (name) =>
  normalizeOrsRoutes(JSON.parse(readFileSync(`test/fixtures/${name}.json`, 'utf8')));

/** Headless Chrome's speech engine is unreliable: replace it with one that "speaks" in 20 ms. */
export async function fakeSpeech(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(u) { setTimeout(() => u.onend && u.onend(), 20); },
        cancel() {},
        getVoices() { return []; },
      },
    });
  });
}

/** Mocks /api/route and /api/geocode with REAL saved ORS responses. Returns the list of route calls. */
export async function mockOrs(page) {
  const calls = [];
  await page.route('**/api/route?*', (route) => {
    const u = new URL(route.request().url());
    calls.push(Object.fromEntries(u.searchParams));
    const mode = u.searchParams.get('mode');
    const toBelvedere = u.searchParams.get('to').startsWith('16.3809');
    const name = toBelvedere ? 'ors-hoiv-belvedere-foot'
      : mode === 'wheelchair' ? 'ors-hoiv-hbf-wheelchair' : 'ors-hoiv-hbf-foot';
    route.fulfill({ json: { mode, routes: fixtureRoutes(name) } });
  });
  await page.route('**/api/geocode?*', (route) => route.fulfill({
    json: { results: [{ label: 'Wien Hauptbahnhof, Vienna, Austria', lon: 16.3755, lat: 48.185 }] },
  }));
  return calls;
}
