// Riding: boarding, stop counting by GPS and by timetable, on the REAL 69A leg (HOIV → Hauptbahnhof).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizePlan } from '../../public/lib/transit.js';
import { pointAlong } from '../../public/lib/geo.js';
import { createRideState, updateRide, rideStatusText, BOARD_PROGRESS_M, ASSUME_BOARDED_MS } from '../../public/lib/ride.js';

const leg = normalizePlan(JSON.parse(readFileSync('test/fixtures/transit-hoiv-hbf.json', 'utf8')))
  .flatMap((o) => o.legs).find((l) => l.kind === 'ride' && l.line === '69A');
const texts = (r) => r.say.map((m) => m.text);

/** Feeds a list of ticks, returns everything said. */
function run(ticks) {
  let s = createRideState(leg);
  const said = [];
  let last;
  for (const t of ticks) {
    last = updateRide(s, t);
    s = last.state;
    said.push(...last.say);
  }
  return { said, last, state: s };
}

describe('the real 69A leg', () => {
  it('has stops with positions along the line, in order', () => {
    const s = createRideState(leg);
    expect(s.stops.length).toBe(leg.stops);
    const along = s.stops.map((x) => x.along);
    expect(along).toEqual([...along].sort((a, b) => a - b));
    expect(s.stops.at(-1).name).toBe(leg.to.name);
  });
});

describe('waiting at the stop', () => {
  it('says the bus is due about a minute before it leaves', () => {
    const r = updateRide(createRideState(leg), { now: leg.departure - 50e3 });
    expect(texts(r)[0]).toBe('Bus 69A towards Hauptbahnhof is due in about 1 minute, by the timetable.');
    expect(r.state.phase).toBe('waiting');
  });

  it('boards when the user taps "on board"', () => {
    const r = updateRide(createRideState(leg), { now: leg.departure + 20e3, boarded: true });
    expect(r.state.phase).toBe('riding');
    expect(texts(r)[0]).toMatch(new RegExp(`^On bus 69A towards Hauptbahnhof\\. ${leg.stops} stops\\. Get off at ${leg.to.name}\\.`));
  });

  it('boards by GPS when the phone moves along the bus line', () => {
    const pos = pointAlong(leg.geometry, BOARD_PROGRESS_M + 20);
    const r = updateRide(createRideState(leg), { now: leg.departure + 60e3, position: pos, accuracy: 10 });
    expect(r.state.phase).toBe('riding');
    expect(r.approx).toBe(false);
  });

  it('without GPS it assumes boarding 3 minutes after departure — and says the count is approximate', () => {
    const r = updateRide(createRideState(leg), { now: leg.departure + ASSUME_BOARDED_MS + 1000 });
    expect(r.state.phase).toBe('riding');
    expect(texts(r)[0]).toMatch(/I think you are on board now, but I have no GPS here.*approximate/);
  });
});

describe('counting stops', () => {
  it('by GPS: announces stops, then "your stop is next", then "get off now"', () => {
    const s0 = createRideState(leg);
    const ticks = [{ now: leg.departure, boarded: true, position: leg.geometry[0], accuracy: 10 }];
    const total = s0.stops.at(-1).along;
    for (let m = 50; m <= total + 10; m += 25) ticks.push({ now: leg.departure + m * 100, position: pointAlong(leg.geometry, m), accuracy: 10 });
    const { said, state } = run(ticks);
    const all = said.map((m) => m.text);
    expect(all.filter((t) => /stops? to go/.test(t)).length).toBe(leg.stops - 2);
    expect(all).toContain(`Your stop is next: ${leg.to.name}. Get ready to get off.`);
    expect(all.at(-1)).toBe(`Get off now: ${leg.to.name}.`);
    expect(state.phase).toBe('arrived');
    expect(all.join(' ')).not.toMatch(/approximately/);
  });

  it('by timetable (no GPS underground): same order, every count marked approximate', () => {
    const s0 = createRideState(leg);
    const ticks = [{ now: leg.departure, boarded: true }];
    for (let t = leg.departure; t <= leg.arrival + 30e3; t += 15e3) ticks.push({ now: t });
    const { said, state } = run(ticks);
    const all = said.map((m) => m.text);
    expect(all[0]).toMatch(/No GPS here: I count the stops by the timetable/);
    expect(all.find((t) => t.startsWith('Your stop is next'))).toMatch(/By the timetable, so approximately\.$/);
    expect(all.at(-1)).toBe(`By the timetable you should be at ${leg.to.name} now. Get off when the doors open there.`);
    expect(state.passed).toBe(s0.stops.length);
  });

  it('a late bus shifts the timetable count (boarded 2 min after departure)', () => {
    const late = 120e3;
    let s = createRideState(leg);
    s = updateRide(s, { now: leg.departure + late, boarded: true }).state;
    // at the scheduled arrival time the late bus is not there yet
    const r = updateRide(s, { now: leg.arrival + 10e3 });
    expect(r.state.phase).toBe('riding');
    expect(updateRide(r.state, { now: leg.arrival + late + 1000 }).state.phase).toBe('arrived');
  });

  it('never counts backwards when GPS jumps', () => {
    let s = createRideState(leg);
    s = updateRide(s, { now: leg.departure, boarded: true }).state;
    const far = s.stops[2].along + 5;
    s = updateRide(s, { now: leg.departure + 60e3, position: pointAlong(leg.geometry, far), accuracy: 10 }).state;
    const passed = s.passed;
    s = updateRide(s, { now: leg.departure + 70e3, position: pointAlong(leg.geometry, 10), accuracy: 10 }).state;
    expect(s.passed).toBe(passed);
  });

  it('status text for the big display', () => {
    const s = createRideState(leg);
    const w = updateRide(s, { now: leg.departure - 180e3 });
    expect(rideStatusText(w, leg, leg.departure - 180e3)).toBe('Wait for bus 69A to Hauptbahnhof · in 3 min');
    const r = updateRide(s, { now: leg.departure, boarded: true });
    expect(rideStatusText(r, leg, leg.departure)).toMatch(/^\d+ stops to go · next: /);
  });
});
