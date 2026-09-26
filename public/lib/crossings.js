// Crossing data from OpenStreetMap: filter, classify, cluster, and match to a route.
// Pure module: no DOM, no fetch. Rules come from CLAUDE.md ("Crossing data rules").

import { distance, pointToLineDistance, bbox, bboxContains } from './geo.js';

export const CLUSTER_RADIUS_M = 20;
export const ON_ROUTE_M = 12;

// Traffic-signal nodes that are not for pedestrians.
const NON_PEDESTRIAN_SIGNALS = new Set(['emergency', 'cyclist_crossing', 'tram_priority', 'blinker', 'ramp_meter']);

/** Should this OSM node be used at all? */
export function isUsableNode(tags = {}) {
  if (tags.level !== undefined && tags.level !== '0') return false;  // e.g. level=-1 (underground)
  if (tags.access === 'private') return false;
  if (tags.crossing === 'no') return false;                           // "crossing not allowed here"
  if (tags.highway === 'traffic_signals' && NON_PEDESTRIAN_SIGNALS.has(tags.traffic_signals)) return false;
  return tags.highway === 'crossing' || tags.highway === 'traffic_signals';
}

const yesNo = (v) => (v === 'yes' ? 'yes' : v === 'no' ? 'no' : null);

/**
 * One node → what kind of crossing it is.
 * kind: 'signals' | 'zebra' | 'unmarked' | 'unknown'
 * sound / vibration / tactile / island: 'yes' | 'no' | null (null = not mapped, never guessed)
 * kerb: 'lowered' | 'raised' | null
 * NOTE: button_operated is ignored on purpose (inconsistent in Vienna).
 */
export function classifyNode(tags = {}) {
  const crossing = tags.crossing;
  const markings = tags['crossing:markings'] || '';
  let kind = 'unknown';

  if (crossing === 'traffic_signals' || tags['crossing:signals'] === 'yes' || tags.highway === 'traffic_signals') {
    kind = 'signals';
  } else if (crossing === 'unmarked' || markings === 'no') {
    kind = 'unmarked';
  } else if (
    crossing === 'zebra' || crossing === 'marked' || crossing === 'uncontrolled' ||
    tags.crossing_ref === 'zebra' || markings.includes('zebra') || markings === 'yes'
  ) {
    kind = 'zebra';
  } else if (tags['crossing:signals'] === 'no') {
    kind = 'unknown'; // we only know it has no lights
  }

  let kerb = null;
  if (['lowered', 'flush', 'no'].includes(tags.kerb)) kerb = 'lowered';
  else if (tags.kerb === 'raised' || tags.kerb === 'yes' || tags.kerb === 'regular') kerb = 'raised';

  return {
    kind,
    sound: yesNo(tags['traffic_signals:sound']),
    vibration: yesNo(tags['traffic_signals:vibration']),
    kerb,
    tactile: yesNo(tags.tactile_paving),
    island: yesNo(tags['crossing:island']),
  };
}

/** Overpass JSON → usable nodes [{id, lat, lon, tags}]. */
export function parseOverpass(json) {
  return (json.elements || [])
    .filter((e) => e.type === 'node' && e.tags && isUsableNode(e.tags))
    .map((e) => ({ id: e.id, lat: e.lat, lon: e.lon, tags: e.tags }));
}

// "Best known" ordering per attribute: the first value in the list wins.
const BEST = {
  kind: ['signals', 'zebra', 'unmarked', 'unknown'],
  sound: ['yes', 'no', null],
  vibration: ['yes', 'no', null],
  kerb: ['lowered', 'raised', null],
  tactile: ['yes', 'no', null],
  island: ['yes', 'no', null],
};
const ATTRS = Object.keys(BEST);

function better(attr, a, b) {
  return BEST[attr].indexOf(a) <= BEST[attr].indexOf(b) ? a : b;
}

