# Progress log, the M4 gate and after (archived at the M5 gate)

The M4 gate entry and the post-gate sessions before M5 (the bonnet smoke,
one build, the coin lines; 2026-09-23), newest first, moved here from
`docs/PROGRESS.md` at the M5 gate. The M4 gate report is `docs/M4_REPORT.md`.

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
