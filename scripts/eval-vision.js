// Vision accuracy eval: runs every photo in test/vision/<mode>/ through /api/look and compares the
// answer with the label in the filename:  <mode>__<expected>__<nn>.jpg
//   bus__13A__01.jpg  → line 13A        bus__none__01.jpg   → must NOT report a line
//   light__green__01  → green           light__none__01     → not_visible / unclear / dark
//   read__bahnhof-city__01 → text contains "bahnhof" and "city"
//   describe__zebra__01    → description mentions a zebra crossing (keyword list below)
//
// Usage:
//   npm run eval:vision                      → uses the newest preview URL from PROGRESS.md (via `vercel curl`)
//   npm run eval:vision -- --url <preview>   → a specific deployment
//   npm run eval:vision -- --local           → calls the handler in-process (needs ANTHROPIC_API_KEY in .env.local)
//   add --mode bus to run one mode, --log to append the summary to EVAL.md
//
// Photos are downscaled to 768 px wide first (like the app does) when ffmpeg is available.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const LOCAL = args.includes('--local');
const LOG = args.includes('--log');
const ONLY = arg('--mode');
const TMP = path.join(os.tmpdir(), 'crosswise-eval');
mkdirSync(TMP, { recursive: true });

// ---------- scoring ----------
const DESCRIBE_KEYWORDS = {
  'crossing-people': /cross|pedestrian|people|walk/i,
  'signal-box': /button|box|signal|push|pole/i,
  zebra: /zebra|crosswalk|crossing|stripe/i,
  'tram-tracks': /tram|track|rail/i,
};
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ');

export function score(mode, expected, r) {
  switch (mode) {
    case 'bus': {
      const exp = expected.toUpperCase();
      if (exp === 'NONE') return { ok: r.status !== 'found', critical: r.status === 'found' };
      return { ok: r.status === 'found' && r.line === exp, critical: r.status === 'found' && r.line !== exp };
    }
    case 'light': {
      const ok = expected === 'green' ? ['green', 'flashing_green'].includes(r.status)
        : expected === 'red' ? r.status === 'red'
          : ['not_visible', 'unclear', 'dark'].includes(r.status);
      return { ok, critical: expected !== 'green' && ['green', 'flashing_green'].includes(r.status) };
    }
    case 'read': {
      const hay = norm(`${r.text} ${r.summary}`);
      return { ok: r.status === 'found' && expected.split('-').every((w) => hay.includes(w)), critical: false };
    }
    case 'describe': {
      const re = DESCRIBE_KEYWORDS[expected] || new RegExp(expected.split('-').join('|'), 'i');
      return { ok: re.test(`${r.description} ${r.hazards.join(' ')}`), critical: false };
    }
    default:
      return { ok: false, critical: false };
  }
}

// ---------- calling /api/look ----------
function prepareImage(file) {
  const out = path.join(TMP, path.basename(file));
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'scale=768:-2', '-q:v', '5', out]);
    return readFileSync(out).toString('base64');
  } catch {
    return readFileSync(file).toString('base64'); // no ffmpeg: send the original
  }
}

function latestPreview() {
  const m = readFileSync(path.join(ROOT, 'PROGRESS.md'), 'utf8').match(/https:\/\/crosswise-[a-z0-9-]+\.vercel\.app/);
  return m?.[0];
}

