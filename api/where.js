// GET /api/where?lon=16.3954&lat=48.1761
// → { street: {street, housenumber, distance} | null, stops: [nearest 2], crossing: nearest | null, city }
// Street name: OpenRouteService reverse geocode (cached; if it fails the rest still works).
// Stops + crossing: the prebuilt Vienna/Budapest snapshots (no live Overpass).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeGroups } from '../public/lib/crossings.js';
import { decodeStops, nearestStops, nearestCrossing, parseReverse } from '../public/lib/whereami.js';
import { createCache } from './_lib/cache.js';
import { parseLonLat, fail, fetchWithTimeout } from './_lib/http.js';

const CITIES = ['vienna', 'budapest'];
const data = {}; // city → { groups, stops }, loaded lazily and kept while the instance is warm
const streetCache = createCache({ max: 500 });

async function loadCity(city) {
  if (!data[city]) {
    const dir = path.join(process.cwd(), 'public', 'data');
    const [c, s] = await Promise.all([
      readFile(path.join(dir, `crossings-${city}.json`), 'utf8').then(JSON.parse),
      readFile(path.join(dir, `stops-${city}.json`), 'utf8').then(JSON.parse),
    ]);
    data[city] = { bbox: c.bbox, groups: decodeGroups(c.rows), stops: decodeStops(s.rows) };
  }
  return data[city];
}

const inside = ([lon, lat], [w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n;

/** Street name via ORS reverse geocode, or null (no key, timeout, error: the answer still works). */
export async function reverseStreet(pos) {
  const key = pos.map((x) => x.toFixed(4)).join(','); // ~10 m grid
  const hit = streetCache.get(key);
  if (hit !== undefined) return hit;
  if (!process.env.ORS_API_KEY) return null;
  const u = new URL('https://api.openrouteservice.org/geocode/reverse');
  u.searchParams.set('point.lon', pos[0]);
  u.searchParams.set('point.lat', pos[1]);
  u.searchParams.set('size', '1');
  u.searchParams.set('layers', 'address,street');
  u.searchParams.set('boundary.circle.radius', '0.3'); // km
  try {
    const r = await fetchWithTimeout(u, { headers: { Authorization: process.env.ORS_API_KEY, Accept: 'application/json' } }, 6000);
    if (!r.ok) return null;
    const street = parseReverse(await r.json());
    streetCache.set(key, street);
    return street;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const pos = parseLonLat(`${req.query.lon},${req.query.lat}`);
  if (!pos) return fail(res, 400, 'lon and lat are required');

  let city = null;
  let stops = [];
  let crossing = null;
  for (const c of CITIES) {
    const d = await loadCity(c);
    if (inside(pos, d.bbox)) {
      city = c;
      stops = nearestStops(d.stops, pos);
      crossing = nearestCrossing(d.groups, pos);
      break;
    }
  }
  const street = await reverseStreet(pos);
  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json({ city, street, stops, crossing });
}
