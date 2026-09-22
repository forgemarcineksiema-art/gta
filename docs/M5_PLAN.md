# M5 "The launch minimum" — milestone contract

For the agent who builds M5 after the M4 gate. Written 2026-09-22, before M4
slice 3, so every number that M4 will measure is marked with the slice that
sets it; the agent replaces those placeholders from `docs/PROGRESS.md` at the
start of the milestone and does not guess. Design and reasons: `docs/DESIGN.md`
(§2 the run, §3 audience and progression, §4 activities, §6 the city as a
level, §9 the platform KPIs, §11 the launch scope). Standing rules:
`CLAUDE.md`. The brief's M5 line: activities, progression, garage, save, daily
challenges, the cold-open onboarding, UI and audio passes, the balance
simulation. DESIGN.md §11 cuts it to the launch minimum: three jobs, the
garage, save, the cold open finished, the balance script; the rest is update
2. Work the slices in order; each ends in a commit with verify green, a pin or
an e2e check, and one behaviour measurement in `docs/PROGRESS.md`. Marcin
plays every slice by hand; his feel notes outrank any number here.

## 0. Ground rules that bite in this milestone

- Sim stays headless: jobs, the garage catalogue, the save format and the
  dailies logic live in `src/sim/` with no Three.js, no DOM and no
  `localStorage`. The save's IO is app glue (`src/app/save.ts`) over
  `Platform.saveData/loadData`; the format itself is a pure module with pins.
- One save key, versioned JSON, a migrations table from version 1 onward,
  writes debounced to at most one per second and forced on the door, busted,
  leaving the garage and `pagehide`. Size guard in a test: the serialized
  save stays under 32 kB; the SDK's cap is 1 MB and we never get near it.
- Every number lives in `src/sim/balance.ts` (prices, payouts, heat costs,
  time limits, dailies, the streak) or in the tuning objects that already
  exist. All live in the dev panel.
- No new runtime dependency. No web fonts. No third-party asset without a
  line in `docs/ASSETS.md` with source and licence; silence beats a licence
  question (the music bed in slice 8).
- Game-made breaks are the door, the busted card and the garage; each is
  bracketed by `gameplayStop()` / `gameplayStart()` through the adapter, as
  M4 slice 8 wired the door and the card. Focus loss never calls
  `gameplayStop()`. At most one ad per door: the rewarded offer when the bag
  is above its threshold, else the midgame request; never at the door that
  ends the cold open (`docs/CRAZYGAMES.md` P2).
- Rewarded offers only in the garage (the lawyer, the fence) and at the door
  (double the bag), each with a cash price as the equal-size alternative,
  hidden whenever `adsAvailable('rewarded')` is false, never a reward on
  `adError`. `LocalPlatform`'s `?ad=off`, `?ad=error&adError=…`, `?adblock=1`
  are the test paths.
- Jobs are data: one `JobDef` per instance from a catalogue, placed by the
  generator, deterministic per seed. Nothing is hand-placed by coordinates;
  the generator exports sites (junction corners, the drop-offs from
  `cover.ts`).
- Perf A/B as in M4: the M4 gate smoke numbers are the baseline, alternate
  builds before calling a regression.
- Stop only at the gate, before destructive operations, or to change a brief
  fixed decision. Otherwise decide, note it in PROGRESS, keep going.

## 1. Inputs from M4 this plan waits for

| Placeholder | Set by | Where it is used |
|---|---|---|
| bag per minute, coins per minute, run length (novice bot) | M4 slice 3 measurement | prices, job payouts, the balance script |
| busted rate per level, novice and skilled bot | M4 slice 6 measurement | multipliers, the EV assertion, escape bounties |
| the cold open route, captions and their timing | M4 slice 4 | slice 5 finishes it |
| the identity rule, the disguise, the descriptor | M4 slice 5 | steal-to-order (slice 2), the respray |
| the door, the totals, the drop-offs, `Platform.requestAd` | M4 slices 3 and 8 | the garage, the offers |

## 2. Layout to add

