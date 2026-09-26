import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cumulativeDistances, buildEvents, createGuideState, updateGuidance, crossingAlert, formatDistance,
} from '../../public/lib/guidance.js';
import { pointAlong, lineLength } from '../../public/lib/geo.js';
import { normalizeOrsRoutes } from '../../public/lib/ors.js';
import { decodeGroups, crossingsOnRoute } from '../../public/lib/crossings.js';

// Straight 400 m line going east at HOIV latitude, one left turn at 200 m, crossings at 100 m and 300 m.
const A = [16.3900, 48.1761];
const geometry = [];
for (let i = 0; i <= 40; i++) geometry.push([A[0] + i * 0.000135, A[1]]); // ~10 m steps
const len = lineLength(geometry);
const at = (m) => pointAlong(geometry, m);

const route = {
  geometry,
  duration: 300,
  distance: len,
  steps: [
    { instruction: 'Head east on Arsenalstraße', type: 11, name: 'Arsenalstraße', from: 0, to: 20 },
    { instruction: 'Turn left onto Ghegastraße', type: 0, name: 'Ghegastraße', from: 20, to: 40 },
    { instruction: 'Arrive at Ghegastraße', type: 10, name: 'Ghegastraße', from: 40, to: 40 },
  ],
  crossings: [
    { id: 'c1', kind: 'signals', sound: 'yes', vibration: 'yes', kerb: 'lowered', island: null, along: 100 },
    { id: 'c2', kind: 'zebra', sound: null, vibration: null, kerb: null, island: 'yes', along: 300 },
  ],
};

const texts = (r) => r.say.map((m) => m.text);

describe('helpers', () => {
  it('cumulativeDistances starts at 0 and ends at the line length', () => {
    const c = cumulativeDistances(geometry);
    expect(c[0]).toBe(0);
    expect(c.at(-1)).toBeCloseTo(len, 5);
  });
  it('formatDistance rounds to friendly numbers', () => {
    expect(formatDistance(3)).toBe('a few metres');
    expect(formatDistance(38)).toBe('40 metres');
    expect(formatDistance(12)).toBe('10 metres');
    expect(formatDistance(140)).toBe('140 metres');
    expect(formatDistance(1260)).toBe('1.3 kilometres');
  });
});

describe('buildEvents', () => {
  const ev = buildEvents(route, 'blind');
  it('has depart, crossing, turn, crossing, arrive in route order', () => {
    expect(ev.map((e) => e.kind)).toEqual(['depart', 'crossing', 'turn', 'crossing', 'arrive']);
    expect(ev[2].along).toBeCloseTo(cumulativeDistances(geometry)[20], 5);
  });
  it('skips "straight on" steps', () => {
    const r2 = { ...route, steps: [...route.steps.slice(0, 1), { instruction: 'Continue straight', type: 6, from: 10, to: 20 }, ...route.steps.slice(1)] };
    expect(buildEvents(r2, 'blind').filter((e) => e.kind === 'turn')).toHaveLength(1);
  });
});

describe('crossingAlert wording', () => {
  const [c1, c2] = route.crossings;
  it('far alert: type + sound + distance', () => {
    expect(crossingAlert(c1, 'blind', 'far', 40)).toBe('In 40 metres: crossing with traffic light and acoustic signal.');
  });
  it('near alert with sound: tells where the button is and to listen', () => {
    expect(crossingAlert(c1, 'blind', 'near', 10)).toBe(
      'Crossing now: traffic light with acoustic signal. Press the button under the box. Listen for traffic before crossing.',
    );
  });
  it('zebra: make sure traffic stops; island mentioned', () => {
    expect(crossingAlert(c2, 'blind', 'near', 8)).toBe(
      'Crossing now: zebra crossing without lights. There is a traffic island in the middle. Make sure traffic has stopped before crossing.',
    );
  });
  it('wheelchair: kerb info, unknown is said as unknown', () => {
    expect(crossingAlert(c1, 'wheelchair', 'far', 40)).toBe('In 40 metres: crossing with traffic light and acoustic signal, lowered kerb.');
    expect(crossingAlert(c2, 'wheelchair', 'far', 40)).toContain('kerb height unknown');
  });
  it('never says it is safe to cross', () => {
    for (const c of route.crossings) for (const m of ['blind', 'wheelchair']) for (const s of ['far', 'near']) {
      expect(crossingAlert(c, m, s, 10).toLowerCase()).not.toContain('safe to cross');
    }
  });
});

