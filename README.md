# Untitled Driving Game

Open-world arcade driving for the browser (CrazyGames). You are the getaway driver who never keeps a car: steal, wreck, swap, escape, bank. Brief: `docs/BRIEF.md`. Standing rules: `CLAUDE.md`. Current state: `docs/PROGRESS.md`.

M3 put life in the city: traffic, pedestrians, damage and wrecks, car-swap,
takedowns and fifty smashable billboards. M4 (`docs/M4_REPORT.md`) is the
police and the run. M5 (at its gate, `docs/M5_REPORT.md`) is the launch
minimum: the save, three jobs with the arrow, the garage on the wall, the
dailies and the streak, the balance script. M6 is the platform and the
submission: `docs/M6_PLAN.md`; all designed in `docs/DESIGN.md`. Older
acceptance reports: `docs/M2_REPORT.md`, `docs/M3_REPORT.md` and
`docs/history/`.

## Play

There is one game and one way to play it:

```bash
npm install
npm start            # builds the production bundle and serves it at http://localhost:4173
```

That is the build CrazyGames would serve, from `dist/`, with no URL parameters.
Press `P`: the pause screen's corner shows the build stamp, `0.5.0+<commit>`
(`-dirty` when uncommitted changes went into it), so it is always clear which
build is on screen. The version is the milestone: 0.5.x is M5.

Controls: `W A S D` / arrows drive, `Space` handbrake (drift), `Shift` boost, `E` swap into the car beside you, `R` reset (or respawn when wrecked), `C` camera, `P` pause, `M` mute. Any key skips the takedown slow motion and closes the busted card. Behind the garage door `A`/`D` move between the wall's pages, `W` opens one or drives out, `S` backs out; everything is clickable too.

The first visit is the cold open: a beat-up van at heat 1, a muscle car to swap into, a coin line round the hideout's block through a billboard, a delivery marker and the hideout door; captions teach each verb, `N` skips. The save (bank, coins, cars, paint, upgrades, billboards, dailies, the streak) is kept in the browser; `?fresh=1` starts a new profile.

The run: crimes fill the bag (yellow, top right, with the multiplier the police have seen you at). Pull into one of the three garages (orange on the radar) and stop: the door takes 3 s to shut and banks the bag times the multiplier; back out to cancel. Two police cars boxing you in while you are wanted fill the BUSTED bar: half the bag is kept, no multiplier.

Jobs: sixteen rings on the corners of the grid, drive into one. Orange is a getaway delivery (a clock to a drop-off, faster pays more), magenta a steal-to-order (find the named car, swap into it, bring it to a fence unscratched), blue a pursuit escape (the police on you at once at a set heat, a bounty for losing them). The orange arrow over the car points at the job's target, and between jobs, dimmed, at the nearest ring or, with a full bag, the nearest door. Behind the door the wall is the garage: cars, paint, three upgrades a car, the lawyer and the fence for the next run, and the day's three challenges. Cars and upgrades are bought with the bank and the coins together.

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

The e2e suites (`perf`, `screens`, `city`, `life`, `heat`, `game`) run against
the production build on port 4173; `npm run balance` is the economy script;
`docs/DEV.md` lists them.
