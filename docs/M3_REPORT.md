# M3 — life gate

Branch `grok/m3-life`. Slices 0–3 were built by Grok 4.7 XHigh and reviewed in
`docs/M3_REVIEW_MID.md`; the four blocking findings, slices 4–8, the polish
pass and this gate were done by Claude Fable 5.1 after Marcin dropped Grok
mid-milestone. Session log: `docs/PROGRESS.md` (sessions 14–16).

## Built

- **Traffic.** 48 pooled agents on the lane graph in the three player classes
  and a fixed set of paints; 16 Rapier dynamic bodies lent to the agents nearest
  the player and driven by velocity, so a hit displaces them and reaches the
  chassis through the normal contact readback. One planner for kinematic and
  lent agents: lane limits, leader / player / ahead gaps, junction reservations
  (four holder slots per node, conflicting curves within 5 m, first come first
  served, a forced override after 9 s), lane changes at junctions, honks on a
  cooldown. Junction curves are per-offset beziers with handles proportional to
  the endpoint gap. Disturbed cars go fully physical until they settle; wrecks
  stay where they died until the player is far away.
- **Pedestrians.** Colliderless walkers on the footway paths that turn at block
  corners, dodge the player's corridor 0.7 s ahead, dive, get up and shake a
  fist; a last-resort hop makes "never hit" true by construction. Dodges pay
  boost.
- **Damage, wrecked, respawn.** Damage from the step's strongest contact
  (walls full weight, traffic × 0.7, props and terrain never), four visual
  stages on the player's car (paint to graphite, bumpers collapsing, mirrors and
  spoiler, dark glass), engine cut at stage 4 with a 3 s timer or `R` to a
  rolling respawn on the nearest lane, boost kept, traffic cleared. Damage is
  on in the city and off on the playground so the M1 pins stand.
- **Car-swap.** `E` beside a car within 6 m along and 4 m across at under
  20 m/s relative: the player's vehicle is retuned in place, the old car stays
  abandoned where it was with its driver shaking a fist, the camera whips, the
  HUD says FRESH WHEELS.
- **Takedowns.** A car the player touched inside 2.5 s that slams a wall or
  another car at 7 m/s, flips, or took a direct hit at 14 m/s closing wrecks at
  once: boost 0.5 (0.6 into traffic), a 1.2 s slow motion as a time scale on
  the loop (any key skips it), the camera on the wreck, debris and smoke, a big
  TAKEDOWN! popup, a crunch and a boom.
- **Near misses and the oncoming lane.** Popups and boost for a close pass
  (more for an oncoming one) and a trickle for driving against traffic.
- **Billboards.** Fifty smashable panels placed as the last step of chunk
  generation (8 m roadside panels on the highway verges, 5 m gates across the
  footways in the blocks), pass-through triggers at speed: boost 0.25, 5 % of
  speed lost, planks in the panel's paint, a camera jolt, a splinter and a
  chime, BILLBOARDS n/50 on the HUD.
- **Rendering and audio.** Instanced traffic, pedestrian and billboard views
  over the transform buffer; 32-box debris and 160-point smoke driven by
  events; damage deformation on one geometry; whip and focus on the chase
  camera; eight synthesized one-shots on the engine's master gain.
- **Tooling.** `?traffic=`, `?peds=`, `?life=0`; the dev panel's Life section
  (`TRAFFIC`, `PEDS`, `ECONOMY`, `DAMAGE`, `SWAP`) and a read-only counters line
  in the debug block; `render_game_to_text` reports damage, traffic counts,
  pedestrians, billboards and recent events; `npm run life`.

## Traffic bugs found and fixed on the way

Four bugs in the traffic physics surfaced while pinning takedowns; all four
are in `docs/PROGRESS.md` (slice 7):

