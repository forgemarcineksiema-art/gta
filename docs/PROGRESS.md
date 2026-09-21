# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-21 — Vehicle model quality pass

Marcin asked for properly finished, good-looking cars that fit the game.

### Done

- Rebuilt all three currently playable classes in the existing flat-shaded,
  texture-free style. Muscle: fuller shoulders, four round headlights, stripes,
  chrome bumper and segmented rear lamps. Compact: cyan paint, dark roof and
  spoiler, four-spoke wheels. Heavy: orange cargo van, framed panels, door splits,
  hinges, sliding rail, taller mirrors and protective mouldings.
- Actual wheel-arch openings and bevelled returns replace black semicircle
  decals. Open tyre profiles expose the recessed rims and spokes; the old rims
  were hidden inside capped tyre cylinders. Wheel placement follows existing
  tuning and retains the four independent steering/suspension/spin transforms.
- Framed opaque glazing with broad reflections; all decals follow the actual
  body triangles. Review caught and fixed glass clipping through nonplanar loft
  faces and distorted side strips at arch cuts. Rear lamps, reversing lamps and
  the compact's high brake lamp react to telemetry through colour buffer updates.
- All rigid fittings merge into the body. Complete cars are five meshes each,
  down from 14/11/11; muscle 6,118 triangles, compact 5,765, heavy 6,404 (previous
  1,616/1,506/1,494). Additional geometry buys the openings and visible wheel
  assemblies. No handling, camera, world, dependency or asset-texture changes.

### Verification

- Baseline `verify`: 92 tests, smoke 59.8 fps / frame p95 16.8 ms on headless
  MX330. Final `verify`: 101 tests, all typecheck/lint/build/smoke/budget gates
  pass; smoke 60.0 fps, p95 16.7 ms, 84 max draws, 162,964 max triangles,
  startup 859 ms (unthrottled), 3.40 MB. These short runs are not an FPS A/B proof.
- Nine render tests cover actual openings on both sides, exposed rim faces,
  finite geometry, five-mesh/7k-triangle budgets and reversible brake/reverse
  updates without replacing geometry or colour buffers.
- `city`: 5/5; control in 1,942 ms at 20 Mbit / CPU x4. Whole 178-lane tours:
  low 61 draws / 162,729 triangles; high 88 / 233,674; zero bot resets. Controls,
  reset, pause and automatic quality tests pass. Existing limits unchanged.
- `perf`: passes, 60 s headless MX330 / CPU x4: 59.4 fps, frame p95/p99 16.8 ms,
  max 83.3 ms, sim-step p95 6.1 ms, 84 max draws, 176k max triangles, 45 MB
  heap, zero bot resets. The script warns against the previous saved run about
  step p95 (3.5 -> 6.1 ms) and heap (40.15 -> 45.20 MB); both remain within
  limits. The sim code is unchanged, but no matched A/B establishes the cause
  of the timing difference. This is not a sustained-performance claim for the
  headed Intel/iGPU path or future multi-car traffic.
- Twelve final in-game views (three classes, normal chase and front/rear/side)
  reviewed against the baseline, zero browser errors. Skill-client acceleration,
  steering/drift, braking and reverse captures also reviewed, on high for coupe
  and compact and low for the van. Local evidence in
  `output/design-review/cars-before/`, `cars-final/`, `cars-drive-v2/`,
  `cars-compact-drive/`, `cars-heavy-drive/`; scratch script `screens/car-review.mjs`.
- Visual review is from the real game lighting and camera, plus close views;
  Marcin's subjective art-direction acceptance remains his playtest.

## 2026-09-21 — Session 12: heading-up radar minimap

Marcin asked for a new minimap designed to best practice. The old one fitted the
whole island into 132–184 px (streets under 2 px) and drew the offset lane paths,
so roads kinked at junctions; it never answered "which turn next".

### Done

