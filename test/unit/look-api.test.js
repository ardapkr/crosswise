// /api/look with a fake Anthropic client: request shape, parsing and failure paths — no network.
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createLookHandler } from '../../api/look.js';
import { PROMPTS, VISION_MODEL } from '../../api/prompts.js';

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => {};
  return res;
}

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    getClient: () => ({
      messages: {
        create: async (params) => {
          calls.push(params);
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    }),
  };
}

const IMG = Buffer.from('fake jpeg bytes').toString('base64');
const answer = (obj, stop = 'end_turn') => ({
  stop_reason: stop,
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
  usage: { input_tokens: 1000, output_tokens: 40 },
});

async function call(fake, body, method = 'POST') {
  const handler = createLookHandler({ getClient: fake.getClient, requireKey: false });
  const res = fakeRes();
  await handler({ method, body }, res);
  return res;
}

describe('POST /api/look', () => {
  it('sends the image + mode prompt + JSON schema to the vision model', async () => {
    const fake = fakeClient(answer({ observation: 'LED shows 13A Hauptbahnhof', status: 'found', line: '13A', destination: 'Hauptbahnhof', vehicle: 'bus', confidence: 0.95 }));
    const res = await call(fake, { mode: 'bus', image: 'data:image/jpeg;base64,' + IMG });
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toEqual({ status: 'found', line: '13A', destination: 'Hauptbahnhof', vehicle: 'bus', confidence: 0.95 });
    expect(res.body.observation).toBe('LED shows 13A Hauptbahnhof');

    const p = fake.calls[0];
    expect(p.model).toBe(VISION_MODEL);
    expect(p.system).toBe(PROMPTS.bus.system);
    expect(p.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMG } });
    expect(p.output_config.format).toEqual({ type: 'json_schema', schema: PROMPTS.bus.schema });
  });

  it('all schemas are valid for structured outputs (every object: all required, no extra properties)', () => {
    const check = (s) => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
        Object.values(s.properties).forEach(check);
      }
      if (s.type === 'array') check(s.items);
      expect(s).not.toHaveProperty('minimum');
      expect(s).not.toHaveProperty('maximum');
    };
    for (const m of Object.keys(PROMPTS)) check(PROMPTS[m].schema);
  });

  it('broken JSON → treated as unreadable, not a crash', async () => {
    const res = await call(fakeClient(answer('I think it is the 13A bus')), { mode: 'bus', image: IMG });
    expect(res.statusCode).toBe(200);
    expect(res.body.result.status).toBe('unreadable');
  });

  it('a refusal → safe "don\'t know" answer', async () => {
    const res = await call(fakeClient(answer({ status: 'green' }, 'refusal')), { mode: 'light', image: IMG });
    expect(res.body.result.status).toBe('unclear');
  });

  it('validates input', async () => {
    const fake = fakeClient(answer({}));
    expect((await call(fake, { mode: 'selfie', image: IMG })).statusCode).toBe(400);
    expect((await call(fake, { mode: 'bus', image: '' })).statusCode).toBe(400);
    expect((await call(fake, { mode: 'bus', image: '<script>' })).statusCode).toBe(400);
    expect((await call(fake, { mode: 'bus', image: IMG }, 'GET')).statusCode).toBe(405);
    expect(fake.calls).toHaveLength(0);
  });

  it('maps SDK errors to friendly messages', async () => {
    const rate = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers());
    let res = await call(fakeClient(rate), { mode: 'bus', image: IMG });
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/busy/);

    const net = new Anthropic.APIConnectionError({ message: 'socket hang up' });
    res = await call(fakeClient(net), { mode: 'bus', image: IMG });
    expect(res.statusCode).toBe(504);
  });

  it('refuses to run without a key (real handler)', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const handler = createLookHandler({ getClient: () => { throw new Error('should not be called'); } });
    const res = fakeRes();
    await handler({ method: 'POST', body: { mode: 'bus', image: IMG } }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/not configured/);
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });
});
