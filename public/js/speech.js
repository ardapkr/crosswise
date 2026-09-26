// Browser wrapper around speechSynthesis. Priority rules live in lib/speech-queue.js.
// Every message is also written into the big status text.
//
// Screen readers: the visible status is NOT a live region, so with the app voice on nothing is said twice.
// VoiceOver/TalkBack users can turn the app voice off; then messages go to hidden live regions and the
// screen reader reads them (crossing/danger alerts assertively, so they interrupt).

import { PRIORITY, decide, enqueue, nextMessage } from '../lib/speech-queue.js';

const statusEl = () => document.getElementById('status');

let current = null;   // message being spoken right now
let queue = [];
let last = null;      // for the Repeat button
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
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
  const u = new SpeechSynthesisUtterance(message.text);
  u.lang = 'en-GB';
  u.rate = 1.0;
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
  // Some browsers never fire onend (known Chrome/Safari bugs): don't let the queue get stuck.
  setTimeout(finish, 2000 + message.text.length * 90);
}

function done() {
  current = null;
  const [head, rest] = nextMessage(queue);
  queue = rest;
  if (head) play(head);
}

/**
 * Say something. priority: 'danger' | 'crossing' | 'navigation' | 'info'
 */
export function speak(text, priority = 'info') {
  const message = { text, priority: PRIORITY[priority] ?? PRIORITY.info };
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
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}

export function stopSpeaking() {
  queue = [];
  current = null;
  if (synth) synth.cancel();
}
