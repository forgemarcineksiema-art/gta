# Untitled Driving Game

Open-world arcade driving for the browser (CrazyGames). Steal any car, outrun the cops, wreck everything. Brief: `docs/BRIEF.md`. Standing rules: `CLAUDE.md`. Current state: `docs/PROGRESS.md`.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Useful URLs:

| URL | What |
|---|---|
| `/?dev=1` | debug HUD + live tuning panel (also the backtick key) |
| `/?spawn=ramps` | start at a named spawn: `lot`, `straight`, `straight-far`, `kerbs`, `slalom`, `skidpad`, `ramps`, `bigjump`, `track` |
| `/?spawn=track&dev=1` | the test track: lap timer, best-lap ghost, telemetry graph, save recording / load ghost in the panel |
| `/?car=compact` | vehicle class: `muscle` (default), `compact`, `heavy` (also buttons in the panel) |
| `/?bot=track&spawn=track` | the track autopilot (its lap time is the tuning benchmark) |
| `/?bot=1&seed=42&duration=60` | autopilot with the perf probe (`window.__perf`) |
| `/?ad=error&adError=adblock` | force an ad error code in `LocalPlatform` (`?ad=off`, `?adblock=1` also work) |

Controls: `W A S D` / arrows drive, `Space` handbrake (drift), `Shift` boost, `R` reset, `C` camera, `P` pause, `M` mute, `` ` `` tuning panel.

## Verify

```bash
npm run verify       # typecheck, lint, sim tests, build, smoke, budget
npm run perf         # bot 60 s under 4x CPU throttle -> perf/latest.json
npm run perf:headed  # same, visible browser (real-device numbers)
npm run screens      # HUD/pause screenshots at every required size -> screens/
```
