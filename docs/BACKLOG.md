# Backlog

Ideas outside the current milestone, non-blocking bugs, refactors. One line of context each. Nothing here is scheduled.

## Performance / size

- M2 frame pacing: p95 gates pass, but real-time runs on MX330 under CPU ×4 had
  isolated 167–767 ms frame intervals. An instrumented run measured max render
  58.5 ms (no stream event), max upload-containing render 28.9 ms, and streamed
  physics step 13.9 ms. Investigate browser/GPU scheduling and system contention
  with a trace; do not attribute the long gaps to streaming without evidence.

- Rapier `-compat` inlines the WASM as base64 (~2.7 MB vs ~2.0 MB raw). If startup bytes ever approach the 8 MB target, switch to the bundler build with `vite-plugin-wasm` and keep `-compat` only for Vitest. (M0)
- `RigidBody.translation()/rotation()` calls allocate per body per step in the JS bindings; fine for tens of bodies, revisit if traffic ever uses many rigid bodies (M3 plans kinematic traffic). (M0)
- Headless Chromium (software GL) renders the playground at a few fps; the perf run is a CPU-side signal only, as the brief expects. Real GPU numbers need `npm run perf:headed` on Marcin's machines. (M0)

## Vehicle / feel

- Wheel visuals use body pose + spring compression; no camber/toe. (M1)
- No clutch model (decided with Marcin: an automatic arcade car does not need one; launch revving, if ever wanted, is an audio effect). (M1)
- The track bot plans each class with a hand-set lateral budget (`TRACK_BOT_BY_CAR`); deriving it from mu, mass and downforce would make new classes self-tuning. (M1)
- Sim step measured in Node at 0.24 ms (0.14 vehicle, 0.06 Rapier, 0.03 rest) after moving per-wheel force/velocity math into JS; the throttled browser p95 was multi-substep frames, not the step. Rays cost 4 × 7.7 µs; not worth more work before M3. (M1)

## City / world

- Frontage rows use three variants per road kind; a long avenue still shows the
  rhythm. Corner buildings at authored junctions and shops turning the corner
  would break it. (M2.2)
- The Works chicane has no frontage by design (yards); stacked containers, tanks
  and a gantry would make it read as a working yard rather than empty paving. (M2.2)
- The landmark silhouettes are only visible along open sightlines (avenues aimed
  at them, the highway, open quarters); street canyons hide them. A subtle
  compass cue in the HUD or on the minimap edge would complete orientation. (M2.2)

## Rendering

- Startup at 20 Mbit + CPU ×4 is 2.7 s to control in a typical run (download
  0.9, physics 0.2, sim 0.4, renderer 0.65, first frame 0.6); a slow run of the
  same build reached 4.6 s with every phase 1.5–2× longer (machine state, not
  code). Next levers if needed: the 9 physics chunk generations in the sim phase,
  shader warm-up before the first frame, chunk generation in a worker. (M2.2)
- Remaining hitch sources at CPU ×4 from the frame probe (`screens/frame-probe.mjs`
  pattern): the start burst (two geometry builds plus a chunk claim plus sim
  catch-up in one frame, 80–120 ms), sim catch-up cascades after any long frame
  (five substeps × 8–10 ms), single render spikes of 60–115 ms with no streaming
  (one at the automatic tier switch, which reallocates the drawing buffer at DPR
  1.5), and V8 scavenges after chunk generation. Chunk generation itself is
  20–40 ms at ×4 and now happens only on new tiles. (M2.2)
- Trees are 4 × 8-segment cylinders (128 triangles) and are a large share of the
  remaining shadow-pass cost; billboards or 6-segment crowns would halve it. (M2.1)


## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
