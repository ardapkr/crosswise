// "Where to?" form, the trip options (walking + public transport) and the spoken summary.
// Pure logic comes from /lib; this file does DOM + fetch only.
//
// One search = the walking routes (ORS alternatives, ranked by crossings) AND up to 2 public transport trips
// (Transitous). The walking legs of every trip are routed again with ORS and scored with our crossing data
// (lib/trip.js), so a trip is judged and guided door to door, not only between stops.

import { getJSON } from './api.js';
import { getPosition, lastPosition, HOIV } from './location.js';
import { decodeGroups, crossingsOnRoute } from '../lib/crossings.js';
import { rankRoutes, safetyLevel } from '../lib/scoring.js';
import { routeSummary, describeCrossing, routeCardText, routeBadge, LEVEL_TEXT } from '../lib/summary.js';
import { bbox } from '../lib/geo.js';
import { matchKnownPlaces, mergeSuggestions, fromGeocode, KNOWN_PLACES } from '../lib/places.js';
import {
  walkRequests, buildTrip, firstReachable, orderPlan, planSummary, tripTitle, tripCardText, tripStepsShort,
  tripCrossingsShort, clock,
} from '../lib/trip.js';
import { showRoutes, showOptions, selectRoute, routeStyle, ROUTE_STYLES } from './map.js';
import { attachSuggestions } from './search.js';

const $ = (id) => document.getElementById(id);
export const CURRENT_LOCATION = 'Current location';

export const QUICK_DESTINATIONS = [
  { label: 'Wien Hauptbahnhof', lon: 16.3755, lat: 48.1850 },
  { label: 'Oberes Belvedere', lon: 16.3809, lat: 48.1915 },
];

// Shown in the empty search (before typing): the quick destinations, then the venue.
const SUGGESTED = mergeSuggestions([
  ...QUICK_DESTINATIONS.map((d) => ({ name: d.label, detail: 'Quick destination', lon: d.lon, lat: d.lat, suggested: true })),
  ...KNOWN_PLACES.map(({ name, detail, lon, lat }) => ({ name, detail, lon, lat, suggested: true })),
], []);

const minutes = (s) => Math.max(1, Math.round(s / 60));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {{ getMode: () => string, speak: Function, demo: boolean, onChoose: (plan, route) => void,
 *           onChooseTrip?: (plan, trip) => void, closeSearch?: () => void }} opts
 */
