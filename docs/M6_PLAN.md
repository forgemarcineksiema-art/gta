# M6 "The board" — implementation plan

Executor: the agent that starts on Marcin's signal after his M5.5 playtest.
Reviewer: Claude, at the gate. Director and the only tester: Marcin. This
document is the milestone contract for the wanted board (`docs/DESIGN.md`
§14): what to build, in which order, with which numbers, and what "done"
means. Written 2026-09-23 against commit `11b4441`. Until that day `M6`
named the platform milestone; its contract is now `docs/M8_PLAN.md` (M7
from 2026-09-23, M8 since 2026-09-24, when M7 became the polish), and older
docs that say M6 or M7 for the platform mean M8.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§2, §3, §4, §10), `docs/DESIGN.md` §14 in full and §1, §2.2, §2.5, §13.4,
§13.7, `docs/PROGRESS.md` (newest first), `docs/M5.5_REPORT.md`,
`docs/ARCHITECTURE.md`, `docs/STYLE.md` (Vehicles), then this file. Run
`npm run verify`; green before the first edit.

## 0. How to work on this milestone

- **Language, autonomy, scope, honesty**: as in `docs/M5_PLAN.md` §0.
- **Pace** (`CLAUDE.md`): a slice is the code, its pins, the quick verify,
  one commit, eight lines in PROGRESS. The measurements named below are
  taken at the gate; no perf, e2e, screens, balance, browser or research
  between slices.
- **Marcin's notes on 0.5.5 come first**: a short pass (one or two play
  items, a commit each, the rest to BACKLOG) before slice 0. His notes
  between slices outrank this plan; a note on a slice already done is a fix
  before the next slice.
- **Every slice ends in a build he can play.** From slice 1 the board is
  playable on placeholder cars (existing bodies in the rivals' paints); the
  rivals' own cars replace them in slices 4–5 without a save change.
- **Plain words in every message to him**: the rival, the race, wrecking
  their car, the roof item; not duel format, twist flag or body index.

## 1. Scope

### 1.1 In scope (§4 slices 0–11)

1. The garage keeps bodies, not classes; any civilian body kept at a door;
   SELL / KEEP at a fence; the save's version 3 (DESIGN §14.6).
2. The wanted board: ten rivals with two requirements each, lifetime career
   counters, the BOARD page, the goal line's board step, one live rival
   ring and the rematches (§14.2).
3. Two duel formats, the race and the hunt, and the Chief's finale (§14.3,
   §14.5).
4. The ten twists, one per rival (§14.3).
5. The rivals' eleven cars and the ten posters on the hideout's wall.
6. The driver's kit (toppers, neon, horns with the horn as a verb, boost
   flame, tyre smoke) that travels into every swapped car; the day's pick
   (§14.4).
7. The car's kit: wheels, spoilers, stance (§14.4).
8. Three hidden cars (§14.6).
9. The first hours' model in the balance script; the gate.

### 1.2 Out of scope

M8's platform work (the SDK, touch, the mobile tier, the ads' real path; the
day's pick stays cash-only here); cop mode, ghosts, multiplayer; new
districts or roads; a music track without Marcin's yes on the file; any new
dependency; changes to `docs/BRIEF.md`; any change to `VehicleTuning`
presets or the handling pins.

### 1.3 Fixed by the brief and still binding

Everything in `docs/M5_PLAN.md` §1.4: always in a vehicle, pedestrians
always dodge, PEGI 12 (no gambling: nothing random is sold), no menu before
gameplay, control never taken for more than 2 s, keyboard first, the
layering, the budgets, no per-frame allocation in the step paths, every
number in a tuning object, original names only (the `WANTED BOARD`, never
"most wanted").

## 2. Decisions (fixed for M6; each with its reason)

D1. **The board is the long spine: ten rivals and the Chief, each behind
two requirements that point at a different activity.** Reason: DESIGN
§14.1; after the chain there is no goal longer than a run, and a list of
named rivals that asks for the city's activities in order is the chain's
rule over hours instead of minutes.

