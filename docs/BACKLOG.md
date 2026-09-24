# Backlog

Ideas outside the current milestone, non-blocking bugs, refactors. One line of context each. A milestone's plan takes what it schedules from here; what shipped is removed (M5.5 shipped updates 1 and 2, the life models and the polish items, 2026-09-23).

## Performance / size

- The quick `verify` runs about 95 s of tests (M5.5 gate; CLAUDE.md asks under a minute): the jobs, the traffic and the police pins grew with the slices. Next: move the pins over ~5 s each into the long set, as M5.1 did.
- M5.5 against M5.1 under 4× CPU: fps 51–53 against 56–57 at an equal frame p95 (33.4 ms), the traffic step's mean 1.9 → 3.0 ms (the signals, the parked cars, the drivers), time to control 3.8–4.3 s against 3.3–3.4 (budget 6 s). The traffic's per-record scans are the first lever.

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

- The two streets the parkway runs beside have no stop line at its junctions (no room between the merge and the
  crossing street); the parkway itself gives way at the merge since M7. (M2.2)
- The spill's twelve coins appear on the lane in one step; a scatter from the
  wreck to their spots over half a second (the fly pool run backwards) would
  make the burst read as one. Render only. (2026-09-23)
- The big map (M5.5 slice 15) draws roads, district tints and landmarks but no
  lots, parks or water: `City.generate` emits render descriptors only. A small
  `cityFootprints()` export (park rects, block outlines, the promenade and
  piers) would let it show blocks the way the radar shows roads. (M2)

## Rendering

- The heap went 48 → 58 MB at the M6 gate (budget 250), not profiled. The likely part: the traffic builds an instanced mesh per body at load, all 28 (M6 added 14 bodies, most never spawned); building one the first time its body spawns would tell and save.

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

- Traffic lights run the nine downtown crossings (M5.5 slice 17); the other junctions keep first come first served with the forced override after 9 s (about one a minute in a busy run), where a round-robin would look more deliberate. (M3)
- A driving traffic body has no terrain contact (kerbs and the pavement apron pass under it) and a disturbed car beyond 70 m snaps back onto its lane when its body is returned; nobody has seen either in play, but a slow blend back would be cleaner than a snap. (M3)
- The interior billboards are footway gates approached diagonally off the road; the frontage row leaves no run-out behind a roadside panel. Park lots and plazas could take roadside panels with a run-out once the lot generator exposes its open ground. (M3)

## UI

- Keycap labels resolve through `navigator.keyboard.getLayoutMap()` only on Chromium; other browsers show `W/A/S/D` positions, which is what the brief asks for anyway. (M0)
- North-up option for the radar once settings exist; some players prefer a map
  that never turns. `advance()` with a fixed target heading is the whole change.
  (with a settings page; the big map is north-up already)

## Run structure and heat (M4 candidates beyond the slice plan; docs/DESIGN.md)

- The balance model at the M6 gate: (a) is red too, the skilled optimum at L2 under the novice's L3; both bots' bank a run is flat across the levels (novice 5.3–5.6k, skilled 3.9–5.7k), so the argmax moves with the traffic's moment (the skilled bot's captures at L3 and L5 at seed 7 went 0 → 1.00 and 0 → 0.67 a minute when M6 reserved the rivals' and the hidden cars' bays). Whether the heat multiplier pays enough for the capture risk is a design question for Marcin's first hour, not a bot's.
- The balance model's novice (M5.5 gate): the road bot waits in queues at the downtown lights with units behind it and is busted even at level 1 (once in three minutes at every seed), so the model's novice run is 2.4 minutes and the first hour's assertions (b) and (c) are red (the first car at minute 3.9, one gap 2.4 minutes) while the income a minute is on DESIGN §3.3's target. A novice proxy that drives round a queue without ramming (the careful bot's overtake while chased turned it into a rammer: bag 4,079 a minute) would measure a player; until then Marcin's first hour judges `BALANCE.prices.compact` and tier 1 (over 13.6k keeps every gap over three minutes at these runs).
- The police catch the novice bot less at level 4 than at levels 2 and 3 at all three seeds (0.22 against 0.78 and 0.44 a minute): heat 4–5 thin the traffic to 60 %, so fewer queues trap it. A player's level 4 decides whether the heavies and the helicopter need more bite.
- A unit's junction curves are the traffic's; tighter ones would read as police driving (M5.5 slice 4, cosmetic).
- Race #23 at seed 42: the test bot resets in a loop at the city spawn by the signalled centre, so its measurement fails there; the bot's limit, not the race's (M5.5 gate).

- The bot policies stop in front of a roadblock's cars and get boxed; a bot that aims for the sawhorse (or around) would make the level-3 busted rate a player's. (M4 slice 6)
- Pier-end jumps (DESIGN.md §6.1 names them): the quay has no clear 60 m run-out off a pier; the twenty ramps are on the park strip. (M4 slice 6)
- Multi-storey car park as a helicopter cover set piece: ramps, per-floor colliders, and a chase camera at 2.4 m plus look height inside 3 m ceilings; the camera alone is a week. (v1.1)

## The wanted board and the kit (M6)

- A rival cruising their turf before their duel is ready, a teaser seen in traffic (the plan left it to the playtest).
- The day's pick as the rewarded offer (free for a video, the half price as the equal alternative): M8 slice 4 (`docs/M8_PLAN.md`).
- The sweeper's brushes spin and the lowrider's hop reaches the traffic's other lowriders only when the rival waits: render polish.
- SELL / KEEP at a fence was dropped in M6 slice 0 (a fence has no wall; the order pays there and the car can still be kept at a door).
- The standoff (M5.5 gate) with a car near the player: nose to nose, it pulls toward its own kerb even when the player stands on that side (seen at the M6 gate, the player mid U-turn in a junction), and a car that is not moving cannot steer aside; it should go round on the side away from the player.

## Activities and progression (M5; docs/DESIGN.md §3–4, §7–8)

- Order-free checkpoint races (Midnight Club) and road rules (a best time and best damage per street, Burnout Paradise): the rivals and the medals of M5.5's races and trials carry them. (post-launch)
- Derby in a park lot: eight cars from the body pool, last one rolling, takedowns for cash. (v1.1)
- Crash mode: after a wreck, bounce it along the street with boost taps for cash; the player keeps control so the 2 s rule holds. (v1.1)
- Cop mode: "the suspect is a red muscle car", catch and stop it; the descriptor and pursuit systems from the other side. The first post-launch update; the Interceptor unlock is its trailer. (post-launch)
- Asynchronous rivals (a friend's ghost on a road) and cops-vs-robbers multiplayer: a backend and netcode; the fixed step is all that is designed for them now. (v2)

## City v2 (after the M4 run loop works; docs/DESIGN.md §5–6)

- Drop-off approaches with a second, longer way in (the lit signs over the streets shipped in M7). (M4/M5)
- The music bed (M5 slice 8): one CC0 loop fetched after `gameplayStart()` through the master gain at -14 dB; needs Marcin's yes on the exact file, source and licence before anything is downloaded (docs/ASSETS.md).
- The naive hunter (`order.long.test.ts`) loses the wanted car where its re-plan routes through a U-turn (M5.5 gate: orders #10 and #16 not reached in 240 s, 4 of 6): a hunter aiming at the car's next junction would make the order e2e and the measurement faster.
