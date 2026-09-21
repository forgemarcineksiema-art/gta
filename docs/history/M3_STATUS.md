# M3 status — slices 0–3

Mid-milestone report for branch `grok/m3-life`, 2026-09-21. This is not the gate
report. `docs/M3_REPORT.md` is written when slices 0–8 and the gate in
`docs/M3_PLAN.md` §7 are done.

Five commits ahead of `main`. The branch is five commits ahead of
`origin/grok/m3-life` and has not been pushed since slice 0.

## What is built

| Slice | Commit | What works |
|---|---|---|
| 0 | `b6bb791` | Shared `mulberry32`, 64-event ring, `swap` / `engineCut` / `setVelocity`, hit telemetry, transform buffer capacity 1024, `?traffic=`, `?peds=`, `?life=0` |
| 1 | `7e7c927` | 48 kinematic cars on the lane graph, junction reservation, three packed instanced meshes |
| 2 | `2e21892` | 16 dynamic bodies lent inside 40 m, hit classification, the road bot brakes for a slower car |
| 3 | `b965c37` | Near misses and the oncoming lane fill the boost meter (cap 1), a popup above the speedo, stings on the engine mute bus |

Latest `verify`: **126 tests**, build **3.44 MB**. Smoke: 90 draws, 176k triangles, frame p95 16.8 ms.

## Numbers

Perf baselines, before traffic (`perf/m3-base-1.json`, `perf/m3-base-2.json`): step p95 **4.9 ms** and **3.3 ms**, 83–84 draws, 162–176k triangles, heap 48 MB.

After slice 1, kinematic traffic: 54.4 fps, step p95 **6.2 ms**, **90** draws, **197k** triangles, heap 51 MB, zero bot resets. City tour with `?traffic=0&peds=0` still 5/5: control in 2.7 s, low 62 draws / 162,135 triangles, high 88 / 235,866, zero resets.

After slice 2, lent bodies: two runs, step p95 **5.8 ms** and **10.6 ms** (limit 12 ms). Node mean step with the pool is 0.56 ms, the same as without physics. An earlier run at 12.9 ms was rejected: cars resting on the ground collider made every step a contact.

Economy: one oncoming near miss grants **0.20** boost, a 3 m gap between the chassis footprints grants nothing, 3 s in the oncoming lane pays `3 × 0.10` within ±15 %, and a near miss from 0.95 lands on exactly 1. `npm run screens` is **10/10**. `ONCOMING!` sits above the speedo and does not cover the radar or the speed digits. The clean driving frame is `screens/life-821x462.png`. Several other life frames still show the pause title, because the life shot is taken immediately after the pause shot.

## Decisions that show up in play

Highway traffic going straight does not reserve a junction. Every car also brakes for another agent 2–14 m ahead, and a post-step pass pushes a car back along its lane if two occupy the same point. In a 60 s test, **41** cars entered a junction only after waiting 6 s.

A driving traffic collider does not touch the ground and has vertical translation locked. The box is tall enough to meet the player's chassis. After a hard hit the car collides with the ground and can tumble. The ground impulse does not count as a disturbance.

A near miss measures the gap between chassis half-widths, not the distance between centres. One metre between centres is already an overlap for these cars.

## Not built yet

Slices 4–8: pedestrians, damage and wrecked, car-swap on `E`, takedown slow motion, billboards. After those, the documentation pass and `docs/M3_REPORT.md`. Stretch content (parked cars, stunt ramps, speed cameras) stays behind the gate.

The build at `http://localhost:5173/` is this state: traffic on the streets, nearby cars physical, near misses and the oncoming label. No pedestrians, smoke, car-swap, or billboards yet.
