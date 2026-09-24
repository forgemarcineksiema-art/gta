# M7 "Polish" — implementation plan

Executor: the agent that starts on Marcin's signal after his M6 playtest.
Reviewer: Claude, at the gate. Director and the only tester: Marcin. This
document is the milestone contract for the polish (`docs/DESIGN.md` §15):
what to fix and improve, in which order, with which numbers, and what
"done" means. Written 2026-09-24 against commit `67a5ad7` (0.6.0). Until
that day `M7` named the platform milestone; its contract is now
`docs/M8_PLAN.md`, and older docs that say M7 for the platform mean M8.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§3, §4 audio, §6 budgets, §10), `docs/DESIGN.md` §15 in full and §12,
`docs/PROGRESS.md` (newest first), `docs/M6_REPORT.md` and
`docs/M5.5_REPORT.md` (their known issues are this milestone's list),
`docs/BACKLOG.md`, `docs/ARCHITECTURE.md`, `docs/STYLE.md`, then this file.
Run `npm run verify`; green before the first edit.

## 0. How to work on this milestone

- **Language, autonomy, scope, honesty**: as in `docs/M5_PLAN.md` §0.
- **Pace** (`CLAUDE.md`): a slice is the code, its pins, the quick verify,
  one commit, eight lines in PROGRESS. Every measurement below that is not
  a Vitest pin (the browser, the bots, perf, the balance's bot runs, the
  boot loop) is taken at the gate; nothing of it between slices.
- **Marcin's notes on 0.6.0 come first.** Each note is a slice ahead of the
  queue (a commit each); a note on a slice already done is a fix before the
  next slice. His notes outrank this plan's order and its numbers.
- **Nothing new to do** (DESIGN §15.1): no rival, activity, district, mode
  or car. A slice that needs new content to fix something says so in
  PROGRESS and takes the smallest piece.
- **Every slice ends in a build he can play**, and every slice but slice 0
  changes something he can see or hear.
- **Plain words in every message to him**: the top of the screen, the
  music, the marks the tyres leave, the cars taking turns at a crossing;
  not lanes, layers, props or round-robin.

## 1. Scope

### 1.1 In scope (§4 slices 0–14)

1. The workshop: the quick verify under a minute; far props outside the
   traffic's pool and random stream.
2. The screen's lanes: nothing overlaps at the ten sizes.
3. Our own music, synthesized, heat-driven, with stings.
4. The settings row on the pause screen; the save's version 4.
5. Skid marks; the spill's coins flying out of the wreck.
6. No hitches: garbage, chunk building, the quality switch.
7. The frame budget: the traffic step, the bodies' meshes, the trees.
8. A boot that always reaches control.
9. The civilians: the standoff, the plain junctions, the shoved car's
   return.
10. The police's corners and the bite of levels 4–5.
11. The money: the model's quick half, the prices and the multipliers.
12. The city's look: corner shops, a landmark per avenue, the parkway's
    give-way line, worn paint, the hideout signs.
13. The maps and the wall: blocks, parks and water on the big map, the
    radar north up, the wall's keys as a grid.
14. The rivals' leftovers: Granny's pace, a rival seen before their duel,
    the sweeper's brushes. Then the gate.

### 1.2 Out of scope

The platform (M8: the SDK, touch, the mobile tier, the ads, the day's pick
as a rewarded offer); new content; cop mode, ghosts, multiplayer; the
multi-storey car park; the test bots' own limits (race #23's reset loop,
the naive hunter's U-turn, the bot policies at roadblocks); any change to
`VehicleTuning` presets or the handling pins unless Marcin's notes ask;
any new dependency; changes to `docs/BRIEF.md`.

### 1.3 Fixed by the brief and still binding

No menu before gameplay; control never taken away over 2 s; keyboard
first; low-poly flat-shaded, the palette in `src/sim/palette.ts`, no
per-asset textures; music only after gameplay has started (brief §4); the
master mute hook for ads; no per-frame allocation in hot loops; the budgets
of `CLAUDE.md`; UI legible at DPR 1 at the ten sizes.

## 2. Decisions (fixed for M7; each with its reason)

- **D1. Fix what is recorded, and only that plus §15.3.** The list is the
  known issues of the M5.5 and M6 reports and the backlog's play items
  (DESIGN §15.2). Reason: Marcin reads a known-issues list as work to do;
  a polish milestone that invents scope ships none of it.
- **D2. The music is synthesized and rendered offline once.** A score
  (data), a synth that renders each layer into an `AudioBuffer` through an
  `OfflineAudioContext` after `gameplayStart()`, and looping sources started
  together; the heat only moves gains. Reason: no file, no licence, zero
  bytes before gameplay; rendering once means playing allocates nothing and
  the layers never drift apart.
- **D3. One arbiter for the top of the screen.** A pure function decides
  which of the caption, the card, the job line and the news show, and in
  which band; the key hints move to the bottom centre; the pops get a lane
  under the bag. Reason: four modules each placing themselves at 14–16 px
  from the top is the overlap; a rule in one place is testable.
- **D4. Skid marks are render-only.** They read `WheelState` (contact,
  slip) from the sim and write nothing back; one mesh with a ring of quads
  and fixed buffers. Reason: the layering (`render` reads `sim`), and a
  ring never allocates.
- **D5. The settings live in the save, version 4.** `settings: { music,
  effects, quality, radarNorth }`, migrated from v3 with defaults; a 0.6.0
  build keeps its newer-version rule. Reason: CrazyGames' Data module (M8)
  syncs the save; one document, one migration.
- **D6. Props take reserved records.** `Traffic` keeps `PROP_RECORDS` (16)
  records above its pool for the stash's and the board's parked cars: the
  spawner, the density count and the traffic's random stream never touch
  them. Reason: a car standing 300 m away must not move the traffic near
  the player (the M5.5 and M6 gates lost hours to bot pins flipped so).
- **D7. The quick verify runs under 60 s of tests** by moving pins over
  about 5 s into `*.long.test.ts`. Nothing is deleted or loosened. Reason:
  `CLAUDE.md`; every slice pays the difference.
- **D8. The money is fitted in the model's quick half.** The EV table and
  the first hour move from the balance script into a pure module with a
  quick pin on the recorded inputs; the bots' measurement stays at the
  gate, and its novice becomes the careful bot with the unblock rule (it
  waits at lights and drives round a queue like a cautious player). Reason:
  fitting needs many runs of the model and none of the bots; the Pace rule
  keeps the bots at the gate.
- **D9. The M5 `TrackBot` stays bitwise as it is.** New driving rules are
  opt-in tuning flags. Reason: every bot pin's baseline hangs on it (M6
  gate: one shared change turned the heat pin red).