D2. **Two duel formats only, the race and the hunt, and the twists are
flags on them.** Reason: the race is M5.5's `Race` with one or two rivals;
the hunt is a racer to a point plus the takedown that exists; every twist
is a system that exists (the swap, the disguise, the breakers, the escort,
the helicopter, the radar). No new AI.

D3. **The purse goes into the bag; the car and the item are the player's at
once.** Reason: the run's rule (DESIGN §2.2) for money; a trophy lost to
busted makes a twelve-year-old quit.

D4. **The garage keeps bodies; upgrades stay per class.** Reason: the
collection is bodies ("any car you see can be yours"); per-class tiers keep
the save and the balance small, and tier 0 stays the preset bitwise, so
every handling pin stands.

D5. **The driver's kit travels, the car's kit stays home.** Reason: DESIGN
§14.4; the identity (never keep a car) and customization in one rule; the
day-7 topper already travels.

D6. **Cosmetics never touch `VehicleTuning`, heat or the descriptor.**
Reason: a kit that costs something in a chase is not worn; the descriptor
stays class and paint (DESIGN §2.5); the handling pins.

D7. **No random item is sold: the day's pick is one known item a day at
half price.** Reason: PEGI 12 and the brief rule out gambling; the brief's
"daily cosmetic crate" (§7) is kept as a known item, and M8 makes it the
rewarded offer.

D8. **A rival's car is a body on a class, appended to `BODIES` with a spawn
share of 0, like the ice-cream truck.** Reason: record of M5.5 slice 19
(body and class split); appended, never renumbered, because the index is
packed into descriptors; no new handling model.

D9. **A rival's record is a racer: never a swap candidate, never despawned,
never on a unit's target list unless the twist says so.** Reason: a swap
into the rival's car would skip the duel; the racers already keep their
records for the race.

D10. **The horn is a verb: `horn` on `KeyH`, a gentle pull-aside of the car
ahead.** Reason: a cosmetic horn with nothing to do is pressed once; the
pull-over exists (DESIGN §13.8), the horn uses it at half.

D11. **Save version 3 reserves every M6 field in slice 0.** Reason: one
migration for the milestone (the M5.5 lesson: v2 reserved the chain's
fields), and a v3 document read by a 0.5.5 build is kept, never written
over (`SaveStore.unknownRaw`).

D12. **The requirements read lifetime counters, and the counters start from
what a v2 save proves.** Reason: nothing done before the board opens is
wasted; medals, jumps, billboards, the best run and the cars owned are in
the v2 save; the rest start at 0.

## 3. Architecture

### 3.1 New and changed modules

```
src/sim/board/rivals.ts     RIVALS: the ten defs and the Chief (name, line, turf, body, paints, format, heat, twist, item, purse, reqs)
src/sim/board/Career.ts     lifetime counters read from the event log each step (races, zones, fares, hot fares, orders, takedowns, caches, escapes by level)
src/sim/board/Board.ts      beaten bits, the Chief, next(), ready(i), progress(i, r), win(i); the goal line's board step
src/sim/jobs/Duel.ts        a duel's run: the race through Race, the hunt's racer to a point with armour, the twists, the finale through the escape job
src/sim/jobs/catalog.ts     JobKind 'duel' (level = the rival's index); the rival rings placed after the others in each turf (re-baked)
src/sim/jobs/Race.ts        rivals from a def (one or two; body, paint, pace, band); the rival first fails
src/sim/garage/Garage.ts    car: BodyId, owned bodies, paint and carKit per body, tiers per class (unchanged)
src/sim/garage/kit.ts       KIT (toppers, neon, horns, flames, smoke), CAR_KIT (wheels, rims, spoilers, stances), Kit (owned, equipped, pick(date))
src/sim/traffic/bodies.ts   the rivals' eleven and three hidden bodies appended (share 0); a roof height per body for the topper's seat
src/sim/traffic/Traffic.ts  armour per record (a rival's by rank); the horn's pull-aside; the twins' swap of a racer record
src/sim/city/stash.ts       HIDDEN_CARS: the roadster, the sweeper, the hot-dog van beside the ice-cream truck
src/sim/save/format.ts      v3 (below); the v2 → v3 migration
src/render/bodyProfiles.ts  the fourteen new profiles
src/render/kitMesh.ts       toppers, the neon quad, rim faces, spoilers
src/render/HideoutView.ts   the ten posters on the back wall, rebuilt when the board changes
src/ui/garage.ts            BOARD page; STYLE page (PAINT folded in: CAR and DRIVER); CARS by bodies with the count; SELL / KEEP
src/ui/jobs.ts              the rival's card and the duel's line
src/audio/Sfx.ts            five horns and the air horn
src/input/actions.ts        'horn' (KeyH in KeyboardDevice)
```

