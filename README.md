# Untitled Driving Game

Open-world arcade driving for the browser (CrazyGames). Steal any car, outrun the cops, wreck everything. Brief: `docs/BRIEF.md`. Standing rules: `CLAUDE.md`. Current state: `docs/PROGRESS.md`.

M3 put life in the city: traffic, pedestrians, damage and wrecks, car-swap,
takedowns and fifty smashable billboards. M4 (next) is the police and the run:
`docs/M4_PLAN.md`, designed in `docs/DESIGN.md`. Acceptance reports:
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
| `/?ad=error&adError=adblock` | force an ad error code in `LocalPlatform` (`?ad=off`, `?adblock=1` also work) |

Controls: `W A S D` / arrows drive, `Space` handbrake (drift), `Shift` boost, `E` swap into the car beside you, `R` reset (or respawn when wrecked), `C` camera, `P` pause, `M` mute, `` ` `` tuning panel. Any key skips the takedown slow motion.

## Verify

```bash
npm run verify       # typecheck, lint, sim tests, build, smoke, budget
npm run perf         # bot 60 s under 4x CPU throttle -> perf/latest.json
npm run perf:headed  # same, visible browser (real-device numbers)
npm run screens      # HUD/pause screenshots at every required size -> screens/
npm run city         # M2 startup, whole-road-graph scene budgets, controls and quality
npm run life         # M3: a bot run with traffic and pedestrians on, events flowing, budgets held
```

The whole-map check is accelerated fixed-step driving with sampled rendering; it
checks streaming, collisions and scene budgets. `npm run perf` measures real-time
frame pacing separately. `?manual=1` exposes deterministic `advanceTime(ms)` for
browser QA; `render_game_to_text()` reports the map, car, district, residency,
damage, traffic counts, pedestrians, billboards and the recent events.