let vercelJs = null;
function callRemote(url, body) {
  // `vercel curl` gets past Vercel's deployment protection. Run its JS entry directly (no shell quoting issues).
  if (!vercelJs) vercelJs = path.join(execSync('npm root -g').toString().trim(), 'vercel', 'dist', 'vc.js');
  const f = path.join(TMP, 'body.json');
  writeFileSync(f, JSON.stringify(body));
  const r = spawnSync(process.execPath, [vercelJs, 'curl', '/api/look', '--deployment', url, '--',
    '--silent', '--request', 'POST', '--header', 'Content-Type: application/json', '--data-binary', `@${f}`],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const line = (r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) throw new Error(`no JSON from vercel curl: ${(r.stderr || '').slice(-300)}`);
  return JSON.parse(line);
}

let localHandler = null;
async function callLocal(body) {
  if (!localHandler) {
    if (existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
    localHandler = (await import('../api/look.js')).default;
  }
  let out;
  const res = { status() { return res; }, json(b) { out = b; return res; }, setHeader() {} };
  await localHandler({ method: 'POST', body }, res);
  return out;
}

// ---------- main ----------
async function main() {
  const url = arg('--url') || latestPreview();
  if (!LOCAL && !url) throw new Error('No preview URL: pass --url or --local');
  console.log(LOCAL ? 'Running locally (in-process handler)' : `Running against ${url}`);

  const modes = ['bus', 'light', 'read', 'describe'].filter((m) => !ONLY || m === ONLY);
  const records = [];
  for (const mode of modes) {
    const dir = path.join(ROOT, 'test', 'vision', mode);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort() : [];
    for (const f of files) {
      const expected = f.split('__')[1] || '';
      const t0 = Date.now();
      let resp;
      try {
        const body = { mode, image: prepareImage(path.join(dir, f)) };
        resp = LOCAL ? await callLocal(body) : callRemote(url, body);
      } catch (e) {
        resp = { error: e.message };
      }
      if (!resp?.result) {
        records.push({ mode, file: f, expected, error: resp?.error || 'no result', ok: false, critical: false });
        console.log(`  ✗ ${f}  ERROR ${resp?.error || ''}`);
        continue;
      }
      const s = score(mode, expected, resp.result);
      records.push({ mode, file: f, expected, ...s, result: resp.result, observation: resp.observation, ms: resp.ms, roundTripMs: Date.now() - t0 });
      const got = mode === 'bus' ? `${resp.result.status} ${resp.result.line}` : mode === 'light' ? resp.result.status
        : mode === 'read' ? `${resp.result.status}: ${resp.result.summary || resp.result.text}` : resp.result.description;
      console.log(`  ${s.ok ? '✓' : '✗'}${s.critical ? ' ⚠ CRITICAL' : ''} ${f}  → ${String(got).slice(0, 110)}  (${resp.ms} ms)`);
    }
  }

  // Summary per mode
  const lines = [];
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  lines.push(`### Vision eval ${date} (${LOCAL ? 'local' : url})`, '', '| Mode | Correct | Accuracy | Critical errors | Median model latency |', '|---|---|---|---|---|');
  for (const mode of modes) {
    const r = records.filter((x) => x.mode === mode);
    if (!r.length) { lines.push(`| ${mode} | – | no photos yet | – | – |`); continue; }
    const ok = r.filter((x) => x.ok).length;
    const crit = r.filter((x) => x.critical).length;
    const ms = r.filter((x) => x.ms).map((x) => x.ms).sort((a, b) => a - b);
    const med = ms.length ? ms[Math.floor(ms.length / 2)] : '–';
    lines.push(`| ${mode} | ${ok}/${r.length} | ${Math.round((100 * ok) / r.length)}% | ${crit} | ${med} ms |`);
  }
  const wrong = records.filter((x) => !x.ok);
  if (wrong.length) {
    lines.push('', 'Misses:');
    for (const w of wrong) lines.push(`- \`${w.file}\`: ${w.error || JSON.stringify(w.result)}${w.observation ? ` — saw: "${w.observation}"` : ''}`);
  }
  const summary = lines.join('\n');
  console.log('\n' + summary);

  mkdirSync(path.join(ROOT, 'eval'), { recursive: true });
  writeFileSync(path.join(ROOT, 'eval', 'vision-latest.json'), JSON.stringify(records, null, 2));
  if (LOG) appendFileSync(path.join(ROOT, 'EVAL.md'), '\n' + summary + '\n');
}

if (process.argv[1]?.endsWith('eval-vision.js')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
