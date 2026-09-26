// /api/transit with Transitous mocked by REAL saved answers (no network).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import handler, { savedTripName } from '../../api/transit.js';

const fixture = (name) => readFileSync(`test/fixtures/transit-${name}.json`, 'utf8');

function call(query) {
  const res = { statusCode: 200, body: null, setHeader() {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return handler({ query }, res).then(() => res);
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/transit', () => {
  it('asks Transitous and returns up to 2 trips with their departures', async () => {
    const fetchMock = vi.fn(async () => new Response(fixture('hoiv-stephansplatz'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ from: '16.3954,48.1761', to: '16.3731,48.2085', mode: 'blind', time: '2026-09-28T07:00:00Z' });
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe('transitous');
    expect(res.body.patterns.length).toBeGreaterThanOrEqual(1);
    expect(res.body.patterns.length).toBeLessThanOrEqual(2);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('fromPlace=48.1761%2C16.3954');
    expect(url).not.toContain('pedestrianProfile');
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/Crosswise/);
  });

  it('wheelchair mode asks for step-free walking', async () => {
    const fetchMock = vi.fn(async () => new Response(fixture('hoiv-karlsplatz-wheelchair'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ from: '16.3954,48.1761', to: '16.37,48.2004', mode: 'wheelchair', time: '2026-09-28T07:01:00Z' });
    expect(res.statusCode).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('pedestrianProfile=WHEELCHAIR');
  });

  it('Transitous down on a saved demo trip → saved answer with times moved to now', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const time = '2026-10-03T12:00:00Z';
    const res = await call({ from: '16.3955,48.1762', to: '16.3755,48.185', mode: 'blind', time });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ source: 'saved', fallback: true });
    const first = res.body.patterns[0].options[0];
    expect(Math.abs(first.start - Date.parse(time))).toBeLessThan(30 * 60e3);
  });

  it('Transitous down elsewhere → a spoken-friendly error; bad input → 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    const res = await call({ from: '16.30,48.20', to: '16.31,48.21', mode: 'blind', time: '2026-10-03T12:02:00Z' });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/Public transport service error 503/);
    expect((await call({ from: 'x', to: '16,48' })).statusCode).toBe(400);
  });

  it('savedTripName matches only the saved HOIV trips', () => {
    expect(savedTripName([16.3954, 48.1761], [16.3755, 48.185])).toBe('transit-hoiv-hbf');
    expect(savedTripName([16.3954, 48.1761], [16.3731, 48.2085])).toBe('transit-hoiv-stephansplatz');
    expect(savedTripName([16.30, 48.20], [16.3755, 48.185])).toBe(null);
  });
});
