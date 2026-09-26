// Door-to-door trips on REAL data: saved Transitous answers + the Vienna crossing snapshot.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizePlan, choosePatterns } from '../../public/lib/transit.js';
import { decodeGroups, crossingsOnRoute } from '../../public/lib/crossings.js';
import {
  walkRequests, needsOwnRoute, buildTrip, firstReachable, clock, relative, tripTitle, tripName,
  crossingsPhrase, walkLegText, rideLegText, departureText, tripSteps, tripCardText, orderPlan,
  planSummary, legKey, WALK_FIRST_MAX_S,
} from '../../public/lib/trip.js';

const groups = decodeGroups(JSON.parse(readFileSync('public/data/crossings-vienna.json', 'utf8')).rows);
const plan = (name) => normalizePlan(JSON.parse(readFileSync(`test/fixtures/transit-${name}.json`, 'utf8')));
const MON_0900 = Date.parse('2026-09-28T07:00:00Z');

const SOUND = { kind: 'signals', sound: 'yes', kerb: 'lowered' };
const LIGHTS = { kind: 'signals', sound: null, kerb: null };
const ZEBRA = { kind: 'zebra', sound: null, kerb: 'raised' };

describe('walkRequests', () => {
  it('asks ORS for each real walking leg once, not for tiny walks', () => {
    const [a] = choosePatterns(plan('hoiv-stephansplatz'));
    const reqs = walkRequests(a.options);
    const legs = a.options.flatMap((o) => o.legs).filter(needsOwnRoute);
    expect(reqs.length).toBe(new Set(legs.map(legKey)).size);
    for (const r of reqs) expect(r.from).toHaveLength(2);
  });
});

describe('buildTrip: HOIV → Hauptbahnhof by 69A (planner paths + real crossings)', () => {
  const [pattern] = choosePatterns(plan('hoiv-hbf'));
  const trip = buildTrip(pattern.options[0], { groups, mode: 'blind' });

  it('keeps the rides and gives every walking leg a route with crossings', () => {
    expect(trip.legs.filter((l) => l.kind === 'ride').length).toBeGreaterThan(0);
    for (const l of trip.legs.filter((x) => x.kind === 'walk')) {
      expect(l.route.geometry.length).toBeGreaterThan(1);
      expect(Array.isArray(l.route.crossings)).toBe(true);
      expect(l.route.score).toBeDefined();
    }
  });

  it('times: leave before the first departure, arrive after the last ride', () => {
    const rides = trip.legs.filter((l) => l.kind === 'ride');
    expect(trip.leave).toBeLessThanOrEqual(rides[0].departure);
    expect(trip.arrive).toBeGreaterThanOrEqual(rides.at(-1).arrival);
    expect(trip.duration).toBe(Math.round((trip.arrive - trip.leave) / 1000));
  });

  it('the trip score counts the crossings of all walking legs', () => {
    expect(trip.score.count).toBe(trip.crossings.length);
    expect(trip.geometry.length).toBeGreaterThan(10);
  });
});

describe('buildTrip uses OUR safest walking route for a leg', () => {
  const [pattern] = choosePatterns(plan('hoiv-hbf'));
  const option = pattern.options[0];
  const lastWalk = option.legs.at(-1);
  const line = lastWalk.geometry;
  const unsafe = { id: 'r1', duration: 400, distance: 500, geometry: line, steps: [], crossings: [{ ...ZEBRA, kind: 'unmarked' }] };
  const safe = { id: 'r2', duration: 460, distance: 560, geometry: line, steps: [], crossings: [SOUND] };

  it('picks the safer alternative, and its duration moves the arrival', () => {
    const trip = buildTrip(option, { routesFor: (k) => (k === legKey(lastWalk) ? [unsafe, safe] : null), groups, mode: 'blind' });
    const walk = trip.legs.at(-1);
    expect(walk.route.id).toBe('r2');
    expect(walk.route.source).toBe('ors');
    expect(trip.arrive).toBe(trip.legs.filter((l) => l.kind === 'ride').at(-1).arrival + 460e3);
  });

  it('flags a change as tight when our walk takes longer than the time between the rides', () => {
    const [p] = choosePatterns(plan('hoiv-stephansplatz'));
    const withChange = p.options.find((o) => o.legs.filter((l) => l.kind === 'ride').length > 1)
      || plan('hoiv-stephansplatz').find((o) => o.transfers > 0);
    const i = withChange.legs.findIndex((l, j) => l.kind === 'walk' && j > 0 && j < withChange.legs.length - 1);
    const slow = { id: 's', duration: 3600, distance: 300, geometry: withChange.legs[i].geometry, steps: [], crossings: [] };
    const trip = buildTrip(withChange, { routesFor: () => [slow], groups, mode: 'blind' });
    expect(trip.tight).toBe(true);
    expect(trip.legs[i].tight).toBe(true);
  });
});