- `src/ui/minimapModel.ts` (pure, Node-tested): road layers junction to junction
  plus the five authored centrelines at real width, velocity-heading easing with
  shortest-arc wrap and a 180°/s cap, speed zoom 210–420 m, world-to-screen
  projection, rim clamp along the ray from the player. Four pins in
  `tests/ui/minimap.test.ts` (92 tests total).
- `src/ui/minimap.ts`: circular Canvas 2D radar, bottom-left, `--minimap-size`
  150–240 px. Layers: water, island, district tints, road casing and fills (grid
  ink, highway gold, loop cream), landmark glyphs (tower, tank, glasshouse,
  hotel) that clamp to the rim with a chevron, car arrow rotated by yaw minus
  heading (drifts show the car sideways), rotating N with E/S/W ticks. Cached
  `Path2D` (grid streets merged into 10 whole lines, the highway one closed
  rectangle, authored roads with bounds), only paths within reach stroked, one
  transform per repaint, no per-update allocation, repaint at 30 Hz and only
  while something moved; snaps on `respawned` or an 80 m jump. The circle is
  the CSS `border-radius`, not a canvas `clip()`. `setMarkers()` for M3
  police/traffic and M5 activities.
- `Hud.update` passes `dt` and `now`; the old every-third-frame throttle is gone
  (the canvas is off the DOM layout path).
- Docs: decision 18 in `ARCHITECTURE.md`, minimap rules in `STYLE.md`, backlog
  (compass cue done; full map, north-up option, touch layout, `cityFootprints()`).

### Evidence and boundaries

- `verify` green; `city` 5/5 (district label assertion and district shots);
  `screens` 10/10 reviewed at DPR 1: labels 12 px, the circle clear of the drift
  readout at 800×450.
- Scripted review (manual stepping, DPR 2 crops): straight, turn, spin, reverse,
  two teleports, highway at 131 km/h. Map turns with the velocity, arrow keeps
  the nose, reverse follows the nose, teleports land aligned on the first frame,
  clamped landmarks slide along the rim with the bearing. Canvas pixels sampled:
  island band and blocks are the same fill (a tonal difference in the crop was
  simultaneous contrast against the water and the gold highway).
- Axis check: Coral Hotel (x 490) sits 44 m at +X of the marina spawn, which is
  west, and draws on the left when heading north; matches `+X west` in `App`.
