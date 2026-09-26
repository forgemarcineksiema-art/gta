# M8 "Chaos" — implementation plan

Executor: the agent that starts on Marcin's signal after his 0.7.0
playtest. Reviewer: Claude, at the gate. Director and the only tester:
Marcin. This document is the milestone contract for the chaos
(`docs/DESIGN.md` §16): the street made of things with mass, what stands
where, what a smash pays, and what "done" means. Written 2026-09-24
against commit `4f1a29f` (0.7.0). Until that day `M8` named the platform
milestone; its contract is now `docs/M9_PLAN.md`, and older docs that say
M8 for the platform mean M9.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§3, §4 vehicle, takedowns and damage, activities, §6 budgets, §10),
`docs/DESIGN.md` §16 in full, then §7 (free-roam scoring), §4 (mayhem),
§6.6 (the cold open), §13.3 (heat and sight), `docs/PROGRESS.md` (newest
first), `docs/history/M7_REPORT.md` (its perf method and known issues),
`docs/BACKLOG.md`, `docs/ARCHITECTURE.md`, `docs/STYLE.md`, then this file.
Run `npm run verify`; green before the first edit.

## 0. How to work on this milestone

- **Language, autonomy, scope, honesty**: as in `docs/history/M5_PLAN.md` §0.
- **Pace** (`CLAUDE.md`): a slice is the code, its pins, the quick verify,
  one commit, eight lines in PROGRESS. Every measurement below that is not
  a Vitest pin is taken at the gate. One exception, named in the design
  talk (2026-09-24) and nowhere else: slice 1 ends with the mechanism's
  measurement on the MX330 (§4, slice 1), before any content is built on
  it.
- **Marcin's notes on 0.7.0 come first.** Each note is a slice ahead of the
  queue (a commit each); a note on a slice already done is a fix before the
  next slice. His notes outrank this plan's order and its numbers.
- **Physics first.** The contact rule (D1) is closed-form and pinned in Node
  like the handling; a number that feels wrong is changed in the tuning
  object with its pin, never special-cased in the code.
- **Every slice ends in a build he can play**, and from slice 1 on every
  slice changes something he can drive into.
- **Plain words in every message to him**: lamp posts, bins, the water from
  a hydrant, the café tables; not props, impulses, pools or instances.

## 1. Scope

### 1.1 In scope (§4 slices 0–10)

1. Street furniture as data: a catalogue of kinds with mass, base strength,
   restitution, shape, material, points, bill; two lines on every footway
   and each district's places; no piece of footway decoration left without
   a collider.
2. The contact decided by the sim before the physics step; anchored pieces
   that hold below their base's strength; a pool of physical bodies for what
   flies; fallen pieces that lie, can be knocked again and heal.
3. Trees split by trunk: thick ones solid, street trees thin saplings that
   snap.
4. The street set (hydrant and its water, parking meter, newspaper box, café
   terrace, bus shelter, newsstand) and the districts' sets (the Works, the
   Gardens, the Quay).
5. The spectacle: debris by material, sparks, the hydrant's column, one
   synthesized voice per material.
6. The pay: the smash as a trick in the skill chain, boost, heat, the bill at
   the door, the ticker's lines.
7. Everyone else: police and lent traffic knock and pay the speed, cars on
   their lanes push fallen pieces, walkers dive from flying ones.
8. Mayhem's zones dressed as markets and priced by the bill; the cold open
   through a café terrace.
9. The long game: save version 5, two dailies, Big Bernie's requirement.
10. The gate.

### 1.2 Out of scope

The platform (M9); destructible buildings; new districts, rivals, cars,
activities or modes; story missions, cop mode, multiplayer; traffic-light
poles (the nine signals keep working); props on the highway; the
multi-storey car park; slow motion for a smash (the 2 s rule: only the
takedown has it); any change to `VehicleTuning` presets or the handling
pins; any new dependency; changes to `docs/BRIEF.md`.

### 1.3 Fixed by the brief and still binding

PEGI 12: walkers are never touched, by a car or by anything a car throws;
violence is car against car and car against scenery. Control is never
taken away over 2 s. Low-poly flat-shaded, the palette in
`src/sim/palette.ts`, no per-asset textures. No per-frame allocation in hot
loops. The budgets of `CLAUDE.md`. UI legible at DPR 1 at the ten sizes.
The sim runs headless: nothing in `src/sim/` imports three.js or the DOM.

## 2. Decisions (fixed for M8; each with its reason)

