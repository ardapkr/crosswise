// Riding a bus, tram or U-Bahn: waiting, boarding, counting stops, "your stop is next". Pure module.
//
//   let s = createRideState(rideLeg);
//   every GPS fix or clock tick: const r = updateRide(s, { now, position, accuracy, boarded });
//                                s = r.state; r.say.forEach(m => speak(m.text, m.priority));
//
// Stops are counted with GPS when it is good (position projected on the vehicle's route line).
// Without GPS (underground, inside the vehicle) we count by the TIMETABLE: time since boarding against the
// scheduled arrival at each stop. Then every message says honestly that the count is approximate.

import { pointToLineDistance } from './geo.js';
import { lineName } from './transit.js';

export const BOARD_PROGRESS_M = 150;          // GPS moved this far along the line → the user is on board
export const GPS_FRESH_MS = 20000;            // an older fix = no GPS (underground)
export const GPS_MAX_ACCURACY_M = 60;
export const GPS_MAX_OFF_LINE_M = 80;         // farther from the line: don't count stops with this fix
export const STOP_REACHED_M = 40;
export const ASSUME_BOARDED_MS = 3 * 60e3;    // no GPS and 3 min after departure: assume on board
export const DUE_SOON_MS = 60e3;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const APPROX = ' By the timetable, so approximately.';

export function createRideState(leg) {
  const line = leg.geometry;
  const stops = [...leg.intermediate, { name: leg.to.name, lon: leg.to.lon, lat: leg.to.lat, arrival: leg.arrival }]
    .map((s) => ({ name: s.name, arrival: s.arrival, along: pointToLineDistance([s.lon, s.lat], line).along }));
  return {
    leg,
    stops,
    phase: 'waiting',   // → 'riding' → 'arrived'
    boardedAt: null,
    delay: 0,           // ms the vehicle runs behind the timetable (estimated when boarding)
    passed: 0,          // stops reached so far (never goes back)
    approx: false,
    lastFix: null,      // { t, along, off }
    announced: {},
  };
}

/**
 * One tick (GPS fix and/or clock). `boarded: true` = the user tapped "I'm on board".
 * @returns {{ state, say: {text, priority}[], stopsLeft, nextStop, approx }}
 */
export function updateRide(state, { now, position = null, accuracy = 999, boarded = false }) {
  const s = { ...state, announced: { ...state.announced } };
  const say = [];
  const once = (key, text, priority = 'navigation') => {
    if (s.announced[key]) return;
    s.announced[key] = true;
    say.push({ text, priority, keep: true });
  };
  const leg = s.leg;

  if (position && accuracy <= GPS_MAX_ACCURACY_M) {
    const snap = pointToLineDistance(position, leg.geometry);
    s.lastFix = { t: now, along: snap.along, off: snap.distance };
  }
  const gps = s.lastFix && now - s.lastFix.t <= GPS_FRESH_MS && s.lastFix.off <= GPS_MAX_OFF_LINE_M ? s.lastFix : null;

  if (s.phase === 'waiting') {
    if (now < leg.departure && leg.departure - now <= DUE_SOON_MS) {
      once('soon', `${capital(lineName(leg))} towards ${leg.headsign} is due in about 1 minute, by the timetable.`);
    }
    const byGps = gps && gps.along >= BOARD_PROGRESS_M;
    const assumed = !gps && now >= leg.departure + ASSUME_BOARDED_MS;
    if (boarded || byGps || assumed) {
      s.phase = 'riding';
      s.boardedAt = now;
      s.approx = !gps;
      // how late is the vehicle? (GPS boarding is noticed ~150 m after the stop: about 30 s of driving)
      s.delay = assumed ? 0 : Math.max(0, now - leg.departure - (byGps ? 30e3 : 0));
      const n = s.stops.length;
      const next = n === 1 ? ' Your stop is the next one.' : '';
      const approx = s.approx
        ? (assumed ? ' I think you are on board now, but I have no GPS here: I count the stops by the timetable, so the count is approximate.'
          : ' No GPS here: I count the stops by the timetable, so the count is approximate.')
        : '';
      say.push({ text: `On ${lineName(leg)} towards ${leg.headsign}. ${plural(n, 'stop')}. Get off at ${leg.to.name}.${next}${approx}`, priority: 'crossing', keep: true }); // same rank as "your stop is next": keeps the order
    }
  }

  if (s.phase === 'riding') {
    const n = s.stops.length;
    let reached;
    if (gps) {
      reached = s.stops.filter((st) => gps.along >= st.along - STOP_REACHED_M).length;
      s.approx = false;
    } else {
      reached = s.stops.filter((st) => now >= st.arrival + s.delay).length;
      s.approx = true;
    }
    if (reached > s.passed) {
      s.passed = Math.min(n, reached);
      const left = n - s.passed;
      const approx = s.approx ? APPROX : '';
      if (left === 0) {
        s.phase = 'arrived';
        say.push({
          text: s.approx
            ? `By the timetable you should be at ${leg.to.name} now. Get off when the doors open there.`
            : `Get off now: ${leg.to.name}.`,
          priority: 'crossing', // as important as a crossing: missing the stop is a real problem
          keep: true,
        });
      } else if (left === 1) {
        once('next', `Your stop is next: ${leg.to.name}. Get ready to get off.${approx}`, 'crossing');
      } else {
        say.push({ text: `${s.stops[s.passed - 1].name}. ${plural(left, 'stop')} to go.${approx}`, priority: 'info', ttlMs: 30000 });
      }
    }
  }

  const stopsLeft = s.stops.length - s.passed;
  return { state: s, say, stopsLeft, nextStop: s.stops[s.passed]?.name || null, approx: s.approx };
}

/** Short text for the big display while riding / waiting. */
export function rideStatusText(r, leg, now) {
  const st = r.state;
  if (st.phase === 'waiting') {
    const m = Math.round((leg.departure - now) / 60000);
    return `Wait for ${lineName(leg)} to ${leg.headsign}${m > 0 ? ` · in ${m} min` : ''}`;
  }
  if (st.phase === 'arrived') return `Get off at ${leg.to.name}`;
  const left = r.stopsLeft;
  return `${left === 1 ? 'Next stop: get off' : `${left} stops to go`}${r.nextStop ? ` · next: ${r.nextStop}` : ''}${r.approx ? ' (approx.)' : ''}`;
}
