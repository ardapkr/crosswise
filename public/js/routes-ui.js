// "Where to?" form, route comparison cards and the spoken summary.
// Pure logic comes from /lib; this file does DOM + fetch only.

import { getJSON } from './api.js';
import { getPosition, lastPosition, HOIV } from './location.js';
import { decodeGroups, crossingsOnRoute } from '../lib/crossings.js';
import { rankRoutes, safetyLevel } from '../lib/scoring.js';
import { routeSummary, describeCrossing } from '../lib/summary.js';
import { bbox } from '../lib/geo.js';
import { matchKnownPlaces, mergeSuggestions, fromGeocode } from '../lib/places.js';
import { showRoutes } from './map.js';
import { attachSuggestions } from './search.js';

const $ = (id) => document.getElementById(id);
export const CURRENT_LOCATION = 'Current location';

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
  let plan = null;      // { from, to, ranked, groups }
  let fromPlace = null; // chosen start; null = current location

  // Search is biased to where the user is (or HOIV / Vienna when we don't know yet).
  const focus = () => (demo ? null : lastPosition()) || [HOIV.lon, HOIV.lat];
  const focusParam = () => focus().map((x) => x.toFixed(5)).join(',');

  // --- start position: "Current location" unless the user picked or typed another start ---
  async function resolveStart() {
    if (fromPlace) return fromPlace;
    const text = $('from').value.trim();
    if (text && text.toLowerCase() !== CURRENT_LOCATION.toLowerCase()) {
      const place = await findFirst(text);
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

  /** Known places (HOIV, the station entrance) first, then the ORS full search. */
  async function findAll(q) {
    const data = await getJSON(`/api/geocode?q=${encodeURIComponent(q)}&focus=${focusParam()}`);
    return mergeSuggestions(matchKnownPlaces(q), data.results.map(fromGeocode));
  }
  async function findFirst(q) {
    return matchKnownPlaces(q)[0] || (await findAll(q))[0] || null;
  }

  // --- live suggestions while typing ---
  const toBox = attachSuggestions({
    input: $('to'), list: $('to-suggestions'), announcer: $('suggest-status'), getFocus: focus,
    onPick: (place) => { $('to').value = place.name; run(() => planTo(place)); },
  });
  const currentRow = { current: true, name: CURRENT_LOCATION, detail: demo ? 'Demo: HOIV' : 'Use GPS' };
  const fromBox = attachSuggestions({
    input: $('from'), list: $('from-suggestions'), announcer: $('suggest-status'), getFocus: focus,
    leadingRows: (q) => (q && q.toLowerCase() !== CURRENT_LOCATION.toLowerCase() ? [currentRow] : []),
    onPick: (place) => {
      fromPlace = place.current ? null : place;
      $('from').value = place.name;
      speak(place.current ? 'Starting from your current location.' : `Starting from ${place.name}.`);
      if (plan) run(() => planTo(plan.to)); // a destination is already chosen: plan again from the new start
      else $('to').focus();
    },
  });
  $('from').value = CURRENT_LOCATION;
  $('from').addEventListener('focus', () => $('from').select()); // typing replaces "Current location"
  $('from').addEventListener('input', () => { fromPlace = null; });
  $('from').addEventListener('blur', () => { if (!$('from').value.trim()) $('from').value = CURRENT_LOCATION; });

  // --- full search (Enter / search button) ---
  async function search(q) {
    toBox.clear();
    speak(`Searching for ${q}.`);
    const results = await findAll(q);
    if (!results.length) { speak(`I found nothing for ${q}. Try another name.`); return; }
    if (results.length === 1) { await planTo(results[0]); return; }
    toBox.show(results);
    speak(`${results.length} places found. First: ${results[0].name}. Choose one.`);
    $('to-suggestions').querySelector('button')?.focus();
  }

  /** Voice: "take me to X" → first search result, planned directly (the summary names the place). */
  async function planToPlace(q) {
    $('to').value = q;
    const place = await findFirst(q);
    if (!place) { speak(`I could not find ${q}. Try another name.`); return; }
    await planTo(place);
  }

  // --- routes ---
  async function planTo(to) {
    const mode = getMode();
    const from = await resolveStart();
    speak(`${from.note ? from.note + ' ' : ''}Finding the safest route to ${to.name || to.label}.`);
    const data = await getJSON(`/api/route?from=${from.lon},${from.lat}&to=${to.lon},${to.lat}&mode=${mode}`);
    if (!data.routes?.length) { speak('No walking route found.'); return; }

    const box = bbox(data.routes.flatMap((r) => r.geometry), 50);
    const cx = await getJSON(`/api/crossings?bbox=${box.map((x) => x.toFixed(6)).join(',')}`);
    const groups = decodeGroups(cx.rows);
    const routes = data.routes.map((r) => ({ ...r, crossings: crossingsOnRoute(groups, r.geometry) }));
    const ranked = rankRoutes(routes, mode);
    plan = { from, to, mode, ranked, groups };
    render(ranked, mode);
    showRoutes($('map-box'), ranked, mode); // optional visual, not awaited
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
    fromBox.clear();
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
    planToPlace: (q) => run(() => planToPlace(q)),
    /** Mode changed: wheelchair uses another ORS profile, so plan again. */
    replan: () => { if (plan) run(() => planTo(plan.to)); },
  };
}