- **D1. The contact is the sim's, decided before the solver.** Each step,
  after the controls and before `world.step`, every vehicle body in the
  physics ring sweeps its footprint (an oriented rectangle, the body's half
  extents) over the step against the standing and lying props in its grid
  cells. At the first contact the closing speed `v` along the normal gives
  `J = (1 + e) · v · m_car · m_prop / (m_car + m_prop)`. A loose prop
  (`breakImpulse` 0) goes; an anchored one goes when `J ≥ breakImpulse`,
  else it holds. A prop that goes gives the car `Δv = (J + breakImpulse) /
  m_car` against the normal and leaves with `J / m_prop` along the normal
  tilted up by the bonnet's slope (12°), plus 0.3 of the car's tangential
  velocity, and a spin from the contact height's lever about its centre of
  mass. Why before the solver: a static collider stops the car dead at any
  speed; a sensor lets it through and knocks the prop a step late. Why
  closed-form: deterministic, testable in Node, tunable by numbers.
- **D2. An anchored prop that holds is a wall.** Anchored props have one
  static collider each in the physics ring (solid group, restitution as the
  buildings'), so below their strength the car meets them like a wall: the
  `hit` event, the wall's damage, the skill chain lost. On a knock the
  collider is disabled, not removed; the heal enables it again.
- **D3. Sixteen bodies, and nothing ever stolen from flight.** A knocked
  prop takes a Rapier dynamic body from a pool of 16 (CCD on; its kind's
  collider made at the knock), flies, and settles: under 0.3 m/s and
  0.6 rad/s for 0.5 s, or after 8 s. Settled, its body returns to the pool
  and the prop lies at its pose, drawn but not simulated; anything that
  drives over it knocks it again (as a loose prop, from 1 m/s). With the
  pool empty a knock flies a ballistic arc (no collisions) to the ground
  and lies. Why: the frame's cost is capped by the pool, and a knock never
  fails to happen.
- **D4. The city heals, and nothing of it is saved.** A lying prop 60 s
  beyond the render's keep radius stands again (its collider enabled, its
  mesh range restored). Prop states live in the sim for all 49 chunks by a
  stable id and are session-only. Why: a wrecked street must not stay
  wrecked for the next hour, and the save stays small.
- **D5. Standing props cost no draw call.** They are built into the city's
  chunk part meshes like the buildings (the near level all of them, the
  far level only the tall kinds; tall kinds cast shadows, small ones do
  not), each prop's vertex range recorded. A knock collapses its range in
  both levels (a ranged upload; a level built later collapses it at its
  finish) and the prop is drawn by its kind's instanced mesh while flying
  or lying, hidden while empty (the M7 gate's rule, pin G.3). Why: the low
  tier's 150 draws and 250k triangles; the city tour spends 89 and 204k.
- **D6. Everything with wheels on a physics body knocks by the same rule.**
  The player, the lent traffic and the police pay the speed with their own
  masses; cars on their lanes (kinematic) push lying props off their path
  (the loose rule, near the player only). Walkers dodge a flying or
  ballistic prop like a car, so the guarantee hop holds. Props never damage
  a car; only what holds does, as a wall.
- **D7. Two lines on every footway and each district's places; no ghosts.**
  The kerb line 0.7 m from the road edge, the frontage line from 3.7 m, the
  walkers' band (2.25 ± 0.9 m) clear; the Works' yards, the Gardens' lawns
  and fences, the Quay's promenade and plazas, Crown Heights' terraces in
  front of the corner shops. From each chunk's own random stream (the
  buildings, billboards and coins do not move). Never in a lane, a job's
  ring, a door's approach, a billboard's line, a jump's ramp or run-out,
  within 12 m of a junction's corner, under an overpass, or on the cold
  open's route but where it is meant to smash through. Every lamp post,
  bench, railing and street tree that is decoration today becomes a prop
  or a solid static: at the gate no footway static is without a collider
  or a prop's rule.
- **D8. Trees by trunk.** The thick trees (parks, gardens, the quay's palms)
  get a solid trunk collider, a wall; the street trees become saplings (a
  thin staked trunk, anchored, 400 N·s) that snap. Solid trunks keep the
  clearances of D7. Both get six-sided crowns (M7's open item: the shadow
  pass).
- **D9. The pay goes through what exists.** A smash is a skill-chain trick
  (`Trick.Smash`): the kind's points, its name as the chain's word;
  smashes within 0.5 s count as one trick toward the multiplier (their
  points all add). Boost per smash by the kind; heat per smash by the kind,
  times the police's sight. The bill (each kind's sticker price) sums into
  the run's `CITY DAMAGE` on the door's wall and prices mayhem; it is never
  the player's money. Why: no new payout channel, and the chain's crash rule
  makes the anchored ones a risk.