- **D10. Version 0.7.0**, the stamp `0.7.0+<commit>`.

## 3. Architecture

### 3.1 New and changed modules

| Module | What |
|---|---|
| `src/sim/traffic/Traffic.ts` | props on `PROP_RECORDS` reserved records (D6); junction turns; the standoff's side; the blend back |
| `src/sim/city/stash.ts`, `src/sim/board/Board.ts` | spawn through `spawnProp`; the board's teaser car (slice 13) |
| `src/ui/lanes.ts` (new) | the top of the screen's arbiter (D3), pure |
| `src/ui/hud.ts`, `src/ui/jobs.ts`, `src/ui/coldOpen.ts`, `src/ui/styles.css` | placed by the arbiter; the hints at the bottom centre; the pops' lane |
| `src/audio/score.ts` (new) | the music as data: tempo, bars, layers, stings |
| `src/audio/Music.ts` (new) | renders the score offline, loops the layers, gains by heat, stings on events |
| `src/audio/EngineAudio.ts` | a music bus and an effects bus under the master; the ad mute unchanged |
| `src/ui/settings.ts` (new) | the pause screen's settings rows, keys and clicks |
| `src/sim/save/format.ts` | version 4, `settings` |
| `src/render/SkidMarks.ts` (new) | the ring of quads from `WheelState` |
| `src/render/Coins.ts` | the spill's coins fly from the wreck to their spots |
| `src/render/Renderer.ts`, `src/render/CityView.ts`, `src/render/TrafficView.ts` | chunk building under a per-frame budget; a body's mesh on its first spawn; six-segment tree crowns; the quality switch without a reallocation hitch |
| `src/app/bootWatch.ts` (new) | the boot's phases, a watchdog, the phase on the loading screen |
| `tests/sim/model.ts` (new) | the EV table and the first hour, pure (from `balance.test.ts`) |
| `src/sim/balance.ts` | prices, tier prices, the door's multipliers (slice 10) |
| `src/sim/city/City.ts`, `architecture.ts`, `markings.ts` | corner shops, a landmark per avenue, the give-way line, `cityFootprints()` |
| `src/ui/bigmap.ts`, `src/ui/minimapModel.ts` | blocks, parks and water; north up |
| `src/ui/garage.ts` | the wall's keys as a grid |
| `src/sim/board/rivals.ts`, `src/render/bodyProfiles.ts` | Granny's pace; the sweeper's brushes |

