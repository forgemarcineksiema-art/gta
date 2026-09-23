# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-23 — M5, the launch minimum

Marcin: carry out the whole M5 plan. Working autonomously per
`docs/M5_PLAN.md`, slice by slice.

### Before slice 0

- §1.2 checked against the code at 3ae1f72: every row exists (Run with the
  bag, bank, coins, `maxHeat`, the fine and the spill; `cover.ts` with the
  three drop-offs and the chokepoints; the coins; the door and the wall;
  the cold open on the jobs skeleton; the bot policies; the twenty jumps;
  the descriptor, the disguise and `blown`; the ad points; the events; the
  measurements). One gap: `cover.ts` has no Palm Gardens fence; slice 2
  adds it, as the plan allows.
- `npm run verify` green before the first edit: 231 tests in 62.5 s.

### Slice 0 — save and prices

- `sim/save/format.ts`: `SaveV1`, frozen `DEFAULT_SAVE`, `serialize` in a
  fixed key order, `parse` that never throws, the migrations table
  (v0 → v1), field-by-field sanitising (a broken field falls back alone),
  `collect` / `apply`, and the billboards as a bit set in base64 ('' when
  none). `app/save.ts`: `SaveStore` (load, the debounce as a throttle with
  the first write at once, `flush` that skips an unchanged text,
  `unknownRaw` for a newer version, `pagehide` and hidden flushes).
- `SimWorld` owns `garage` and `dailies` (state from now; the wall in slice
  4, the draw in slice 6); `SimWorldOptions.save` is applied last in the
  constructor; `?car=` still wins. `App.boot` loads before the world,
  `?fresh=1` clears the key; the store marks dirty from the ring and
  flushes at the door and the card; the debug line shows `save n kB`.
- `balance.ts` carries §3.4, `measured` filled from the M4 gate.
- Tests: `save.test.ts` 0.1–0.6, `tests/app/save.test.ts` 0.7–0.10.

Measured: everything filled serializes to 1.1 kB (guard 32 kB); a
15-minute novice bot session with traffic and peds saves 359 bytes (15 min
of sim took 16 s of wall in Node). A reload in the browser kept the bank,
the compact, its respray and the billboard count.

Decided (set here):
- `jobs.timeBonus` stays at the jobs level where M4 put it, not inside
  `delivery` as §3.4 writes it: M4's pin 4.7 reads it there, and it is the
  rule for any timed arrival.
- `BALANCE.measured.runSeconds` is 600 as a floor: no bot run ended in the
  M4 measurement's ten minutes. `bagPerMinute` 406 and `coinsPerMinute` 36
  are the midpoints of the measured ranges.
- Money in the save is kept to the cent, not rounded to whole units:
  `playSeconds` is fractional and one rule serves every amount.
- The garage's drive-out sets the descriptor directly (kind, paint, a clean
  disguise on the dispatcher's clock) instead of `Pursuit.onSwap`, which
  would count an escape if a chase were on.
- The player's paint for a class is the garage's (`Garage.paintOf`): the
  swap leaves the old car in it and the descriptor takes it.

### Slice 1 — jobs framework, the arrow, getaway delivery