```
src/sim/balance.ts            + prices, job payouts and time limits, heat costs, dailies, the streak, prep items
src/sim/jobs/Jobs.ts          one active job: idle → active → done | failed; markers, the target, the timer, payout into the bag
src/sim/jobs/catalog.ts       JobDef per instance: kind, marker pose, target (a pose or a car descriptor), limit, payout, heat cost
src/sim/jobs/place.ts         placement by the generator at junction corners with the billboard placer's footprint query
src/sim/garage/Garage.ts      the catalogue, owned cars, paint per car, upgrades (three stats × three tiers), prep items
src/sim/save/format.ts        SaveV1, serialize / parse / migrate, pure; defaults for a missing or corrupt save
src/sim/dailies/Dailies.ts    three challenges from the local date, progress from events and run results, the streak
src/sim/run/ColdOpen.ts       (M4) finished: the seen flag from the save, the first-car line on the wall
src/app/save.ts               load before the sim boots, debounced writes, forced writes at the breaks and on pagehide
src/render/Arrow.ts           the Crazy Taxi arrow over the car; render/MarkerView.ts job markers and the wanted car's ring
src/ui/jobs.ts                the job card, the timer, the distance; ui/garage.ts the wall pages; ui/results.ts the totals extended
tests/sim/jobs.test.ts, garage.test.ts, save.test.ts, dailies.test.ts
tests/sim/balance.test.ts     `npm run balance`: the progression model with the bot as the capture probe; not part of verify
e2e/game.spec.ts              save round trip across a reload, a job completed by the bot, the garage, the offers on every ad path
e2e/screens.spec.ts           + the job card, the door with totals, the garage, busted, at the ten sizes
```

## 3. Slices

### Slice 0 — save and prices

- `SaveV1` (`sim/save/format.ts`): version, the seen flag, bank, coins, owned
  cars, paint per car, upgrade tiers per car, the current car, best run,
  `Collectibles.smashed` as a bitset string, dailies progress with their date,
  the streak (count, last date), the police unlock flag. `parse` returns
  defaults for a missing, corrupt or future-version save and never throws;
  `migrate` walks a table from version 1. `app/save.ts` loads before the sim
  is built so the garage car and the seen flag apply at spawn; writes at most
  once a second, and at once on the door, busted, leaving the garage and
  `pagehide`; `?fresh=1` clears the save for playtests.
- `balance.ts` gains the launch catalogue (DESIGN.md §3.3, the five bodies
  that exist: muscle is the starter, compact 10k, heavy 30k, sports 60k,
  police 120k plus one heat-5 escape), upgrade prices and multipliers, job
  payouts and limits, heat costs, dailies, the streak, the lawyer and the
  fence. Muscle Pro, GT and the ice-cream truck need new profiles and are
  update 2 (set here: the brief's eight vehicles become five at launch; Marcin
  overrides).
- Pins: round trip is bitwise; a v0 (empty) and a corrupt string give
  defaults; a future version gives defaults and keeps the raw string aside;
  size under 32 kB with everything filled; a storm of 600 events in a second
  produces one write; the forced writes happen on each break.
- Measurement: save bytes after a 15-minute bot session with fifty
  billboards smashed.

### Slice 1 — jobs framework, the arrow, getaway delivery

- `Jobs`: markers are 4 m rings with a 3 m beacon at junction corners
  (`place.ts`, the footprint query, off the carriageway, deterministic per
  seed), 6 deliveries at launch. Driving into a ring starts the job at once
  (brief §3: activities begin by driving into a marker); a card shows the
  kind, the payout and the limit for 1.5 s; one active job, other markers do
  nothing while it runs. The target is a drop-off from `cover.ts` or a placed
  pose; the timer counts down; reaching the target pays `payout × (1 + 0.5 ×
  remaining / limit)` into the bag and pushes a `jobDone` event; the timer
  running out pushes `jobFailed`, no payout, the heat cost stays. Heat +6 on
  start (the tip-off), from `balance.ts`.
- The arrow (`render/Arrow.ts`): one flat chevron 2.5 m over the car,
  pointing along the ground direction to the target, fixed size; the HUD
  shows the distance in metres beside the timer; the radar shows the target
  through `setMarkers`.
- Time limits from the road, not from a table: `limit = 1.3 × the lane-path
  time at the speed limits` between marker and target, floored at 45 s.
- Pins: entering a ring starts the job and applies the heat cost once; the
  arrow's yaw is within 2° of the bearing to the target; reaching the target
  pays the formula into the bag and ends the job; the timer fails it; no
  second job while one is active; markers deterministic per seed, off the
  carriageway, none within 60 m of another.
- Measurement: the bot completes a delivery by lane path: time against the
  limit and the payout. Written to PROGRESS.

### Slice 2 — steal-to-order

- The marker is a fence (the two drop-offs and a third site in Palm
  Gardens); the order is a descriptor, class plus paint, drawn so that
  `Traffic` can guarantee one instance: within 5 s of the start a matching
  car exists 300–600 m away and out of view, by repainting an unseen
  kinematic agent or spawning one. The wanted car carries a ring under it
  (`MarkerView`) when within 150 m and in view and a marker on the radar;
  the arrow points at it. `E` into it starts the timer (240 s from the swap)
  and adds heat +4 (the theft is the crime); the arrow turns to the fence.
  Delivery pays `payout[class] × (1 − 0.1 × damageStage)`; a wreck cannot be
  delivered; the fence is not picky: if the wanted car is wrecked before the
  swap, the guarantee runs again on another matching car. The identity rule
  and the disguise from M4 apply to the car left behind.
