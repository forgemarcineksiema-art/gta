# M3 "Life" — implementation plan

Executor: Grok 4.7 XHigh in Cursor. Reviewer: Claude (Fable 5.1), after the gate.
Director and playtester: Marcin. This document is the milestone contract: it says
what to build, in which order, with which numbers, and what "done" means. Where
it fixes a decision, the reason is next to it so you can apply the spirit to
cases it did not foresee. Written 2026-09-21 against commit `04425e7`.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§3 fixed decisions, §4 systems, §6 budgets, §8 verification, §10 how to work),
`docs/PROGRESS.md` (newest session first), `docs/ARCHITECTURE.md`,
`docs/STYLE.md`, then this file. Run `npm run verify`; it must be green before
your first edit (109 tests, build ~3.4 MB, smoke ~60 fps on the MX330).

## 0. How to work on this milestone

- **Language.** Everything in the repo is English: code, comments, docs,
  commit messages, in-game text. Talk to Marcin in Polish.
- **Branch.** Work on `grok/m3-life` from `main`. Marcin merges after Claude's
  review, the way the `codex/*` branches were merged. Never rewrite history,
  never `git worktree remove` (it once followed the `node_modules` junction and
  deleted `node_modules/.bin`).
- **Cadence.** One slice at a time (§4), in order. A slice is done when its
  tests pass, `npm run verify` is green, the numbers it asks for are recorded in
  `docs/PROGRESS.md`, and it is committed. Commit small and often; never leave
  significant work uncommitted. Commit messages: `<area>: <what changed>`,
  body with the why and the numbers, trailer
  `Co-Authored-By: Grok 4.7` (no email).
- **Autonomy.** Marcin is not watching. Decide, act, note the assumption in
  `docs/PROGRESS.md`. Stop only at the M3 gate (§7), before anything
  destructive, when you want to change a fixed decision from the brief or from
  this plan (say so in one paragraph with evidence and keep working under it),
  or when blocked on something only Marcin can provide (real-hardware numbers,
  feel). If one part is blocked, finish everything else first.
- **Scope.** Build what this plan asks for, completely. Ideas outside it, and
  bugs that do not block the milestone, go to `docs/BACKLOG.md` with one line
  of context. Do not refactor what you do not need to touch.
- **Honesty.** Never loosen a test, a budget or a pin to get green; if one is
  wrong, say so in `PROGRESS.md` and leave it red with the reason. Report
  numbers you measured, not numbers you expect. "Feel" is Marcin's call:
  never write that handling or an effect "feels right".
- **Research.** Three.js 0.186, Rapier 0.20 (`-compat`) and TypeScript 5.9
  strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  Check the installed types (`node_modules/@dimforge/rapier3d-compat/dist/**/*.d.ts`,
  `node_modules/@types/three`) instead of memory. §8 lists the API facts this
  plan relies on and the traps that have already bitten previous sessions.

## 1. Scope

Brief §9: *"M3 Life. Traffic with simulation LOD, dodging pedestrians,
collisions, damage, car-swap, takedowns, near misses and the boost economy,
collectibles."*

In scope (gate-critical, §4 slices 1–8):

1. Traffic on the road graph with simulation LOD: kinematic lane followers,
   promoted to Rapier dynamic bodies near the player or on impact.
2. Pedestrians on the pavements: instanced, kinematic, always dodge, never hit.
3. Collisions with traffic and the hit classification the rest needs.
4. Damage on the player's car: stages, detachable parts, smoke, fire, wrecked,
   rolling respawn.
5. Car-swap on `E`: take any traffic car, fresh and undamaged; camera whip; the
   former driver shakes a fist in the road.
6. Takedowns: ram a traffic car into a wall or into traffic; short takedown
   camera with slow motion ≤ 1.2 s, skippable.
7. Near misses (traffic, oncoming, pedestrians), the oncoming-lane bonus, and
   the boost economy that turns risk into boost, with HUD popups and audio.
