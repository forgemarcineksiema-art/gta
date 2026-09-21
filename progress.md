Original prompt: Rozpocznij pracę nad M2.

Session details and milestone evidence live in `docs/PROGRESS.md`.

- Baseline: `npm run verify` passes, 81 tests; startup 869 ms, 3.34 MB.
- M2 scope: seeded city, streamed scenery/colliders, directed lanes and a road bot,
  four districts and a highway loop, minimap, fog, adaptive quality, whole-map gates.
- Keep the M1 playground selectable; do not retune the approved vehicle.
- Implemented the full M2 slice, with 168-lane tour, independent collision/render
  streaming, district geometry, minimap, automatic and locked quality tiers.
- `verify`: green, 85 tests, 3.35 MB; whole-map low/high scene budgets pass.
- Reviewed player-camera images from the skill client and all five named city spawns.
- Skill client used unchanged from an ignored local copy because the installed
  skill's Playwright version requested an unavailable older Chromium binary.
- Gate report: `docs/M2_REPORT.md`. M3 waits for the user's city playtest.
- Frame-time p95 gates pass; sustained 60 fps is not established. Isolated long
  frames remain in real-time runs; evidence and profiling boundaries are in the
  gate report and `docs/BACKLOG.md`.

## M2.1 — 2026-09-21

User asks for considered city/street scale, building variety, ground floors,
sidewalks, recognisable places, coherent facade/sky colours, stable shadows and
less reactive steering-camera motion. This is the current M2 playtest feedback.

- Baseline verify green: 85 tests, smoke 964 ms, real GPU, 3.35 MB.
- Player-camera baseline: `output/design-review/before/`; named district spawns and
  a repeatable acceleration/steering pulse, no console errors.
- Implemented metre-based district architecture, actual narrow sidewalks and paths,
  parking shoulders, roof/balcony variety, reserved landmark plazas, muted facade
  bodies/sky lighting. Same road graph and vehicle tuning.
- Fixed shadow-map coverage, texel alignment, soft edge fade, all resident casters.
- Camera follows actual motion, no direct steering feed-forward; reduced yaw lead,
  lateral aim, shake and FOV pumping. New comfort tests replace the superseded M1
  tests that demanded exaggerated steering anticipation.
- Initial new-code verify green: 88 tests. Full-map and final visual gates ongoing.
- Session 9 (Claude) finished the pass: corner caps, trim/balcony face sets,
  quartered chunk meshes with per-part culling, 180 m detail radius. Low tour
  77 calls / 109k triangles, high 105 / 149k; verify green, 88 tests; A/B perf vs
  M2 within run-to-run noise. Details in `docs/PROGRESS.md` and `docs/M2_REPORT.md`.

## M2.2 — 2026-09-21

- Authored 4 km loop (two diagonals, chicane, two arcs) as polyline lanes in the
  same graph; open quarters with frontage rows; taller landmarks and a skyline
  silhouette layer; quay piers. Streaming: one physics chunk per step, one
  geometry build per frame, both detail levels resident. Startup gate measures
  navigation start to first controllable frame (2.7 s typical at CPU ×4).
- Gate: verify green (88 tests), city 5/5 (178 lanes; low 80 calls / 139k tris).
  Details in `docs/PROGRESS.md` session 10 and `docs/M2_REPORT.md` § M2.2.

## Vehicle model quality — 2026-09-21

User request: "Chciałbym, żebyś zrobił porządnie i fajnie modele samochodów.
Tak, aby pasowały do gry. Naprawdę mają dobrze wyglądać."

- Baseline verify green: 92 tests; MX330 smoke 59.8 fps, p95 16.8 ms.
- Rebuilt the three existing vehicle classes around true wheel openings, framed
  glazing, exposed alloy wheels, class-specific fittings and palette colours.
  Fixed buried rims and triangle/decal intersections found in close-up review.
- Complete cars: muscle 6,118 triangles, compact 5,765, heavy 6,404; five meshes
  each (previously 14/11/11). Physics and controls remain the existing presets.
- Baseline and final player-camera / detail views in
  `output/design-review/cars-before/` and `cars-final/`; scratch reviewer is
  `screens/car-review.mjs`. Nine geometry/light checks pass.
- Skill client is the unchanged existing local copy in `screens/`, using this
  project's Playwright. Driving images and state are in `cars-drive-v2/`,
  `cars-compact-drive/`, `cars-heavy-drive/` under `output/design-review/`.
- Final verification and runtime gates recorded in `docs/PROGRESS.md`.
