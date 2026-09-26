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
    expect(text).toMatch(/^The recommended route is 1 minute longer and avoids the unmarked crossing on the shortest route. Its 11 crossings/);
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