export function initRoutes({ getMode, speak, demo, onChoose, onChooseTrip, closeSearch = () => {} }) {
  let plan = null;      // { from, to, mode, ranked, groups, trips, items, transitFirst, note }
  let fromPlace = null; // chosen start; null = current location
  let comparing = false; // the walking comparison list is open

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
    leadingRows: (q) => (q ? [] : SUGGESTED),
    onPick: (place) => { $('to').value = place.name; run(() => planTo(place)); },
  });
  $('to').addEventListener('focus', () => { if (!$('to').value.trim()) toBox.refresh(); });
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

  // --- planning: walking + public transport ---
  const ll = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const soft = (promise) => promise.then((data) => ({ data }), (error) => ({ error }));

  async function planTo(to) {
    closeSearch();
    const mode = getMode();
    const from = await resolveStart();
    speak(`${from.note ? from.note + ' ' : ''}Finding the safest way to ${to.name || to.label}.`);
    const a = [from.lon, from.lat];
    const b = [to.lon, to.lat];

    // walking routes and public transport at the same time; either may fail without killing the other
    const [walk, transit] = await Promise.all([
      soft(getJSON(`/api/route?from=${from.lon},${from.lat}&to=${to.lon},${to.lat}&mode=${mode}`)),
      soft(getJSON(`/api/transit?from=${ll(a)}&to=${ll(b)}&mode=${mode}`, { timeoutMs: 15000 })),
    ]);
    const walkRoutes = walk.data?.routes || [];
    const patterns = transit.data?.patterns || [];
    if (!walkRoutes.length && !patterns.length) {
      if (walk.error) throw walk.error;
      speak('No route found.');
      return;
    }

    // our own walking route for every walking leg of the trips (to the stop, changes, to the destination)
    const legRoutes = new Map(await Promise.all(walkRequests(patterns.flatMap((p) => p.options)).map(async (r) => {
      const res = await soft(getJSON(`/api/route?from=${ll(r.from)}&to=${ll(r.to)}&mode=${mode}&leg=1`));
      return [r.key, res.data?.routes?.length ? res.data.routes : null];
    })));

    // crossings for everything the user walks, in one request
    const walked = [
      ...walkRoutes.flatMap((r) => r.geometry),
      ...[...legRoutes.values()].flat().filter(Boolean).flatMap((r) => r.geometry),
      ...patterns.flatMap((p) => p.options[0].legs.filter((l) => l.kind === 'walk').flatMap((l) => l.geometry)),
    ];
    const box = bbox(walked, 50);
    const cx = await getJSON(`/api/crossings?bbox=${box.map((x) => x.toFixed(6)).join(',')}`);
    const groups = decodeGroups(cx.rows);
    const withCrossings = (r) => ({ ...r, crossings: crossingsOnRoute(groups, r.geometry) });

    const ranked = rankRoutes(walkRoutes.map(withCrossings), mode);
    const scoredLegs = new Map([...legRoutes].map(([k, rs]) => [k, rs && rs.map(withCrossings)]));
    const now = Date.now();
    const trips = patterns
      .map((p) => firstReachable(p.options.map((o) => buildTrip(o, { routesFor: (k) => scoredLegs.get(k), groups, mode })), now))
      .filter(Boolean);
    const walkBest = ranked[0] ? { ...ranked[0], kind: 'walk' } : null;
    const { items, transitFirst } = orderPlan(walkBest, trips);

    let note = '';
    if (transit.error) note = 'Public transport information is not available right now.';
    else if (!patterns.length) note = 'No public transport connection found.';
    else if (transit.data.fallback) note = 'Live timetable not available: public transport times are examples.';
    plan = { from, to, mode, ranked, groups, trips, items, transitFirst, note };
    comparing = !trips.length; // without public transport the walking comparison is the whole answer
    renderAll();
    speak(planSummary({
      walkBest, walkSummary: ranked.length ? routeSummary(ranked, mode) : null, trips, transitFirst, now, note,
    })); // info: the newest summary replaces an older one
  }

  // A small line in the route's map colour and pattern, so card and map line can be matched at a glance.
  function swatch({ color, dash }) {
    return `<svg class="swatch" viewBox="0 0 44 12" aria-hidden="true" focusable="false"><line x1="5" y1="6" x2="39" y2="6"
      stroke="${color}" stroke-width="6" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash.split(' ').map((n) => n / 2).join(' ')}"` : ''}/></svg>`;
  }

  /** Tapping a card highlights its route on the map and reads the card out. */
  function pick(item, { quiet = false } = {}) {
    for (const list of [$('options'), $('routes')]) {
      for (const b of list.querySelectorAll('.route-pick')) b.setAttribute('aria-pressed', String(b.dataset.id === item.id));
      for (const li of list.children) li.classList.toggle('selected', li.dataset.id === item.id);
    }
    selectRoute(item.id);
    if (quiet) return;
    if (item.kind === 'transit') speak(tripCardText(item, plan.mode, Date.now()));
    else speak(routeCardText(item, plan.mode));
  }

  /** A card shell: title button (the accessible name of the card) + body + Start button. */
  function card({ item, title, time, level, styleOf, startLabel, startAria, body }) {
    const li = document.createElement('li');
    li.className = `route level-${level}${item.kind === 'transit' ? ' trip' : ''}`;
    li.dataset.id = item.id;
    li.innerHTML = `
      <h3><button type="button" class="route-pick" aria-pressed="false">${swatch(styleOf)}<span class="title"></span><span class="sr-only">: </span><span class="time"></span></button></h3>
      <div class="body"></div>
      <button type="button" class="btn go"><svg class="icon" aria-hidden="true"><use href="#i-go"/></svg><span></span></button>`;
    li.querySelector('.title').textContent = title;
    li.querySelector('.time').textContent = time;
    li.querySelector('.route-pick').dataset.id = item.id;
    li.querySelector('.body').replaceWith(...body);
    const go = li.querySelector('.go');
    go.querySelector('span').textContent = startLabel;
    go.setAttribute('aria-label', startAria); // starts with the visible text (WCAG 2.5.3)
    li.addEventListener('click', (e) => { if (!e.target.closest('.go')) pick(item); });
    return { li, go };
  }

  const p = (cls, text) => { const el = document.createElement('p'); el.className = cls; el.textContent = text; return el; };

  function walkBody(r, mode) {
    const level = safetyLevel(r.score);
    const worst = p('worst', '');
    worst.innerHTML = '<span class="label">Worst crossing:</span> <span class="value"></span>';
    worst.querySelector('.value').textContent = r.score.count ? describeCrossing(r.score.worstCrossing, mode) : 'No road crossings';
    return [
      p('meta', `${(r.distance / 1000).toFixed(1)} km · ${r.score.count} crossing${r.score.count === 1 ? '' : 's'}` +
        (r.score.withSound ? ` · ${r.score.withSound} with sound` : '')),
      p('level', LEVEL_TEXT[level]),
      worst,
    ];
  }

  /** The walking comparison (all ORS alternatives: recommended, shortest = the baseline, alternative). */
  function renderWalking(ranked, mode) {
    const ol = $('routes');
    ol.innerHTML = '';
    for (const r of ranked) {
      const badge = routeBadge(r);
      const { li, go } = card({
        item: r, title: badge, time: `${minutes(r.duration)} min`, level: safetyLevel(r.score), styleOf: routeStyle(r.rank),
        startLabel: 'Start this route',
        startAria: `Start this route: ${badge.split(' · ')[0].toLowerCase()}, ${minutes(r.duration)} minutes`,
        body: walkBody(r, mode),
      });
      go.addEventListener('click', () => onChoose?.(plan, r));
      ol.appendChild(li);
    }
  }

  function tripBody(t, mode) {
    const legs = document.createElement('ol');
    legs.className = 'legs';
    tripStepsShort(t).forEach((text, i) => {
      const li = document.createElement('li');
      li.className = t.legs[i].kind;
      li.textContent = text;
      legs.appendChild(li);
    });
    const out = [
      p('times', `Leave ${clock(t.leave)} · arrive ${clock(t.arrive)}${t.transfers ? ` · ${t.transfers} change${t.transfers === 1 ? '' : 's'}` : ''}`),
      p('level', cap(tripCrossingsShort(t))),
      legs,
    ];
    if (mode === 'wheelchair') {
      out.push(p('access', t.wheelchair === 'yes' ? 'Vehicles marked wheelchair accessible (timetable). Step-free walking requested.'
        : t.wheelchair === 'no' ? 'A vehicle is marked NOT wheelchair accessible.' : 'Wheelchair access of the vehicles: unknown.'));
    }
    if (t.tight) out.push(p('access', 'Tight change: our walking route takes longer than the time between the rides.'));
    return out;
  }

  /** The options list: the safest walking route and up to 2 public transport trips, best first. */
  function renderOptions() {
    const ol = $('options');
    ol.innerHTML = '';
    plan.items.forEach((item, i) => {
      const styleOf = { color: ROUTE_STYLES[i % ROUTE_STYLES.length].color, dash: null };
      const first = i === 0 ? 'Recommended · ' : '';
      if (item.kind === 'transit') {
        const title = tripTitle(item);
        const { li, go } = card({
          item, title: `${first}${title}`, time: `${minutes(item.duration)} min`, level: safetyLevel(item.score), styleOf,
          startLabel: 'Start this trip', startAria: `Start this trip: ${title}, ${minutes(item.duration)} minutes`,
          body: tripBody(item, plan.mode),
        });
        go.addEventListener('click', () => onChooseTrip?.(plan, item));
        ol.appendChild(li);
      } else {
        const body = walkBody(item, plan.mode);
        const shortest = plan.ranked.find((r) => r.isShortest);
        if (shortest && shortest.id !== item.id) {
          body.push(p('compare', `Shortest walk: ${minutes(shortest.duration)} min, ${LEVEL_TEXT[safetyLevel(shortest.score)].toLowerCase()}.`));
        }
        const { li, go } = card({
          item, title: `${first}Walk`, time: `${minutes(item.duration)} min`, level: safetyLevel(item.score), styleOf,
          startLabel: 'Start this route', startAria: `Start this route: walk, ${minutes(item.duration)} minutes`, body,
        });
        go.addEventListener('click', () => onChoose?.(plan, plan.ranked.find((r) => r.id === item.id)));
        ol.appendChild(li);
      }
    });
    $('options-note').textContent = plan.note;
    $('options-note').hidden = !plan.note;
  }

  function renderAll() {
    const hasTrips = plan.trips.length > 0;
    renderWalking(plan.ranked, plan.mode);
    if (hasTrips) renderOptions();
    $('options-section').hidden = !hasTrips;
    $('walk-compare').textContent = comparing ? 'Hide the walking comparison' : `Compare walking routes (${plan.ranked.length})`;
    $('walk-compare').setAttribute('aria-expanded', String(comparing));
    $('walk-compare').hidden = !plan.ranked.length;
    $('routes-section').hidden = !comparing || !plan.ranked.length;
    drawMap();
    (hasTrips ? $('options-heading') : $('routes-heading')).focus(); // screen readers land on the results
  }

  /** The map shows the options, or the walking routes while comparing them. */
  function drawMap({ selectedId } = {}) {
    if (comparing || !plan.trips.length) {
      showRoutes($('map-box'), plan.ranked); // optional visual, not awaited
      const first = plan.ranked.find((r) => r.id === selectedId) || plan.ranked[0];
      if (first) pick(first, { quiet: true });
    } else {
      const first = plan.items.find((r) => r.id === selectedId) || plan.items[0];
      showOptions($('map-box'), plan.items, { selectedId: first.id });
      pick(first, { quiet: true });
    }
  }

  $('walk-compare').addEventListener('click', () => {
    if (!plan) return;
    comparing = !comparing;
    renderAll();
    if (comparing) {
      $('routes-heading').focus();
      speak(routeSummary(plan.ranked, plan.mode));
    }
  });

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
    /** After walking / riding: show the plan on the map again. */
    redraw: () => { if (plan) drawMap(); },
  };
}
