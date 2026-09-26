// Small geometry helpers. All points are GeoJSON order: [lon, lat]. Distances in metres.
// Pure module: no DOM, no fetch.

const R = 6371008.8; // mean Earth radius (m)
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance between two [lon, lat] points (haversine). */
export function distance(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Local flat projection around a reference latitude: fine for a few km (city scale).
function project(p, lat0) {
  return [rad(p[0]) * R * Math.cos(rad(lat0)), rad(p[1]) * R];
}

/**
 * Shortest distance from point p to a polyline.
 * @returns {{distance:number, segment:number, t:number, along:number, point:number[]}}
 *   segment = index of the closest segment, t = 0..1 position on it,
 *   along = metres from the line start to the closest point, point = closest point [lon, lat].
 */
export function pointToLineDistance(p, line) {
  const lat0 = p[1];
  const P = project(p, lat0);
  let best = { distance: Infinity, segment: 0, t: 0, along: 0, point: line[0] };
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const A = project(line[i], lat0);
    const B = project(line[i + 1], lat0);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = A[0] + t * dx;
    const cy = A[1] + t * dy;
    const d = Math.hypot(P[0] - cx, P[1] - cy);
    const segLen = Math.sqrt(len2);
    if (d < best.distance) {
      best = {
        distance: d,
        segment: i,
        t,
        along: walked + t * segLen,
        point: [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])],
      };
    }
    walked += segLen;
  }
  if (line.length === 1) best.distance = distance(p, line[0]);
  return best;
}

/** Total length of a polyline in metres. */
export function lineLength(line) {
  let sum = 0;
  for (let i = 0; i < line.length - 1; i++) sum += distance(line[i], line[i + 1]);
  return sum;
}

/** The point `metres` along the polyline (clamped to its ends). */
export function pointAlong(line, metres) {
  if (metres <= 0) return line[0];
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const seg = distance(line[i], line[i + 1]);
    if (walked + seg >= metres) {
      const t = seg === 0 ? 0 : (metres - walked) / seg;
      return [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])];
    }
    walked += seg;
  }
  return line[line.length - 1];
}

/** Bounding box [west, south, east, north] of points, optionally padded by metres. */
export function bbox(points, padMetres = 0) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  if (padMetres > 0) {
    const dLat = (padMetres / R) * (180 / Math.PI);
    const dLon = dLat / Math.cos(rad((s + n) / 2));
    w -= dLon; e += dLon; s -= dLat; n += dLat;
  }
  return [w, s, e, n];
}

export function bboxContains([w, s, e, n], [lon, lat]) {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Compass bearing from a to b in degrees (0 = north, 90 = east). */
export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