/**
 * Groups nodes within `radius` metres into one crossing group (one intersection can have 15 nodes).
 * Greedy: each node joins the nearest existing group whose centre is within the radius.
 * Uses a coarse grid so it stays fast for a whole city (~20k nodes).
 */
export function clusterCrossings(nodes, radius = CLUSTER_RADIUS_M) {
  const cell = radius / 111320; // grid cell size in degrees latitude (≈ radius)
  const grid = new Map();
  const key = (i, j) => i + ':' + j;
  const groups = [];

  const sorted = [...nodes].sort((a, b) => a.lat - b.lat || a.lon - b.lon || a.id - b.id);
  for (const n of sorted) {
    const c = classifyNode(n.tags);
    const lonScale = Math.cos((n.lat * Math.PI) / 180);
    const gi = Math.floor(n.lat / cell);
    const gj = Math.floor((n.lon * lonScale) / cell);

    let best = null;
    let bestD = Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const g of grid.get(key(gi + di, gj + dj)) || []) {
          const d = distance([n.lon, n.lat], [g.lon, g.lat]);
          if (d <= radius && d < bestD) { best = g; bestD = d; }
        }
      }
    }

    if (best) {
      const k = best.nodeIds.length;
      best.lat = (best.lat * k + n.lat) / (k + 1);
      best.lon = (best.lon * k + n.lon) / (k + 1);
      best.nodeIds.push(n.id);
      for (const a of ATTRS) best[a] = better(a, best[a], c[a]);
    } else {
      const g = { id: 'g' + n.id, lat: n.lat, lon: n.lon, nodeIds: [n.id], ...c };
      groups.push(g);
      const k = key(gi, gj);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(g);
    }
  }
  for (const g of groups) g.nodeIds.sort((a, b) => a - b);
  return groups;
}

/**
 * Crossing groups within `maxDist` metres of the route line, ordered along the route.
 * Each result gets `distanceToRoute` and `along` (metres from the route start).
 */
export function crossingsOnRoute(groups, line, maxDist = ON_ROUTE_M) {
  const box = bbox(line, maxDist + 5);
  const result = [];
  for (const g of groups) {
    if (!bboxContains(box, [g.lon, g.lat])) continue;
    const r = pointToLineDistance([g.lon, g.lat], line);
    if (r.distance <= maxDist) result.push({ ...g, distanceToRoute: r.distance, along: r.along });
  }
  return result.sort((a, b) => a.along - b.along);
}

// ---- Compact snapshot format (public/data/crossings-<city>.json) ----
// Each group is one row: [lat, lon, kind, sound, vibration, kerb, tactile, island]
// kind: S=signals Z=zebra U=unmarked ?=unknown; tri-state: y / n / "" (unknown); kerb: l / r / ""
const KIND_CODE = { signals: 'S', zebra: 'Z', unmarked: 'U', unknown: '?' };
const CODE_KIND = Object.fromEntries(Object.entries(KIND_CODE).map(([k, v]) => [v, k]));
const tri = (v) => (v === 'yes' ? 'y' : v === 'no' ? 'n' : '');
const untri = (c) => (c === 'y' ? 'yes' : c === 'n' ? 'no' : null);
const round6 = (x) => Math.round(x * 1e6) / 1e6;

export function encodeGroups(groups) {
  return groups.map((g) => [
    round6(g.lat), round6(g.lon), KIND_CODE[g.kind],
    tri(g.sound), tri(g.vibration), g.kerb === 'lowered' ? 'l' : g.kerb === 'raised' ? 'r' : '',
    tri(g.tactile), tri(g.island),
  ]);
}

export function decodeGroups(rows) {
  return rows.map((r, i) => ({
    id: 'c' + i,
    lat: r[0], lon: r[1], kind: CODE_KIND[r[2]] || 'unknown',
    sound: untri(r[3]), vibration: untri(r[4]),
    kerb: r[5] === 'l' ? 'lowered' : r[5] === 'r' ? 'raised' : null,
    tactile: untri(r[6]), island: untri(r[7]),
  }));
}