- `sim/jobs/catalog.ts` (kinds, the def, the descriptor packed as class
  index << 24 | paint, the order paints per class, the card's words),
  `sim/jobs/place.ts` (the generator's sixteen: corner aprons of the grid
  junctions `ROAD_HALF + 6` m out on both arms, the approach from the kerb
  corner clear of anything a car would hit by the billboard placer's
  `tallFootprint`, off every carriageway, 20 m from the doors, 25 m from the
  ramps, 15 m from the camera poles; the four escapes one per side of the
  island where a street meets the highway; the twelve others by
  farthest-point sampling from a seeded start; a delivery to the nearest
  drop-off at least 400 m by lane path; limit and payout from that path at
  the lanes' limits). A candidate's chunk is generated only when it is
  about to be picked.
- `Jobs` extended in place (same names): `hunting`, `idleTarget`,
  `arrowTarget`, a marker re-arms only once the car has left it, and only
  the cold open's own marker is live while it runs (its def is id 0).
- `render/Arrow.ts`: a 12-triangle chevron 1.2 m long, 2.5 m above the
  roof, full `carOrange` on a job and 40 % between jobs. `render/MarkerView.ts`
  instanced: rings and beacons in the kind's colour, the running job's
  target ringed. `ui/jobs.ts`: the line at the top centre and the 1.5 s card;
  the key hints give way to it. The radar's job rings are local (no rim
  chevrons for sixteen of them); the running target clamps to the rim.
  Sfx: the two-note start, the done chord, the failed buzz.
- Tests: `jobs.test.ts` 1.1–1.6 and 1.8; `jobs.long.test.ts` 1.7.

Measured (seed 42, traffic on): the road bot from each delivery ring into
its drop-off, time of limit and pay of payout: #9 scrapyard 45.2 of 75 s,
5,993 of 5,000; #10 hotel 46.1 of 71, 5,876; #11 scrapyard 84.7 of 120,
5,735; #12 scrapyard 32.0 of 51, 5,933; #14 scrapyard 59.0 of 74, 5,506;
#15 hideout 44.5 of 82, 6,145. Placement: 16 defs in 71–130 ms in Node
for seeds 42 / 7 / 123 (chunk generation is most of it). Smoke: 104 draws
(+4: the arrow, rings, beacons), 244k triangles (+1k), 60 fps. Tests 248
in 66 s (the quick set was 59 s before M5: over the minute already).

Decided (set here):
- Escape markers stand where a street meets the highway, one per side of
  the island: the chokepoints are highway lane points, which a ring off the
  carriageway cannot sit on, and these corners are the on-ramps.
- Every delivery pays the 5,000 floor at seed 42: the nearest drop-off 400 m
  away is 0.5–1.2 km by path, and `payoutPerKm` 4,000 reaches 5,000 only at
  1.25 km. Left for the balance script (slice 7) to tune, not guessed here.
- The arrow lies in a plane tipped 45° toward the camera and turns inside it
  to the bearing: a horizontal chevron is edge-on to a chase camera below
  it. `Arrow` takes the camera as an optional second constructor argument.
- In the cold open the arrow shows only while its delivery runs; the job
  line and card stay hidden (the captions lead).
- An order arrives only in the ordered class and not as a wreck; a swap away
  from the stolen car leaves the job waiting for it.

Perf after slice 1 (MX330, 4× CPU, 60 s bot): 56.5 fps, frame p95 16.8 ms,
step p95 7.0 ms, draws max 104, triangles max 266k, heap 48 MB, frame max
167 ms (`perf/m5-slice1.json`). The M4 bases were 54.7 / 55.4.

### Slice 2 — steal-to-order

- `Traffic.ensure(kind, paint, player, near, cosHalf)`: the nearest unseen
  driving civilian of the class in the 300–600 m band is repainted, else a
  car is spawned on a lane in the band out of view through `claim`;
  `paintOf`; `wanted` keeps the car from the despawn and from `claim`.
- `Jobs`: hunting keeps the wanted car while it is the class, the paint and
  a driving civilian, and asks again every `ensureSeconds` otherwise;
  `orderFound` once; Life's swap tells `Jobs.onSwap` before the record
  changes hands (the clock and the heat start there); the fence pays
  `payout × (1 − 0.1 × stage)`, a wreck never arrives. The wanted car cruises
  at `order.cruise` (0.5) of its lanes' limits, renewed every step as the
  cold open holds its candidate, and goes back to traffic when the job ends.
- The Palm Gardens fence is `palmFence(city)` in `place.ts`: the first clear
  lot 2 m past the Garden Parkway's pavement from the middle of the arc
  (−369, 419 at seed 42). The orders' fences are it, the scrapyard and the
  hotel; each order goes to the nearest one at least 400 m by path.
- `MarkerView` rings the wanted car within 150 m and in front of the camera;
  the job line says FIND A LIME COMPACT · 20 m, then DELIVER THE COMPACT.
- Tests: `order.test.ts` 2.1–2.6; `order.long.test.ts` 2.7 (the hunt).

Measured (seed 42, traffic on), the naive hunter (the road bot re-planning
the shortest lane path to the wanted car every 2 s): before the cruise, 2 of
6 reached within 15 m in 240 s (130 and 153 s); with the cruise at 0.5,
4 of 6 in 20.1, 81.3, 21.8 and 78.0 s. The traffic spawned the car in 17 of
18 hunts over three runs and repainted one: civilians live within the 320 m
despawn radius, so the 300–600 m band rarely holds one. Perf after slice 2:
56.9 fps, frame p95 16.8 ms, step p95 6.8 ms, draws max 104, heap 51 MB,
frame max 83 ms (`perf/m5-slice2.json`).

Decided (set here):
- The wanted car cruises at half its lanes' limits (`order.cruise`): at the
  full limit a hunter at 30 m/s through junctions closes too slowly and the
  car turns away at random; a car idling along is also what the job's
  fantasy is (spot it, pull alongside, take it).
- `order.long.test.ts` floors the naive hunter at 4 of 6: it loses the car
  where its re-plan routes through a U-turn; the player has the radar, the
  arrow and the ring.
- The fence lives in `place.ts`, not `cover.ts`: finding a clear lot needs
  the chunk's statics, and `cover.ts` is a pure function of constants.

### Slice 3 — pursuit escape

- The four escape markers (levels 2, 2, 3, 4) raise the heat to the level's
  threshold (never lower) and `Pursuit.force(radioSeconds)` puts the police
  on the player at once; the `escape` event pays `bounty × level` through
  `jobDone` (on top of the run's own `escapePerLevel`); busted and the door
  end it silently. `Pursuit.radioLeft`: for the first 8 s
  (`jobs.escape.radioSeconds`) the police know where the player is.
- Tests: `escape.test.ts` 3.1–3.5; `escape.long.test.ts` 3.6.

Measured, the skilled bot from each marker, seeds 42 / 7 / 123, traffic on,
up to 3 min: 6 of 12 escapes. Level 2: 5 of 6 (31–54 s, two by a swap);
level 3: 1 of 3 (11 s by a swap; busted at 37 and 42 s); level 4: 0 of 3
(busted at 43–62 s). Without the radio window a level-3 marker paid its
bounty in 16 s with no chase: the units spawn out of view, the pursuit went
straight to `lost` and the cooldown won it.

Decided (set here):
- The radio window (8 s): "the police have you" has to be true for long
  enough that the units reach the player before the cooldown can start,
  or the escape job is a free bounty.
- The quick suite's time is `traffic.test.ts` (M3, 68 s under the parallel
  load; the next longest is 27 s): the suite runs as long as its slowest
  file. Moving its bot drives into a long file is M3 housekeeping, in
  BACKLOG, not done here.

### Slice 4 — the garage: catalogue, paint, upgrades, prep, the offers

- `sim/garage/Garage.ts` (from slice 0) is complete: buy, select, the free
  respray, three stats in three tiers as multipliers on the preset
  (`tuningFor`), the lawyer and the fence (cash, or granted by a video),
  the police car locked until one escape from level 5 (`Run` sets it on the
  `escape` event), `applyToVehicle` (retune in place, heal, the descriptor).
  `CarMesh.setPaint` recolours the three paint tones with the damage kept;
  the renderer applies the garage's paints when its serial moves.
- `Run`: the fence adds `prep.fenceBonus` to the door's multiplier, the lawyer
  keeps `lawyerKeep` of a busted bag, both are spent at any run's end;
  `doubleLastBag()` once a door; `lastSerial` refreshes the totals.
- `ui/garage.ts` (`GarageUi`): tabs TOTALS / CARS / PAINT / TUNE / PREP /
  DAILIES in M4's wall panel, two levels of keys (steer between pages or
  items, throttle confirms and drives out on the totals, brake backs out),
  every item a button with the key's handler. The door's offer (DOUBLE THE
  BAG with the video icon beside BANK IT, same size, BANK IT focused) is
  answered before the pages open. Video buttons are hidden with no rewarded
  ad. `WallNav` replaces the plan's `ActionState` argument: `ui` may not
  import `input`.
