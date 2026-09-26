// Builds the compact crossing snapshots the app uses, from the raw Overpass downloads.
//   data/raw/overpass-<city>.json  →  public/data/crossings-<city>.json
// Run after scripts/fetch-crossings.js. Usage: node scripts/build-crossings.js

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { parseOverpass, clusterCrossings, encodeGroups } from '../public/lib/crossings.js';
import { CITIES } from './fetch-crossings.js';

await mkdir('public/data', { recursive: true });

for (const [city, [s, w, n, e]] of Object.entries(CITIES)) {
  const src = `data/raw/overpass-${city}.json`;
  try { await access(src); } catch { console.log(`${src} missing — run fetch-crossings.js first`); continue; }

  const raw = JSON.parse(await readFile(src, 'utf8'));
  const nodes = parseOverpass(raw);
  const groups = clusterCrossings(nodes);
  const kinds = {};
  for (const g of groups) kinds[g.kind] = (kinds[g.kind] || 0) + 1;
  const withSound = groups.filter((g) => g.sound === 'yes').length;

  const out = {
    city,
    bbox: [w, s, e, n], // [west, south, east, north]
    builtAt: new Date().toISOString(),
    osmTimestamp: raw.osm3s?.timestamp_osm_base,
    source: 'OpenStreetMap contributors (ODbL), via Overpass API',
    format: 'rows: [lat, lon, kind S/Z/U/?, sound y/n/"", vibration, kerb l/r/"", tactile, island]',
    rows: encodeGroups(groups),
  };
  const file = `public/data/crossings-${city}.json`;
  const text = JSON.stringify(out);
  await writeFile(file, text);
  console.log(
    `${city}: ${raw.elements.length} raw nodes → ${nodes.length} usable → ${groups.length} crossing groups ` +
    `${JSON.stringify(kinds)}, ${withSound} with acoustic signal; ${file} ${(text.length / 1024).toFixed(0)} KB`,
  );
}
