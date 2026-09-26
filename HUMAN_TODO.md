# HUMAN_TODO.md — things only a human can do (fastest way first)

Open the newest preview URL from the top of `PROGRESS.md` on the phone **while logged in to Vercel**
(or turn off Deployment Protection — see bottom). Tap **Start** first (unlocks sound and camera).
Report back with the **Phone test** prompt from PROMPTS.md: what it said out loud, where it was wrong.

## Outdoor session 17:30–18:30 (daylight) — in this order

### 1. Find my bus at a real stop (≈10 min) ★ needs a human, can't be faked
1. Go to a bus/tram stop near HOIV (e.g. 69A or tram D/O/18 stops; 13A stops at Hauptbahnhof).
2. Type the line you wait for in **My bus or tram line** (e.g. `69A`), tap **Find my bus**.
3. Point the camera at the front of arriving vehicles. You should hear a soft tick per photo,
   "Still looking" every ~10 s, "This is 18, not your bus" for other lines, and
   "This is your bus, 69A, to …" + a chime for yours. It gives up after 60 s.
4. Note: how many seconds from "vehicle visible" to the announcement? Any wrong number (critical!)?
5. **Film it** (screen + bus in the same shot) — this is the strongest moment for the video.

### 2. Check crossing light (≈5 min)
At a signalled crossing, tap **Check crossing light** and point at the pedestrian light across the road.
Expected: "The pedestrian light looks green/red…" + "Listen for traffic before crossing". It must never
say "safe". Try once with green, once with red, once pointing at a car light (should say it can't see one).

### 3. Route guidance (≈20 min) ★ most important for the video
1. Stand at HOIV entrance (Arsenalstraße 11). Phone volume up.
2. Tap **Wien Hauptbahnhof** → listen to the summary. Expected: "The recommended route is 1 minute longer
   and avoids the unmarked crossing on the shortest route…"
3. Tap **Start this route** on the recommended card and walk the first ~300 m (2 crossings + turns).
4. For each crossing: did "In 40 metres…" and "Crossing now…" come at the right place? Too early / too late /
   missing / wrong type (lights vs zebra)? Was there really an acoustic signal box?
5. Film: the route cards + one "Crossing now: traffic light with acoustic signal. Press the button under
   the box" moment next to a real yellow box.

### 4. Photos for the vision eval (≈5 min while waiting at the stop)
Drop into `test-material/` and tell Claude (it renames and runs `npm run eval:vision`):
- 10–15 buses/trams: close with the number readable → name `bus__69A__01.jpg` (the real line);
  far away / number not visible → `bus__none__01.jpg`
- 1 short video (5–10 s) of a bus arriving → e.g. `bus-arriving.mp4` (used for the e2e test and a stage demo)

## Indoor fallback for the video
`<preview URL>/?demo=1&speed=4` simulates walking at 4 m/s (`&at=1450` starts 1450 m into the route).
Normal walking speed is `speed=1.3` (default).

## Also needed (judging criterion): feedback from a real intended user
Ask one blind / low-vision / wheelchair user (or an association, e.g. Hilfsgemeinschaft der Blinden und
Sehschwachen, BSVÖ) to try it for 10 minutes or give feedback on the video. Write down 3 quotes.

## Optional: no Vercel login on the phone
Vercel → project **crosswise** → Settings → Deployment Protection → Vercel Authentication → **Off**.
(This is a security setting, so a human should decide.)
