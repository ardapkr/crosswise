// Voice commands: tap the button (or let the app reopen the mic after a question), say a command, the app does it.
// Parsing lives in lib/commands.js and lib/dialog.js (pure, tested). Recognition = the browser's SpeechRecognition.
//
// Questions: js/ask.js sets a pending question ("Did you mean Stephansplatz?"). The next thing the user says
// goes to the question first; if it is not an answer (e.g. "where am I"), it runs as a normal command and the
// question is dropped.

import { parseAlternatives, HELP_TEXT } from '../lib/commands.js';
import { destinationFrom } from '../lib/dialog.js';
import { SPEECH_LANG } from '../lib/voices.js';
import { stopSpeaking } from './speech.js';
import { listenCue } from './sound.js';

const $ = (id) => document.getElementById(id);

const NOT_SUPPORTED =
  'Voice commands are not supported in this browser. Use the buttons, or try Chrome on Android or Safari on iPhone.';

const ERRORS = {
  'no-speech': 'I did not hear anything. Tap the button and speak after the beep.',
  'audio-capture': 'No microphone found.',
  'not-allowed': 'Microphone permission is off. Allow the microphone for this site in your browser settings.',
  'service-not-allowed': 'Microphone permission is off. Allow the microphone for this site in your browser settings.',
  network: 'Voice commands need an internet connection.',
};

/**
 * @param {{ speak: Function, handlers: Record<string, Function> }} opts
 *   handlers: find_bus(line), check_light(), read(), describe(), where_am_i(), navigate(place, by),
 *             set_mode(mode), stop(), repeat()
 */
export function initVoice({ speak, handlers }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('voice');
  let rec = null;
  let listening = false;
  let question = null; // { answer(alternatives) → true if handled, onSilence?() }

  function setListening(on) {
    listening = on;
    btn.querySelector('.label').textContent = on ? 'Listening…' : 'Speak';
    btn.setAttribute('aria-label', on ? 'Listening… tap to cancel' : 'Speak a command');
    btn.classList.toggle('listening', on);
  }

  /** Runs a parsed command. Also used by tests and the console. */
  function run(cmd) {
    $('voice-heard').textContent = cmd.heard ? `Heard: “${cmd.heard}”` : '';
    switch (cmd.action) {
      case 'find_bus': return handlers.find_bus(cmd.line);
      case 'check_light': return handlers.check_light();
      case 'read': return handlers.read();
      case 'describe': return handlers.describe();
      case 'where_am_i': return handlers.where_am_i();
      case 'navigate': return handlers.navigate(cmd.place, cmd.by || null);
      case 'set_mode': return handlers.set_mode(cmd.mode);
      case 'stop': return handlers.stop();
      case 'repeat': return handlers.repeat();
      case 'help': return speak(HELP_TEXT);
      default:
        return speak(cmd.text
          ? `Sorry, I did not understand: ${cmd.text}. Say help to hear what you can say.`
          : 'Sorry, I did not understand. Say help to hear what you can say.');
    }
  }

  /** Recogniser guesses → a command. "Go somewhere" sentences first (they have the most ways to be said). */
  function understand(alternatives) {
    for (const text of alternatives) {
      const dest = destinationFrom(text);
      if (dest) return { action: 'navigate', place: dest.place, by: dest.by };
    }
    return parseAlternatives(alternatives);
  }

  function handleResult(alternatives) {
    const heard = (alternatives[0] || '').trim();
    if (question) {
      const q = question;
      $('voice-heard').textContent = heard ? `Heard: “${heard}”` : '';
      if (q.answer(alternatives)) return;
      question = null; // not an answer: a new command replaces the question
      q.onDropped?.();
    }
    run({ ...understand(alternatives), heard });
  }

  /** Opens the microphone (the button, or the app after asking a question). */
  function listen() {
    if (!SR) { speak(NOT_SUPPORTED); return false; }
    if (listening) return true;
    stopSpeaking(); // the microphone must not hear our own voice
    rec = new SR();
    rec.lang = SPEECH_LANG; // English commands, whatever the phone's language
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    rec.onresult = (ev) => handleResult(Array.from(ev.results[0] || []).map((a) => a.transcript));
    rec.onerror = (ev) => {
      setListening(false);
      if (ev.error === 'aborted') return;
      if (ev.error === 'no-speech' && question) {
        speak(question.silenceText || 'I did not hear an answer. Tap Speak to answer.');
        return;
      }
      speak(ERRORS[ev.error] || 'Voice input did not work. Try again or use the buttons.');
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      listenCue();
      return true;
    } catch {
      setListening(false);
      if (!question) speak('Voice input could not start. Try again.');
      return false;
    }
  }

  function toggle() {
    if (!SR) { speak(NOT_SUPPORTED); return; }
    if (listening) { rec?.abort(); setListening(false); return; }
    listen();
  }

  btn.addEventListener('click', toggle);
  if (!SR) btn.setAttribute('aria-describedby', 'voice-heard');

  return {
    run,
    understand,
    listen,
    supported: Boolean(SR),
    /** A question waits for an answer: { answer(alternatives) → handled?, silenceText?, onDropped?() } (null = none). */
    setQuestion(q) { question = q; },
    get question() { return question; },
    stopListening() { if (listening) { rec?.abort(); setListening(false); } },
  };
}
