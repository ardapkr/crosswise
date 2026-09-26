# SETUP.md — do this tonight / Friday, NOT on Saturday

Goal: at 13:00 Saturday you paste one prompt and Claude Code starts building. Everything below must already work.

## 1. Install (both laptops)
| Tool | Check it works |
|---|---|
| Node.js 20 LTS or newer | `node -v` |
| Git | `git --version` |
| GitHub CLI | `gh --version` then `gh auth login` (choose HTTPS, login with browser) |
| Vercel CLI | `npm i -g vercel` then `vercel login` |
| ffmpeg (turns test videos into fake camera files) | `ffmpeg -version` |
| Claude Code | `claude --version`, then run `claude` once and log in with your Pro account |
| Claude mobile app | logged in with the same account, notifications allowed |

Tip: you can ask Claude Code itself to install the missing ones ("install gh, vercel and ffmpeg for my OS and check they work").

## 2. API keys (get them tonight — signups can be slow)
1. **OpenRouteService** — sign up at openrouteservice.org → create a free token.
2. **Anthropic API** — console.anthropic.com → add ~$10 credit → create a key.
   ⚠️ Your Claude **Pro plan does NOT include API access.** The app's vision features need this separate key.
   Set a monthly spend limit in the console so nothing surprises you.
3. Keep both keys in a password manager or a private note. At 13:00 Claude will ask you to add them — you
   will run `vercel env add ORS_API_KEY` and `vercel env add ANTHROPIC_API_KEY` yourself, and put them in
   `.env.local`. Claude is configured to never read that file.

## 3. The kit folder
Put this whole `hackathon-kit` folder somewhere safe, e.g. `~/hackathon-kit`.
Also save the Overpass export you made (`overpass-hoiv.json`) into it. At 13:00 you'll copy the kit into a new
empty project folder, so `CLAUDE.md`, `TASKS.md` and `.claude/settings.json` are there from the first second.

> If the rules require all code to be written during the build window: this kit contains **no app code**,
> only instructions and config. That's the same as preparing a plan on paper.

## 4. Permissions — nonstop without clicking "approve" all the time
Two levels, pick the strongest one that works for you:

**Level A (always works): `acceptEdits` + allowlist** — already in `.claude/settings.json`.
File edits, npm, git, vercel preview deploys, curl, tests all run without asking. Dangerous things
(force-push, `sudo`, reading `.env`, production deploy) are blocked or ask first.

**Level B (if available on your plan): auto mode.** A safety classifier approves actions for you, so almost
nothing asks. It can't be set from the project file — start Claude with:
```
claude --permission-mode auto
```
If that says auto mode isn't available, stay on Level A. It's fine.

**Don't** use `--dangerously-skip-permissions` on your personal laptop.

Check what's active anytime with `/permissions` inside Claude Code.

## 5. Remote control + notifications
1. Inside the project folder: `claude --permission-mode auto` (or just `claude`), then type `/remote-control`.
2. On your phone: Claude app → Code → open the session.
3. Once: `/config` → turn on push notifications ("when Claude decides" + "when actions required").
4. Remember: no push while that window is focused. Lock the screen or switch windows when you leave.

## 6. Keep the laptop awake (this is the #1 cause of "it stopped overnight")
- **Mac:** keep it plugged in, then in a separate terminal run `caffeinate -dimsu` and leave it open.
- **Windows:** plug in → Settings → System → Power → Screen and sleep → "When plugged in, put my device to sleep: Never".
- Lid closed = sleep on most laptops. Leave it open (dim the screen).
- Wi-Fi at the venue can drop. Remote Control reconnects, but check your phone every ~1–2 hours at night.

## 7. Usage limits — the real bottleneck
Pro has usage limits that reset every few hours. Nonstop building will hit them.
- Use **Sonnet** for normal building (`/model` → Sonnet). Switch to Opus only for a nasty bug.
- **You have two Pro accounts.** Laptop A runs the main build. When A hits its limit, laptop B continues on
  the same repo (`git pull` first, then the "Resume" prompt from `PROMPTS.md`). Never run both on the same
  files at the same time.
- `/compact` when a session gets long; it keeps Claude fast and cheaper.

