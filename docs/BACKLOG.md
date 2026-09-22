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

- `roads.lanePath` (the bot's city route) still builds junction curves with fixed 24 m bezier handles, which cusp on right-angle corners; the traffic curves switched to proportional handles (`lanes.ts` `HANDLE_RATIO`). The bot's lookahead smooths the cusp, so changing it means re-pinning the city bot laps. (M3)

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


## Life (M3)

- Slice 9 stretch, not started: parked cars in the kerbside bays of the avenue and the quay as stopped agents (more swap candidates), stunt ramps on park lots, speed cameras on the highway with a FLASHED popup. (M3)
- Traffic-only silhouettes (a van, a taxi, a bus): agents use the three player classes with paint for variety, so every swap yields a real car; new silhouettes need a preset each and a swap rule. (M3)
- The highway's two lanes per direction are sub-lane offsets on one graph lane; real graph lanes would let the bot stop straddling the paint and traffic change lanes on the highway, at the cost of the Euler tour, the markings, the minimap and three pins. (M3)
- Traffic density per quality tier for the mobile tier: the pool size is one tuning number (`TRAFFIC.agents`); M2's decision 13 keeps gameplay identical across tiers until M6 needs the lever. (M3)
- Junction reservations are first come first served with a forced override after 9 s (about one a minute in a busy run); traffic lights or a round-robin would look more deliberate at the big crossings. (M3)
- A driving traffic body has no terrain contact (kerbs and the pavement apron pass under it) and a disturbed car beyond 70 m snaps back onto its lane when its body is returned; nobody has seen either in play, but a slow blend back would be cleaner than a snap. (M3)
- The takedown camera only focuses; a short cut to a side view with the wreck in the foreground would sell it more. The whip on swap has no cut either, by design. (M3)
- Pedestrian variety: one walker mesh in a handful of tints; a second silhouette and a walk-cycle pose would help once perf budgets are known on the low tier. (M3)
- Billboard state is per session; the M5 save carries `Collectibles.smashed`. (M3)
- The interior billboards are footway gates approached diagonally off the road; the frontage row leaves no run-out behind a roadside panel. Park lots and plazas could take roadside panels with a run-out once the lot generator exposes its open ground. (M3)
- `Traffic.step` is about 0.3 ms in Node per step with 48 agents and 16 bodies; the browser step p95 under 4× throttle is multi-substep frames again, not the step. Profile before adding agents. (M3)

## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
- Full-screen city map for M5 activities: the radar painter already draws any
  centre, scale and rotation, so a north-up whole-island view with activity
  markers is a second instance behind a hold key, not a new renderer. (M2)
- North-up option for the radar once settings exist; some players prefer a map
  that never turns. `advance()` with a fixed target heading is the whole change. (M5)
- Touch layout (M6) moves the radar to the top-left, where GTA-style mobile HUDs
  keep it clear of the virtual stick and pedals: one CSS rule on `.minimap`. (M6)

## Run structure and heat (M4 candidates beyond the slice plan; docs/DESIGN.md)

- Update 1, "the air" (decided 2026-09-22, `docs/DESIGN.md` §5): covered streets with the camera occlusion rule, the highway overpasses, the helicopter with its spotlight. Left M4 so the game reaches Basic Launch with heat 4–5 on the ground; the contracts are §5 of `docs/M4_PLAN.md`. (update 1)
- Pursuit breakers: smashable props that drop a static onto the road behind the player (scaffold, water tower, petrol canopy); police crash or reroute; doubles as cover. Billboard machinery plus a dropped static and a police reroute. (M4 stretch)
- Multi-storey car park as a helicopter cover set piece: ramps, per-floor colliders, and a chase camera at 2.4 m plus look height inside 3 m ceilings; the camera alone is a week. (v1.1)
- The comic arrest: the busted bar drawn as an officer walking up with a ticket book; one pedestrian pose. (M4 polish)
- Heat-scaled sirens and a radio chatter layer under the engine, both synthesized; the helicopter's rotor as a low-pass on everything when it is overhead. (M4 audio)

## Activities and progression (M5; docs/DESIGN.md §3–4, §7–8)

- Launch scope (decided 2026-09-22, `docs/DESIGN.md` §11): M5 ships the cold open, save, the garage and three jobs (getaway delivery, time trial on a coin line, pursuit escape), dailies and the streak if they fit. Update 2, "the jobs": street races with rivals, takedown rage and mayhem, fares with hot passengers, the stunt and collectible hunts, the skill chain, the full map. (update 2)
- Order-free checkpoint races (Midnight Club) and road rules (a best time and best damage per street, Burnout Paradise): the same rival and recorder tech as the two race types that ship first. (M5 stretch)
- Hidden cars: a stashed car somewhere in the city that a swap unlocks (the ice-cream truck). (M5)
- A giant ball in a plaza, one dynamic sphere to push around; a free-roam toy that costs nothing. (M5)
- Body crumple by vertex displacement on the low-poly car mesh, render only; thumbnail value. (M5 polish)
- Derby in a park lot: eight cars from the body pool, last one rolling, takedowns for cash. (v1.1)
- Crash mode: after a wreck, bounce it along the street with boost taps for cash; the player keeps control so the 2 s rule holds. (v1.1)
- Cop mode: "the suspect is a red muscle car", catch and stop it; the descriptor and pursuit systems from the other side. The first post-launch update; the Interceptor unlock is its trailer. (post-launch)
- Asynchronous rivals (a friend's ghost on a road) and cops-vs-robbers multiplayer: a backend and netcode; the fixed step is all that is designed for them now. (v2)

## City v2 (after the M4 run loop works; docs/DESIGN.md §5–6)

- Highway overpasses at the four avenue crossings: a third dimension in the road graph (lane height, kinematic traffic at height, the bot route, road meshes, markings, the minimap, the city pins). Moved from M4 to update 1 on 2026-09-22; the contract is §5 of `docs/M4_PLAN.md`. (update 1)
- Chokepoint and cover sites exported by the generator (the four on-ramps, the tower junction, one covered street per district) so roadblocks and the map read from data, not from hand-placed coordinates. (M4)
- A lit hideout sign visible from the highway; drop-off approaches with a second, longer way in. (M4/M5)
