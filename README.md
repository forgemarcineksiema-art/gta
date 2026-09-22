# Untitled Driving Game

Open-world arcade driving for the browser (CrazyGames). You are the getaway driver who never keeps a car: steal, wreck, swap, escape, bank. Brief: `docs/BRIEF.md`. Standing rules: `CLAUDE.md`. Current state: `docs/PROGRESS.md`.

M3 put life in the city: traffic, pedestrians, damage and wrecks, car-swap,
takedowns and fifty smashable billboards. M4 (at its gate, `docs/M4_REPORT.md`)
is the police and the run: `docs/M4_PLAN.md`; M5 the launch minimum:
`docs/M5_PLAN.md`; M6 the platform and the submission: `docs/M6_PLAN.md`; all
designed in `docs/DESIGN.md`. Older acceptance reports: `docs/M2_REPORT.md`,
`docs/M3_REPORT.md` and `docs/history/`.

## Play

There is one game and one way to play it:

```bash
npm install
npm start            # builds the production bundle and serves it at http://localhost:4173
```

That is the build CrazyGames would serve, from `dist/`, with no URL parameters.
Press `P`: the pause screen's corner shows the build stamp, `0.4.0+<commit>`
(`-dirty` when uncommitted changes went into it), so it is always clear which
build is on screen. The version is the milestone: 0.4.x is M4, 0.5.x will be M5.

Controls: `W A S D` / arrows drive, `Space` handbrake (drift), `Shift` boost, `E` swap into the car beside you, `R` reset (or respawn when wrecked), `C` camera, `P` pause, `M` mute. Any key skips the takedown slow motion, opens the garage door after the totals and closes the busted card.

The first load of a tab is the cold open: a beat-up van at heat 1, a muscle car to swap into, a coin line round the hideout's block through a billboard, a delivery marker and the hideout door; captions teach each verb, `N` skips.

The run: crimes fill the bag (yellow, top right, with the multiplier the police have seen you at). Pull into one of the three garages (orange on the radar) and stop: the door takes 3 s to shut and banks the bag times the multiplier; back out to cancel. Two police cars boxing you in while you are wanted fill the BUSTED bar: half the bag is kept, no multiplier.

## Develop

```bash
npm run dev          # the same game from source with live reload, http://localhost:5173
```

The dev server is for editing code, not for judging the game: it is unminified
and its numbers are not the shipped ones. The test URLs (spawns, bots, heat,
the tuning panel), the QA hooks and the scratch folders are in `docs/DEV.md`.

## Verify

```bash
npm run verify       # typecheck, lint, the quick sim tests, build, smoke, budget
npm run verify:gate  # the same with the long bot-driven pins: gates and slice commits
```

The e2e suites (`perf`, `screens`, `city`, `life`, `heat`) run against the
production build on port 4173; `docs/DEV.md` lists them.
