// Door-to-door public transport trips. Pure module: no DOM, no fetch.
//
// Hybrid routing: from the transit planner (lib/transit.js) we take only the RIDES. Every walking leg
// (to the stop, changes, to the destination) is replaced by OUR safest walking route for that leg
// (ORS alternatives + crossing scoring), so crossing alerts work on the whole trip.
// Walking legs to a stop end at the exact platform the transit data gives for that line AND direction
// (Vienna's timetable has one position per platform), so the user is led to the correct side of the street.
//
//   const reqs = walkRequests(option)                → fetch /api/route for each (the caller)
//   const trip = buildTrip(option, { routesFor, groups, mode })
//   const pick = firstReachable(pattern.options.map(build), now)
//   const { items, transitFirst } = orderPlan(walkRanked, trips)

import { crossingsOnRoute } from './crossings.js';
import { rankRoutes, scoreRoute, safetyLevel } from './scoring.js';
import { describeCrossing } from './summary.js';
import { distance } from './geo.js';
import { lineName } from './transit.js';
import { normalizeMode } from './modes.js';

export const SHORT_WALK_M = 40;          // shorter walks (same platform area): keep the planner's own path
export const WALK_FIRST_MAX_S = 20 * 60; // walking longer than this → public transport is listed first
export const BUFFER_S = 60;              // be at the stop a minute before the vehicle leaves
export const TIME_ZONE = 'Europe/Vienna';