### 3.2 Contracts (signatures the reviewer will check against)

```ts
// sim/board/rivals.ts
export type DuelFormat = 'race' | 'hunt' | 'chief';
export type Twist = 'none' | 'bad' | 'heavy' | 'twins' | 'disguise' | 'bus' | 'breakers' | 'escort' | 'heli' | 'ghost';
export type ReqKind = 'chain' | 'raceWins' | 'medal' | 'escape' | 'takedowns' | 'zoneWins' | 'fares' | 'orders'
  | 'carsOwned' | 'jumps' | 'bestRun' | 'billboards' | 'hotFares' | 'caches';
export interface Req { kind: ReqKind; count: number; /** a medal's or an escape's level */ level?: number }
export interface RivalDef {
  name: string;             // 'GRANNY GEARS'
  line: string;             // the poster's one-liner
  turf: 'crown' | 'works' | 'gardens' | 'quay' | 'highway';
  body: BodyId;             // their car (a placeholder body until slices 4–5)
  paints: readonly number[];// one, two for the twins
  format: DuelFormat;
  heat: number;             // the level at the start, 0..5
  twist: Twist;
  item: string;             // a KIT id
  purse: number;
  reqs: readonly Req[];
  /** Where a race finishes or a hunt's door is. */
  target: 'glasshouse' | 'door' | 'scrapyard' | 'donuts' | 'tower' | 'loop' | 'lane';
}
export const RIVALS: readonly RivalDef[];   // [0] = #10 … [9] = #1, [10] = the Chief

// sim/board/Board.ts
export class Board {
  beaten: number;            // bits by RIVALS index
  serial: number;
  /** The player's place: 11 off the board, 10..1 on it. */
  get rank(): number;
  /** The next rival's index, 10 for the Chief, -1 when he is beaten too. */
  next(): number;
  ready(i: number): boolean;
  progress(i: number, r: number): { have: number; need: number };
  win(i: number): void;      // the bit, the car owned, the item owned, the events; the purse is the job's pay
}

// sim/garage/kit.ts
export type KitSlot = 'topper' | 'neon' | 'horn' | 'flame' | 'smoke';
export interface KitItem { id: string; slot: KitSlot; name: string; price: number; /** 0: won only */ colour?: number }
export interface CarKit { wheels: number; rim: number; spoiler: number; stance: number }
export class Kit {
  owned: Uint8Array;                      // by KIT index
  on: Record<KitSlot, number>;            // KIT index or -1
  pick(date: string): number;             // the day's item: never owned while an unowned one exists
}
```

The save, version 3 (the fields that change or join; the rest as v2):

