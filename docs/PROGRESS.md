# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-21 — Session 6: per-class bot budget, wall collisions

Marcin's call: give the track bot a per-car lateral budget, then fix collisions with walls at speed.

- **Track bot per class.** Swept the bot's lateral budget 9–21 m/s² per car. The muscle's laps fall all the way to 21 but above 17 it runs 3 m off the road; the compact lifts its inside wheels above 13 (rolls to 37°); the van runs 12 m wide above 15 and rolls at 13 and 17. Chosen: muscle 17, compact 13, heavy 11 with braking 8 (`TRACK_BOT_BY_CAR` in `src/app/trackBot.ts`; the constructor takes the car id). Per-class lap pins in `cars.test.ts` (muscle 30–40 s, compact 33–43, heavy 35–46); flying laps measured 34.2 / 37.3 / 39.7 s.
- **Walls, measured first.** With the old 0.65 combined friction and no assist, a glancing hit up to 30° slid along the wall, but from 45° up the corner friction pivoted the nose into the wall and the car stopped dead; at 60° it swung past 90° and ended facing backwards; head-on was a dead stop with no bounce and no feedback of any kind.
- **Walls, now** (`Vehicle.ts` "body contacts", numbers `wall*` in `tuning.ts`, decision record 11):
  - the chassis reads Rapier's contact manifolds back every step (`contactPairsWith` / `contactPair`, bound callbacks, no JS allocation): summed normal impulse → `telemetry.impact` (m/s of speed change this step), contact point and normal, `scrape` 0..1 and `contactSide`;
  - chassis friction 0.15 with the Min combine rule (walls are slippery), restitution 0.2 with Max (a head-on hit bounces back a little);
  - on the step of a hit only 15% of the body spin survives: a corner impulse otherwise spins the car round;
  - while sliding along a wall a yaw controller (20 rad/s² per rad, damping 7/s, scaled by the yaw inertia so every class turns alike) turns the nose toward the direction of travel, and keeps working for 0.5 s after the body leaves the wall so the bounce cannot undo it; above an 80° nose angle it is a crash and nothing aligns;
  - nearly stopped with the nose in: throttle + steer peels the car off to the steered side, throttle alone with the nose under 60° slides it out, no input never turns a stopped car.
  Results at 100 km/h (muscle / compact / heavy, speed one second after the hit): 20° keeps 96/93/92%, 45° 69/64/60%, 75° comes out aligned within 3° at 44/47/32 km/h; a 60° hit at 150 km/h comes out straight at 65–70 km/h; head-on stops, bounces 6–11 m and stays square; every case minUp ≥ 0.99. 22 pins in `tests/sim/walls.test.ts` (7 per class plus props).
- **Feedback.** Camera: impact shake (`impactShake` per m/s, capped) and a scrape shake. Audio: a low thump per hit scaled by the speed lost, a band-passed grind while scraping.
- **Playground.** `walls` lane at x 250: barriers both sides for 300 m, an angled barrier crossing the lane at 7°, two pillars, a head-on wall. `?spawn=walls`. The renderer is on the debug handle (`window.__game.renderer`) for scene inspection.
- **Known.** A car nose-in at exactly 90° with the throttle held and no steering pushes the wall and revs; that is by design (steer or reverse). No sparks yet: the contact point and normal are in the telemetry for the VFX pass.

## 2026-09-21 — Session 5: M1 deepened (instrumentation, test track, three cars)

Marcin's call: stay on M1 and do the three highest-leverage items instead of moving on.

- **Instrumentation.** `Recorder` logs every fixed step: controls (6), pose (7) and telemetry (10 values) in growing typed arrays; `toJSON`/`fromJSON` for saving. Because the sim is deterministic, the control stream replays a run: pinned bitwise for an exact stream and to 1 cm after JSON rounding. Telemetry gained `gLong`/`gLat`/`gVert` (from the velocity change over the last step). The dev panel has a scrolling telemetry graph (speed, lateral and longitudinal g, slip, steer, throttle, brake; 10 s of history), "save recording", "load ghost" and "clear ghost".
- **Test track.** `src/sim/track.ts`: a closed Catmull-Rom loop west of the lot (~990 m: start straight, right sweeper, chicane on the east side, hairpin at the south-east, a back straight with a 7° kicker, a 40 m right-hander back onto the straight), sampled every 3 m with heading and curvature; kerbs where it bends, edge posts, a start gantry and gate markers. `LapTimer` with 8 gates: laps count only when every gate is crossed in order (pinned); current / last / best on the HUD with a toast. The best lap's pose stream becomes a translucent **ghost** of the same car. First layout had a hairpin at the start line and 10 m apexes; fixed by re-drawing the loop in the driving direction and easing the chicane (all radii ≥ 12 m, pinned).
- **Track bot** (`src/app/trackBot.ts`): pure pursuit on the centreline with a speed plan from the curvature ahead (allowed speed = min over the next 90 m of sqrt(v_corner² + 2·a_brake·d)). Lap times with no resets: muscle 37.1 s cold, then 34.2–34.3 s; compact 39.9 → 37.0 s; heavy 42.2 → 37.2 s (pinned 30–70 s for the muscle car). The van and the compact lap within 0.2 s of each other because the loop is corner-bound; the bot plans every class with the same lateral budget, so the benchmark measures grip more than power. `?bot=track&spawn=track`. This is the core the city road bot will reuse.
- **Three cars.** `CAR_PRESETS` (`muscle`, `compact` FWD hatch, `heavy` delivery van) as tuning overrides on the default, matching `CAR_PROFILES` for the loft (hatch: short bonnet, tall greenhouse; van: flat nose, one long box). `?car=compact|heavy`, panel buttons reload with the choice. `tests/sim/cars.test.ts` runs the same six pins per class with per-class numbers (rest, 0–100 and top, braking, handbrake drift band, pulse response at 60/120, kerb + 16° ramp). 52 sim tests.

