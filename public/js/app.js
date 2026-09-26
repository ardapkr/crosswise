// Main UI wiring. Logic lives in /lib; this file connects buttons, views, speech and storage.
// Views: start screen → app (map + search + sheet + camera bar); "searching" and "walking" are
// classes on #app that the CSS turns into the full-screen search panel and the walking banner.

import { MODES, normalizeMode } from '../lib/modes.js';
import { speak, repeatLast, unlockSpeech, appVoiceOn, setAppVoice } from './speech.js';
import { initRoutes } from './routes-ui.js';
import { startNavigation } from './navigation.js';
import { startTrip } from './trip-nav.js';
import { initLook } from './look-ui.js';
import { unlockSound } from './sound.js';
import { initVoice } from './voice.js';
import { initAsk } from './ask.js';
import { ensureMap, setMapPadding, showWalk, showTrip, showPosition, showHere, refit } from './map.js';
import { getJSON } from './api.js';
import { getPosition, HOIV } from './location.js';
import { whereAmIText } from '../lib/whereami.js';
import { tripName } from '../lib/trip.js';

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

// --- mode: segmented control (3 toggle buttons, one pressed) ---
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

// Panel heights as CSS variables: the sheet keeps some map visible, the map credit sits above the panels.
const SIZES = { '--top-h': '.top', '--dock-h': '.dock', '--bottom-h': '.bottom' };
function measurePanels() {
  if ($('app').classList.contains('is-searching')) return; // the search panel is full screen: keep the real sizes
  for (const [name, sel] of Object.entries(SIZES)) {
    document.documentElement.style.setProperty(name, `${Math.round(document.querySelector(sel).getBoundingClientRect().height)}px`);
  }
}
// on every size change, and right after a view change (so a route is fitted with the new sizes, not the old ones)
const sizes = new ResizeObserver(measurePanels);
for (const sel of ['.top', '.bottom']) sizes.observe(document.querySelector(sel));

// --- search panel (full screen while typing, like a map app) ---
function setSearching(on) {
  $('app').classList.toggle('is-searching', on);
  if (!on) {
    for (const id of ['to', 'from']) if (document.activeElement === $(id)) $(id).blur();
    measurePanels();
  }
}
for (const id of ['to', 'from']) $(id).addEventListener('focus', () => setSearching(true));
$('search-back').addEventListener('click', () => { setSearching(false); $('status').focus(); });
$('route-form').addEventListener('keydown', (e) => {
  // Escape closes the suggestions first (search.js), then the panel
  if (e.key === 'Escape' && $('to-suggestions').hidden && $('from-suggestions').hidden) {
    setSearching(false);
    $('status').focus();
  }
});

// --- walking guidance ---
let nav = null;

function showWalking(on) {
  $('app').classList.toggle('is-walking', on);
  $('nav-banner').hidden = !on;
  $('nav-section').hidden = !on;
  $('plan-section').hidden = on;
  measurePanels();
}

function startRoute(plan, route) {
  nav?.stop();
  showWalking(true);
  $('nav-heading').textContent = 'Walking · next';
  $('nav-heading').focus();
  speak(`Starting the route: about ${Math.max(1, Math.round(route.duration / 60))} minutes, ${route.score.count} crossings.` +
    (state.demo ? ' Demo walk.' : ''), 'navigation');
  showWalk($('map-box'), route);
  nav = startNavigation({
    route,
    mode: plan.mode,
    onMove: showPosition,
    speak,
    demo: state.demo,
    speed: Number(params.get('speed')) || 1.3,
    startAt: Number(params.get('at')) || 0, // demo only: start this many metres into the route
    onEnd: () => { nav = null; setTimeout(() => { showWalking(false); routes.redraw(); }, 4000); },
  });
}

/** Public transport trip: walk → ride → walk, with crossing alerts on every walk and stop counting on every ride. */
function startTripRoute(plan, trip) {
  nav?.stop();
  showWalking(true);
  $('nav-heading').textContent = 'Trip · next';
  $('nav-heading').focus();
  speak(`Starting the trip by ${tripName(trip)}: about ${Math.max(1, Math.round(trip.duration / 60))} minutes.` +
    (state.demo ? ' Demo trip.' : ''), 'navigation');
  showTrip($('map-box'), trip);
  nav = startTrip({
    trip,
    mode: plan.mode,
    onMove: showPosition,
    speak,
    demo: state.demo,
    speed: Number(params.get('speed')) || 1.3,
    onTarget: (t) => look.setTarget(t), // Find my bus knows the line AND the direction
    onEnd: () => { nav = null; setTimeout(() => { showWalking(false); routes.redraw(); }, 4000); },
  });
}

