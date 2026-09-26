// Turn-by-turn guidance with crossing alerts. Pure module: give it positions, it tells you what to say.
//
//   let state = createGuideState(route, mode);
//   on every GPS fix:  const r = updateGuidance(state, [lon, lat], { accuracy });
//                      state = r.state; r.say.forEach(m => speak(m.text, m.priority));
//
// route = { geometry, steps (from lib/ors.js), crossings (from crossingsOnRoute, with `along`) }

import { pointToLineDistance, distance } from './geo.js';
import { normalizeMode } from './modes.js';

export const CROSSING_FAR_M = 40;
export const CROSSING_NEAR_M = 10;
export const TURN_FAR_M = 30;
export const TURN_NEAR_M = 8;
export const ARRIVE_M = 15;
export const OFF_ROUTE_M = 35;
const PASSED_M = 15; // events further behind than this are ignored

// ORS step types that are real turns (6 = straight, 10 = arrive, 11 = depart are handled separately)
const TURN_TYPES = new Set([0, 1, 2, 3, 4, 5, 7, 8, 9, 12, 13]);

/** Distance from the start of the line to each vertex. */
export function cumulativeDistances(line) {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distance(line[i - 1], line[i]));
  return out;
}

export function formatDistance(m) {
  if (m < 7) return 'a few metres';
  if (m < 100) return `${Math.round(m / 10) * 10} metres`;
  if (m < 1000) return `${Math.round(m / 10) * 10} metres`;
  return `${(m / 1000).toFixed(1)} kilometres`;
}

// ---- wording ----

function crossingType(c) {
  if (c.kind === 'signals') {
    if (c.sound === 'yes') return 'traffic light with acoustic signal';
    if (c.sound === 'no') return 'traffic light without acoustic signal';
    return 'traffic light, acoustic signal unknown';
  }
  if (c.kind === 'zebra') return 'zebra crossing without lights';
  if (c.kind === 'unmarked') return 'unmarked crossing, no lights';
  return 'crossing of unknown type';
}

function kerbText(c) {
  if (c.kerb === 'lowered') return 'lowered kerb';
  if (c.kerb === 'raised') return 'raised kerb';
  return 'kerb height unknown';
}

/**
 * What to say for a crossing. stage: 'far' (~40 m) or 'near' (~10 m).
 * Never says "safe to cross": we only describe the crossing.
 */
