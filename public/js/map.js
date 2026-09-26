// Small visual map (Leaflet) for sighted companions and the demo video.
// Hidden from screen readers and the keyboard (aria-hidden + inert): the route cards and the spoken
// summary carry the same information. The map is optional: if it fails, the app works without it.

import { crossingLevel } from '../lib/scoring.js';

export const LEVEL_COLORS = { good: '#3ddc84', ok: '#7fd0ff', caution: '#ffb000', risky: '#ff5a5a' };

let L = null;
let map = null;
let layer = null;
let walker = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/leaflet/leaflet.min.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('map library failed to load'));
    document.head.appendChild(s);
  });
}

async function ensureMap(el) {
  L = await loadLeaflet();
  if (!map) {
    map = L.map(el, { zoomControl: false, keyboard: false, scrollWheelZoom: false, attributionControl: true });
    // Standard OpenStreetMap tiles (light use with attribution is allowed); styles.css darkens them.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
  }
  return map;
}

const latLng = ([lon, lat]) => [lat, lon];

function drawCrossings(route, mode) {
  for (const c of route.crossings || []) {
    L.circleMarker([c.lat, c.lon], {
      radius: 7, color: '#000', weight: 2, fillColor: LEVEL_COLORS[crossingLevel(c, mode)], fillOpacity: 1,
    }).addTo(layer);
  }
}

function drawEnds(route) {
  const g = route.geometry;
  L.circleMarker(latLng(g[0]), { radius: 8, color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(layer);
  L.circleMarker(latLng(g[g.length - 1]), { radius: 9, color: '#ffd400', weight: 4, fillColor: '#000', fillOpacity: 1 }).addTo(layer);
}

async function prepare(box) {
  try {
    await ensureMap(box.querySelector('.map'));
  } catch {
    box.hidden = true;
    return false;
  }
  box.hidden = false;
  layer?.remove();
  walker = null;
  layer = L.layerGroup().addTo(map);
  return true;
}

/** Route comparison: all routes (recommended thick yellow, shortest dashed) + crossings of the recommended one. */
export async function showRoutes(box, ranked, mode) {
  if (!(await prepare(box))) return;
  for (const r of [...ranked].reverse()) { // recommended drawn last = on top
    const best = r.rank === 1;
    L.polyline(r.geometry.map(latLng), {
      color: best ? '#ffd400' : '#b8b8b8',
      weight: best ? 7 : 4,
      opacity: best ? 0.95 : 0.7,
      dashArray: !best && r.isShortest ? '10 8' : null,
    }).addTo(layer);
  }
  drawCrossings(ranked[0], mode);
  drawEnds(ranked[0]);
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(ranked.flatMap((r) => r.geometry.map(latLng))).pad(0.08));
  window.__map = { routes: ranked.length, crossings: (ranked[0].crossings || []).length };
}

/** Walking: only the chosen route, its crossings and a dot for the walker. */
export async function showWalk(box, route, mode) {
  if (!(await prepare(box))) return;
  L.polyline(route.geometry.map(latLng), { color: '#ffd400', weight: 7, opacity: 0.95 }).addTo(layer);
  drawCrossings(route, mode);
  drawEnds(route);
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(route.geometry.map(latLng)).pad(0.08));
}

/** Moves the walker dot (and keeps it in view). */
export function showPosition([lon, lat]) {
  if (!map || !layer) return;
  if (!walker) {
    walker = L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#00e5ff', fillOpacity: 1 }).addTo(layer);
  } else {
    walker.setLatLng([lat, lon]);
  }
  if (!map.getBounds().pad(-0.15).contains([lat, lon])) map.panTo([lat, lon], { animate: false });
  window.__walker = [lon, lat];
}