describe('platform on the correct side: the walk ends at the platform of our line and direction', () => {
  it('HOIV → Hbf walks to the 69A platform towards Hauptbahnhof', () => {
    const [p] = choosePatterns(plan('hoiv-hbf'));
    const trip = buildTrip(p.options[0], { groups });
    const i = trip.legs.findIndex((l) => l.kind === 'ride');
    const walk = trip.legs[i - 1];
    const ride = trip.legs[i];
    expect(walk.to.stopId).toBe(ride.from.stopId);
    expect(walk.route.geometry.at(-1)[0]).toBeCloseTo(ride.from.lon, 3);
    expect(walk.route.geometry.at(-1)[1]).toBeCloseTo(ride.from.lat, 3);
  });
});

describe('firstReachable', () => {
  it('skips departures the user cannot make any more', () => {
    const trips = [{ leave: 1000e3 }, { leave: 1600e3 }, { leave: 2200e3 }];
    expect(firstReachable(trips, 1200e3).leave).toBe(1600e3);
    expect(firstReachable(trips, 1015e3).leave).toBe(1000e3); // 15 s late is still fine
    expect(firstReachable(trips, 9999e3).leave).toBe(2200e3);
  });
});

describe('wording', () => {
  it('clock is Vienna time', () => {
    expect(clock(MON_0900)).toBe('09:00');
    expect(relative(MON_0900 + 4 * 60e3, MON_0900)).toBe('in 4 minutes');
    expect(relative(MON_0900 - 60e3, MON_0900)).toBe('1 minute ago');
    expect(relative(MON_0900 + 10e3, MON_0900)).toBe('now');
  });

  it('crossingsPhrase', () => {
    expect(crossingsPhrase([], 'blind')).toBe('No road crossings.');
    expect(crossingsPhrase([SOUND, SOUND], 'blind')).toBe('2 crossings, both with acoustic signals.');
    expect(crossingsPhrase([SOUND, SOUND, SOUND], 'blind')).toBe('3 crossings, all with acoustic signals.');
    expect(crossingsPhrase([SOUND], 'blind')).toBe('1 crossing: traffic light with acoustic signal.');
    expect(crossingsPhrase([SOUND, LIGHTS], 'blind')).toBe('2 crossings, both with lights, 1 with an acoustic signal.');
    expect(crossingsPhrase([SOUND, ZEBRA, LIGHTS], 'blind')).toBe('3 crossings: 1 with lights and an acoustic signal, 1 with lights only, 1 zebra crossing.');
    expect(crossingsPhrase([SOUND, ZEBRA, LIGHTS], 'wheelchair')).toMatch(/1 crossing with a raised kerb; kerb height unknown at 1\.$/);
  });

  it('the example from the brief', () => {
    const walk = { kind: 'walk', to: { name: 'Quartier Belvedere', track: '', level: 0 }, route: { duration: 240, crossings: [SOUND, SOUND] } };
    expect(walkLegText(walk, 'blind')).toBe('Walk 4 minutes to Quartier Belvedere. 2 crossings, both with acoustic signals.');
    const ride = { kind: 'ride', vehicle: 'tram', line: 'D', headsign: 'Nußdorf', stops: 5, to: { name: 'Schwarzenbergplatz' }, wheelchair: 'yes' };
    expect(rideLegText(ride)).toBe('Take tram D towards Nußdorf. 5 stops. Get off at Schwarzenbergplatz.');
    expect(rideLegText(ride, 'wheelchair')).toMatch(/marks it wheelchair accessible/);
    expect(rideLegText({ ...ride, wheelchair: 'unknown' }, 'wheelchair')).toMatch(/Wheelchair access unknown/);
    expect(walkLegText({ ...walk, to: { name: '', level: 0 } }, 'blind')).toMatch(/^Walk 4 minutes to your destination\./);
  });

  it('departure: line, direction, time, platform', () => {
    const ride = { vehicle: 'U-Bahn', line: 'U1', headsign: 'Leopoldau', departure: MON_0900 + 5 * 60e3, from: { track: '1' } };
    expect(departureText(ride, MON_0900)).toBe('U1 towards Leopoldau leaves at 09:05, in 5 minutes, from platform 1. By the timetable.');
    expect(departureText(ride, MON_0900 + 7 * 60e3)).toMatch(/was due at 09:05, 2 minutes ago/);
  });

  it('real trip: title, name, steps, card text', () => {
    const [p] = choosePatterns(plan('hoiv-karlsplatz-wheelchair'), { mode: 'wheelchair' });
    const trip = buildTrip(p.options[0], { groups, mode: 'wheelchair' });
    expect(tripTitle(trip)).toBe('Bus 69A + U1');
    expect(tripName(trip)).toBe('bus 69A and U1');
    const steps = tripSteps(trip, 'wheelchair');
    expect(steps).toHaveLength(trip.legs.length);
    expect(steps[1]).toMatch(/^Take bus 69A towards Hauptbahnhof\. 7 stops\. Get off at Hauptbahnhof\./);
    expect(steps[2]).toMatch(/platform 1\. The platform is underground\./);
    const text = tripCardText(trip, 'wheelchair', trip.leave - 120e3);
    expect(text).toMatch(/^Bus 69A and U1: \d+ minutes, leave at \d\d:\d\d, in 2 minutes, arrive at \d\d:\d\d\./);
  });
});

