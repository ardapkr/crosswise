# PROGRESS.md

**Latest preview:** https://crosswise-alu8dnhie-trua.vercel.app  (deployed 21:47; open while logged in to Vercel)

## Handover — Sat 21:55 (read this first in a new session)

State: `main` is clean, pushed and green: `npm test` 269 passed, `npm run e2e` 43 passed (both projects:
"chromium" + "bus-video"). The preview above = current `main` (UI redesign v1). Branch `ui-redesign` is merged.
**Waiting for the humans' feedback on the redesign** (they asked to see it before any polishing).

### Done (built, tested, deployed)
- **Phase 0–7 + Phase 9 (feedback round 1)** — see TASKS.md. Features: safest-crossings route comparison (ORS
  alternatives + OSM crossing snapshot, spoken reason), GPS guidance with crossing alerts at 40 m / 10 m and a
  `?demo=1` walk, Find my bus live scan, check light / read / describe (Claude Haiku 4.5), 3 modes, voice
  commands, Where am I.
- **Phase 9 (20:00–21:50):** voice always English (lib/voices.js picks an en-US/en-GB voice, late voices handled,
  recognition en-US); live search suggestions (/api/autocomplete + js/search.js, "Current location" default start,
  curated places in lib/places.js); map with per-route colour + pattern, crossing dots by type, tap card → highlight;
  full UI redesign (dark, sky-blue accent, full-screen map, search panel, bottom sheet, thumb-zone dock, walking
  banner, full-screen camera view, settings dialog).
- **Measured:** 30 real trips: unmarked/unknown crossings 43 → 21 vs shortest route, median +1.4 min. Vision:
  **bus 12/15, 0 critical** (15 real 69A images), light 10/12 (0 critical), read 3/3, describe 11/11.
- Phase 8 parts: accessibility (axe 0 violations on 7 screen states), spoken errors, README, EVAL, USER_TEST,
  DEMO_SCRIPT, `npm run zip`.

### Half-done / waiting
- **Redesign v1 needs human feedback** (map size on small phones, Speak/Where am I placement, long route summary in
  the sheet). Not tested on a real iPhone/Android or with real VoiceOver/TalkBack yet.
- **No outdoor test / no real-user feedback yet** (judging criteria). Steps: HUMAN_TODO.md, USER_TEST.md.
- DEMO_SCRIPT.md still describes the old UI flow in places; update after the redesign is accepted.
  `docs/screenshots` not committed (run `node scripts/screenshots.js` with `npm run dev` running).
