// How safe is a crossing, and which route is best, per mode.
// Pure module. Rules from CLAUDE.md:
//   blind: lights+sound 3, lights only/unknown sound 2, zebra 1, unmarked 0
//   wheelchair: + kerb adjustment (raised −2, unknown −0.5, lowered +0.5)
//   route: worst crossing first, then number of crossings, then duration
//   limited mobility: fewer crossings first (crossing is the tiring/risky part), then worst, then duration

import { normalizeMode } from './modes.js';

const BASE = { signals: 2, zebra: 1, unmarked: 0, unknown: 0.5 };

export function crossingScore(c, mode) {
  mode = normalizeMode(mode);
  let s = BASE[c.kind] ?? 0.5;
  if (c.kind === 'signals' && c.sound === 'yes') s = 3;

  if (mode === 'wheelchair') {
    if (c.kerb === 'raised') s -= 2;
    else if (c.kerb === 'lowered') s += 0.5;
    else s -= 0.5;
  } else if (mode === 'limited') {
    // steps/kerbs matter, but less than for a wheelchair
    if (c.kerb === 'raised') s -= 1;
    else if (c.kerb === 'lowered') s += 0.25;
  }
  return s;
}

/** Scores one route: { crossings: [...], duration, distance } */
export function scoreRoute(route, mode) {
  const crossings = route.crossings || [];
  const kinds = { signals: 0, zebra: 0, unmarked: 0, unknown: 0 };
  let worst = Infinity;
  let worstCrossing = null;
  let withSound = 0;
  let kerbUnknown = 0;
  let kerbRaised = 0;
  for (const c of crossings) {
    kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    if (c.kind === 'signals' && c.sound === 'yes') withSound++;
    if (c.kerb === null || c.kerb === undefined) kerbUnknown++;
    if (c.kerb === 'raised') kerbRaised++;
    const s = crossingScore(c, mode);
    if (s < worst) { worst = s; worstCrossing = c; }
  }
  return { worst, worstCrossing, count: crossings.length, kinds, withSound, kerbUnknown, kerbRaised };
}

/**
 * Sorts routes best-first. Adds `score`, `rank` (1 = best) and `isShortest` (the baseline:
 * what a normal map app would give you) to each route. Does not mutate the input.
 */
export function rankRoutes(routes, mode) {
  mode = normalizeMode(mode);
  const shortestId = [...routes].sort((a, b) => (a.distance ?? a.duration) - (b.distance ?? b.duration))[0]?.id;
  const scored = routes.map((r) => ({ ...r, score: scoreRoute(r, mode), isShortest: r.id === shortestId }));

  const byWorst = (a, b) => b.score.worst - a.score.worst;
  const byCount = (a, b) => a.score.count - b.score.count;
  const byDuration = (a, b) => a.duration - b.duration;
  const order = mode === 'limited' ? [byCount, byWorst, byDuration] : [byWorst, byCount, byDuration];

  scored.sort((a, b) => {
    for (const cmp of order) {
      const d = cmp(a, b);
      if (d !== 0 && !Number.isNaN(d)) return d;
    }
    return 0;
  });
  scored.forEach((r, i) => { r.rank = i + 1; });
  return scored;
}
