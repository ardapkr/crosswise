# PROGRESS.md

**Latest preview:** https://crosswise-kda0w0qz7-trua.vercel.app  (deployed 14:36; open while logged in to Vercel)

## Log (newest first)
- 15:25 **Phase 2 done.** `lib/guidance.js`: crossing alerts at ~40 m and ~10 m (type, acoustic signal, kerb in wheelchair/limited modes, "press the button under the box" when sound=yes, never "safe to cross"), turn instructions from ORS steps, arrival, off-route warning (only when GPS accuracy ≤ 40 m). Calm mode for busy intersections: turns < 15 m apart merged, no early warnings for minor turns or events right after another one → real Hbf walk went from 75 to 48 messages. `?demo=1` simulated walk (`&speed=`, `&at=` metres). Live GPS via watchPosition + screen wake lock + vibration on "Crossing now". 101 unit + 10 e2e green.
- 14:40 **Phase 1 done** (map deferred). Route comparison: `/api/route` (ORS + alternatives, cached, saved-demo-route fallback when ORS is down), `/api/geocode`, `/api/crossings` (city snapshot, Overpass fallback elsewhere). Snapshots: Vienna 8,987 crossing groups (374 KB), Budapest 7,257. UI: destination search, quick destinations, route cards (safest first, shortest marked), spoken summary. 78 unit + 7 e2e tests green.
- Real result (HOIV → Hauptbahnhof, blind mode): shortest route (26 min) has an unmarked crossing + one of unknown type; recommended route is 1 min longer and avoids it. HOIV → Belvedere: shortest = safest (all crossings signalled).
- 13:54 **Phase 0 done.** Skeleton live (index.html, Start, mode switch persisted, speech priority queue + watchdog), Vitest 11 tests + Playwright 3 tests green. Private repo github.com/garypiell/crosswise. `npm run deploy` = preview deploy + smoke test + updates this file.
- 13:37 Downloaded Overpass snapshots once: Vienna 21,468 nodes (5.1 MB), Budapest 14,579 nodes (3.6 MB) → `data/raw/` (git-ignored). Fixture `test/fixtures/overpass-hoiv.json` = 730 nodes in ~1.2 km bbox around HOIV (48.1761, 16.3954).
- 13:36 Test photos (26, no videos, no buses) labelled by content into `test/vision/{light,read,describe}/`; mapping in `test/vision/SOURCES.txt`. Fake cameras made from photos: `test/fixtures/{light-green,light-red,sign}.y4m`.

## Decisions
- Speech: newer "info" message replaces older info (user just tapped something); navigation/crossing/danger messages always finish and queue. Route summary is "info".
- Limited-mobility ranking currently = fewer crossings first; on HOIV→Hbf it picks the route with the unmarked crossing. Revisit in Phase 4.
- `/api/route` falls back to saved real ORS responses (`api/_data/`) for HOIV→Hauptbahnhof/Belvedere if ORS fails (also makes local dev work without keys).
- Project root is `Crosswise/` (kit files moved up from `hackathon-kit/`).
- Vercel keys are "Sensitive" → `vercel env pull` cannot download them, so local `.env.local` is empty of keys. Live API checks run against preview deploys; unit/e2e tests use fixtures and mocks.
- Local server for e2e is a tiny no-dependency `scripts/dev-server.js` (runs `/api/*.js` like Vercel) instead of `vercel dev`.
- `light__none__01.jpg` shows only red *car* signals (no pedestrian light) — deliberate hard case: the model must not report a car light as the pedestrian light.
- The very first `vercel deploy` went to **production** (CLI default for a brand-new project): https://crosswise-woad.vercel.app (public). All later deploys use `--target=preview`.
- Preview URLs are behind Vercel Authentication → open them on the phone while logged in to Vercel. Smoke tests use `vercel curl` (works in PowerShell, not Git Bash).
