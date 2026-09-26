// End-to-end logic test on REAL data: ORS responses saved around HOIV + the Vienna crossing snapshot.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeOrsRoutes } from '../../public/lib/ors.js';
import { decodeGroups, crossingsOnRoute } from '../../public/lib/crossings.js';
import { rankRoutes } from '../../public/lib/scoring.js';
import { routeSummary } from '../../public/lib/summary.js';

const groups = decodeGroups(JSON.parse(readFileSync('public/data/crossings-vienna.json', 'utf8')).rows);
const load = (name) => {
  const routes = normalizeOrsRoutes(JSON.parse(readFileSync(`test/fixtures/${name}.json`, 'utf8')));
  return routes.map((r) => ({ ...r, crossings: crossingsOnRoute(groups, r.geometry) }));
};

describe('HOIV → Hauptbahnhof on foot (blind mode)', () => {
  const ranked = rankRoutes(load('ors-hoiv-hbf-foot'), 'blind');
  const best = ranked[0];
  const shortest = ranked.find((r) => r.isShortest);

  it('ORS gives 3 alternatives', () => expect(ranked).toHaveLength(3));

  it('the safer route beats the shorter one', () => {
    expect(best.isShortest).toBe(false);
    expect(shortest.score.kinds.unmarked).toBeGreaterThan(0);
    expect(best.score.kinds.unmarked).toBe(0);
    expect(best.score.worst).toBeGreaterThan(shortest.score.worst);
  });

  it('costs only a little extra time (< 3 min)', () => {
    expect(best.duration - shortest.duration).toBeLessThan(180);
  });

  it('the spoken summary explains the trade-off', () => {
    const text = routeSummary(ranked, 'blind');
    expect(text).toMatch(/^The recommended route is 1 minute longer and avoids the unmarked crossing on the shortest route. Its 9 crossings: 5 with lights and an acoustic signal/);
  });
});

describe('HOIV → Belvedere on foot (blind mode)', () => {
  it('the shortest route is also the safest (all crossings signalled)', () => {
    const ranked = rankRoutes(load('ors-hoiv-belvedere-foot'), 'blind');
    expect(ranked[0].isShortest).toBe(true);
    expect(ranked[0].score.kinds.signals).toBe(ranked[0].score.count);
    expect(routeSummary(ranked, 'blind')).toMatch(/shortest route is also the safest/);
  });
});

describe('crossing detection on real routes', () => {
  it('finds a plausible number of crossings per km (2–10)', () => {
    for (const name of ['ors-hoiv-hbf-foot', 'ors-hoiv-belvedere-foot', 'ors-hoiv-hbf-wheelchair']) {
      for (const r of load(name)) {
        const perKm = r.crossings.length / (r.distance / 1000);
        expect(perKm).toBeGreaterThan(2);
        expect(perKm).toBeLessThan(10);
      }
    }
  });
});

import { clusterCrossings } from '../../public/lib/crossings.js';

describe('same candidate routes, three modes, three different rankings (real Vienna crossings)', () => {
  // Candidate routes built from REAL crossing groups of the Vienna snapshot (first match per description).
  const pick = (kind, sound, kerb) => {
    const g = groups.find((c) => c.kind === kind && (sound === undefined || c.sound === sound) && c.kerb === kerb);
    if (!g) throw new Error(`no real crossing with ${kind}/${sound}/${kerb}`);
    return g;
  };
  const lightsButRaisedKerb = { id: 'A', duration: 600, distance: 800, crossings: [pick('signals', 'yes', 'lowered'), pick('signals', 'yes', 'raised')] };
  const zebrasLoweredKerbs = { id: 'B', duration: 650, distance: 850, crossings: [pick('zebra', undefined, 'lowered'), pick('zebra', undefined, 'lowered'), pick('zebra', undefined, 'lowered')] };
  const oneZebraKerbUnknown = { id: 'C', duration: 550, distance: 700, crossings: [pick('zebra', undefined, null)] };
  const candidates = [lightsButRaisedKerb, zebrasLoweredKerbs, oneZebraKerbUnknown];
  const order = (mode) => rankRoutes(candidates, mode).map((r) => r.id).join('');

  it('blind: acoustic signals first → A, then the single zebra, then 3 zebras', () => expect(order('blind')).toBe('ACB'));
  it('wheelchair: the raised kerb and the unknown kerb push A and C down → B first', () => expect(order('wheelchair')).toBe('BAC'));
  it('limited mobility: no risky crossing anywhere, so fewest crossings first → C', () => expect(order('limited')).toBe('CAB'));
});

describe('HOIV → Hauptbahnhof, limited mobility (real ORS response with steps avoided)', () => {
  it('avoids the route with the unmarked crossing, then prefers fewer crossings', () => {
    const ranked = rankRoutes(load('ors-hoiv-hbf-limited'), 'limited');
    expect(ranked[0].score.risky).toBe(0);
    expect(ranked.at(-1).score.kinds.unmarked).toBeGreaterThan(0);
    expect(ranked[0].score.count).toBeLessThan(ranked[1].score.count);
    expect(routeSummary(ranked, 'limited')).toMatch(/avoids the unmarked crossing on the shortest route.*Routes avoid steps\.$/);
  });
});
