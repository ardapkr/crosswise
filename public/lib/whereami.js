// "Where am I?": street name, nearest bus/tram stops and nearest crossing → one spoken answer.
// Pure module. Data: stops snapshot (public/data/stops-<city>.json, from OpenStreetMap), crossing
// snapshot, and an ORS reverse geocode for the street (done in /api/where).

import { distance } from './geo.js';
import { formatDistance } from './guidance.js';
import { describeCrossing } from './summary.js';

// ---------- stops ----------

function stopKind(t) {
  const bus = t.highway === 'bus_stop' || t.bus === 'yes' || t.trolleybus === 'yes';
  const tram = t.railway === 'tram_stop' || t.tram === 'yes';
  if (bus && tram) return 'bus and tram';
  if (bus) return 'bus';
  if (tram) return 'tram';
  if (t.subway === 'yes') return 'subway';
  if (t.train === 'yes') return 'train';
  return 'stop';
}

/** Overpass JSON (bus_stop / tram_stop / platform nodes) → [{ name, lat, lon, kind, lines }] */
export function parseStops(json) {
  const out = [];
  for (const e of json?.elements || []) {
    const t = e.tags;
    if (e.type !== 'node' || !t?.name) continue;
    if (t.level !== undefined && t.level !== '0') continue; // underground platforms
    const lines = (t.route_ref || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    out.push({ name: t.name, lat: e.lat, lon: e.lon, kind: stopKind(t), lines });
  }
  return out;
}

const KIND_CODE = { bus: 'b', tram: 't', 'bus and tram': 'bt', subway: 's', train: 'r', stop: 'o' };
const CODE_KIND = Object.fromEntries(Object.entries(KIND_CODE).map(([k, v]) => [v, k]));
const round7 = (x) => Math.round(x * 1e7) / 1e7; // OSM precision

/** Compact rows for the snapshot: [lat, lon, name, kind code, "69A;13A"] */
export function encodeStops(stops) {
  return stops.map((s) => [round7(s.lat), round7(s.lon), s.name, KIND_CODE[s.kind] || 'o', s.lines.join(';')]);
}

export function decodeStops(rows) {
  return rows.map((r) => ({ name: r[2], lat: r[0], lon: r[1], kind: CODE_KIND[r[3]] || 'stop', lines: r[4] ? r[4].split(';') : [] }));
}

/** Nearest stops within `radius` m, one per stop name (both platforms share a name), nearest first. */
export function nearestStops(stops, pos, { radius = 400, max = 2 } = {}) {
  const seen = new Set();
  const out = [];
  const withDist = stops
    .map((s) => ({ ...s, distance: Math.round(distance(pos, [s.lon, s.lat])) }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
  for (const s of withDist) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Nearest crossing group within `radius` m, or null. */
export function nearestCrossing(groups, pos, radius = 150) {
  let best = null;
  for (const g of groups) {
    const d = distance(pos, [g.lon, g.lat]);
    if (d <= radius && (!best || d < best.distance)) best = { ...g, distance: Math.round(d) };
  }
  return best;
}

// ---------- street (ORS reverse geocode) ----------

/** ORS /geocode/reverse GeoJSON → { street, housenumber, distance (m) } or null */
export function parseReverse(json) {
  const p = json?.features?.[0]?.properties;
  if (!p) return null;
  const street = p.street || p.name || '';
  if (!street) return null;
  return { street, housenumber: p.housenumber || '', distance: Math.round((p.distance ?? 0) * 1000) };
}

// ---------- the sentence ----------

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const stopText = (s) => `${s.name}, ${s.kind}${s.lines.length ? ` ${s.lines.join(', ')}` : ''}, ${formatDistance(s.distance)}`;

/** { street, stops, crossing } → "You are on Arsenalstraße, near number 11. Nearest stop: …" */
export function whereAmIText({ street, stops = [], crossing = null }, mode) {
  const parts = [];
  if (!street) parts.push('I could not find the street name.');
  else if (street.distance <= 40) parts.push(street.housenumber ? `You are on ${street.street}, near number ${street.housenumber}.` : `You are on ${street.street}.`);
  else parts.push(`You are near ${street.street}.`);

  if (!stops.length) parts.push('No bus or tram stop within 400 metres.');
  else {
    parts.push(`Nearest stop: ${stopText(stops[0])}.`);
    if (stops[1]) parts.push(`Also ${stopText(stops[1])}.`);
  }

  if (crossing) parts.push(`Nearest crossing in ${formatDistance(crossing.distance)}: ${lowerFirst(describeCrossing(crossing, mode))}.`);
  return parts.join(' ');
}