### 3.2 Contracts (signatures the reviewer will check against)

```ts
// src/sim/traffic/Traffic.ts
export const PROP_RECORDS = 16; // the four hidden cars and the rivals' parked cars near the player
spawnProp(x: number, z: number, yaw: number, body: BodyId, state: AgentState.Abandoned | AgentState.Parked, paint: number): number; // -1 when all are taken
isProp(agent: number): boolean;

// src/ui/lanes.ts (as built, slice 1: the column stacks, so the function decides who shows, not where)
export type TopItem = 'jobLine' | 'card' | 'caption' | 'hints' | 'news';
export const TOP_ORDER: readonly TopItem[];
export function topBit(item: TopItem): number;
export function arrangeTop(wants: number): number; // a mask of topBits in, the ones shown out
export function mountTop(parent: HTMLElement, items: Partial<Record<TopItem, HTMLElement>>): HTMLElement;

// src/audio/score.ts
export interface Layer { name: 'bass' | 'hats' | 'drums' | 'lead' | 'alarm'; fromHeat: number; notes: readonly Note[] }
export interface Note { bar: number; beat: number; length: number; pitch: number; velocity: number }
export const SCORE: { bpm: number; bars: number; layers: readonly Layer[]; stings: Record<'busted' | 'escape' | 'door', readonly Note[]> };
export function layerGain(layer: Layer, heat: number): number; // 0 or 1; the fade is the audio's

// src/audio/Music.ts
export class Music {
  constructor(ctx: AudioContext, bus: GainNode);
  start(): Promise<void>;          // after gameplayStart; renders, then loops
  setHeat(level: number): void;    // gains over one bar; no allocation
  sting(kind: 'busted' | 'escape' | 'door'): void;
  dispose(): void;
}

// src/sim/save/format.ts
export interface SaveSettings { music: number; effects: number; quality: 'auto' | 'low' | 'high'; radarNorth: boolean } // volumes 0..10

// src/render/SkidMarks.ts
export function skidStrength(slipAngle: number, slipRatio: number, speed: number): number; // 0..1, 0 below the thresholds
export class SkidMarks { constructor(scene: THREE.Scene, capacity?: number); update(sim: SimWorld, time: number): void; dispose(): void }

// src/app/bootWatch.ts
export type BootPhase = 'platform' | 'physics' | 'save' | 'sim' | 'renderer' | 'firstFrame';
export class BootWatch { enter(phase: BootPhase, now: number): void; check(now: number): BootPhase | null; readonly stuck: BootPhase | null }

// tests/sim/model.ts
export function ev(rates: readonly number[], bagPerMinute: number, coinsPerMinute: number, job: number, cashOut: number): Ev;
export function firstHour(input: ModelInput): { bought: Array<[string, number]>; gaps: number[]; seenGaps: number[] };

// src/sim/city/City.ts
export function cityFootprints(city: City): { parks: Rect[]; blocks: Rect[]; water: Polygon[] };
```

### 3.3 Tuning objects

Every number lives in the tuning objects and, where they are, the dev
panel: `TRAFFIC.junction` (the turn's order and the barge rule),
`TRAFFIC.standoff.side`, `TRAFFIC.blendBack`, `POLICE.cornerHandle`,
`BALANCE.prices`, `BALANCE.tierPrices`, `BALANCE.multiplier`,
`RIVALS[0].pace`; the music's in `SCORE` and a `MUSIC` object (the bus
level −14 dB, the fade in bars); the skid marks' in a `SKID` object (the
thresholds, the width, the fade seconds, the capacity); the chunk budget in
the renderer's tuning.

