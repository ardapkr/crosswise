import { describe, it, expect } from 'vitest';
import { MODES, normalizeMode, orsOptionsForMode } from '../../public/lib/modes.js';

describe('modes', () => {
  it('has exactly the three user modes', () => {
    expect(MODES.map((m) => m.id)).toEqual(['blind', 'wheelchair', 'limited']);
  });

  it('falls back to blind for missing or unknown stored values', () => {
    expect(normalizeMode(null)).toBe('blind');
    expect(normalizeMode('')).toBe('blind');
    expect(normalizeMode('robot')).toBe('blind');
    expect(normalizeMode('wheelchair')).toBe('wheelchair');
  });

  it('maps each mode to the right ORS profile and options', () => {
    expect(orsOptionsForMode('blind')).toEqual({ profile: 'foot-walking', options: {} });
    expect(orsOptionsForMode('wheelchair')).toEqual({ profile: 'wheelchair', options: {} });
    expect(orsOptionsForMode('limited')).toEqual({
      profile: 'foot-walking',
      options: { avoid_features: ['steps'] },
    });
  });
});
