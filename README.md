# Untitled Driving Game

Open-world arcade driving for the browser (CrazyGames). You are the getaway driver who never keeps a car: steal, wreck, swap, escape, bank. Brief: `docs/BRIEF.md`. Standing rules: `CLAUDE.md`. Current state: `docs/PROGRESS.md`.

M3 put life in the city: traffic, pedestrians, damage and wrecks, car-swap,
takedowns and fifty smashable billboards. M4 (in progress) is the police and
the run: `docs/M4_PLAN.md`; M5 the launch minimum: `docs/M5_PLAN.md`; M6 the
platform and the submission: `docs/M6_PLAN.md`; all designed in
`docs/DESIGN.md`. Acceptance reports:
`docs/M2_REPORT.md`, `docs/M3_REPORT.md`; older ones in `docs/history/`.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Useful URLs:

| URL | What |
|---|---|
| `/` | seeded 1.575 km square city; automatic rendering quality |
| `/?spawn=crown` | city districts: `crown`, `foundry`, `gardens`, `marina`; perimeter road: `highway` |
| `/?spawn=loop` | start of the authored loop: Crown diagonals, north highway, Works chicane, Quay sweep, Garden parkway |
| `/?quality=low` | lock `low` or `high` for reproducible visual/performance comparisons |
| `/?seed=123` | regenerate building lots from a seed (road topology stays fixed) |
| `/?map=playground` | original M1 playground and handling instruments |
| `/?dev=1` | debug HUD + live tuning panel (also the backtick key); the panel's Life section holds the traffic, pedestrian, economy, damage and swap numbers |
| `/?traffic=0.5&peds=2` | traffic and pedestrian density scales (default 1; `0` removes them) |
| `/?life=0` | no traffic, no pedestrians: the M2 sandbox |
| `/?manual=1` | deterministic stepping for browser QA: `window.advanceTime(ms)` |
| `/?spawn=ramps` | start at a named spawn: `lot`, `straight`, `straight-far`, `kerbs`, `slalom`, `skidpad`, `ramps`, `bigjump`, `walls`, `track` |
| `/?spawn=track&dev=1` | the test track: lap timer, best-lap ghost, telemetry graph, save recording / load ghost in the panel |
| `/?car=compact` | vehicle class: `muscle` (default), `compact`, `heavy` (also buttons in the panel) |
| `/?bot=track&spawn=track` | the track autopilot (its lap time is the tuning benchmark) |
| `/?bot=1&seed=42&duration=60` | autopilot with the perf probe (`window.__perf`) |
| `/?heat=3` | start the run at heat level 1-5 (the police answer at that level once they see you) |
| `/?bot=door&spawn=crown` | the road bot drives to the hideout and parks; the door shuts behind it |
| `/?coldopen=1` | force the cold open (a plain `/` plays it once per browser tab); `?coldopen=0` skips it |
| `/?ad=error&adError=adblock` | force an ad error code in `LocalPlatform` (`?ad=off`, `?adblock=1` also work) |

Controls: `W A S D` / arrows drive, `Space` handbrake (drift), `Shift` boost, `E` swap into the car beside you, `R` reset (or respawn when wrecked), `C` camera, `P` pause, `M` mute, `` ` `` tuning panel. Any key skips the takedown slow motion, opens the garage door after the totals and closes the busted card.

The first load of a tab is the cold open: a beat-up van at heat 1, a muscle car to swap into, a coin line round the hideout's block through a billboard, a delivery marker and the hideout door; captions teach each verb, `N` skips. Test parameters (`bot`, `spawn`, `heat`, `car`, `map`, `manual`) turn it off.

The run: crimes fill the bag (yellow, top right, with the multiplier the police have seen you at). Pull into one of the three garages (orange on the radar) and stop: the door takes 3 s to shut and banks the bag times the multiplier; back out to cancel. Two police cars boxing you in while you are wanted fill the BUSTED bar: half the bag is kept, no multiplier.

## Verify

```bash
npm run verify       # typecheck, lint, the quick sim tests, build, smoke, budget
npm run verify:gate  # the same with the long bot-driven pins (tests/**/*.long.test.ts): gates and slice commits
npm run test:long    # only the tests stage, long pins included
npm run perf         # bot 60 s under 4x CPU throttle -> perf/latest.json
npm run perf:headed  # same, visible browser (real-device numbers)
npm run screens      # HUD/pause screenshots at every required size -> screens/
npm run city         # M2 startup, whole-road-graph scene budgets, controls and quality
npm run life         # M3: a bot run with traffic and pedestrians on, events flowing, budgets held
npm run heat         # M4: the bot into the hideout, the door as a game-made break
```

The whole-map check is accelerated fixed-step driving with sampled rendering; it
checks streaming, collisions and scene budgets. `npm run perf` measures real-time
frame pacing separately. `?manual=1` exposes deterministic `advanceTime(ms)` for
browser QA; `render_game_to_text()` reports the map, car, district, residency,
damage, traffic counts, pedestrians, billboards and the recent events.
