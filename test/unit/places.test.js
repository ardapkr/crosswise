import { describe, it, expect } from 'vitest';
import { parseSuggestions, matchKnownPlaces, mergeSuggestions, detailLine, fromGeocode } from '../../public/lib/places.js';

// Shape of an OpenRouteService / Pelias autocomplete answer (trimmed to the fields we use).
const feature = (lon, lat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });
const PELIAS = {
  type: 'FeatureCollection',
  features: [
    feature(16.37301, 48.20849, { name: 'Stephansdom', layer: 'venue', street: 'Stephansplatz', housenumber: '3', neighbourhood: 'Innere Stadt', locality: 'Vienna', label: 'Stephansdom, Vienna, Austria' }),
    feature(16.37305, 48.20851, { name: 'Stephansdom', layer: 'venue', locality: 'Vienna', label: 'Stephansdom, Vienna, Austria' }), // same place, 2nd source
    feature(16.37210, 48.20820, { name: 'Stephansplatz', layer: 'street', locality: 'Vienna', label: 'Stephansplatz, Vienna, Austria' }),
    feature(null, 48.2, { name: 'Broken' }),
    feature(16.4, 48.2, {}),
  ],
};

describe('parseSuggestions', () => {
  it('turns ORS features into short rows, drops duplicates and broken features', () => {
    expect(parseSuggestions(PELIAS)).toEqual([
      { name: 'Stephansdom', detail: 'Stephansplatz 3, Innere Stadt, Vienna', label: 'Stephansdom, Vienna, Austria', layer: 'venue', lon: 16.37301, lat: 48.20849 },
      { name: 'Stephansplatz', detail: 'Vienna', label: 'Stephansplatz, Vienna, Austria', layer: 'street', lon: 16.3721, lat: 48.2082 },
    ]);
  });
  it('respects the maximum and survives garbage', () => {
    expect(parseSuggestions(PELIAS, 1)).toHaveLength(1);
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions({ features: 'x' })).toEqual([]);
  });
  it('fixes the "Inner CIty" typo from the district data (screen readers would spell it)', () => {
    expect(detailLine({ name: 'Albertina', layer: 'venue', street: 'Albertinaplatz', housenumber: '1', neighbourhood: 'Inner CIty', locality: 'Vienna' }))
      .toBe('Albertinaplatz 1, Inner City, Vienna');
  });

  it('detail line never repeats the name', () => {
    expect(detailLine({ name: 'Vienna', locality: 'Vienna' })).toBe('');
    expect(detailLine({ name: 'Arsenalstraße 11', layer: 'address', street: 'Arsenalstraße', borough: 'Landstraße', locality: 'Vienna' }))
      .toBe('Landstraße, Vienna');
  });
});

describe('known places (not in OpenStreetMap by that name)', () => {
  it('finds the venue HOIV from 2 letters, case and accents ignored', () => {
    expect(matchKnownPlaces('ho')[0]).toMatchObject({ name: 'HOIV', lon: 16.3954, lat: 48.1761 });
    expect(matchKnownPlaces('HOIV')[0].name).toBe('HOIV');
    expect(matchKnownPlaces('telos')[0].name).toBe('HOIV');
  });
  it('"Hauptbahnhof" / "hbf" → the station entrance first (ORS lists the car-train terminal first)', () => {
    for (const q of ['Hau', 'hauptbahnhof', 'Hbf', 'main station']) {
      expect(matchKnownPlaces(q)[0]).toMatchObject({ name: 'Wien Hauptbahnhof', lon: 16.3755, lat: 48.185 });
    }
    const ors = [
      { name: 'Wien Hauptbahnhof Autoreisezug', detail: 'Vienna', lon: 16.3911, lat: 48.178 },
      { name: 'Wien Hauptbahnhof', detail: 'Favoriten, Vienna', lon: 16.3779, lat: 48.185 }, // same station, 180 m away
    ];
    expect(mergeSuggestions(matchKnownPlaces('hauptbahnhof'), ors).map((s) => s.name))
      .toEqual(['Wien Hauptbahnhof', 'Wien Hauptbahnhof Autoreisezug']);
  });

  it('does not match unrelated text or single letters', () => {
    expect(matchKnownPlaces('stephansdom')).toEqual([]);
    expect(matchKnownPlaces('h')).toEqual([]);
  });
});

describe('fromGeocode', () => {
  it('splits the label into name + detail and drops the country', () => {
    expect(fromGeocode({ label: 'Wien Hauptbahnhof, Vienna, Austria', name: 'Wien Hauptbahnhof', lon: 16.3755, lat: 48.185 }))
      .toEqual({ name: 'Wien Hauptbahnhof', detail: 'Vienna', label: 'Wien Hauptbahnhof, Vienna, Austria', layer: '', lon: 16.3755, lat: 48.185 });
    expect(fromGeocode({ label: 'Somewhere', lon: 1, lat: 2 })).toMatchObject({ name: 'Somewhere', detail: '' });
  });
});

describe('mergeSuggestions', () => {
  it('known places first, then ORS, no duplicates, max 6', () => {
    const known = matchKnownPlaces('hoiv');
    const remote = [
      { name: 'Arsenalstraße 11', detail: 'Vienna', lon: 16.39541, lat: 48.17611 }, // same spot as HOIV
      ...Array.from({ length: 8 }, (_, i) => ({ name: `Place ${i}`, detail: '', lon: 16.3 + i / 100, lat: 48.2 })),
    ];
    const merged = mergeSuggestions(known, remote);
    expect(merged).toHaveLength(6);
    expect(merged[0].name).toBe('HOIV');
    expect(merged.some((s) => s.name === 'Arsenalstraße 11')).toBe(false);
  });
});
