// POST /api/look   { mode: 'bus'|'light'|'read'|'describe', image: <base64 JPEG>, context?: {} }
// → { mode, result (validated, see lib/look.js), observation, ms, model }
// One camera frame → Claude (vision, structured JSON output) → safe, validated result.
// The key stays here on the server; the browser never sees it.

import Anthropic from '@anthropic-ai/sdk';
import { PROMPTS, VISION_MODEL } from './prompts.js';
import { LOOK_MODES, parseModelJson, normalizeResult } from '../public/lib/look.js';
import { fail } from './_lib/http.js';

const MAX_IMAGE_CHARS = 2_500_000; // ~1.8 MB JPEG; the app sends ~100 KB (768 px, quality 0.7)

let sharedClient = null;
function defaultClient() {
  // Reads ANTHROPIC_API_KEY from the environment. Short timeout + 1 retry: a live scan
  // would rather skip a frame than wait.
  if (!sharedClient) sharedClient = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return sharedClient;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

/** Factory so tests can pass a fake client. */
export function createLookHandler({ getClient = defaultClient, requireKey = true } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return fail(res, 405, 'Use POST');
    const body = readBody(req);
    const mode = body?.mode;
    if (!LOOK_MODES.includes(mode)) return fail(res, 400, `mode must be one of: ${LOOK_MODES.join(', ')}`);

    let image = typeof body.image === 'string' ? body.image : '';
    image = image.replace(/^data:image\/jpeg;base64,/, '');
    if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 1000))) {
      return fail(res, 400, 'image must be a base64 JPEG');
    }
    if (requireKey && !process.env.ANTHROPIC_API_KEY) return fail(res, 500, 'ANTHROPIC_API_KEY is not configured on the server');

    const p = PROMPTS[mode];
    const t0 = Date.now();
    let message;
    try {
      message = await getClient().messages.create({
        model: VISION_MODEL,
        max_tokens: 1024,
        system: p.system,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: p.user(body.context || {}) },
          ],
        }],
        output_config: { format: { type: 'json_schema', schema: p.schema } },
      });
    } catch (e) {
      // Most specific first. In the TS SDK, APIConnectionError is a subclass of APIError.
      if (e instanceof Anthropic.NotFoundError) {
        console.error('look: model not found', VISION_MODEL);
        return fail(res, 502, 'Vision model not available');
      }
      if (e instanceof Anthropic.RateLimitError) return fail(res, 429, 'The camera assistant is busy. Try again in a moment.');
      if (e instanceof Anthropic.APIConnectionError) return fail(res, 504, 'The camera assistant did not answer in time.');
      if (e instanceof Anthropic.APIError) {
        console.error('look: API error', e.status, e.message);
        return fail(res, 502, `Camera assistant error ${e.status ?? ''}`.trim());
      }
      console.error('look: unexpected error', e?.message);
      return fail(res, 500, 'Camera assistant failed');
    }

    const ms = Date.now() - t0;
    // A refusal or a truncated answer is treated like "could not read it" (normalizeResult(null)).
    const text = message.stop_reason === 'refusal' ? '' :
      (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = parseModelJson(text);
    const result = normalizeResult(mode, parsed);

    // No image data and no text in logs: just what we need to debug and measure.
    console.log(JSON.stringify({
      look: mode, ms, stop: message.stop_reason, parsed: parsed !== null,
      status: result.status ?? null, in: message.usage?.input_tokens, out: message.usage?.output_tokens,
    }));

    return res.status(200).json({
      mode,
      result,
      observation: typeof parsed?.observation === 'string' ? parsed.observation.slice(0, 200) : '',
      ms,
      model: VISION_MODEL,
    });
  };
}

export default createLookHandler();