- **D10. Save version 5.** `career.smashed` (lifetime). A v4 save migrates
  with 0; 0.7.0 reading a v5 save treats it as newer (keeps it, plays
  without saving, pinned since M5).
- **D11. One rule for every mass.** The rule reads the knocking body's mass
  (the compact 1,100 kg to the bus); the pins cover the compact, the muscle
  car and the heavy.
- **D12. The bots never touch a prop on their line.** Kerb-line props keep
  0.7 m from the road edge and 12 m from a corner, so no bot on its line
  meets one; the long pins run at the gate, and a long pin that turns red
  is first searched for a prop the bot touched (a placement bug, not a
  re-pin).

## 3. Architecture

### 3.1 New and changed modules

| Module | What |
|---|---|
| `src/sim/city/props.ts` (new) | the catalogue `PROP_TYPES`, `PropDesc`, `chunkProps` (the lines, the places, the clearances, the chunk's own stream) |
| `src/sim/city/City.ts`, `architecture.ts` | `CityChunk.props`; the ghost decoration out of the statics; thick trunks solid; anchored props' colliders in the physics ring; six-sided crowns |
| `src/sim/props/Props.ts` (new) | the state by id, the grid, the swept contact, the knock, the pool, settle, lying, ballistic, heal, the hydrant's jet |
| `src/sim/SimWorld.ts` | `props` stepped after the controls, before the physics step; read back after it |
| `src/sim/events.ts` | `smash` (value: the bill; target: the prop id) |
| `src/sim/run/Skill.ts`, `src/sim/heat/Heat.ts`, `src/sim/life/Life.ts` | the smash trick, heat per smash, boost per smash; no damage from props |
| `src/sim/traffic/Traffic.ts`, `Pedestrians.ts` | lent bodies' footprints to `Props`; lanes push lying props; the dodge reads flying props |
| `src/sim/jobs/Jobs.ts`, `place.ts` | mayhem prices a smash at its bill; the zones' markets |
| `src/sim/run/ColdOpen.ts` | the footway terrace on the route |
| `src/sim/board/*`, `src/sim/dailies/Dailies.ts`, `src/sim/save/format.ts` | `career.smashed`, two dailies, Bernie's requirement, version 5 |
| `src/sim/balance.ts`, `src/sim/economy.ts` | `PROPS` tuning, heat and boost per kind, the mayhem quota |
| `src/render/propMesh.ts` (new) | each kind's low-poly model from the palette |
| `src/render/CityView.ts` | standing props in the chunk parts, their ranges, the collapse and restore |
| `src/render/PropsView.ts` (new) | flying and lying props per kind (instanced, hidden when empty); the water columns |
| `src/render/Debris.ts`, `Sparks.ts` | debris by material (shards, paper, fruit, splinters), a larger pool; sparks on metal |
| `src/audio/Sfx.ts` | a voice per material; the jet's hiss |
| `src/ui/run.ts`, `src/ui/hud.ts` | `CITY DAMAGE` on the wall; the chain's word; the ticker's lines |
| `src/app/trackBot.ts` | `pavement`: an opt-in offset of the bot's line onto the kerb (tests and the chaos run only) |
| `src/app/perf.ts` | the `props` phase in the sim's phases |

### 3.2 Contracts (signatures the reviewer will check against)

```ts
// src/sim/city/props.ts
export type PropKind =
  | 'lamp' | 'sapling' | 'hydrant' | 'bin' | 'meter' | 'bench' | 'newsbox'   // everywhere (by district's rules)
  | 'table' | 'chair' | 'shelter' | 'kiosk'                                   // Crown Heights
  | 'pallet' | 'barrel' | 'crate' | 'cone' | 'barrier' | 'tyres'              // Sunset Works
  | 'fruitStand' | 'flamingo' | 'gnome' | 'fence' | 'letterbox'               // Palm Gardens
  | 'deckchair' | 'parasol' | 'fishStall' | 'lobsterPot';                     // Coral Quay
export type PropMaterial = 'metal' | 'glass' | 'wood' | 'plastic' | 'fruit' | 'paper' | 'ceramic';
export type PropShape = { kind: 'box'; hx: number; hy: number; hz: number } | { kind: 'cylinder'; radius: number; halfHeight: number };
export interface PropType {
  name: string;          // the chain's word: 'LAMP POST'
  mass: number;          // kg
  breakImpulse: number;  // N·s; 0 = loose
  restitution: number;
  shape: PropShape;      // the collider and the contact radius
  comHeight: number;     // m above the ground
  material: PropMaterial;
  points: number;        // the skill chain
  bill: number;          // the sticker price: CITY DAMAGE and mayhem
  heat: number;          // points per smash, before the sight factor
  boost: number;         // tank fraction per smash
  tall: boolean;         // casts shadows, drawn in the far level
}
export const PROP_TYPES: Readonly<Record<PropKind, PropType>>;
export interface PropDesc { id: number; kind: PropKind; x: number; z: number; yaw: number }
export const PROPS_PER_CHUNK: number;  // ids: chunk index × PROPS_PER_CHUNK + local
export function chunkProps(cx: number, cz: number, ctx: PropContext): PropDesc[]; // ctx: the chunk's roads, lots, rings, doors, billboards, jumps, the cold open's route

// src/sim/props/Props.ts
export enum PropState { Standing = 0, Flying = 1, Lying = 2, Ballistic = 3 }
export function knockImpulse(carMass: number, t: PropType, closing: number): number;        // J
export function carSpeedLoss(carMass: number, t: PropType, closing: number): number | null; // Δv, null when it holds
export class Props {
  readonly state: Uint8Array;     // by id
  readonly pose: Float32Array;    // x, y, z, qx, qy, qz, qw by id while not standing
  serial: number;                 // bumps on every knock, settle and heal
  smashed: number;                // this run
  bill: number;                   // this run
  readonly bodiesInUse: number;
  step(dt: number): void;         // contacts and knocks, before world.step
  afterPhysics(dt: number): void; // flying bodies read back, settled, healed; the jets
}

// src/render/PropsView.ts
export class PropsView { constructor(scene: THREE.Scene, sim: SimWorld); update(sim: SimWorld, alpha: number, time: number): void; dispose(): void }
```

### 3.3 Tuning objects

`PROPS` (`src/sim/balance.ts`): the pool 16; the loose knock from 0.5 m/s
closing, a lying one from 1 m/s; the bonnet's slope 12°; the tangential
share 0.3; settle under 0.3 m/s and 0.6 rad/s for 0.5 s, at most 8 s of
flight; the heal after 60 s beyond the keep radius; the grid's cell 8 m;
the jet 20 s, radius 1.2 m, thrust 1,200 N (a hydrant's flow, 60 L/s at
20 m/s); the chain's smash grouping 0.5 s; the mayhem quota 15,000 (see
slice 8). And the catalogue, one row a kind (the numbers the pins read):