## 4. Slices

### Slice 0 — the workshop (0.5 day)

- Move every quick pin over about 5 s of wall time into a
  `*.long.test.ts` beside it (a name that says what it pins), until the
  quick verify's tests take under 60 s on this machine.
- `Traffic.spawnProp` on `PROP_RECORDS` reserved records (D6); the stash's
  and the board's parked cars use it; the spawner, the density count, the
  claim, the swap filter's pool and the traffic's random stream skip them.
- Pins: **0.1** a world with the stash's roadster standing 300 m away and
  one without: every traffic record within 200 m of the player the same
  (state equal, position within 1 mm) for 120 s at seed 42 (long);
  **0.2** props never counted in the density, never claimed, never
  despawned by the spawner's rule while their owner keeps them; **0.3**
  the quick set's wall time printed by verify under 60 s (the reviewer
  reads it).

### Slice 1 — the screen's lanes (1 day)

- `arrangeTop` (D3): bands from the top (the job line first; the second
  band holds the caption, else a card's top, else the news); the news
  waits while a caption shows and scrolls only in its band; a card pushes
  the job line up, never over it.
- The key hints to the bottom centre, above the prompts (E SWAP, BORROW),
  never under the car's busted pad; the pops (streak, tips, bounties) in a
  column under the bag, never over the speed.
- Pins: **1.1** `arrangeTop` for every combination of the four items at
  450 and 1080 px: no two bands overlap, the priority holds, no
  allocation; **1.2** the hints' and the pops' anchors (a DOM-free check of
  the CSS values the arbiter writes). Gate: the screens suite checks that
  no two visible HUD boxes intersect in every state at the ten sizes.

### Slice 2 — our own music (1.5 days)

- `SCORE`: 120 bpm, 8 bars in A minor to start (tuned by ear): a bass that
  moves (not a pedal note), closed hats, a kick and a clap from heat 1, a
  lead from heat 3, a siren-like figure at 5; stings: busted (a falling
  phrase), the escape (a rising one), the door (the till's chord).
- `Music`: after `gameplayStart()`, one `OfflineAudioContext` render per
  layer (8 bars) and per sting at the main context's sample rate; the
  layers' sources start together and loop; `setHeat` moves each layer's
  gain over one bar; a sting ducks the loops by 6 dB for its length. The
  music bus joins the master under the ad mute.
- Pins: **2.1** every layer is whole bars and the same length; every note
  inside its bar; **2.2** `layerGain` by heat 0–5 (the counts 2, 3, 3, 4,
  4, 5); **2.3** the stings fire on 'busted', 'escape' and the door's
  event, once each; **2.4** `setHeat` allocates nothing (a Node test on
  the logic with a fake context).

### Slice 3 — the settings row (0.5 day)

- The pause screen: MUSIC and EFFECTS (0–10, 7 by default for the music),
  QUALITY (AUTO, LOW, HIGH), RADAR (TURNS, NORTH UP). W/S between rows, A/D
  to change, all clickable; M still mutes everything.
- The save's version 4 with `settings` (D5); a v3 document migrates with
  the defaults. `?quality=` still overrides for tests.
- Pins: **3.1** v3 → v4 keeps everything and adds the defaults; garbage in
  `settings` falls back field by field; **3.2** a volume step maps to the
  bus gain on a dB curve (0 is silence, 10 is 0 dB); **3.3** north up: the
  radar model's heading is 0 whatever the car's.

### Slice 4 — skid marks and the spill (1 day)

- `SkidMarks`: per rear wheel (and a locked front) while grounded and
  `skidStrength > 0` (above 8° of slip angle or 0.25 of slip ratio, over
  3 m/s; tuned in `SKID`), a quad from the last contact to this one, dark
  and translucent, on the road only; a ring of 1,024 quads in one mesh; a
  mark fades over 30 s by its age in the shader.
- The spill's twelve coins fly from the wreck to their spots over 0.5 s.
- Pins: **4.1** `skidStrength` is 0 below each threshold and grows above;
  **4.2** a drift on the skidpad lays marks under the rear contacts within
  2 cm of the ground; **4.3** the ring wraps and never grows; **4.4** a
  flying coin starts at the wreck and ends on its spot.

### Slice 5 — no hitches (1 day)

- The sim's garbage: every allocation left in a step (the Rapier reads, the
  vehicle's update, the events) replaced by reused objects; the render's
  (uniform updates, colours, the HUD strings rebuilt each frame) by
  per-object caches that change only on change.
- Chunk building under a per-frame budget (at most one chunk's meshes and
  one's colliders a frame, nearest first; the boot builds no more than it
  does today); the quality
  switch keeps its drawing buffer at the larger size and changes the
  viewport, so no reallocation.
- Pins: **5.1** 600 steps of the city at seed 42 allocate under 1 KB a step
  on average (a long pin run with the GC exposed); **5.2** chunk builds per
  step never exceed the budget while driving at 60 m/s. Gate: in the 60 s
  perf run, at most two frames over 50 ms after the first 5 s.

### Slice 6 — the frame budget (1 day)

- The traffic's pair scans (`aheadGap`, `unstick`, the body lending) over a
  grid of buckets rebuilt once a step instead of every record against every
  other.
- A body's instanced mesh built the first time the body spawns (the heap
  back under 50 MB); tree crowns of six segments (the shadow pass).
- Pins: **6.1** the pair checks a step at seed 42 in the busy centre under
  a third of 0.6.0's (a counter, not a clock); **6.2** a body's mesh exists
  only after its first spawn; the same pose after 60 s as before the grid
  (the grid changes the cost, not the traffic). Gate: the perf A/B.

### Slice 7 — the boot (0.5 day)

- Read the boot for races: every `await` on an event, a timer, a load, the
  WASM, the fonts, the audio context or the save that could have fired
  before its listener, or never; fix what is found.
- `BootWatch`: the boot's phases; after 5 s in one, the loading screen
  names it (LOADING · CITY); after 15 s it retries that phase once and logs
  it. The gate runs 200 boots.
- Pins: **7.1** the watch's phase machine: order, the 5 s label, the 15 s
  retry, once. Gate: 200 fresh boots of the preview build, each to control
  in under 6 s, none stuck.

### Slice 8 — the civilians (1 day)

- The standoff (M5.5 gate, M6 gate): the civilian goes round on the side
  away from the player, as the pass round a dead car does, creeping while
  it steers, lent body or not.
- The plain junctions take turns: the approaches waiting pass one at a time
  in the order they arrived; the 9 s barge stays only for a car held up by
  the player.
- A shoved car beyond 70 m returns to its lane over 1 s instead of jumping.
- Pins: **8.1** the M6 gate's case (the player mid U-turn in a junction,
  nose to nose): the civilian is past within 10 s; **8.2** four cars at a
  plain four-way: all through within 20 s, never two in the box, none
  barging; **8.3** the return never moves a car more than 0.5 m a step.

