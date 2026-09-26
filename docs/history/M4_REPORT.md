# M4 gate report: Heat

Date: 2026-09-23. Contract: `docs/history/M4_PLAN.md` (slices 0–8, §7 gate
criteria). Session logs: `docs/history/PROGRESS_M4.md`.

## What was built

The run loop the brief's heat system hangs on, from the cold open to level 5.

- **The run** (slice 3a): crimes fill a bag that is at risk; three garages
  (the hideout, the scrapyard, the hotel) bank it on a 3 s door race with
  control kept, times the multiplier of the highest level the police had
  the player at (×1 to ×3); busted (two units, under 5 km/h, 3 s bar)
  banks half with no multiplier. The wall of totals and the busted card are
  game-made breaks; heat resets with the run.
- **The police brain** (slice 3c, from Marcin's playtest): a slow player is
  boxed into four slots and busted in about 11 s at heat 2; a lost player is
  searched for at the last fix; from heat 2 every second saloon cuts ahead;
  hitting an idle unit costs heat. Traffic takes dents instead of wrecking
  on a nudge; police are armoured.
- **Coins and the spill** (3b): 3,000 coins on the lanes and through the
  billboards, the player's for good; a wreck spills 30 % of the bag as
  twelve coins on the lane ahead for ten seconds.
- **The cold open** (4): a stage-2 van at heat 1 on the Crown diagonal, a
  muscle car held alongside for the swap, a 1.3 km coin line round the
  hideout's block through a billboard gate and a delivery marker, captions
  for seven verbs (skip on N), once per tab. The jobs skeleton M5 extends.
- **Identity** (5): the police look for a car, not a driver. A swap nobody
  sees ends the chase at once and the units box the empty car; a police car
  is a disguise (BORROW, a lit bar) until a crime is seen from it or the
  dispatcher notices 30 s after the theft. Novice and skilled bot policies.
- **Level 3** (6): roadblocks ahead and out of view with a sawhorse weak
  point, a braced car half the heavy can breach, spike strips (grip and a
  pull until a swap or the door); four parked patrols near the player; ten
  speed cameras with the flash; twenty stunt ramps with the slow motion.
- **Levels 4 and 5** (7): heavy vans shoving the car across the road, the
  Chief and its leading PIT; the siren bed.
- **Ad points and the gate** (8): midgame ads at the door (never the
  session's first) and the busted card through the adapter, input blocked
  and the break held, mute on `adStarted`; the wanted poster on the wall.

## Verify and perf

| Check | Result |
|---|---|
| `npm run verify` | green: typecheck, sim typecheck, lint, 230 tests, build, smoke, budget |
| `npm run verify:gate` | green: 239 tests (the long pins included) |
| `npm run heat` | 10 / 10: the door flow, the cold open's caption and flag, heat 1 / 3 / 5 for 120 s each, the five ad paths |
| `npm run city` | 4 / 4 (the streaming tour keeps the heat at 0: speed cameras line its route) |
| `npm run life` | 4 / 4 |
| `npm run screens` | 31 / 31: HUD, pause and the life frame, the busted bar, the card and the wall, the cold open's first caption, at the ten sizes; BORROW at 1280×720; inspected |

Budgets (BRIEF §6, M4_PLAN §6.5):

| Budget | Limit | M4 |
|---|---|---|
| Bytes before gameplay-start | 8 MB target, 12 fail | 3.59 MB |
| Build | 40 MB / 200 files | 3.59 MB / 5 files |
| Time to control, 20 Mbit + 4× CPU | 6 s | 3.47 s (M3: 3.05 s; the cold open's world is built at its spawn) |
| Draws / tris, low | 150 / 250k | whole-map tour 70 / 176k |
| Draws / tris, high | 300 / 600k | whole-map tour 96 / 250k |
| JS heap | 250 MB | 51–58 MB |

Perf, MX330, 4× CPU, 60 s bot, auto quality (M4_PLAN §6.4; all runs on the
final code, quoted in order):

| Run | fps mean | frame p95 | step p95 | draws max | tris max | frame max |
|---|---|---|---|---|---|---|
| M3 gate 1 / 2 (bases) | 57.4 / 52.5 | 16.8 / 33.3 | 7.1 / 11.3 | 95 / 76 | 177k / 167k | 100 / 183 ms |
| M4 heat 0, runs 1 / 2 | 54.7 / 55.4 | 16.8 / 16.8 | 7.6 / 7.0 | 100 / 95 | 231k / 227k | 917 / 517 ms |
| M4 heat 5 | 52.7 | 16.8 | 7.5 | 96 | 184k | 1,250 ms |
| M4 heat 0, ads off | 57.7 | 16.8 | 6.7 | 100 | 231k | 83 ms |
| M4 heat 0, runs 3 / 4 (probe skips ad frames) | 56.2 / 51.5 | 16.8 / 33.3 | 7.0 / 9.8 | 98 / 96 | 229k / 220k | 1,067 / 1,117 ms |
| M4 heat 5 (probe skips ad frames) | 52.5 | 33.3 | 7.6 | 96 | 184k | 1,150 ms |

The mean fps and p95 sit inside the M3 bases' spread (the MX330 varies by
±3 fps on identical code). The single long frames are the open issue below.

## How to run

- `npm start`, then `http://localhost:4173/`: the production build. A plain
  `/` plays the cold open once per tab. (`npm run dev` on 5173 is the source
  with live reload; the parameters below work on both.)
- URL parameters: `?coldopen=1` (force it), `?heat=1..5`, `?spawn=crown`
  (or `marina`, `highway`, …), `?bot=door` (the road bot parks in the
  hideout), `?bot=novice|skilled` (the policies), `?ad=off`,
  `?ad=error&adError=adCooldown`, `?adDuration=1`, `?quality=low|high`,
  `?dev=1` or the backtick key for the tuning panel.
- `npm run verify` (quick), `npm run verify:gate` (with the long pins),
  `npm run heat`, `npm run screens`, `npm run perf` (`PERF_HEAT=5`,
  `PERF_PARAMS=&ad=off`).

## Five-minute playtest script

1. `/` with nothing: the cold open. Is the swap offered inside ten seconds;
   did every caption land on its verb; did the door's totals make sense; is
   the wanted poster readable.
2. `?spawn=crown`: two takedowns, the stars, the patrols from behind; lose
   them in the grid and count the seconds; watch the bag and COPS LOST YOU.
3. Swap out of sight and watch the units box the old car and pull away;
   swap into a parked cruiser (BORROW) and drive past the next patrol;
   smash a billboard in front of it and watch COVER BLOWN.
4. Push to heat 3 on the highway: the roadblock's light bars from afar;
   take the sawhorse once and the spike once; feel the spiked car; swap to
   heal. Cross a speed camera flat out.
5. Dive into the hideout with the pursuit on: sit out the 3 s race once and
   bank; once with two units on your bumper, reverse out before the bar
   fills. Read the wall (and the ad after your second door), drive out.
6. Get busted on purpose at heat 2: the bar, the last moment, the card,
   the fine; drive on.
7. Wreck with a full bag and scramble for the spill: was ten seconds a
   chance.
8. Take a ramp on the park strip outside the highway at 90 km/h: the slow
   motion, STUNT!, the landing.
9. `?heat=5`: the heavies' shoves and the Chief; does the cooldown alone
   feel like an escape.
10. Report what felt wrong before what worked: the bar's timing, the
    multiplier's pull, the spill's read, the disguise's 30 s, the
    roadblock's warning distance, the siren's volume.

## Tuning knobs and where they live

All live-editable in the dev panel (backtick).

- `src/sim/balance.ts` (`BALANCE`): heat per crime, bag per event, the
  multiplier table, the fine, the door (`closeSeconds`, `enterSpeed`),
  coins and the spill, jumps, jobs, the cold open's numbers.
- `src/sim/police/tuning.ts` (`POLICE`): rosters and interceptors per level,
  sight, spawn, chase and ram speeds, `busted`, `arrest`, `search`,
  `cutoff`, `box`, `disguise`, `roadblock`, `spike`, `parked`, `cameras`,
  `heavy`, `chief`.
- `src/sim/traffic/tuning.ts` (`TRAFFIC`): the pool (48 records, 16
  bodies), damage and armour, the settle rule, the police body share.
- `src/sim/economy.ts` (`DAMAGE`, `SWAP`, `ECONOMY`): the player's damage
  stages, the swap window, the slow motion.

## Known issues

- **Single long frames at 4× CPU**: 0.5–1.25 s in five of seven runs,
  while M3's maximum was 100–183 ms. Not the ad (a heat-0 run with no ad and
  no chase had a 412 ms frame with a 344 ms sim step at 11.5 s), not the
  budgets (p95 unchanged); suspected GC or a chunk's colliders. It joins the
  M2 frame-pacing item in BACKLOG and needs a trace on Marcin's machine.
- The novice bot stops in front of a roadblock's cars and is boxed; the
  level-3 busted rate counts it (level 3 novice 1 / 5 / 16 in five minutes).
  The skilled bot resets 1–3 times in five minutes at level 3.
- At level 5 the pursuit holds up to 14 of the 48 traffic records; at worst
  30 civilians drive (the plan's 7.5 assumed 36 before parked patrols and
  roadblocks existed). The pool stays at 48 for the traffic step's cost.
- Abandoned player cars are never towed and traffic queues behind them.
- The cold open's takedown beat is rarely cued: the pair lost the bot on
  the diagonal at 110 km/h. Marcin's first minute decides whether the
  patrols need a head start.
- For the first 12 s after boot the key-hint strip overlaps the top of the
  wall and card panels at 800×450 (it fades at 12 s).
- The quick `npm run verify` tests take 50–60 s of wall time, at the
  CLAUDE.md limit; the next bot-driven pin goes into a long file.
- Deviations from the plan, each with its reason in PROGRESS and in the
  plan's "as built" notes: the cold open's route (the gate is by the
  hideout, the hideout 700 m past the marker), three avenue cameras instead
  of four, ramps on the park strip instead of lots and piers, the braced
  car half (×3.5), the box clock and the disguise timer, the heavy's corner
  aim, the Chief's reserved place.

## Proposed next scope

M5, the launch minimum, as `docs/history/M5_PLAN.md` has it: the cold open on the
save's seen flag, the save through the platform, the garage with the
catalogue and paint, three jobs on the skeleton (getaway delivery,
steal-to-order, pursuit escape) with the arrow, the daily police seed and
the dailies with the streak, the balance script over the bot policies. The
M4 numbers it needs are in `BALANCE.measured`'s comment in the plan. Two
things to decide on the way in: whether the novice policy learns the
sawhorse (it moves the level-3 busted rate the balance script reads), and
the long-frame trace before M6's mobile tier.
