// GET /api/transit?from=lon,lat&to=lon,lat&mode=blind|wheelchair|limited[&time=ISO][&raw=1]
// Public transport options from Transitous (free MOTIS 2 journey planner, no key, https://transitous.org).
// Returns { source: 'transitous'|'saved', fallback?, patterns: [{ key, options: [option, ...] }] }
//   = up to 2 different trips (lib/transit.js choosePatterns), each with its next departures.
// Wheelchair and limited mobility ask for step-free walking (pedestrianProfile=WHEELCHAIR, uses lifts).
// If Transitous is down and the trip is a saved demo trip from HOIV, the saved real answer is replayed
// with its times moved to "now" (fallback: true — the UI says the times are examples).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeMode } from '../public/lib/modes.js';
import { normalizePlan, choosePatterns, shiftPlanTimes } from '../public/lib/transit.js';
import { distance } from '../public/lib/geo.js';
import { createCache } from './_lib/cache.js';
import { parseLonLat, fail, fetchWithTimeout } from './_lib/http.js';

const cache = createCache({ max: 200, ttlMs: 2 * 60 * 1000 }); // timetables change by the minute
const UA = 'Crosswise-hackathon/0.1 (accessibility routing prototype)';
const MAX_DEPARTURES = 3; // per trip: enough to skip one the user can't reach any more

const HOIV = [16.3954, 48.1761];
const SAVED = [
  { to: [16.3755, 48.1850], file: 'transit-hoiv-hbf' },
  { to: [16.3731, 48.2085], file: 'transit-hoiv-stephansplatz' },
];

/** Saved demo trip for this request (start within 300 m of HOIV, end within 300 m of a saved one), or null. */
export function savedTripName(from, to) {
  if (distance(from, HOIV) > 300) return null;
  return SAVED.find((s) => distance(to, s.to) <= 300)?.file || null;
}

async function fetchTransitous(from, to, mode, time) {
  const q = new URLSearchParams({
    fromPlace: `${from[1]},${from[0]}`,
    toPlace: `${to[1]},${to[0]}`,
    time,
    numItineraries: '6',
  });
  if (mode !== 'blind') q.set('pedestrianProfile', 'WHEELCHAIR');
  let r;
  try {
    r = await fetchWithTimeout(`https://api.transitous.org/api/v1/plan?${q}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 12000);
  } catch {
    return { status: 504, error: 'Public transport service did not answer in time' };
  }
  if (!r.ok) return { status: r.status === 429 ? 429 : 502, error: `Public transport service error ${r.status}` };
  return { raw: await r.json() };
}

export default async function handler(req, res) {
  const from = parseLonLat(req.query.from);
  const to = parseLonLat(req.query.to);
  if (!from || !to) return fail(res, 400, 'from and to must be "lon,lat"');
  const mode = normalizeMode(req.query.mode);
  const t = req.query.time ? Date.parse(req.query.time) : Date.now();
  if (!Number.isFinite(t)) return fail(res, 400, 'time must be an ISO date');
  const time = new Date(Math.floor(t / 60000) * 60000).toISOString();

  const round = (p) => p.map((x) => x.toFixed(4)).join(',');
  const key = `${mode === 'blind' ? 'foot' : 'wheelchair'}|${round(from)}|${round(to)}|${time}`;
  let raw = cache.get(key);
  let fallback = false;
  if (!raw) {
    const result = await fetchTransitous(from, to, mode, time);
    if (result.raw) {
      raw = result.raw;
      cache.set(key, raw);
    } else {
      const saved = savedTripName(from, to);
      if (!saved) return fail(res, result.status, result.error);
      console.warn(`Transitous unavailable (${result.error}); replaying saved trip ${saved}`);
      const json = JSON.parse(await readFile(path.join(process.cwd(), 'api', '_data', `${saved}.json`), 'utf8'));
      raw = shiftPlanTimes(json, Date.parse(time) - Date.parse(json.requestTime));
      fallback = true;
    }
  }

  res.setHeader('Cache-Control', 'private, max-age=60');
  if (req.query.raw === '1') return res.status(200).json(raw);
  const patterns = choosePatterns(normalizePlan(raw), { mode, max: 2 })
    .map((g) => ({ key: g.key, options: g.options.slice(0, MAX_DEPARTURES) }));
  return res.status(200).json({ source: fallback ? 'saved' : 'transitous', mode, patterns, ...(fallback && { fallback: true }) });
}