describe('updateGuidance: walking the route', () => {
  function walk(step = 5) {
    let state = createGuideState(route, 'blind');
    const all = [];
    for (let m = 0; m <= len + 5; m += step) {
      const r = updateGuidance(state, at(m));
      state = r.state;
      all.push(...texts(r));
    }
    return all;
  }

  it('announces each event exactly once, in order', () => {
    const said = walk();
    expect(said[0]).toBe('Head east on Arsenalstraße.');
    const i40a = said.findIndex((t) => t.startsWith('In 40 metres: crossing with traffic light'));
    const iNowA = said.findIndex((t) => t.startsWith('Crossing now: traffic light'));
    const iTurn = said.findIndex((t) => t.startsWith('In 30 metres, turn left onto Ghegastraße'));
    const iTurnNow = said.findIndex((t) => t === 'Turn left onto Ghegastraße now.');
    const iNowB = said.findIndex((t) => t.startsWith('Crossing now: zebra'));
    const iArrive = said.findIndex((t) => t.startsWith('You have arrived'));
    expect([i40a, iNowA, iTurn, iTurnNow, iNowB, iArrive].every((i) => i >= 0)).toBe(true);
    expect(i40a).toBeLessThan(iNowA);
    expect(iNowA).toBeLessThan(iTurn);
    expect(iTurn).toBeLessThan(iTurnNow);
    expect(iTurnNow).toBeLessThan(iNowB);
    expect(iNowB).toBeLessThan(iArrive);
    expect(new Set(said).size).toBe(said.length); // nothing repeated
  });

  it('works with big GPS steps (20 m): still announces every crossing', () => {
    const said = walk(20);
    expect(said.filter((t) => t.startsWith('Crossing now')).length).toBe(2);
    expect(said.some((t) => t.startsWith('You have arrived'))).toBe(true);
  });

  it('uses crossing priority for crossing alerts and navigation for turns', () => {
    let state = createGuideState(route, 'blind');
    state = updateGuidance(state, at(0)).state;
    const r = updateGuidance(state, at(62));
    expect(r.say[0]).toMatchObject({ priority: 'crossing' });
  });

  it('reports the next event and its distance', () => {
    const state = createGuideState(route, 'blind');
    const r = updateGuidance(state, at(50));
    expect(r.next.event.kind).toBe('crossing');
    expect(r.next.distance).toBeCloseTo(50, 0);
    expect(r.remaining).toBeCloseTo(len - 50, 0);
  });

  it('starting in the middle skips events already behind', () => {
    const state = createGuideState(route, 'blind');
    const r = updateGuidance(state, at(150));
    expect(texts(r).some((t) => t.includes('traffic light'))).toBe(false);
  });
});

describe('off route', () => {
  it('warns once when more than 35 m away, and again only after coming back', () => {
    let state = createGuideState(route, 'blind');
    state = updateGuidance(state, at(0)).state;
    const off = [at(80)[0], at(80)[1] + 0.0005]; // ~55 m north
    let r = updateGuidance(state, off);
    expect(r.offRoute).toBe(true);
    expect(texts(r)).toContain('You seem to be off the route. Stop and check your surroundings.');
    r = updateGuidance(r.state, off);
    expect(texts(r)).toEqual([]);
    r = updateGuidance(r.state, at(85));
    expect(r.offRoute).toBe(false);
    expect(texts(r)).toContain('Back on the route.');
  });
  it('does not warn when GPS accuracy is too poor to tell', () => {
    let state = createGuideState(route, 'blind');
    const r = updateGuidance(state, [at(80)[0], at(80)[1] + 0.0005], { accuracy: 80 });
    expect(r.offRoute).toBe(false);
  });
});

