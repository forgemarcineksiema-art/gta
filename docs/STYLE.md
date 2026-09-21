# Style guide

One page. Everything visual in the game comes back to this. The palette itself is code: `src/sim/palette.ts`.

## The look in one sentence

**A candy-coloured low-poly city at the last hour of a summer evening**: warm low sun, long shadows, peach-to-violet sky, pink haze in the distance, cars in saturated paint. Cheerful, fast, slightly ridiculous. Not gritty, not neon-night, not the grey default look.

Why this and not another: the golden hour gives strong directional shadows (speed and shape read better than under flat noon light), the tinted fog hides draw distance for free, and a warm/violet thumbnail stands out in a CrazyGames grid full of blue-grey screenshots.

## Time of day and lighting

- Fixed time of day: late golden hour. No day/night cycle in v1 (a cycle costs lighting variants and makes every screenshot inconsistent).
- One directional sun (`PALETTE.sun`, intensity 1.8) low in the sky, from the front-left of the default spawn so the car's near side is lit. A neutral-cool hemisphere light (intensity 1.35) and muted violet ground fill keep facade colours readable.
- Shadows: one PCF map, 1024 low / 2048 high, fixed 140 m half-extent and 700 m depth. The target snaps to the light-space texel grid; city receivers fade the map edge over its outer band. Resident chunks cast into the light frustum; no hard 300 m caster cutoff or speed-dependent resizing. Shadow intensity is 0.72.
- Fog: linear, `PALETTE.fog` (muted peach), 100–340 m low / 180–580 m high. Fog colour and sky horizon are close so the world dissolves into the sky.
- Sky: an inverted vertex-coloured sphere, `skyHorizon` → `skyTop` with a power curve, no texture.

## Geometry and materials

- Low-poly, flat-shaded (`flatShading: true`), vertex colours or plain material colour from the palette. No textures per asset, ever. One merged mesh per chunk for statics.
- Silhouettes do the work: cars are recognisable from their block-out (long bonnet + small cabin = muscle; tall box = van). Details are extra boxes, not detail geometry.
- Palette (hex, sRGB):

| Role | Colour | Role | Colour |
|---|---|---|---|
| asphalt | `#3a3a46` | car red | `#ff3b5c` |
| asphalt light | `#4a4a58` | car lime | `#b6f542` |
| lane mark | `#f2e9d8` | car blue | `#2bd1ff` |
| kerb | `#c9c3b3` | car orange | `#ff9f1c` |
| concrete | `#9a938a` | car magenta | `#f45bff` |
| sand | `#d9b57a` | car white | `#f7f3ea` |
| grass | `#879b74` | car black | `#1c1b22` |
| water | `#3fa7c9` | tyre / rim | `#15151a` / `#c4c4cd` |
| glass | `#9fd8ff` | police | `#f7f3ea` + `#1d4ed8` |
| ramp | `#e5533d` | sky top | `#706c9b` |
| cone | `#ff8a2b` | sky horizon | `#e5b6a5` |
| barrier | `#f7f3ea` | sun / fog | `#ffe3ba` / `#d9b8ac` |

- Blacks and greys for trim, rubber and metal, darkest to lightest: ink `#0c0c10`, rubber `#15151a`, charcoal `#25252c`, graphite `#35353e`, slate `#4a4a55`, steel `#6d6d78`, silver `#9d9da8`, light grey `#c4c4cd`, chrome `#e4e4ea`. A car uses at least three of them (pillars/seams in ink or charcoal, rims in graphite with light-grey spokes, badges and exhaust tips in chrome) so it does not read as one flat block of paint.
- Districts (M2) each get one dominant building hue family from this palette plus one accent, so they read as different places from the minimap and from the road.

## Street architecture (M2.1)

| District | Street frontage and scale | Orientation cue |
|---|---|---|
| Crown Heights | 3–5 floors of shops/offices; taller rear offices concentrate around the tower | Lavender/stone, gold canopies, stepped Crown Tower |
| Sunset Works | 5.4 m warehouse walls, loading bays, clerestories, service yards and pitched/flat roofs | Brick/grey, teal loading canopies, elevated Waterworks tank |
| Palm Gardens | Two floors, 2.9 m ground floor, pitched or terrace roofs, 6 m front gardens | Chalk/sage/peach, hedges, Glasshouse plaza |
| Coral Quay | 3–5 storey apartments with shopfronts and projecting balconies | Muted coral/mint, aqua balcony rails, palms and Coral Hotel |

