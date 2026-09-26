// Baseline comparison: our recommended route vs the SHORTEST route (what a normal map app gives you),
// on a reproducible random sample of walking trips around HOIV.
//
//   node scripts/eval-routes.js --fetch   → asks the deployed /api/route (real ORS) for each trip and saves
//                                           the raw answers to eval/routes-<mode>.json (only missing trips)
//   node scripts/eval-routes.js           → computes the numbers from the saved file (offline, free)
//   add --mode wheelchair|limited|blind (default blind), --log to append the summary to EVAL.md
//
// Trips: seeded random pairs of points in a ~3 x 3 km box around HOIV, 700–2000 m apart (straight line).

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { normalizeOrsRoutes } from '../public/lib/ors.js';
import { decodeGroups, crossingsOnRoute } from '../public/lib/crossings.js';
import { rankRoutes } from '../public/lib/scoring.js';
import { distance } from '../public/lib/geo.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const MODE = arg('--mode', 'blind');
const N_TRIPS = Number(arg('--trips', 30));
const FILE = path.join(ROOT, 'eval', `routes-${MODE}.json`);

// ---------- reproducible trips ----------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTrips(n = N_TRIPS, seed = 20260926) {
  const rnd = mulberry32(seed);
  const box = { w: 16.375, e: 16.415, s: 48.165, n: 48.190 }; // around HOIV (16.3954, 48.1761)
  const pt = () => [+(box.w + rnd() * (box.e - box.w)).toFixed(5), +(box.s + rnd() * (box.n - box.s)).toFixed(5)];
  const trips = [];
  while (trips.length < n) {
    const from = pt();
    const to = pt();
    const d = distance(from, to);
    if (d >= 700 && d <= 2000) trips.push({ id: `t${String(trips.length + 1).padStart(2, '0')}`, from, to, straight: Math.round(d) });
  }
  return trips;
}

// ---------- fetching (deployed API, gets past Vercel protection with `vercel curl`) ----------
let vercelJs = null;
function vercelGet(url, apiPath) {
  if (!vercelJs) vercelJs = path.join(execSync('npm root -g').toString().trim(), 'vercel', 'dist', 'vc.js');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vercelJs, 'curl', apiPath, '--deployment', url, '--', '--silent', '--max-time', '40']);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('timed out')); }, 60_000);
    child.on('close', () => {
      clearTimeout(timer);
      const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
      if (!line) return reject(new Error('no JSON'));
      try { resolve(JSON.parse(line)); } catch { reject(new Error('bad JSON')); }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAll(trips) {
  const url = arg('--url') || readFileSync(path.join(ROOT, 'PROGRESS.md'), 'utf8').match(/https:\/\/crosswise-[a-z0-9-]+\.vercel\.app/)?.[0];
  if (!url) throw new Error('no preview URL');
  const saved = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  for (const t of trips) {
    if (saved[t.id]?.raw?.features) continue;
    const q = `/api/route?from=${t.from.join(',')}&to=${t.to.join(',')}&mode=${MODE}&raw=1`;
    let answer = null;
    for (let attempt = 0; attempt < 3 && !answer; attempt++) {
      try {
        const r = await vercelGet(url, q);
        if (r.features) answer = { raw: r };
        else if (r.error && !/busy|time|429|5\d\d/i.test(r.error)) answer = { error: r.error }; // e.g. no route possible
      } catch { /* network hiccup: retry */ }
      if (!answer) await sleep(3000 * (attempt + 1));
    }
    saved[t.id] = { ...t, ...(answer || { error: 'failed after retries' }) };
    console.log(`${t.id} ${saved[t.id].raw ? `${saved[t.id].raw.features.length} routes` : `ERROR ${saved[t.id].error}`}`);
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(saved));
    await sleep(1600); // ORS free tier: max 40 requests per minute
  }
  return saved;
}

// ---------- the comparison ----------
export function compareTrip(raw, groups, mode) {
  const routes = normalizeOrsRoutes(raw).map((r) => ({ ...r, crossings: crossingsOnRoute(groups, r.geometry) }));
  const ranked = rankRoutes(routes, mode);
  const ours = ranked[0];
  const base = ranked.find((r) => r.isShortest);
  const unmarked = (r) => r.score.kinds.unmarked + r.score.kinds.unknown;
  const soundShare = (r) => (r.score.count ? r.score.withSound / r.score.count : 1);
  return {
    alternatives: routes.length,
    changed: ours !== base,
    extraSec: Math.round(ours.duration - base.duration),
    worstOurs: ours.score.worst,
    worstBase: base.score.worst,
    unmarkedOurs: unmarked(ours),
    unmarkedBase: unmarked(base),
    riskyOurs: ours.score.risky,
    riskyBase: base.score.risky,
    crossingsOurs: ours.score.count,
    crossingsBase: base.score.count,
    soundShareOurs: soundShare(ours),
    soundShareBase: soundShare(base),
  };
}

export function summarize(results) {
  const ok = results.filter((r) => r.cmp);
  const withAlt = ok.filter((r) => r.cmp.alternatives > 1);
  const changed = ok.filter((r) => r.cmp.changed);
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const worse = ok.filter((r) => r.cmp.worstOurs < r.cmp.worstBase).length;
  return {
    trips: results.length,
    answered: ok.length,
    failed: results.length - ok.length,
    withAlternatives: withAlt.length,
    changed: changed.length,
    medianExtraMin: +(median(changed.map((r) => r.cmp.extraSec)) / 60).toFixed(1),
    maxExtraMin: +(Math.max(0, ...changed.map((r) => r.cmp.extraSec)) / 60).toFixed(1),
    unmarkedBase: sum(ok.map((r) => r.cmp.unmarkedBase)),
    unmarkedOurs: sum(ok.map((r) => r.cmp.unmarkedOurs)),
    tripsWithUnmarkedBase: ok.filter((r) => r.cmp.unmarkedBase > 0).length,
    tripsWithUnmarkedOurs: ok.filter((r) => r.cmp.unmarkedOurs > 0).length,
    riskyBase: sum(ok.map((r) => r.cmp.riskyBase)),
    riskyOurs: sum(ok.map((r) => r.cmp.riskyOurs)),
    worseWorstCrossing: worse,
    soundShareBase: +(100 * sum(ok.map((r) => r.cmp.soundShareBase)) / (ok.length || 1)).toFixed(0),
    soundShareOurs: +(100 * sum(ok.map((r) => r.cmp.soundShareOurs)) / (ok.length || 1)).toFixed(0),
  };
}

export function evaluate(saved, groups, mode) {
  return Object.values(saved).sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({
    ...t, cmp: t.raw?.features?.length ? compareTrip(t.raw, groups, mode) : null,
  }));
}