- Six orders at launch, the class drawn from the four non-police bodies
  (the police car is a job of its own in update 2).
- Pins: the guarantee (a matching agent exists within 600 m and out of view
  within 5 s, for every class and paint); the swap starts the timer and adds
  the heat once; delivery pays by stage; stage 4 cannot deliver; retarget
  after a wreck; the old car is abandoned with the player's paint.
- Measurement: bot hunt time with a naive policy (drive to the ring), and the
  share of guarantees that repainted versus spawned.

### Slice 3 — pursuit escape

- Four markers at the chokepoints `cover.ts` exports (the on-ramps), each
  with a level 2–4. Entering sets heat to at least that level's threshold
  (the ratchet never lowers), dispatches the roster and forces `Pursuit` to
  `active`. The `escape` event pays `escapeBounty × level` into the bag and
  ends the job; busted ends it with the usual fine and no bounty.
- Pins: heat and pursuit state after entering; the bounty on escape; nothing
  on busted; a higher current heat is kept.
- Measurement: the bot's escape rate per marker with the skilled policy from
  M4 slice 6.

### Slice 4 — the garage: catalogue, paint, upgrades, the offers

- The wall in the hideout (DESIGN.md §2.9) gets pages after the totals:
  cars (owned or priced, the police car gated on the heat-5 flag), paint
  (the respray, free, changes the descriptor), upgrades (power, grip, boost
  refill; three tiers as multipliers on the preset; prices per tier), prep
  items (the lawyer, the fence) and the dailies wall (slice 6). Navigation
  with the existing actions: steer moves, throttle confirms, brake backs
  out; DOM buttons also click, so touch (M6) costs nothing here. Never
  Escape.
- Buying or choosing a car retunes the player's `Vehicle` in place on
  drive-out (the swap machinery), sets `carId` and the paint. Upgrades are
  multipliers applied after the preset; tier 0 is the preset, so the M1 and
  M4 handling pins do not move.
- The offers: the lawyer (keep three quarters when busted this run, 5k) and
  the fence (+50 % multiplier this run, 8k) as cash purchases, each also a
  rewarded-ad button of the same size with a video icon, shown only when
  `adsAvailable('rewarded')`; the door's "double the bag" offer when the bag
  is above `offerThreshold`, else the midgame request. Input blocked from
  the request to `adFinished` or `adError`; mute on `adStarted`; no reward on
  `adError`; `happyTime()` on the first purchase of a car.
- Pins: purchase arithmetic and gating; upgrades multiply the preset and
  tier 0 equals it; the respray changes the descriptor; the police flag; the
  offer hidden with `?ad=off` and `?adblock=1`; no reward with
  `?ad=error&adError=other`; one ad at most per door; the brackets around
  the garage.
- Measurement: the garage at the ten sizes (screens), and the number of
  keypresses from the door to driving out with a new car (target under 8).

### Slice 5 — the cold open finished

- The M4 prototype on the save: the seen flag persists across reloads; the
  first-car line on the wall computed from the bank and the compact's price;
  marker art and the arrow from slice 1 replace the prototype's stand-ins;
  captions final (STYLE.md keycaps, one word each); the `skip` action ends it
  and the flag is set; no ad request at that door.
- Pins: shown once across a reload; the bot completes it; no ad request at
  the first door; `gameplayStart()` fires once at control.
- Measurement: Marcin's first minute by hand on `?fresh=1` with a stopwatch,
  the time to each verb, written down.

### Slice 6 — dailies and the streak (ships with the launch if it fits after slice 5; else it opens update 2)

