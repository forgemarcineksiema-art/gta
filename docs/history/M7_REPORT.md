# M7 gate report: the polish

Date: 2026-09-24. Contract: `docs/history/M7_PLAN.md` (slices 0–14, §7 gate
criteria); design: `docs/DESIGN.md` §15. Session log: `docs/PROGRESS.md` (an
entry per slice, and the gate's entry with the numbers below). Package
`0.7.0`.

## What was built

Nothing new to do: the game the player already had, made to hold its
promises. The five tests a player applies in the first minutes (it loads
every time, nothing covers anything, it never stutters, it sounds alive,
every rule it states holds), the issues the M5.5 and M6 reports named, and
four things of mine.

- **The workshop** (slice 0): the quick verify's tests from 105 to 39 s;
  the stash's hidden cars and the rivals' parked cars on records above the
  traffic's pool, so a car standing 300 m away no longer moves the traffic
  near the player.
- **The top of the screen** (slice 1): the job line and its card, the
  intro's caption, the key hints and the news in one column with one rule
  for who shows; the pops under the coins. The screens suite checks every
  driving state for HUD boxes that touch.
- **Our own music** (slice 2): eight bars in A minor written for the game,
  rendered in the browser a second after play starts, layers that come in
  with the stars, stings for busted, the escape and the door. No file.
- **A settings row on the pause screen** (slice 3): music, effects, quality,
  the radar north up. Saved (save v4).
- **Skid marks and the spill's burst** (slice 4): the tyres mark the ground
  in a drift, a hard stop and a burnout, fading over 30 s; the spill's
  coins fly out of the wreck.
- **No hitches, the frame budget** (slices 5–6): the automatic quality
  settles after two switches; the traffic's spacing pass through a grid
  (the same traffic bit for bit, 23 times fewer checks), the player-gap
  projection only near the player; a body's mesh built when it first
  spawns.
- **The boot** (slice 7): a slow phase names itself, 20 s without control
  offers a retry the player chooses; a 200-boot loop at the gate.
- **The civilians** (slice 8): the standoff goes round the player on the
  side away from them; a shoved car blends back onto its lane.
- **The police** (slice 9): a unit on a chase takes the inside line of a
  turn; the box's places go to a heavy within reach first.
- **The money** (slice 10 and the gate): the economy's model in a quick
  pure module, fitted: multipliers ×1 / ×1.3 / ×1.65 / ×2.6 / ×3; refitted
  at the gate on its measured novice, the compact 24,000, the van 30,000,
  the tiers 24,000 / 26,000 / 30,000.
- **The city's look** (slice 11): corner shops on the avenues, one landmark
  per avenue, the parkway's give-way line at its merges, worn paint, the
  drop-offs' lit signs up their streets.
- **The maps and the wall** (slice 12): the big map draws the blocks, the
  parks and the shallows; the wall's CARS and STYLE pages are grids (the far
  corner of STYLE 13 presses, not 58).
- **The rivals' leftovers** (slice 13): Granny Gears beatable at the first
  try; the next rival's car cruising their district until they are ready;
  the sweeper's brushes turn.

## Tuning knobs and where they live

- `src/audio/score.ts`: the music (`LAYERS` by heat, `STINGS`, `BPM`,
  `BARS`); `src/audio/Music.ts` its bus level and the sting's duck.
- `src/sim/settings.ts`: the settings' defaults (music 7, effects 10).
- `src/render/SkidMarks.ts` (`SKID`): the slip thresholds, width, darkness,
  fade and the ring's size; `src/render/carMesh.ts` (`SPIN`): the brushes.
- `src/sim/balance.ts`: `multiplier`, `prices`, `tierPrices` (slice 10);
  `board.pace[0]` and `board.band[0]` (Granny); `board.teaser` (the next
  rival's cruising car: range, retry, the ticker's distance).
- `src/sim/traffic/tuning.ts` (`TRAFFIC.standoff`): the standoff's wait,
  the player's speed that counts as stopped, the creep.
