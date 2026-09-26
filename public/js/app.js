// Main UI wiring. Logic lives in /lib; this file only connects buttons, speech and storage.

import { MODES, normalizeMode } from '../lib/modes.js';
import { speak, repeatLast, unlockSpeech } from './speech.js';
import { initRoutes } from './routes-ui.js';

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

const routes = initRoutes({
  getMode: () => state.mode,
  speak,
  demo: state.demo,
  onChoose: (plan, route) => {
    // Phase 2 (guidance) hooks in here.
    speak(`Route chosen: ${Math.round(route.duration / 60)} minutes. Guidance is coming soon.`, 'navigation');
  },
});

function start() {
  unlockSpeech();
  state.started = true;
  $('start').hidden = true;
  $('app').hidden = false;
  renderModes();
  speak(`Crosswise ready. ${modeLabel(state.mode)} mode.${state.demo ? ' Demo mode: walking is simulated.' : ''} Where do you want to go?`);
  $('to').focus();
}

$('start').addEventListener('click', start);
$('repeat').addEventListener('click', repeatLast);

// Expose for tests and the browser console.
window.crosswise = { state, speak, setMode, routes };
