# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-22 — M4 slice 6: level 3 (roadblocks, spikes, parked patrols, cameras, jumps)

### Done

- `sim/police/Roadblocks.ts`: at level 3+ with the pursuit active, one
  roadblock at a time at the first chokepoint 150–300 m ahead on the
  player's road (the lane under the car, then straight on or the gentlest
  turn), at least 100 m off, out of the view cone or behind a building from
  the driver's eye; two lit cars along the lane 5 m apart, a sawhorse in the
  gap, a spike strip 25 m before it across the open side. The sawhorse: −5 %
  speed, `roadblock` (bag +1,000, heat +6), the cars pull out and join the
  roster. Cleared 150 m past it, when the chase ends or the run ends;
  `retryAfter` 20 s after a clear. `raise(site)` test hook.
- The breach (`Life`): a roadblock car hit by the heavy at 80 km/h+ is
  knocked loose (`Traffic.disturb`) and the heavy takes ×0.3 damage; any
  other hit on a roadblock car is braced, ×3.5. The spike: `Life.puncture`
  sets `Vehicle.gripMul` 0.6 and `lateralPull` 900 N at the rear axle
  toward the block's side; `mend()` on a swap, a fresh car and the door.
- Parked patrols (`Police`): from level 3, four cars at the parked
  junctions nearest the player within 450 m, lit within 200 m, put there
  out of view and beyond their own 90 m sight; one that sees the player
  unparks onto its lane (`Traffic.unpark`, in place when it has a body) and
  joins the roster; below level 3 they stay dark where they are until
  nobody sees them go; they are swap candidates and count for busted.