- `src/sim/traffic/Traffic.ts`: `POLICE_CORNER` and `POLICE_CORNER_LEAD`
  (the inside line), `PASS_CLEAR_OF_JUNCTION` (no pass into a junction),
  `BLEND_BACK` (the blend onto the lane); `src/sim/police/tuning.ts`
  (`POLICE.arrest.heavyFirst`).
- `src/sim/city/City.ts` (`AVENUE_LANDMARKS`): each avenue's landmark;
  `src/sim/city/cover.ts` (`HIDEOUT_SIGN`); `src/sim/city/markings.ts`
  (`WEAR_STRETCH`, the give-way line's dashes).
- `tests/sim/model.ts`: the balance model the prices are fitted on.

## How to run

- `npm start`, then `http://localhost:4173/`; the stamp `0.7.0+<commit>` on
  the pause screen. The settings are on the pause screen (P): W/S a row, A/D
  its value.
- The wall's grid pages: A/D along a row, W/S between rows (S from the first
  row back to the tabs), Space or Enter takes the card.
- The rest as before (`docs/DEV.md`); `npm run boot` is the 200-boot loop.
- `npm run verify`, `verify:gate`, `game`, `heat`, `city`, `life`,
  `screens`, `boot`, `perf`, `balance`.

## Five-minute playtest script

1. `?fresh=1`: the intro's first seconds. Anything on top of anything?
2. Drive a minute, then raise the heat to 3: does the music come in after
   the start and climb with the stars; the busted and escape stings.
3. The pause screen: turn the music down, the radar north up; M still
   mutes all.
4. Drift round a car park in the Works: the marks on the asphalt, and where
   they fade.
5. A plain crossing with four cars: do they take turns. Stop nose to nose
   with a car: does it go round you.
6. The first rival: beat Granny Gears. First try? On the way through Palm
   Gardens before the chain is done, did her wagon drive by?
7. Hold Tab: the parks, the blocks, the water. The avenues: a corner shop,
   the landmark with its sign; the hideout's sign from the highway.
8. The first half hour: when did you buy the first car, and did waiting at
   heat 3 before the door pay.

## Verify and perf

