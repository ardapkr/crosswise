# HUMAN_TODO.md — things only a human can do (fastest way first)

Open the newest preview URL from the top of `PROGRESS.md` on the phone **while logged in to Vercel**
(or ask Claude to turn off Deployment Protection — see bottom). Tap **Start** first (unlocks sound).

## 1. Route comparison + guidance outdoors (≈20 min, daylight) ★ most important for the video
1. Stand at HOIV entrance (Arsenalstraße 11). Phone volume up, screen reader optional.
2. Tap **Wien Hauptbahnhof** → listen to the summary. Expected: "The recommended route is 1 minute longer
   and avoids the unmarked crossing on the shortest route…"
3. Tap **Start this route** on the recommended card and walk the first ~300 m (2 crossings + turns).
4. Note for each crossing: did the "In 40 metres" and "Crossing now" alerts come at the right place?
   Too early / too late / missing / wrong type (lights vs zebra)? Was there an acoustic signal box?
5. Also film: the route cards on screen + one "Crossing now: traffic light with acoustic signal. Press the
   button under the box" moment next to a real yellow box.
Report back with the **Phone test** prompt (what it said, where it was wrong).

## 2. Indoor fallback for the video
`<preview URL>/?demo=1&speed=4` simulates walking at 4 m/s (use `&at=1450` to start 1450 m into the route).
Normal walking speed is `speed=1.3` (default).

## 3. Bus photos (needed for Phase 3 — Find my bus) ★
The test-material had **no bus photos**. Please take 10–15, any Vienna bus/tram stop:
- close, number readable → name `bus__13A__01.jpg` (the real line number)
- too far / number not visible → `bus__none__01.jpg`
- 1 short video (5–10 s) of a bus arriving → any name, e.g. `bus-arriving.mp4`
Drop them into `test-material/` and tell Claude. (13A stops at Hauptbahnhof; D tram and 69A near HOIV.)

## Optional: no Vercel login on the phone
Vercel → project **crosswise** → Settings → Deployment Protection → Vercel Authentication → **Off**.
(This is a security setting, so a human should decide.)
