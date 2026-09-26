// Voice command parser: recognised speech text → one action. Pure module, keyword based (no AI),
// so it is instant, works offline and is fully tested.
//
// Actions: find_bus {line}, check_light, read, describe, where_am_i, navigate {place},
//          set_mode {mode}, stop, repeat, help, unknown {text}

export const HELP_TEXT =
  'You can say: find my bus, or find my bus 13A. Check the light. Read this. Describe. Where am I. ' +
  'Take me to, and a place. Wheelchair mode, blind mode, or limited mobility mode. Stop. Repeat.';

// ---------- helpers ----------

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEADING_FILLER = [
  /^(hey|hi|hello|ok|okay)\s+/, /^crosswise\s+/, /^(could|can|would|will) you\s+/, /^please\s+/,
  /^i'd like (you )?to\s+/, /^i want you to\s+/,
];
const TRAILING_FILLER = /\s+(please|thanks|thank you|for me|now)$/;

function stripFiller(t) {
  let prev;
  do {
    prev = t;
    for (const re of LEADING_FILLER) t = t.replace(re, '');
    t = t.replace(TRAILING_FILLER, '');
  } while (t !== prev);
  return t;
}

const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "sixty nine a" → "69 a" (speech recognisers sometimes spell numbers out). */
function wordsToDigits(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in TENS) {
      const next = tokens[i + 1];
      if (next in ONES && ONES[next] > 0 && ONES[next] < 10) { out.push(String(TENS[t] + ONES[next])); i++; } else out.push(String(TENS[t]));
    } else if (t in ONES) out.push(String(ONES[t]));
    else out.push(t);
  }
  return out;
}

const TRAM_LETTERS = new Set(['d', 'o']); // Vienna trams with letter names

/**
 * Finds a bus/tram line in (normalized) text: "13 a" → "13A", "n25" → "N25", "tram d" → "D". "" if none.
 * "a bus" is an article, not line A.
 */
export function extractLine(text) {
  const tokens = wordsToDigits(normalize(text).split(' ').filter(Boolean));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1] || '';
    const prev = tokens[i - 1] || '';
    if (/^[nu]?\d{1,3}[a-z]?$/.test(t)) {
      // "13 a" → 13A (a single letter right after the number belongs to it)
      if (/^[nu]?\d{1,3}$/.test(t) && /^[a-z]$/.test(next) && next !== 'i') return (t + next).toUpperCase();
      return t.toUpperCase();
    }
    if (t === 'n' && /^\d{1,3}$/.test(next)) return `N${next}`;
    if (TRAM_LETTERS.has(t) && (['tram', 'line'].includes(prev) || ['tram', 'line'].includes(next))) return t.toUpperCase();
  }
  return '';
}

// ---------- rules (checked in this order) ----------

const NAVIGATE = /\b(?:take me to|bring me to|guide me to|navigate to|directions to|route to|how do i get to|i want to go to|i need to go to|go to|walk to)\s+(.+)$/i;
const WHERE = /\b(where am i|where are we|where i am|my location|current location|what street|which street|nearest (bus )?stop|closest (bus )?stop|nearest station)\b/;
const MODE_WORDS = /\b(mode|switch|change|set|i use|i am|i'm)\b/;
const BUS = /\b(bus|buses|tram|trams)\b/;
const WAITING = /\b(i need|i'm waiting for|i am waiting for|waiting for|line)\b/;
const LIGHT = /\b(light|lights|traffic light|signal|is it (green|red)|green or red)\b/;
const READ = /\b(read|what does (it|this|that|the sign) say|what's written|what is written|text)\b/;
const DESCRIBE = /\b(describe|surroundings|around me|look around|in front of me|what do you see|what can you see|what's ahead|what is ahead)\b/;

function modeFrom(t) {
  if (/\bwheelchair\b/.test(t)) return 'wheelchair';
  if (/\b(limited mobility|limited|rollator|walker|mobility)\b/.test(t)) return 'limited';
  if (/\b(blind|low vision|visually impaired|vision)\b/.test(t)) return 'blind';
  return null;
}

/** One recognised text → { action, ... }. */
export function parseCommand(text) {
  const original = String(text ?? '').trim();
  const t = stripFiller(normalize(original));
  if (!t) return { action: 'unknown', text: '' };

  if (/^(stop|cancel|quit|stop it|stop scanning|end route|end the route|stop (the )?(scan|route|camera|navigation|guidance))$/.test(t)) {
    return { action: 'stop' };
  }
  if (/\b(help|what can (i|you) (say|do)|commands)\b/.test(t)) return { action: 'help' };
  if (/\b(repeat|say (that|it) again|what did you say|pardon)\b/.test(t)) return { action: 'repeat' };

  // Navigation first: "go to the wheelchair repair shop" is a place, not a mode switch.
  const nav = original.replace(/[.!?]+$/, '').match(NAVIGATE);
  if (nav) {
    const place = nav[1].replace(/[\s,]+(please|thanks|thank you)$/i, '').trim();
    if (place) return { action: 'navigate', place };
  }

  if (WHERE.test(t)) return { action: 'where_am_i' };

  const mode = modeFrom(t);
  if (mode && (MODE_WORDS.test(t) || t.split(' ').length <= 3)) return { action: 'set_mode', mode };

  const line = extractLine(t);
  if (BUS.test(t) || (line && WAITING.test(t))) return { action: 'find_bus', line };

  if (LIGHT.test(t)) return { action: 'check_light' };
  if (READ.test(t)) return { action: 'read' };
  if (DESCRIBE.test(t)) return { action: 'describe' };

  return { action: 'unknown', text: original };
}

/** Speech recognisers give several guesses: use the first one we understand. */
export function parseAlternatives(texts) {
  const list = (texts || []).filter((x) => typeof x === 'string');
  for (const text of list) {
    const c = parseCommand(text);
    if (c.action !== 'unknown') return c;
  }
  return { action: 'unknown', text: (list[0] || '').trim() };
}