- `App`: the one caller of the garage and of the ads. The shut door shows
  the garage car at once (a purchase or a respray is seen on the car behind
  the door); at most one ad a door: the offer when the bag is above 8,000
  and a rewarded ad exists, else the midgame request, never at the session's
  first door; the rewarded path blocks input, mutes only on `adStarted`,
  rewards only a finished ad, and answers the offer either way. DRIVE OUT
  applies the car, opens the door, flushes the save. `happyTime()` on the
  first car bought.
- Tests: `garage.test.ts` 4.1–4.6; `e2e/game.spec.ts` 4.7–4.10 (`npm run
  game`); the screens add `job`, `garage` and `dailies` at the ten sizes.

Measured: the door to driving out in a new car by keys, 6 presses (D, W,
W, S, S, W; target under 8). The compact's 0–100 is 8.87 s at tier 0 (in
cars.test.ts's 8.5–13 band) and 7.23 s at tier 3 power. `npm run heat` 10/10
on this build. Screens 31/31, looked at: the wall fits at 800×450 (the
key-hint strip overlapped its tabs for the first 12 s, the M4 known issue:
the hints now hide off the road). Perf after slice 4: 56.8 fps, frame p95
16.8 ms, step p95 6.4 ms, draws max 104, heap 48 MB, frame max 500 ms
(`perf/m5-slice4.json`; the M4 long-frame issue).