8. Collectibles: 50 smashable billboards with a counter, session-only state
   (persistence is M5's save).

Stretch (§4 slice 9, only after §7's gate criteria are all met with margin):
parked cars in the kerbside bays, 20 stunt ramps, 10 speed cameras.

Out of scope (do not build; backlog if you have an idea): police and heat
(M4), busted/ad flows (M4), activities, cash, progression, save, onboarding
(M5), touch (M6), a full map, boost chaining beyond a 0..1 meter, traffic
wheel spin, day/night, any new dependency.

Fixed by the brief and still binding: the player is always in a vehicle;
PEGI 12 slapstick (pedestrians always dodge and can never be hit; no blood);
control is never taken away for more than 2 s; one seamless city; keyboard
first, input abstracted; low-poly flat-shaded, palette in `src/sim/palette.ts`,
no per-asset textures; sim runs a fixed 60 Hz step and never sees wall time;
`render/`, `audio/`, `ui/` read sim state and never write it; no per-frame
allocation in hot loops; every number lives in a typed tuning object.

## 2. Decisions (fixed for M3; each with its reason)

D1. **Traffic agents are pooled typed-array records, not objects with bodies.**
A fixed pool (`TRAFFIC.agents`, default 48) lives in `Traffic`; a smaller pool of
pre-created Rapier dynamic bodies (`TRAFFIC.physicsBodies`, default 16) is lent
to the agents nearest the player. Reason: the brief's simulation LOD, and the
M0 backlog note that Rapier binding calls allocate per body per step. A
kinematic agent costs a polyline lookup; only lent bodies cost physics.

D2. **Near agents are dynamic bodies driven by velocity, not kinematic bodies.**
A Rapier kinematic body has infinite mass: hitting one feels like a wall and it
cannot be pushed into a takedown. A dynamic body whose linear and angular
velocity are steered toward its path each step follows the lane like a kinematic
one, yet a hit displaces it and the contact impulse reaches the player's chassis
through the existing manifold readback. When disturbed it goes fully physical
until it settles.

D3. **The highway gets two traffic lanes per direction by sub-lane offset, not
by changing the graph.** Traffic on a highway lane picks offset −2 m (inner) or
+6 m (outer) from the graph lane, which sits 6 m from the centre, so cars sit in
the painted lanes at 4 and 12 m. Changing `buildRoadGraph` would touch the Euler
tour, the markings generator, the minimap and three test pins for a cosmetic
gain; it stays in the backlog with the bot's straddling note.

D4. **Sim events are a ring buffer the other layers poll.** `sim.events` is a
fixed 64-entry log with a monotonically increasing sequence; HUD, audio and
renderer each remember the last sequence they consumed. No callbacks from the
sim into other layers, no allocation per event, headless-testable, and M5 can
attach cash to the same events.

D5. **Damage is a rule set outside `Vehicle`.** `Vehicle` reports impacts (it
already does) plus the strongest contact's collider handle; `Life` classifies
the hit (traffic, building or wall, prop, terrain) and applies `DAMAGE` rules.
`Vehicle` gains one flag, `engineCut`, which the wrecked state sets. The M1
handling pins must not move; keeping damage out of the vehicle model is how.

D6. **Car-swap re-tunes the player's `Vehicle` in place.** The player keeps
their `Vehicle` instance, transform slots and body: `tuning` is replaced by the
target class preset, `applyTuning()` rebuilds the collider, the body is
teleported onto the target's pose with the target's velocity. The renderer
pre-builds one `CarMesh` per class and toggles visibility. Reason: no slot
churn, no renderer rebuild at swap time, the camera has one object to follow.

D7. **Pedestrians have no colliders.** They are positions on pavement paths
with a dodge controller and a last-resort guarantee (a lateral hop) that makes
"can never be hit" true by construction, which is what PEGI 12 slapstick asks
for. They cost nothing in Rapier.

D8. **Billboards are pass-through triggers with a visible smash, not solids.**
A solid billboard would be a wall at highway speed. A smashable one is a
reward: the car passes through, loses 5 % speed for feedback, planks fly,
the counter ticks. They are a separate instanced mesh, not part of the merged
chunk geometry, so one can disappear without regenerating a chunk.

D9. **Slow motion is a time scale on the fixed-step loop.** The takedown camera
feeds `frameDt × timeScale` into `FixedStepLoop.advance`; the sim never knows.
Deterministic, no special-case stepping, input keeps flowing (control is never
taken away), and any pressed action ends it early.

D10. **Traffic density is identical on both quality tiers in M3.** Decision 13
of M2 (never change gameplay by quality) wins over the brief's "traffic density"
tier lever until M6 needs it for mobile; the pool size is a tuning number so
that day costs one line.

D11. **Traffic classes are the player's classes.** Agents use `CarId`
(`muscle`, `compact`, `heavy`) with their real presets, so a swap always yields
a real car. Variety comes from paint colours. Traffic-only silhouettes are
backlog.

D12. **Tests and tours run with traffic off unless they test traffic.** The M2
whole-graph tour pins zero resets and impact < 2, which traffic would break by
design. `SimWorldOptions.traffic` (density scale, default 1) and the URL
parameter `?traffic=0` turn it off; `?peds=0` likewise. The real-time perf run
(`?bot=1`) keeps traffic on because that is the cost being measured.

## 3. Architecture

### 3.1 New and changed modules

```
src/sim/random.ts              mulberry32 (moved from app/bot.ts; app re-imports it from sim)
src/sim/events.ts              EventLog, SimEvent, EventKind
src/sim/economy.ts             ECONOMY (boost per event, near-miss geometry), DAMAGE (stages, rates), SWAP
src/sim/traffic/tuning.ts      TRAFFIC, PEDS
src/sim/traffic/lanes.ts       per-lane length tables, connection cache, position/heading at s, sub-lane offsets
src/sim/traffic/Traffic.ts     agent pool, lane following, junctions, LOD, hits, wrecks, swap take-over
src/sim/traffic/Pedestrians.ts pavement paths, walking, dodge, guarantee, poses
src/sim/life/Life.ts           hit classification, damage, wrecked/respawn, swap, takedown, near miss, oncoming
src/sim/city/collectibles.ts   billboard placement from the road graph + seed; smash state
src/sim/SimWorld.ts            owns traffic, peds, life, collectibles, events; carId mutable; step order
src/sim/controls.ts            + swap: boolean (edge, consumed by SimWorld)
src/sim/vehicle/Vehicle.ts     + engineCut, + hitHandle / hitImpulse in telemetry, + setVelocity for swap
src/render/trafficMesh.ts      low-poly loft per CarId for InstancedMesh (≤ 400 triangles per car)
src/render/TrafficView.ts      one InstancedMesh per class, instance colour, wreck tint
src/render/PedView.ts          one InstancedMesh, poses by matrix
src/render/Billboards.ts       one InstancedMesh, hides smashed instances
src/render/Debris.ts           pooled boxes with fake physics (parts, planks)
src/render/Smoke.ts            pooled points: grey/black smoke, fire
src/render/ChaseCamera.ts      + whip(), + focus(target, seconds)
src/render/Renderer.ts         + views above, + event consumption, + player mesh per class
src/render/carMesh.ts          + setDamage(stage): paint soot, bumper groups hidden
src/ui/hud.ts                  + popups, swap prompt, damage bar, billboard counter, wrecked overlay
src/audio/Sfx.ts               one-shot synthesised stings driven by events
src/app/App.ts                 + timeScale, URL params, dev panel section, render_game_to_text fields
src/app/trackBot.ts            + brake for traffic ahead (perf run realism)
tests/sim/traffic.test.ts, pedestrians.test.ts, damage.test.ts, swap.test.ts,
tests/sim/takedown.test.ts, economy.test.ts, collectibles.test.ts, events.test.ts
tests/render/trafficMesh.test.ts, tests/render/camera.test.ts (+ whip, focus)
e2e/life.spec.ts, e2e/screens.spec.ts (+ life state), e2e/city.spec.ts (?traffic=0 on the tour)
```

Layering is lint-enforced: `sim` imports only `sim` and Rapier; `render`,
`audio`, `ui` import `sim` (read-only by convention) and never each other;
`app` imports everything. `tsconfig.sim.json` compiles `src/sim` without DOM
types; anything DOM-shaped in `sim` fails typecheck.

### 3.2 Step order in `SimWorld.step()`

```
city.sync(player)                        (unchanged)
transforms.swap()
life.preStep(controls)                   swap request → Traffic.takeOver + Vehicle retune/teleport; respawn timers
vehicle.update(controls, dt)             (unchanged; honours engineCut)
traffic.step(player, dt)                 kinematic advance; velocity control on lent bodies; LOD lend/return; spawn/despawn
peds.step(player, traffic, dt)           walk; dodge; guarantee
world.step()
vehicle.writeTransforms()
traffic.writeTransforms(); peds.writeTransforms()
life.postStep(dt)                        classify hits, damage, wrecked, takedowns, near misses, oncoming, billboards → events
collectibles.step(player)                (called from life.postStep)
tick++, time += dt                       (unchanged)
```

Everything after `world.step()` reads Rapier once per body into the
`TransformBuffer` (raise its capacity from 512 to 1024). Renderer, HUD and audio
read `sim.transforms`, `sim.traffic`, `sim.peds`, `sim.collectibles`,
`sim.events`, `sim.vehicle.telemetry`.

### 3.3 Contracts (signatures the reviewer will check against)

```ts
// src/sim/events.ts
export type EventKind =
  | 'nearMiss' | 'nearMissOncoming' | 'nearMissPed' | 'oncoming'
  | 'hit' | 'damage' | 'wrecked' | 'respawn'
  | 'takedown' | 'takedownTraffic' | 'swap' | 'billboard' | 'honk';
export interface SimEvent { kind: EventKind; value: number; x: number; y: number; z: number; tick: number; target: number; seq: number }
export class EventLog {
  readonly capacity: number;            // 64, entries pre-allocated
  sequence: number;                     // next seq to assign
  push(kind: EventKind, value: number, x: number, y: number, z: number, target?: number): void;
  /** Copies events with seq >= from into out (oldest first); returns the next seq to read from. */
  readFrom(from: number, out: SimEvent[]): number;   // out is a caller-owned reusable array
}
```

`value` is the boost granted (0..1) or the damage stage or the speed lost;
`target` is a traffic agent index, a billboard index or -1. The renderer, HUD
and audio each keep `private lastSeq = 0` and one reusable `SimEvent[]`.

```ts
// src/sim/traffic/Traffic.ts
export enum AgentState { Free = 0, Kinematic = 1, Physical = 2, Disturbed = 3, Wrecked = 4, Abandoned = 5 }
export interface PlayerProbe { x: number; z: number; yaw: number; vx: number; vz: number; speed: number; halfWidth: number; halfLength: number }
export class Traffic {
  constructor(world: RAPIER.World, transforms: TransformBuffer, city: City, seed: number, tuning?: TrafficTuning, density?: number);
  readonly tuning: TrafficTuning;
  readonly capacity: number;
  // SoA state (typed arrays, length = capacity): state, kind (CarId index), paint (0xRRGGBB), slot,
  // lane, next, s, laneOffset, speed, x, z, yaw, disturbedFor, wreckedFor, lastPlayerContactTick, honkCooldown
  count(state: AgentState): number;
  step(player: PlayerProbe, dt: number, events: EventLog): void;
  writeTransforms(): void;
  /** Agent index that owns this collider handle, or -1. O(1): a Map<number, number> updated on lend/return. */
  agentForCollider(handle: number): number;
  /** Nearest agent to (x, z) within radius, or -1. */
  nearest(x: number, z: number, radius: number): number;
  /** Swap: the agent stops being traffic at its pose (returned), and the player's old car becomes an Abandoned agent there. */
  takeOver(agent: number, oldKind: CarId, oldPaint: number, oldPose: { x: number; y: number; z: number; yaw: number }): { x: number; y: number; z: number; yaw: number; vx: number; vz: number; kind: CarId };
  /** Test and e2e hook: deterministic placement. */
  spawnAt(lane: number, s: number, kind: CarId, state?: AgentState): number;
  /** Clears agents within radius of a point (respawn safety). */
  clearAround(x: number, z: number, radius: number): void;
}
```

```ts
// src/sim/traffic/Pedestrians.ts
export enum PedPose { Walk = 0, Dive = 1, GetUp = 2, Fist = 3 }
export class Pedestrians {
  constructor(transforms: TransformBuffer, city: City, seed: number, tuning?: PedTuning, density?: number);
  readonly capacity: number;
  // SoA: active, slot, lane, side, s, speed, x, z, yaw, pose, poseFor, tint
  step(player: PlayerProbe, traffic: Traffic | null, dt: number, events: EventLog): void;
  writeTransforms(): void;
  spawnAt(x: number, z: number, yaw: number, pose?: PedPose): number;
  /** True if any active pedestrian's centre is inside the player's chassis footprint (test assertion). */
  overlapsPlayer(player: PlayerProbe): boolean;
}
```

```ts
// src/sim/life/Life.ts
export interface LifeState {
  damage: number;            // 0..1
  stage: 0 | 1 | 2 | 3 | 4;  // clean, dented, smoking, burning, wrecked
  wrecked: boolean;
  wreckedFor: number;        // seconds since wreck
  swapCandidate: number;     // agent index or -1, refreshed every step
  oncoming: boolean;         // in the oncoming lane at speed this step
  slowMo: number;            // seconds of takedown slow motion left (App reads; 0 = none)
  slowMoTarget: number;      // agent index the takedown camera looks at, or -1
  respawnIn: number;         // seconds until automatic respawn while wrecked, or -1
}
export class Life {
  readonly state: LifeState;
  constructor(sim: SimWorld);      // reads sim.vehicle, sim.traffic, sim.peds, sim.collectibles, sim.events
  preStep(controls: VehicleControls, dt: number): void;
  postStep(dt: number): void;
  skipSlowMo(): void;              // the only write the app makes into life state besides controls
}
```

```ts
// src/sim/city/collectibles.ts
export interface BillboardDesc { x: number; z: number; yaw: number; width: number; height: number; paint: number; stripe: number }
export class Collectibles {
  readonly billboards: BillboardDesc[];     // exactly 50, deterministic from the graph and the seed
  readonly smashed: Uint8Array;
  smashedCount: number;
  /** Returns the index smashed this step or -1. Overlap test: player footprint vs billboard OBB in XZ. */
  step(player: PlayerProbe, minSpeed: number): number;
}
```

`VehicleControls` gains `swap: boolean` (edge-triggered like `reset`;
`clearControls` clears it). `VehicleTelemetry` gains `hitHandle: number`
(collider handle of the strongest contact this step, -1 if none) and
`hitImpulse: number` (its summed normal impulse, N·s). `Vehicle` gains
`engineCut = false` (throttle and boost ignored while true; brakes, steering
and handbrake work) and `setVelocity(vx, vy, vz)` (swap carries speed over).
`SimWorld.carId` becomes mutable and `SimWorld` exposes `traffic`, `peds`,
`life`, `collectibles`, `events` (`traffic`, `peds`, `collectibles` are null on
the playground; `events` and `life` always exist). `SimWorldOptions` gains
`traffic?: number` and `peds?: number` (density scales, 0 disables).

### 3.4 Tuning objects (every number lives here; all live-editable in the dev panel)

`src/sim/traffic/tuning.ts`:

```ts
export interface TrafficTuning {
  agents: 48; physicsBodies: 16;
  spawnMin: 150; spawnMax: 300; despawn: 320;        // m from the player; spawn behind the velocity or beyond 230 m
  physicsRadius: 40; physicsRelease: 60;             // lend a body inside 40 m, return it beyond 60 m
  speedStreet: 14; speedHighway: 22; speedAvenue: 16; speedParkway: 16; speedQuay: 14; speedService: 11; speedJunction: 8;  // m/s
  accel: 3; brake: 6; gapMin: 6; gapTime: 1.2;       // following: gap = gapMin + speed × gapTime
  playerGap: 25; playerLateral: 2.6;                 // treat the player as a leader inside this box ahead on the path
  junctionWait: 6; junctionClear: 26;                // seconds before entering anyway; m past the node that frees it
  highwayGap: 25;                                    // side streets enter the highway only if no highway agent is within 25 m of the node
  disturbedImpact: 1.5; disturbedTime: 2.0; reattachDistance: 4; reattachBlend: 1.5;
  wreckImpact: 7; wreckLinger: 10;                   // m/s of speed change in a step that wrecks a disturbed agent; seconds it stays
  honkCooldown: 3; wobbleTime: 1;
  subLaneOffsets: { highway: [-2, 6]; street: [0] };
  kindWeights: { compact: 0.5; muscle: 0.3; heavy: 0.2 };
  mass: { compact: 1050; muscle: 1300; heavy: 2400 }; friction: 0.6; restitution: 0.3; linearDamping: 0.6; angularDamping: 1.5;
}
export interface PedTuning {
  count: 40; spawnMin: 90; spawnMax: 180; despawn: 220; walkSpeed: [1.1, 1.6];
  lookAhead: 0.7;          // seconds of car travel the dodge corridor is predicted over
  corridorHalfWidth: 2.6;  // m either side of the car's predicted path that triggers a dive
  diveSpeed: 6; diveTime: 0.5; getUpTime: 0.8; fistTime: 4;
  guaranteeDistance: 1.3;  // if a car centre gets this close despite the dive, hop 3 m sideways
  hopDistance: 3;
}
```

`src/sim/economy.ts`:

```ts
export interface Economy {
  nearMissGap: 1.5;  nearMissSpeed: 12;  nearMissBoost: 0.12;  nearMissOncomingBoost: 0.20;  nearMissCooldown: 2;
  oncomingSpeed: 16; oncomingLaneDistance: 4; oncomingBoostPerSecond: 0.10; oncomingHysteresis: 0.3;
  pedDodgeBoost: 0.04; pedDodgeDistance: 3;
  takedownBoost: 0.5; takedownTrafficBoost: 0.6; takedownWindow: 2.5; takedownClosingSpeed: 14; takedownDeltaV: 7;
  billboardBoost: 0.25; billboardMinSpeed: 5.5; billboardSpeedLoss: 0.05;
  slowMoSeconds: 1.2; slowMoScale: 0.35;
}
export interface DamageRules {
  threshold: 4;        // m/s of speed lost in one step below which a hit does no damage (props and taps)
  perMetrePerSecond: 0.05;
  stages: [0.3, 0.6, 0.85, 1.0];   // dented, smoking, burning, wrecked
  trafficFactor: 0.7;  // hits on traffic count 70 % (the other car moves)
  wreckRespawn: 3;     // seconds after a wreck before the automatic respawn (R respawns at once, E swaps at once)
  respawnSpeed: 8;     // m/s rolling respawn
  respawnClear: 15;    // m of traffic cleared around the respawn point
}
export interface SwapRules { range: 6; lateral: 4; maxRelativeSpeed: 20; airborneAllowed: false; whipSeconds: 0.35 }
```

The values above are the starting defaults (write them as real numbers in the
code, the literal types here are documentation); they are playtest knobs, not
pins. Tests pin behaviour bands wide enough to survive Marcin's retuning (§5).

## 4. Slices

Each slice: goal, files, behaviour, numbers, tests, acceptance, what to record.
Do not start a slice before the previous one is committed with verify green.
Day estimates are for pacing only; correctness and the numbers decide.

### Slice 0 — scaffolding (half a day)

- `src/sim/random.ts`: move `mulberry32` from `src/app/bot.ts`; `app/bot.ts`
  imports it from `../sim`. `sim/city/City.ts` has a private `random(seed)`
  with the same algorithm; replace it with the shared one (identical output,
  the city test's "identical geometry from a seed" pin proves it).
- `src/sim/events.ts` per §3.3, with `tests/sim/events.test.ts`: push 70
  events, reading from a stale sequence returns the last 64 oldest-first,
  reading twice returns nothing new, no allocation after construction (the
  entries array length never changes).
- `VehicleControls.swap`, `Vehicle.engineCut`, `Vehicle.setVelocity`,
  telemetry `hitHandle`/`hitImpulse` (from `onPair`/`onManifold`: track the pair
  with the largest summed impulse this step; `other.handle` is a number).
- `TransformBuffer(1024)`.
- `SimWorldOptions.traffic/peds`, URL params `?traffic=`, `?peds=` parsed in
  `App.boot`, `?life=0` sets both to 0.
- `render_game_to_text()` gains `carId`, `damage`, `traffic`, `peds`,
  `billboards`, `events` (last five kinds) so browser QA can read the state
  (fields may be null until their slice lands).

Acceptance: verify green, 109 + new tests, no behaviour change (the smoke
numbers within run-to-run noise).

### Slice 1 — traffic on the lanes (kinematic) and its rendering (2–3 days)

Files: `sim/traffic/lanes.ts`, `sim/traffic/tuning.ts`, `sim/traffic/Traffic.ts`
(kinematic part), `render/trafficMesh.ts`, `render/TrafficView.ts`,
`SimWorld.ts`, `Renderer.ts`, `tests/sim/traffic.test.ts`,
`tests/render/trafficMesh.test.ts`.

Lane tables (`lanes.ts`), built once per `Traffic` from `city.graph`:

- Per lane: cumulative length along `lane.points`, total length, and a
  `positionAt(lane, s, offset, out)` that writes x, z, yaw for a distance `s`
  along the polyline with a lateral `offset` to the right (+X is left when
  facing +Z; reuse the maths of `offsetRight` in `roads.ts`).
- Per (lane, next) pair: the 24-sample connection curve from `lanePath` in
  `roads.ts`, cached on first use in a `Map<number, Float32Array>` keyed
  `lane * 1024 + next` (178 lanes × ≤ 5 next; built lazily so boot pays
  nothing). An agent's path is "its lane, then the connection, then the next
  lane": `s` runs past the lane length into the connection, then resets on the
  next lane.
- Lane speed limit from `Lane.highway` / `Lane.special` (§3.4). Connection
  speed `speedJunction` for turns; straight-through connections (heading change
  < 15°) keep the lane limit.

Agents (`Traffic.ts`):

- Pool of `agents` records in typed arrays, all `Free` at start. Spawn keeps
  the active count at `agents × density`: pick a random lane whose midpoint is
  between `spawnMin` and `spawnMax` from the player and either behind the
  player's velocity (dot of the lane midpoint offset with the velocity < 0) or
  beyond 230 m; pick `s` uniformly; reject if another agent is within
  `gapMin + 8` on the same lane; kind by `kindWeights`; paint from a fixed list
  of eight palette colours (`carLime`, `carBlue`, `carOrange`, `carMagenta`,
  `carWhite`, `carBlack`, `CITY_COLORS.mint`, `CITY_COLORS.peach`); sub-lane
  offset by lane type. Despawn beyond `despawn`. All random draws come from
  one `mulberry32(seed ^ 0x7a11)` so two worlds with the same seed and inputs
  produce identical traffic.
- Following: agents on one lane are kept in `s` order (insertion into a
  per-lane small list; ≤ 8 per lane in practice). The leader is the next agent
  ahead on the same lane, else the first agent on the chosen `next` lane
  within 20 m. Desired speed = min(limit, speed the assumed brake reaches at
  the gap): `v = sqrt(2 × brake × max(0, gap − gapMin))` with
  `gap = leaderS − s − 4.5`. Speed moves toward the desired one at `accel` up
  or `brake` down per second. Never negative.
- The player as a leader: project the player onto the agent's lane
  (`projectOnLane`); if the projection is ahead within `playerGap` and the
  lateral distance is under `playerLateral`, the player is the leader with that
  gap. Agents therefore brake behind a slow player and stop behind a stopped
  one; they never overtake in M3.
- Junctions: at `s ≥ length − 6` an agent chooses `next` (uniform among
  `lane.next` excluding the U-turn, which is the lane back to `from`; U-turns
  only if nothing else exists) and asks to enter the node. Reservation per
  node (`Int32Array(49)`, -1 = free): turning connections, and every
  connection from a non-highway lane, need the node free or held by
  themselves; straight-through highway connections do not reserve. A side
  street entering a highway node additionally waits while any highway agent
  is within `highwayGap` of the node and approaching. A waiting agent
  decelerates to a stop at the lane end; after `junctionWait` seconds it enters
  anyway (no deadlocks, comic honk event). The reservation frees when the
  holder is `junctionClear` metres along the next lane, or after 8 s.
- Player in the junction: an agent waiting to enter also waits while the
  player's chassis is within 12 m of the node centre.
- Honk: when the player passes within 2 m of an agent's footprint at relative
  speed > 8 m/s, push `honk` (target = agent) with `honkCooldown`; the agent
  wobbles its yaw ±5° for `wobbleTime` (visual only, does not change `s`).
- `writeTransforms`: every active agent writes its slot (y = 0.03 on the road;
  yaw from the path plus wobble). Kinematic agents interpolate like everything
  else because they write `curr` each step.

Rendering (`trafficMesh.ts`, `TrafficView.ts`):

- `buildTrafficGeometry(profile: CarProfile, tuning: VehicleTuning)`: the loft
  through the profile's sections only (floor/belt/roof rings, closed nose and
  tail caps), no arch cuts, no decals, plus four 10-segment wheel cylinders at
  the preset's wheelbase/track/radius, glass band between belt and roof in
  `glassDark`, tyres in `rubber`. Paintable vertices carry white vertex
  colour, fixed parts their own colour; the instance colour multiplies (dark
  parts stay dark). Budget: ≤ 400 triangles per car (pin in
  `tests/render/trafficMesh.test.ts`, Node, no WebGL, like `carMesh.test.ts`).
- `TrafficView`: one `THREE.InstancedMesh` per `CarId`, capacity = pool,
  `frustumCulled = false` (instances span the fog radius), `castShadow` on,
  `receiveShadow` on, `MeshLambertMaterial({ vertexColors: true, flatShading: true })`.
  Each frame: for each active agent of that kind write the interpolated
  transform from `sim.transforms` into the instance matrix (reuse one `Matrix4`,
  one `Quaternion`, one `Vector3`); inactive instances get a zero-scale matrix;
  `instanceMatrix.needsUpdate = true`. Colours are written only when an agent
  spawns or wrecks (`instanceColor.needsUpdate` then). Wrecked agents are
  tinted `charcoal`.
- Draw calls: 3 (+3 in the shadow pass). No per-frame allocation.

Tests (`tests/sim/traffic.test.ts`), all with `map: 'city'`, `record: false`:

1. **Stays on the lane.** 30 s of the road bot with traffic on; every step,
   every kinematic agent is within 0.6 m of `positionAt(lane, s, offset)` and
   its speed ≤ its lane limit + 0.1.
2. **No overlaps.** Over 60 s, the minimum distance between any two kinematic
   agents on the same lane ≥ 4.5 m and between any two active agents ≥ 2.5 m
   (junction reservation works). Log the count of agents that waited past
   `junctionWait`.
3. **Deterministic.** Two worlds, same seed, same scripted inputs, 600 steps:
   identical agent `x`, `z`, `state` arrays.
4. **Player as leader.** Spawn an agent 30 m behind a stopped player on the
   same lane; within 8 s it stops with a gap in `[gapMin − 1, gapMin + 3]` and
   never touches the player (no `hit` event).
5. **Cost.** 3,600 steps with 48 agents: mean step time logged; assert
   `< 3 ms` per step in Node (the player vehicle alone measures 0.24 ms).

Acceptance: `npm run verify` green; `npm run city` still 5/5 (the tour runs
with `?traffic=0&peds=0`, add the parameters to `e2e/city.spec.ts`);
`npm run perf` with traffic on: draw calls and triangles recorded in
`PROGRESS.md` next to the pre-slice numbers (baseline in `perf/latest.json`:
84 draws, 176k max triangles, step p95 6.1 ms, heap 45 MB).

### Slice 2 — simulation LOD and collisions (2 days)

Files: `Traffic.ts` (physical part), `SimWorld.ts`, `Vehicle.ts` (telemetry
only), `Life.ts` (hit classification only), `tests/sim/traffic.test.ts`.

- Body pool: at construction create `physicsBodies` dynamic bodies, each with
  one cuboid collider sized per kind at lend time (`applyTuning`-style rebuild:
  remove and create the collider with the kind's half extents; the body is
  reused). Bodies start `setEnabled(false)` parked at y = −50. Collider:
  friction 0.6 with the Max rule, restitution 0.3 with Multiply, groups
  `GROUPS_SOLID`, mass from `TRAFFIC.mass` via `setMassProperties` with a low
  centre of mass (y = 0.3), `setCcdEnabled(true)`, linear and angular damping
  from tuning. `body.userData = agentIndex`; `Traffic.agentForCollider` maps
  the collider handle to the agent (Map updated on lend/return).
- Lend: every step, agents within `physicsRadius` of the player (nearest
  first) get a body if free: `setEnabled(true)`, teleport to the agent pose
  (`setTranslation`, `setRotation`, `setLinvel` along the path), state
  `Physical`. Return: `Physical` agents beyond `physicsRelease` write their
  body pose back into `x, z, yaw, s` (project on the lane) and give the body
  up. If the pool is exhausted, the farthest undisturbed `Physical` agent is
  returned first. Extra rule: an agent the player's velocity extrapolated over
  0.5 s comes within 8 m of is lent a body regardless of distance.
- Velocity control (`Physical`): each step, target point 8 m ahead along the
  path; desired velocity = direction × desired speed (same following rules
  as kinematic); `linvel += (desired − linvel) × min(1, 6 dt)` written with
  `setLinvel`; `angvel.y` steered toward the heading error with gain 4 and
  damping 2 (`setAngvel`), x/z angular velocity left to physics. The pose
  stays authoritative from Rapier while `Physical`: `s` is re-projected from
  the body each step (local search along the polyline from the last `s`).
- Disturbance: read each lent body's contact impulses like the vehicle does
  (`world.contactPairsWith(collider, cb)` + `contactPair` manifolds, bound
  callbacks, no allocation); if the summed impulse / mass exceeds
  `disturbedImpact`, state `Disturbed` for `disturbedTime` with no velocity
  control (damping only). When the timer ends: upright (`up.y > 0.7`), speed
  < 6 m/s and within `reattachDistance` of a lane → back to `Physical` with the
  control blended in over `reattachBlend`; otherwise `Wrecked`.
- Wrecked: engine off, body stays physical for `wreckLinger` seconds then the
  body is returned and the agent becomes a kinematic stopped obstacle until it
  despawns beyond `despawn`. Push `hit` events for the player's contacts (from
  `Life`, see below), not from `Traffic`.
- Pass-through guard: if the player's footprint overlaps a `Kinematic` agent
  (pool exhausted), the agent hops 3 m sideways and honks. Count these in
  `traffic.guardHops` for the soak test (must be 0 in normal driving).
- `Life.postStep` hit classification: `telemetry.hitHandle` → `traffic` if
  `traffic.agentForCollider(handle) >= 0`, else the collider's parent body:
  fixed with restitution 1 → `wall` (buildings, boundary walls), fixed
  otherwise → `terrain`, dynamic non-traffic → `prop`. Push `hit` with
  `value = telemetry.impact`, `target` = agent or -1. `Life` also stamps
  `traffic.lastPlayerContactTick[agent]`.

Tests (append to `traffic.test.ts`):

6. **LOD bounds.** Over a 60 s bot drive: every agent within 35 m of the
   player is `Physical` or `Disturbed`; no agent beyond 70 m has a body;
   lent bodies ≤ `physicsBodies` at all times; `guardHops === 0`.
7. **Rear-end.** Player at 80 km/h into a kinematic agent doing 10 m/s
   20 m ahead on the same lane: within 2 s a `hit` event with target = that
   agent; the agent's state is `Disturbed` or `Physical` with speed > 12 m/s
   at some step (it was pushed); the player keeps 30–75 % of its speed one
   second after the hit; `hasNaN()` false.
8. **T-bone.** Player at 100 km/h into the side of a stopped physical agent:
   the agent moves ≥ 3 m laterally within 2 s; the player's chassis stays
   upright (`upness > 0.8`).
9. **Return trip.** Drive away from a disturbed agent: its body is returned
   beyond `physicsRelease`, it becomes `Kinematic` on a lane or `Wrecked`,
   never `Free` while inside `despawn`.

Acceptance: verify green; `npm run perf` twice: step p95 < 12 ms (budget),
heap and draws recorded. If step p95 grew by more than 3 ms over slice 1,
profile `Traffic.step` in Node before continuing (the Rapier call count per
lent body per step should be ≤ 8).

### Slice 3 — events, boost economy, HUD popups, audio stings (1.5 days)

Files: `economy.ts`, `Life.ts`, `ui/hud.ts`, `ui/styles.css`, `audio/Sfx.ts`,
`App.ts`, `tests/sim/economy.test.ts`, `e2e/screens.spec.ts`.

`Life.postStep`:

- **Near miss.** For every agent within 12 m: distance between the player's
  footprint and the agent's footprint in XZ approximated as circles of radius
  `halfWidth + 0.3`; a pass counts when the gap is ≤ `nearMissGap`, the
  relative speed ≥ `nearMissSpeed`, the player had no `hit` in the last 0.5 s,
  the agent has not been counted in the last `nearMissCooldown`, and the agent
  is now behind the player (dot of the offset with the velocity < 0) after
  having been ahead. Oncoming if the agent's heading opposes the player's
  velocity (dot < −0.5): `nearMissOncoming`, else `nearMiss`. Boost added and
  the event pushed with `value` = boost.
- **Oncoming lane.** The player's nearest lane (`city.nearestRoad`-style
  projection within `oncomingLaneDistance`) has a yaw whose direction opposes
  the velocity (dot < −0.7) and speed ≥ `oncomingSpeed` → `state.oncoming`
  with `oncomingHysteresis`; boost at `oncomingBoostPerSecond`; one `oncoming`
  event per second while active (value = boost that second).
