// The map (Leaflet + OpenStreetMap tiles) for sighted users and companions.
// Hidden from screen readers (aria-hidden): the route cards and the spoken summary carry the same information.
// Optional: if Leaflet fails to load, the app works without it.
// We only DRAW here — our own routing and crossing alerts stay in charge (no hand-over to another map app).

import { crossingType } from '../lib/scoring.js';

/** Crossing dots by type — same colours in the legend. */
export const CROSSING_COLORS = { sound: '#3ddc84', lights: '#ffd23f', zebra: '#ff9f1c', unmarked: '#ff5a5a' };

/** One colour + line pattern per route, in rank order (1 = recommended). The pattern helps colour-blind users;
 *  the colours are kept away from the crossing colours (green / yellow / orange / red). */
export const ROUTE_STYLES = [
  { color: '#a78bfa', dash: null },        // violet, solid (recommended = the app's accent)
  { color: '#38bdf8', dash: '12 9' },      // sky blue, dashed
  { color: '#f0abfc', dash: '1 11' },      // pink, dotted
];
export const routeStyle = (rank) => ROUTE_STYLES[(rank - 1) % ROUTE_STYLES.length];

let L = null;
let map = null;
let layer = null;       // everything we draw, cleared on each new plan
let dots = null;        // crossing dots of the selected route
let walker = null;
let pendingWalker = null; // a position that arrived while the map was still getting ready
let lines = new Map();  // route id → { line, route }
let selected = null;
let padding = () => ({ top: 24, right: 24, bottom: 24, left: 24 }); // the UI covers parts of the map

/** The UI tells us which parts of the map are covered (search bar, bottom sheet) so routes stay visible. */
export function setMapPadding(fn) { padding = fn; }

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

/** Creates the map once (in `el`). Resolves to the Leaflet map, or null if Leaflet can't load. */
export async function ensureMap(el, { interactive = false, center = [48.1761, 16.3954], zoom = 15 } = {}) {
  try { L = await loadLeaflet(); } catch { return null; }
  if (!map) {
    map = L.map(el, {
      zoomControl: false, keyboard: false, attributionControl: false,
      dragging: interactive, touchZoom: interactive, doubleClickZoom: interactive,
      scrollWheelZoom: interactive, boxZoom: false, tap: false,
    }).setView(center, zoom);
    // Standard OpenStreetMap tiles (light use with attribution is allowed; the attribution link is shown
    // by the page, outside the aria-hidden map). styles.css darkens them to match the app.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  }
  return map;
}

const latLng = ([lon, lat]) => [lat, lon];

function fitTo(latLngs, animate = true) {
  if (!latLngs.length) return;
  const p = padding();
  map.fitBounds(L.latLngBounds(latLngs), {
    paddingTopLeft: [p.left, p.top], paddingBottomRight: [p.right, p.bottom], animate, maxZoom: 17,
  });
}

function drawDots(route) {
  dots?.remove();
  dots = L.layerGroup().addTo(layer);
  for (const c of route?.crossings || []) {
    L.circleMarker([c.lat, c.lon], {
      radius: 8, color: '#0b0b10', weight: 3, fillColor: CROSSING_COLORS[crossingType(c)], fillOpacity: 1,
    }).addTo(dots);
  }
}

function drawEnds(route) {
  const g = route.geometry;
  L.circleMarker(latLng(g[0]), { radius: 8, color: '#0b0b10', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }).addTo(layer);
  L.circleMarker(latLng(g[g.length - 1]), { radius: 10, color: '#ffffff', weight: 4, fillColor: '#0b0b10', fillOpacity: 1 }).addTo(layer);
}

async function prepare(box) {
  // forget the old plan right away (before waiting for Leaflet), so a quick card tap can't hit old lines
  layer?.remove();
  layer = null;
  walker = null;
  pendingWalker = null;
  lines = new Map();
  selected = null;
  const m = await ensureMap(box.querySelector('.map'));
  if (!m) { box.hidden = true; return false; }
  box.hidden = false;
  m.invalidateSize();
  layer = L.layerGroup().addTo(map);
  return true;
}

function styleLines() {
  for (const [id, { line, route }] of lines) {
    const on = id === selected;
    const { color, dash } = routeStyle(route.rank);
    line.setStyle({
      color, dashArray: dash, lineCap: 'round', lineJoin: 'round',
      weight: on ? 9 : route.rank === 1 ? 6 : 5, // the recommended route stays thicker than the others
      opacity: on ? 1 : 0.5,
    });
    if (on) line.bringToFront();
  }
  dots?.eachLayer((d) => d.bringToFront());
}

/** Route comparison: every route in its own colour, the selected one (default: recommended) on top. */
export async function showRoutes(box, ranked) {
  if (!(await prepare(box))) return;
  for (const r of [...ranked].reverse()) lines.set(r.id, { line: L.polyline(r.geometry.map(latLng)).addTo(layer), route: r });
  drawEnds(ranked[0]);
  selectRoute(ranked[0].id, { fit: false });
  fitTo(ranked.flatMap((r) => r.geometry.map(latLng)), false);
}

/** Highlights one route (tapped route card): thick + on top, its crossings as dots, zoomed to it. */
export function selectRoute(id, { fit = true } = {}) {
  const hit = lines.get(id);
  if (!map || !hit) return;
  selected = id;
  drawDots(hit.route);
  styleLines();
  if (fit) fitTo(hit.route.geometry.map(latLng));
  window.__map = { routes: lines.size, crossings: (hit.route.crossings || []).length, selected: id };
}

/** Walking: only the chosen route, its crossings and a dot for the walker. */
export async function showWalk(box, route) {
  if (!(await prepare(box))) return;
  lines.set(route.id, { line: L.polyline(route.geometry.map(latLng)).addTo(layer), route });
  drawEnds(route);
  selectRoute(route.id, { fit: false });
  fitTo(route.geometry.map(latLng), false);
  if (pendingWalker) showPosition(pendingWalker);
}

/** Moves the walker dot (and keeps it in view). */
export function showPosition([lon, lat]) {
  if (!map || !layer) { pendingWalker = [lon, lat]; return; }
  if (!walker) {
    walker = L.circleMarker([lat, lon], { radius: 10, color: '#ffffff', weight: 4, fillColor: '#a78bfa', fillOpacity: 1 }).addTo(layer);
  } else {
    walker.setLatLng([lat, lon]);
  }
  walker.bringToFront();
  if (!map.getBounds().pad(-0.2).contains([lat, lon])) map.panTo([lat, lon], { animate: true });
  window.__walker = [lon, lat];
}

