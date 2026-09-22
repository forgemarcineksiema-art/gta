# Architecture

Short and current. Decision records at the bottom; add one when a decision would surprise a newcomer.

## Layout

```
index.html            entry page: one canvas, one UI root, a loading overlay
src/main.ts           boots App
src/app/              App (glue, slow-motion time scale), loop.ts (fixed-step accumulator), bot.ts / trackBot.ts (autopilots), perf.ts (probe)
src/sim/              headless simulation: SimWorld, Vehicle, playground, transforms, palette, math, events (ring log), economy (ECONOMY / DAMAGE / SWAP), balance (heat and bag values)
src/sim/traffic/      Traffic (pooled agents, lent bodies, junctions), Pedestrians (footway walkers), lanes (lane tables, junction curves), tuning
src/sim/life/         Life: hits, damage, wrecked / respawn, car-swap, takedowns, near misses, oncoming, billboards
src/sim/heat/         Heat: the run's ratchet, fed from the event ring
src/sim/police/       Pursuit (detection state machine), Police (units as traffic agents with a plan), tuning
src/sim/city/         City (chunks, statics, road graph), architecture, markings, roads, collectibles (billboard placement + smash trigger)
src/render/           Three.js: Renderer, ChaseCamera (look-ahead, reverse orbit, shake, whip, focus), CityView, TrafficView, PoliceView (livery, light bars), PedView, Billboards, Debris, Smoke, SpeedLines, Sparks, carMesh (damage stages), carProfiles
src/audio/            EngineAudio (WebAudio synthesis), Sfx (event one-shots: sweep, honk, yelp, crunch, boom, whoosh, splinter, chime)
src/ui/               Hud (popups, damage bar, wrecked overlay, swap prompt, billboard counter), heat (five stars), Minimap (heading-up canvas radar) + minimapModel (pure maths), DebugPanel, styles.css
src/input/            actions, InputManager, KeyboardDevice
src/platform/         Platform interface, LocalPlatform, createPlatform()
tests/sim/            Vitest headless sim tests (handling, cars, walls, instrumentation, loop, city, traffic, pedestrians, damage, swap, takedown, collectibles, heat, pursuit, police)
tests/render/         Vitest camera pins (three.js math in Node, no WebGL)
tests/ui/             Vitest minimap model pins (road layers, projection, easing, rim clamp)
e2e/                  Playwright: smoke, perf, screens, city (M2 tour), life (M3 traffic run)
tools/                verify.mjs, budget.mjs
docs/                 BRIEF, PROGRESS, DESIGN, M4_PLAN, ARCHITECTURE, BACKLOG, CRAZYGAMES, STYLE, TITLES, ASSETS
```

## City (M2)

`sim/city/roads.ts` owns the fixed road plan, directed lane graph, cubic junction
connections and uniform 3 m samples for the bot. `sim/city/City.ts` generates each
225 m chunk from `(seed, chunkX, chunkZ)` independently. The route is an Euler tour
of all 168 directed lanes; permissive arcade junctions include U-turn connections.

The city sim loads a 3×3 neighbourhood of collision chunks and retains old chunks
within a 5×5 neighbourhood. It loads before removing, and a reset projects onto a
nearby lane before the physics step. Buildings use `GROUPS_SOLID` and restitution
1; pavements use `GROUPS_TERRAIN`. All streets share one permanent ground collider.

`render/CityView.ts` generates merged typed-array geometry directly (the city's
descriptors are axis-aligned boxes, gable prisms, vertical cylinders and single box
faces). It shares one material, preloads outside fog and retains an extra
chunk-width before disposing. Each chunk becomes five meshes: statics that straddle
a chunk centre line (ground, road cross) form a base part, everything else goes to
its quadrant, so camera and shadow frustum culling discard the streets behind the
player. Shadow casters sit in a prefix of each buffer (`onBeforeShadow` draw range);
single faces, wall members and `trim` never enter the depth pass. Facade detail is
spatial: parts inside `DETAIL_NEAR` (180 m) carry frames, sills and full wall
members, parts beyond it draw only outer wall faces, with hysteresis to
`DETAIL_FAR`. One chunk (or one part rebuild) is uploaded per normal frame; initial
and teleported views populate synchronously. Parts hold no chunk descriptors; a
rebuild regenerates the chunk. Physics and rendering residency are independent and
observable in `window.__game` and `render_game_to_text()`.

