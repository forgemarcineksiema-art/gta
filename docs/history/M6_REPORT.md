# M6 gate report: the wanted board

Date: 2026-09-24. Contract: `docs/history/M6_PLAN.md` (slices 0–11, §7 gate
criteria); design: `docs/DESIGN.md` §14. Session log: `docs/PROGRESS.md` (an
entry per slice, and the gate's two entries with the numbers below). Package
`0.6.0`.

## What was built

After the first quarter hour's chain, a spine for the next hours and a
reason to come back: ten named rivals and the Chief on the police's wanted
board, their cars to win, and the player's style in every car they take.

- **The garage keeps cars, not classes** (slice 0): any car driven home can
  be kept for 30 % of its price, a hidden car found and a rival's car won
  are owned; the upgrades stay per class. 28 cars to collect. Save v3.
- **The wanted board** (slice 1): ten rivals and the Chief, beaten one at a
  time; each asks for two things the city already has (win a street race,
  bronze on a trial, escape at three stars, ten takedowns, a zone, three
  fares, three orders, three cars, silver twice, ten jumps, a 40,000 run,
  25 billboards, four stars, a hot fare, three races, 40 caches, five
  stars, gold); the goal line names the next one after the chain; the wall's
  BOARD page, the ticker's news, the posters on the hideout's back wall.
- **The duels** (slices 1–3): a rival waits parked at a kerbside bay in
  their turf; pull up beside them to start. A race (first over the line), a
  hunt (wreck their car before it gets home; their bag bursts as coins), the
  Chief's five-star escape. Each rival turns one of the game's verbs on the
  player: Pete drives like the bad driver, Tina's wrecker is armoured, the
  twins swap into cars ahead of you out of sight, Fake Frank's badge makes a
  hit on him a hit on the police, Bernie's bus races, Niko drops the
  scaffold towers, the Nephew brings an escort, the helicopter hangs over
  Pip's race, the Ghost is off the maps with her lights off.
- **Their cars** (slices 4–5): eleven new bodies (the wagon with flower pots,
  the pizza hatch, the wrecker, the twins' coupe, the fake cruiser, the
  party bus, the hopping lowrider, the gold limo, the bubble, the phantom,
  the Chief's cruiser), won into the garage.
- **Your style** (slices 6–8): the driver's kit, worn into every car you
  take (17 toppers, neon, six horns, the boost's flame, tyre smoke; the horn
  on H moves the car ahead aside) and the car's kit fitted per garage car
  (four wheels, three spoilers, two stances); one known item a day at half
  price. The game had no tyre smoke or boost flame before: both now exist.
- **Three hidden cars** (slice 9): a roadster, a street sweeper, a hot-dog
  van in quiet bays, each with its own musical clue.
- **The first hours' model** (slice 10) buys the kit, and **the gate**
  (slice 11): two long bot pins made green by a test bot that backs off a car
  that will not move on, the STYLE page made to fit every screen, the M6
  e2e cases, the numbers.

## Verify and perf

| Check | Result |
|---|---|
| `npm run verify` | green: typecheck, sim typecheck, lint, 374 tests (110 s), build, smoke, budget |
| `npm run verify:gate` | green: 399 tests with the long pins (215 s; 400 with G.2, added after), smoke 59.9 fps, 129 draws |
| `npm run game` | 12/12, the three M6 cases added (the first rival's race by the M5 bot, lost to Granny; the STYLE card worn; one horn a press) |
| `npm run heat`, `city`, `life` | 10/10, 5/5, 4/4 |
| `npm run screens` | 51/51 on a rerun (the first run: one page stuck at LOADING for 30 s at 821x462, not seen again); BOARD, STYLE, the duel's card and line at the ten sizes, looked at; the STYLE page fixed (below) |
| `npm run balance` | **red on (a) and (b)**, (c) and (d) green; the tables in PROGRESS, the reason under Known issues |
| Allocation audit (§7.5) | none in `Jobs.duelStep`, `Career`'s event reader, `Board.step` and its reads (`next`, `have`, `met`, `ready`, `live`, `park`), `Traffic.honked`; `Board.findRings` allocates once; layering lint green; no new dependency; BRIEF untouched |

The gate criteria of §7.4: the careful bot beats Granny Gears at seed 42 in
two starts of three (won at 49.1 and 79.8 s of 120; at the first start she
crossed at 50.8 s), pin G.1; a scripted hunt wrecks Tina's wrecker (2.2);
every kit slot is worn into every car the player drives (7.3); the model's
first hour shows something bought at most every 7.0 minutes (the balance's
(d)).

Budgets (BRIEF §6, M6_PLAN §5.4):

| Budget | Limit | M6 | M5.5 |
|---|---|---|---|
| Bytes before gameplay-start | 8 MB target, 12 fail | 3.88 MB | 3.80 MB |
| Build | 40 MB / 200 files | 3.88 MB / 5 files | 3.80 MB / 5 |
| Time to control, 20 Mbit + 4× CPU | 6 s | 3.97 s | 3.8–4.3 s |
| Draws / tris, low, whole-map tour | 150 / 250k | 86 / 197k | 84 / 196k |
| Draws / tris, high, whole-map tour | 300 / 600k | 112 / 272k | 111 / 271k |
| JS heap | 250 MB | 54–58 MB | 48–65 MB |
| Sim step p95, 4× CPU | < 12 ms | 9.0–9.5 ms | 8.7–9.2 ms |
| Frame p95, 4× CPU, real GPU | < 33.4 ms | 33.3–33.4 ms | 33.3 ms |
| A rival's or a hidden body | < 3,000 triangles | pinned for every body (19.5) | |
| A topper | < 300 triangles | pinned (6.4) | |
| The save, everything filled | < 32 kB | 2,102 bytes (G.2) | |

Perf, MX330, 4× CPU, 60 s bot, auto quality (the protocol of §5.3; all
runs quoted, the files in `perf/`):

| Run | fps | frame p95 | step p95 | step mean | traffic mean | draws max | tris max | heap |
|---|---|---|---|---|---|---|---|---|
| M5.5 gate fix 1 / 2 (bases) | 53.7 / 53.9 | 33.3 / 33.3 | 8.7 / 9.2 | 4.9 / 4.9 | 2.4 | 133 | 278k | 48 |
| M6 gate 1 / 2 / 3 | 51.8 / 52.5 / 53.3 | 33.4 / 33.4 / 33.3 | 9.5 / 9.0 / 9.3 | 5.3 / 5.2 / 4.9 | 2.5 / 2.5 / 2.4 | 134 / 130 / 135 | 279k | 58 |

Runs 1 and 2 put the frame p95 0.1 ms over the bases, which the protocol
reads as a regression; a third run matched the bases in frame p95 and step
mean, and every fps is inside the MX330's ±3 band on identical code, so
none is called. The heap is 10 MB up in all three runs (BACKLOG: not
profiled; most likely the traffic's instanced meshes, one per body, all 28
built at load).

## How to run

- `npm start`, then `http://localhost:4173/`; the stamp `0.6.0+<commit>` on
  the pause screen.
- New test parameters: `?board=<n>` (the board as if every rival under #n was
  beaten, #n ready; `board=0` the Chief), `?board=10&job=duel` (pulled up at
  the next rival's bay), `?kit=all` (the whole kit had). The rest as before
  (`docs/DEV.md`).
- `npm run verify`, `verify:gate`, `game`, `heat`, `city`, `life`,
  `screens`, `perf`, `balance`.

## Five-minute playtest script

1. `?fresh=1`: play the chain; after its sixth step the goal line names
   Granny Gears. Open the wall: BOARD shows the ten posters and hers.
2. Beat Granny on the way to the Glasshouse: her wagon in CARS, the flower
   pots on the STYLE page.
3. STYLE: buy the duck, take a bus from traffic: does the bus wear it? Honk
   (H) through a queue on the avenue.
4. `?board=8`: Tow Truck Tina's hunt: wreck the wrecker before the scrapyard.
5. `?board=6`: Fake Frank: ramming him makes you wanted. Funny or unfair?
6. `?board=7` the twins, `?board=1` the Ghost: do the twists read without a
   word?
7. `?kit=all`: the neon, the flames on boost, the smoke in a drift, the
   wheels and the giant wing on the garage car.
8. Say which rival felt unfair, and which car you wanted most.

## Tuning knobs and where they live

- `src/sim/board/rivals.ts` (`RIVALS`): each rival's requirements, heat,
  twist, purse, path band.
- `src/sim/balance.ts` (`BALANCE.board`): the ring's radius and the pull-up
  speed, the car's range, the rematch share, the pace and band by rank, the
  hunt (seconds, lead, pace, armour, the heavy factor, the burst), the twins'
  swap, the breakers' reach, the escort; `BALANCE.kit.pickShare`;
  `BALANCE.bodyPrices`.
- `src/sim/garage/kit.ts` (`KIT`): every item's price and colour.
- `src/sim/traffic/tuning.ts` (`TRAFFIC.horn`): the horn's reach, lateral
  window, shift, seconds, cooldown.

## Known issues

- **The balance script is red on (a) and (b).** (b) as at M5.5: the first
  car at minute 3.8 (the brief: 5–7), the prices left for Marcin's first
  hour. (a) is new: the skilled bot's best cash-out level (L2) is under the
  novice's (L3). Both banks a run are flat across the levels (novice
  5.3–5.6k, skilled 3.9–5.7k), so the best level follows the traffic's
  moment; M6's reserved bays (the rivals', the hidden cars') moved seed 7's
  skilled captures at L3 and L5 from 0 to 1.00 and 0.67 a minute. Whether
  the heat multiplier pays for the risk is a design question for the first
  hour, not a bot's. (c) and (d) hold. The model now leaves the duels out of
  its job mean (a purse is paid once); with them every run banked half as
  much again.
- **The long bot pins needed a better test bot.** Slice 9's hidden cars
  take a traffic record each, which moved the traffic's moment; the cold
  open's bot then pushed a wreck at walking pace for 80 s and the careful
  delivery bot waited nose to nose behind a crossing car in a U-turn. Both
  now back off and go round (`TrackBot.unblock`, careful bots and the cold
  open's); the assertions are unchanged, the other bot pins keep the M5 bot.
- **The standoff pulls the wrong way** when the player stands on the
  civilian's kerb side (seen at the gate); BACKLOG.
- **The first rival's race was lost by the M5 bot** in the browser (the
  e2e); the careful bot wins two of three (G.1). A player decides whether
  #10 is too hard for a first duel.
- **One screens page stuck at LOADING** for 30 s in one run of 51 loads,
  not reproduced (alone, then a full rerun). Watch for it.
- **The heap is 10 MB up** (58 MB against 48; budget 250), not profiled.
- **Not done inside the slices** (BACKLOG): a rival cruising their turf as a
  teaser before their duel; the day's pick as the rewarded offer (M8
  slice 4); the sweeper's brushes spinning.
- **No music bed**: still needs Marcin's yes on the file, its source and its
  licence.
- **Pins changed beyond the §5.1 names**, each with its reason in PROGRESS:
  a duel's ring lays no coins (jobs 1.10), the bodies the spawner draws
  (19.1, the rival bodies never spawn), the app's newer-version save (the
  version number), the cold open's bot (the unblock rule), the balance's
  job mean (the duels left out). None loosened.

## Proposed next scope

Marcin plays 0.6.0. His notes drive a short pass (one or two play items,
each committed; the rest to BACKLOG). Then M7, the platform
(`docs/history/M7_PLAN.md`: the SDK adapter, touch, the mobile tier, the
submission; the day's pick becomes the rewarded offer there), only on his
word.

Revised 2026-09-24 (Marcin): a milestone that improves and fixes what the
game has goes in first. M7 is now the polish (`docs/history/M7_PLAN.md`, DESIGN
§15: every recorded issue a player can meet, worked off, with our own music,
a settings row, skid marks and a screen where nothing overlaps); the
platform is M8 (`docs/history/M8_PLAN.md`). Both on his word.
