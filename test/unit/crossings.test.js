import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isUsableNode, classifyNode, parseOverpass, clusterCrossings, crossingsOnRoute,
  encodeGroups, decodeGroups,
} from '../../public/lib/crossings.js';
import { distance } from '../../public/lib/geo.js';

const fixture = JSON.parse(readFileSync('test/fixtures/overpass-hoiv.json', 'utf8'));

describe('isUsableNode', () => {
  it('skips underground levels and private access', () => {
    expect(isUsableNode({ highway: 'crossing', level: '-1' })).toBe(false);
    expect(isUsableNode({ highway: 'crossing', access: 'private' })).toBe(false);
    expect(isUsableNode({ highway: 'crossing', level: '0' })).toBe(true);
    expect(isUsableNode({ highway: 'crossing' })).toBe(true);
  });
  it('skips "crossing=no" and non-pedestrian signals', () => {
    expect(isUsableNode({ highway: 'crossing', crossing: 'no' })).toBe(false);
    expect(isUsableNode({ highway: 'traffic_signals', traffic_signals: 'emergency' })).toBe(false);
    expect(isUsableNode({ highway: 'traffic_signals', traffic_signals: 'cyclist_crossing' })).toBe(false);
    expect(isUsableNode({ highway: 'traffic_signals', traffic_signals: 'signal' })).toBe(true);
  });
});

describe('classifyNode', () => {
  it('traffic lights with sound', () => {
    const c = classifyNode({ highway: 'crossing', crossing: 'traffic_signals', 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' });
    expect(c).toMatchObject({ kind: 'signals', sound: 'yes', vibration: 'yes' });
  });
  it('crossing:signals=yes also means signalled', () => {
    expect(classifyNode({ highway: 'crossing', crossing: 'marked', 'crossing:signals': 'yes' }).kind).toBe('signals');
  });
  it('zebra in its different spellings', () => {
    expect(classifyNode({ highway: 'crossing', crossing: 'zebra' }).kind).toBe('zebra');
    expect(classifyNode({ highway: 'crossing', crossing: 'uncontrolled', crossing_ref: 'zebra' }).kind).toBe('zebra');
    expect(classifyNode({ highway: 'crossing', crossing: 'marked', 'crossing:markings': 'zebra' }).kind).toBe('zebra');
    expect(classifyNode({ highway: 'crossing', crossing: 'uncontrolled' }).kind).toBe('zebra');
  });
  it('unmarked', () => {
    expect(classifyNode({ highway: 'crossing', crossing: 'unmarked' }).kind).toBe('unmarked');
    expect(classifyNode({ highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'no' }).kind).toBe('unmarked');
    expect(classifyNode({ highway: 'crossing', 'crossing:signals': 'no', 'crossing:markings': 'no' }).kind).toBe('unmarked');
  });
  it('plain highway=crossing without details is unknown', () => {
    expect(classifyNode({ highway: 'crossing' }).kind).toBe('unknown');
  });
  it('kerb: lowered/flush good, raised bad, missing = unknown (never guessed)', () => {
    expect(classifyNode({ highway: 'crossing', kerb: 'lowered' }).kerb).toBe('lowered');
    expect(classifyNode({ highway: 'crossing', kerb: 'flush' }).kerb).toBe('lowered');
    expect(classifyNode({ highway: 'crossing', kerb: 'no' }).kerb).toBe('lowered');
    expect(classifyNode({ highway: 'crossing', kerb: 'raised' }).kerb).toBe('raised');
    expect(classifyNode({ highway: 'crossing' }).kerb).toBe(null);
  });
  it('ignores button_operated completely', () => {
    const a = classifyNode({ highway: 'crossing', crossing: 'traffic_signals', button_operated: 'yes' });
    const b = classifyNode({ highway: 'crossing', crossing: 'traffic_signals' });
    expect(a).toEqual(b);
  });
});

describe('parseOverpass + clusterCrossings on real HOIV data', () => {
  const nodes = parseOverpass(fixture);
  const groups = clusterCrossings(nodes);

  it('drops level=-1 and private nodes from the 730', () => {
    expect(fixture.elements.length).toBe(730);
    expect(nodes.length).toBeLessThan(730 - 3);
    expect(nodes.some((n) => n.tags.level === '-1')).toBe(false);
    expect(nodes.some((n) => n.tags.access === 'private')).toBe(false);
  });

  it('clusters into far fewer groups than nodes', () => {
    expect(groups.length).toBeGreaterThan(40);
    expect(groups.length).toBeLessThan(nodes.length * 0.7);
  });

  it('every node in a group is within ~20 m of the group centre', () => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const g of groups) {
      for (const id of g.nodeIds) {
        const n = byId.get(id);
        expect(distance([n.lon, n.lat], [g.lon, g.lat])).toBeLessThan(25);
      }
    }
  });

  it('a group takes the best known value: one sound=yes node makes the group sound=yes', () => {
    const withSound = groups.filter((g) => g.sound === 'yes');
    expect(withSound.length).toBeGreaterThan(10);
    for (const g of withSound) expect(g.kind).toBe('signals');
  });

  it('unknown kerb stays null, not guessed', () => {
    expect(groups.some((g) => g.kerb === null)).toBe(true);
  });
});

