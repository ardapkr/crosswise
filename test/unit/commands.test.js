import { describe, it, expect } from 'vitest';
import { parseCommand, parseAlternatives, extractLine, HELP_TEXT } from '../../public/lib/commands.js';

const p = (t) => parseCommand(t);

describe('find my bus [line]', () => {
  it.each([
    ['find my bus', ''],
    ['Find my bus 13A', '13A'],
    ['find my bus 13 a', '13A'],
    ['find bus number 69 a please', '69A'],
    ['I need the 13A', '13A'],
    ['I need bus 26A', '26A'],
    ['where is my bus', ''],
    ['which bus is this', ''],
    ['find the night bus N25', 'N25'],
    ['find my tram D', 'D'],
    ['I need the D tram', 'D'],
    ['find tram 71', '71'],
    ['find my bus sixty nine a', '69A'],
    ['find bus thirteen a', '13A'],
  ])('%s → %s', (text, line) => {
    expect(p(text)).toEqual({ action: 'find_bus', line });
  });

  it('"a bus" is an article, not line A', () => {
    expect(p('find a bus')).toEqual({ action: 'find_bus', line: '' });
  });
});

describe('camera commands', () => {
  it.each([
    ['check the light', 'check_light'],
    ['is the light green', 'check_light'],
    ['is it green', 'check_light'],
    ['check traffic light', 'check_light'],
    ['read', 'read'],
    ['read this', 'read'],
    ['read the sign', 'read'],
    ['what does it say', 'read'],
    ['describe', 'describe'],
    ['describe my surroundings', 'describe'],
    ["what's in front of me", 'describe'],
    ['what do you see', 'describe'],
    ['look around', 'describe'],
  ])('%s → %s', (text, action) => {
    expect(p(text).action).toBe(action);
  });
});

describe('where am I', () => {
  it.each(['where am I', 'Where are we?', 'what street is this', 'my location', 'where is the nearest stop'])('%s', (t) => {
    expect(p(t).action).toBe('where_am_i');
  });
});

describe('take me to <place>', () => {
  it.each([
    ['take me to Hauptbahnhof', 'Hauptbahnhof'],
    ['Take me to the Belvedere please', 'the Belvedere'],
    ['navigate to Stephansplatz', 'Stephansplatz'],
    ['how do I get to Wien Mitte', 'Wien Mitte'],
    ['I want to go to Karlsplatz', 'Karlsplatz'],
    ['directions to Arsenalstraße 11', 'Arsenalstraße 11'],
    ['go to the wheelchair repair shop', 'the wheelchair repair shop'],
  ])('%s → %s', (text, place) => {
    expect(p(text)).toEqual({ action: 'navigate', place });
  });
});

describe('switch mode', () => {
  it.each([
    ['wheelchair mode', 'wheelchair'],
    ['switch to wheelchair', 'wheelchair'],
    ['blind mode', 'blind'],
    ['low vision mode', 'blind'],
    ['switch to limited mobility', 'limited'],
    ['limited mobility mode', 'limited'],
  ])('%s → %s', (text, mode) => {
    expect(p(text)).toEqual({ action: 'set_mode', mode });
  });
});

describe('control words', () => {
  it('stop / cancel', () => {
    expect(p('stop').action).toBe('stop');
    expect(p('stop the scan').action).toBe('stop');
    expect(p('cancel').action).toBe('stop');
  });
  it('repeat', () => {
    expect(p('repeat').action).toBe('repeat');
    expect(p('say that again').action).toBe('repeat');
  });
  it('help', () => {
    expect(p('help').action).toBe('help');
    expect(p('what can I say').action).toBe('help');
    expect(HELP_TEXT).toMatch(/find my bus/i);
  });
  it('polite filler and wake words are ignored', () => {
    expect(p('Hey Crosswise, could you please read this for me').action).toBe('read');
    expect(p('can you check the light please').action).toBe('check_light');
  });
  it('unknown and empty input', () => {
    expect(p('banana pancakes')).toEqual({ action: 'unknown', text: 'banana pancakes' });
    expect(p('')).toEqual({ action: 'unknown', text: '' });
    expect(p(null)).toEqual({ action: 'unknown', text: '' });
  });
});

describe('parseAlternatives', () => {
  it('uses the first alternative that is understood', () => {
    expect(parseAlternatives(['banana', 'find my bus 13 a', 'read'])).toEqual({ action: 'find_bus', line: '13A' });
    expect(parseAlternatives(['banana', 'pancakes'])).toEqual({ action: 'unknown', text: 'banana' });
  });
});

describe('extractLine', () => {
  it.each([
    ['13a', '13A'], ['13 a', '13A'], ['n25', 'N25'], ['bus 7', '7'], ['100e', '100E'],
    ['tram d', 'D'], ['the o tram', 'O'], ['u4', 'U4'], ['no line here', ''],
  ])('%s → %s', (text, line) => expect(extractLine(text)).toBe(line));
});
