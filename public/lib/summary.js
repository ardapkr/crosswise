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

/** One phrase about how safe a route's crossings are. */
export function crossingPhrase(score) {
  if (score.count === 0) return 'it has no road crossings';
  const { kinds, withSound, count } = score;
  if (withSound === count) return 'every crossing has lights and an acoustic signal';
  if (kinds.signals === count) return 'every crossing has traffic lights, but not all have an acoustic signal';
  if (kinds.unmarked > 0) return `it has ${kinds.unmarked === 1 ? 'an unmarked crossing' : plural(kinds.unmarked, 'unmarked crossing')} without lights`;
  if (kinds.zebra > 0) return `it has ${kinds.zebra === 1 ? 'a zebra crossing' : plural(kinds.zebra, 'zebra crossing')} without lights`;
  return 'some crossings have unknown details';
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
  if (!ranked.length) return 'No route found.';
  const best = ranked[0];
  const shortest = ranked.find((r) => r.isShortest) || best;
  const bestMin = Math.max(1, minutes(best.duration));
  const count = best.score.count;
  const crossings = count === 0 ? '' : ` and ${plural(count, 'crossing')}`;

  if (ranked.length === 1) {
    return `One route found: ${bestMin} minutes${crossings}. ${capital(crossingPhrase(best.score))}.${kerbPhrase(best.score, mode)}`;
  }
  if (best === shortest) {
    return `The shortest route is also the safest: ${bestMin} minutes${crossings}. ${capital(crossingPhrase(best.score))}.${kerbPhrase(best.score, mode)}`;
  }
  const extra = minutes(best.duration - shortest.duration);
  const longer = extra < 1 ? 'less than a minute longer' : `${plural(extra, 'minute')} longer`;
  return `The recommended route is ${longer}, but ${crossingPhrase(best.score)}.${kerbPhrase(best.score, mode)} ` +
    `The shortest route: ${crossingPhrase(shortest.score)}.`;
}
