// Scoring rules of `npm run eval:vision` (the numbers we show the judges must be computed right).
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { score } from '../../scripts/eval-vision.js';

const found = (line) => ({ status: 'found', line });
const unreadable = { status: 'unreadable', line: '' };

describe('bus scoring', () => {
  it('readable photo: only the exact line counts, another line is critical', () => {
    expect(score('bus', '69A', found('69A'))).toEqual({ ok: true, critical: false });
    expect(score('bus', '69A', unreadable)).toEqual({ ok: false, critical: false });
    expect(score('bus', '69A', found('39A'))).toEqual({ ok: false, critical: true });
  });

  it('"partial" photo (blurred / cut off / far): not reading it is fine, a wrong line is still critical', () => {
    expect(score('bus', '69A-partial', unreadable)).toEqual({ ok: true, critical: false });
    expect(score('bus', '69A-partial', { status: 'not_visible', line: '' })).toEqual({ ok: true, critical: false });
    expect(score('bus', '69A-partial', found('69A'))).toEqual({ ok: true, critical: false });
    expect(score('bus', '69A-partial', found('39'))).toEqual({ ok: false, critical: true });
  });

  it('"none" photo: any line is critical', () => {
    expect(score('bus', 'none', unreadable)).toEqual({ ok: true, critical: false });
    expect(score('bus', 'none', found('13A'))).toEqual({ ok: false, critical: true });
  });
});

describe('light scoring', () => {
  it('a green answer for a red or missing light is critical', () => {
    expect(score('light', 'red', { status: 'green' })).toEqual({ ok: false, critical: true });
    expect(score('light', 'none', { status: 'green' })).toEqual({ ok: false, critical: true });
    expect(score('light', 'green', { status: 'unclear' })).toEqual({ ok: false, critical: false });
  });
});

describe('test photo labels', () => {
  it('every bus photo is named bus__<LINE>[-partial]__<nn>.jpg', () => {
    const files = readdirSync('test/vision/bus').filter((f) => f.endsWith('.jpg'));
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const f of files) expect(f).toMatch(/^bus__([A-Z0-9]+(-partial)?|none)__\d{2}\.jpg$/);
  });
});
