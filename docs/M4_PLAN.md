# M4 "Heat" — milestone contract

For the agent who builds M4 in a fresh session. Design and reasons:
`docs/DESIGN.md` (read §2, §5, §6, §9–11 before slice 0). Standing rules:
`CLAUDE.md`. The brief's M4 line: police AI, five heat levels, escape and
respray, busted and wrecked flows, ad-break points wired through the adapter.
DESIGN.md adds the run: heat as a ratchet, pursuit as a state, bag and bank,
the hideout door, the identity rule, cover. Work the slices in order; each
ends in a commit with verify green, a pin or an e2e check, and one behaviour
measurement written into `docs/PROGRESS.md`. Marcin plays every slice by
hand; his feel notes outrank any number here.

## 0. Ground rules that bite in this milestone

- Sim stays headless: heat, pursuit, police steering, the run state machine
  and the bag all live in `src/sim/` with no Three.js or DOM. Render, UI and
  audio read state and poll the event ring (`sim/events.ts`).
- No per-step allocations in the police loop: the units are pool slots like
  traffic agents; rays reuse one `RAPIER.Ray`.
- Every number lives in one of two files: `src/sim/balance.ts` (bag values,
  multipliers, the fine, prices later) and `src/sim/police/tuning.ts` (unit
  budgets, speeds, ram forces, detection ranges, cooldowns). Both live in the
  dev panel like `VehicleTuning`.
- Police bodies come from the traffic body pool (16). The unit budget per
  level and pool priority are part of slice 2, not an afterthought.
- Perf A/B: MX330 throttled runs vary ±3 fps on identical code; alternate
  old and new builds before calling a regression (`docs/PROGRESS.md`,
  memory). Smoke baseline at the M3 gate: 60.0 fps, p95 16.7 ms, 97 draws,
  197k tris, 3.49 MB.
- Stop only at the gate, before destructive operations, or to change a brief
  fixed decision. Otherwise decide, note it in PROGRESS, keep going.

## 1. Layout to add

```
src/sim/balance.ts            bag values, multipliers, fine, (M5: prices)
src/sim/police/tuning.ts      PoliceTuning: budgets per level, speeds, ranges, cooldowns
src/sim/police/Police.ts      units as traffic-class agents with a pursuit planner
src/sim/police/Pursuit.ts     detection, descriptor, line of sight, state machine
src/sim/heat/Heat.ts          the ratchet: points, thresholds, sources from events
src/sim/run/Run.ts            run state machine: start → running → banked | busted → start
src/sim/city/cover.ts         covered streets, chokepoints, drop-offs exported by the generator
src/render/PoliceView.ts      unit meshes, light bars, the helicopter and spotlight
src/render/HideoutView.ts     the door, the wall totals camera cut
src/ui/heat.ts                five stars, pursuit pulse; ui/run.ts the bag counter and the door screen
src/platform/Platform.ts      requestAd(kind, callbacks) added; LocalPlatform stubs it
tests/sim/heat.test.ts, pursuit.test.ts, run.test.ts, police.test.ts
e2e/heat.spec.ts              the bot under police: escape and busted rates, perf under 4×
```

## 2. Slices

### Slice 0 — housekeeping (prerequisites the run design turned into blockers)

- `npm run screens` at all ten sizes completed and the images inspected;
  findings fixed or listed. Never done since M3 (`docs/M3_REPORT.md`).
- Wreck tow-away: a wreck out of view for 60 s frees its body slot; the pool
  never fills with wrecks (`docs/BACKLOG.md` Life).
- `Traffic.step` profiled in the browser under 4× throttle; the number goes
  into PROGRESS as the baseline the police slices are measured against.
- Presets: `sports` and `police` in `CAR_PRESETS`, profiles in
  `render/carProfiles.ts`, traffic meshes; the police car tuned for ramming
  (mass, bumper, a stiffer front). `docs/STYLE.md` gets the police livery
  (palette colours only), the light bar and the hideout interior.
- Real highway lanes: two graph lanes per direction at 4 and 12 m (decision
  14 revisited; roadblocks and interceptors need them); the Euler tour,
  markings, minimap and the three pins re-pinned with the reasons written.
- Done: verify green, screens noted, baseline numbers in PROGRESS.

### Slice 1 — heat and pursuit as two systems, level-1 patrols

