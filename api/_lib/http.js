// Shared helpers for the /api functions.

/** Parses "lon,lat" into [lon, lat] or returns null. */
export function parseLonLat(s) {
  if (typeof s !== 'string') return null;
  const parts = s.split(',').map(Number);
  if (parts.length !== 2 || parts.some((x) => !Number.isFinite(x))) return null;
  const [lon, lat] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

/** Parses "w,s,e,n" into a bbox array or returns null. */
export function parseBbox(s) {
  if (typeof s !== 'string') return null;
  const b = s.split(',').map(Number);
  if (b.length !== 4 || b.some((x) => !Number.isFinite(x))) return null;
  if (b[0] >= b[2] || b[1] >= b[3]) return null;
  return b;
}

export function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

/** fetch with a timeout so a slow upstream never hangs the function. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function requireKey(res, name) {
  if (!process.env[name]) {
    fail(res, 500, `${name} is not configured on the server`);
    return false;
  }
  return true;
}
