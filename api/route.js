// GET /api/route?from=lon,lat&to=lon,lat&mode=blind|wheelchair|limited[&raw=1]
// Walking/wheelchair routes with alternatives from OpenRouteService. Cached in memory.
// Returns { profile, routes: [{ id, duration, distance, geometry, steps }] }  (raw=1 → ORS GeoJSON as-is)

import { orsOptionsForMode, normalizeMode } from '../public/lib/modes.js';
import { normalizeOrsRoutes } from '../public/lib/ors.js';
import { createCache } from './_lib/cache.js';
import { parseLonLat, fail, fetchWithTimeout, requireKey } from './_lib/http.js';

const cache = createCache();
const round = (p) => p.map((x) => x.toFixed(5)).join(',');

export default async function handler(req, res) {
  const from = parseLonLat(req.query.from);
  const to = parseLonLat(req.query.to);
  if (!from || !to) return fail(res, 400, 'from and to must be "lon,lat"');
  if (!requireKey(res, 'ORS_API_KEY')) return;

  const mode = normalizeMode(req.query.mode);
  const { profile, options } = orsOptionsForMode(mode);
  const key = `${profile}|${JSON.stringify(options)}|${round(from)}|${round(to)}`;

  let raw = cache.get(key);
  if (!raw) {
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
      return fail(res, 504, 'Route service did not answer in time');
    }
    if (!r.ok) {
      const text = await r.text();
      let msg = `Route service error ${r.status}`;
      try { msg += ': ' + (JSON.parse(text).error?.message || ''); } catch { /* not JSON */ }
      return fail(res, r.status === 429 ? 429 : 502, msg);
    }
    raw = await r.json();
    cache.set(key, raw);
  }

  res.setHeader('Cache-Control', 'private, max-age=300');
  if (req.query.raw === '1') return res.status(200).json(raw);
  return res.status(200).json({ mode, profile, routes: normalizeOrsRoutes(raw) });
}