`sim/city/architecture.ts` builds facades as render descriptors only: one
collision-only envelope per building, a core, and per wall a row of piers and bands
around actual openings with glazing behind. Members declare their exposed faces
(`faces`), their far-distance face (`farFace`) and whether they are `detailOnly`.
Shadows use a fixed 140 m half-extent map whose target snaps to the light-space
texel grid (`render/shadows.ts`), and receivers fade the map edge.

`Renderer` starts low and samples real frame intervals after warmup, then adapts
fog/draw distance, shadow resolution and DPR with hysteresis. Locked quality URLs
make benchmarks reproducible. Simulation, road topology and collisions are tier
independent. The minimap is a heading-up radar on its own 2D canvas
(`ui/minimap.ts`, maths in `ui/minimapModel.ts`): roads from the graph cached as
world-space paths, district tints, landmark glyphs that clamp to the rim along
the bearing from the car, the car arrow and a rotating compass; it repaints at
30 Hz and only while something moved (decision 18).

`SimWorld()` still defaults to the playground for existing headless tests; `App`
selects the city unless a playground/track URL was requested. City sessions do not
record unbounded per-tick history. The M1 track bot reuses its pursuit/curvature
controller with `CITY_BOT_TUNING` and a local route search for city coverage.

Decision 12: keep a continuous ground collider instead of creating road colliders
per chunk, so streaming and junctions cannot introduce suspension seams. Decision
13: keep the road topology authored and deterministic; seed variation affects lots
and massing, preserving route readability and a stable M3 traffic foundation.
Decision 14 (M2.1): quarter chunk meshes and spatial facade detail instead of
per-tier facade variants. The low tier tour peaked at 291k triangles with one mesh
per chunk and full detail everywhere; quadrants plus the 180 m detail radius took
it to 133k (high 175k) with no visible change from the driving camera, and both
tiers keep identical geometry rules. Decision 15 (M2.1): the chase camera follows
actual motion only. Steering feed-forward, the 0.22 s heading lead and the large
lateral look offset made quick corrections swing the road under the player;
comfort tests in `tests/render/camera.test.ts` pin the new bounds.

M2.2 (authored loop, skyline, streaming hygiene). Every lane is a polyline
(`Lane.points`, `yaw0`/`yaw`); grid lanes are two-point polylines and the five
authored roads (`SPECIAL_ROADS`: straight, arc and Catmull-Rom builders, sampled at
4.5–9 m, trimmed by `LANE_INSET`, offset to the right) join as lane pairs between
junctions, so the Euler tour, `lanePath`, `projectOnLane` (reset), the minimap and
the M3 traffic foundation see one lane type. Statics may rotate about +Y: the
renderer rotates positions and normals in `cityGeometry`, colliders take
`setRotation`. A chunk generator queries the roads near it (`corridors`); quarters
they touch become open quarters (road-level interior, grid pavements cut by
sampling the strip at 1.5 m against the corridor, lots yielded when any footprint
corner is within 40 m of the centreline) and `City.specialRoad` draws the surface
as a raised top face, rotated kerbs, dashes, trees, lamps and a frontage row of
`Architecture.rotatedBuilding`s whose footprints must clear the grid pavements.
The skyline layer (`render/skyline.ts`) is one mesh from `City.landmarkSilhouettes`
with a long-range fog. `City.sync` loads at most one physics chunk per step
(nearest first, removal only once the neighbourhood is complete; spawns and
teleports load all nine). `CityView` claims a tile with five empty part meshes and
one chunk generation, then builds one geometry per frame from a per-tile queue:
the level each part needs now, then the other level; both levels stay resident
and the mesh swaps between them by distance, so driving never regenerates a
chunk. Synchronous loads build only the needed level of the ring in front of the
fog; the fogged ring and the second level follow at two builds a frame.
`App.boot` records phase times in `GameHandle.bootTimings`; the startup gate
measures navigation start to the first controllable frame.

`ShapeDesc` also has `prism`: a convex polygon in world XZ extruded between two
heights, rendered as a top fan with outward sides (`render/geometry.ts`) and
collided as a Rapier convex hull. `City.joinsFor` computes, once per authored
road, the junction pavements at both ends (wedge and sliver prisms), the cuts
they impose on grid strips (world-space, applied by whichever chunk owns the
strip) and the clip edge where the road's own band may start; `specialRoad`
builds bands as prism quads per centreline segment.