describe('orderPlan + planSummary', () => {
  const walk = (min) => ({ kind: 'walk', duration: min * 60 });
  const trip = (id, min, arrive) => ({ id, duration: min * 60, arrive, leave: arrive - min * 60e3, legs: [{ kind: 'ride', vehicle: 'bus', line: id }], score: { count: 0, worst: Infinity } });

  it('short walk: walking first', () => {
    const r = orderPlan(walk(12), [trip('69A', 10, 5)]);
    expect(r.transitFirst).toBe(false);
    expect(r.items[0].kind).toBe('walk');
  });

  it('walk over 20 min and a faster trip: transit first, sorted by arrival', () => {
    const r = orderPlan(walk(WALK_FIRST_MAX_S / 60 + 10), [trip('B', 20, 2000e3), trip('A', 15, 1000e3)]);
    expect(r.transitFirst).toBe(true);
    expect(r.items.map((x) => x.id || x.kind)).toEqual(['A', 'B', 'walk']);
  });

  it('long walk but transit is even slower: walking stays first', () => {
    expect(orderPlan(walk(25), [trip('X', 40, 5)]).transitFirst).toBe(false);
  });

  it('summary says why transit comes first', () => {
    const now = 0;
    const text = planSummary({ walkBest: walk(50), walkSummary: 'W.', trips: [trip('13A', 20, 20 * 60e3)], transitFirst: true, now });
    expect(text).toMatch(/^Walking takes 50 minutes, so public transport comes first\. Best: Bus 13A, 20 minutes, leave now, \d\d:\d\d\. No road crossings on foot\.$/);
    expect(planSummary({ walkBest: walk(8), walkSummary: 'The safest walk.', trips: [trip('13A', 9, 9 * 60e3)], transitFirst: false, now }))
      .toMatch(/^Walking: the safest walk\. By public transport: Bus 13A/);
    const scored = { ...walk(50), score: { count: 2, worst: 3 } };
    expect(planSummary({ walkBest: scored, walkSummary: 'W.', trips: [trip('13A', 20, 20 * 60e3)], transitFirst: true, now }))
      .toMatch(/On foot: 50 minutes, 2 crossings, all with lights and an acoustic signal\.$/);
    expect(planSummary({ walkBest: walk(8), walkSummary: 'W.', trips: [], transitFirst: false, now, note: 'No transit.' })).toBe('W. No transit.');
  });
});

describe('real-data check: HOIV → Schönbrunn', () => {
  it('two different trips, every walking leg scored with real crossings', () => {
    const now = MON_0900;
    const trips = choosePatterns(plan('hoiv-schoenbrunn')).map((p) => firstReachable(p.options.map((o) => buildTrip(o, { groups })), now));
    expect(trips).toHaveLength(2);
    for (const t of trips) {
      const onRoute = t.legs.filter((l) => l.kind === 'walk').flatMap((l) => crossingsOnRoute(groups, l.route.geometry));
      expect(t.score.count).toBe(onRoute.length);
    }
  });
});

describe('compareTrips: safest crossings first, if it costs at most 10 minutes', () => {
  const t = (id, arriveMin, worst, risky = 0) => ({ id, arrive: arriveMin * 60e3, duration: 600, leave: 0, legs: [{ kind: 'ride', vehicle: 'bus', line: id }], score: { worst, risky, count: 1 } });
  it('a safer trip arriving 6 min later comes first, and the summary says why', async () => {
    const { compareTrips } = await import('../../public/lib/trip.js');
    const fast = t('D', 29, 1); // a zebra crossing on foot
    const safe = t('69A', 35, 2); // all with lights
    expect([fast, safe].sort(compareTrips)[0].id).toBe('69A');
    const text = planSummary({ walkBest: { duration: 1620 }, walkSummary: '', trips: [fast, safe], transitFirst: true, now: 0 });
    expect(text).toMatch(/Best: Bus 69A.*It arrives 6 minutes later than bus D, but its crossings are safer\. Second option: Bus D/);
  });
  it('more than 10 min later: the earlier trip wins', async () => {
    const { compareTrips } = await import('../../public/lib/trip.js');
    expect([t('D', 29, 1), t('69A', 45, 3)].sort(compareTrips)[0].id).toBe('D');
  });
});
