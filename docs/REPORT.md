# Status report — 2026-09-20

Covers everything from the empty repository to the end of the M1 feel passes: 17 commits, 61 files, ~6,000 lines of TypeScript/CSS plus docs. M0 (foundations) and M1 (the car) are done; M1 has been through three playtest-driven feel passes and a car-model pass. M2 (the city) has not started.

## 1. Where the project stands

| Milestone | Status | Gate evidence |
|---|---|---|
| M0 Foundations | done | `npm run verify` green (typecheck ×2, lint, 29 sim tests, build, smoke, budget) |
| M1 The car | done, iterated with Marcin | 29 headless handling pins; playtests on the target laptop (weak CPU + MX330) |
| M2 The city | not started | — |

Budgets (target / measured): startup bytes 8 MB / **3.29 MB** uncompressed (rapier 2.72, three 0.51, game 0.05); build 40 MB, 200 files / **3.3 MB, 5 files**; time to gameplay-start / **0.7–0.8 s** unthrottled; frame rate on the low tier / **58–60 fps, p95 16.7–17.2 ms** under 4× CPU throttle on the MX330 laptop; sim step p95 **8.3 ms** (budget 12); draw calls **80–89** (budget 150 low), triangles **15k** (budget 250k), JS heap **15–20 MB** (budget 250).

## 2. What was built

**Toolchain and rules.** TypeScript 5.9 strict, Vite 8, Vitest 5, Playwright 1.63, ESLint 10 with `eslint-plugin-boundaries`. Layering is enforced on imports (`sim` → sim only; `render/audio/ui` read sim; `app` glues everything) and `src/sim` is compiled a second time without the DOM lib, so the simulation is headless by construction. Both checks were verified to catch violations.

**Platform seam.** `Platform` interface (init, loading/gameplay brackets, typed ad requests and events, adblock, save/load) and `LocalPlatform`, which simulates ads with an overlay and lets every SDK error code be forced from the URL. `docs/CRAZYGAMES.md` distils the current CrazyGames docs into a 60-item checklist with statuses; 15 items are already done in code (gameplay-start timing, relative paths, fixed timestep, key handling, scroll and context-menu fixes, audio unlock, user-select, no fullscreen button).

**Simulation.** Fixed 60 Hz step with a capped accumulator and render interpolation; bitwise-identical results at 30/60/144/165 Hz are a test. Rapier 3D (compat build, runs in Node). The M1 playground: 1 km straight, kerb lane with rumble strips, slalom, skidpad, 8°/16°/26° ramps and a big jump, spawn points, fall and flip recovery.

**Vehicle model** (`docs/ARCHITECTURE.md` → Vehicle model), physical parts with explicit assists:
- chassis rigid body with explicit mass properties; the chassis does not collide with terrain while upright (it rides on the suspension; the terrain group is switched on only when on its side or roof);
- four raycast suspensions with split damping, bump stop, anti-roll bar, progressive damping and an impulse cap;
- engine torque curve, five automatic gears plus reverse, rev limiter, engine braking, torque cut during shifts; rpm follows the driven wheels;
- per-wheel angular velocity solved in closed form per substep against a slip-ratio tyre force (stable at 60 Hz down to standstill; wheelspin and lock-ups emerge);
- slip-angle lateral model with peak/tail, friction circle, impulse clamp against low-speed chatter, Ackermann steering;
- assists as numbers: traction control, ABS (the handbrake is exempt), rest damping, and a drift layer (`driftAssist`);
- keyboard steering: fast ramp through a sensitivity curve (a tap is a small correction, a hold is full lock), lock shrinking with speed;
- drift: entered by Space while turning (a drift button, no brake torque), a brake tap while turning hard, or the rear stepping out at highway speed; the stick commands the drift angle, the fronts auto counter-steer, the commanded angle is rate limited with a centre hold and an exit hold so keyboard taps modulate instead of ending it; throttle keeps the speed;
- flight: the nose follows the flight path, levels to the landing surface before touchdown, sticky landing keeps 92% of momentum, kinks redirect without loss;
- boost meter (drift and airtime refill it), reset to the nearest spawn, live rebuild of mass/collider from the dev panel.

Every number lives in `src/sim/vehicle/tuning.ts` (about 110 tunables) and is editable live in the dev panel (`?dev=1` or the backtick key), which can copy a patch of the changed values.

