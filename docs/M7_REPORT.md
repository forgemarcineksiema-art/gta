# M7 gate report: the polish

Date: 2026-09-24. Contract: `docs/M7_PLAN.md` (slices 0–14, §7 gate
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
- **The money** (slice 10): the economy's model in a quick pure module,
  fitted: multipliers ×1 / ×1.3 / ×1.65 / ×2.6 / ×3, the compact 18,000,
  the tiers 15,000 / 17,000 / 21,000.
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
