# CLAUDE.md — standing rules

Distilled from `docs/BRIEF.md` (the source of truth; read it when in doubt, never edit it).

## Language

- Talk to Marcin in **Polish**. Everything in the repo is **English**: code, comments, docs, commit messages, in-game text.
- Be technical and direct. Recommend one option with a reason; no menus of alternatives.

## Session start

1. Read this file and `docs/PROGRESS.md`; check `git log --oneline -15`.
2. Run `npm run verify` before touching anything. It must be green at every milestone gate.
3. Work autonomously inside the milestone. Decide, act, note assumptions in `docs/PROGRESS.md`. Stop only at a gate, before destructive/irreversible operations, to change a fixed decision from the brief, or when blocked on something only Marcin can provide.
4. Commit small and often; never leave significant work uncommitted. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Where things live

| Path | What |
|---|---|
| `docs/BRIEF.md` | The project brief. Read-only. |
| `docs/PROGRESS.md` | Session log: done, decided and why, next, open problems. |
| `docs/ARCHITECTURE.md` | Structure, dependency justifications, decision records. |
| `docs/BACKLOG.md` | Out-of-milestone ideas and non-blocking bugs, one line of context each. |
| `docs/CRAZYGAMES.md` | Platform compliance checklist with status column. Keep updated. |
| `docs/STYLE.md` | Art and UI style guide. |
| `docs/TITLES.md` | Working title proposals (Marcin picks). |
| `docs/ASSETS.md` | Third-party assets with source and licence. Nothing without a clear licence. |
| `src/sim/` | Headless game state + physics (Rapier). **No Three.js, no DOM** (enforced by `tsconfig.sim.json` and lint). |
| `src/render/`, `src/audio/`, `src/ui/` | Read sim state, never write it. |
| `src/input/` | Devices → abstract actions. `KeyboardEvent.code` only. |
| `src/platform/` | `Platform` interface; `LocalPlatform` now, `CrazyGamesPlatform` in M6. Game code never touches `window.CrazyGames`. |
| `src/app/` | Glue: fixed-step loop, bot, perf probe, `App`. |
| `src/sim/vehicle/tuning.ts` | Every handling number (`VehicleTuning`). Live-editable via `?dev=1` / backtick key. |
| `tests/sim/` | Vitest, Node, headless sim tests. The handling pins live here. |
| `e2e/` | Playwright: smoke, perf (bot under 4× CPU throttle), screenshots at required sizes. |
| `tools/` | `verify.mjs`, `budget.mjs`. |
| `perf/` | `latest.json` / `previous.json` / `startup.json` (git-ignored). |

## Layering (lint-enforced, see `eslint.config.js`)

`sim` → sim only (+ rapier). `input` → input. `platform` → platform. `render` → render, sim (+ three). `audio`/`ui` → self, sim. `app` → everything. Sim runs on a fixed 60 Hz step with an accumulator (`src/app/loop.ts`); render interpolates. No per-frame allocations in hot loops.

## Fixed design decisions (see brief §3)

Always in a vehicle, no on-foot, no guns. PEGI 12 slapstick: pedestrians always dodge, police are comic. No menu before gameplay; cold open. One seamless city. Control never taken away > 2 s. Keyboard first, touch second, input abstracted. Low-poly flat-shaded, palette in `src/sim/palette.ts`, no per-asset textures.

## Budgets (`npm run budget` fails the build)

Startup bytes before gameplay-start: target 8 MB, fail at 12 MB (uncompressed). Total build ≤ 40 MB / 200 files. Time to control ≤ 6 s on 20 Mbit + 4× CPU throttle. 60 fps mid-range iGPU, stable 30+ low tier. Draw calls / tris: 150 / 250k low, 300 / 600k high. JS heap ≤ 250 MB.

## CrazyGames rules that shape code (details in `docs/CRAZYGAMES.md`)

- `gameplayStart()` exactly when the player gains control and on every resume from a game-made break; `gameplayStop()` on game-made breaks only, never on focus loss. `loadingStart/Stop` around asset loading.
- Relative paths only (`base: './'`). Works in an iframe. Chrome + Edge must be clean; Safari must not misbehave.
- Ads only through the adapter, never during driving, never on navigation buttons; mute on `adStarted`; rewarded offers always have a non-ad alternative and equal-size decline; hide rewarded buttons when ads are unavailable; no reward on `adError`.
- Pause on `P`; auto-pause on blur/visibilitychange without calling `gameplayStop`. Never bind essentials to Escape. Prevent default on arrows and space.
- UI legible at DPR 1 at: 821×462, 907×510, 1077×606, 1216×684, 1280×720, 1366×768, 1536×864, 1920×1080, 800×450, 1080×607.

## Working method

- Vertical slices; build what the milestone asks, completely. Ideas outside it go to `docs/BACKLOG.md`.
- Never loosen a test or a budget to get green; say it is wrong instead.
- Keep tests to the brief's list and to what a milestone calls for. Scratch scripts are not committed.
- Prefer targeted edits. Check current docs / installed types for Three.js, Rapier and the SDK instead of memory.
- Gate report at each milestone: what was built, verify and perf numbers, how to run, a five-minute playtest script, tuning knobs and where they live, known issues, proposed next scope.
