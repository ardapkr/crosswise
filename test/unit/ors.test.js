import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeOrsRoutes } from '../../public/lib/ors.js';

const sample = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[16.395, 48.176], [16.396, 48.176], [16.396, 48.177]] },
      properties: {
        summary: { distance: 185.3, duration: 133.4 },
        segments: [{
          distance: 185.3, duration: 133.4,
          steps: [
            { distance: 74, duration: 53, type: 11, instruction: 'Head east on Arsenalstraße', name: 'Arsenalstraße', way_points: [0, 1] },
            { distance: 111, duration: 80, type: 1, instruction: 'Turn left onto Ghegastraße', name: 'Ghegastraße', way_points: [1, 2] },
            { distance: 0, duration: 0, type: 10, instruction: 'Arrive at Ghegastraße', name: '-', way_points: [2, 2] },
          ],
        }],
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[16.395, 48.176], [16.396, 48.177]] },
      properties: { summary: {}, segments: [] },
    },
  ],
};

describe('normalizeOrsRoutes', () => {
  const routes = normalizeOrsRoutes(sample);

  it('returns one route per feature with ids, duration, distance, geometry', () => {
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ id: 'r1', index: 0, duration: 133.4, distance: 185.3 });
    expect(routes[0].geometry).toHaveLength(3);
    expect(routes[1].id).toBe('r2');
  });

  it('falls back to 0 when the summary is empty (zero-length route)', () => {
    expect(routes[1].duration).toBe(0);
    expect(routes[1].distance).toBe(0);
    expect(routes[1].steps).toEqual([]);
  });

  it('flattens steps with their geometry indexes; "-" names become empty', () => {
    expect(routes[0].steps).toHaveLength(3);
    expect(routes[0].steps[1]).toMatchObject({ type: 1, instruction: 'Turn left onto Ghegastraße', from: 1, to: 2 });
    expect(routes[0].steps[2].name).toBe('');
  });

  it('handles garbage input without throwing', () => {
    expect(normalizeOrsRoutes(null)).toEqual([]);
    expect(normalizeOrsRoutes({})).toEqual([]);
  });
});

// Real ORS responses saved from the API (see scripts/save-ors-fixtures.ps1)
const real = ['ors-hoiv-hbf-foot.json', 'ors-hoiv-hbf-wheelchair.json', 'ors-hoiv-belvedere-foot.json']
  .map((f) => `test/fixtures/${f}`).filter((f) => existsSync(f));

describe.skipIf(real.length === 0)('normalizeOrsRoutes on real fixtures', () => {
  it.each(real)('%s gives routes with geometry and steps', (file) => {
    const routes = normalizeOrsRoutes(JSON.parse(readFileSync(file, 'utf8')));
    expect(routes.length).toBeGreaterThanOrEqual(1);
    for (const r of routes) {
      expect(r.duration).toBeGreaterThan(0);
      expect(r.geometry.length).toBeGreaterThan(2);
      expect(r.steps.length).toBeGreaterThan(0);
      expect(r.steps.at(-1).to).toBeLessThan(r.geometry.length);
    }
  });
});
