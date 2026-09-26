// Regression guard on 30 REAL trips (saved ORS answers in eval/routes-blind.json, see scripts/eval-routes.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate, summarize } from '../../scripts/eval-routes.js';
import { decodeGroups } from '../../public/lib/crossings.js';

const saved = JSON.parse(readFileSync('eval/routes-blind.json', 'utf8'));
const groups = decodeGroups(JSON.parse(readFileSync('public/data/crossings-vienna.json', 'utf8')).rows);
const results = evaluate(saved, groups, 'blind');
const s = summarize(results);

describe('baseline comparison on 30 real trips around HOIV (blind mode)', () => {
  it('every trip got a route', () => expect(s.answered).toBe(30));
  it('our worst crossing is never worse than the shortest route’s', () => expect(s.worseWorstCrossing).toBe(0));
  it('at least 40% fewer unmarked/unknown crossings than the shortest routes', () => {
    expect(s.unmarkedOurs).toBeLessThanOrEqual(s.unmarkedBase * 0.6);
  });
  it('more crossings with an acoustic signal than the baseline', () => expect(s.soundShareOurs).toBeGreaterThan(s.soundShareBase));
  it('costs little time: median under 2 minutes extra when the route differs', () => expect(s.medianExtraMin).toBeLessThan(2));
});
