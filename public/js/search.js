// Live place suggestions while typing, like a map app.
// After 3 letters (known places like "HOIV" from 2), debounced 300 ms, biased to the user's position or Vienna.
// Suggestions are big buttons right after the input: VoiceOver/TalkBack users reach them by swiping right,
// keyboard users with the down arrow. How many there are is announced politely (screen readers only).
// The list is NOT hidden when the input loses focus — that would hide it from a screen reader user
// who is swiping into it.

import { getJSON } from './api.js';
import { MIN_QUERY, matchKnownPlaces, mergeSuggestions } from '../lib/places.js';

const DEBOUNCE_MS = 300;

/**
 * @param {{
 *   input: HTMLInputElement, list: HTMLElement, announcer: HTMLElement,
 *   getFocus: () => [number, number],
 *   onPick: (place: object) => void,
 *   leadingRows?: (query: string) => object[],   // e.g. "Current location" for the start field
 * }} opts
 */
export function attachSuggestions({ input, list, announcer, getFocus, onPick, leadingRows = () => [] }) {
  let timer = null;
  let seq = 0;              // the newest request wins; older answers are dropped
  const cache = new Map();  // query → ORS results, so backspacing costs nothing

  function announce(text) {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = text; }, 30); // must change to be read again
  }

  function render(rows, { quiet = false } = {}) {
    list.innerHTML = '';
    for (const place of rows) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `suggestion${place.current ? ' current' : ''}`;
      b.innerHTML = '<span class="s-name"></span><span class="s-detail"></span>';
      b.querySelector('.s-name').textContent = place.name;
      b.querySelector('.s-detail').textContent = place.detail || '';
      b.setAttribute('aria-label', place.detail ? `${place.name}, ${place.detail}` : place.name);
      b.addEventListener('click', () => { clear(); onPick(place); });
      li.appendChild(b);
      list.appendChild(li);
    }
    list.hidden = rows.length === 0;
    input.setAttribute('aria-expanded', String(rows.length > 0));
    if (!quiet && rows.length) announce(`${rows.length} suggestion${rows.length === 1 ? '' : 's'} below.`);
  }

  function clear() {
    clearTimeout(timer);
    seq++;
    list.innerHTML = '';
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  async function update() {
    const q = input.value.trim();
    const my = ++seq;
    const lead = leadingRows(q);
    const known = matchKnownPlaces(q);
    if (q.length < MIN_QUERY) { render([...lead, ...known]); return; }
    const focus = getFocus();
    const key = `${q.toLowerCase()}|${focus.map((x) => x.toFixed(2)).join(',')}`;
    let remote = cache.get(key);
    if (!remote) {
      try {
        const url = `/api/autocomplete?q=${encodeURIComponent(q)}&focus=${focus[0].toFixed(5)},${focus[1].toFixed(5)}`;
        remote = (await getJSON(url, { timeoutMs: 8000 })).results || [];
        cache.set(key, remote);
      } catch {
        remote = []; // while typing, errors stay silent; Enter runs the full search, which speaks errors
      }
    }
    if (my !== seq) return; // the user typed on meanwhile
    const rows = [...lead, ...mergeSuggestions(known, remote)];
    render(rows);
    if (!rows.length) announce('No suggestions. Press search to look it up.');
  }

  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  list.hidden = true;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (!input.value.trim() && !leadingRows('').length) { clear(); return; }
    timer = setTimeout(update, DEBOUNCE_MS);
  });

  // Keyboard: down arrow into the list, up/down inside it, Escape closes.
  const buttons = () => [...list.querySelectorAll('button')];
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && buttons().length) { e.preventDefault(); buttons()[0].focus(); }
    if (e.key === 'Escape') clear();
  });
  list.addEventListener('keydown', (e) => {
    const all = buttons();
    const i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < all.length - 1) { e.preventDefault(); all[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? all[i - 1] : input).focus(); }
    if (e.key === 'Escape') { clear(); input.focus(); }
  });
  // A tap somewhere else closes the list (a screen reader moving focus does not).
  document.addEventListener('pointerdown', (e) => {
    if (!list.hidden && !list.contains(e.target) && e.target !== input) clear();
  });

  return {
    /** Shows rows chosen elsewhere (e.g. full search results after Enter). */
    show: (rows) => { clearTimeout(timer); seq++; render(rows, { quiet: true }); },
    clear,
    /** Shows the suggestions for what is in the field now (e.g. on focus). */
    refresh: () => { clearTimeout(timer); update(); },
  };
}
