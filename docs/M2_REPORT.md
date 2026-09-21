# M2 — city gate

## Built

- A deterministic 1,575 × 1,575 m island in 49 chunks of 225 m. The road plan is
  authored as a connected grid with a wide perimeter loop; the seed controls lots,
  building heights, colours and parks. Geometry is generated on demand in code.
- Four districts: Crown Heights (office towers), Sunset Works (warehouses), Palm
  Gardens (low houses and planted lots), Coral Quay (pastel apartment blocks).
  Crown Tower, Waterworks, Glasshouse and Coral Hotel mark the districts.
- A graph of 49 junctions and 168 directed right-hand lanes, including curved
  junction connections and U-turns. A deterministic Euler tour drives every lane.
- Nearby solid colliders stream independently of rendering; one continuous ground
  collider covers all streets. Buildings preserve the M1 wall-contact rules.
- One merged vertex-colour mesh per resident render chunk, frustum culling, fog,
  shadow distance, unload/dispose, and a one-chunk upload limit on normal frames.
  Spawn/teleport views load synchronously so the player never sees missing scenery.
- North-up minimap with car heading, district colours, landmarks and district label.
- Conservative low startup tier, frame-cost sampling, hysteresis, high/low shadow
  and draw-distance settings, DPR caps and dynamic resolution (65–100%). Query
  overrides lock a tier for repeatable measurements.
- `R` projects onto the closest lane. M1's playground, car handling, track and
  ghost remain available through the original spawn URLs or `?map=playground`.
  Continuous recording is off in the city to keep long free-roam sessions bounded.

## Validation

The machine reports NVIDIA MX330 through ANGLE D3D11 in headless Chromium. These
results do not establish Chromebook performance or constitute art-direction approval.

M2 measurements (command details also live in `docs/PROGRESS.md`):

| Check | Result |
|---|---|
| `npm run verify` | green on final code, 85 tests; build 3.35 MB / 5 files; smoke startup 740 ms |
| `npm run city` / `npm run screens` | 5/5 M2 browser checks; 10/10 HUD and pause viewport cases |
| Full headless road tour | 168/168 lanes, 1,709.3 simulated seconds, zero resets or impacts |
| Road height after settling | chassis Y 0.415–0.433 m, no seam jumps |
| Accelerated browser tour, low | 49 calls / 49,473 triangles max, 25 resident meshes max |
| Accelerated browser tour, high | 54 calls / 64,437 triangles max, 45 resident meshes max |
| Stream-out during complete tour | 251 low / 266 high chunk mesh disposals |
| Physics residency | 16 chunks max in the measured tour (hard bound 25) |
| Startup at 20 Mbit, 40 ms latency, CPU ×4 | 2.22 s (target <6 s) |
| Final real-time 60 s, CPU ×4, automatic quality | 58.2 fps; frame p95 16.8 ms, p99 33.4 ms, max 166.8 ms |
| Same run, all sim substeps per frame | p95 3.5 ms; max 26.8 ms |
| Same run, heap | 21 MB max |

The accelerated tour validates **every lane and scene residency**, not real-time
FPS over a 28-minute drive. The real-time probe covers 60 seconds. New triangles
and heap exceed the old empty-playground baseline, while remaining far below both
tier budgets. Generated test artifacts are ignored under `perf/` and `screens/`.

Frame pacing is not proven hitch-free: three real-time runs ranged from 56.7 to
59.8 fps mean. One run had a 766.6 ms maximum frame (sim maximum 257.6 ms); the
repeat on unchanged code had a 166.8 ms maximum. All passed the existing p95
frame/step budgets. Do not present these percentile passes as sustained 60 fps.

A separate instrumented run (`perf/city-profile.json`, CPU ×4) recorded 55.0 fps,
frame p95/p99/max 16.8/66.6/233.4 ms. The slowest measured render call was 58.5 ms
with no chunk load/unload, a render call including one chunk upload was 28.9 ms,
and a physics step including three loads and three removals was 13.9 ms. This
shows a streaming cost but does not identify the source of the longer frame gaps;
browser/GPU scheduling or machine contention remain hypotheses, not a diagnosis.

Commands: `npm run verify`, `npm run city`, `npm run perf`, `npm run screens`.

## Five-minute playtest

Run `npm run dev`, open the root page.

1. **0:00–1:00:** accelerate down the first avenue, steer through an intersection,
   drift and boost. Check the familiar M1 response with nearby buildings as reference.
2. **1:00–2:00:** follow the gold perimeter road on the minimap. Watch for disappearing
   scenery, visible chunk seams, hitching and confusing corners.
3. **2:00–3:00:** cross a district boundary. Check building scale, hue families, fog,
   minimap heading and district changes. The named `spawn` URLs jump between districts.
4. **3:00–4:00:** scrape a building, reverse out, drive onto a pavement, press `R`,
   pause with `P`, resume. Reset should keep you near your current road.
5. **4:00–5:00:** compare `?quality=low` and `?quality=high`, then automatic quality.
   Check road readability and smooth steering at speed. Use `?map=playground` if a
   suspected handling difference needs a comparison with M1.

## Tuning and boundaries

- `src/sim/city/City.ts`: district colours/massing, lot placement, landmark shapes,
  deterministic seed, physics load/retention radii.
- `src/sim/city/roads.ts`: road spacing and widths, lane offsets, junction curves,
  graph and full coverage route.
- `src/render/CityView.ts`: `QUALITY` (low 100–340 m fog / 1024 shadows / DPR 1;
  high 180–580 m / 2048 / DPR 1.5), load/retention margins and upload scheduling.
- `src/render/Renderer.ts`: 3-second sampling windows, quality hysteresis and
  resolution adjustment. `?quality=low|high` disables automatic adjustments.
- `src/app/trackBot.ts`: `CITY_BOT_TUNING`, conservative junction speeds for coverage.

This is a flat first city blockout: regular street grid, simple buildings, no
flyovers, interiors or traffic. The perimeter loop has at-grade junctions. Loading
after a dev teleport is synchronous; normal driving preloads ahead. M3 adds traffic
LOD, dodging pedestrians, damage, car-swap, takedowns, near misses and collectibles.
Stop at this gate for Marcin's driving/readability review before M3.
