// Saves REAL Transitous (MOTIS 2) public transport answers for a few Vienna trips as test fixtures,
// so unit and e2e tests never need the network. Run once: node scripts/save-transit-fixtures.js
// Also copies the HOIV trips into api/_data/ (fallback when Transitous is down during the demo).
//
// Transitous is a free community service: we ask for a handful of trips, once, with a clear User-Agent.

import { writeFileSync, mkdirSync } from 'node:fs';
import { trimPlan } from '../public/lib/transit.js';

const TIME = '2026-09-28T07:00:00Z'; // a Monday, 09:00 in Vienna: normal weekday timetable
const HOIV = [16.3954, 48.1761];
const TRIPS = [
  { name: 'hoiv-hbf', from: HOIV, to: [16.3755, 48.1850], demo: true },
  { name: 'hoiv-stephansplatz', from: HOIV, to: [16.3731, 48.2085], demo: true },
  { name: 'hoiv-schoenbrunn', from: HOIV, to: [16.3122, 48.1849] },
  { name: 'hbf-prater', from: [16.3761, 48.1851], to: [16.3960, 48.2166] },
  { name: 'hoiv-westbahnhof', from: HOIV, to: [16.3378, 48.1966] },
  { name: 'hbf-hoiv', from: [16.3761, 48.1851], to: HOIV },
  { name: 'hoiv-karlsplatz-wheelchair', from: HOIV, to: [16.3700, 48.2004], wheelchair: true },
];

const UA = 'Crosswise-hackathon/0.1 (accessibility routing prototype)';

for (const t of TRIPS) {
  const q = new URLSearchParams({
    fromPlace: `${t.from[1]},${t.from[0]}`,
    toPlace: `${t.to[1]},${t.to[0]}`,
    time: TIME,
    numItineraries: '6',
  });
  if (t.wheelchair) q.set('pedestrianProfile', 'WHEELCHAIR');
  const r = await fetch(`https://api.transitous.org/api/v1/plan?${q}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) { console.error(`${t.name}: HTTP ${r.status}`); continue; }
  const plan = trimPlan(await r.json());
  const json = JSON.stringify({ requestTime: TIME, ...plan });
  writeFileSync(`test/fixtures/transit-${t.name}.json`, json);
  if (t.demo) {
    mkdirSync('api/_data', { recursive: true });
    writeFileSync(`api/_data/transit-${t.name}.json`, json);
  }
  console.log(`${t.name}: ${plan.itineraries.length} itineraries, ${(json.length / 1024).toFixed(0)} KB`);
  await new Promise((res) => setTimeout(res, 1500)); // be polite
}
