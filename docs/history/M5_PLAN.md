# M5 "The launch minimum" — implementation plan

Executor: the agent that starts after the M4 gate. Reviewer: Claude, at the
gate. Director and playtester: Marcin. This document is the milestone
contract: what to build, in which order, with which numbers, and what "done"
means. Where it fixes a decision, the reason is next to it so the spirit can
be applied to cases it did not foresee. Written 2026-09-22 against commit
`ba9a12f`, before M4 slice 3; §1.2 lists what M4 still has to deliver and
measure, and the executor reconciles §3.3 against the M4 code before slice 0.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§3 fixed decisions, §4 progression and save, §6 budgets, §7 ads, §8
verification, §10 how to work), `docs/DESIGN.md` (§2 the run, §3 audience
and progression, §4 activities, §6 the city as a level, §9 KPIs, §11 the
launch scope, §12 the watch list), `docs/PROGRESS.md` (newest first, the M4
gate entry and every M4 measurement), `docs/history/M4_REPORT.md`,
`docs/ARCHITECTURE.md`, `docs/STYLE.md`, `docs/CRAZYGAMES.md` (sections 3,
5, 7, 9, 10, 11), then this file. Run `npm run verify`; it must be green
before the first edit.

## 0. How to work on this milestone

- **Language.** Everything in the repo is English. Talk to Marcin in Polish.
- **Cadence.** One slice at a time (§4), in order. A slice is done when its
  tests pass, `npm run verify` is green, the measurement it asks for is in
  `docs/PROGRESS.md`, and it is committed. Commit small and often; messages
  `<area>: <what changed>` with the why and the numbers in the body, the
  trailer from `CLAUDE.md`.
- **Autonomy.** Marcin is not watching. Decide, act, note the assumption in
  `docs/PROGRESS.md`. Stop only at the gate (§7), before anything
  destructive, to change a fixed decision from the brief or from this plan
  (say so in one paragraph with evidence and keep working under it), or when
  blocked on something only Marcin can provide (feel, real hardware, the
  title). If one part is blocked, finish everything else first.
- **Scope.** Build what this plan asks for, completely. Ideas outside it and
  bugs that do not block the milestone go to `docs/BACKLOG.md` with one line
  of context. Do not refactor what you do not need to touch. Update 2's
  content (races, fares, rage, mayhem, the hunts, the skill chain, the full
  map, hidden cars, new car profiles) is out even when it looks cheap.
- **Honesty.** Never loosen a test, a budget or a pin to get green; if one is
  wrong, say so in PROGRESS and leave it red with the reason. Report numbers
  you measured. "Feel" is Marcin's call.
- **Research.** Three.js 0.186, Rapier 0.20 (`-compat`), TypeScript 5.9
  strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`,
  Vite 8, Vitest 5, Playwright 1.63. Check the installed types instead of
  memory. §8 lists the facts this plan relies on.
- **Perf.** MX330 throttled runs vary ±3 fps on identical code; alternate
  builds before calling a regression; nothing else may render on the
  machine during a measured run (the desktop browser pane included).

## 1. Scope

Brief §9: *"M5 The game. Activities, progression, garage, save, daily
challenges, the cold-open onboarding, UI and audio passes, the balance
simulation."* DESIGN.md §11 (decided 2026-09-22) cuts it to the launch
minimum; the rest ships as update 2 after the first Basic Launch numbers.

### 1.1 In scope (gate-critical, §4 slices 0–8)

1. Save: versioned JSON through the platform adapter, loaded before the sim
   boots, written debounced and at every break; migrations; a size guard.
2. Prices, payouts, heat costs, limits, dailies and the streak in
   `balance.ts`, all in the dev panel.
3. Jobs framework: markers placed by the generator, one active job, the
   Crazy Taxi arrow, the job card and timer on the HUD.
4. Three job types: getaway delivery, steal-to-order, pursuit escape.
5. The garage on the wall of every drop-off (DESIGN.md §6.3): the catalogue (five bodies), paint,
   upgrades (three stats × three tiers), prep items, the rewarded offers
   with cash alternatives, the door's midgame or "double the bag" offer.
6. The cold open finished on the save's seen flag, with the final markers,
   arrow and captions, and no ad at its door.
7. Dailies and the streak: in the launch minimum (DESIGN.md §11, revised
   2026-09-22; the brief lists them in v1 and they are the D1 lever). If
   anything in slice 6 slips, it is the day-7 topper.
8. The balance script (`npm run balance`) with the bot as the capture probe
   and three assertions.
9. UI and audio passes, the ten-size screens with the new states, the gate.

### 1.2 Delivered by M4 and assumed here

From `docs/history/M4_PLAN.md`, all must exist before slice 0; the executor checks
each and lists any gap in PROGRESS before starting:

| Item | M4 slice | Used by |
|---|---|---|
| `sim/run/Run.ts`: bag, bank, coins, `maxHeat`, banked / busted, the fine, the spill | 3 | everything with money |
| `sim/city/cover.ts`: the hideout footprint and door pose, two drop-offs, the chokepoints | 3, 6 | job placement, targets |
| `sim/city/coins.ts`, `render/Coins.ts`, the coin counter | 3 | the cold open route, the spill |
| `render/HideoutView.ts`, `ui/run.ts`: the door, the wall totals, the cut camera, `gameplayStop/Start` around it | 3, 8 | the garage pages |
| `sim/run/ColdOpen.ts`, `ui/coldOpen.ts`: the prototype with a session flag | 4 | slice 5 |
| `sim/jobs/Jobs.ts` skeleton: one delivery kind, marker → target → bag, the timer, the cold open's def | 4 | slice 1 extends it, nothing renamed |
| `app/botPolicy.ts`: the novice and skilled policies over the road bot | 5 | slice 7 |
| twenty stunt jumps, `jump` events into the bag | 6 | dailies templates, the balance model's earnings |
| `Pursuit` descriptor, the identity rule, the disguise, `blown` | 5 | steal-to-order, the respray |
| `Platform.requestAd(kind)` used at the door and the busted card, mute on `adStarted`, input blocked | 8 | the offers |
| events `coin`, `spill`, `banked`, `busted`, `camera`, `roadblock`, `escape` | 3–6 | dailies, jobs |
| measurements: bag and coins per minute, run length (novice bot); busted rate per level, novice and skilled | 3, 6 | §3.4 placeholders, slice 7 |

### 1.3 Out of scope

Street races and rivals, the time trial, fares, takedown rage, mayhem, the
stunt and collectible hunts, the skill chain, the full-screen map, hidden
cars, Muscle Pro / GT / the ice-cream truck profiles, cop mode, ghosts,
accounts, touch (M6), the SDK adapter (M6), any new dependency, any change
to `docs/BRIEF.md`.

### 1.4 Fixed by the brief and still binding

Always in a vehicle; PEGI 12 slapstick; no menu before gameplay (the wall is
a place inside the world); activities start by driving into a marker;
control never taken away for more than 2 s; keyboard first, input
abstracted; low-poly flat-shaded, palette in `src/sim/palette.ts`, no
textures; a fixed 60 Hz step and the sim never sees wall time; `render/`,
`audio/`, `ui/` read sim state and never write it; no per-frame allocation
in hot loops; every number in a typed object; the save under 1 MB.

## 2. Decisions (fixed for M5; each with its reason)

D1. **The save format is a pure sim module; the IO is app glue.**
`sim/save/format.ts` holds the type, defaults, `serialize`, `parse`,
`migrate`, `collect(sim)` and `apply(sim)`, with no `localStorage`, no
`Date`, no DOM; `app/save.ts` owns the platform calls, the debounce and the
lifecycle hooks. Reason: the format gets Node pins (round trip, migration,
corrupt input, size) and the sim stays headless by construction; the IO is
three calls that only the browser can exercise.

D2. **One key, one JSON document, a version field, a migrations table from
day one.** Reason: the SDK data module is key/value with a 1 MB cap counted
over the whole store; one document keeps the size measurable in one place,
and a versioned document with `migrate` means an update never has to choose
between wiping players and shipping a parser for every old shape.

D3. **Time enters the sim as data, never as a clock.** The app passes the
local date string (`YYYY-MM-DD`) into `Dailies.setDate` at boot and once a
minute; the sim never calls `Date`. Reason: determinism and testability;
midnight is a string compare, and a test can be any day.

D4. **Jobs are placed by the generator, not authored.** `place.ts` uses the
billboard placer's clear-footprint query at junction corners and the sites
`cover.ts` exports; deterministic per seed, off the carriageway, at least
`markerMinGap` apart. Reason: brief §4 (the city is generated from a seed);
a hand-placed marker breaks the first time a chunk rule changes.

D5. **Time limits come from the road.** `limit = limitFactor × the lane-path
time between marker and target at the lanes' speed limits`, floored at
`limitMin`. Reason: a table of seconds per job is wrong the moment the
generator moves a marker; the path time is what the bot already computes.