async function main() {
  const trips = makeTrips();
  const saved = args.includes('--fetch') ? await fetchAll(trips) : JSON.parse(readFileSync(FILE, 'utf8'));
  const groups = decodeGroups(JSON.parse(readFileSync(path.join(ROOT, 'public/data/crossings-vienna.json'), 'utf8')).rows);
  const results = evaluate(saved, groups, MODE);
  const s = summarize(results);

  const lines = [
    `### Route baseline comparison (${MODE} mode), ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `${s.trips} random walking trips around HOIV (700–2000 m apart, seed 20260926), real OpenRouteService routes`,
    `(up to 3 alternatives each) and the OSM crossing snapshot. Baseline = the shortest route. ${s.failed} trips had no route.`,
    '',
    '| | Shortest route (baseline) | Crosswise recommended |',
    '|---|---|---|',
    `| Trips with an unmarked/unknown crossing | ${s.tripsWithUnmarkedBase} of ${s.answered} | ${s.tripsWithUnmarkedOurs} of ${s.answered} |`,
    `| Unmarked/unknown crossings in total | ${s.unmarkedBase} | ${s.unmarkedOurs} |`,
    `| Risky crossings for this mode in total | ${s.riskyBase} | ${s.riskyOurs} |`,
    `| Average share of crossings with lights + acoustic signal | ${s.soundShareBase}% | ${s.soundShareOurs}% |`,
    '',
    `- ORS offered alternatives on ${s.withAlternatives} of ${s.answered} trips; Crosswise picked a different route than the shortest on ${s.changed}.`,
    `- Cost of the safer route when it differs: median ${s.medianExtraMin} min extra, at most ${s.maxExtraMin} min.`,
    `- Trips where our worst crossing is worse than the baseline's: ${s.worseWorstCrossing} (should be 0).`,
    '',
    '| Trip | Alternatives | Changed | Extra min | Unmarked/unknown: shortest → ours | Worst crossing score: shortest → ours |',
    '|---|---|---|---|---|---|',
    ...results.map((r) => (r.cmp
      ? `| ${r.id} (${r.straight} m) | ${r.cmp.alternatives} | ${r.cmp.changed ? 'yes' : 'no'} | ${(r.cmp.extraSec / 60).toFixed(1)} | ${r.cmp.unmarkedBase} → ${r.cmp.unmarkedOurs} | ${fmt(r.cmp.worstBase)} → ${fmt(r.cmp.worstOurs)} |`
      : `| ${r.id} (${r.straight} m) | – | – | – | no route: ${r.error} | – |`)),
  ];
  const text = lines.join('\n');
  console.log(text);
  if (args.includes('--log')) appendFileSync(path.join(ROOT, 'EVAL.md'), '\n' + text + '\n');
}

function fmt(x) { return x === Infinity ? 'none' : String(x); }

if (process.argv[1]?.endsWith('eval-routes.js')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
