// Main UI wiring. Logic lives in /lib; this file only connects buttons, speech and storage.

import { MODES, normalizeMode } from '../lib/modes.js';
import { speak, repeatLast, unlockSpeech, appVoiceOn, setAppVoice } from './speech.js';
import { initRoutes } from './routes-ui.js';
import { startNavigation } from './navigation.js';
import { initLook } from './look-ui.js';
import { unlockSound } from './sound.js';
import { initVoice } from './voice.js';
import { showWalk, showPosition } from './map.js';
import { getJSON } from './api.js';
import { getPosition, HOIV } from './location.js';
import { whereAmIText } from '../lib/whereami.js';

const MODE_KEY = 'crosswise.mode';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// localStorage can throw (private mode): never let that break the app.
function loadMode() {
  try { return normalizeMode(localStorage.getItem(MODE_KEY)); } catch { return normalizeMode(null); }
}
function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
}

export const state = { mode: loadMode(), started: false, demo: params.get('demo') === '1' };

const modeLabel = (id) => MODES.find((m) => m.id === id).label;

function renderModes() {
  const box = $('modes');
  box.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mode = m.id;
    b.textContent = m.label;
    b.setAttribute('aria-pressed', String(m.id === state.mode));
    b.addEventListener('click', () => setMode(m.id));
    box.appendChild(b);
  }
}

function setMode(mode) {
  const changed = normalizeMode(mode) !== state.mode;
  state.mode = normalizeMode(mode);
  saveMode(state.mode);
  renderModes();
  speak(`${modeLabel(state.mode)} mode.`);
  document.querySelector(`[data-mode="${state.mode}"]`)?.focus();
  if (changed) routes.replan();
}

// --- walking guidance ---
let nav = null;

function showWalking(on) {
  $('nav-section').hidden = !on;
  $('where-section').hidden = on;
  $('routes-section').hidden = on;
  // the one map element moves between the walking panel and the route list
  const box = $('map-box');
  if (on) $('nav-section').insertBefore(box, $('nav-section').querySelector('.row'));
  else $('routes-section').insertBefore(box, $('routes'));
}

function startRoute(plan, route) {
  nav?.stop();
  showWalking(true);
  $('nav-heading').focus();
  speak(`Starting the route: about ${Math.max(1, Math.round(route.duration / 60))} minutes, ${route.score.count} crossings.` +
    (state.demo ? ' Demo walk.' : ''), 'navigation');
  showWalk($('map-box'), route, plan.mode);
  nav = startNavigation({
    route,
    mode: plan.mode,
    onMove: showPosition,
    speak,
    demo: state.demo,
    speed: Number(params.get('speed')) || 1.3,
    startAt: Number(params.get('at')) || 0, // demo only: start this many metres into the route
    onEnd: () => { nav = null; setTimeout(() => showWalking(false), 4000); },
  });
}

function stopRoute() {
  nav?.stop();
  nav = null;
  showWalking(false);
  speak('Route stopped.');
  $('to').focus();
}

$('nav-stop').addEventListener('click', stopRoute);
$('nav-repeat').addEventListener('click', () => nav?.repeat());

const routes = initRoutes({
  getMode: () => state.mode,
  speak,
  demo: state.demo,
  onChoose: startRoute,
});

function start() {
  unlockSpeech();
  unlockSound();
  state.started = true;
  $('start').hidden = true;
  $('app').hidden = false;
  renderModes();
  speak(`Crosswise ready. ${modeLabel(state.mode)} mode.${state.demo ? ' Demo mode: walking is simulated.' : ''} Where do you want to go?`);
  $('to').focus();
}

// App voice on/off (for screen reader users)
function renderVoiceToggle() {
  $('app-voice').setAttribute('aria-pressed', String(appVoiceOn()));
  $('app-voice').textContent = appVoiceOn() ? 'App voice: on' : 'App voice: off';
}
$('app-voice').addEventListener('click', () => {
  setAppVoice(!appVoiceOn());
  renderVoiceToggle();
  speak(appVoiceOn() ? 'App voice on.' : 'App voice off. Your screen reader will read the messages.');
});
renderVoiceToggle();

$('start').addEventListener('click', start);
$('repeat').addEventListener('click', repeatLast);

// ?video=/path.mp4 replays a same-origin test video instead of the camera (stage demo / tests).
const testVideo = params.get('video');
const SAFE_PATH = /^\/[\w\-./]+$/; // same-origin path only (a foreign video would also block frame capture)
const look = initLook({ speak, testVideoUrl: testVideo && SAFE_PATH.test(testVideo) ? testVideo : null });

// --- where am I ---
async function whereAmI() {
  let pos = nav?.position?.() || (state.demo ? [HOIV.lon, HOIV.lat] : null);
  if (!pos) {
    try {
      const p = await getPosition();
      pos = [p.lon, p.lat];
    } catch (e) {
      speak(e.message, 'navigation');
      return;
    }
  }
  try {
    const data = await getJSON(`/api/where?lon=${pos[0].toFixed(6)}&lat=${pos[1].toFixed(6)}`);
    speak(whereAmIText(data, state.mode), 'navigation');
  } catch (e) {
    speak(e.message, 'navigation');
  }
}
$('where').addEventListener('click', whereAmI);

const voice = initVoice({
  speak,
  handlers: {
    find_bus: (line) => look.findBus(line),
    check_light: () => look.checkLight(),
    read: () => look.read(),
    describe: () => look.describe(),
    where_am_i: () => whereAmI(),
    navigate: (place) => routes.planToPlace(place),
    set_mode: (mode) => setMode(mode),
    stop: () => { if (nav) stopRoute(); else look.stop(); },
    repeat: () => repeatLast(),
  },
});

// Expose for tests and the browser console.
window.crosswise = { state, speak, setMode, routes, look, voice };
