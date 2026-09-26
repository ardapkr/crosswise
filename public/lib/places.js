// Place suggestions for the destination search (live, while typing).
// - parseSuggestions: an OpenRouteService / Pelias autocomplete answer → short rows for big buttons
// - matchKnownPlaces: a few places people name differently than OpenStreetMap does (e.g. the venue "HOIV")
// - mergeSuggestions: known places first, then ORS, without duplicates
// Pure module: used by /api/autocomplete, the browser and the tests.

import { distance } from './geo.js';

export const MIN_QUERY = 3;      // live suggestions start after this many letters
export const MAX_SUGGESTIONS = 6;

// Matched locally, instantly, from 2 letters, and shown before the ORS results:
// - HOIV is not in OpenStreetMap by that name (ORS finds nothing).
// - For "Hauptbahnhof", ORS lists the car-train terminal ("Autoreisezug", ~1 km east of the station hall)
//   first; a blind user taking the first suggestion must get the main entrance.
export const KNOWN_PLACES = [
  {
    name: 'HOIV', detail: 'Arsenalstraße 11, Landstraße, Vienna', lon: 16.3954, lat: 48.1761,
    keywords: ['hoiv', 'telos hackathon'],
  },
  {
    name: 'Wien Hauptbahnhof', detail: 'Main station, Favoriten, Vienna', lon: 16.3755, lat: 48.185,
    keywords: ['hauptbahnhof', 'hbf', 'main station', 'central station', 'train station'],
  },
];

const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();

