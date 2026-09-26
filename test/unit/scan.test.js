import { describe, it, expect } from 'vitest';
import { SCAN, createScan, shouldSend, markSent, onResult, onError, onTick } from '../../public/lib/scan.js';

const found = (line, destination = '') => ({ status: 'found', line, destination, vehicle: 'bus', confidence: 0.9 });
const none = { status: 'not_visible', line: '', destination: '', vehicle: 'unknown', confidence: 0 };
const unreadable = { status: 'unreadable', line: '', destination: '', vehicle: 'unknown', confidence: 0.3 };

/** Sends one frame at `t` and gets `result` back at `t + latency`. Returns [state, events]. */
function frame(state, t, result, latency = 500) {
  expect(shouldSend(state, t)).toBe(true);
  state = markSent(state, t);
  expect(shouldSend(state, t + 100)).toBe(false); // one request in flight
  return onResult(state, result, t + latency);
}

describe('pacing', () => {
  it('sends at most one frame per 1.2 s and only one request at a time', () => {
    let s = createScan({ now: 0 });
    expect(shouldSend(s, 0)).toBe(true);
    s = markSent(s, 0);
    expect(shouldSend(s, 2000)).toBe(false);      // still waiting for the answer
    s = onResult(s, none, 400)[0];
    expect(shouldSend(s, 1000)).toBe(false);      // too early
    expect(shouldSend(s, SCAN.intervalMs)).toBe(true);
  });
  it('an error frees the slot', () => {
    let s = markSent(createScan({ now: 0 }), 0);
    s = onError(s, 800);
    expect(shouldSend(s, 1300)).toBe(true);
  });
});

describe('agreement: announce only when 2 consecutive frames agree', () => {
  it('one frame is not enough', () => {
    const [, ev] = frame(createScan({ now: 0 }), 0, found('13A'));
    expect(ev).toEqual([]);
  });
  it('two consecutive matching frames → found, scan done (no target line)', () => {
    let [s] = frame(createScan({ now: 0 }), 0, found('13A'));
    let ev;
    [s, ev] = frame(s, 1200, found('13A', 'Hauptbahnhof'));
    expect(ev).toEqual([{ type: 'found', line: '13A', result: found('13A', 'Hauptbahnhof'), isTarget: null }]);
    expect(s.done).toBe(true);
    expect(shouldSend(s, 5000)).toBe(false);
  });
  it('a different line or a miss in between resets the streak', () => {
    let s = createScan({ now: 0 });
    let ev;
    [s] = frame(s, 0, found('13A'));
    [s, ev] = frame(s, 1200, found('18A'));
    expect(ev).toEqual([]);
    [s, ev] = frame(s, 2400, unreadable);
    expect(ev).toEqual([]);
    [s, ev] = frame(s, 3600, found('18A'));
    expect(ev).toEqual([]);
    [s, ev] = frame(s, 4800, found('18A'));
    expect(ev[0]).toMatchObject({ type: 'found', line: '18A' });
  });
});

describe('with a target line', () => {
  it('"not your bus" keeps scanning; the right bus ends the scan', () => {
    let s = createScan({ targetLine: '13a', now: 0 });
    let ev;
    [s] = frame(s, 0, found('26A'));
    [s, ev] = frame(s, 1200, found('26A'));
    expect(ev).toEqual([{ type: 'wrong', line: '26A', result: found('26A'), isTarget: false }]);
    expect(s.done).toBe(false);
    [s] = frame(s, 2400, found('13A'));
    [s, ev] = frame(s, 3600, found('13A'));
    expect(ev[0]).toMatchObject({ type: 'found', line: '13A', isTarget: true });
    expect(s.done).toBe(true);
  });
  it('does not repeat the same wrong bus within 15 s', () => {
    let s = createScan({ targetLine: '13A', now: 0 });
    let ev;
    const all = [];
    for (let t = 0; t < 12000; t += 1200) {
      [s, ev] = frame(s, t, found('26A'));
      all.push(...ev);
    }
    expect(all.filter((e) => e.type === 'wrong')).toHaveLength(1);
  });
});

describe('ticks: "still looking" and timeout', () => {
  it('says "still looking" about every 10 s', () => {
    let s = createScan({ now: 0 });
    const events = [];
    for (let t = 0; t <= 25000; t += 500) {
      const [s2, ev] = onTick(s, t);
      s = s2;
      events.push(...ev.map((e) => ({ ...e, t })));
    }
    expect(events.map((e) => e.type)).toEqual(['still_looking', 'still_looking']);
    expect(events[0].t).toBe(10000);
    expect(events[1].t).toBe(20000);
  });
  it('an announcement resets the "still looking" timer', () => {
    let s = createScan({ targetLine: '13A', now: 0 });
    [s] = frame(s, 7000, found('26A'));
    [s] = frame(s, 8200, found('26A'), 300); // "not your bus" at 8.5 s
    expect(onTick(s, 10000)[1]).toEqual([]);
    expect(onTick(s, 18500)[1][0].type).toBe('still_looking');
  });
  it('gives up after 60 s', () => {
    let s = createScan({ now: 0 });
    let ev;
    [s, ev] = onTick(s, SCAN.timeoutMs);
    expect(ev.map((e) => e.type)).toEqual(['timeout']);
    expect(s.done).toBe(true);
    expect(onTick(s, SCAN.timeoutMs + 20000)[1]).toEqual([]);
  });
  it('results arriving after the scan ended are ignored', () => {
    let s = markSent(createScan({ now: 0 }), 0);
    [s] = onTick(s, SCAN.timeoutMs);
    expect(onResult(s, found('13A'), SCAN.timeoutMs + 100)[1]).toEqual([]);
  });
});