- `Heat`: 0–100 points, thresholds at 20/40/60/80/100 (placeholders), fed by
  events (traffic takedown +4, police takedown +10, billboard +2, camera +5,
  later jobs). Never decreases inside a run.
- `Pursuit` state machine: `idle → detected → active → lost(cooldown) → idle`.
  Detection: a unit within range with line of sight (one ray against statics
  per unit every 6 steps, staggered). Cooldown per level from
  `PoliceTuning.escapeSeconds` (6/8/10/12/15 s placeholders).
- `Police`: units are traffic agents of class `police` with a pursuit planner
  instead of the lane planner: follow the road graph toward the player's
  projected position, ram when adjacent (a velocity push through the existing
  shove physics), fall back to lane driving when `lost`. Level 1: two patrols
  spawned on lanes behind the player, out of view.
- HUD: five stars, filled by heat, pulsing while `active`. No text.
- Pins: heat is monotonic within a run; a pursuit ends after exactly the
  cooldown without line of sight; a unit spawns within 3 s of detection; a
  unit never spawns in the player's view cone.
- Measurement: the bot at heat 1 for 120 s headless: time in pursuit, escapes
  per minute, rams received. Written to PROGRESS.

### Slice 2 — units per level, interceptors, the pool budget

- `PoliceTuning.budget[level]`: units at once (2/4/5/6/8 placeholders), pool
  priority so police get bodies before traffic and traffic goes kinematic
  sooner; the player's nearby traffic never drops below a floor.
- Interceptors (sports preset, police livery) from level 2: faster, a PIT
  manoeuvre (a lateral push at the rear quarter) instead of a plain ram.
- Ramming feel: the player is shoved, never stopped dead; a ram is a wall-hit
  shaped impulse (decision 11 spirit).
- Pins: the body pool never starves; unit counts per level.
- Measurement: browser step p95 at level 2 with 4 units against the slice 0
  baseline; smoke fps A/B.

### Slice 3 — busted, the run, bag and bank, the hideout door

- `Run`: starts at the hideout, `bag` accumulates from events through
  `balance.ts`, ends at a drop-off without an active pursuit (bank += bag ×
  multiplier[maxHeat]) or on busted (bank += bag × 0.5, no multiplier).
  Coins are M5; the bag alone fills from chaos in M4.
- Busted: boxed by ≥ 2 units within 6 m and speed < 5 km/h for 3 s; a bar
  fills; any movement above 5 km/h drains it. `R` under pursuit teleports
  within line of sight.
- The hideout: a one-room drive-in box under the Crown Tower block (generator
  exports its footprint and door pose in `cover.ts`); two drop-offs (the
  Sunset Works scrapyard, the Coral Hotel garage). The door closes, a cut
  camera, totals on the wall (bag, multiplier, banked, best run), any key
  opens the door, heat 0. `gameplayStop()` at the closed door,
  `gameplayStart()` when it opens; the same around the busted card.
- Pins: bag arithmetic and the fine; the multiplier uses the highest heat
  reached, not the current; a drop-off refuses entry during `active`; busted
  timing; reset keeps the pursuit.
- Measurement: the bot from heat 0 to a drop-off: run length, bag, banked.
  This is the first number the balance script (M5) will consume.

### Slice 4 — identity

- `Pursuit` holds a descriptor (class + paint) and the last known position.
  A `swap` event with no unit in line of sight clears the descriptor: state
  `lost` at once with cooldown 0; the units drive to the last known position
  (the abandoned car) and box it for 5 s. A swap in view does nothing.
- Pins: both cases, and that units converge on the old car.
- Measurement: escapes by swap versus by cooldown in a bot run with a swap
  policy.

### Slice 5 — level 3: roadblocks, spike strips, parked patrols, speed cameras

- Roadblock placer: the billboard placer's clear-footprint query on the lanes
  150–300 m ahead of the player's heading at the chokepoints `cover.ts`
  exports (the four on-ramps, the tower junction); two cars and a sawhorse,
  the sawhorse the weak point; visible from 150 m (light bars).
- Spike strip: a `spiked` tuning state (grip × 0.6, a lateral pull), healed
  by a swap or at the hideout.
- Parked patrols at junctions from level 3 as stopped agents with lights;
  they join the pursuit on detection.
- Speed cameras on the highway straights and the avenue (backlog slice 9):
  a flash, `camera` event, heat +5, bag bonus, a FLASHED popup.
- Pins: a roadblock never spawns in view or within 100 m; the weak point is
  passable at 60 km/h without a wreck; spiked handling numbers.
