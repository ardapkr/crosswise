// /api/where on the real Vienna snapshots; the ORS reverse geocode is mocked (no network, no key).
import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../../api/where.js';

function call(query) {
  const res = { statusCode: 200, body: null, setHeader() {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return handler({ query }, res).then(() => res);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/where', () => {
  it('at HOIV: street from ORS, nearest stops and crossing from the snapshots', async () => {
    vi.stubEnv('ORS_API_KEY', 'test-key');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      features: [{ properties: { layer: 'address', street: 'Arsenalstraße', housenumber: '11', distance: 0.008 } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await call({ lon: '16.3954', lat: '48.1761' });
    expect(res.statusCode).toBe(200);
    expect(res.body.city).toBe('vienna');
    expect(res.body.street).toEqual({ street: 'Arsenalstraße', housenumber: '11', distance: 8 });
    expect(res.body.stops[0].name).toBe('Hüttenbrennergasse');
    expect(res.body.crossing.distance).toBeLessThan(40);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/geocode/reverse?point.lon=16.3954&point.lat=48.1761');
  });

  it('ORS down → still answers with stops and crossing (street null)', async () => {
    vi.stubEnv('ORS_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const res = await call({ lon: '16.3960', lat: '48.1765' });
    expect(res.statusCode).toBe(200);
    expect(res.body.street).toBe(null);
    expect(res.body.stops.length).toBeGreaterThan(0);
  });

  it('outside Vienna/Budapest: no snapshot data, and bad input is rejected', async () => {
    vi.stubEnv('ORS_API_KEY', '');
    const res = await call({ lon: '2.35', lat: '48.85' });
    expect(res.body).toMatchObject({ city: null, stops: [], crossing: null, street: null });
    expect((await call({ lon: 'x', lat: '48' })).statusCode).toBe(400);
  });
});