describe('clusterCrossings (synthetic)', () => {
  const n = (id, lon, lat, tags) => ({ id, lon, lat, tags: { highway: 'crossing', ...tags } });
  it('merges close nodes, keeps far ones apart, combines attributes', () => {
    const groups = clusterCrossings([
      n(1, 16.39500, 48.17600, { crossing: 'traffic_signals' }),
      n(2, 16.39510, 48.17605, { 'traffic_signals:sound': 'yes', kerb: 'lowered' }),
      n(3, 16.39800, 48.17600, { crossing: 'unmarked' }),
    ]);
    expect(groups.length).toBe(2);
    const a = groups.find((g) => g.nodeIds.includes(1));
    expect(a.nodeIds).toEqual([1, 2]);
    expect(a).toMatchObject({ kind: 'signals', sound: 'yes', kerb: 'lowered' });
  });
  it('conflicting kerb info: lowered wins over raised (best known), raised over unknown', () => {
    const g1 = clusterCrossings([n(1, 16.395, 48.176, { kerb: 'raised' }), n(2, 16.39501, 48.176, { kerb: 'lowered' })]);
    expect(g1[0].kerb).toBe('lowered');
    const g2 = clusterCrossings([n(1, 16.395, 48.176, { kerb: 'raised' }), n(2, 16.39501, 48.176, {})]);
    expect(g2[0].kerb).toBe('raised');
  });
});

describe('crossingsOnRoute', () => {
  const groups = clusterCrossings([
    { id: 1, lon: 16.3950, lat: 48.1761, tags: { highway: 'crossing', crossing: 'zebra' } },
    { id: 2, lon: 16.3960, lat: 48.17625, tags: { highway: 'crossing', crossing: 'unmarked' } }, // ~17 m off
    { id: 3, lon: 16.3945, lat: 48.1761, tags: { highway: 'crossing', crossing: 'traffic_signals' } },
  ]);
  const route = [[16.3940, 48.1761], [16.3967, 48.1761]];

  it('keeps crossings within 12 m, sorted by distance along the route', () => {
    const on = crossingsOnRoute(groups, route);
    expect(on.map((g) => g.kind)).toEqual(['signals', 'zebra']);
    expect(on[0].along).toBeLessThan(on[1].along);
  });
});

describe('snapshot encoding', () => {
  it('round-trips groups through the compact format', () => {
    const groups = clusterCrossings(parseOverpass(fixture));
    const back = decodeGroups(encodeGroups(groups));
    expect(back.length).toBe(groups.length);
    for (let i = 0; i < groups.length; i++) {
      expect(back[i]).toMatchObject({
        kind: groups[i].kind, sound: groups[i].sound, vibration: groups[i].vibration,
        kerb: groups[i].kerb, tactile: groups[i].tactile, island: groups[i].island,
      });
      expect(distance([back[i].lon, back[i].lat], [groups[i].lon, groups[i].lat])).toBeLessThan(0.2);
    }
  });
});
