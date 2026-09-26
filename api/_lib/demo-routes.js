// Saved REAL OpenRouteService responses for the demo routes around HOIV.
// Used only when ORS is unavailable (no key locally, rate limit, outage) so the demo never dies.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { distance } from '../../public/lib/geo.js';
import { normalizeMode } from '../../public/lib/modes.js';

const HOIV = [16.3954, 48.1761];
const DEMO = [
  { to: [16.3755, 48.1850], files: { blind: 'ors-hoiv-hbf-foot', wheelchair: 'ors-hoiv-hbf-wheelchair', limited: 'ors-hoiv-hbf-limited' } },
  { to: [16.3809, 48.1915], files: { blind: 'ors-hoiv-belvedere-foot' } },
];

/** Name of the saved response for this request, or null. Start within 300 m of HOIV, end within 200 m. */
export function demoRouteName(from, to, mode) {
  if (distance(from, HOIV) > 300) return null;
  const d = DEMO.find((x) => distance(to, x.to) <= 200);
  return d?.files[normalizeMode(mode)] || null;
}

export async function loadDemoRoute(name) {
  const file = path.join(process.cwd(), 'api', '_data', `${name}.json`);
  return JSON.parse(await readFile(file, 'utf8'));
}
