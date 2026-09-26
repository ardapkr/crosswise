# USER_TEST.md — 10-minute test with a real intended user

Judges score "feedback from a real intended user". One honest 10-minute session is enough. Take notes in the
table below, then paste them into Claude: *"Here are the user test notes: … — add them to EVAL.md."*

## Who
One (better: two) people from the target group: blind or low-vision, wheelchair user, or someone who walks slowly
(rollator, crutches). An orientation-and-mobility trainer also counts. Ask friends, family, classmates, or a Vienna
disability association (blind/low-vision associations, wheelchair user groups). A video call works too: they can
use the app on their own phone.

## Before you start (say this, 30 seconds)
> "We built a prototype app in one day. It suggests walking routes with safer crossings, announces crossings, and
> uses the camera to read bus numbers and traffic lights. It is only a helper — please keep using your cane, dog or
> normal routine. We are testing the app, not you. Is it OK if we take notes and quote you (without your name)?"

Only record audio/video or faces if they explicitly agree.

## Setup
- Phone volume up. Open the newest URL from `PROGRESS.md` (needs Vercel login on the phone, or ask Claude for
  a production deploy so the link is public).
- If they use **VoiceOver or TalkBack**: on the start screen (or later in **Settings**, top right) tap
  **App voice: on** to turn it off. Their screen reader then reads everything.
- Pick their mode: Blind / low vision, Wheelchair or Limited mobility.

## Tasks (1–2 minutes each)
| # | Say to them | What to watch |
|---|---|---|
| 1 | "Please find the safest walking route to Wien Hauptbahnhof." | Can they find the button/voice command? Do they understand the spoken summary? |
| 2 | "Start the recommended route and walk to the first crossing." (Indoors: use `?demo=1`.) | Are the crossing alerts early enough? Too many messages? |
| 3 | "Check the pedestrian light." (Real light, or a photo of one on a laptop.) | Is "looks green … listen for traffic" clear? Would they trust it? |
| 4 | "Say: find my bus 69A." Point at a bus (or a bus photo on a screen). | Is the wait OK? Is "not your bus" useful? |
| 5 | "Ask the app where you are." | Is the answer useful? What's missing? |

## Questions at the end
1. Would you use this? For what, exactly?
2. What was the most useful part?
3. What was confusing, annoying, or wrong?
4. How much would you trust the crossing information (lights, acoustic signal, kerbs)? 1 = not at all … 5 = fully
5. What must change before you'd use it on a real walk?

## Notes
| Task | Worked? (yes / partly / no) | What they said (quote) | Problem we saw |
|---|---|---|---|
| 1 Route | | | |
| 2 Walk | | | |
| 3 Light | | | |
| 4 Bus | | | |
| 5 Where am I | | | |

Trust rating (1–5): ___  ·  Mode used: ___  ·  Screen reader: yes / no  ·  Phone: ___