- **Pedestrian dodge.** `Pedestrians` pushes `nearMissPed` when a dive was
  triggered by the player within `pedDodgeDistance`; `Life` adds the boost.
- Boost never exceeds 1. Drift and air gains stay in `Vehicle` untouched.

HUD (`hud.ts`): a popup stack (`hud__popups`, four pre-created
`hud__popup` elements reused round-robin, text set on show, `opacity` and
`transform` animated by CSS class toggles, no layout thrash) next to the
speedo: "NEAR MISS", "ONCOMING!", "DODGED", later "TAKEDOWN!", "BILLBOARD
12/50", "FRESH WHEELS". Ink with a flat drop shadow, skewed −10°, yellow when
boost was granted, 1.2 s. The boost bar flashes (`is-gain`) for 0.3 s on any
gain. An `ONCOMING` label above the speed while `state.oncoming`. Sizes obey
STYLE.md (labels ≥ 12 px at DPR 1). Text is short and never sarcastic.

Audio (`audio/Sfx.ts`, WebAudio synthesis, no samples): `nearMiss` filtered
noise sweep 0.25 s; `honk` two-tone square with a 0.3 s envelope, pitch by
agent kind; `nearMissPed` a comic pitch-bent sine yelp 0.2 s; later stings
listed in slices 5–8. `EngineAudio` owns the master gain; `Sfx` takes the
master node from it so the ad-mute hook still silences everything. Polls
`sim.events` once per frame from `App`.

