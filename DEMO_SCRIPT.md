# DEMO_SCRIPT.md — 2-minute demo video (draft, update after the outdoor test)

Record the phone screen (iPhone: screen recording in Control Center; Android: quick settings → Screen record)
**with sound**, so the app's voice is in the video. Film outdoor shots with a second phone.
`<URL>` = the newest preview from the top of `PROGRESS.md` (or the production URL once deployed).

| Time | On screen | What we say (short sentences) |
|---|---|---|
| 0:00–0:10 | Street crossing near HOIV, then the phone | "Map apps give you the fastest route. For a blind person, the dangerous part is not the distance. It's the crossings." |
| 0:10–0:40 | Phone: `<URL>/?demo=1` → Start → **Wien Hauptbahnhof**. Show the 3 route cards and the map; let the summary play. | "Crosswise asks for three routes and checks every crossing in OpenStreetMap: traffic lights, acoustic signals, kerbs. The shortest route has an unmarked crossing. Ours is one minute longer and avoids it. On 30 random trips, that means half the unmarked crossings, for about a minute and a half." |
| 0:40–1:05 | Outdoor clip: walking the route, phone announces "Crossing now: traffic light with acoustic signal. Press the button under the box." Cut to the yellow push-button box. (Indoor fallback: `<URL>/?demo=1&speed=4`.) | "While you walk, it announces each crossing 40 metres before, and again when you're there — with the button position when there is an acoustic signal." |
| 1:05–1:30 | Outdoor clip at a bus stop: "Find my bus 69A" → "This is 18, not your bus" → "This is your bus, 69A". Show screen + bus in one shot. | "At the stop, you point the phone at arriving buses. It only speaks when two photos agree, and it tells you which bus is *not* yours." |
| 1:30–1:40 | Light check on a red or green light: "The pedestrian light looks red. Wait." | "It never says 'safe to cross'. One honest failure: a red figure that looked orange in the photo was reported as 'not visible'. It errs on the safe side." |
| 1:40–1:50 | Mode section → **Wheelchair**: routes re-plan, alerts mention "lowered kerb" / "kerb height unknown". | "Wheelchair mode switches to wheelchair routing and talks about kerbs. Where the map doesn't know, it says so — it never guesses." |
| 1:50–2:00 | Voice button: "Where am I?" → answer plays. End card: Crosswise + data sources. | "Voice commands, screen-reader support, everything spoken. Crosswise assists a cane or a guide dog. It never replaces them." |

## Shot list for the outdoor session
- [ ] Wide shot of a crossing near HOIV (5 s, for the intro)
- [ ] Screen recording while walking the first ~300 m of HOIV → Hauptbahnhof (with sound)
- [ ] Close-up: yellow push-button box when the app says "Press the button under the box"
- [ ] Bus stop: screen + bus in the same frame during "Find my bus"
- [ ] A pedestrian light check (red and green if possible)
- [ ] (Optional) the user test, if the person agreed to be filmed

## Numbers to use (from EVAL.md — update if they change)
- 30 random trips: 43 → 21 unmarked/unknown crossings (−51%), median +1.4 min
- Light check: 10/12 correct, 0 dangerous errors · read 3/3 · describe 11/11
- Bus numbers: add the real result after the outdoor test