### Slice 9 — the police's corners and levels 4–5 (0.5 day)

- A chasing unit takes a junction on a tighter curve than traffic (its own
  handle ratio), so it reads as police driving.
- Levels 4–5 bite at least as hard as level 3: the heavies box (a heavy
  takes a box slot before a saloon), the helicopter's light marks the
  player for the units on the ground.
- Pins: **9.1** a unit's corner stays inside the traffic's curve by at
  least 1 m at its apex; **9.2** at level 4 the first box slot filled is a
  heavy's when one is within reach. Gate: the capture table (the balance's
  measurement), level 4 at least level 3's rate for the novice.

### Slice 10 — the money (1 day)

- `tests/sim/model.ts` (D8): the EV table and the first hour, pure; the
  balance script calls it; the gate's novice is the careful bot with the
  unblock rule.
- Fit on the M6 gate's recorded inputs: the first car at minute 5–7 (the
  brief), every gap 3–10 minutes, something to see bought at most every 8,
  and the skilled driver's best door at least one level above the
  novice's, the skilled bank rising from L1 to its best.
- Pins: **10.1** (quick) the model on the recorded inputs: (a)–(d) hold;
  **10.2** the new prices and multipliers are in `BALANCE` and DESIGN §3.3
  / §2.6 name them. Gate: the balance script, green on (a)–(d) with the new
  novice; refitted there if the new novice moved the inputs.

