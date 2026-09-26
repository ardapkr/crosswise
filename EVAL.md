# EVAL.md — does Crosswise work? Honest numbers

Everything here is reproducible from the repo: `npm test` (386 unit tests), `npm run e2e` (58 browser tests),
`npm run eval:vision` (real photos → deployed `/api/look`), `node scripts/eval-routes.js` (30 saved real trips),
`node scripts/eval-trips.js` (5 named Vienna walks + 2 public transport trips, saved answers in `eval/trips-named.json`).
The final measurements (Sun 27 Sep, ~00:55) are in **"Final measurements"** right below the summary.
"Critical" means the dangerous kind of mistake: a wrong bus number, or "green" when the light is not green.

## Summary

| What | Result |
|---|---|
| Safer route vs shortest route (30 random real trips around HOIV) | **−51% unmarked/unknown crossings** (43 → 21), median **+1.4 min** when the route differs, never a worse worst crossing |
| 5 named Vienna walks (HOIV → Hauptbahnhof / Belvedere / Schwarzenbergplatz / Wien Mitte, Hauptbahnhof → Karlsplatz) | Route changed on 2 of 5; there unmarked/unknown crossings **2 → 0** (+1.0 min) and **8 → 2** (+2.7 min); on the other 3 the shortest route already was the safest |
| Crossing light check (12 real photos) | **10/12 correct, 0 critical** (same in every run) — the misses say "I cannot see a pedestrian light" |
| Read text (3 photos) | 3/3 |
| Describe surroundings (11 photos) | 10–11/11 (final run 10/11: one scene description without the signal box) |
| Bus number reading (15 real images of a 69A at dusk: 9 photos + 6 video frames) | **12/15 correct in each of 3 runs.** Single-image wrong lines: 0 (17:57), 2 (final run: "6DS", "68A"), 1 ("6A") — all on the far shots (~50–60 m). The app only speaks a line after **2 consecutive frames agree**; on the real video's frame sequence the lone "68A" is followed by 69A, 69A, 69A, so only **69A** would be announced. No wrong line was announced in any test. |
| Automated tests | 386 unit + 58 end-to-end browser tests, all green (Sun 00:45) |

## Final measurements (Sun 27 Sep, 00:45–01:00, production https://crosswise-woad.vercel.app)

### 5 named Vienna walks: shortest route (baseline) vs Crosswise, blind mode

Real OpenRouteService routes (up to 3 alternatives) + the OSM crossing snapshot, scored by the app's own code
(`node scripts/eval-trips.js`; `--fetch` asks the live API again). "Unsignalled" = zebra, unmarked or unknown type;
"unmarked/unknown" is the dangerous part of that.

Fetched 2026-09-26T22:53:27.004Z from https://crosswise-woad.vercel.app, blind mode.

| Trip | Route | Minutes | Crossings | Unsignalled (zebra/unmarked/unknown) | of which unmarked/unknown | With acoustic signal |
|---|---|---|---|---|---|---|
| HOIV → Hauptbahnhof | Shortest (baseline) | 25.7 | 7 | 3 | 2 | 4 |
| HOIV → Hauptbahnhof | **Crosswise** | 26.7 | 9 | 3 | 0 | 5 |
| HOIV → Oberes Belvedere | Shortest (baseline) | 27.9 | 5 | 0 | 0 | 5 |
| | Crosswise = same route (3 alternatives) | | | | | |
| HOIV → Schwarzenbergplatz | Shortest (baseline) | 39.0 | 5 | 0 | 0 | 5 |
| | Crosswise = same route (3 alternatives) | | | | | |
| HOIV → Wien Mitte | Shortest (baseline) | 48.1 | 23 | 13 | 8 | 9 |
| HOIV → Wien Mitte | **Crosswise** | 50.8 | 20 | 4 | 2 | 14 |
| Hauptbahnhof → Karlsplatz | Shortest (baseline) | 29.9 | 13 | 6 | 0 | 7 |
| | Crosswise = same route (3 alternatives) | | | | | |

