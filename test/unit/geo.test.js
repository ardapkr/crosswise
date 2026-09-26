import { describe, it, expect } from 'vitest';
import {
  distance, pointToLineDistance, lineLength, bbox, bboxContains, pointAlong,
} from '../../public/lib/geo.js';

// Coordinates are GeoJSON order: [lon, lat]
const HOIV = [16.3954, 48.1761];
const STEPHANSDOM = [16.3738, 48.2085];

describe('distance', () => {
  it('is zero for the same point', () => {
    expect(distance(HOIV, HOIV)).toBe(0);
  });
  it('matches a known distance (HOIV → Stephansdom ≈ 3.93 km)', () => {
    expect(distance(HOIV, STEPHANSDOM)).toBeGreaterThan(3850);
    expect(distance(HOIV, STEPHANSDOM)).toBeLessThan(4000);
  });
  it('~111 m per 0.001° latitude', () => {
    expect(distance([16.39, 48.17], [16.39, 48.171])).toBeCloseTo(111.2, 0);
  });
});

describe('pointToLineDistance', () => {
  // a 200 m west→east line at HOIV latitude
  const line = [[16.3940, 48.1761], [16.3967, 48.1761]];

  it('is ~0 for a point on the line and reports how far along it is', () => {
    const r = pointToLineDistance([16.39535, 48.1761], line);
    expect(r.distance).toBeLessThan(0.5);
    expect(r.along).toBeGreaterThan(90);
    expect(r.along).toBeLessThan(115);
  });

  it('measures perpendicular distance to the side (~10 m north)', () => {
    const r = pointToLineDistance([16.3950, 48.17619], line);
    expect(r.distance).toBeGreaterThan(9);
    expect(r.distance).toBeLessThan(11);
  });

  it('measures to the nearest end beyond the line', () => {
    const r = pointToLineDistance([16.3990, 48.1761], line);
    expect(r.distance).toBeCloseTo(distance([16.3990, 48.1761], [16.3967, 48.1761]), 0);
    expect(r.segment).toBe(0);
  });

  it('handles multi-segment lines and picks the closest segment', () => {
    const l = [[16.3940, 48.1761], [16.3950, 48.1761], [16.3950, 48.1771]];
    const r = pointToLineDistance([16.3951, 48.1768], l);
    expect(r.segment).toBe(1);
    expect(r.distance).toBeLessThan(10);
  });
});

describe('lineLength / pointAlong', () => {
  const l = [[16.3940, 48.1761], [16.3950, 48.1761], [16.3950, 48.1771]];
  it('sums segment lengths', () => {
    expect(lineLength(l)).toBeCloseTo(distance(l[0], l[1]) + distance(l[1], l[2]), 5);
  });
  it('finds a point a given distance along the line', () => {
    const d1 = distance(l[0], l[1]);
    const p = pointAlong(l, d1 + 50);
    expect(distance(p, l[1])).toBeCloseTo(50, 0);
    expect(pointAlong(l, -5)).toEqual(l[0]);
    expect(pointAlong(l, 1e9)).toEqual(l[2]);
  });
});

describe('bbox', () => {
  const l = [[16.39, 48.17], [16.40, 48.18]];
  it('returns [west, south, east, north]', () => {
    expect(bbox(l)).toEqual([16.39, 48.17, 16.40, 48.18]);
  });
  it('pads by metres', () => {
    const [w, s, e, n] = bbox(l, 50);
    expect(distance([w, s], [16.39, s])).toBeCloseTo(50, 0);
    expect(distance([w, s], [w, 48.17])).toBeCloseTo(50, 0);
    expect(n).toBeGreaterThan(48.18);
    expect(e).toBeGreaterThan(16.40);
  });
  it('bboxContains', () => {
    expect(bboxContains([16.39, 48.17, 16.40, 48.18], [16.395, 48.175])).toBe(true);
    expect(bboxContains([16.39, 48.17, 16.40, 48.18], [16.5, 48.175])).toBe(false);
  });
});