- Three challenges from the local date (`YYYY-MM-DD` hashed with
  `mulberry32`) drawn from about twelve templates in the language of runs
  ("bank 20k in one run", "escape from heat 3", "three takedowns in a
  compact", "smash 10 billboards", "deliver an order at stage 0"); progress
  from the event ring and the run results; the reward goes to the bank on
  completion; refresh at local midnight. The streak counts consecutive local
  days with a launch, seven steps of rising cash, a roof topper on day 7
  (one attachable mesh, the first of the brief's silly toppers). Shown on
  the hideout wall.
- Pins: the same date gives the same three; different dates differ;
  progress and completion; the midnight refresh; the streak increments once
  per day and resets after a missed day; the topper attaches and survives a
  swap (it is the player's, not the car's).
- Measurement: none beyond the pins; the completion share comes from live
  data after launch.

### Slice 7 — the balance script

- `tests/sim/balance.test.ts`, run by `npm run balance` (vitest, one file,
  not part of `verify` because it steps the sim for minutes): two profiles,
  novice and skilled, with the bot policies from M4 slice 6; for each level
  1–5 the bot drives three minutes under the police, headless, seed 42, and
  the script reads the busted rate; then the EV model of DESIGN.md §2.7
  with the measured rates, earnings per minute from M4 slice 3 and the job
  payouts, prints the table per cash-out level for both profiles and the
  time to each unlock through the first hour. Asserts: the optimal cash-out
  level rises with skill; the novice reaches the compact between 5 and 7
  minutes; a purchase (car or tier) is affordable every 5–10 minutes through
  the first hour for the novice. `balance.ts` is tuned until the assertions
  hold, and the table goes into PROGRESS and the gate report with the date
  and the commit.
- Pins: the three assertions above.
- Measurement: the table.

### Slice 8 — UI and audio pass, the gate

- UI at the ten sizes: the HUD with the job card, the arrow distance and
  timer, the coin counter, the bag, the stars, the dailies on the wall; the
  pause overlay carries the mute state; every text in English and short
  (STYLE.md). No menu before gameplay stays true: the wall is a place.
- Audio: sirens scaled by heat if M4 polish did not land them, a job jingle,
  the coin chime, the door thud, the topper's sound if it has one; the
  master mute on ads verified end to end. Music bed: one CC0 track streamed
  after `gameplayStart()` and recorded in `docs/ASSETS.md`, or none if no
  clean licence is found.
- Gate: `e2e/game.spec.ts` (save round trip across a reload, a delivery and
  an order completed by the bot, the garage reachable, the offers on every
  ad path); `npm run screens` with the new states at the ten sizes; perf
  A/B against the M4 gate; `npm run balance` green with its table; a
  ten-minute bot session recording bag, bank, jobs completed and coins as
  the KPI rehearsal; `docs/M5_REPORT.md` per `CLAUDE.md`; decision records
  in ARCHITECTURE; BACKLOG; `docs/CRAZYGAMES.md` rows D1, D2, D5 (save), A5,
  A6, A7, A8, A9 (the offers), Q1, G10, P2 (the cold open) moved to `done`
  or `n/a` with the reason.

## 4. Numbers to start from

All placeholders; DESIGN.md §2.7 and §3.3 explain the intended shape. Rows
marked "M4" are replaced from `docs/PROGRESS.md` before slice 0.

| Knob | Start | File |
|---|---|---|
| catalogue | muscle starter; compact 10k; heavy 30k; sports 60k; police 120k + one heat-5 escape | balance.ts |
| upgrade tiers | power ×1.06 / 1.12 / 1.20; grip ×1.04 / 1.08 / 1.12; boost refill ×1.1 / 1.2 / 1.3; 2k / 5k / 12k per tier | balance.ts |
| delivery | payout 5k–12k by lane-path distance; limit 1.3 × path time at the limits, floor 45 s; heat +6 on start | balance.ts |
| steal-to-order | payout compact 4k, heavy 5k, muscle 6k, sports 8k; −10 % per damage stage; 240 s from the swap; heat +4 at the swap | balance.ts |
| pursuit escape | bounty 1,500 × level; markers at levels 2, 2, 3, 4 | balance.ts |
| dailies | 3k / 5k / 10k by template weight; streak 500 → 5,000 over seven days; topper on day 7 | balance.ts |
| prep items | lawyer 5k (keep ¾ when busted); fence 8k (+50 % multiplier this run) | balance.ts |
| door offer | "double the bag" when the bag is above 8k, else the midgame request | balance.ts |
| save | one key `save`, version 1, debounce 1 s, size guard 32 kB | sim/save/format.ts, app/save.ts |
| bag and coins per minute | M4 slice 3 | balance script |
| busted rate per level | M4 slice 6 | balance script |

## 5. Five-minute playtest per slice

Start on `?fresh=1`: the cold open, the door, the totals with the first-car
line. Bank a second run and buy the compact; drive out in it. Take a delivery
by driving into a ring, follow the arrow, watch the timer. Take an order,
find the ringed car on the radar, swap, deliver it with and without a dent
and compare the payouts. Drive into an escape marker and get out. Get busted
with the lawyer bought and read the fine. Open the wall, read the dailies,
reload the page: everything kept. Report what felt wrong before what worked.
