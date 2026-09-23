# Developer guide

How to run the game in its test configurations, what the QA hooks expose and
where the scratch output goes. The one way to *play* the game is `npm start`
(`README.md`); everything here is for development and measurement.

## Servers and ports

| Command | Port | What |
|---|---|---|
| `npm start` | 4173 | `vite build` then `vite preview`: the production bundle from `dist/`, the game as shipped. The e2e suites run against this. |
| `npm run dev` | 5173 | Vite dev server from source with live reload; unminified. For editing. |
| `npm run preview` | 4173 | Serve the last `dist/` without rebuilding. |

Both ports are `strictPort`: a second server on the same port fails instead of
picking another, so there is never more than one of each. Other agents or
Marcin may have one running in this folder; never kill a process you did not
start.

## Build stamp

`__APP_VERSION__` is injected by `vite.config.ts` as
`<package.json version>+<short commit>`, with `-dirty` when the working tree
had uncommitted changes at build time. It is shown on the pause screen (`P`)
and read from `window.__game.version`. The package version is the milestone
(`0.4.x` = M4, `0.5.x` = M5, …); bump the minor at each gate, the patch for a
fix Marcin asks for after a gate. Dev-server builds carry the same stamp.

## Test URLs

All parameters work on both ports. Test parameters (`bot`, `spawn`, `heat`,
`car`, `map`, `manual`, `job`, `board`) turn the cold open off and, without `date`,
the dailies and the day's police layout (every site manned), so the suites
do not change with the calendar.

| URL | What |
|---|---|
| `/` | seeded 1.575 km square city; automatic rendering quality; the cold open once per profile (the save's `seen`) |
| `/?fresh=1` | a new profile: the save's key is cleared before boot (the cold open follows) |
| `/?coldopen=1` | force the cold open; `?coldopen=0` skips it |
| `/?date=2026-09-23` | the local date the dailies, the streak, the day's police and the thirty caches are drawn for |
| `/?job=delivery` | start in that job's ring: a def id or the first of a kind (`delivery`, `order`, `escape`) |
| `/?job=order&bot=job` | the road bot on the job: into a delivery's drop-off, after an order's wanted car (the swap is yours) |
| `/?spawn=crown` | city districts: `crown`, `foundry`, `gardens`, `marina`; perimeter road: `highway` |
| `/?spawn=loop` | start of the authored loop: Crown diagonals, north highway, Works chicane, Quay sweep, Garden parkway |
| `/?heat=3` | start the run at heat level 1-5 (the police answer at that level once they see you) |
| `/?police=off` | the dispatcher sends no unit, the beat included: a job's flow measured clean (the order e2e) |
| `/?board=8` | the wanted board (M6) as if every rival under #8 was beaten (their cars owned) and #8's requirements met, the chain done; `board=0` puts the Chief next; turns the cold open off |
| `/?board=10&job=duel` | pulled up at the next rival's bay: their duel starts at boot |
| `/?kit=all` | every item of the driver's and the car's kit had, to try them on the STYLE page |
| `/?quality=low` | lock `low` or `high` for reproducible visual/performance comparisons |
| `/?seed=123` | regenerate building lots from a seed (road topology stays fixed) |
| `/?dev=1` | debug HUD + live tuning panel (also the backtick key); the panel's Life section holds the traffic, pedestrian, economy, damage and swap numbers |
| `/?traffic=0.5&peds=2` | traffic and pedestrian density scales (default 1; `0` removes them) |
| `/?life=0` | no traffic, no pedestrians: the M2 sandbox |
| `/?car=compact` | vehicle class: `muscle` (default), `compact`, `heavy` (also buttons in the panel) |
| `/?map=playground` | the M1 playground and handling instruments |
| `/?spawn=ramps` | playground spawns: `lot`, `straight`, `straight-far`, `kerbs`, `slalom`, `skidpad`, `ramps`, `bigjump`, `walls`, `track` |
| `/?spawn=track&dev=1` | the test track: lap timer, best-lap ghost, telemetry graph, save recording / load ghost in the panel |
| `/?bot=track&spawn=track` | the track autopilot (its lap time is the tuning benchmark) |
| `/?bot=1&seed=42&duration=60` | autopilot with the perf probe (`window.__perf`) |
| `/?bot=door&spawn=crown` | the road bot drives to the hideout and parks; the door shuts behind it |
| `/?bot=skilled&heat=2` | the road bot as a skilled player: swaps out of sight, turns away while searched, boosts (`bot=novice`: the plain road bot) |
| `/?manual=1` | deterministic stepping for browser QA: `window.advanceTime(ms)` |
| `/?ad=error&adError=adblock` | force an ad error code in `LocalPlatform` (`?ad=off`, `?adblock=1`, `?adDuration=1` also work) |

## QA hooks

- `window.__game`: the `GameHandle` (`started`, `paused`, `sim`, `platformCalls`, `errors`, `version`, `renderer`, `roadBot`, `audio`, `adShowing`, `save`).
- `window.render_game_to_text()`: JSON with the map, car, district, residency, damage, heat, pursuit, run, cold open, job, traffic counts, pedestrians, billboards and the recent events.
- `window.advanceTime(ms)` with `?manual=1`; `window.__perf` / `window.__perfDone` with `bot` + `duration`.

## Suites beyond `verify`

```bash
npm run test:long    # only the tests stage, long pins included (tests/**/*.long.test.ts, LONG=1)
npm run perf         # bot 60 s under 4x CPU throttle -> perf/latest.json (PERF_HEAT=5, PERF_PARAMS=&ad=off)
npm run perf:headed  # same, visible browser (real-device numbers)
npm run screens      # HUD/pause screenshots at every required size -> screens/
npm run city         # M2 startup, whole-road-graph scene budgets, controls and quality
npm run life         # M3: a bot run with traffic and pedestrians on, events flowing, budgets held
npm run heat         # M4: the bot into the hideout, the door as a game-made break, heat 1/3/5
npm run game         # M5: the garage by keys, the offers on every ad path, the cold open once, the save, a delivery and an order by the bot
npm run balance      # M5: the busted rates by the bot policies (seeds 42 / 7 / 123), the EV table, the first hour, three assertions (~160 s, Node)
```

The whole-map check is accelerated fixed-step driving with sampled rendering;
it checks streaming, collisions and scene budgets. `npm run perf` measures
real-time frame pacing separately.

## Scratch folders (git-ignored)

| Folder | What |
|---|---|
| `dist/` | the last production build |
| `perf/` | `latest.json` / `previous.json` / `startup.json` from the suites, plus named runs kept for the gate reports (`m4-gate-1.json`, …) |
| `screens/` | the screenshot suite's output |
| `output/` | scratch probes, design-review captures, anything a session makes on the side; never committed |
| `test-results/` | Playwright's traces on failure |
