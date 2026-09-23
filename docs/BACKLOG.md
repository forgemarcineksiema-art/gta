# Backlog

Ideas outside the current milestone, non-blocking bugs, refactors. One line of context each. Nothing here is scheduled.

## Performance / size

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
- The parkway joins its junctions tangentially, so its crossing and stop line
  are 112 m from the node, where the road has finally separated from the
  street; a give-way line at the actual merge would say more to the player.
  The two streets it runs beside have no stop line at that end at all. (M2.2)
- Paint is flat colour with one wear tone; no re-painted patches, no per-block
  wear variation. Cheap to add as a second `paint` underlay once the flicker
  capture shows it does not shimmer. (M2.2)
- (Superseded 2026-09-23 by DESIGN.md §13.5: the trails are deleted; coins lie only at goals and along a job's route.)
- The spill's twelve coins appear on the lane in one step; a scatter from the
  wreck to their spots over half a second (the fly pool run backwards) would
  make the burst read as one. Render only. (2026-09-23)
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

- Abandoned player cars (a swap leaves one) are never towed and traffic queues behind them for good. Scheduled: M5.5 slice 3's gawk (traffic goes around a stopped car through the oncoming lane when clear). (M4 → M5.5)
- Parked civilian cars in the kerbside bays of the avenue and the quay as stopped agents (more swap candidates); the rest of the M3 stretch (stunt ramps, speed cameras) is M4 slice 6. (M3)
- Traffic-only silhouettes: scheduled, M5.5 slice 19 (eight civilian bodies, DESIGN.md §13.11). (M3 → M5.5)
- Junction reservations are first come first served with a forced override after 9 s (about one a minute in a busy run); traffic lights or a round-robin would look more deliberate at the big crossings. (M3)
- A driving traffic body has no terrain contact (kerbs and the pavement apron pass under it) and a disturbed car beyond 70 m snaps back onto its lane when its body is returned; nobody has seen either in play, but a slow blend back would be cleaner than a snap. (M3)
- The takedown camera only focuses; a short cut to a side view with the wreck in the foreground would sell it more. The whip on swap has no cut either, by design. (M3)
- Pedestrian variety: scheduled, M5.5 slice 20 (four silhouettes with a walk cycle, DESIGN.md §13.11). (M3 → M5.5)
- The interior billboards are footway gates approached diagonally off the road; the frontage row leaves no run-out behind a roadside panel. Park lots and plazas could take roadside panels with a run-out once the lot generator exposes its open ground. (M3)

## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
- Full-screen city map (update 2 in `docs/DESIGN.md` §11): the radar painter
  already draws any centre, scale and rotation, so a north-up whole-island view
  with job markers is a second instance behind a hold key, not a new renderer. (M2)
- North-up option for the radar once settings exist; some players prefer a map
  that never turns. `advance()` with a fixed target heading is the whole change. (unscheduled)

## Run structure and heat (M4 candidates beyond the slice plan; docs/DESIGN.md)

- The officer's ticket book as the busted bar: a pedestrian walking up from the nearest unit while the bar fills (M4 slice 8 polish, skipped for the gate).
- The donut-shop withdrawal: units path to a marker building and park when the pursuit ends (M4 slice 8 polish, skipped).
- The bot policies stop in front of a roadblock's cars and get boxed; a bot that aims for the sawhorse (or around) would make the level-3 busted rate a player's. (M4 slice 6)
- Pier-end jumps (DESIGN.md §6.1 names them): the quay has no clear 60 m run-out off a pier; the twenty ramps are on the park strip. (M4 slice 6)
- Update 1, "the air" (decided 2026-09-22, `docs/DESIGN.md` §5): covered streets with the camera occlusion rule, the highway overpasses, the helicopter with its spotlight. Left M4 so the game reaches Basic Launch with heat 4–5 on the ground; the contracts are §5 of `docs/M4_PLAN.md`. (update 1)
- Pursuit breakers: smashable props that drop a static onto the road behind the player (scaffold, water tower, petrol canopy); police crash or reroute; doubles as cover. Billboard machinery plus a dropped static and a police reroute. (M4 stretch)
- Multi-storey car park as a helicopter cover set piece: ramps, per-floor colliders, and a chase camera at 2.4 m plus look height inside 3 m ceilings; the camera alone is a week. (v1.1)
- The comic arrest: the busted bar drawn as an officer walking up with a ticket book; one pedestrian pose. (M4 polish)
- Heat-scaled sirens and the radio as dispatch lines: scheduled, M5.5 slice 4 (DESIGN.md §13.9). The helicopter's rotor as a low-pass on everything when it is overhead stays with update 1. (M4 audio → M5.5)

## Activities and progression (M5; docs/DESIGN.md §3–4, §7–8)

- Launch scope (decided 2026-09-22, `docs/DESIGN.md` §11): M5 ships the cold open, save, the garage, three jobs (getaway delivery, steal-to-order, pursuit escape), dailies and the streak (`docs/M5_PLAN.md`). Update 2, "the jobs": the time trial with medals, street races with rivals, takedown rage and mayhem, fares with hot passengers, the stunt and collectible hunts, the skill chain, the full map. (update 2)
- Order-free checkpoint races (Midnight Club) and road rules (a best time and best damage per street, Burnout Paradise): the same rival and recorder tech as the two race types that ship first. (update 2 or later)
- Hidden cars: a stashed car somewhere in the city that a swap unlocks (the ice-cream truck; needs its own profile). (update 2)
- A giant ball in a plaza, one dynamic sphere to push around; a free-roam toy that costs nothing. (unscheduled)
- Body crumple by vertex displacement on the low-poly car mesh, render only; thumbnail value. (polish, unscheduled)
- Derby in a park lot: eight cars from the body pool, last one rolling, takedowns for cash. (v1.1)
- Crash mode: after a wreck, bounce it along the street with boost taps for cash; the player keeps control so the 2 s rule holds. (v1.1)
- Cop mode: "the suspect is a red muscle car", catch and stop it; the descriptor and pursuit systems from the other side. The first post-launch update; the Interceptor unlock is its trailer. (post-launch)
- Asynchronous rivals (a friend's ghost on a road) and cops-vs-robbers multiplayer: a backend and netcode; the fixed step is all that is designed for them now. (v2)

## City v2 (after the M4 run loop works; docs/DESIGN.md §5–6)

- Highway overpasses at the four avenue crossings: a third dimension in the road graph (lane height, kinematic traffic at height, the bot route, road meshes, markings, the minimap, the city pins). Moved from M4 to update 1 on 2026-09-22; the contract is §5 of `docs/M4_PLAN.md`. (update 1)
- A lit hideout sign visible from the highway (the garages have an orange band over the door and a radar glyph); drop-off approaches with a second, longer way in. (M4/M5)
- The garage interior reads empty, not dark (Marcin, 2026-09-23). Scheduled:
  M5.5 slice 5 dresses it (DESIGN.md §13.6). (M4 → M5.5)
- The music bed (M5 slice 8): one CC0 loop fetched after `gameplayStart()` through the master gain at -14 dB; needs Marcin's yes on the exact file, source and licence before anything is downloaded (docs/ASSETS.md).
- The naive hunter (`order.long.test.ts`) loses the wanted car where its re-plan routes through a U-turn: a hunter aiming at the car's next junction would make the order e2e and the measurement faster.
- The wall panel is 660 px wide at every size: scheduled, M5.5 slice 5 (`clamp(640px, 48vw, 960px)`, DESIGN.md §13.6).
