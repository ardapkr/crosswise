// Named Vienna trips for the submission: shortest walking route (baseline) vs our recommended route,
// plus the public transport trips the app would show (walking legs re-routed and re-scored like the app does).
//
//   node scripts/eval-trips.js --fetch   → asks the production API (real ORS + Transitous) and saves the raw
//                                          answers to eval/trips-named.json
//   node scripts/eval-trips.js           → prints the tables from the saved file (offline)
//
// Transit is asked for Sunday 27 Sep 2026, 10:00 Vienna time (daytime timetable, not the night buses).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { normalizeOrsRoutes } from '../public/lib/ors.js';
import { decodeGroups, crossingsOnRoute } from '../public/lib/crossings.js';
import { rankRoutes } from '../public/lib/scoring.js';
import { normalizePlan, choosePatterns } from '../public/lib/transit.js';
import { walkRequests, buildTrip, orderPlan, tripName } from '../public/lib/trip.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'eval', 'trips-named.json');
const BASE = 'https://crosswise-woad.vercel.app';
const TIME = '2026-09-27T10:00:00+02:00';
const MODE = 'blind';

const P = {
  HOIV: [16.3954, 48.1761],
  Hauptbahnhof: [16.3755, 48.1850],
  'Oberes Belvedere': [16.3809, 48.1915],
  Schwarzenbergplatz: [16.3760, 48.1990],
  Karlsplatz: [16.3699, 48.2004],
  'Wien Mitte': [16.3848, 48.2063],
  Stephansplatz: [16.3731, 48.2085],
  'Schönbrunn': [16.3122, 48.1849],
};
const WALK_TRIPS = [
  ['HOIV', 'Hauptbahnhof'], ['HOIV', 'Oberes Belvedere'], ['HOIV', 'Schwarzenbergplatz'],
  ['HOIV', 'Wien Mitte'], ['Hauptbahnhof', 'Karlsplatz'],
];
const TRANSIT_TRIPS = [['HOIV', 'Stephansplatz'], ['HOIV', 'Schönbrunn']];

const ll = (p) => p.join(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(q) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + q);
    if (r.ok) return r.json();
    await sleep(3000 * (i + 1));
  }
  throw new Error(`failed: ${q}`);
}
const routeQ = (a, b) => `/api/route?from=${ll(a)}&to=${ll(b)}&mode=${MODE}&raw=1`;

async function fetchAll() {
  const saved = { fetchedAt: new Date().toISOString(), walk: {}, transit: {}, legs: {} };
  for (const [a, b] of [...WALK_TRIPS, ...TRANSIT_TRIPS]) {
    saved.walk[`${a}>${b}`] = await get(routeQ(P[a], P[b]));
    await sleep(1600); // ORS free tier: 40 requests per minute
  }
  for (const [a, b] of TRANSIT_TRIPS) {
    const t = await get(`/api/transit?from=${ll(P[a])}&to=${ll(P[b])}&mode=${MODE}&time=${encodeURIComponent(TIME)}&raw=1`);
    saved.transit[`${a}>${b}`] = t;
    const options = choosePatterns(normalizePlan(t), { mode: MODE, max: 2 }).map((p) => p.options[0]);
    for (const w of walkRequests(options)) {
      if (!saved.legs[w.key]) { saved.legs[w.key] = await get(routeQ(w.from, w.to)); await sleep(1600); }
    }
  }
  writeFileSync(FILE, JSON.stringify(saved));
  return saved;
}

const min = (s) => (s / 60).toFixed(1);
const unsignalled = (r) => r.score.count - r.score.kinds.signals;
const risky = (r) => r.score.kinds.unmarked + r.score.kinds.unknown;

function main(saved, groups) {
  const withCrossings = (raw) => normalizeOrsRoutes(raw).map((r) => ({ ...r, crossings: crossingsOnRoute(groups, r.geometry) }));
  const out = [`Fetched ${saved.fetchedAt} from ${BASE}, ${MODE} mode.`, '',
    '| Trip | Route | Minutes | Crossings | Unsignalled (zebra/unmarked/unknown) | of which unmarked/unknown | With acoustic signal |',
    '|---|---|---|---|---|---|---|'];
  for (const [a, b] of WALK_TRIPS) {
    const ranked = rankRoutes(withCrossings(saved.walk[`${a}>${b}`]), MODE);
    const ours = ranked[0];
    const base = ranked.find((r) => r.isShortest);
    const row = (label, r) => `| ${a} → ${b} | ${label} | ${min(r.duration)} | ${r.score.count} | ${unsignalled(r)} | ${risky(r)} | ${r.score.withSound} |`;
    out.push(row('Shortest (baseline)', base));
    out.push(ours === base ? `| | Crosswise = same route (${ranked.length} alternative${ranked.length === 1 ? '' : 's'}) | | | | | |` : row('**Crosswise**', ours));
  }
  out.push('', '| Trip | Option | Minutes door to door | Walking min | Crossings on foot | Unsignalled | of which unmarked/unknown | With acoustic signal |', '|---|---|---|---|---|---|---|---|');
  for (const [a, b] of TRANSIT_TRIPS) {
    const walkRanked = rankRoutes(withCrossings(saved.walk[`${a}>${b}`]), MODE);
    const walkBest = walkRanked[0];
    const options = choosePatterns(normalizePlan(saved.transit[`${a}>${b}`]), { mode: MODE, max: 2 }).map((p) => p.options[0]);
    const trips = options.map((o) => buildTrip(o, {
      routesFor: (key) => (saved.legs[key] ? withCrossings(saved.legs[key]) : null), groups, mode: MODE,
    }));
    const { items, transitFirst } = orderPlan({ ...walkBest, kind: 'walk' }, trips);
    items.forEach((it, i) => {
      const first = i === 0 ? ' (recommended)' : '';
      if (it.kind === 'walk') out.push(`| ${a} → ${b} | Walk only${first} | ${min(it.duration)} | ${min(it.duration)} | ${it.score.count} | ${unsignalled(it)} | ${risky(it)} | ${it.score.withSound} |`);
      else out.push(`| ${a} → ${b} | ${tripName(it)}${first} | ${min(it.duration)} | ${min(it.walkSeconds)} | ${it.score.count} | ${unsignalled(it)} | ${risky(it)} | ${it.score.withSound} |`);
    });
    out.push(`| | transit listed first: ${transitFirst ? 'yes' : 'no'} | | | | | | |`);
  }
  console.log(out.join('\n'));
}

const saved = process.argv.includes('--fetch') || !existsSync(FILE) ? await fetchAll() : JSON.parse(readFileSync(FILE, 'utf8'));
const groups = decodeGroups(JSON.parse(readFileSync(path.join(ROOT, 'public/data/crossings-vienna.json'), 'utf8')).rows);
main(saved, groups);
