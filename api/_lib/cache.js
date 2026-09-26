// Small in-memory cache for API responses (ORS / Overpass free tiers have rate limits).
// Lives as long as the serverless instance stays warm — good enough for a demo.

export function createCache({ max = 200, ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expires) { map.delete(key); return undefined; }
      // refresh LRU position
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      map.set(key, { value, expires: Date.now() + ttlMs });
      while (map.size > max) map.delete(map.keys().next().value);
    },
    get size() { return map.size; },
  };
}
