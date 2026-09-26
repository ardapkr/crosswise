# PROGRESS.md

**Latest preview:** https://crosswise-n0ox8wanq-trua.vercel.app  (deployed 20:05; open while logged in to Vercel)

## Handover — Sat 19:34 (read this first in a new session)

State: `main` is clean, pushed, and green: `npm test` 241 passed, `npm run e2e` 34 passed (checked 19:34).
The newest preview above has everything. No outdoor feedback, bus photos or user feedback have arrived yet.

### Done (built, tested, deployed)
- **Phase 0–7 complete** (all boxes in TASKS.md except the 2 below). Features: safest-crossings route comparison
  (ORS alternatives + OSM crossing snapshot, spoken summary with the real reason), GPS guidance with crossing alerts
  at 40 m / 10 m and `?demo=1` walk, Find my bus live scan, check light / read / describe (Claude Haiku 4.5,
  structured JSON), 3 modes (wheelchair kerbs, limited mobility), voice commands, Where am I, Leaflet map.
- **Phase 8 done parts:** accessibility pass (axe 0 violations + App voice toggle for screen readers), error states
  spoken, README.md, EVAL.md (5 demo cases, baseline comparison, vision accuracy, limits), USER_TEST.md,
  DEMO_SCRIPT.md, `npm run zip`.
- **Measured:** 30 real trips: unmarked/unknown crossings 43 → 21 vs shortest route, median +1.4 min. Vision:
  light 10/12 (0 critical), read 3/3, describe 11/11.

### Half-done / waiting
- **Bus reading accuracy: unknown.** `test/vision/bus/` is empty (no bus photos in test-material). The scan logic is
  only tested with a fake camera + mocked answers. When photos come: name `bus__69A__01.jpg` / `bus__none__01.jpg`,
  put them in `test/vision/bus/`, run `npm run eval:vision -- --log`, tune `api/prompts.js` (never guess a line).
- **No real-world test yet:** GPS guidance outdoors, real lights, real buses, real phones (iPhone Safari / Android
  Chrome), real VoiceOver/TalkBack. Steps in HUMAN_TODO.md.
- **No real-user feedback yet** (judging criterion). Script ready: USER_TEST.md.
- **EVAL.md / README.md:** bus accuracy, outdoor results and user quotes still missing ("not measured yet").
- **DEMO_SCRIPT.md** is a draft; update with real footage + numbers.
- TASKS Phase 8 open: **submission ZIP** (script ready — run `npm run zip` after the last commit, at the freeze) and
  **production deploy** (needs the humans' OK; `vercel --prod` is in the "ask" list).

### Known bugs and weak spots
1. **Production URL https://crosswise-woad.vercel.app is public but STALE** — it is the Phase 0 skeleton from the
   very first deploy (no camera, `/api/route` 404). Don't share it until a production deploy is approved and done.
2. Light check misses (safe direction): a red figure that looks orange in the photo, and a signal shot from below,
   are reported "not visible" (`light__red__03`, `light__green__07`). Stopped prompt tuning at 12 photos to avoid
   overfitting.
3. Crossing detection is geometric: where pavements are not mapped separately, a route along a street can still
   "touch" crossings of that street (false "Crossing now"). The 3 m node rule was measured on 6 routes only.
   To verify on site: the simulated HOIV → Hbf walk says "Crossing now: traffic light…" right at the start (0 m).
4. OSM gaps: 28% of Vienna's signals have no acoustic-signal info, 71% of crossings no kerb info, raised kerbs are
   rare — so wheelchair mode often ranks routes the same as blind mode (it still speaks the kerb info).
5. ORS wheelchair profile gave only 1 route for HOIV → Hbf (nothing to compare on that trip).
6. No cap on extra time: the recommended route was up to 6.5 min longer (it is said out loud; the user can pick
   the shortest card).
7. Voice commands English only (en-US); no SpeechRecognition in Firefox (fallback message is spoken).
8. Map tiles come from tile.openstreetmap.org (fine for a demo, not for heavy traffic).

### Gotchas for the next session
- Deploy with `npm run deploy` (preview + smoke test + updates the URL line above). The PowerShell tool may be
  disabled; the npm script calls powershell.exe itself. Preview URLs need a Vercel login.
- `vercel curl` in Git Bash needs `MSYS_NO_PATHCONV=1`. It is sometimes flaky ("fetch failed"): retry.
- `.env.local` has **no keys** (Vercel "Sensitive" vars can't be pulled; reading `.env*` is blocked). Local
  `npm run dev` works with the saved demo routes; live ORS/vision checks run against a preview.
- `data/raw/` (Overpass downloads) is git-ignored. A fresh clone only has the built snapshots in `public/data/`,
  which is all the app needs. Re-download only if needed: `node scripts/fetch-crossings.js` (skips existing files).
- Don't edit files with `sed` when the text has backticks (GNU sed treats a backslash-backtick as an anchor and
  corrupted README once) — use the Edit tool or a small node script.
- Local server is `npm run dev` (scripts/dev-server.js), not `vercel dev`.

### Next steps, in order
1. Humans' outdoor test + bus photos → fix what breaks (Phone test prompt), measure bus accuracy, update EVAL.md.
2. Production deploy when the humans say so.
3. User test notes → EVAL.md "user feedback".
4. Morning freeze (06:00): final numbers in README/EVAL, `npm run zip`, ask before the production deploy.

## Log (newest first)
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