Decided (set here):
- The garage spends the bank and the coins (`Run.funds`, the bank first):
  DESIGN.md §3.3's first car is "3k in coins plus 8k in the bag at ×1.25",
  so coins must buy; the pools stay apart (D14: coins never enter the bank).
  The wall says CASH.
- The garage car is applied when the door shuts, not only at drive-out:
  the respray is "applied at once to the mesh in the garage", and the car
  behind the door is the one the next run starts in.
- FIRST NEW CAR shows at every door until the compact is owned (YOU HAVE n,
  or IT IS YOURS IN CARS once the cash is there), not only at the cold
  open's door: the goal stays in view.
- A video for a prep item already bought is never requested.

### Slice 5 — the cold open finished

- `SimWorldOptions.coldOpen` starts the script at boot unless the save has
  seen it; `App` asks for it on a plain load of a profile that has not
  (`coldopen=1` forces it, test parameters turn it off); the session flag
  is gone. The save's `seen` counts a started cold open, and the store is
  flushed as it starts: a reload mid-way never repeats it (M4's 4.9 pin,
  unchanged, and M5's e2e 5.4). The delivery inside is the real delivery
  on def id 0, the arrow shows while it runs; its door asks for no ad and
  offers nothing.
- Tests: `coldOpen.test.ts` 5.1–5.2 (5.3 is M4's long pin, kept);
  `e2e/game.spec.ts` 5.4–5.5.

Not measured: Marcin's first minute on `?fresh=1` with a stopwatch is his
(the gate report asks for it).

Decided (set here):
- `seen` is written when the cold open starts, not when it ends: the plan's
  slice text says completion or skip, but its own e2e 5.4 and M4's 4.9 want
  a reload after the first caption not to repeat it. The first minute is
  shown once per profile.

### Slice 6 — dailies and the streak

- `sim/dailies/Dailies.ts`: thirteen templates in the language of runs
  (bank N in one run, escape from heat 3 or 5, takedowns in a compact,
  billboards, an order without a scratch, deliveries, police takedowns,
  coins, near misses, banked runs in a row); `setDate` draws three distinct
  ones from `mulberry32(fnv1a(date))`, moves the streak by the civil
  calendar (`dayNumber`, no `Date`), pays the day's streak cash once;
  `step` counts from the ring (completions paid after the read);
  `onRunEnd` from `Run.endRun`; every reward into the bank.
- The daily police seed: `setDailyOrder(cover, seed)` orders each fixed site
  list and mans the first share today (chokepoints 60 %, parked junctions
  60 %, cameras 80 %); the roadblocks, the parked patrols and the cameras
  skip unmanned sites. Before a date every site is manned.
- `App` feeds the local date at boot and once a minute; `?date=` overrides;
  test sessions without it keep M4's all-manned police and draw nothing.
  The DAILIES page, DAILY DONE and DAY n STREAK popups, the day-7 topper (a
  40-triangle `carOrange` cone on whichever car the player drives).
- Tests: `dailies.test.ts` 6.0–6.5.

Decided (set here):
- The topper, once earned, stays when a streak breaks: a cosmetic a player
  earned is not taken back.
- Cameras join the daily share at 80 %: an unmanned camera keeps its pole
  (nothing new placed, nothing removed) and does not flash that day.
- Test sessions (`bot`, `manual`, `spawn`, …) draw no dailies and man every
  site unless `date` is given, so the perf runs and the M4 suites stay
  deterministic across calendar days.

## 2026-09-23 — The coin layer as lines

Marcin: the coins are placed hopelessly and thoughtlessly; their look, how a
coin reads and the moment of picking one up could be much better; think it
through properly. Looked at the shipped layer from the chase camera: runs of
8–12 at random along every directed lane, so the highway carried four
unsynchronised dotted lines, one beside the double yellow; thin `carOrange`
discs (the cones' colour) that vanished edge-on; a pickup that blinked the
coin away. Redesigned in one slice: DESIGN.md §3.5 holds the design.

### Done

- `sim/city/coins.ts` rewritten: `layoutCoins` lays the island's lines from
  the seed (ten trails of eight lanes with a run or a weave on each and a
  link through every turn taken; fillers on about half of the roads left;
  sweeps on the authored bends by their curvature; an arc over every ramp
  laid for a 97 km/h launch under the car's gravity) and `placeCoins` adds
  the gate line through each chunk's billboards (a swerve onto the footway
  and back inside 22 m, so the line clears the street tree 13 m past the
  panel; a 30 m hook off the ring's outer lane for the verge panels). One
  figure per road; every line ends on a cap worth 50; every lane keeps its
  gate window clear, a weave the oncoming lane's too; a link never lays its
  head in one. The turn curve uses proportional handles (the ring's inner
  corners have a 16 m gap; the route's fixed 24 m handles loop there).
  `CoinDesc` carries `y`, `value` and `phase`; `PlayerProbe.y` is set.
- The pickup box reaches 1 m past the bumpers, 1.2 m past the doors and
  1.5 m up and down about the bonnet: a coin in the air needs the car in
  the air (`BALANCE.coin.reach`).
- `render/Coins.ts`: an octagonal prism (28 triangles) a metre across in
  `PALETTE.coin` gold, emissive 0.35, spun and bobbed in the vertex shader
  with a per-instance phase attribute so a line ripples away from the
  player; the cap 1.5×, the spill 1.7× white; two flight pools (gold, white)
  driven by the `coin` events fly a picked coin into the bonnet in 0.16 s.
- HUD: the counter pops once per coin and flashes the accent on a cap; the
  glyph is gold. Sfx: the bell is two sines that climb a semitone per coin,
  a cap adds a fifth that rings on.
- The cold open's route line at the same 4.5 m pitch, skipping the gate line
  by `gateLine`.
- Tests: `coins.test.ts` 3.8 rewritten for the new rules (deterministic;
  no coin inside a solid, by an oriented test per shape; none doubled
  island-wide; a cap on the centre of every billboard; three coins in the
  air past every ridge and the cap beyond them; 1,500–3,000), 3.9 takes the
  cap's value, 3.13 new: the reach and the height rule. The old 3.8 pinned
  the carpet (every coin on a lane centre, 30 m clear of the lane's end,
  2,000–3,500); those rules were the defect, so the pin changed with the
  design.

### Measured

- Island: 2,405 / 2,303 / 2,344 coins for seeds 42 / 7 / 123 (about 400
  in the gate lines, 100 in the air, 185 caps).
- Novice bot, 5 min from heat 0, traffic on, seeds 42 / 7 / 123: 39.0 /
  32.2 / 40.4 coins a minute worth 534 / 426 / 564 (the carpet: 42–53 worth
  420–530). The economy of §3.3 holds for a driver who ignores the lines;
  the caps are a third of the take. M5's `measured.coinsPerMinute` comment
  updated.
- Smoke (MX330, high): 60.0 fps, p95 16.7 ms, 100 draws (+2: the flight
  pools while a coin flies), 243k triangles (+33k: about 1,200 resident
  coins at 28 triangles instead of 8). Low tier stays under 250k by the
  same margin as the gate's tour.

### Decided (set here)

- A coin line is a sentence: it starts, has a shape, and ends on a cap at
  the thing it pointed at. One figure per road, never a carpet.
- `PALETTE.coin` is the HUD accent's value: the glyph and the coin are one
  thing. STYLE.md's "the accent is not a palette colour" now has this one
  exception, written there.
- No sparkle or burst on a pickup: the coin flies into the bonnet, the
  counter pops, the bell climbs. The car catches the coin.
- Trails wander at random for now; aiming them at content is a BACKLOG line
  for M5, as is the spill's scatter animation.

### Next

- Marcin drives it: does a line read from the chase camera, does the catch
  feel right, is the bell too much at six coins a second.

## 2026-09-23 — One game, one build

Marcin: too many links, builds and versions; sort it out and run the main
build. Found: one repo, one branch, one worktree, clean; a dev server from
2026-09-22 still on 5173 (started by an earlier session of mine); `main` 16
commits ahead of `origin`; the six M4 probe scripts committed in `output/`;
the README opening with 22 test URLs; and the first attempt at the game
(Heat City, last commit 2026-09-19) in `C:\Games\Nowy folder (5)` beside
this repo.

### Done

- `npm start` (build + preview on 4173) is the one way to play; the README
  says so and leads with it. `npm run dev` is for editing. The test URLs,
  the QA hooks, the suites and the scratch folders moved to `docs/DEV.md`;
  CLAUDE.md, AGENTS.md and the M4 report point there.
- The build stamp: `__APP_VERSION__` is `<version>+<short commit>`
  (`-dirty` when uncommitted changes went in), shown bottom right on the
  pause screen and in `window.__game.version`. Package version 0.4.0.
- `output/` is git-ignored as a whole; the committed probes are removed.
- `origin/main` brought up to date. The stale dev server on 5173 is still
  up: the harness refused the kill, and it serves the same source anyway;
  Marcin closes that terminal when he likes.

### Decided (set here)

- Version scheme `0.<milestone>.<patch>`: the minor moves at each gate, the
  patch for a fix Marcin asks for after one (ARCHITECTURE record 40).
- `Nowy folder (5)` (Heat City) is Marcin's to delete; nothing here refers
  to it. The other siblings in `C:\Games` are unrelated projects.

## 2026-09-23 — Playtest after the gate: the bonnet smoke

Marcin, first minute: "why does the car smoke like that? it ruins the whole
game". The cold open's van is stage 2 by design (DESIGN §6.6), and a stage-2
car emitted 12 puffs a second. A puff hangs in the air behind a moving car
and the chase camera, 6.4-8 m back and 2.4 m up, drove through every one:
at 80 km/h a white wash lay over the van's rear doors. The point size was
also a fixed pixel factor, so the puffs grew on smaller screens.

### Done

- `Smoke`: sizes are world metres projected with the camera's real scale
  (`setViewport` from `Renderer.resize`); every puff fades out between 7 and
  3.5 m from the camera and fades in over 0.12 s at the source; a `density`
  argument thins a puff's peak alpha and shortens its life.
- `Renderer.emitSmoke`: the player's smoke density is `1 / (1 + v / 10)`
  (v in m/s), 10 puffs a second at stage 2 and 24 at stage 3. Before and
  after screenshots at 1280×720 (78-80 km/h and stopped) were compared: the
  rear doors are clear at speed, a thin column rises from the stopped van.

### Decided (set here)

- The van keeps stage 2 in the cold open: the damage bar and the dents say
  "swap"; the smoke was the defect, not the stage.

## 2026-09-23 — M4 gate

Marcin: work autonomously to the end of M4. Slices 3a–8 are done; the gate
report is `docs/M4_REPORT.md`; every M4 session entry is archived in
`docs/history/PROGRESS_M4.md`.

### Done (slice 8)

- Midgame ad points (`App.adBreak`): the shut door (never the session's
  first, which ends the cold open) and the busted card, only when
  `adsAvailable('midgame')`; input blocked from the request, the break held
  until the ad is over, mute on `adStarted`; the perf probe skips ad frames.
  e2e 8.1–8.5. CRAZYGAMES A1, A3, A4 done on the adapter side, T15 noted.
- The wanted poster on the wall (the descriptor's paint and class). The
  officer's ticket book and the donut-shop withdrawal went to BACKLOG.
- The wrecked overlay follows the wreck itself, not only the damage stage.
- Gate suites: the heat e2e at levels 1, 3 and 5; the screens hold the
  oncoming flag for their frame and shoot the card and the wall with ads
  off; the streaming tour and the city tour pin keep the heat at 0 (speed
  cameras line their routes). Per-step code has no allocation (index loops
  in the step paths, no closures in the coin view).

### Measured (every M4 number, for M5)

- Bag: 336–476 a minute from heat 0 with the novice bot (10 min, seeds 42
  / 7 / 123; no run ended), 600–800 at heat 2 (slice 3a). Coins 42–53 a
  minute (road bot 54–56 in 3b).
- Busted in five minutes, seeds 42 / 7 / 123 (a 10 s re-arm after each
  card): level 1 novice 0 / 0 / 5, skilled 0 / 1 / 2; level 2 novice 2 / 6
  / 2, skilled 1 / 2 / 2; level 3 novice 1 / 5 / 16, skilled 1 / 2 / 0;
  level 4 novice 2 / 7 / 6, skilled 7 / 3 / 1; level 5 novice 10 / 3 / 3,
  skilled 3 / 1 / 0. The decision rule (DESIGN §12) did not fire.
- The cold open: the scripted bot done in 89.1 s (swap 5.5 s, the gate
  22.0, the marker 34.4, the door 89.1).
- The disguise: the in-sight cruiser exploit disguised 114 of 120 s before
  the 30 s dispatcher timer, 30 s after; skilled escapes by swap 1 / 1 / 1
  at level 2.
- The arrest: a stopped player busted at heat 2 in 10.8–12.5 s.
- Jumps at 90 km/h: 1.1–1.3 s in the air, 27–31 m, upright.
- Rosters: level 4 = 2 interceptors, 3 heavies, 1 saloon; level 5 = the
  Chief, 3 interceptors, 4 heavies; police hold up to 14 of 48 records and
  30 civilians drive at worst.
- Budgets: startup 3.59 MB, time to control 3.47 s, whole-map tour 70 /
  176k (low) and 96 / 250k (high), heap 51–58 MB.
- Perf (MX330, 4× CPU): heat 0 54.7 / 55.4 / 56.2 / 51.5 fps over four
  runs, frame p95 16.8–33.3 ms, step p95 7.0–9.8 ms; heat 5 52.7 / 52.5
  fps; ads off 57.7 fps; the M3 bases were 57.4 / 52.5.
- Tests: 230 quick, 239 with the long pins; e2e heat 10, city 4, life 4,
  screens 31, smoke 1.

### Decided (set here)

- The perf probe measures play, not ads.
- PROGRESS keeps this gate entry; the M4 log is archived whole, since the
  next contract reads its numbers from here and from the report.

### Next

- Marcin's review of the gate report and his first minute by hand. Then
  M5 per `docs/M5_PLAN.md` (§1.2 is checked against what shipped: every row
  exists; `BALANCE.measured`'s values are in the plan's comment).

### Open problems

- Single long frames (0.5–1.25 s) in some 4× runs; M3's worst was 183 ms.
  Not the ad, not the budgets; a trace on Marcin's machine is next.
- The novice bot stops at roadblocks; abandoned cars are never towed.

---

Older entries: M4 (slices 0–8 and the design talks, 2026-09-22 to
2026-09-23) in `docs/history/PROGRESS_M4.md`; M0 through the M3 gate
(2026-09-20 to 2026-09-22) in `docs/history/PROGRESS_M0-M3.md`.
