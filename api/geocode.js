// GET /api/geocode?q=Stephansplatz[&focus=lon,lat]  → { results: [{ label, lon, lat }] } (top 3)
// OpenRouteService (Pelias) search, biased to the user's position or Vienna, limited to 30 km around it.

import { createCache } from './_lib/cache.js';
import { parseLonLat, fail, fetchWithTimeout, requireKey } from './_lib/http.js';

const cache = createCache({ max: 500 });
const HOIV = [16.3954, 48.1761];

export default async function handler(req, res) {
  const q = (req.query.q || '').trim();
  if (q.length < 2 || q.length > 200) return fail(res, 400, 'q must be 2–200 characters');
  if (!requireKey(res, 'ORS_API_KEY')) return;
  const focus = parseLonLat(req.query.focus) || HOIV;

  const key = `${q.toLowerCase()}|${focus.map((x) => x.toFixed(2)).join(',')}`;
  let results = cache.get(key);
  if (!results) {
    const u = new URL('https://api.openrouteservice.org/geocode/search');
    u.searchParams.set('text', q);
    u.searchParams.set('size', '3');
    u.searchParams.set('focus.point.lon', focus[0]);
    u.searchParams.set('focus.point.lat', focus[1]);
    u.searchParams.set('boundary.circle.lon', focus[0]);
    u.searchParams.set('boundary.circle.lat', focus[1]);
    u.searchParams.set('boundary.circle.radius', '30'); // the city around the user (60 km reached Bratislava)

    let r;
    try {
      r = await fetchWithTimeout(u, { headers: { Authorization: process.env.ORS_API_KEY, Accept: 'application/json' } });
    } catch {
      return fail(res, 504, 'Search did not answer in time');
    }
    if (!r.ok) return fail(res, r.status === 429 ? 429 : 502, `Search error ${r.status}`);
    const data = await r.json();
    results = (data.features || []).slice(0, 3).map((f) => ({
      label: f.properties.label || f.properties.name,
      name: f.properties.name,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
    cache.set(key, results);
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).json({ results });
}