Tests (`tests/sim/economy.test.ts`):

1. **Near miss counts once.** Spawn an oncoming agent on the opposite lane
   with 1.0 m lateral gap to the player's path; drive past at 100 km/h: exactly
   one `nearMissOncoming`, boost increased by `nearMissOncomingBoost` (± 0.001,
   starting below 0.7). Passing at 3 m: no event.
2. **Oncoming lane.** Teleport onto an opposing lane and hold 80 km/h for 3 s:
   boost increases by `3 × oncomingBoostPerSecond` ± 15 %; `oncoming` events ≥ 2.
   Same lane in the right direction: none.
3. **Cap.** Boost at 0.95, near miss → exactly 1.0.

Acceptance: verify green; `npm run screens` extended with a `life` state
(§5.4) and reviewed by you at all ten sizes: no popup overlaps the speedo,
the radar or the drift readout; note the images you looked at in
`PROGRESS.md`.

### Slice 4 — pedestrians (1.5 days)

Files: `sim/traffic/Pedestrians.ts`, `tuning.ts`, `render/PedView.ts`,
`Renderer.ts`, `tests/sim/pedestrians.test.ts`.

- Pavement paths: a pedestrian walks the pavement of a lane on one side:
  `positionAt(lane, s, pavementOffset)` where `pavementOffset =
  roadHalf(lane) + 2.25 − laneOffset(lane)` on the right-hand pavement, and
  the mirror for the left one (left pavement of lane A is the right pavement
  of its reverse lane; use the reverse lane so every ped walks "forward"
  along its lane). `roadHalf` is 12 on streets, 19 on the highway, the
  special road's `halfWidth` on authored roads; `laneOffset` is 6 on the
  highway, `min(4.5, halfWidth − 3.5)` otherwise (mirror `buildRoadGraph`).
  Highway pavements exist only on the inner side (the outer is parkland; skip
  the outer pavement on `highway` lanes).
