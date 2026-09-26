// Guidance for a public transport trip in the browser: live GPS (or a simulated trip in demo mode)
// plus a clock tick (rides are counted by the timetable when there is no GPS underground).
// All decisions come from lib/trip-guide.js; this file feeds it and shows / speaks the result.

import { createTripGuide, updateTripGuide, legButtonText, repeatText } from '../lib/trip-guide.js';
import { formatDistance } from '../lib/guidance.js';
import { pointAlong, lineLength } from '../lib/geo.js';
import { rememberPosition } from './location.js';

const $ = (id) => document.getElementById(id);
const DEMO_WAIT_MS = 4000;  // demo: how long we "wait at the stop" before boarding
const DEMO_RIDE_FACTOR = 6; // demo: vehicles move 6x the walking speed

/**
 * @param {{ trip, mode, speak, demo: boolean, speed?: number, onMove?, onEnd?, onTarget? }} opts
 *   onTarget(target|null): the line + direction to look for (Find my bus)
 */
export function startTrip({ trip, mode, speak, demo, speed = 1.3, onMove, onEnd, onTarget }) {
  let state = createTripGuide(trip, mode);
  let last = null;
  let watchId = null;
  let clock = null;
  let demoTimer = null;
  let wakeLock = null;
  let stopped = false;
  let lastPos = null;
  let lastTarget;
  let pressed = false; // the leg button was tapped: handled on the next update

  navigator.wakeLock?.request?.('screen').then((l) => { wakeLock = l; }).catch(() => {});

  function render(r) {
    $('nav-next').textContent = r.display;
    $('nav-remaining').textContent = r.remaining != null
      ? `${formatDistance(r.remaining)} to walk · leg ${r.leg + 1} of ${trip.legs.length}`
      : `Leg ${Math.min(r.leg + 1, trip.legs.length)} of ${trip.legs.length}`;
    const label = legButtonText(r);
    $('nav-leg').hidden = !label;
    if (label) $('nav-leg').querySelector('.label').textContent = label;
    const key = JSON.stringify(r.target);
    if (key !== lastTarget) { lastTarget = key; onTarget?.(r.target); }
  }

  function update(input) {
    if (stopped) return;
    const r = updateTripGuide(state, { now: Date.now(), ...input, next: pressed || undefined });
    pressed = false;
    state = r.state;
    last = r;
    for (const m of r.say) {
      speak(m.text, m.priority);
      if (m.priority === 'crossing' && /^(Crossing now|Get off now|Your stop is next)/.test(m.text)) navigator.vibrate?.([250, 120, 250]);
    }
    render(r);
    window.__trip = { leg: r.leg, kind: r.kind, phase: r.phase, done: state.done, target: r.target };
    if (state.done) finish();
  }

  function onPosition(pos, accuracy) {
    if (stopped) return;
    lastPos = pos;
    if (!demo) rememberPosition(pos);
    onMove?.(pos);
    update({ position: pos, accuracy });
  }

  function finish() {
    stop();
    onEnd?.();
  }

  function stop() {
    stopped = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    clearInterval(clock);
    clearInterval(demoTimer);
    wakeLock?.release?.().catch(() => {});
    $('nav-leg').hidden = true;
    onTarget?.(null);
  }

  // the clock: rides are counted by time too (underground there is no GPS)
  clock = setInterval(() => update({}), 1000);

  if (demo) {
    // Simulated trip: walk each walking leg, wait a moment at the stop, "board", ride along the line.
    let i = 0;
    let t0 = performance.now();
    let boardedAt = null;
    demoTimer = setInterval(() => {
      if (stopped) return;
      // follow the guide: it decides when a leg is over
      if (state.index > i) { i = state.index; t0 = performance.now(); boardedAt = null; }
      const leg = trip.legs[i];
      if (!leg) return;
      const secs = (performance.now() - t0) / 1000;
      if (leg.kind === 'walk') {
        onPosition(pointAlong(leg.route.geometry, secs * speed), 5);
      } else if (boardedAt === null) {
        onPosition([leg.from.lon, leg.from.lat], 5); // standing at the stop
        if (secs * 1000 >= DEMO_WAIT_MS) { boardedAt = performance.now(); pressed = true; update({}); }
      } else {
        const m = ((performance.now() - boardedAt) / 1000) * speed * DEMO_RIDE_FACTOR;
        onPosition(pointAlong(leg.geometry, Math.min(m, lineLength(leg.geometry) + 30)), 5);
      }
    }, 250);
  } else if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (p) => onPosition([p.coords.longitude, p.coords.latitude], p.coords.accuracy),
      (err) => { if (err.code === 1) speak('Location permission is off. I can still count stops by the timetable, but I cannot guide your walk.', 'navigation'); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }
  update({});

  return {
    stop,
    position: () => lastPos,
    /** "I'm at the stop" / "I'm on board" */
    nextLeg() { pressed = true; update({}); },
    repeat() {
      if (!last) { speak('Waiting for your location.'); return; }
      speak(repeatText(last, state), 'navigation');
    },
  };
}