**Rendering.** Vertex-colour merged statics (one draw call for the whole playground), golden-hour sky dome that follows the camera, tinted fog, a shadow map that follows the car and widens with speed, world-anchored speed streaks (motes smeared along the car's velocity), and a parametric car: a loft through cross-sections with all detail drawn as flush decals in the panels (pillars, belt trim, door seams and handle, wheel-arch pockets, sills, bumper bands, lights, grille, plate), plus mirrors, exhaust tips, a lip spoiler and spoked wheels as real 3D parts. Brake and reverse lights react by recolouring their decal vertices. Chase camera: yaw as a rate-limited angle, view along the heading (a drifting car stays centred), critically damped reverse orbit with hysteresis, height lag in the air, landing shake.

**Audio.** Synthesized engine (three oscillators through a load-driven lowpass, waveshaper grit) driven by the real rpm, wind, tyre squeal from slip angle and wheelspin, ad-mute hook, user mute.

**UI.** HUD (speed, gear, boost bar, drift readout with angle, time and metres, keycap hints, pause, toasts, debug block), dev tuning panel, screenshots reviewed at all ten CrazyGames legibility sizes.

**Verification.** `npm run verify` (typecheck, lint, sim tests, build, smoke, budget); `npm run perf` runs the autopilot 60 s under 4× CPU throttle on the real GPU (headless Chromium is launched with GPU flags), writes `perf/latest.json` and warns on >10% regressions; `npm run screens` captures the HUD and pause screen at every required viewport.

## 3. Measured handling (pinned by tests)

| Measure | Value |
|---|---|
| 0–60 / 0–100 km/h | 3.1 s / 6.5 s (starter-car pacing on Marcin's request) |
| Top speed / with boost | 169 km/h / 234 km/h |
| 100 → 0 km/h | 29 m, fronts never fully lock (ABS) |
| Drift from a handbrake tap at 70 km/h | 30–35° held, 60–70 km/h kept with throttle, survives steering taps for 4 s, straightens in 0.5–1.6 s when centred |
| Full-lock pulse (0.35 s) | > 20° heading change at 60 km/h on grip; < 16° at 120 km/h, no slide |
| 26° ramp at ~95 km/h | lip ≥ 80% of run-up speed, nose 5–32° up in flight, planted landing (< 10 airborne steps in the next second), ≥ 85% of lip speed kept |
| At rest | no creep (< 5 mm in 10 s), no wheel motion |

## 4. Decisions worth knowing (details in `docs/ARCHITECTURE.md`)

1. Rapier `-compat` build for headless Node tests (costs ~0.7 MB of base64).
2. Custom raycast vehicle instead of Rapier's controller (needed a drift state, slip curves and assists).
3. Wheel rotation solved in closed form, not integrated (stiff tyre vs light wheel oscillated at 60 Hz).
4. Drift is a held state the player modulates; the stick sets the angle; fronts counter-steer automatically.
5. No chassis–terrain collision while upright; landings keep momentum (jumps are rewards, not penalties).
6. Fixed 60 Hz step, max 5 substeps, excess time dropped.
7. Speed streaks are world-anchored motes, not screen-space lines.
8. No web fonts; system heavy italic.

## 5. Playtest feedback loop so far

1. First gate: A/D reversed (axis convention bug, fixed at the source); "physics must be rigorous, tune by numbers"; streaks looked generic (rebuilt, not removed); known-issues list worked off.
2. Straight line twitchy → shaped keyboard steering.
3. Drift hard to start and dying on the handbrake, slalom "like a bus" → arcade grip, drift button, brake/power entries, speed kept in drift.
4. Drift releasing too soon, flight/landing rules, cameras, acceleration too quick → drift persistence, flight rules, camera rewrite, starter pacing.
5. Reverse camera → critically damped orbit, omega 3.5.
6. Car model → parametric loft, then a detail pass, then redone properly as flush panel decals.

## 6. Open items

- Feel is Marcin's call; the pins reflect his last accepted numbers.
- Sim step p95 rose to 8.3 ms with the per-wheel solver (budget 12); mostly Rapier binding overhead. Watch before traffic in M3.
- Backlog (`docs/BACKLOG.md`): tyre load sensitivity, limited-slip knob, clutch model for launch revving, thicker streak quads, keycap labels outside Chromium.
- Title still "Untitled Driving Game"; five proposals in `docs/TITLES.md` (recommendation: Swerve City).
- `LAUNCH-PLAN.md` and `launch_sim.py` referenced in the first instructions were not in the folder.

## 7. Next: M2 The city

Procedural city from a seed (four districts, arterials, a highway loop, a street grid per district), road graph with lanes, 100 m chunks with colliders around the player and near/far meshes around the camera, minimap, fog tied to draw distance, quality tiers from a startup benchmark with dynamic resolution, and a road-following bot. Gate: budgets hold with the bot driving the whole map.

## 8. How to run

```bash
npm install
npm run dev            # http://localhost:5173  (?dev=1 for the tuning panel, ?spawn=ramps etc.)
npm run verify         # the merge gate
npm run perf:headed    # 60 s autopilot on the real GPU, numbers in perf/latest.json
```