- At the end of a pavement the ped picks the outgoing lane at the node whose
  pavement start is nearest to its position (that is the corner continuing
  around the block or straight on) and never crosses a carriageway. If none
  is within 12 m, turn around (switch to the reverse lane's pavement).
- Pool `count × density`; spawn between `spawnMin` and `spawnMax` behind the
  player's velocity or beyond 160 m; despawn beyond `despawn`. Walk speed per
  ped from the range. Tint from six palette colours. Deterministic RNG
  `mulberry32(seed ^ 0x9ed5)`.
- Dodge: for the player, and for every `Physical`/`Disturbed` traffic agent
  within 30 m, predict the position `lookAhead` seconds ahead; if the ped is
  within `corridorHalfWidth` of the segment from the car's position to that
  prediction and the car is approaching (relative speed toward the ped > 3
  m/s), the ped dives perpendicular to the car's velocity, away from it, at
  `diveSpeed` for `diveTime` (pose `Dive`), then `GetUp` for `getUpTime`, then
  resumes walking toward its pavement (walks back onto it over a few seconds).
  `Pedestrians` pushes `nearMissPed` when the diver was within
  `pedDodgeDistance` of the player at the moment of the dive.
- Guarantee: after the dive logic, if any car centre (player or lent body) is
  within `guaranteeDistance` of a ped, the ped is moved `hopDistance` sideways
  (perpendicular to the car's velocity, away from the car) this step. Count
  these in `peds.guaranteeHops` (should be rare; the soak test logs it).
- Fist pose: `spawnAt(x, z, yaw, PedPose.Fist)` for the swap slice; a `Fist`
  ped stands for `fistTime` then walks.
- `PedView`: one `InstancedMesh` of a ~48-triangle figure (torso box, head
  box, two leg boxes, arm boxes), matrix per pose: walk bobs y by ±0.04 at
  2 Hz from `s`, `Dive` pitches the figure 70° forward and lowers it, `GetUp`
  interpolates back, `Fist` is a distinct static pose: a small roll about z
  plus a 0.1 m bob at 4 Hz (the shaking reads from a distance; per-limb
  animation is backlog). No shadows for peds on the low tier
  (`castShadow = quality === 'high'`).

Tests (`tests/sim/pedestrians.test.ts`):

1. **On the pavement.** 30 s with peds on: every walking ped's lateral
   distance from its lane centreline lies in the pavement band
   [roadHalf, roadHalf + 4.5] of its road (compute per road type).
2. **Dodges.** Spawn a ped 20 m ahead on the pavement, teleport the player
   onto the pavement heading at it at 80 km/h: the ped's pose becomes `Dive`
   before the player is within 8 m, `overlapsPlayer` is never true, and a
   `nearMissPed` event fires. It is walking again within 3 s of the pass.
3. **Guarantee.** Same setup with the dodge controller disabled through a
   test-only flag (`peds.dodgeEnabled = false`): `overlapsPlayer` is still
   never true and `guaranteeHops ≥ 1`.
4. **Deterministic** like traffic (positions after 600 steps).

Acceptance: verify green; draw calls +1; `npm run perf` step p95 still < 12 ms;
`guaranteeHops` over a 60 s bot drive with traffic and peds logged in
`PROGRESS.md` (expected 0–2).

### Slice 5 — damage, wrecked, respawn (1.5 days)

Files: `economy.ts` (DAMAGE), `Life.ts`, `Vehicle.ts` (engineCut only),
`render/carMesh.ts` (setDamage), `render/Debris.ts`, `render/Smoke.ts`,
`Renderer.ts`, `hud.ts`, `Sfx.ts`, `tests/sim/damage.test.ts`.

- Damage delta per step: `max(0, impact − threshold) × perMetrePerSecond`,
  times `trafficFactor` when the hit target is traffic, zero for `prop` and
  `terrain` targets. `impact` is `telemetry.impact` (m/s of speed change in a
  step; the walls test shows 100 km/h head-on ≈ 27). Stages from `stages`:
  crossing a stage pushes `damage` with `value` = the new stage. Never
  regenerates in M3.
- Stage 4 = wrecked: `vehicle.engineCut = true`, `wrecked` event, `state.
  wrecked`, `respawnIn = wreckRespawn`. Brakes and steering still work (control
  is never taken away). `R` respawns at once; `E` swaps at once if a candidate
  exists (slice 6); the timer respawns automatically.
- Respawn: `city.nearestRoad` projection (the existing reset pose), damage 0,
  boost kept, `engineCut = false`, `traffic.clearAround(x, z, respawnClear)`,
  `setVelocity` along the lane at `respawnSpeed` ("rolling respawn"), `respawn`
  event, `sim.respawned = true` so the camera snaps.
- `carMesh.setDamage(stage)`: stage ≥ 1 darkens the paint decals toward
  `graphite` by 25 % per stage (write the colour buffer in place like the
  brake lights do); stage 1 hides the front bumper, stage 2 the rear bumper
  and the bonnet trim. Hiding: keep the bumpers as separate geometry groups in
  the merged body with a second material index whose material has
  `visible = false` when hidden (one extra draw call only while a bumper is
  hidden is acceptable; document the count). Stage 4 also tints the glass
  dark.
- `Debris`: pool of 32 boxes in one `InstancedMesh`; spawn on `damage` (the
  part that just fell: a bumper-sized box in the car's paint, thrown backwards
  at the car's velocity minus 4 m/s with spin), on `billboard` (slice 8), on
  `takedownTraffic` (slice 7). Fake physics: gravity 9.81, one bounce with
  restitution 0.3 at y = 0, 2.5 s life, then scale 0. No Rapier.
- `Smoke`: `THREE.Points` pool of 160 (attribute updates in place, size by
  distance in the vertex shader like sparks, additive off): stage 2 grey
  smoke from the bonnet at 12/s rising 1.5 m/s with drift; stage 3 dark smoke
  30/s plus fire points (orange→yellow, 0.4 s life, 20/s); stage 4 the same
  plus a burst. Wrecked traffic agents (from `sim.traffic`) emit dark smoke
  at 10/s each while within 120 m. Two draw calls total.
- HUD: `hud__damage` bar under the boost bar (label "DAMAGE", fills right,
  turns `danger` red at stage 3, pulses at stage 4); wrecked overlay:
  "WRECKED" title, sub "E take a car · R respawn", auto-dismiss on respawn.
- Audio: `damage` a metallic crunch layered on the existing crash thump;
  `wrecked` a low boom plus a 2 s fire crackle (filtered noise) that stops on
  respawn; `respawn` a short whoosh.

Tests (`tests/sim/damage.test.ts`, playground `walls` lane like
`walls.test.ts`):

1. **Bands.** 100 km/h head-on → damage in [0.9, 1.0] and stage 4 (wrecked);
   60 km/h head-on → [0.45, 0.8]; 20° glance at 100 km/h → < 0.15; a cone
   (prop) at 60 km/h → 0.
2. **Wrecked flow.** After a wreck, full throttle for 2 s moves the car
   < 1 m; `respawnIn` counts down and at 0 the car is at the reset pose with
   damage 0, boost unchanged, `engineCut` false, speed ≈ `respawnSpeed`;
   `R` before the timer respawns at once.
3. **Traffic factor.** The rear-end from traffic test 7 yields damage
   < 0.3 (city map, traffic on).
4. **Pins unchanged.** The existing `handling`, `cars`, `walls` tests pass
   untouched (damage never feeds back into forces).

Acceptance: verify green; draw calls recorded (expect +2 for debris/smoke,
+1 while a bumper is hidden); `npm run screens` `life` state shows the damage
bar at 0.6 and reviewed.

### Slice 6 — car-swap (1.5 days)

Files: `economy.ts` (SWAP), `Life.ts`, `Traffic.ts` (`takeOver`),
`Vehicle.ts`, `SimWorld.ts`, `Renderer.ts`, `ChaseCamera.ts`, `hud.ts`,
`Sfx.ts`, `App.ts`, `tests/sim/swap.test.ts`, `e2e/life.spec.ts`.

- Candidate every step: the nearest agent (any state but `Free`) whose centre
  is within `range` longitudinally and `lateral` laterally in the player's
  frame, relative speed ≤ `maxRelativeSpeed`, player grounded (≥ 2 wheels)
  unless `airborneAllowed`. `state.swapCandidate`; the HUD shows the `E`
  keycap with "SWAP" (the label from `input.label('swap')`, passed through
  `KeyHints`) while a candidate exists.
- On `controls.swap` with a candidate: `traffic.takeOver(candidate, oldKind,
  oldPaint, oldPose)` returns the target pose, velocity and kind; the player's
  `tuning = cloneTuning(CAR_PRESETS[kind])`, `applyTuning()`, `teleport(pose)`,
  `setVelocity(vx, 0, vz)`, `sim.carId = kind`, damage 0, stage 0, `engineCut`
  false, boost kept; the old car becomes an `Abandoned` agent at the old pose
  with the old kind and paint (a lent body if one is free, else kinematic and
  stopped), which despawns beyond `despawn`; a `Fist` ped spawns 2 m to the
  driver's side of the abandoned car facing the player; `swap` event
  (target = agent, value = 0). The abandoned car keeps whatever damage tint
  the player had (traffic-side `wreckTint` flag; visual only).
- Traffic must ignore the player's old car for 1 s (no `hit` for the
  abandoned agent's own settling).
- Renderer: three pre-built `CarMesh` (one per class), visibility by
  `sim.carId`, `setDamage(0)` on the new one, wheels of the visible one
  follow the vehicle's wheel slots (the `Vehicle` keeps its slots). Ghost
  mesh unchanged. Camera `whip()`: no snap; the heading turns toward the new
  car at up to 720°/s for `whipSeconds` and the FOV punches +10° decaying
  over 0.4 s; position follow rate doubled during the whip. Pin it in
  `tests/render/camera.test.ts` (Node): after a whip the camera is behind the
  new car within 0.5 s and never further than 25 m from it during the whip.
- HUD popup "FRESH WHEELS"; audio: a whoosh plus the new engine's idle blip
  (the engine tone changes by itself because the tuning changed).
- Bot: no swaps (the bot never sets `swap`).

Tests (`tests/sim/swap.test.ts`, city map):

1. **Swap works.** Agent alongside at 2.5 m lateral, both at 40 km/h; `swap`
   edge → `carId` equals the agent's kind, player position within 1 m of the
   agent's pre-swap pose, speed within 10 % of the agent's, damage 0, the old
   pose now holds an `Abandoned` agent of the old kind, a `Fist` ped exists
   within 4 m of it, one `swap` event.
2. **No candidate, no swap.** Nearest agent 12 m away → nothing changes,
   no event.
3. **Airborne.** Off a kerb hop with 0 grounded wheels → no swap.
4. **Wrecked swap.** After a wreck, swapping clears `engineCut` and the
   wrecked overlay state, and the abandoned agent is `Wrecked`-tinted.
5. **Presets survive a swap.** After swapping into `compact` on the highway,
   full throttle from rest reaches 100 km/h within the `compact` band of
   `cars.test.ts` ± 0.5 s (proves `applyTuning` rebuilt mass and collider).

Acceptance: verify green; `e2e/life.spec.ts` swap case (§5.3) passes;
`npm run screens` `life` state includes the swap prompt.

### Slice 7 — takedowns and the takedown camera (1 day)

Files: `Life.ts`, `Traffic.ts`, `ChaseCamera.ts`, `App.ts`, `hud.ts`,
`Sfx.ts`, `tests/sim/takedown.test.ts`.

- Takedown: an agent with `lastPlayerContactTick` within `takedownWindow`
  seconds that (a) suffers a contact impulse / mass ≥ `takedownDeltaV` against
  anything that is not the player (its own manifold readback: the other
  collider's parent is fixed → `takedown`; another traffic body →
  `takedownTraffic`), or (b) flips (`up.y < 0.3`), or (c) took the player's
  hit itself with closing speed ≥ `takedownClosingSpeed` and its own Δv ≥
  `takedownDeltaV` → the agent becomes `Wrecked` at once, the event is pushed
  with `value` = the boost, boost is added, `state.slowMo = slowMoSeconds`,
  `state.slowMoTarget = agent`. One takedown per agent.
- `App`: `timeScale = slowMo > 0 ? slowMoScale : 1` fed to
  `loop.advance(frameDt × timeScale)`; `Life` decrements `slowMo` by the sim
  `dt / slowMoScale` so that 1.2 s of slow motion is 1.2 s of wall time
  (≈ 0.42 s of sim time; document this in the code). Any `pressed` action
  ends it through `sim.life.skipSlowMo()`.
- Camera `focus(target, seconds)`: while focused the camera keeps following
  the player's position but the look point blends toward the target agent's
  interpolated position (rate 8/s), FOV −6°; on release the look point blends
  back. Node pin: the look direction points within 20° of the target within
  0.3 s and returns within 0.6 s after release.
- HUD popup "TAKEDOWN!" (yellow, 1.3× the popup size) and "INTO TRAFFIC!" as
  a second line for `takedownTraffic`. Audio: a big crunch and a short
  pitched-down whoomph.

Tests (`tests/sim/takedown.test.ts`, city map; a building face is found from
`city.generate` boxes tagged `building`, or use the island boundary wall):

1. **Into a wall.** Physical agent at 30 km/h 3 m from a wall face, player
   rams it at 90 km/h from behind at 20° toward the wall: within 2.5 s a
   `takedown` event with that target, the agent is `Wrecked`, boost rose by
   `takedownBoost` (cap-aware), `slowMo` was set and then reached 0 after
   `slowMoSeconds` of wall time.
2. **Not a takedown.** The rear-end from traffic test 7 (open road, no wall)
   produces no takedown.
3. **One per agent.** Hitting the wrecked agent again produces nothing.

Acceptance: verify green; the slow motion is visible in a manual run
(`?manual=1` plus `advanceTime` shows fewer sim ticks per wall second; assert
in `e2e/life.spec.ts`).

### Slice 8 — billboards (1 day)

Files: `sim/city/collectibles.ts`, `Life.ts`, `render/Billboards.ts`,
`Debris.ts`, `hud.ts`, `Sfx.ts`, `tests/sim/collectibles.test.ts`.

- Placement (deterministic from the graph and `seed`): 24 on the highway's
  outer verge, one per perimeter segment at the quarter point nearer the
  segment's start, 10 m outside the outer kerb line (x or z = ±(675 + 19 +
  10)), facing the carriageway; 10 on the authored roads, two per road at 1/3
  and 2/3 of its length on the outside of the curve (or alternating sides on
  the straight diagonals), 8 m past `halfWidth`; 16 on Palm Gardens back-lot
  parks (chunks with `cx ∈ {−3,−2,−1}`, `cz ∈ {1,2,3}`, the `ox = oz = 85`
  lots, every other candidate by index) at the lot's street-facing edge,
  8 m from the lot centre toward the nearest street, facing it. Panel 8 × 3 m
  on two posts, bottom edge 2.5 m up, paint from a fixed five-colour list and
  a contrasting stripe. Exactly 50.
- Smash: `Collectibles.step` tests the player's footprint against each
  billboard's OBB (only those within 20 m; keep a per-chunk index or a sorted
  array by x for the broad phase) at speed ≥ `billboardMinSpeed`; on overlap:
  `smashed[i] = 1`, `smashedCount++`, `billboard` event (target = i, value =
  `billboardBoost`), boost added, player speed scaled by `1 −
  billboardSpeedLoss` via `setVelocity`; the camera reads `billboard` events
  and applies `impactShake × 4`.