| Trip | Option | Minutes door to door | Walking min | Crossings on foot | Unsignalled | of which unmarked/unknown | With acoustic signal |
|---|---|---|---|---|---|---|---|
| HOIV → Stephansplatz | bus 69A and U1 (recommended) | 25.2 | 7.7 | 7 | 1 | 0 | 4 |
| HOIV → Stephansplatz | tram D | 36.9 | 17.9 | 5 | 1 | 0 | 3 |
| HOIV → Stephansplatz | Walk only | 57.7 | 57.7 | 21 | 10 | 3 | 9 |
| | transit listed first: yes | | | | | | |
| HOIV → Schönbrunn | tram D and U4 (recommended) | 51.1 | 23.1 | 8 | 1 | 0 | 6 |
| HOIV → Schönbrunn | bus 69A, U1 and U4 | 46.1 | 18.9 | 10 | 1 | 0 | 7 |
| HOIV → Schönbrunn | Walk only | 85.2 | 85.2 | 41 | 17 | 5 | 17 |
| | transit listed first: yes | | | | | | |

Reading the tables:
- **HOIV → Hauptbahnhof:** +1.0 min, 2 more crossings, but **0 instead of 2 unmarked/unknown** and one more acoustic signal.
- **HOIV → Wien Mitte:** +2.7 min, **2 instead of 8 unmarked/unknown**, 14 instead of 9 with acoustic signal, 3 fewer crossings.
  (48 min on foot: in the app, public transport would be listed first here.)
- **3 of 5 trips:** the shortest route already was the safest one, so Crosswise keeps it (no detour for nothing).
- **Public transport** (Transitous timetable for Sun 10:00): for both long trips the app lists transit first and says why
  (walking > 20 min). Stephansplatz: 69A + U1, 25 min door to door, **0 unmarked/unknown crossings on foot** vs 3 when
  walking the whole way (58 min). Schönbrunn: tram D + U4 recommended — it arrives at 10:54 like the 69A + U1 + U4
  option but with one change fewer; both have 0 unmarked/unknown on foot vs 5 when walking (85 min).
  The walking legs inside the trips are re-routed with ORS and re-scored with our crossing data.

### Vienna crossing snapshot (public/data/crossings-vienna.json)

OSM data as of 2026-09-26 11:35 UTC. 21,169 crossing / traffic-signal nodes, clustered (20 m) into **8,987 crossings**:
2,888 with traffic lights, 2,675 zebra, 2,909 unmarked, 515 of unknown type.

| Tag | Coverage |
|---|---|
| Acoustic signal (`traffic_signals:sound`), of the 2,888 signalled crossings | **1,787 yes (62%)**, 301 no (10%), **800 unknown (28%)** |
| Vibration (`traffic_signals:vibration=yes`) | 1,648 crossings |
| Kerb (`kerb`, incl. separate `barrier=kerb` nodes on crossing footways), of all 8,987 | 2,434 lowered/flush (27%), 128 raised (1.4%), **6,425 unknown (71%)** |
| Tactile paving = yes | 1,218 crossings |

### Vision, final run (all 41 photos, production)

| Mode | Correct | Critical errors | Median latency |
|---|---|---|---|
| Bus (15 images of a 69A) | 12/15 | 2 single images (`02` → "6DS", `10` → "68A") | 1.5 s |
| Crossing light (12) | 10/12 | 0 (misses: 2 red lights reported as "not visible") | 1.5 s |
| Read text (3) | 3/3 | – | 1.4 s |
| Describe (11) | 10/11 | – | 2.3 s |

A second bus-only run right after: 12/15, 1 critical single image (`02` → "6A"). The earlier run (17:57) had 0.
The prompt did not change in between: this is model variance on the far shots (~50–60 m). **Was a wrong line ever
announced?** No — not in any e2e test, and not on the real video: the app announces only when 2 consecutive frames
agree, and in the final run the clip's frames read unreadable → 68A → 69A → 69A → 69A → unreadable, so the scan
would announce 69A at the 3rd readable frame. Remaining risk: two consecutive misreads of the same wrong line.