```ts
car: BodyId;                                 // was CarId; the hidden car driven out folds in here
owned: BodyId[];                             // classes' shells keep their ids; 'icecream' joins from v2's hidden
paint: Partial<Record<BodyId, number>>;
carKit: Partial<Record<BodyId, [number, number, number, number]>>;
tiers: Partial<Record<CarId, Tiers>>;        // per class, unchanged
kit: { owned: string; on: [number, number, number, number, number] };  // bits base64; the streak's cone migrates in
board: { beaten: number };
career: { races: number; zones: number; fares: number; hotFares: number; orders: number; takedowns: number; caches: number; escapes: [number, number, number, number, number] };
```

### 3.3 Tuning objects (every number lives here; the board's and the kit's in the dev panel)

- `BALANCE.board`: `purses` by rank (4,000 … 50,000; the Chief 100,000),
  `rematchShare` 0.25, `race.pace` by rank (a factor on `jobs.race.pace`,
  0.9 at #10 to 1.12 at #1), `race.band` by rank (#10 [0.7, 1.15] to #1
  [0.92, 1.3]), `hunt.armour` by rank (1.5 to 3.5; Tina ×2 on top),
  `hunt.lead` 40 m, `hunt.seconds` 180, `hunt.coins` 30, `twins.behind` 150
  m, `breakerReach` 120 m, `escort` 2, the requirements' counts.
- `BALANCE.kit`: every item's price (500–12,000), `pickShare` 0.5.
- `BALANCE.bodyPrices`: a price per civilian and hidden body (KEEP IT is
  `keep.share` of it).
- `TRAFFIC.horn`: `reach` 25 m, `shift` 0.8 m, `seconds` 2, `cooldown` 4 s
  per car.

## 4. Slices

### Slice 0 — the garage keeps bodies (1 day)

Files: `sim/garage/Garage.ts`, `sim/run/Run.ts` (the hot car is a body),
`sim/save/format.ts` (v3 with every field of §3.2, the migration),
`sim/city/stash.ts` (a find is an owned body; `Garage.hidden` goes),
`sim/balance.ts` (`bodyPrices`), `ui/garage.ts` (CARS by class groups with
`CARS n/28`, SELL / KEEP at a fence), `tests/sim/garage.test.ts`,
`save.test.ts`, `hidden.test.ts`, `order.test.ts`.

Behaviour: DESIGN §14.6. The drive-out puts the player in the body on its
class (the swap's path, `bodyTuning`) with the class's tiers; PAINT per
body. A civilian body driven through a door is HOT (`KEEP IT` at
`keep.share` of its price); an order's car at a fence offers `SELL` (the
payout) or `KEEP` (30 %). The count includes the bodies that arrive in
later slices (from the defs).

Tests: 0.1 a taxi kept at a door is owned and drives out as the taxi body
on its class with that class's tiers; 0.2 a v2 fixture (the ice-cream truck
found and driven out, the streak's cone on) migrates with nothing lost; 0.3
SELL pays the order, KEEP owns the car; the M5 garage pins stand.

### Slice 1 — the board and the race (1.5 days)

