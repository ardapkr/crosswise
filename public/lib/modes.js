// The three user modes and what they mean for routing.
// Pure module: no DOM, no fetch. Used by the browser, the /api functions and the tests.

export const MODES = [
  { id: 'blind', label: 'Blind / low vision' },
  { id: 'wheelchair', label: 'Wheelchair' },
  { id: 'limited', label: 'Limited mobility' },
];

export const DEFAULT_MODE = 'blind';

/** Turns whatever was stored (maybe nothing, maybe garbage) into a valid mode id. */
export function normalizeMode(value) {
  return MODES.some((m) => m.id === value) ? value : DEFAULT_MODE;
}

/** OpenRouteService profile + extra options for a mode. */
export function orsOptionsForMode(mode) {
  switch (normalizeMode(mode)) {
    case 'wheelchair':
      return { profile: 'wheelchair', options: {} };
    case 'limited':
      return { profile: 'foot-walking', options: { avoid_features: ['steps'] } };
    default:
      return { profile: 'foot-walking', options: {} };
  }
}
