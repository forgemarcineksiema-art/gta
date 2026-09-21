# M3 mid-milestone review (slices 0–3)

Reviewer: Claude, 2026-09-21. Reviewed: branch `grok/m3-life` at `64b8724`
(five commits over the plan at `d3f4455`), `docs/M3_STATUS.md` and the
session-15 entries of `docs/PROGRESS.md`. Method: every diff read against
`docs/M3_PLAN.md` §3.3, §4 and §10; `npm run verify` re-run (green, 126
tests, smoke 59.2 fps / p95 16.7 ms / 90 draws / 191k triangles, 3.44 MB);
`npm run perf` twice on this build; and a 90 s headless measurement of the
things the slice tests do not pin (yaw of lent bodies, lane transitions of
lent bodies, traffic flow). The measurement script is not committed; its
numbers are quoted below and are reproducible from the description.

Verdict: slice 0 and slice 3 are acceptable with nits. Slices 1 and 2 are
not: the traffic on this branch mostly stands still, and every car that
gets a physics body spins and never leaves its lane. Fix B1–B4 before
starting slice 4, add the pins listed under each, and re-record the
numbers. Nothing below changes the plan; it enforces it.

## Blocking (fix before slice 4)

### B1. The yaw controller of lent bodies diverges

`Traffic.driveBody` (`src/sim/traffic/Traffic.ts:504`) sets the body's
angular velocity to `4 · err − 2 · angvel` every step. That is a recurrence
with multiplier −2: with a 1/60 s step its eigenvalues are 0.98 and −2.05, so
any non-zero heading error grows by two every step with alternating sign.
On a straight lane the error is zero and nothing shows; at the first curve
or junction connection the car starts to spin.

Measured (90 s road-bot drive, seed 42, density 1): max |angvel.y| of a
Physical agent 46 rad/s; 9,634 of 11,975 physical agent-steps (80 %) had
|angvel.y| > 2 rad/s; max heading error 179°; 2,063 agent-steps (17 %) had
an error above 30°. Every car within 40 m of the player is affected.

Fix: a proper rate-limited heading controller, for example
`angvel.y = clamp(err × gain, −maxYawRate, maxYawRate)` with `gain` around
3 and `maxYawRate` around 1.5 rad/s, or a PD applied as a torque; either
way the update must be stable at 60 Hz (|multiplier| < 1). Numbers go into
`TrafficTuning`.

Pin (add to `tests/sim/traffic.test.ts`, LOD test): over the 60 s drive no
Physical agent ever has |angvel.y| > 2 rad/s and its heading error against
`positionAt(lane, s + 8, …)` never exceeds 25°.

### B2. Lent bodies never move to the next lane

The lane transition lives only in `advance()` (`Traffic.ts:860`), which runs
for Kinematic agents. `pullPose` re-projects a Physical agent onto its
current lane, so `s` clamps at the lane end, the 8 m look-ahead target sits
on the connection curve, the body reaches it and then oscillates around it.
The car is stuck at the lane end until the player is 60 m away and the body
is returned.

Measured: 0 lane changes by any Physical agent in 90 s; one agent sat at its
lane end with `next` chosen for 14.0 s continuously. In play this reads as
"cars stop at every junction as soon as I come near", and the queue behind
them stalls the block.

Fix: the path-following state machine must be shared. Move the "past the
lane end, past the connection, switch lane" logic out of `advance` into a
function used by both the kinematic integrator and `driveBody`; for a
Physical agent derive `s` along lane + connection (project on the
connection samples when `s ≥ length`), not on the lane polyline alone.
Junction reservation, `mayEnter`, `highwayApproaching` and `claimNode` must
run for Physical agents too (today only kinematic ones wait at junctions,
and `highwayApproaching` counts only Kinematic highway cars, so the cars
the player can actually see ignore every rule).

Pin: in the LOD test, count lane changes of Physical agents (> 0 over 60 s)
and assert no Physical agent spends more than 3 s with `s ≥ length − 1`
while `next ≥ 0` unless it is waiting at a reservation (`wait > 0`).

### B3. Traffic mostly stands still

Measured over 90 s (kinematic agents): mean speed / lane limit 0.35; 58 % of
agent-steps at speed < 0.5 m/s; highway mean speed / limit 0.50; `waitedPast`
102 (agents that gave up after the 6 s junction wait). `M3_STATUS.md`
reports "41 cars entered a junction only after waiting 6 s" in 60 s as a
fact; it is a symptom. The plan's 6 s override is a deadlock breaker, not a
throughput mechanism.

