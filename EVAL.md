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

### Vision eval 2026-09-26 14:28 (https://crosswise-g8sxwct0b-trua.vercel.app)

| Mode | Correct | Accuracy | Critical errors | Not scored (network) | Median model latency |
|---|---|---|---|---|---|
| bus | – | no photos yet | – | – | – |
| light | 10/12 | 83% | 0 | 0 | 1493 ms |
| read | 3/3 | 100% | 0 | 0 | 1636 ms |
| describe | 11/11 | 100% | 0 | 0 | 2089 ms |

Misses:
- `light__green__07.jpg`: {"status":"not_visible","confidence":0.95,"note":"Only car traffic signal visible, no pedestrian signal."} — saw: "Green round lamp lit in car signal. No pedestrian signal visible with human figure."
- `light__red__03.jpg`: {"status":"not_visible","confidence":0.95,"note":"Only car signal visible, no pedestrian signal in frame."} — saw: "Yellow/orange lit circle on traffic signal, not a human figure shape."
→ Prompt v2 result: fixed `light__none__01` (no longer invents a pedestrian signal from car lights), new miss
`light__green__07` (signal photographed from below, figure hard to see → "not visible"). Still 10/12, but
**every v2 miss is in the safe direction** ("I cannot see a pedestrian light"), none invents a signal and
none says green when it isn't. Kept v2. Next step: more real photos (HUMAN_TODO) instead of tuning on 12 images.

### Route baseline comparison (blind mode), 2026-09-26 15:07 UTC

30 random walking trips around HOIV (700–2000 m apart, seed 20260926), real OpenRouteService routes
(up to 3 alternatives each) and the OSM crossing snapshot. Baseline = the shortest route. 0 trips had no route.

| | Shortest route (baseline) | Crosswise recommended |
|---|---|---|
| Trips with an unmarked/unknown crossing | 19 of 30 | 14 of 30 |
| Unmarked/unknown crossings in total | 49 | 24 |
| Risky crossings for this mode in total | 49 | 24 |
| Average share of crossings with lights + acoustic signal | 43% | 45% |

- ORS offered alternatives on 26 of 30 trips; Crosswise picked a different route than the shortest on 16.
- Cost of the safer route when it differs: median 1.4 min extra, at most 6.5 min.
- Trips where our worst crossing is worse than the baseline's: 0 (should be 0).

| Trip | Alternatives | Changed | Extra min | Unmarked/unknown: shortest → ours | Worst crossing score: shortest → ours |
|---|---|---|---|---|---|
| t01 (1985 m) | 3 | yes | 1.7 | 3 → 1 | 0 → 0 |
| t02 (716 m) | 2 | no | 0.0 | 0 → 0 | 2 → 2 |
| t03 (1146 m) | 3 | yes | 0.9 | 3 → 1 | 0 → 0 |
| t04 (1437 m) | 2 | no | 0.0 | 3 → 3 | 0 → 0 |
| t05 (1853 m) | 3 | no | 0.0 | 1 → 1 | 0 → 0 |
| t06 (1772 m) | 3 | yes | 4.5 | 5 → 1 | 0 → 0 |
| t07 (1790 m) | 3 | yes | 1.2 | 5 → 0 | 0 → 1 |
| t08 (1709 m) | 2 | yes | 6.5 | 2 → 1 | 0 → 0 |
| t09 (1498 m) | 3 | yes | 1.0 | 3 → 2 | 0 → 0 |
| t10 (1535 m) | 3 | yes | 4.0 | 3 → 2 | 0 → 0 |
| t11 (972 m) | 3 | yes | 0.9 | 1 → 0 | 0 → 1 |
| t12 (1883 m) | 3 | yes | 5.6 | 5 → 2 | 0 → 0 |
| t13 (814 m) | 3 | yes | 1.4 | 1 → 0 | 0 → 1 |
| t14 (1949 m) | 3 | yes | 3.6 | 1 → 0 | 0 → 1 |
| t15 (808 m) | 3 | no | 0.0 | 0 → 0 | 2 → 2 |
| t16 (1015 m) | 3 | no | 0.0 | 3 → 3 | 0 → 0 |
| t17 (1179 m) | 3 | yes | 1.1 | 0 → 0 | 1 → 1 |
| t18 (1214 m) | 3 | yes | 0.3 | 3 → 0 | 0 → 1 |
| t19 (1163 m) | 3 | yes | 0.0 | 0 → 0 | 1 → 1 |
| t20 (1742 m) | 3 | yes | 3.5 | 1 → 1 | 0 → 0 |
| t21 (1586 m) | 3 | yes | 3.4 | 0 → 0 | 3 → none |
| t22 (1125 m) | 1 | no | 0.0 | 2 → 2 | 0 → 0 |
| t23 (976 m) | 1 | no | 0.0 | 0 → 0 | 1 → 1 |
| t24 (1223 m) | 1 | no | 0.0 | 0 → 0 | 3 → 3 |
| t25 (1532 m) | 3 | no | 0.0 | 0 → 0 | 1 → 1 |
| t26 (1841 m) | 3 | no | 0.0 | 0 → 0 | 1 → 1 |
| t27 (1786 m) | 2 | no | 0.0 | 1 → 1 | 0 → 0 |
| t28 (834 m) | 3 | no | 0.0 | 0 → 0 | 1 → 1 |
| t29 (1461 m) | 2 | no | 0.0 | 0 → 0 | 1 → 1 |
| t30 (1465 m) | 1 | no | 0.0 | 3 → 3 | 0 → 0 |
