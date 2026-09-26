// GET /api/crossings?bbox=west,south,east,north
// → { source: 'snapshot'|'overpass', city, rows: [...compact rows, see lib/crossings.js] }
// Vienna/Budapest come from the prebuilt snapshot (never live Overpass during the demo).
// Anywhere else: live Overpass for the bbox (small areas only), clustered the same way, cached.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseOverpass, clusterCrossings, encodeGroups } from '../public/lib/crossings.js';
import { createCache } from './_lib/cache.js';
import { parseBbox, fail, fetchWithTimeout } from './_lib/http.js';

const CITIES = ['vienna', 'budapest'];
const snapshots = {}; // loaded lazily, kept while the instance is warm
const liveCache = createCache({ max: 100 });
const MAX_LIVE_SPAN_DEG = 0.08; // ~6-9 km: don't hammer the public Overpass server

async function loadSnapshot(city) {
  if (!snapshots[city]) {
    const file = path.join(process.cwd(), 'public', 'data', `crossings-${city}.json`);
    snapshots[city] = JSON.parse(await readFile(file, 'utf8'));
  }
  return snapshots[city];
}

const inside = (inner, outer) =>
  inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];

export default async function handler(req, res) {
  const box = parseBbox(req.query.bbox);
  if (!box) return fail(res, 400, 'bbox must be "west,south,east,north"');
  const [w, s, e, n] = box;

  for (const city of CITIES) {
    const snap = await loadSnapshot(city);
    if (inside(box, snap.bbox)) {
      const rows = snap.rows.filter((r) => r[0] >= s && r[0] <= n && r[1] >= w && r[1] <= e);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).json({ source: 'snapshot', city, osmTimestamp: snap.osmTimestamp, rows });
    }
  }

  // Fallback: live Overpass (outside Vienna/Budapest)
  if (e - w > MAX_LIVE_SPAN_DEG || n - s > MAX_LIVE_SPAN_DEG) {
    return fail(res, 400, 'Area too large for live crossing data outside Vienna and Budapest');
  }
  const key = box.map((x) => x.toFixed(4)).join(',');
  let rows = liveCache.get(key);
  if (!rows) {
    const b = `${s},${w},${n},${e}`;
    const query = `[out:json][timeout:25];(node["highway"="crossing"](${b});node["highway"="traffic_signals"](${b}););out body;`;
    let r;
    try {
      r = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Crosswise-hackathon/0.1' },
        body: 'data=' + encodeURIComponent(query),
      }, 25000);
    } catch {
      return fail(res, 504, 'Crossing data service did not answer in time');
    }
    if (!r.ok) return fail(res, 502, `Crossing data service error ${r.status}`);
    rows = encodeGroups(clusterCrossings(parseOverpass(await r.json())));
    liveCache.set(key, rows);
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ source: 'overpass', city: null, rows });
}
