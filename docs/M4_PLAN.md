# M4 "Heat" — implementation plan

Executor: the agent working M4 now (slices 0–7 are done; 8 is next).
Reviewer: Claude, at the gate. Director and playtester: Marcin. This
document is the milestone contract: what to build, in which order, with
which numbers, and what "done" means; each fixed decision carries its
reason. First written 2026-09-22 as a slice list; revised the same day after
the design talk (coins into slice 3, the cold open as slice 4, the disguise
and the spill added, cover / overpasses / the helicopter moved to update 1,
§5) and then rewritten at `docs/M3_PLAN.md`'s level against commit
`6b52d03`, with slices 0–2 kept as the record of what was measured.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§3 fixed decisions, §4 heat, §6 budgets, §7 ads, §8 verification, §10),
`docs/DESIGN.md` (§2 the run in full, §3.2 coins, §5, §6.3–6.6, §8, §9,
§11, §12), `docs/PROGRESS.md` (the three M4 entries and the design-talk
entries), `docs/M3_REPORT.md`, `docs/ARCHITECTURE.md` (decision records 12–30),
`docs/STYLE.md` (police, the interceptor, the hideout), `docs/CRAZYGAMES.md`
(sections 3, 10, 11), then this file. Run `npm run verify`; green before the
first edit (189 tests at `6b52d03`).

## 0. How to work on this milestone

- **Language, cadence, autonomy, scope, honesty, research, perf** as in
  `docs/M5_PLAN.md` §0: one slice at a time, commit per slice with verify
  green and the measurement in PROGRESS, decide and note rather than ask,
  never loosen a pin, check installed types, alternate builds before
  calling a perf regression, nothing else rendering during a measured run.
- **Sim stays headless**: heat, pursuit, police, the run, coins, the spill,
  roadblocks, cameras and the cold open script live in `src/sim/` with no
  Three.js and no DOM. Render, UI and audio read state and poll the ring.
- **No per-step allocation in the police loop, the run step or the coin
  test**: pool slots, typed arrays, one `RAPIER.Ray` per system, bound
  visitors.
- **Every number lives in `src/sim/balance.ts` (money, heat, the spill,
  coins) or `src/sim/police/tuning.ts` (units, sight, rams, busted,
  roadblocks, cameras, heavies, the Chief).** Both in the dev panel.
- **Police borrow the body pool with a hard share** (decision 28); nothing
  in this milestone adds a Rapier body except the hideout door collider.
- **Marcin plays every slice by hand; his feel notes outrank any number
  here.** `?heat=1..5` and `?spawn=crown` are the playtest entry points.

## 1. Scope

Brief §9: *"M4 Heat. Police AI, five heat levels, escape and respray,
busted and wrecked flows, ad-break points wired through the adapter."*
DESIGN.md adds the run (heat as a ratchet, pursuit as a state, bag and bank,
the hideout door), coins, the spill, the identity rule and the disguise, the
cold open prototype; and removes cover, overpasses and the helicopter to
update 1 (§5).

### 1.1 Done (slices 0–2, the record)

| Slice | What | Measured (PROGRESS 2026-09-22) |
|---|---|---|
| 0 housekeeping | wreck tow-away; `sports` and `police` presets, profiles, traffic kinds; real highway lanes (226); the step profile by phase; latched taps; screens polling | traffic 1.55 ms mean / 3.0 p95 per step under 4×; smoke 60.0 fps / p95 16.7 / 97 draws / 196k tris; city 3.05 s to control |
| 1 heat and pursuit | `Heat` ratchet from the ring; `Pursuit` idle → detected → active → lost → idle; level-1 pair as traffic agents with a plan; sight rays; spawn out of view; stars; livery and light bar | bot at heat 1, 120 s: 23 % in pursuit, 2 escapes, 1 ram, first unit at 0.02 s, never in the view cone; Node step 0.62 ms |
| 2 units per level | budgets 2/4/5/6/8, interceptors 0/1/2/2/3; the police-first lender with a hard share; rams and the PIT; catch-up speed; patrol recycling | level 2 → 4 units / 1 interceptor, level 5 → 8 / 3; peak police bodies 2 / 3 / 6 with 41–44 civilians alive; a shove costs no speed and 0.7 m, a PIT 5.8 m and 0.48 rad/s; Node step 0.64–0.91 ms at every level |
| 3a the run | `Run`: bag, bank, `maxHeat`, the door race (control kept, bail-out, busted first), busted and the fine; three garages on generator lots; the roster stands down at heat 0; the wall, the card, the bag on the HUD; `?bot=door` | road bot from heat 0: bag 0, hideout in 99–130 s; from heat 2: 0 busted in 15 bot-minutes, 600–800 bag a minute, banked 5,000–6,250; smoke 60.0 fps / 97 draws unchanged |
| 3b coins and the spill | `Coins`: runs along every lane and a line through each billboard from the seed, picked by the footprint into `run.coins`; the wreck's spill (30 % of the bag, 12 coins, 10 s) paying back into the bag; the shader-spun instanced view; the counter | island 2,999–3,026 coins; road bot 54–56 a minute; smoke 98 draws / 210k tris |
| 3c the police brain | traffic damage and a settle that forgives a nudge; police armour; the arrest (slots round a slow player), the search at the last fix, the cut-off from heat 2, the assault heat (DESIGN.md §2.10) | police wrecks in 9 bot minutes 6 → 0; a player stopped at heat 2: never busted in 90 s → busted at 10.8–12.5 s, units arriving at ≤ 6.1 m/s; road bot at heat 2 busted 0 / 0 / 7 in 5 min by seed; a unit ahead and closing 9.2 → 11.8 % of chase time |
| 4 the cold open | `Jobs` skeleton (one delivery kind); `ColdOpen`: the van at heat 1, the candidate held alongside, a 1.3 km route round the hideout's block through a billboard gate with its coin line and the marker at 600 m; verbs in any order, captions in order with cues and timeouts; skip on N; the session flag; `sim/city/route.ts` | scripted bot done in 89.1 s: swap 5.5 s, gate 22.0, marker 34.4, door 89.1; captions steer 0.0, swap 5.4, boost 5.5, smash 10.1, escape 42.0 (takedown never cued: the pair lost the bot at 5.4 s) |
| 5 identity | the descriptor; a swap nobody saw loses the police and they box the car left behind, then pull out and withdraw; the disguise with BORROW, the lit bar, COVER BLOWN and the dispatcher's 30 s timer; `novice` and `skilled` bot policies; the road bot no longer resets out of an arrest | skilled at level 2, 120 s: 1 / 1 / 1 escapes by swap, 0 by cooldown, 0 disguises; novice busted 1 / 1 / 0; the in-sight cruiser exploit disguised 114 of 120 s → 30 s with the timer |
| 6 level 3 | roadblocks at chokepoints ahead and out of view with the sawhorse, the braced car half and the heavy's breach; spike strips (grip, pull, mend); four parked patrols near the player; ten speed cameras with the flash; twenty stunt ramps on the park strip with the slow motion | busted per 5 min at L1 / L2 / L3: novice 0–5 / 2–6 / 1–16, skilled 0–2 / 1–2 / 0–2 (the rule does not fire); jumps 1.1–1.3 s; e2e heat 3: 84 draws, 147k tris |
| 7 levels 4–5 | heavies (half the roster from level 4, a corner shove) and the Chief (level 5, a leading PIT, kept through the chase, replaced 16 s after a wreck); the heavy and Chief liveries; the siren bed | busted per 5 min at L4 / L5: novice 2–7 / 3–10, skilled 1–7 / 0–3; heat 5 in the browser 57.1 fps, step p95 6.8 ms, 110 draws |

### 1.2 In scope (gate-critical, §4 slices 3–8)

3. The run, in two commits: 3a bag, bank, `maxHeat`, the drop-offs and the
   hideout door with the wall totals, the live multiplier on the HUD and the
   run's summary line, busted with the bar and the fine; 3b coins and the
   spill.
4. The cold open prototype: the first run scripted on a minimal `Jobs`
   (one delivery kind, which M5 extends), the swap as the second verb,
   captions, skippable, once per session.
5. Identity: the pursuit descriptor, a swap out of sight ends the chase and
   the units box the old car, the disguise in a police car with the BORROW
   prompt, the bot policies (novice, skilled) that three measurements use,
   the heavy as a roadblock breacher (with slice 6).
6. Level 3: roadblocks with a sawhorse weak point, spike strips, parked
   patrols that join on detection, speed cameras, the twenty stunt jumps;
   the busted-rate decision rule.
7. Levels 4 and 5 on the ground: heavy units and the Chief.
8. Ad points through the adapter at the door and the busted card, polish,
   the gate.

### 1.3 Out of scope

Covered streets, overpasses, the helicopter (§5, update 1); jobs, the
garage, save, dailies, the finished cold open (M5); the SDK adapter and
touch (M6); pursuit breakers, the donut shop, the news ticker, the wanted
poster (polish only if slice 8 has the budget; else BACKLOG); any new
dependency; any change to `docs/BRIEF.md`.

### 1.4 Fixed by the brief and still binding

As `docs/M5_PLAN.md` §1.4, plus: pedestrians can never be hit; police are
comic; the takedown slow motion ≤ 1.5 s and skippable; the respawn rolls;
`R` resets to the nearest road (under pursuit: within line of sight).

## 2. Decisions (fixed for M4; each with its reason)

D1. **Heat is a ratchet and pursuit is a state** (DESIGN.md §2.1; built in
slice 1). Reason: escaping stays a verb performed every couple of minutes;
the run still escalates; the stars never lie.

D2. **The run's money is three things: coins, bag, bank.** Coins are the
player's the moment they are picked; the bag is at risk until the door; the
bank is safe. Reason: DESIGN.md §3.2; a twelve-year-old's money is never at
risk and the strategist's is.

D3. **The door pays `bag × multiplier[maxHeat]` where `maxHeat` is the
highest level at which the pursuit went `active`; busted pays `bag ×
fine`; a wreck spills `spillShare` of the bag as coins for ten seconds.**
Reason: DESIGN.md §2.2 and §2.6 (revised 2026-09-22): the bet is the
multiplier; half at ×1 keeps the beginner; the spill is the risk that does
not need the police to be real; and a level nobody saw you at must not pay,
or the disguise turns unseen crime into the best strategy.

D4. **Busted is a bar, not an instant.** Two units within `bustedRange`
and the player under `bustedSpeed` for `bustedSeconds` fill it; movement
drains it. Reason: brief §3 (there is always a moment to break out) and the
comic arrest of DESIGN.md §2.4.

D5. **After busted the run restarts in place.** The fine is paid, heat 0,
the units go off duty, the player keeps the car and drives on. Reason: no
teleport, no loading, control back inside two seconds after the card.

D6. **The hideout is a static box with one enabled/disabled door collider,
the door always opens, it takes `door.closeSeconds` to shut with busted
live, the player keeps control while it closes, and the shut door is a
game-made break.** Inside the entry box under `door.enterSpeed` →
`closing` for 3 s: the player drives as always (brakes to a stop, or
reverses out), the bar fills if two units reach the car, and the chassis
crossing back out over the door line cancels the closing and raises the
door; shut → the collider enabled, `gameplayStop()`, the totals; any key →
the collider disabled, `gameplayStart()`, heat 0. Busted is evaluated
before the door on every step, so a tie goes to the police. Reason:
DESIGN.md §2.3 (revised 2026-09-22, back to the brief: reaching the shop is
an escape) and §2.9; brief §3 (control is never taken away for more than
2 s, and D4: there is always a moment to break out, which zeroed controls
under a filling bar would remove); a results screen is a break the
platform expects (`docs/CRAZYGAMES.md` A1); one collider is the whole
physics cost; the 3 s is the run's climax.

