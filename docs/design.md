# Design rules

The rules the code follows, collected in one place. Constants live in `public/lib/*.js`; the tests in
`test/unit/` check each rule.

## Crossing data

- **Source:** a preprocessed city snapshot (`public/data/crossings-vienna.json`, `crossings-budapest.json`),
  built once from Overpass by `scripts/fetch-crossings.js` + `scripts/build-crossings.js`. The live Overpass
  query (`node["highway"="crossing"]` + `node["highway"="traffic_signals"]`, route bbox + 50 m) is only a
  fallback outside those two cities, so a demo never depends on the shared public Overpass server.
- **Signalled** = `crossing=traffic_signals` or `crossing:signals=yes`. **Unsignalled** = `uncontrolled`,
  `marked`, `zebra`, `unmarked` or `crossing:signals=no`.
- `traffic_signals:sound` and `traffic_signals:vibration` are used. `button_operated` is ignored (mapped
  inconsistently in Vienna).
- **Kerb:** `lowered`/`flush` is good, `raised` is bad, missing is **unknown**. The app says "unknown" and never guesses.
- Nodes with a `level` other than 0 (underground passages) and `access=private` are skipped.
- **Clustering:** crossing nodes within 20 m (`CLUSTER_RADIUS_M`) form one crossing group, because one
  intersection can have up to 15 nodes. A group keeps the best-known value per attribute, except kerbs,
  where "raised" wins (a wheelchair user must be warned).
- A group is **on the route** when the route passes within 3 m (`ON_ROUTE_NODE_M`) of one of its nodes.

## Scoring (`public/lib/scoring.js`)

| Crossing | Blind / low vision | Wheelchair adjustment |
|---|---|---|
| Traffic light + acoustic signal | 3 | raised kerb −2 |
| Traffic light, no/unknown sound | 2 | unknown kerb −0.5 |
| Zebra | 1 | lowered kerb +0.5 |
| Unmarked | 0 | |

A route is ranked by its **worst** crossing first, then the number of risky crossings, then (blind mode)
crossings without an acoustic signal, then the number of crossings, then duration. Limited-mobility mode
ranks by the fewest risky crossings and never recommends an unmarked one; acoustic signals give no bonus
there because the user can see the light.

## Camera (`api/look.js`, `api/prompts.js`, `public/lib/look.js`, `public/lib/scan.js`)

- One endpoint, `POST /api/look` with `{ mode, image, context }`. Modes: `bus`, `light`, `read`, `describe`,
  each with its own system prompt.
- The model must answer with JSON only, e.g. bus:
  `{"status":"found|not_visible|unreadable","line":"13A","destination":"...","confidence":0-1}`.
  Code fences are stripped before parsing; a parse failure counts as `unreadable`.
- The phone downscales frames to 768 px wide, JPEG quality ~0.7.
- **Live bus scan:** one request in flight at a time, ~1 frame every 1.2 s, "still looking" every ~10 s,
  and a line is announced only when **2 consecutive frames agree**. Gives up after 60 s.
- **Light mode never says "safe to cross".** It says what it sees and always adds "listen for traffic
  before crossing". The sentence is built from fixed phrases in `public/lib/look.js`, so the model's text
  can't change the wording.

## Accessibility

- Buttons at least 64 px tall, high contrast, real `<button>`s with labels for VoiceOver/TalkBack.
- Every result is spoken **and** shown as large text.
- A "Start" button unlocks audio and camera (iOS needs a user tap first).
- Speech priority: danger > crossing alert > navigation > info (`public/lib/speech-queue.js`). A less
  important message never talks over a more important one.
- `?demo=1` simulates walking the chosen route at 1.3 m/s so everything can be shown indoors.
