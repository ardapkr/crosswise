// Camera assistant results: parse the model's JSON, make it safe, and turn it into a sentence.
// Pure module (used by /api/look, the browser and the tests).
// Safety rule: the light check NEVER says "safe to cross" — spoken text is built only from fixed phrases.

export const LOOK_MODES = ['bus', 'light', 'read', 'describe'];

// A "found" bus line below this confidence is treated as unreadable: never guess a line number.
export const MIN_LINE_CONFIDENCE = 0.6;

/** Model text → object, or null. Strips ```json fences and any text around the JSON object. */
export function parseModelJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(t);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** " 13 a " → "13A" */
export function normalizeLine(s) {
  return typeof s === 'string' ? s.replace(/\s+/g, '').toUpperCase() : '';
}

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const conf = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** Validates a model answer for a mode; anything unexpected becomes the "don't know" answer. */
export function normalizeResult(mode, obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  switch (mode) {
    case 'bus': {
      let status = oneOf(o.status, ['found', 'not_visible', 'unreadable'], 'unreadable');
      const line = normalizeLine(o.line);
      const confidence = conf(o.confidence);
      if (status === 'found' && (!line || confidence < MIN_LINE_CONFIDENCE)) status = 'unreadable';
      return {
        status,
        line: status === 'found' ? line : '',
        destination: status === 'found' ? str(o.destination, 80) : '',
        vehicle: oneOf(o.vehicle, ['bus', 'tram'], 'unknown'),
        confidence,
      };
    }
    case 'light':
      return {
        status: oneOf(o.status, ['green', 'red', 'flashing_green', 'dark', 'not_visible', 'unclear'], 'unclear'),
        confidence: conf(o.confidence),
        note: str(o.note, 200),
      };
    case 'read':
      return {
        status: oneOf(o.status, ['found', 'no_text', 'unreadable'], 'unreadable'),
        text: str(o.text, 600),
        summary: str(o.summary, 300),
      };
    case 'describe':
      return {
        description: str(o.description, 600),
        hazards: Array.isArray(o.hazards) ? o.hazards.filter((h) => typeof h === 'string' && h.trim()).map((h) => h.trim().slice(0, 120)).slice(0, 3) : [],
      };
    default:
      return {};
  }
}

const sentences = (text) => (text.match(/[^.!?]+[.!?]+/g) || (text ? [text] : [])).map((s) => s.trim());

/** Sentence to speak for a normalized result. `targetLine` = the bus the user is waiting for. */
export function spokenResult(mode, r, { targetLine = '' } = {}) {
  switch (mode) {
    case 'bus': {
      if (r.status === 'not_visible') return 'No bus or tram in view.';
      if (r.status !== 'found') return 'I see a vehicle but cannot read the number.';
      const target = normalizeLine(targetLine);
      const to = r.destination ? ` to ${r.destination}` : '';
      if (target) {
        return r.line === target
          ? `This is your bus, ${r.line}${r.destination ? `, to ${r.destination}` : ''}.`
          : `This is ${r.line}, not your bus.`;
      }
      return `${r.vehicle === 'tram' ? 'Tram' : 'Bus'} ${r.line}${to}.`;
    }
    case 'light': {
      const listen = 'Listen for traffic before crossing.';
      switch (r.status) {
        case 'green': return `The pedestrian light looks green. ${listen}`;
        case 'flashing_green': return `The pedestrian light looks green but flashing: it will turn red soon. ${listen}`;
        case 'red': return 'The pedestrian light looks red. Wait.';
        case 'dark': return `The pedestrian light seems to be off. ${listen}`;
        case 'not_visible': return 'I cannot see a pedestrian light. Point the camera at the light across the road.';
        default: return `I cannot tell the light colour. ${listen}`;
      }
    }
    case 'read':
      if (r.status === 'no_text') return 'I cannot find any text.';
      if (r.status !== 'found' || !(r.summary || r.text)) return 'I see text but cannot read it. Hold the phone closer and steady.';
      return r.summary || r.text;
    case 'describe': {
      const parts = [];
      if (r.hazards.length) parts.push(`Careful: ${r.hazards.join('; ')}.`);
      parts.push(...sentences(r.description));
      return parts.slice(0, 3).join(' ') || 'I could not describe the scene. Try again.';
    }
    default:
      return '';
  }
}
