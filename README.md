# Untitled Driving Game

Open-world arcade driving for the browser (CrazyGames). You are the getaway driver who never keeps a car: steal, wreck, swap, escape, bank. Brief: `docs/BRIEF.md`. Standing rules: `CLAUDE.md`. Current state: `docs/PROGRESS.md`.

M3 put life in the city: traffic, pedestrians, damage and wrecks, car-swap,
takedowns and fifty smashable billboards. M4 (`docs/M4_REPORT.md`) is the
police and the run. M5 (at its gate, `docs/M5_REPORT.md`) is the launch
minimum: the save, three jobs with the arrow, the garage on the wall, the
dailies and the streak, the balance script. M5.5 (`docs/M5.5_REPORT.md`)
is the whole game before the platform. M6 (`docs/M6_REPORT.md`) is the
wanted board: ten rivals and the Chief, their cars, the kit; M7 (at its gate,
`docs/M7_REPORT.md`) is the polish, the same game finished; M8 is the chaos,
the street furniture made of things with mass (`docs/M8_PLAN.md`); M9 is the
platform and the submission (`docs/M9_PLAN.md`); all designed in
`docs/DESIGN.md`. Older acceptance reports: `docs/M2_REPORT.md`,
`docs/M3_REPORT.md` and `docs/history/`.

## Play

There is one game and one way to play it:

```bash
npm install
npm start            # builds the production bundle and serves it at http://localhost:4173
```

That is the build CrazyGames would serve, from `dist/`, with no URL parameters.
Press `P`: the pause screen's corner shows the build stamp, `0.6.0+<commit>`
(`-dirty` when uncommitted changes went into it), so it is always clear which
build is on screen. The version is the milestone: 0.6.0 is M6.

Controls: `W A S D` / arrows drive, `Space` handbrake (drift), `Shift` boost, `E` swap into the car beside you, `H` horn (the car ahead moves aside), `R` reset (or respawn when wrecked), `C` camera, hold `Tab` for the map of the island, `P` pause, `M` mute. Any key skips the takedown slow motion and closes the busted card. Behind the garage door `A`/`D` move between the wall's pages, `W` opens one or drives out, `S` backs out; everything is clickable too.

The first visit is the cold open: a beat-up van at heat 1, a muscle car to swap into, a coin line round the hideout's block through a billboard, a delivery marker and the hideout door; captions teach each verb, `N` skips. The save (bank, coins, cars, paint, upgrades, billboards, dailies, the streak) is kept in the browser; `?fresh=1` starts a new profile.

The run: crimes fill the bag (yellow, top right, with the multiplier the police have seen you at). Two patrols are always on the beat: a crime they see (a billboard, a wrecked car, a ram, speeding past them) makes you wanted at once and the stars pop with what it cost; a crime nobody saw raises the stars quietly. Pull into one of the three garages (orange on the radar) and stop: the door takes 3 s to shut and banks the bag times the multiplier; back out to cancel. Two police cars boxing you in while you are wanted fill the BUSTED bar: half the bag is kept, no multiplier.

Coins are never a carpet: a job lays its coins along your route (runs at the turns and on the straights, the big one on the target; take them all and the job tips 10 %), thirty caches a day sit on side streets (gold dots on the radar, CACHES n/30, a bonus at every tenth), and the rest lie only at billboards and ramps.

The line at the top always names one thing to do (TAKE A JOB · 320 m, LOSE THEM, BANK IT, BUY THE COMPACT · n TO GO) and the arrow points at it; the first quarter hour is a six-step chain with a card for each step.

Jobs: twenty-eight rings on the corners of the grid, drive into one. Orange is a getaway delivery (a clock to a drop-off, faster pays more), magenta a steal-to-order (find the named car, swap into it, bring it to a fence unscratched), blue a pursuit escape (the police on you at once at a set heat, a bounty for losing them), gold a time trial on a coin line (medals), lime a street race against three rivals, red a takedown rage and white a mayhem zone (a quota inside a ring in 60 s). In a taxi, walkers hail fares; one in four is a crook who pays double while the heat climbs. Near misses, drifts, flights and the oncoming lane build a skill chain into the bag; the twenty ramps and the fifty billboards are hunts with a prize, and one car in the city is hidden. The orange arrow over the car points at the job's target, and between jobs, dimmed, at the nearest ring or, with a full bag, the nearest door. Behind the door the wall is the garage: cars, paint, three upgrades a car, the lawyer and the fence for the next run, and the day's three challenges. Cars and upgrades are bought with the bank and the coins together.

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
