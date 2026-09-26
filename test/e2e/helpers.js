// Shared helpers for Playwright tests.
import { readFileSync } from 'node:fs';
import { normalizeOrsRoutes } from '../../public/lib/ors.js';
import { normalizePlan, choosePatterns, shiftPlanTimes } from '../../public/lib/transit.js';

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

/**
 * Mocks /api/route and /api/geocode with REAL saved ORS responses. Returns the list of route calls.
 * Walking legs of public transport trips (leg=1) get no ORS route, so the app uses the transit planner's
 * own (real, OSM-based) walking path for them. /api/transit answers "no connection" unless `transit` names
 * a saved Transitous fixture (see mockTransit).
 */
export async function mockOrs(page, { transit = null } = {}) {
  const calls = [];
  await page.route('**/api/route?*', (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('leg') === '1') return route.fulfill({ json: { routes: [] } });
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
  await mockTransit(page, transit);
  return calls;
}

/**
 * /api/transit from a REAL saved Transitous answer (test/fixtures/transit-<name>.json), its times moved so
 * the first vehicle leaves `leadMinutes` from now; processed exactly like api/transit.js does.
 * name = null → no public transport found. Returns the list of transit calls.
 */
export async function mockTransit(page, name, { leadMinutes = 6 } = {}) {
  const calls = [];
  await page.route('**/api/transit?*', (route) => {
    const u = new URL(route.request().url());
    calls.push(Object.fromEntries(u.searchParams));
    if (!name) return route.fulfill({ json: { source: 'transitous', patterns: [] } });
    const json = JSON.parse(readFileSync(`test/fixtures/transit-${name}.json`, 'utf8'));
    const firstRide = normalizePlan(json)[0].legs.find((l) => l.kind === 'ride');
    const shifted = shiftPlanTimes(json, Date.now() + leadMinutes * 60e3 - firstRide.departure);
    const mode = u.searchParams.get('mode') || 'blind';
    const patterns = choosePatterns(normalizePlan(shifted), { mode, max: 2 }).map((g) => ({ key: g.key, options: g.options.slice(0, 3) }));
    return route.fulfill({ json: { source: 'transitous', mode, patterns } });
  });
  return calls;
}