D6. **One active job; markers do nothing while one runs; the door abandons
it.** Reason: the arrow, the card and the timer are singular on the HUD; two
timers on screen fail the twelve-year-old test (DESIGN.md §3.1).

D7. **Steal-to-order is a descriptor, and the traffic guarantees it.**
The job draws a class and a paint; `Traffic.ensure(descriptor)` repaints an
unseen kinematic agent or spawns one 300–600 m away out of view. Reason:
the hunt must be winnable in the time limit wherever the player is; a job
that depends on random traffic is a job that sometimes cannot be done.

D8. **Upgrades are multipliers on the preset, applied on drive-out.** Tier
0 equals the preset bitwise, so every M1 and M4 handling pin stands; the
garage never edits `CAR_PRESETS`. Reason: pins are the approved feel; a
multiplier is one line per stat and the dev panel already edits the
resulting `VehicleTuning`.

D9. **The wall is a place, and its pages are DOM.** The garage lives inside
the door screen M4 built, navigated with the existing actions (steer to
move, throttle to confirm, brake to back out) and clickable, and it is the
same screen at all three drop-offs (DESIGN.md §6.3). Reason: no menu before
gameplay stays true, keyboard-first stays true, touch (M6) gets the buttons
for free, and a run banked at the scrapyard must be able to buy the car it
just earned.

D10. **At most one ad per door, and none at the door that ends the cold
open.** The rewarded "double the bag" offer when the bag is above
`offerThreshold`, else the midgame request; the busted card requests a
midgame ad. Reason: `docs/CRAZYGAMES.md` A1, A5, A6, A10, P2 and the SDK's
own 3-minute pacing; a first ad before the tutorial ends costs conversion.

D11. **Rewarded offers are hidden, never disabled.** `adsAvailable
('rewarded')` false hides the video button and leaves the cash button;
`adError` pays nothing and the cash path stays. Reason: A6 and A12; a button
that does nothing is a rejection at QA.

D12. **The balance script steps the sim for its capture rates.**
`tests/sim/balance.test.ts` runs the bot under the police for three minutes
per level per profile, headless, seed 42, then the EV model of DESIGN.md
§2.7. Reason: DESIGN.md §2.7 says the rates come from the bot, not from
guesses; a script that reads a table proves nothing. It runs outside
`verify` (`npm run balance`) because it takes minutes.

D13. **The launch catalogue is the five bodies that exist.** Muscle
(starter), compact, heavy, sports, police (gated on one heat-5 escape).
Muscle Pro, GT and the ice-cream truck need profiles and are update 2.
Reason: DESIGN.md §11's launch scope; a car is a preset, a profile, a
traffic mesh and a livery, about a day each, and the unlock cadence holds
with five bodies plus nine upgrade tiers.

D14. **Coins are the player's; the bag and the bank are the run's.** Jobs
pay into the bag; dailies and the streak pay into the bank; coins never
enter either. Reason: DESIGN.md §3.2; the twelve-year-old's money is never
at risk and the strategist's is.

## 3. Architecture

### 3.1 New and changed modules

```
src/sim/balance.ts             + prices, tierPrices, tiers, jobs, prep, offer, dailies, save (§3.4)
src/sim/events.ts              + 'jobStart' | 'jobDone' | 'jobFailed' | 'orderFound' | 'purchase' | 'dailyDone' | 'streak'
src/sim/jobs/catalog.ts        JobKind, JobDef, descriptor packing, payouts and limits from balance
src/sim/jobs/place.ts          placeJobs(city, seed): JobDef[] at junction corners and cover sites
src/sim/jobs/Jobs.ts           the state machine, the timer, the target, the wanted agent, events
src/sim/traffic/Traffic.ts     + ensure(descriptor, probe): agent (repaint or spawn out of view), + paintOf(agent)
src/sim/garage/Garage.ts       catalogue, owned, paint, tiers, prep, unlock flag, tuningFor, applyToVehicle
src/sim/dailies/Dailies.ts     templates, the day's three, progress from events and run results, the streak
src/sim/save/format.ts         SaveV1, DEFAULT_SAVE, serialize, parse, migrate, collect, apply
src/sim/run/Run.ts             (M4) + `coins` and `bank` writable by Garage/Dailies through methods, + abandon hook for Jobs
src/sim/run/ColdOpen.ts        (M4) + `seen` from the save, the first-car line data
src/sim/SimWorld.ts            owns jobs, garage, dailies; step order §3.2; `SimWorldOptions.save?: SaveV1`
src/app/save.ts                SaveStore: load, apply, markDirty (debounced), flush, bindLifecycle
src/app/App.ts                 boot loads the save before `new SimWorld`; date ticks; the offers' ad calls; `?fresh=1`
src/render/Arrow.ts            the destination arrow over the car
src/render/MarkerView.ts       instanced rings + beacons for markers; the wanted car's ring
src/render/Renderer.ts         + Arrow, MarkerView
src/ui/jobs.ts                 the job card, timer and distance on the HUD
src/ui/garage.ts               the wall pages: cars, paint, upgrades, prep, dailies; keyboard and click
src/ui/run.ts                  (M4) the door screen hosts the garage pages and the offers
src/ui/hud.ts                  + jobs element; the bag/coin counters exist from M4
src/audio/Sfx.ts               + jobStart, jobDone, jobFailed, purchase, dailyDone one-shots
tools/                         (no new tool; `npm run balance` is a vitest invocation)
package.json                   + "balance": "vitest run tests/sim/balance.test.ts --reporter=verbose"
tests/sim/save.test.ts, jobs.test.ts, order.test.ts, escape.test.ts, garage.test.ts, dailies.test.ts, balance.test.ts
tests/app/save.test.ts         SaveStore with a fake Platform and a fake clock (Node, no DOM)
e2e/game.spec.ts               save round trip across a reload, jobs by the bot, the garage, the offers on every ad path
e2e/screens.spec.ts            + job card, door with totals, garage, busted at the ten sizes
```

### 3.2 Step order in `SimWorld.step()`

`docs/history/M4_PLAN.md` §3.2's order, which already holds `jobs.step` (the M4
skeleton, before `run.step`), with M5's one line added (marked +) and the
jobs line extended:

```
city.sync(player)
transforms.swap(); events.tick = tick
coldOpen.preStep(controls)
life.preStep(controls, dt)             swap (→ pursuit.onSwap, → jobs: the wanted agent taken), respawn timers
vehicle.update(controls, dt)
police.preStep(probe, dt)              sight → pursuit.step inside
traffic.step(probe, dt, events); peds.step(…)
world.step()
vehicle / traffic / peds .writeTransforms()
life.postStep(dt)                      hits, damage, wrecked, takedowns, near misses, billboards
coins.step; cameras.step; roadblocks.step; jumps.step
heat.step()                            the ratchet reads the ring
jobs.step(probe, dt)                   (M4, extended) marker entry, hunting, timer, arrival → bag and events
run.step(probe, dt)                    (M4) bag, maxHeat, busted, the door
dailies.step()                       + progress from the ring
coldOpen.postStep()
tick++, time += dt
```

`Garage` has no step; it acts on calls from the UI through `App` (the one
writer of sim state from outside is still `App`, and only through methods).

### 3.3 Contracts (signatures the reviewer will check against)

