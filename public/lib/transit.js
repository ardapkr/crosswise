// Public transport trips from Transitous (a free MOTIS 2 journey planner, https://transitous.org)
// → the simple objects the app works with. Pure module: no DOM, no fetch.
//
// option = { id, start, end (ms), transfers, legs: [walkLeg | rideLeg] }
// walkLeg = { kind: 'walk', from: place, to: place, start, end, duration (s), distance (m), geometry }
// rideLeg = { kind: 'ride', mode, vehicle, line, headsign, origin, from: place, to: place,
//             departure, arrival (ms), duration (s), stops (how many stops to ride),
//             intermediate: [{ name, lon, lat, arrival }], geometry, wheelchair: 'yes'|'no'|'unknown',
//             realTime, agency }
// place = { name, lon, lat, level, track, stopId, parentId }   (name '' = the user's start / destination)
// geometry = [[lon, lat], ...] like everywhere else in the app.

/** MOTIS mode → the word we say. U-Bahn/S-Bahn lines already carry their letter ("U1", "S45"). */
const VEHICLE = {
  BUS: 'bus', COACH: 'bus', TRAM: 'tram', SUBWAY: 'U-Bahn', METRO: 'S-Bahn',
  RAIL: 'train', REGIONAL_RAIL: 'train', REGIONAL_FAST_RAIL: 'train', HIGHSPEED_RAIL: 'train',
  LONG_DISTANCE: 'train', NIGHT_RAIL: 'train', SUBURBAN: 'S-Bahn', FERRY: 'ferry',
  CABLE_CAR: 'cable car', FUNICULAR: 'funicular', AERIAL_LIFT: 'cable car',
};

/** Google encoded polyline (MOTIS uses precision 7 in API v1) → [[lon, lat], ...]. */
export function decodePolyline(str, precision = 7) {
  if (typeof str !== 'string' || !str) return [];
  const factor = 10 ** precision;
  const out = [];
  let index = 0, lat = 0, lon = 0;
  const next = () => {
    let result = 0, shift = 0, b;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    lat += next();
    lon += next();
    out.push([lon / factor, lat / factor]);
  }
  return out;
}

// Stop names come as "Wien Absberggasse": inside Vienna "Wien " is noise when spoken.
// Keep it where the rest alone would be unclear ("Wien Mitte", "Wien Nord").
const KEEP_WIEN = new Set(['Mitte', 'Nord']);
export function placeName(name) {
  if (typeof name !== 'string' || name === 'START' || name === 'END') return '';
  const m = name.match(/^Wien (.+)$/);
  return m && !KEEP_WIEN.has(m[1]) ? m[1] : name;
}

/** "13A" or "U1": the line as shown on the vehicle. */
function lineOf(leg) {
  return String(leg.routeShortName || leg.displayName || leg.tripShortName || '').trim();
}

function wheelchairOf(v) {
  if (v === true || v === 'ACCESSIBLE') return 'yes';
  if (v === false || v === 'NOT_ACCESSIBLE') return 'no';
  return 'unknown';
}

function place(p = {}) {
  return {
    name: placeName(p.name),
    lon: p.lon,
    lat: p.lat,
    level: typeof p.level === 'number' ? p.level : 0,
    track: p.track || p.scheduledTrack || '',
    stopId: p.stopId || '',
    parentId: p.parentId || '',
  };
}

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

function normalizeLeg(l) {
  const geometry = decodePolyline(l.legGeometry?.points, l.legGeometry?.precision ?? 7);
  const base = {
    from: place(l.from),
    to: place(l.to),
    duration: l.duration ?? Math.round((ms(l.endTime) - ms(l.startTime)) / 1000),
    geometry: geometry.length >= 2 ? geometry : [[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]],
  };
  if (l.mode === 'WALK' || l.mode === 'FOOT') {
    return { kind: 'walk', ...base, start: ms(l.startTime), end: ms(l.endTime), distance: l.distance ?? 0 };
  }
  const intermediate = (l.intermediateStops || []).map((s) => ({
    name: placeName(s.name), lon: s.lon, lat: s.lat, arrival: ms(s.arrival || s.departure),
  }));
  return {
    kind: 'ride',
    ...base,
    mode: l.mode,
    vehicle: VEHICLE[l.mode] || 'vehicle',
    line: lineOf(l),
    headsign: placeName(l.headsign || l.tripTo?.name || ''),
    origin: placeName(l.tripFrom?.name || ''),
    departure: ms(l.startTime),
    arrival: ms(l.endTime),
    stops: intermediate.length + 1,
    intermediate,
    wheelchair: wheelchairOf(l.wheelchairAccessible),
    realTime: Boolean(l.realTime),
    agency: l.agencyName || '',
  };
}

