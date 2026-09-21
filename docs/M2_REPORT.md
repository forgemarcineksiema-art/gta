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

## M2.1 — street architecture, shadows and camera (2026-09-21)

Playtest feedback on M2: building scale and variety, ground floors, sidewalks and
recognisable places were not considered; some facades clashed with the sky; shadows
popped on buildings; the camera reacted too strongly to steering. This pass keeps
the M2 road graph, physics and vehicle tuning unchanged.

### Built

- `sim/city/architecture.ts`: metre-based facades per district. Openings are real
  voids in the outer shell (piers, spandrels, bands) with glazing behind them,
  reveals and sills; recessed loggias with slab, side returns and a parapet that
  starts on the slab; shopfronts with a centred entrance and canopy; warehouse
  loading bays with recessed shutters and clerestories; houses with shutters, front
  gardens, hedges and pitched roofs; ribbon-window offices; stepped parapets.
  Side and rear elevations are blank with a stairwell stack, not clones of the front.
- Streets: 4.5 m sidewalks with kerb edge and paving joints, entrance paths, parking
  shoulders, street trees and palms, block interiors as gardens, yards or courtyards,
  reserved landmark plazas. Muted facade bodies (`CITY_COLORS`) and a cooler, lower
  contrast sky/light so district accents sit on canopies, rails and trim.
- Shadows: fixed 140 m half-extent map (1024 low / 2048 high), target snapped to the
  light-space texel grid, edge fade in the receiver shader, all resident parts cast
  inside the light frustum. No speed-dependent resizing and no hard caster cutoff.
- Camera: no steering feed-forward; 0.04 s heading lead, 0.65 m maximum lateral
  look, 110°/s heading rate cap, FOV 60–80 easing at 2.5/s, smaller shake. Four
  comfort tests replace the M1 look-ahead pins.
- Rendering: five meshes per chunk (base plus four quadrants) with per-part
  distance culling and shadow-caster range, static matrices, a shadow-caster prefix
  per buffer, `trim` members (sills, mullions, shutters, balcony returns) with only
  their visible faces and no depth pass, and spatial facade detail (180 / 220 m).
- Fixed on review: an open corner in every building (full-span bands on the
  corner-owning walls had no end caps, so the underside of the neighbouring band
  showed as a dark wedge); heap growth from render parts holding chunk descriptors.

### Validation (same machine: MX330 through ANGLE D3D11, headless Chromium)

| Check | Result |
|---|---|
| `npm run verify` | green, 88 tests; build 3.36 MB / 5 files; smoke startup 1.19 s |
| `npm run city` | 5/5; 168/168 lanes, zero resets, no console errors on both tiers |
| Accelerated tour, low | 77 calls / 109k triangles max (budget 150 / 250k) |
| Accelerated tour, high | 105 calls / 149k triangles max (budget 300 / 600k) |
| Heap during the tour | 54 MB low / 87 MB high (budget 250 MB) |
| Startup at 20 Mbit, 40 ms latency, CPU ×4 | 3.0–4.6 s over six runs (target <6 s; M2 was 2.2 s) |
| `npm run screens` | 10/10 HUD and pause viewports |
| Close-up review | front, corner and side of one building per district, before/after |

Real-time cost, 30 s bot runs at CPU ×4 on the locked low tier, alternating the
M2 build and this build six times (fps mean and frame p95):

| Pair | M2 build | M2.1 build |
|---|---|---|
| 1 | 51.9 fps / 33.4 ms | 56.4 fps / 33.3 ms |
| 2 | 58.1 fps / 16.8 ms | 50.2 fps / 33.4 ms |
| 3 | 55.4 fps / 33.3 ms | 53.7 fps / 33.3 ms |

Mean 55.1 versus 53.4 fps; both builds spend most p95 values on the 33 ms vsync
step, and the run-to-run spread (52–58 fps on identical code) is larger than the
difference. A 20 s CPU profile at CPU ×4 before the per-part culling showed main
thread idle falling from 21.6 % to 13.5 %, all of it in Three's per-object work
(matrix update, frustum test, buffer binding), which the culling and static
matrices then reduced (draw calls 102 → 77 on low). The 60 s `npm run perf` gate
passes (p95 ≤ 33.4 ms, step p95 3–4 ms). The M2 frame-pacing caveat still applies.

### Known issues

- Facades repeat within a district by design (three variants per type); a visual
  pass at speed still reads as generated, not authored. Roof silhouettes are simple.
- The base plane and island edge are untouched; the waterfront has no composition.
- Trees are the largest remaining shadow-pass cost (see `docs/BACKLOG.md`).
- Startup time margin shrank; see `docs/BACKLOG.md` for the deferral plan.