## 2026-09-20 — Session 4: step cost, tyre load sensitivity, LSD, streak quads

- **Sim step measured** (Node, 3,000 steps with a driving script): 0.27 ms per step = vehicle 0.18 + Rapier 0.06 + rest 0.03. The throttled browser p95 of 8.3 ms was frames with 2–3 substeps after a hitch, not the step itself. Moved the per-wheel velocity and force maths into JS (`velAt`, `forceAt`: one `addForce` and one `addTorque` per step instead of 23 WASM calls): vehicle 0.18 → 0.14 ms. Rays cost 4 × 7.7 µs and are not worth more work before M3.
- **Tyre load sensitivity** (`loadSensitivity` 0.15): grip per newton falls with load above the static share, so weight transfer costs total grip, as it should.
- **Limited-slip differential** (`lsdLock` 0.5, `lsdPreload` 60 N·m, `lsdStiffness` 220 N·m·s): torque moves from the faster driven wheel to the slower one, capped by preload plus half the axle torque. No one-wheel-peel; power slides are cleaner.
- **No clutch**: decided with Marcin; an automatic arcade car does not need one.
- **Streaks rebuilt as quads**, then **replaced**: Marcin objected to anything drawn in front of the car; checked how the big arcade racers do it (FOV, camera, peripheral radial blur or edge speed lines, shake, sound; world particles only behind/beside the car). Now `SpeedLines`: a fullscreen additive shader with streaks rushing outward from the periphery in random sectors, the centre masked out, intensity from speed and boost, cyan lean under boost. One draw call, no geometry updates.
- Wheels merged into one vertex-coloured geometry each (was 9 meshes per wheel). Perf run on the MX330 laptop, 4× CPU throttle: 59.8 fps, frame p95 16.8 ms, sim step p50/p95 1.2/3.0 ms (was 2.2/8.3), draw calls max 69 (was 80), 17k tris, 16 MB heap.
- 29 sim tests pass with the new tyre and differential.

## 2026-09-20 — Session 3: feel passes 2 and 3 (drift, flight, camera, acceleration)

Marcin's playtest notes, in order: straight-line twitchy → drift hard to start and dies with the handbrake, slalom "like a bus" → drift still releases too soon, flight/landing needs rules, reverse and drift cameras poor, acceleration too quick for the Vmax.

### Done

