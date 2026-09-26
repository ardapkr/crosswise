import { describe, it, expect } from 'vitest';
import { crossingScore, scoreRoute, rankRoutes } from '../../public/lib/scoring.js';
import { routeSummary, describeCrossing } from '../../public/lib/summary.js';

const X = (kind, extra = {}) => ({ kind, sound: null, vibration: null, kerb: null, tactile: null, island: null, ...extra });
const LIGHT_SOUND = X('signals', { sound: 'yes', kerb: 'lowered' });
const LIGHT = X('signals', { sound: 'no' });
const ZEBRA = X('zebra');
const UNMARKED = X('unmarked');

describe('crossingScore — blind mode', () => {
  it('lights+sound 3, lights only 2, zebra 1, unmarked 0', () => {
    expect(crossingScore(LIGHT_SOUND, 'blind')).toBe(3);
    expect(crossingScore(LIGHT, 'blind')).toBe(2);
    expect(crossingScore(X('signals'), 'blind')).toBe(2); // unknown sound
    expect(crossingScore(ZEBRA, 'blind')).toBe(1);
    expect(crossingScore(UNMARKED, 'blind')).toBe(0);
  });
  it('ignores kerbs in blind mode', () => {
    expect(crossingScore(X('zebra', { kerb: 'raised' }), 'blind')).toBe(1);
  });
});

describe('crossingScore — wheelchair mode', () => {
  it('raised kerb −2, unknown −0.5, lowered +0.5', () => {
    expect(crossingScore(X('zebra', { kerb: 'raised' }), 'wheelchair')).toBe(-1);
    expect(crossingScore(X('zebra'), 'wheelchair')).toBe(0.5);
    expect(crossingScore(X('zebra', { kerb: 'lowered' }), 'wheelchair')).toBe(1.5);
    expect(crossingScore(LIGHT_SOUND, 'wheelchair')).toBe(3.5);
  });
});

describe('scoreRoute', () => {
  it('reports worst crossing, count and kind counts', () => {
    const s = scoreRoute({ crossings: [LIGHT_SOUND, ZEBRA, LIGHT] }, 'blind');
    expect(s.worst).toBe(1);
    expect(s.count).toBe(3);
    expect(s.kinds).toEqual({ signals: 2, zebra: 1, unmarked: 0, unknown: 0 });
    expect(s.withSound).toBe(1);
    expect(s.worstCrossing).toBe(ZEBRA);
  });
  it('a route without crossings has no worst crossing', () => {
    const s = scoreRoute({ crossings: [] }, 'blind');
    expect(s.count).toBe(0);
    expect(s.worst).toBe(Infinity);
  });
});

describe('rankRoutes', () => {
  const shortest = { id: 'a', duration: 600, distance: 800, crossings: [LIGHT_SOUND, UNMARKED] };
  const safer = { id: 'b', duration: 780, distance: 1000, crossings: [LIGHT_SOUND, LIGHT_SOUND, LIGHT_SOUND] };
  const safeButLonger = { id: 'c', duration: 900, distance: 1150, crossings: [LIGHT_SOUND, LIGHT_SOUND, LIGHT_SOUND, LIGHT_SOUND] };

  it('safer route beats the shorter one (worst crossing first)', () => {
    const ranked = rankRoutes([shortest, safer], 'blind');
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a']);
  });
  it('then fewer crossings, then shorter duration', () => {
    expect(rankRoutes([safeButLonger, safer], 'blind').map((r) => r.id)).toEqual(['b', 'c']);
    const twin = { ...safer, id: 'd', duration: 700 };
    expect(rankRoutes([safer, twin], 'blind').map((r) => r.id)).toEqual(['d', 'b']);
  });
  it('marks the shortest route as the baseline', () => {
    const ranked = rankRoutes([safer, shortest], 'blind');
    expect(ranked.find((r) => r.id === 'a').isShortest).toBe(true);
    expect(ranked.find((r) => r.id === 'b').isShortest).toBe(false);
    expect(ranked[0].rank).toBe(1);
  });
  it('wheelchair: a raised kerb makes a route lose to one with unknown kerbs', () => {
    const raised = { id: 'r', duration: 500, crossings: [X('signals', { sound: 'yes', kerb: 'raised' })] };
    const unknown = { id: 'u', duration: 600, crossings: [X('signals', { sound: 'yes' })] };
    expect(rankRoutes([raised, unknown], 'wheelchair')[0].id).toBe('u');
    expect(rankRoutes([raised, unknown], 'blind')[0].id).toBe('r');
  });
  it('limited mobility: fewer crossings first', () => {
    const few = { id: 'few', duration: 700, crossings: [ZEBRA] };
    const many = { id: 'many', duration: 600, crossings: [LIGHT_SOUND, LIGHT_SOUND, LIGHT_SOUND] };
    expect(rankRoutes([many, few], 'limited')[0].id).toBe('few');
    expect(rankRoutes([many, few], 'blind')[0].id).toBe('many');
  });
});

describe('describeCrossing', () => {
  it('says type, sound signal, and kerb (unknown is said, never guessed)', () => {
    expect(describeCrossing(LIGHT_SOUND, 'blind')).toBe('Traffic light with acoustic signal');
    expect(describeCrossing(X('signals', { sound: 'no' }), 'blind')).toBe('Traffic light without acoustic signal');
    expect(describeCrossing(X('signals'), 'blind')).toBe('Traffic light, acoustic signal unknown');
    expect(describeCrossing(ZEBRA, 'wheelchair')).toBe('Zebra crossing without lights, kerb height unknown');
    expect(describeCrossing(X('unmarked', { kerb: 'raised' }), 'wheelchair')).toBe('Unmarked crossing, raised kerb');
    expect(describeCrossing(LIGHT_SOUND, 'wheelchair')).toBe('Traffic light with acoustic signal, lowered kerb');
  });
});

describe('routeSummary', () => {
  const shortest = { id: 'a', duration: 600, distance: 800, crossings: [LIGHT_SOUND, UNMARKED] };
  const safer = { id: 'b', duration: 780, distance: 1000, crossings: [LIGHT_SOUND, LIGHT_SOUND, LIGHT_SOUND] };

  it('explains why the safer route is worth the extra minutes', () => {
    const ranked = rankRoutes([shortest, safer], 'blind');
    const text = routeSummary(ranked, 'blind');
    expect(text).toContain('recommended route is 3 minutes longer');
    expect(text).toContain('every crossing has lights and an acoustic signal');
    expect(text).toContain('shortest route');
    expect(text).toMatch(/unmarked/i);
  });
  it('says so when the shortest route is also the safest', () => {
    const ranked = rankRoutes([safer, { ...shortest, crossings: [LIGHT_SOUND] }], 'blind');
    expect(routeSummary(ranked, 'blind')).toMatch(/shortest route is also the safest/i);
  });
  it('handles a single route and a route without crossings', () => {
    expect(routeSummary(rankRoutes([{ id: 'x', duration: 300, crossings: [] }], 'blind'), 'blind'))
      .toMatch(/no road crossings/i);
  });
  it('wheelchair mode mentions unknown kerbs', () => {
    const r = rankRoutes([{ id: 'x', duration: 300, crossings: [LIGHT_SOUND, X('signals', { sound: 'yes' })] }], 'wheelchair');
    expect(routeSummary(r, 'wheelchair')).toMatch(/kerb height unknown at 1 crossing/i);
  });
});