Files: `sim/board/rivals.ts`, `Career.ts`, `Board.ts`,
`sim/jobs/catalog.ts`, `place.ts` (a ring per rival in their turf, placed
after the others; `npm run bake:jobs`), `Jobs.ts`, `Duel.ts`, `Race.ts`,
`sim/run/goal.ts`, `ui/garage.ts` (BOARD), `ui/jobs.ts` (the card, the
line), `ui/run.ts` (the ticker's board news), `render/MarkerView.ts` (the
rival's ring in their paint), `app/App.ts` (`?board=<rank>`),
`tests/sim/board.test.ts`, `duel.test.ts`, `chain.test.ts`.

Behaviour: DESIGN §14.2 and the race of §14.3. The ten defs on
placeholder bodies (the estate, the hatch, the pickup, the sports car, the
police saloon, the bus, the sports car, the sedan, the hatch, the sports
car, in the rivals' paints). The requirements read `Career` and the save.
One live duel ring (the next rival's, when ready) and the rematches.
Entering shows the rival's card (the poster, the line, the prize) and
starts the race at the def's heat: first over the line wins the place, the
purse into the bag, the car and the item owned, the news line; a rematch
pays `rematchShare`. The goal line after the chain: `CHALLENGE <NAME> ·
n m`, else `#n NEEDS: <the first open requirement>` with the arrow at the
nearest ring of its kind (a door for a bank, the nearest cache for
caches, none for a count with no place). `?board=<rank>` sets the board as
if every rival under that rank was beaten and the next one's requirements
met (tests and Marcin's playtest).

Tests: 1.1 each requirement kind reads its counter; 1.2 only the next ready
rival's ring is live and the beaten ones are rematches; 1.3 a race duel:
the rival spawns with the def's body, paint and pace; the player first →
rank 10, the purse in the bag, the car and the item owned, saved; the rival
first → nothing, the ring stays; 1.4 the goal line's board step and its
arrow after the chain; 1.5 `Career` from the events (a race won, a zone
won, a fare, a hot fare, an order, a takedown, an escape by level, a
cache).

### Slice 2 — the hunt and the Chief (1 day)

Files: `Duel.ts`, `Traffic.ts` (armour per record), `life/Life.ts` (the
rival's wreck wins; their bag's coins), `police/Police.ts` (the Chief on
the roster at the finale's start), `tests/sim/duel.test.ts`.

Behaviour: the hunt of §14.3: the rival starts `hunt.lead` m ahead in the
racers' driving mode to their door (the scrapyard, the donut shop, the
Crown Tower), armoured by rank; their wreck wins and bursts `hunt.coins`
coins on the lane ahead of it; their arrival or `hunt.seconds` loses. The
Chief (§14.5): after #1 his ring stands at the donut shop; the duel is the
escape job at level 5 with `Police.chief` on the roster from the first
second; the escape wins his car (a placeholder until slice 5: the police
saloon in gold), the gold star, the purse, the gold frame.

Tests: 2.1 a scripted ram sequence wrecks an armoured rival only past its
armour (a hit that wrecks a civilian dents the #8 wrecker); 2.2 the arrival
loses and the ring stays; 2.3 the finale has the Chief on the roster in its
first second, and its escape owns his car.

### Slice 3 — the twists (1.5 days)

Files: `Duel.ts`, `Race.ts`, `Traffic.ts`, `police/Police.ts`,
`city/breakers.ts`, `ui/minimapModel.ts`, `render/TrafficView.ts`,
`tests/sim/twists.test.ts`.

Behaviour: the table of §14.3, one flag each. `bad`: Pete weaves ±0.5 m
and passes slower cars on the oncoming side. `heavy`: Tina's armour ×2.
`twins`: a twin who falls `twins.behind` m behind the player swaps, outside
the player's view cone, into the traffic car nearest ahead of the player on
the twin's way; the old car stands abandoned with its driver's fist; the
radio `THE TWINS SWAPPED · NOW IN A <paint> <body>`. `disguise`: no unit
targets Frank; a contact with him is `policeHit`, seen. `bus`: the party
bus races at the race's pace, `keepsLane` off for it. `breakers`: a tower
Niko passes with the player within `breakerReach` m behind him falls.
`escort`: two units spawn beside the limo at the start, heat at least 2.
`heli`: heat 4 at the start, the helicopter on at once. `ghost`: no blip,
lights off, no radio line naming her.

Tests: 3.1–3.8, one a twist (the twins' swap happens out of view and never
in it; no unit plans on Frank and ramming him adds `policeHit` × seen; the
tower falls on the rival's pass; the escort's two units target the player
in the first second; the Ghost is absent from the radar model).

### Slice 4 — the rivals' cars I (1 day)

Files: `sim/traffic/bodies.ts`, `render/bodyProfiles.ts`,
`render/bodyMesh.ts`, `sim/board/rivals.ts` (the real bodies),
`tests/sim/bodies.test.ts`, `tests/render/bodies.test.ts`.

Behaviour: the Wagon (an estate on the muscle class: a blower through the
bonnet, a roof rack of flower pots), the Pizza Hatch (a hatchback on the
compact class under a giant slice), the Wrecker (a pickup on the heavy
class: a crane, a hook, an amber bar), the Twin (a sports coupé on the
sports class), the Fake Cruiser (the saloon on the police class under a
disco light bar), the Party Bus (the bus with a roof deck and speakers,
stretched as the bus). Built as the civilian set is (STYLE §Vehicles), under
3,000 triangles each, appended with a share of 0.

Tests: each body's footprint, collider, mass, class and roof height; the
drive-out in each (the stretched forces as the bus's); the triangle counts.

### Slice 5 — the rivals' cars II and the posters (1 day)

Files: as slice 4, `render/HideoutView.ts`, `render/Renderer.ts` (the
Lowrider's bounce).

Behaviour: the Lowrider (a long low coupé on the sports class; at a
standstill it bounces on its hydraulics, drawn only), the Gold Limo (the
sedan stretched on the muscle class, flags on the wings), the Bubble (a
one-door microcar on the compact class, scaled down), the Phantom (a matte
black sports car, lights off), the Chief's Cruiser (the police body with
gold trim and a gold star). The ten posters on the hideout's back wall,
rebuilt when `Board.serial` moves: each the rival's silhouette in their
paint; the player's poster in its place; the beaten greyed; the next lit.

Tests: as slice 4; the posters' state is a pure function of the board.

### Slice 6 — the driver's kit I: toppers and the STYLE page (1 day)

Files: `sim/garage/kit.ts`, `Garage.ts`, `save/format.ts`,
`render/kitMesh.ts`, `render/Renderer.ts`, `ui/garage.ts`, `balance.ts`,
`app/App.ts` (`?kit=all`), `tests/sim/kit.test.ts`.

Behaviour: DESIGN §14.4. Nine toppers for sale, seven won (six rivals'
and the Chief's gold star); the streak's cone is a topper. STYLE replaces PAINT: CAR
(the paint; the rest in slice 8) and DRIVER (the topper; the rest in slice
7). The equipped topper seats on the roof of whatever body the player
drives (the body's roof height). The day's pick at `pickShare`.

Tests: 6.1 the kit survives a swap into every body, and the seat follows
the roof height (the bus's, the Bubble's); 6.2 the day's pick is the same
all day and never an owned item while an unowned one exists; 6.3 prices and
the save's round trip.

### Slice 7 — the driver's kit II: neon, horns, flame, smoke (1 day)

Files: `kit.ts`, `render/kitMesh.ts` (the neon quad), `render/Smoke.ts`,
the boost flame's view, `audio/Sfx.ts`, `input/actions.ts`,
`input/KeyboardDevice.ts`, `sim/traffic/Traffic.ts`,
`sim/traffic/tuning.ts`, `ui/hud.ts` (the hint strip names H),
`tests/sim/horn.test.ts`, the keyboard suite.

Behaviour: §14.4. Neon: six colours, the two-tone, the pink. Horns: five
and the air horn, synthesized. The horn (D10): H plays the equipped horn;
a civilian ahead in the player's lane within `horn.reach` shifts
`horn.shift` toward its kerb for `horn.seconds`, once per `horn.cooldown`
per car; units and racers ignore it. Boost flame and tyre smoke: five
colours each and the Ghost's smoke.

Tests: 7.1 the pull-aside (a car at 20 m shifts, one at 40 m does not, a
unit does not); 7.2 `KeyH` maps to `horn` by code; 7.3 every slot survives a
swap.

### Slice 8 — the car's kit: wheels, spoilers, stance (1 day)

Files: `kit.ts`, `Garage.ts`, `save/format.ts`, `render/carMesh.ts`,
`render/bodyMesh.ts`, `ui/garage.ts`, `tests/sim/kit.test.ts`,
`tests/render/`.

Behaviour: §14.4, per body. Five rim faces in five colours; three
spoilers seated on the rear deck (the bus, the truck and the vans offer
none); three stances moving the body mesh over the wheels (drawn only). The
wheels keep their simulation transforms.

Tests: the car's kit per body and in the save; the wheel transforms
unchanged with every rim; no `VehicleTuning` field differs with any kit
(the handling pins untouched).

### Slice 9 — three hidden cars (0.5 day)

Files: `sim/city/stash.ts`, `bodies.ts`, `bodyProfiles.ts`, `audio/` (a clue
each), `tests/sim/hidden.test.ts`.

Behaviour: §14.6: the roadster under a tarp in a Crown Heights back lot, the
street sweeper with spinning brushes in a Works yard, the hot-dog van on the
Coral Quay promenade; each placed within `stash.range`, found for good by a
swap (the card, an owned body), a sound to follow as the ice-cream truck's
tune is.

Tests: M5.5's 16.x for each car.

### Slice 10 — the first hours' model (0.5 day)

Files: `tests/sim/balance.test.ts`, `balance.ts`.

Behaviour: the balance script's first hour buys the kit too (the cheapest
unowned visible item when it is the next affordable purchase) and prints
the minute each rival's cash requirement (a best run, cars owned) is
reached. A new assertion: a visible purchase (a car or a kit item) at least
every 8 minutes of the first hour. The run and its numbers at the gate.

### Slice 11 — the gate (0.5 day)

`npm run verify:gate` green; `npm run game` (a duel, the STYLE page, the
horn), `heat`, `city`, `life`, `screens` (with `board`, `style`, `duel`)
green and the images inspected; `npm run perf` A/B against
`perf/m5.5-gate-fix-1..2.json`; `npm run balance` with its tables in
PROGRESS; package `0.6.0`; `docs/M6_REPORT.md` per `CLAUDE.md`; ARCHITECTURE
records (D4, D5, D8, D9, D11); STYLE (the rivals' cars, the kit, the
posters); DEV (`?board=`, `?kit=all`); BACKLOG; PROGRESS entries older than
M5.5 archived. Then Marcin plays, and M8 starts only on his word.

## 5. Verification

### 5.1 Headless tests

About 45 new pins across the files of §4; no existing pin loosened. The
pins that must change, with the reason written in PROGRESS when they do:
the garage pins keyed by class (slice 0), the save's v2 shape (slice 0),
the jobs' placement pin (the rival rings, re-baked), the chain's goal-line
pin (the board step after the chain).

### 5.2 e2e (at the gate)

`game.spec.ts` gains a race duel at `?board=10`, the STYLE page and the
horn; `screens.spec.ts` the `board`, `style` and `duel` states at the ten
sizes. `heat`, `city`, `life` unchanged.

### 5.3 Performance protocol

Bases: `perf/m5.5-gate-fix-1..2.json` (53.7 / 53.9 fps, frame p95 33.3,
step p95 8.7 / 9.2 ms). At the gate `npm run perf` twice. Expected: two or
three draws more on the player's car (the topper, the neon); the posters
live in the garage's merged mesh; a duel's rivals are traffic records. A
frame p95 above the bases in both runs is a regression to fix before the
gate.

### 5.4 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify:gate` | green, lint 0 warnings | tools/verify.mjs |
| Startup bytes before gameplay-start | ≤ 8 MB target, 12 MB fail | tools/budget.mjs |
| Time to control, 20 Mbit + CPU ×4 | ≤ 6 s (M5.5: 3.8–4.3 s) | e2e/city.spec.ts |
| Sim step p95 under 4× | < 12 ms | e2e/perf.spec.ts |
| Frame p95 under 4×, real GPU | < 33.4 ms | e2e/perf.spec.ts |
| Draws / tris, low tour | 150 / 250k | e2e/city.spec.ts |
| A rival's or a hidden body | < 3,000 triangles | tests/render |
| A topper | < 300 triangles | tests/render |
| JS heap | ≤ 250 MB | perf |
| Save, everything filled | < 32 kB | tests/sim/save.test.ts |

## 6. Records

PROGRESS entries per slice; `docs/M6_REPORT.md` at the gate; ARCHITECTURE
records for D4, D5, D8, D9, D11; STYLE sections for the rivals' cars, the
kit and the posters; BACKLOG (the rivals cruising their turf before their
duel, if the playtest asks for a teaser); `docs/CRAZYGAMES.md` Q3 ("clear
reachable goals") from the board.

## 7. Gate criteria (definition of done for M6)

1. Slices 0–10 committed with their pins.
2. `verify:gate`, `game`, `heat`, `city`, `life`, `screens`, `balance`
   green; the images inspected; the perf A/B quoted.
3. Every budget in §5.4 holds.
4. The careful test bot wins the #10 race at seed 42 at least once in
   three; a scripted hunt wrecks the #8 wrecker; the kit survives a swap
   into every body; a visible purchase at least every 8 minutes in the
   model's first hour.
5. No per-frame allocation in `Duel.step`, `Career.read`, `Board`'s reads,
   the horn's scan; layering intact; no new dependency; `docs/BRIEF.md`
   untouched; every M1–M5.5 pin unchanged except those named in §5.1.
6. Marcin's playtest notes on the build in PROGRESS; M8 starts on his word.

## 8. API facts and traps

- `BODIES` is appended, never renumbered: the body index is packed into the
  descriptors next to the paint (`bodies.ts` header, `packDescriptor`).
- The swap's candidate filter and the traffic's despawn must skip a duel's
  racers (D9); `Race` keeps its records alive for the race already, the hunt
  needs the same.
- `Race` was written for three rivals and pays by place; a duel passes one
  or two rivals and the rival first is a loss, not fourth.
- The twins' swap must never happen in the player's view: use the view cone
  the police's pressure rule uses (DESIGN §13.9).
- Frank is his own witness: a contact with him goes through the heat's
  `policeHit` path as seen, and the fault rule (the faster car is at fault)
  still applies.
- The finale is the `escape` job (its end is the cooldown, not a door) with
  the Chief forced onto the roster; the Chief's normal level-5 refill rule
  stands after a wreck.
- The kit is render and audio plus two sim reads (the horn's pull-aside and
  the topper's seat for the view); nothing in `VehicleTuning` reads it.
- The day's pick uses the local date as the dailies do (`?date=`
  overrides); tests without a date draw no pick.
- Toppers seat on the body's roof: every body needs its roof height (the
  profile's top section); the bus's is about 3.1 m, the Bubble's about 1.4.
- The spill's coins for a wrecked rival go through the run-time pool
  (`Coins.addExtra`), as the player's spill does.

## 9. Five-minute playtest script (for the gate report)

1. `?fresh=1`: the chain; after its sixth step the goal line names Granny
   Gears. The BOARD page: ten posters, yours off the board.
2. Beat Granny on the parkway: her Wagon in CARS, the flower pots in STYLE.
3. STYLE: buy the duck, swap into a bus: does the bus wear it. Honk (H)
   through a queue on the avenue.
4. `?board=8`: Tow Truck Tina; wreck the Wrecker before the scrapyard.
5. `?board=6`: Fake Frank; does ramming him make you wanted, and is that
   funny or unfair.
6. `?board=7` the Twins and `?board=1` the Ghost: do the twists read with no
   words.
7. CARS: the count; bring a taxi home and keep it.
8. Report which rival felt unfair and which car you wanted most.

## 10. Reviewer checklist (Claude, at the gate)

Every §3.2 signature as written; D1–D12 honoured (no random sale, no kit in
`VehicleTuning`, bodies appended, racers never swap candidates, v3 read by a
0.5.5 build kept); the §7 criteria with their numbers quoted; the pins
changed only where §5.1 names them, each with its reason in PROGRESS.