### Slice 11 — the city's look (1.5 days)

- Corner shops: a frontage lot at a junction gets a shop that faces both
  streets (the ground floor turns the corner).
- One landmark per avenue: a building of its own kind (taller, a sign, a
  colour from the palette's accents) somewhere along each avenue, so each
  reads as a place.
- The parkway's give-way line at its merge; worn patches in the road paint
  (a second paint tone, no texture); the hideouts' lit signs on a pole seen
  from the highway.
- Pins: **11.1** every avenue has one landmark; every avenue corner lot a
  two-sided shop; the same city at seed 42 otherwise (the collision layout
  unchanged); **11.2** the give-way line within 5 m of the merge; **11.3**
  each hideout's sign visible from the nearest highway deck (a ray clear of
  statics).

### Slice 12 — the maps and the wall (1 day)

- `cityFootprints()`; the big map draws blocks, parks and water under the
  roads.
- The radar north up from the settings (slice 3).
- The wall's keys as a grid: on CARS and STYLE, A/D along a row, W/S
  between rows, S from the first row back to the tabs; the focus scrolled
  into view.
- Pins: **12.1** the footprints: parks and blocks inside the island, water
  outside the shore, no block on a road; **12.2** the grid's focus model
  (pure): every card reachable, S from row 0 leaves the page.

### Slice 13 — the rivals' leftovers (0.5 day)

- Granny's pace so the plain bot beats her at least once in three starts at
  seed 42 and the careful bot every time (set from G.1's times; measured at
  the gate).
- The next rival, not yet ready, cruises their turf as a named car in
  traffic (never a swap candidate, never a prop), gone when they park for
  the duel.
- The sweeper's brushes spin while it moves.
- Pins: **13.1** the teaser's record is a rival's, stays in its district,
  and is gone when the rival is ready; **13.2** the brushes' mesh turns with
  the speed, render-only.

### Slice 14 — the gate (0.5 day)

`verify:gate`; `game`, `heat`, `city`, `life`, `screens` (with the overlap
check), the boot loop, `balance`; perf A/B against 0.6.0 (§5.3); the
screens looked at; `docs/M7_REPORT.md`; PROGRESS entries older than M7
archived to `docs/history/PROGRESS_M6.md`; version 0.7.0.

## 5. Verification

### 5.1 Headless tests

About 35 new pins across the files of §4; no existing pin loosened. The
pins that may change, with the reason in PROGRESS when they do: the save's
v3 shape (slice 3), the balance script's structure (slice 10), the traffic
pins whose records move to props (slice 0; the positions and states they
pin stay), the junction pins of the forced override (slice 8).

### 5.2 e2e (at the gate)