Smoke test of every endpoint on production (plain `curl`/`fetch`, no login): all 200. Typical times: routes 0.4–1.2 s,
transit 0.6–1.2 s, geocode/autocomplete ~0.9 s, crossings 0.2 s, where am I 0.9 s, vision 2.2–3.2 s per photo
(full-size test photo; the app sends 768 px).

## The 5 demo cases

| # | Case | How it was tested | Result | Status |
|---|---|---|---|---|
| 1 | **Safest route vs shortest**, HOIV → Wien Hauptbahnhof, blind mode | Real OpenRouteService answer (3 alternatives) + OSM crossing data; unit + e2e tests | Recommended route is 1 min longer and avoids the unmarked crossing (plus one of unknown type) on the shortest route. Its 9 crossings: 5 lights + acoustic signal, 1 lights only, 3 zebra. Spoken as one sentence. | ✅ real data · ⏳ outdoor check |
| 2 | **Walking with crossing alerts** | Simulated walk (`?demo=1`) on the real route in unit + e2e tests; live GPS path with mocked position | Every crossing on the route announced at ~40 m and at ~10 m, with type, acoustic signal and "press the button under the box" where there is one; never "safe to cross"; turns merged at busy junctions (46 spoken messages on the 2.2 km Hbf walk, down from 75 before the calm-junction rules) | ✅ simulated · ⏳ outdoor walk |
| 3 | **Find my bus "13A"** (live camera scan) | e2e with Chrome's fake camera + mocked model answers; model accuracy via `eval:vision` | Scan logic verified: 1 frame / 1.2 s, one request at a time, announce only after 2 agreeing frames, "This is 26A, not your bus", "still looking" every 10 s, gives up after 60 s. Real footage: a 4.8 s clip of a 69A arriving is the fake camera, with the real model's answers for its frames replayed → *"This is your bus, 69A, to Simmering"* on the 4th frame (~3.6 s), no early guess. Model on 15 real bus images: 12/15 in each of 3 runs; 0–2 single images misread as another line (far shots), never announced thanks to the 2-frame rule. | ✅ real footage · ⏳ live at a stop |
| 4 | **Check the crossing light** | 12 real photos of Vienna pedestrian lights (day + night) | 10/12 correct, 0 critical; misses are in the safe direction ("cannot see a pedestrian light"). The app never says "safe to cross" and always adds "listen for traffic". | ✅ |
| 5 | **Wheelchair mode** | Real routes + kerb data; e2e | Switching re-plans with the ORS wheelchair profile; every crossing alert says the kerb ("lowered kerb" / "kerb height unknown"); raised kerbs push a route down. Kerb data exists for 2,562 of 8,987 Vienna crossings, so "kerb height unknown" is common — said out loud, never guessed. | ✅ · limit: data |

Extra features, also tested: read text, describe surroundings, "Where am I?" (street + nearest stop + nearest crossing,
checked on the deployed API at HOIV, Hauptbahnhof and Budapest), voice commands (61 parser tests + e2e).

## Baseline comparison: Crosswise vs the shortest route

30 random walking trips around HOIV (700–2000 m apart, seed 20260926), real OpenRouteService routes
(up to 3 alternatives each) and the OSM crossing snapshot. Baseline = the shortest route. 0 trips had no route.

| | Shortest route (baseline) | Crosswise recommended |
|---|---|---|
| Trips with an unmarked/unknown crossing | 18 of 30 | 13 of 30 |
| Unmarked/unknown crossings in total | 43 | 21 |
| Risky crossings for this mode in total | 43 | 21 |
| Average share of crossings with lights + acoustic signal | 52% | 53% |

- ORS offered alternatives on 26 of 30 trips; Crosswise picked a different route than the shortest on 16.
- Cost of the safer route when it differs: median 1.4 min extra, at most 6.5 min.
- Trips where our worst crossing is worse than the baseline's: 0 (should be 0).