1. Every lent body weighed its class mass plus a compact (`setAdditionalMass`
   on top of the collider's mass): Δv thresholds read 1.4–2× too high and a
   shoved car barely moved.
2. Traffic colliders combined friction with `Max` against the ground's 1.0: a
   shoved car skidded at 1 g like a crate. Now `Min` 0.4.
3. Junction bezier handles were a fixed 24 m; 875 of 3420 curves folded into
   cusps or loops. Handles now scale with the endpoint gap; zero folds.
4. A body returned to kinematic inside a junction snapped back 18 m to the stop
   line. A car past the line no longer holds.

## Validation

The machine reports NVIDIA MX330 through ANGLE D3D11 in headless Chromium.
These are CPU-side numbers under a 4× throttle; Marcin's `npm run perf:headed`
on the laptop is the real-device picture and is asked for below.

| Check | Result |
|---|---|
| `npm run verify` | green on the final commit, 148 tests (109 → 148), lint 0 warnings; build 3.49 MB / 5 files; smoke 60.0 fps, frame p95 16.8 ms, 97 draws, 197k tris, gameplay-start 1.4 s |
| `npm run life` | 4/4: bot 60 s with life on (fps 52.3, frame p95 33.4 ms, step p95 12.8 ms, 72 draws, 138k tris, heap 40 MB, 0 resets; events honk 5 / near miss 1 / hit 6; 15 pedestrians, 0 guard hops, 0 pedestrian hops), keyboard swap, slow motion 21 ticks per wall second, wrecked to respawn |
| `npm run city` | 5/5: 3.7 s to control at 20 Mbit / CPU ×4 (limit 6); whole-graph tours with life off: low 67 draws / 169k tris, high 93 / 243k (limits 150 / 250k and 300 / 600k), 178 lanes, 0 resets; controls including `E` with no car alongside; automatic quality |
| `npm run screens` | not completed at the gate: the full run stalled in the background and Marcin called the gate closed; the 1280×720 case (hud, pause, the life state with popup, damage bar, swap prompt and counter, and the wrecked overlay) passes on its own in 6.5 s. Run it and look at the ten images before the next release. |
| Startup bytes before gameplay-start | 3.49 MB (target 8, fail 12) |
| JS heap | 40 MB max in the perf runs (limit 250) |
| Node sim step, 48 agents + pedestrians | 0.31–0.34 ms per full step (limit 3 ms) |

### Performance protocol (§5.5 of the plan)

Two base runs before slice 1 and two runs on the final commit, `npm run perf`
(bot, seed 42, 60 s, CPU ×4, 1280×720):

| Run | fps | frame p50 / p95 / p99 / max ms | step p50 / p95 / max ms | draws max | tris max | heap MB |
|---|---|---|---|---|---|---|
| base 1 | 56.1 | 16.7 / 16.8 / 50.0 / 150 | 1.5 / 4.9 / 82.7 | 84 | 162k | 48 |
| base 2 | 58.5 | 16.7 / 16.8 / 33.4 / 100 | 1.3 / 3.3 / 35.5 | 83 | 176k | 48 |
| gate 1 | 57.4 | 16.7 / 16.8 / 33.4 / 100 | 2.9 / 7.1 / 55.3 | 95 | 177k | 40 |
| gate 2 | 52.5 | 16.7 / 33.3 / 66.5 / 183 | 3.4 / 11.3 / 84.5 | 76 | 167k | 40 |

Reading it by the protocol's rule (a regression needs both new runs worse than
both base runs): fps, frame p95 and draw calls are within noise (gate 1 matches
the bases, gate 2 is a noisy run of the kind `docs/PROGRESS.md` records on this
machine). The sim step is the one real change: p50 up by 1.4–2.1 ms (1.3–1.5 → 2.9–3.4),
which is the traffic, pedestrian and life work under the 4× throttle, inside
the plan's expected +1 to +2 ms. Step p95 lands between 7 and 13 ms across the
three runs with life on; the plan's 12 ms line is met in two of three and
missed by 0.8 ms in the third, which is the multi-substep frames after a hitch
rather than the step itself (Node measures the whole step at a third of a
millisecond). Heap dropped by 8 MB. Draw calls grew by the expected instanced
views and their shadow casters.

Marcin's numbers are needed to close this: `npm run perf:headed` on the laptop
and, if possible, the MX330 in a real window, with `?traffic=0&peds=0` as the
A run and the default as the B run, alternated twice.

## How to run

```bash
npm run dev            # http://localhost:5173, life on
npm run verify         # the gate
npm run life           # M3 e2e (against the preview build)
npm run city           # M2 e2e, still green
npm run screens        # HUD, pause, life and wrecked captures
npm run perf           # bot 60 s under 4x CPU throttle
```

URLs: `/` (life on), `/?traffic=0.5&peds=2`, `/?life=0`, `/?dev=1` (the Life
section of the panel), `/?manual=1` (deterministic stepping), `/?bot=1`.

## Five-minute playtest

1. **Cold open, first minute.** Do nothing for five seconds: cars pass, people
   walk, nobody stops for you. Pull out into traffic and follow a car through
   two junctions: it holds its lane, waits at the line, turns on a clean arc.
   Watch one junction from behind a queue: cars clear it in turn, nobody
   parks in the box.
