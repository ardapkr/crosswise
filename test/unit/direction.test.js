// Find my bus with a trip: the right line AND the right direction (destination display).
import { describe, it, expect } from 'vitest';
import { placeTokens, directionMatch, spokenResult, normalizeResult } from '../../public/lib/look.js';
import { createScan, markSent, onResult } from '../../public/lib/scan.js';

const TO_HBF = { headsign: 'Hauptbahnhof', origin: 'Alser Straße' };      // 13A towards Hauptbahnhof
const TO_NUSSDORF = { headsign: 'Nußdorf, Beethovengang', origin: 'Absberggasse' };

describe('placeTokens / directionMatch', () => {
  it('normalises umlauts, ß, case and generic words', () => {
    expect(placeTokens('Nußdorf, Beethovengang')).toEqual(['nussdorf', 'beethovengang']);
    expect(placeTokens('NUSSDORF')).toEqual(['nussdorf']);
    expect(placeTokens('Alser Straße')).toEqual(['alser']);
    expect(placeTokens('Wien Hbf')).toEqual(['hauptbahnhof']);
  });

  it('display text vs trip direction', () => {
    expect(directionMatch('Hauptbahnhof', TO_HBF)).toBe('match');
    expect(directionMatch('HAUPTBAHNHOF', TO_HBF)).toBe('match');
    expect(directionMatch('Hbf', TO_HBF)).toBe('match');
    expect(directionMatch('Alser Str.', TO_HBF)).toBe('wrong');
    expect(directionMatch('Nussdorf', TO_NUSSDORF)).toBe('match');
    expect(directionMatch('Beethovengang', TO_NUSSDORF)).toBe('match');
    expect(directionMatch('Absberggasse', TO_NUSSDORF)).toBe('wrong');
    expect(directionMatch('Mariahilfer Straße', TO_HBF)).toBe('other'); // "Straße" alone must not match
    expect(directionMatch('', TO_HBF)).toBe('unknown');
  });
});

describe('spokenResult with a direction', () => {
  const bus = (line, destination) => normalizeResult('bus', { status: 'found', line, destination, vehicle: 'bus', confidence: 0.9 });
  const opts = { targetLine: '13A', targetDirection: TO_HBF };

  it('the brief\'s sentences', () => {
    expect(spokenResult('bus', bus('13A', 'Hauptbahnhof'), opts)).toBe('This is 13A towards Hauptbahnhof, your bus.');
    expect(spokenResult('bus', bus('13A', 'Alser Straße'), opts)).toBe('13A, but the wrong direction: it goes to Alser Straße. Your bus goes towards Hauptbahnhof.');
  });
  it('unreadable or unexpected destination: honest, asks to check with the driver', () => {
    expect(spokenResult('bus', bus('13A', ''), opts)).toMatch(/^This is 13A, but I could not read the direction\. Your bus goes towards Hauptbahnhof: ask the driver/);
    expect(spokenResult('bus', bus('13A', 'Kliebergasse'), opts)).toMatch(/^This is 13A to Kliebergasse\. Your bus goes towards Hauptbahnhof: ask the driver/);
  });
  it('another line is still "not your bus"; without a direction nothing changes', () => {
    expect(spokenResult('bus', bus('26A', 'Hauptbahnhof'), opts)).toBe('This is 26A, not your bus.');
    expect(spokenResult('bus', bus('13A', 'Hauptbahnhof'), { targetLine: '13A' })).toBe('This is your bus, 13A, to Hauptbahnhof.');
  });
});

describe('scan with a direction', () => {
  const frame = (line, destination = '') => ({ status: 'found', line, destination, vehicle: 'bus', confidence: 0.9 });
  function feed(scan, results) {
    let s = scan;
    const events = [];
    let t = 0;
    for (const r of results) {
      s = markSent(s, t);
      let ev;
      [s, ev] = onResult(s, r, t);
      events.push(...ev);
      t += 1200;
    }
    return { s, events };
  }

  it('right line, right direction → found', () => {
    const { events, s } = feed(createScan({ targetLine: '13A', targetDirection: TO_HBF, now: 0 }), [frame('13A', 'Hauptbahnhof'), frame('13A', '')]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'found', direction: 'match' });
    expect(events[0].result.destination).toBe('Hauptbahnhof'); // kept from the frame that could read it
    expect(s.done).toBe(true);
  });

  it('right line, wrong direction → says so and keeps scanning', () => {
    const { events, s } = feed(createScan({ targetLine: '13A', targetDirection: TO_HBF, now: 0 }), [frame('13A', 'Alser Straße'), frame('13A', 'Alser Straße'), frame('13A', 'Alser Straße')]);
    expect(events).toHaveLength(1); // not repeated within 15 s
    expect(events[0]).toMatchObject({ type: 'wrong', direction: 'wrong' });
    expect(s.done).toBe(false);
  });

  it('direction unreadable → waits 2 more frames, then announces honestly', () => {
    const scan = createScan({ targetLine: '13A', targetDirection: TO_HBF, now: 0 });
    expect(feed(scan, [frame('13A'), frame('13A'), frame('13A')]).events).toHaveLength(0);
    const { events } = feed(scan, [frame('13A'), frame('13A'), frame('13A'), frame('13A')]);
    expect(events[0]).toMatchObject({ type: 'found', direction: 'unknown' });
  });

  it('a readable destination in a later frame still decides', () => {
    const { events } = feed(createScan({ targetLine: '13A', targetDirection: TO_HBF, now: 0 }), [frame('13A'), frame('13A'), frame('13A', 'Hauptbahnhof')]);
    expect(events[0]).toMatchObject({ type: 'found', direction: 'match' });
  });
});