| Kind | Name | Where | Mass | Base N·s | e | Points | Bill | Heat | Boost | Material | Tall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| lamp | LAMP POST | kerb, all | 140 | 700 | 0.1 | 80 | 1,200 | 3 | 0.04 | metal | yes |
| sapling | TREE | kerb, all but the Works | 60 | 400 | 0.1 | 40 | 300 | 1 | 0.02 | wood | yes |
| hydrant | HYDRANT | kerb, all | 110 | 900 | 0.1 | 100 | 900 | 3 | 0.04 | metal | no |
| bin | BIN | kerb, all | 25 | 0 | 0.3 | 20 | 80 | 1 | 0.01 | plastic | no |
| meter | PARKING METER | kerb, Crown, Works | 30 | 150 | 0.2 | 40 | 400 | 2 | 0.02 | metal | no |
| bench | BENCH | frontage, parks, promenade | 45 | 0 | 0.2 | 40 | 250 | 1 | 0.02 | wood | no |
| newsbox | NEWSPAPER BOX | frontage, Crown, Quay | 35 | 0 | 0.3 | 30 | 150 | 1 | 0.01 | paper | no |
| table | CAFÉ TABLE (its umbrella on it) | terraces, Crown | 20 | 0 | 0.3 | 30 | 120 | 1 | 0.01 | metal | yes |
| chair | CHAIR | terraces, Crown | 6 | 0 | 0.4 | 10 | 40 | 0 | 0.005 | plastic | no |
| shelter | BUS SHELTER | kerb, Crown | 250 | 1,500 | 0.1 | 150 | 2,500 | 4 | 0.06 | glass | yes |
| kiosk | NEWSSTAND | frontage, Crown | 400 | 3,000 | 0.1 | 200 | 3,000 | 5 | 0.08 | paper | yes |
| pallet | PALLET | yards, Works | 20 | 0 | 0.3 | 15 | 30 | 0 | 0.005 | wood | no |
| barrel | BARREL (rolls) | yards, Works | 60 | 0 | 0.3 | 30 | 100 | 1 | 0.01 | metal | no |
| crate | CRATE | yards, Works, Quay | 30 | 0 | 0.3 | 20 | 60 | 0 | 0.01 | wood | no |
| cone | CONE | kerb, Works | 4 | 0 | 0.5 | 10 | 20 | 0 | 0.005 | plastic | no |
| barrier | BARRIER | kerb, Works | 15 | 0 | 0.3 | 15 | 60 | 1 | 0.005 | plastic | no |
| tyres | TYRES | yards, Works | 40 | 0 | 0.6 | 20 | 50 | 0 | 0.01 | plastic | no |
| fruitStand | FRUIT STAND | frontage, Gardens | 80 | 0 | 0.2 | 80 | 600 | 1 | 0.02 | fruit | no |
| flamingo | FLAMINGO | lawns, Gardens | 2 | 0 | 0.5 | 15 | 25 | 0 | 0.005 | plastic | no |
| gnome | GNOME | lawns, Gardens | 5 | 0 | 0.4 | 25 | 50 | 0 | 0.005 | ceramic | no |
| fence | FENCE (2 m) | lot edges, Gardens | 15 | 0 | 0.2 | 15 | 80 | 0 | 0.005 | wood | no |
| letterbox | LETTERBOX | frontage, Gardens | 12 | 80 | 0.2 | 20 | 90 | 1 | 0.005 | metal | no |
| deckchair | DECKCHAIR | promenade, Quay | 8 | 0 | 0.3 | 15 | 60 | 0 | 0.005 | wood | no |
| parasol | PARASOL | promenade, Quay | 6 | 0 | 0.3 | 15 | 40 | 0 | 0.005 | plastic | yes |
| fishStall | FISH STALL | frontage, Quay | 70 | 0 | 0.2 | 60 | 500 | 1 | 0.02 | wood | no |
| lobsterPot | LOBSTER POT | promenade, Quay | 10 | 0 | 0.4 | 10 | 30 | 0 | 0.005 | wood | no |

