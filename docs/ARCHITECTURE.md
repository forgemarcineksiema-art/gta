# Architecture

Short and current. Decision records at the bottom; add one when a decision would surprise a newcomer.

## Layout

```
index.html            entry page: one canvas, one UI root, a loading overlay
src/main.ts           boots App
src/app/              App (glue), loop.ts (fixed-step accumulator), bot.ts (autopilot), perf.ts (probe)
src/sim/              headless simulation: SimWorld, Vehicle, playground, transforms, palette, math
src/render/           Three.js: Renderer, ChaseCamera (look-ahead, reverse orbit, shake), SpeedLines, Sparks, carMesh, carProfiles
src/audio/            EngineAudio (WebAudio synthesis)
src/ui/               Hud, DebugPanel, styles.css
src/input/            actions, InputManager, KeyboardDevice
src/platform/         Platform interface, LocalPlatform, createPlatform()
tests/sim/            Vitest headless sim tests (handling, cars, walls, instrumentation, loop)
tests/render/         Vitest camera pins (three.js math in Node, no WebGL)
e2e/                  Playwright: smoke, perf, screens
tools/                verify.mjs, budget.mjs
docs/                 BRIEF, PROGRESS, ARCHITECTURE, BACKLOG, CRAZYGAMES, STYLE, TITLES, ASSETS
```

## Data flow per frame

```
requestAnimationFrame
  InputManager.update()              devices -> ActionState (values + edges)
  FixedStepLoop.advance(dt)          0..5 fixed steps of 1/60 s
    controls <- ActionState | Bot    app copies actions into sim.controls
    SimWorld.step()                  transforms.swap(); vehicle.update(); rapier.step(); write transforms
  Renderer.render(alpha)             interpolate prev/curr transforms, chase camera, draw
  EngineAudio.update(telemetry)      RPM/load/speed/slip -> oscillators, filters, gains
  Hud.update(sim)                    DOM text/transform updates, throttled debug block
```

The sim never sees wall time. `SimWorld.transforms` is a `TransformBuffer` (typed arrays, prev + curr) that the renderer reads directly; the sim publishes `StaticDesc[]` and `DynamicDesc[]` once so the renderer can build meshes without knowing physics.

## Layering rules (lint-enforced in `eslint.config.js`, DOM-free `tsconfig.sim.json`)

| From | May import |
|---|---|
| `sim` | `sim`, `@dimforge/rapier3d-compat` |
| `input` | `input` |
| `platform` | `platform` |
| `render` | `render`, `sim`, `three` |
| `audio`, `ui` | self, `sim` |
| `app` | everything |

`render/audio/ui` read sim state and never write it (convention: they receive `SimWorld` and only read `telemetry`, `transforms`, descriptors).

## Runtime dependencies (each costs bytes)

| Package | Uncompressed in build | Why |
|---|---|---|
| `three` 0.186 | ~0.51 MB (tree-shaken) | The renderer. WebGL2 only; no WebGPU for Chromebooks/Safari. Only core + `BufferGeometryUtils` addon. |
| `@dimforge/rapier3d-compat` 0.20 | ~2.72 MB (WASM inlined as base64) | Rigid bodies, raycasts, collisions. The `-compat` build embeds the WASM so it works in Vite without plugins **and in Node for headless tests** (the non-compat build needs a bundler-resolved `.wasm` import). Cost: ~0.7 MB over a raw `.wasm`. Revisit if startup bytes ever get tight (docs/BACKLOG.md). |

No UI framework, no ECS, no state library, no audio library, no font files.

## Dev dependencies of note

TypeScript 5.9 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vite 8 (Rolldown), Vitest 5, Playwright 1.63 (Chromium only), ESLint 10 + typescript-eslint + eslint-plugin-boundaries.

## Vehicle model (M1)

`src/sim/vehicle/Vehicle.ts`, all numbers in `tuning.ts`. Frame: +Z forward, +Y up, **+X is the car's left** (right-handed); a positive yaw turns the nose left, so "steer right" is `-steer` about +Y. Layers, physical to arcade:

- **Chassis.** One dynamic Rapier body (cuboid collider, explicit mass properties with a low centre of mass, CCD on, never sleeps). `applyTuning()` rebuilds the collider and wheel positions live from the dev panel.
- **Suspension.** Four raycasts (`castRayAndGetNormal`, own body excluded): spring + separate compression/rebound damping + bump stop + anti-roll coupling per axle. Force at the attach point along body-up.
- **Engine and drivetrain.** Torque curve over rpm (five points), five automatic gears plus reverse (engaged with the brake from a standstill), final drive, efficiency, rev limiter, engine braking, torque cut during shifts. Engine rpm follows the driven wheels' angular velocity (idle as the floor), so the audio note and the acceleration character come from the same numbers.
- **Wheels.** Each wheel carries its own angular velocity. Per substep (2 per fixed step) the rotation is solved in closed form against the slip-ratio tyre force: `I (ω − ω₀)/h = T − r·F(κ(ω))`. In the linear region of F the solution is exact and unconditionally stable; past the peak the plateau solution is used; if the two disagree the answer sits on the boundary. Burnouts, wheelspin at launch and brake lock-ups emerge without a stiff ODE blowing up at 60 Hz.
- **Tyres.** Lateral force from the slip angle: linear to `slipAngPeakDeg`, decaying to `slipAngTail`; longitudinal from the slip ratio with the same shape (`slipRatioPeak`, `slipRatioTail`); a friction circle caps the combination at `mu · load`; an impulse clamp (`m/4 · 0.6 · |vLat| / dt`) stops slow manoeuvres from chattering; rolling resistance per N of load. Forces applied above the contact patch (`tireForceHeight`) to keep body roll arcade-flat.
- **Steering.** Speed-sensitive lock (`maxSteerDegLow` → `High` by `steerSpeedRef`), rate-limited with a faster return, Ackermann inner/outer angles.
- **Assists (each a number).** `tractionControl` eases the drive torque when the driven wheels spin past 1.5× the peak slip ratio; `abs` releases the pedal brake on a locking wheel (the handbrake is exempt and locks the rears); `restDamping` kills creep below 0.5 m/s with no input.
- **Drift state (arcade layer, `driftAssist` scales it).** Entered by the handbrake at speed or by rear slip > `driftEnterDeg`; cannot end before `driftMinTime`; ends when rear slip < `driftExitDeg` with the handbrake released (a lifted inner wheel does not end it). While drifting: rear/front grip multipliers blended back at `gripBlendRate`; the **stick commands the drift angle** (`driftMaxAngleDeg` at full lock, centre straightens, counter-steer swaps sides) through a PD controller on the body slip angle; the front wheels **auto counter-steer** along the velocity (`driftAutoCounterSteer`) so they roll instead of scrubbing; the velocity vector is pulled toward the nose (`driftVelocityFollow`, capped); `driftSpeedLoss` scrubs with the sine of the angle; `driftThrottlePush` adds what the spinning rears cannot.
- **Aero and gravity.** Quadratic drag (sets the top speed against the engine), quadratic downforce when grounded, `extraGravity` on the car only for snappier jumps.
- **Air.** Throttle lifts the nose, brake drops it, steer rolls; a levelling torque toward world-up plus angular damping always act, so ramps land on the wheels.
- **Recovery.** Roof-down and stopped for `flipRecoverySeconds` → righted in place; fall below y = −25 → respawn; `reset` → nearest spawn point.
- **Walls (arcade layer over Rapier contacts).** The chassis reads its contact manifolds back each step: summed normal impulse (`telemetry.impact`), point, normal, `scrape`, `contactSide`. The chassis is slippery against walls (friction 0.15, Min rule) and bounces a little (restitution 0.2, Multiply rule; walls and buildings carry restitution 1.0, props 0). Props override with their own rules so their contact numbers stay what they were (friction 0.55 Max, restitution 0.6 Multiply); a static that should behave like a wall in the city needs `GROUPS_SOLID` and restitution 1.0, as `playground.addBox` does for tag `wall`. On a hit most of the body spin is dropped; while sliding along a wall a yaw controller scaled by the yaw inertia turns the nose toward the direction of travel and persists through the bounce; nearly stopped, throttle + steer peels the car off to the steered side. Numbers `wall*` in `tuning.ts`.
- **Boost.** Meter drained by `boostDrain`, refilled by drifting and airtime (near misses and takedowns come in M3); multiplies engine torque and adds `boostThrust` along the nose while grounded.

Pinned by `tests/sim/handling.test.ts` (29 tests; `cars.test.ts` repeats the class pins and the bot lap window per car, `walls.test.ts` pins wall hits per class): no creep at rest, 0–100 in 4.2–5.8 s, launch slip within traction-control bounds, gears in order with rpm between idle and the limiter, plateau top speeds 160–180 / 220–240 km/h, braking 22–42 m from 100 with the fronts never fully locked, reverse capped, handbrake locks the rears without turning the car, drift band 18–42° with visible counter-steer and speed kept, half steer gives a smaller angle, centring straightens within a second, kerb clip and steer taps at 150 km/h stay composed, ramps land and settle, flip recovery, reset, live mass change.

## Instrumentation (M1)

