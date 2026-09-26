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

const KIND_NAMES = {
  unmarked: ['unmarked crossing', 'unmarked crossings'],
  unknown: ['crossing of unknown type', 'crossings of unknown type'],
  zebra: ['zebra crossing without lights', 'zebra crossings without lights'],
  silent: ['traffic light without an acoustic signal', 'traffic lights without an acoustic signal'],
};
const silentCount = (score) => score.kinds.signals - score.withSound;
const countOf = (score, kind) => (kind === 'silent' ? silentCount(score) : score.kinds[kind] || 0);

/** "avoids the 2 unmarked crossings" (none left) or "has fewer unmarked crossings: 1 instead of 2". */
function fewerOf(kind, best, shortest) {
  const b = countOf(best, kind);
  const s = countOf(shortest, kind);
  if (b >= s) return null;
  const [one, many] = KIND_NAMES[kind];
  if (b === 0) return `avoids ${s === 1 ? `the ${one}` : `the ${s} ${many}`} on the shortest route`;
  return `has fewer ${many}: ${b} instead of ${s}`;
}

/**
 * Why the recommended route beats the shortest one, in the order the ranking decides:
 * raised kerbs (wheelchair) / the worst crossing, then unmarked crossings, then acoustic signals, then count.
 */
function reason(bestRoute, shortestRoute, mode) {
  const b = bestRoute.score;
  const s = shortestRoute.score;
  if (mode === 'wheelchair' && s.kerbRaised > b.kerbRaised) {
    return b.kerbRaised === 0
      ? `avoids ${s.kerbRaised === 1 ? 'the raised kerb' : `the ${s.kerbRaised} raised kerbs`} on the shortest route`
      : `has fewer raised kerbs: ${b.kerbRaised} instead of ${s.kerbRaised}`;
  }
  const worstKind = s.worstCrossing?.kind === 'signals' ? 'silent' : s.worstCrossing?.kind;
  if (b.worst > s.worst && worstKind && KIND_NAMES[worstKind]) {
    const r = fewerOf(worstKind, b, s);
    if (r) return r;
  }
  for (const kind of ['unmarked', 'unknown']) {
    const r = fewerOf(kind, b, s);
    if (r) return r;
  }
  if (mode === 'blind' && b.withSound > s.withSound) {
    return `has more crossings with an acoustic signal: ${b.withSound} of ${b.count}, instead of ${s.withSound} of ${s.count}`;
  }
  if (b.count === 0 && s.count > 0) return `has no road crossings, the shortest route has ${s.count}`;
  if (b.count < s.count) return `has fewer crossings: ${b.count} instead of ${s.count}`;
  const r = fewerOf('zebra', b, s) || fewerOf('silent', b, s);
  return r || 'has safer crossings';
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
  const why = reason(best, shortest, mode);
  const allGood = best.score.count > 0 && best.score.withSound === best.score.count;

  if (allGood) {
    const also = why.startsWith('avoids') ? ` It ${why}.` : '';
    return `The recommended route is ${longer}, but every crossing has lights and an acoustic signal.${also}` + kerbPhrase(best.score, mode);
  }
  const joiner = why.startsWith('has fewer crossings') ? 'but' : 'and';
  return `The recommended route is ${longer} ${joiner} ${why}. ` + crossingList(best.score, mode) + kerbPhrase(best.score, mode);
}
