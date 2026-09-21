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