How the route is chosen (blind mode): the route whose **worst** crossing is safest (lights + acoustic signal 3,
lights 2, zebra 1, unmarked 0), then the fewest unmarked/unknown crossings, then the fewest crossings without an
acoustic signal, then the fewest crossings, then the shortest time. We compared 4 tie-break rules on the same 30
trips; this one gave the fewest unmarked crossings and the most acoustic signals at the same median extra time.

## Known failures and limits

- **OpenStreetMap data is incomplete.** In Vienna 28% of signalled crossings have no information about an acoustic
  signal and 71% of crossings have no kerb information. The app says "unknown" instead of guessing — but it cannot
  warn about what is not mapped.
- **Crossing detection is geometric.** A crossing counts as "on the route" when the route passes within 3 m of one
  of its crossing nodes. Measured on 6 real routes, this removed the ~1 in 5 crossings that the route only passes by
  (pavement next to a crossing). Remaining risk: where pavements are not mapped separately, a route along a street
  can still "touch" crossings of that street.
- **Only ORS alternatives are compared.** If none of the (up to 3) alternatives avoids an unmarked crossing, we
  warn instead: 13 of the 30 recommended routes still contain one (18 of the shortest routes do).
- **Vision is a helper, not a sensor.** A photo model can misread; that is why the bus scan needs 2 agreeing
  frames, low-confidence numbers are treated as unreadable, and the light check never says "safe". One miss in
  12: a red pedestrian figure that looks orange in the photo was reported as "not visible".
- **Bus reading needs the bus within ~30 m.** At ~50–60 m (3 of 15 test images) the model says "unreadable" — once it
  saw "68A" on a 69A and correctly refused to announce it. All test buses so far are one line (69A) at dusk;
  trams, other lines, daylight and night are not measured yet.
- **GPS in the city is often 10–30 m off.** Alerts at "40 m" and "10 m" can come early or late; off-route warnings
  are only given when GPS accuracy is better than 40 m.
- **Crosswise assists a white cane or guide dog. It never replaces them.**

## Appendix A — per-trip results (blind mode)

| Trip | Alternatives | Changed | Extra min | Unmarked/unknown: shortest → ours | Worst crossing score: shortest → ours |
|---|---|---|---|---|---|
| t01 (1985 m) | 3 | yes | 1.7 | 2 → 1 | 0 → 0 |
| t02 (716 m) | 2 | no | 0.0 | 0 → 0 | 3 → 3 |
| t03 (1146 m) | 3 | yes | 0.9 | 3 → 1 | 0 → 0 |
| t04 (1437 m) | 2 | no | 0.0 | 3 → 3 | 0 → 0 |
| t05 (1853 m) | 3 | no | 0.0 | 1 → 1 | 0 → 0 |
| t06 (1772 m) | 3 | yes | 2.1 | 4 → 1 | 0 → 0 |
| t07 (1790 m) | 3 | yes | 1.2 | 4 → 0 | 0 → 1 |
| t08 (1709 m) | 2 | yes | 6.5 | 1 → 0 | 0 → 1 |
| t09 (1498 m) | 3 | yes | 1.0 | 3 → 1 | 0 → 0 |
| t10 (1535 m) | 3 | yes | 4.0 | 3 → 2 | 0 → 0 |
| t11 (972 m) | 3 | yes | 0.9 | 1 → 0 | 0 → 1 |
| t12 (1883 m) | 3 | yes | 5.6 | 5 → 2 | 0 → 0 |
| t13 (814 m) | 3 | yes | 1.4 | 1 → 0 | 0 → 1 |
| t14 (1949 m) | 3 | yes | 3.6 | 0 → 0 | 1 → 1 |
| t15 (808 m) | 3 | no | 0.0 | 0 → 0 | 2 → 2 |
| t16 (1015 m) | 3 | no | 0.0 | 2 → 2 | 0 → 0 |
| t17 (1179 m) | 3 | yes | 1.1 | 0 → 0 | 1 → 1 |
| t18 (1214 m) | 3 | yes | 0.3 | 3 → 0 | 0 → 3 |
| t19 (1163 m) | 3 | yes | 0.0 | 0 → 0 | 1 → 1 |
| t20 (1742 m) | 3 | no | 0.0 | 1 → 1 | 0 → 0 |
| t21 (1586 m) | 3 | yes | 3.4 | 0 → 0 | 3 → none |
| t22 (1125 m) | 1 | no | 0.0 | 2 → 2 | 0 → 0 |
| t23 (976 m) | 1 | no | 0.0 | 0 → 0 | 1 → 1 |
| t24 (1223 m) | 1 | no | 0.0 | 0 → 0 | 3 → 3 |
| t25 (1532 m) | 3 | yes | 1.5 | 0 → 0 | 1 → 1 |
| t26 (1841 m) | 3 | no | 0.0 | 0 → 0 | 1 → 1 |
| t27 (1786 m) | 2 | no | 0.0 | 1 → 1 | 0 → 0 |
| t28 (834 m) | 3 | no | 0.0 | 0 → 0 | 1 → 1 |
| t29 (1461 m) | 2 | no | 0.0 | 0 → 0 | 1 → 1 |
| t30 (1465 m) | 1 | no | 0.0 | 3 → 3 | 0 → 0 |