- `Billboards`: one `InstancedMesh` (panel + posts ≈ 40 triangles, vertex
  colours: paint front face, stripe, `steel` posts, `charcoal` back), instances
  scaled to zero when smashed (re-upload the matrix only then). `Debris`
  throws 6 planks per smash in the panel's paint.
- HUD: `hud__collect` counter top-right "BILLBOARDS 12/50", shown for 3 s
  after a smash and always in the debug view; popup "BILLBOARD 12/50".
  Audio: a splintering noise burst plus a bright ding.

Tests (`tests/sim/collectibles.test.ts`):

1. **Fifty, placed sanely.** Exactly 50; every billboard's footprint (posts
   and the panel projected to the ground) is at least 1 m from every `box`
   static tagged `building`, `kerb` or `decor` with `hy > 0.2` in the chunk
   that contains it (generate the chunk in the test); none inside a
   carriageway (distance to every lane centreline ≥ roadHalf + 1).
2. **Smash.** Teleport the player 15 m before billboard 0 heading at it at
   60 km/h: within 2 s `smashed[0] === 1`, one `billboard` event, boost rose
   by `billboardBoost`, speed dropped by 3–8 %. At 10 km/h: no smash.
3. **Once.** Driving through it again does nothing.

Acceptance: verify green; draw calls +1; `npm run screens` `life` state
shows the counter.