D7. **Coins are placed by the generator and picked by the chassis
footprint.** Per chunk like the billboards, drawn as one instanced mesh,
picked ids zero-scaled. Reason: decision 20's machinery already exists;
coins in the chunk data cost nothing at boot.

D8. **The spill lands on the lane ahead.** Twelve coins from 10 m at 4 m
pitch along the nearest lane in the wreck's direction, ten seconds. Reason:
both a swap and the rolling respawn (which rolls out on the nearest lane)
drive through them; a ring around the wreck would be behind the respawn.

D9. **The cold open is a script in the sim with captions in the UI, and
the swap is its second verb.** Reason: DESIGN.md §2.8 and §6.6: conversion
is decided in the first 20 s and the swap is the one thing nobody else has.

D10. **The pursuit holds a descriptor, and a swap out of sight ends it.**
Class plus paint, plus the last known position; a `swap` with no unit in
line of sight clears it and the units box the abandoned car for
`boxSeconds`. Reason: DESIGN.md §2.5; the rule explains itself through the
fist-shaking driver.

D11. **The disguise is one condition in detection.** A police-liveried car
with `blown === false` is not detected; a crime with a unit in sight sets
`blown`. Reason: DESIGN.md §2.5 (decided 2026-09-22); the best joke in the
game costs one boolean.

