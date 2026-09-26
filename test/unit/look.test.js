import { describe, it, expect } from 'vitest';
import { parseModelJson, normalizeLine, normalizeResult, spokenResult, LOOK_MODES } from '../../public/lib/look.js';

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    expect(parseModelJson('{"status":"found","line":"13A"}')).toEqual({ status: 'found', line: '13A' });
  });
  it('strips ```json code fences and surrounding text', () => {
    expect(parseModelJson('```json\n{"status":"red"}\n```')).toEqual({ status: 'red' });
    expect(parseModelJson('Here you go:\n{"status":"red"}\nThanks')).toEqual({ status: 'red' });
  });
  it('returns null for garbage', () => {
    expect(parseModelJson('I cannot see a bus.')).toBe(null);
    expect(parseModelJson('')).toBe(null);
    expect(parseModelJson(null)).toBe(null);
    expect(parseModelJson('{broken')).toBe(null);
  });
});

describe('normalizeLine', () => {
  it('uppercases and removes spaces', () => {
    expect(normalizeLine(' 13 a ')).toBe('13A');
    expect(normalizeLine('n25')).toBe('N25');
    expect(normalizeLine('D')).toBe('D');
    expect(normalizeLine('')).toBe('');
    expect(normalizeLine(null)).toBe('');
  });
});

describe('normalizeResult', () => {
  it('knows the 4 modes', () => {
    expect(LOOK_MODES).toEqual(['bus', 'light', 'read', 'describe']);
  });
  it('bus: invalid input or parse failure → unreadable', () => {
    expect(normalizeResult('bus', null)).toMatchObject({ status: 'unreadable', line: '' });
    expect(normalizeResult('bus', { status: 'maybe' })).toMatchObject({ status: 'unreadable' });
  });
  it('bus: "found" without a line is not trusted', () => {
    expect(normalizeResult('bus', { status: 'found', line: '' })).toMatchObject({ status: 'unreadable' });
  });
  it('bus: normalizes the line and clamps confidence', () => {
    expect(normalizeResult('bus', { status: 'found', line: '13 a', destination: 'Hauptbahnhof', confidence: 3 }))
      .toEqual({ status: 'found', line: '13A', destination: 'Hauptbahnhof', vehicle: 'unknown', confidence: 1 });
  });
  it('bus: low confidence "found" is downgraded to unreadable (never guess a line)', () => {
    expect(normalizeResult('bus', { status: 'found', line: '13A', confidence: 0.4 }).status).toBe('unreadable');
  });
  it('light: unknown status → unclear', () => {
    expect(normalizeResult('light', { status: 'purple' }).status).toBe('unclear');
    expect(normalizeResult('light', null).status).toBe('unclear');
  });
  it('read and describe: missing fields become empty', () => {
    expect(normalizeResult('read', null)).toMatchObject({ status: 'unreadable', text: '' });
    expect(normalizeResult('describe', null)).toMatchObject({ description: '', hazards: [] });
  });
});

describe('spokenResult', () => {
  const bus = (line, destination = '') => normalizeResult('bus', { status: 'found', line, destination, confidence: 0.9 });

  it('bus with target: "This is your bus" / "not your bus"', () => {
    expect(spokenResult('bus', bus('13A', 'Hauptbahnhof'), { targetLine: '13a' })).toBe('This is your bus, 13A, to Hauptbahnhof.');
    expect(spokenResult('bus', bus('26A'), { targetLine: '13A' })).toBe('This is 26A, not your bus.');
  });
  it('bus without target', () => {
    expect(spokenResult('bus', bus('13A', 'Hauptbahnhof'))).toBe('Bus 13A to Hauptbahnhof.');
    expect(spokenResult('bus', normalizeResult('bus', { status: 'found', line: 'D', vehicle: 'tram', confidence: 0.9 }))).toBe('Tram D.');
  });
  it('bus not found / unreadable', () => {
    expect(spokenResult('bus', normalizeResult('bus', { status: 'not_visible' }))).toBe('No bus or tram in view.');
    expect(spokenResult('bus', normalizeResult('bus', { status: 'unreadable' }))).toBe('I see a vehicle but cannot read the number.');
  });

  it('light: describes what it sees and ALWAYS adds the traffic warning', () => {
    const say = (status) => spokenResult('light', normalizeResult('light', { status, confidence: 0.9 }));
    expect(say('green')).toBe('The pedestrian light looks green. Listen for traffic before crossing.');
    expect(say('red')).toBe('The pedestrian light looks red. Wait.');
    expect(say('flashing_green')).toBe('The pedestrian light looks green but flashing: it will turn red soon. Listen for traffic before crossing.');
    expect(say('not_visible')).toBe('I cannot see a pedestrian light. Point the camera at the light across the road.');
    expect(say('unclear')).toBe('I cannot tell the light colour. Listen for traffic before crossing.');
  });
  it('light: never says "safe to cross", whatever the model returns', () => {
    for (const status of ['green', 'red', 'flashing_green', 'dark', 'not_visible', 'unclear', 'safe to cross']) {
      const text = spokenResult('light', normalizeResult('light', { status, note: 'It is safe to cross now', confidence: 1 }));
      expect(text.toLowerCase()).not.toContain('safe');
    }
  });

  it('read: speaks the text, or says there is none', () => {
    expect(spokenResult('read', normalizeResult('read', { status: 'found', text: 'Bahnhof City Wien Hauptbahnhof', summary: 'Parking sign: Bahnhof City, Wien Hauptbahnhof' })))
      .toBe('Parking sign: Bahnhof City, Wien Hauptbahnhof');
    expect(spokenResult('read', normalizeResult('read', { status: 'no_text' }))).toBe('I cannot find any text.');
  });
  it('describe: description then hazards, max 3 sentences', () => {
    const text = spokenResult('describe', normalizeResult('describe', {
      description: 'A zebra crossing in front of you. Cars are parked on the left. A tram stop is on the right. There is a shop.',
      hazards: ['bicycle lane before the crossing'],
    }));
    expect(text).toBe('Careful: bicycle lane before the crossing. A zebra crossing in front of you. Cars are parked on the left.');
  });
});