Causes found in the code, in order of weight:

1. `aheadGap` (`Traffic.ts:792`) has no lateral test: any agent 2–14 m
   ahead along the heading, at any side distance, counts as a leader with
   gap `dist − 4.5`. Two-way streets have their lanes 9 m apart and the
   highway sub-lanes 8 m apart, so an oncoming car 10 m ahead in the other
   lane makes the agent brake to ~6 m/s, and a car alongside on the
   highway's other sub-lane stops it. Fix: express the other car in the
   agent's frame and require |side| ≤ half the lane spacing (about 2.6 m,
   use `playerLateral`) and a heading within 90° of the agent's own.
2. B2: stuck Physical cars at lane ends block everything behind them.
3. The reservation is held from `claimNode` until the holder is
   `junctionClear` (26 m) along the next lane or 8 s pass; with junction
   speed 8 m/s a turn occupies the node for ~5 s, and every non-highway
   entry needs the node, so a busy crossroads serialises to one car per
   5 s. After 1 and 2 are fixed, re-measure; if the stopped share is still
   above 15 %, allow non-conflicting movements to share a node (two agents
   whose connection curves stay more than 6 m apart) before touching the
   wait time.

Pin (new test in `traffic.test.ts`, 60 s bot drive, density 1): mean speed
/ limit of Kinematic agents ≥ 0.6, stopped share ≤ 0.15, `waitedPast` ≤ 5.
These are behaviour bands, not tuning pins; record the measured values in
`PROGRESS.md`.

### B4. A wreck drives away after ten seconds

`syncBodies` (`Traffic.ts:362`) returns a Wrecked agent's body after
`wreckLinger` through `releaseBody(i, true)`, which sets the state back to
Kinematic; `integrate` then accelerates it to the lane limit and the LOD
lends it a body again, where `driveBody` drives it at full speed. The plan
says a wreck is a stopped obstacle until it despawns, and slice 7's takedown
test needs that. Also, `TRAFFIC.wreckImpact` (a Δv that wrecks a disturbed
car outright) is defined but unused.

Fix: keep `state = Wrecked` after the body is returned; skip Wrecked agents
in `nearestKinematic`, `integrate` and lane lists; keep them in
`aheadGap`/`unstick` so others avoid them; despawn by distance as usual.
Implement `wreckImpact` in `senseImpact`.

Pin: after a wreck, 15 s later the agent is still Wrecked, its speed is 0
and it has moved < 0.5 m.

## Non-blocking (fix in the next slice you touch the file, or backlog)

- N1 `Life.hits` (`Life.ts:84`) pushes a `hit` event on every step with
  contact, so a scrape along a wall or a car floods the 64-entry ring at
  60 events/s and can evict near-miss events before a slow frame reads
  them. Push `hit` on the step the contact starts (the previous step had
  `impact` 0) or when `impact > wallHitSpeed`, not continuously.
- N2 `readFrom` callers allocate a closure per frame (`hud.ts:217`,
  `Sfx.ts:17` and `:20`). The plan asked for a bound method. Bind once in
  the constructor.
- N3 `TRAFFIC.subLaneOffsets` is defined but `trySpawn` and
  `retargetOffset` hard-code −2 and 6; read the tuning.
- N4 `Life.oncomingLane` projects the player onto all 178 lanes every
  step; `City` already keeps lane bounds for exactly this. Reuse them (or a
  `City.nearestLane` that returns the lane id).
- N5 Deviation from the plan, acceptable but must be written down in
  `ARCHITECTURE.md` at the polish pass: driving bodies use
  `GROUPS_TRAFFIC` (no terrain contact) with vertical translation locked,
  and switch to `GROUPS_SOLID` when disturbed. Consequence to state: a
  driving traffic car passes through kerbs and the pavement apron, and a
  disturbed car more than 60 m away snaps back upright onto its lane when
  its body is returned.
- N6 `releaseBody` keeps the projected lateral offset, so a car nudged 3 m
  aside continues 3 m off its lane (half on the pavement) until the next
  junction. Reattach only within `reattachDistance`, else mark it Wrecked.
- N7 `unstick` runs twice per step and is O(n²) with `Math.hypot`; once
  after `syncBodies` is enough. Not a cost problem today (Node mean 0.56 ms
  per step) but it doubles the largest loop for nothing.
