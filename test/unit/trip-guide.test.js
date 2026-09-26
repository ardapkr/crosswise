// A whole trip, simulated: walk to the 69A stop, ride, walk to Hauptbahnhof (REAL saved data).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizePlan, choosePatterns } from '../../public/lib/transit.js';
import { decodeGroups } from '../../public/lib/crossings.js';
import { buildTrip } from '../../public/lib/trip.js';
import { pointAlong, lineLength } from '../../public/lib/geo.js';
import { createTripGuide, updateTripGuide, legButtonText } from '../../public/lib/trip-guide.js';

const groups = decodeGroups(JSON.parse(readFileSync('public/data/crossings-vienna.json', 'utf8')).rows);
const [pattern] = choosePatterns(normalizePlan(JSON.parse(readFileSync('test/fixtures/transit-hoiv-hbf.json', 'utf8'))));
const trip = buildTrip(pattern.options[0], { groups, mode: 'blind' });
const ride = trip.legs.find((l) => l.kind === 'ride');

/** Simulates the trip: walking legs at 1.3 m/s, the ride along the bus line. */
function simulate({ gpsOnRide = true } = {}) {
  let s = createTripGuide(trip, 'blind');
  const said = [];
  const log = [];
  let now = trip.leave;
  const step = (input) => {
    const r = updateTripGuide(s, { now, ...input });
    s = r.state;
    said.push(...r.say);
    log.push(r);
    return r;
  };
  for (const leg of trip.legs) {
    if (leg.kind === 'walk') {
      const line = leg.route.geometry;
      const len = lineLength(line);
      for (let m = 0; m <= len + 20; m += 5) { now += 5 / 1.3 * 1000; step({ position: pointAlong(line, m), accuracy: 5 }); }
    } else {
      while (now < leg.departure) { now += 15e3; step({}); }
      step({ next: true }); // "I'm on board"
      const len = lineLength(leg.geometry);
      const dt = (leg.arrival - leg.departure) / (len / 20);
      for (let m = 0; m <= len + 20; m += 20) { now += dt; step(gpsOnRide ? { position: pointAlong(leg.geometry, m), accuracy: 10 } : {}); }
      for (let k = 0; k < 10 && s.index === trip.legs.indexOf(leg); k++) { now += 15e3; step({}); }
    }
  }
  return { said: said.map((m) => m.text), log, state: s };
}

describe('trip guidance: HOIV → Hauptbahnhof with the 69A', () => {
  it('the trip is walk → bus 69A → walk', () => {
    expect(trip.legs.map((l) => l.kind)).toEqual(['walk', 'ride', 'walk']);
  });

  it('announces each leg in order and arrives', () => {
    const { said, state } = simulate();
    const i = (re) => said.findIndex((t) => re.test(t));
    const walk1 = i(/^Walk \d+ minutes? to Hüttenbrennergasse/);
    const atStop = i(/^You are at the stop Hüttenbrennergasse\.$/);
    const depart = i(/^Bus 69A towards Hauptbahnhof (leaves|was due) at \d\d:\d\d.*By the timetable\. Tap Find bus: I check the line and the direction of arriving buses\.$/);
    const board = i(/^On bus 69A towards Hauptbahnhof\. \d stops\. Get off at/);
    const next = i(/^Your stop is next:/);
    const off = i(/^Get off now:/);
    const walk2 = i(/^Walk \d+ minutes? to your destination\./);
    const end = said.lastIndexOf('You have arrived at your destination.');
    expect([walk1, atStop, depart, board, next, off, walk2, end].every((x) => x >= 0)).toBe(true);
    expect(walk1).toBeLessThan(atStop);
    expect(atStop).toBeLessThan(depart);
    expect(depart).toBeLessThan(board);
    expect(board).toBeLessThan(next);
    expect(next).toBeLessThan(off);
    expect(off).toBeLessThan(walk2);
    expect(walk2).toBeLessThan(end);
    expect(state.done).toBe(true);
    expect(said.filter((t) => t === 'You have arrived at your destination.')).toHaveLength(1);
    expect(said.join(' ')).not.toMatch(/safe to cross/i);
  });

  it('crossing alerts work on the walking legs of the trip', () => {
    const crossings = trip.legs.filter((l) => l.kind === 'walk').reduce((n, l) => n + l.route.crossings.length, 0);
    const { said } = simulate();
    if (crossings > 0) expect(said.some((t) => t.startsWith('Crossing now'))).toBe(true);
  });

  it('Find my bus target: line + direction while walking to the stop and waiting; none while riding', () => {
    const { log } = simulate();
    const walking = log.find((r) => r.leg === 0 && r.target);
    expect(walking.target).toEqual({ line: '69A', headsign: 'Hauptbahnhof', origin: 'Simmering', vehicle: 'bus' });
    expect(legButtonText(walking)).toBe("I'm at the stop");
    const waiting = log.find((r) => r.phase === 'waiting');
    expect(waiting.target.line).toBe('69A');
    expect(legButtonText(waiting)).toBe("I'm on board");
    const riding = log.find((r) => r.phase === 'riding');
    expect(riding.target).toBe(null);
    expect(legButtonText(riding)).toBe(null);
  });

  it('without GPS on the bus it counts by the timetable and says so', () => {
    const { said, state } = simulate({ gpsOnRide: false });
    expect(said.some((t) => /count the stops by the timetable/.test(t))).toBe(true);
    expect(said.some((t) => /^By the timetable you should be at/.test(t))).toBe(true);
    expect(state.done).toBe(true);
  });

  it('"I\'m at the stop" skips the rest of the walk (no GPS in a station)', () => {
    let s = createTripGuide(trip, 'blind');
    s = updateTripGuide(s, { now: trip.leave }).state;
    const r = updateTripGuide(s, { now: trip.leave + 60e3, next: true });
    expect(r.state.index).toBe(1);
    expect(r.say[0].text).toBe('OK, at the stop Hüttenbrennergasse.');
    expect(r.say[1].text).toMatch(/^Bus 69A towards Hauptbahnhof/);
    expect(r.phase).toBe('waiting');
  });
});