What the rule makes of them, a 1,400 kg car at 60 km/h: a bin costs 2.3 %
of the speed, a sapling 6 %, a lamp post 13 %, a hydrant 13 %, a bus
shelter 23 %, a newsstand 37 %. A lamp post holds below 18 km/h, a sapling
below 23, a hydrant below 29, a newsstand below 32. The slices' pins read
these from the formulas, so a changed row moves its pin with it.

## 4. Slices

### Slice 0 — the props as data and where they stand (1 day)

- `props.ts`: the catalogue (every row of §3.3; the models come with their
  slices), `chunkProps` with the two lines, the clearances of D7 and the
  chunk's own random stream; this slice places the lamp, the sapling, the
  bin and the bench.
- `City.ts`: the decoration lamp posts, benches and street trees leave the
  statics (they become the slice's props); the lamp posts move to the kerb
  line.
- `CityView.ts`: standing props built into the chunk parts with their
  ranges (near level all, far level the tall; tall ones in the casters'
  prefix). They stand, and until slice 1 they cannot be knocked.
- Pins: **0.1** in every chunk every prop keeps D7's clearances (lanes,
  the walkers' band, rings, doors, billboard lines, jumps' ramps and
  run-outs, corners, overpasses, the cold open's route) and 0.3 m from its
  neighbours; the list is the same twice and its ids are stable. **0.2** the
  buildings, the billboards and the coins of every chunk are those of 0.7.0
  (a hash of the three lists); the layout hash pin 11.1 re-pinned with the
  reason (the decoration left the statics). **0.3** a built chunk part holds
  each of its props' ranges once, the far level only the tall kinds.

### Slice 1 — the knock (1.5 days)

- `Props`: the state by id for the 49 chunks; the grid over the physics
  ring; the swept contact for the player's footprint; `knockImpulse`,
  `carSpeedLoss`; the anchored props' colliders (disabled on a knock); the
  pool of 16 with CCD; settle to lying; lying knocked again; the ballistic
  fallback; the heal; the `smash` event (no pay yet).
- The render: the collapse and restore of a prop's range in both levels;
  `PropsView` for the four kinds; `propMesh` for them.
- `TrackBot.pavement` (opt-in): the bot's line offset onto the kerb, for
  the pins and the measurement.
- Pins: **1.1** the rule's numbers at 60 km/h for a 1,400 kg car: a bin
  −2.3 ± 0.3 %, a lamp post −13 ± 1 %; the lamp post holds at 15 km/h (the
  car stops at it, a wall `hit`, the chain lost) and goes at 25. **1.2** the
  prop leaves at `J / m` ± 2 % along the tilted normal. **1.3** the compact at
  60 km/h on a Crown Heights kerb line (`pavement`) knocks every bin and
  lamp post on it and never stops. **1.4** thirty knocks in two seconds: at
  most 16 bodies, the rest ballistic, all lying within 10 s. **1.5** a lying
  prop 60 s out of reach stands again, its collider enabled. **1.6** no
  allocation in `Props.step` and `afterPhysics` over 600 steps with knocks
  (the M6 allocation audit's method). **1.7** two runs give the same poses
  after 10 s.
- **The measurement** (the design talk's one exception): the draws at the
  M7 gate's 40 tour points against 0.7.0 (the standing props add none), and
  two alternating 60 s pairs against 0.7.0 with `&life=0` and the pavement
  bot, MX330, `?quality=low`, 4× CPU; the rows in PROGRESS. A cost over
  3 fps on the same drive stops the content until the mechanism is cheaper.

### Slice 2 — the trees (0.5 day)

- Thick trunks solid (a trunk collider in the physics ring, a wall); the
  street trees are the saplings of slice 0 and now snap; the clearances of
  D7 for solid trunks; six-sided crowns for both.
- Pins: **2.1** every thick trunk of the 49 chunks has its collider in the
  ring and none stands in a clearance. **2.2** the compact at 40 km/h into a
  park tree: a wall hit with the wall's damage; at 60 km/h through a
  sapling: it snaps and costs 6 ± 1 %.

### Slice 3 — the street set (1 day)

- The hydrant (its jet: 20 s, the thrust within 1.2 m, upward on any
  vehicle body over it), the parking meter, the newspaper box, the café
  terrace (a table with its umbrella and two to four chairs, in front of
  the corner shops), the bus shelter, the newsstand; their models.
- Pins: **3.1** the new kinds keep 0.1's rules; terraces only in front of
  corner shops. **3.2** a compact parked over a broken hydrant rises no more
  than the thrust allows (upward speed under 1 m/s at any time); a car
  driving through it rocks and nothing flies. **3.3** the shelter and the
  newsstand hold at 20 km/h and go at 40, with the rule's speed loss.

### Slice 4 — the districts' sets (1 day)

- The Works' yards (pallets, barrels, crates, cones, barriers, tyres), the
  Gardens (fruit stands, flamingos, gnomes, fences along the lot edges,
  letterboxes), the Quay (deckchairs, parasols, fish stalls, lobster pots,
  its promenade benches as wood); their models.
- Pins: **4.1** each district's kinds only in their district, and 40–70
  props a block (parks and yards may hold more). **4.2** a barrel knocked
  from the side rolls (its spin about its axis within 20 % of rolling
  without slip after 0.5 s).

### Slice 5 — the spectacle (1 day)

- Debris by material from the knock's point (glass shards, paper, fruit
  spheres, splinters; a pool of 96, render only, gravity and one bounce);
  sparks on metal; the hydrant's water column (at most four at once,
  world-anchored, its height with the jet's life); a synthesized voice per
  material (metal, glass, wood, plastic, fruit, paper, ceramic) and the
  jet's hiss by distance.
- Pins: **5.1** every material emits its particles, never more than the
  pool, and nothing is allocated per frame. **5.2** the column follows its
  jet and is hidden with none.

### Slice 6 — the pay (0.5 day)

- `Trick.Smash` with the kind's points and name; the 0.5 s grouping toward
  the multiplier; boost per smash; heat per smash with the sight factor;
  the run's bill on the door's wall (`CITY DAMAGE 18,400`); the ticker's
  lines when the run's bill passes 10,000 and 50,000 in a district.
- Pins: **6.1** a terrace's ten pieces in 0.8 s: the chain's points are the
  sum, the multiplier counts two tricks. **6.2** a lamp post that holds
  loses the chain. **6.3** heat per smash, times the factor when seen.
  **6.4** the bill sums the stickers and never touches the bank or the bag.

### Slice 7 — everyone else (1 day)

- Lent traffic and police bodies knock by the rule with their masses (the
  Δv on their bodies); cars on their lanes push lying props off their path
  near the player; the walkers' dodge reads flying and ballistic props;
  no damage from props.
- Pins: **7.1** a chasing cruiser through a terrace loses the rule's speed.
  **7.2** a lying prop in a lane is pushed off by the next car on it; no car
  stops for it. **7.3** a bench knocked through a crowd touches no walker
  (the guarantee). **7.4** no damage stage from props at any speed.

### Slice 8 — mayhem and the cold open (0.5 day)

- The two mayhem zones dressed as markets (stalls, crates, tables, chairs
  within the zone's radius); a smash priced at its bill; the quota 15,000
  (a market's thirty things are 6,000–9,000 at the sticker: two markets, or
  one and the traffic, in a minute).
- The cold open's footway run: a café terrace and a newsstand before the
  billboard gate, on its route; nothing solid on it.
- Pins: **8.1** each zone holds at least 30 props; a smash's price is its
  bill; the quota. **8.2** the cold open's route crosses at least 8 props
  and no solid trunk or anchored prop that would hold at its speed.

### Slice 9 — the long game (0.5 day)

- Save version 5 with `career.smashed`; two dailies (`SMASH 60 THINGS IN ONE
  RUN`, `FLATTEN 10 LAMP POSTS`, the daily's `prop` filter); Big Bernie's
  second requirement `SMASH 300 THINGS` (the lifetime count; his jumps
  requirement goes, the jumps keep their hunt).
- Pins: **9.1** v4 → v5 (0 smashed) and the v5 round trip. **9.2** the dailies
  count a run's smashes and the lamp posts alone. **9.3** Bernie's
  requirement reads the lifetime count.

### Slice 10 — the gate (0.5 day)

`verify:gate`; `game`, `heat`, `city`, `life`, `screens` (the overlap and
the wall checks), the boot loop, `balance` (refitted if the smashes move its
inputs); perf A/B against 0.7.0 (§5.3); the chaos run; the screens looked
at; `docs/M8_REPORT.md`; PROGRESS entries older than M8 archived to
`docs/history/PROGRESS_M7.md`; version 0.8.0.

## 5. Verification

### 5.1 Headless tests

About 30 new pins across the files of §4; no existing pin loosened. The pins
that may change, with the reason in PROGRESS when they do: the layout hash
(11.1: the decoration left the statics), the dailies' rolls (the pool grew),
the board's requirement pins (Bernie), the mayhem quota and pay pins (the
zone tests), the save's shape (v5), and a long pin moved by a prop only
after D12's search.

### 5.2 e2e (at the gate)

`game.spec.ts` gains a smash: the car put on a kerb line knocks a lamp post
(the event, its range collapsed, its instance shown) and the chain's word
names it. `screens.spec.ts` gains the door's `CITY DAMAGE` line at the ten
sizes. `heat`, `city` (the tour's budgets now with the props), `life`
unchanged.

### 5.3 Performance protocol

Bases: 0.7.0 (`perf/m7-gate-final-1..3.json`: 50.2 / 50.5 / 51.1 fps;
without traffic `perf/m7-gate-nolife-new-1..3.json`: 55.9 / 54.9 / 55.8).
The M7 gate's method: 0.7.0 exported to a scratch folder on 4174, three
alternating pairs of 60 s runs, `?quality=low`, the car's position logged
every 5 s in both (the drives must match before a number is read), the
same-drive pairs (no traffic; the first 20 s), the 40-point draw sweep;
nothing else running on the machine (no build, no test) during a run. And
the chaos run: the pavement bot through Crown Heights for 60 s. Expected:
on the same drive 0.7.0's speed within ±3 fps; the chaos run at 45 fps or
more with the frame p95 at 33.4 ms or under; the props' phase mean at most
0.3 ms under 4×.

### 5.4 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify:gate` | green, lint 0 warnings | tools/verify.mjs |
| The quick verify's tests | under 60 s | tools/verify.mjs |
| Startup bytes before gameplay-start | ≤ 8 MB target, 12 MB fail | tools/budget.mjs |
| Time to control, 20 Mbit + CPU ×4 | ≤ 5 s | e2e/city.spec.ts |
| Boots reaching control | 200 of 200 | the boot-loop spec |
| Draws / tris, low, whole-map tour | ≤ 150 / 250k (M7: 89 / 204k) | e2e/city.spec.ts |
| Draws / tris, high, whole-map tour | ≤ 300 / 600k (M7: 116 / 279k) | e2e/city.spec.ts |
| fps on the same drive | 0.7.0's ± 3 | the A/B |
| The chaos run, low, 4× | ≥ 45 fps, frame p95 ≤ 33.4 ms | the A/B |
| The props' phase mean, 4× | ≤ 0.3 ms | e2e/perf.spec.ts |
| JS heap | ≤ 50 MB (budget 250) | perf |
| HUD boxes intersecting; anything over the wall | none, ten sizes | e2e/screens.spec.ts |
| The balance | (a)–(d) green | tests/sim/balance.test.ts |

## 6. Records

PROGRESS entries per slice as before. ARCHITECTURE records: the contact
before the solver (D1), anchored props as walls (D2), the pool and the
ballistic fallback (D3), standing props in the chunk meshes and the collapse
(D5), save version 5 (D10). BACKLOG: each line this milestone ships leaves
it (the trees' crowns, the interior billboards' run-out if the terraces
take it).

## 7. Gate criteria (definition of done for M8)

1. Slices 0–9 committed with their pins; every row of §3.3 in the game and
   pinned through its formulas.
2. `verify:gate`, `game`, `heat`, `city`, `life`, `screens`, the boot loop
   and `balance` green; the images inspected; the A/B and the chaos run
   quoted with the drives matched.
3. Every budget of §5.4 holds.
4. No footway static without a collider or a prop's rule; no walker ever
   touched; no prop inside a lane or a clearance of D7.
5. No per-frame allocation in `Props.step`, `afterPhysics`, `PropsView.update`,
   the debris, the collapse; layering intact (no three.js in `src/sim/`); no
   new dependency; `docs/BRIEF.md` untouched; every M1–M7 pin unchanged
   except those §5.1 names.
6. Marcin's playtest notes on the build in PROGRESS; M9 starts on his word.

## 8. API facts and traps

- Rapier 0.20 (`@dimforge/rapier3d-compat`): `Collider.setEnabled(false)`
  takes an anchored prop out of the solver without removing it (enable it
  on the heal); a chunk's colliders leave with its fixed body when the
  physics ring unloads it. A pool body: `RigidBodyDesc.dynamic()
  .setCcdEnabled(true)` (a 0.3 m bin at 25 m/s moves 0.42 m a step: without
  CCD it tunnels through thin walls), parked with `setEnabled(false)`; the
  kind's collider is made at the knock (a creation per knock, never per
  step). Read the installed types for the out-parameter forms of
  `translation()` and `rotation()` before the read-back.
- The knock runs after the controls and before `world.step`; the car's
  velocity changes through the vehicle's `setVelocity`, as the billboards
  do. A prop spawned at its standing pose with its launch velocity is ahead
  of the car within the step (the launch speed exceeds the car's); no
  overlap is resolved twice.
- The swept test: at 200 km/h the footprint moves 0.93 m a step; test the
  prop's circle against the footprint's rectangle grown by its radius
  (a rounded rectangle) along the step's motion, in the car's frame.
- The chunk parts are built in slices over frames (`GeometryBuild`): a
  knock on a part whose level is still building is kept and applied at the
  build's finish; tall props belong to the casters' prefix
  (`shadowVertices`). The collapse writes zeros into the range and uploads
  it with `addUpdateRange` (three r159+).
- Every instanced mesh is hidden while its count is 0: three.js issues a
  draw call for an instanced mesh with no instances (the M7 gate's finding,
  pin G.3).
- The walkers' dodge (`Pedestrians.dodgeFrom`) takes a mover's position and
  velocity; a ballistic prop's velocity is its arc's at that step.
- The bots (D12): if a long pin moves, log the props the bot touched before
  anything else; the M7 gate lost hours to pins moved by the world.
- The perf A/B (M7 gate): alternate old and new, log the drives, run
  nothing else meanwhile, and read the fair pairs before the protocol's.

## 9. Five-minute playtest script (for the gate report)

1. Crown Heights at 60 km/h up onto the pavement: the bins, the lamp posts,
   a café terrace. What barely slows you and what costs speed?
2. A lamp post slowly (15 km/h): it holds. Again at 50: it goes, and its
   top folds toward you.
3. A hydrant: the water; drive into the column.
4. Two stars, then through a terrace with a cruiser behind: does it eat the
   tables too?
5. The Works' barrels, the Gardens' flamingos, the Quay's deckchairs.
6. A row of smashes into a near miss: the chain's words, the multiplier.
7. The door: `CITY DAMAGE` on the wall.
8. `?fresh=1`: the van's first minute through the terrace.
9. Anything on a pavement you still pass through? A walker through a post?

## 10. Reviewer checklist (Claude, at the gate)

Every §3.2 signature as written; D1–D12 honoured (the contact before the
solver with §3.3's numbers, anchored props as walls, the pool of 16 with the
ballistic fallback, the heal, standing props without a draw call, one rule
for every car, the lines and the clearances, trees by trunk, the pay through
the chain, save v5, the bots clear of props); the §7 criteria with their
numbers quoted; the pins changed only where §5.1 names them, each with its
reason in PROGRESS.
