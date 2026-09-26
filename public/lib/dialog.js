// Small conversations: "Where do you want to go?" → "Did you mean Stephansplatz, Innere Stadt? Say yes or no."
// Pure module (no DOM, no fetch): turns what the user said into a destination or a yes/no answer, and builds
// the sentences the app asks. Used by js/ask.js, js/routes-ui.js and js/voice.js.

import { distance } from './geo.js';

const fold = (s) => String(s ?? '').toLowerCase()
  .replace(/[’`´]/g, "'")
  .replace(/[.,!?;:"]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ---------- destination ----------

// "I want to go to X", "take me to X", "how do I get to X", "bring mich zum X" … (spoken or dictated into the search box)
// Longest phrases first. The group after it is the place.
const LEADS = [
  'i would like to go to', "i'd like to go to", 'i would like to get to', "i'd like to get to", 'i want to go to',
  'i wanna go to', 'i want go to', 'i want to get to', 'i need to go to', 'i need to get to', 'i have to go to',
  'i must go to', 'i am going to', "i'm going to", 'i go to', 'i want go', 'i want to go', 'i need go to',
  'how do i get to', 'how can i get to', 'how to get to', 'how i get to', 'how do i go to', 'way to', 'the way to',
  'take me to', 'take me', 'bring me to', 'bring me', 'guide me to', 'lead me to', 'get me to', 'walk me to',
  'navigate me to', 'navigate to', 'navigation to', 'directions to', 'direction to', 'route to', 'a route to',
  'show me the way to', 'show me how to get to', 'show me', 'find a route to', 'plan a route to', 'plan a trip to',
  'go to', 'going to', 'walk to', 'drive me to', 'ride to', 'travel to', 'get to', 'head to',
  'destination', 'my destination is', 'i want to visit', 'i would like to visit',
  // German (Viennese users)
  'ich möchte zum', 'ich möchte zur', 'ich möchte nach', 'ich will zum', 'ich will zur', 'ich will nach',
  'bring mich zum', 'bring mich zur', 'bring mich nach', 'bringe mich zum', 'bringe mich zur', 'führe mich zum',
  'führe mich zur', 'wie komme ich zum', 'wie komme ich zur', 'wie komme ich nach', 'navigiere zum', 'navigiere zur',
  'navigiere nach', 'ich muss zum', 'ich muss zur', 'ich muss nach', 'zum', 'zur', 'nach',
].sort((a, b) => b.length - a.length);

const POLITE_START = /^(?:(?:hey|hi|hello|ok|okay|um+|uh+|er+|so|well|and|now|crosswise|please|could you|can you|would you|will you|could you please|can you please|i think|yes|yeah)\s+)+/;
const POLITE_END = /\s+(?:please|thanks|thank you|now|for me|right now|today|bitte|danke)$/;
const BY_TRANSIT = /\s+(?:by|with|using|on|via|taking)\s+(?:the\s+)?(?:bus|buses|tram|trams|u-?bahn|subway|metro|underground|train|s-?bahn|public transport|public transportation|transit|öffis|öffentlich)$|\s+mit\s+(?:dem|der)\s+(?:bus|straßenbahn|strassenbahn|u-?bahn|öffis)$/;
const BY_WALK = /\s+(?:on foot|by foot|walking|by walking|zu fuß|zu fuss)$/;

/** Cleans a spoken place: no "the", no "please", no "by bus" (that goes into `by`). */
export function cleanPlace(raw) {
  let place = fold(raw);
  let by = null;
  for (let i = 0; i < 3; i++) {
    const before = place;
    place = place.replace(POLITE_END, '');
    if (BY_TRANSIT.test(place)) { by = 'transit'; place = place.replace(BY_TRANSIT, ''); }
    if (BY_WALK.test(place)) { by = 'walk'; place = place.replace(BY_WALK, ''); }
    if (place === before) break;
  }
  place = place.replace(/^(?:the|a|an|to|zum|zur|dem|der|die|das)\s+/, '').trim();
  return { place, by };
}

/** Nothing concrete: "somewhere", "a place", "there". */
const VAGUE = /^(?:somewhere|some place|someplace|a place|there|here|it|home|a destination|anywhere|irgendwo)$/;

/**
 * A sentence that asks to go somewhere → { place, by } (place '' = the user did not say where, e.g.
 * "I want to go somewhere"). null = the text is not a "go somewhere" sentence (e.g. just "Stephansplatz").
 * Keeps the place's own spelling from the original text where possible.
 */
// "take me by bus to X", "bring mich mit der U-Bahn zum X": the travel mode in the middle of the sentence
const MID_TRANSIT = /\s(?:by|with|using|on|via|taking)\s(?:the\s)?(?:bus|tram|u-?bahn|subway|metro|underground|train|public transport|transit)\s|\smit\s(?:dem|der)\s(?:bus|straßenbahn|strassenbahn|u-?bahn|bim|öffis)\s/;
const MID_WALK = /\s(?:on foot|by foot|walking|zu fuß|zu fuss)\s/;

export function destinationFrom(text) {
  let t = fold(text).replace(POLITE_START, '');
  const walkLead = /^(?:walk|walking)\b/.test(t);
  let midBy = null;
  if (MID_TRANSIT.test(t)) { midBy = 'transit'; t = t.replace(MID_TRANSIT, ' '); }
  else if (MID_WALK.test(t)) { midBy = 'walk'; t = t.replace(MID_WALK, ' '); }
  for (const lead of LEADS) {
    if (t === lead || t.startsWith(lead + ' ')) {
      const rest = t.slice(lead.length).trim();
      const { place, by } = cleanPlace(rest);
      const vague = !place || VAGUE.test(place);
      return { place: vague ? '' : restoreCase(text, place), by: by || midBy || (walkLead ? 'walk' : null) };
    }
  }
  return null;
}

/** "stephansplatz" found in "Take me to Stephansplatz" → "Stephansplatz" (the recogniser's capitals). */
function restoreCase(original, lower) {
  const i = String(original).toLowerCase().indexOf(lower);
  return i >= 0 ? String(original).slice(i, i + lower.length) : lower;
}

// ---------- yes / no ----------

const YES = /^(?:yes|yeah|yea|yep|yup|ya|yah|ja|jawohl|genau|richtig|stimmt|passt|sure|of course|correct|right|that's right|that is right|that's it|that is it|exactly|ok|okay|o k|alright|all right|fine|good|great|perfect|please do|do it|go|go ahead|let's go|lets go|start|yes please|affirmative|absolutely|definitely|indeed|confirm|confirmed|true|that one|this one|si|oui)\b/;
const NO = /^(?:no|nope|nah|nein|not|wrong|incorrect|that's wrong|that is wrong|false|cancel|stop|never mind|nevermind|negative|another|another one|other|the other|next|next one|different|something else|not that|not this|falsch|anders)\b/;

/** What the user said to a yes/no question → 'yes' | 'no' | null (not an answer). Tries every recogniser guess. */
export function parseYesNo(alternatives) {
  for (const text of [].concat(alternatives)) {
    let t = fold(text).replace(/^(?:um+|uh+|er+|oh|well|hmm+)\s+/, '');
    if (/^(?:yes|yeah|yep|ja)\b.*\b(?:no|not)\b/.test(t) && !/\bno problem\b/.test(t)) continue; // "yes, no, wait" → unclear
    if (NO.test(t)) return 'no';
    if (YES.test(t)) return 'yes';
  }
  return null;
}

// ---------- sentences ----------

/** "3.2 kilometres" / "400 metres" */
export function spokenDistance(m) {
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} metres`;
  return `${(m / 1000).toFixed(1)} kilometres`;
}

/** Second line of the question: "Innere Stadt, Vienna · 3.2 km away" */
export function placeDetail(place, from) {
  const parts = [];
  if (place.detail) parts.push(place.detail);
  if (from) {
    const m = distance(from, [place.lon, place.lat]);
    parts.push(m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`);
  }
  return parts.join(' · ');
}

/**
 * "Did you mean Stephansplatz, Innere Stadt, Vienna? It is about 3.2 kilometres from here. Say yes or no."
 * n/total: "Second match:" when offering the next one after a "no".
 */
export function didYouMean(place, from, { n = 1 } = {}) {
  const where = place.detail ? `${place.name}, ${place.detail}` : place.name;
  const far = from ? ` It is about ${spokenDistance(distance(from, [place.lon, place.lat]))} from here.` : '';
  const lead = n === 1 ? 'Did you mean' : n === 2 ? 'Then did you mean' : 'Or did you mean';
  return `${lead} ${where}?${far} Say yes or no.`;
}
