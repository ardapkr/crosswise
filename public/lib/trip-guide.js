// Guidance for a whole public transport trip: walk → ride → walk … Pure module.
// Walking legs use the normal turn-by-turn + crossing alerts (lib/guidance.js), rides use lib/ride.js.
//
//   let s = createTripGuide(trip, mode);
//   on every GPS fix AND every clock tick (~1 s):
//     const r = updateTripGuide(s, { now, position, accuracy, next });   // next: user tapped "I'm at the stop" / "I'm on board"
//     s = r.state; r.say.forEach(m => speak(m.text, m.priority)); show r.display; r.target → Find my bus

import { createGuideState, updateGuidance, nextEventText } from './guidance.js';
import { createRideState, updateRide, rideStatusText } from './ride.js';
import { walkLegText, departureText, lineName } from './trip.js';

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nextRideAfter = (trip, i) => (trip.legs[i + 1]?.kind === 'ride' ? trip.legs[i + 1] : null);

export function createTripGuide(trip, mode) {
  return { trip, mode, index: -1, walk: null, ride: null, done: false, last: null };
}

/** Starts leg i. Returns the new state and what to say. */
function enterLeg(s, i, now) {
  const trip = s.trip;
  if (i >= trip.legs.length) {
    return [{ ...s, index: i, walk: null, ride: null, done: true }, [{ text: 'You have arrived at your destination.', priority: 'navigation', keep: true }]];
  }
  const leg = trip.legs[i];
  if (leg.kind === 'walk') {
    const nextRide = nextRideAfter(trip, i);
    const route = { ...leg.route, arriveText: nextRide ? `You are at the stop ${leg.to.name}.` : undefined };
    const then = nextRide ? ` Then take ${lineName(nextRide)} towards ${nextRide.headsign}.` : '';
    return [
      { ...s, index: i, walk: createGuideState(route, s.mode), ride: null, last: null },
      [{ text: `${walkLegText(leg, s.mode, nextRide)}${then}`, priority: 'navigation', keep: true }],
    ];
  }
  // a ride: the user is at the stop (or started there)
  const scan = leg.vehicle === 'bus' || leg.vehicle === 'tram' ? ` Tap Find bus: I check the line and the direction of arriving ${leg.vehicle === 'bus' ? 'buses' : 'trams'}.` : '';
  const said = [{ text: `${departureText(leg, now)}${scan}`, priority: 'navigation', keep: true }];
  return [{ ...s, index: i, walk: null, ride: createRideState(leg), last: null }, said];
}

/**
 * @param {{ now: number, position?: number[], accuracy?: number, next?: boolean }} input
 *   next = the user tapped the leg button: "I'm at the stop" (walk to a stop) or "I'm on board" (waiting)
 * @returns {{ state, say, display, remaining, target, leg, kind, phase }}
 */
export function updateTripGuide(state, { now, position = null, accuracy = 999, next = false }) {
  let s = state;
  const say = [];
  if (s.index === -1) {
    const [st, msgs] = enterLeg(s, 0, now);
    s = st;
    say.push(...msgs);
  }

  let display = s.done ? 'You have arrived.' : 'Waiting for your location…';
  let remaining = null;
  let phase = null;
  // at most a couple of leg changes per update (e.g. a tiny transfer walk that is already done)
  for (let guard = 0; guard < 3 && !s.done; guard++) {
    const leg = s.trip.legs[s.index];
    if (leg.kind === 'walk') {
      const toStop = Boolean(nextRideAfter(s.trip, s.index));
      if (next && toStop) {
        next = false;
        const [st, msgs] = enterLeg(s, s.index + 1, now);
        s = st;
        say.push({ text: `OK, at the stop ${leg.to.name}.`, priority: 'navigation', keep: true }, ...msgs);
        continue;
      }
      if (position) {
        const r = updateGuidance(s.walk, position, { accuracy });
        s = { ...s, walk: r.state, last: r };
        say.push(...r.say);
      }
      const r = s.last;
      if (r) {
        display = r.offRoute ? 'Off the route' : nextEventText(r.next, s.mode, toStop ? 'Stop' : 'Destination');
        remaining = r.remaining;
      }
      if (s.walk.arrived) {
        const [st, msgs] = enterLeg(s, s.index + 1, now);
        s = st;
        say.push(...msgs.filter((m) => !(st.done && m.text === 'You have arrived at your destination.'))); // guidance said it already
        continue;
      }
      phase = 'walk';
      break;
    } else {
      const r = updateRide(s.ride, { now, position, accuracy, boarded: next });
      next = false;
      s = { ...s, ride: r.state };
      say.push(...r.say);
      display = rideStatusText(r, leg, now);
      phase = r.state.phase;
      if (r.state.phase === 'arrived') {
        const [st, msgs] = enterLeg(s, s.index + 1, now);
        s = st;
        say.push(...msgs);
        continue;
      }
      break;
    }
  }
  if (s.done) display = 'You have arrived.';

  // Find my bus target: the ride we are waiting for (or walking to)
  const cur = s.trip.legs[s.index];
  const rideLeg = cur?.kind === 'ride' ? cur : nextRideAfter(s.trip, s.index);
  const target = !s.done && rideLeg && !(cur?.kind === 'ride' && s.ride?.phase !== 'waiting')
    ? { line: rideLeg.line, headsign: rideLeg.headsign, origin: rideLeg.origin, vehicle: rideLeg.vehicle }
    : null;

  return { state: s, say, display, remaining, target, leg: s.index, kind: cur?.kind || null, phase: s.done ? 'done' : phase };
}

/** What the leg button says right now (null = hide it). */
export function legButtonText(r) {
  if (r.phase === 'walk' && r.target) return "I'm at the stop";
  if (r.phase === 'waiting') return "I'm on board";
  return null;
}

/** Short line for "Repeat": what to do now. */
export function repeatText(r, state) {
  if (state.done) return 'You have arrived.';
  const leg = state.trip.legs[state.index];
  if (leg.kind === 'ride') return `${capital(r.display)}.`;
  return `${r.display}.`;
}
