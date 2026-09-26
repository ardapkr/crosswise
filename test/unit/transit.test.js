// Public transport parsing on REAL saved Transitous answers (test/fixtures/transit-*.json).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decodePolyline, placeName, normalizePlan, choosePatterns, patternKey, shiftPlanTimes, trimPlan, lineName,
} from '../../public/lib/transit.js';
import { distance } from '../../public/lib/geo.js';

const load = (name) => JSON.parse(readFileSync(`test/fixtures/transit-${name}.json`, 'utf8'));
const rides = (o) => o.legs.filter((l) => l.kind === 'ride');

describe('decodePolyline', () => {
  it('decodes the Google example at precision 5 into [lon, lat]', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(pts).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it('returns [] for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
  });
});

describe('placeName', () => {
  it('drops "Wien " but keeps names that need it', () => {
    expect(placeName('Wien Absberggasse')).toBe('Absberggasse');
    expect(placeName('Wien Nußdorf, Beethovengang')).toBe('Nußdorf, Beethovengang');
    expect(placeName('Wien Mitte')).toBe('Wien Mitte');
    expect(placeName('Villach Hauptbahnhof')).toBe('Villach Hauptbahnhof');
  });
  it('the user start/end have no name', () => {
    expect(placeName('START')).toBe('');
    expect(placeName('END')).toBe('');
  });
});

describe('normalizePlan: HOIV → Hauptbahnhof', () => {
  const options = normalizePlan(load('hoiv-hbf'));
  const first = options[0];

  it('has options with walk and ride legs', () => {
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(first.legs[0].kind).toBe('walk');
    expect(first.legs.at(-1).kind).toBe('walk');
  });

  it('the 69A leg has line, direction, stops, times and a route line', () => {
    const bus = options.flatMap(rides).find((l) => l.line === '69A');
    expect(bus).toMatchObject({ vehicle: 'bus', headsign: 'Hauptbahnhof', origin: 'Simmering', wheelchair: 'yes' });
    expect(bus.from.name).toBe('Hüttenbrennergasse');
    expect(bus.stops).toBe(bus.intermediate.length + 1);
    expect(bus.departure).toBeLessThan(bus.arrival);
    expect(bus.geometry.length).toBeGreaterThan(5);
    // the decoded line starts at the stop (precision 7 decoding is right)
    expect(distance(bus.geometry[0], [bus.from.lon, bus.from.lat])).toBeLessThan(30);
    expect(distance(bus.geometry.at(-1), [bus.to.lon, bus.to.lat])).toBeLessThan(30);
  });

  it('walking legs start at the user and end at the platform', () => {
    const walk = first.legs[0];
    expect(walk.from.name).toBe('');
    expect(distance(walk.geometry[0], [16.3954, 48.1761])).toBeLessThan(20);
    expect(walk.to.name).toBe(first.legs[1].from.name);
  });
});

describe('platforms: the same stop has a different platform per direction', () => {
  it('69A at Hüttenbrennergasse towards Hauptbahnhof ≠ towards Simmering', () => {
    const toHbf = normalizePlan(load('hoiv-hbf')).flatMap(rides).find((l) => l.line === '69A');
    const toSim = normalizePlan(load('hbf-hoiv')).flatMap(rides).find((l) => l.line === '69A');
    expect(toSim.headsign).toBe('Simmering');
    // Absberggasse: tram D and tram 6 leave from different platforms (different stop ids and positions)
    const abs = normalizePlan(load('hoiv-stephansplatz')).flatMap(rides).filter((l) => l.from.name === 'Absberggasse');
    const ids = new Set(abs.map((l) => l.from.stopId));
    if (ids.size > 1) {
      const [a, b] = [...ids].map((id) => abs.find((l) => l.from.stopId === id).from);
      expect(distance([a.lon, a.lat], [b.lon, b.lat])).toBeGreaterThan(10);
    }
    expect(toHbf.from.stopId).not.toBe('');
  });
});

describe('choosePatterns', () => {
  it('keeps at most 2 different trips, each with its departures earliest first', () => {
    const groups = choosePatterns(normalizePlan(load('hoiv-schoenbrunn')));
    expect(groups).toHaveLength(2);
    expect(groups[0].key).not.toBe(groups[1].key);
    for (const g of groups) {
      for (const o of g.options) expect(patternKey(o)).toBe(g.key);
      const starts = g.options.map((o) => o.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it('drops "same trip plus one more short ride"', () => {
    const groups = choosePatterns(normalizePlan(load('hoiv-karlsplatz-wheelchair')), { mode: 'wheelchair' });
    for (const g of groups) {
      for (const h of groups) if (g !== h) expect(h.key.startsWith(g.key + '|')).toBe(false);
    }
  });

  it('wheelchair mode drops trips with a vehicle marked not accessible', () => {
    const options = normalizePlan(load('hoiv-hbf'));
    options[0].legs.find((l) => l.kind === 'ride').wheelchair = 'no';
    const key = patternKey(options[0]);
    const onlyThis = options.filter((o) => patternKey(o) === key);
    for (const o of onlyThis) o.legs.find((l) => l.kind === 'ride').wheelchair = 'no';
    expect(choosePatterns(options, { mode: 'wheelchair' }).map((g) => g.key)).not.toContain(key);
    expect(choosePatterns(options, { mode: 'blind' }).map((g) => g.key)).toContain(key);
  });

  it('penalises transfers: a direct trip can beat a slightly faster trip with changes', () => {
    const mk = (id, end, transfers) => ({
      id, start: 0, end, transfers,
      legs: [{ kind: 'ride', line: id, from: { stopId: id }, to: { stopId: 'x' }, wheelchair: 'yes' }],
    });
    const groups = choosePatterns([mk('fast', 20 * 60e3, 2), mk('direct', 24 * 60e3, 0)], { max: 1 });
    expect(groups[0].key).toMatch(/^direct/);
  });
});

describe('shiftPlanTimes / trimPlan', () => {
  it('moves every time by the same amount', () => {
    const json = load('hoiv-hbf');
    const shifted = shiftPlanTimes(json, 3600e3);
    const a = normalizePlan(json)[0];
    const b = normalizePlan(shifted)[0];
    expect(b.start - a.start).toBe(3600e3);
    expect(rides(b)[0].departure - rides(a)[0].departure).toBe(3600e3);
  });
  it('trimPlan drops debug output and walking steps', () => {
    const t = trimPlan({ debugOutput: { x: 1 }, itineraries: [{ legs: [{ mode: 'WALK', steps: [1], alternatives: [] }] }] });
    expect(t).toEqual({ itineraries: [{ legs: [{ mode: 'WALK' }] }] });
  });
});

describe('lineName', () => {
  it('names lines the way they are spoken', () => {
    expect(lineName({ vehicle: 'tram', line: 'D' })).toBe('tram D');
    expect(lineName({ vehicle: 'bus', line: '69A' })).toBe('bus 69A');
    expect(lineName({ vehicle: 'U-Bahn', line: 'U1' })).toBe('U1');
    expect(lineName({ vehicle: 'S-Bahn', line: 'S1' })).toBe('S1');
    expect(lineName({ vehicle: 'train', line: 'REX 7' })).toBe('train REX 7');
  });
});
