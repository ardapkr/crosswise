import { describe, it, expect } from 'vitest';
import { PRIORITY, decide, enqueue, nextMessage } from '../../public/lib/speech-queue.js';

const msg = (text, priority) => ({ text, priority: PRIORITY[priority] });

describe('speech priority', () => {
  it('orders danger > crossing > navigation > info', () => {
    expect(PRIORITY.danger).toBeGreaterThan(PRIORITY.crossing);
    expect(PRIORITY.crossing).toBeGreaterThan(PRIORITY.navigation);
    expect(PRIORITY.navigation).toBeGreaterThan(PRIORITY.info);
  });

  it('speaks immediately when nothing is playing', () => {
    expect(decide(null, msg('hi', 'info'))).toBe('speak');
  });

  it('interrupts a less important message', () => {
    expect(decide(msg('turn left', 'navigation'), msg('crossing ahead', 'crossing'))).toBe('interrupt');
  });

  it('never talks over a more important message: it waits', () => {
    expect(decide(msg('crossing ahead', 'crossing'), msg('turn left', 'navigation'))).toBe('queue');
    expect(decide(msg('danger', 'danger'), msg('b', 'info'))).toBe('queue');
  });

  it('safety messages of equal priority are never cut off: they queue', () => {
    expect(decide(msg('crossing 1', 'crossing'), msg('crossing 2', 'crossing'))).toBe('queue');
    expect(decide(msg('turn left', 'navigation'), msg('turn right', 'navigation'))).toBe('queue');
  });

  it('a newer info message replaces an older info message (user tapped something new)', () => {
    expect(decide(msg('a', 'info'), msg('b', 'info'))).toBe('interrupt');
  });

  it('drops an exact duplicate of what is already playing', () => {
    expect(decide(msg('still looking', 'info'), msg('still looking', 'info'))).toBe('drop');
  });

  it('keeps the queue sorted by priority, oldest first within a priority', () => {
    let q = [];
    q = enqueue(q, msg('info 1', 'info'));
    q = enqueue(q, msg('nav 1', 'navigation'));
    q = enqueue(q, msg('info 2', 'info'));
    q = enqueue(q, msg('danger', 'danger'));
    expect(q.map((m) => m.text)).toEqual(['danger', 'nav 1', 'info 1', 'info 2']);
  });

  it('limits the queue and throws away the least important stale messages', () => {
    let q = [];
    for (let i = 0; i < 6; i++) q = enqueue(q, msg('info ' + i, 'info'));
    q = enqueue(q, msg('crossing', 'crossing'));
    expect(q.length).toBe(4);
    expect(q[0].text).toBe('crossing');
  });

  it('nextMessage takes the head and returns the rest', () => {
    const [head, rest] = nextMessage([msg('a', 'danger'), msg('b', 'info')]);
    expect(head.text).toBe('a');
    expect(rest.map((m) => m.text)).toEqual(['b']);
    expect(nextMessage([])).toEqual([null, []]);
  });
});

describe('busy moments (trip + crossings): nothing important is lost, nothing stale is said', () => {
  it('a "keep" message is never trimmed, even behind many crossing alerts', () => {
    let q = [];
    q = enqueue(q, { text: 'Get off now: Hauptbahnhof.', priority: PRIORITY.navigation, keep: true });
    for (let i = 0; i < 6; i++) q = enqueue(q, msg('crossing ' + i, 'crossing'));
    expect(q.map((m) => m.text)).toContain('Get off now: Hauptbahnhof.');
  });

  it('without keep, the least important is trimmed first', () => {
    let q = [];
    q = enqueue(q, msg('turn', 'navigation'));
    for (let i = 0; i < 4; i++) q = enqueue(q, msg('crossing ' + i, 'crossing'));
    expect(q.map((m) => m.text)).not.toContain('turn');
    expect(q).toHaveLength(4);
  });

  it('expired messages are skipped when their turn comes', () => {
    const q = [
      { text: 'In 40 metres: crossing.', priority: PRIORITY.crossing, expiresAt: 1000 },
      { text: 'You are at the stop.', priority: PRIORITY.navigation, keep: true },
    ];
    expect(nextMessage(q, 500)[0].text).toBe('In 40 metres: crossing.');
    const [head, rest] = nextMessage(q, 2000);
    expect(head.text).toBe('You are at the stop.');
    expect(rest).toEqual([]);
  });

  it('the same text is not queued twice', () => {
    let q = enqueue([], msg('crossing', 'crossing'));
    q = enqueue(q, msg('crossing', 'crossing'));
    expect(q).toHaveLength(1);
  });
});
