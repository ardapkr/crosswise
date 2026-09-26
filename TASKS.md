# TASKS.md — work top to bottom. Check `[x]` only when tests pass and it's pushed + deployed.

## Phase 0 — Skeleton (target: done by 14:00)
- [x] Init repo: `package.json` (type: module, scripts test/e2e/eval:vision), `.gitignore` (node_modules, .env*, .vercel), folders `/public /public/lib /api /test /test/fixtures /test/vision`
- [x] Create private GitHub repo with `gh repo create`, push `main`
- [x] `vercel link`, confirm env vars exist with `vercel env ls` (do NOT print values), first `vercel deploy`
- [x] `index.html` with Start button, mode switch (Blind / Wheelchair / Limited mobility), big status text, `speak()` helper
- [x] Vitest + Playwright installed and one passing test each
- [x] Copy `overpass-hoiv.json` into `test/fixtures/`
- [x] Notify: "Skeleton live at <preview URL>"

## Phase 1 — Route comparison (target: 17:00) ★ core
- [x] `/api/route`: ORS directions with alternatives for the chosen profile, cached; returns GeoJSON routes
- [x] `/api/geocode`: ORS geocode, focus on Vienna, returns top 3 matches
- [x] `scripts/fetch-crossings.js`: download ALL crossings + traffic_signals for Vienna (bbox 48.118,16.182,48.323,16.578) and Budapest (47.35,18.92,47.62,19.34) from Overpass ONCE (timeout 300, polite, retry once); save raw to `data/raw/`
- [x] `scripts/build-crossings.js`: filter + classify + cluster with lib/crossings.js, keep only needed tags, write compact `public/data/crossings-vienna.json` and `crossings-budapest.json`; print counts + file size
- [x] `/api/crossings`: serve from the snapshot for Vienna/Budapest bbox; live Overpass (cached) only as fallback elsewhere
- [x] `lib/geo.js`: distance, point-to-line distance, bbox (tested)
- [x] `lib/crossings.js`: filter (level, private), classify, cluster within 20 m (tested with fixture)
- [x] `lib/scoring.js`: per-mode crossing score + route ranking (tested: safer route must beat shorter route on fixture)
- [x] UI: from/to input (+ "use my location"), shows routes as simple cards: duration, #crossings, worst crossing, colour
- [x] Spoken summary: "Route 2 is 3 minutes longer, but every crossing has lights and an acoustic signal."
- [x] Optional small map (Leaflet from cdnjs) — only if everything above works  _(Leaflet 1.9.4 vendored in public/vendor, OSM tiles)_
- [x] Save 3 real ORS responses around HOIV as fixtures so tests never need the network
- [x] Notify: "Route comparison ready to test on phone"

## Phase 2 — Guidance + crossing alerts (target: 18:30 — outdoor filming starts)
- [x] `lib/guidance.js`: given position + route + crossing groups → next event (turn / crossing) and distance (tested)
- [x] Live GPS with `watchPosition`; announce crossing at ~40 m and ~10 m: type, sound signal, kerb info, "press the button under the box" when sound=yes
- [x] Turn instructions from ORS steps
- [x] `?demo=1` simulated walk along the route (Playwright test runs it)
- [x] Notify: "Guidance ready — test outdoors / film"

## Phase 3 — Live bus scan (target: 22:00)
- [x] `/api/look` + `/api/prompts.js` (all 4 modes), JSON-only answers, robust parsing
- [x] `lib/scan.js`: agreement logic (2 consecutive matches), timeouts, "still looking" cadence (tested)
- [x] Camera module: rear camera, downscale to 768 px, one request in flight
- [x] "Find my bus" flow with optional target line ("I need 13A")
- [x] Playwright e2e with a fake-camera video of a bus  _(fake camera stream + mocked /api/look; no real bus footage yet → HUMAN_TODO)_
- [x] `npm run eval:vision` script
- [x] Notify: "Bus scan ready — needs real bus test"

## Phase 4 — Modes (target: 23:30)
- [x] Wheelchair profile + kerb scoring + "curb height unknown" messages
- [x] Limited mobility: avoid steps, prefer fewer crossings
- [x] Tests: same fixture ranks differently per mode

## Phase 5 — Look features (target: 01:00)  _(built together with the Phase 3 camera UI)_
- [x] Crossing light check (never "safe to cross")
- [x] Read text
- [x] Describe surroundings (short, most important first, max ~3 sentences)

## Phase 6 — Voice (target: 02:30)
- [x] Push-to-talk button, `lib/commands.js` keyword parser (tested): find my bus [line], read, describe, check light, where am I, take me to <place>, switch mode
- [x] Graceful fallback message when SpeechRecognition isn't supported

## Phase 7 — Where am I (target: 03:00)
- [x] Street name + nearest stop / crossing from ORS reverse geocode or Overpass

## Phase 8 — Polish + submission (target: 07:00, hard stop 07:30)
- [x] Accessibility pass: screen reader labels, focus order, contrast  _(axe-core WCAG 2.1 AA: 0 violations on all 5 screen states; App voice toggle for VoiceOver/TalkBack users)_
- [x] Error states spoken aloud (no network, GPS denied, camera denied)
- [x] README: problem, features, how it works, data sources, honest limits, eval numbers, how to run  _(update eval numbers after real bus/outdoor tests)_
- [x] `EVAL.md`: the 5 demo cases, baseline comparison, vision accuracy, known failures  _(bus accuracy + outdoor results still to add)_
- [ ] `git archive` ZIP of the repo for submission
- [ ] Final production deploy (ask human first)

## Phase 9 — Feedback round 1 (Sat 19:45, from the humans' phone test) — commit, test, deploy after each
- [x] New test material (`test-material/new-test/`): 15 bus images in the vision eval (12/15, 0 critical), the 69A clip as e2e fake camera + stage demo clip
- [x] Voice: always English whatever the phone language (en-US voice picked explicitly, late-loading voices), recognition en-US
- [ ] Search: live suggestions while typing (ORS autocomplete via `/api/autocomplete`), "Current location" as default start; report ORS quality for Stephansdom / Hauptbahnhof / HOIV
- [ ] Map: each route its own colour, recommended thicker, crossing dots green/yellow/orange/red, tapping a route card highlights it
- [ ] UI redesign: dark + one accent, search on top, full-screen map, bottom sheet with route cards, camera bottom bar, segmented mode control → show the humans a preview before polishing
