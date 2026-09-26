// "I want to go to …" → did you mean …? → yes/no. Pure dialogue helpers.
import { describe, it, expect } from 'vitest';
import { destinationFrom, cleanPlace, parseYesNo, didYouMean, placeDetail, spokenDistance } from '../../public/lib/dialog.js';

describe('destinationFrom: many ways to say where you want to go', () => {
  const cases = [
    ['I want to go to Stephansplatz', 'Stephansplatz'],
    ['i want go to stephansplatz', 'stephansplatz'],
    ['I wanna go to Karlsplatz please', 'Karlsplatz'],
    ["I'd like to go to the Prater", 'Prater'],
    ['take me to Hauptbahnhof', 'Hauptbahnhof'],
    ['can you please take me to Schwedenplatz', 'Schwedenplatz'],
    ['um okay bring me to the opera', 'opera'],
    ['how do I get to Schönbrunn', 'Schönbrunn'],
    ['how I get to Westbahnhof', 'Westbahnhof'],
    ['navigate to Mariahilfer Straße', 'Mariahilfer Straße'],
    ['directions to Belvedere', 'Belvedere'],
    ['I need to go to the Allgemeines Krankenhaus', 'Allgemeines Krankenhaus'],
    ['bring mich zum Hauptbahnhof', 'Hauptbahnhof'],
    ['ich möchte zum Stephansplatz bitte', 'Stephansplatz'],
    ['wie komme ich zur Oper', 'Oper'],
  ];
  for (const [text, place] of cases) {
    it(`"${text}" → ${place}`, () => expect(destinationFrom(text)?.place).toBe(place));
  }

  it('"by bus" / "on foot" become the travel mode, not part of the place', () => {
    expect(destinationFrom('take me to Stephansplatz by bus')).toEqual({ place: 'Stephansplatz', by: 'transit' });
    expect(destinationFrom('I want to go to Karlsplatz with the tram please')).toEqual({ place: 'Karlsplatz', by: 'transit' });
    expect(destinationFrom('I want to go to Belvedere on foot')).toEqual({ place: 'Belvedere', by: 'walk' });
    expect(destinationFrom('walk to Belvedere')).toEqual({ place: 'Belvedere', by: 'walk' });
    expect(destinationFrom('bring mich mit der U-Bahn zum Prater')).toEqual({ place: 'Prater', by: 'transit' });
    expect(destinationFrom('take me by tram to Schwedenplatz')).toEqual({ place: 'Schwedenplatz', by: 'transit' });
  });

  it('"I want to go somewhere" = a wish to go, but no place yet', () => {
    expect(destinationFrom('I want to go somewhere')).toEqual({ place: '', by: null });
    expect(destinationFrom('take me')).toEqual({ place: '', by: null });
    expect(destinationFrom('I want to go')).toEqual({ place: '', by: null });
  });

  it('a bare place or another command is not a "go" sentence', () => {
    expect(destinationFrom('Stephansplatz')).toBe(null);
    expect(destinationFrom('find my bus 13a')).toBe(null);
    expect(destinationFrom('where am I')).toBe(null);
  });

  it('cleanPlace', () => {
    expect(cleanPlace('the Prater please')).toEqual({ place: 'prater', by: null });
    expect(cleanPlace('karlsplatz by u-bahn')).toEqual({ place: 'karlsplatz', by: 'transit' });
  });
});

describe('parseYesNo', () => {
  for (const t of ['yes', 'Yes.', 'yeah', 'yep sure', 'correct', "that's right", 'ok', 'okay go', 'yes please', 'ja', 'genau', 'go ahead', 'um yes']) {
    it(`"${t}" → yes`, () => expect(parseYesNo(t)).toBe('yes'));
  }
  for (const t of ['no', 'No.', 'nope', 'nein', 'wrong', 'not that one', 'another one', 'the other one', 'next']) {
    it(`"${t}" → no`, () => expect(parseYesNo(t)).toBe('no'));
  }
  it('not an answer / unclear', () => {
    expect(parseYesNo('find my bus')).toBe(null);
    expect(parseYesNo('yes no wait')).toBe(null);
    expect(parseYesNo('')).toBe(null);
  });
  it('uses the second recogniser guess', () => {
    expect(parseYesNo(['yet', 'yes'])).toBe('yes');
  });
});

describe('the question', () => {
  const place = { name: 'Stephansplatz', detail: 'Innere Stadt, Vienna', lon: 16.3731, lat: 48.2085 };
  const hoiv = [16.3954, 48.1761];
  it('names the place, its district and how far it is', () => {
    expect(didYouMean(place, hoiv)).toBe('Did you mean Stephansplatz, Innere Stadt, Vienna? It is about 4.0 kilometres from here. Say yes or no.');
    expect(didYouMean(place, null, { n: 2 })).toBe('Then did you mean Stephansplatz, Innere Stadt, Vienna? Say yes or no.');
    expect(placeDetail(place, hoiv)).toBe('Innere Stadt, Vienna · 4.0 km away');
  });
  it('spokenDistance', () => {
    expect(spokenDistance(20)).toBe('50 metres');
    expect(spokenDistance(430)).toBe('450 metres');
    expect(spokenDistance(3860)).toBe('3.9 kilometres');
  });
});