Decision 16 (M2.2): authored roads are polylines in the same graph, not a second
road system. Alternatives were a separate spline road type with its own bot and
reset code, or bending the grid itself; both would have doubled the traffic
work in M3. Decision 17 (M2.2): two resident detail levels per part instead of
regenerating a chunk at the detail boundary. The regeneration cost 20–40 ms per
crossing at CPU ×4 and crossings happen about twice a second while driving; the
second level costs roughly 40 % more geometry memory (heap 40–45 MB on the tour).

Decision 18 (M2): the minimap is a heading-up radar on a canvas, not a
whole-city SVG. The first minimap fitted the 1,575 m island into 132–184 px
(8–12 m per pixel: streets under 2 px, the car a speck) and drew `lane.points`,
which are offset carriageways inset from the junctions, so every road kinked;
it answered "where on the island" but never "which turn next". The radar shows
210–420 m around the car with the direction of travel up (what the chase camera
follows, so a drift reads the same on both), the car below the centre, roads at
real width from junction to junction, and landmarks that clamp to the rim along
the bearing from the car, which is the compass cue the street canyons needed.
Canvas 2D keeps the repaint off the DOM layout path that cost 19 % of the main
thread in the M2.1 profile; the maths lives in a DOM-free module with Node pins.

Decision 19 (M2.2): road paint is generated per road, not per chunk
(`sim/city/markings.ts`). Chunk-local rules restarted dash phase at every tile
edge, split crossings at diagonal merges into stray stripes and could only ever
see one chunk of a curve. The generator walks each road's centreline in metres
(grid streets, the five authored polylines, and the perimeter as one closed loop
with quarter-circle corners), decides every crossing, stop line, arrow and bay
against the whole graph, merges consecutive strokes of a line into boxes of at
most 12 m, and hands each mark to the chunk that holds its centre; `City.generate`
just appends its chunk's list. The perimeter has priority, so its centre and lane
lines run through the side-street mouths and only its inner edge line breaks.
Marks that lie across the road carry a per-vertex underlay colour and fade
distance, and the shared material blends them into the surface colour before
their projected thickness reaches a pixel (`render/roadPaint.ts`): the same
merged, single-draw-call geometry, one extra vertex attribute, no second pass.
The alternative, a decal texture per road, needs textures the style forbids and
a second material.

## Life (M3)

The city's population is three systems that read one shared picture of the
player (`SimWorld.probe`: position, heading, velocity, chassis half extents)
and talk back through `sim.events`, a 64-entry ring log with a monotonic
sequence that HUD, audio and renderer each poll from their own cursor.

**Traffic** (`sim/traffic/Traffic.ts`) is a pool of 48 typed-array records
(state, kind, lane, next lane, path distance `s`, sub-lane offset, speed,
pose) and a pool of 16 Rapier dynamic bodies lent to the agents nearest the
player. Every agent plans the same way (`plan`: lane speed limit, the gap to
its leader, to the player and to whatever is ahead on its path, the junction
reservation), then either moves along its polyline (`moveKinematic`) or has
its body's linear and angular velocity blended toward that plan (`driveBody`:
the heading controller `angvel.y = clamp(err × yawGain, ±yawRateMax)`, with a
turn-back when the carrot is more than 60° off). Junction curves are cubic
beziers between the offset endpoints of the two lanes with handles
proportional to the endpoint gap; a node has four holder slots, curves
within 5 m conflict, first come first served with a forced override after
`junctionWait`. A body is lent within 35 m, returned beyond 70 m (or earlier
when a nearer agent needs it), and the agent snaps back onto its path on
return. Contact impulses are read per step and split by source
(`playerDv`, `wallDv`, `trafficDv`); above `disturbedImpact` the agent goes
`Disturbed` (full physics until it settles within `reattachDistance`), above
`wreckImpact` it is `Wrecked` for good, a stopped obstacle until the player is
far away. Deviation from the plan, recorded here: a driving body uses
`GROUPS_TRAFFIC` (no terrain contact) with its vertical translation locked,
and switches to `GROUPS_SOLID` with all axes free only when disturbed,
wrecked or abandoned. Consequence: a driving traffic car passes over kerbs
and the pavement apron, and a disturbed car further than 70 m snaps upright
onto its lane when its body is returned.

