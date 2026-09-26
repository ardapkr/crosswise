# EVAL.md — how well does Crosswise work?

Honest numbers: successes AND failures. Vision numbers come from `npm run eval:vision`
(real photos in `test/vision/`, labels in the file names, model: Claude Haiku 4.5).
"Critical" = the dangerous kind of mistake: reading a wrong bus number, or saying a light is green when it isn't.

## Vision results log (newest at the bottom)

### Vision eval 2026-09-26 13:29 (https://crosswise-pef0toxf5-trua.vercel.app)

| Mode | Correct | Accuracy | Critical errors | Median model latency |
|---|---|---|---|---|
| bus | – | no photos yet | – | – |
| light | 9/12 | 75% | 0 | 1855 ms |
| read | 3/3 | 100% | 0 | 2038 ms |
| describe | 11/11 | 100% | 0 | 2468 ms |

Misses:
- `light__green__01.jpg`: no JSON from vercel curl: <claude-code-hint v="1" type="plugin" value="vercel@claude-plugins-official" />
Vercel CLI 60.0.1 (Node.js 24.19.0) | curl is in beta — https://vercel.com/feedback
Error: An unexpected error occurred in curl: TypeError: fetch failed

- `light__none__01.jpg`: no JSON from vercel curl: <claude-code-hint v="1" type="plugin" value="vercel@claude-plugins-official" />
Vercel CLI 60.0.1 (Node.js 24.19.0) | curl is in beta — https://vercel.com/feedback
Error: An unexpected error occurred in curl: TypeError: fetch failed

- `light__red__03.jpg`: {"status":"not_visible","confidence":0.95,"note":"Only car traffic light visible, no pedestrian signal"} — saw: "Traffic light with yellow lamp lit, no pedestrian signal visible in photo"

### Vision eval 2026-09-26 14:25 UTC — light only, prompt v1, after fixing eval network retries

| Mode | Correct | Accuracy | Critical errors | Not scored (network) | Median model latency |
|---|---|---|---|---|---|
| light | 10/12 | 83% | 0 | 0 | 1547 ms |

Misses (both labels double-checked by zooming in — both are real model mistakes, neither is critical):
- `light__none__01.jpg` (night, only car signals: red arrow + two round red lamps) → model said "red, standing figure lit". Harmless direction (user waits), but wrong.
- `light__red__03.jpg` (pedestrian signal, red figure looks orange in the photo) → model said "not visible, amber car light".
→ Prompt v2: judge the SHAPE of the lit lamp (figure vs round lamp/arrow), red figures look orange in photos.