/** Transitous /api/v1/plan answer → options (in the order Transitous gave them). */
export function normalizePlan(json) {
  const its = Array.isArray(json?.itineraries) ? json.itineraries : [];
  return its
    .map((it, i) => {
      const legs = (it.legs || []).map(normalizeLeg);
      return {
        id: 't' + (i + 1),
        start: ms(it.startTime),
        end: ms(it.endTime),
        transfers: it.transfers ?? Math.max(0, legs.filter((l) => l.kind === 'ride').length - 1),
        legs,
      };
    })
    .filter((o) => o.legs.some((l) => l.kind === 'ride'));
}

/** Same lines between the same stops = same trip, just another departure. */
export function patternKey(option) {
  return option.legs
    .filter((l) => l.kind === 'ride')
    .map((l) => `${l.line}@${l.from.stopId || l.from.name}>${l.to.stopId || l.to.name}`)
    .join('|');
}

export const TRANSFER_PENALTY_S = 5 * 60; // each change is hard without sight: count it as 5 extra minutes

/**
 * Groups options by pattern and returns the best `max` patterns, each with all its departures (earliest first).
 * Best = earliest arrival + a penalty per transfer. Options with a ride the wheelchair user cannot take
 * (marked not accessible) are dropped in wheelchair mode.
 * @returns {{ key, options: option[] }[]}
 */
export function choosePatterns(options, { max = 2, mode = 'blind' } = {}) {
  const usable = mode === 'wheelchair'
    ? options.filter((o) => !o.legs.some((l) => l.kind === 'ride' && l.wheelchair === 'no'))
    : options;
  const groups = new Map();
  for (const o of usable) {
    const key = patternKey(o);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const cost = (o) => o.end + o.transfers * TRANSFER_PENALTY_S * 1000;
  const sorted = [...groups.entries()]
    .map(([key, list]) => ({ key, options: [...list].sort((a, b) => a.start - b.start) }))
    .sort((a, b) => Math.min(...a.options.map(cost)) - Math.min(...b.options.map(cost)));
  // "Same trip plus one more short ride" is not a real second option (e.g. U1, then 1 stop by tram).
  const chosen = [];
  for (const g of sorted) {
    if (chosen.length >= max) break;
    if (chosen.some((c) => g.key.startsWith(c.key + '|'))) continue;
    chosen.push(g);
  }
  return chosen;
}

/** Every ISO time in a saved plan moved by `deltaMs` (saved fixtures replayed "now"). Returns a copy. */
export function shiftPlanTimes(json, deltaMs) {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
  const walk = (v) => {
    if (typeof v === 'string' && ISO.test(v)) return new Date(Date.parse(v) + deltaMs).toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(json);
}

/** Keeps only what the app uses (fixtures stay small): no debug output, no walking steps, no alternatives. */
export function trimPlan(json) {
  const DROP = new Set(['steps', 'alternatives', 'routeUrl', 'agencyUrl', 'agencyFareUrl', 'fareTransfers', 'debugOutput']);
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, clean(x)]));
    return v;
  };
  return { itineraries: clean(json?.itineraries || []) };
}

/** "tram D", "bus 69A", "U1", "S45", "train REX 7" — how we name a line when speaking. */
export function lineName(leg) {
  if (/^[US]\d/i.test(leg.line)) return leg.line;
  if (leg.vehicle === 'U-Bahn' || leg.vehicle === 'S-Bahn') return `${leg.vehicle} ${leg.line}`;
  return `${leg.vehicle} ${leg.line}`.trim();
}