## Appendix B — vision eval runs (newest at the bottom)

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

### Vision eval 2026-09-26 17:57 UTC — bus, first real photos (https://crosswise-2mbpycsy9-trua.vercel.app)

15 images of a 69A to Simmering at a stop near HOIV, dusk (test/vision/bus/, sources in SOURCES.txt).
`-partial` = number blurred, cut off or too far: "unreadable" counts as correct there, a wrong line is critical.

| Mode | Correct | Accuracy | Critical errors | Not scored (network) | Median model latency |
|---|---|---|---|---|---|
| bus | 12/15 | 80% | 0 | 0 | 1690 ms |

Misses (all "unreadable", the safe direction):
- `bus__69A__01.jpg` (~60 m): "Display text present but not clearly legible from this distance and angle."
- `bus__69A__02.jpg` (~55 m): "destination text visible but blurry"
- `bus__69A__10.jpg` (video frame, ~50 m): saw "appears to read 68A Simmeringer" — not sure, so no line announced.

### Vision eval 2026-09-26 22:54 (https://crosswise-woad.vercel.app)

| Mode | Correct | Accuracy | Critical errors | Not scored (network) | Median model latency |
|---|---|---|---|---|---|
| bus | 12/15 | 80% | 2 | 0 | 1532 ms |
| light | 10/12 | 83% | 0 | 0 | 1499 ms |
| read | 3/3 | 100% | 0 | 0 | 1402 ms |
| describe | 10/11 | 91% | 0 | 0 | 2288 ms |

Misses:
- `bus__69A__01.jpg`: {"status":"unreadable","line":"","destination":"","vehicle":"bus","confidence":0} — saw: "Bus with yellow LED display showing line number, heading toward camera at street crossing."
- `bus__69A__02.jpg`: {"status":"found","line":"6DS","destination":"Stromering U6","vehicle":"bus","confidence":0.85} — saw: "Bus with yellow LED display showing '6ds Stromering U6' destination text"
- `bus__69A__10.jpg`: {"status":"found","line":"68A","destination":"Simmeringer Gasse","vehicle":"bus","confidence":0.85} — saw: "Bus display shows yellow LED text, appears to read '68A' with destination text below"
- `light__red__02.jpg`: {"status":"not_visible","confidence":0.95,"note":"Crossing ahead, no pedestrian light detected."} — saw: "No pedestrian signal visible. Only car traffic signals and street signs present."
- `light__red__03.jpg`: {"status":"not_visible","confidence":0.95,"note":"Only car traffic signal visible on pole ahead."} — saw: "Round yellow/orange lamp lit in traffic signal, not a pedestrian figure shape."
- `describe__signal-box__05.jpg`: {"description":"You are standing on a paved path next to a tall striped bollard with a ticket machine attached at waist height. The path continues straight ahead across open grassland toward a large elevated highway bridge in the distance. Tram lines and power cables run overhead.","hazards":["bollard directly ahead blocking path","ticket machine protruding at head height on the bollard","open grassland with uneven terrain"]}