export function crossingAlert(c, mode, stage, metres) {
  mode = normalizeMode(mode);
  const kerb = mode !== 'blind' ? `, ${kerbText(c)}` : '';

  if (stage === 'far') {
    let what = crossingType(c);
    if (c.kind === 'signals') {
      what = c.sound === 'yes' ? 'crossing with traffic light and acoustic signal'
        : c.sound === 'no' ? 'crossing with traffic light, no acoustic signal'
          : 'crossing with traffic light, acoustic signal unknown';
    }
    return `In ${formatDistance(metres)}: ${what}${kerb}.`;
  }

  const parts = [`Crossing now: ${crossingType(c)}${kerb}.`];
  if (c.island === 'yes') parts.push('There is a traffic island in the middle.');
  if (c.kind === 'signals') {
    if (c.sound === 'yes') parts.push('Press the button under the box.');
    parts.push('Listen for traffic before crossing.');
  } else if (c.kind === 'zebra') {
    parts.push('Make sure traffic has stopped before crossing.');
  } else {
    parts.push('Take extra care and listen for traffic.');
  }
  return parts.join(' ');
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const stripDot = (s) => s.replace(/\.$/, '');

// ---- events ----

const MINOR_TURNS = new Set([4, 5, 12, 13]); // slight left/right, keep left/right
const MERGE_TURNS_M = 15;       // turns closer than this become one instruction
const TURN_WARN_GAP_M = 30;     // no "in 30 metres" warning if the previous event was closer than this
const CROSSING_WARN_GAP_M = 45; // no separate early warning for a crossing right after another one

/**
 * All things to announce along the route, sorted by distance from the start.
 * Each turn/crossing gets `warn` (announce early?) and a crossing may get `nextCrossingIn`
 * (metres to a crossing that follows right after it) so busy intersections stay calm.
 */
export function buildEvents(route, mode) {
  const cum = cumulativeDistances(route.geometry);
  const events = [];
  const turns = [];
  for (const [i, s] of (route.steps || []).entries()) {
    const along = cum[Math.min(s.from, cum.length - 1)];
    if (s.type === 11 || (i === 0 && s.type !== 10)) events.push({ id: `s${i}`, kind: 'depart', along, instruction: s.instruction });
    else if (s.type === 10) events.push({ id: `s${i}`, kind: 'arrive', along: cum.at(-1), instruction: s.instruction });
    else if (TURN_TYPES.has(s.type)) turns.push({ id: `s${i}`, kind: 'turn', along, instruction: stripDot(s.instruction), minor: MINOR_TURNS.has(s.type) });
  }

  // Merge turns that come right after each other: "Turn left, then turn right"
  for (const t of turns) {
    const prev = events.at(-1);
    if (prev?.kind === 'turn' && t.along - prev.along < MERGE_TURNS_M && !prev.merged) {
      prev.instruction = `${prev.instruction}, then ${lowerFirst(t.instruction)}`;
      prev.minor = prev.minor && t.minor;
      prev.merged = true;
    } else {
      events.push(t);
    }
  }

  if (!events.some((e) => e.kind === 'arrive')) events.push({ id: 'arrive', kind: 'arrive', along: cum.at(-1), instruction: '' });
  for (const c of route.crossings || []) {
    events.push({ id: `x${c.id}`, kind: 'crossing', along: c.along, crossing: c });
  }
  events.sort((a, b) => a.along - b.along);

  // Decide which events get an early warning.
  let prevEvent = null;
  let prevCrossing = null;
  for (const e of events) {
    if (e.kind === 'turn') {
      e.warn = !e.minor && (!prevEvent || e.along - prevEvent.along >= TURN_WARN_GAP_M);
    } else if (e.kind === 'crossing') {
      const gap = prevCrossing ? e.along - prevCrossing.along : Infinity;
      e.warn = gap >= CROSSING_WARN_GAP_M;
      if (!e.warn) prevCrossing.nextCrossingIn = gap;
      prevCrossing = e;
    }
    if (e.kind !== 'depart') prevEvent = e;
  }
  return events;
}

export function createGuideState(route, mode) {
  return {
    route,
    mode: normalizeMode(mode),
    events: buildEvents(route, mode),
    total: cumulativeDistances(route.geometry).at(-1),
    announced: {},   // "<eventId>:<stage>" → true
    offRoute: false,
    progress: 0,
    arrived: false,
  };
}

/**
 * One GPS fix → what to say now.
 * @returns {{ state, say: {text, priority}[], progress, remaining, distanceToRoute, offRoute, next: {event, distance}|null }}
 */
export function updateGuidance(state, position, { accuracy = 10 } = {}) {
  const snap = pointToLineDistance(position, state.route.geometry);
  const progress = snap.along;
  const announced = { ...state.announced };
  const say = [];
  const once = (key, text, priority) => {
    if (announced[key]) return;
    announced[key] = true;
    say.push({ text, priority });
  };

  // Off route? Only decide when GPS is accurate enough to tell.
  let offRoute = state.offRoute;
  if (accuracy <= 40) {
    if (!offRoute && snap.distance > OFF_ROUTE_M) {
      offRoute = true;
      say.push({ text: 'You seem to be off the route. Stop and check your surroundings.', priority: 'navigation' });
    } else if (offRoute && snap.distance < OFF_ROUTE_M * 0.6) {
      offRoute = false;
      say.push({ text: 'Back on the route.', priority: 'navigation' });
    }
  }

  let arrived = state.arrived;
  if (!offRoute) {
    for (const e of state.events) {
      const d = e.along - progress;
      if (d < -PASSED_M) continue;          // behind us
      if (e.kind === 'depart') {
        if (progress < 30) once(e.id, `${stripDot(e.instruction)}.`, 'navigation');
      } else if (e.kind === 'crossing') {
        if (d <= CROSSING_NEAR_M) {
          announced[`${e.id}:far`] = true;  // too late for the early warning
          let text = crossingAlert(e.crossing, state.mode, 'near', d);
          if (e.nextCrossingIn) text += ` Then another crossing in ${formatDistance(e.nextCrossingIn)}.`;
          once(`${e.id}:near`, text, 'crossing');
        } else if (d <= CROSSING_FAR_M && e.warn) {
          once(`${e.id}:far`, crossingAlert(e.crossing, state.mode, 'far', d), 'crossing');
        }
      } else if (e.kind === 'turn') {
        const text = e.instruction;
        if (d <= TURN_NEAR_M) {
          announced[`${e.id}:far`] = true;
          once(`${e.id}:near`, `${text} now.`, 'navigation');
        } else if (d <= TURN_FAR_M && e.warn) {
          once(`${e.id}:far`, `In ${formatDistance(d)}, ${lowerFirst(text)}.`, 'navigation');
        }
      } else if (e.kind === 'arrive' && d <= ARRIVE_M) {
        once(e.id, 'You have arrived at your destination.', 'navigation');
        arrived = true;
      }
    }
  }

  // Next upcoming event (for the big display)
  const upcoming = state.events.find((e) => e.kind !== 'depart' && e.along - progress > -2 && !announced[`${e.id}:near`] && !(e.kind === 'arrive' && announced[e.id]));
  const next = upcoming ? { event: upcoming, distance: Math.max(0, upcoming.along - progress) } : null;

  return {
    state: { ...state, announced, offRoute, progress, arrived },
    say,
    progress,
    remaining: Math.max(0, state.total - progress),
    distanceToRoute: snap.distance,
    offRoute,
    next,
  };
}
