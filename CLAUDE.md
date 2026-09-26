# CLAUDE.md — SafeCross (working name)

You are building a hackathon project **autonomously**. The two humans are beginners and are often away
(asleep, filming, eating). Work nonstop through `TASKS.md`, test your own work, and only notify them
when a phase is done or you are truly blocked.

## The product in one paragraph
A mobile web app that helps blind, low-vision, wheelchair and limited-mobility pedestrians get around
Vienna. Its core: compare walking routes and pick the one with the **safest crossings** (traffic lights
with acoustic signals, lowered curbs), then guide the user along it and announce each crossing *before*
they reach it. On top of that, a live camera "assistant": **find my bus** (continuous scan until the line
number is read), **check the crossing light**, **read text**, **describe surroundings**. Everything is
operable by big buttons, screen readers and push-to-talk voice commands, and everything is spoken aloud.

## Event facts (do not forget)
- TELOS Hackathon, Track A1 · Applied AI for Consumers. Build window Sat 13:00 → **Sun 08:30 (CEST)**.
- Submission = demo video (≤2 min ideal, 4 max) + ZIP of the Git repo. Treat **07:30** as the real deadline.
- Judging (A1) rewards: task completion on 5 cases, comparison vs a simple baseline (shortest route),
  feedback from a real intended user, and honest successes AND failures.
- Venue: HOIV, Arsenalstraße 11, 1030 Vienna. Default demo area = ~1 km around it.

## Stack (keep it boring, no framework, no build step)
- **Frontend:** plain HTML + CSS + ES modules in `/public`. No React, no bundler.
- **Pure logic:** `/public/lib/*.js` — pure functions, no DOM, no fetch. Imported by the browser AND by tests.
- **Backend:** Vercel serverless functions in `/api/*.js` (Node 20, ESM). They hold all API keys.
- **Tests:** Vitest (`npm test`) for `/public/lib`, Playwright (`npm run e2e`) for the UI.
- **Hosting:** Vercel. `vercel dev` locally, `vercel deploy` for preview URLs (these work on the phone, HTTPS).
- **Repo:** GitHub, private, created by you at the start. Commit small, commit often, push after every task.

