// Voice-command accuracy on the labelled corpus (test/voice/corpus.json): what share of realistic utterances
// (natural phrasing, speech-recognizer errors, trip context, Viennese/German, edge cases and safety questions)
// the app understands as the user meant. Numbers for README/EVAL.md.
//
//   node scripts/eval-voice.js            → accuracy per lens and per context
//   node scripts/eval-voice.js --fails    → also list every miss
//   node scripts/eval-voice.js --baseline → the old keyword parser (lib/commands.js parseAlternatives, no context)
//   node scripts/eval-voice.js --json     → machine-readable summary
//
// A hit = same action and the same important arguments (line, place, mode, option, index, change, by).

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const corpus = JSON.parse(readFileSync('test/voice/corpus.json', 'utf8'));

/** The understanding function under test: (text, alternatives, context) → { action, ... } */
async function loadInterpreter() {
  if (!args.has('--baseline') && existsSync('public/lib/intent.js')) {
    const mod = await import(pathToFileURL('public/lib/intent.js').href);
    return { name: 'intent.js', fn: (it) => mod.interpret([it.text, ...(it.alternatives || [])], { state: it.context }) };
  }
  const mod = await import(pathToFileURL('public/lib/commands.js').href);
  return { name: 'commands.js (baseline)', fn: (it) => mod.parseAlternatives([it.text, ...(it.alternatives || [])]) };
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an|to|please)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Does the result match what the user meant? */
export function matches(expected, got) {
  if (!got || got.action !== expected.action) return false;
  const e = expected;
  if (e.action === 'find_bus') return (e.line || '') === (got.line || '');
  if (e.action === 'navigate') {
    const a = norm(e.place);
    const b = norm(got.place);
    if (!b || !(a === b || a.includes(b) || b.includes(a))) return false;
    return !e.by || e.by === got.by;
  }
  if (e.action === 'set_mode') return e.mode === got.mode;
  if (e.action === 'speech_rate') return e.change === got.change;
  if (e.action === 'choose') return Number(e.index) === Number(got.index);
  if (e.action === 'start') return e.option === undefined || String(e.option) === String(got.option);
  return true;
}

function table(title, groups) {
  console.log(`\n${title}`);
  for (const [k, v] of Object.entries(groups).sort()) {
    console.log(`  ${k.padEnd(18)} ${String(v.hit).padStart(3)}/${String(v.n).padEnd(3)} ${(100 * v.hit / v.n).toFixed(0).padStart(3)}%`);
  }
}

const { name, fn } = await loadInterpreter();
const byLens = {};
const byContext = {};
const byAction = {};
const fails = [];
let hit = 0;
let unsafe = 0;
for (const it of corpus) {
  const got = await fn(it);
  const ok = matches(it.expected, got);
  // safety: a question about crossing must never become "unknown" silence or a wrong action that could be taken as "go"
  if (it.expected.action === 'safety_question' && !ok && got?.action !== 'check_light') unsafe++;
  for (const [g, k] of [[byLens, it.lens], [byContext, it.context], [byAction, it.expected.action]]) {
    g[k] = g[k] || { n: 0, hit: 0 };
    g[k].n++;
    if (ok) g[k].hit++;
  }
  if (ok) hit++;
  else fails.push({ text: it.text, context: it.context, expected: it.expected, got });
}

if (args.has('--json')) {
  console.log(JSON.stringify({ parser: name, n: corpus.length, hit, accuracy: hit / corpus.length, byLens, byContext, byAction, unsafe }));
} else {
  console.log(`Voice command accuracy — ${name}: ${hit}/${corpus.length} = ${(100 * hit / corpus.length).toFixed(1)}%`);
  console.log(`Safety questions not handled safely: ${unsafe}`);
  table('By lens', byLens);
  table('By context', byContext);
  table('By expected action', byAction);
  if (args.has('--fails')) {
    console.log('\nMisses:');
    for (const f of fails) console.log(`  [${f.context}] "${f.text}" → expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.got)}`);
  }
}
