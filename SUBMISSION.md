# SUBMISSION.md — ready to paste

Team: [TEAM NAME] · Members: [MEMBERS] · Contact: [EMAIL]

---

## Project name

Crosswise

## Track

A1 · Applied AI for Consumers

## Short description

Crosswise is a talking mobile web app for blind, low-vision, wheelchair and limited-mobility pedestrians in Vienna.
It picks the walking route with the safest road crossings (traffic lights with acoustic signals instead of unmarked
crossings), announces every crossing before you reach it, and uses the phone camera to find your bus, check the
crossing light and read signs.

## Long description

**PROBLEM**

Map apps give you the fastest route. For a blind pedestrian the risky part of a walk is not the distance, it is the
road crossings: an unmarked crossing without lights is far more dangerous than a traffic light with an acoustic
signal. For a wheelchair user, one raised kerb can block a whole route. None of this shows up in "fastest route".
At the stop the next problem starts: which bus is this one, and is it going the right way?

**APPROACH**

- **Routes:** OpenRouteService gives up to 3 walking (or wheelchair) alternatives. We match every route against a
  preprocessed snapshot of all 21,169 crossing and traffic-signal nodes in Vienna from OpenStreetMap, clustered
  into 8,987 crossings. Each crossing is scored (lights + acoustic signal > lights > zebra > unmarked/unknown; kerbs
  count in wheelchair mode). The recommended route is the one whose *worst* crossing is safest, then the one with
  the fewest unmarked crossings. The app says why in one sentence, e.g. "The recommended route is 1 minute longer
  and avoids the unmarked crossing on the shortest route."
- **Public transport:** every search also asks Transitous (open timetable data, no Google) for bus, tram and U-Bahn
  trips. Only the rides come from the timetable. Every walking leg inside a trip is routed again and scored with
  our crossing data, and it ends at the platform for that line and direction, so on the correct side of the street.
  If walking takes more than 20 minutes, public transport is listed first and the app says so.
- **Guidance:** spoken turn-by-turn directions. Each crossing is announced about 40 m and again 10 m before you
  reach it, with its type, acoustic signal and kerb ("Press the button under the box"). On a ride, the app says the
  departure and counts the stops ("Your stop is next", "Get off now").