## External services
| Purpose | Service | Where the key lives |
|---|---|---|
| Walking/wheelchair routes, geocoding | OpenRouteService (`/v2/directions/{profile}/geojson`, `/geocode/search`) | `ORS_API_KEY` |
| Crossings and their tags | OSM Overpass API (`https://overpass-api.de/api/interpreter`), no key | – |
| Vision (bus, light, text, scene) | Anthropic Messages API, model `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| Speech out | Browser `speechSynthesis` | – |
| Speech in | Browser `SpeechRecognition` / `webkitSpeechRecognition`, push-to-talk | – |

Keys are in `.env.local` (local) and Vercel env vars (deployed). **Never read, print, log or commit keys.
Never put a key in `/public`.** Only `/api` functions may use them.

ORS profiles: blind/low-vision → `foot-walking`; wheelchair → `wheelchair`; limited mobility →
`foot-walking` with `options.avoid_features: ["steps"]`. Ask for alternatives with
`alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 }`.
Free tier has rate limits: **cache every ORS and Overpass response** (in-memory in the function + fixtures for tests).

## Crossing data rules (learned from real Overpass data around HOIV)
- Main source: a preprocessed **city snapshot** (`public/data/crossings-vienna.json`, built once from Overpass by
  `scripts/`). Never depend on live Overpass during the demo. Live query (`node["highway"="crossing"]` +
  `node["highway"="traffic_signals"]`, route bbox + 50 m) is only the fallback outside Vienna/Budapest.
- Never re-download the whole city repeatedly; the public Overpass server is shared.
- Signalled = `crossing=traffic_signals` OR `crossing:signals=yes`. Unsignalled = `uncontrolled`, `marked`,
  `zebra`, `unmarked`, or `crossing:signals=no`.
- Use `traffic_signals:sound` and `traffic_signals:vibration`. **Ignore `button_operated`** (inconsistent in Vienna).
- `kerb`: `lowered`/`flush` good, `raised` bad, missing = **unknown** (say so, never guess).
- Skip nodes with `level` ≠ 0/missing (e.g. `level=-1`) and `access=private`.
- **Cluster** crossing nodes within 20 m into one "crossing group" (one intersection has up to 15 nodes).
  A group takes its best-known value per attribute.
- A crossing group is "on the route" if within 12 m of the route line.
- Scores (blind mode): lights+sound 3, lights only/unknown sound 2, zebra 1, unmarked 0.
  Wheelchair mode: add −2 for raised kerb, −0.5 for unknown kerb, +0.5 for lowered.
  Route score = worst crossing first, then number of crossings, then duration.
- The fixture `test/fixtures/overpass-hoiv.json` is real data — use it in tests.

## Vision rules
- One endpoint: `POST /api/look` with `{ mode, image (base64 jpeg), context }`.
  Modes: `bus`, `light`, `read`, `describe`. Each mode has its own system prompt in `/api/prompts.js`.
- The model must answer **JSON only**, e.g. bus: `{"status":"found|not_visible|unreadable","line":"13A","destination":"...","confidence":0-1}`.
  Strip code fences before `JSON.parse`; on parse failure treat as `unreadable`.
- Frontend downscales frames to max 768 px wide, JPEG quality ~0.7 before sending.
- **Live bus scan:** one request in flight at a time (skip frames while waiting), ~1 frame / 1.2 s,
  soft tick per scan, say "still looking" every ~10 s, announce only when **2 consecutive frames agree**
  on the line, stop on success or after 60 s ("I couldn't find it — you may want to ask someone nearby").
  If the user's target line is known, say "This is your bus, 13A" or "This is 26A, not your bus".
- Light mode must **never** say "safe to cross". Say what it sees ("the pedestrian light looks green")
  plus "listen for traffic before crossing".

## UX rules (this is an accessibility app — the UI itself must be accessible)
- Huge buttons (min 64 px tall), high contrast, works with VoiceOver/TalkBack (`aria-label`s, real `<button>`s).
- Every result is **spoken** and also shown as large text.
- A big "Start" button unlocks audio/camera (iOS requires a user tap first).
- Mode switch: Blind / Wheelchair / Limited mobility — persisted in `localStorage`.
- Speech priority: danger > crossing alert > navigation > info. Never talk over a more important message.
- `?demo=1` = **demo mode**: simulated GPS walking along the chosen route at 1.3 m/s, so everything
  can be shown indoors on stage. Optional `?video=...` uses a test video instead of the camera.

## How you work (autonomy rules)
1. Read `TASKS.md`. Take the first unchecked task. Keep `PROGRESS.md` updated (one line per finished task + time).
2. For each task: write/extend tests first for any logic in `/public/lib`, implement, then run
   `npm test` (and `npm run e2e` if UI changed). **Do not mark a task done until tests pass.**
3. Commit with a clear message, `git push`, then `vercel deploy` (preview) and smoke-test the preview
   with `curl` against the `/api` endpoints. Put the latest preview URL at the top of `PROGRESS.md`.
4. If stuck on the same problem for ~30 minutes or 3 failed approaches: write it in `BLOCKERS.md`,
   pick the simplest workaround or skip, and move on. Never loop forever.
5. Don't ask the humans for decisions you can make yourself. Pick the simpler option and note it in `PROGRESS.md`.
6. Notify the humans only when: a phase in `TASKS.md` is complete, a blocker needs a human
   (keys, real-world testing, accounts), or the preview URL is ready for phone testing.
7. Keep the app **always working** on `main`. Risky changes go on a branch; merge only when tests pass.
8. Prefer small files, clear names, comments for beginners. No new dependencies unless they save real time.
9. Things only humans can do: walk outdoors, point the camera at real buses/lights, record the video,
   talk to users. Prepare everything so those moments take minutes, not hours.

## If you are running in a cloud session
- You're on an Anthropic VM, not the humans' laptop. Work on branch `cloud-night`, never push to `main`.
- Deploy with `vercel deploy --token "$VERCEL_TOKEN" --yes`. Keys come from environment variables — never print them.
- Unreachable API = network allowlist problem → note in BLOCKERS.md, use fixtures/mocks, continue.

## Commands
- `npm test` — unit tests (Vitest)
- `npm run e2e` — Playwright, Chromium with fake camera (`--use-fake-device-for-media-stream`,
  `--use-file-for-fake-video-capture=test/fixtures/<file>.y4m`) and mocked geolocation
- `npm run eval:vision` — runs every image in `test/vision/<mode>/` through `/api/look`, compares to the
  expected answer in the filename (e.g. `bus__13A__01.jpg`), prints accuracy per mode → numbers for the pitch
- `vercel dev` — local server on port 3000
- `vercel deploy` — preview deploy (production deploy only when a human asks)