- Upper floors are 3.1 m; public ground floors 3.8 m; doors 2.3 m high. Window
  bays, entrance canopies and plinths establish scale from the driving camera.
- Sidewalks are 4.5 m wide, with kerb edges, 6 m paving joints and connected entrance
  paths. Block interiors read as gardens, courtyards or industrial yards. Parking
  shoulders break up the wide arcade road surface; the M2 lane graph stays intact.
- Reserve landmark parcels before filling lots. Paths connect their plazas to
  public sidewalks. Normal roofs stay below the district's principal landmark.
- Neutral facade bodies use `CITY_COLORS` in `src/sim/palette.ts`; district accents
  belong on canopies, rails and trim. Avoid large yellow/purple colour slabs against
  the sunset. Cars remain the most saturated moving objects.
- `sim/city/architecture.ts` generates facades; `City.ts` chooses parcels and heights.
  Surface panels use two triangles; roof prisms use eight. All remain in the same
  merged chunk geometry and shared material, with no asset textures.
- Openings are voids in the outer shell (piers, spandrels and bands), glazing sits
  behind them, loggias have a slab, side returns and a parapet that starts on the
  slab. Full-span bands on the corner-owning walls carry end caps so corners close.
- Sills, mullions, shutters and balcony returns are `trim`: only their visible
  faces, no shadow pass, and omitted beyond 180 m where they are sub-pixel.
- Each chunk renders as five meshes (base plus four quadrants) so the camera and
  shadow frusta cull streets behind the player; detail is spatial and tier
  independent (`DETAIL_NEAR` / `DETAIL_FAR` in `render/CityView.ts`).
- This is a street-quality pass over the regular M2 grid. Bespoke street plans,
  waterfront composition, traffic and populated shop interiors are later work.

## Street plan and skyline (M2.2)

- The grid stays; five authored roads join it as lane pairs between junctions
  (`SPECIAL_ROADS` in `sim/city/roads.ts`): two straight Crown diagonals aimed at
  the tower junction (24 m wide), the Works chicane (16 m, R ≈ 55 m, no frontage),
  the Garden parkway (20 m, R = 225 m, grass verges, houses set back 6 m) and the
  Quay sweep (24 m, R = 503 m, loggia apartments). Together with the north
  highway they form a 4 km loop; `?spawn=loop` starts on it.
- Quarters an authored road crosses are open: interior at road level in the
  district's ground colour, grid pavements only as 4.5 m strips cut along the
  corridor, and a frontage row of rotated buildings facing the road at 23–29 m
  pitch, with entrance paths, kerbs, trees every 27 m and lamps every 45 m.
  The Crown avenue climbs from 4 to 10 floors toward the tower junction.
- Skyline: the Crown Tower is 30 floors plus crown and spire (~120 m), the Works
  add a striped chimney (67 m), the Glasshouse a beacon mast (48 m), the Coral
  Hotel is a 14-floor slab with a roof sign. Their silhouettes render in a
  separate layer (`render/skyline.ts`) whose fog fades over three times the fog
  distance and never past 82 %, so they place the player from any open sightline.
- Roofs: offices and quay blocks alternate a plant box, a set-back penthouse with
  a band, and a parapet ring with stair head and water tank; buildings of eight
  floors or more get a second step. Houses and warehouses keep pitched or flat.
- Coral Quay's sea edges are a 1.1 m parapet with a coping (the 4 m boundary
  collider stays), a paved promenade with palms every 22 m, benches and floodlight
  masts, and a pier with posts, a pavilion and moored boats beyond the wall.
  Elsewhere the island edge keeps the 4 m seawall.
- The Works chicane has yards instead of frontage: container rows (two colours,
  one stacked tier), a storage tank with a teal band, a gantry crane, floodlight
  masts and a chain-link fence between pavement and yard. Containers, tanks and
  gantry legs are solid.
- Frontage rows start 8 m past the junction pavement, so authored junctions have
  corner buildings; widths cycle through three values per row on top of the
  three facade variants.