- N8 The T-bone test forces `state = Disturbed` every step and uses the
  `setFacing` hook, so it never exercises a Physical agent being hit. Once
  B1/B2 are fixed, T-bone a Physical agent and assert the same outcome.
- N9 Near-miss bookkeeping: `wasAhead` is only cleared when a wide pass
  happens within 12 m, so a car passed at 13 m keeps the flag and can
  score later from behind. Clear the flag whenever the agent is behind and
  farther than 12 m.
- N10 `screens.spec.ts` takes the life frame with the pause overlay still
  up (all ten `life-*.png` show PAUSED over the popup). Press `P` again
  before the life shot, or take it before pausing. The plan's life state
  also needs the damage bar, the swap prompt and the counter once those
  exist (slice 5, 6, 8).
- N11 `sim/index.ts` does not export `Traffic`, `AgentState` or `Life`;
  `App`, `TrafficView` and `trackBot` deep-import them. Export from the
  barrel like everything else.

## Process

- P1 The A/B rule of the plan (§5.5) was not applied to the slice 2 result.
  Step p95 5.8 and 10.6 ms against bases 4.9 and 3.3 ms is "both new worse
  than both base", so by the plan's own rule it is a regression to report
  as such and profile, not a "throttled hitch". The Node mean (0.56 ms)
  measures the average step, not the p95 the browser reports with several
  substeps in a frame. B1 is a plausible contributor (spinning CCD boxes).
- P2 Frame max 1,850 ms and 917 ms in the perf runs were mentioned as "one
  spike" and left there. A 1.85 s frame in a 60 s run is a bug to find,
  not a footnote; profile it after B1–B4 (it may be gone).
- P3 `docs/M3_STATUS.md` and the matching `PROGRESS.md` entry are
  uncommitted and the branch has five unpushed commits. Commit docs with
  the work they describe; push at least at every session end.
- P4 Reporting was otherwise good: numbers are measured, the tests mostly
  follow the plan's list, decisions are written with reasons, and the
  places where the code deviates from the plan are stated. What is missing
  is the judgement that a number is bad: "41 waited 6 s" and "1,850 ms max
  frame" were reported without a verdict. When a measurement looks wrong,
  say so and either fix it or list it under open problems.

## Reviewer's perf runs (this build, headless MX330, CPU ×4, 60 s)

See the table below; two runs, compared against `perf/m3-base-1.json` and
`-2.json` per §5.5.

| Run | fps | frame p95 / p99 / max ms | step p95 / max ms | draws | tris | heap MB | resets |
|---|---|---|---|---|---|---|---|
| base 1 (`m3-base-1.json`, before traffic) | 56.1 | 16.8 / 50.0 / 150 | 4.9 / 82.7 | 84 | 162k | 48 | 0 |
| base 2 (`m3-base-2.json`) | 58.5 | 16.8 / 33.4 / 100 | 3.3 / 35.5 | 83 | 176k | 48 | 0 |
| review 1 (`64b8724`) | 58.1 | 16.8 / 33.4 / 83 | 6.3 / 36.2 | 90 | 202k | 51 | 1 |
| review 2 (`64b8724`) | 55.4 | 33.2 / 33.4 / 667 | 8.5 / 38.5 | 90 | 202k | 51 | 1 |

Reading, by the §5.5 rule: fps is within the ±3 noise band; draws +6 and
triangles +26–40k are inside the expected deltas; step p95 is worse in
both new runs than in both bases (+1.4 to +5.2 ms), which is a real
step-cost increase to profile after B1–B4 (Grok's own runs read 5.8 and
10.6 ms; sixteen CCD-enabled boxes spinning at up to 46 rad/s are the first
suspect); one 667 ms frame in run 2 against ≤ 150 ms in the bases, and 917
and 1,850 ms in Grok's runs, so this build hitches; the bot reset once in
every run with traffic (it ploughs into cars stuck at lane ends, B2/B3).

## What to do next, in order

1. B1, B2, B3, B4 with their pins; `npm run verify`; `npm run perf` twice;
   record the flow and yaw numbers in `PROGRESS.md`; commit and push.
2. N1, N2, N3, N10 (small, same files).
3. Continue with slice 4. The remaining N items go into the slice that
   next touches the file, or into `docs/BACKLOG.md` with one line each.
