# PROMPTS.md — copy-paste these into Claude Code

---
## 1. KICKOFF (Saturday 13:00)
```
Read CLAUDE.md, TASKS.md and SETUP.md fully before doing anything. You are building this project
autonomously for the next ~18 hours. Follow the "How you work" rules in CLAUDE.md exactly.

First:
1. Check the environment: node, git, gh auth status, vercel whoami, ffmpeg. Tell me what's missing in one message.
2. Tell me the exact commands to add ORS_API_KEY and ANTHROPIC_API_KEY (vercel env add + .env.local).
   Wait for me to confirm they're added. Never read or print the keys.
3. Convert the videos in test-material/ to .y4m fake-camera files and copy photos into test/vision/<mode>/.
   Copy overpass-hoiv.json into test/fixtures/.

Then work through TASKS.md starting at Phase 0 and keep going phase after phase without waiting for me.
Write tests first for everything in public/lib, run them after every change, commit + push + deploy a
preview after every task, and keep PROGRESS.md current with the newest preview URL at the top.
Notify me when each phase is done or when you need something only a human can do.
```

---
## 2. PHONE TEST FEEDBACK (whenever you test a preview on your phone)
```
I tested <preview URL> on my phone (<iPhone Safari / Android Chrome>).
What worked: <...>
What didn't: <exact behaviour, error text, what it said out loud>
Fix these, add a test that would have caught each problem if possible, redeploy, and send me the new
preview URL. Then continue with TASKS.md.
```

---
## 3. OVERNIGHT (paste around 18:30, before dinner/sleep)
```
We're going offline for several hours. Keep working through TASKS.md autonomously until Phase 7 is done
or it's 05:30, whichever comes first.

Rules for tonight:
- main must always be working and deployed. Risky work on a branch, merge only when all tests pass.
- After every task: npm test, npm run e2e if UI changed, commit, push, vercel deploy, update PROGRESS.md.
- Run npm run eval:vision after any prompt change in api/prompts.js and log accuracy in EVAL.md.
  Improve prompts until bus reading on close images is reliable; never let the model guess a line number.
- Stuck ~30 min or 3 failed approaches → write BLOCKERS.md, choose the simplest workaround, move on.
- Things that need real-world testing: finish them as far as possible, test with fixtures and fake camera,
  and list exactly what we must test outside in HUMAN_TODO.md with the fastest way to do it.
- Use /compact when the conversation gets long.
- Only notify me for: phase complete, a blocker that truly needs a human, or if usage limits stop you.
Start now with the first unchecked task.
```

---
## 4. RESUME (after a limit reset, a crash, or switching to the other laptop)
```
Resume the project. First run git pull, then read CLAUDE.md, TASKS.md, PROGRESS.md, BLOCKERS.md and
HUMAN_TODO.md. Run npm test to confirm the current state is green. Summarise in 5 lines where we are,
then continue with the first unchecked task following all rules in CLAUDE.md.
```

---
## 5. MORNING FREEZE (06:00)
```
Feature freeze. No new features from now on. In this order:
1. Make sure main is green (unit + e2e) and deployed; give me the preview URL.
2. Fix only bugs that would break the demo.
3. Accessibility pass on the UI (labels, focus order, contrast).
4. Finish README.md and EVAL.md: problem, who it's for, features, how it works, data sources
   (OpenRouteService, OpenStreetMap/Overpass, Anthropic Claude), the 5 demo cases with results,
   baseline comparison (shortest route vs our route), vision accuracy, honest known failures and limits
   ("assists a white cane or guide dog, never replaces them").
5. Create the submission ZIP with git archive and tell me its path.
6. Ask me before the production deploy.
Notify me after each step.
```

---
## 6. DEMO SCRIPT (after freeze, while you edit the video)
```
Write a 2-minute demo video script as a table: time, what's on screen, what we say.
Cover: the problem (10 s), route comparison vs shortest route (30 s), walking with crossing alerts (25 s),
live bus scan (25 s), one honest failure (10 s), wheelchair mode switch (10 s), closing + limits (10 s).
Use ?demo=1 for the indoor parts. Keep sentences short.
```

---
## Emergency prompts
**It keeps failing at the same thing:**
```
Stop. Explain in 5 lines what you tried and why it fails. Then propose the simplest version that would
still work for the demo, implement that, and move on.
```
**The app broke on the phone right before filming:**
```
Revert main to the last commit where e2e passed and the phone test worked (check PROGRESS.md), redeploy,
send me the URL. Don't try new fixes now.
```
**Out of usage on this laptop:** switch to the other laptop and use the RESUME prompt.

---
## 7. CLOUD CHECK (tonight, on a throwaway repo in the `hackathon` environment)
```
This is a test of the cloud environment before a hackathon. Don't build anything. Check and report in a
short table (works / fails + error):
1. node -v, npm -v, git, ffmpeg -version, vercel --version, and that Playwright Chromium launches headless.
2. The env vars ORS_API_KEY, ANTHROPIC_API_KEY, VERCEL_TOKEN exist (print only "set"/"missing", NEVER the values).
3. Network: an HTTPS request reaches api.openrouteservice.org, overpass-api.de, api.anthropic.com and api.vercel.com
   (status codes only; a 401/403 from an API still counts as reachable).
4. Create a tiny index.html, deploy it with `vercel deploy --token "$VERCEL_TOKEN" --yes` and give me the preview URL.
5. Commit and push to a new branch `cloud-test`.
For every failure, tell me exactly what to change in the environment settings.
```

---
## 8. HAND OVER TO CLOUD (evening / when leaving)
Step 1 — in the LOCAL session:
```
We're moving to a cloud session. Finish the current task or stop at a clean point, make sure npm test passes,
commit, push to main, and update PROGRESS.md with: current task, what's half-done, and the next 3 tasks.
Then stop working.
```
Step 2 — start a **cloud session** on the repo (environment `hackathon`) and paste:
```
You are continuing an autonomous hackathon build in a cloud session. Read CLAUDE.md, TASKS.md, PROGRESS.md,
BLOCKERS.md and HUMAN_TODO.md first.

Cloud-specific rules:
- Create and work on branch `cloud-night` (from main). Push after every finished task. Never push to main.
- Deploy previews with: vercel deploy --token "$VERCEL_TOKEN" --yes  → put the URL at the top of PROGRESS.md.
- Never print or log env var values.
- If an API is unreachable, it's probably the network allowlist: write it in BLOCKERS.md, use fixtures and
  mocks, and keep going on other tasks.
- You can't test on a real phone or outdoors: build it, test with fixtures + fake camera, and list the real-world
  checks in HUMAN_TODO.md.

Then follow the OVERNIGHT rules in PROMPTS.md: work through TASKS.md until Phase 7 is done or 05:30, whichever
comes first. Notify me only for phase completions or real blockers.
```

---
## 9. BACK FROM CLOUD (morning, in the LOCAL session)
```
The cloud session worked overnight on branch cloud-night. git fetch, check out cloud-night, run npm test and
npm run e2e. If green, merge it into main, push, and vercel deploy. If something is red, fix it on the branch
first. Then summarise in 5 lines what was done overnight (from PROGRESS.md, BLOCKERS.md, HUMAN_TODO.md) and
continue with the MORNING FREEZE prompt.
```
