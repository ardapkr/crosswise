// Browser wrapper around speechSynthesis. Priority rules live in lib/speech-queue.js.
// Every message is also written into the big status text.
//
// Screen readers: the visible status is NOT a live region, so with the app voice on nothing is said twice.
// VoiceOver/TalkBack users can turn the app voice off; then messages go to hidden live regions and the
// screen reader reads them (crossing/danger alerts assertively, so they interrupt).

import { PRIORITY, decide, enqueue, nextMessage } from '../lib/speech-queue.js';
import { pickEnglishVoice, SPEECH_LANG } from '../lib/voices.js';

const statusEl = () => document.getElementById('status');

let current = null;   // message being spoken right now
let queue = [];
let last = null;      // for the Repeat button
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

// Always English, whatever the phone's language: pick an English voice explicitly (lang alone is not
// enough on iOS). Chrome loads its voices late, so pick again when they arrive and before each message.
let voice = null;
function loadVoice() {
  try { voice = pickEnglishVoice(synth.getVoices()); } catch { voice = null; }
  window.__voice = voice?.name || null; // for tests and the console
}
if (synth) {
  loadVoice();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoice);
  else synth.onvoiceschanged = loadVoice;
}

function utterance(text) {
  const u = new SpeechSynthesisUtterance(text);
  if (!voice) loadVoice();
  u.lang = SPEECH_LANG;
  try { if (voice) u.voice = voice; } catch { /* odd voice object: lang alone still asks for English */ }
  return u;
}
const VOICE_KEY = 'crosswise.appVoice';
let voiceOn = (() => { try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; } })();

export function appVoiceOn() { return voiceOn; }

export function setAppVoice(on) {
  voiceOn = Boolean(on);
  try { localStorage.setItem(VOICE_KEY, voiceOn ? 'on' : 'off'); } catch { /* ignore */ }
  if (!voiceOn && synth) synth.cancel();
}

/** Hands a message to the screen reader via a hidden live region. */
function announce(message) {
  const el = document.getElementById(message.priority >= PRIORITY.crossing ? 'live-assertive' : 'live-polite');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = message.text; }, 30); // a change is needed for it to be read again
}

// Tests (Playwright) read this to check what was said.
window.__spoken = window.__spoken || [];

function show(text) {
  const el = statusEl();
  if (el) el.textContent = text;
  // a copy where the status is covered (the full-screen search panel); screen readers skip it
  for (const m of document.querySelectorAll('[data-status-mirror]')) m.textContent = text;
}

function play(message) {
  current = message;
  last = message;
  show(message.text);
  window.__spoken.push(message.text);

  // A cancelled utterance fires onend/onerror later: only react if it is still the current one.
  const finish = () => { if (current === message) done(); };
  if (!voiceOn) {
    announce(message);
    // give the screen reader time to read it before the next queued message replaces it
    setTimeout(finish, Math.min(8000, 1200 + message.text.length * 55));
    return;
  }
  if (!synth) { setTimeout(finish, 0); return; }
  const u = utterance(message.text);
  u.rate = 1.0;
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
  // Some browsers never fire onend (known Chrome/Safari bugs): don't let the queue get stuck.
  setTimeout(finish, 2000 + message.text.length * 90);
}

let quietWaiters = [];

function done() {
  current = null;
  const [head, rest] = nextMessage(queue, Date.now());
  queue = rest;
  if (head) play(head);
  else { const w = quietWaiters; quietWaiters = []; w.forEach((resolve) => resolve()); }
}

/** Resolves when the app has finished talking (nothing playing, nothing queued) — e.g. before opening the mic. */
export function whenQuiet() {
  if (!current && queue.length === 0) return Promise.resolve();
  return new Promise((resolve) => quietWaiters.push(resolve));
}

/**
 * Say something. priority: 'danger' | 'crossing' | 'navigation' | 'info'
 * opts.keep = never drop it from a busy queue (trip steps); opts.ttlMs = skip it if it waited longer
 * (distance warnings are useless once passed).
 */
export function speak(text, priority = 'info', { keep = false, ttlMs = 0 } = {}) {
  const message = { text, priority: PRIORITY[priority] ?? PRIORITY.info, keep, expiresAt: ttlMs ? Date.now() + ttlMs : 0 };
  const action = decide(current, message);
  if (action === 'speak') play(message);
  else if (action === 'interrupt') {
    const cancelled = current;
    current = null; // so the cancelled utterance's late onend is ignored
    if (synth) synth.cancel();
    if (cancelled && cancelled.priority >= PRIORITY.navigation) queue = enqueue(queue, cancelled);
    play(message);
  } else if (action === 'queue') queue = enqueue(queue, message);
}

export function repeatLast() {
  if (last) speak(last.text, 'info');
}

/** iOS only allows speech after a user tap: call this inside the Start button handler. */
export function unlockSpeech() {
  if (!synth) return;
  const u = utterance(' ');
  u.volume = 0;
  synth.speak(u);
}

export function stopSpeaking() {
  queue = [];
  current = null;
  if (synth) synth.cancel();
  const w = quietWaiters; quietWaiters = []; w.forEach((resolve) => resolve());
}
