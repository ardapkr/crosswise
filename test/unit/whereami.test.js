import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseStops, encodeStops, decodeStops, nearestStops, nearestCrossing, parseReverse, whereAmIText,
} from '../../public/lib/whereami.js';
import { clusterCrossings, parseOverpass } from '../../public/lib/crossings.js';

const HOIV = [16.3954, 48.1761];
const stops = parseStops(JSON.parse(readFileSync('test/fixtures/overpass-stops-hoiv.json', 'utf8')));
const groups = clusterCrossings(parseOverpass(JSON.parse(readFileSync('test/fixtures/overpass-hoiv.json', 'utf8'))));

describe('parseStops', () => {
  it('keeps named stops with their type and lines', () => {
    const s = parseStops({ elements: [
      { type: 'node', id: 1, lat: 48.1, lon: 16.3, tags: { highway: 'bus_stop', name: 'Gräßlplatz', route_ref: '69A;13A' } },
      { type: 'node', id: 2, lat: 48.1, lon: 16.3, tags: { railway: 'tram_stop', name: 'Geiereckstraße' } },
      { type: 'node', id: 3, lat: 48.1, lon: 16.3, tags: { highway: 'bus_stop', railway: 'tram_stop', name: 'Absberggasse' } },
      { type: 'node', id: 4, lat: 48.1, lon: 16.3, tags: { highway: 'bus_stop' } },                          // no name
      { type: 'node', id: 5, lat: 48.1, lon: 16.3, tags: { public_transport: 'platform', subway: 'yes', name: 'Taubstummengasse', level: '-2' } },
    ] });
    expect(s).toEqual([
      { name: 'Gräßlplatz', lat: 48.1, lon: 16.3, kind: 'bus', lines: ['69A', '13A'] },
      { name: 'Geiereckstraße', lat: 48.1, lon: 16.3, kind: 'tram', lines: [] },
      { name: 'Absberggasse', lat: 48.1, lon: 16.3, kind: 'bus and tram', lines: [] },
    ]);
  });
  it('round-trips through the compact snapshot format', () => {
    expect(decodeStops(encodeStops(stops))).toEqual(stops);
  });
});

describe('nearest stops and crossing around HOIV (real data)', () => {
  it('nearest stops, one entry per name, sorted by distance', () => {
    const near = nearestStops(stops, HOIV);
    expect(near.map((s) => s.name)).toEqual(['Hüttenbrennergasse', 'Gräßlplatz']);
    expect(near[0].kind).toBe('bus');
    expect(near[0].distance).toBeGreaterThan(40);
    expect(near[0].distance).toBeLessThan(55);
  });
  it('respects the radius', () => {
    expect(nearestStops(stops, HOIV, { radius: 30 })).toEqual([]);
  });
  it('nearest crossing within 150 m', () => {
    const c = nearestCrossing(groups, HOIV);
    expect(c.distance).toBeLessThan(40);
    expect(['signals', 'zebra', 'unmarked', 'unknown']).toContain(c.kind);
    expect(nearestCrossing(groups, [16.30, 48.10])).toBe(null);
  });
});

describe('parseReverse (ORS reverse geocode)', () => {
  it('address hit → street, house number, distance in metres', () => {
    const r = parseReverse({ features: [{ properties: { layer: 'address', street: 'Arsenalstraße', housenumber: '11', name: 'Arsenalstraße 11', distance: 0.012 } }] });
    expect(r).toEqual({ street: 'Arsenalstraße', housenumber: '11', distance: 12 });
  });
  it('street hit, and nothing', () => {
    expect(parseReverse({ features: [{ properties: { layer: 'street', name: 'Ghegastraße', distance: 0.03 } }] }))
      .toEqual({ street: 'Ghegastraße', housenumber: '', distance: 30 });
    expect(parseReverse({ features: [] })).toBe(null);
    expect(parseReverse(null)).toBe(null);
  });
});

describe('whereAmIText', () => {
  const crossing = { kind: 'signals', sound: 'yes', kerb: 'lowered', distance: 28 };
  const nearStops = [
    { name: 'Hüttenbrennergasse', kind: 'bus', lines: [], distance: 46 },
    { name: 'Geiereckstraße', kind: 'tram', lines: ['18'], distance: 298 },
  ];

  it('full answer: street, stop(s), crossing', () => {
    expect(whereAmIText({ street: { street: 'Arsenalstraße', housenumber: '11', distance: 12 }, stops: nearStops, crossing }, 'blind')).toBe(
      'You are on Arsenalstraße, near number 11. Nearest stop: Hüttenbrennergasse, bus, 50 metres. ' +
      'Also Geiereckstraße, tram 18, 300 metres. Nearest crossing in 30 metres: traffic light with acoustic signal.',
    );
  });
  it('far from the address point → "near", wheelchair → kerb info', () => {
    expect(whereAmIText({ street: { street: 'Ghegastraße', housenumber: '', distance: 60 }, stops: [], crossing }, 'wheelchair')).toBe(
      'You are near Ghegastraße. No bus or tram stop within 400 metres. ' +
      'Nearest crossing in 30 metres: traffic light with acoustic signal, lowered kerb.',
    );
  });
  it('nothing known → honest answer', () => {
    expect(whereAmIText({ street: null, stops: [], crossing: null }, 'blind'))
      .toBe('I could not find the street name. No bus or tram stop within 400 metres.');
  });
});
