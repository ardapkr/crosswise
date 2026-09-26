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
