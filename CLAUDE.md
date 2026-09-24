# CLAUDE.md — standing rules

Distilled from `docs/BRIEF.md` (the source of truth; read it when in doubt, never edit it).

## Language

- Talk to Marcin in **Polish**. Everything in the repo is **English**: code, comments, docs, commit messages. In-game text is written in English in the code and the screen says it in **Polish by default** (Marcin, 2026-09-24; DESIGN §19): every on-screen string goes through `t()` (`src/ui/lang.ts`) and has its entry in `src/ui/pl.ts`, pinned by `tests/ui/lang.test.ts`; English stays one settings row (or `?lang=en`) away.
- Be technical and direct. Recommend one option with a reason; no menus of alternatives.

## Session start

1. Read this file, `docs/PROGRESS.md` and your milestone's contract. Two run at once (see **Two milestones at once** below): `docs/M8.8_PLAN.md`, the fleet, and `docs/M8.9_PLAN.md`, the look (each its design and contract in one file; M8.9's slice 0, two faults of M8.7, first); then `docs/M9_PLAN.md`, the platform, after both gates, only on Marcin's word; the design in `docs/DESIGN.md`, §20 first. M8.7's gate closed at 0.8.7 (`docs/M8.7_REPORT.md`). Check `git log --oneline -15`.
2. Run `npm run verify` (the quick set) before touching anything and at the commit that ends a slice. `npm run verify:gate` (the long bot-driven pins included) only at a milestone gate. Nothing else per slice: see **Pace** below, and read it before every slice.
3. Work autonomously inside the milestone. Decide, act, note assumptions in `docs/PROGRESS.md`. Stop only at a gate, before destructive/irreversible operations, to change a fixed decision from the brief, or when blocked on something only Marcin can provide.
4. Commit small and often; never leave significant work uncommitted. Commit messages end with a `Co-Authored-By:` line naming the model that did the work (e.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Two milestones at once (Marcin, 2026-09-25)

M8.8 "The fleet" (`docs/M8.8_PLAN.md`) and M8.9 "The look" (`docs/M8.9_PLAN.md`) are built at the same time, each by its own session in its own git worktree and branch; M9 starts after both gates. Where either plan says it waits for the other's gate, this section decides: they run side by side, and the handovers of rule 4 replace the waiting.

| | M8.8 the fleet | M8.9 the look |
|---|---|---|
| Session | "Pojazdy w grze" | "UI/UX i style" |
| Branch | `m8.8-fleet` (worktree `.claude/worktrees/m8.8-fleet`) | `m8.9-ui` (its own worktree) |
| Owns | the sim (vehicles, bodies, traffic, police, the ground and the sea, jobs), the cars' and the traffic's meshes, the engine voices | how the screen and the world look: `src/ui/` (styles, HUD, wall, maps), the light, the sky, the city's colours, the signs' look, the showroom and its pictures |

1. **Nobody works in the main folder** (`C:\Games\Nowy folder (6)`): it holds `main` for the merges and Marcin's `npm start`. Each session works in its own worktree (`npm ci` there once) and never `cd`s into the other's.
2. **A slice reaches main whole**: commit on the branch; `git merge main` into the branch and resolve there; `npm run verify` green; then `git -C "C:\Games\Nowy folder (6)" merge --ff-only <branch>`. If the fast-forward fails (the other got there first) or git reports `index.lock`, merge main again and repeat. No `git add -A`; no push without Marcin's word.
3. **Shared files are added to, not rewritten**: `src/ui/pl.ts`, `tests/ui/words.test.ts`, `tests/ui/lang.test.ts`, `src/sim/palette.ts`, `src/sim/glyphs.ts`, `docs/PROGRESS.md` (entries at the top, newest first), `docs/BACKLOG.md`, `docs/STYLE.md`; a conflict keeps both sides. Before a slice that touches a file the other also changes (`src/ui/wall/garage.ts`, `src/ui/map/*`, `src/render/cars/PlayerCar.ts`, `src/render/cars/bodyMesh.ts`, `src/render/camera/CameraDirector.ts`, `src/render/run/MarkerView.ts`, `src/render/city/CityView.ts`, `src/app/App.ts`, `src/audio/Sfx.ts`), merge main in first.
4. **Handovers.** The fleet's screen work is content: its card lines (a class's job, BEST AT, ONLY IT; the words from `src/sim/jobs/catalog.ts`), the player at sea on the maps and the sea trial's route go through what M8.9 has on main (its colours, scale, radar, showroom); where M8.9's slice for that place is not in yet, the fleet builds its sim side and leaves the drawing until it is. The look dresses what is on main when its slice runs: its pictures cover every body in `BODIES` (its pin 14.1), so a body the fleet adds after that slice brings its picture, and its light covers the ground and the sea that are there.
5. **The save's version**: a slice that needs a new one takes the number after the one on main.
6. **Servers, measurements, gates.** 4173 is Marcin's game (`npm start`). Playwright reuses whatever answers on 4173 (`reuseExistingServer`), so a session runs an e2e suite, M8.9's stills included, only on its own port (M8.9's slice 1 takes it from an environment variable) or with 4173 free; otherwise it measures another build. The perf, the e2e suites, the look gate, the balance and a gate run only when Marcin says the other session is idle, the gates one at a time. M8.7's unrun perf A/B, e2e suites and balance (its report) fall to the first gate. Each gate's perf is an A/B against 0.8.7 (`52db2bc`), and against the other's gate build if that closed first. A gate sets `package.json` to its own version unless a higher one is on main.
7. **CLAUDE.md** is edited by the fleet's session only; the look's session passes its lines (its gate's colour table and typeface) to Marcin, who hands them over.

## Where things live

| Path | What |
|---|---|
| `docs/BRIEF.md` | The project brief. Read-only. |
| `docs/PROGRESS.md` | Session log: done, decided and why, next, open problems. Holds the current milestone and the design talks; older entries are archived under `docs/history/` at each gate. |
| `docs/history/` | Past gate reports, reviews and archived session logs (`PROGRESS_M0-M3.md`, `PROGRESS_M4.md`, `PROGRESS_M5.md`, `PROGRESS_M5.5.md`, `PROGRESS_M6.md`, `PROGRESS_M7.md`). |
| `docs/DESIGN.md` | Design decisions on top of the brief: the run, progression, the city as a level, platform KPIs, the M4 slice order. Each section is marked decided (Marcin) or set here (mine). |
| `docs/M7_PLAN.md` | The finished contract of the polish (DESIGN §15; `docs/M7_REPORT.md`, 0.7.0). |
| `docs/M8_PLAN.md` | The finished contract of the chaos (its gate closed inside M8.5's, `docs/M8.5_REPORT.md`): the chaos (DESIGN §16): street furniture with mass, the knock decided before the physics step, each district's things, the smash as a skill-chain trick, the bill at the door. |
| `docs/M8.5_PLAN.md` | The finished contract of the clean screen (`docs/M8.5_REPORT.md`, 0.8.5, M8's gate inside it; DESIGN §17): seven things on a calm drive, one voice at a time, one name for each thing, the wall in four pages, a road coin in the bank. |
| `docs/M8.6_PLAN.md` | The finished contract of solid cars (DESIGN §18; its gate closed inside M8.7's, `docs/M8.7_REPORT.md`), from Marcin's screenshots of a five-star chase: a driving car on its wheels, wrecks on their wheels or roofs keeping their pose, the police box without shoving, the officer round the cars, the player's car always seen, the frames measured in his scenes. |
| `docs/M8.7_PLAN.md` | The finished contract of the way (DESIGN §20; `docs/M8.7_REPORT.md`, 0.8.7, M8.6's gate inside it), from Marcin's notes on how the game tells a player where to go: one answer per question (the goal line, the route on the radar, the sign over the ring), no arrow, a goal that holds, a job taken by rolling in, nothing opened in a chase, the kinds one at a time. |
| `docs/M6_PLAN.md` | The finished contract of the wanted board (DESIGN §14; kept for its numbers and as-built notes). |
| `docs/M4_PLAN.md`, `docs/M5_PLAN.md` | The finished contracts (kept for their numbers and as-built notes). M4's §5 holds the contract for post-launch update 1. |
| `docs/M5.5_PLAN.md` | The finished contract before it: the whole game before the platform (kept for its numbers and as-built notes). |
| `docs/M8.8_PLAN.md` | The fleet: its design and its contract in one document (Marcin's request, 2026-09-24): a job for every class, trophies each best at one thing, the 4×4 and the ground, three crazy cars, the motorbike, the hovercraft and the sea, the mega-ramp, the police and the rivals on the car model. Beside M8.9 and before the platform (Marcin, 2026-09-25; **Two milestones at once**). |
| `docs/M8.9_PLAN.md` | The look: its design and its contract in one document, from a review of every screen that Marcin accepted with his bar (6/10 now, 9 at least): the world at a real golden hour and lit at dusk, one colour for one meaning, one typeface in two styles, a HUD that scales with the screen, one message at a time, a radar that answers three questions, signs that read from afar and never block, the garage as a showroom. Beside M8.8 (Marcin, 2026-09-25; **Two milestones at once**); its slice 0 first. |
| `docs/M9_PLAN.md` | The platform contract (SDK adapter, touch, mobile tier, submission), the brief's M6, after the M8.8 and M8.9 gates on Marcin's word. |
| `docs/ARCHITECTURE.md` | Structure, dependency justifications, decision records. |
| `docs/DEV.md` | Servers and ports, the build stamp, test URLs, QA hooks, the suites, scratch folders. `npm start` (4173) is the one way to play; `npm run dev` (5173) is for editing. |
| `docs/BACKLOG.md` | Out-of-milestone ideas and non-blocking bugs, one line of context each. |
| `docs/CRAZYGAMES.md` | Platform compliance checklist with status column. Keep updated. |
| `docs/STYLE.md` | Art and UI style guide. |
| `docs/TITLES.md` | Working title proposals (Marcin picks). |
| `docs/ASSETS.md` | Third-party assets with source and licence. Nothing without a clear licence. |
| `src/sim/` | Headless game state + physics (Rapier). **No Three.js, no DOM** (enforced by `tsconfig.sim.json` and lint). |
| `src/render/`, `src/audio/`, `src/ui/` | Read sim state, never write it. |
| `src/ui/lang.ts`, `src/ui/pl.ts` | The screen's language (DESIGN §19): `t()`, the numbers, a paint agreeing with its car; the Polish table keyed by the English the code writes. The sim's texts with holes take a `Say` (`src/sim/say.ts`). |
| `src/input/` | Devices → abstract actions. `KeyboardEvent.code` only. |
| `src/platform/` | `Platform` interface; `LocalPlatform` now, `CrazyGamesPlatform` in M9. Game code never touches `window.CrazyGames`. |
| `src/app/` | Glue: fixed-step loop, bot, perf probe, `App`. |
| `src/sim/vehicle/tuning.ts` | Every handling number (`VehicleTuning`). Live-editable via `?dev=1` / backtick key. |
| `tests/sim/` | Vitest, Node, headless sim tests. The handling pins live here. `*.long.test.ts` are the long bot-driven pins, run with `LONG=1` (`npm run verify:gate`, `npm run test:long`). |
| `e2e/` | Playwright: smoke, perf (bot under 4× CPU throttle), screenshots at required sizes. |
| `tools/` | `verify.mjs`, `budget.mjs`. |
| `perf/` | `latest.json` / `previous.json` / `startup.json` (git-ignored). |

## Layering (lint-enforced, see `eslint.config.js`)

`sim` → sim only (+ rapier). `input` → input. `platform` → platform. `render` → render, sim (+ three). `audio`/`ui` → self, sim. `app` → everything. Sim runs on a fixed 60 Hz step with an accumulator (`src/app/loop.ts`); render interpolates. No per-frame allocations in hot loops.

## Fixed design decisions (see brief §3)

Always in a vehicle, no on-foot, no guns. PEGI 12 slapstick: pedestrians always dodge, police are comic. No menu before gameplay; cold open. One seamless city. Control never taken away > 2 s. Keyboard first, touch second, input abstracted. Low-poly flat-shaded, palette in `src/sim/palette.ts`, no per-asset textures.

The screen's budget (DESIGN §17, set 2026-09-24 after Marcin's review): a calm drive shows six things (the goal line, the stars, the bank, the radar, the speed, the boost); everything else appears on its moment and goes. No arrow (Marcin, 2026-09-24, DESIGN §20; it leaves with M8.7 slice 1): what now is the goal line, where is the route on the radar, what is it is the sign over the ring, one answer each. A new system gets no standing place on the driving screen: it speaks through the goal line, a card, the one message at the top, a pop (two at most), the wall's GOALS page or the full map. One name for each thing (§17.4: BANK, BAG, the stars, GARAGE, COPS, COMBO), pinned by `tests/ui/words.test.ts`; in Polish (§19: BANK, ŁUP, GWIAZDKI, GARAŻ, GLINY, KOMBO), pinned by `tests/ui/lang.test.ts`.

One colour, one meaning (Marcin accepted 2026-09-25, `docs/M8.9_PLAN.md` R1): yellow is money, cyan is the way, red is trouble, blue is the police, ink is everything else, grey is closed. M8.9 builds the table and its pin; until then new screen work keeps yellow and cyan to those two meanings.

## Budgets (`npm run budget` fails the build)

Startup bytes before gameplay-start: target 8 MB, fail at 12 MB (uncompressed). Total build ≤ 40 MB / 200 files. Time to control ≤ 6 s on 20 Mbit + 4× CPU throttle. 60 fps mid-range iGPU, stable 30+ low tier. Draw calls / tris: 150 / 250k low, 300 / 600k high. JS heap ≤ 250 MB.

## CrazyGames rules that shape code (details in `docs/CRAZYGAMES.md`)

- `gameplayStart()` exactly when the player gains control and on every resume from a game-made break; `gameplayStop()` on game-made breaks only, never on focus loss. `loadingStart/Stop` around asset loading.
- Relative paths only (`base: './'`). Works in an iframe. Chrome + Edge must be clean; Safari must not misbehave.
- Ads only through the adapter, never during driving, never on navigation buttons; mute on `adStarted`; rewarded offers always have a non-ad alternative and equal-size decline; hide rewarded buttons when ads are unavailable; no reward on `adError`.
- Pause on `P`; auto-pause on blur/visibilitychange without calling `gameplayStop`. Never bind essentials to Escape. Prevent default on arrows and space.
- UI legible at DPR 1 at: 821×462, 907×510, 1077×606, 1216×684, 1280×720, 1366×768, 1536×864, 1920×1080, 800×450, 1080×607.

## Working method

- **Pace (Marcin, 2026-09-23, after three sessions that lost hours to it).** A slice is: the code, its Vitest pins, `npm run verify` green, one commit, a PROGRESS entry of at most eight lines. **Not per slice, ever:** `npm run perf`, any e2e suite (`heat`, `game`, `life`, `city`, `screens`), `npm run balance`, browser checks, bot measurements, research agents, design or plan rewrites, backlog grooming, memory notes. Those happen once, at the gate, or when Marcin asks for one by name. A "measurement" a plan names for a slice is taken at the gate unless it is already a Vitest pin inside the quick verify. Any check outside this list that would take over a minute: skip it and say so in the commit. He reads the game, not the logs; hours spent proving a slice are hours he watches nothing move. The one exception (Marcin, 2026-09-25): in M8.9 a slice that changes how the screen or the world looks ends with its stills (`e2e/look.spec.ts -g stills`, under a minute), looked at before the commit (`docs/M8.9_PLAN.md` §0).
- Vertical slices; build what the milestone asks, completely. Ideas outside it go to `docs/BACKLOG.md`.
- Never loosen a test or a budget to get green; say it is wrong instead.
- Keep tests to the brief's list and to what a milestone calls for. Scratch scripts are not committed.
- A bot-driven or traffic-pool test over about 10 s of wall time goes into `tests/**/*.long.test.ts`; the quick `verify` stays under a minute of tests, the gate runs everything.
- At each milestone gate, move PROGRESS entries older than the milestone into `docs/history/PROGRESS_<range>.md` and leave a pointer at the bottom of PROGRESS.
- Prefer targeted edits. Check current docs / installed types for Three.js, Rapier and the SDK instead of memory.
- Gate report at each milestone: what was built, verify and perf numbers, how to run, a five-minute playtest script, tuning knobs and where they live, known issues, proposed next scope.
