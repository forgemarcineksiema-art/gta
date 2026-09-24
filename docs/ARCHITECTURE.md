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
src/sim/heat/         Heat: the run's ratchet, fed from the event ring and judged by what the police see (M5.5)
src/sim/police/       Pursuit (detection state machine), Police (units as traffic agents with a plan), tuning
src/sim/city/         City (chunks, statics, road graph), architecture, markings, roads, collectibles (billboard placement + smash trigger), coins (the static gate lines and arcs, the run-time pools, a job's route line), caches (the day's thirty)
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
docs/                 BRIEF, PROGRESS, DESIGN, M4_PLAN … M9_PLAN, ARCHITECTURE, BACKLOG, CRAZYGAMES, STYLE, TITLES, ASSETS
```

## City (M2)

`sim/city/roads.ts` owns the fixed road plan, directed lane graph, cubic junction
connections and uniform 3 m samples for the bot. `sim/city/City.ts` generates each
225 m chunk from `(seed, chunkX, chunkZ)` independently. The route is an Euler tour
of all directed lanes (168 at M2, 178 with the authored loop, 226 since the real highway lanes of M4 slice 0); permissive arcade junctions include U-turn connections.

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
30 Hz and only while something moved (city decision C7).

`SimWorld()` still defaults to the playground for existing headless tests; `App`
selects the city unless a playground/track URL was requested. City sessions do not
record unbounded per-tick history. The M1 track bot reuses its pursuit/curvature
controller with `CITY_BOT_TUNING` and a local route search for city coverage.

City decision C1 (M2): keep a continuous ground collider instead of creating road colliders
per chunk, so streaming and junctions cannot introduce suspension seams. City decision
C2 (M2): keep the road topology authored and deterministic; seed variation affects lots
and massing, preserving route readability and a stable M3 traffic foundation.
City decision C3 (M2.1): quarter chunk meshes and spatial facade detail instead of
per-tier facade variants. The low tier tour peaked at 291k triangles with one mesh
per chunk and full detail everywhere; quadrants plus the 180 m detail radius took
it to 133k (high 175k) with no visible change from the driving camera, and both
tiers keep identical geometry rules. City decision C4 (M2.1): the chase camera follows
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

City decision C5 (M2.2): authored roads are polylines in the same graph, not a second
road system. Alternatives were a separate spline road type with its own bot and
reset code, or bending the grid itself; both would have doubled the traffic
work in M3. City decision C6 (M2.2): two resident detail levels per part instead of
regenerating a chunk at the detail boundary. The regeneration cost 20–40 ms per
crossing at CPU ×4 and crossings happen about twice a second while driving; the
second level costs roughly 40 % more geometry memory (heap 40–45 MB on the tour).

City decision C7 (M2): the minimap is a heading-up radar on a canvas, not a
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

City decision C8 (M2.2): road paint is generated per road, not per chunk
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
                                     probe <- vehicle; police.preStep(probe); traffic.step(probe); peds.step(probe);
                                     rapier.step(); write transforms; life.postStep(); heat.step()
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
- **Engine and drivetrain.** Torque curve over rpm (five points), six automatic gears plus reverse (first to fifth geometric over the reachable range, fifth the top-speed gear, sixth an overdrive that pulls on boost) (engaged with the brake from a standstill), final drive, efficiency, rev limiter, engine braking, torque cut during shifts. Engine rpm follows the driven wheels' angular velocity (idle as the floor), so the audio note and the acceleration character come from the same numbers.
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

`Platform` (`src/platform/Platform.ts`): init/info, loading + gameplay brackets, `happyTime`, `adsAvailable`, `requestAd` (typed `AdResult`, never rejects), `onAdEvent` (mute hook), `hasAdblock`, save/load/clear. `LocalPlatform` simulates ads with a DOM overlay and can force every SDK error code from the URL (`?ad=error&adError=adblock`, `?ad=off`, `?adblock=1`). `CrazyGamesPlatform` arrives in M7 (the platform milestone).

## Verification

`npm run verify` = typecheck (app + DOM-free sim), lint, Vitest, build, smoke (Playwright: loads, gameplay-start fires once, bot drives 20 s of sim time, no console errors, records startup bytes), budget. `npm run perf` runs the bot 60 s under 4× CPU throttle and writes `perf/latest.json` with regression warnings vs `perf/previous.json`. `npm run screens` captures HUD and pause at the ten required viewport sizes into `screens/`.

## Decision records

1. **Rapier `-compat` over the bundler build** (M0). Headless Node tests and zero build plugins outweigh ~0.7 MB of base64. Revisit only if the startup budget bites.
2. **Custom raycast car over Rapier's built-in vehicle controller** (M1). The built-in controller gives no drift state, no slip curve, no arcade assists; the feel targets in the brief need all three. Writing it also keeps every number in one `VehicleTuning`.
3. **Drift as a controlled state on top of physical tyres** (M1). Emergent handbrake slides either spun out or scrubbed all speed. The stick commands the drift angle and the fronts counter-steer automatically; the physical tyre model stays underneath and every assist is a number that can be set to 0.
4. **Fixed 60 Hz step, max 5 substeps, drop the rest** (M0). Required by CrazyGames (same behaviour at 144/165 Hz) and by the tests; dropping time on a hitch is better than a spiral.
5. **Vertex-colour merged statics** (M0). One draw call for the whole playground; the same approach scales to per-chunk meshes in M2.
6. **No web fonts** (M0). System heavy italic is enough for the look, costs zero bytes, and avoids licence questions.
7. **Wheel rotation solved, not integrated** (M1 physics pass). A wheel's inertia is tiny next to the tyre's stiffness, so explicit or semi-implicit integration at 60 Hz oscillated between lock and spin. Solving the per-substep equilibrium in closed form (linear region exact, plateau otherwise) is stable at any speed including standstill, which is what makes wheelspin and lock-ups usable rather than chaotic.
8. **Speed streaks are world-anchored motes** (M1 polish). Screen-space lines around the camera looked generic; motes that sit in the world and smear along the car's velocity parallax correctly, streak sideways in a drift and leave the centre of the screen clear.
9. **The chassis does not collide with terrain while upright** (M1 feel pass 3, `src/sim/collision.ts`). The suspension rays carry the car over kerbs and ramp kinks; a body scraping a 26° lip stole 14 km/h in one step and read as a wall. The terrain group is switched on only when the car is on its side or roof so it can rest there until it rights itself.
10. **Landings keep momentum** (M1 feel pass 3). Vertical speed is mostly absorbed at touchdown and 92% of the total speed is redirected along the ground; a kink in the road redirects with no loss. Physical landings cost too much speed for an arcade loop where jumps are rewards.
11. **Wall hits are shaped, not simulated** (M1, session 6). Realistic corner friction turns a 45° wall hit into a pivot that leaves the car nose-in and stopped, and a 60° hit into a spin that ends facing backwards; both read as the wall "grabbing" the car. The contacts stay physical (Rapier resolves penetration and the impulse), but the chassis is slippery, most of the spin from the hit is dropped, and a yaw controller turns the nose along the direction of travel while the car slides, so every hit under 80° comes out pointing where it is going with speed in proportion to the angle. The player always keeps a way out: a stopped car peels off with throttle and steer.
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
22. **Traffic density is the same on both quality tiers** (M3). The M2 rule that quality never changes gameplay (City section: simulation, road topology and collisions are tier independent) wins until M7 (the platform) needs a mobile lever; the pool size is one tuning number.
23. **Wrecks are towed by age plus an instantaneous sight test** (M4). A wreck older than `wreckTow` (60 s) is freed the first step it is outside a 55° half-cone on the player's heading and beyond 40 m. A hidden-for timer reads better but never fires for a player circling one junction, which is the scrapyard case the rule exists for.
24. **The sim step is timed by phase through a hook, never by the sim** (M4). `SimWorld.mark` is called at the end of each `SimPhase`; `src/app/simProfile.ts` owns the clock, because `src/sim` has no lib.dom and no Node types. Installed for measured runs only.
25. **Keyboard taps are latched until read** (M4). A key down and up between two frames was never seen; `KeyboardDevice.tapped` reports it once. Input read while blocked is dropped, not replayed after an ad.
26. **Police are a planner over traffic agents, not a second traffic system** (M4). A unit is an ordinary pooled record with `Traffic.police[i]` set and a bounded plan (`setPolicePlan`: a connected exit, a speed, an optional ram point) written by `sim/police/Police.ts` before `Traffic.step`. It therefore shares the 16-body lender, the junction reservations, the gap rules and the lane follower; a pursuit adds no Rapier bodies. Only three planner rules change for a unit: the speed limit comes from the plan, a plan-chosen exit overrides the random turn, and a chasing unit with a body does not brake for the player. Police records are exempt from the despawn radius so a unit that lost the player does not evaporate.
27. **Sight is a fixed-collider ray, sampled** (M4). One `castRay` per unit every six steps, staggered, `ONLY_FIXED` so traffic never hides the player and buildings do. The pursuit is what the sampled rays say; heat is a separate ratchet that only a banked or busted run clears, so an escape ends the chase and leaves the stars.
28. **The pursuit borrows the body pool with a hard share** (M4). A unit is lent one of the 16 traffic bodies before a civilian (it counts as `policeBodyReach` nearer, and keeps it that much further out), evicts only civilians and only while police hold fewer than `policeBodies` (10), and is never evicted by one. The alternative, thinning the traffic while a chase runs, empties exactly the street the player is driving through; this way the chase is physical and the city stays alive.
29. **Traffic classes are the player's classes** (M3). Real presets, real swaps; variety is paint. Traffic-only silhouettes are backlog.
30. **Tests and tours run with traffic off unless they test traffic** (M3). The M2 tour pins zero resets and impact < 2; `?traffic=0&peds=0` and `SimWorldOptions` keep those pins honest, while the real-time perf run keeps traffic on because that is the cost being measured.
31. **A shove is not a kill: traffic keeps damage, and a disturbed car drives back** (M4 slice 3c). The M3 rule wrecked any disturbed car still over 6 m/s or 4 m off its lane two seconds later, which is every chasing police car after a nudge (6 of 6 police wrecks measured). Now contacts dent (`damage`, 0..1), one big contact or full damage wrecks, and an upright car that has stopped spinning reattaches at any speed within 14 m of its path, its lean dropped. Police carry `policeArmour` on the thresholds, the damage and the takedown rules.
32. **The arrest is free steering to a slot, not lane following** (M4 slice 3c). Units on the lane follower queued behind each other and never reached the slots ahead of or beside a stopped player. A unit given an arrest slot steers its body straight there (`setPolicePlan(..., free = true)`: the lane gaps no longer hold it), braking on v² = 2ad, detouring round the player's car at walking pace, holding its heading once there. Slots behind a fixed collider are skipped by one ray each.
33. **The cold open is a script over the normal game** (M4 slice 4). `ColdOpen` never writes controls: it puts the player in a van at heat 1, holds a muscle car alongside with a guide plan, lays a coin line and a job marker, and reads the ring. Verbs are done in any order and the caption is the first verb not done while its cue holds, so a player who smashed the gate before swapping is never asked to; four verbs give up on their own. It is shown once per profile: M4's session flag became the save's `seen` in M5, still written when it starts ("never shown twice").
34. **The bag has one writer, the ring** (M4 slices 3–6). Billboards, cameras, roadblocks, jumps, takedowns, escapes, spilled coins and jobs all push events; `Run` reads its cursor and pays. `Jobs.step` runs before `Run.step` so a delivery into a garage pays before the door can drop the job.
35. **Identity is the descriptor plus a line of sight** (M4 slice 5). A swap nobody saw ends the chase on that step and the units box the car left behind; the box's clock runs only while two units are round it (a junction on the way takes them five seconds), and they pull out past the empty car before withdrawing because traffic queues behind an abandoned car for good. A police car is a disguise until a crime is seen from it or the dispatcher notices 30 s after the theft: the measurement tripped DESIGN §12's fallback (the ramming unit's car taken in sight was 114 of 120 s of cover).
36. **Level 3's hardware appears where nobody sees it** (M4 slice 6). A roadblock goes up at a chokepoint on the player's road 150–300 m ahead, out of the view cone or behind a building from the driver's eye (the highway's straights have nothing outside the cone ahead); a parked patrol appears out of view and beyond its own 90 m sight, because one placed in plain view pulled out at once and its place filled again. The roadblock's car half is braced (×3.5 damage) except to the heavy at 80 km/h: the M3 traffic factor does not wreck anything at 80.
37. **Stunt ramps are drawn from their collision profile** (M4 slice 6). A single steep slab threw the stiff-sprung classes 8.6 m into the air; the way up eases in over three slabs, and a view of its own draws that profile, because the city's merged statics only yaw a box and a gable would hide the wheels 27 cm into the slope.
38. **World props added after the billboards** (M4 slice 6). Camera poles and ramp slabs are pushed into a chunk after `placeBillboards`, so the billboard placer's clearance test and the coin lines through the gates never change for them, and seed-pinned placements stay put.
39. **An ad point holds its break open** (M4 slice 8). The door (not the session's first, which ends the cold open) and the busted card request a midgame ad when the platform has one; input is blocked from the request, the ad events mute and unblock, and the break cannot be dismissed until the ad is over. The door and the card are already game-made breaks with their `gameplayStop`/`gameplayStart`, so the ad adds no bracket.
40. **One way to play, one build stamp** (after the M4 gate). `npm start` builds and serves the production bundle on 4173, the only configuration whose numbers count (the e2e suites already ran against it); the dev server on 5173 is for editing. Every build carries `<package version>+<short commit>[-dirty]` on the pause screen and in `window.__game.version`, because Marcin playtests every build by hand and the question "which build is this" must have an answer on screen. The package version is the milestone (0.4.x = M4). Scratch probes live in the git-ignored `output/`, never in the repo.
41. **The save is a pure format in the sim and three calls in the app** (M5, D1–D2). `sim/save/format.ts` has the type, the frozen defaults, a key-ordered serializer, a parser that never throws, a migrations table and field-by-field sanitising, and `collect`/`apply` against a world, so every rule has a Node pin; `app/save.ts` owns `loadData`/`saveData`, the one-second throttle and the flushes at the breaks and on `pagehide`. One key, one document: the SDK's 1 MB cap is counted over the store, and a version field means an update never chooses between wiping players and parsing every old shape. A document of a newer version is kept verbatim and never written over. The cold open's `seen` is written as it starts, so the first minute is shown once per profile even across a reload.
42. **Jobs are placed by the generator, clearance checked lazily** (M5, D4). Markers stand on the grid junctions' corner aprons, off the carriageway, where the billboard placer's `tallFootprint` finds nothing between the kerb corner and the ring. A candidate's chunk is generated only when it is about to be picked (farthest-point sampling from a seeded start), so boot generates tens of chunks, not the island's 49. Limits and payouts come from the lane path at the lanes' limits (D5), never from a table.
43. **The arrow lies in a plane tipped toward the camera** (M5 slice 1). A horizontal chevron above the roof is edge-on to a chase camera behind and below it; tipping its plane 45° toward the camera and turning the chevron inside that plane to the bearing makes ahead read as up the screen and behind as down, at every heading.
44. **The traffic guarantees an order's car, and keeps it** (M5 slice 2, D7). `Traffic.ensure` repaints an unseen driving civilian of the class 300–600 m away or spawns one out of view through `claim`; `Traffic.wanted` exempts it from the despawn radius and from `claim`, and it cruises at half its lanes' limits (a guide plan renewed every step) so a hunter can close on it. Life tells `Jobs.onSwap` before the record changes hands, so the job never reads a record that has become the car left behind.
45. **A forced chase has a radio window** (M5 slice 3). `Pursuit.force(radioSeconds)` keeps the player seen for 8 s: units spawn out of view by rule, and without the window an escape marker's pursuit went straight to `lost` and paid its bounty on the cooldown with no chase.
46. **The garage is DOM pages on the wall, driven by `WallNav`** (M5 slice 4, D9). `ui` may not import `input`, so `App` maps the frame's action edges onto `{left, right, confirm, back}`; every item is a button whose click runs the key's handler. `App` is the only caller of `Garage` and of the ads; the UI reports intents through `GarageActions`. The garage car is applied when the door shuts, so a purchase or a respray is seen on the car behind the door.
47. **The garage spends the bank and the coins** (M5 slice 4). DESIGN.md §3.3's first car counts both; `Run.funds` is their sum and `spend` takes the bank first. The pools stay apart (D14): coins never enter the bank or the bag.
48. **The date is data, and it seeds today's police** (M5 slice 6, D3). The app passes `YYYY-MM-DD` to `Dailies.setDate` at boot and once a minute; the streak moves by the civil calendar computed from the string. The same seed orders each fixed site list in `cover.ts` and mans a share of it today (roadblock chokepoints and parked-patrol junctions 60 %, cameras 80 %); nothing is placed or removed, and jobs, coins and ramps never move. Test sessions without `?date=` draw nothing and man every site, so the M4 suites and the perf runs do not change with the calendar.
49. **The balance script steps the sim** (M5 slice 7, D12). `npm run balance` measures the busted rates with the bot policies under the police, then runs DESIGN.md §2.7's model on them; `vite.config.ts` excludes it from every other vitest run (it runs when `BALANCE=1` or under that npm script's name, without a new dependency).
50. **Whole-buffer updates orphan the buffer** (M5.1). Chrome's ANGLE on Direct3D 11 waited out a `bufferSubData` over a whole buffer the GPU was still reading: 0.3-1.7 s stalls in the GPU process on the MX330. `Renderer` wraps the context's `bufferSubData` so a write at offset 0 without a range re-specifies the storage with `bufferData` (the driver orphans the old one); range writes are untouched.
51. **Heat is fed by what the police see, and the police are always there** (M5.5 slice 0, DESIGN §13.3). `POLICE.budget[0]` is 2: two saloons drive their lanes at heat 0 with the lights off, recycled near the player, watching. `Heat` asks `Police.crimeSeen()` for every crime it reads from the ring: seen, the points double and never leave the player below level 1 (a cop who saw it comes after you, GTA's rule); unseen, the ratchet rises quietly. Reckless driving counts (a civilian rammed off its lane, once per car per cooldown; speeding within a patrol's sight; the chase's drip while the pursuit is active, NFS's rule). Fault follows speed: a contact is the player's crime only when the other car was not the faster one, because the beat's patrols brake late for a stopped player and a rear-ending cop must not make the player wanted; the police read the contact two steps after it, so both speeds come from a decaying maximum. The level-up is an event (`heatLevel`) for the ticker and the siren sting.
52. **A coin is attached to a goal or it does not exist** (M5.5 slice 1, DESIGN §13.5). The static layout is the gate line through a billboard and the arc over a ramp, nothing else: the trails, fillers and sweeps of §3.5 are deleted, not tuned down. Everything else is a run-time pool with its own id range in the extras (`rings`, `caches`, `route`) laid and cleared by tag, so the view rebuilds one list and a cleared pool's ids come back clean. A job's route is laid whole at its start (D3) from the lane chain to the target: runs where a decision is (into and out of every turn, every 80 m of straight), the cap on the target taken by arriving; every coin taken pays the tip. The day's caches are the same pattern as the daily police (record 48): a fixed candidate list from the graph, the date seed's pick, the finds in the save. The intro's line follows the same rhythm.
53. **Driver personality is drawn at spawn into the record** (M5.5 slice 3, D6). `drawDriver` draws each civilian's pace (a share of the lane's limit from a weighted table), whether it is a bad driver, and its time gap, from the traffic's seeded dice; flinch, pull-over and temper are timers on the same record. The planner reads arrays it already indexes, so there is no allocation and the tours and the balance script stay deterministic for a seed.
54. **The police driving mode is a predicate, not a second follower** (M5.5 slice 4, D7). `Traffic.fast(i)` is true for a unit with a chase plan or a racing rival; the one lane follower then runs the junction box, pulls away at ×1.5 and goes round slower cars. Racers (slice 11) and the lights (slice 17) reuse it: a unit on a chase runs a red.
55. **Catch-up only out of view** (M5.5 slice 4, D8). `pressureSpeed` gives a unit in the player's view cone the player's speed plus the pressure, never the catch-up speed; out of view it may catch up. A rubber band the player can see reads as cheating (NFS Heat); GTA refills and catches up out of sight.
56. **A traffic car has a body and a class** (M5.5 slice 19, D10). `Traffic.body` is what it looks like and how big it is (`BODIES`, appended and never renumbered: a descriptor packs the body index over the paint); its class is how it drives, swaps and is policed. The first five bodies are the player's classes in their own shells, so a class's index is its shell's and descriptors written before the bodies still read. A bus or a truck swaps into the van stretched to its body, every force scaled with the mass.
57. **Occlusion is a sim query the camera asks** (M5.5 slice 7). `SimWorld.clearFraction` casts one ray against the solid statics (never traffic or props) and returns the clear share of the segment; the chase camera's occluder and the takedown's side cut (slice 17) read it. The sim is not written and the renderer imports no Rapier.
58. **The helicopter is a sight, not a unit** (M5.5 slice 9). It has no traffic record and no collider: a position, a searchlight and a line-of-sight ray against fixed colliders (the covered streets and the overpass decks block it). The budget keeps its place from its level on, so its arrival never sends a car home.
59. **Every activity is a job** (M5.5 slices 10–13). Trials, races, the rage and mayhem zones and fares are kinds of `JobDef` on the one state machine (marker, start, clock, pay, card); each kind adds a reach rule and a pay rule. Placement appends the new kinds after the sixteen launch jobs, so the baked table's earlier defs, their descriptors and every pin on them stay as they were. A fare's def lives only for its ride.
60. **The skill chain banks through the ring** (M5.5 slice 14). `Skill` never touches the bag: a clean end pushes `skill` with its pay and `Run.onEvent` adds it, so the door's and busted's rules (no bag after the door shuts, the fine) hold for the chain as for any crime. The hunts' set rewards go to the bank the same way (`hunt`).
61. **A hidden car is a body the spawner never draws** (M5.5 slice 16). The ice-cream truck is a civilian body with a spawn share of 0, placed at its stash by `Stash` while the player is near and unfound; driving it finds it. The garage keeps a `hidden` choice beside the class car, so PAINT and TUNE stay the class's and the save carries the find and the choice within v2.
62. **City furniture the job placement must not see is the renderer's** (M5.5 slices 17–18). The traffic lights' poles, the breakers' towers and the donut shop are drawn from sim descriptors, not added to the chunks' statics: the placement reads those statics, and the signal poles at the corners moved five markers and the baked table (caught by jobs pin 1.1). Street lamps and trees are decor without colliders already; the breakers' barrier is a collider the sim adds and removes itself.
63. **The traffic lights are a function of the traffic clock** (M5.5 slice 17). `signalPhase(node)` is the node's offset plus `Traffic.clock`, modulo the cycle: no state to save, deterministic in the tests, identical in the view. A car stops at its lane's end on red whether or not it has chosen its way on (the choice is made 6 m before the line, too late to stop from speed).
64. **Parked cars are on top of the pool** (M5.5 slice 17). The pool's capacity is the moving traffic's agents plus the bays' cap; `alive()` counts only the moving cars, so the density and the despawn rules are unchanged and a bay's car is the same car every time (a hash of the bay and the seed, not the spawner's dice). The donut shop reserves its bays for its cruisers.
65. **The balance script measures a player, not a trap** (M5.5 gate). Its capture rates average the M4 reference seeds 42 / 7 / 123 (one seed's 180 s counts busts in steps of 0.33 a minute, and one bust more or less moved the novice's optimum two levels), and after a card the heat comes back only once the car is 50 m from where it fell (a bot wedged in a queue at the lights was busted there every 13 s, eight cards for one trap). The assertions are the plan's, unchanged; the bot is the M5 road bot (the careful bot's overtake while chased made it a rammer, bag ×2.6).
66. **The garage keeps bodies; the tiers stay per class** (M6 slice 0, D4). `Garage.car/owned/paint` are keyed by `BodyId`: the catalogue's five, a civilian body kept at a door, a hidden car found, a rival's car won. The upgrades stay `tiers[CarId]`, applied on top of `bodyTuning(body)`: a tier 0 shell is its preset bitwise, every handling pin stands, and the save and the balance stay small. Save v3 migrated v2's `hidden`/`drive` into the owned and the car and reserved every M6 field (the kits, the board, the career) in one step (D11).
67. **The wanted board is counters and bits** (M6 slice 1, D1, D12). `Career` counts from the event log after the jobs step (a fare's def and a race's place are still there); `Board` holds only the beaten bits and reads everything else from the world (the chain, the medals, the jumps, the billboards, the best run, the cars). A rival's car is owned from the bits on every load, so a body drawn after a save still arrives.
68. **A rival waits at a kerbside bay** (M6 slice 1). The corners' rings were saturated (three of eleven rival rings fitted the 60 m rule), so a rival's ring is a parking bay in its turf: the bay reserved from civilians (`Traffic.reserveBayAt`), the rival's car parked there within 220 m, a 7 m ring, and a pull-up under 4 m/s starts the duel so driving past does nothing. The duel is `JobKind` 'duel' on the one state machine (record 59).
69. **A rival's record is never a swap candidate** (M6 slices 1–3, D9). `Traffic.rival` marks a duel's racer and its parked car, kept through the twins' swaps and cleared only when the record is freed; the garage never keeps a rival's body at a door. `Traffic.armour` gives a hunted rival the police's damage rule with its own factor (`impactDamage`, one pure function), and `Traffic.badge` makes a hit on Fake Frank a hit on a unit.
70. **The kit never reaches the handling** (M6 slices 6–8, D5–D7). The driver's kit (`Kit.on` per slot) is the player's and is drawn on whatever car they drive; the car's kit (`Garage.carKit`, the save's `[wheels, rim, spoiler, stance]`) belongs to a garage car and shows only while it is driven (`SimWorld.garageDriven`). Nothing reads either in `VehicleTuning`, heat or the descriptor. The day's pick is one known item by the date: no random sale.
71. **The horn is a verb** (M6 slice 7, D10). `horn` is an edge in the controls like `swap`; the sim consumes it once a press, `Traffic.honked` gives each civilian ahead in the lane a moment toward its kerb (the pull-over's lateral target, a cooldown per car) and the 'horn' event carries the worn horn for the sound.
72. **The test bot backs off a car that will not move on** (M6 gate). The bot-driven pins run on the traffic's moment, which any new record moves (slice 9's hidden cars did). A careful driver (`TrackBotTuning.careful`) and the cold open's scripted bot (`unblock`) held up 1.5 s under 2 m/s by a dead car or one facing them within 7 m back off 1.2 s with the wheel the other way and go round 3 m on the far side; a careful queue counts only cars facing its way. The M5 bot is left bitwise as it was, so every other bot pin keeps its baseline (given to all bots, the heat pin's novice lost level 3 at two seeds).
73. **Props take reserved records** (M7 slice 0, D6). `Traffic` keeps `PROP_RECORDS` (16) records above its pool for the stash's hidden cars and the rivals' parked cars (`spawnProp`): the spawner, the density count, `claim` and the traffic's dice never touch them, so a car standing 300 m away cannot move the traffic near the player (the M5.5 and M6 gates lost hours to bot pins flipped that way).
74. **The music is rendered once, offline** (M7 slice 2, D2). `audio/score.ts` is the score as data (eight bars, the layers by heat, the stings); `Music` renders each layer through an `OfflineAudioContext` a second after gameplay starts, then loops them from one start time: playing, fading by the heat and ducking under a sting allocate nothing. The bus sits under the master, so the ad mute and the player's mute take it.
75. **One arbiter for the top of the screen** (M7 slice 1, D3). The job line and its card, the intro's caption, the key hints and the news stack in one column (`ui/lanes.ts`); `arrangeTop` is a pure function of who wants to show and decides who does (the hints and the news wait under a card or a caption, the news with its clock stopped). The column stacks, so nothing overlaps by construction; the screens suite checks every driving state for intersecting HUD boxes.
76. **Skid marks are the renderer's, read from the wheels** (M7 slice 4, D4). `render/SkidMarks.ts` reads `WheelState` (contact, slip angle and ratio) and lays quads into a ring of 2,048 in fixed buffers, each quad's age faded in the shader; only the new range is uploaded, and only the written part is drawn, nothing once the newest mark has faded (the M7 gate: an empty ring was a draw call every frame). The sim is not written and knows nothing of marks.
77. **The save is version 4, one document with the settings** (M7 slice 3, D5). `settings` (music, effects, quality, radar north up) live on the world and in the save; a v3 document migrates to the defaults and a broken field falls back alone. A 0.6.0 build reads a v4 save as newer and plays on defaults without writing (the M5 rule), so a downgrade loses nothing.
78. **The money is fitted in the model's quick half** (M7 slice 10, D8). `tests/sim/model.ts` is the EV table and the first hour, pure; the balance script measures the inputs with the bots (the novice the careful bot) and calls it; the quick pin runs it on the last gate's inputs. The model pools measured capture rates that fall with the level (a level's police have all the level below has; three seeds count busts in ninths), so a price or a multiplier is fitted to the police, not to a seed's luck.
79. **The city's decisions are data before they are statics** (M7 slices 11–12). An authored road's frontage lots are computed once a road (`City.frontage`), so a lot knows it is a corner or the road's landmark; a chunk's quarters and lots are planned from the chunk's random stream before anything is built (`City.plan`), so the big map's footprints read the same decisions without building chunks. Both keep the generator's output bit for bit (the layout hash of every collider, billboard and coin, pin 11.1).
80. **The rivals' teaser is off in the test worlds** (M7 slice 13). The next rival's car cruises their district as a pool record (never a prop, never a swap candidate), placed out of sight and routed at each junction to lanes of the district (`Traffic.route`, the race plan's way of choosing an exit, the speed left the car's). It moves the traffic near it by design, so the test helper's worlds turn it off (`SimWorldOptions.teasers`) and the bot pins keep their baselines; its own pin turns it on.
81. **Standing props are pieces of the chunk meshes** (M8 slice 0, D5). A lamp post, a sapling, a bin or a bench that stands is built into its chunk's part mesh like a building: its model's parts (`render/propMesh.ts`) as statics carrying its id, all in one part by where it stands, consecutive, so `GeometryBuild` records one vertex range per prop per level (`userData.props`). Tall kinds are in the shadow casters' prefix and both levels; small kinds only in the near level, casting nothing. Standing props cost no draw call; a knocked one's range is collapsed and its kind's instanced mesh draws it.
82. **A chunk's props come after its statics** (M8 slice 0, D7). `City.props(cx, cz)` places a chunk's props the first time it is asked, from the chunk's own stream, against a rule (`City.propRule`) that needs the job rings and the cold open's route; their placement reads chunk statics, so the props cannot be part of `generate` (the plan's `CityChunk.props`). The world sets those keep-outs (`setPropKeepOut`) before its first sync; the props are never statics, so the billboards', the jobs' and the coins' placement (and the layout hash) never see them.
83. **The contact with the street furniture is the sim's, decided before the solver** (M8 slice 1, D1). A static collider would stop the car dead at any speed and a sensor would knock a prop a step late, so `Props.step` sweeps the car's footprint (an oriented rectangle grown by each prop's radius) over the step against the grid's standing and lying props and applies the two-body rule in closed form: the car's `setVelocity` takes the loss, a pool body takes the prop with its launch. Deterministic, pinned in Node like the handling; every number is in `PROPS` and the catalogue.
84. **An anchored prop that holds is a wall** (M8 slice 1, D2). Its post is a fixed collider on its chunk's body (restitution 1, as the buildings'), so below its base's strength the solver stops the car on it and `Life` classifies it as a wall: the hit, the damage, the chain lost. A knock disables the post; the heal enables it. Props are their own collision group (`GROUP_PROP`): the suspension rays, the police's and the helicopter's sight and the arrest slots' rays exclude it (`QUERY_NOT_PROP`), so a lamp post is never ground and hides nobody.
85. **Sixteen bodies, and a knock never fails** (M8 slice 1, D3). A knocked prop flies on one of 16 dynamic bodies (CCD, its kind's collider made at the knock, its centre of mass at its row's height) until it settles, then lies drawn and unsimulated; with the pool empty it flies an analytic arc and lies flat where it lands. The frame's physics cost is capped by the pool; the only allocation per step is Rapier's reads of the flying bodies.