| Check | Result |
|---|---|
| `npm run verify` | green on the final tree: typecheck, sim typecheck, lint, 360 tests (46 s), build, smoke 60.0 fps (125 draws, 253k tris), budget |
| `npm run verify:gate` | green: 431 tests with the long pins (157 s), smoke 60.0 fps, 130 draws, 258k tris; six long pins were red on the slices' traffic first (PROGRESS, "the long pins") |
| `npm run game` | 14/14 on the final build (the M7 cases: the settings row, the music after `gameplayStart`, the prices' literals) |
| `npm run heat`, `city` | 10/10, 5/5 (control in 3.93 s at 20 Mbit and 4× CPU) |
| `npm run life` | 4/4 on the final build (51.5 fps, frame p95 33.4, step p95 9.9); red twice before it, the frame p95 at 33.4000000000015 against its < 33.4 |
| `npm run screens` | 51/51 on the final build with the overlap check in every driving state and the wall check behind the door; every page at the ten sizes looked at (the fixes below came from the images) |
| The boot loop (`npm run boot`) | 200 of 200 reach control; p50 0.65 s, p95 0.95 s, max 1.73 s |
| `npm run balance` | **green on (a)–(d)** after the gate's refit of the prices (129 s; the tables in PROGRESS) |

Budgets (BRIEF §6, M7_PLAN §5.4):

| Budget | Limit | M7 | M6 |
|---|---|---|---|
| Bytes before gameplay-start | 8 MB target, 12 fail | 3.92 MB (the music adds none) | 3.88 MB |
| Build | 40 MB / 200 files | 3.92 MB / 5 files | 3.88 MB / 5 |
| Time to control, 20 Mbit + 4× CPU | 5 s (the brief's 6) | 3.93 s | 3.97 s |
| Boots reaching control | 200 of 200 | 200 of 200 | (none run) |
| Draws / tris, low, whole-map tour | 150 / 250k | 89 / 204k | 86 / 197k |
| Draws / tris, high, whole-map tour | 300 / 600k | 116 / 279k | 112 / 272k |
| JS heap | 50 MB (budget 250) | 48 MB in the final runs (61 in four others) | 54–58 MB |
| Quick verify's tests | 60 s | 46 s | 110 s |

The perf A/B (§5.3): 0.6.0 exported to a scratch folder and served on 4174,
the candidate on 4173, alternating 60 s runs, MX330, `?quality=low`, 4× CPU.
All runs quoted, the files in `perf/m7-gate-*.json`. The first build is
the one the gate started with; the final build has the gate's fixes
(below) and is what is committed.

| Run | fps | frame p95 | frame p99 | step p95 | traffic mean | draws mean / max | tris max | over 50 ms after 5 s |
|---|---|---|---|---|---|---|---|---|
| first build, 0.6.0 1 | 55.8 | 33.3 | 33.4 | 8.2 | 2.35 | 87 / 103 | 194k | - |
| first build, 0.7.0 1 | 49.8 | 33.4 | 50.0 | 9.5 | 1.86 | 99 / 110 | 215k | 9 |
| first build, 0.6.0 2 | 55.4 | 33.3 | 33.4 | 8.5 | 2.40 | 87 / 103 | 194k | - |
| first build, 0.7.0 2 | 50.8 | 33.4 | 50.0 | 9.1 | 1.85 | 99 / 110 | 215k | 7 |
| first build, 0.6.0 3 | 55.0 | 33.3 | 33.4 | 8.8 | 2.48 | 87 / 103 | 194k | - |
| first build, 0.7.0 3 | 49.2 | 33.4 | 50.0 | 9.2 | 1.83 | 99 / 110 | 215k | 8 |
| final build, 0.6.0 1 | 47.7 | 33.4 | 83.3 | 14.3 | 2.95 | 87 / 102 | 191k | - |
| final build, 0.7.0 1 | 50.2 | 33.4 | 50.1 | 10.4 | 1.95 | 97 / 112 | 211k | 22 |
| final build, 0.6.0 2 | 52.2 | 33.4 | 50.0 | 10.5 | 2.59 | 87 / 103 | 194k | - |
| final build, 0.7.0 2 | 50.5 | 33.4 | 50.1 | 10.0 | 1.95 | 97 / 112 | 211k | 15 |
| final build, 0.6.0 3 | 53.2 | 33.3 | 50.0 | 10.0 | 2.58 | 87 / 103 | 194k | - |
| final build, 0.7.0 3 | 51.1 | 33.4 | 50.0 | 9.9 | 1.91 | 97 / 112 | 211k | 17 |

The protocol's pairs are not the same drive. In all three 0.6.0 runs the
bot queues behind traffic for 25 s on the northern avenue (z 570–650 m; it
covers 80 m between 20 and 45 s), a stretch of cheap frames: the same view,
no chunk to build. 0.7.0's traffic flows there (slice 8), so its bot drives
on through the centre's east. Attributing every draw to its view over the
runs: the city's chunks draw 17.6 a frame in 0.6.0's runs and 22.2 in
0.7.0's, the difference of the route; with the car put at the same 40
points of the tour in both builds, the chunks draw the same (20.5), and
0.7.0 drew three more a frame everywhere (the drop-offs' two sign meshes,
merged over the city and never culled, and the empty skid-mark ring). Both
are fixed at the gate: a sign's pair is culled with its site, the ring
draws nothing until a mark is laid and only its written part. And in both
versions three.js drew instanced meshes with no instances (the police's
four liveries of three meshes each, the coins' spill and flying pools, the
debris with its shadow): up to fifteen draws a frame for nothing, now hidden
while empty, as the traffic's and the walkers' meshes already were. The fair
comparisons:

Sixty seconds without traffic or walkers (`&life=0`: the same drive in both builds; the build with the
signs and the ring fixed):

| Run | fps | frame p95 | frame p99 | step p95 | traffic mean | draws mean / max | tris max | over 50 ms after 5 s |
|---|---|---|---|---|---|---|---|---|
| no traffic, 0.6.0 1 | 53.2 | 33.3 | 50.0 | 6.8 | 0.16 | 72 / 82 | 154k | - |
| no traffic, 0.7.0 1 | 55.9 | 33.3 | 50.0 | 5.2 | 0.22 | 74 / 86 | 155k | 4 |
| no traffic, 0.6.0 2 | 55.8 | 33.3 | 50.0 | 5.7 | 0.15 | 72 / 83 | 154k | - |
| no traffic, 0.7.0 2 | 54.9 | 33.3 | 50.0 | 5.9 | 0.22 | 74 / 86 | 155k | 10 |
| no traffic, 0.6.0 3 | 54.7 | 33.3 | 50.0 | 5.6 | 0.16 | 72 / 83 | 154k | - |
| no traffic, 0.7.0 3 | 55.8 | 33.3 | 49.9 | 5.3 | 0.24 | 74 / 86 | 155k | 1 |

The first 20 s with traffic (the same road in both, before 0.6.0's queue; the final build):

| Run | fps | frame p95 | frame p99 | step p95 | traffic mean | draws mean / max | tris max | over 50 ms after 5 s |
|---|---|---|---|---|---|---|---|---|
| 20 s, 0.6.0 1 | 43.8 | 50.0 | 66.7 | 17.3 | 2.41 | 94 / 100 | 188k | - |
| 20 s, 0.7.0 1 | 47.8 | 33.4 | 66.7 | 13.8 | 2.00 | 90 / 97 | 188k | 8 |
| 20 s, 0.6.0 2 | 46.3 | 33.4 | 66.7 | 13.4 | 2.35 | 94 / 100 | 188k | - |
| 20 s, 0.7.0 2 | 40.7 | 50.0 | 83.2 | 16.5 | 2.33 | 91 / 97 | 188k | 16 |
| 20 s, 0.6.0 3 | 45.6 | 50.0 | 66.7 | 15.0 | 2.37 | 94 / 100 | 188k | - |
| 20 s, 0.7.0 3 | 51.9 | 33.4 | 50.1 | 9.6 | 1.86 | 90 / 97 | 188k | 1 |

Pair by pair, 0.7.0 against 0.6.0: the first build −6.0 / −4.6 / −5.8 fps
(0.6.0 queued); the final build +2.5 / −1.7 / −2.1; without traffic
+2.7 / −0.9 / +1.1; the first 20 s +4.0 / −5.6 / +6.3. On the same drive
0.7.0 runs at 0.6.0's speed inside the MX330's ±3 band; the 2 fps over it
the plan expected from slice 6 is not shown. 0.6.0 itself fell from 55.4
to 51.0 fps on average between the first and the final runs, 50 minutes
apart on identical code, while 0.7.0 went from 49.9 to 50.6 with the
fixes. The frame p95 (the budget: not above 0.6.0's) is 33.4 in every
final 0.7.0 run against 33.3–33.4.

- **Frames over 50 ms after 5 s** (the plan: at most two): 7–9 in the first
  build's runs, 15–22 in the final's (the same hour that took 0.6.0 down 4
  fps). 0.6.0 has as many on its own route when counted the same way (10
  against 0.7.0's 14 in one instrumented pair), so the target was not met
  before either. What they are: the sim catching up four or five steps
  after one slow frame, and time outside the game's frame (the browser's
  own work). Named, not fixed.
- **The traffic's mean step** (the plan: at most 1.6 ms): 1.83–1.95 ms
  against 0.6.0's 2.35–2.95 on its route (−25 %; 23 times fewer pair
  checks, pin 6.1). The 1.6 was not reached.
- **The heap** reads one snapshot a run (headless Chromium's
  `performance.memory` moves in steps): 48 MB in all six final runs and the
  20 s ones, 61 in one first-build run and in the three without traffic;
  0.6.0 54–58.

## DESIGN §15.2, item by item

- **Loads**: the boot (slice 7), 200 boots of 200 at the gate.
- **Covers**: the top of the screen's one lane (slice 1). At the gate the
  screens suite's overlap check found the pops over the speed at 800x450
  (now the two newest on a short screen), and the images showed the news
  printed over the wall: over BANKED and its tabs at 800x450, over STYLE's
  tabs at every size where that page fills the height; and at 800x450 the
  stars over the wall's corner. The news now waits behind a shut door like
  under a card, the stars go with the bag and the coins, and the suite
  checks the wall's states for anything drawn over the wall.
- **Stutters**: the quality switch settled (slice 5); garbage and the first
  second measured in Node and found cheap (slice 5); the traffic's step
  −23 % (slice 6, not the 1.6 ms asked); a body's mesh at its first spawn
  (slice 6). Not done: the trees' six-sided crowns (a quarter of their
  triangles against their look); the fair A/B holds without them.
- **Sound**: the music (slice 2).
- **Promises**: the economy green after the gate's refit (below); the
  standoff's side, the shoved car's blend (slice 8); the police's inside
  line (slice 9); Granny Gears (slice 13 and the gate: the careful bot
  three of three, the plain one at least once). Not fixed: level 4 still
  catches the skilled bot less than 2–3; the plain junctions forced through
  about twice a minute (both below).
- **The city's leftovers**: corner shops and landmarks, the parkway's
  give-way, worn paint, the drop-offs' signs (slice 11); the big map, the
  wall's grids (slice 12); the spill's burst (slice 4); the brushes, the
  rival's teaser (slice 13).

## Known issues

- **The prices were refitted at the gate** (the plan: "refitted there if
  the new novice moved the inputs"). The careful bot that is now the
  novice banks 3,647 a minute against the M6 gate's 1,157: its skill
  chains pay 4,660 in three minutes at seed 42 where the plain bot's pay
  860 (it goes round what blocks it and seldom breaks a chain). On it the
  compact at 18,000 came at minute 4.1 and the tiers a door apart; now the
  compact is 24,000 (minute 6.7), the van 30,000, the tiers 24,000 /
  26,000 / 30,000, every purchase two runs apart, something to see every
  8 minutes at most. Whether a player earns like the careful bot is
  Marcin's first hour; if the first car comes late for him, the knob is
  `BALANCE.prices.compact`. The compact's window is one door wide (only
  the second door, minute 6.7, falls inside 5–7).
- **Level 4 catches the skilled bot less than levels 2–3** (0.22 against
  0.56 a minute; the novice the other way, 0.67 against 0.33). The pooled
  rates carry it; slice 9's heavy-first box did not move it. A player's
  level 4 decides whether the heavies and the helicopter need more bite.
- **A chasing unit can spin in a U-turn** at its chase speed (a lent
  cruiser from 20 m/s, 3.8 rad/s). Braking it for the U-turn cost the
  Chief his PIT on the highway, so it was dropped; BACKLOG.
- **The plain junctions forced through** about twice a minute (slice 8):
  the bad drivers' early claim, their character since M5.5, and side
  streets waiting on the highway's flow. Measured, left.
- **Frames over 50 ms and the traffic's 1.6 ms**: not met, above.
- **Pins changed at the gate beyond §5.1's names**, each with its reason in
  the file and in PROGRESS: the lane holding (a car blending back), the
  same-lane spacing (cars side by side by design), the police roster (its
  level held, read over the run), G.1 (three of three and one of three),
  the skid ring's draw (4.3), the model's gate input (10.1, the M7 gate's
  inputs), the prices (10.2 and the e2e's literals), the top column's rule
  (1.1, the wall); new: G.3 (no draw for an empty instanced mesh) and the
  screens' wall check. None loosened.
- **The teaser is off in the test worlds**: the bot pins run without the
  next rival's cruising car; its own pin covers it.

## Proposed next scope

Marcin plays 0.7.0 (the script above; the first car's minute is the
question the model cannot answer). His notes drive a short pass, one or two
play items each committed, the rest to BACKLOG. Then M8, the platform
(`docs/history/M8_PLAN.md`: the SDK adapter, touch, the mobile tier, the ads, the
submission), on his word.

Revised 2026-09-24 (Marcin): the milestone after M7 is designed "seriously"
before the platform. M8 is now the chaos (DESIGN §16, `docs/history/M8_PLAN.md`):
the street furniture made of things with mass, knocked by a rule decided
before the physics step, each district's things, the smash paid through the
skill chain. The platform is M9 (`docs/M9_PLAN.md`). Both on his word, his
0.7.0 notes first.