## 8. Test material to collect Friday (10 minutes, huge payoff)
Claude can't walk outside. Give it recordings so it can test itself all night:
- 3–4 short phone videos: a bus/tram arriving at a stop, a pedestrian light turning green, a sign/text.
- 15–20 photos: buses with visible numbers (name them like `bus__13A__01.jpg`), buses too far away
  (`bus__none__01.jpg`), pedestrian lights (`light__green__01.jpg`, `light__red__01.jpg`), signs (`read__<word>__01.jpg`).
  Budapest buses are fine for testing reading numbers.
Put them in the kit folder under `test-material/`.

## 9. Saturday flow
| Time | Who | What |
|---|---|---|
| 13:00 | You | New folder, copy kit + test material in, start Claude, paste **Kickoff** prompt, add keys when asked |
| 13:00–17:30 | Claude | Phases 0–2. You: test each preview URL on your phone, feed back with the **Phone test** prompt |
| 17:30–18:30 | You | Outdoor: test + film route, crossing alerts, bus scan (daylight!) |
| 18:30 | Claude | Paste **Overnight** prompt. You: eat, sleep in shifts |
| Night | One of you | Check phone every 1–2 h, answer blockers |
| 06:00 | You | **Morning** prompt: freeze features, polish, README, ZIP |
| 06:00–07:30 | You | Cut the demo video, submit by 07:30 |

## 10. Cloud sessions — the backup that keeps working with the laptop closed
Your one-time **$100 credit (per Pro account)** only works in cloud sessions. A cloud session runs Claude Code
on an Anthropic virtual machine that clones your GitHub repo. It doesn't care if your laptop sleeps or the
Wi-Fi drops, and you watch/steer it from the Claude app (Code tab).

### Tonight (≈30 min, both accounts)
1. **Claim the credit:** run `/claim-credit` in Claude Code (deadline Oct 7, but do it now).
2. **Connect GitHub:** in Claude Code run `/web-setup`, or open claude.ai/code and connect GitHub.
3. **Get a Vercel token:** vercel.com → Account Settings → Tokens → create one (expires in 7 days is fine).
4. **Create a cloud environment** at claude.ai/code → environment switcher → **Add cloud environment**:
   - **Name:** `hackathon`
   - **Network access:** **Custom**, tick "Also include default list of common package managers", and add:
     ```
     api.openrouteservice.org
     overpass-api.de
     api.anthropic.com
     api.vercel.com
     *.vercel.app
     vercel.com
     ```
     (The Default "Trusted" level only reaches package registries — your APIs would silently fail.)
   - **API credentials / environment variables:** `ORS_API_KEY`, `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`.
     If the "API credentials" field accepts them, use it (sessions can use them without seeing them).
     Otherwise use environment variables. After you `vercel link` the real project on Saturday, also add
     `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (they're in `.vercel/project.json`).
   - **Setup script** (runs once as root on Ubuntu before Claude starts, then gets cached):
     ```bash
     #!/bin/bash
     set -e
     apt-get update && apt-get install -y ffmpeg
     npm install -g vercel
     npx -y playwright install --with-deps chromium
     ```
     ⚠️ Environment variables are **not** available inside the setup script — only in the session. So don't
     log in to anything in the script; the session uses `VERCEL_TOKEN` itself.
5. **Dry run on a throwaway repo:** make an empty GitHub repo, start a cloud session in the `hackathon`
   environment and paste the **Cloud check** prompt from PROMPTS.md. Fix whatever it reports. Delete the repo after.

### How the two modes fit together on the weekend
| Situation | Use |
|---|---|
| Daytime, you're testing on the phone every 20 min | **Local** session + Remote Control (fastest loop) |
| Overnight, or you're both away | **Cloud** session on branch `cloud-night` |
| Pro limit hit on laptop A | Laptop B local, or a cloud session (uses the $100 credit) |

Rules so they never fight:
- **Only one session writes at a time.** Before switching: the old session commits and pushes, then stops.
- Cloud sessions work on their **own branch** and deploy **previews** only. In the morning the local session
  merges `cloud-night` into `main` after the tests pass.
- To pull a cloud session back into your terminal: `claude --teleport`. To send local work to the cloud:
  push first, then start the cloud session (or use `claude --cloud` / `--remote` from the project folder).
- Watch the usage page on claude.ai — it's not officially clear whether the $100 credit is used before or
  after your plan's normal allowance.
