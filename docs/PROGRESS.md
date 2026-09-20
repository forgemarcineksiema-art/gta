# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-20 — Session 1: M0 Foundations + M1 The car

### Done

- Repo tidy-up: `BRIEF.md` moved to `docs/BRIEF.md` and committed. `LAUNCH-PLAN.md` and `launch_sim.py` mentioned in the instructions were not in the folder; nothing to move (noted, not blocking).
- Toolchain: TypeScript 5.9 strict, Vite 8, Vitest 5, Playwright 1.63 (Chromium installed), ESLint 10 + typescript-eslint + eslint-plugin-boundaries. Layer rules enforced on imports; `tsconfig.sim.json` compiles `src/sim` without the DOM lib. Both verified to catch violations.
- `docs/CRAZYGAMES.md` written from the live docs by a subagent (18 pages). No contradictions with the brief's assumptions. New facts: a third SDK environment value `crazygames`, ad error code `adCooldown`, banner-specific `bannersDisabledBasicLaunch`, no official npm package (script tag only), data cap is 1,048,576 bytes with the error code spelled `dataLimitExcedeed`.
- `Platform` interface + `LocalPlatform` (simulated ad overlay, every error code forceable from the URL, call counters exposed for tests).
- Fixed-step loop (60 Hz, ≤ 5 substeps, drops excess), `TransformBuffer` double-buffer, render interpolation.
- Sim: `SimWorld` on Rapier, the M1 playground (long 1 km straight with posts and distance boards, kerb lane with rumble strips, 12-cone slalom, skidpad, 8°/16°/26° ramps and a 22° big jump, soft boxes to bump), 8 named spawn points, fall/flip recovery.
- Vehicle: custom raycast car (see `docs/ARCHITECTURE.md`), all numbers in `VehicleTuning`, drift state machine, boost meter, fake gearbox for audio.
- Render: merged vertex-colour statics (1 draw call), golden-hour sky dome + fog + shadow map that follows the car, code-built muscle coupe with wheels on their own transform slots, chase camera with FOV/pull-back/drop/shake/velocity-follow, speed streaks.
- Audio: synthesized engine (saw + square + sub through a load-driven lowpass, waveshaper grit), wind and skid noise, ad-mute hook, user mute on `M`.
- UI: HUD (speed, gear, boost bar, drift readout, debug block, pause overlay, keycap hints for 12 s, toasts), dev tuning panel (`?dev=1` or backtick) with spawn buttons, boost refill, defaults, and "copy patch". Screenshots at all ten required sizes reviewed; the first pass had the BOOST label clipped and the gear floating, fixed.
- Input: `KeyboardEvent.code` bindings, arrows + WASD, prevent-default on arrows/space, layout-map labels, `P` pause, blur/visibility auto-pause without `gameplayStop`.
- Tests: 17 Vitest sim tests (acceleration, top speeds, boost economy, braking, reverse, three drift tests, kerb clip, keyboard highway stability, ramps land and settle, flip recovery, reset, render-rate independence at 30/60/144/165 Hz with bitwise-equal results, accumulator behaviour, 10,000-step soak).
- E2E: smoke (loads → gameplay-start once → 20 s of sim with no console errors → `perf/startup.json`), perf (bot 60 s under 4× CPU throttle → `perf/latest.json`, regression warnings), screens (HUD + pause at the 10 required sizes).
- Tools: `npm run verify`, `npm run budget`.
- Docs: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STYLE.md`, `docs/TITLES.md`, `docs/BACKLOG.md`, `docs/ASSETS.md`.

### Decided and why

- Rapier `-compat` build: runs in Node for Vitest with no bundler plugins; costs ~0.7 MB of base64. Total startup is 3.3 MB uncompressed, far under the 8 MB target.
- Custom raycast vehicle instead of Rapier's controller: the drift state, slip curve and arcade assists the brief asks for do not exist in the built-in controller.
- Drift is a controlled state (yaw-rate controller + velocity-follow + scrub), because the emergent version either spun out or lost all speed in a second. Holding steer now gives a stable ~25° drift; centring straightens in ~0.3 s.
- Handling numbers were set by the headless probe, not by feel (which only Marcin can judge): 0–100 in 4.9 s, 163 km/h at 12 s / ~170 asymptotic, 228 km/h with boost, 31 m braking from 100.
- Headless Chromium defaulted to SwiftShader (~5 fps). With `--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=default` in `playwright.config.ts` it uses the real GPU on this machine (NVIDIA MX330 via ANGLE D3D11): 58.7 fps mean, p95 16.8 ms in the smoke run. Frame-time budgets are enforced only when the GL renderer is not a software rasterizer; sim-step time (< 12 ms p95) is enforced everywhere.
- Sky dome fixed at the origin for now (850 m radius); moves with the camera in M2.
- Title: "Untitled Driving Game" in the build until Marcin picks from `docs/TITLES.md`.

### Numbers at the M1 gate (this machine: NVIDIA MX330 via headless Chromium, 1280×720, DPR 1)

| Measure | Value |
|---|---|
| `npm run verify` | green (typecheck ×2, lint, 17 sim tests, build, smoke, budget) |
| Bytes before gameplay-start | 3.29 MB uncompressed (rapier 2.72, three 0.51, game 0.05, css 0.01) |
| Time to gameplay-start (smoke, no throttle) | 0.77 s |
| Perf run, 60 s bot, 4× CPU throttle | 59.3 fps mean, frame p50/p95/p99 16.7/16.8/16.8 ms, max 133 ms, sim step p95 4.9 ms |
| Draw calls / triangles | 63 mean, 89 max / 15k |
| JS heap | 15 MB |
| Build | 5 files, 3.29 MB |

### Assumptions noted

- The in-app browser pane throttles `requestAnimationFrame` to ~4 Hz while hidden, so visual checks there ran in slow motion; dynamics were validated headless instead.
- `extraGravity` (4 m/s²) applies to the car only; props fall at 9.81.

### Next (M2 The city)

- Procedural city from a seed: road graph with lanes, four districts, highway loop, chunk streaming, minimap, fog/draw distance, first quality tiers. Gate: budgets hold with the bot driving the whole map.

### Open problems

- Feel is unverified by a human. The M1 gate is Marcin's playtest; the tuning panel exists for that session.
- Perf numbers so far come from this machine's MX330 through headless Chromium; the Chromebook/low tier is unmeasured until Marcin runs `npm run perf:headed` there.
