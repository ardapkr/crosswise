// Main UI wiring. Logic lives in /lib; this file only connects buttons, speech and storage.

import { MODES, normalizeMode } from '../lib/modes.js';
import { speak, repeatLast, unlockSpeech } from './speech.js';

const MODE_KEY = 'crosswise.mode';
const $ = (id) => document.getElementById(id);

// localStorage can throw (private mode): never let that break the app.
function loadMode() {
  try { return normalizeMode(localStorage.getItem(MODE_KEY)); } catch { return normalizeMode(null); }
}
function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
}

export const state = { mode: loadMode(), started: false };

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
  state.mode = normalizeMode(mode);
  saveMode(state.mode);
  renderModes();
  const label = MODES.find((m) => m.id === state.mode).label;
  speak(`${label} mode.`);
  document.querySelector(`[data-mode="${state.mode}"]`)?.focus();
}

function start() {
  unlockSpeech();
  state.started = true;
  $('start').hidden = true;
  $('app').hidden = false;
  renderModes();
  const label = MODES.find((m) => m.id === state.mode).label;
  speak(`Crosswise ready. ${label} mode.`);
}

$('start').addEventListener('click', start);
$('repeat').addEventListener('click', repeatLast);

// Expose for tests and the browser console.
window.crosswise = { state, speak, setMode };