- Surface decals are top faces stacked at least 12 mm apart (road 0.010,
  shoulders 0.022, lane marks 0.028, authored road 0.034, crosswalks and parking
  marks 0.046, authored dashes 0.054); with the 0.6 m near plane the depth
  buffer separates them out to the fog. Closer spacing z-fights while driving.
- Grazing-angle rule for anything flat on the ground: from the driving camera
  (about 4 m up) a mark of length L along the view direction at distance d is
  only L × 4 / d² radians tall, about 670 px per radian at 720p. A 0.28 m line
  across the road is 0.2 px at 60 m; a 4 cm kerb lip is 0.3 px at 40 m. Such
  lines shimmer with 4× MSAA and no width fixes it, so they do not exist:
  parking bays are 6 m patches of alternating tone, pavements have no lip and
  no joints (their edge is the colour boundary plus the 14 cm kerb face),
  zebra stripes are worn-paint tone and only in the near level (120 m), and
  past that a crossing is a faint lighter patch. Vertical thin members shimmer
  past 100 m below about 0.4 m: cornices are 0.44 m, lamp heads 0.28 m, and
  window frames keep low contrast against the glass.
- Measure, do not guess: `screens/flicker-capture2.mjs` records raw canvas
  frames while driving and the flicker map marks pixels that flip back and
  forth between consecutive frames.
- Where an authored road meets the grid, the pavements are constructed, not
  cut: the road's carriageway edge is followed out of the junction; from the
  point where the two carriageways separate, the pavement between them is a
  wedge of prisms (convex polygons at kerb height) until it is 9 m wide, where
  the road's own band and the grid strip take over, both starting on the
  wedge's end edge. A side that crosses a grid strip leaves a sliver prism on
  the far side. Wedge tips are chamfered 2.5 m. Bands along authored roads are
  prism quads per centreline segment sharing point normals, so curves have no
  overlapping kerb boxes. Trees and lamps still skip grid street corridors.
- Parking bays: a continuous edge line along the road (its width does not
  foreshorten) plus alternating 6 m bay patches; none where an authored road
  merges in.
- Junction decals (crossings, bands) live in a chunk's base render part so both
  halves of a crossing change detail level together; the far level keeps the
  facade reveals, so a building's only distance change is the sub-pixel trim.
- Rotated statics rotate about +Y only; a rotated building is generated in its
  own frame and moved as a whole, so facade rules never see the rotation.

## UI

- Plain DOM over the canvas. Typography: a heavy italic system sans for numbers and titles (`Segoe UI` 900 italic → falls back to Helvetica/Arial/system-ui), 600 weight for body text. No web fonts (bytes, offline, licensing).
- Colours: ink `#f7f3ea`, accent yellow `#ffd23f`, accent cyan `#2bd1ff`, danger `#ff3b5c`, panel `rgba(22,14,40,0.78)`.
- Skew important elements slightly (-8° to -14°) for motion; drop shadows in flat black, never blur glows.
- Text shadow on everything over the 3D view for legibility on both peach sky and dark asphalt.
- Minimum sizes at DPR 1: primary numbers ≥ 44 px, labels ≥ 12 px bold uppercase with tracking. Verify with `npm run screens`.
- Keycaps: white rounded rectangles with dark text, always beside a one-word label.

## Camera and motion

- Chase camera behind and above, FOV 60 → up to 80 with speed and boost, pulls back and drops with speed, follows the velocity direction so drifts show the car sideways. Very small shake at high speed. Steering input itself never swivels the view; actual yaw contributes only 0.04 s of heading lead and at most 0.65 m of lateral look offset. Heading follow is capped at 110°/s; speed/boost FOV changes ease at 2.5/s. See `src/render/ChaseCamera.ts`.
- Sparks: only where the body scrapes a wall, at the contact point on the car's flank, thrown backwards along the wall. Chunky bright points with short tails, hot white-yellow to orange, additive, dead within half a second. Never in front of the car.
- Speed lines: a screen-space pass of short streaks rushing outward from the frame's periphery above ~100 km/h and under boost (cyan lean). The centre of the frame, where the road is, is masked out; nothing is ever drawn in front of the car. This is how Burnout/NFS/Mario Kart do it: FOV, camera, peripheral blur or lines, sound; world particles only behind or beside the car.

## Tone

Slapstick. Drivers shake fists, cones fly, police are pompous and unlucky. Text is short, playful and never sarcastic at the player's expense.