// Vienna landmarks as people SAY them (voice / dictation: "take me to the opera", "bring mich zum Prater").
// The geocoder gets these wrong: "opera" → a shop called OPERA in Bratislava (53 km), "Prater" → the small
// Böhmischer Prater near HOIV instead of the famous one with the giant Ferris wheel.
// Matched on the WHOLE spoken name (not while typing). Coordinates checked against OpenRouteService geocoding.
export const LANDMARKS = [
  { name: 'Wiener Staatsoper', detail: 'Vienna State Opera, Opernring, Innere Stadt', lon: 16.3691, lat: 48.2031,
    say: ['opera', 'the opera', 'opera house', 'state opera', 'vienna state opera', 'vienna opera', 'staatsoper', 'wiener staatsoper', 'oper', 'die oper'] },
  { name: 'Stephansdom', detail: "St. Stephen's Cathedral, Stephansplatz, Innere Stadt", lon: 16.3731, lat: 48.2085,
    say: ['stephansdom', 'st stephens cathedral', 'saint stephens cathedral', 'st stephens', 'stephens cathedral', 'st stephen s cathedral', 'the cathedral', 'cathedral', 'dom', 'der dom'] },
  { name: 'Prater and Riesenrad', detail: 'Giant Ferris wheel, Wurstelprater, Leopoldstadt', lon: 16.3959, lat: 48.2166,
    say: ['prater', 'the prater', 'wurstelprater', 'riesenrad', 'giant ferris wheel', 'the ferris wheel', 'ferris wheel', 'prater park', 'amusement park', 'wiener prater'] },
  { name: 'Schloss Schönbrunn', detail: 'Schönbrunn Palace, Hietzing', lon: 16.3122, lat: 48.1850,
    say: ['schonbrunn', 'schoenbrunn', 'schonbrunn palace', 'schoenbrunn palace', 'schloss schonbrunn', 'schloss schoenbrunn', 'shown brun', 'shoenbrunn', 'schoenbrun', 'schonbrun'] },
  { name: 'Tiergarten Schönbrunn', detail: 'Vienna Zoo, Hietzing', lon: 16.3031, lat: 48.1825,
    say: ['zoo', 'the zoo', 'vienna zoo', 'tiergarten', 'tiergarten schonbrunn', 'schonbrunn zoo', 'schoenbrunn zoo'] },
  { name: 'Rathaus', detail: 'City Hall, Rathausplatz, Innere Stadt', lon: 16.3573, lat: 48.2108,
    say: ['rathaus', 'city hall', 'town hall', 'the city hall', 'rathausplatz', 'vienna city hall'] },
  { name: 'Parlament', detail: 'Parliament, Dr.-Karl-Renner-Ring, Innere Stadt', lon: 16.3589, lat: 48.2082,
    say: ['parlament', 'parliament', 'the parliament', 'austrian parliament'] },
  { name: 'Hofburg', detail: 'Imperial Palace, Heldenplatz, Innere Stadt', lon: 16.3653, lat: 48.2066,
    say: ['hofburg', 'the hofburg', 'heldenplatz', 'imperial palace', 'hofburg palace'] },
  { name: 'Albertina', detail: 'Museum, Albertinaplatz, Innere Stadt', lon: 16.3683, lat: 48.2045,
    say: ['albertina', 'the albertina', 'albertina museum'] },
  { name: 'Karlskirche', detail: "St. Charles's Church, Karlsplatz, Wieden", lon: 16.3717, lat: 48.1982,
    say: ['karlskirche', 'st charles church', 'saint charles church', 'charles church'] },
  { name: 'Naschmarkt', detail: 'Market, Karlsplatz end, Mariahilf / Wieden', lon: 16.3656, lat: 48.1997,
    say: ['naschmarkt', 'the naschmarkt', 'nasch market', 'the market'] },
  { name: 'MuseumsQuartier', detail: 'Museumsplatz, Neubau', lon: 16.3584, lat: 48.2035,
    say: ['museumsquartier', 'museum quarter', 'museums quarter', 'the museum quarter', 'mq'] },
  { name: 'Kunsthistorisches Museum', detail: 'Art History Museum, Maria-Theresien-Platz', lon: 16.3617, lat: 48.2038,
    say: ['kunsthistorisches museum', 'art history museum', 'museum of art history', 'khm', 'the art museum'] },
  { name: 'Naturhistorisches Museum', detail: 'Natural History Museum, Maria-Theresien-Platz', lon: 16.3600, lat: 48.2052,
    say: ['naturhistorisches museum', 'natural history museum', 'the natural history museum', 'nhm'] },
  { name: 'Universität Wien', detail: 'University of Vienna main building, Universitätsring', lon: 16.3600, lat: 48.2132,
    say: ['university', 'the university', 'university of vienna', 'uni wien', 'universitat wien', 'universitaet wien', 'die uni', 'uni'] },
  { name: 'AKH Wien', detail: 'Vienna General Hospital, Währinger Gürtel, Alsergrund', lon: 16.3466, lat: 48.2197,
    say: ['akh', 'a k h', 'the akh', 'general hospital', 'vienna general hospital', 'allgemeines krankenhaus', 'the hospital', 'hospital', 'krankenhaus'] },
  { name: 'Wien Westbahnhof', detail: 'Train station, Europaplatz, Rudolfsheim-Fünfhaus', lon: 16.3378, lat: 48.1966,
    say: ['westbahnhof', 'west station', 'western station', 'wien westbahnhof', 'the west station'] },
  { name: 'Wien Mitte', detail: 'Train station, Landstraße', lon: 16.3848, lat: 48.2067,
    say: ['wien mitte', 'vienna mitte', 'mitte station', 'landstrasse station'] },
  { name: 'Praterstern', detail: 'Wien Praterstern station, Leopoldstadt', lon: 16.3923, lat: 48.2186,
    say: ['praterstern', 'wien praterstern', 'wien nord', 'north station'] },
  { name: 'Flughafen Wien', detail: 'Vienna Airport, train station at the terminals, Schwechat', lon: 16.5630, lat: 48.1206,
    say: ['airport', 'the airport', 'vienna airport', 'flughafen', 'flughafen wien', 'schwechat', 'schwechat airport'] },
  { name: 'Hundertwasserhaus', detail: 'Kegelgasse, Landstraße', lon: 16.3942, lat: 48.2072,
    say: ['hundertwasserhaus', 'hundertwasser house', 'hundred water house', 'the hundertwasser house'] },
  { name: 'Oberes Belvedere', detail: 'Upper Belvedere, Prinz-Eugen-Straße, Landstraße', lon: 16.3809, lat: 48.1915,
    say: ['belvedere', 'the belvedere', 'upper belvedere', 'oberes belvedere', 'belvedere palace', 'belvedere museum'] },
  { name: 'Stadtpark', detail: 'City Park, Innere Stadt / Landstraße', lon: 16.3797, lat: 48.2046,
    say: ['stadtpark', 'city park', 'the city park', 'the stadtpark'] },
  { name: 'Donauturm', detail: 'Danube Tower, Donaupark, Donaustadt', lon: 16.4100, lat: 48.2404,
    say: ['donauturm', 'danube tower', 'the danube tower'] },
];

