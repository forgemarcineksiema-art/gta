# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

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