- `sim/recorder.ts`: per-step controls, pose and telemetry in typed arrays; JSON round trip; `controlsAt` replays a run on a fresh world (the sim is deterministic).
- `sim/track.ts`: the test track (closed Catmull-Rom loop sampled every 3 m with curvature), gates and `LapTimer`; `SimWorld` keeps the best lap's pose stream and serves `ghostPose()` to the renderer.
- `app/trackBot.ts`: pure pursuit + curvature speed plan; the benchmark driver and the seed of the city road bot.
- `ui/telemetryGraph.ts`: 10 s scrolling traces in the dev panel.
- `sim/vehicle/presets.ts` + `render/carProfiles.ts`: vehicle classes as tuning overrides and loft profiles under one id; `tests/sim/cars.test.ts` pins each class.

## Platform adapter

`Platform` (`src/platform/Platform.ts`): init/info, loading + gameplay brackets, `happyTime`, `adsAvailable`, `requestAd` (typed `AdResult`, never rejects), `onAdEvent` (mute hook), `hasAdblock`, save/load/clear. `LocalPlatform` simulates ads with a DOM overlay and can force every SDK error code from the URL (`?ad=error&adError=adblock`, `?ad=off`, `?adblock=1`). `CrazyGamesPlatform` arrives in M6.

## Verification

`npm run verify` = typecheck (app + DOM-free sim), lint, Vitest, build, smoke (Playwright: loads, gameplay-start fires once, bot drives 20 s of sim time, no console errors, records startup bytes), budget. `npm run perf` runs the bot 60 s under 4× CPU throttle and writes `perf/latest.json` with regression warnings vs `perf/previous.json`. `npm run screens` captures HUD and pause at the ten required viewport sizes into `screens/`.

## Decision records

1. **Rapier `-compat` over the bundler build** (M0). Headless Node tests and zero build plugins outweigh ~0.7 MB of base64. Revisit only if the startup budget bites.
2. **Custom raycast car over Rapier's built-in vehicle controller** (M1). The built-in controller gives no drift state, no slip curve, no arcade assists; the feel targets in the brief need all three. Writing it also keeps every number in one `VehicleTuning`.
3. **Drift as a controlled state on top of physical tyres** (M1). Emergent handbrake slides either spun out or scrubbed all speed. The stick commands the drift angle and the fronts counter-steer automatically; the physical tyre model stays underneath and every assist is a number that can be set to 0.
7. **Wheel rotation solved, not integrated** (M1 physics pass). A wheel's inertia is tiny next to the tyre's stiffness, so explicit or semi-implicit integration at 60 Hz oscillated between lock and spin. Solving the per-substep equilibrium in closed form (linear region exact, plateau otherwise) is stable at any speed including standstill, which is what makes wheelspin and lock-ups usable rather than chaotic.
9. **The chassis does not collide with terrain while upright** (M1 feel pass 3, `src/sim/collision.ts`). The suspension rays carry the car over kerbs and ramp kinks; a body scraping a 26° lip stole 14 km/h in one step and read as a wall. The terrain group is switched on only when the car is on its side or roof so it can rest there until it rights itself.
11. **Wall hits are shaped, not simulated** (M1, session 6). Realistic corner friction turns a 45° wall hit into a pivot that leaves the car nose-in and stopped, and a 60° hit into a spin that ends facing backwards; both read as the wall "grabbing" the car. The contacts stay physical (Rapier resolves penetration and the impulse), but the chassis is slippery, most of the spin from the hit is dropped, and a yaw controller turns the nose along the direction of travel while the car slides, so every hit under 80° comes out pointing where it is going with speed in proportion to the angle. The player always keeps a way out: a stopped car peels off with throttle and steer.
10. **Landings keep momentum** (M1 feel pass 3). Vertical speed is mostly absorbed at touchdown and 92% of the total speed is redirected along the ground; a kink in the road redirects with no loss. Physical landings cost too much speed for an arcade loop where jumps are rewards.
8. **Speed streaks are world-anchored motes** (M1 polish). Screen-space lines around the camera looked generic; motes that sit in the world and smear along the car's velocity parallax correctly, streak sideways in a drift and leave the centre of the screen clear.
4. **Fixed 60 Hz step, max 5 substeps, drop the rest** (M0). Required by CrazyGames (same behaviour at 144/165 Hz) and by the tests; dropping time on a hitch is better than a spiral.
5. **Vertex-colour merged statics** (M0). One draw call for the whole playground; the same approach scales to per-chunk meshes in M2.
6. **No web fonts** (M0). System heavy italic is enough for the look, costs zero bytes, and avoids licence questions.