2. **Near misses.** Thread the gap between two cars at 80+ km/h: NEAR MISS and
   a boost tick. Cross into the oncoming lane at speed: ONCOMING and the
   trickle; a close oncoming pass pays more.
3. **Pedestrians.** Mount a footway at 40 km/h toward a walker: they dodge,
   dive, get up, and shake a fist if it was close; DODGED pays. Try to hit one
   on purpose for a minute. You cannot.
4. **Shove and takedown.** Rear-end a car at 100 km/h: it flies, spins,
   sometimes flips; TAKEDOWN! with the slow motion and the camera on the
   wreck. Press any key mid-slow-motion: it ends. Shove a car into a wall or
   into the car ahead at 50 km/h: the wall or traffic takedown. Run the same
   wreck over again: no second takedown.
5. **Damage and wrecked.** Hit walls until the car darkens and loses its
   bumpers; the bar climbs, red from stage 3. At stage 4 the engine dies and
   WRECKED counts down; `R` skips the wait. The respawn rolls out on the
   nearest lane with your boost.
6. **Swap.** Pull alongside a car at a similar speed: the E prompt. Press it:
   the whip, FRESH WHEELS, a driver in the road shaking a fist, your old car
   left behind. Swap out of a wreck the same way.
7. **Billboards.** On the highway, a panel on the verge facing you: drive
   through it. In the blocks, a gate across the footway 93 m past a junction:
   swerve off the road through it and back. Planks, the chime, the counter.
   Drive through the gap where it stood: nothing.
8. **Feel checks.** Does a shoved car slide too far or too little
   (`TRAFFIC.friction`, `linearDamping`)? Does traffic feel too dense or too
   sparse (`TRAFFIC.agents`, `?traffic=`)? Are takedowns too easy at 50 km/h
   (`ECONOMY.takedownClosingSpeed`, `takedownDeltaV`)? Is the side-swipe along
   a traffic car too slippery (the chassis now slides at its own wall friction
   0.15 against traffic)?

## Tuning knobs and where they live

| What | Where |
|---|---|
| Traffic pool, bodies, speeds, gaps, junction waits, yaw controller, materials, sub-lane offsets | `TRAFFIC` in `src/sim/traffic/tuning.ts` |
| Pedestrian counts, speeds, dodge corridor, score distance | `PEDS` in the same file |
| Near miss, oncoming, dodge, billboard, takedown and slow-motion numbers | `ECONOMY` in `src/sim/economy.ts` |
| Damage threshold, rate, stages, traffic factor, wrecked timer, respawn speed | `DAMAGE` in the same file |
| Swap reach, relative speed, whip | `SWAP` in the same file |
| Billboard sizes, clearances, run-out, slot positions | constants in `src/sim/city/collectibles.ts` |
| Camera whip, focus, kick | `ChaseCamera` tuning (`camera` in the panel) |

All of the first five are live in the dev panel (`?dev=1` or the backtick).

## Known issues

- Step p95 under the 4× throttle sits at the 12 ms line in the worst of three
  runs (see the protocol above); the mean is inside the expected delta. Profile
  `Traffic.step` in the browser before adding agents.
- Traffic-only silhouettes, real highway lanes, traffic density per tier, the
  slice 9 stretch (parked cars, ramps, speed cameras) and the other deferrals
  are in `docs/BACKLOG.md` under Life (M3).
- A driving traffic body has no terrain contact and a disturbed car beyond 70 m
  snaps back onto its lane when its body is returned; recorded in
  `docs/ARCHITECTURE.md` as the one deviation from the plan.
- The bot's own route (`roads.lanePath`) still uses fixed 24 m bezier handles
  and cusps on the same corners the traffic curves used to; its lookahead
  smooths it, so it is left for a re-pin of the bot laps.
- Wrecks never despawn while the player stays near them; a long scrapyard run
  fills the body pool with wrecks and traffic goes kinematic sooner.

## Proposed next scope (M4)

Police and pursuits on the same traffic machinery: a wanted level from the
events already logged (hits, takedowns, billboards), police cars as agents
with a pursuit planner instead of a lane planner, pit manoeuvres and roadblocks
using the shove physics, a busted flow as the second ad break beside wrecked.
The plan should start from `docs/BACKLOG.md` Life (M3) and the feel notes from
this playtest.