- Cost, measured (headless MX330, CPU ×4, 20 s CPU profiles, old build served
  from a `git archive` of 664e04c on port 4174): the first painter's `paint`
  was 0.9 % of main-thread time (187–200 ms per 20.9 s); merging the grid into
  lines and culling changed nothing measurable, dropping the anti-aliased
  canvas `clip()` for the CSS radius took it to 0.6 % (131 ms), and the new
  build's idle share then matched the old (44.6 % vs 43.9 %). The first
  `npm run perf` on the new code failed the p95 gate by 0.0 ms (33.4000 vs
  33.4, the two-vsync boundary at ×4, as in session 11's first run) at 48.4 fps;
  the first three A/B pairs before the clip change read old 58.8 / 49.9 / 47.3
  vs new 54.1 / 48.6 / 44.9 fps with the machine warming through the run.
  After the clip change, three pairs: old 58.7 / 57.4 / 58.0 vs new
  57.0 / 58.8 / 58.1 fps, p95 16.8 ms on every run; the same in the mean. The
  gate run then passed: 59.0 fps, frame p95/p99/max 16.8/33.3/66.6 ms, step
  p95 3.5 ms, heap 40 MB, 0 bot resets. Nothing here is the headed Intel path;
  `perf:headed` on the laptop remains Marcin's number.

### Decided and why

- Radar over atlas, bottom-left, heading-up by velocity, zoom by speed: see
  decision 18. Bottom-left keeps map, drift readout and speed along the bottom
  edge where the eyes already are; one CSS rule moves it back.
- Reversing follows the car's yaw, not the velocity, so backing up never flips
  the map; a spin-out keeps the velocity heading until the car is truly backwards.
- Time-gated repaint (33 ms) rather than every Nth frame, so a 30 fps machine
  still gets 30 Hz on the map; the dirty check makes a parked car free.

### Next

- Marcin's playtest of the radar (rotation feel, zoom range, size); knobs in
  `MINIMAP`. Then M3 traffic, whose cars go through `setMarkers()`.

## 2026-09-21 — Session 11: performance on the iGPU path

Marcin: he playtests every build himself and reports what feels wrong (noted;
"feel unverified" is never an open problem). Then: performance and smoothness
first with `perf:headed`, A/B comparisons and a prepared machine; city and looks
after.

### Done

- Found that headed Chromium uses the Intel UHD (the brief's iGPU tier) while
  headless uses the MX330. Headed A/B script, headed CPU/allocation/heap probes.
- Main-thread cuts: reset projection at 10 Hz with lane bounds, HUD writes on
  change, minimap at 20 Hz, heap read every 30 frames, chunk descriptor cache,
  claim frames without builds, allocation-free `CityView.sync`, parallel shader
  compile at start, resumable geometry builds (1200 statics per frame), claims
  and slices alternating during the start burst.
- Leak guard re-derived: fixed scene is about 50 geometries, not 40.
- Report: `docs/M2_REPORT.md` § performance pass.

### Evidence and boundaries

- Headed A/B at CPU ×4 (three pairs each stage): M2.1 46–48 fps vs candidate
  51–52 fps after the CPU cuts; p99 50 → 34 ms. `perf:headed` 51.4 fps on final
  code (first run of the day 47.4, failing p95 by 0.0 ms). No throttle: 57–60 fps.
- The machine ran warmer through the day: the M2.1 reference fell to 34–41 fps in
  the last pairs while the candidate stayed 44–51; pairs, not absolute values,
  carry the conclusion.
- Remaining spikes are confined to the first second after control.

### Decided and why

- Keep `npm run perf` headless as the quick regression check and treat
  `perf:headed` as the iGPU reference: they exercise different GPUs.
- Resumable builds over a worker for now: no serialisation, same code path, and
  the largest part now costs at most one slice per frame. A worker remains the
  answer for the chunk generation spikes at start.

### City and looks (same session, after the performance pass)

- Yard props in `Architecture` (container, tank, gantry, fence, mast) placed
  along the service road every 30 m, alternating sides, footprint-checked.
- Frontage starts 8 m past the junction pavement (corner buildings); widths
  vary by index.
- Coral Quay edge: parapet with coping instead of the 4 m seawall, promenade,
  palms, benches, masts. Boundary colliders unchanged.
- Verify, city gate and unit tests green after the pass.

- Marcin's playtest: parking marks shimmered while driving. Cause: decals 1–13 mm
  apart beyond the depth buffer's precision at 100–300 m (near 0.3, far 1700).
  Fix: surface layers at least 12 mm apart, camera near 0.6 m.
- Second report: still shimmering (parking marks, crossings, paving joints), and
  a broken-looking junction. Two real causes found from junction approach shots:
  (1) thin decals aliasing (13 cm marks, 5 cm joints are sub-pixel past 60 m):
  widened to 0.28 / 0.12 m and limited to the near level, crossings become one
  band in the far level; (2) authored-road kerb slabs laid on the grid
  carriageway where a road leaves a junction at a shallow angle, covering half a
  crossing: authored furniture now skips grid street corridors.
- Third report: still shimmering, cornices too. Measured instead of guessed:
  raw canvas frame sequences, static and at 64 km/h, and a flicker map of
  pixels that flip between consecutive frames. Static: zero. Driving: kerb
  lips, far marks, cornices, lamp heads; identical with shadows off and on the
  high tier; MSAA 4× confirmed on the Intel path at 1906×935 with no
  downscaling. Cause: grazing-angle geometry (a flat mark is L·h/d² tall on
  screen). Redesign: parking bays as tone patches, no kerb lips or joints,
  crossings in worn tone near and a faint patch far, cornices 0.44 m, lamp
  heads 0.28 m, low-contrast frames, near level 120 / 150 m. Flicker pixels in
  the same drive 363 → 207, the rest at the fog horizon.
- Fourth report (with screenshots): bays not readable, half a crossing appearing
  late, facade pieces appearing late, unfinished junction corners. Causes and
  fixes: (1) each crossing half sat in a different quadrant part with its own
  detail switch; junction decals now go to the base part. (2) The far level drew
  walls without reveals; both levels keep them (low tour 119k → 154k triangles).
  (3) Corners were perpendicular cuts plus a band starting 24 m out; replaced by
  constructed pavements: a `prism` shape (render fan, convex-hull collider),
  wedge/sliver prisms from the real centreline, exact clip edges for bands and
  strips, chamfered tips, bands as prism quads (no overlapping kerb boxes on
  curves). (4) Bays get an edge line along the road and stronger patches.

### Next

- Marcin's playtest notes on the loop and the yards; then M3 traffic.

## 2026-09-21 — Session 10: M2.2 the loop, the skyline, streaming hygiene

Marcin asked what M2.2 could hold and then to start it. Scope as recommended: a
memorable authored route, recognisability from afar, the car's relation to the
new streets, and the perf hygiene items left by M2.1.

### Done

- **Roads as polylines** (`sim/city/roads.ts`): grid lanes unchanged in effect;
  five authored roads (two diagonals, a chicane, two arcs) join the graph as lane
  pairs. 178 lanes, Euler tour covers all, reset projects onto polylines, minimap
  draws them. `?spawn=loop`.
- **Rotated statics** in the renderer and colliders; `Architecture.rotatedBuilding`.
- **Open quarters** with corridor-cut pavements, lot yielding, road surface, kerbs,
  dashes, trees, lamps and frontage rows (avenue climbing toward the tower, quay
  loggias, parkway houses).
- **Skyline**: taller landmarks (tower, chimney, mast, hotel sign), roof variants,
  a silhouette layer with long-range fog, quay piers with boats. Camera far 1700 m.
- **Streaming hygiene**: one physics chunk per step; render tiles claimed with one
  generation, geometries built one per frame from a queue, both detail levels
  resident and swapped by distance; synchronous loads limited to the ring in front
  of the fog; boot phase timings in `GameHandle.bootTimings`.
- **Gate measurement**: the startup test reads navigation-relative time to the
  first controllable frame and logs the wall clock alongside.
- Docs: `docs/STYLE.md` § Street plan and skyline, `docs/ARCHITECTURE.md`
  decisions 16–17, `docs/M2_REPORT.md` § M2.2, backlog items.

### Evidence and boundaries

- `verify` green, 88 tests. `city` 5/5 on both tiers (low 80 calls / 139k
  triangles, high 106 / 183k; heap 40 / 45 MB; physics residency 18).
- Startup at 20 Mbit + CPU ×4: 2.7 s to control typical, one 4.6 s run with every
  phase 1.5–2× slower; gate run 3.5 s.
- A/B against M2.1 (before the streaming changes), three alternating pairs at
  CPU ×4 low tier: 57.8 / 55.4 / 54.6 vs 52.7 / 55.9 / 54.6 fps. Within noise.
- Two false alarms caught: a hidden game tab in the desktop browser pane made every
  build measure 13–34 fps (closed it, re-measured); the wall-clock startup number
  included 1–3.5 s of browser start-up outside the page (one run 6.6 s wall for
  3.1 s in-page). Neither was a code regression.
- `git worktree remove` deleted through a `node_modules` junction and destroyed
  `node_modules/.bin`; restored with `npm ci`. A/B builds now use `git archive`
  exports and the junction is removed with `rmdir` before the folder.
- Reviewed from the driving camera: every authored road at three points,
  landmarks, ring-road skyline views, the isolated silhouette layer from the quay.

### Decided and why

- Polyline lanes in one graph rather than a second road type (decision 16).
- Two resident detail levels rather than regenerating chunks at the detail
  boundary (decision 17); heap stays far below budget.
- The chicane has no frontage: yards read as yards, and the tight curve needs
  sightlines.

### Next

- Marcin's loop playtest (`?spawn=loop`), then M3 traffic on this road graph.

### Open problems

- Frontage rhythm, bare chicane yards, corner buildings, silhouette sightlines,
  the residual render spike: `docs/BACKLOG.md`.

## 2026-09-21 — Session 9: M2.1 street architecture, shadows, camera

Marcin's playtest feedback on M2: buildings need considered scale and variety,
ground floors, sidewalks and recognisable places; some facades clash with the sky;
shadows appear oddly on buildings; the camera reacts too strongly to steering.
A second round rejected the first facade pass (floating balcony rails, flat window
rectangles pasted everywhere). The Codex session that started this work ran out of
usage mid-way; this session verified its state and finished the pass.

### Done

- **Facades** (`sim/city/architecture.ts`): openings as voids in a shell of piers
  and bands, glazing behind reveals, loggias with slab, returns and parapet on the
  slab, shopfronts, loading bays, houses with shutters and gardens, ribbon offices,
  distinct side/rear elevations. One collision-only envelope per building.
- **Streets**: 4.5 m sidewalks, paving joints, entrance paths, parking shoulders,
  trees, block interiors, reserved landmark plazas, muted facade bodies and sky.
- **Shadows** (`render/shadows.ts`): fixed 140 m map, texel-snapped target, edge
  fade, all resident casters. **Camera**: motion-only follow, bounded lead and
  lateral look, 110°/s cap, FOV 60–80; four comfort tests replace M1 look-ahead pins.
- **Budget recovery**: the facade pass had pushed the low tour to 291k triangles
  (limit 250k). Quartered chunk meshes with per-part distance/shadow culling and
  static matrices, spatial detail radius (180 / 220 m), `trim` members with only
  visible faces and no depth pass, balcony members with exposed faces only. Low tour
  now 77 calls / 109k triangles, high 105 / 149k.
- **Fixes found on review**: open building corners (missing end caps on full-span
  X bands showed the underside of the adjacent band as a dark wedge, located by a
  pixel raycast against the merged buffer); render parts no longer retain chunk
  descriptors; two docs written in cp1252 by the previous session restored to UTF-8.
- Gate report extended: `docs/M2_REPORT.md` § M2.1.

### Evidence and boundaries

- `verify` green, 88 tests, 3.36 MB. `city` 5/5 on both tiers, `screens` 10/10,
  `perf` passes its budgets.
- Six alternating 30 s A/B runs against the M2 build at CPU ×4, low tier: 55.1 vs
  53.4 fps mean; identical-code spread is 52–58 fps, so the difference is within
  noise. A CPU profile attributed the extra main-thread time to Three per-object
  overhead, which the per-part culling then reduced. Nothing here proves a sustained
  60 fps on the low tier; the M2 pacing caveat stands.
- Startup at 20 Mbit + CPU ×4: 3.0–4.6 s over six runs (M2: 2.2 s). Under the 6 s
  gate; deferral plan in `docs/BACKLOG.md`.
- Reviewed from the driving camera: six named views, a steering pulse, four
  landmarks, and front/corner/side close-ups of one building per district.

### Decided and why

- Quadrant parts and a spatial detail radius rather than per-tier facade variants:
  both tiers keep the same geometry rules and the low tier lost 55 % of its
  triangles with no visible change (Decision 14 in `docs/ARCHITECTURE.md`).
- The leak guard in `e2e/city.spec.ts` now scales with resident meshes (five
  geometries per chunk) instead of the fixed 80; it still fails on any growth with
  `loaded`.
- Codex's root `progress.md` stays as a short mirror; this file remains the log.

### Next

- Marcin's playtest of M2.1 on the low-tier laptop (`npm run perf:headed` there
  would give the first real low-tier numbers). Then M3 traffic on this foundation.

### Open problems

- Facade variety at speed, roof silhouettes, waterfront composition, trees' shadow
  cost, startup margin: all listed in `docs/BACKLOG.md` or the report's known issues.

## 2026-09-21 — Session 8: M2 city, ready for the playtest gate

Marcin's instruction: begin M2. Baseline `verify` passed: 81 tests, 3.34 MB,
869 ms unthrottled startup. Work is isolated on `codex/m2-city`.

### Done

- **City.** `sim/city/City.ts` generates 49 independent 225 m chunks, 1,575 m square,
  from a seed. Four district massing/colour families, parks, pavements, lamps,
  crossings, four landmarks and a visible island boundary. Original code geometry,
  no new dependencies or third-party assets. This is a first blockout, not an
  accepted final art pass.
- **Roads.** `sim/city/roads.ts`: 49 connected junctions, 168 directed right-hand
  lanes, wider perimeter loop, sampled cubic junction connections including U-turns.
  An Euler route lets the existing pursuit controller visit every directed lane.
- **Physics streaming.** One seamless permanent ground collider, 3×3 neighbourhood
  loaded ahead, retention within 5×5, load before unload, existing building/wall
  collision rules. Reset projects onto the closest lane and updates after teleports.
- **Render streaming.** Direct typed-array mesh construction, one shared material,
  one merged mesh per chunk, frustum culling, distance-limited shadow casting,
  fog/load/eviction margins, geometry disposal. One new mesh per normal frame;
  initial and teleported views are synchronous.
- **Quality.** Low-first startup and actual frame-cost sampling, high/low fog and
  shadows, DPR caps and dynamic resolution, cooldown/hysteresis. Locked query
  overrides for repeatable checks. Simulation and collisions stay tier independent.
- **UI / QA.** North-up minimap, car arrow, district/landmark labels; concise state
  in `render_game_to_text()`, opt-in deterministic stepping via `?manual=1`.
  The dev panel exposes only useful named district spawns, not all 168 lanes.
- **M1 preserved.** Playground URLs and `?map=playground` keep the handling course,
  recordings and lap ghost. No vehicle tuning was changed. City recording is off
  by default so long sessions don't retain an unbounded pose/control history.

### Evidence and boundaries

- `verify`: 85 passing Vitest tests, both typechecks, lint, production build, smoke
  and byte budgets on final code. Build 3.35 MB / 5 files; final smoke startup
  740 ms. The camera-snap guard also passes the targeted browser controls test.
- Full headless tour: **168/168 lanes**, **1,709.3 simulated seconds**, no bot resets,
  no body impacts. Chassis Y after settling **0.415–0.433 m**. Streaming revisits
  recreate identical geometry and remain under the collider residency bound.
- `npm run city`: **5/5**. Startup **2,215 ms** at 20 Mbit / 40 ms latency / CPU ×4.
  Accelerated whole-map render tours: low **49 calls / 49,473 tris / 25 meshes**;
  high **54 / 64,437 / 45**, physics **16 chunks** max. Meshes unloaded **251/266**;
  peak heap samples **19.6/26.3 MB**. Controls, pause/resume, reset after teleport,
  and automatic high→low quality response are checked.
- Initial real-time M2 perf, MX330 / ANGLE D3D11, 1280×720, CPU ×4, 60 s:
  **59.8 fps**, frame p95/p99/max **16.7/16.8/50.1 ms**, sim substeps/frame p95
  **3.2 ms**, heap **22 MB**, no bot resets. Extra triangles/heap compared with the
  empty M1 lot trigger comparison warnings, not budget failures.
- Final real-time repeat: **58.2 fps**, frame p95/p99/max **16.8/33.4/166.8 ms**,
  sim p95/max **3.5/26.8 ms**, heap **21 MB**. The preceding run on the same code
  had **56.7 fps**, frame max **766.6 ms** and sim max **257.6 ms**. The p95 budgets
  pass, but these outliers prevent a hitch-free or sustained-60 claim.
- Instrumented 60 s run: 55.0 fps, p95/p99/max 16.8/66.6/233.4 ms. Slowest render
  call 58.5 ms with **no** chunk load/unload; render including an upload 28.9 ms;
  physics step with three loads/removals 13.9 ms. The longer frame gaps remain
  unexplained; streaming has a cost but is not established as their cause. Raw
  scratch evidence: `perf/city-profile.json`. No extra profiling code ships.
- `npm run screens`: **10/10** viewport cases, HUD + pause. Inspected player-camera
  shots from the input-burst skill client and every named city spawn, plus the
  smallest/largest HUD and the small pause view. No browser console errors in QA.
- The **whole-map tour is accelerated** and checks coverage/streaming/scene budgets;
  the **real-time perf run is 60 s**, not the entire 28-minute tour. Chromebook and
  other hardware remain unmeasured. Human driving/art approval remains Marcin's.

### Decisions and next

- Fixed road plan plus seeded lots gives repeatable driving and an M3 traffic base.
  The flat grid and at-grade perimeter intersections are deliberate first-pass scope.
- Keep physics and visual streaming independent; never change gameplay by quality.
- The renderer detects a large position jump itself, because a fixed step can clear
  the sim's one-tick respawn flag before rendering. City teleport views and the chase
  camera snap on their first frame; this has a browser regression assertion.
- Gate report and five-minute playtest: `docs/M2_REPORT.md`. Start at `/`, or jump
  with `?spawn=crown|foundry|gardens|marina|highway`; compare `?quality=low|high`.
- Stop at the M2 playtest gate. M3 scope remains traffic LOD, dodging pedestrians,
  damage, car-swap, takedowns, near misses, boost economy and collectibles.

## 2026-09-21 — Session 7: sparks, camera look-ahead

Marcin's call: sparks while scraping, and a look-ahead camera.

- **Sparks** (`src/render/Sparks.ts`). A fixed pool of 192 particles drawn as point heads (3.5 px, resolution-independent) plus streak tails along their velocity: two draw calls for the whole pool, typed arrays updated in place, no allocation per frame. Emitted at the contact point from `telemetry` (`contactX/Y/Z`, normal, `scrape`, `contactSide`): 60/s while touching plus 300/s at full scrape, and a burst of 4 per m/s of impact (cap 70) on a hit. Thrown along the wall behind the car with part of its speed, a random spread, gravity, life 0.18–0.5 s, hot white-yellow fading to orange, dying on the ground. Always on the car's flank, never in front of it. The scrape threshold in the sim dropped from 0.08 to 0.04 m/s per step so a light lean on a wall already shows (and grinds).
- **Camera look-ahead** (`ChaseCamera.ts`, numbers `headingLead`, `lookSide*`). The heading gains 0.22 s of the car's yaw rate (not while drifting, where the velocity follow already frames the exit) and the look point slides toward the inside of the turn: 1.8 m per rad/s of yaw rate plus 2.2 m at full steering lock, capped at 4.5 m, smoothed at 6/s, fading in up to 14 m/s and out during the reverse orbit. `yawRate` added to the telemetry (rad/s, + = nose left). Pinned in `tests/render/camera.test.ts` (Node, no WebGL): straight = centred, a left turn leads the view 1–25° left and slides the look point ≥ 1 m to the inside, right mirrors it, steering alone at speed already turns the view.
- Real-time screenshots for judging effects: a Playwright script from the project root (the in-app pane runs at ~4 fps and cannot show particles).

## 2026-09-21 — Session 6: per-class bot budget, wall collisions

Marcin's call: give the track bot a per-car lateral budget, then fix collisions with walls at speed.

- **Track bot per class.** Swept the bot's lateral budget 9–21 m/s² per car. The muscle's laps fall all the way to 21 but above 17 it runs 3 m off the road; the compact lifts its inside wheels above 13 (rolls to 37°); the van runs 12 m wide above 15 and rolls at 13 and 17. Chosen: muscle 17, compact 13, heavy 11 with braking 8 (`TRACK_BOT_BY_CAR` in `src/app/trackBot.ts`; the constructor takes the car id). Per-class lap pins in `cars.test.ts` (muscle 30–40 s, compact 33–43, heavy 35–46); flying laps measured 34.2 / 37.3 / 39.7 s.
- **Walls, measured first.** With the old 0.65 combined friction and no assist, a glancing hit up to 30° slid along the wall, but from 45° up the corner friction pivoted the nose into the wall and the car stopped dead; at 60° it swung past 90° and ended facing backwards; head-on was a dead stop with no bounce and no feedback of any kind.
- **Walls, now** (`Vehicle.ts` "body contacts", numbers `wall*` in `tuning.ts`, decision record 11):
  - the chassis reads Rapier's contact manifolds back every step (`contactPairsWith` / `contactPair`, bound callbacks, no JS allocation): summed normal impulse → `telemetry.impact` (m/s of speed change this step), contact point and normal, `scrape` 0..1 and `contactSide`;
  - chassis friction 0.15 with the Min combine rule (walls are slippery), restitution 0.2 with the Multiply rule: walls and buildings carry restitution 1.0 so a head-on hit bounces back a little, props carry 0. Props keep their previous contact numbers against the slippery chassis through their own rules (friction 0.55 with Max, restitution 0.6 with Multiply → 0.12), checked by reading the manifold coefficients back;
  - on the step of a hit only 15% of the body spin survives: a corner impulse otherwise spins the car round;
  - while sliding along a wall a yaw controller (20 rad/s² per rad, damping 7/s, scaled by the yaw inertia so every class turns alike) turns the nose toward the direction of travel, and keeps working for 0.5 s after the body leaves the wall so the bounce cannot undo it; above an 80° nose angle it is a crash and nothing aligns;
  - nearly stopped with the nose in: throttle + steer peels the car off to the steered side, throttle alone with the nose under 60° slides it out, no input never turns a stopped car.
  Results at 100 km/h (muscle / compact / heavy, speed one second after the hit): 20° keeps 96/93/92%, 45° 69/64/60%, 75° comes out aligned within 3° at 44/47/32 km/h; a 60° hit at 150 km/h comes out straight at 65–70 km/h; head-on stops, bounces 6–11 m and stays square; every case minUp ≥ 0.99. 22 pins in `tests/sim/walls.test.ts` (7 per class plus props).
- **Feedback.** Camera: impact shake (`impactShake` per m/s, capped) and a scrape shake. Audio: a low thump per hit scaled by the speed lost, a band-passed grind while scraping.
- **Playground.** `walls` lane at x 250: barriers both sides for 300 m, an angled barrier crossing the lane at 7°, two pillars, a head-on wall. `?spawn=walls`. The renderer is on the debug handle (`window.__game.renderer`) for scene inspection.
- **Perf.** Sim step unchanged: Node 63–68 µs mean warm (old vs new), browser 40–60 µs, a continuous wall scrape adds ~10 µs. The throttled probe's step p95 swings 3.2–5.8 ms between runs with the in-app browser pane open; with it closed, two runs each: session 5 commit 4.7 / 4.7 ms, this tree 3.6 / 3.2 ms. Frame p95 16.8 ms, 59.9 fps, draw calls 47/67, 34k tris, 16 MB heap, all within budget. Lesson: close the pane before `npm run perf`.
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