### Slice 9 — stretch (only if §7 is green with margin; else backlog)

In this order, each its own commit with tests: (a) parked cars in the
kerbside bays of the avenue and the quay as `Kinematic` agents with speed 0
(more swap candidates; 24 instances; they never move unless hit); (b) 20
stunt ramps as `GROUPS_TERRAIN` wedges on park lots facing the streets
(reuse `playground.ts` ramp construction; airtime already pays boost); (c) 10
speed cameras on the highway: a post with a lens that flashes (event
`speedCamera`, popup "FLASHED 132 km/h") above 100 km/h. Record what you
skipped and why in `PROGRESS.md`.

### Polish pass (after slice 8, before the gate; 1 day)

- `docs/STYLE.md`: new sections "Traffic and pedestrians", "Damage and
  debris", "HUD events" with the rules you actually built (sizes, colours,
  timings).
- `docs/ARCHITECTURE.md`: layout lines for the new modules, the step order,
  decisions D1–D12 as records 20–31 with the reasons from §2 in your words.
- `docs/CRAZYGAMES.md`: nothing changes in status; add a note to the ads rows
  that ad breaks will attach to the wrecked/busted flows in M4.
- `README.md`: URL table gains `?traffic=`, `?peds=`, `?life=0`; controls
  line gains `E` swap.
- `docs/BACKLOG.md`: everything you deferred, one line each.
- Dev panel: a "Life" section with `TRAFFIC`, `PEDS`, `ECONOMY`, `DAMAGE`,
  `SWAP` numbers (the panel already takes `extra` objects), and a read-only
  line with agent counts, lent bodies, peds, hops, events per second.

## 5. Verification

### 5.1 Headless tests (Vitest, Node)

New files and the tests they hold are listed per slice; the total should land
around 45 new tests on top of the 109. Rules:

- Every test builds its world through `tests/sim/helpers.ts` (`createWorld`,
  `run`, `runUntil`, `kmh`, `position`, `upness`) and disposes it in `finally`.
- Traffic and pedestrian tests use `spawnAt` hooks for deterministic setups;
  never rely on random spawns for an assertion.
- Bands, not exact numbers, wherever a playtest knob influences the result;
  exact numbers only for determinism and counting.
- The existing pins (`handling`, `cars`, `walls`, `city`, `markings`,
  `instrumentation`, `loop`, `camera`, `carMesh`, `roadPaint`, `shadows`,
  `minimap`) must not change except: `city.test.ts` may pass
  `traffic: 0, peds: 0` where it drives the tour, and the lane count pin stays
  178.

### 5.2 `e2e/life.spec.ts` (Playwright, against the preview build)

1. **Bot with life on.** `/?bot=1&seed=42&duration=60&quality=low`: after the
   run `window.__perf` within the budgets of `perf.spec.ts`; from
   `window.__game.sim`: at least one `hit` or `nearMiss` event happened (the
   bot met traffic), `traffic.count(Physical) ≤ physicsBodies`, `guardHops
   === 0`, `peds.guaranteeHops ≤ 3`, no console errors.
2. **Swap by keyboard.** `/?manual=1&quality=low`: click the canvas, use
   `sim.traffic.spawnAt` to place an agent alongside the player, `advanceTime`,
   press `KeyE`, `advanceTime(200)`: `sim.carId` changed, the player mesh for
   the new class is the visible one (`renderer` exposes `carMeshes` or
   `visibleCar` for the test), no errors.
3. **Slow motion.** Push a takedown through the sim hooks (spawn a physical
   agent next to a boundary wall, drive the player into it with `advanceTime`
   loops) or, if that proves brittle, set `sim.life.state.slowMo` through a
   test-only setter and assert that 1,000 ms of `advanceTime` produced
   `slowMoScale × 60` ± 2 ticks.
4. **Wrecked to respawn.** Drive into the boundary wall at full speed until
   `state.wrecked`; `advanceTime(3500)`: `damage === 0`, `engineCut` false,
   the car is on a lane (`city.nearestRoad` distance < 1 m).

Add `"life": "playwright test e2e/life.spec.ts"` to `package.json`. It is not
part of `verify` (too slow); it is part of the gate.

### 5.3 `e2e/city.spec.ts`

The tour tests get `&traffic=0&peds=0`; the controls test keeps life on and
additionally asserts that pressing `KeyE` with no candidate changes nothing.

### 5.4 `e2e/screens.spec.ts`

Add a `life-<w>x<h>.png` capture per size: `/?manual=1&quality=low`, then via
`window.__game.sim` push a `nearMissOncoming` event, set `life.state.damage
= 0.6` and `stage = 2` through the test setter, place an agent alongside so the
swap prompt shows, and set `collectibles.smashedCount = 12` with the counter
visible; `advanceTime(100)`; screenshot. Look at all ten images. The wrecked
overlay gets its own `wrecked-1280x720.png`. Note in `PROGRESS.md` which
images you inspected and what you fixed.

### 5.5 Performance protocol

Machine facts from `docs/PROGRESS.md`: headless Chromium runs on the NVIDIA
MX330; run-to-run noise on identical code is about ±3 fps; the two-vsync
boundary at CPU ×4 sits at a p95 of 33.4 ms. Rules:

- Before slice 1, run `npm run perf` twice on `main` and keep both
  `perf/latest.json` copies as `perf/m3-base-1.json`, `-2.json` (git-ignored
  folder; paste the summary lines into `PROGRESS.md`).
- After each slice that touches the frame (1, 2, 4, 5, 8), run `npm run perf`
  once and record: fps mean, frame p95/p99/max, step p95/max, draws max,
  triangles max, heap max, bot resets.
- At the gate, run `npm run perf` twice on the final commit and compare with
  the two base runs. A regression claim needs both new runs worse than both
  base runs; otherwise report "within noise" with all four numbers.
- Expected deltas (from the budgets in §4): draw calls +8 to +10 (three
  traffic, one peds, one billboards, one debris, two smoke, one bumper while
  hidden), triangles +25k to +40k, step mean +1 to +2 ms, heap +5 to +15 MB.
  If any of these is exceeded twofold, stop and profile before the next slice.
- `npm run perf:headed` on the laptop and the MX330 in a real window are
  Marcin's numbers; ask for them in the gate report, do not guess them.