```ts
// src/sim/save/format.ts
export const SAVE_VERSION = 1;
export interface SaveV1 {
  v: 1;
  seen: boolean;                                   // the cold open was completed or skipped
  bank: number; coins: number;
  car: CarId;                                      // the garage car (drive-out and boot)
  owned: CarId[];                                  // always contains 'muscle'
  paint: Partial<Record<CarId, number>>;           // 0xRRGGBB; absent = the class default (PLAYER_PAINT)
  tiers: Partial<Record<CarId, [number, number, number]>>;  // power, grip, boost, each 0..3
  prep: { lawyer: boolean; fence: boolean };       // bought for the next run, consumed at its end
  policeUnlocked: boolean;                         // one heat-5 escape
  bestRun: number;                                 // most banked in one run
  smashed: string;                                 // base64 of Collectibles.smashed (49 × 4 bits)
  dailies: { date: string; ids: [number, number, number]; progress: [number, number, number]; done: [boolean, boolean, boolean] };
  streak: { count: number; last: string; topper: boolean };
  runs: number; playSeconds: number;               // KPI rehearsal and the balance script
}
export const DEFAULT_SAVE: Readonly<SaveV1>;
export function serialize(save: SaveV1): string;                 // stable key order
export function parse(text: string | null): SaveV1;              // never throws; unknown → migrate; garbage → defaults
export function migrate(raw: unknown): SaveV1;                   // table keyed by raw.v; unknown version → defaults
export function collect(sim: SimWorld, into: SaveV1): void;      // reads Run, Garage, Dailies, Collectibles, ColdOpen; no allocation beyond the arrays it owns
export function apply(sim: SimWorld, save: SaveV1): void;        // writes them; called once after construction
```

```ts
// src/app/save.ts
export class SaveStore {
  constructor(platform: Platform, key?: string, now?: () => number);   // now for the debounce clock, injectable for tests
  load(): Promise<SaveV1>;                                              // parse(await platform.loadData(key))
  markDirty(): void;                                                    // schedules a write at most once per BALANCE.save.debounceSeconds
  flush(sim: SimWorld): Promise<void>;                                  // collect + serialize + saveData now; no-op if nothing changed
  tick(sim: SimWorld, dt: number): void;                                // drives the debounce from the frame loop
  bindLifecycle(target: Window, sim: SimWorld): () => void;             // pagehide and visibilitychange:hidden → flush
  readonly bytes: number;                                               // last serialized length, for the debug line
}
```

```ts
// src/sim/jobs/catalog.ts
export type JobKind = 'delivery' | 'order' | 'escape';
export interface JobDef {
  id: number; kind: JobKind;
  x: number; z: number; yaw: number;          // marker ring centre and facing
  targetX: number; targetZ: number;           // delivery drop-off or the order's fence; unused for escape
  level: number;                              // escape: 2..4; else 0
  descriptor: number;                         // order: (kindIndex << 24) | paint; else -1
  payout: number; limitSeconds: number; heat: number;
}
export function packDescriptor(kind: CarId, paint: number): number;
export function unpackDescriptor(d: number): { kind: CarId; paint: number };

// src/sim/jobs/place.ts
export function placeJobs(city: City, seed: number, lanes: LaneTables): JobDef[];   // deterministic; counts from BALANCE.jobs.counts

// src/sim/jobs/Jobs.ts (extends the M4 slice 4 skeleton: same class, same names, two kinds and the idle target added)
export type JobState = 'idle' | 'hunting' | 'active' | 'done' | 'failed';
export class Jobs {
  readonly defs: readonly JobDef[];
  state: JobState;
  active: number;                 // def id or -1
  remaining: number;              // seconds; NaN while hunting
  wantedAgent: number;            // order: the traffic agent to take; -1 else
  constructor(sim: SimWorld, defs: JobDef[]);
  step(probe: PlayerProbe, dt: number): void;
  target(out: { x: number; z: number }): boolean;   // the arrow's target; false when idle
  idleTarget(out: { x: number; z: number }): boolean;   // idle: the nearest marker, or the nearest drop-off once the bag is above BALANCE.offer.doorThreshold
  abandon(): void;                                   // the door and busted call it; no event
}
```

```ts
// src/sim/traffic/Traffic.ts (additions)
/** Guarantees an agent of this class and paint 300–600 m from the player and out of view; repaints an unseen kinematic civilian, else spawns. Returns the agent or -1. */
ensure(kind: CarId, paint: number, player: PlayerProbe, near: number, cosHalf: number): number;
paintOf(agent: number): number;
```

```ts
// src/sim/garage/Garage.ts
export type Stat = 'power' | 'grip' | 'boost';
export type BuyResult = 'ok' | 'cash' | 'locked' | 'owned';
export class Garage {
  car: CarId; readonly owned: Set<CarId>; readonly paint: Map<CarId, number>;
  readonly tiers: Record<CarId, [number, number, number]>;
  prep: { lawyer: boolean; fence: boolean }; policeUnlocked: boolean;
  constructor(sim: SimWorld);
  price(car: CarId): number;
  canBuy(car: CarId): BuyResult;
  buy(car: CarId): BuyResult;                  // bank -= price on 'ok'; 'purchase' event
  select(car: CarId): boolean;                 // owned only
  respray(car: CarId, paint: number): void;    // free; the pursuit descriptor follows on drive-out
  tierPrice(car: CarId, stat: Stat): number;   // next tier; Infinity at 3
  upgrade(car: CarId, stat: Stat): BuyResult;
  buyPrep(item: 'lawyer' | 'fence'): BuyResult;
  tuningFor(car: CarId, out: VehicleTuning): VehicleTuning;   // preset × tiers; tier 0 equals the preset
  applyToVehicle(): void;                       // drive-out: retune in place (Life.swap's path), carId, paint
}
```

```ts
// src/sim/dailies/Dailies.ts
export interface DailyTemplate { id: number; text: string; kind: EventKind | 'banked' | 'run'; target: number; car?: CarId; weight: 0 | 1 | 2 }
export const DAILY_TEMPLATES: readonly DailyTemplate[];        // about twelve
export class Dailies {
  date: string; readonly ids: [number, number, number]; readonly progress: [number, number, number]; readonly done: [boolean, boolean, boolean];
  readonly streak: { count: number; last: string; topper: boolean };
  constructor(sim: SimWorld);
  setDate(local: string): void;        // new day → draw three from mulberry32(hash(date)), streak update; same day → no-op
  step(): void;                        // events cursor; completion → bank += reward, 'dailyDone'
  onRunEnd(banked: number, maxHeat: number, busted: boolean): void;
}
```

```ts
// src/render/Arrow.ts
export class Arrow { constructor(scene: THREE.Scene); update(sim: SimWorld, carX: number, carY: number, carZ: number): void; dispose(): void }
// src/render/MarkerView.ts
export class MarkerView { constructor(scene: THREE.Scene, sim: SimWorld); update(sim: SimWorld, alpha: number): void; dispose(): void }
// src/ui/jobs.ts
export class JobsHud { constructor(parent: HTMLElement); update(sim: SimWorld, dt: number): void }
// src/ui/garage.ts
export interface GarageActions { buy(car: CarId): void; select(car: CarId): void; respray(car: CarId, paint: number): void; upgrade(car: CarId, stat: Stat): void; buyPrep(item: 'lawyer' | 'fence'): void; offer(kind: 'lawyer' | 'fence' | 'double'): void; driveOut(): void }
export class GarageUi { constructor(parent: HTMLElement, sim: SimWorld, actions: GarageActions); open(): void; close(): void; navigate(st: ActionState): void; update(sim: SimWorld): void; setAdsAvailable(rewarded: boolean): void }
```

`App` is the only caller of `Garage` methods and of `platform.requestAd`;
the UI reports intents through `GarageActions` and never touches the sim.

### 3.4 Balance object (every number lives here; all in the dev panel)

`src/sim/balance.ts`, extending what M4 leaves there (heat, bag, multipliers,
the fine, the spill, the coin value):