**Pedestrians** (`sim/traffic/Pedestrians.ts`) are colliderless points on
footway paths (a lane polyline shifted onto the pavement) that walk, turn at
block corners, dodge the player's corridor 0.7 s ahead, dive, get up and
shake a fist; a last-resort hop off the chassis footprint makes "can never
be hit" true by construction. Their pose is packed into the transform
quaternion the instanced view reads.

**Life** (`sim/life/Life.ts`) runs before the vehicle (`preStep`: swap on the
`E` edge, the wrecked timer and respawn, heal on reset) and after the physics
(`postStep`: slow-motion countdown, hit classification by collider, damage
from the strongest contact, takedowns, billboards, near misses, the oncoming
lane, pedestrian dodges). Damage is a rule set outside `Vehicle`; the vehicle
only reports impacts and the contact handle, and gains one flag, `engineCut`.
Car-swap retunes the player's `Vehicle` in place (tuning replaced, collider
rebuilt, body teleported onto the target's pose with its velocity) while the
target agent's record becomes the player's old car standing where the player
was. Takedowns wreck a recently touched agent that slams a wall or another
car, flips, or took a hard direct hit, and start `slowMo`; `App` feeds
`frameDt × slowMoScale` into the loop while it runs, so the sim never knows.
Billboards (`sim/city/collectibles.ts`) are placed as the last step of chunk
generation and smashed by the chassis footprint at speed; no colliders.

Rendering reads all of it: `TrafficView` and `PedView` are packed instanced
meshes over the transform buffer, `Billboards` an instanced mesh fed from
`CityView.onChunk`, `Debris` (32 boxes, fake physics) and `Smoke` (160
points) are event-driven, `carMesh.setDamage` deforms the player's car per
stage, `ChaseCamera` whips on a swap and focuses the takedown target.

## Data flow per frame (detail)