- **Camera assistant (Claude Haiku 4.5 vision):** *Find my bus* scans about one photo every 1.2 s and speaks a line
  only when 2 photos in a row agree. On a trip it also checks the direction ("This is 69A towards Simmering, your
  bus" / "69A, but the wrong direction"). *Check light* reports what it sees and never says "safe to cross".
  *Read text* and *Describe surroundings* round it out. The model must answer in a fixed JSON schema, and the app
  builds every spoken sentence from fixed phrases.
- **Accessible by design:** everything is spoken and shown as large high-contrast text. Buttons are at least 64 px,
  and the app uses real buttons with labels for screen readers. It has tap-to-talk voice commands, an English voice
  whatever the phone language is, and three modes: Blind/low vision, Wheelchair and Limited mobility.

**Crosswise assists a white cane or a guide dog. It never replaces them, or the user's own judgement.**

**WHAT WORKS** (tested; numbers measured on Sun 27 Sep between 00:45 and 01:00 against the production URL)

- **Safer routes vs the shortest route (the baseline).** On 30 random real walking trips around HOIV,
  unmarked/unknown crossings drop from **43 to 21 (−51%)**. When the route changes, it costs a median of
  **+1.4 min** (max +6.5 min). The worst crossing was never worse than on the shortest route.
- **5 named Vienna walks:**

  | Trip | Shortest route | Crosswise |
  |---|---|---|
  | HOIV → Hauptbahnhof | 25.7 min, 7 crossings, **2 unmarked/unknown**, 4 with acoustic signal | 26.7 min, 9 crossings, **0 unmarked/unknown**, 5 with acoustic signal |
  | HOIV → Wien Mitte | 48.1 min, 23 crossings, **8 unmarked/unknown**, 9 with acoustic signal | 50.8 min, 20 crossings, **2 unmarked/unknown**, 14 with acoustic signal |
  | HOIV → Oberes Belvedere | 27.9 min, 5 crossings, all with lights + sound | same route (already the safest) |
  | HOIV → Schwarzenbergplatz | 39.0 min, 5 crossings, all with lights + sound | same route |
  | Hauptbahnhof → Karlsplatz | 29.9 min, 13 crossings, 0 unmarked/unknown | same route |

- **Public transport** (Transitous timetable, Sunday 10:00). HOIV → Stephansplatz: bus 69A + U1, 25 min door to
  door, **0 unmarked/unknown crossings on foot**. Walking all the way would take 58 min with 3 unmarked/unknown
  crossings. HOIV → Schönbrunn: tram D + U4, 51 min, 0 unmarked/unknown on foot. Walking would take 85 min with
  5 unmarked/unknown crossings.
- **Vision on real photos from Vienna:**
  - Crossing light: **10/12 correct, 0 dangerous errors** (the misses say "I can't see a pedestrian light").
  - Read text: 3/3. Describe surroundings: 10/11.
  - Bus number: **12/15** real images of a 69A in each of 3 runs. It reads the number from about 30 m and closer.
- **Tests:** 386 unit tests and 58 browser tests pass. The browser tests use a fake camera (including a real clip of
  a 69A arriving), fake GPS and fake speech. They also check that every error is spoken: camera or location denied,
  no network, server trouble. An automated accessibility audit (axe, WCAG 2.1 AA) finds 0 violations on all the screens it checks (start,
  main, route cards, walking, camera, search, settings, public transport).
- **Other features that work:** "Where am I?" (street, nearest stops, nearest crossing), quick destinations, and
  `?demo=1`, which walks the route for you so everything can be shown indoors.
- **Voice commands:** find my bus 69A, take me to / I want to go to …, check the light, read this, describe, where
  am I, by bus / on foot, wheelchair / blind / limited mode, stop, repeat, help.

**KNOWN LIMITS** (honest)

- **Not yet tested by a blind, low-vision or wheelchair user,** and not with real VoiceOver or TalkBack. The
  screen-reader support is checked by automated tests only.
- **No complete outdoor walk with live GPS yet.** Guidance was tested on real routes with simulated walking and
  mocked GPS. City GPS is often 10–30 m off, so real alerts may come early or late.
- **Bus reading from far away:** at 50–60 m the model sometimes misreads a single photo as another line (0, 2 and 1
  such photos in the 3 runs). The app only speaks a line after 2 photos in a row agree. On the real video's frames,
  the lone "68A" was followed by three "69A" readings, so only 69A would have been announced. No wrong line was
  announced in any test, but two misreads of the same wrong line in a row are still possible. All bus images are
  of one line (69A) at dusk.
- **OpenStreetMap gaps:** 28% of Vienna's traffic lights have no acoustic-signal information, and 71% of crossings
  have no kerb information. We say "unknown", we never guess.
- **Crossing detection is geometric** (the route passes within 3 m of a crossing node). Where pavements are not
  mapped, a route along a street can "touch" crossings it doesn't use.
- **Public transport uses the timetable only,** with no live Wiener Linien delays. Without GPS (underground), stops
  are counted by the timetable and the app says the count is approximate.
- Voice commands are English only. Speech recognition does not work in Firefox. Crossing data covers Vienna and
  Budapest; elsewhere the app falls back to a live OpenStreetMap query.

**NEXT STEPS**

1. Test sessions with blind, low-vision and wheelchair users and an orientation-and-mobility trainer, with real
   VoiceOver and TalkBack.
2. Outdoor walks to tune alert distances against real GPS error.
3. More bus footage (other lines, daylight, night, trams) and a stricter check on far-away readings.
4. Live departures from Wiener Linien. German voice commands.
5. Give missing OSM tags (acoustic signals, kerbs) back to OpenStreetMap, for example by letting users confirm
   them on the spot.

## Live demo URL

https://crosswise-woad.vercel.app

(Public, no login. Add `?demo=1` to simulate walking: https://crosswise-woad.vercel.app/?demo=1)

## How to run

- **Stack:** plain HTML, CSS and JavaScript modules (no framework, no build step) in `public/`. Pure logic in
  `public/lib/` is shared with the tests. Vercel serverless functions (Node) in `api/` hold the API keys. Leaflet
  draws the map. Tests use Vitest and Playwright.
- **Services:** OpenRouteService (routes, place search), OpenStreetMap via Overpass (crossings, preprocessed once
  into `public/data/`), Transitous (public transport, no key), Anthropic Claude Haiku 4.5 (vision), and the
  browser's speech synthesis and speech recognition.
- **Environment variables (names only):** `ORS_API_KEY`, `ANTHROPIC_API_KEY`. Put them in `.env.local` for local
  runs, or set them as Vercel environment variables.
- **Commands:**
  ```bash
  npm install
  npx playwright install chromium   # once, for the browser tests
  npm test                          # unit tests (no keys, no network)
  npm run e2e                       # browser tests with fake camera/GPS/speech (no keys)
  npm run dev                       # local server on http://localhost:3000
  vercel deploy                     # deploy (keys set in Vercel)
  npm run eval:vision -- --url <deployment>   # vision accuracy on the photos in test/vision/
  node scripts/eval-routes.js       # 30-trip baseline comparison (from saved answers)
  node scripts/eval-trips.js        # 5 named walks + 2 transit trips (from saved answers)
  ```
- **Demo mode:** open `/?demo=1`, tap **Start**, pick a quick destination (e.g. Wien Hauptbahnhof) and tap **Start**
  on a route. The phone "walks" the route at 1.3 m/s and speaks every turn and crossing. `&speed=4` walks faster.
  `&at=1450` starts 1,450 m into the route. `&video=/demo/bus-69a.mp4` makes **Find bus** use a real clip of a
  69A instead of the camera.

## What was built during the hackathon

All of the code was written during the build window (Sat 13:00 → Sun) with Claude Code. The first commit is at
13:50 on Saturday, and the git history shows every step. Before the event we only prepared a plan, the tool-setup
instructions (`CLAUDE.md`, `SETUP.md`, `PROMPTS.md`) and explored OpenStreetMap crossing data around the venue.
During the event we built the app, the API functions, the crossing snapshot pipeline, the tests, and the evaluation
scripts and numbers.

## Anything else — how to try it on a phone

1. Open **https://crosswise-woad.vercel.app** on a phone (iPhone Safari or Android Chrome) and turn the volume up.
2. Tap **Start**. This unlocks sound and, later, the camera. If you use VoiceOver or TalkBack, tap
   **App voice: on** first to turn it off, and your screen reader reads everything.
3. Pick a mode (Blind / Wheelchair / Limited mobility) and tap a quick destination such as **Wien Hauptbahnhof**.
   You hear why the recommended route is safer than the shortest one, plus public transport options.
4. Not in Vienna? Open **https://crosswise-woad.vercel.app/?demo=1**, pick a destination and tap **Start** on a
   route. The phone walks it for you and announces every crossing ahead.
5. Try the camera: **Check light** at a pedestrian light, **Read** on a sign, **Describe**, or **Find bus** at a
   stop (type or say the line, e.g. "find my bus 69A").
6. Tap **Speak** and say "I want to go to Stephansplatz", "where am I" or "help".

Crosswise assists a white cane or guide dog. It never replaces them.