describe('not too chatty at complex intersections', () => {
  const line = [];
  for (let i = 0; i <= 40; i++) line.push([A[0] + i * 0.000135, A[1]]);
  const cum = cumulativeDistances(line);
  const idx = (m) => cum.findIndex((d) => d >= m);
  const busy = {
    geometry: line,
    steps: [
      { instruction: 'Head east', type: 11, from: 0, to: idx(100) },
      { instruction: 'Turn left', type: 0, from: idx(100), to: idx(110) },
      { instruction: 'Turn right', type: 1, from: idx(110), to: idx(200) },
      { instruction: 'Keep right', type: 13, from: idx(200), to: idx(300) },
      { instruction: 'Turn left onto Ghegastraße', type: 0, from: idx(300), to: 40 },
      { instruction: 'Arrive', type: 10, from: 40, to: 40 },
    ],
    crossings: [
      { id: 'a', kind: 'signals', sound: 'yes', along: 250 },
      { id: 'b', kind: 'signals', sound: 'yes', along: 280 },
    ],
  };

  it('merges turns less than 15 m apart into one instruction', () => {
    const turns = buildEvents(busy, 'blind').filter((e) => e.kind === 'turn');
    expect(turns[0].instruction).toBe('Turn left, then turn right');
  });

  function transcript(route) {
    let state = createGuideState(route, 'blind');
    const out = [];
    for (let m = 0; m <= lineLength(line) + 5; m += 2) {
      const r = updateGuidance(state, pointAlong(line, m));
      state = r.state;
      out.push(...texts(r));
    }
    return out;
  }

  it('minor turns (keep right) are only announced at the turn', () => {
    const said = transcript(busy);
    expect(said).toContain('Keep right now.');
    expect(said.some((t) => t.startsWith('In') && t.includes('keep right'))).toBe(false);
  });

  it('back-to-back crossings: the first alert mentions the next, no separate early warning', () => {
    const said = transcript(busy);
    const first = said.find((t) => t.startsWith('Crossing now') );
    expect(first).toMatch(/Then another crossing in 30 metres\.$/);
    expect(said.filter((t) => t.startsWith('In 40 metres: crossing')).length).toBe(1);
    expect(said.filter((t) => t.startsWith('Crossing now')).length).toBe(2);
  });

  it('a turn right after a crossing gets no early warning', () => {
    const said = transcript(busy);
    // turn at 300 m is 20 m after crossing b (280 m)
    expect(said.some((t) => t.startsWith('In') && t.includes('Ghegastraße'))).toBe(false);
    expect(said).toContain('Turn left onto Ghegastraße now.');
  });
});

describe('on a real route (HOIV → Hauptbahnhof)', () => {
  it('announces all crossings of the recommended route while walking it', () => {
    const groups = decodeGroups(JSON.parse(readFileSync('public/data/crossings-vienna.json', 'utf8')).rows);
    const r = normalizeOrsRoutes(JSON.parse(readFileSync('test/fixtures/ors-hoiv-hbf-foot.json', 'utf8')))[1];
    r.crossings = crossingsOnRoute(groups, r.geometry);
    let state = createGuideState(r, 'blind');
    const said = [];
    const total = lineLength(r.geometry);
    for (let m = 0; m <= total + 5; m += 1.3 * 2) { // 1.3 m/s, one fix every 2 s
      const u = updateGuidance(state, pointAlong(r.geometry, m));
      state = u.state;
      said.push(...texts(u));
    }
    expect(said.filter((t) => t.startsWith('Crossing now')).length).toBe(r.crossings.length);
    expect(said.at(-1)).toMatch(/^You have arrived/);
  });
});