`screens.spec.ts` gains the overlap check in every state; a boot-loop spec
(200 fresh boots); `game.spec.ts` gains the settings row (the music's gain
follows its row, the radar north up) and the music starting after
`gameplayStart` (its context's graph exists, silent before). `heat`,
`city`, `life` unchanged.

### 5.3 Performance protocol

Bases: 0.6.0 (`perf/m6-gate-1..3.json`: 51.8 / 52.5 / 53.3 fps, frame p95
33.4 / 33.4 / 33.3, step p95 9.5 / 9.0 / 9.3). At the gate the method of
the MX330's noise: 0.6.0 exported to a scratch folder and served on 4174,
three alternating pairs of 60 s runs, old and new, `?quality=low`, every
other browser tab and preview server closed. Expected: fps at least 2 over
0.6.0 in each pair, the traffic's mean step at most 1.6 ms under 4× CPU,
at most two frames over 50 ms after the first 5 s, the heap under 50 MB.

### 5.4 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify:gate` | green, lint 0 warnings | tools/verify.mjs |
| The quick verify's tests | under 60 s | tools/verify.mjs |
| Startup bytes before gameplay-start | ≤ 8 MB target, 12 MB fail (the music adds none) | tools/budget.mjs |
| Time to control, 20 Mbit + CPU ×4 | ≤ 5 s (M6: 3.97 s; the brief's 6 s) | e2e/city.spec.ts |
| Boots reaching control | 200 of 200 | the boot-loop spec |
| Frames over 50 ms after 5 s, 60 s run | ≤ 2 | e2e/perf.spec.ts |
| Traffic step mean under 4× | ≤ 1.6 ms | e2e/perf.spec.ts |
| Frame p95 under 4×, real GPU | not above 0.6.0's in the A/B | e2e/perf.spec.ts |
| JS heap | ≤ 50 MB (budget 250) | perf |
| HUD boxes intersecting | none, ten sizes, every state | e2e/screens.spec.ts |
| The balance | (a)–(d) green | tests/sim/balance.test.ts |

## 6. Records

PROGRESS entries per slice as before. ARCHITECTURE records: the props'
reserved records (D6), the music rendered offline (D2), the top of the
screen's arbiter (D3), skid marks from `WheelState` (D4), the save's
version 4 (D5), the model's quick half (D8). BACKLOG: each line this
milestone ships leaves it.

## 7. Gate criteria (definition of done for M7)

1. Slices 0–13 committed with their pins; every issue of DESIGN §15.2
   fixed or, where a fix failed, named in the report with why.
2. `verify:gate`, `game`, `heat`, `city`, `life`, `screens`, the boot loop
   and `balance` green; the images inspected; the perf A/B quoted.
3. Every budget of §5.4 holds.
4. Granny Gears: the plain bot wins at least once in three at seed 42, the
   careful bot three in three.
5. No per-frame allocation in `Music.setHeat`, `SkidMarks.update`,
   `arrangeTop`, the props' path, the junction's turn; layering intact; no
   new dependency; `docs/BRIEF.md` untouched; every M1–M6 pin unchanged
   except those §5.1 names.
6. Marcin's playtest notes on the build in PROGRESS; M8 starts on his word.

## 8. API facts and traps

- `OfflineAudioContext(channels, lengthInFrames, sampleRate)`: render at
  the main context's `sampleRate` or every loop is resampled; the render is
  a promise off the main thread, but building the graph (one node per note)
  is not: build it after `gameplayStart()` in the first quiet second, never
  during the boot.
- An `AudioBufferSourceNode` plays once: the loops are started once and
  never stopped; a sting makes a new source each time (a few objects per
  sting, not per frame). Start every layer at the same `currentTime` plus
  a margin, or they drift by a buffer.
- The ad mute is the master's gain (`EngineAudio`); the music and effects
  buses sit under it so an ad silences both.
- `BufferAttribute` partial updates: check the installed three.js for
  `addUpdateRange` (r159+) versus `updateRange`; write only the quads laid
  this frame.
- Rapier's JS reads (`translation()`, `rotation()`, `linvel()`) return new
  objects in some versions: read the installed `@dimforge/rapier3d-compat`
  0.20 types for the out-parameter forms before replacing them.
- The M5 `TrackBot` is not touched (D9); the balance's new novice is a
  tuning flag on the careful bot.
- The two-world pin (0.1) compares only records near the player: a prop
  near the player borrows a physics body by design.
- A save written by 0.7.0 is version 4; 0.6.0's rule for a newer version
  (keep it, play without saving) is the fallback, pinned since M5.

## 9. Five-minute playtest script (for the gate report)

1. `?fresh=1`: the intro's first seconds. Anything on top of anything?
2. Drive a minute, then raise the heat to 3: does the music come in after
   the start and climb with the stars; the busted and escape stings.
3. The pause screen: turn the music down, the radar north up; M still
   mutes all.
4. Drift round a car park in the Works: the marks on the asphalt, and where
   they fade.
5. A plain crossing with four cars: do they take turns. Stop nose to nose
   with a car: does it go round you.
6. The first rival: beat Granny Gears. First try?
7. Hold Tab: the parks, the blocks, the water.
8. The first half hour: when did you buy the first car, and did waiting at
   heat 3 before the door pay.

## 10. Reviewer checklist (Claude, at the gate)

Every §3.2 signature as written; D1–D10 honoured (only §15's list plus
§15.3, the music rendered once and playing without allocation, one arbiter,
skid marks in render only, save v4 read by a 0.6.0 build as newer, props
outside the pool, the quick verify under a minute, the model fitted in its
quick half, the M5 bot untouched); the §7 criteria with their numbers
quoted; the pins changed only where §5.1 names them, each with its reason
in PROGRESS.
