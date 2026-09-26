// "Where to?" form, route comparison cards and the spoken summary.
// Pure logic comes from /lib; this file does DOM + fetch only.

import { getJSON } from './api.js';
import { getPosition, HOIV } from './location.js';
import { decodeGroups, crossingsOnRoute } from '../lib/crossings.js';
import { rankRoutes, safetyLevel } from '../lib/scoring.js';
import { routeSummary, describeCrossing } from '../lib/summary.js';
import { bbox } from '../lib/geo.js';

const $ = (id) => document.getElementById(id);

export const QUICK_DESTINATIONS = [
  { label: 'Wien Hauptbahnhof', lon: 16.3755, lat: 48.1850 },
  { label: 'Oberes Belvedere', lon: 16.3809, lat: 48.1915 },
];

const LEVEL_TEXT = {
  good: 'All crossings with lights and sound',
  ok: 'All crossings with lights',
  caution: 'Has a crossing without lights',
  risky: 'Has a risky or unknown crossing',
};

/**
 * @param {{ getMode: () => string, speak: Function, demo: boolean, onChoose: (plan, route) => void }} opts
 */
export function initRoutes({ getMode, speak, demo, onChoose }) {
  let plan = null; // { from, to, ranked, groups }

  // --- start position ---
  async function resolveStart() {
    const text = $('from').value.trim();
    if (text) {
      const place = await geocodeFirst(text);
      if (!place) throw new Error(`I could not find the start "${text}".`);
      return place;
    }
    if (demo) return HOIV;
    try {
      const p = await getPosition();
      return { lon: p.lon, lat: p.lat, label: 'your location' };
    } catch (e) {
      // spoken together with "Finding the safest route" so it is not cut off
      return { ...HOIV, note: `${e.message} Starting from ${HOIV.label} instead.` };
    }
  }

  async function geocodeFirst(q) {
    const data = await getJSON(`/api/geocode?q=${encodeURIComponent(q)}&focus=${HOIV.lon},${HOIV.lat}`);
    return data.results[0] || null;
  }

  // --- destination search ---
  async function search(q) {
    const list = $('places');
    list.innerHTML = '';
    speak(`Searching for ${q}.`);
    const data = await getJSON(`/api/geocode?q=${encodeURIComponent(q)}&focus=${HOIV.lon},${HOIV.lat}`);
    if (!data.results.length) { speak(`I found nothing for ${q}. Try another name.`); return; }
    if (data.results.length === 1) { await planTo(data.results[0]); return; }
    for (const place of data.results) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = place.label;
      b.addEventListener('click', () => { list.innerHTML = ''; run(() => planTo(place)); });
      li.appendChild(b);
      list.appendChild(li);
    }
    speak(`${data.results.length} places found. First: ${data.results[0].label}. Choose one.`);
    list.querySelector('button')?.focus();
  }

  // --- routes ---
  async function planTo(to) {
    const mode = getMode();
    const from = await resolveStart();
    speak(`${from.note ? from.note + ' ' : ''}Finding the safest route to ${to.label || to.name}.`);
    const data = await getJSON(`/api/route?from=${from.lon},${from.lat}&to=${to.lon},${to.lat}&mode=${mode}`);
    if (!data.routes?.length) { speak('No walking route found.'); return; }

    const box = bbox(data.routes.flatMap((r) => r.geometry), 50);
    const cx = await getJSON(`/api/crossings?bbox=${box.map((x) => x.toFixed(6)).join(',')}`);
    const groups = decodeGroups(cx.rows);
    const routes = data.routes.map((r) => ({ ...r, crossings: crossingsOnRoute(groups, r.geometry) }));
    const ranked = rankRoutes(routes, mode);
    plan = { from, to, mode, ranked, groups };
    render(ranked, mode);
    speak(routeSummary(ranked, mode)); // info: the newest summary replaces an older one
  }

  function render(ranked, mode) {
    const ol = $('routes');
    ol.innerHTML = '';
    for (const r of ranked) {
      const level = safetyLevel(r.score);
      const li = document.createElement('li');
      li.className = `route level-${level}`;
      const badges = [r.rank === 1 ? 'Recommended' : null, r.isShortest ? 'Shortest' : null].filter(Boolean);
      const title = `${badges.length ? badges.join(' · ') : 'Alternative'}: ${Math.max(1, Math.round(r.duration / 60))} min`;
      const worst = r.score.count ? describeCrossing(r.score.worstCrossing, mode) : 'No road crossings';
      li.innerHTML = `
        <h3></h3>
        <p class="meta"></p>
        <p class="level"></p>
        <p class="worst"><span class="label">Worst crossing:</span> <span class="value"></span></p>
        <button type="button" class="go">Start this route</button>`;
      li.querySelector('h3').textContent = title;
      li.querySelector('.meta').textContent =
        `${(r.distance / 1000).toFixed(1)} km · ${r.score.count} crossing${r.score.count === 1 ? '' : 's'}` +
        (r.score.withSound ? ` · ${r.score.withSound} with sound` : '');
      li.querySelector('.level').textContent = LEVEL_TEXT[level];
      li.querySelector('.worst .value').textContent = worst;
      const go = li.querySelector('.go');
      go.setAttribute('aria-label', `Start the ${badges[0] || 'alternative'} route, ${Math.round(r.duration / 60)} minutes`);
      go.addEventListener('click', () => onChoose?.(plan, r));
      ol.appendChild(li);
    }
    $('routes-section').hidden = false;
    $('routes-heading').focus(); // screen readers land on the results
  }

  // Wrap async actions: errors are spoken, never silent.
  async function run(fn) {
    const busy = $('find');
    busy.disabled = true;
    try { await fn(); } catch (e) { speak(e.message || 'Something went wrong.', 'info'); } finally { busy.disabled = false; }
  }

  // --- wire up the form ---
  $('route-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $('to').value.trim();
    if (!q) { speak('Type or say a destination first.'); $('to').focus(); return; }
    run(() => search(q));
  });

  const quick = $('quick');
  for (const d of QUICK_DESTINATIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d.label;
    b.addEventListener('click', () => { $('to').value = d.label; run(() => planTo(d)); });
    quick.appendChild(b);
  }

  return {
    get plan() { return plan; },
    planTo: (to) => run(() => planTo(to)),
    search: (q) => run(() => search(q)),
    /** Mode changed: wheelchair uses another ORS profile, so plan again. */
    replan: () => { if (plan) run(() => planTo(plan.to)); },
  };
}
