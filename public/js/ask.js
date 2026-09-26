// Asking the user a yes/no question, e.g. "Did you mean Stephansplatz, Innere Stadt? Say yes or no."
// The question is spoken and shown with big Yes / No buttons (screen readers land on it). When the app has
// finished talking, the microphone opens by itself, so the user can simply say "yes" or "no".
// Also: open questions ("Where do you want to go?") whose answer is any text.

import { parseYesNo } from '../lib/dialog.js';
import { whenQuiet, appVoiceOn } from './speech.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{ speak: Function, voice: { listen, setQuestion, stopListening, supported } }} opts
 */
export function initAsk({ speak, getVoice }) {
  let pending = null; // { id, yes, no }
  let seq = 0;

  function hide() {
    $('confirm').hidden = true;
    pending = null;
  }

  function finish(answer) {
    const p = pending;
    if (!p) return;
    hide();
    getVoice()?.setQuestion(null);
    getVoice()?.stopListening();
    (answer === 'yes' ? p.yes : p.no)?.();
  }

  /** Speaks the question and, once the app is quiet, opens the mic (if the browser can listen). */
  async function speakThenListen(text, id, { afterQuiet = false } = {}) {
    if (afterQuiet) {
      await whenQuiet(); // e.g. the route summary finishes before we ask to start
      if (id !== seq) return;
    }
    speak(text, 'navigation', { keep: true });
    await whenQuiet();
    if (id !== seq) return; // answered by button (or replaced) meanwhile
    // With the app voice off a screen reader reads the question: an open mic would hear it. The user taps Speak.
    if (getVoice()?.supported && appVoiceOn()) getVoice().listen();
  }

  /**
   * Yes / no question.
   * @param {{ question: string, detail?: string, spoken?: string, yes: Function, no: Function, listen?: boolean }} q
   */
  function ask({ question, detail = '', spoken = question, yes, no, listen = true, afterQuiet = false }) {
    const id = ++seq;
    pending = { id, yes, no };
    $('confirm-question').textContent = question;
    $('confirm-detail').textContent = detail;
    $('confirm-detail').hidden = !detail;
    $('confirm').hidden = false;
    $('confirm-question').focus(); // VoiceOver / TalkBack: the question is where the user is now
    getVoice()?.setQuestion({
      answer: (alternatives) => {
        const a = parseYesNo(alternatives);
        if (!a) return false;
        finish(a);
        return true;
      },
      silenceText: 'I did not hear an answer. Tap Yes or No, or tap Speak and say yes or no.',
      onDropped: hide,
    });
    if (listen) speakThenListen(spoken, id, { afterQuiet });
    else speak(spoken, 'navigation', { keep: true });
  }

  /**
   * Open question: the next thing the user says goes to `onText(alternatives)` (return true if handled).
   */
  function askOpen({ spoken, onText }) {
    const id = ++seq;
    hide();
    getVoice()?.setQuestion({
      answer: (alternatives) => onText(alternatives),
      silenceText: 'I did not hear a place. Tap Speak and say where you want to go.',
    });
    speakThenListen(spoken, id);
  }

  $('confirm-yes').addEventListener('click', () => finish('yes'));
  $('confirm-no').addEventListener('click', () => finish('no'));

  return {
    ask,
    askOpen,
    cancel() { seq++; hide(); getVoice()?.setQuestion(null); },
    get pending() { return Boolean(pending); },
  };
}