```
requestAnimationFrame
  InputManager.update()              devices -> ActionState (values + edges)
  timeScale = slowMo ? 0.35 : 1      the takedown slow motion scales the frame's dt
  FixedStepLoop.advance(dt × scale)  0..5 fixed steps of 1/60 s
    controls <- ActionState | Bot    app copies actions into sim.controls
    SimWorld.step()                  city.sync(); events.tick(); life.preStep(); vehicle.update();
                                     probe <- vehicle; traffic.step(probe); peds.step(probe);
                                     rapier.step(); write transforms; life.postStep()
  Renderer.render(alpha)             interpolate prev/curr transforms, chase camera (whip / focus), views, debris, smoke, draw
  EngineAudio.update(telemetry)      RPM/load/speed/slip -> oscillators, filters, gains
  Sfx (events)                       one-shots per sim event since the last cursor
  Hud.update(sim, dt, info, now)     DOM text on change, popups per event, throttled debug block, radar canvas at 30 Hz
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
12. **Traffic agents are pooled typed-array records; physics bodies are lent to the nearest** (M3). The brief asks for a simulation LOD and the M0 note says every Rapier binding call allocates. Forty-eight records cost a polyline lookup each; sixteen bodies cost physics and follow the player.
13. **Near agents are dynamic bodies driven by velocity, not kinematic bodies** (M3). A kinematic body has infinite mass: hitting one is hitting a wall, and it cannot be shoved into a takedown. A dynamic body steered by velocity follows its lane like a kinematic one, yet a hit displaces it and the impulse reaches the player's chassis through the same manifold readback. Its friction combines with `Min` (0.4) against the ground's 1.0, so a shoved car slides on its tyres instead of stopping like a crate.
14. **The highway's two lanes per direction are sub-lane offsets, not graph lanes** (M3). Offsets −2 and +6 m from the graph lane put cars in the painted lanes; changing `buildRoadGraph` would touch the Euler tour, the markings, the minimap and three pins for a cosmetic gain.
    - Revisited (M4 slice 0): the two lanes are graph lanes now, at 4 and 12 m right of the centreline (`HIGHWAY_LANE_OFFSETS`, `Lane.offset`), because roadblocks, interceptors and parked patrols need a lane the graph knows about. Those are the centres the paint always had (dash at 8 m, edge at 16 m), so the markings derive the dash from the same constant. Highway cars keep their lane through a junction 85 % of the time; the lane count went 178 → 226, the sim and e2e tours and the markings pin were re-pinned, the minimap draws one segment per edge.
15. **Junction curves are per-offset beziers with proportional handles** (M3). Curves built on the centre line and shifted by the offset folded on tight corners; curves built between the offset endpoints do not. Fixed 24 m handles cusped on right-angle corners whose endpoints are 25 m apart (875 of 3420 curves); handles of 0.42 × the endpoint gap, capped at 24, leave none.
16. **Sim events are a ring buffer the other layers poll** (M3). No callbacks out of the sim, no allocation per event, headless-testable, and M5 can hang cash on the same log. Each consumer keeps its own cursor and a bound visitor.
17. **Damage is a rule set outside `Vehicle`** (M3). The vehicle reports impacts and the strongest contact's collider; `Life` classifies and applies `DAMAGE`. The M1 handling pins do not move, and damage is off on the playground by default because those pins drive into walls at 150 km/h.
18. **Car-swap retunes the player's `Vehicle` in place** (M3). One body, one transform slot, one camera target; the renderer keeps a mesh per class and toggles. The agent's record becomes the abandoned old car.
19. **Pedestrians have no colliders** (M3). Points on footway paths with a dodge controller and a last-resort hop make "never hit" true by construction; PEGI 12 slapstick, zero Rapier cost.
20. **Billboards are pass-through triggers with a visible smash** (M3). A solid panel is a wall at highway speed. Placed last in chunk generation with a fixed quota so the island has exactly fifty; drawn as their own instanced mesh so one can vanish without a chunk rebuild. Interior ones are gates across the footways, because the frontage row leaves no run-out behind a roadside panel; the highway verges get roadside panels.
21. **Slow motion is a time scale on the fixed-step loop** (M3). Deterministic, no special stepping, input keeps flowing, any pressed action ends it.
22. **Traffic density is the same on both quality tiers** (M3). Decision 13 of M2 (quality never changes gameplay) wins until M6 needs a mobile lever; the pool size is one tuning number.
23. **Traffic classes are the player's classes** (M3). Real presets, real swaps; variety is paint. Traffic-only silhouettes are backlog.
24. **Tests and tours run with traffic off unless they test traffic** (M3). The M2 tour pins zero resets and impact < 2; `?traffic=0&peds=0` and `SimWorldOptions` keep those pins honest, while the real-time perf run keeps traffic on because that is the cost being measured.
23. **Wrecks are towed by age plus an instantaneous sight test** (M4). A wreck older than `wreckTow` (60 s) is freed the first step it is outside a 55° half-cone on the player's heading and beyond 40 m. A hidden-for timer reads better but never fires for a player circling one junction, which is the scrapyard case the rule exists for.
24. **The sim step is timed by phase through a hook, never by the sim** (M4). `SimWorld.mark` is called at the end of each `SimPhase`; `src/app/simProfile.ts` owns the clock, because `src/sim` has no lib.dom and no Node types. Installed for measured runs only.
25. **Keyboard taps are latched until read** (M4). A key down and up between two frames was never seen; `KeyboardDevice.tapped` reports it once. Input read while blocked is dropped, not replayed after an ad.
26. **Police are a planner over traffic agents, not a second traffic system** (M4). A unit is an ordinary pooled record with `Traffic.police[i]` set and a bounded plan (`setPolicePlan`: a connected exit, a speed, an optional ram point) written by `sim/police/Police.ts` before `Traffic.step`. It therefore shares the 16-body lender, the junction reservations, the gap rules and the lane follower; a pursuit adds no Rapier bodies. Only three planner rules change for a unit: the speed limit comes from the plan, a plan-chosen exit overrides the random turn, and a chasing unit with a body does not brake for the player. Police records are exempt from the despawn radius so a unit that lost the player does not evaporate.
27. **Sight is a fixed-collider ray, sampled** (M4). One `castRay` per unit every six steps, staggered, `ONLY_FIXED` so traffic never hides the player and buildings do. The pursuit is what the sampled rays say; heat is a separate ratchet that only a banked or busted run clears, so an escape ends the chase and leaves the stars.
28. **The pursuit borrows the body pool with a hard share** (M4). A unit is lent one of the 16 traffic bodies before a civilian (it counts as `policeBodyReach` nearer, and keeps it that much further out), evicts only civilians and only while police hold fewer than `policeBodies` (10), and is never evicted by one. The alternative, thinning the traffic while a chase runs, empties exactly the street the player is driving through; this way the chase is physical and the city stays alive.
