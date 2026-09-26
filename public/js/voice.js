// Push-to-talk voice commands: tap the button, say a command, the app does it.
// Parsing lives in lib/commands.js (pure, tested). Recognition = the browser's SpeechRecognition.

import { parseAlternatives, HELP_TEXT } from '../lib/commands.js';
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
 *   handlers: find_bus(line), check_light(), read(), describe(), where_am_i(), navigate(place),
 *             set_mode(mode), stop(), repeat()
 */
export function initVoice({ speak, handlers }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('voice');
  let rec = null;
  let listening = false;

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
      case 'navigate': return handlers.navigate(cmd.place);
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

  function toggle() {
    if (!SR) { speak(NOT_SUPPORTED); return; }
    if (listening) { rec?.abort(); setListening(false); return; }

    stopSpeaking(); // the microphone must not hear our own voice
    rec = new SR();
    rec.lang = SPEECH_LANG; // English commands, whatever the phone's language
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    rec.onresult = (ev) => {
      const alternatives = Array.from(ev.results[0] || []).map((a) => a.transcript);
      const cmd = parseAlternatives(alternatives);
      run({ ...cmd, heard: (alternatives[0] || '').trim() });
    };
    rec.onerror = (ev) => {
      setListening(false);
      if (ev.error !== 'aborted') speak(ERRORS[ev.error] || 'Voice input did not work. Try again or use the buttons.');
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      listenCue();
    } catch {
      setListening(false);
      speak('Voice input could not start. Try again.');
    }
  }

  btn.addEventListener('click', toggle);
  if (!SR) btn.setAttribute('aria-describedby', 'voice-heard');

  return { run, supported: Boolean(SR) };
}