- TASKS Phase 8 open: submission ZIP (`npm run zip` at the freeze) and production deploy (needs the humans' OK).
- Search: Google Places was NOT adopted (terms forbid non-Google maps, ToS 3.2.3(e)); ORS ranking is proximity-biased
  ("Prater" → Böhmischer Prater first). If humans want better ranking: try an OSM-based geocoder (e.g. Photon).

### Known bugs and weak spots
1. **Production URL https://crosswise-woad.vercel.app is public but STALE** (Phase 0 skeleton). Don't share it.
2. On a ~700 px tall phone viewport the visible map band is only ~200 px (sheet + dock take the rest); the
   "Show more/less" handle is the only way to resize (no drag gesture).
3. The From field is only reachable inside the search panel (tap the search pill first) — also for screen readers.
4. Light check misses in the safe direction (`light__red__03`, `light__green__07`: "not visible").
5. Crossing detection is geometric: where pavements are not mapped, a route along a street can "touch" crossings.
6. OSM gaps: 28% of signals without acoustic info, 71% of crossings without kerb info.
7. Bus reading needs the bus within ~30 m; only one line (69A, dusk) measured.
8. `npm run deploy` failed once with "no preview URL found" (transient CLI output issue); `vercel deploy
   --target=preview --yes` directly worked. Retry the npm script first.

### Gotchas for the next session
- Deploy with `npm run deploy` (preview + smoke test + updates the URL line above). Preview URLs need a Vercel login.
- `vercel curl` in Git Bash needs `MSYS_NO_PATHCONV=1`; sometimes flaky: retry.
- `.env.local` has **no keys**: locally /api/autocomplete and /api/look answer "…_API_KEY is not configured";
  routes fall back to saved demo routes. Live checks run against a preview.
- Long node heredocs in Git Bash sometimes break ("unexpected EOF"): write the script to the scratchpad and run it.
- Leaflet's panes use z-index 400+: `.map-layer` must keep `z-index: 0; isolation: isolate` or the map covers the UI.
- Panel sizes are CSS vars (--top-h, --dock-h, --bottom-h) set by `measurePanels()` in app.js; call it right after
  any view change BEFORE fitting the map (ResizeObserver runs too late).
- Local server is `npm run dev` (scripts/dev-server.js), not `vercel dev`.

### Next 3 tasks
1. Apply the humans' redesign feedback (then update DEMO_SCRIPT.md + commit screenshots for the README).
2. Humans' outdoor test on real phones (VoiceOver/TalkBack, GPS walk, real bus/light) → fix what breaks, update EVAL.md.
3. Morning freeze (06:00): final numbers in README/EVAL, `npm run zip`, ask before the production deploy.

## Log (newest first)
- 21:47 **UI redesign v1** (branch ui-redesign → main), shown to the humans for feedback before polishing. Dark, calm, one accent (sky blue #4cc2ff, 9.7:1 on the background; chosen over violet: stays apart from the green/yellow/orange/red crossing colours). Full-screen map (pannable, aria-hidden, dark muted OSM tiles) with a "you are here" dot; search pill on top that opens a full-screen search panel (From: Current location, live suggestions, suggested places when empty); bottom sheet (big status text + Repeat, route cards first, mode as a segmented control, quick destinations; "Show more" handle expands it, the map re-fits the route); fixed dock in the thumb zone (Speak, Where am I?, and 4 camera tiles Find bus / Check light / Read / Describe). Walking: accent banner with the next instruction replaces the search, Repeat next / Stop route on top of the sheet. Camera: full-screen view above the dock (video, result in big text, "Your line", Stop). Settings dialog (App voice, voice commands, map colours, OSM credit); App voice toggle also on the start screen so VoiceOver users can silence the app before it talks. Fixed on the way: raw browser errors were spoken ("The play() request was interrupted…"), a camera stream could stay on when stopped during start-up, typing the bus line while the camera started was lost, Start button name did not contain its visible text (WCAG 2.5.3), map fitted with stale panel sizes. axe: 0 violations on start, main, cards, walking, camera, search panel, settings. 269 unit + 43 e2e green. Screenshots: node scripts/screenshots.js.
- 20:54 Map: every route its own colour AND line pattern (recommended violet solid = accent, sky blue dashed, pink dotted: colour-blind safe, kept away from the crossing colours), recommended thicker; crossing dots by TYPE as the humans asked (green lights+sound, yellow lights, orange zebra, red unmarked/unknown; lib/scoring.js crossingType, same in every mode). Tapping a route card highlights its route (thick, on top, its crossings, zoomed to it) and reads the card out (lib/summary.js routeCardText) — the title is an aria-pressed button inside the h3. Card swatch = the map line. OSM attribution moved outside the aria-hidden map (a real link). Leaflet stays vendored (same cdnjs build, works offline). No hand-over to other map apps. 269 unit + 39 e2e green.
- 20:45 Search: live suggestions while typing (like a map app). New /api/autocomplete (ORS /geocode/autocomplete, cached, focus = GPS position or HOIV, ~55 km box, layers venue/address/street/neighbourhood/borough, max 6) + js/search.js (3 letters, 300 ms debounce, newest answer wins, big 64 px buttons right after the input, "N suggestions below." for screen readers, arrow keys / Escape, list never hidden on blur so VoiceOver can swipe into it). "Current location" is the default start; the start field has suggestions too (with a "Current location" row to go back). Position is fetched silently at Start (not in demo) to bias suggestions. ORS quality (live, from HOIV): Stephansdom 1st from "Steph", Karlsplatz/Westbahnhof/Belvedere/Albertina/Rathaus good; "Hauptbahnhof" → ORS lists the car-train terminal (Autoreisezug, ~1 km off) first; HOIV unknown; "Prater" → Böhmischer Prater (near HOIV) before the Wurstelprater; 3 letters listed villages 20–40 km away until the layers filter. Fixes: lib/places.js curated KNOWN_PLACES (HOIV, Hauptbahnhof main station) shown first + used by Enter and "take me to". Google Places NOT proposed: its terms forbid Places content on a non-Google map (Maps Platform ToS 3.2.3(e)) and we draw on OSM/Leaflet. 265 unit + 39 e2e green.
- 20:05 Voice always English: lib/voices.js picks an English voice explicitly (en-US, then en-GB, then any English; skips iOS joke voices like "Albert"/"Bad News", robotic ones last; Android "en_US" codes) and re-picks on voiceschanged (late voices). utterance.lang = en-US, recognition lang = en-US. Verified on this laptop's Turkish browser: default voice "Microsoft Tolga – Turkish" and no en-GB voice, so the old lang=en-GB alone could fall back to Turkish; now "Microsoft Mark (en-US)". 256 unit + 36 e2e green.
- 20:02 New test material (test-material/new-test): 9 photos + 6 video frames of a 69A → test/vision/bus/ (4 marked "-partial": blurred/cut off/far, "unreadable" counts as correct there). **Bus eval: 12/15, 0 critical** (misses = far shots, all "unreadable"; once it saw "68A" and refused). Clip → test/fixtures/bus-69a.y4m: new Playwright project "bus-video" replays the real model answers for its frames → "This is your bus, 69A, to Simmering". Stage clip: /?video=/demo/bus-69a.mp4. The "light test" video is a screen recording of the app (not camera footage). .vercelignore added (test-material, raw data, zip no longer uploaded). 246 unit + 35 e2e green.
- 17:38 Fixed a wrong spoken summary: with the new blind tie-break the fallback said "has fewer crossings: 4 instead of 3". The summary now states the real deciding reason in ranking order (worst crossing → unmarked/unknown → acoustic signals → crossing count), says "avoids" only when none are left, else "has fewer X: A instead of B". Checked all 16 changed real trips read correctly. `npm run zip` builds submission/crosswise.zip (7.4 MB, no secrets). 241 unit + 34 e2e green.
- 17:34 Map (the deferred optional Phase 1 item): Leaflet map under "Routes, safest first" — recommended route thick yellow, shortest dashed, crossings coloured like the cards (green lights+sound, blue lights, orange zebra, red unmarked/unknown); while walking it moves into the walking panel with a cyan walker dot. aria-hidden + inert (cards and speech carry the same info); axe still 0 violations; app works if the map fails to load. 238 unit + 34 e2e green.
- 17:26 Accessibility pass: automated axe-core audit (WCAG 2.1 A/AA) of start, main, route cards, walking and camera screens → 0 violations (now an e2e test). Fixed the double-speech problem: the visible status is no longer a live region; new "App voice: on/off" toggle (remembered) — off = VoiceOver/TalkBack reads messages from hidden live regions, crossing/danger alerts assertively. Error states tested: offline, GPS unavailable, GPS/camera/mic permission denied, server errors. 237 unit + 32 e2e green.
- 17:23 README.md and EVAL.md written (summary, 5 demo cases with status, baseline comparison, vision accuracy, honest limits, per-trip appendix). Still missing: real bus accuracy, outdoor walk results, real user feedback.
- 17:17 Crossing detection fix (branch member-nodes, merged): a crossing is "on the route" only if the route passes within 3 m of one of its crossing NODES (group centre still within 12 m + cluster radius). Measured on 6 real routes: 55 of 70 counted crossings were 0–2 m from a node (really used), 15 were 4–10 m away (pavement running past a crossing the user never takes), nothing in between → ~1 in 5 alerts/penalties were false. Snapshot now stores node positions (Vienna 511 KB). Belvedere route: 8 → 5 crossings, all with acoustic signals.
- 17:07 Baseline comparison on 30 random real trips around HOIV (scripts/eval-routes.js, saved ORS answers in eval/): vs the shortest route, unmarked/unknown crossings 43 → 21 (−51%), trips with any unmarked crossing 18 → 13, median +1.4 min when the route differs (max 6.5), worst crossing never worse. Blind tie-break after the worst crossing: fewest risky, then fewest crossings without acoustic signal (chosen by comparing 4 rules on the saved trips).
- 16:58 **Phase 7 done.** "Where am I?" button + voice command: street + house number (ORS reverse geocode, cached, optional), nearest 2 stops (new OSM stops snapshot: Vienna 5,121 / Budapest 6,098 named stops, downloaded once), nearest crossing with its type. Real answer at HOIV: "You are on Arsenalstraße, near number 11. Nearest stop: Hüttenbrennergasse, bus, 50 metres. Also Gräßlplatz, bus, 170 metres. Nearest crossing in 20 metres: traffic light, acoustic signal unknown." While walking it uses the current (or simulated) position. 224 unit + 26 e2e green.
- 16:47 **Phase 6 done.** Voice: big "Speak a command" button (tap to talk, beep = speak now, app voice is stopped first so the mic doesn't hear it). `lib/commands.js` keyword parser (61 tests): find my bus [line] ("13 a" → 13A, "sixty nine a" → 69A, "the D tram" → D), check the light, read, describe, where am I, take me to <place> (plans to the first search result), wheelchair/blind/limited mode, stop, repeat, help; uses the recogniser's 2nd/3rd guess if the 1st isn't understood. Fallback message when SpeechRecognition is missing (e.g. Firefox). 211 unit + 23 e2e green.
- 16:39 **Phase 4 done.** Kerb data: also downloaded (once) the `barrier=kerb` nodes that are part of crossing footways (Vienna 2,914, Budapest 1,104; bus-stop platform kerbs excluded) → crossings with known kerb in Vienna 1,642 → 2,562. Limited mobility now ranks by fewest risky (unmarked/unknown) crossings, then fewest crossings; no bonus for acoustic signals; summary says "Routes avoid steps." Real HOIV→Hbf in limited mode now avoids the unmarked crossing. Test with real Vienna crossings: same 3 candidate routes rank ACB (blind), BAC (wheelchair), CAB (limited). 150 unit + 18 e2e green.
- 16:30 **Phase 3 + Phase 5 done.** Camera assistant: Find my bus (live scan: 1 frame/1.2 s, one request in flight, soft tick per frame, "still looking" every 10 s, announce after 2 agreeing frames, "This is your bus, 13A" / "This is 26A, not your bus", gives up after 60 s), Check crossing light (never "safe", always "listen for traffic"), Read text, Describe surroundings (hazards first, max 3 sentences). `/api/look` = Claude Haiku 4.5 vision with structured JSON output. 137 unit + 18 e2e green (fake camera; 60 s timeout tested with Playwright's fake clock).
- 16:28 Vision eval (real photos, deployed API): light 10/12 (0 critical, both misses say "can't see a pedestrian light"), read 3/3, describe 11/11, bus: no photos yet. Eval now runs in ~30 s (3 parallel calls + retries). Details in EVAL.md.
- 15:25 **Phase 2 done.** `lib/guidance.js`: crossing alerts at ~40 m and ~10 m (type, acoustic signal, kerb in wheelchair/limited modes, "press the button under the box" when sound=yes, never "safe to cross"), turn instructions from ORS steps, arrival, off-route warning (only when GPS accuracy ≤ 40 m). Calm mode for busy intersections: turns < 15 m apart merged, no early warnings for minor turns or events right after another one → real Hbf walk went from 75 to 48 messages. `?demo=1` simulated walk (`&speed=`, `&at=` metres). Live GPS via watchPosition + screen wake lock + vibration on "Crossing now". 101 unit + 10 e2e green.
- 14:40 **Phase 1 done** (map deferred). Route comparison: `/api/route` (ORS + alternatives, cached, saved-demo-route fallback when ORS is down), `/api/geocode`, `/api/crossings` (city snapshot, Overpass fallback elsewhere). Snapshots: Vienna 8,987 crossing groups (374 KB), Budapest 7,257. UI: destination search, quick destinations, route cards (safest first, shortest marked), spoken summary. 78 unit + 7 e2e tests green.
- Real result (HOIV → Hauptbahnhof, blind mode): shortest route (26 min) has an unmarked crossing + one of unknown type; recommended route is 1 min longer and avoids it. HOIV → Belvedere: shortest = safest (all crossings signalled).
- 13:54 **Phase 0 done.** Skeleton live (index.html, Start, mode switch persisted, speech priority queue + watchdog), Vitest 11 tests + Playwright 3 tests green. Private repo github.com/garypiell/crosswise. `npm run deploy` = preview deploy + smoke test + updates this file.
- 13:37 Downloaded Overpass snapshots once: Vienna 21,468 nodes (5.1 MB), Budapest 14,579 nodes (3.6 MB) → `data/raw/` (git-ignored). Fixture `test/fixtures/overpass-hoiv.json` = 730 nodes in ~1.2 km bbox around HOIV (48.1761, 16.3954).
- 13:36 Test photos (26, no videos, no buses) labelled by content into `test/vision/{light,read,describe}/`; mapping in `test/vision/SOURCES.txt`. Fake cameras made from photos: `test/fixtures/{light-green,light-red,sign}.y4m`.

## Decisions
- Destination suggestions stay on ORS (+ curated places). Google Places Autocomplete was NOT adopted: its terms forbid showing/using Places content on a non-Google map (Maps Platform ToS 3.2.3(e)), and we draw routes on OSM/Leaflet; it would also need a billing account.
- Accent colour sky blue #4cc2ff (not violet/yellow): high contrast, calm, and far from the crossing colours; yellow now means "lights" on the map.
- Leaflet is vendored (public/vendor/leaflet, BSD-2, downloaded once from cdnjs) instead of loaded from the CDN: works offline, tests stay deterministic. Tiles: standard OpenStreetMap (CARTO dark tiles now need an API key), darkened with a CSS filter.
- Deviation from CLAUDE.md, backed by data: "on the route" = group within 12 m AND the route within 3 m of one of the group's crossing nodes (see log 17:17). Groups without node positions (old data) still use the plain 12 m rule.
- Deviation from CLAUDE.md, backed by data: blind ranking = worst crossing, then fewest unmarked/unknown, then fewest crossings without acoustic signal, then fewest crossings, then time (was: worst, count, time). Compared 4 rules on 30 real trips (EVAL.md).
- Voice is tap-to-talk (not press-and-hold): holding is awkward with VoiceOver/TalkBack. Recognition language en-US since 20:05 (German phrases are not understood yet).
- Kerbs are aggregated conservatively: if any kerb of a crossing group is raised, the group is "raised" (a wheelchair user must be warned). All other attributes keep "best known" (e.g. one sound=yes node → group has sound).
- Honest limit: on the real HOIV routes there are 0 raised kerbs, so wheelchair mode ranks them the same as blind mode; the difference shows in the spoken kerb info ("kerb height unknown at N crossings").
- Vision model stays `claude-haiku-4-5-20251001` as specified in CLAUDE.md (fast: ~1.5–2 s per frame). Answers use structured outputs (JSON schema), and lib/look.js validates them again; a "found" bus line with confidence < 0.6 is treated as unreadable (never guess a line).
- Single-photo checks (light/read/describe) turn the camera off right after the photo (battery + privacy).
- The bus-scan e2e test uses Chromium's fake camera with a mocked /api/look (there is no bus footage yet); the real model is measured by `npm run eval:vision`.
- Speech: newer "info" message replaces older info (user just tapped something); navigation/crossing/danger messages always finish and queue. Route summary is "info".
- Limited-mobility ranking currently = fewer crossings first; on HOIV→Hbf it picks the route with the unmarked crossing. Revisit in Phase 4.
- `/api/route` falls back to saved real ORS responses (`api/_data/`) for HOIV→Hauptbahnhof/Belvedere if ORS fails (also makes local dev work without keys).
- Project root is `Crosswise/` (kit files moved up from `hackathon-kit/`).
- Vercel keys are "Sensitive" → `vercel env pull` cannot download them, so local `.env.local` is empty of keys. Live API checks run against preview deploys; unit/e2e tests use fixtures and mocks.
- Local server for e2e is a tiny no-dependency `scripts/dev-server.js` (runs `/api/*.js` like Vercel) instead of `vercel dev`.
- `light__none__01.jpg` shows only red *car* signals (no pedestrian light) — deliberate hard case: the model must not report a car light as the pedestrian light.
- The very first `vercel deploy` went to **production** (CLI default for a brand-new project): https://crosswise-woad.vercel.app (public). All later deploys use `--target=preview`.
- Preview URLs are behind Vercel Authentication → open them on the phone while logged in to Vercel. Smoke tests use `vercel curl` (works in PowerShell, not Git Bash).
