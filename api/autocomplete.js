// GET /api/autocomplete?q=steph[&focus=lon,lat] → { results: [{ name, detail, label, layer, lon, lat }] } (max 6)
// Live suggestions while typing: OpenRouteService (Pelias) autocomplete, biased to the user's position
// (or Vienna) and limited to a ~55 km box around it — this is a walking app. Cached: the free tier has a daily limit.

import { createCache } from './_lib/cache.js';
import { parseLonLat, fail, fetchWithTimeout, requireKey } from './_lib/http.js';
import { parseSuggestions } from '../public/lib/places.js';

const cache = createCache({ max: 2000 });
const HOIV = [16.3954, 48.1761];

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 100) return fail(res, 400, 'q must be 2–100 characters');
  if (!requireKey(res, 'ORS_API_KEY')) return;
  const focus = parseLonLat(req.query.focus) || HOIV;

  const key = `${q.toLowerCase()}|${focus.map((x) => x.toFixed(2)).join(',')}`;
  let results = cache.get(key);
  if (!results) {
    const u = new URL('https://api.openrouteservice.org/geocode/autocomplete');
    u.searchParams.set('text', q);
    u.searchParams.set('focus.point.lon', focus[0]);
    u.searchParams.set('focus.point.lat', focus[1]);
    u.searchParams.set('boundary.rect.min_lon', (focus[0] - 0.75).toFixed(4));
    u.searchParams.set('boundary.rect.max_lon', (focus[0] + 0.75).toFixed(4));
    u.searchParams.set('boundary.rect.min_lat', (focus[1] - 0.5).toFixed(4));
    u.searchParams.set('boundary.rect.max_lat', (focus[1] + 0.5).toFixed(4));
    // Places you walk to. Without this, 3 letters ("Ste") list villages 20–40 km away first.
    u.searchParams.set('layers', 'venue,address,street,neighbourhood,borough');
    u.searchParams.set('size', '10');

    let r;
    try {
      r = await fetchWithTimeout(u, { headers: { Authorization: process.env.ORS_API_KEY, Accept: 'application/json' } }, 8000);
    } catch {
      return fail(res, 504, 'Suggestions did not answer in time');
    }
    if (!r.ok) return fail(res, r.status === 429 ? 429 : 502, `Suggestions error ${r.status}`);
    results = parseSuggestions(await r.json());
    cache.set(key, results);
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).json({ results });
}