function stopRoute() {
  nav?.stop();
  nav = null;
  showWalking(false);
  routes.redraw();
  speak('Route stopped.');
  $('status').focus();
}

$('nav-stop').addEventListener('click', stopRoute);
$('nav-repeat').addEventListener('click', () => nav?.repeat());
$('nav-leg').addEventListener('click', () => nav?.nextLeg?.());

const routes = initRoutes({
  getMode: () => state.mode,
  speak,
  demo: state.demo,
  onChoose: startRoute,
  onChooseTrip: startTripRoute,
  closeSearch: () => setSearching(false),
  getAsk: () => ask,
});

// --- map: fills the screen; routes are fitted into the part the panels don't cover ---
setMapPadding(() => {
  const top = document.querySelector('.top').getBoundingClientRect();
  const bottom = document.querySelector('.bottom').getBoundingClientRect();
  if (bottom.right < window.innerWidth * 0.6) { // wide screen: panels on the left
    return { top: 24, bottom: 24, left: bottom.right + 24, right: 24 };
  }
  return { top: top.bottom + 16, bottom: window.innerHeight - bottom.top + 16, left: 20, right: 20 };
});
// --- sheet: "Show more" gives the routes almost the whole screen, "Show less" gives the map back ---
function setSheetExpanded(on) {
  $('sheet').classList.toggle('expanded', on);
  $('app').classList.toggle('sheet-expanded', on); // the map is mostly covered: the credit would float over the search
  $('sheet-toggle').setAttribute('aria-expanded', String(on));
  $('sheet-toggle').setAttribute('aria-label', on ? 'Show less' : 'Show more');
}
$('sheet-toggle').addEventListener('click', () => {
  setSheetExpanded(!$('sheet').classList.contains('expanded'));
  refit(); // keep the selected route in the part of the map that is still visible
});

async function initMap() {
  const map = await ensureMap($('map-box').querySelector('.map'), { interactive: true, center: [HOIV.lat, HOIV.lon], zoom: 16 });
  if (!map) { $('map-box').hidden = true; return; }
  map.invalidateSize();
  if (state.demo) showHere([HOIV.lon, HOIV.lat]);
}

// --- start ---
function start() {
  unlockSpeech();
  unlockSound();
  state.started = true;
  $('gate').hidden = true;
  $('app').hidden = false;
  renderModes();
  initMap();
  speak(`Crosswise ready. ${modeLabel(state.mode)} mode.${state.demo ? ' Demo mode: walking is simulated.' : ''} Where do you want to go?`);
  $('status').focus();
  // Ask for the position now (silently): "Current location" is ready, suggestions and the map use it.
  if (!state.demo) getPosition().then((p) => showHere([p.lon, p.lat])).catch(() => {});
}
$('start').addEventListener('click', start);
$('repeat').addEventListener('click', repeatLast);

// --- App voice on/off (for screen reader users): on the start screen and in Settings ---
function renderVoiceToggle() {
  for (const b of document.querySelectorAll('.app-voice-toggle')) {
    b.setAttribute('aria-pressed', String(appVoiceOn()));
    b.textContent = appVoiceOn() ? 'App voice: on' : 'App voice: off';
  }
}
for (const b of document.querySelectorAll('.app-voice-toggle')) {
  b.addEventListener('click', () => {
    setAppVoice(!appVoiceOn());
    renderVoiceToggle();
    speak(appVoiceOn() ? 'App voice on.' : 'App voice off. Your screen reader will read the messages.');
  });
}
renderVoiceToggle();

// --- settings dialog (native <dialog>: focus stays inside, Escape closes, focus returns) ---
$('settings-open').addEventListener('click', () => $('settings').showModal());
$('settings-close').addEventListener('click', () => $('settings').close());
$('settings').addEventListener('click', (e) => { if (e.target === $('settings')) $('settings').close(); }); // backdrop

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
    // 'I want to go to X' → did you mean …? → yes → plan from here; no place → 'Where do you want to go?'
    navigate: (place, by) => routes.confirmPlace(place, { by }),
    set_mode: (mode) => setMode(mode),
    stop: () => { ask.cancel(); if (nav) stopRoute(); else look.stop(); },
    repeat: () => repeatLast(),
  },
});

// Yes / no questions (voice or big buttons); created after voice so it can reopen the mic
const ask = initAsk({ speak, getVoice: () => voice });

// Expose for tests and the browser console.
window.crosswise = { state, speak, setMode, routes, look, voice, ask };
