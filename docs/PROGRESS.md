# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-22 — Design talk, part 2: the swap as the job, the spill, the disguise

Marcin: "the idea is good, could it be better?" Three additions and one
reorder, all on systems that exist; he said to write them in. Docs only.

### Decided (Marcin, on my proposal)

- **Steal-to-order** is a launch job and replaces the time trial in the M5
  minimum: the marker is a car descriptor ("a cyan compact, no scratches,
  four minutes"), the player hunts one in traffic, swaps, delivers; payout
  minus 10 % per damage stage. Cheapest job of all and the only one in which
  the swap is the goal. The time trial moves to update 2 with the races
  (`docs/DESIGN.md` §4, §11).
- **The bag spills on a wreck** (Sonic's rings): 30 % of the bag as twelve
  coins along the lane ahead, ten seconds to scramble them back, what is
  picked returns to the bag. The risk that does not depend on the police, so
  heat 1–2 has a cost a novice reads. M4 slice 3 with the coins (§2.2).
- **The disguise**: a police car is swappable like any car; in it the
  patrols do not detect the player until a crime is seen from it, then the
  descriptor is the police car and the pursuit runs. One condition in
  detection. M4 slice 5 (§2.5), with a watch item and a fallback (a
  dispatcher timer) if it makes level 2 trivial.
- **Cars as tools**: the heavy breaches the car half of a roadblock at
  80 km/h, everyone takes the sawhorse at 60; the sports car outruns; the
  police car disguises. M4 slices 5–6 (§8).
- **Swap is the second verb of the cold open**: start in a beat-up van, a
  muscle car alongside inside ten seconds, `E`, the whip. The game shows the
  one thing nobody else has before the first corner (§6.6, M4 slice 4).
- Rejected on the way: heat per car (removes the run's escalation), a forced
  pursuit on the last 500 m (reads as cheating), the contract wall at the
  door (good, update 2).

### Done

- `docs/DESIGN.md`: §2.2 the spill, §2.4 note, §2.5 the disguise, §3.3 two
  rows, §4 steal-to-order as item 0 and the launch line, §6.6 rewritten,
  §8 five rows, §11 the job list, §12 two watch items, references.
- `docs/M4_PLAN.md`: slice 3 spill rule and pins, slice 4 order and pins,
  slice 5 disguise and breach with pins and measurement, slice 6 breach pin,
  three number rows, playtest additions. `docs/BACKLOG.md` launch line.

### Next

- Unchanged: slice 3 of `docs/M4_PLAN.md`.

## 2026-09-22 — Design talk: the pitch, the launch scope, the cold open moved up

Marcin asked for a read of the whole documentation and a talk about the idea
itself, then said to write the conclusions in. Docs only, no code. Verify
green at the start: 189 tests, smoke 60.0 fps / p95 16.7 ms / 97 draws /
194k tris, gameplay-start 1.46 s, 3.51 MB.

### Decided (Marcin, on my assessment)

- **The pitch in one line**: you are the getaway driver who never keeps a
  car. Steal, wreck, swap, escape, bank. The brief's four references describe
  the feel; this is the identity for the cover, the description and the first
  20 seconds. The swap leads, because no other city driving game on the
  platform has it (`docs/DESIGN.md` §1, README).
- **The cold open is prototyped in M4 right after slice 3**, not in M5.
  Conversion is decided in the first 20 s; after slice 3 everything the first
  version needs exists (a patrol behind, the bag, the door) and only the
  delivery marker, the route and the captions are missing. M4 slice 4, played
  by hand every session from then on.
- **Coins move from M5 into M4 slice 3.** The twelve-year-old's reward layer
  was thin: boost is a means, the bag is a number. Coins are cheap,
  instanced, and they are what shows every 20–30 s.
- **Launch scope.** Basic Launch after M4 plus a minimum M5: the cold open
  finished, save, the garage with the catalogue, three jobs (getaway
  delivery, time trial on a coin line, pursuit escape), dailies and the
  streak if they fit. Covered streets, overpasses and the helicopter are
  update 1 (heat 4–5 ship on the ground: heavies and the Chief); races with
  rivals, fares, takedown rage, mayhem, the hunts, the skill chain and the
  full map are update 2. The three KPIs are measured live from Basic Launch
  and updates get re-featured; no design table replaces that. This deviates
  from the brief's v1 list for the helicopter and the activity count; Marcin
  decided it.
- **The bag's risk at heat 1–3 is unproven and gets measured before
  `balance.ts` is tuned.** Rams shove and never stop, busted needs two units
  and 3 s under 5 km/h, a swap out of sight ends the pursuit at once: below
  the roadblocks a novice may be uncatchable, which makes ×1.25 and ×1.6
  free money and DESIGN §2.7 fiction. Decision rule in M4 slice 6: if the
  bot's busted rate at level 3 is below the §2.7 novice assumption (about one
  in five minutes), the ratchet gets a cost that is not the police (cameras
  and parked patrols from level 2) and the level 1–2 multipliers come down.

### Done

- `docs/DESIGN.md`: §1 the pitch, §2.6 and §2.8 notes, §3.2 coins in M4,
  §4 three jobs at launch, §5 rewritten, §11 rewritten with the launch scope
  and the two updates, §12 the busted-rate watch item with its rule.
- `docs/M4_PLAN.md`: coins in slice 3 (placement, pickup, pins, the
  coins-per-minute measurement), the cold open prototype as slice 4 (script,
  captions, pins, measurement), slices 5–8 renumbered, levels 4–5 on the
  ground, the slice 6 decision rule, the coin row in the numbers table, the
  playtest additions, §5 holding the cover, overpass and helicopter contracts
  for update 1.
- `docs/BACKLOG.md`: the update 1 and update 2 lines; the overpass entry
  re-pointed. README tagline.

### Next

- Slice 3 of `docs/M4_PLAN.md`, now with the coins, then slice 4.

### Open problems

- The re-take of the throttled perf A/B (heat 0 vs 2) on an idle machine and
  Marcin's `npm run perf:headed` are still owed from slice 2.

## 2026-09-22 — M4 slice 2: units per level, interceptors, the body pool

Verify green before and after (189 tests).

### Done

- **The roster is the heat level.** `POLICE.budget` 2/4/5/6/8 units by level and
  `POLICE.interceptors` 0/1/2/2/3 of them as interceptors (the `sports` preset
  in police livery, faster and with a PIT instead of a shove). `Police.budget`
  is on the debug handle. Measured with the bot: level 1 → 2 units, level 2 → 4
  with 1 interceptor, level 5 → 8 with 3, every level holding its roster.
- **Police borrow the body pool, they never own it** (decision 28). A unit is
  served first (`policeBodyReach` 25 m: it counts as 25 m nearer than it is, and
  keeps its body 25 m further out), takes a body from the *traffic* when the pool
  is full, never from another unit, and never past `policeBodies` (10 of 16).
  A civilian never evicts a unit. Measured over 90 s: peak police bodies 2 at
  level 1, 3 at level 2, 6 at level 5, with 41–44 cars still alive on the street.
- **Ramming.** A saloon aims where the player will be in 0.15 s and accelerates
  its own body at 14 m/s²; an interceptor aims at the rear quarter
  (`pitSideOffset` 1.1 m inboard of the flank, 0.9 × half-length back) at
  22 m/s². Rapier's contact does the rest. Measured, player at 70 km/h under
  full throttle, unit closing from 25 m behind: the shove costs no speed at all
  (the player is still accelerating through it) and pushes 0.7 m across the
  lane; the PIT lands twice, pushes 5.8 m across and swings the car at
  0.48 rad/s, and neither wrecks the player. That is the slice's rule: shoved,
  never stopped.
- **A patrol must be able to arrive.** Units run at `catchUpSpeed` 48 m/s while
  more than 55 m back, then drop to their class speed (30 saloon, 38
  interceptor); junction turns still take `speedJunction`. Without it the units
  spawned behind a 170 km/h car and never saw it again.
- **Presence instead of a conveyor belt.** While nobody is being chased, a unit
  more than `patrolRecycle` (260 m) away and out of view goes off duty and the
  next one comes on duty near the player, out of the view cone. Heat therefore
  decides how much police the player *meets*, not only how many chase. With it,
  the bot at 90 s: pursuit 45.8 s at level 1, 47.7 s at level 2 and 66.8 s at
  level 5 (2 / 1 / 0 escapes, 1 / 1 / 3 rams). Without it the same runs sat at
  13–16 s and never re-detected.

### Measured

- **Sim step, Node, 60 s of bot driving, two passes each**: heat 0 mean
  1.53 / 0.91 ms, heat 2 (4 units) 0.83 / 0.78, heat 5 (8 units) 0.68 / 0.64.
  The pursuit is inside the noise. It was not before: the first cut cost
  +0.4–1.3 ms mean because the dispatch scanned all 226 lanes at 10 m samples
  and the route projected the player onto all 226. Both are now bounded by the
  lane midpoint (`spawnMax + length/2`, and 40 m for the route), which is the
  open problem from slice 1 closed.
- **Draw calls and triangles** at level 2 against heat 0, same route: 71 → 79
  max draws (the two livery kits: details, flashing and unlit lenses per class)
  and 135k → 138k triangles. Both far inside 150 / 250k on low.
- **The throttled browser A/B is void this session.** Four alternating 60 s runs
  read 7.2 / 6.6 / 5.6 / 8.0 fps — heat 0 as bad as heat 2, against 57–60 fps
  from the same spec at the M3 gate. Another process on this machine was eating
  the CPU (a browser at 234 s of CPU time that I did not start and must not
  kill). The smoke inside `verify`, taken in a quiet window, was 57.6 fps /
  p95 16.8 ms / 97 draws / 194k tris, matching the baseline. The level-2 step
  p95 against the slice 0 baseline has to be re-taken on an idle machine; the
  Node A/B above is the honest CPU-side answer for now.
- Pins added to `tests/sim/police.test.ts`: the roster and the interceptor count
  per level with the pool share held (levels 2 and 5, 45 s of driving each), and
  the ram pin (contact, speed kept, no wreck).

### Decided

- `PERF_HEAT=<level>` on `npm run perf` drives the same route with a pursuit
  running, so this comparison is repeatable rather than a one-off script.
- The interceptor is the `sports` preset, not a new class: the brief's eight
  vehicles already include it and the pursuit only needs the livery difference.
- Slice 2's "traffic goes kinematic sooner" is implemented as a police-first
  lender with a hard share, not as a lower traffic body count: the street the
  player drives through must not thin out because a chase started.

### Next

- Slice 3: `Run`, the bag and the bank, busted with the bar, the hideout under
  the Crown Tower block with the door, and the drop-offs.
- Re-take the throttled perf A/B (heat 0 vs heat 2) on an idle machine, and
  Marcin's `npm run perf:headed`.

### Open problems

- Units wreck themselves on a parked player fairly often (comic, but it feeds
  the player heat and wrecks). Watch it at level 4–5 when the heavies land.
- The interceptor's rear light bar was checked by geometry, not by eye: lenses
  at y 0.91–0.96 and z −1.75…−1.55 (deck, behind the backlight) against the
  saloon's y 1.52–1.61 at z −0.62…−0.38 (roof, B pillar). The saloon livery was
  inspected in the running game; the interceptor never held still long enough.

## 2026-09-22 — M4 slice 1: heat and pursuit, level-1 patrols

Verify green before the first edit and at the commit.

### Done

- **Heat is a ratchet** (`src/sim/heat/Heat.ts`, numbers in `src/sim/balance.ts`).
  It owns a cursor into the event ring and reads the same log everything else
  polls: traffic takedown +4, police takedown +10, billboard +2, capped at 100,
  thresholds 20/40/60/80/100. It never falls inside a run; only `reset()` (the
  hideout door, slice 3) clears it. A police takedown is told from a civilian
  one by `Traffic.police[agent]`, not by the car class, so a swapped-into patrol
  car does not pay police money.
- **Pursuit is a state** (`src/sim/police/Pursuit.ts`): `idle → detected →
  active → lost → idle`. Line of sight restarts the whole escape window;
  losing it counts the level's cooldown down (6/8/10/12/15 s) and the step it
  reaches zero pushes an `escape` event and returns to `idle`. Heat survives it,
  so the next patrol that sees the player answers at the same level.
- **Patrols are traffic agents** (`src/sim/police/Police.ts`,
  `src/sim/police/tuning.ts`). Level 1 keeps two units alive; they use the same
  pooled records, the same body lender and the same path follower as civilian
  traffic, so a pursuit costs no new Rapier bodies. `Police.preStep` runs before
  `Traffic.step` and writes a bounded plan per unit (`setPolicePlan`: a
  connected exit lane, a speed, optionally a ram point); everything else in the
  planner is the M3 code. A unit with no plan drives its lane like any other car.
- **Routing** is a reverse Dijkstra over the 49 nodes toward the lane the
  player's projected position (1.2 s ahead) sits on, refreshed at 2 Hz; each
  unit then picks the cheapest exit of its own lane. **Ramming** is a lent body
  steered at the player's lead point with its own acceleration cap: Rapier's
  contact does the shoving, nothing teleports or stops the player dead.
- **Detection** is one `castRay` per unit every 6 steps, staggered, against
  fixed colliders only (`ONLY_FIXED`), 90 m, from the unit's roof height to the
  player's body. Traffic never blocks sight; buildings do, which is what slice 6
  builds on.
- **Spawning** never happens in front of the player: the whole car footprint
  must clear a 55° half-cone and 40 m (`Traffic.outOfView`), 45–180 m away,
  scored toward a point 65 m behind the player and against the lane's own
  heading. When the agent pool is full, only an unseen, undisturbed civilian
  gives up its slot. A wrecked patrol is replaced after `reinforceSeconds` (8 s),
  so writing one off buys real time.
- **HUD**: five stars upper right, filled by heat level, the filled ones pulsing
  red only while the pursuit is `active` (`src/ui/heat.ts`). No text; the
  aria-label carries the state. **Livery** (`src/render/PoliceView.ts`): the
  instanced police body goes policeWhite with a policeBlue flank band, ink
  fittings and a roof bar whose two lenses alternate blue/red at 2 Hz by
  rewriting vertex colours. No lights, no textures, no extra shadow pass.
- `?heat=1..5` starts a run at that level for playtesting; the debug line and
  `render_game_to_text()` carry heat, pursuit state, cooldown and unit count.

### Measured

- **Bot at heat 1, 120 s headless** (city, seed 42, traffic on): 27.4 s in
  pursuit (23 % of the run), 12.5 s of cooldown, **2 escapes (1.0/min)**, 1 ram
  landed on the player, first patrol dispatched 0.02 s after the run started,
  never more than 2 units, 0 bot resets, no NaN. Node step mean 0.62 ms with
  police, traffic and peds all running.
- Pins: `tests/sim/heat.test.ts` (each crime counted once, monotonic, capped,
  police worth more), `tests/sim/pursuit.test.ts` (every level escapes on
  exactly its cooldown step and only once; reacquisition restarts the window;
  heat 0 never detects), `tests/sim/police.test.ts` (pair dispatched within 3 s,
  no spawn inside the view cone over a 90 s drive, a wreck replaced after the
  reinforcement delay, the civilian pool stays alive).
- `npm run verify` green: 187 tests in 25 files (was 176/22), both typechecks,
  lint, build, smoke, budget. Startup 3.51 MB (was 3.49; the police view, the
  stars and the pursuit code are ~18 kB of the bundle).
- Smoke, heat 0 so the police loop is idle: 57.6 fps, frame p95 16.8 ms, 97
  draw calls, 194k tris, gameplay-start 2.66 s — the session's pre-slice
  baseline was 56.7 / 16.8 / 97 / 196k / 3.08 s. A first smoke read 54.0 fps
  and p95 33.3 ms with my inspection browser open on the same machine; the
  re-run with it closed matched the baseline. The lesson from session 6 holds:
  nothing else may be rendering during a measured run.

### Decided

- **Police are a planner on top of traffic, not a second traffic system**
  (decision 26). The body pool, the junction reservations and the lane follower
  are the expensive parts and they already exist; a unit is a civilian record
  with a plan and a flag.
- **The roster is maintained, not dispatched once.** An earlier draft sent the
  pair at the first heat rise and never again, which made two takedowns the end
  of the police for the rest of the run.
- **A patrol that loses the player withdraws and then goes back to ordinary
  lane driving.** It only re-detects after it is 120 m away and out of view, so
  an escape is real, but the same car can find the player again later — that is
  the design's "heat stays, the next detection answers at this level".
- Police agents are exempt from the traffic despawn radius; otherwise a unit
  that lost the player would evaporate mid-pursuit.

### Next

- Slice 2: per-level unit budgets, interceptors from level 2, pool priority for
  police bodies with a floor for the player's nearby traffic, and the browser
  step p95 A/B against the slice 0 baseline (traffic 1.55 ms mean / 3.0 p95).
- Marcin: `?heat=1&spawn=crown`, earn a takedown or two, break line of sight in
  the grid and count the seconds to the stars going quiet.

### Open problems

- A patrol that rams a parked player sometimes writes itself off on the
  player's chassis; comic, but it pays the player heat. Watch it at level 2.
- The spawn search scans every lane at 10 m samples on a dispatch tick
  (~4,500 pose evaluations, 4 Hz at most while a unit is missing). Cheap today,
  but it wants a lane index when level 5 dispatches eight units.

## 2026-09-22 — Six speeds on every car (Marcin's request)

Out of the M4 slice order: Marcin asked for five or six gears in every car.
Verify green before and after.

### Done

- **Every class has six ratios, and uses them.** The old sets were nominally
  five (six for sports), but no car ever reached its top gear on throttle
  alone: the last ratio was so long that the upshift speed sat above what the
  car could pull. Measured before, full throttle to plateau: muscle held 4th
  at 170 km/h, compact 4th at 144, heavy 4th at 138, police 4th at 173,
  sports 5th at 198. The top gear only appeared on boost.
- **The new spacing**: first to fifth geometric over the range the class can
  actually reach, so fifth is the top-speed gear, and sixth is an overdrive
  that only pulls on boost. Fifth's limiter is set ~9% above the car's own top
  speed, so the box does not drop into the overdrive at full speed and lose
  ground (the first attempt did exactly that: muscle upshifted at 167 km/h and
  sank to 160 over the next 40 s).
- **Numbers, before → after** (headless, `spawn: 'straight'`):

  | car | 0–100 | top speed (gear) | top on boost (gear) |
  |---|---|---|---|
  | muscle | 6.48 → 6.17 s | 170 (4th) → 172 (5th) | 234 → 233 (6th) |
  | compact | 9.15 → 8.87 s | 144 (4th) → 144 (5th) | 195 → 202 (6th) |
  | heavy | 10.70 → 10.15 s | 138 (4th) → 137 (5th) | 203 → 202 (6th) |
  | sports | 4.62 → 4.30 s | 198 (5th) → 204 (5th) | 286 → 285 (6th) |
  | police | 7.22 → 6.65 s | 173 (4th) → 176 (5th) | 241 → 240 (6th) |

  In the running game (browser, muscle, full throttle at a held speed):
  39 km/h 1st, 63 2nd, 92 3rd, 120 4th, 149 5th, 170 5th — 5100–6600 rpm
  throughout, where the torque curve is.

### Decided and why

- **0–100 got 0.3–0.6 s quicker in every class** and that is the point of the
  extra ratio, not a regression: the engine spends more of the run near peak
  torque. Only the two pins this crossed were moved with it (`cars.test.ts`,
  compact 9 → 8.5 s, heavy 10 → 9.6 s, with the reason in the file). Top
  speeds, braking, drift and lap pins are untouched and still pass.
- **Engine braking is stronger below ~60 km/h**, because first and second are
  now shorter: coasting from 47 km/h for 3 s leaves 29.7 km/h instead of 33.2
  (muscle). Above that nothing moves — from 90 km/h the car is simply a gear
  higher and loses the same. `engineBrakeTorque` was left alone: scaling it
  down would weaken the braking at speeds where the gearing did not change.
- That coast is what broke `takedown.test.ts`'s "into traffic" case: the ram
  arrived 1.2 km/h slower and no longer shoved the compact hard enough into
  the heavy. The case wants a ~44 km/h contact after a 13 m coast, so the
  launch speed went 47 → 49 km/h and the comment now says what the number is
  for. The 14 m/s direct-hit threshold and every assertion stand.

### Next

- Back to `docs/M4_PLAN.md` slice 1 (heat and pursuit as two systems).
- Marcin drives it: the things to feel are the 1–2 shift in town (muscle now
  at ~53 km/h, was 63) and whether the overdrive appearing only on boost reads
  as a top gear or as a missing gear.

## 2026-09-22 — M4 slice 0: housekeeping

Session started on Opus 5, finished on Fable 5.1 (Opus overloaded). Verify was
green at the start and at the end.

### Done

- **Wreck tow-away** (`Traffic.tow`, `wreckTow` 60 s, `wreckTowNear` 40 m,
  `wreckTowConeDeg` 55). A wreck older than the tow time is freed the first
  step the player is not looking at it. Measured, 300 s circling one highway
  junction with two cars written off every 5 s (`tests/sim/traffic.test.ts`):
  before 48/48 agents wrecked and traffic dead; after 118 wrecked, 94 towed,
  peak 26/48, 0 bodies held by wrecks, 24 still driving. The hidden-for-timer
  reading of the plan was tried first and never fired for a circling player
  (decision 23). `towed` in the HUD debug line. Backlog entry closed.
- **Classes `sports` and `police`** in `CAR_PRESETS`, `CAR_PROFILES`, traffic
  kinds, `TRAFFIC.mass`, `PLAYER_PAINT`, the bot table; rows in
  `tests/sim/cars.test.ts`. sports 0–100 4.62 s, top 198 km/h, 100–0 20.5 m,
  bot lap 33.3 s; police 7.22 s, 171 km/h, 31.7 m, 35.1 s; muscle 6.48 s,
  169 km/h, 29.7 m, 34.2 s. The patrol car is barely faster than the muscle
  on purpose (a level-1 patrol has to be losable); its mass, yaw inertia and
  planted rear are the ram. No pin loosened; the sports car's high-speed lock
  came down to 4.2° to pass the 120 km/h composure pin as written. STYLE.md:
  livery, light bar, hideout interior; the meshes for those land with
  PoliceView/HideoutView.
- **Real highway lanes**: two graph lanes per direction at 4 and 12 m
  (`HIGHWAY_LANE_OFFSETS`, `Lane.offset`, `LaneTables.offset`), the offsets
  the paint always had. `highwayKeepLane` 0.85. Lane count 178 → 226; sim
  tour, e2e tour and the markings pin re-pinned with the arithmetic written;
  minimap one segment per edge; the highway spawn on the inner lane. City tour
  226/226 lanes, 0 resets, 2432 s of sim (was ~2000; the 190k-step budget has
  ~45k steps left). Decision 14 revisited in ARCHITECTURE.
- **Step profile by phase** (`SimWorld.mark`, `SimPhase`,
  `src/app/simProfile.ts`, printed by `npm run perf`). Baseline under 4× CPU,
  3608 steps, ms per step: vehicle 0.87 mean / 1.8 p95; **traffic 1.55 mean /
  3.0 p95 / 4.5 p99**; peds 0.16 / 0.4; physics 0.63 / 0.9; post 0.25 / 0.6.
  Whole step p50 3.0, p95 7.1 against the 12 ms budget. Node: traffic 0.318 ms
  with 48 cars. This is the number the police slices measure against.
- **Input**: a key down and up between two frames was never seen
  (`KeyboardDevice.down` is a live set). Found by the screens spec: its second
  P was dropped and every size but one timed out. Taps are latched until read;
  input read while blocked is dropped, not replayed after an ad.
  `tests/input/keyboard.test.ts`.
- **Screens**: the life capture polls instead of set-and-shoot. See the run
  note below.
- Smoke after all of it: 60.0 fps, p95 16.7 ms, 97 draws, 196k tris, 3.49 MB,
  gameplay-start 1.16 s; the M3 gate baseline to the decimal. e2e city: 3.05 s
  to control under 20 Mbit + 4×, low 66 draws / 169k tris, high 93 / 243k.
  A first smoke of the session read 48.7 fps / 10.2 s to control on a cold
  machine; the re-run matched the gate, so noise (memory: ±3 fps is normal,
  this was a cold start).

### Decided

- Tow by age plus an instantaneous sight test, not by hidden-for time
  (decision 23). Reason above.
- Both new classes are in `CAR_IDS` (playable, `?car=sports|police`), so the
  class contract applies to them and Marcin can feel the ram by hand.
- The `pulse120` composure cap stays hardcoded at 20° for every class; the
  sports car was tuned to it rather than the pin widened.
- The phase hook lives in the sim, the clock in the app (decision 24).

### Next

- Slice 1: `balance.ts`, `police/tuning.ts`, `Heat`, `Pursuit`, `Police`
  units as traffic agents of class `police`, five stars in the HUD, the four
  pins, the bot-at-heat-1 measurement. Police livery and light bar with
  `render/PoliceView.ts`.
- Marcin: `?car=police` and `?car=sports` by hand; say whether the saloon
  shoves and the coupe feels like the fastest thing on the road.

### Open problems

- Session note for the next agent: this session read CLAUDE.md, M4_PLAN.md,
  DESIGN.md in full and PROGRESS, STYLE, BACKLOG, ARCHITECTURE in parts;
  BRIEF.md and CRAZYGAMES.md were not re-read. Read them before slice 1.
- The screens run is slow (each size boots the game and waits for the bot);
  ten sizes take about ten minutes when nothing fails. Fine for a gate, not
  for a loop.
- The MX330 frame-pacing hitches from M2 remain uninvestigated; the phase
  profile now exists to look at them with.

## 2026-09-22 — Design session before M4

### Done

- `docs/DESIGN.md`: the design decisions on top of the brief, written down so
  they survive compaction: the run (heat as a ratchet, pursuit as a state,
  bag/bank/reputation, busted, the identity rule on swap, the heat table and
  multipliers, the EV argument), progression (earnings model, the eight-car
  catalogue with reputation gates and target times, upgrades and looks,
  district and job gates, dailies, prep items), the activities (point-to-point
  free-routing races and the recorder ghost first), cover (covered streets and
  overpasses), the city as a level (district roles, reward density, drop-offs,
  chokepoints, the cold-open route), free-roam scoring, ideas from other games
  placed by cost, the CrazyGames KPIs and what serves each, engineering
  constraints, the M4 slice order, the playtest watch list.
- `docs/BACKLOG.md`: three new sections (run structure and heat, activities
  and progression, city v2) with the ideas that are not in a slice.
- `docs/M4_PLAN.md`: the M4 contract for the next agent: layout to add, ten
  slices with done criteria, pins and the behaviour measurement each must
  record, starting numbers, the per-slice playtest. `AGENTS.md`, `README.md`
  and `CLAUDE.md` point at it. `docs/history/` takes the M1 report, the M3
  mid-milestone status and review; the stale root `progress.md` (an M2 scratch
  log) is removed. `docs/M3_REPORT.md` marks its M4 scope as superseded.
- `docs/CRAZYGAMES.md`: A1 and A5 notes carry the planned ad points (the
  hideout door and busted; rewarded offers only in the garage and at the door
  with a cash alternative). `CLAUDE.md`: the DESIGN.md row and session-start
  read.

### Decided

- Marcin (2026-09-22): runs with a ratchet heat and bag/bank, the hideout door
  as the totals moment, covered streets and overpasses in M4. Everything else
  in DESIGN.md is marked "set here": my call, his override.
- M4 starts with a housekeeping slice (slice 0) before any police code: the
  ten-size screens run inspected, the wreck tow-away (body pool), the traffic
  step profiled in the browser, the sports and police presets, real highway
  lanes. These were backlog items that the run design turns into
  prerequisites.
- Car swap and pursuit: the swap is a pure vehicle change today; the identity
  rule is one condition in M4's detection model, not extra work.
- Revised the same day after Marcin's challenge ("are these what players
  want, for whom"): audience written down (§3.1), coins on the road as an
  addition (his idea), reputation dropped (two currencies), busted pays a
  fine of half the bag at ×1 instead of taking everything (a twelve-year-old
  quits on a full loss; the multiplier is the bet), all six brief activity
  types kept plus fares from Crazy Taxi with hot passengers, and more ideas
  of mine in §8 (donut-shop withdrawal, news ticker, wanted poster, daily
  seed). An earlier draft cut the activities to three; reverted, the cut was
  mine and unasked.

### Next

- A new agent in a new session starts M4 at slice 0 of `docs/M4_PLAN.md`, on
  Marcin's signal. Nothing is in progress; this session changed docs only
  and did not run `npm run verify` (two background runs were cut off by
  session restarts); the next session runs it first, as always.
- Marcin: the title (`docs/TITLES.md`, still "Untitled Driving Game") and
  `npm run perf:headed` on the laptop to close the M3 perf numbers.

### Open problems

- `npm run screens` at all ten sizes has never completed and been inspected
  (M3 report known issue); it is slice 0's first item.
- The MX330 frame-pacing hitches from M2 are still uninvestigated; the police
  add bodies and agents, so the traffic step profile in slice 0 doubles as the
  baseline for that.

## 2026-09-22 — M3 session 16: gate

### Done

- `e2e/life.spec.ts` (`npm run life`, 4/4): the bot 60 s with life on inside
  the perf budgets and meeting traffic, the keyboard swap, the slow motion as
  a time scale (21 ticks per wall second), wrecked to respawn. `npm run city`
  5/5 with the new `E`-without-a-candidate check. Screens spec gains the life
  state (popup, damage bar at stage 2, swap prompt, 12/50) and a wrecked
  capture at 1280×720; the full ten-size run stalled in the background and was
  not inspected, the 1280×720 case passes alone. `docs/M3_REPORT.md` with the
  perf protocol (bases 56.1 / 58.5 fps, gate 57.4 / 52.5; step p50 up
  1.4–2.1 ms, the rest within noise), the playtest script and the knobs.
- Marcin closed the gate without the screens inspection; merged to `main`,
  the branch deleted.

### Next

- M4 planning from `docs/BACKLOG.md` Life (M3) and Marcin's playtest notes;
  `npm run screens` inspected before the next release.

## 2026-09-22 — M3 session 16: slice 8, billboards

### Done

- `sim/city/collectibles.ts`: fifty smashable billboards placed as the last
  step of `City.generate` (`CityChunk.billboards`), so the island always has
  exactly fifty and boot generates nothing extra. Perimeter chunks put an
  8 m roadside panel on the highway's outer verge facing the road; interior
  chunks put a 5 m **gate** across a footway, 93 m from the junction, driven
  through along the street; the centre chunk gets two. A slot is taken when
  the panel's footprint (plus 1 m along its normal, 0.3 m past its ends) is
  clear of statics up to the panel's top and ten metres of run-out either
  side are clear up to car height; `placeBillboards` walks a short list of
  candidates and the unit test names the chunk if none passes. Stable ids
  (chunk index × 4 + slot), paint from the car palette plus chalk.
- `Collectibles.step`: five points along the panel against the chassis
  footprint (+0.3 m), only above `billboardMinSpeed` 5.5 m/s, over the
  resident chunks; once per id. `Life.billboards`: boost 0.25, speed × 0.95
  through `setVelocity`, one `billboard` event at panel height.
- Render: `Billboards` instanced mesh (both panel faces in the instance
  colour, the edges and posts fixed; width by instance scale), registered
  from `CityView.onChunk` as tiles are claimed, smashed ids zero-scaled.
  Planks in the panel's paint plus a few steel bits on the event, and a
  camera `kick`. HUD "BILLBOARDS n/50" under the damage bar and a
  "BILLBOARD!" popup; a splinter and a two-note chime;
  `render_game_to_text.billboards`.
- Two design turns during the slice, both checked in the browser:
  1. The first placement (a roadside panel on the footway's back edge) put
     every panel 3 m in front of a frontage: every smash ended in a wall hit
     with damage. Hence the run-out rule and, since the frontage row leaves
     no run-out behind a roadside panel, the footway gate for the interior.
  2. A 6 m gate did not fit the 5.8 m between kerb and frontage in the
     densest blocks; 5 m does, with posts 0.6 m off the kerb and on the
     footway's back edge. Lamps at 36/80 m and trees at 57/106 m leave
     81–105 m as the one stretch with a clear run-out.
- Fixed while checking it: the panel geometry's faces wound clockwise, so
  the painted face was culled and the panel showed its dark inside.

### Verification

- verify green, 148 tests. Smoke 60.0 fps / p95 16.7 ms / 97 draws /
  197k tris (the billboard mesh and its shadow are the two new draws),
  build 3.49 MB.
- Pins (`tests/sim/collectibles.test.ts`): exactly fifty, unique and
  identical on regeneration for seeds 42, 7 and 123; every panel clear of
  statics per the rule above, 6.5 m off any authored road's edge, off the
  grid carriageways, within 25 m of a lane. A pass at 60 km/h smashes the
  first centre-chunk gate inside 2 s, pays 0.25 in that step, costs 3–8 %
  of speed, pushes one event; a second pass smashes nothing; 10 km/h
  smashes nothing.
- Browser (manual-step mode on the preview build): the gate is visible
  across the footway, the smash throws chalk planks, the popup and the
  counter show 1/50, the car runs out along the footway with no damage.

### Decided

- Billboards are pass-through triggers, not colliders: the panel vanishes
  and the car keeps 95 % of its speed. Posts are visual too.
- Widths differ by kind (8 m roadside, 5 m gate) through `BillboardDesc.width`
  and an instance scale, one geometry.

### Next

- Polish pass: ARCHITECTURE decisions, STYLE, README, BACKLOG, CRAZYGAMES
  note, dev panel Life section, N4; then the gate (e2e `life`, screens,
  perf A/B, `docs/M3_REPORT.md`).

## 2026-09-21 — M3 session 16: slice 7, takedowns

### Done

- `Life.takedowns`: a car the player touched inside `takedownWindow` (2.5 s)
  that then takes a wall impulse of `takedownDeltaV` (7 m/s) or more, the
  same from another car, flips, or took the player's own hit at a closing
  speed of `takedownClosingSpeed` (14 m/s) with that Δv: it wrecks at once
  (`Traffic.wreck`), pays `takedownBoost` 0.5 (`takedownTrafficBoost` 0.6
  into traffic), pushes `takedown` / `takedownTraffic` and starts the slow
  motion: `state.slowMo` 1.2 s, `slowMoTarget` the agent. One per agent.
  `Traffic.senseImpact` now splits the impulse sums by source (`playerDv`,
  `wallDv`, `trafficDv`) and keeps `prevSpeed`; the closing speed uses the
  velocities before the step's physics (after the hit both cars already
  share a velocity, and the check under-read by half).
- `App`: `timeScale = slowMo > 0 ? slowMoScale : 1` on `loop.advance`;
  `Life` counts `slowMo` down by `dt / slowMoScale` before the step's
  takedowns, so 1.2 s of slow motion is 1.2 s of wall time and a fresh
  takedown shows its full duration. Any pressed action skips it
  (`skipSlowMo`), the bot never does.
- Camera: `ChaseCamera.focus` on the takedown target while the slow motion
  runs, `release` after; a debris burst and smoke on the wreck. HUD:
  "TAKEDOWN!" (big, yellow) and the "INTO TRAFFIC!" second line; a big
  crunch and a boom.
- Two real bugs found while pinning it, both in traffic physics:
  1. Every lent body weighed its class mass **plus** a compact: the body
     desc carried `setAdditionalMass(mass.compact)` on top of the collider's
     mass properties. A compact was 2100 kg, a heavy 3450 kg; `senseImpact`
     divided by the tuned mass, so every Δv threshold read 1.4–2× too high,
     and a shoved car barely moved. Removed. Bodies now weigh 1050 / 1300 /
     2400 (checked with `body.mass()`).
  2. Traffic colliders combined friction with `Max` against the ground's
     1.0: a shoved car skidded at 1 g like a crate and stopped inside 2 m.
     Now `Min` with `friction` 0.4 and `linearDamping` 0.3: a 7 m/s shove
     slides about 6 m. Wrecks still stop.
- Two latent traffic bugs the changed collision chain exposed:
  3. Junction curves folded. The bezier handles were a fixed 24 m; on a
     right-angle corner whose endpoints are 25 m apart the control polygon
     crosses and the curve cusps (58° per sample at offset 0, a 151° loop
     at offset 6). 875 of the 3420 (lane, next, offset) curves folded. The
     handles now scale with the endpoint gap (`HANDLE_RATIO` 0.42, cap
     24): zero folds, worst turn per sample 9°.
  4. A body returned to kinematic inside a junction box snapped back to the
     stop line 18 m behind it: a lent body braking for the line creeps a
     little past it, `entering` went false, its `wait` never reset, and
     `moveKinematic` treated the returned car as still holding. `entering`
     now tolerates `STOP_TOLERANCE` 1.5 m past the line, `wait` resets past
     it, and only a car still on the approach holds.

### Verification

- verify green, 145 tests. Smoke 60.0 fps / p95 16.7 ms / 95 draws /
  193k tris, build 3.48 MB.
- Pins (`tests/sim/takedown.test.ts`, the east boundary wall at x = 786.5):
  a parked compact 1.6 m from the wall rammed at 47 km/h (under the
  direct-hit closing speed) wrecks on the wall slam within 2.5 s, the
  takedown step pays 0.5 boost, `slowMo` peaks at 1.2 and is 0 by the end,
  one event. A compact parked 1.5 m behind a heavy, rammed at 47 km/h,
  gives `takedownTraffic` and 0.6. A parked compact across the road hit at
  100 km/h is a direct takedown. The open-road rear-end from the traffic
  tests is no takedown; a wreck rammed at 90 km/h stays one takedown.
- Traffic pins after the four fixes (same seed, same bot): min same-lane
  gap 4.5+ m, lane changes > 0, max yaw rate < 2 rad/s, nose-to-carrot
  under 60°, no unexplained stall over 3 s, flow ratio and stop share
  inside their bands.

### Decided

- Junction curve handles are proportional (0.42 of the endpoint gap, capped
  at 24 m). `roads.lanePath` (the bot's route, M2) still uses fixed 24 m
  handles and folds on the same corners; the bot's lookahead smooths it, so
  it is left for a re-pin of the bot laps (BACKLOG).
- Traffic friction rule `Min` 0.4: the chassis now slides along a traffic
  car at its own wall friction 0.15 rather than 0.6. Marcin judges the
  side-swipe feel; the knob is `TRAFFIC.friction`.

### Next

- Slice 8: billboards.

## 2026-09-21 — M3 session 16: slice 6, car-swap

### Done

- `Life.findSwapCandidate`: the nearest traffic car within 6 m along and
  4 m across in the player's frame, relative speed under 20 m/s, player on
  at least two wheels (`SWAP` in `sim/economy.ts`); shown on the HUD as the
  swap keycap. `Life.swap` on the `E` edge: `Traffic.takeOver` hands over
  the car's pose, velocity and class and turns the agent's record into the
  player's old car standing where the player was (abandoned, or a wreck if
  the player's car was one), the player's `Vehicle` is retuned in place
  (`tuning` replaced by the class preset, `applyTuning`), teleported onto
  the car with its velocity, healed, boost kept; a pedestrian spawns 2.2 m
  to the driver's side in the `Fist` pose facing the player; `swap` event.
  `SimWorld.carId` is mutable now.
- `Traffic.spawnAtPoint` (a stopped wreck or abandoned car off the graph, for
  tests and swaps), `kindOf`, `PLAYER_PAINT` (the class colours from STYLE).
- Renderer: three resident car meshes (one per class, built from the
  presets), the visible one follows `sim.carId`; `ChaseCamera.whip` swings
  the heading at up to 720°/s with a doubled follow rate and a 10° FOV punch
  for 0.35 s, no cut; `focus`/`release` for the takedown camera (slice 7).
  HUD swap prompt and the FRESH WHEELS popup; a whoosh.

### Verification

- verify green, 141 tests. Smoke 60.0 fps / p95 16.8 ms / 95 draws /
  193k tris (the two hidden car meshes cost no draws), build 3.46 MB.
- Pins (`tests/sim/swap.test.ts`): a compact alongside at 40 km/h: after
  `E` the class is compact, the position within 1.5 m of the car's, speed
  within 10 %, damage 0, mass 1050; the old pose holds an Abandoned muscle
  within 1 m, a Fist pedestrian within 4 m, one `swap` event; two seconds
  later it is still there. No candidate 12 m ahead and no swap in the air
  (one step after a teleport so the telemetry sees the wheels up). Out of a
  wreck at the boundary wall into a parked van: class heavy, engine on,
  damage 0, the old car stays a wreck. After a swap into a parked compact
  on the highway, 0–100 km/h lands in the compact band of `cars.test.ts`.
- Camera pins (`tests/render/camera.test.ts`): a whip puts the view behind
  a car heading 90° away within 0.5 s, never further than 25 m, and the
  same turn without a whip does not; a focus looks within 20° of a moving
  target in 0.3 s and is back within 5° of the nose 0.6 s after release.
- Test setups now settle the car on its wheels before pushing it: forcing
  the velocity with `vy = 0` right after a teleport to y = 1 held the car
  in the air (no wheels down, no swap candidate).

### Next

- Slice 7: takedowns, slow motion on the loop, the focus camera.

## 2026-09-21 — M3 session 16: slice 5, damage, wrecked, respawn

### Done

- `Life`: damage from the step's strongest contact, `max(0, impact − 8) ×
  0.04`, walls at full weight, traffic at 0.7, props and terrain never
  (`DAMAGE` in `sim/economy.ts`, calibrated in the plan's table). Stages
  at 0.3 / 0.6 / 0.85 / 1.0 push a `damage` event; stage 4 wrecks: engine
  cut, `wrecked` event, a 3 s timer; `R` or the timer respawns a clean car
  of the same class rolling at 8 m/s on the nearest road with the boost
  kept and traffic cleared within 15 m (`respawn` event, camera snap). Any
  reset heals. Damage is on in the city and off on the playground unless
  `SimWorldOptions.damage` says otherwise: the playground is the handling
  lab and the M1 wall pins drive into walls at 150 km/h expecting to drive on.
- `carMesh.setDamage(stage)`: paint tones darken toward graphite by 25 % a
  stage, the front bumper collapses onto its centroid at 1, the rear at 2,
  mirrors and spoiler at 3, glass darkens at 4; stage 0 restores from kept
  copies. One geometry, no material groups, no extra draw call.
- `render/Debris.ts` (32 boxes, one instanced mesh, fake physics with one
  bounce) and `render/Smoke.ts` (160 points, distance-sized, grey smoke at
  stage 2, dark smoke and fire from stage 3, a burst at the wreck, dark
  smoke from wrecked traffic within 120 m). The renderer consumes the event
  ring with a bound callback: a bumper flies off backwards on `damage`, a
  burst on `wrecked`.
- HUD: a DAMAGE bar under the boost bar (appears with the first dent, red
  from stage 3, pulsing when wrecked) and a WRECKED overlay naming the swap
  and reset keys. Sfx: crunch on `damage`, boom and two seconds of crackle
  on `wrecked`, a whoosh on `respawn`.

### Verification

- verify green, 135 tests. Smoke 60.0 fps / p95 16.7 ms / 95 draws /
  193k tris (debris and smoke add three draws), build 3.45 MB.
- Pins (`tests/sim/damage.test.ts`, playground walls lane with damage on):
  100 km/h head-on → damage 1, stage 4, wrecked; 60 km/h → 0.3–0.6 and
  stage 1; 40 km/h → 0.1–0.3; a 20° glance at 100 km/h → under 0.1; the lot
  boxes at 60 km/h → 0 with a real impact. A wreck under full throttle moves
  under 2.5 m in 1.4 s (the bounce settling), respawns after the timer at
  the reset pose with damage 0, engine on, boost kept and speed over 5 km/h,
  and `R` respawns at once. A rear-end on traffic costs under 0.3. The M1
  handling, cars and walls pins are unchanged and pass.
- The first verify run failed nine wall pins because damage wrecked the
  test car at 100–150 km/h; scoping damage to the city (the playground
  default off) fixed it without touching a pin.

### Next

- Slice 6: car-swap on `E`, three resident car meshes, camera whip, the
  fist-shaking driver.

## 2026-09-21 — M3 session 16: slice 4, pedestrians

### Done

- `sim/traffic/Pedestrians.ts`: 40 pooled pedestrians on the footways, as
  points on a lane polyline shifted 9.75 m right on streets (15.25 m on the
  highway's inner side, `halfWidth + 2.25 − laneOffset` on authored roads),
  walking forward or back, turning right round the block corner (the nearest
  footway on the same side, 12 m across the corner apron) or turning round,
  never crossing a carriageway. A car whose predicted 0.7 s path sweeps
  within 2.6 m makes them dive sideways at 6 m/s, get up and walk back onto
  their line; if a car's footprint grown by 1.3 m still reaches one, it hops
  clear of the flank (`guaranteeHops` counts it). A diver the player's car
  passes within 3 m of its footprint scores `nearMissPed` once, and `Life`
  pays `pedDodgeBoost`. Poses are written into the transform (walk bob, 70°
  dive pitch, get-up, fist shake) so the view only interpolates.
- `render/PedView.ts`: one instanced 72-triangle figure (torso, head, legs,
  arms), shirt tinted per instance, shadows on the high tier only.
- `render_game_to_text` reports traffic and pedestrian counts and hops.

### Verification

- verify green, 132 tests. Smoke 60.0 fps / p95 16.7 ms / 92 draws /
  192k tris, build 3.44 MB.
- Pins (`tests/sim/pedestrians.test.ts`): walkers on their line stay in
  the footway band of their street; a pedestrian 40 m ahead of a car at
  80 km/h dives before the car is within 8 m, is never inside the chassis
  footprint, scores exactly one `nearMissPed`, walks again within 3 s of
  the pass, no guarantee hops; with the dive switched off the guarantee
  alone keeps it out of the footprint (≥ 1 hop); two seeded runs identical.
- The full-pool cost test now fills with the road bot (a stationary player
  at the island edge starved the spawn ring); mean step logged with cars
  and pedestrians together.

### Next

- Slice 5: damage stages, wrecked, rolling respawn, debris and smoke.

## 2026-09-21 — M3 session 16: review fixes B1–B4, hand-over to Claude

Marcin dropped Grok 4.7 after `docs/M3_REVIEW_MID.md`; Claude executes the
rest of M3 on the same branch. This session fixed the four blocking findings
and the small ones, with behaviour pins.

### Done

- **Lent bodies** (`sim/traffic/Traffic.ts`, `lanes.ts`): one path-following
  code for kinematic and lent agents (`plan` gives the desired speed, the
  progress `s` of a lent body comes from `LaneTables.projectPath` onto its
  offset path, lane switches happen for both). Heading is a first-order
  controller with a rate cap (`yawGain` 3, `yawRateMax` 1.5 rad/s); the nose
  follows the motion, and a car left facing away from its path turns back on
  the spot. Junction curves are built per sub-lane offset from the offset
  endpoints: offsetting the centre curve by 6 m folded on tight corners and
  put the carrot behind the car.
- **Junctions**: conflict-checked holders (curves within 5 m), same-lane
  followers do not wait, release at 55 % of the curve, no re-claims from
  inside the box, first come first served across arms, holders exempt from
  fairness, the override after `junctionWait` (9 s, was 6) keeps the right
  of way until the car leaves. `aheadGap` looks only in the agent's own
  corridor. `accel` 4 (was 3), `speedJunction` 10 (was 8).
- **Wrecks** stay wrecks: never re-lent as drivers, a lent wreck is a solid
  obstacle, `wreckImpact` wrecks outright, the pool gives a lingering wreck's
  body up only when a driving car needs it.
- Small items from the review: `hit` once per contact, bound event callbacks
  in HUD and Sfx, `subLaneOffsets` read from tuning, `unstick` once, wide
  passes clear the near-miss flag, life screenshots unpaused, barrel exports.

### Verification

- verify green, 128 tests. Smoke 60.0 fps / p95 16.7 ms / 90 draws /
  187k tris, build 3.44 MB.
- New pins (`tests/sim/traffic.test.ts`): lent bodies change lanes (10 in
  60 s), max |angvel.y| 1.46 rad/s away from the player, nose within 60° of
  the carrot, longest unexplained stall 0.03 s; flow over 60 s: mean
  speed/limit 0.69–0.72, stopped share 8 %, 1 junction override (bands
  > 0.6, < 15 %, ≤ 5); a wreck stays put with its body for 15 s.
- Measured on the way (scratch harness, not committed): before the fixes
  the same drive had mean speed/limit 0.35, 58 % stopped, 102 overrides,
  0 lane changes by lent bodies, 46 rad/s spins; the two remaining spin
  events per minute are the player shoving a car from under 4 m.
- Perf, two runs after the fixes (headless MX330, CPU ×4, 60 s): 57.2 /
  55.1 fps, frame p95 16.8 / 33.3 ms, max 83 / 150 ms (the 667–1,850 ms
  frames of the earlier builds are gone), step p95 8.1 / 10.5 ms, 90 / 69
  draws, 184k / 160k tris, heap 51 MB, 0 bot resets (was 1). Node cost of
  a full step with 46 cars and two lent bodies: 0.31–0.34 ms, of which
  `Traffic.step` 0.16–0.21 ms; the browser step p95 is several substeps of
  a throttled frame (0.35 ms × 4 × up to 5), so it tracks that cost, not a
  hidden loop. Still under the 12 ms limit; a profile of `Traffic.step` is
  on the list for the polish pass.

### Decided and why

- The plan's junction bands (`waitedPast` ≤ 5, stopped < 15 %) were kept,
  and the mechanism changed until it met them: with a 6 s override and a
  4.5 s crossing, overrides cascaded; fairness plus a longer override and a
  faster launch brought them to one per minute.
- Rapier collider handles are f64 bit patterns (denormals); they are used
  only as Map keys and for equality, never for arithmetic.

## 2026-09-21 — M3 session 15: status report

Marcin asked for the work-so-far report in a document. `docs/M3_STATUS.md` records slices 0–3. It is not the gate report; `docs/M3_REPORT.md` is still written at the gate.

## 2026-09-21 — M3 session 15: slice 3

### Done

- Near misses and the oncoming lane pay boost from `ECONOMY` and push events. The meter clamps at 1. HUD popups (`NEAR MISS`, `ONCOMING!`, `DODGED`) sit above the speedo, skewed, yellow when boost was granted, with a persistent `ONCOMING` label and a 0.3 s boost-bar flash. `Sfx` plays a noise sweep, a two-tone honk and a yelp on the engine master gain, and drops events until the audio context is running.

### Verification

- verify green, 126 tests. Smoke 48.5 fps / p95 16.8 ms / 90 draws / 176,000 tris, build 3.44 MB, gameplay-start 1560 ms. The mean fps is one noisy run; p95 is still one frame.
- Economy tests: one oncoming near miss grants 0.20, a 3 m footprint gap grants nothing, 3 s in the oncoming lane pays `3 × 0.10` within 15 %, the right direction pays nothing, a near miss from 0.95 lands on exactly 1.
- `npm run screens` 10/10. Life frames at 800×450, 821×462, 1280×720 and 1920×1080: `ONCOMING!` sits above the speedo, clear of the radar and the speed digits. Several of those frames were taken while the pause overlay was still up, because the life shot is chained after the pause shot; the popup stays readable beside it. The clean driving frame is `screens/life-821x462.png`.

### Decided and why

- A near miss uses the gap between the two chassis half-widths, not centre distance. A 1 m centre gap is already an overlap for these cars, so the test places the cars one metre and three metres of clearance apart.
- The repeating `oncoming` event does not spawn a popup every second. The label is the persistent readout; `ONCOMING!` is the near-miss popup.
- The lane search copies the player position out before projecting, because the projection writes into the same scratch object.

### Next

- Slice 4: pedestrians on the pavements, the dodge, and the guarantee hop.

## 2026-09-21 — M3 session 15: slice 2

### Done

- Simulation LOD. A pool of 16 dynamic bodies is lent to the nearest kinematic agents inside 40 m (or on the 0.5 s velocity prediction). Velocity control follows the lane; a contact above `disturbedImpact` drops control for `disturbedTime`; a car that does not settle becomes wrecked and then a stopped kinematic obstacle. `Life.postStep` names the player's strongest contact and pushes `hit`. The road bot brakes for a slower car within 18 m.

### Verification

- verify green, 123 tests. Smoke 60.0 fps / p95 16.8 ms / 90 draws / 186,400 tris, build 3.43 MB, gameplay-start 1231 ms.
- Node mean step with the pool live: 0.563 ms (slice 1 was 0.559 ms). The LOD drive kept `guardHops` at 0.
- Perf twice, traffic on, after driving cars stopped colliding with the ground:
  - run A: fps 54.8, frame p95 16.80 / p99 50.00 / max 1850, step p95 5.80 / max 59.50, draws 90, tris 202k, heap 51 MB, resets 1
  - run B: fps 53.5, frame p95 33.30 / p99 50.00 / max 483, step p95 10.60 / max 147.70, draws 88, tris 181k, heap 51 MB, resets 1
- Both step p95 values are under 12 ms. Run A is below slice 1's 6.20 ms. Run B is 4.4 ms above it and sits on the two-vsync frame boundary; the Node mean did not move, so that p95 is a throttled hitch, not a slower `Traffic.step`. An earlier run that left cars resting on the ground measured step p95 12.9 ms and was rejected.

### Decided and why

- A driving traffic collider uses `GROUPS_TRAFFIC` (everything except terrain) and locked vertical translation, with the box tall enough to meet the player's chassis. Resting on the ground collider made every step a contact and pushed the throttled step p95 over 12 ms. A disturbed car switches to `GROUPS_SOLID` and unlocks vertical motion so it can tumble. Ground contacts are ignored when scoring the disturbance impulse.
- Colliders are rebuilt only when the lent body changes vehicle class.
- `setFacing` is a test hook so a T-bone can yaw a lent body onto its side without a second road.

### Next

- Slice 3: near misses, the oncoming-lane bonus, HUD popups, and synthesised stings.

## 2026-09-21 — M3 session 15: slice 1

### Done

- Kinematic traffic on the lane graph. `LaneTables` caches the 24-sample junction curve on first use. `Traffic` keeps 48 agents in typed arrays, spawns from `mulberry32(seed ^ 0x7a11)`, follows with `gapMin`, reserves turning and non-highway junctions, and writes y = 0.03. `TrafficView` packs live agents into three instanced meshes (`count` is the live number of that class) so zero-scale slots are not submitted. The city tour passes `traffic: 0, peds: 0`.

### Verification

- verify green, 119 tests. Smoke 55.8 fps / p95 16.8 ms / 80 draws / 145,929 tris, build 3.43 MB, gameplay-start 4683 ms. An earlier smoke on the same slice before instance packing was 60.0 fps / 90 draws / 235,024 tris; the 20 s bot does not always reach the draw peak.
- Node: 60 s bot, min same-lane distance 4.53 m, min any 4.53 m, 48 alive, 41 agents entered after `junctionWait`. Mean step with 48 agents 0.559 ms (limit 3).
- `npm run city` 5/5. Startup 2703 ms at 20 Mbit / CPU ×4. Tour low 62 draws / 162,135 tris / heap 40 MB / 0 resets; high 88 draws / 235,866 tris / heap 45 MB / 0 resets. Triangles match the M2 tour; low draws are 62 against the session-13 figure of 61.
- Perf bases, traffic not in the build yet (`perf/m3-base-1.json`, `perf/m3-base-2.json`):
  - base 1: fps 56.1, frame p95 16.80 / p99 50.00 / max 149.90, step p95 4.90 / max 82.70, draws 84, tris 162k, heap 48 MB, resets 0
  - base 2: fps 58.5, frame p95 16.80 / p99 33.40 / max 100.00, step p95 3.30 / max 35.50, draws 83, tris 176k, heap 48 MB, resets 0
- Perf with packed traffic: fps 54.4, frame p95 16.80 / p99 50.00 / max 916.70, step p95 6.20 / max 537.40, draws 90, tris 197k, heap 51 MB, resets 0, dropped 1.76 s. Draws +6 (three meshes and their shadow passes). Triangles +21k against base 2 and +35k against base 1. Step p95 is 1.3 ms above the higher base and 2.9 ms above the lower; frame p95 is unchanged. The 917 ms frame is one spike, not the p95.

### Decided and why

- Straight-through highway traffic does not reserve a node, as specified. A car also brakes for any agent 2–14 m ahead, and a post-step pass pushes a car back along its lane when another is inside 4.5 m. Without that, two cars merging onto one lane in the same step occupied the same point (measured 0.11 m) because the lane list is built before the move.
- The view packs instances and sets `count` instead of leaving a zero-scale tail. Submitting three full pools counted about 73–87k triangles in `renderer.info` (197k after packing). Draw calls stay at three plus three shadow draws once every class has a car.
- `Traffic` is constructed for every city world, including density 0, so `spawnAt` works in tests. `TrafficView` is created only when `trafficDensity > 0`, so the tour does not pay the six draws.

### Next

- Slice 2: lend dynamic bodies inside 40 m, classify hits, and teach the road bot to brake for traffic ahead.

## 2026-09-21 — M3 session 15: slice 0

### Done

- Slice 0 scaffolding. `mulberry32` lives in `src/sim/random.ts`; `app/bot.ts` and `City.generate` both use it (the city seed pin still holds). `EventLog` is a 64-slot ring (`src/sim/events.ts`) with `tick` stamped from a field the world sets, because `push` has no tick argument. `VehicleControls.swap`, `Vehicle.engineCut`, `Vehicle.setVelocity`, telemetry `hitHandle` / `hitImpulse`. `TransformBuffer` capacity 1024. `SimWorldOptions.traffic` / `peds` stored as `trafficDensity` / `pedsDensity` (default 1). `?traffic=`, `?peds=` and `?life=0` parsed in `App.boot`. `render_game_to_text` reports `carId`, `damage` (null), `traffic` (null), `peds` (null), `billboards` (null) and the last five event kinds.

### Verification

- Before the edit: verify green, 109 tests, smoke 60.0 fps / p95 16.7 ms / 84 draws / 162,448 tris, build 3.40 MB, gameplay-start 1095 ms.
- After slice 0: verify green, 111 tests (2 new event-log tests), smoke 59.2 fps / p95 16.8 ms / 84 draws / 166,994 tris, build 3.40 MB, gameplay-start 1667 ms. Draws unchanged. The triangle max and the startup time sit in the same band as earlier city runs (session 13 logged 162k tris and a 1.9–3.2 s control time); no system that draws or moves the car changed.

### Decided and why

- `EventLog.tick` is a public field the sim writes at the start of the step. The contract's `push` signature has no tick, and the event still has to carry one.
- Density is stored now and the pools stay absent, so `?traffic=0` changes nothing visible until slice 1. `?life=0` forces both scales to 0 even if the other params are set.
- `setVelocity` writes through the vehicle scratch vector. Swap will call it outside `update`.

### Next

- Slice 1: kinematic traffic on the lane graph and its instanced meshes. Before that, two `npm run perf` baselines on this commit (`perf/m3-base-1.json`, `perf/m3-base-2.json`).

## 2026-09-21 — Session 14: the M3 plan

Marcin asked for a full, detailed M3 plan. The executor will be Grok 4.7 XHigh
in Cursor (a model released today, so this milestone is also its trial);
Claude reviews the branch after the gate and runs the fix-up pass.

### Done

- `docs/M3_PLAN.md`: the milestone contract. Working rules for the executor,
  scope (in, out, stretch), twelve fixed decisions with reasons (pooled
  typed-array traffic with a lent body pool; velocity-driven dynamic bodies
  near the player; highway sub-lane offsets instead of a graph change; a
  polled event ring buffer; damage as rules outside `Vehicle`; car-swap by
  retuning the player's `Vehicle` in place; colliderless pedestrians with a
  dodge guarantee; pass-through billboards; slow motion as a loop time scale;
  one traffic density on both tiers; traffic uses the player's classes;
  tests and tours run with traffic off unless they test it), the module map,
  the step order, TypeScript contracts for `EventLog`, `Traffic`,
  `Pedestrians`, `Life`, `Collectibles`, the tuning objects with starting
  values, nine slices with behaviour, numbers, tests and acceptance each, the
  verification protocol (headless tests, `e2e/life.spec.ts`, screens, the
  perf A/B rule), the gate criteria, the API facts checked against the
  installed Rapier 0.20 and Three 0.186 types, a five-minute playtest script
  and the reviewer checklist.
- `AGENTS.md` at the root so Cursor (which does not read `CLAUDE.md`) points
  the executor at the standing rules and the plan.
- Review pass on the plan (Marcin's request), with measurements where the
  plan had guessed: the damage rules are now calibrated against the M1 wall
  harness (`telemetry.impact` per step: 100 km/h head-on 32.7 / 12.8 / 7.1,
  60 km/h 19.1 / 3.6, 20° glance ≤ 4.5; threshold 8 and 0.04 per m/s give
  glance 0, 60 km/h dented, 100 km/h wrecked; table in the plan under §3.4).
  Billboard placement moved into `City.generate` with per-chunk quotas and a
  local clearance check (the earlier rule put 16 of them in Palm Gardens
  back-lots, which sit inside blocks and are invisible from any street, and
  would have needed extra chunk generation at boot). Event log made
  allocation-free (visitor instead of copies), bumper detachment by vertex
  collapse instead of material groups (no extra draw calls), the pedestrian
  corner rule stated honestly (always the right turn round the block; the
  earlier text implied crossing side streets), the rear-end speed band
  widened to 25–85 % from momentum, slow-motion test phrased in sim time,
  the road bot's traffic awareness given a home in slice 2, draw-call deltas
  restated to include the shadow pass, and API facts extended
  (`world.getCollider`, collider `restitution()`, `EngineAudio.ready`).

### Decided and why

- The plan fixes design decisions rather than leaving them to the executor:
  an unfamiliar model is most likely to go wrong on architecture (bodies per
  agent, callbacks from the sim, damage inside the vehicle model), and a
  review against a written contract is cheaper than a rewrite.
- Stretch content (parked cars, stunt ramps, speed cameras) is gated behind
  the core gate criteria so the milestone stays a complete vertical slice.

### Next

- Grok works `grok/m3-life` through the slices; Claude reviews per §10 of the
  plan; Marcin playtests at the gate; the M3.1 pass follows his notes.

## 2026-09-21 — Session 13: road paint for the whole city and proper kerbside parking

Two passes. The first (started in a Codex session, accepted visually by Marcin)
replaced the chunk-local decor rules with one metre-based generator
(`sim/city/markings.ts`): yellow centre lines with a 6 m dash and double solid
approaches, crossings whole or absent, stop lines and straight arrows on grid
streets, complete 3 × 7 m parallel spaces with pads, edge lines, dividers and
a P stencil, and a per-vertex `paint` underlay so marks that lie across the
road fade into the surface before they alias (`render/roadPaint.ts`). The
second pass, this session, extended it to every road and junction on the island.

### Done

- **Perimeter as one closed loop.** The highway is painted as a single
  centreline with 19 m quarter circles about the inner kerb corners: double
  yellow and 4 m lane dashes at ±8 m (two lanes each way) run on through all
  20 side-street mouths because the highway has priority; the outer edge line
  goes round the corners at 35 m radius, the inner one breaks at the mouths
  (and at the two diagonal merges) and stops for the kerb corners. Before, each
  of the 24 highway segments stopped 21–28 m short of every node and the
  corners were empty squares.
- **Authored road ends.** Every one of the ten approaches has a stop line;
  the avenue ends at the tower, the parkway and the quay have crossings with as
  many stripes as the width allows (8, 6, 8). The crossing waits until both
  road edges are 6 m clear of the grid kerb lines, so it lands on the pavement
  wedge; the parkway joins its junctions tangentially and its crossing is 112 m
  out. No crossings at the perimeter or across the service road, no arrows on
  authored roads.
- **Perimeter T-junctions.** Streets ending at the highway get a left-right
  arrow (six boxes) instead of nothing; an arrow is drawn whole or not at all.
- **Kerbside on the avenue and the quay** (136 spaces) instead of edge lines;
  the parkway and the service road keep edge lines.
- **District parking** (`PARKING_STYLE`): Crown and the quay groups of five
  with a P, the gardens groups of three with every second group unmarked,
  Sunset Works groups of three in yellow with no P (loading bays).
- **Strokes merge** into boxes of at most 12 m, never across a polyline bend:
  4,540 line boxes for the whole island instead of about 12,000.
- Docs: decision 19 in `ARCHITECTURE.md`, paint and parking rules in
  `STYLE.md` (the 6 m patch rule is gone), three backlog lines.

### Verification

- `verify` green: 109 tests (7 marking pins: chassis fit, complete pads
  without overlap or duplicate owners, district styles, whole crossings at
  every join with the exact authored stripe counts, every street approach
  furnished, the perimeter loop's continuity and mouth breaks, 12 m merge
  cap and chunk ownership), build 3.40 MB, smoke 59.8 fps / p95 16.8 ms / 84
  draws / 162k tris alone (41.7 fps in a run that overlapped a parallel lint,
  not a code effect).
- `city` 5/5: control in 3.2 s at 20 Mbit / CPU ×4 (a slow run; 1.9 s last
  session); whole 178-lane tours low 61 draws / 162,135 triangles, high 88 /
  235,866 (was 162,729 / 233,674), heap 48 MB, zero bot resets.
- Overhead and driver-level captures at both tiers of the tower junction,
  both diagonal ends, both ends of the parkway, quay and chicane, the
  chicane middle, a highway corner, T-junction and straight, and a Coral Quay
  crossroads: `output/design-review/whole-before/`, `whole-after/`,
  `roads-whole/`; scratch scripts `screens/whole-city-review.mjs`,
  `screens/road-review.mjs`. Zero browser errors.
- Not measured: a matched perf A/B on the MX330 and the headed Intel path; the
  triangle counts say the change is within noise, and Marcin's playtest is the
  feel check.

### Decided and why

- Per road, not per chunk (decision 19): dash phase, crossings at merges and
  curves all need the whole road; the chunk map is just the owner lookup.
- The highway has priority, so its lines run through the mouths; the side
  streets carry the stop line. Lane dashes at 8 m are honest about the 32 m
  carriageway; the lane graph still runs one lane per direction at 6 m
  (backlog: move to 4 and 12 m with M3 traffic).
- Bays instead of edge lines wherever there is frontage: the avenue and the
  quay read as city streets with parking, the parkway and the yards road as
  through roads. An edge line and a bay edge would overlap at the same height.
- No arrows on authored approaches: they merge at an angle into a wedge, and a
  straight arrow would point at a pavement.

### Next

- Marcin's playtest of the whole loop; the tangential parkway ends are the
  spot to judge (crossing and stop line 112 m from the node).
- M3 traffic can take the lane dashes and the `approaches` list (stop line
  positions per road end) as its stop points.

## 2026-09-21 — Vehicle model quality pass

Marcin asked for properly finished, good-looking cars that fit the game.

### Done

- Rebuilt all three currently playable classes in the existing flat-shaded,
  texture-free style. Muscle: fuller shoulders, four round headlights, stripes,
  chrome bumper and segmented rear lamps. Compact: cyan paint, dark roof and
  spoiler, four-spoke wheels. Heavy: orange cargo van, framed panels, door splits,
  hinges, sliding rail, taller mirrors and protective mouldings.
- Actual wheel-arch openings and bevelled returns replace black semicircle
  decals. Open tyre profiles expose the recessed rims and spokes; the old rims
  were hidden inside capped tyre cylinders. Wheel placement follows existing
  tuning and retains the four independent steering/suspension/spin transforms.
- Framed opaque glazing with broad reflections; all decals follow the actual
  body triangles. Review caught and fixed glass clipping through nonplanar loft
  faces and distorted side strips at arch cuts. Rear lamps, reversing lamps and
  the compact's high brake lamp react to telemetry through colour buffer updates.
- All rigid fittings merge into the body. Complete cars are five meshes each,
  down from 14/11/11; muscle 6,118 triangles, compact 5,765, heavy 6,404 (previous
  1,616/1,506/1,494). Additional geometry buys the openings and visible wheel
  assemblies. No handling, camera, world, dependency or asset-texture changes.

### Verification

- Baseline `verify`: 92 tests, smoke 59.8 fps / frame p95 16.8 ms on headless
  MX330. Final `verify`: 101 tests, all typecheck/lint/build/smoke/budget gates
  pass; smoke 60.0 fps, p95 16.7 ms, 84 max draws, 162,964 max triangles,
  startup 859 ms (unthrottled), 3.40 MB. These short runs are not an FPS A/B proof.
- Nine render tests cover actual openings on both sides, exposed rim faces,
  finite geometry, five-mesh/7k-triangle budgets and reversible brake/reverse
  updates without replacing geometry or colour buffers.
- `city`: 5/5; control in 1,942 ms at 20 Mbit / CPU x4. Whole 178-lane tours:
  low 61 draws / 162,729 triangles; high 88 / 233,674; zero bot resets. Controls,
  reset, pause and automatic quality tests pass. Existing limits unchanged.
- `perf`: passes, 60 s headless MX330 / CPU x4: 59.4 fps, frame p95/p99 16.8 ms,
  max 83.3 ms, sim-step p95 6.1 ms, 84 max draws, 176k max triangles, 45 MB
  heap, zero bot resets. The script warns against the previous saved run about
  step p95 (3.5 -> 6.1 ms) and heap (40.15 -> 45.20 MB); both remain within
  limits. The sim code is unchanged, but no matched A/B establishes the cause
  of the timing difference. This is not a sustained-performance claim for the
  headed Intel/iGPU path or future multi-car traffic.
- Twelve final in-game views (three classes, normal chase and front/rear/side)
  reviewed against the baseline, zero browser errors. Skill-client acceleration,
  steering/drift, braking and reverse captures also reviewed, on high for coupe
  and compact and low for the van. Local evidence in
  `output/design-review/cars-before/`, `cars-final/`, `cars-drive-v2/`,
  `cars-compact-drive/`, `cars-heavy-drive/`; scratch script `screens/car-review.mjs`.
- Visual review is from the real game lighting and camera, plus close views;
  Marcin's subjective art-direction acceptance remains his playtest.

## 2026-09-21 — Session 12: heading-up radar minimap

Marcin asked for a new minimap designed to best practice. The old one fitted the
whole island into 132–184 px (streets under 2 px) and drew the offset lane paths,
so roads kinked at junctions; it never answered "which turn next".

### Done

- `src/ui/minimapModel.ts` (pure, Node-tested): road layers junction to junction
  plus the five authored centrelines at real width, velocity-heading easing with
  shortest-arc wrap and a 180°/s cap, speed zoom 210–420 m, world-to-screen
  projection, rim clamp along the ray from the player. Four pins in
  `tests/ui/minimap.test.ts` (92 tests total).
- `src/ui/minimap.ts`: circular Canvas 2D radar, bottom-left, `--minimap-size`
  150–240 px. Layers: water, island, district tints, road casing and fills (grid
  ink, highway gold, loop cream), landmark glyphs (tower, tank, glasshouse,
  hotel) that clamp to the rim with a chevron, car arrow rotated by yaw minus
  heading (drifts show the car sideways), rotating N with E/S/W ticks. Cached
  `Path2D` (grid streets merged into 10 whole lines, the highway one closed
  rectangle, authored roads with bounds), only paths within reach stroked, one
  transform per repaint, no per-update allocation, repaint at 30 Hz and only
  while something moved; snaps on `respawned` or an 80 m jump. The circle is
  the CSS `border-radius`, not a canvas `clip()`. `setMarkers()` for M3
  police/traffic and M5 activities.
- `Hud.update` passes `dt` and `now`; the old every-third-frame throttle is gone
  (the canvas is off the DOM layout path).
- Docs: decision 18 in `ARCHITECTURE.md`, minimap rules in `STYLE.md`, backlog
  (compass cue done; full map, north-up option, touch layout, `cityFootprints()`).

### Evidence and boundaries

- `verify` green; `city` 5/5 (district label assertion and district shots);
  `screens` 10/10 reviewed at DPR 1: labels 12 px, the circle clear of the drift
  readout at 800×450.
- Scripted review (manual stepping, DPR 2 crops): straight, turn, spin, reverse,
  two teleports, highway at 131 km/h. Map turns with the velocity, arrow keeps
  the nose, reverse follows the nose, teleports land aligned on the first frame,
  clamped landmarks slide along the rim with the bearing. Canvas pixels sampled:
  island band and blocks are the same fill (a tonal difference in the crop was
  simultaneous contrast against the water and the gold highway).
- Axis check: Coral Hotel (x 490) sits 44 m at +X of the marina spawn, which is
  west, and draws on the left when heading north; matches `+X west` in `App`.
- Cost, measured (headless MX330, CPU ×4, 20 s CPU profiles, old build served
  from a `git archive` of 664e04c on port 4174): the first painter's `paint`
  was 0.9 % of main-thread time (187–200 ms per 20.9 s); merging the grid into
  lines and culling changed nothing measurable, dropping the anti-aliased
  canvas `clip()` for the CSS radius took it to 0.6 % (131 ms), and the new
  build's idle share then matched the old (44.6 % vs 43.9 %). The first
  `npm run perf` on the new code failed the p95 gate by 0.0 ms (33.4000 vs
  33.4, the two-vsync boundary at ×4, as in session 11's first run) at 48.4 fps;
  the first three A/B pairs before the clip change read old 58.8 / 49.9 / 47.3
  vs new 54.1 / 48.6 / 44.9 fps with the machine warming through the run.
  After the clip change, three pairs: old 58.7 / 57.4 / 58.0 vs new
  57.0 / 58.8 / 58.1 fps, p95 16.8 ms on every run; the same in the mean. The
  gate run then passed: 59.0 fps, frame p95/p99/max 16.8/33.3/66.6 ms, step
  p95 3.5 ms, heap 40 MB, 0 bot resets. Nothing here is the headed Intel path;
  `perf:headed` on the laptop remains Marcin's number.

### Decided and why

- Radar over atlas, bottom-left, heading-up by velocity, zoom by speed: see
  decision 18. Bottom-left keeps map, drift readout and speed along the bottom
  edge where the eyes already are; one CSS rule moves it back.
- Reversing follows the car's yaw, not the velocity, so backing up never flips
  the map; a spin-out keeps the velocity heading until the car is truly backwards.
- Time-gated repaint (33 ms) rather than every Nth frame, so a 30 fps machine
  still gets 30 Hz on the map; the dirty check makes a parked car free.

### Next

- Marcin's playtest of the radar (rotation feel, zoom range, size); knobs in
  `MINIMAP`. Then M3 traffic, whose cars go through `setMarkers()`.

## 2026-09-21 — Session 11: performance on the iGPU path

Marcin: he playtests every build himself and reports what feels wrong (noted;
"feel unverified" is never an open problem). Then: performance and smoothness
first with `perf:headed`, A/B comparisons and a prepared machine; city and looks
after.

### Done

- Found that headed Chromium uses the Intel UHD (the brief's iGPU tier) while
  headless uses the MX330. Headed A/B script, headed CPU/allocation/heap probes.
- Main-thread cuts: reset projection at 10 Hz with lane bounds, HUD writes on
  change, minimap at 20 Hz, heap read every 30 frames, chunk descriptor cache,
  claim frames without builds, allocation-free `CityView.sync`, parallel shader
  compile at start, resumable geometry builds (1200 statics per frame), claims
  and slices alternating during the start burst.
- Leak guard re-derived: fixed scene is about 50 geometries, not 40.
- Report: `docs/M2_REPORT.md` § performance pass.

### Evidence and boundaries

- Headed A/B at CPU ×4 (three pairs each stage): M2.1 46–48 fps vs candidate
  51–52 fps after the CPU cuts; p99 50 → 34 ms. `perf:headed` 51.4 fps on final
  code (first run of the day 47.4, failing p95 by 0.0 ms). No throttle: 57–60 fps.
- The machine ran warmer through the day: the M2.1 reference fell to 34–41 fps in
  the last pairs while the candidate stayed 44–51; pairs, not absolute values,
  carry the conclusion.
- Remaining spikes are confined to the first second after control.

### Decided and why

- Keep `npm run perf` headless as the quick regression check and treat
  `perf:headed` as the iGPU reference: they exercise different GPUs.
- Resumable builds over a worker for now: no serialisation, same code path, and
  the largest part now costs at most one slice per frame. A worker remains the
  answer for the chunk generation spikes at start.

### City and looks (same session, after the performance pass)

- Yard props in `Architecture` (container, tank, gantry, fence, mast) placed
  along the service road every 30 m, alternating sides, footprint-checked.
- Frontage starts 8 m past the junction pavement (corner buildings); widths
  vary by index.
- Coral Quay edge: parapet with coping instead of the 4 m seawall, promenade,
  palms, benches, masts. Boundary colliders unchanged.
- Verify, city gate and unit tests green after the pass.

- Marcin's playtest: parking marks shimmered while driving. Cause: decals 1–13 mm
  apart beyond the depth buffer's precision at 100–300 m (near 0.3, far 1700).
  Fix: surface layers at least 12 mm apart, camera near 0.6 m.
- Second report: still shimmering (parking marks, crossings, paving joints), and
  a broken-looking junction. Two real causes found from junction approach shots:
  (1) thin decals aliasing (13 cm marks, 5 cm joints are sub-pixel past 60 m):
  widened to 0.28 / 0.12 m and limited to the near level, crossings become one
  band in the far level; (2) authored-road kerb slabs laid on the grid
  carriageway where a road leaves a junction at a shallow angle, covering half a
  crossing: authored furniture now skips grid street corridors.
- Third report: still shimmering, cornices too. Measured instead of guessed:
  raw canvas frame sequences, static and at 64 km/h, and a flicker map of
  pixels that flip between consecutive frames. Static: zero. Driving: kerb
  lips, far marks, cornices, lamp heads; identical with shadows off and on the
  high tier; MSAA 4× confirmed on the Intel path at 1906×935 with no
  downscaling. Cause: grazing-angle geometry (a flat mark is L·h/d² tall on
  screen). Redesign: parking bays as tone patches, no kerb lips or joints,
  crossings in worn tone near and a faint patch far, cornices 0.44 m, lamp
  heads 0.28 m, low-contrast frames, near level 120 / 150 m. Flicker pixels in
  the same drive 363 → 207, the rest at the fog horizon.
- Fourth report (with screenshots): bays not readable, half a crossing appearing
  late, facade pieces appearing late, unfinished junction corners. Causes and
  fixes: (1) each crossing half sat in a different quadrant part with its own
  detail switch; junction decals now go to the base part. (2) The far level drew
  walls without reveals; both levels keep them (low tour 119k → 154k triangles).
  (3) Corners were perpendicular cuts plus a band starting 24 m out; replaced by
  constructed pavements: a `prism` shape (render fan, convex-hull collider),
  wedge/sliver prisms from the real centreline, exact clip edges for bands and
  strips, chamfered tips, bands as prism quads (no overlapping kerb boxes on
  curves). (4) Bays get an edge line along the road and stronger patches.

### Next

- Marcin's playtest notes on the loop and the yards; then M3 traffic.

## 2026-09-21 — Session 10: M2.2 the loop, the skyline, streaming hygiene

Marcin asked what M2.2 could hold and then to start it. Scope as recommended: a
memorable authored route, recognisability from afar, the car's relation to the
new streets, and the perf hygiene items left by M2.1.

### Done

- **Roads as polylines** (`sim/city/roads.ts`): grid lanes unchanged in effect;
  five authored roads (two diagonals, a chicane, two arcs) join the graph as lane
  pairs. 178 lanes, Euler tour covers all, reset projects onto polylines, minimap
  draws them. `?spawn=loop`.
- **Rotated statics** in the renderer and colliders; `Architecture.rotatedBuilding`.
- **Open quarters** with corridor-cut pavements, lot yielding, road surface, kerbs,
  dashes, trees, lamps and frontage rows (avenue climbing toward the tower, quay
  loggias, parkway houses).
- **Skyline**: taller landmarks (tower, chimney, mast, hotel sign), roof variants,
  a silhouette layer with long-range fog, quay piers with boats. Camera far 1700 m.
- **Streaming hygiene**: one physics chunk per step; render tiles claimed with one
  generation, geometries built one per frame from a queue, both detail levels
  resident and swapped by distance; synchronous loads limited to the ring in front
  of the fog; boot phase timings in `GameHandle.bootTimings`.
- **Gate measurement**: the startup test reads navigation-relative time to the
  first controllable frame and logs the wall clock alongside.
- Docs: `docs/STYLE.md` § Street plan and skyline, `docs/ARCHITECTURE.md`
  decisions 16–17, `docs/M2_REPORT.md` § M2.2, backlog items.

### Evidence and boundaries

- `verify` green, 88 tests. `city` 5/5 on both tiers (low 80 calls / 139k
  triangles, high 106 / 183k; heap 40 / 45 MB; physics residency 18).
- Startup at 20 Mbit + CPU ×4: 2.7 s to control typical, one 4.6 s run with every
  phase 1.5–2× slower; gate run 3.5 s.
- A/B against M2.1 (before the streaming changes), three alternating pairs at
  CPU ×4 low tier: 57.8 / 55.4 / 54.6 vs 52.7 / 55.9 / 54.6 fps. Within noise.
- Two false alarms caught: a hidden game tab in the desktop browser pane made every
  build measure 13–34 fps (closed it, re-measured); the wall-clock startup number
  included 1–3.5 s of browser start-up outside the page (one run 6.6 s wall for
  3.1 s in-page). Neither was a code regression.
- `git worktree remove` deleted through a `node_modules` junction and destroyed
  `node_modules/.bin`; restored with `npm ci`. A/B builds now use `git archive`
  exports and the junction is removed with `rmdir` before the folder.
- Reviewed from the driving camera: every authored road at three points,
  landmarks, ring-road skyline views, the isolated silhouette layer from the quay.

### Decided and why

- Polyline lanes in one graph rather than a second road type (decision 16).
- Two resident detail levels rather than regenerating chunks at the detail
  boundary (decision 17); heap stays far below budget.
- The chicane has no frontage: yards read as yards, and the tight curve needs
  sightlines.

### Next

- Marcin's loop playtest (`?spawn=loop`), then M3 traffic on this road graph.

### Open problems

- Frontage rhythm, bare chicane yards, corner buildings, silhouette sightlines,
  the residual render spike: `docs/BACKLOG.md`.

## 2026-09-21 — Session 9: M2.1 street architecture, shadows, camera

Marcin's playtest feedback on M2: buildings need considered scale and variety,
ground floors, sidewalks and recognisable places; some facades clash with the sky;
shadows appear oddly on buildings; the camera reacts too strongly to steering.
A second round rejected the first facade pass (floating balcony rails, flat window
rectangles pasted everywhere). The Codex session that started this work ran out of
usage mid-way; this session verified its state and finished the pass.

### Done

- **Facades** (`sim/city/architecture.ts`): openings as voids in a shell of piers
  and bands, glazing behind reveals, loggias with slab, returns and parapet on the
  slab, shopfronts, loading bays, houses with shutters and gardens, ribbon offices,
  distinct side/rear elevations. One collision-only envelope per building.
- **Streets**: 4.5 m sidewalks, paving joints, entrance paths, parking shoulders,
  trees, block interiors, reserved landmark plazas, muted facade bodies and sky.
- **Shadows** (`render/shadows.ts`): fixed 140 m map, texel-snapped target, edge
  fade, all resident casters. **Camera**: motion-only follow, bounded lead and
  lateral look, 110°/s cap, FOV 60–80; four comfort tests replace M1 look-ahead pins.
- **Budget recovery**: the facade pass had pushed the low tour to 291k triangles
  (limit 250k). Quartered chunk meshes with per-part distance/shadow culling and
  static matrices, spatial detail radius (180 / 220 m), `trim` members with only
  visible faces and no depth pass, balcony members with exposed faces only. Low tour
  now 77 calls / 109k triangles, high 105 / 149k.
- **Fixes found on review**: open building corners (missing end caps on full-span
  X bands showed the underside of the adjacent band as a dark wedge, located by a
  pixel raycast against the merged buffer); render parts no longer retain chunk
  descriptors; two docs written in cp1252 by the previous session restored to UTF-8.
- Gate report extended: `docs/M2_REPORT.md` § M2.1.

### Evidence and boundaries

- `verify` green, 88 tests, 3.36 MB. `city` 5/5 on both tiers, `screens` 10/10,
  `perf` passes its budgets.
- Six alternating 30 s A/B runs against the M2 build at CPU ×4, low tier: 55.1 vs
  53.4 fps mean; identical-code spread is 52–58 fps, so the difference is within
  noise. A CPU profile attributed the extra main-thread time to Three per-object
  overhead, which the per-part culling then reduced. Nothing here proves a sustained
  60 fps on the low tier; the M2 pacing caveat stands.
- Startup at 20 Mbit + CPU ×4: 3.0–4.6 s over six runs (M2: 2.2 s). Under the 6 s
  gate; deferral plan in `docs/BACKLOG.md`.
- Reviewed from the driving camera: six named views, a steering pulse, four
  landmarks, and front/corner/side close-ups of one building per district.

### Decided and why

- Quadrant parts and a spatial detail radius rather than per-tier facade variants:
  both tiers keep the same geometry rules and the low tier lost 55 % of its
  triangles with no visible change (Decision 14 in `docs/ARCHITECTURE.md`).
- The leak guard in `e2e/city.spec.ts` now scales with resident meshes (five
  geometries per chunk) instead of the fixed 80; it still fails on any growth with
  `loaded`.
- Codex's root `progress.md` stays as a short mirror; this file remains the log.

### Next

- Marcin's playtest of M2.1 on the low-tier laptop (`npm run perf:headed` there
  would give the first real low-tier numbers). Then M3 traffic on this foundation.

### Open problems

- Facade variety at speed, roof silhouettes, waterfront composition, trees' shadow
  cost, startup margin: all listed in `docs/BACKLOG.md` or the report's known issues.

## 2026-09-21 — Session 8: M2 city, ready for the playtest gate

Marcin's instruction: begin M2. Baseline `verify` passed: 81 tests, 3.34 MB,
869 ms unthrottled startup. Work is isolated on `codex/m2-city`.

### Done

- **City.** `sim/city/City.ts` generates 49 independent 225 m chunks, 1,575 m square,
  from a seed. Four district massing/colour families, parks, pavements, lamps,
  crossings, four landmarks and a visible island boundary. Original code geometry,
  no new dependencies or third-party assets. This is a first blockout, not an
  accepted final art pass.
- **Roads.** `sim/city/roads.ts`: 49 connected junctions, 168 directed right-hand
  lanes, wider perimeter loop, sampled cubic junction connections including U-turns.
  An Euler route lets the existing pursuit controller visit every directed lane.
- **Physics streaming.** One seamless permanent ground collider, 3×3 neighbourhood
  loaded ahead, retention within 5×5, load before unload, existing building/wall
  collision rules. Reset projects onto the closest lane and updates after teleports.
- **Render streaming.** Direct typed-array mesh construction, one shared material,
  one merged mesh per chunk, frustum culling, distance-limited shadow casting,
  fog/load/eviction margins, geometry disposal. One new mesh per normal frame;
  initial and teleported views are synchronous.
- **Quality.** Low-first startup and actual frame-cost sampling, high/low fog and
  shadows, DPR caps and dynamic resolution, cooldown/hysteresis. Locked query
  overrides for repeatable checks. Simulation and collisions stay tier independent.
- **UI / QA.** North-up minimap, car arrow, district/landmark labels; concise state
  in `render_game_to_text()`, opt-in deterministic stepping via `?manual=1`.
  The dev panel exposes only useful named district spawns, not all 168 lanes.
- **M1 preserved.** Playground URLs and `?map=playground` keep the handling course,
  recordings and lap ghost. No vehicle tuning was changed. City recording is off
  by default so long sessions don't retain an unbounded pose/control history.

### Evidence and boundaries

- `verify`: 85 passing Vitest tests, both typechecks, lint, production build, smoke
  and byte budgets on final code. Build 3.35 MB / 5 files; final smoke startup
  740 ms. The camera-snap guard also passes the targeted browser controls test.
- Full headless tour: **168/168 lanes**, **1,709.3 simulated seconds**, no bot resets,
  no body impacts. Chassis Y after settling **0.415–0.433 m**. Streaming revisits
  recreate identical geometry and remain under the collider residency bound.
- `npm run city`: **5/5**. Startup **2,215 ms** at 20 Mbit / 40 ms latency / CPU ×4.
  Accelerated whole-map render tours: low **49 calls / 49,473 tris / 25 meshes**;
  high **54 / 64,437 / 45**, physics **16 chunks** max. Meshes unloaded **251/266**;
  peak heap samples **19.6/26.3 MB**. Controls, pause/resume, reset after teleport,
  and automatic high→low quality response are checked.
- Initial real-time M2 perf, MX330 / ANGLE D3D11, 1280×720, CPU ×4, 60 s:
  **59.8 fps**, frame p95/p99/max **16.7/16.8/50.1 ms**, sim substeps/frame p95
  **3.2 ms**, heap **22 MB**, no bot resets. Extra triangles/heap compared with the
  empty M1 lot trigger comparison warnings, not budget failures.
- Final real-time repeat: **58.2 fps**, frame p95/p99/max **16.8/33.4/166.8 ms**,
  sim p95/max **3.5/26.8 ms**, heap **21 MB**. The preceding run on the same code
  had **56.7 fps**, frame max **766.6 ms** and sim max **257.6 ms**. The p95 budgets
  pass, but these outliers prevent a hitch-free or sustained-60 claim.
- Instrumented 60 s run: 55.0 fps, p95/p99/max 16.8/66.6/233.4 ms. Slowest render
  call 58.5 ms with **no** chunk load/unload; render including an upload 28.9 ms;
  physics step with three loads/removals 13.9 ms. The longer frame gaps remain
  unexplained; streaming has a cost but is not established as their cause. Raw
  scratch evidence: `perf/city-profile.json`. No extra profiling code ships.
- `npm run screens`: **10/10** viewport cases, HUD + pause. Inspected player-camera
  shots from the input-burst skill client and every named city spawn, plus the
  smallest/largest HUD and the small pause view. No browser console errors in QA.
- The **whole-map tour is accelerated** and checks coverage/streaming/scene budgets;
  the **real-time perf run is 60 s**, not the entire 28-minute tour. Chromebook and
  other hardware remain unmeasured. Human driving/art approval remains Marcin's.

### Decisions and next

- Fixed road plan plus seeded lots gives repeatable driving and an M3 traffic base.
  The flat grid and at-grade perimeter intersections are deliberate first-pass scope.
- Keep physics and visual streaming independent; never change gameplay by quality.
- The renderer detects a large position jump itself, because a fixed step can clear
  the sim's one-tick respawn flag before rendering. City teleport views and the chase
  camera snap on their first frame; this has a browser regression assertion.
- Gate report and five-minute playtest: `docs/M2_REPORT.md`. Start at `/`, or jump
  with `?spawn=crown|foundry|gardens|marina|highway`; compare `?quality=low|high`.
- Stop at the M2 playtest gate. M3 scope remains traffic LOD, dodging pedestrians,
  damage, car-swap, takedowns, near misses, boost economy and collectibles.

## 2026-09-21 — Session 7: sparks, camera look-ahead

Marcin's call: sparks while scraping, and a look-ahead camera.

- **Sparks** (`src/render/Sparks.ts`). A fixed pool of 192 particles drawn as point heads (3.5 px, resolution-independent) plus streak tails along their velocity: two draw calls for the whole pool, typed arrays updated in place, no allocation per frame. Emitted at the contact point from `telemetry` (`contactX/Y/Z`, normal, `scrape`, `contactSide`): 60/s while touching plus 300/s at full scrape, and a burst of 4 per m/s of impact (cap 70) on a hit. Thrown along the wall behind the car with part of its speed, a random spread, gravity, life 0.18–0.5 s, hot white-yellow fading to orange, dying on the ground. Always on the car's flank, never in front of it. The scrape threshold in the sim dropped from 0.08 to 0.04 m/s per step so a light lean on a wall already shows (and grinds).
- **Camera look-ahead** (`ChaseCamera.ts`, numbers `headingLead`, `lookSide*`). The heading gains 0.22 s of the car's yaw rate (not while drifting, where the velocity follow already frames the exit) and the look point slides toward the inside of the turn: 1.8 m per rad/s of yaw rate plus 2.2 m at full steering lock, capped at 4.5 m, smoothed at 6/s, fading in up to 14 m/s and out during the reverse orbit. `yawRate` added to the telemetry (rad/s, + = nose left). Pinned in `tests/render/camera.test.ts` (Node, no WebGL): straight = centred, a left turn leads the view 1–25° left and slides the look point ≥ 1 m to the inside, right mirrors it, steering alone at speed already turns the view.
- Real-time screenshots for judging effects: a Playwright script from the project root (the in-app pane runs at ~4 fps and cannot show particles).

## 2026-09-21 — Session 6: per-class bot budget, wall collisions

Marcin's call: give the track bot a per-car lateral budget, then fix collisions with walls at speed.

- **Track bot per class.** Swept the bot's lateral budget 9–21 m/s² per car. The muscle's laps fall all the way to 21 but above 17 it runs 3 m off the road; the compact lifts its inside wheels above 13 (rolls to 37°); the van runs 12 m wide above 15 and rolls at 13 and 17. Chosen: muscle 17, compact 13, heavy 11 with braking 8 (`TRACK_BOT_BY_CAR` in `src/app/trackBot.ts`; the constructor takes the car id). Per-class lap pins in `cars.test.ts` (muscle 30–40 s, compact 33–43, heavy 35–46); flying laps measured 34.2 / 37.3 / 39.7 s.
- **Walls, measured first.** With the old 0.65 combined friction and no assist, a glancing hit up to 30° slid along the wall, but from 45° up the corner friction pivoted the nose into the wall and the car stopped dead; at 60° it swung past 90° and ended facing backwards; head-on was a dead stop with no bounce and no feedback of any kind.
- **Walls, now** (`Vehicle.ts` "body contacts", numbers `wall*` in `tuning.ts`, decision record 11):
  - the chassis reads Rapier's contact manifolds back every step (`contactPairsWith` / `contactPair`, bound callbacks, no JS allocation): summed normal impulse → `telemetry.impact` (m/s of speed change this step), contact point and normal, `scrape` 0..1 and `contactSide`;
  - chassis friction 0.15 with the Min combine rule (walls are slippery), restitution 0.2 with the Multiply rule: walls and buildings carry restitution 1.0 so a head-on hit bounces back a little, props carry 0. Props keep their previous contact numbers against the slippery chassis through their own rules (friction 0.55 with Max, restitution 0.6 with Multiply → 0.12), checked by reading the manifold coefficients back;
  - on the step of a hit only 15% of the body spin survives: a corner impulse otherwise spins the car round;
  - while sliding along a wall a yaw controller (20 rad/s² per rad, damping 7/s, scaled by the yaw inertia so every class turns alike) turns the nose toward the direction of travel, and keeps working for 0.5 s after the body leaves the wall so the bounce cannot undo it; above an 80° nose angle it is a crash and nothing aligns;
  - nearly stopped with the nose in: throttle + steer peels the car off to the steered side, throttle alone with the nose under 60° slides it out, no input never turns a stopped car.
  Results at 100 km/h (muscle / compact / heavy, speed one second after the hit): 20° keeps 96/93/92%, 45° 69/64/60%, 75° comes out aligned within 3° at 44/47/32 km/h; a 60° hit at 150 km/h comes out straight at 65–70 km/h; head-on stops, bounces 6–11 m and stays square; every case minUp ≥ 0.99. 22 pins in `tests/sim/walls.test.ts` (7 per class plus props).
- **Feedback.** Camera: impact shake (`impactShake` per m/s, capped) and a scrape shake. Audio: a low thump per hit scaled by the speed lost, a band-passed grind while scraping.
- **Playground.** `walls` lane at x 250: barriers both sides for 300 m, an angled barrier crossing the lane at 7°, two pillars, a head-on wall. `?spawn=walls`. The renderer is on the debug handle (`window.__game.renderer`) for scene inspection.
- **Perf.** Sim step unchanged: Node 63–68 µs mean warm (old vs new), browser 40–60 µs, a continuous wall scrape adds ~10 µs. The throttled probe's step p95 swings 3.2–5.8 ms between runs with the in-app browser pane open; with it closed, two runs each: session 5 commit 4.7 / 4.7 ms, this tree 3.6 / 3.2 ms. Frame p95 16.8 ms, 59.9 fps, draw calls 47/67, 34k tris, 16 MB heap, all within budget. Lesson: close the pane before `npm run perf`.
- **Known.** A car nose-in at exactly 90° with the throttle held and no steering pushes the wall and revs; that is by design (steer or reverse). No sparks yet: the contact point and normal are in the telemetry for the VFX pass.

## 2026-09-21 — Session 5: M1 deepened (instrumentation, test track, three cars)

Marcin's call: stay on M1 and do the three highest-leverage items instead of moving on.

- **Instrumentation.** `Recorder` logs every fixed step: controls (6), pose (7) and telemetry (10 values) in growing typed arrays; `toJSON`/`fromJSON` for saving. Because the sim is deterministic, the control stream replays a run: pinned bitwise for an exact stream and to 1 cm after JSON rounding. Telemetry gained `gLong`/`gLat`/`gVert` (from the velocity change over the last step). The dev panel has a scrolling telemetry graph (speed, lateral and longitudinal g, slip, steer, throttle, brake; 10 s of history), "save recording", "load ghost" and "clear ghost".
- **Test track.** `src/sim/track.ts`: a closed Catmull-Rom loop west of the lot (~990 m: start straight, right sweeper, chicane on the east side, hairpin at the south-east, a back straight with a 7° kicker, a 40 m right-hander back onto the straight), sampled every 3 m with heading and curvature; kerbs where it bends, edge posts, a start gantry and gate markers. `LapTimer` with 8 gates: laps count only when every gate is crossed in order (pinned); current / last / best on the HUD with a toast. The best lap's pose stream becomes a translucent **ghost** of the same car. First layout had a hairpin at the start line and 10 m apexes; fixed by re-drawing the loop in the driving direction and easing the chicane (all radii ≥ 12 m, pinned).
- **Track bot** (`src/app/trackBot.ts`): pure pursuit on the centreline with a speed plan from the curvature ahead (allowed speed = min over the next 90 m of sqrt(v_corner² + 2·a_brake·d)). Lap times with no resets: muscle 37.1 s cold, then 34.2–34.3 s; compact 39.9 → 37.0 s; heavy 42.2 → 37.2 s (pinned 30–70 s for the muscle car). The van and the compact lap within 0.2 s of each other because the loop is corner-bound; the bot plans every class with the same lateral budget, so the benchmark measures grip more than power. `?bot=track&spawn=track`. This is the core the city road bot will reuse.
- **Three cars.** `CAR_PRESETS` (`muscle`, `compact` FWD hatch, `heavy` delivery van) as tuning overrides on the default, matching `CAR_PROFILES` for the loft (hatch: short bonnet, tall greenhouse; van: flat nose, one long box). `?car=compact|heavy`, panel buttons reload with the choice. `tests/sim/cars.test.ts` runs the same six pins per class with per-class numbers (rest, 0–100 and top, braking, handbrake drift band, pulse response at 60/120, kerb + 16° ramp). 52 sim tests.

## 2026-09-20 — Session 4: step cost, tyre load sensitivity, LSD, streak quads

- **Sim step measured** (Node, 3,000 steps with a driving script): 0.27 ms per step = vehicle 0.18 + Rapier 0.06 + rest 0.03. The throttled browser p95 of 8.3 ms was frames with 2–3 substeps after a hitch, not the step itself. Moved the per-wheel velocity and force maths into JS (`velAt`, `forceAt`: one `addForce` and one `addTorque` per step instead of 23 WASM calls): vehicle 0.18 → 0.14 ms. Rays cost 4 × 7.7 µs and are not worth more work before M3.
- **Tyre load sensitivity** (`loadSensitivity` 0.15): grip per newton falls with load above the static share, so weight transfer costs total grip, as it should.
- **Limited-slip differential** (`lsdLock` 0.5, `lsdPreload` 60 N·m, `lsdStiffness` 220 N·m·s): torque moves from the faster driven wheel to the slower one, capped by preload plus half the axle torque. No one-wheel-peel; power slides are cleaner.
- **No clutch**: decided with Marcin; an automatic arcade car does not need one.
- **Streaks rebuilt as quads**, then **replaced**: Marcin objected to anything drawn in front of the car; checked how the big arcade racers do it (FOV, camera, peripheral radial blur or edge speed lines, shake, sound; world particles only behind/beside the car). Now `SpeedLines`: a fullscreen additive shader with streaks rushing outward from the periphery in random sectors, the centre masked out, intensity from speed and boost, cyan lean under boost. One draw call, no geometry updates.
- Wheels merged into one vertex-coloured geometry each (was 9 meshes per wheel). Perf run on the MX330 laptop, 4× CPU throttle: 59.8 fps, frame p95 16.8 ms, sim step p50/p95 1.2/3.0 ms (was 2.2/8.3), draw calls max 69 (was 80), 17k tris, 16 MB heap.
- 29 sim tests pass with the new tyre and differential.

## 2026-09-20 — Session 3: feel passes 2 and 3 (drift, flight, camera, acceleration)

Marcin's playtest notes, in order: straight-line twitchy → drift hard to start and dies with the handbrake, slalom "like a bus" → drift still releases too soon, flight/landing needs rules, reverse and drift cameras poor, acceleration too quick for the Vmax.

### Done

- **Steering for a keyboard:** input ramps at 6 locks/s through a 2.4 sensitivity curve (a 100 ms tap is a small correction, a hold is full lock); lock shrinks to 5° from 34 m/s. Pinned: a 0.35 s full-lock pulse turns > 20° at 60 km/h on grip and < 16° at 120 km/h.
- **Arcade grip:** mu 2.2/2.3 (~3 g), so the slalom is driven on the throttle.
- **Drift entries:** Space while turning (a drift button: rear grip cut, no brake torque; on a straight or slow it still brakes/locks), a brake tap while turning hard above 50 km/h, or the rear stepping out under power above ~100 km/h.
- **Drift persistence:** the commanded angle is rate limited (in 90°/s, out 45°/s), a centred stick with Space held keeps 40% of the angle, exit needs 0.3 s below the exit slip, counter-steer shrinks then swaps. Pinned: taps every half second keep the drift for 4 s above 50 km/h and 18°.
- **Flight rules:** ramp climb costs only gravity (the chassis no longer collides with terrain; it rides on the suspension, and the terrain group is switched on only when the car is on its side or roof); a kink in the road redirects the velocity without loss; in the air the nose follows the flight path (nose up rising, bias +4°, ±25°), and levels to the ground normal 0.45 s before touchdown; a landing keeps 35% of the vertical speed and 50% of the spin, and 92% of the total speed is kept by redirecting the absorbed part along the ground (Burnout rule); the damper impulse is capped so a landing can stop the chassis but never throw it back up. Pinned on the 26° ramp: lip ≥ 80% of the run-up speed, nose 5–32° up, ≤ 10 airborne steps in the second after touchdown, ≥ 85% of the lip speed kept.
- **Camera rewritten:** yaw is an angle with a rate cap; the view looks along the camera heading (a drifting car stays centred, the view shows where it goes); reversing orbits smoothly to the front after 0.6 s; height lags in the air; landing shake from the impact; drift pulls the camera back and down slightly.
- **Starter car pacing:** torque 245 N·m, drag 1.12: 0–60 in 3.1 s, 0–100 in 6.5 s, 169 km/h, 234 with boost, 29 m from 100.
- **Car model rebuilt as a parametric loft** (`src/render/carMesh.ts`, per the brief's "built in code from parametric profiles"): cross-sections with floor / belt / roof heights and widths give a low nose, bonnet, raked windscreen, narrow greenhouse, rear window and tail; every loft face is a bilinear panel and all detail is drawn *in* the panels as flush decals clipped to the panel (pillars, belt trim, door seams and handle, wheel-arch pockets, sills, bumper bands, headlights, grille, tail/reverse lights, plate); only mirrors, exhaust tips, a lip spoiler and the wheels are real 3D parts. Brake and reverse lights recolour their decal vertices in place. `MUSCLE` is the first `CarProfile`; the other seven classes will be profiles too.
- 29 sim tests.

### Decided and why

- The drift is a held state that the player modulates, not a condition that is re-evaluated every frame. On a keyboard every modulation is a release, so releases must not be exits.
- No chassis–terrain collision while upright (decision record 9). Scraping a bumper on a ramp lip is realistic and feels terrible.
- The landing keeps momentum on purpose: a jump that costs speed is a jump nobody takes twice.

## 2026-09-20 — Session 2: M1 polish after Marcin's first playtest

Marcin's feedback: A/D reversed; physics must be rigorous and tuned by numbers; the speed streaks looked generic ("AI slop": improve, do not remove); work off the known-issues list; then M2. His laptop (weak CPU + MX330) is the low-tier reference and it felt smooth.

### Done

- **Steering sign.** With +Z forward and +Y up, +X is the car's left, not its right. Fixed at the source (`AXIS_RIGHT = -X`, steer rotates by `-steer`), bot and tests updated, verified in the browser (D moves the car to screen-right).
- **Physics pass** (`docs/ARCHITECTURE.md` → Vehicle model): engine torque curve + automatic gearbox + reverse; per-wheel angular velocity with a slip-ratio tyre force solved in closed form per substep; slip-angle lateral model with friction circle and impulse clamp; Ackermann; traction control, ABS, rest damping as numbers; drift layer where the stick commands the angle and the fronts auto counter-steer. 22 headless tests pin it. Probe-measured: 0–100 in 5.0 s, ~171 km/h, ~233 with boost, 30 m from 100, drift holds 30° at 45–50 km/h losing ~5 km/h per second, no creep at rest, handbrake locks the rears, ABS keeps the fronts rolling.
- **Speed streaks** rebuilt as world-anchored motes smeared along the car's velocity, fog-tinted, tapered, additive, centre of the screen kept clear.
- **Known issues worked off:** sky dome follows the camera; shadow frustum widens with speed; reverse camera after 1 s of backing up; simulated ad overlay counts down on `setInterval`; dev panel rebuilds mass/collider live (`applyTuning`); skidpad cones removed (a cone under a suspension ray read as a kerb and launched the car mid-drift).
- `npm run perf:headed` on this machine (visible window, 4× CPU throttle): 58.3 fps, frame p95 17.2 ms / p99 33 ms, sim step p95 8.3 ms (was 4.9; the per-wheel solver, noted in the backlog, budget is 12), 80 draw calls, 15k tris, 20 MB heap, 0 bot resets.

### Decided and why

- The drift controller commands the **angle**, not the yaw rate: with a keyboard the stick position is the only analogue the player has, and "full lock = 35°, centre = straight, counter = swap sides" is learnable in one try. Auto counter-steer keeps the fronts rolling along the velocity, which is both what a drifting car looks like and why the drift no longer scrubs 15 km/h per second.
- Wheel rotation is solved, not integrated (decision record 7 in ARCHITECTURE).
- Top-speed tests wrap the car back 500 m on the straight instead of extending the playground, because the asymptotic approach to Vmax takes longer than the kilometre.

### Next

- M2 The city, straight away (Marcin's instruction): procedural generation, chunk streaming, road graph with lanes, minimap, districts, fog and draw distance, first quality tiers. Gate: budgets hold with the bot driving the whole map.

## 2026-09-20 — Session 1: M0 Foundations + M1 The car

### Done

- Repo tidy-up: `BRIEF.md` moved to `docs/BRIEF.md` and committed. `LAUNCH-PLAN.md` and `launch_sim.py` mentioned in the instructions were not in the folder; nothing to move (noted, not blocking).
- Toolchain: TypeScript 5.9 strict, Vite 8, Vitest 5, Playwright 1.63 (Chromium installed), ESLint 10 + typescript-eslint + eslint-plugin-boundaries. Layer rules enforced on imports; `tsconfig.sim.json` compiles `src/sim` without the DOM lib. Both verified to catch violations.
- `docs/CRAZYGAMES.md` written from the live docs by a subagent (18 pages). No contradictions with the brief's assumptions. New facts: a third SDK environment value `crazygames`, ad error code `adCooldown`, banner-specific `bannersDisabledBasicLaunch`, no official npm package (script tag only), data cap is 1,048,576 bytes with the error code spelled `dataLimitExcedeed`.
- `Platform` interface + `LocalPlatform` (simulated ad overlay, every error code forceable from the URL, call counters exposed for tests).
- Fixed-step loop (60 Hz, ≤ 5 substeps, drops excess), `TransformBuffer` double-buffer, render interpolation.
- Sim: `SimWorld` on Rapier, the M1 playground (long 1 km straight with posts and distance boards, kerb lane with rumble strips, 12-cone slalom, skidpad, 8°/16°/26° ramps and a 22° big jump, soft boxes to bump), 8 named spawn points, fall/flip recovery.
- Vehicle: custom raycast car (see `docs/ARCHITECTURE.md`), all numbers in `VehicleTuning`, drift state machine, boost meter, fake gearbox for audio.
- Render: merged vertex-colour statics (1 draw call), golden-hour sky dome + fog + shadow map that follows the car, code-built muscle coupe with wheels on their own transform slots, chase camera with FOV/pull-back/drop/shake/velocity-follow, speed streaks.
- Audio: synthesized engine (saw + square + sub through a load-driven lowpass, waveshaper grit), wind and skid noise, ad-mute hook, user mute on `M`.
- UI: HUD (speed, gear, boost bar, drift readout, debug block, pause overlay, keycap hints for 12 s, toasts), dev tuning panel (`?dev=1` or backtick) with spawn buttons, boost refill, defaults, and "copy patch". Screenshots at all ten required sizes reviewed; the first pass had the BOOST label clipped and the gear floating, fixed.
- Input: `KeyboardEvent.code` bindings, arrows + WASD, prevent-default on arrows/space, layout-map labels, `P` pause, blur/visibility auto-pause without `gameplayStop`.
- Tests: 17 Vitest sim tests (acceleration, top speeds, boost economy, braking, reverse, three drift tests, kerb clip, keyboard highway stability, ramps land and settle, flip recovery, reset, render-rate independence at 30/60/144/165 Hz with bitwise-equal results, accumulator behaviour, 10,000-step soak).
- E2E: smoke (loads → gameplay-start once → 20 s of sim with no console errors → `perf/startup.json`), perf (bot 60 s under 4× CPU throttle → `perf/latest.json`, regression warnings), screens (HUD + pause at the 10 required sizes).
- Tools: `npm run verify`, `npm run budget`.
- Docs: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STYLE.md`, `docs/TITLES.md`, `docs/BACKLOG.md`, `docs/ASSETS.md`.

### Decided and why

- Rapier `-compat` build: runs in Node for Vitest with no bundler plugins; costs ~0.7 MB of base64. Total startup is 3.3 MB uncompressed, far under the 8 MB target.
- Custom raycast vehicle instead of Rapier's controller: the drift state, slip curve and arcade assists the brief asks for do not exist in the built-in controller.
- Drift is a controlled state (yaw-rate controller + velocity-follow + scrub), because the emergent version either spun out or lost all speed in a second. Holding steer now gives a stable ~25° drift; centring straightens in ~0.3 s.
- Handling numbers were set by the headless probe, not by feel (which only Marcin can judge): 0–100 in 4.9 s, 163 km/h at 12 s / ~170 asymptotic, 228 km/h with boost, 31 m braking from 100.
- Headless Chromium defaulted to SwiftShader (~5 fps). With `--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=default` in `playwright.config.ts` it uses the real GPU on this machine (NVIDIA MX330 via ANGLE D3D11): 58.7 fps mean, p95 16.8 ms in the smoke run. Frame-time budgets are enforced only when the GL renderer is not a software rasterizer; sim-step time (< 12 ms p95) is enforced everywhere.
- Sky dome fixed at the origin for now (850 m radius); moves with the camera in M2.
- Title: "Untitled Driving Game" in the build until Marcin picks from `docs/TITLES.md`.

### Numbers at the M1 gate (this machine: NVIDIA MX330 via headless Chromium, 1280×720, DPR 1)

| Measure | Value |
|---|---|
| `npm run verify` | green (typecheck ×2, lint, 17 sim tests, build, smoke, budget) |
| Bytes before gameplay-start | 3.29 MB uncompressed (rapier 2.72, three 0.51, game 0.05, css 0.01) |
| Time to gameplay-start (smoke, no throttle) | 0.77 s |
| Perf run, 60 s bot, 4× CPU throttle | 59.3 fps mean, frame p50/p95/p99 16.7/16.8/16.8 ms, max 133 ms, sim step p95 4.9 ms |
| Draw calls / triangles | 63 mean, 89 max / 15k |
| JS heap | 15 MB |
| Build | 5 files, 3.29 MB |

### Assumptions noted

- The in-app browser pane throttles `requestAnimationFrame` to ~4 Hz while hidden, so visual checks there ran in slow motion; dynamics were validated headless instead.
- `extraGravity` (4 m/s²) applies to the car only; props fall at 9.81.

### Next (M2 The city)

- Procedural city from a seed: road graph with lanes, four districts, highway loop, chunk streaming, minimap, fog/draw distance, first quality tiers. Gate: budgets hold with the bot driving the whole map.

### Open problems

- Feel is unverified by a human. The M1 gate is Marcin's playtest; the tuning panel exists for that session.
- Perf numbers so far come from this machine's MX330 through headless Chromium; the Chromebook/low tier is unmeasured until Marcin runs `npm run perf:headed` there.