const pt = (p) => [p.lon, p.lat];
const minutes = (s) => Math.max(1, Math.round(s / 60));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Key for a walking leg (the same walk shared by two options is routed once). */
export function legKey(leg) {
  const f = (p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`;
  return `${f(leg.from)}>${f(leg.to)}`;
}

/** Does this walking leg get our own ORS route? Not for very short walks (the planner's path is fine). */
export function needsOwnRoute(leg) {
  return leg.kind === 'walk' && distance(pt(leg.from), pt(leg.to)) >= SHORT_WALK_M;
}

/** Walking legs to route with ORS: [{ key, from: [lon, lat], to: [lon, lat] }], no duplicates. */
export function walkRequests(options) {
  const out = new Map();
  for (const o of [].concat(options)) {
    for (const leg of o.legs) {
      if (needsOwnRoute(leg) && !out.has(legKey(leg))) out.set(legKey(leg), { key: legKey(leg), from: pt(leg.from), to: pt(leg.to) });
    }
  }
  return [...out.values()];
}

/** The planner's own walking path, with our crossing data on it (used when we have no ORS route). */
function plannerRoute(leg, groups) {
  return {
    id: `p-${legKey(leg)}`,
    geometry: leg.geometry,
    steps: [],
    crossings: crossingsOnRoute(groups, leg.geometry),
    duration: leg.duration,
    distance: leg.distance,
    source: 'transit',
  };
}

/**
 * One transit option → a trip with our walking routes.
 * @param routesFor (key) → ORS walking routes for that leg (with `crossings`), or null/[] if none
 */
export function buildTrip(option, { routesFor = () => null, groups = [], mode = 'blind' } = {}) {
  mode = normalizeMode(mode);
  const legs = option.legs.map((leg) => {
    if (leg.kind !== 'walk') return { ...leg };
    const routes = needsOwnRoute(leg) ? routesFor(legKey(leg)) : null;
    const route = routes?.length ? { ...rankRoutes(routes, mode)[0], source: 'ors' } : plannerRoute(leg, groups);
    return { ...leg, route: { ...route, score: scoreRoute(route, mode) } };
  });

  const rides = legs.filter((l) => l.kind === 'ride');
  const first = rides[0];
  const last = rides.at(-1);
  const i0 = legs.indexOf(first);
  const walkBefore = legs.slice(0, i0).reduce((s, l) => s + l.route.duration, 0);
  const walkAfter = legs.slice(legs.indexOf(last) + 1).reduce((s, l) => s + l.route.duration, 0);
  const leave = first.departure - (walkBefore ? (walkBefore + BUFFER_S) * 1000 : 0);
  const arrive = last.arrival + walkAfter * 1000;

  // A change is "tight" if our walking route between two rides takes longer than the time between them.
  let tight = false;
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.kind !== 'walk') continue;
    const prev = legs.slice(0, i).reverse().find((x) => x.kind === 'ride');
    const next = legs.slice(i + 1).find((x) => x.kind === 'ride');
    if (prev && next && prev.arrival + l.route.duration * 1000 > next.departure) { l.tight = true; tight = true; }
  }

  const walks = legs.filter((l) => l.kind === 'walk');
  const crossings = walks.flatMap((l) => l.route.crossings || []);
  const wheel = rides.map((r) => r.wheelchair);
  return {
    id: option.id,
    kind: 'transit',
    legs,
    leave,
    arrive,
    duration: Math.round((arrive - leave) / 1000),
    transfers: rides.length - 1,
    walkSeconds: walks.reduce((s, l) => s + l.route.duration, 0),
    walkDistance: walks.reduce((s, l) => s + (l.route.distance || 0), 0),
    crossings,
    score: scoreRoute({ crossings }, mode),
    tight,
    wheelchair: wheel.includes('no') ? 'no' : wheel.every((w) => w === 'yes') ? 'yes' : 'unknown',
    geometry: legs.flatMap((l) => (l.kind === 'walk' ? l.route.geometry : l.geometry)),
  };
}

/** The earliest departure the user can still make (leave time not more than 30 s ago), else the last one. */
export function firstReachable(trips, now) {
  const sorted = [...trips].sort((a, b) => a.leave - b.leave);
  return sorted.find((t) => t.leave >= now - 30e3) || sorted.at(-1) || null;
}

// ---- wording ----

/** "10:09" in Vienna time, whatever the phone's time zone. */
export function clock(t) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(new Date(t));
}

/** "in 4 minutes" / "now" / "2 minutes ago" */
export function relative(t, now) {
  const m = Math.round((t - now) / 60000);
  if (m === 0) return 'now';
  return m > 0 ? `in ${plural(m, 'minute')}` : `${plural(-m, 'minute')} ago`;
}

/** "bus 69A", "tram D", "U1" */
export { lineName };

/** Card title: "Bus 69A + U1" */
export function tripTitle(trip) {
  return capital(trip.legs.filter((l) => l.kind === 'ride').map(lineName).join(' + '));
}

/** Spoken name: "bus 69A and U1" */
export function tripName(trip) {
  const names = trip.legs.filter((l) => l.kind === 'ride').map(lineName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

/** "2 crossings, both with acoustic signals." — crossings of one walking leg (or a whole trip). */
export function crossingsPhrase(crossings, mode) {
  mode = normalizeMode(mode);
  const n = crossings.length;
  if (n === 0) return 'No road crossings.';
  const kerbs = mode === 'blind' ? '' : kerbNote(crossings);
  if (n === 1) return `1 crossing: ${describeCrossing(crossings[0], mode).toLowerCase()}.`;
  const sound = crossings.filter((c) => c.kind === 'signals' && c.sound === 'yes').length;
  if (sound === n && mode !== 'limited') return `${n} crossings, ${n === 2 ? 'both' : 'all'} with acoustic signals.${kerbs}`;
  const lights = crossings.filter((c) => c.kind === 'signals').length;
  if (lights === n) return `${n} crossings, ${n === 2 ? 'both' : 'all'} with lights${sound && mode !== 'limited' ? `, ${sound} with an acoustic signal` : ''}.${kerbs}`;
  const parts = [];
  if (mode !== 'limited' && sound) parts.push(`${sound} with lights and an acoustic signal`);
  const silent = mode === 'limited' ? lights : lights - sound;
  if (silent) parts.push(`${silent} with lights${mode === 'limited' ? '' : ' only'}`);
  const zebra = crossings.filter((c) => c.kind === 'zebra').length;
  const unmarked = crossings.filter((c) => c.kind === 'unmarked').length;
  const unknown = n - lights - zebra - unmarked;
  if (zebra) parts.push(plural(zebra, 'zebra crossing'));
  if (unmarked) parts.push(`${unmarked} unmarked`);
  if (unknown) parts.push(`${unknown} of unknown type`);
  return `${n} crossings: ${parts.join(', ')}.${kerbs}`;
}

function kerbNote(crossings) {
  const raised = crossings.filter((c) => c.kerb === 'raised').length;
  const unknown = crossings.filter((c) => !c.kerb).length;
  const parts = [];
  if (raised) parts.push(`${plural(raised, 'crossing')} with a raised kerb`);
  if (unknown) parts.push(`kerb height unknown at ${unknown}`);
  return parts.length ? ` ${capital(parts.join('; '))}.` : '';
}

function platformText(p, vehicle) {
  if (!p.track) return '';
  return vehicle === 'bus' || vehicle === 'tram' ? `, stop ${p.track}` : `, platform ${p.track}`;
}

/** "Walk 4 minutes to Quartier Belvedere. 2 crossings, both with acoustic signals." */
export function walkLegText(leg, mode, nextRide = null) {
  const to = leg.to.name ? `${leg.to.name}${nextRide ? platformText(leg.to, nextRide.vehicle) : ''}` : 'your destination';
  const under = nextRide && leg.to.level < 0 ? ' The platform is underground.' : '';
  const tight = leg.tight ? ' The change is tight.' : '';
  return `Walk ${plural(minutes(leg.route.duration), 'minute')} to ${to}.${under} ${crossingsPhrase(leg.route.crossings || [], mode)}${tight}`;
}

function wheelchairText(leg) {
  if (leg.wheelchair === 'yes') return ' The timetable marks it wheelchair accessible.';
  if (leg.wheelchair === 'no') return ' The timetable marks it NOT wheelchair accessible.';
  return ' Wheelchair access unknown.';
}

/** "Take tram D towards Nußdorf. 5 stops. Get off at Schwarzenbergplatz." */
export function rideLegText(leg, mode = 'blind') {
  const toward = leg.headsign ? ` towards ${leg.headsign}` : '';
  const access = normalizeMode(mode) === 'wheelchair' ? wheelchairText(leg) : '';
  return `Take ${lineName(leg)}${toward}. ${plural(leg.stops, 'stop')}. Get off at ${leg.to.name}.${access}`;
}

/** Before a ride: "Tram D towards Nußdorf leaves at 10:10, in 4 minutes, from stop B." */
export function departureText(leg, now) {
  const toward = leg.headsign ? ` towards ${leg.headsign}` : '';
  const when = leg.departure < now - 30e3 ? `was due at ${clock(leg.departure)}, ${relative(leg.departure, now)}` : `leaves at ${clock(leg.departure)}, ${relative(leg.departure, now)}`;
  const from = leg.from.track ? `, from ${leg.vehicle === 'bus' || leg.vehicle === 'tram' ? 'stop' : 'platform'} ${leg.from.track}` : '';
  return `${capital(lineName(leg))}${toward} ${when}${from}. By the timetable.`;
}

/** Step list for the card and the spoken card: one sentence per leg. */
export function tripSteps(trip, mode) {
  return trip.legs.map((leg, i) => {
    if (leg.kind === 'ride') return rideLegText(leg, mode);
    const nextRide = trip.legs.slice(i + 1).find((l) => l.kind === 'ride') || null;
    return walkLegText(leg, mode, trip.legs[i + 1]?.kind === 'ride' ? nextRide : null);
  });
}

/** Short lines for the card: "Walk 2 min to Hüttenbrennergasse · 1 crossing", "Bus 69A to Hauptbahnhof · 09:09 · 4 stops". */
export function tripStepsShort(trip) {
  return trip.legs.map((leg) => {
    if (leg.kind === 'ride') {
      return `${capital(lineName(leg))}${leg.headsign ? ` to ${leg.headsign}` : ''} · ${clock(leg.departure)} · ${plural(leg.stops, 'stop')}, get off at ${leg.to.name}`;
    }
    const n = (leg.route.crossings || []).length;
    return `Walk ${minutes(leg.route.duration)} min to ${leg.to.name || 'destination'}${n ? ` · ${plural(n, 'crossing')}` : ''}${leg.tight ? ' · tight change' : ''}`;
  });
}

const LEVEL_SHORT = {
  good: 'all with lights and an acoustic signal',
  ok: 'all with lights',
  caution: 'one or more without lights',
  risky: 'including a risky or unknown crossing',
};

/** "3 crossings on foot, all with lights" */
export function tripCrossingsShort(trip) {
  const n = trip.score.count;
  if (n === 0) return 'no road crossings on foot';
  return `${plural(n, 'crossing')} on foot, ${LEVEL_SHORT[safetyLevel(trip.score)]}`;
}

/** Read out when a transit card is tapped. */
export function tripCardText(trip, mode, now) {
  const head = `${capital(tripName(trip))}: ${plural(minutes(trip.duration), 'minute')}, ${leaveText(trip, now)}, arrive at ${clock(trip.arrive)}. ${capital(tripCrossingsShort(trip))}.`;
  return [head, ...tripSteps(trip, mode)].join(' ');
}

export const SAFER_WITHIN_MS = 10 * 60e3; // a safer trip wins if it arrives at most 10 minutes later

/**
 * Which trip first? Like the walking routes: safest crossings first — but only if it arrives at most
 * 10 minutes later; otherwise the earlier arrival wins.
 */
export function compareTrips(a, b) {
  if (Math.abs(a.arrive - b.arrive) <= SAFER_WITHIN_MS) {
    const d = (b.score.worst - a.score.worst) || (a.score.risky || 0) - (b.score.risky || 0);
    if (d && !Number.isNaN(d)) return d;
  }
  return a.arrive - b.arrive;
}

/**
 * Walking vs public transport. Walking longer than ~20 minutes (and a faster trip exists) → transit first.
 * @returns {{ items: object[], transitFirst: boolean }} items = [walk, ...trips] or [...trips, walk]
 */
export function orderPlan(walkBest, trips) {
  const sorted = [...trips].sort(compareTrips);
  const transitFirst = Boolean(walkBest && sorted.length && walkBest.duration > WALK_FIRST_MAX_S && sorted[0].duration < walkBest.duration);
  if (!walkBest) return { items: sorted, transitFirst: sorted.length > 0 };
  return { items: transitFirst ? [...sorted, walkBest] : [walkBest, ...sorted], transitFirst };
}

/** "leave now, 23:06" / "leave at 23:19, in 13 minutes" */
export function leaveText(trip, now) {
  const rel = relative(trip.leave, now);
  return rel === 'now' ? `leave now, ${clock(trip.leave)}` : `leave at ${clock(trip.leave)}, ${rel}`;
}

/** One sentence per trip for the spoken plan summary. */
function tripSentence(trip, now) {
  return `${capital(tripName(trip))}, ${plural(minutes(trip.duration), 'minute')}, ${leaveText(trip, now)}. ${capital(tripCrossingsShort(trip))}.`;
}

/** Said when the recommended trip is not the fastest one: why. */
function saferNote(best, other) {
  if (!other || best.arrive <= other.arrive) return '';
  const m = Math.max(1, Math.round((best.arrive - other.arrive) / 60000));
  return ` It arrives ${plural(m, 'minute')} later than ${tripName(other)}, but its crossings are safer.`;
}

/**
 * Spoken summary of the whole plan.
 * @param walkSummary the walking comparison sentence (lib/summary.js routeSummary), null if no walking route
 */
export function planSummary({ walkBest, walkSummary, trips, transitFirst, now, note = '' }) {
  const extra = note ? ` ${note}` : '';
  if (!trips.length) return `${walkSummary || 'No route found.'}${extra}`;
  const sorted = [...trips].sort(compareTrips);
  const second = sorted[1] ? `${saferNote(sorted[0], sorted[1])} Second option: ${tripSentence(sorted[1], now)}` : '';
  if (transitFirst) {
    const walk = walkBest.score
      ? ` On foot: ${plural(minutes(walkBest.duration), 'minute')}, ${walkBest.score.count ? `${plural(walkBest.score.count, 'crossing')}, ${LEVEL_SHORT[safetyLevel(walkBest.score)]}` : 'no road crossings'}.`
      : '';
    return `Walking takes ${plural(minutes(walkBest.duration), 'minute')}, so public transport comes first. ` +
      `Best: ${tripSentence(sorted[0], now)}${second}${walk}${extra}`;
  }
  if (!walkBest) return `Public transport: ${tripSentence(sorted[0], now)}${second}${extra}`;
  const walking = walkSummary ? `Walking: ${walkSummary.charAt(0).toLowerCase()}${walkSummary.slice(1)}` : '';
  return `${walking} By public transport: ${tripSentence(sorted[0], now)}${second}${extra}`.trim();
}
