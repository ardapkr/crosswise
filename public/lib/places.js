// Place suggestions for the destination search (live, while typing).
// - parseSuggestions: an OpenRouteService / Pelias autocomplete answer → short rows for big buttons
// - matchKnownPlaces: a few places people name differently than OpenStreetMap does (e.g. the venue "HOIV")
// - mergeSuggestions: known places first, then ORS, without duplicates
// Pure module: used by /api/autocomplete, the browser and the tests.

import { distance } from './geo.js';

export const MIN_QUERY = 3;      // live suggestions start after this many letters
export const MAX_SUGGESTIONS = 6;

// Matched locally, instantly, from 2 letters, and shown before the ORS results:
// - HOIV is not in OpenStreetMap by that name (ORS finds nothing).
// - For "Hauptbahnhof", ORS lists the car-train terminal ("Autoreisezug", ~1 km east of the station hall)
//   first; a blind user taking the first suggestion must get the main entrance.
export const KNOWN_PLACES = [
  {
    name: 'HOIV', detail: 'Arsenalstraße 11, Landstraße, Vienna', lon: 16.3954, lat: 48.1761,
    keywords: ['hoiv', 'telos hackathon'],
  },
  {
    name: 'Wien Hauptbahnhof', detail: 'Main station, Favoriten, Vienna', lon: 16.3755, lat: 48.185,
    keywords: ['hauptbahnhof', 'hbf', 'main station', 'central station', 'train station'],
  },
];

const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();

/** Known places whose name or a keyword starts with the typed text (any word of it). */
export function matchKnownPlaces(query, places = KNOWN_PLACES) {
  const q = fold(query);
  if (q.length < 2) return [];
  return places
    .filter((p) => [p.name, ...(p.keywords || [])].some((k) => fold(k).startsWith(q) || fold(k).split(' ').some((w) => w.startsWith(q))))
    .map(({ name, detail, lon, lat }) => ({ name, detail, label: `${name}, ${detail}`, layer: 'venue', lon, lat }));
}

/** Second line under the name: street (for venues), district, city — never repeating the name. */
export function detailLine(p) {
  const parts = [];
  const add = (s) => { if (s && s !== p.name && !parts.includes(s)) parts.push(s); };
  if (p.layer === 'venue' && p.street) add(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  add(p.neighbourhood || p.borough);
  add(p.locality || p.localadmin || p.county || p.region);
  return parts.slice(0, 3).join(', ').replace(/\bCIty\b/g, 'City'); // typo in the district data ("Inner CIty")
}

/** Pelias GeoJSON → [{ name, detail, label, layer, lon, lat }], same place twice → once. */
export function parseSuggestions(data, max = MAX_SUGGESTIONS) {
  const out = [];
  for (const f of data?.features || []) {
    const p = f?.properties || {};
    const [lon, lat] = f?.geometry?.coordinates || [];
    const name = (p.name || p.label || '').trim();
    if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const s = { name, detail: detailLine(p), label: p.label || name, layer: p.layer || '', lon, lat };
    if (!isDuplicate(out, s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// Same name within 300 m (e.g. a big station as a venue and as a stop) = the same place for the user.
function isDuplicate(list, s) {
  return list.some((o) => fold(o.name) === fold(s.name) && distance([o.lon, o.lat], [s.lon, s.lat]) < 300);
}

/** A full-search result from /api/geocode ({ label, name, lon, lat }) → a suggestion row. */
export function fromGeocode(r) {
  const name = r.name || r.label;
  const rest = String(r.label || '').startsWith(`${name}, `) ? r.label.slice(name.length + 2) : '';
  return { name, detail: rest.replace(/,?\s*Austria$/, ''), label: r.label || name, layer: r.layer || '', lon: r.lon, lat: r.lat };
}

/** Known matches first, then ORS results, max `max` rows. */
export function mergeSuggestions(known, remote, max = MAX_SUGGESTIONS) {
  const out = [];
  for (const s of [...known, ...remote]) {
    if (!isDuplicate(out, s) && !out.some((o) => distance([o.lon, o.lat], [s.lon, s.lat]) < 30)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
