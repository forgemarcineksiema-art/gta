# Backlog

Ideas outside the current milestone, non-blocking bugs, refactors. One line of context each. Nothing here is scheduled.

## Performance / size

- Rapier `-compat` inlines the WASM as base64 (~2.7 MB vs ~2.0 MB raw). If startup bytes ever approach the 8 MB target, switch to the bundler build with `vite-plugin-wasm` and keep `-compat` only for Vitest. (M0)
- `RigidBody.translation()/rotation()` calls allocate per body per step in the JS bindings; fine for tens of bodies, revisit if traffic ever uses many rigid bodies (M3 plans kinematic traffic). (M0)
- Headless Chromium (software GL) renders the playground at a few fps; the perf run is a CPU-side signal only, as the brief expects. Real GPU numbers need `npm run perf:headed` on Marcin's machines. (M0)

## Vehicle / feel

- Tyre model has no load sensitivity curve (grip scales linearly with load); the anti-roll bar does the load transfer work. Good enough for arcade. (M1)
- Wheel visuals use body pose + spring compression; no camber/toe. (M1)
- Open differential only (equal torque split); a limited-slip knob would let one-wheel-peel be tuned away or in. (M1 physics pass)
- Engine rpm has no separate state when the clutch would slip (a launch from standstill reads as idle until the wheels turn); a clutch model would add launch revving. (M1 physics pass)
- Sim step p95 rose from 4.9 to 8.3 ms under 4× CPU throttle with the per-wheel solver (budget 12 ms). Most of it is Rapier binding overhead (`castRayAndGetNormal`, `velocityAtPoint`); worth a look before traffic adds bodies in M3. (M1 physics pass)

## Rendering

- Speed streaks are 1 px lines (WebGL line width); stretched quads would let them get thicker near the camera. (M1 polish)

## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