```ts
export const BALANCE = {
  // ... M4: heatThresholds, heat, bag, multiplier, fine, spill, coin
  prices: { compact: 10000, heavy: 30000, sports: 60000, police: 120000 },   // muscle is owned
  tierPrices: [2000, 5000, 12000],
  tiers: {
    power: [1, 1.06, 1.12, 1.20],      // × torqueMax
    grip:  [1, 1.04, 1.08, 1.12],      // × muFront and muRear
    boost: [1, 0.90, 0.80, 0.70],      // × boostDrain (the meter lasts longer)
  },
  jobs: {
    counts: { delivery: 6, order: 6, escape: 4 },
    markerRadius: 4, markerMinGap: 60, beaconHeight: 3,
    delivery: { payoutPerKm: 4000, payoutMin: 5000, payoutMax: 12000, limitFactor: 1.3, limitMin: 45, heat: 6, timeBonus: 0.5 },
    order: { payout: { compact: 4000, heavy: 5000, muscle: 6000, sports: 8000 }, stagePenalty: 0.1, limitSeconds: 240, heat: 4,
             ensureMin: 300, ensureMax: 600, ensureSeconds: 5, ringRange: 150 },
    escape: { bounty: 1500, levels: [2, 2, 3, 4] },
  },
  prep: { lawyer: 5000, lawyerKeep: 0.75, fence: 8000, fenceBonus: 0.5 },
  offer: { doorThreshold: 8000, doorMultiplier: 2 },
  dailies: { rewards: [3000, 5000, 10000], streak: [500, 1000, 1500, 2000, 3000, 4000, 5000] },
  save: { key: 'save', debounceSeconds: 1, maxBytes: 32768 },
  // placeholders replaced from M4's measurements before slice 0 (PROGRESS, M4 slices 3 and 6):
  measured: { bagPerMinute: 0, coinsPerMinute: 0, runSeconds: 0, bustedPerMinute: [0, 0, 0, 0, 0, 0], bustedPerMinuteSkilled: [0, 0, 0, 0, 0, 0] },
  // M4 gate values (docs/history/M4_REPORT.md, seeds 42 / 7 / 123, busted counts including a 10 s re-arm after each card):
  //   bagPerMinute 336–476 from heat 0 (novice bot, 10 min), 600–800 at heat 2 (slice 3a); coinsPerMinute 42–53 with the
  //   slice-3b carpet, 32–40 worth 426–564 a minute with the coin lines of 2026-09-23 (DESIGN.md §3.5: the caps are a third of the take);
  //   runSeconds: no run ended in 10 min from heat 0 (the bot takes no door and nothing arrests it at heat 0–1);
  //   bustedPerMinute [0, 0.33, 0.67, 1.0 (median; mean 1.47), 1.0, 1.07]; bustedPerMinuteSkilled [0, 0.2, 0.33, 0.2, 0.73, 0.27].
};
```

Steal-to-order's payouts exclude the police body: an order for a cruiser is
update 2's job.

## 4. Slices

Each slice: files, behaviour, numbers, tests (file and case names the
reviewer will look for), acceptance.

### Slice 0 — save and prices (1.5 days)

Files: `sim/save/format.ts`, `app/save.ts`, `sim/balance.ts`, `SimWorld.ts`
(`SimWorldOptions.save`), `App.ts`, `tests/sim/save.test.ts`,
`tests/app/save.test.ts`.

Behaviour:

- `App.boot`: `platform.init()` → `SaveStore.load()` → `new SimWorld({ ...,
  save })` → `apply` inside the constructor after every subsystem exists, so
  the garage car, its paint and tiers, the seen flag, the bank, the coins,
  the smashed bitset, the dailies and the streak are in place before the
  first step. `?fresh=1` skips the load and clears the key. `?car=` still
  wins for dev runs (it is a playground/dev parameter, not the save's).
- The store marks dirty on every `banked`, `busted`, `purchase`,
  `dailyDone`, `streak` and `billboard` event read from the ring in
  `App.frame`, writes at most once per `debounceSeconds`, and flushes at the
  door (after the totals are final), on busted, on leaving the garage, on
  `pagehide` and on `visibilitychange` to hidden. The debug line shows
  `save 1.9 kB`.
- `parse` returns `DEFAULT_SAVE` copies for `null`, non-JSON, a JSON that is
  not an object, or a version above `SAVE_VERSION`, and keeps the raw string
  in `SaveStore.unknownRaw` so an older build never overwrites a newer save
  (the write is skipped while `unknownRaw` is set). `migrate` walks a table
  `{ 0: v0 → v1 }` where v0 is "no save".
- `balance.ts` gains §3.4. The `measured` block is filled from PROGRESS
  before the first commit of this slice, with the date and the M4 commit in
  a comment.

Numbers: `save.maxBytes` 32,768; debounce 1 s; the catalogue prices.

Tests:

- `save.test.ts`: 0.1 `serialize → parse` round trip is deep-equal and
  the string is stable across two serializations; 0.2 `parse(null)`,
  `parse('{')`, `parse('42')`, `parse('{"v":99}')` give defaults and do not
  throw; 0.3 a v0 shape (no `v`) migrates to v1 with `owned = ['muscle']`;
  0.4 a save with everything filled (five cars, tiers 3, fifty billboards,
  a long streak) serializes under `maxBytes`; 0.5 `collect` after `apply`
  reproduces the input; 0.6 `apply` on a city world sets `carId`, the
  vehicle mass to the class's, the billboard count and the bank.
- `tests/app/save.test.ts` (Node, a fake `Platform` recording calls and a
  fake clock): 0.7 600 `markDirty` calls in one second produce one
  `saveData`; 0.8 `flush` writes at once and a second `flush` with no change
  writes nothing; 0.9 with `unknownRaw` set no write happens; 0.10 `load`
  on a platform whose `loadData` rejects resolves defaults.

Acceptance: verify green; a reload in the browser keeps the bank, the car
and the billboard count (checked by hand this slice, by `e2e/game.spec.ts`
at the gate); the save bytes after a 15-minute bot session recorded in
PROGRESS.

### Slice 1 — jobs framework, the arrow, getaway delivery (2 days)

Files: `sim/jobs/catalog.ts`, `place.ts`, `Jobs.ts`, `sim/events.ts`,
`SimWorld.ts`, `render/Arrow.ts`, `render/MarkerView.ts`, `Renderer.ts`,
`ui/jobs.ts`, `ui/hud.ts`, `ui/minimap.ts` (markers), `audio/Sfx.ts`,
`tests/sim/jobs.test.ts`.

Behaviour:

- Placement: junction corners of the grid and the authored roads
  (`city.graph.nodes` × four corner aprons at `ROAD_HALF + 6` m along both
  arms), filtered by the billboard placer's `tallFootprint` clearance
  against the chunk's statics and by `roadClearance ≥ markerRadius + 1`
  (off the carriageway), scored by distance to the three drop-off sites so
  deliveries spread over the districts, at least `markerMinGap` apart,
  deterministic from `mulberry32(seed ^ 0x0b5)`. Delivery targets are the
  three drop-off sites from `cover.ts` (the hideout counts as one), the
  nearest that is at least 400 m away by lane path.
- Entry: the chassis centre inside `markerRadius` while `state === 'idle'`
  starts the job: `jobStart` event with `value = payout`, `heat.add(heat)`,
  the card shows for 1.5 s (kind, payout, limit), the arrow points at the
  target, the radar shows it (`setMarkers`). Arrival: chassis centre within
  `markerRadius` of the target → `bag += payout × (1 + timeBonus ×
  remaining / limit)`, `jobDone` with `value = paid`, state `done` for 2 s
  then `idle`. Timer out → `jobFailed`, state `failed` for 2 s then `idle`.
  While `active` other markers do nothing. `abandon()` (door, busted) → idle
  silently.
- The limit per D5: the bot's lane-path time at the lanes' limits between
  the marker's nearest lane and the target's, times `limitFactor`, floored.
  The payout per km of that path, clamped.
- The arrow: one flat chevron (12 triangles, `carOrange`) 2.5 m above the
  car's roof, yawed to the bearing, fixed size; the HUD shows `DELIVERY
  0:48 · 620 m` in the STYLE.md popup type, top centre under the stars.
  Between jobs it does not vanish (DESIGN.md §4, set 2026-09-22): at 40 %
  opacity it points at `idleTarget`, the nearest marker by straight line,
  or the nearest drop-off once the bag is above the door offer's threshold
  (all three doors bank and hold the wall, DESIGN.md §6.3); so nobody
  wanders, and the run's own exit is pointed at exactly when it is worth
  taking. Hidden only inside the cold open (its captions lead) and at the
  door.
- Markers: one instanced mesh of rings (a flat torus, 24 segments) plus a
  beacon post per marker, colour by kind (delivery `carOrange`, order
  `carMagenta`, escape `policeBlue`), all 16 resident always (no chunk
  logic: sixteen instances cost nothing). The active one pulses by scale.
- Sfx: a two-note "job" sting on start, a chord on done, a low buzz on
  failed.

Numbers: §3.4 `jobs.delivery`; the arrow 1.2 m long; markers 4 m rings,
3 m beacons.

Tests (`jobs.test.ts`, city world, seed 42, traffic off unless stated):

- 1.1 placement: exactly 16 defs (6/6/4), deterministic across two
  generations, every marker off the carriageway (`roadClearance` ≥ 5),
  pairwise ≥ 60 m, every delivery target ≥ 400 m by path.
- 1.2 teleporting the car into a delivery ring starts the job: state
  `active`, one `jobStart`, heat +6 exactly once, `remaining` equals the
  limit within 1/60 s.
- 1.3 the arrow: `target()` true and the bearing from the car to the target
  matches within 2° (Node, the same maths the render uses).
- 1.4 arrival by teleport with 30 s left on a 90 s limit pays `payout ×
  (1 + 0.5 × 30/90)` into the bag within 1 unit; `jobDone`; state idle
  after 2 s.
- 1.5 the timer fails it: `jobFailed`, no bag change, heat kept.
- 1.6 a second marker entered while active does nothing; `abandon()` goes
  idle with no event.
- 1.7 the bot drives a delivery: from the marker to the target by
  `lanePath`, arrives inside the limit (this is also the measurement).
- 1.8 idle: with no job the arrow's target is the nearest marker; with the
  bag above `offer.doorThreshold` it is the nearest drop-off's door pose;
  during a job it is the job's target.

Acceptance: verify green; smoke draw calls +2 to +4 (arrow, markers, their
shadow draws); the bot's delivery time against the limit and the payout in
PROGRESS.

### Slice 2 — steal-to-order (2 days)

Files: `sim/traffic/Traffic.ts` (`ensure`, `paintOf`), `sim/jobs/Jobs.ts`,
`render/MarkerView.ts` (the wanted ring), `ui/jobs.ts`,
`tests/sim/order.test.ts`.

Behaviour:

- The six orders deliver to three fences: the two drop-offs other than
  the hideout (the scrapyard, the hotel garage) and a third site
  (`cover.ts` exports a `fence` in Palm Gardens; if M4 did not, add it in
  `cover.ts` beside the drop-offs: a lot corner on the parkway). Each order's descriptor is drawn
  from the four non-police classes and `PAINTS` at generation, so the card
  can say "CYAN COMPACT" from data.
- Entry: state `hunting`, `jobStart`, the card says the descriptor, the
  arrow and the radar point at the wanted agent once it exists.
  `Traffic.ensure` runs on entry and again every `ensureSeconds` while
  `wantedAgent < 0` or the agent is wrecked or taken by someone else: it
  prefers an unseen kinematic civilian of the class (repaint, `paintSerial`
  bump so the view recolours), else spawns one on a lane 300–600 m away
  through the police spawner's out-of-view search. The ring under the agent
  shows within `ringRange` and in view. `orderFound` event when it first
  exists.
- The swap: on the `swap` event whose target is `wantedAgent`, state
  `active`, `remaining = limitSeconds`, `heat.add(heat)`, the arrow turns to
  the fence. A swap into any other car does nothing to the job (the player
  may swap around while hunting). Arrival at the fence pays
  `payout[kind] × (1 − stagePenalty × life.state.stage)`; stage 4 (a wreck)
  cannot arrive, the job waits; the timer fails it.
- The car left behind at the swap keeps the player's paint and the
  identity rule (M4) applies unchanged.

Numbers: §3.4 `jobs.order`.

Tests (`order.test.ts`, city, traffic on, seed 42):

- 2.1 the guarantee: for each of the 24 class × paint combinations,
  `ensure` returns an agent within 5 s of sim time, 300–600 m away, out of
  the view cone; never the player's own paint for the class.
- 2.2 an unseen civilian is repainted rather than spawned when one exists
  (agent count unchanged, `paintOf` matches).
- 2.3 entering an order ring goes `hunting`; the swap into the wanted agent
  goes `active`, adds heat once, starts the timer; a swap into another car
  first leaves it `hunting`.
- 2.4 delivery at stage 0 pays the full class payout, at stage 2 pays 80 %
  (the test sets `life.state.damage` and `stage`), at stage 4 does not
  arrive.
- 2.5 wrecking the wanted car (`Traffic.wreck`) before the swap retargets
  within 5 s to a different agent of the same descriptor.
- 2.6 the abandoned car after the swap has the player's paint and state
  `Abandoned`.

Acceptance: verify green; the bot's hunt time with the naive policy and the
repaint/spawn share in PROGRESS.

### Slice 3 — pursuit escape (1 day)

Files: `sim/jobs/Jobs.ts`, `sim/jobs/place.ts`, `tests/sim/escape.test.ts`.

Behaviour: the four markers at the chokepoints (`cover.ts`: the on-ramps)
with levels 2, 2, 3, 4. Entry: `heat.add(max(0, threshold[level] −
heat.points))`, `pursuit` forced to `active` with `visible = true` this step
(M4's `Pursuit` gets a `force()`), the police roster follows from the level
by M4's rule; state `active` with no timer (`remaining = NaN`, the card
shows `ESCAPE ★★★`). The `escape` event ends it: `bag += bounty × level`,
`jobDone`. `busted` ends it silently (the fine already applied).

Tests: 3.1 entering sets heat to at least the threshold and the pursuit to
`active` on the same step; 3.2 the escape pays `bounty × level` into the
bag; 3.3 a higher current heat is kept (the ratchet never lowers); 3.4
busted ends the job with no bounty; 3.5 the level-4 marker's roster is the
level-4 budget within 3 s.

Acceptance: verify green; the skilled bot's escape rate per marker in
PROGRESS.

### Slice 4 — the garage: catalogue, paint, upgrades, prep, the offers (2.5 days)

Files: `sim/garage/Garage.ts`, `sim/run/Run.ts` (bank methods), `ui/garage.ts`,
`ui/run.ts`, `ui/styles.css`, `App.ts` (actions, ad calls, input block),
`render/carMesh.ts` (paint per car if M3's `PLAYER_PAINT` was the only
source), `render/PoliceView.ts` (the descriptor's paint on the respray),
`tests/sim/garage.test.ts`, `e2e/game.spec.ts` (first cases).

Behaviour:

- The wall, the same at all three drop-offs: after M4's totals, `steerRight`
  pages to CARS, PAINT, TUNE, PREP, DAILIES (slice 6), `steerLeft` back, `throttle` confirms, `brake`
  backs out one level, any page's DRIVE OUT (or `throttle` on the door
  page) closes the wall and opens the door. Every button is a DOM button
  with the same handler, so a click does what the key does. Focus and the
  selected item are visible at DPR 1 (STYLE.md: ≥ 12 px labels, the
  primary numbers ≥ 44 px, skew, flat shadows).
- CARS: the five bodies with price or OWNED or LOCKED (the police car shows
  "ESCAPE HEAT 5 FIRST" until `policeUnlocked`); buying takes the bank;
  selecting an owned car marks it for drive-out. PAINT: the seven car paints
  from `PALETTE` for the selected car, free, applied at once to the mesh in
  the garage. TUNE: three rows, the tier dots, the next price. PREP: the
  lawyer and the fence, each with a cash button and, when `adsAvailable
  ('rewarded')`, a video button of the same size and style with the video
  icon; bought items show BOUGHT and are consumed at the next run's end.
- The door offer (M4's door screen): when `bag > offerThreshold` and
  rewarded ads are available, a "DOUBLE THE BAG" video button beside a
  same-size "BANK IT"; else the midgame request fires once when the totals
  appear (not at the cold open's door). The sequence on any ad: `input.blocked
  = true` → `requestAd` → on `adStarted` the master gain to 0 → on
  `adFinished` the reward (double the bag before the multiplier is applied,
  or the prep item) and unmute → on `adError` unmute, no reward, the cash
  path still there. `happyTime()` on the first car purchase.
- Drive-out: `Garage.applyToVehicle()` retunes in place through the swap
  path (`Vehicle.tuning = tuningFor(car)`, `applyTuning()`, the mesh per
  class, the paint), sets `carId`, updates the pursuit descriptor's paint
  (the respray is the M4 design's respray), then M4's door opens and
  `gameplayStart()` fires. `SaveStore.flush`.

Numbers: §3.4 `prices`, `tierPrices`, `tiers`, `prep`, `offer`.

Tests (`garage.test.ts`):

- 4.1 `buy` with enough bank returns `ok`, takes the price, adds to owned,
  pushes `purchase`; with less returns `cash` and changes nothing; the
  police car returns `locked` until `policeUnlocked`; an owned car returns
  `owned`.
- 4.2 `tuningFor` at tiers [0,0,0] deep-equals the preset; at [3,3,3]
  `torqueMax` ×1.20, `muFront`/`muRear` ×1.12, `boostDrain` ×0.70, nothing
  else changed.
- 4.3 `applyToVehicle` on a city world: `carId`, `vehicle.tuning.mass`
  equals the class's, the vehicle keeps its pose and velocity, damage 0.
- 4.4 the compact at tier 3 power does 0–100 faster than at tier 0 and the
  tier-0 numbers still pass `cars.test.ts`'s band (run both in this test).
- 4.5 `respray` changes `paint.get(car)` and, after `applyToVehicle`, the
  pursuit descriptor's paint.
- 4.6 the lawyer: a busted run with `prep.lawyer` banks `bag × 0.75`, the
  flag clears; the fence: a banked run multiplies by `(multiplier + 0.5)`,
  the flag clears.
- `e2e/game.spec.ts` (against the preview build, `?manual=1` where a step
  count matters): 4.7 with `?ad=off` the video buttons are absent and the
  cash buttons present; 4.8 with `?ad=error&adError=other` the door's
  double offer ends with the bag unchanged, the input unblocked, the master
  gain back to its value; 4.9 with default ads the double offer doubles the
  bag once and `platformCalls.adRequests` is 1 for that door; 4.10 the
  garage is reachable by keys alone from the door and DRIVE OUT fires
  `gameplayStart` once more than before.

Acceptance: verify green; `npm run screens` with the garage at the ten
sizes inspected; the keypress count from the door to driving out in a new
car in PROGRESS (target under 8).

### Slice 5 — the cold open finished (1 day)

Files: `sim/run/ColdOpen.ts`, `ui/coldOpen.ts`, `App.ts`, `tests/sim/coldOpen.test.ts` (M4's, extended),
`e2e/game.spec.ts`.

Behaviour: `seen` from the save; the script runs only when `!seen`; the
`skip` action or completion sets it and marks the store dirty; the delivery
inside it is the real delivery job type on a dedicated def (id 0, not among
the sixteen, so the marker count stays); the arrow from slice 1 replaces the
prototype's stand-in; the totals at its door show "FIRST NEW CAR: 10,000 ·
YOU HAVE n" from the bank and `prices.compact`; that door makes no ad
request (`Run.firstDoor` flag) and offers nothing.

Tests: 5.1 with `save.seen = false` the script is active at boot, with
`true` it is not; 5.2 completing it sets `seen`; 5.3 the bot completes the
six events in order inside 120 s (M4's pin, kept); e2e 5.4 a fresh profile
sees the first caption within 3 s of control and after a reload the script
does not run; 5.5 `platformCalls.adRequests` is 0 after the first door.

Acceptance: verify green; Marcin's first minute on `?fresh=1` with a
stopwatch, the time to each verb, in PROGRESS.

### Slice 6 — dailies and the streak (1.5 days)

Files: `sim/dailies/Dailies.ts`, `SimWorld.ts`, `App.ts` (the date tick),
`ui/garage.ts` (the DAILIES page), `render/carMesh.ts` (the topper),
`tests/sim/dailies.test.ts`.

Behaviour:

- Templates (about twelve, `DAILY_TEMPLATES`): bank N in one run (N by
  weight), escape from heat L, K takedowns in a `car`, smash N billboards,
  deliver an order at stage 0, complete K deliveries, K police takedowns,
  pick up N coins, K near misses, bank K runs without a busted. Each
  carries `weight` 0/1/2 → `rewards[weight]`.
- The daily police seed (DESIGN.md §8, low; set 2026-09-22): the same
  `fnv1a(date)` seeds the choice of roadblock chokepoints, parked-patrol
  junctions and camera sites in `cover.ts` (an `order` permutation over
  the fixed site lists, nothing new placed), so today's police are today's
  and the challenges sit on them; jobs, coins, ramps and the city stay
  fixed so the map stays learnable. `?date=YYYY-MM-DD` overrides the local
  date for tests and playtests.
- `setDate(local)`: a different date draws three distinct templates from
  `mulberry32(fnv1a(date))`, resets progress, and updates the streak:
  `last` is yesterday → `count + 1`, today → no-op, else → 1; `topper` set
  when `count` reaches 7; the day's streak cash (`streak[min(count, 7) −
  1]`) goes to the bank once per day (`streak` event). `App` calls it at
  boot and once a minute from the frame loop with the local date.
- `step()` consumes the ring for event-typed templates; `onRunEnd` handles
  the run-typed ones (called by `Run` at banked/busted). Completion: `bank
  += reward`, `dailyDone`, `done[i] = true`.
- The topper: one mesh (a rooftop cone of `carOrange`, 40 triangles)
  attached to whichever car the player drives, visible when
  `streak.topper`; survives a swap (it is the player's).

Tests: 6.0 two dates give different chokepoint orders and the same date
the same, and the job, coin and ramp placements are identical across dates;
6.1 the same date twice gives the same ids; two dates differ in at
least one id; the three are distinct; 6.2 a "K takedowns in a compact"
template counts only takedowns while `carId === 'compact'`; 6.3 a "bank N"
template completes on `onRunEnd(N, …, false)` and pays into the bank; 6.4
the streak: yesterday → today increments, a gap resets to 1, the same day
twice is a no-op, day 7 sets the topper; 6.5 the day's streak cash pays
once per date.

Acceptance: verify green; the DAILIES page at the ten sizes.

### Slice 7 — the balance script (1 day)

Files: `tests/sim/balance.test.ts`, `package.json` (`npm run balance`),
`sim/balance.ts` (numbers tuned), `docs/PROGRESS.md` (the table).

Behaviour: one vitest file, excluded from `verify` by a path filter in
`vite.config.ts` (`test.exclude: ['tests/sim/balance.test.ts']` when
`process.env.BALANCE !== '1'`; the script sets it) so it never slows the
gate. It:

1. Runs the road bot under the police headless for 180 s at each level 1–5
   with the `novice` and `skilled` policies of `app/botPolicy.ts` (M4 slice
   5), seed 42, traffic on,
   and records busted per minute per level. About 5 × 2 × 10,800 steps, a
   few minutes in Node.
2. Builds the EV model of DESIGN.md §2.7 with those rates, the measured bag
   per minute, coins per minute and the job payouts (one job per level, two
   minutes each as in §2.7), prints the table per cash-out level for both
   profiles.
3. Simulates the first hour of a novice with the optimal cash-out (runs of
   the measured length, dailies excluded) and prints the minute at which
   each purchase becomes affordable in the order compact → tier 1 power →
   heavy → tier 1 grip → tier 2 power → sports → …
4. Asserts: (a) the optimal cash-out level is higher for the skilled
   profile than for the novice; (b) the compact is affordable between
   minute 5 and 7; (c) no gap between affordable purchases exceeds 10
   minutes in the first hour and none is under 3.

Tests: the three assertions are the test; the table goes to PROGRESS with
the date and the commit; `balance.ts` numbers are changed until they hold,
and the change is listed with its reason.

Acceptance: `npm run balance` green; the table in PROGRESS; `verify`
unaffected in time (check the test count and duration).

### Slice 8 — UI and audio pass, the gate (1.5 days)

Files: `ui/styles.css`, `ui/hud.ts`, `ui/jobs.ts`, `ui/garage.ts`,
`audio/Sfx.ts`, `audio/EngineAudio.ts` (the music bed hook), `docs/ASSETS.md`,
`e2e/screens.spec.ts`, `e2e/game.spec.ts`, `docs/history/M5_REPORT.md`.

Behaviour:

- The HUD at the ten sizes with everything on: stars, bag, coins, the job
  card with timer and distance, the boost and damage bars, the radar with
  markers, popups. Nothing overlaps at 800×450; the primary numbers ≥ 44 px,
  labels ≥ 12 px; text shadows; the skew rule. The pause overlay names the
  mute key and the state.
- Audio: sirens by heat if M4's polish did not land them (a two-tone
  oscillator per unit within 120 m, pitch by class, one voice per unit type
  at most), the job stings, the coin chime (from M4), the door thud, the
  purchase ka-ching, the daily fanfare; all on the master gain. The music
  bed: one CC0 loop fetched after `gameplayStart()` (never before), looped
  through the master gain at −14 dB under the engine, listed in
  `docs/ASSETS.md` with URL and licence; if no track with a clean licence
  is found in an hour of looking, ship without and write that down.
- Screens: `e2e/screens.spec.ts` captures `hud`, `pause`, `life`, `job`,
  `door`, `garage`, `busted` at the ten sizes (the door, garage and busted
  states are reached through `window.__game` hooks, not by driving) and the
  executor looks at all seventy images.
- The gate per §7.

## 5. Verification

### 5.1 Headless tests (Vitest, Node)

- Every test builds its world through `tests/sim/helpers.ts`
  (`createWorld`, `run`, `runUntil`, `kmh`, `position`) and disposes it in
  `finally`; city worlds pass `traffic: 0, peds: 0` unless the test needs
  them; seeds are explicit.
- Deterministic setups over random ones: teleport into markers, `spawnAt`
  the wanted car, set `life.state` for damage cases, drive the ring with
  `events.push` for dailies.
- Bands where a playtest knob influences the result; exact numbers for
  arithmetic (prices, payouts, the fine), determinism and counting.
- The existing pins do not change. `cars.test.ts` is re-run inside
  `garage.test.ts` 4.4 at tier 0, not edited.
- Long pins (bot or traffic-pool drives over about 10 s of wall time) go
  into `tests/**/*.long.test.ts` and run in `npm run verify:gate`
  (`CLAUDE.md`, working method); the quick `verify` stays under a minute
  of tests. The balance script is outside both.
- New tests land around 50 on top of M4's count.

### 5.2 `e2e/game.spec.ts` (Playwright, against the preview build)

Six cases: the save round trip across a reload (bank, car, billboards);
a delivery completed by the bot from a `?job=<id>` start parameter that
teleports it into the ring; an order found and taken by the bot (the swap
by `window.__game` after the bot reaches the ring); the garage reachable by
keys and a purchase applied on drive-out; the offers on `?ad=off`,
`?ad=error&adError=other` and default; the cold open once and not twice.
All with `errors.toEqual([])`.

### 5.3 `e2e/screens.spec.ts`

Seven states at ten sizes, DPR 1; the run takes about ten minutes; run it
at the gate and after slices 4 and 8, and look at the images.

### 5.4 Performance protocol

Bases: the M4 gate's two `npm run perf` runs (`perf/m4-gate-1.json`,
`-2.json`, the summary lines in PROGRESS). After slices 1, 2, 4 and 8 run
`npm run perf` once; at the gate twice, and compare: a regression claim
needs both new runs worse than both bases. Expected deltas: draw calls +3
to +5 (arrow, markers, the wanted ring and their shadow draws), triangles
+2k to +6k, step mean +0.1 ms (sixteen defs and one cursor per step), heap
+2 MB. Exceeding any twofold stops the slice for a profile. Marcin's
`perf:headed` is asked for in the gate report.

### 5.5 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify:gate` | green, lint 0 warnings, the long pins included | tools/verify.mjs |
| Startup bytes before gameplay-start | ≤ 8 MB target, 12 MB fail; the music bed loads after it | tools/budget.mjs |
| Time to control, 20 Mbit + CPU ×4 | ≤ 6 s (the save load is one adapter call; it must not add a visible phase) | e2e/city.spec.ts |
| Draw calls / triangles, low tier, tour | ≤ 150 / 250k | e2e/city.spec.ts |
| JS heap | ≤ 250 MB | perf |
| Sim step p95 under CPU ×4 | < 12 ms | e2e/perf.spec.ts |
| Frame p95 under CPU ×4, real GPU | < 33.4 ms | e2e/perf.spec.ts |
| Save size, everything filled | < 32 kB | tests/sim/save.test.ts |
| `npm run balance` | three assertions green | tests/sim/balance.test.ts |

## 6. Records

PROGRESS entry per session as in `docs/history/M3_PLAN.md` §6.1 (Done /
Verification / Decided and why / Next / Open problems, newest first, absolute
dates). The gate report `docs/history/M5_REPORT.md` per `CLAUDE.md`: built, verify
and perf numbers with the A/B, how to run, the five-minute playtest, the
knobs and where they live, known issues, the proposed M6 scope (which is
`docs/history/M6_PLAN.md`; say what M5 changed in it).

## 7. Gate criteria (definition of done for M5)

1. Slices 0–8 committed with their tests (the day-7 topper is the one
   item that may move to update 2, with one line in BACKLOG).
2. `npm run verify:gate` green; `npm run balance` green with its table in
   PROGRESS; `npm run game` (the new e2e) 6/6; `npm run city` and `npm run
   life` still green; `npm run screens` seventy images captured and
   inspected.
3. Every budget in §5.5 holds; the perf comparison per §5.4 with all four
   runs quoted.
4. No per-frame allocation in `Jobs.step`, `Dailies.step`,
   `SaveStore.tick`, `Arrow.update`, `MarkerView.update`, `JobsHud.update`
   (the reviewer greps as in M3 §7.5).
5. Layering intact; `tsconfig.sim.json` clean (no `Date`, no
   `localStorage` under `src/sim`); no new dependency; `docs/BRIEF.md`
   untouched; every M1–M4 pin unchanged.
6. The ad rules hold on every path: one request per door, none at the cold
   open's door, hidden video buttons with ads off, no reward on error, mute
   only from `adStarted`.
7. `docs/CRAZYGAMES.md` rows D1, D2, D5, A5–A10, A12, Q1, G10, P2, M1, M2
   updated with their status and the reason; ARCHITECTURE decision records
   for D1–D14 that surprised anyone; STYLE.md sections for the wall, the
   card, the arrow and the markers; README; BACKLOG; `docs/history/M5_REPORT.md`.
8. A fresh profile on `/` gets the cold open, banks, buys the compact on the
   second or third run, and every job type is reachable by driving.

## 8. API facts and traps

Verified against the code at `ba9a12f` on 2026-09-22 (re-verify after the
M4 gate; the M4 items are per `docs/history/M4_PLAN.md`):

- `Platform` (`src/platform/Platform.ts`): `saveData(key, value:
  string): Promise<void>`, `loadData(key): Promise<string | null>`,
  `clearData(key)`, `requestAd(type): Promise<AdResult>` never rejects,
  `onAdEvent(listener): unsubscribe`, `adsAvailable(type): boolean`,
  `happyTime()`. `LocalPlatform` URL switches: `?ad=off`,
  `?ad=error&adError=<code>`, `?adblock=1`, `?adDuration=<s>`. M4 slice 8
  wires the door; check the final shape.
- `InputManager.blocked` zeroes every action while true and still reads
  devices so a tap latched during an ad is dropped (M4 decision 25). Use it
  for the ad window, never a second flag.
- `KeyboardDevice` latches taps until read (`tapped`); the garage's
  navigation reads `st.pressed.*` edges from `ActionState`, which already
  derive from that.
- `EventLog` (`src/sim/events.ts`): 64 entries, `push(kind, value, x, y, z,
  target)`, `readFrom(from, visit)` returns the next sequence; consumers keep
  a cursor and a bound visitor; `EventKind` is a string union, extend it in
  place. Sixty events per second flood the ring: push once per state
  change, never per step.
- `SimWorld` (`src/sim/SimWorld.ts`): `carId` is mutable; `probe` is the
  shared `PlayerProbe`; `spawns`, `city`, `traffic`, `peds`, `life`, `heat`,
  `pursuit`, `police`, `collectibles`, `events`, `vehicle`, `controls`;
  `SimWorldOptions` has `map`, `seed`, `tuning`, `spawn`, `car`, `record`,
  `traffic`, `peds`, `damage`, `heat`; add `save`. `mark` is the phase
  hook; keep the new steps inside the `post` phase.
- `Vehicle`: `tuning` is a public mutable field; `applyTuning()` rebuilds
  the collider and wheels; `Life.swap` is the retune-in-place path
  (`tuning` replaced, `applyTuning`, teleport with velocity, heal). The
  garage's drive-out uses the same three calls without the teleport.
  `VehicleTuning` fields for the tiers: `torqueMax`, `muFront`, `muRear`,
  `boostDrain` (`src/sim/vehicle/tuning.ts`); `CAR_PRESETS` are
  `cloneTuning` results, never mutate them.
- `Traffic` (`src/sim/traffic/Traffic.ts`): typed-array records `state`,
  `kind`, `paint`, `police`, `lane`, `s`, `x`, `z`, `yaw`; `paintSerial`
  bumps when a paint changes so `TrafficView` recolours; `outOfView(x, z,
  radius, player, near, cosHalf)`; `spawnPoliceAt` shows the out-of-view
  lane search to copy for `ensure`; `spawnAt(lane, s, kind, state, offset)`;
  `takeOver(agent, …, out: SwapHandover)`; `wreck(i)`; `nearest(x, z,
  radius)`; `PAINTS` and `PLAYER_PAINT` (the class colour the traffic never
  uses; an order never asks for it).
- `City` (`src/sim/city/City.ts`): `graph` (`nodes`, `lanes`, `special`),
  `spawns`, `nearestLane(x, z)`, `nearestRoad(x, z, out)`, `generate(cx,
  cz)` returns `CityChunk { statics, billboards }`; `roads.ts` exports
  `lanePath(lane, next)`, `projectOnLane`, `distanceToPolyline`, `BLOCK`,
  `ROAD_HALF`, `chunkCoord`. `collectibles.ts` exports `tallFootprint`,
  `panelFootprint`, `runOutFootprint`, `placeBillboards(cx, cz, statics,
  roadClearance)`: the placement helpers to reuse for markers.
  `Collectibles.smashed` is a `Uint8Array(49 × 4)`; `smashedCount` is
  writable (the screens spec sets it).
- The bot: `BotDriver` (`src/app/bot.ts`) with `drive(sim, controls, dt)`
  and `resets`; the city route bot is `TrackBot` with `CITY_BOT_TUNING`;
  the lane-path timing for D5 comes from `lanes.ts` (`LaneTables`, per-lane
  length and speed limits from `TRAFFIC.speed*`).
- HUD (`src/ui/hud.ts`): `update(sim, dt, info, now)`, `showToast`,
  `setPaused`, `setHints`; popups are four recycled slots; DOM writes only on
  change (compare the last text). `Minimap.setMarkers(readonly
  MinimapMarker[])` with `{ x, z, kind, color, yaw? }`; pass a reused array.
  `HeatHud` is the stars. `DebugPanel` takes extra numeric objects keyed by
  section title (`DebugPanelActions.extra: Record<string, Record<string,
  number>>`, flat records only); register the flat sub-objects
  (`BALANCE.jobs.delivery`, `.order`, `.escape`, `BALANCE.prep`,
  `BALANCE.offer`, `BALANCE.save`) as sections, not the nested parents.
- Renderer (`src/render/Renderer.ts`): `cityView.onChunk` is the hook the
  billboards use; `chase.whip/focus/release/kick`; the player mesh per class
  lives in `this.cars`; `stats` for draw calls. Instanced meshes with
  `count` set to the live number (M3's packing rule) so empty slots are not
  submitted.
- Audio: `EngineAudio.master` is the one gain; `setMuted(bool)` is the ad
  hook; `Sfx.update(sim)` reads the ring with a bound visitor; the
  AudioContext exists only after a user gesture, so a sting during the cold
  open's first second may be dropped, which is fine.
- e2e conventions: `window.__game` (`started`, `paused`, `sim`,
  `platformCalls`, `errors`, `renderer`), `render_game_to_text()`,
  `?manual=1` with `window.advanceTime(ms)` for deterministic stepping;
  `page.keyboard.press('KeyP')` for keys by code; the screens spec sets
  `deviceScaleFactor: 1`; all specs run against `vite preview` on 4173
  (`playwright.config.ts`, `reuseExistingServer`). The startup gate reads
  `bootTimings`.
- `tools/verify.mjs` runs `vitest run` over `tests/**/*.test.ts`
  (`vite.config.ts` `test.include`); excluding the balance file needs the
  `test.exclude` entry described in slice 7. `tools/budget.mjs` reads
  `perf/startup.json` from the smoke run; the music bed must be requested
  after `gameplayStart()` or it counts.
- Traps: `exactOptionalPropertyTypes` rejects `{ save: undefined }`, spread
  conditionally as `App.boot` does; `noUncheckedIndexedAccess` makes every
  typed-array read `number | undefined`, use the `as number` pattern the
  sim already uses in hot loops; `Object.fromEntries` and `.map` allocate,
  keep them out of `step`; Rapier collider handles are f64 bit patterns,
  Map keys only.

## 9. Five-minute playtest script (for the gate report)

1. `?fresh=1`: the cold open, swap inside ten seconds, the delivery, the
   door; the totals say how far the compact is.
2. Run two: bank at heat 2, open the wall, buy the compact, pick a paint,
   drive out; the car and the colour are the new ones.
3. Drive into a delivery ring; the arrow, the timer, the distance; deliver
   with time left and read the payout popup.
4. Drive into an order; find the ringed car on the radar; swap; scrape a
   wall on the way and compare the payout with a clean one.
5. Drive into an escape marker at level 3; get out; the bounty.
6. Buy the lawyer, get busted on purpose; the fine keeps three quarters.
7. Open DAILIES; read the three; reload the page; everything kept.
8. Report what felt wrong before what worked: the wall's navigation, the
   card's legibility at 800×450, the arrow's size, the hunt's length, the
   prices.

## 10. Reviewer checklist (Claude, at the gate)

- Contracts of §3.3 honoured; every number in `balance.ts`, nothing
  hard-coded in logic; the `measured` block filled from PROGRESS with the
  date; `docs/BRIEF.md` untouched; the M1–M4 pins unchanged.
- Step order of §3.2; `App` is the only writer from outside the sim and
  only through methods; the UI reports intents through `GarageActions`.
- The save: pure format with pins, IO in app, one key, the version, the
  `unknownRaw` guard, the flush points, the size guard.
- The ad rules on every path (§7.6) with the e2e evidence.
- Allocation audit of the hot paths (§7.4); determinism (two seeded runs
  identical for placement, orders and dailies); no `Math.random`, `Date` or
  `localStorage` under `src/sim`.
- Tests honest: bands as planned, no pin widened, nothing skipped.
- Perf per §5.4 with all four runs quoted; the expected deltas respected or
  explained.
- Visual review of the seventy screens; STYLE.md followed for the wall, the
  card, the arrow and the markers.
- Docs: ARCHITECTURE records, STYLE sections, README, BACKLOG, CRAZYGAMES
  rows, PROGRESS entries, `M5_REPORT.md` with the playtest script and the
  known issues, `M6_PLAN.md` amended where M5 changed its inputs.
- Then Marcin plays; his notes drive the M5.1 pass before M6.
