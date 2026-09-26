# PROGRESS.md

**Latest preview:** https://crosswise-1q7tlljuq-trua.vercel.app  (deployed 14:06; open while logged in to Vercel)

## Log (newest first)
- 13:54 **Phase 0 done.** Skeleton live (index.html, Start, mode switch persisted, speech priority queue + watchdog), Vitest 11 tests + Playwright 3 tests green. Private repo github.com/garypiell/crosswise. `npm run deploy` = preview deploy + smoke test + updates this file.
- 13:37 Downloaded Overpass snapshots once: Vienna 21,468 nodes (5.1 MB), Budapest 14,579 nodes (3.6 MB) → `data/raw/` (git-ignored). Fixture `test/fixtures/overpass-hoiv.json` = 730 nodes in ~1.2 km bbox around HOIV (48.1761, 16.3954).
- 13:36 Test photos (26, no videos, no buses) labelled by content into `test/vision/{light,read,describe}/`; mapping in `test/vision/SOURCES.txt`. Fake cameras made from photos: `test/fixtures/{light-green,light-red,sign}.y4m`.

## Decisions
- Project root is `Crosswise/` (kit files moved up from `hackathon-kit/`).
- Vercel keys are "Sensitive" → `vercel env pull` cannot download them, so local `.env.local` is empty of keys. Live API checks run against preview deploys; unit/e2e tests use fixtures and mocks.
- Local server for e2e is a tiny no-dependency `scripts/dev-server.js` (runs `/api/*.js` like Vercel) instead of `vercel dev`.
- `light__none__01.jpg` shows only red *car* signals (no pedestrian light) — deliberate hard case: the model must not report a car light as the pedestrian light.
- The very first `vercel deploy` went to **production** (CLI default for a brand-new project): https://crosswise-woad.vercel.app (public). All later deploys use `--target=preview`.
- Preview URLs are behind Vercel Authentication → open them on the phone while logged in to Vercel. Smoke tests use `vercel curl` (works in PowerShell, not Git Bash).
