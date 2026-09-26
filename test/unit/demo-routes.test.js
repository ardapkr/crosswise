import { describe, it, expect } from 'vitest';
import { demoRouteName, loadDemoRoute } from '../../api/_lib/demo-routes.js';

describe('demo route fallback', () => {
  it('matches HOIV → Hauptbahnhof per mode', () => {
    expect(demoRouteName([16.3954, 48.1761], [16.3755, 48.185], 'blind')).toBe('ors-hoiv-hbf-foot');
    expect(demoRouteName([16.3956, 48.1762], [16.3757, 48.1851], 'wheelchair')).toBe('ors-hoiv-hbf-wheelchair');
    expect(demoRouteName([16.3954, 48.1761], [16.3755, 48.185], 'limited')).toBe('ors-hoiv-hbf-limited');
  });
  it('matches Belvedere only for walking', () => {
    expect(demoRouteName([16.3954, 48.1761], [16.3809, 48.1915], 'blind')).toBe('ors-hoiv-belvedere-foot');
    expect(demoRouteName([16.3954, 48.1761], [16.3809, 48.1915], 'wheelchair')).toBe(null);
  });
  it('does not match other trips', () => {
    expect(demoRouteName([16.37, 48.21], [16.3755, 48.185], 'blind')).toBe(null);
    expect(demoRouteName([16.3954, 48.1761], [16.40, 48.20], 'blind')).toBe(null);
  });
  it('loads the saved ORS GeoJSON', async () => {
    const raw = await loadDemoRoute('ors-hoiv-hbf-foot');
    expect(raw.features.length).toBe(3);
  });
});