- `cover.ts`: chokepoints (every highway lane every 75 m, and the tower
  junction's approaches, 60 m out), parked junctions (the interior grid
  nodes 300 m or more from the hideout), camera sites (seven on the
  highway's straights, three on the Crown avenue).
- `sim/city/cameras.ts`: ten cameras, poles in the chunks; the line across
  the road crossed more than 20 km/h over the limit flashes (`camera` with
  the km/h over; heat +5, bag +300 + 20/km/h), 30 s rest per camera. HUD:
  a 100 ms white flash at 60 % and FLASHED 132 KM/H; a shutter sound.
- `sim/city/jumps.ts`: twenty ramps on the park strip outside the highway
  (eight west, eight north, four east short of the quay promenade), 170 m
  apart, seed-jittered; `rampProfile` eases in over three slabs; collision
  slabs follow it and `render/RampView.ts` draws it (one mesh). `Jumps`:
  a launch off a ramp flies with the slow motion through the flight; a
  landing after 0.5 s pays `jump` (bag +400 + 200/s); STUNT! 1.1 S.
- Views: parked and roadblock bars flash (`Traffic.lights`),
  `render/RoadblockView.ts` (the striped sawhorse, the strip).
- Tests: `roadblocks.test.ts` 6.3–6.6 and `roadblocks.long.test.ts`
  6.1–6.2, `police.test.ts` 6.7–6.9, `cameras.test.ts` 6.10–6.11,
  `jumps.test.ts` 6.13–6.15, e2e 6.12 in `heat.spec.ts`. The cold open's
  bot pin (4.5) moved to `coldOpen.long.test.ts`: the quick tests had
  reached 58 s.

### Measured

- Busted in five minutes (the harness re-arms the level 10 s after each
  card), seeds 42 / 7 / 123:
  - level 1: novice 0 / 0 / 5, skilled 0 / 1 / 2;
  - level 2: novice 2 / 6 / 2, skilled 1 / 2 / 2;
  - level 3: novice 1 / 5 / 16, skilled 1 / 2 / 0.
  The 16 is the novice bot stopping in front of roadblock cars (9 blocks in
  that run) and being boxed; a player drives through the sawhorse.
- Jumps at 90 km/h: 1.1–1.3 s in the air, landing 27–31 m past the ridge,
  apex 3.6–4.5 m, upright, no damage (the single steep slab had thrown the
  muscle and the heavy to 8.6 m on their springs).
- e2e 6.12 (`?heat=3&bot=1`, 120 s, low): 1 roadblock, 84 draws, 147k
  triangles, 54 MB heap, step p95 1.0 ms.

### Decided (set here)

- The decision rule (DESIGN.md §12) does not fire: level 3's novice rate
  (median 5 in five minutes) is far above one, and even levels 1 and 2
  bust the novice (1.7 and 3.3 on average). The multipliers stay and
  cameras and parked patrols stay at level 3. Nobody tuned `balance.ts`.
- "Out of view" for a roadblock includes behind a building from the
  driver's eye: on the highway's straights nothing is outside the cone
  ahead, and a block round the corner building is not seen going up.
- The roadblock cars stand along the lane: angled across it, the gap
  between them was 0.6 m.
- The braced car half (×3.5): the plan expected the M3 traffic factor to
  wreck a car at 80 km/h; it gives 0.4 of a car's life, so a braced factor
  makes the car half the wall the design means.
- Parked junctions are all interior nodes 300 m from the hideout, not four
  (test 6.7 wants four within 450 m of the player). Parked cars appear
  beyond 90 m: one placed in view of the player pulled out at once and its
  place filled again, a unit a second.
- Cameras: 7 on the highway and 3 on the avenue; four on the avenue do not
  fit 200 m apart clear of the tower junction.
- Ramps on the park strip beyond the highway, not on park lots and pier
  ends: a jump at 90 km/h needs 60 m of clear ground and the lots are 36 m
  with trees; the strip has a clear lane the length of three sides. Drawn
  by their own view from the collision profile, not as gable statics.

### Next

- Slice 7: heavies and the Chief.

### Open problems

- The novice bot stops in front of a roadblock and is busted; the
  measurement counts it. A bot that picks the sawhorse is BACKLOG.
- The skilled bot resets 1–3 times in five minutes at level 3 (stuck off
  the road after swaps); the novice does not.
- The city tour pin (`city.long.test.ts`) now keeps the heat at 0: at up to
  115 km/h the tour crosses the new speed cameras, the heat reached level 1
  and the patrols' rams broke its impact bound. It pins the road graph, not
  a chase.

## 2026-09-22 — M4 slice 5: identity, the swap escape, the disguise, the bot policies

### Done

- `Pursuit`: the descriptor (class and paint) follows the player's car;
  `onSwap(seenNow, kind, paint)` → `lose()` when a chase was on and no unit
  saw it (idle at once, cooldown 0, an `escape` with target 1, counted in
  `swapEscapes`); `force()`; `markBlown()` and the `blown` event; the
  disguise (`descriptor.kind === 'police' && !blown`); the dispatcher's
  timer (`coverLeft`).
- `Police`: a raw line of sight per unit (`los`) beside the disguise-aware
  `seen`; `crimeSeen()`; crimes from the ring (takedowns, billboards,
  cameras) and a ram of an idle unit blow the cover when a unit sees; the
  box: the units drive the lanes to the abandoned car and take the
  arrest's slots round it (rear, sides, then front) within 20 m, the clock
  (5 s) runs while two are there, 15 s at most; then each unit near it
  pulls out 14 m past the car on its own lane before the withdraw rule;
  `enlist(agent)` for tests and slice 6's parked patrols. `driveToSlot`
  split into the slot choice and `driveTo` (the arrest's behaviour is
  unchanged).
- `Life.swap` calls `onSwap` with `crimeSeen()` and boxes the car left
  behind; `Run.endRun` clears `blown`.
- `app/botPolicy.ts`: `novice` (the road bot) and `skilled` (swaps when a
  car is alongside and no unit sees, during a chase or into any police car;
  a path that turns at every junction while the police search; boost on
  straights); `?bot=novice|skilled`. `TrackBot` no longer counts being
  boxed by police (a unit within 15 m) as stuck: its reset had teleported
  it out of every arrest.
- HUD: BORROW for a police candidate, COPS LOST YOU on every escape,
  COVER BLOWN. The player's cruiser drives with its bar lit while the
  disguise holds.
- Tests: `identity.test.ts` 5.1–5.7 (5.7 folded into 5.2), 5.8 in
  `botPolicy.long.test.ts`, 5.9 in `screens.spec.ts`.

### Measured (heat 40, traffic on, 120 s, seeds 42 / 7 / 123)

- Skilled (the plan's policy, swaps only unseen): escapes by swap 1 / 1 /
  1, by cooldown 0 / 0 / 0, in a disguise 0 of 3; busted 0 / 0 / 1; 1–2
  swaps; no resets.
- Novice: never swaps; escapes by cooldown 1 / 2 / 2; busted 1 / 1 / 0; no
  resets. The slice-3c figure (road bot at heat 2 busted 0 / 0 / 7 in five
  minutes) was taken with the reset that teleported the bot out of the box;
  slice 6's busted rates use the fixed bot.
- The exploit the §12 watch item names: a bot that takes the ramming
  unit's car in sight was disguised 114 of 120 s and chased 14 s, every
  escape in the cruiser (share 1.0 > ½). With the 30 s timer: disguised
  30 s, chased 73 / 89 / 50 s, 3 of 8 escapes in the cruiser.

### Decided (set here)

- The disguise timer is in, by the plan's own rule (DESIGN §12): 30 s from
  the theft, then COVER BLOWN. Test 5.3 now drives the cover's length and
  pins the blow-up instead of 60 s undetected.
- The box clock runs while the box is made, not from the swap: with a
  junction on the way the units need 5 s to arrive, and a box that ends as
  they get there would never show the joke.
- Units drive the lanes to the abandoned car and go straight only inside
  20 m: straight at a slot round a corner they hit the corner building.
- After a box a unit pulls out past the empty car: traffic queues behind
  an abandoned car for good, and so would the unit.

### Next

- Slice 6: level 3.

### Open problems

- Abandoned cars are never towed and traffic queues behind them for good
  (M3 behaviour). Far kinematic police stuck behind one are recycled by the
  patrol rule; civilians stay. BACKLOG.

## 2026-09-22 — M4 slice 4: the cold open on the jobs skeleton

### Done

- `sim/jobs/Jobs.ts`, the skeleton of M5 §3.3: one `delivery` kind; a 4 m
  ring starts it (`jobStart`, its heat once, the clock), arriving within
  4 m of the target pays `payout × (1 + 0.5 × remaining / limit)` through
  `jobDone` (the bag takes it in `Run`), the clock fails it (`jobFailed`);
  2 s done/failed hold; one job at a time; `Run.endRun` abandons it
  silently. `add`/`remove` for run-time defs, a `serial` for the views.
- `sim/run/ColdOpen.ts`: `start()` puts a stage-2 heavy on the `loop`
  spawn rolling at 43 km/h, heat 20, a muscle car 40 m ahead 3.2 m to the
  right held alongside by `Traffic.setGuidePlan` (the player's speed ± a
  6 m/s nudge from the gap) for 15 s; the route; its coin line
  (`Coins.addExtra`, ids after every chunk's, 116 coins); the delivery def.
  Verbs are done in any order from the ring and the keys; the caption is
  the first verb not done while its cue holds (swap: a car in reach; smash:
  the gate within 150 m; takedown: a unit within 20 m; deliver: the marker
  within 200 m). Swap gives up when the candidate goes, boost after 12 s,
  smash once the car is 20 m past the gate, takedown after 20 s. The door
  ends it; `skip()` ends it at once. No arrest and no busted while it runs.
- `sim/city/route.ts`: the lane chain (Dijkstra), junction curves, a
  smoothstep swerve through a gate, the turn into a garage, 3 m resampling
  and the door crawl; `app/doorRoute.ts` now uses it.
- UI: `ui/coldOpen.ts` captions top centre (keycaps and one word; the
  three keyless verbs a short line), `N SKIP` underneath, the key hints
  hidden meanwhile, the bottom swap prompt hidden while the caption says
  it. `render/MarkerView.ts` (ring and beacon, carOrange, unlit, pulsing),
  a ring glyph on the radar, the route's coins in the coin view.
- App: the cold open runs on a load with no `bot`, `spawn`, `heat`, `car`,
  `map` or `manual` parameter while `sessionStorage.coldOpenSeen` is clear;
  `?coldopen=1` forces it, `?coldopen=0` stops it. `KeyN` joins `Enter` on
  `skip`.
- Tests: `jobs.test.ts` 4.7–4.8, `coldOpen.test.ts` 4.1–4.6, e2e 4.9 in
  `heat.spec.ts`, and the first caption at the ten sizes in
  `screens.spec.ts`.

### Measured (seed 42, traffic on, the scripted bot of 4.5)

- Done in 89.1 s (limit 120). Captions: steer 0.0 s, swap 5.4, boost 5.5,
  smash 10.1 (the gate 150 m ahead), escape 42.0; takedown never cued (the
  pair lost the bot at 5.4 s on the diagonal at 110 km/h and was never
  within 20 m again), timed out at 42.0. Events: swap 5.5 s, billboard
  22.0, jobStart 34.4, jobDone 84.2 (6,671 with the time bonus), door 89.1,
  banked 8,671 at ×1.
- Route 1,305 m: diagonal 318 m, the gate at 381 m, the marker at 600 m,
  the door at 1,299 m.
- City startup with the cold open (20 Mbit, 4× CPU): 3.35 s to control
  (M3: 3.05 s). The world is built at the `loop` spawn when the cold open
  runs, so `start()` costs 1–13 ms in Node instead of 35–147 ms (it had
  loaded the chunks twice). Verify: 210 quick tests.

### Decided (set here)

- The route. The plan put the smash gate on the diagonal, but billboards
  keep 6.5 m off the authored roads, so there is none; and the hideout
  stands 150 m from the tower junction, so "the hideout 300 m past the
  marker" cannot hold on any loop. The route turns sharp right at the
  tower, swerves left across the carriageway through the footway gate by
  the hideout's own door (board 32, the one gate within reach before the
  marker), and goes anticlockwise round the hideout's block: the marker at
  600 m as planned, the door 700 m after it. Trees and lamps are decor
  without colliders, so the swerve only has to miss the garage wall
  (3.3 m).
- Verbs in any order, captions in order. A strict sequence would stall on
  a player who smashed the gate before swapping; the first-not-done rule
  keeps the captions in the plan's order and never asks for what is done.
- The session flag is set when the cold open starts, not when it ends: the
  DESIGN rule is "never shown twice" and 4.9 reloads mid-script.
- `skip` on `KeyN` and `Enter`: the plan said skip had no key; `Enter` was
  already bound. The caption shows N.
- No busted and no boxing while it runs: the first minute teaches verbs,
  and a novice who stops to read a caption must not meet the fine.

### Next

- Slice 5: identity.

### Open problems

- The pair rarely reaches a bot doing 110 km/h on the diagonal, so the
  takedown beat is usually skipped by its timeout. Marcin's first minute
  by hand decides whether the patrols need a head start in the cold open.

## 2026-09-22 — M4 slice 3b: coins and the spill

Marcin: work autonomously to the end of M4. Slice 3b first.

### Done

- `sim/city/coins.ts`: every lane's coins from the seed (runs of 8–12 at
  6 m, gaps 40–90 m, clear of the lane's first 10 m and last 30 m) and a
  line of 8 through each billboard along its normal; each chunk takes the
  coins inside it (`CityChunk.coins`), so a run crossing a chunk border is
  one run. `Coins.step` picks under the chassis footprint (+0.4 m) over the
  loaded chunks, one `coin` event each; `Run` adds road coins to
  `run.coins` (never the bag) and counts them for the wall.
- The spill: `Life.wreck` → `Run.spill` moves 30 % of the bag into a pool
  of 12 coins laid from 10 m at 4 m pitch along the lane that runs the way
  the wreck faced (on into the straight-through exit), 10 s to live; a
  spilled coin (`coin` target −2) pays back into the bag.
- `render/Coins.ts`: one instanced mesh of upright octagons (8 triangles,
  carOrange), spinning in the vertex shader from one time uniform (no
  matrix upload for the spin), packed and swap-removed on pickup; twelve
  bigger carWhite ones for the spill. HUD: the coin counter under the bag
  (white, an orange octagon glyph). Sfx: a blip that climbs a semitone per
  coin in a run, a six-note cascade for the spill.
- Tests: `coins.test.ts` 3.8–3.12. `brain.test.ts` 3c.2 now runs with the
  player's damage off: its 110 km/h wall slam wrecked the player too and
  the new spill took 30 % of the bag it measures.

### Measured

- Whole island: 2,999 / 3,004 / 3,026 coins for seeds 42 / 7 / 123 (about
  2,600 on lanes, 400 through the billboards); inside the plan's
  2,000–3,500.
- The road bot, 300 s, traffic on: 54–56 coins a minute (DESIGN.md §3.3
  assumed about 60), 2,710–2,820 in `run.coins`.
- Smoke: 60.0 fps, p95 16.7 ms, 98 draws (+1, the coins; no shadow pass),
  210k triangles (+17k: about 2,100 resident coins × 8). Startup 3.55 MB.

### Next

- Slice 4: the cold open prototype on the jobs skeleton.

## 2026-09-22 — M4 slice 3c: the police brain (Marcin's playtest of 3a)

Marcin played 3a: being busted took long minutes right next to the police,
the units took ages to work out what was going on, and a light touch wrote a
police car off; "go strongly into police intelligence, reactions and
capabilities". Done as slice 3c before 3b; code `98120f6`. Verify:gate green
before the docs, 203 tests (quick 197, long 6).

### Measured first (headless, heat 2, traffic and pedestrians on)

- Police wrecks in 3 × 180 s of the road bot: 6, all "disturbed, then
  failed to settle": a 2.4–5 m/s nudge took the unit out of lane control,
  and two seconds later it was still over 6 m/s or more than 4 m off its
  lane, which a chasing car always is.
- A player stopped at heat 2 at four spawns: never busted in 90 s, never
  more than one unit within 6 m. The units drove past on their lane,
  circled the block, then queued behind each other 40 m back.

### Done

- **Damage and settle** (`Traffic`): contacts dent (`damage` += (Δv − 3) ×
  0.1); one 7 m/s contact or full damage wrecks; an upright, non-spinning
  disturbed car drives back onto its path at any speed within 14 m of it
  (lean dropped); on its side, far off or tumbling past 8 s it is a wreck.
  Police armour 1.6 on every threshold, the damage and the takedown rules;
  a car wrecked by its own damage inside the takedown window is the
  player's takedown.
- **The brain** (`Police`): the arrest (slots behind, ahead and beside a
  player under 6 m/s, ray-checked, reached by free steering with a v² = 2ad
  arrival and a 5 m/s detour round the car, held; extra units stand by
  behind; busted range 6 → 7 m), the search (to the last fix, then a
  different exit per unit at the junctions there), the cut-off (from heat 2
  every second saloon routes to the player's position 4 s ahead), the
  assault (a police car hit while nobody chases: +4 heat and it sees the
  player). DESIGN.md §2.10.
- Tests: `brain.test.ts` 3c.1–3c.4, `brain.long.test.ts` 3c.5.

### Measured after

- Police wrecks in the same 9 bot minutes: 0.
- A player stopped at heat 2 (units starting 47–67 m out): two units in
  reach after 7.8–9.6 s, busted at 10.8–12.5 s, no unit faster than 6.1 m/s
  within 8 m of the player.
- The road bot at heat 2, 300 s per seed, heat back to 40 after each card:
  busted 0 / 0 / 7, escapes 6 / 10 / 5, police wrecks 1 / 1 / 2 (its rams
  now take real hits to kill a unit).
- The cut-off, A/B over 3 × 180 s at heat 2: a unit ahead of the player
  and driving at it in 11.8 % of active-chase time with it, 9.2 % without;
  busted 7 against 4. Modest; kept.
- Smoke 60.0 fps / p95 16.7 ms / 97 draws / 193k tris, unchanged.

### Decided (set here)

- The arrest slots are reached by free steering, not by the lane follower
  (ARCHITECTURE decision 32): on the lane the units queued behind each
  other and never reached a slot ahead or beside.
- Busted's range 7 m: a unit parked on a slot stops up to `arrest.arrive`
  (1.2 m) short of it, so the front and rear slots sit at 5.6–6.8 m.
- `police.test.ts`'s detection pin with a stationary player on the highway
  now ends in the arrest that player earns: it checks detection and the
  closing distance at the moment the pursuit goes active, then requires the
  busted card within 20 s. The heat-0 half is unchanged.
- The slice-5 `box` name stays for the units boxing an abandoned car; the
  arrest is `arrest`.

### Next

- Marcin plays it; then slice 3b (coins and the spill).

### Open problems

- 11–12 s from a stop to busted at heat 2 is my number; whether it reads as
  fair or as a trap is Marcin's (`POLICE.arrest.playerSpeed`,
  `POLICE.busted.seconds`).
- A slow junction turn at heat 1–2 (under 22 km/h) starts the arrest; the
  release at 32 km/h keeps it from flickering, but a player who crawls a
  corner in a queue may be boxed. Watch item in DESIGN.md §12.

## 2026-09-22 — M4 slice 3a: the run, the door race, busted

Verify green before the first edit (after the consistency pass) and at both
commits: quick set 184 → 193 tests, long pins 198. Commits `7cf4c97` (sim)
and `deec5cf` (render, UI, app, audio, e2e); the first one's message says
194 tests, one of which was a scratch probe left in `tests/_scratch` for the
run; the slice's count is 193.

### Done

- **The run** (`src/sim/run/Run.ts`). Its own cursor into the event ring
  pays the bag per `BALANCE.bag`: billboard 500, camera 300 + 20 per km/h
  over, takedown 800 or 1,500 for a police record (by `Traffic.police`, not
  the class), roadblock 1,000, escape 500 × level, jump 400 + 200 per second
  of air; the camera, roadblock and jump producers land in slice 6.
  `maxHeat` moves only on steps with the pursuit `active`. Busted: two live
  police cars within 6 m, heat ≥ 1, the player under 1.39 m/s for 3 s; the
  bar drains at 0.7/s; half the bag banks with no multiplier. The door:
  inside an entry box under 8 m/s starts a 3 s close, the player still
  driving; the car's centre back over the door line cancels it; busted is
  evaluated first (a tie goes to the police); the door shuts only with the
  whole chassis inside the line. Banking: bag × `multiplier[maxHeat]`, best
  run, heat and pursuit reset, `door` and `banked` events, one roller-door
  collider moved to that drop-off and enabled. `openDoor()` turns the car to
  face the street; `closeCard()` drives on where the player stands; after
  either, the entry boxes re-arm only once the car has left them. The wall's
  counts (takedowns, escapes, billboards, coins) reset at each new run.
- **Three garages** (`src/sim/city/cover.ts`): the hideout beside the Crown
  Tower (Crown Heights, the street west of the tower block), the scrapyard
  beside the Waterworks (Sunset Works) and the Coral Hotel garage (Coral
  Quay, the street north of the hotel), each built by `City.generate` on an
  ordinary lot instead of that lot's building, after the lot's random draw:
  14 × 20 × 6 m, concrete walls tagged `building`, a graphite roof, a
  concrete floor, an 8 m opening with a carOrange band over it, a warm strip
  light; lamps and trees stay out of the doorways. `coverSites(city)` gives
  each its approach lane (the kerb-side lane past the door).
- **Police**: `unitsWithin(x, z, range)` counts live police records (units,
  parked patrols, roadblock cars; never a wreck, a taken car or a civilian);
  at heat 0 the roster stands down (drives away, released once 120 m away
  and out of view), so a heat-5 roster never answers the next heat-1 crime;
  `dispatching` is a test hook. **Traffic**: `AgentState.Parked` appended,
  `spawnParkedPolice(x, z, yaw, kind)`: a stopped, solid police car.
- **Presentation**: `render/HideoutView.ts` (the roller doors unroll with
  the door's progress, hidden while up), a held camera cut from the garage's
  back corner past the car and out through the opening during the race and
  behind the shut door (`ChaseCamera.cut / releaseCut`), `ui/run.ts` (the bag
  under the stars with the live multiplier, the busted bar, the busted card,
  the wall), the three garages on the radar as glyphs that clamp to the rim,
  the swap prompt hidden during those breaks, the door's thud and busted's
  two-note fall. `App`: `gameplayStop/Start` follow the run's edges (a user
  pause during a break adds no bracket), keys ignored for 0.6 s, measured
  bot runs dismiss breaks after 1.5 s, `?bot=door` drives the road bot to
  the hideout on its own lane path (`app/doorRoute.ts`, `TrackBot.setPath`).
- **Tests**: `run.test.ts` 3.0 (placement clear of every neighbour taller
  than 0.3 m and a 4 m apron, seeds 42/7/123, approach lane kerb-side and
  parallel) and 3.1–3.7; `police.test.ts` 3.13; `e2e/heat.spec.ts` 3.14
  (`npm run heat`); the screens spec captures the busted bar, the card and
  the wall at all ten sizes (3.15, extended).

### Measured

- **The acceptance run** (headless, traffic and pedestrians on): the road
  bot 300 s from heat 0, then routed to the hideout. Seeds 42 / 7: bag 0
  (the road bot commits no crime: 16–22 hits, no takedown, no billboard),
  the hideout reached 129.8 / 99.1 s later over 1.2–1.5 km of lane path,
  banked 0. Bag per minute 0 is this bot's honest number and useless for
  M5's `BALANCE.measured`: slice 5's skilled policy is the probe that earns.
- **The same from heat 2** (four units, one interceptor), seeds 42 / 7 /
  123: 190–220 s of the 300 in an active pursuit, 3–4 escapes, **0 busted in
  15 bot-minutes**; bag 3,000–4,000 (600–800 a minute, all escape bounties).
  To the hideout: 132.6 s (a fifth escape on the way, banked 6,250 at
  ×1.25) and 61.6 s (banked 5,000); seed 7 never arrived inside 240 s (12
  stuck resets and two wrecks under the rams). The DESIGN §12 worry holds so
  far at level 2; slice 6 measures levels 1–3 with both policies and applies
  the decision rule.
- **The door bot** from five spawns (crown, city, foundry → scrapyard,
  marina → hotel): 25 to 79 s to the shut door, no resets, no damage.
- **Timings pinned**: closing to shut 180 steps (3.0 s); the tie busted on
  step 180; the bar 3.0 s; the drain 0.7/s.
- **Smoke**: 60.0 fps, p95 16.7 ms, 97 draws, 193k tris, the slice-2
  baseline (a door is drawn only while it moves; the plan's +1 draw is
  therefore 0 at rest). Startup 3.53 MB (+0.02).

### Decided (set here)

- **Busted needs heat ≥ 1, not a pursuit state.** Two cruisers within 6 m
  see the player by construction, the pursuit's sight is sampled every six
  steps, and parked police (roadblocks, junction patrols) are not pursuit
  units. A wanted player who stops between two police cars is busted; the
  bar shows it coming.
- **Garages on ordinary lots**, after the lot's random draw, so the stream
  and the rest of the city are unchanged; the scrapyard is beside the
  Waterworks, not in a yard on the service road (the yards' containers and
  fences make a clear footprint a search; a lot is clear by construction).
- **14 × 20 m with an 8 m door** (the plan said 12 × 20 and 6 m: a 6 m door
  off a 24 m street at a right angle under sirens is a needle's eye), and an
  **entry box of 9 × 16 m** around the garage centre (the plan's 6 × 8 m would
  let a car pulling in at 29 km/h roll out of it before it stops).
- **`openDoor` turns the car** to face the street: nobody reverses out of a
  box. **The entry boxes re-arm** only after the car has left them: without
  it the door dropped again the moment it opened, and after a busted card on
  a doorstep it dropped on an empty bag.
- `hideoutStatics` returns everything but the door: the door slides, so the
  view draws it and the run owns its one collider.
- The chokepoints, parked-patrol junctions and camera sites of `cover.ts`
  land in slice 6, where they are used and pinned, not here unused.
- The radar shows the garages now: the hideout must be findable in a chase
  before M5's arrow exists.
- Test 3.3's too-fast case is 50 km/h: coasting 14 m over the kerb brings a
  35 km/h car under 8 m/s before the box.

### Next

- Slice 3b: coins and the spill.

### Open problems

- The garage interior reads dark: the roof's underside gets only the
  hemisphere's ground colour. Marcin's eye decides; a lighter ceiling is one
  colour.
- The road bot's stuck reset teleports it to the city spawn, which under a
  pursuit is a free escape for the bot; slice 5's policies should not
  inherit it.

## 2026-09-22 — Docs consistency pass before slice 3a

Marcin asked for a full read of the documentation, then what to do about the
inconsistencies it turned up. Fixed in one commit before slice 3a.

### Decided (set here)

- **The door race keeps control.** M4 D6 zeroed the controls for the 3 s of
  `closing` while the busted bar kept filling: 3 s without control breaks
  brief §3 and removes the break-out moment D4 promises. Now the player
  keeps the wheel, reversing back over the door line cancels the closing,
  busted is evaluated before the door on every step (a tie goes to the
  police), and the door shuts only with the whole chassis behind the line.
  `BALANCE.door.stopSpeed` 2.2 (the slice text said 8 m/s) becomes
  `enterSpeed` 8. M4 D6, §3.3, §3.4, slice 3a, tests 3.3 and 3.4 (with a
  bail-out case), the §8 trap, playtest step 5; DESIGN §2.3.
- M4 §3.2 gains `jumps.step` (slice 6) and `jobs.step` (slice 4), the latter
  before `run.step` so a delivery to a drop-off pays before the door can
  abandon the job; M5 §3.2 now copies M4's order instead of an older one.
- The traffic cost pin measures the best of three 1,200-step windows, the
  remedy the previous entry named. Second flake at session start: 3.75 ms
  inside the full parallel suite, passing alone.

### Done

- DESIGN: §2 intro and §2.2 match the revised §2.3 and §2.6 (any door,
  pursuit or not; the multiplier by the heat at which the police had you);
  §3.2 heat 4 shows the heavies, the helicopter is update 1; §6.1 without
  reputation gates, the highway as two lanes each way; cover and the
  full-screen map tagged update 1 and 2.
- ARCHITECTURE: decision records unique and in order (M3's duplicate 23 and
  24 are now 29 and 30), the inline M2 city decisions renamed C1–C8 so
  "decision 14" means one thing; six gears, 226 lanes, police and heat in
  the step line.
- BACKLOG: lines already done or now scheduled removed (the highway lanes
  twice, the chokepoint sites, the per-tier traffic lever, the radar on
  touch, the billboard save, the traffic profile), stale tags corrected.
- STYLE: five designs; civilian traffic stays three silhouettes (sports and
  police only as units). CRAZYGAMES: A5 points at DESIGN §3.4, sizes 3.51 MB.
  M6_PLAN: two drafting fragments rewritten (DisabledPlatform's name, T15).
  M5_PLAN: the three fences for the six orders.

### Next

- M4 slice 3a, on Marcin's signal.

## 2026-09-22 — Design talk, part 4: the brief's and DESIGN's decisions

Marcin: "and what about the brief's and design's decisions?" A pass over
the six fixed decisions of brief §3 (left alone, every one has held up in
the build) and the decided sections of DESIGN. Four items; he said to
write them in.

### Decided (Marcin, on my assessment)

- **The multiplier counts the highest heat at which the police had you,
  not the highest reached.** The disguise had made "reached" exploitable:
  a cruiser, unseen billboards and cameras, heat 5 with no chase, ×3 at the
  door. Now `Run.maxHeat` moves only on a step with the pursuit `active`,
  and the HUD's multiplier pops when the stars pulse red at a new level.
  DESIGN §2.6, M4_PLAN D3, the `Run` contract, slice 3a and test 3.2.
- **The door is an escape again, as the brief says, with a 3 s race.**
  Every drop-off always opens; the car stops in the entry box, the door
  takes `door.closeSeconds` to shut, and busted stays live until it does:
  two units at the threshold before the door is down and the run ends on
  the doorstep. The earlier rule ("entry needs no active pursuit") turned
  every door into a skill check a novice at heat 3 could fail forever. This
  changes DESIGN §2.3 (Marcin's decision, revised by him). M4_PLAN D6, the
  `closing` state, slice 3a's door bullet, tests 3.3 and 3.4, `BALANCE.door`.
- **Dailies are in the launch minimum, not conditional.** My own deviation
  reversed: the brief lists them in v1 and they are the one D1 lever; the
  day-7 topper is what may slip. DESIGN §11, M5_PLAN §1.1, slice 6, §7.
- **Every drop-off has the same wall.** Banking at the scrapyard or the
  hotel garage shows the totals and, from M5, the garage pages; the idle
  arrow points at the nearest drop-off, not only the hideout. DESIGN §6.3,
  M5_PLAN D9, `idleTarget`, slice 1, slice 4.

### Left alone, on purpose

Brief §3's six fixed decisions; the heat ratchet; the fine at half; coins
always kept; the swap out of sight ending the pursuit (slice 5 measures it
before anyone touches it).

### Next

- Unchanged: M4 slice 3a, now with the `closing` state and the door race.

## 2026-09-22 — Design talk, part 3: ten improvements to the game and the plans

Marcin: "let's think whether the game and the plans can be even better",
then "execute". Ten items, all done in this session; none changes a brief
or DESIGN decision.

### Decided (Marcin, on my list)

- **Stunt jumps back in v1**: twenty ramps placed by the generator on park
  lots and pier ends, airtime into the bag with the M3 slow motion, in M4
  slice 6 beside the cameras (the same placement machinery). The hunt with
  its counter stays update 2. DESIGN §4, M4_PLAN slice 6, `BALANCE.jumps`.
- **The idle arrow**: between jobs the Crazy Taxi arrow points, dimmed, at
  the nearest marker, and at the hideout once the bag is above the door
  offer's threshold. M5 slice 1, `Jobs.idleTarget`.
- **The live multiplier beside the bag** on the HUD, and **BORROW** instead
  of SWAP when the swap candidate is a police car. M4 slices 3a and 5;
  STYLE.
- **The daily police seed** was in DESIGN §8 and had dropped out of M5: the
  roadblock, parked-patrol and camera site orders come from the date's
  hash; jobs, coins, ramps and the city stay fixed. M5 slice 6 with the
  dailies, `?date=` for tests.
- **One line of run counts on the wall** under the totals (takedowns,
  escapes, billboards, coins; jobs join in M5). M4 slice 3a.
- **M4 slice 3 split** into 3a (run, door, busted, the hideout, `cover.ts`)
  and 3b (coins and the spill): two commits, two measurements.
- **The bot policies exist as work now**: `app/botPolicy.ts` with `novice`
  and `skilled`, sized at about a day in M4 slice 5, because three
  measurements (slices 5 and 6, the M5 balance script) assumed them and
  nothing had sized them. `?bot=novice|skilled`.
- **The jobs skeleton lands in M4 slice 4** (one delivery kind, marker →
  target → bag, the timer) and the cold open uses it; M5 slice 1 extends
  the same class instead of building the marker twice.
- **Test tiers**: bot-driven or traffic-pool pins over about 10 s of wall
  time live in `tests/**/*.long.test.ts`, excluded from the quick
  `npm run verify` and run by `npm run verify:gate` (`LONG=1` through
  `tools/verify.mjs --gate`) and `npm run test:long`. Moved: the city tour,
  the two bot-driven police pins, the two traffic drives. Quick set 184
  tests in 37 s (was 189 in 49–51 s); the five long pins 21 s. The rule is
  in CLAUDE.md, AGENTS.md, README and the three plans' gate criteria.
- **PROGRESS archived**: the 1,161 lines from the M3 gate back to M0 are in
  `docs/history/PROGRESS_M0-M3.md`; this file holds M4 and the design
  talks. Rule in CLAUDE.md: archive at each gate.

### Done

- Code: `tests/sim/city.long.test.ts`, `police.long.test.ts`,
  `traffic.long.test.ts` (the moved cases, unchanged in substance);
  `city.test.ts`, `police.test.ts`, `traffic.test.ts` trimmed with their
  headers updated; `vite.config.ts` excludes `*.long.test.ts` unless
  `LONG=1`; `tools/verify.mjs --gate`; `package.json` scripts
  `verify:gate`, `test:long`. Lint and both typechecks green.
- Docs: M4_PLAN (§1.2, §3.1, §3.3 the `Jumps`, `Jobs` skeleton and
  `BotPolicy` contracts, §3.4, slices 3a/3b/4/5/6, §6.1, §7); M5_PLAN
  (§1.2 rows, `idleTarget`, slice 1, slice 6 the daily seed with test 6.0,
  slice 7, §5.1, §5.5, §7); M6_PLAN (§5.5, §7); DESIGN (§2.5, §2.9, §4, §8,
  §11); STYLE (the run HUD, coins and ramps section); CLAUDE.md, AGENTS.md,
  README.

### Next

- Unchanged: M4 slice 3a.

### Open problems

- The cost pin `steps a full pool in under 3 ms` (`traffic.test.ts`) read
  3.59 ms once inside `npm run verify` right after lint, with 25 vitest
  workers up, and 0.6–0.8 ms alone; the rerun of the whole verify passed.
  It is a wall-clock pin and the split changed which files share the CPU
  with it. Not loosened. If it flakes again, make it measure the best of
  three windows rather than one mean, which is the same claim with less
  noise.
- Only Marcin: `npm run perf:headed` on the laptop (owed since the M3 gate)
  and the title.

## 2026-09-22 — Contracts for M5 and M6

Marcin asked whether every remaining milestone should have a plan at
M4_PLAN's level. Recommended and done: M5 and M6 now, the update plans
after the first Basic Launch numbers (update 1 already has its contract in
`docs/M4_PLAN.md` §5). Docs only.

### Done

- `docs/M5_PLAN.md`: the launch minimum. Ground rules (headless save format
  with app-side IO, one key, migrations, 32 kB guard; one ad per door; the
  offers' rules), the inputs M4 still has to measure (bag and coins per
  minute, busted rates per level, the cold open route), the layout, nine
  slices: save and prices; jobs framework with the arrow and delivery;
  steal-to-order with the traffic guarantee; pursuit escape; the garage
  with the offers; the cold open finished on the save; dailies and the
  streak (ships if it fits); the balance script as `npm run balance` with
  the bot as the capture probe and three assertions; the UI and audio pass
  and the gate. Numbers table, playtest.
- `docs/M6_PLAN.md`: the platform. Ground rules (script-tag SDK, `init`
  first, a 3 s timeout to a no-op adapter, the docs re-read before the
  adapter), the layout, seven slices: the SDK re-read and
  `CrazyGamesPlatform`; the compliance sweep and the hand-obfuscated
  sitelock, account scenario 1; touch as an `InputDevice` over a pure,
  Node-tested model; the mobile tier with the traffic lever, safe areas,
  the rotate overlay, the 20 MB budget row and a mobile perf proxy; ads and
  data end to end in the Preview tool; the submission package script and
  `docs/SUBMISSION.md` with the cover brief; the gate. Numbers, playtest.
- Pointers: `CLAUDE.md` (session start, the table), `AGENTS.md`, README,
  DESIGN §11, ARCHITECTURE layout.
- Rewritten the same day at `docs/M3_PLAN.md`'s level on Marcin's request
  ("more detailed and more precise"): both plans now carry the working
  rules, scope in / out / delivered-by-the-previous-milestone, numbered
  decisions with reasons (M5: D1–D14, M6: D1–D11), the module map, the
  step or boot order, TypeScript contracts for every new module (the save
  format and store, jobs, the traffic guarantee, the garage, dailies, the
  arrow and markers, the garage UI; the SDK typings, the adapter ladder,
  the sitelock, the touch model and device, the layer and the overlay),
  the balance and tuning objects with starting values, per-slice files /
  behaviour / numbers / numbered tests / acceptance, the verification
  protocol with expected perf deltas, a budgets table, gate criteria, the
  API facts checked against the code at `ba9a12f` (M6's SDK facts from
  the 2026-09-20 read, to be re-verified in its slice 0), the playtest
  script and the reviewer checklist. 46 numbered tests in M5, 34 in M6.
- `docs/M4_PLAN.md` rewritten the same way on Marcin's "and M4?": slices
  0–2 kept as the record with their measurements, decisions D1–D17 with
  reasons, the module map, the step order, contracts for `Run`, `Coins`,
  `cover.ts`, `ColdOpen`, the `Pursuit` and `Police` additions,
  `Roadblocks`, `Cameras`, the `Traffic` `Parked` state, `ui/run.ts` and
  the camera cut; the balance and police tuning additions with values;
  slices 3–8 with files, behaviour, numbers, 60 numbered tests and
  acceptance; the verification protocol with the bases and expected
  deltas; budgets; gate criteria; API facts checked against `6b52d03`;
  playtest; reviewer checklist. §5 (update 1) unchanged. Two things set
  there: after busted the run restarts in place (no teleport), and the
  sawhorse is a pass-through trigger like a billboard while the roadblock's
  cars are parked units with bodies.

### Set here (Marcin overrides)

- The launch catalogue is the five bodies that exist (muscle starter,
  compact, heavy, sports, police); Muscle Pro, GT and the ice-cream truck
  need new profiles and are update 2. The brief's eight vehicles become five
  at launch; it follows from the launch-scope decision.
- The balance script is a vitest file run by `npm run balance`, outside
  `verify`, and it steps the sim headlessly for its capture rates instead of
  taking them from a table.
- Account scenario 1 (no accounts) at launch; the SDK migrates guest data on
  login by itself.
- Time limits for jobs come from the lane-path time at the speed limits, not
  from a table, so a job stays fair wherever the generator puts it.
- M6: the adapter ladder CrazyGames → Local → Disabled with a 3 s timeout;
  a mock SDK injected by Playwright as the test double for every path; the
  touch layer as an `InputDevice` over a pure model; the mobile tier as
  rendering plus the one traffic lever; landscape only with a rotate
  overlay; the sitelock obfuscated by hand; the mobile perf proxy at
  800×450 under 6×; the package built by a script that can fail; English
  only at launch with the locale logged.

### Next

- Unchanged: M4 slice 3 (`docs/M4_PLAN.md`).

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

---

Older entries (M0 through the M3 gate, 2026-09-20 to 2026-09-22) are in
`docs/history/PROGRESS_M0-M3.md`.
