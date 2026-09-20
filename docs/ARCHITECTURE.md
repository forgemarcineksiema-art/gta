# Architecture

Short and current. Decision records at the bottom; add one when a decision would surprise a newcomer.

## Layout

```
index.html            entry page: one canvas, one UI root, a loading overlay
src/main.ts           boots App
src/app/              App (glue), loop.ts (fixed-step accumulator), bot.ts (autopilot), perf.ts (probe)
src/sim/              headless simulation: SimWorld, Vehicle, playground, transforms, palette, math
src/render/           Three.js: Renderer, ChaseCamera, SpeedStreaks, carMesh
src/audio/            EngineAudio (WebAudio synthesis)
src/ui/               Hud, DebugPanel, styles.css
src/input/            actions, InputManager, KeyboardDevice
src/platform/         Platform interface, LocalPlatform, createPlatform()
tests/sim/            Vitest headless sim tests (handling pins, loop, soak)
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

`src/sim/vehicle/Vehicle.ts`, all numbers in `tuning.ts`.

- One dynamic Rapier body (cuboid collider, explicit mass properties with a low centre of mass, CCD on, never sleeps). Local axes: +Z forward, +X right, +Y up.
- Four raycast suspensions (`castRayAndGetNormal`, own body excluded): spring + separate compression/rebound damping + bump stop + anti-roll coupling per axle. Force applied at the attach point along body-up.
- Tyres: per grounded wheel, contact velocity split into wheel-forward/right on the ground plane. Lateral force = `-vLat * latStiffness * load`, capped by a friction circle `mu * load * slipCurve(slipAngle)` (linear to a peak angle, decaying to a tail, so a sliding tyre grips less). Longitudinal: drive (speed-dependent fall-off toward `maxSpeed`), brake / reverse, engine brake, handbrake (rear), rolling resistance. Forces applied above the contact patch (`tireForceHeight`) to keep body roll arcade-flat.
- Steering: speed-sensitive lock (`maxSteerDegLow` → `High` by `steerSpeedRef`), rate-limited with a faster return, extra lock while drifting.
- Drift state: entered by handbrake at speed or by rear slip > `driftEnterDeg`; cannot end before `driftMinTime`; ends when rear slip < `driftExitDeg` with the handbrake released. While drifting: rear/front grip multipliers (blended back at `gripBlendRate` so grip never snaps), a yaw-rate controller (`steer * driftYawRate` target, gain and torque cap), the velocity vector pulled toward the nose (`driftVelocityFollow`, capped acceleration), a slip-dependent speed scrub, and throttle pushing along the nose. Result: holding steer gives a stable ~25° drift, centring straightens in ~0.3 s.
- Aero: quadratic drag, quadratic downforce when grounded, `extraGravity` on the car only for snappier jumps.
- Air: throttle lifts the nose, brake drops it, steer rolls; a levelling torque toward world-up plus angular damping always act, so ramps land on the wheels.
- Recovery: roof-down and stopped for `flipRecoverySeconds` → righted in place; fall below y = -25 → respawn; `reset` → nearest spawn point.
- Boost: meter drained by `boostDrain`, refilled by drifting and airtime (near misses and takedowns come in M3); multiplies drive force and raises the speed cap.
- Fake gearbox for audio/HUD only (5 gears, RPM interpolated).

## Platform adapter

`Platform` (`src/platform/Platform.ts`): init/info, loading + gameplay brackets, `happyTime`, `adsAvailable`, `requestAd` (typed `AdResult`, never rejects), `onAdEvent` (mute hook), `hasAdblock`, save/load/clear. `LocalPlatform` simulates ads with a DOM overlay and can force every SDK error code from the URL (`?ad=error&adError=adblock`, `?ad=off`, `?adblock=1`). `CrazyGamesPlatform` arrives in M6.

## Verification

`npm run verify` = typecheck (app + DOM-free sim), lint, Vitest, build, smoke (Playwright: loads, gameplay-start fires once, bot drives 20 s of sim time, no console errors, records startup bytes), budget. `npm run perf` runs the bot 60 s under 4× CPU throttle and writes `perf/latest.json` with regression warnings vs `perf/previous.json`. `npm run screens` captures HUD and pause at the ten required viewport sizes into `screens/`.

## Decision records

1. **Rapier `-compat` over the bundler build** (M0). Headless Node tests and zero build plugins outweigh ~0.7 MB of base64. Revisit only if the startup budget bites.
2. **Custom raycast car over Rapier's built-in vehicle controller** (M1). The built-in controller gives no drift state, no slip curve, no arcade assists; the feel targets in the brief need all three. Writing it also keeps every number in one `VehicleTuning`.
3. **Drift as a controlled state, not emergent physics** (M1). Emergent handbrake slides either spun out or scrubbed all speed. A yaw-rate controller plus velocity-follow makes the drift a stable, tunable system that a keyboard can hold.
4. **Fixed 60 Hz step, max 5 substeps, drop the rest** (M0). Required by CrazyGames (same behaviour at 144/165 Hz) and by the tests; dropping time on a hitch is better than a spiral.
5. **Vertex-colour merged statics** (M0). One draw call for the whole playground; the same approach scales to per-chunk meshes in M2.
6. **No web fonts** (M0). System heavy italic is enough for the look, costs zero bytes, and avoids licence questions.