- Measurement: bot busted rate per level 1–3 over 5 minutes each.

### Slice 6 — covered streets and the camera occlusion rule

- One covered street per district from `cover.ts`: roof and side walls with
  portal openings, static boxes, no road-graph change.
- Line of sight against statics blocks inside cover (the pursuit's ray).
- `ChaseCamera`: when a static lies between the camera and the car, the
  distance shortens along the boom; recovers at `heightRateGround` pace.
- Pins: LOS blocked inside cover; the camera check in e2e (no static between
  camera and car for a drive through each cover).

### Slice 7 — overpasses

- Height in the road graph: `RoadPoint.y` optional, lanes carry height,
  kinematic traffic at height, the bot route, road meshes, markings, the
  minimap; the highway rises over the four avenue crossings with ramps
  inside the vehicle's landing rules (decision 10).
- Re-pin the city tour and bot laps with the reasons written. This slice
  reopens M2 by design (DESIGN.md §5); Marcin decided it.
- Measurement: smoke fps and draws before/after; the bot's whole-map tour.

### Slice 8 — levels 4 and 5: heavy units, the helicopter, the Chief

- Heavy SUVs (heavy preset, police livery), a ram that moves the player's
  car in earnest. The helicopter: a kinematic unit above the road graph, a
  spotlight cone as line of sight; cover breaks it; escape needs cover first,
  then the cooldown. Level 5 adds the Chief: one boss car with the top speed
  and a PIT that always lands.
- Pins: the helicopter loses the player only under cover; unit budgets.
- Measurement: browser step p95 and fps at level 5 on the low tier against
  the baseline; the bot's busted rate at 4 and 5.

### Slice 9 — ad points, polish, gate

- `Platform.requestAd('midgame' | 'rewarded', callbacks)`; `LocalPlatform`
  logs and calls `adFinished` after a delay (a `?ads=fail` query makes it
  error). The door: at most one request, the midgame kind; the busted card:
  midgame. Mute on `adStarted`, unmute on finish or error, never a reward on
  error. `docs/CRAZYGAMES.md` rows A1, A3, A4, A7 move to `done` for the
  adapter side; T15 notes the calls.
- Polish from DESIGN.md §8 if the budget allows: the officer's ticket book
  as the busted bar, the donut-shop withdrawal, the wanted poster.
- Gate: `e2e/heat.spec.ts` (the bot at a set heat: escapes, busted, perf
  under 4×), `npm run screens` with the heat HUD, the door and the busted
  card at 1280×720 and the ten sizes, perf A/B against the M3 gate,
  `docs/M4_REPORT.md` per `CLAUDE.md`, decision records in ARCHITECTURE,
  BACKLOG and CRAZYGAMES updated, PROGRESS entry.

## 3. Numbers to start from

All placeholders; DESIGN.md §2.6–2.7 explains the intended shape.

| Knob | Start | File |
|---|---|---|
| heat thresholds | 20 / 40 / 60 / 80 / 100 | balance.ts |
| heat per event | traffic takedown 4, police takedown 10, billboard 2, camera 5, roadblock breach 6 | balance.ts |
| bag per event | billboard 500, camera 300 + 20/km/h over, traffic takedown 800, police takedown 1500, roadblock 1000, escape 500 × level | balance.ts |
| multiplier by max heat | 1 / 1.25 / 1.6 / 2.2 / 3 | balance.ts |
| fine | bag × 0.5, no multiplier | balance.ts |
| escape cooldown | 6 / 8 / 10 / 12 / 15 s | police/tuning.ts |
| units at once | 2 / 4 / 5 / 6 / 8 | police/tuning.ts |
| detection range | 90 m, line of sight, ray every 6 steps per unit | police/tuning.ts |
| busted | 2 units within 6 m, < 5 km/h, 3 s | police/tuning.ts |
| roadblock distance | 150–300 m ahead, never in view | police/tuning.ts |

## 4. Five-minute playtest per slice

Drive from the Crown spawn, earn heat 1 with two takedowns, watch the stars
and the patrols arrive from behind. Break line of sight in the grid and count
the seconds. Swap out of view and watch the units go for the old car. Push to
heat 3, meet a roadblock, take the sawhorse. Drive to the hideout with an
active pursuit (refused), lose them, bank, read the wall. Get busted on
purpose at heat 2 and watch the bar. Report what felt wrong before what
worked.