D12. **A roadblock is two parked units and a pass-through sawhorse.** The
cars are `Parked` police agents with bodies (a wall for everyone but a heavy
at `breachSpeed`); the sawhorse is a billboard-style trigger with a 5 %
speed loss and debris, no collider. Reason: a solid sawhorse is a wall at
highway speed (decision 20's argument); the weak point must be a skill
check, and a heavy must have a reason to exist.

D13. **Spike strips are a grip multiplier and a pull, healed by a swap or
the door.** Reason: brief §4 (a swap is a tactical move); a flat tyre
that lasts the run punishes the beginner twice.

D14. **Parked patrols are units in the `Parked` state.** Stopped, lights
on, swap candidates (the disguise), joining on detection by becoming a
normal unit on the lane they sit beside. Reason: decision 26 (police are a
planner over traffic agents); a parked unit is the same record with a flag.

D15. **Speed cameras are statics with a footprint trigger.** Reason: the
same as D7; a camera is a billboard that pays heat instead of boost.

D16. **Levels 4 and 5 ship on the ground.** Heavy units from 4, the Chief
at 5, the cooldown as the escape. Reason: DESIGN.md §5 (decided
2026-09-22): the helicopter, cover and overpasses are update 1.

D17. **Ad points use the `Platform` interface as it exists.** `requestAd
(type): Promise<AdResult>` and `onAdEvent` are already there (M0); the
work is the calls at the door and the busted card, the input block and the
mute. Reason: nothing in the SDK facts needs a different shape; changing
the seam now would touch `LocalPlatform` and every test for nothing.

## 3. Architecture

### 3.1 Modules (added or changed by slices 3–8)

```
src/sim/balance.ts             + bag, multiplier, fine, spill, coin, firstDoor (§3.4)
src/sim/events.ts              + 'coin' | 'spill' | 'banked' | 'busted' | 'camera' | 'roadblock' | 'door' | 'blown'
src/sim/run/Run.ts             the run: state, bag, bank, coins, maxHeat, the drop-off test, busted bar, door and fine
src/sim/city/coins.ts          CoinDesc, placeCoins(chunk) inside City.generate, Coins (picked bitset, pickup, the spill pool)
src/sim/city/cover.ts          coverSites(city): the hideout box and door, three drop-offs, the chokepoints, the parked-patrol junctions, camera sites
src/sim/city/City.ts           + CityChunk.coins, the hideout statics in its chunk, cover exports
src/sim/run/ColdOpen.ts        the first run's script: verbs in order, captions as state, skippable, once per session
src/sim/police/Pursuit.ts      + descriptor, blown, lastKnown, lose(), force()
src/sim/police/Police.ts       + the boxing plan, the disguise in canSee, roadblocks, parked units, heavies, the Chief
src/sim/police/tuning.ts       + busted, box, roadblock, spike, parked, cameras, heavy, chief (§3.4)
src/sim/police/Roadblocks.ts   the placer and the sawhorse trigger; spike strips
src/sim/city/cameras.ts        camera placement (10) and the flash trigger
src/sim/city/jumps.ts          twenty ramps placed by the generator (park lots, pier ends); airtime → bag with the M3 slow motion
src/sim/jobs/Jobs.ts           the skeleton: one delivery kind, marker → target → bag, the timer; M5 adds placement, kinds and the arrow
src/app/botPolicy.ts           BotPolicy: novice (no swap, stays on the road) and skilled (swaps out of sight, turns to break sight)
src/sim/life/Life.ts           + spike state (grip mul, pull), the breach damage rule, the spill on wrecked
src/sim/vehicle/Vehicle.ts     + gripMul (default 1) multiplied into mu; + lateralPull N applied at the rear axle
src/sim/traffic/Traffic.ts     + AgentState.Parked, park(agent, x, z, yaw), unpark(agent), lightsOn flag per agent
src/sim/SimWorld.ts            owns run, coins, roadblocks, cameras, coldOpen; step order §3.2; SimWorldOptions.coldOpen
src/render/Coins.ts            one instanced mesh over the resident chunks' coins plus the spill pool
src/render/HideoutView.ts      the door mesh (slides), the interior light, the cut camera target; the totals themselves are DOM (ui/run.ts)
src/render/PoliceView.ts       + parked lights, the heavy and Chief liveries, the roadblock sawhorse and spike strip meshes, camera poles
src/render/ChaseCamera.ts      + cut(x, y, z, lookX, lookY, lookZ) for the door, released on drive-out
src/ui/run.ts                  the bag and coin counters, the busted bar and card, the door screen (totals), the FLASHED popup
src/ui/coldOpen.ts             keycap captions
src/ui/heat.ts                 (exists) the stars
src/app/App.ts                 the door and busted flows, gameplayStop/Start, ad calls, the input block, ?heat, ?spawn, ?coldopen=1
src/audio/Sfx.ts               + coin, spill, door, busted, camera, siren bed by level
tests/sim/run.test.ts, coins.test.ts, coldOpen.test.ts, identity.test.ts, roadblocks.test.ts, cameras.test.ts, heavy.test.ts
tests/sim/police.test.ts       (exists) + busted timing, parked units
e2e/heat.spec.ts               the bot at set heats: escapes, busted, the door, perf under 4×; the ad paths at the door and the card
e2e/screens.spec.ts            + door, busted, the cold open's first caption
```

### 3.2 Step order in `SimWorld.step()`

```
city.sync(player)
transforms.swap(); events.tick = tick
coldOpen.preStep(controls)               (slice 4) the script may set a marker or a caption state; never writes controls
life.preStep(controls, dt)               swap (→ pursuit.onSwap), respawn timers, heal
vehicle.update(controls, dt)             honours engineCut, gripMul, lateralPull
police.preStep(probe, dt)                plans: chase, box, parked, roadblock cars, heavies, the Chief; sight → pursuit.step
traffic.step(probe, dt, events); peds.step(…)
world.step()
vehicle / traffic / peds .writeTransforms()
life.postStep(dt)                        hits, damage (the breach rule), wrecked (→ run.spill), takedowns, near misses, billboards
coins.step(probe, events)                pickups and the spill pool's ttl
cameras.step(probe, events); roadblocks.step(probe, events)   the sawhorse and spike triggers
jumps.step(probe, airborne, dt, events)  (slice 6) a launch from a ramp that lands after minAirSeconds → 'jump'
heat.step()                              the ratchet reads the ring
jobs.step(probe, dt)                     (slice 4) marker entry, the timer, arrival → bag; before run.step, so a delivery to a drop-off pays before the door can abandon the job
run.step(probe, dt)                      bag from the ring, maxHeat, the busted bar (before the door), the drop-off test, the door state
coldOpen.postStep()                      (slice 4) advances the script from the ring
tick++, time += dt
```

`App` writes controls, `timeScale`, `skipSlowMo`, and calls `run.openDoor()`
/ `run.closeCard()`; nothing else from outside.

### 3.3 Contracts (signatures the reviewer will check against)

```ts
// src/sim/run/Run.ts
export type RunState = 'running' | 'closing' | 'door' | 'busted';
export class Run {
  state: RunState; bag: number; bank: number; coins: number;
  maxHeat: number;                                       // the highest level at which pursuit.state became 'active' this run (D3)
  doorProgress: number;                                  // 0..1 while 'closing'
  runs: number; bestRun: number; firstDoor: boolean;     // firstDoor: the door that ends the cold open (no ad, M5's rule lives here)
  bustedProgress: number;                                // 0..1, the bar
  dropOff: number;                                       // the drop-off closing or shut, index into dropOffs; -1 else
  lastBag: number; lastBanked: number; lastMultiplier: number; lastFine: number;   // for the wall and the card
  readonly counts: { takedowns: number; escapes: number; billboards: number; coins: number };   // this run, for the wall
  readonly dropOffs: readonly DropOff[];                 // from coverSites, the hideout first; empty on the playground
  get multiplier(): number;                              // multiplier[maxHeat]: the HUD's live figure
  get doorShut(): boolean;                               // the roller-door collider is down
  constructor(sim: SimWorld);
  step(probe: PlayerProbe, dt: number): void;
  /** The door: entry box under door.enterSpeed → 'closing' for door.closeSeconds with busted live and control kept (back out over the door line cancels); then bank the bag × multiplier[maxHeat] (× fence bonus, M5), reset heat and pursuit, state 'door'. */
  /** Busted: bank the fine, reset heat and pursuit, state 'busted'. Called by the step when the bar fills. */
  openDoor(): void;      // App, any key at the door: state 'running', the collider disabled, the car turned to face the street, runs++
  closeCard(): void;     // App, any key at the busted card: state 'running', runs++
  // after either, the entry boxes re-arm only once the car has left them (as built, slice 3a)
  spill(x: number, z: number, yaw: number): void;   // Life on wrecked: moves spillShare of the bag into Coins.spill
}
```

```ts
// src/sim/city/coins.ts
export interface CoinDesc { id: number; x: number; z: number }               // value is BALANCE.coin for placed coins
export function placeCoins(cx: number, cz: number, lanes: LaneTables, statics: readonly StaticDesc[], billboards: readonly BillboardDesc[]): CoinDesc[];
export class Coins {
  readonly picked: Uint8Array;            // one byte per (chunk, slot); capacity 49 × COINS_PER_CHUNK_MAX
  readonly spillX: Float32Array; readonly spillZ: Float32Array; readonly spillValue: Float32Array; readonly spillTtl: Float32Array;  // pool of BALANCE.spill.coins
  pickedCount: number;
  constructor(city: City, tuning?: typeof BALANCE.spill);
  step(probe: PlayerProbe, dt: number, events: EventLog): number;   // value picked this step; pushes 'coin' per pickup (value, position, id)
  spill(x: number, z: number, yaw: number, lane: number, s: number, total: number): void;   // lays the pool along the lane
  descOf(id: number): CoinDesc | null;
}
```

```ts
// src/sim/city/cover.ts (as built in slice 3a; slice 6 adds the chokepoints, parked junctions and camera sites to CoverSites)
export const DROP_OFF_LOTS: readonly DropOffLot[];     // { name, cx, cz, sx, sz, ox, oz, setback }: the generator lots the garages replace
export const GARAGE: { width: 14; depth: 20; height: 6; wall: 0.3; doorWidth: 8; doorHeight: 4.2; doorThickness: 0.2; entryAcross: 4.5; entryAlong: 8; floorTop: 0.16 };
export interface DoorPose { x: number; z: number; yaw: number; width: number; height: number }
export interface DropOff { name: 'hideout' | 'scrapyard' | 'hotel'; x: number; z: number; yaw: number /* inward */; door: DoorPose; entry: { across: number; along: number }; approachLane: number; lot: DropOffLot }
export interface Chokepoint { x: number; z: number; yaw: number; lane: number }                  // slice 6
export interface CoverSites { hideout: DropOff; dropOffs: DropOff[] /* + chokepoints, parkedJunctions, cameraSites in slice 6 */ }
export function coverSites(city: City): CoverSites;    // deterministic; approach lanes from the road graph
export function dropOffAt(cx, cz, sx, sz, ox, oz): DropOff | null;   // City.generate asks per lot
export function toDropOff(site, x, z, out): { along: number; across: number };
export function hideoutStatics(site: DropOff): StaticDesc[];   // walls, roof, floor, the band and the light; the door is the view's and the run's
```

```ts
// src/sim/run/ColdOpen.ts
export type ColdOpenVerb = 'steer' | 'swap' | 'boost' | 'smash' | 'takedown' | 'escape' | 'deliver';
export class ColdOpen {
  active: boolean; verb: ColdOpenVerb | null; done: ColdOpenVerb[]; caption: ColdOpenVerb | null;
  markerX: number; markerZ: number;        // the delivery marker while 'deliver' is pending
  constructor(sim: SimWorld);
  start(): void;                            // App at boot when the session flag is clear: heat 20, the patrols, the route's coins, the candidate car
  preStep(controls: VehicleControls): void; // the candidate alongside is kept alongside; the marker test
  postStep(): void;                         // reads the ring: swap → boost → billboard → takedown → deliver → escape
  skip(): void;                             // any 'skip' action: active false, the flag set
}
```

```ts
// src/sim/police/Pursuit.ts (additions)
export interface Descriptor { kind: CarId; paint: number }
descriptor: Descriptor; blown: boolean; lastX: number; lastZ: number;
onSwap(seenNow: boolean, newKind: CarId, newPaint: number): void;   // out of sight: lose(); in sight: descriptor updated, nothing else
lose(): void;               // state idle at once, cooldown 0, 'escape' event with value = level, boxing requested
force(): void;              // pursuit escape (M5) and the cold open: state active, visible this step
markBlown(): void;          // a crime with a unit in sight while disguised
// step(dt, level, seen, x, z) unchanged; Police computes `seen` with the disguise rule
```

```ts
// src/sim/police/Police.ts (additions)
readonly boxing: boolean; boxX: number; boxZ: number; boxLeft: number;    // the abandoned car's position and the timer
readonly parked: Int16Array;              // agents parked at junctions (level ≥ parked.fromLevel)
readonly heavies: number; readonly chief: number;   // counts / the agent
canSee(agent, player, distance): boolean; // + the disguise: false while pursuit.descriptor.kind === 'police' && !pursuit.blown
crimeSeen(): boolean;                     // any unit with line of sight this tick (for markBlown)
```

```ts
// src/sim/police/Roadblocks.ts
export class Roadblocks {
  active: number;                           // 0 or 1 roadblock at a time
  x: number; z: number; yaw: number; sawhorseX: number; sawhorseZ: number; sawhorseUp: boolean; agents: [number, number];
  spikeX: number; spikeZ: number; spikeYaw: number; spikeUp: boolean;
  constructor(sim: SimWorld, sites: Chokepoint[]);
  step(probe: PlayerProbe, dt: number, events: EventLog): void;   // place at level ≥ 3 while the pursuit is active, ahead and out of view; the sawhorse and spike triggers; clear when passed or the pursuit ends
}
// src/sim/city/cameras.ts
export interface CameraDesc { id: number; x: number; z: number; yaw: number; limitMs: number }
export function placeCameras(sites: Chokepoint[], count: number): CameraDesc[];
export class Cameras { readonly descs: CameraDesc[]; step(probe: PlayerProbe, events: EventLog): void; lastFlashId: number }
// src/sim/city/jumps.ts
export interface JumpDesc { id: number; x: number; z: number; yaw: number; length: number; height: number }
export function placeJumps(city: City, seed: number, count: number): JumpDesc[];   // ramps as 'gable' statics on park lots and pier ends, run-out clear
export class Jumps { readonly descs: JumpDesc[]; step(probe: PlayerProbe, airborne: boolean, dt: number, events: EventLog): void }   // 'jump' with value = airtime when a launch from a ramp lands after minAirSeconds
```

```ts
// src/sim/jobs/Jobs.ts (the M4 skeleton; M5 §3.3 is the full contract and extends this one without renaming)
export type JobKind = 'delivery';
export interface JobDef { id: number; kind: JobKind; x: number; z: number; yaw: number; targetX: number; targetZ: number; payout: number; limitSeconds: number; heat: number }
export type JobState = 'idle' | 'active' | 'done' | 'failed';
export class Jobs {
  readonly defs: JobDef[]; state: JobState; active: number; remaining: number;
  constructor(sim: SimWorld, defs: JobDef[]);
  step(probe: PlayerProbe, dt: number): void;       // marker entry, the timer, arrival → bag, 'jobStart' | 'jobDone' | 'jobFailed'
  target(out: { x: number; z: number }): boolean;
  abandon(): void;
}

// src/app/botPolicy.ts
export type PolicyName = 'novice' | 'skilled';
export class BotPolicy {
  constructor(name: PolicyName, bot: TrackBot);
  drive(sim: SimWorld, controls: VehicleControls, dt: number): void;   // wraps the bot: skilled swaps when a candidate is alongside and no unit sees, prefers turns while 'lost'
  readonly swaps: number; readonly escapesBySwap: number;
}
```

```ts
// src/sim/traffic/Traffic.ts (additions)
export enum AgentState { Free, Kinematic, Physical, Disturbed, Wrecked, Abandoned, Parked }   // Parked appended, never renumbered
readonly lights: Uint8Array;                                              // 1 = light bar on (PoliceView reads it)
park(agent: number, x: number, z: number, yaw: number): void;             // stopped, solid when lent, swap candidate
unpark(agent: number, lane: number, s: number): void;                     // back to Kinematic with a plan
spawnParkedPolice(x: number, z: number, yaw: number, kind: 'police' | 'heavy'): number;
```

```ts
// src/ui/run.ts
export class RunHud { constructor(parent: HTMLElement, sim: SimWorld); update(sim: SimWorld, dt: number): void; setKeys(k: { any: string }): void }
// the bag counter (top right under the stars, ≥ 44 px), the coin counter, the busted bar, the busted card, the door screen with the totals, FLASHED; no roadblock text: the light bars are the warning
// src/render/ChaseCamera.ts (addition)
cut(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void;   // hard cut, held until release()
```

### 3.4 Tuning objects (every number lives here; all in the dev panel)

`src/sim/balance.ts` (the M4 part; M5 adds its own):

```ts
export const BALANCE = {
  heatThresholds: [20, 40, 60, 80, 100],
  heat: { trafficTakedown: 4, policeTakedown: 10, billboard: 2, camera: 5, roadblock: 6 },
  bag: { billboard: 500, camera: 300, cameraPerKmh: 20, trafficTakedown: 800, policeTakedown: 1500, roadblock: 1000, escapePerLevel: 500, jump: 400, jumpPerSecond: 200 },
  multiplier: [1, 1, 1.25, 1.6, 2.2, 3],     // index = maxHeat level (0 and 1 both ×1)
  fine: 0.5,
  door: { closeSeconds: 3, enterSpeed: 8 },  // m/s: pulling in at up to 29 km/h starts the race; no fine braking under the sirens
  spill: { share: 0.3, coins: 12, seconds: 10, startAhead: 10, pitch: 4 },
  coin: { value: 10, pitch: 6, runMin: 8, runMax: 12, gapMin: 40, gapMax: 90, ringAtBillboards: 8 },
  jumps: { count: 20, minAirSeconds: 0.5, length: 9, height: 1.6, runOut: 25 },
};
```

`src/sim/police/tuning.ts` (additions to the slice-1/2 object):

```ts
busted: { units: 2, range: 6, speed: 1.39, seconds: 3, drainPerSecond: 0.7 },   // speed in m/s (5 km/h)
box: { seconds: 5, range: 8 },                                                    // the abandoned car after an out-of-sight swap
roadblock: { fromLevel: 3, minAhead: 150, maxAhead: 300, cars: 2, gap: 5, sawhorseLoss: 0.05, sawhorseWidth: 3, breachSpeed: 22.2, breachClass: 'heavy', breachDamageFactor: 0.3, retryAfter: 20 },
spike: { grip: 0.6, pull: 900, healAtDoor: true },
parked: { fromLevel: 3, perJunction: 1, count: 4, radius: 450, lightsRange: 200 },
cameras: { count: 10, overKmh: 20, cooldown: 30 },
heavy: { fromLevel: 4, share: 0.5, ramAcceleration: 20, mass: 2400 },
chief: { level: 5, speed: 45, pitAcceleration: 30, pitRange: 14, paint: 'ink' },
```

## 4. Slices

### Slice 3a — the run: bag, bank, busted, the door (2 days)

Files: `sim/balance.ts`, `sim/events.ts`, `sim/run/Run.ts`, `sim/city/cover.ts`,
`sim/city/City.ts`, `SimWorld.ts`, `render/HideoutView.ts`,
`render/ChaseCamera.ts`, `ui/run.ts`, `ui/hud.ts`, `App.ts`, `audio/Sfx.ts`,
`tests/sim/run.test.ts`, `tests/sim/police.test.ts` (busted).

Behaviour:

- **The bag.** `Run.step` owns a cursor into the ring and adds `BALANCE.bag`
  per event: `billboard`, `camera` (300 + 20 × km/h over, from the event's
  value), `takedownTraffic`, `takedown` on a police agent (told by
  `Traffic.police[target]`, as `Heat` does), `roadblock`, `escape` (500 ×
  level). `maxHeat = max(maxHeat, heat.level)` on any step where
  `pursuit.state === 'active'` (D3: seen at that level), never merely on a
  threshold crossed unseen. Coins go to
  `run.coins` from `coin` events and never to the bag; spilled coins carry
  a `spill` flag in the event's `target` (−2) and return to the bag.
- **cover.ts** (as built): three garages on ordinary generator lots,
  each replacing that lot's building after the lot's random draw: the
  hideout beside the Crown Tower (the street west of the tower block), the
  scrapyard beside the Waterworks, the Coral Hotel garage (the street north
  of the hotel); 14 × 20 × 6 m, an 8 m opening, an entry box 9 × 16 m
  around the garage centre, the approach lane the kerb-side lane past the
  door. `hideoutStatics` returns walls (`concrete`, tag `building`), the
  `graphite` roof, the floor, a carOrange band over the door and a strip
  light; lamps and trees stay out of the doorway. The roller door is not a
  static: the run creates one collider, disabled, and moves it to the
  drop-off that shuts. The chokepoints (the four highway on-ramps' lanes
  and the tower junction's four approaches), `parkedJunctions` (four grid
  nodes, one per district, at least 300 m from the hideout) and
  `cameraSites` (ten: six on the highway straights, four on the avenue) are
  slice 6's, where they are used.
- **The door.** `Run.step`: inside an entry box (in the drop-off's frame,
  |x| < hx, |z| < hz) and speed under `door.enterSpeed` (8 m/s), whatever
  the pursuit is doing → `state = 'closing'`, `doorProgress` runs from 0 to
  1 over `door.closeSeconds` (3 s). The player keeps full control (brief
  §3): braking to a stop is the natural move, and reversing out is the
  break-out; the chassis centre crossing back over the door line (z < 0 in
  the door's frame) cancels the closing, `doorProgress` returns to 0 and
  the state to `running`. `ChaseCamera.cut` to the interior pose (from the
  door pose: 9 m inside, 2.4 m up, looking at the car and through the
  opening), released on a cancel; the view slides the door mesh down over
  the 3 s, the sirens keep playing. The busted rule stays live the whole
  time and is evaluated before the door on each step: two units within
  `busted.range` of the car fill the bar as anywhere else, and the bar
  reaching 1 before or on the step the door would shut is a normal busted
  on the threshold (the door goes back up, the card, the fine). The door
  shuts at `doorProgress = 1` only with the whole chassis behind the door
  line; otherwise it holds at 1 until it is (a car straddling the doorway
  never meets the collider). At the shut:
  `state = 'door'`, the bag banks (`lastMultiplier = multiplier[maxHeat]`,
  `lastBanked = round(bag × m)`, `bank += lastBanked`, `bestRun = max`),
  `bag = 0`, `heat.reset()`, `pursuit.reset()`, the police go off duty
  (`Police` sees level 0), `door` event, the door collider enabled,
  `platform.gameplayStop()`, `ui/run.ts` shows the totals (BAG,
  ×MULTIPLIER, BANKED, BEST RUN, BANK; the first-car line is M5's). Any action edge (except `pause`, `mute`, `debug`) →
  `run.openDoor()`: the collider disabled, the door slides open, the
  camera released, `gameplayStart()`, `runs++`, state `running`. The wall
  also shows one line of the run's counts read from the ring since the last
  door (takedowns, escapes, billboards, coins; jobs join in M5), and the
  multiplier the run is currently earning is on the HUD the whole run,
  `×1.6` beside the bag, rising on the step the pursuit goes `active` at a
  new level (the stars pulse red, the multiplier pops): the whole "one more
  level" pull, no text (DESIGN.md §2.6, §2.9). No door ever refuses: the
  three drop-offs are always open, and the 3 s is the whole test. All three
  walls are the same screen (DESIGN.md §6.3).
- **Busted.** `Run.step`: heat ≥ 1, `police.unitsWithin(range) ≥ busted.units` and
  `probe.speed < busted.speed` → `bustedProgress += dt / seconds`; else
  `−= dt × drainPerSecond`, clamped. At 1: `lastFine = round(bag × fine)`,
  `bank += lastFine`, `bag = 0`, `heat.reset()`, `pursuit.reset()`, `busted`
  event, state `busted`, `gameplayStop()`. The card (ui/run.ts): BUSTED,
  the fine, the bank, "any key". `closeCard()` → `gameplayStart()`, state
  running; the player is where they were, heat 0, the units recycle off
  duty by the level-0 rule of slice 1. `R` under an active pursuit
  teleports to the nearest road as today (which is within sight by
  construction of `nearestRoad`); the pursuit does not care.
- **HUD.** The bag (top right under the stars, ≥ 44 px, the STYLE.md skew,
  accent yellow, counting up with a 0.3 s tween on change) with the live
  multiplier beside it (`×1`, `×1.25`, … in 18 px, the same accent; a 0.3 s
  scale pop on change), the busted bar (a red skewed track centre-bottom
  above the speedo, only while progress > 0); the coin counter lands in 3b.
  Sfx: the door thud, a busted two-note fall.

Numbers: §3.4 `bag`, `multiplier`, `fine`; `busted`.

Tests:

- `run.test.ts` (city, seed 42, `traffic: 0` unless stated; drive the ring
  with `events.push` for money cases): 3.1 each bag event adds its value
  once, a camera event with value 30 (km/h over) adds 300 + 600; 3.2
  `maxHeat` follows the highest level at which the pursuit was `active` and
  never falls before the door: heat pushed to 60 by events with the pursuit
  `idle` leaves `maxHeat` at its old value, and one step of `active` at
  level 3 sets it to 3; 3.3 the door with `maxHeat` 3 and bag 10,000: the
  car rolling into the entry box at 25 km/h goes `closing` on that step
  (at 50 km/h it does not, only once braked under 8 m/s), stops inside under the player's brake, and
  3.0 ± 0.05 s after the start banks 16,000, the bag is 0, heat 0, pursuit
  idle, `door` pushed, state `door`; throttle and steer reach the vehicle
  on every step of the closing (`vehicle` controls non-zero when set); 3.4
  the door race: the car stopped in the entry box with two units parked
  within 6 m (`spawnParkedPolice`) goes `closing`, the bar and the door
  both reach 1 on the same step and the result is busted on the threshold,
  with the fine paid and the state `busted`; with the units 20 m away the
  door wins; reversing out over the door line after 1.5 s of closing
  cancels it (`doorProgress` 0, state `running`, bag unchanged); 3.5
  busted with bag 10,000 banks
  5,000 and no multiplier; 3.6 the busted bar: two police agents parked
  within 6 m (`spawnParkedPolice` around the car) and the car at rest fill
  it in 3.0 ± 0.05 s; moving off at 8 km/h drains it at 0.7/s; one unit
  never fills it; 3.7 `openDoor` re-enables control: throttle moves the car
  in the next second and the door collider is disabled (a ray from inside
  the box through the door hits nothing); while `door`, the collider is
  enabled (the ray hits).
- `police.test.ts` (existing file) 3.13 `unitsWithin` counts only alive
  units and never the parked civilian beside the player.
- e2e (`heat.spec.ts`, first cases): 3.14 the bot from heat 0 drives to the
  hideout (`?spawn=crown&bot=door`, a bot mode that routes to the hideout's
  approach lane) and `run.state` becomes `door`, `platformCalls.gameplayStop`
  increments, then `window.__game` sends `openDoor` and `gameplayStart`
  increments; 3.15 screens: `door-1280x720.png` and `busted-1280x720.png`.

Acceptance: verify green; the smoke's draw calls +1 (the door); the bot's
run from heat 0 to the hideout measured: run length, bag, banked
(`BALANCE.measured` in M5 reads these), in PROGRESS with the commit.

### Slice 3b — coins and the spill (1 day)

Files: `sim/city/coins.ts`, `sim/city/City.ts` (`CityChunk.coins`),
`sim/run/Run.ts` (`coins`, `spill`), `sim/life/Life.ts` (the spill on
wrecked), `render/Coins.ts`, `Renderer.ts`, `ui/run.ts` (the coin counter),
`audio/Sfx.ts`, `tests/sim/coins.test.ts`.

Behaviour:

- **Coins.** `placeCoins` runs last in `City.generate` after the
  billboards: along each lane in the chunk, runs of `runMin..runMax` coins
  at `pitch`, gaps of `gapMin..gapMax`, on the lane's centre, skipping the
  last 30 m before a junction; a ring of `ringAtBillboards` coins 6 m
  around each billboard gate. Deterministic per (seed, chunk). `Coins.step`
  tests the chassis footprint (`probe.halfWidth + 0.4`) against the
  resident chunks' coins with a per-chunk coarse test first (chunk centre
  within 250 m). A pickup: `picked` set, `pickedCount++`, `coin` event,
  `run.coins += value`. The view is one instanced mesh (an octagonal disc,
  8 triangles, `PALETTE.carOrange` for placed coins and `carWhite` for
  spilled ones; the HUD's accent yellow is not a palette colour) over the
  resident chunks, rebuilt on chunk claim like the billboards, picked ids
  zero-scaled; the spill pool is 12 extra instances.
  Spin by time in the shader-free way: rotate the instance matrix at
  30 Hz for the nearest 64 only (a cheap loop, no allocation).
- **The spill.** `Life` on the player's `wrecked`: `run.spill(x, z, yaw)`
  moves `round(bag × share)` out of the bag and calls `coins.spill` with
  the nearest lane and `s` (from `city.nearestLane` and
  `lanes.projectPath`), which lays `spill.coins` coins from `startAhead`
  at `pitch` along the lane in the wreck's direction, each worth the share
  divided by the count, `ttl = seconds`. Picking one returns its value to
  the bag; expired ones vanish. `spill` event with the value.
- **HUD and audio.** The coin counter under the bag (smaller, the coin
  glyph, white: coins are safe, the bag is yellow because it is not); the
  spilled coins have no counter. Sfx: a coin `ding` (the M3 chime reused at
  a higher pitch), a spill cascade (six dings).

Numbers: §3.4 `spill`, `coin`.

Tests:

- `coins.test.ts`: 3.8 placement per chunk is deterministic for seeds 42, 7
  and 123, every coin within 1 m of a lane centre and ≥ 30 m from the
  lane's end, the whole-island count in a band (2,000–3,500) recorded in
  PROGRESS; 3.9 driving a coin run at 60 km/h picks every coin once
  (`pickedCount` equals the run's length), a second pass picks nothing; 3.10
  the spill: a wreck at bag 10,000 lays 12 coins worth 250 each on the lane
  ahead starting 10 m out, the bag is 7,000; the rolling respawn driving
  straight recovers all 12 within the ttl and the bag is back to 10,000;
  3.11 after 10 s an untouched spill is gone and the bag stays at 7,000;
  3.12 coins survive busted (`run.coins` unchanged by the fine).

Acceptance: verify green; the smoke's draw calls +1 to +2 (coins and their
shadow draw); coins picked per minute by the bot in a 5-minute run
(`BALANCE.measured.coinsPerMinute`), the whole-island coin count, in
PROGRESS.

### Slice 3c — the police brain (done 2026-09-22, out of order on Marcin's playtest)

Inserted after 3a when Marcin played it: busted was near impossible and a
light touch wrote a police car off. DESIGN.md §2.10 is the design. Files:
`sim/traffic/Traffic.ts` (`damage`, `justWrecked`, the settle rule, the
free-steer plan), `sim/traffic/tuning.ts` (`damageThreshold` 3,
`damagePerDv` 0.1, `policeArmour` 1.6, `settleSpin` 2, `disturbedMax` 8,
`reattachDistance` 14), `sim/life/Life.ts` (takedown thresholds × armour,
damage wrecks as takedowns), `sim/police/Police.ts` (arrest slots, search,
cut-off, assault), `sim/police/tuning.ts` (`arrest`, `search`, `cutoff`,
`assaultDv`, `assaultCooldown`; `busted.range` 7), `sim/balance.ts`
(`heat.policeHit` 4). Tests: `brain.test.ts` 3c.1 a nudge leaves a police
car and a civilian driving on (dented under 0.3); 3c.2 a 110 km/h wall slam
is still a police takedown with police money; 3c.3 hitting an idle police
car costs `policeHit` once; 3c.4 a lost pursuit comes within
`search.reach` of the last fix; `brain.long.test.ts` 3c.5 a player stopped
at heat 2 at four spawns is busted inside 20 s, units within 8 m never
faster than 9 m/s, no police wreck. The slot names avoid slice 5's `box`
(the units boxing an abandoned car): the arrest is `arrest`.

### Slice 4 — the cold open prototype on the jobs skeleton (2 days)

Files: `sim/jobs/Jobs.ts` (the skeleton of §3.3), `sim/run/ColdOpen.ts`,
`sim/city/coins.ts` (the route line), `SimWorld.ts`, `App.ts` (`?coldopen=1`
forces it; the session flag in `sessionStorage` is app glue),
`ui/coldOpen.ts`, `ui/styles.css`, `tests/sim/jobs.test.ts` (the skeleton's
own pins), `tests/sim/coldOpen.test.ts`, `e2e/heat.spec.ts`.

Behaviour (DESIGN.md §6.6, revised): `start()` at boot when the session
flag is clear: the car is a `heavy` at damage stage 2 on the `loop` spawn
heading for the tower junction; heat set to 20 (level 1) and the two
patrols dispatched behind by the slice-1 rule; a `muscle` traffic agent
spawned 40 m ahead in the next lane at the player's speed and held
alongside by a plan (`Traffic.setPolicePlan` is the generic plan hook:
speed = player's, no ram; rename to `setPlan` if that reads better) until
taken or 15 s pass; a coin line laid on the diagonal's lane from the spawn
to the tower junction and on through to the marker (the route's coins are
added to the chunk's list at `start()`; they are extra ids after the
placed ones); the delivery marker 600 m ahead past the junction as the first `JobDef`
of the `Jobs` skeleton (one `delivery` kind: driving into the 4 m ring
starts it, reaching the hideout's entry box pays the payout into the bag,
the timer fails it; the same code M5 slice 1 extends with placement, the
order and escape kinds and the arrow, so nothing here is thrown away);
the hideout 300 m on. Verbs in order with the caption state: `steer`
(cleared after 2 s of throttle), `swap` (the `E` keycap when
`life.state.swapCandidate ≥ 0`; cleared by the `swap` event), `boost`
(cleared by 1 s of `boosting`), `smash` (the first billboard gate on the
diagonal is on the route by construction; cleared by `billboard`),
`takedown` (a patrol lines up: the chasing unit's ram plan is what it is;
the caption says "RAM THEM INTO A WALL" only while a unit is within 20 m;
cleared by `takedown` on a police agent or after 20 s), `deliver` (the
marker; cleared when inside), `escape` ("GET IT TO THE HIDEOUT" with the
arrow-less coin line; cleared by `door`). The `skip` action ends the
script: it has no key today, so the keyboard binds it to `KeyN` (never
Escape, and every run key is gameplay) and the caption shows "N: SKIP"
underneath; completion or skip sets the session
flag (`sessionStorage`, app) so a reload in the same tab does not repeat it
until M5's save takes over. Captions are DOM: a keycap plus one word, top
centre, STYLE.md sizes; never a modal; input never blocked.

Numbers: heat 20, the candidate 40 m ahead and held 15 s, the marker 600 m,
the hideout 300 m on, the takedown caption within 20 m of a unit,
completion under 120 s for the bot.

Tests (`coldOpen.test.ts`, city, seed 42, traffic on):

- 4.1 `start()` leaves the car a `heavy` at stage 2 at the loop spawn with
  heat 20 and two units dispatched within 3 s, none in the view cone (the
  slice-1 helper).
- 4.2 the candidate: within 10 s of sim time a `muscle` agent is a swap
  candidate (`life.state.swapCandidate ≥ 0`) while the bot drives the lane
  at 60 km/h.
- 4.3 the route's coins exist from the spawn to the marker: every 30 m
  along the lane path there is a coin within 6 m.
- 4.4 the marker and the hideout are reachable by lane path from the spawn
  in under 1.5 km, and a billboard gate lies within 12 m of that path.
- 4.5 the bot (a scripted policy: swap when the candidate appears, boost on
  the straight, through the gate, drive the path to the marker and then to
  the hideout) completes with the events in order (`swap`, then `billboard`,
  then `door`) inside 120 s; the caption sequence recorded matches the
  verb order; `takedown` is optional for the bot and the caption times out.
- 4.6 `skip()` ends the script, and a second `start()` in the same world
  does nothing (the flag).
- `jobs.test.ts` (the skeleton): 4.7 driving into a delivery ring starts
  the job, applies its heat once, and reaching the target pays `payout ×
  (1 + 0.5 × remaining / limit)` into the bag with a `jobDone`; 4.8 the
  timer fails it with no payout; a second ring while active does nothing;
  `abandon()` goes idle silently.
- e2e 4.9 `?coldopen=1`: the first caption is visible within 3 s of
  control and says the steer keycaps; after a reload without the parameter
  in the same context the caption never appears.

Acceptance: verify green; the bot's completion time and the time of each
caption in PROGRESS; from this slice on, Marcin's first minute by hand is
part of every slice's playtest.

As built (2026-09-22, PROGRESS): there is no billboard on the diagonal
(billboards keep 6.5 m off the authored roads) and the hideout stands
150 m from the tower junction, so the route turns right at the tower,
swerves across the carriageway through the footway gate beside the
hideout's door, and runs anticlockwise round the hideout's block: the
marker at 600 m, the door 700 m after it, 1.3 km in all. Verbs are done in
any order; the caption is the first verb not done while its cue holds.
`skip` is on `KeyN` and `Enter`. The session flag is set when the script
starts. The candidate's hold is `Traffic.setGuidePlan`. No busted and no
boxing while the script runs.

### Slice 5 — identity: the descriptor, the swap escape, the disguise, the bot policies (3 days)

Files: `app/botPolicy.ts`, `sim/police/Pursuit.ts`, `Police.ts`, `sim/life/Life.ts`,
`sim/traffic/Traffic.ts` (police cars as swap candidates already are; the
descriptor's paint on the player's car is `PLAYER_PAINT` today and the
respray is M5), `render/PoliceView.ts` (the player's car in police livery
after a swap: the class mesh already exists; the light bar on the player
car when disguised), `ui/hud.ts` (FRESH WHEELS stays; a "COPS LOST YOU"
popup on `lose()`), `tests/sim/identity.test.ts`.

Behaviour:

- **The descriptor.** `Pursuit.descriptor` is set on `detected` from
  `sim.carId` and `PLAYER_PAINT[carId]` (M5 replaces the paint with the
  garage's); `lastX/Z` update while visible (exists).
- **The swap escape.** `Life.swap` calls `pursuit.onSwap(seenNow, kind,
  paint)` where `seenNow` is `police.crimeSeen()`'s sight flag from the
  last sight tick (any unit with line of sight within `sightEveryTicks`).
  Out of sight: `lose()`: state `idle`, cooldown 0, `escape` event with the
  level, and `Police.boxing = true` with `boxX/Z` = the abandoned car's
  pose, `boxLeft = box.seconds`: every unit's plan targets the box point at
  `chaseSpeed`, stops within `box.range` (speed 0, lights on) until
  `boxLeft` runs out, then the slice-1 withdraw rule. In sight: the
  descriptor becomes the new car's class and paint; nothing else.
- **The disguise.** `Police.canSee` returns false while
  `pursuit.descriptor.kind === 'police' && !pursuit.blown` (the descriptor
  is set at the swap even when idle, so a cold swap into a parked patrol
  disguises too). `Police` computes `crimeSeen` each tick (any unit with
  LOS to the player, disguised or not); `Life`/`Heat`'s crime events
  (`takedown`, `takedownTraffic`, `billboard`, `camera`, a `hit` on a police
  agent) with `crimeSeen` → `pursuit.markBlown()` (`blown = true`, `blown`
  event) and detection resumes on the next sight tick with the police
  descriptor. `blown` clears at the door and on a swap out of the police
  car. Heat counts every crime regardless. The player's car shows the
  police livery and a lit bar while disguised (the swap already switches
  the class mesh; the bar is the police view's job). The swap prompt says
  BORROW instead of SWAP when the candidate is a police car (one string in
  `ui/hud.ts` keyed on `Traffic.police[candidate]`): without it nobody
  discovers the disguise.
- **The bot policies** (`app/botPolicy.ts`, §3.3). Three measurements
  (this slice's, slice 6's busted rates, M5's balance script) assume a
  novice and a skilled bot, and neither exists: the road bot only follows
  lanes. `novice` is the bot as it is. `skilled` wraps it: when a swap
  candidate is alongside and no unit has sight (`Police.crimeSeen()`'s
  sight flag), it presses `swap`; while the pursuit is `lost` it prefers
  the exit that turns at the next junction over the straight one (a bias in
  the lane choice, through the bot's existing route search), and it uses
  boost on straights. About a day; sized here because nothing else in the
  plans sizes it. `?bot=novice|skilled` runs either in the browser with
  the perf probe.
- **The heavy as a breacher** is slice 6's rule; listed here because it is
  the same "cars as tools" decision.

Numbers: `box.seconds` 5, `box.range` 8.

Tests (`identity.test.ts`, city, seed 42, traffic on, heat 20):

- 5.1 a swap while a unit has line of sight (the unit parked 30 m behind on
  the same lane, `canSee` true) changes the descriptor and keeps the state
  `active`.
- 5.2 a swap with no unit in sight (the units spawned behind a building row
  by `spawnParkedPolice` and the ray blocked, asserted through `canSee`
  false) ends the pursuit on that step: state `idle`, cooldown 0, one
  `escape` event; over the next 5 s every unit's distance to the abandoned
  car falls below 8 m and their speed is 0; after `box.seconds` they leave
  (distance grows).
- 5.3 the disguise: the player swapped into a parked patrol (`spawnParked
  Police` beside the car, then `E`) with heat 40 drives past a unit 20 m
  away for 60 s: `pursuit.state` stays `idle`, `pursuit.visible` false.
- 5.4 a takedown in view of a unit while disguised sets `blown` inside one
  step, and the pursuit is `detected` at the next sight tick with
  `descriptor.kind === 'police'`.
- 5.5 a swap out of the cruiser clears `blown`; the door clears `blown`.
- 5.6 heat rises for a billboard smashed while disguised and unseen (`heat.
  points` +2) and the pursuit stays idle.
- 5.7 (existing pin kept) a unit that lost the player re-detects only after
  120 m and out of view.
- 5.8 the policies (`botPolicy.test.ts`, long): over 120 s at heat 40 with
  traffic on, `skilled` swaps at least once and escapes at least once by
  swap; `novice` never swaps; both keep `bot.resets` at 0.
- 5.9 the prompt: with a police candidate alongside the HUD's swap label
  reads BORROW (a DOM pin in the screens spec at 1280×720).

Acceptance: verify green; the measurement: the bot with a swap policy
(swap whenever a candidate is alongside and no unit sees, else drive the
grid) at level 2 for 120 s: escapes by swap versus by cooldown, and the
share of escapes that were disguises, in PROGRESS (DESIGN.md §12 watch
item; the fallback is a dispatcher timer if the share is above a half).

As built (2026-09-22, PROGRESS): the box clock runs while two units are
round the car (5 s), 15 s at most, since a junction on the way takes the
units 5 s; they drive the lanes to it and go straight into a slot only
inside 20 m (`box.approach`), rear and sides before the front, round the
empty car at 10 m/s; afterwards each pulls out 14 m past it before the
withdraw rule (traffic queues behind an abandoned car). The measurement
tripped the fallback through the exploit the watch item names (the ramming
unit's car taken in sight: 114 of 120 s disguised), so the cover blows 30 s
after the theft (`POLICE.disguise`); 5.3 drives the cover's length and pins
the blow-up. 5.7 is folded into 5.2. `Police.enlist` puts a police car into
the roster. `TrackBot` treats a police car within 15 m of a stopped bot as
an arrest, not a stuck car.

### Slice 6 — level 3: roadblocks, spike strips, parked patrols, speed cameras, stunt jumps (3.5 days)

Files: `sim/police/Roadblocks.ts`, `sim/city/cameras.ts`, `sim/city/jumps.ts`, `sim/city/cover.ts`
(sites, exist from slice 3), `Police.ts` (parked units), `Traffic.ts`
(`Parked`, `park`, `unpark`, `lights`), `sim/life/Life.ts` (the breach
rule, spike), `sim/vehicle/Vehicle.ts` (`gripMul`, `lateralPull`),
`render/PoliceView.ts` (parked lights, the sawhorse, the strip, the poles),
`ui/run.ts` (FLASHED with the speed, ROADBLOCK: no text, the bars),
`tests/sim/roadblocks.test.ts`, `cameras.test.ts`, `police.test.ts`.

Behaviour:

- **Roadblocks.** At `heat.level ≥ roadblock.fromLevel` while the pursuit
  is `active`, `Roadblocks.step` picks, every `retryAfter` seconds and
  while none is active, the chokepoint whose lane lies on the player's
  projected path (`Police.route`'s target lane and its successors) between
  `minAhead` and `maxAhead` m ahead and out of view (`Traffic.outOfView`
  with the roadblock's footprint radius); it parks two police agents across
  the lane (`spawnParkedPolice` at ±`gap`/2 across the carriageway,
  lights on, `Parked`, lent bodies when near so they are solid) and lays
  the sawhorse in the gap (a trigger, `sawhorseWidth` 3 m, `sawhorseUp`);
  a spike strip 25 m before the block across the *other* lane (so the
  choice is the sawhorse at speed or the spike on the open side). Passing
  the sawhorse's footprint at any speed: `sawhorseUp = false`, `speed ×
  (1 − sawhorseLoss)`, `roadblock` event (bag +1000, heat +6), planks in
  `PALETTE.barrier` and `cone` paint, a splinter; the roadblock clears
  (units unpark and rejoin the chase). The spike: crossing the strip's
  footprint sets `Life.spiked = true` → `vehicle.gripMul = spike.grip`,
  `vehicle.lateralPull = spike.pull` (a constant lateral force at the rear
  axle, sign fixed per strip), healed by a swap or the door. A roadblock is
  cleared when the player is 150 m past it or the pursuit ends; the parked
  units become normal units. Never two roadblocks at once; never within
  100 m of the player at placement; never in view.
- **The breach.** `Life`'s damage rule: a hit whose collider belongs to a
  `Parked` police agent while `sim.carId === roadblock.breachClass` and
  `probe.speed ≥ breachSpeed` weighs `breachDamageFactor` instead of the
  traffic factor, and the parked agent goes `Disturbed` (the body shoves
  aside); any other class takes the full traffic factor (a wreck at 80
  km/h, by the M3 calibration).
- **Parked patrols.** From `parked.fromLevel`, `Police` keeps `parked.count`
  parked units at the `parkedJunctions` within `parked.radius` of the
  player (one per junction, on the corner apron facing the crossing, lights
  on within `lightsRange` of the player when heat ≥ 3, off otherwise so a
  parked cruiser at heat 0 is a civilian saloon per STYLE.md). A parked
  unit with line of sight to the player detects (the slice-1 rule) and
  `unpark`s onto the adjacent lane with a chase plan. They are swap
  candidates (the disguise).
- **Speed cameras.** `placeCameras(cameraSites, count)` at boot (statics in
  the chunks: a pole and a head, `steel` and `ink`, from `cover.ts`'s sites,
  ten total, deterministic); `Cameras.step`: the chassis footprint crossing
  the camera's line at `probe.speed > limit + overKmh` and the camera's
  cooldown clear → `camera` event with `value = km/h over`, the flash: the
  HUD paints a 100 ms white overlay at 60 % and a FLASHED popup with the
  speed; heat +5, bag +300 + 20/km/h over (slice 3's rule). The lane's limit
  is `TRAFFIC.speedHighway` or `speedAvenue` in km/h.

Numbers: §3.4 `roadblock`, `spike`, `parked`, `cameras`, `jumps`, `bag.jump`.

Tests:

- `roadblocks.test.ts` (city, traffic on, heat 60, the bot on the
  highway): 6.1 a roadblock is placed within `retryAfter` of the pursuit
  going active, 150–300 m ahead on the projected path, not in the view
  cone at placement, never within 100 m; 6.2 never two at once; 6.3 the
  sawhorse at 60 km/h: passed, `roadblock` event, speed loss 3–8 %, damage
  stage stays 0, bag +1000, heat +6; 6.4 the car half at 80 km/h: a
  `compact` wrecks (stage 4 within 1 s), a `heavy` keeps damage under stage
  2 and the parked agent is `Disturbed` and displaced ≥ 2 m; 6.5 the spike:
  crossing the strip at 80 km/h sets `gripMul` 0.6 and the pull; the
  handbrake-drift pin's angle band no longer holds (the car understeers,
  measured as a lower peak yaw rate in the slalom script) and a swap
  restores `gripMul` 1; the door restores it too; 6.6 the roadblock clears
  150 m past it and the units rejoin (state Kinematic with a plan within
  3 s).
- `police.test.ts` 6.7 four parked units exist at level 3 at the parked
  junctions within 450 m, lights on within 200 m, off beyond; 6.8 a parked
  unit with line of sight goes `Kinematic` with a chase plan inside one
  sight tick and the pursuit is `detected`; 6.9 at heat 0 the same parked
  car has lights off and is a swap candidate.
- `cameras.test.ts`: 6.10 exactly ten cameras, deterministic, on highway
  straights and the avenue, none within 200 m of another; 6.11 crossing at
  the limit + 30 km/h flashes once (`camera` value 30 ± 1), at the limit +
  10 nothing; a second crossing inside the cooldown nothing.
- `jumps.test.ts`: 6.13 exactly twenty ramps, deterministic for seeds 42, 7
  and 123, each with a clear run-out and ≥ 120 m from any other, none on a
  carriageway; 6.14 the bot launched at 90 km/h off the first ramp lands
  inside the run-out with airtime ≥ 0.5 s, one `jump` event, the bag paid
  by the formula, `slowMo` > 0 during the flight and 0 within 2 s of
  landing, no wreck, `upness` ≥ 0.99 a second after touchdown; 6.15 a hop
  off a kerb pays nothing.
- e2e `heat.spec.ts` 6.12 `?heat=3&bot=1` for 120 s: at least one
  `roadblock` event or one `camera` event, no console errors, perf inside
  the budgets.

As built (2026-09-22, PROGRESS): chokepoints are every highway lane every
75 m and the tower junction's approaches; a placement is out of the cone or
behind a building from the driver's eye; the cars stand along the lane; a
roadblock car is braced (×3.5 damage) except to the heavy at 80 km/h+ (the
M3 traffic factor does not wreck at 80); parked junctions are all interior
nodes 300 m from the hideout and a parked car appears beyond its 90 m
sight; cameras are 7 on the highway and 3 on the avenue; the ramps stand on
the park strip beyond the highway with an eased-in profile drawn by their
own view. 6.1 is a long pin, and 4.5 moved to one with it.

Acceptance: verify green; the measurement that decides the money: the bot
busted rate per level 1–3 over five minutes each with the novice policy
(no swap, stays on the road) and the skilled one, in PROGRESS. Decision
rule (DESIGN.md §12): if level 3 comes out below the §2.7 novice
assumption (about one busted in five minutes), the ratchet gets a cost that
is not the police (cameras and parked patrols from level 2 instead of 3:
`parked.fromLevel` and the camera heat) and `multiplier[1..2]` come down;
the change and the reason go into PROGRESS. Nobody tunes `balance.ts`
before this number exists.

### Slice 7 — levels 4 and 5 on the ground: heavy units and the Chief (1.5 days)

Files: `Police.ts`, `police/tuning.ts`, `Traffic.ts` (heavy police kind),
`render/PoliceView.ts` (the heavy livery: the van body in policeWhite with
the band, a wider bar; the Chief: the sports body in `ink` with a
`carOrange` band and a single red lens), `render/carProfiles.ts` (no new
profile: liveries are paints), `tests/sim/heavy.test.ts`.

Behaviour: from `heavy.fromLevel`, `heavy.share` of the roster is the
`heavy` preset in police livery (mass 2400, `ramAcceleration` 20: a shove
that moves the player's car in earnest, still never stopping it dead: the
slice-2 pin holds); at `chief.level` one unit is the Chief: the `sports`
preset at `chief.speed`, a PIT at `chief.pitAcceleration` that aims at the
rear quarter with the lead computed from the player's yaw rate (the
"always lands" is the aim, not a teleport: physics decides), never
recycled while the pursuit is active, replaced after `reinforceSeconds ×
2` if wrecked. Breaking the pursuit at 4 and 5 is the cooldown alone (12
and 15 s), which the roadblocks and parked patrols of slice 6 make harder
to reach; sirens (Sfx) gain a lower third voice for heavies and a horn for
the Chief.

Numbers: §3.4 `heavy`, `chief`.

Tests (`heavy.test.ts`): 7.1 at level 4 the roster is 6 with 3 heavies and
2 interceptors; at 5, 8 with 4 heavies, 3 interceptors and the Chief; 7.2 a
heavy's ram from 25 m behind at the player's 70 km/h pushes the car ≥ 3 m
across the lane and the player is still above 50 km/h a second later
(shoved, never stopped); 7.3 the Chief's PIT on a straight at 120 km/h
lands (contact on the rear quarter, yaw rate ≥ 0.4 rad/s) at least twice
in 60 s; 7.4 the Chief is not recycled while active and is replaced after
16 s when wrecked; 7.5 the body pool: police bodies never exceed
`policeBodies` (10) at level 5 with the heavies, and ≥ 36 civilians stay
alive (the slice-2 pin re-run at level 5 with heavies).

Acceptance: verify green; the browser step p95 and fps at level 5 on the
low tier against the slice-0 baseline (`PERF_HEAT=5`), and the bot's
busted rate at 4 and 5 (both policies), in PROGRESS.

As built (2026-09-22, PROGRESS): the heavy shoves the rear corner on its
side (`heavy.aimSide` 1.2 m) because a centre ram does not move the car
across; the Chief's place in the roster stays empty until its replacement;
the siren bed did not exist and was built here.

### Slice 8 — ad points, polish, the gate (2 days)

Files: `App.ts`, `ui/run.ts`, `audio/EngineAudio.ts` (the mute hook is
wired: verify), `docs/CRAZYGAMES.md`, `e2e/heat.spec.ts`,
`e2e/screens.spec.ts`, `docs/M4_REPORT.md`, `docs/ARCHITECTURE.md`,
`docs/STYLE.md`, `docs/BACKLOG.md`, `docs/PROGRESS.md`.

Behaviour:

- **Ad points.** At the door (state `door`, totals visible, `!run.
  firstDoor`): `input.blocked = true`, `platform.requestAd('midgame')`;
  `onAdEvent`: `adStarted` → `audio.setMuted(true)`; `adFinished` or
  `adError` → `setMuted(false)`, `input.blocked = false`. The busted card:
  the same with `'midgame'`. Never a reward here (rewarded offers are M5's
  garage and door offer; this slice ships the midgame points and the
  plumbing). The wrecked overlay is not an ad point; nor the slow motion;
  nor the focus pause. `LocalPlatform`'s overlay is the visual; `?ad=off`,
  `?ad=error&adError=adCooldown` and `?adDuration=1` are the test paths.
  `docs/CRAZYGAMES.md` A1, A3, A4 → `done` for the adapter side with the
  file names; A2 `info` stays; T15 notes the calls.
- **Polish if the budget allows** (DESIGN.md §8, in this order, each one a
  BACKLOG line if skipped): the officer's ticket book as the busted bar
  (one pedestrian pose walking up from the nearest unit); the donut-shop
  withdrawal (units path to a marker building and park when the pursuit
  ends); the wanted poster on the hideout wall (the descriptor's class and
  paint drawn as a card).
- **The gate**: `e2e/heat.spec.ts` complete (the bot at `?heat=1|3|5` for
  120 s each: escapes, busted, `roadblock`/`camera` events, no errors, perf
  inside the budgets; the door and the card flows; the ad paths); `npm run
  screens` with `door`, `busted` and the cold open's first caption at 1280
  ×720 and the seven M3/M4 states at the ten sizes, inspected; perf A/B
  against the M3 gate (`perf/m3-gate-*.json` are the bases; two runs on the
  final commit); `docs/M4_REPORT.md` per `CLAUDE.md`; ARCHITECTURE
  decisions for D2–D17 that surprise; STYLE.md sections (the bag and coin
  counters, the busted bar and card, the door screen, coins, the sawhorse,
  the strip, the cameras, the heavy and Chief liveries); BACKLOG;
  CRAZYGAMES; PROGRESS.

Tests (e2e `heat.spec.ts`): 8.1 at the door with default ads
`adRequests` is 1, the master gain is 0 between `adStarted` and
`adFinished` (read through `window.__game`'s audio handle), input is
blocked (a `KeyW` during the ad does not open the door), and the door opens
after; 8.2 with `?ad=error&adError=adCooldown` the door opens on the next
key with no delay and the gain untouched; 8.3 with `?ad=off` no request is
made; 8.4 the first door after `?coldopen=1` makes no request; 8.5 the
busted card requests once.

Acceptance: §7.

## 5. Post-launch update 1 — the air (the contract for after Basic Launch)

Moved out of M4 on 2026-09-22 (DESIGN.md §5). Three slices, in this order,
worked the same way as the ones above once the first Basic Launch numbers
are in. Heat 4–5 then gain the helicopter and the escape rule "lose the
helicopter under cover first, then the cooldown".

### Update slice A — covered streets and the camera occlusion rule

- One covered street per district from `cover.ts`: roof and side walls with
  portal openings, static boxes, no road-graph change.
- Line of sight against statics blocks inside cover (the pursuit's ray).
- `ChaseCamera`: when a static lies between the camera and the car, the
  distance shortens along the boom; recovers at `heightRateGround` pace.
- Pins: LOS blocked inside cover; the camera check in e2e (no static between
  camera and car for a drive through each cover).

### Update slice B — overpasses

- Height in the road graph: `RoadPoint.y` optional, lanes carry height,
  kinematic traffic at height, the bot route, road meshes, markings, the
  minimap; the highway rises over the four avenue crossings with ramps
  inside the vehicle's landing rules (decision 10).
- Re-pin the city tour and bot laps with the reasons written. This slice
  reopens M2 by design (DESIGN.md §5); Marcin decided it.
- Measurement: smoke fps and draws before/after; the bot's whole-map tour.

### Update slice C — the helicopter

- A kinematic unit above the road graph from level 4, a spotlight cone as
  line of sight; cover (slice A) and the overpasses (slice B) break it;
  escape needs cover first, then the cooldown. `PoliceView` gets the body and
  the spotlight; audio the rotor as a low-pass on everything when it is
  overhead (BACKLOG).
- Pins: the helicopter loses the player only under cover; unit budgets with
  the helicopter counted.
- Measurement: browser step p95 and fps at level 5 on the low tier against
  the M4 gate; the bot's busted rate at 4 and 5 before and after.

## 6. Verification

### 6.1 Headless tests (Vitest, Node)

- Worlds through `tests/sim/helpers.ts`; city worlds with `traffic: 0,
  peds: 0` unless the test needs them; seeds explicit; `heat` through
  `SimWorldOptions` for level setups (`?heat=` maps 1..5 → 20..100).
- Deterministic setups over random ones: `spawnParkedPolice` around the
  car for busted and disguise cases, `events.push` for money cases, the
  playground's boundary wall for takedowns (`takedown.test.ts` shows the
  pattern), `Traffic.wreck` to write off a car.
- Sight is asserted through `Police.canSee` (make it package-visible for
  tests, not public API) rather than by geometry guesses.
- Bands where a knob influences the result; exact numbers for money,
  counting and determinism. The existing pins (M1–M3 and slices 0–2) do
  not change; if a slice-2 police pin must move (the roster at level 4
  with heavies), the reason is in the test and in PROGRESS.
- Long pins go into `tests/**/*.long.test.ts` (2026-09-22): any case that
  drives the bot or the traffic pool for more than about 10 s of wall time
  on the MX330 laptop. The quick `npm run verify` excludes them so it stays
  under a minute of tests; `npm run verify:gate` (LONG=1) runs everything and
  is the command for the gate and for the commit of a slice that added a
  long pin; `npm run test:long` runs only the tests stage that way. The
  split moved the city tour, the two bot-driven police pins and the two
  traffic drives (184 quick / 5 long at the split).
- About 65 new tests over slices 3–8 on top of 189.

### 6.2 `e2e/heat.spec.ts`

Runs against the preview build: the bot at heats 1, 3 and 5 for 120 s of
sim time each (escapes, busted, events, errors, perf inside the budgets),
the door flow with `openDoor` through `window.__game`, the busted flow, the
ad paths (8.1–8.5), the cold open once. `npm run heat`.

### 6.3 Screens

`hud`, `pause`, `life`, `wrecked` (M3) plus `door`, `busted`, `coldopen`
at the ten sizes; the door and busted states reached through `window.__game`
hooks (`sim.run` setters in a `?manual=1` session), never by driving; all
inspected at the gate and after slices 3 and 8.

### 6.4 Performance protocol

Bases: the M3 gate's two runs (`perf/m3-gate-1.json`, `-2.json`; summary
lines in `docs/M3_REPORT.md`: 57.4 / 52.5 fps, step p50 2.9 / 3.4 ms) and
the slice-0 phase profile (traffic 1.55 ms mean / 3.0 p95). After slices 3,
6 and 7 run `npm run perf` once and `PERF_HEAT=3` (slice 6) / `5` (slice 7)
once; at the gate twice each. A regression claim needs both new runs worse
than both bases. Expected deltas over the whole milestone: draw calls +6 to
+10 (coins, the door, markers of the cold open, the sawhorse and strip,
camera poles, two liveries), triangles +15k to +30k (2,500 coins × 8), step
mean +0.2 to +0.5 ms at level 5 (eight units, the roadblock and camera
tests are O(resident)), heap +5 MB. Exceeding any twofold stops the slice
for a profile. The throttled A/B from slice 2 (heat 0 vs 2) is still owed
and is taken at the start of slice 3 on an idle machine. Marcin's
`perf:headed` is asked for in the gate report.

### 6.5 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify` | green, lint 0 warnings | tools/verify.mjs |
| Startup bytes before gameplay-start | ≤ 8 MB target, 12 MB fail (3.51 MB at `6b52d03`) | tools/budget.mjs |
| Time to control, 20 Mbit + CPU ×4 | ≤ 6 s (the hideout statics and coins are chunk data; no new boot phase) | e2e/city.spec.ts |
| Draw calls / triangles, low tier, tour | ≤ 150 / 250k | e2e/city.spec.ts (the tour runs with life off; record once with life on) |
| JS heap | ≤ 250 MB | perf |
| Sim step p95 under CPU ×4, `PERF_HEAT=5` | < 12 ms | e2e/perf.spec.ts |
| Frame p95 under CPU ×4, real GPU, heat 0 and 5 | < 33.4 ms | e2e/perf.spec.ts |
| Node full step, level 5, traffic and peds on | < 3 ms mean | police tests' cost line |
| The body pool | police ≤ 10, civilians alive ≥ 36 at level 5 | tests/sim/heavy.test.ts 7.5 |

## 7. Gate criteria (definition of done for M4)

1. Slices 3–8 committed with their tests; slices 0–2 as recorded.
2. `npm run verify:gate` green (the long pins included); `npm run heat`
   green; `npm run city` and `npm run life` still green; `npm run screens`
   with the seven states at the ten sizes captured and inspected.
3. Every budget in §6.5 holds; the perf comparison per §6.4 with all runs
   quoted, including `PERF_HEAT=5`.
4. No per-step allocation in `Run.step`, `Coins.step`, `Roadblocks.step`,
   `Cameras.step`, `Police.preStep`, `ColdOpen.postStep`, `Coins` (view)
   `update`, `RunHud.update` (the reviewer greps as in M3 §7.5).
5. Layering intact; `tsconfig.sim.json` clean; no new dependency;
   `docs/BRIEF.md` untouched; every M1–M3 pin and the slice 0–2 pins
   unchanged (or moved with the reason written, §6.1).
6. The busted-rate measurement of slice 6 exists for levels 1–5 and both
   policies, and the decision rule was applied or explicitly not needed.
7. The ad rules hold on every path (8.1–8.5); `docs/CRAZYGAMES.md` A1, A3,
   A4, T15 updated.
8. Docs: ARCHITECTURE records, STYLE sections, README (`?heat`, `?coldopen`,
   `npm run heat`), BACKLOG (polish skipped, update 1), PROGRESS entries,
   `docs/M4_REPORT.md` with the playtest script and the known issues, and
   `docs/M5_PLAN.md` §1.2 checked against what shipped (`BALANCE.measured`
   filled with the slice 3 and 6 numbers, the date and the commit).
9. On `/` with no parameters: the cold open runs once, the stars, the bag
   and the coins are on the HUD, a takedown or two brings the patrols, the
   grid loses them, the hideout banks, busted is reachable at heat 3.

## 8. API facts and traps

Verified against the code at `6b52d03` on 2026-09-22:

- `Pursuit` (`src/sim/police/Pursuit.ts`): `state`, `visible`, `cooldown`,
  `escapes`, `lastX/Z`; `step(dt, level, seen, x, z)`: visible restarts the
  whole window; `lost` counts the level's `escapeSeconds` down and pushes
  `escape` on the step it reaches zero (a 1e-9 epsilon: keep it);
  `reset()`. Level 0 resets every step. The descriptor, `blown`, `onSwap`,
  `lose`, `force`, `markBlown` are additions; keep `step`'s signature.
- `Police` (`src/sim/police/Police.ts`): `units: Int16Array` of agent
  indices, `count`, `budget`, `ramsReceived`; `preStep(player, dt)` runs
  before `Traffic.step`, clears every plan, computes sight, dispatches to
  the roster, writes plans (`traffic.setPolicePlan(agent, next, speed,
  ramX, ramZ, ramSpeed, ramAccel)`), and calls `pursuit.step` itself; a
  wrecked or freed unit is dropped with `reinforceSeconds`; `spawn` scans
  lanes bounded by the lane midpoint, scores toward `spawnBehind`, uses
  `Traffic.outOfView(x, z, radius, player, near, cosHalf)` and
  `canSpawnAt`, then `spawnPoliceAt(lane, s, 'police' | 'sports', player,
  near, cosHalf, clearance)`; `route` is a reverse Dijkstra with
  constructor-owned arrays; `canSee` casts one `RAPIER.Ray` with
  `ONLY_FIXED` from `sightHeight` every `sightEveryTicks`, staggered.
  `POLICE` numbers in `tuning.ts` (budgets, interceptors, sight, spawn,
  chase, ram, PIT, catch-up, recycle).
- `Heat` (`src/sim/heat/Heat.ts`): `points`, `level` from
  `BALANCE.heatThresholds`, `add`, `reset()` (moves the cursor to the ring's
  end), `step()`; a police takedown is told by `Traffic.police[target]`.
- `Traffic` (`src/sim/traffic/Traffic.ts`): `AgentState` enum (append
  `Parked` at the end: `Uint8Array` values are persisted nowhere, but tests
  compare numbers); `police`, `paint`, `state`, `kind`, `lane`, `s`, `x`,
  `z`, `yaw`, `playerDv`, `wallDv`, `trafficDv`; `spawnAtPoint(x, z, yaw,
  kind, Wrecked | Abandoned)` is the off-graph spawn to extend for `Parked`;
  `takeOver(agent, oldKind, oldPaint, oldPose, oldWrecked, out)`;
  `hasBody`, `agentForCollider(handle)`, `nearest(x, z, radius)`,
  `clearAround`, `wreck(i)`, `policeBodies()`; `TRAFFIC.policeBodyReach` 25,
  `policeBodies` 10, `mass.police` 1620, `mass.sports` 1180, `mass.heavy`
  2400; `PAINTS` (eight) and `PLAYER_PAINT` per class; `SwapHandover`.
- `Life` (`src/sim/life/Life.ts`): `state` (`damage`, `stage`, `wrecked`,
  `wreckedFor`, `swapCandidate`, `oncoming`, `slowMo`, `slowMoTarget`,
  `respawnIn`); `preStep(controls, dt)` handles the swap on `controls.swap`
  and the respawn timer; `postStep(dt)` classifies the strongest contact
  (`classify(handle)` → traffic / wall / terrain / prop / none) and applies
  `DAMAGE`; `swap(agent)` (private): `takeOver`, retune in place, teleport,
  `setVelocity`, `heal`, the fist pedestrian, the `swap` event with `target
  = agent`. The spill hook goes into `wreck()`; the spike state next to
  `heal()`; the breach rule inside the damage classification.
- `Vehicle`: `tuning` public and live (the tyre model reads `muFront` /
  `muRear` every step at `Vehicle.ts:786` through `frontGripMul` /
  `rearGripMul`, the drift's multipliers: add `gripMul` beside them, not
  into the tuning); forces are summed in JS and applied once per step
  (`addForce` / `addTorque`): the lateral pull joins that sum.
- `Collectibles` (`src/sim/city/collectibles.ts`): `placeBillboards(cx, cz,
  statics, roadClearance)`, `tallFootprint`, `panelFootprint`,
  `runOutFootprint`, the footprint test in `step(player, minSpeed)` against
  the chassis; `SLOTS_PER_CHUNK` 4; `CityChunk.billboards`. The coins,
  cameras and the sawhorse copy this shape.
- `City` (`src/sim/city/City.ts`): `generate(cx, cz)` per chunk,
  deterministic; `spawns` (`city`, the districts, `highway`, `loop`);
  `nearestLane`, `nearestRoad`; `graph.nodes` with `x, z, outgoing`;
  `LANDMARKS` and `DISTRICTS`; statics are `StaticDesc { shape, position,
  rotation, color, tag?, … }` with `ShapeDesc` box / gable / cylinder /
  wheel / prism; `GROUPS_SOLID`, `GROUPS_TERRAIN` in `collision.ts`;
  buildings carry restitution 1.0 and `GROUPS_SOLID` (decision 11: the
  hideout walls are walls). The playground's `addBox` shows a collider
  built from a desc; Rapier `Collider.setEnabled(bool)` exists in 0.20
  (M3 §8) for the door.
- `SimWorld`: fields per M5 §8; `step()` order in `SimWorld.ts:181–231`;
  `spawnAt(name)`, `nearestSpawn`, `hasNaN`; `mark` phases `vehicle`,
  `traffic`, `peds`, `physics`, `post` (the new systems are `post`).
- `Platform` (`src/platform/Platform.ts`): `requestAd(type):
  Promise<AdResult>` never rejects; `onAdEvent(listener): unsubscribe`;
  `adsAvailable(type)`; `gameplayStart/Stop`; `LocalPlatform` counts calls
  in `calls` (read by the smoke as `platformCalls`), serialises requests,
  shows a DOM overlay for `adDuration` seconds, emits `adStarted` /
  `adFinished` / `adError`; `?ad=off`, `?ad=error&adError=<code>`,
  `?adblock=1`, `?adDuration=<s>`.
- `App` (`src/app/App.ts`): `toggleUserPause` calls `gameplayStop/Start`;
  the focus pause calls neither; `input.blocked`; the slow motion is a
  `timeScale` on `loop.advance`; the first controllable frame fires
  `gameplayStart()` once; `GameHandle` (`started`, `paused`, `sim`,
  `platformCalls`, `errors`, `renderer`, `roadBot`, `bootTimings`);
  `render_game_to_text()`; `?heat=` maps to `SimWorldOptions.heat` (× 20);
  `?manual=1` with `window.advanceTime`.
- Input: `ACTIONS` includes `skip` (no key bound yet: bind `KeyN` for the
  cold open and say so in the README); `KeyboardDevice` latches taps;
  `ActionState.pressed` edges per frame.
- Render: `ChaseCamera.whip / focus / release / kick`; `cut` is an addition;
  `PoliceView` rewrites lens colours in place at 2 Hz and reads
  `Traffic.police`; `Renderer.cars` holds the player mesh per class;
  instanced views pack live instances and set `count` (M3's rule);
  `Billboards` registers from `cityView.onChunk`, the coin view does the
  same.
- HUD: `Hud.update(sim, dt, info, now)`, four recycled popup slots,
  `showToast`, `setPaused`; `HeatHud` (stars); `Minimap.setMarkers`;
  `styles.css` classes `hud__*`; STYLE.md sizes and the skew rule.
- Sfx: `sweep`, `honk`, `yelp`, `crunch`, `boom`, `splinter`, `ding`,
  `whoosh` on the engine's master gain; the ring is read with a bound
  visitor; events before the AudioContext exists are dropped.
- Tests: `helpers.ts` (`createWorld`, `run`, `runUntil`, `kmh`,
  `position`, `upness`, `fullThrottle`); `police.test.ts` shows the view
  cone helper and the bot loop (`TrackBot('muscle', CITY_BOT_TUNING)`,
  `bot.drive(sim, sim.controls, 1/60)`); `takedown.test.ts` the wall
  harness; `swap.test.ts` the parked-car swap; `collectibles.test.ts` the
  placement pins. `pursuit.test.ts` drives `Pursuit` directly with a bare
  `EventLog`.
- e2e: `perf.spec.ts` honours `PERF_HEAT` and `PERF_THROTTLE`; the smoke
  asserts `gameplayStart === 1` over its 20 s (the cold open must not
  fire a second `gameplayStart` before a door: the smoke runs with the bot,
  and the bot skips the cold open); `life.spec.ts` shows the bot-with-life
  pattern; `screens.spec.ts` polls visibility classes.
- Traps: `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` as in
  M5 §8; a 64-entry ring floods at 60 events/s, so the busted bar, the
  spill's ttl and the camera cooldown are state, not events; `Heat.reset`
  moves its cursor, so money events pushed on the door's step after the
  reset are not counted (push the `door` event after the reset, and read
  the bag's events before it); Rapier `setEnabled` on a collider inside a
  contact leaves one step of penetration: enable the door collider only
  with the whole chassis behind the door line (D6's hold at 1); `sessionStorage` is app glue and
  may throw in private windows: wrap it; never `Math.random` under
  `src/sim` (`mulberry32` with a derived seed).

## 9. Five-minute playtest script (for the gate report)

1. `/` with nothing: the cold open. Is the swap offered inside ten
   seconds; did every caption land on its verb; did the door's totals make
   sense.
2. `?spawn=crown`: two takedowns, the stars, the patrols from behind; lose
   them in the grid and count the seconds; watch the bag.
3. Swap out of sight and watch the units box the old car; swap into a
   parked cruiser and drive past the next patrol; smash a billboard in
   front of it and watch the stars.
4. Push to heat 3: the roadblock's light bars from afar; take the sawhorse
   once and the spike once; feel the spiked car; swap to heal.
5. Dive into the hideout with the pursuit on: sit out the 3 s race once
   and bank; once with two units on your bumper, reverse out before the
   bar fills. Read the wall, drive out at heat 0.
6. Get busted on purpose at heat 2: the bar, the last moment, the card, the
   fine; drive on.
7. Wreck with a full bag and scramble for the spill: was ten seconds a
   chance.
8. `?heat=5`: the heavies and the Chief; does the cooldown alone feel like
   an escape.
9. Report what felt wrong before what worked: the bar's timing, the
   multiplier's pull, the spill's read, the disguise's fairness, the
   roadblock's warning distance.

## 10. Reviewer checklist (Claude, at the gate)

- Contracts of §3.3; every number in `balance.ts` or `police/tuning.ts`;
  `docs/BRIEF.md` untouched; the M1–M3 pins and the slice 0–2 pins.
- Step order of §3.2; `App` writes only controls, `timeScale`,
  `skipSlowMo`, `openDoor`, `closeCard`; the door and busted brackets and
  the ad calls in `App` only.
- Allocation audit (§7.4); one `RAPIER.Ray` per system; determinism
  (placement of coins, cameras and parked junctions; two seeded runs
  identical); no `Math.random`, `Date` or storage under `src/sim`.
- The busted-rate measurement and the decision rule (§7.6) with the
  numbers quoted; `BALANCE.measured` for M5 filled.
- The ad paths (8.1–8.5) with the e2e evidence; CRAZYGAMES rows.
- Tests honest: bands as planned, no pin widened, nothing skipped.
- Perf per §6.4 with all runs quoted, including `PERF_HEAT=5`; the
  expected deltas respected or explained.
- Visual review of the seven states at the ten sizes; STYLE.md followed for
  the counters, the bar, the card, the door screen, the coins, the sawhorse
  and strip, the cameras, the liveries.
- Docs: ARCHITECTURE records, STYLE sections, README, BACKLOG (polish
  skipped, update 1), CRAZYGAMES, PROGRESS entries, `M4_REPORT.md` with the
  playtest script and the known issues, `M5_PLAN.md` §1.2 reconciled.
- Then Marcin plays; his notes drive the M4.1 pass before M5.
