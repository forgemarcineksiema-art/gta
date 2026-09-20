# Backlog

Ideas outside the current milestone, non-blocking bugs, refactors. One line of context each. Nothing here is scheduled.

## Performance / size

- Rapier `-compat` inlines the WASM as base64 (~2.7 MB vs ~2.0 MB raw). If startup bytes ever approach the 8 MB target, switch to the bundler build with `vite-plugin-wasm` and keep `-compat` only for Vitest. (M0)
- `RigidBody.translation()/rotation()` calls allocate per body per step in the JS bindings; fine for tens of bodies, revisit if traffic ever uses many rigid bodies (M3 plans kinematic traffic). (M0)
- Headless Chromium (software GL) renders the playground at a few fps; the perf run is a CPU-side signal only, as the brief expects. Real GPU numbers need `npm run perf:headed` on Marcin's machines. (M0)

## Vehicle / feel

- Drifts scrub ~12 km/h per second at 25° (`driftSpeedLoss`); may want less once boost gain from drifting exists in the loop. (M1)
- Tyre model has no load sensitivity curve; the anti-roll bar does the load transfer work. Good enough for arcade. (M1)
- Wheel visuals use body pose + spring compression; no camber/toe. (M1)
- Reverse camera: the chase camera keeps looking forward while reversing; a rear view when reversing for > 1 s would help parking into markers. (M1)

## Rendering

- Sky dome is fixed at the origin; at ~850 m radius it is fine for the 1.5 km city but should follow the camera in M2 when chunks stream. (M0)
- Shadow map follows the car with a fixed 60 m half-extent; a cascaded or speed-scaled frustum would sharpen near shadows at low speed. (M1)
- Speed streaks are lines; particles with length-by-speed would look richer. (M1)

## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
- The debug panel edits `VehicleTuning` live but changes to mass/inertia/collider dimensions only apply after a reload (the body is built once). (M1)

## Platform

- `LocalPlatform.showOverlay` uses `requestAnimationFrame`, so a simulated ad in a hidden tab waits until the tab is visible. Harmless offline. (M0)
