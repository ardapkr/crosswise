// Picks the English voice the app speaks with, whatever language the phone is set to.
// Without an explicit voice, a phone set to e.g. Turkish reads our English sentences with a Turkish voice.
// Pure module (no DOM): the browser passes in speechSynthesis.getVoices().

/** Language for spoken output and for speech recognition. */
export const SPEECH_LANG = 'en-US';

// Joke and effect voices that iOS/macOS list as English — never use them for guidance.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Princess)\b/i;
// Robotic "Eloquence" voices on newer iPhones: usable, but only if nothing better exists.
const ROBOTIC = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
// Well-known clear voices: Safari (Samantha, Daniel), Chrome (Google …), Edge (… Natural / Online).
const GOOD = /^(Samantha|Daniel|Karen|Moira|Google US English|Google UK English)|\b(Enhanced|Premium|Natural|Neural)\b/i;

/** "en_US" / "EN-us" → "en-us" (Android uses underscores). */
export function normalizeLang(lang) {
  return typeof lang === 'string' ? lang.replace(/_/g, '-').toLowerCase() : '';
}

/** Higher is better; -1 = never use this voice. en-US first, then en-GB, then any English. */
export function voiceScore(voice) {
  const lang = normalizeLang(voice?.lang);
  const name = String(voice?.name || '');
  if (!/^en(-|$)/.test(lang) || NOVELTY.test(name)) return -1;
  let score = lang === 'en-us' ? 300 : lang === 'en-gb' ? 200 : 100;
  if (GOOD.test(name)) score += 30;
  if (ROBOTIC.test(name)) score -= 30;
  if (voice.localService) score += 5; // works offline, starts faster
  return score;
}

/** Best English voice from the list, or null (then the browser picks one for SPEECH_LANG). */
export function pickEnglishVoice(voices) {
  let best = null;
  let bestScore = -1;
  for (const v of voices || []) {
    const s = voiceScore(v);
    if (s > bestScore) { best = v; bestScore = s; } // ties keep the first one listed
  }
  return best;
}
