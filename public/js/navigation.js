// Walking guidance in the browser: live GPS (watchPosition) or a simulated walk in demo mode.
// All decisions come from lib/guidance.js; this file feeds it positions and shows/speaks the result.

import { createGuideState, updateGuidance, nextEventText, simulatedPosition, formatDistance } from '../lib/guidance.js';
import { rememberPosition } from './location.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{ route, mode, speak, demo: boolean, speed?: number, startAt?: number, onEnd?: () => void }} opts
 * @returns {{ stop: () => void, repeat: () => void }}
 */
export function startNavigation({ route, mode, speak, demo, speed = 1.3, startAt = 0, onEnd, onMove }) {
  let state = createGuideState(route, mode);
  let last = null;       // last updateGuidance result
  let watchId = null;
  let timer = null;
  let wakeLock = null;
  let stopped = false;
  let lastPos = null;    // for "Where am I?" while walking

  // Keep the screen (and GPS) awake while walking. Not supported everywhere: ignore failures.
  navigator.wakeLock?.request?.('screen').then((l) => { wakeLock = l; }).catch(() => {});

  function render(r) {
    $('nav-next').textContent = r.offRoute ? 'Off the route' : nextEventText(r.next, mode);
    const min = Math.max(1, Math.round((r.remaining / 1.3) / 60));
    $('nav-remaining').textContent = `${formatDistance(r.remaining)} left · about ${min} min`;
  }

  function onPosition(pos, accuracy) {
    if (stopped) return;
    lastPos = pos;
    if (!demo) rememberPosition(pos);
    onMove?.(pos);
    const r = updateGuidance(state, pos, { accuracy });
    state = r.state;
    last = r;
    for (const m of r.say) {
      speak(m.text, m.priority, m);
      if (m.priority === 'crossing' && m.text.startsWith('Crossing now')) navigator.vibrate?.([250, 120, 250]);
    }
    render(r);
    window.__guide = { progress: r.progress, remaining: r.remaining, offRoute: r.offRoute, arrived: state.arrived };
    if (state.arrived) finish();
  }

  function finish() {
    stop();
    onEnd?.();
  }

  function stop() {
    stopped = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (timer) clearInterval(timer);
    wakeLock?.release?.().catch(() => {});
    watchId = null;
    timer = null;
  }

  if (demo) {
    // Simulated walk: 1.3 m/s by default, `speed` can make it faster for tests / the video.
    const t0 = performance.now();
    const tick = () => {
      const seconds = (performance.now() - t0) / 1000;
      onPosition(simulatedPosition(route.geometry, seconds + startAt / speed, speed), 5);
    };
    tick();
    timer = setInterval(tick, 250);
  } else if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (p) => onPosition([p.coords.longitude, p.coords.latitude], p.coords.accuracy),
      (err) => speak(
        err.code === 1 ? 'Location permission is off. I cannot guide you without it.' : 'Your location is not available right now. Keep your phone uncovered.',
        'navigation',
      ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  } else {
    speak('This phone does not share its location with the browser, so I cannot guide you.', 'navigation');
  }

  return {
    stop,
    position: () => lastPos,
    /** Repeat what comes next, e.g. after a noisy moment. */
    repeat() {
      if (!last) { speak('Waiting for your location.'); return; }
      speak(`${nextEventText(last.next, mode)}.`, 'navigation');
    },
  };
}