/** A spoken landmark name ("the opera", "Riesenrad") → [place] (whole-name match, accents and "the" ignored). */
export function matchLandmark(spoken, landmarks = LANDMARKS) {
  const q = fold(spoken).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const bare = q.replace(/^(?:the|die|der|das|zum|zur) /, '');
  return landmarks
    .filter((p) => [p.name, ...p.say].some((k) => { const f = fold(k).replace(/[^a-z0-9 ]+/g, ' ').trim(); return f === q || f === bare; }))
    .map(({ name, detail, lon, lat }) => ({ name, detail, label: `${name}, ${detail}`, layer: 'venue', lon, lat, landmark: true }));
}

/** Known places whose name or a keyword starts with the typed text (any word of it). */
export function matchKnownPlaces(query, places = KNOWN_PLACES) {
  const q = fold(query);
  if (q.length < 2) return [];
  return places
    .filter((p) => [p.name, ...(p.keywords || [])].some((k) => fold(k).startsWith(q) || fold(k).split(' ').some((w) => w.startsWith(q))))
    .map(({ name, detail, lon, lat }) => ({ name, detail, label: `${name}, ${detail}`, layer: 'venue', lon, lat }));
}

/** Second line under the name: street (for venues), district, city — never repeating the name. */
export function detailLine(p) {
  const parts = [];
  const add = (s) => { if (s && s !== p.name && !parts.includes(s)) parts.push(s); };
  if (p.layer === 'venue' && p.street) add(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  add(p.neighbourhood || p.borough);
  add(p.locality || p.localadmin || p.county || p.region);
  return parts.slice(0, 3).join(', ').replace(/\bCIty\b/g, 'City'); // typo in the district data ("Inner CIty")
}

/** Pelias GeoJSON → [{ name, detail, label, layer, lon, lat }], same place twice → once. */
export function parseSuggestions(data, max = MAX_SUGGESTIONS) {
  const out = [];
  for (const f of data?.features || []) {
    const p = f?.properties || {};
    const [lon, lat] = f?.geometry?.coordinates || [];
    const name = (p.name || p.label || '').trim();
    if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const s = { name, detail: detailLine(p), label: p.label || name, layer: p.layer || '', lon, lat };
    if (!isDuplicate(out, s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// Same name within 300 m (e.g. a big station as a venue and as a stop) = the same place for the user.
function isDuplicate(list, s) {
  return list.some((o) => fold(o.name) === fold(s.name) && distance([o.lon, o.lat], [s.lon, s.lat]) < 300);
}

/** A full-search result from /api/geocode ({ label, name, lon, lat }) → a suggestion row. */
export function fromGeocode(r) {
  const name = r.name || r.label;
  const rest = String(r.label || '').startsWith(`${name}, `) ? r.label.slice(name.length + 2) : '';
  return { name, detail: rest.replace(/,?\s*Austria$/, ''), label: r.label || name, layer: r.layer || '', lon: r.lon, lat: r.lat };
}

/** Known matches first, then ORS results, max `max` rows. */
export function mergeSuggestions(known, remote, max = MAX_SUGGESTIONS) {
  const out = [];
  for (const s of [...known, ...remote]) {
    if (!isDuplicate(out, s) && !out.some((o) => distance([o.lon, o.lat], [s.lon, s.lat]) < 30)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