### 5.6 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify` | green | typecheck ×2, lint (0 warnings), tests, build, smoke, budget |
| Startup bytes before gameplay-start | ≤ 8 MB target (12 MB fail) | `tools/budget.mjs` (currently 3.4 MB) |
| Time to control, 20 Mbit + CPU ×4 | ≤ 6 s | `e2e/city.spec.ts` (currently 1.9–3.2 s; traffic must not add chunk-style boot work) |
| Draw calls / triangles, low tier, whole tour | ≤ 150 / 250k | `e2e/city.spec.ts` (currently 61 / 162k with traffic off; run the tour once with traffic on and record, without asserting resets) |
| Draw calls / triangles, high tier | ≤ 300 / 600k | same |
| JS heap | ≤ 250 MB | perf run (currently 45 MB) |
| Sim step p95 under CPU ×4 | < 12 ms | `e2e/perf.spec.ts` (currently 6.1 ms) |
| Node sim step, 48 agents + 40 peds | < 3 ms mean | `traffic.test.ts` cost test |
| Frame p95 under CPU ×4, real GPU | < 33.4 ms | `e2e/perf.spec.ts` (currently 16.8 ms) |

## 6. Records

### 6.1 `docs/PROGRESS.md` entry per session (newest first, absolute dates)

```
## 2026-MM-DD — M3 session N: <slices touched>
### Done
- bullet per change, with the file and the numbers
### Verification
- verify: N tests, smoke fps/p95/draws/tris, build MB
- perf: the summary lines (§5.5)
- what you looked at (screens, manual runs) and what you could not verify
### Decided and why
- assumptions you made where this plan was silent
### Next
- the next slice, and anything left open
```

### 6.2 Gate report (`docs/M3_REPORT.md`, written last)

Sections, in this order: what was built (per slice, two or three lines each);
verify and perf numbers (base vs final, all four perf runs, city and life
gates, Node step cost, draw/triangle/heap deltas); how to run (URLs, the new
parameters, the dev panel section); the five-minute playtest script from §9
adjusted to what you built; tuning knobs and where they live (§3.4, with the
three or four numbers you expect Marcin to touch first); known issues
(honest: anything that misbehaves, anything not measured on real hardware);
proposed next scope (M4 Heat, as the brief states it, plus what M3 left
behind).

## 7. Gate criteria (definition of done for M3)

All of these, or the report says which one is missing and why:

1. Slices 0–8 committed on `grok/m3-life`, each with its tests.
2. `npm run verify` green on the final commit; lint with zero warnings.
3. `npm run city` 5/5, `npm run life` 4/4, `npm run screens` with the hud,
   pause and life states at all ten sizes plus the wrecked view, captured and
   inspected.
4. Every budget in §5.6 holds; the perf comparison follows §5.5.
5. No per-frame allocation in `Traffic.step`, `Pedestrians.step`,
   `Life.postStep`, `TrafficView.update`, `PedView.update`, `Debris.update`,
   `Smoke.update`, `Hud.update` (reviewer greps for `new `, `[]`, `{}`,
   `.map(`, `.filter(`, spread and `Math.hypot` with more than two arguments
   inside these paths).
6. Layering intact (lint), `tsconfig.sim.json` clean, no new dependency,
   nothing in `docs/BRIEF.md` changed, the approved handling numbers and the
   M1/M2 pins unchanged.
7. Docs updated (§4 polish pass), `PROGRESS.md` has an entry per session,
   `M3_REPORT.md` exists.
8. The game opens cold with traffic and pedestrians present within the first
   second of control, on `/` with no parameters.

## 8. API facts and traps

Verified against the installed packages on 2026-09-21:

- Rapier 0.20 `-compat`: `RigidBody.setEnabled(bool)` / `isEnabled()`,
  `RigidBodyDesc.setEnabled`, `Collider.setEnabled`, `Collider.setSensor`,
  `ColliderDesc.setSensor`, `World.contactPairsWith(collider, cb)`,
  `World.intersectionPairsWith`, `World.contactPair(c1, c2, cb(manifold,
  flipped))`, `World.castShape`, `World.intersectionsWithShape`,
  `RigidBody.userData`, `Collider.parent()` (null for world-attached
  colliders; `isFixed()` on the body), `RigidBody.setLinvel/setAngvel/
  setTranslation/setRotation(v, wakeUp)`, `RigidBody.lockRotations`,
  `setLinearDamping`. `body.translation(target)` and `rotation(target)` with
  a scratch target are how the existing code avoids allocation; do the same.
  `Collider.handle` and `RigidBody.handle` are numbers. Mass through
  `ColliderDesc.setMassProperties(mass, com, inertia, frame)` as `Vehicle`
  does, or `setMass` for props.
- Three 0.186: `InstancedMesh(geometry, material, count)`, `setMatrixAt`,
  `setColorAt` (creates `instanceColor` on first call; set
  `instanceColor.needsUpdate`), `instanceMatrix.needsUpdate`,
  `InstancedMesh.count` may be lowered to draw fewer instances. With
  `vertexColors: true` the instance colour multiplies the vertex colour.
  `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` is the
  only addon in use; do not add others.
- TypeScript: `noUncheckedIndexedAccess` makes every index read `T |
  undefined`; the codebase casts typed-array reads `as number` and guards
  objects. `exactOptionalPropertyTypes`: never assign `undefined` to an
  optional property; spread conditionally (`...(x ? { x } : {})`).
  `@typescript-eslint/no-non-null-assertion` is an error; `no-console` is a
  warning and `verify` runs lint with `--max-warnings=0`, so no `console.log`
  in `src/` (`console.warn/error/info` are allowed).
- `tsconfig.json` has `isolatedModules` and `verbatimModuleSyntax`: use plain
  `enum` (as the contracts above do) or numeric constants, never `const enum`;
  import types with `import type`.
- The sim never imports from `app`, `render`, `ui`, `audio`, `platform`,
  `input`; `mulberry32` therefore moves into `sim` (slice 0).
- Windows: the shell is PowerShell; `npm run verify` runs Playwright against
  a `vite preview` on port 4173 and reuses a running one. If a previous
  preview is serving a stale `dist`, stop it. Never `git worktree remove`.
- Screenshots and QA from a headless script give real particles; the in-app
  browser pane runs at a few fps and cannot show them (session 7 note).
- A synchronous city load after a teleport is expensive; traffic and peds
  must never trigger chunk work themselves (they only read `city.graph`).
- `Vehicle.teleport` zeroes velocity and gear; for a swap call `teleport`
  then `setVelocity` (added in slice 0) in that order.
- `sim.respawned` is a one-tick flag the renderer may miss when several
  steps run in one frame; the renderer also snaps on an 80 m jump. A swap
  must not set `respawned` (the camera whips instead of cutting).

## 9. Five-minute playtest script (for the gate report; adjust to what exists)

1. Open `/`. Within a second there is traffic ahead and behind and people on
   the pavements. Drive one block: cars keep their lanes, stop behind you,
   nobody overtakes, nobody pops in within view.
2. Thread the gap between two cars at speed: "NEAR MISS" popup, boost bar
   flashes, a whoosh. Cross into the oncoming lane at 80+ km/h: "ONCOMING"
   label, boost climbs, oncoming cars honk and wobble as you pass.
3. Drive along a pavement: people dive, get up, walk off; nobody is ever
   hit; a yelp and a "DODGED" popup.
4. Hit a car from behind at 60 km/h: it lurches and settles back to its
   lane; the damage bar shows a little. Hit a building head-on at 60 km/h:
   bumper flies, smoke starts, the bar is half. Again: fire, "WRECKED", the
   car coasts, three seconds later you are rolling again on the road with a
   clean car.
5. Pull alongside any car, press `E`: the camera whips, you are driving it,
   your old car sits behind with someone shaking a fist in the road. Do it
   with a van and a hatchback to feel the class change.
6. Shove a car into a building at speed: slow motion, "TAKEDOWN!", the
   camera glances at the wreck, any key skips it. Shove one into another car:
   "INTO TRAFFIC!".
7. On the highway, drive through a billboard: planks, a ding, "BILLBOARD
   1/50" and the counter top-right.
8. Press `` ` ``: the Life section shows counts; change `nearMissGap` and
   `physicsRadius` live and feel the difference.
9. Watch for: a car appearing inside the fog in front of you, two cars
   overlapping at a junction, a pedestrian inside a wall or in the road when
   no car is near, a popup covering the speed or the radar, any hitch when a
   car is promoted to physics, the wrecked car keeping steering, the swap
   prompt showing when no car is beside you.

## 10. Reviewer checklist (Claude, after the gate)

- Contracts of §3.3 honoured; tuning in §3.4 objects, nothing hard-coded in
  logic; `docs/BRIEF.md` untouched; handling numbers and M1/M2 pins unchanged.
- Step order of §3.2; `Life` is the only writer of damage/wreck/swap state;
  `App` writes only controls, `timeScale` and `skipSlowMo`.
- Allocation audit of the hot paths (§7 item 5) and a Node profile of
  `Traffic.step` with 48 agents; Rapier call counts per lent body.
- Determinism: two seeded runs identical (tests 1.3 and 4.4); no `Math.random`
  anywhere in `src/sim`.
- Tests are honest: bands match the plan, no pin was widened, no test was
  skipped or made conditional.
- Perf comparison per §5.5 with all four runs quoted; expected deltas of §5.5
  respected or explained.
- Visual review of the `life` and `wrecked` screens at the ten sizes; STYLE.md
  rules (sizes, skew, shadows, tone) followed in the new HUD.
- Docs: ARCHITECTURE decisions 20–31, STYLE sections, README, BACKLOG,
  PROGRESS entries, M3_REPORT with the playtest script and known issues.
- Then Marcin plays; his notes drive the M3.1 pass, which Claude runs.
