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

- Frontage rows now vary width and variant by index and fill the corners, but a
  long avenue still reads as generated; shops turning the corner and one
  authored "special" building per avenue would break the rhythm for good. (M2.2)
- The highway is painted as two lanes each way (lane dashes at 8 m from the
  centre); its lane graph still has one lane per direction at 6 m. When M3
  traffic arrives, move the highway lanes to 4 and 12 m so cars sit in the
  painted lanes and the bot no longer straddles the inner one. (M2.2)
- The parkway joins its junctions tangentially, so its crossing and stop line
  are 112 m from the node, where the road has finally separated from the
  street; a give-way line at the actual merge would say more to the player.
  The two streets it runs beside have no stop line at that end at all. (M2.2)
- Paint is flat colour with one wear tone; no re-painted patches, no per-block
  wear variation. Cheap to add as a second `paint` underlay once the flicker
  capture shows it does not shimmer. (M2.2)
- The minimap has no lot, park or water data to draw: `City.generate` emits
  render descriptors only. A small `cityFootprints()` export (park rects, block
  outlines, the promenade and piers) would let a full-screen map show blocks
  the way the radar shows roads. (M2)

## Rendering

- Startup at 20 Mbit + CPU ×4 is 2.7 s to control in a typical run (download
  0.9, physics 0.2, sim 0.4, renderer 0.65, first frame 0.6); a slow run of the
  same build reached 4.6 s with every phase 1.5–2× longer (machine state, not
  code). Next levers if needed: the 9 physics chunk generations in the sim phase,
  shader warm-up before the first frame, chunk generation in a worker. (M2.2)
- Remaining hitch sources at CPU ×4 on the headed Intel path: outer-ring chunk
  generations in the first second after control (55–95 ms frames while the
  simulation catches up), GC pauses of 20–30 ms after heap peaks (about 2.5 MB/s
  of garbage: three.js uniform setters, vehicle update, Rapier ray hits), the
  automatic tier switch (drawing buffer reallocation at DPR 1.5). Generating
  chunks in a worker, or the outer ring during boot, is the next lever. (M2.2)
- The main thread needs about 10 ms of real CPU per frame; at CPU ×4 that is
  the 33 ms vsync step for p95. Reaching 60 fps at ×4 would need the draw
  submission (Intel driver) and the 60 Hz simulation both roughly halved. (M2.2)
- Trees are 4 × 8-segment cylinders (128 triangles) and are a large share of the
  remaining shadow-pass cost; billboards or 6-segment crowns would halve it. (M2.1)


## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
- Full-screen city map for M5 activities: the radar painter already draws any
  centre, scale and rotation, so a north-up whole-island view with activity
  markers is a second instance behind a hold key, not a new renderer. (M2)
- North-up option for the radar once settings exist; some players prefer a map
  that never turns. `advance()` with a fixed target heading is the whole change. (M5)
- Touch layout (M6) moves the radar to the top-left, where GTA-style mobile HUDs
  keep it clear of the virtual stick and pedals: one CSS rule on `.minimap`. (M6)
