// GET /api/route?from=lon,lat&to=lon,lat&mode=blind|wheelchair|limited[&raw=1]
// Walking/wheelchair routes with alternatives from OpenRouteService. Cached in memory.
// Returns { mode, profile, routes: [{ id, duration, distance, geometry, steps }], fallback? }
// raw=1 → the ORS GeoJSON as-is (used to save test fixtures).
// If ORS is unavailable and the trip is a saved demo route (HOIV → Hauptbahnhof/Belvedere),
// the saved real response is served with fallback: true, so the demo never dies.

import { orsOptionsForMode, normalizeMode } from '../public/lib/modes.js';
import { normalizeOrsRoutes } from '../public/lib/ors.js';
import { createCache } from './_lib/cache.js';
import { parseLonLat, fail, fetchWithTimeout } from './_lib/http.js';
import { demoRouteName, loadDemoRoute } from './_lib/demo-routes.js';

const cache = createCache();
const round = (p) => p.map((x) => x.toFixed(5)).join(',');

/** Calls ORS. Returns { raw } or { status, error }. */
async function fetchOrs(profile, options, from, to) {
  if (!process.env.ORS_API_KEY) return { status: 500, error: 'ORS_API_KEY is not configured on the server' };
  const body = {
    coordinates: [from, to],
    instructions: true,
    language: 'en',
    units: 'm',
    alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 },
  };
  if (Object.keys(options).length) body.options = options;

  let r;
  try {
    r = await fetchWithTimeout(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: {
        Authorization: process.env.ORS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: 504, error: 'Route service did not answer in time' };
  }
  if (!r.ok) {
    const text = await r.text();
    let msg = `Route service error ${r.status}`;
    try { msg += ': ' + (JSON.parse(text).error?.message || ''); } catch { /* not JSON */ }
    return { status: r.status === 429 ? 429 : 502, error: msg };
  }
  return { raw: await r.json() };
}

export default async function handler(req, res) {
  const from = parseLonLat(req.query.from);
  const to = parseLonLat(req.query.to);
  if (!from || !to) return fail(res, 400, 'from and to must be "lon,lat"');

  const mode = normalizeMode(req.query.mode);
  const { profile, options } = orsOptionsForMode(mode);
  const key = `${profile}|${JSON.stringify(options)}|${round(from)}|${round(to)}`;

  let raw = cache.get(key);
  let fallback = false;
  if (!raw) {
    const result = await fetchOrs(profile, options, from, to);
    if (result.raw) {
      raw = result.raw;
      cache.set(key, raw);
    } else {
      const demo = demoRouteName(from, to, mode);
      if (!demo) return fail(res, result.status, result.error);
      console.warn(`ORS unavailable (${result.error}); serving saved demo route ${demo}`);
      raw = await loadDemoRoute(demo);
      fallback = true;
    }
  }

  res.setHeader('Cache-Control', 'private, max-age=300');
  if (req.query.raw === '1') return res.status(200).json(raw);
  return res.status(200).json({ mode, profile, routes: normalizeOrsRoutes(raw), ...(fallback && { fallback: true }) });
}
