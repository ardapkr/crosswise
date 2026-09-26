// Map dot colours and what a tapped route card says.
import { describe, it, expect } from 'vitest';
import { crossingType, rankRoutes } from '../../public/lib/scoring.js';
import { routeCardText, routeBadge } from '../../public/lib/summary.js';

const X = (kind, extra = {}) => ({ kind, sound: null, kerb: null, ...extra });

describe('crossingType (map dot colour, same legend in every mode)', () => {
  it('green lights+sound, yellow lights, orange zebra, red unmarked/unknown', () => {
    expect(crossingType(X('signals', { sound: 'yes' }))).toBe('sound');
    expect(crossingType(X('signals', { sound: 'no' }))).toBe('lights');
    expect(crossingType(X('signals'))).toBe('lights'); // sound unknown: not promised
    expect(crossingType(X('zebra'))).toBe('zebra');
    expect(crossingType(X('unmarked'))).toBe('unmarked');
    expect(crossingType(X('unknown'))).toBe('unmarked');
    expect(crossingType(undefined)).toBe('unmarked');
  });
});

describe('route cards', () => {
  const safe = { id: 'a', duration: 29 * 60, distance: 2400, crossings: [X('signals', { sound: 'yes' }), X('signals', { sound: 'yes' }), X('signals')] };
  const short = { id: 'b', duration: 26 * 60, distance: 2100, crossings: [X('signals', { sound: 'yes' }), X('unmarked')] };
  const ranked = rankRoutes([short, safe], 'blind');

  it('badges', () => {
    expect(ranked.map(routeBadge)).toEqual(['Recommended', 'Shortest']);
    expect(routeBadge({ rank: 1, isShortest: true })).toBe('Recommended · Shortest');
  });

  it('tapped card is read out: time, distance, crossings, level, worst crossing', () => {
    expect(routeCardText(ranked[0], 'blind')).toBe(
      'Recommended route: 29 minutes, 2.4 kilometres, 3 crossings, 2 with an acoustic signal. All crossings with lights.',
    );
    expect(routeCardText(ranked[1], 'blind')).toBe(
      'Shortest route: 26 minutes, 2.1 kilometres, 2 crossings, 1 with an acoustic signal. Has a risky or unknown crossing. ' +
      'Worst crossing: unmarked crossing.',
    );
  });

  it('all lights + sound: no "worst crossing"; limited mobility does not count sound', () => {
    const all = rankRoutes([{ id: 'c', duration: 300, distance: 400, crossings: [X('signals', { sound: 'yes' })] }], 'blind')[0];
    expect(routeCardText(all, 'blind')).toBe('Recommended and shortest route: 5 minutes, 0.4 kilometres, 1 crossing, 1 with an acoustic signal. All crossings with lights and sound.');
    const lim = rankRoutes([{ id: 'c', duration: 300, distance: 400, crossings: [X('signals', { sound: 'yes', kerb: 'lowered' })] }], 'limited')[0];
    expect(routeCardText(lim, 'limited')).toBe('Recommended and shortest route: 5 minutes, 0.4 kilometres, 1 crossing. All crossings with lights.');
  });
});
