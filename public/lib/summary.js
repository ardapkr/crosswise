// Turns scored routes and crossings into short sentences to speak. Pure module.

import { normalizeMode } from './modes.js';

const KIND_TEXT = {
  signals: 'Traffic light',
  zebra: 'Zebra crossing without lights',
  unmarked: 'Unmarked crossing',
  unknown: 'Crossing of unknown type',
};

/** "Traffic light with acoustic signal, lowered kerb" */
export function describeCrossing(c, mode) {
  mode = normalizeMode(mode);
  let text = KIND_TEXT[c.kind] || KIND_TEXT.unknown;
  if (c.kind === 'signals') {
    if (c.sound === 'yes') text += ' with acoustic signal';
    else if (c.sound === 'no') text += ' without acoustic signal';
    else text += ', acoustic signal unknown';
  }
  if (mode !== 'blind') {
    if (c.kerb === 'lowered') text += ', lowered kerb';
    else if (c.kerb === 'raised') text += ', raised kerb';
    else text += ', kerb height unknown';
  }
  return text;
}

const minutes = (sec) => Math.round(sec / 60);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Its 5 crossings: 2 with lights and an acoustic signal, 1 with lights only, 2 zebra crossings." */
export function crossingList(score, mode) {
  if (score.count === 0) return 'It has no road crossings.';
  if (score.count === 1) return `Its only crossing: ${describeCrossing(score.worstCrossing, mode)}.`;
  if (score.withSound === score.count) return 'Every crossing has lights and an acoustic signal.';
  const { kinds, withSound } = score;
  const parts = [];
  if (withSound) parts.push(`${withSound} with lights and an acoustic signal`);
  if (kinds.signals - withSound) parts.push(`${kinds.signals - withSound} with lights only`);
  if (kinds.zebra) parts.push(plural(kinds.zebra, 'zebra crossing'));
  if (kinds.unmarked) parts.push(`${kinds.unmarked} unmarked`);
  if (kinds.unknown) parts.push(`${kinds.unknown} of unknown type`);
  return `Its ${score.count} crossings: ${parts.join(', ')}.`;
}

/** What the shortest route has that the recommended one avoids, e.g. "the 2 unmarked crossings". */
function avoided(best, shortest, mode) {
  const b = best.score;
  const s = shortest.score;
  if (mode === 'wheelchair' && s.kerbRaised > b.kerbRaised) {
    return s.kerbRaised === 1 ? 'the raised kerb' : `the ${s.kerbRaised} raised kerbs`;
  }
  const worst = s.worstCrossing?.kind;
  const n = (k) => s.kinds[k] - (b.kinds[k] || 0);
  if (worst === 'unmarked' && n('unmarked') > 0) {
    return s.kinds.unmarked === 1 ? 'the unmarked crossing' : `the ${s.kinds.unmarked} unmarked crossings`;
  }
  if (worst === 'zebra' && n('zebra') > 0) {
    return s.kinds.zebra === 1 ? 'the zebra crossing without lights' : `the ${s.kinds.zebra} zebra crossings without lights`;
  }
  const silent = s.kinds.signals - s.withSound;
  if (worst === 'signals' && silent > 0) {
    return silent === 1 ? 'the traffic light without an acoustic signal' : `the ${silent} traffic lights without an acoustic signal`;
  }
  return null;
}

function kerbPhrase(score, mode) {
  if (mode === 'blind' || score.count === 0) return '';
  const parts = [];
  if (score.kerbRaised > 0) parts.push(`${plural(score.kerbRaised, 'crossing')} with a raised kerb`);
  if (score.kerbUnknown > 0) parts.push(`kerb height unknown at ${plural(score.kerbUnknown, 'crossing')}`);
  return parts.length ? ' ' + capital(parts.join('; ')) + '.' : '';
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Spoken summary comparing our best route with the shortest (baseline) route.
 * e.g. "Route 2 is 3 minutes longer, but every crossing has lights and an acoustic signal.
 *       The shortest route has an unmarked crossing without lights."
 */
export function routeSummary(ranked, mode) {
  mode = normalizeMode(mode);
  const text = summaryText(ranked, mode);
  // limited mobility: ORS is asked to avoid steps (lib/modes.js), so say it
  return mode === 'limited' && ranked.length ? `${text} Routes avoid steps.` : text;
}

function summaryText(ranked, mode) {
  if (!ranked.length) return 'No route found.';
  const best = ranked[0];
  const shortest = ranked.find((r) => r.isShortest) || best;
  const bestMin = Math.max(1, minutes(best.duration));
  const count = best.score.count;
  const crossings = count === 0 ? '' : ` and ${plural(count, 'crossing')}`;

  if (ranked.length === 1) {
    return `One route found: ${bestMin} minutes${crossings}. ${crossingList(best.score, mode)}${kerbPhrase(best.score, mode)}`;
  }
  if (best === shortest) {
    return `The shortest route is also the safest: ${bestMin} minutes${crossings}. ${crossingList(best.score, mode)}${kerbPhrase(best.score, mode)}`;
  }
  const extra = minutes(best.duration - shortest.duration);
  const longer = extra < 1 ? 'less than a minute longer' : `${plural(extra, 'minute')} longer`;
  const avoid = avoided(best, shortest, mode);
  const allGood = best.score.count > 0 && best.score.withSound === best.score.count;

  if (allGood) {
    return `The recommended route is ${longer}, but every crossing has lights and an acoustic signal.` +
      (avoid ? ` It avoids ${avoid} on the shortest route.` : '') + kerbPhrase(best.score, mode);
  }
  if (avoid) {
    return `The recommended route is ${longer} and avoids ${avoid} on the shortest route. ` +
      crossingList(best.score, mode) + kerbPhrase(best.score, mode);
  }
  return `The recommended route is ${longer} but has fewer crossings: ${best.score.count} instead of ${shortest.score.count}. ` +
    crossingList(best.score, mode) + kerbPhrase(best.score, mode);
}
