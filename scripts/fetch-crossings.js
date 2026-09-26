// Downloads ALL crossing + traffic-signal nodes for Vienna and Budapest from Overpass, ONCE.
// The public Overpass server is shared: run this rarely. Raw output goes to data/raw/ (git-ignored).
//
// Usage: node scripts/fetch-crossings.js [vienna|budapest|all] [--force]

import { mkdir, writeFile, access } from 'node:fs/promises';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// bbox order for Overpass is south,west,north,east
export const CITIES = {
  vienna: [48.118, 16.182, 48.323, 16.578],
  budapest: [47.35, 18.92, 47.62, 19.34],
};

export function buildQuery(bbox) {
  const b = bbox.join(',');
  return `[out:json][timeout:300];
(
  node["highway"="crossing"](${b});
  node["highway"="traffic_signals"](${b});
);
out body;`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(query) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Crosswise-hackathon/0.1 (accessible navigation prototype)',
      },
      body: 'data=' + encodeURIComponent(query),
    });
    if (res.ok) return res.text();
    console.warn(`Overpass HTTP ${res.status} (attempt ${attempt})`);
    if (attempt === 1) await sleep(60_000); // be polite, retry once
  }
  throw new Error('Overpass failed twice');
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const which = process.argv[2] || 'all';
  const force = process.argv.includes('--force');
  const cities = which === 'all' ? Object.keys(CITIES) : [which];
  await mkdir('data/raw', { recursive: true });

  for (const city of cities) {
    const out = `data/raw/overpass-${city}.json`;
    if (!force && (await exists(out))) {
      console.log(`${out} already exists, skipping (use --force to re-download)`);
      continue;
    }
    console.log(`Downloading ${city}...`);
    const t0 = Date.now();
    const text = await fetchOverpass(buildQuery(CITIES[city]));
    await writeFile(out, text);
    const n = JSON.parse(text).elements.length;
    console.log(`${city}: ${n} nodes, ${(text.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (cities.length > 1) await sleep(10_000); // pause between cities
  }
}

// Only run when called directly (not when imported by a test).
if (process.argv[1]?.endsWith('fetch-crossings.js')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