- **Steering for a keyboard:** input ramps at 6 locks/s through a 2.4 sensitivity curve (a 100 ms tap is a small correction, a hold is full lock); lock shrinks to 5° from 34 m/s. Pinned: a 0.35 s full-lock pulse turns > 20° at 60 km/h on grip and < 16° at 120 km/h.
- **Arcade grip:** mu 2.2/2.3 (~3 g), so the slalom is driven on the throttle.
- **Drift entries:** Space while turning (a drift button: rear grip cut, no brake torque; on a straight or slow it still brakes/locks), a brake tap while turning hard above 50 km/h, or the rear stepping out under power above ~100 km/h.
- **Drift persistence:** the commanded angle is rate limited (in 90°/s, out 45°/s), a centred stick with Space held keeps 40% of the angle, exit needs 0.3 s below the exit slip, counter-steer shrinks then swaps. Pinned: taps every half second keep the drift for 4 s above 50 km/h and 18°.
- **Flight rules:** ramp climb costs only gravity (the chassis no longer collides with terrain; it rides on the suspension, and the terrain group is switched on only when the car is on its side or roof); a kink in the road redirects the velocity without loss; in the air the nose follows the flight path (nose up rising, bias +4°, ±25°), and levels to the ground normal 0.45 s before touchdown; a landing keeps 35% of the vertical speed and 50% of the spin, and 92% of the total speed is kept by redirecting the absorbed part along the ground (Burnout rule); the damper impulse is capped so a landing can stop the chassis but never throw it back up. Pinned on the 26° ramp: lip ≥ 80% of the run-up speed, nose 5–32° up, ≤ 10 airborne steps in the second after touchdown, ≥ 85% of the lip speed kept.
- **Camera rewritten:** yaw is an angle with a rate cap; the view looks along the camera heading (a drifting car stays centred, the view shows where it goes); reversing orbits smoothly to the front after 0.6 s; height lags in the air; landing shake from the impact; drift pulls the camera back and down slightly.
- **Starter car pacing:** torque 245 N·m, drag 1.12: 0–60 in 3.1 s, 0–100 in 6.5 s, 169 km/h, 234 with boost, 29 m from 100.
- **Car model rebuilt as a parametric loft** (`src/render/carMesh.ts`, per the brief's "built in code from parametric profiles"): cross-sections with floor / belt / roof heights and widths give a low nose, bonnet, raked windscreen, narrow greenhouse, rear window and tail; every loft face is a bilinear panel and all detail is drawn *in* the panels as flush decals clipped to the panel (pillars, belt trim, door seams and handle, wheel-arch pockets, sills, bumper bands, headlights, grille, tail/reverse lights, plate); only mirrors, exhaust tips, a lip spoiler and the wheels are real 3D parts. Brake and reverse lights recolour their decal vertices in place. `MUSCLE` is the first `CarProfile`; the other seven classes will be profiles too.
- 29 sim tests.

### Decided and why

- The drift is a held state that the player modulates, not a condition that is re-evaluated every frame. On a keyboard every modulation is a release, so releases must not be exits.
- No chassis–terrain collision while upright (decision record 9). Scraping a bumper on a ramp lip is realistic and feels terrible.
- The landing keeps momentum on purpose: a jump that costs speed is a jump nobody takes twice.

## 2026-09-20 — Session 2: M1 polish after Marcin's first playtest

Marcin's feedback: A/D reversed; physics must be rigorous and tuned by numbers; the speed streaks looked generic ("AI slop": improve, do not remove); work off the known-issues list; then M2. His laptop (weak CPU + MX330) is the low-tier reference and it felt smooth.

### Done

- **Steering sign.** With +Z forward and +Y up, +X is the car's left, not its right. Fixed at the source (`AXIS_RIGHT = -X`, steer rotates by `-steer`), bot and tests updated, verified in the browser (D moves the car to screen-right).
- **Physics pass** (`docs/ARCHITECTURE.md` → Vehicle model): engine torque curve + automatic gearbox + reverse; per-wheel angular velocity with a slip-ratio tyre force solved in closed form per substep; slip-angle lateral model with friction circle and impulse clamp; Ackermann; traction control, ABS, rest damping as numbers; drift layer where the stick commands the angle and the fronts auto counter-steer. 22 headless tests pin it. Probe-measured: 0–100 in 5.0 s, ~171 km/h, ~233 with boost, 30 m from 100, drift holds 30° at 45–50 km/h losing ~5 km/h per second, no creep at rest, handbrake locks the rears, ABS keeps the fronts rolling.
- **Speed streaks** rebuilt as world-anchored motes smeared along the car's velocity, fog-tinted, tapered, additive, centre of the screen kept clear.
- **Known issues worked off:** sky dome follows the camera; shadow frustum widens with speed; reverse camera after 1 s of backing up; simulated ad overlay counts down on `setInterval`; dev panel rebuilds mass/collider live (`applyTuning`); skidpad cones removed (a cone under a suspension ray read as a kerb and launched the car mid-drift).
- `npm run perf:headed` on this machine (visible window, 4× CPU throttle): 58.3 fps, frame p95 17.2 ms / p99 33 ms, sim step p95 8.3 ms (was 4.9; the per-wheel solver, noted in the backlog, budget is 12), 80 draw calls, 15k tris, 20 MB heap, 0 bot resets.

### Decided and why

- The drift controller commands the **angle**, not the yaw rate: with a keyboard the stick position is the only analogue the player has, and "full lock = 35°, centre = straight, counter = swap sides" is learnable in one try. Auto counter-steer keeps the fronts rolling along the velocity, which is both what a drifting car looks like and why the drift no longer scrubs 15 km/h per second.
- Wheel rotation is solved, not integrated (decision record 7 in ARCHITECTURE).
- Top-speed tests wrap the car back 500 m on the straight instead of extending the playground, because the asymptotic approach to Vmax takes longer than the kilometre.

### Next

- M2 The city, straight away (Marcin's instruction): procedural generation, chunk streaming, road graph with lanes, minimap, districts, fog and draw distance, first quality tiers. Gate: budgets hold with the bot driving the whole map.

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
