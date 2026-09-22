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
- Silhouettes do the work: cars are recognisable from their block-out (long bonnet + small cabin = muscle; tall box = van). Car body sections, inset glazing and actual wheel openings establish the form; small fittings are merged into the body.
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

## Vehicles

- Five original, unbranded designs; the first three (the sports car and the police saloon are under "Police, the interceptor and the hideout"): red muscle coupe with raised shoulders,
  twin dark stripes, four round headlights, segmented rear lights and a rear lip;
  cyan hatchback with a charcoal roof, short overhangs and four-spoke wheels;
  orange panel van with cargo-door panels, sliding rail, hinges and robust trim.
- Body geometry follows the physical wheelbase, wheel radius and suspension rest
  height. Twelve-segment arch openings cut through the side shell, with a flared
  lip and an inward return. The narrow undertray does not seal these openings.
- Tyres use an open revolved profile with bevelled shoulders; alloy faces sit
  outside the tyre sidewall and have a rim lip, recessed centre and visible spokes.
  The four wheels keep their independent simulation transforms.
- Glazing is opaque dark blue with a broad muted reflection, black seals and
  painted surrounding pillars. No texture, transparency or additional lights.
  Decals are clipped to the actual body triangles so twisted loft panels cannot
  cut through their windows or distort door seams and side mouldings.
- Body and all fittings share one vertex-coloured Lambert mesh; four wheel meshes
  share their geometry and the body material. Five draws before shadow passes;
  under 7,000 triangles per complete car. Brake and reversing lamps update their
  vertex colours only when the state changes, including the hatchback's high lamp.
- Review both sides and front/rear three-quarter angles, then the normal driving
  camera during acceleration, steering, braking and reversing. Build/test success
  alone does not establish visual quality.

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
  authored road 0.034, parking pads 0.040, all paint 0.063-0.064); with the
  0.6 m near plane the depth buffer separates them out to the fog. Closer
  spacing z-fights while driving. Paint never overlaps paint: bays replace edge
  lines on kerbside roads, and lines stop 5 m short of stop lines and crossings.
- Grazing-angle rule for anything flat on the ground: from the driving camera
  (about 4 m up) a mark of length L along the view direction at distance d is
  only L × 4 / d² radians tall, about 670 px per radian at 720p. A 0.28 m line
  across the road is 0.2 px at 60 m; a 4 cm kerb lip is 0.3 px at 40 m. Such
  lines shimmer with 4× MSAA and no width fixes it, so they either run along
  the road or fade: pavements have no lip and no joints (their edge is the
  colour boundary plus the 14 cm kerb face), and every mark that lies across
  the road (zebra stripes, stop lines, arrows, bay dividers, the P stencil)
  carries a per-vertex `paint` underlay and fade distance, and the shared
  material blends it into the surface colour underneath before its projected
  thickness reaches a pixel (`render/roadPaint.ts`). Vertical thin members shimmer
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
- Road paint is one metre-based system for the whole city (`sim/city/markings.ts`),
  measured along each road so dash phase never restarts at a chunk or polyline
  segment, and each mark has one streaming owner. Centre lines are yellow: a
  6 m dash for two-way streets, a double solid for the last 24 m before a
  junction and the whole perimeter. White is everything else: edge lines on
  the parkway, the service road and the highway; kerbside bays instead of edge
  lines on streets, the Crown avenue and the quay. The perimeter is painted as
  one closed loop with quarter-circle corners: double yellow and 4 m lane
  dashes (two lanes each way, at 8 m) run on through every side-street mouth
  because the highway has priority; only its inner edge line breaks at the
  mouths and at the kerb corners.
- Junctions: a crossing (1.6 × 3.5 m stripes at 3 m pitch, as many as the width
  allows) is either whole or absent; it moves out past a diagonal merge and,
  on an authored road, waits until both road edges are 6 m clear of the grid
  kerb lines so it lands on the pavement wedge. A stop line spans the approach
  lane 5 m past the crossing. Arrows describe the single broad lane, straight
  through a crossroads and a left-right T at the perimeter, drawn whole or not
  at all. No crossings on any approach to the perimeter or across the service
  road; authored roads get no arrows, their options are the wedge's.
- Parking is complete 3 × 7 m parallel spaces with a darker pad, two edge lines
  along the road and fading dividers, in groups with a 7 m manoeuvring gap,
  starting 14 m past the paint start and never where an authored road merges
  in. Districts use the kerb differently (`PARKING_STYLE`): Crown and the quay
  mark groups of five with a P stencil, the gardens groups of three with every
  second group unmarked, Sunset Works groups of three in yellow with no P, the
  loading bays of the yards.
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
- Event popups (M3): a right-aligned stack above the speedo, 18 px heavy
  italic uppercase with 0.08 em tracking, skewed −10°, ink with a flat black
  shadow; gains in accent yellow. Each shows for 1.2 s; four slots recycle in
  order so a burst never reflows. Texts: NEAR MISS, ONCOMING!, DODGED, FRESH
  WHEELS, BILLBOARD!, and TAKEDOWN! / TAKEDOWN! INTO TRAFFIC! at 24 px.
- Damage bar (M3): under the boost bar, only once damaged; a 120 × 8 px
  skewed track filling in ink, danger red from stage 3, and the WRECKED
  overlay (54 px title at 30 % height, a 16 px line with the countdown and the
  reset key) at stage 4.
- Swap prompt (M3): a keycap and SWAP in accent cyan at 18 px, centred above
  the speedo, only while a car is within reach; never a button.
- Billboard counter (M3): BILLBOARDS n/50 under the damage bar, 16 px heavy
  italic, accent yellow when complete.
- Minimap: a radar, not an atlas. A circle in the bottom-left corner
  (`--minimap-size`, 150–240 px) that turns with the direction of travel, the car
  22 % below the centre so more road shows ahead, zoom from a 210 m radius at rest
  to 420 m at 160 km/h. Roads at real width with a dark casing: grid streets in
  ink, the perimeter highway in accent yellow, the authored loop in warm cream so
  the 4 km loop reads as one ring; district tints are the district colours at low
  alpha; water is a dark teal. Landmarks are four distinct glyphs in the district
  accent (tower triangle, tank on a stem, glasshouse diamond, hotel slab) that
  clamp to the rim with a chevron when out of range: this is the compass cue for
  places the street canyons hide. No text inside the circle but the rotating N;
  the district and landmark names sit above it at 12 px. Flat drop shadow, no
  glow. Numbers in `MINIMAP` (`src/ui/minimapModel.ts`).

## Traffic and pedestrians (M3)

- Civilian traffic uses three of the player silhouettes (muscle, compact, heavy; the sports and police bodies appear only as police units) in a
  fixed set of paints (`PAINTS` in `src/sim/traffic/Traffic.ts`), never the
  player's own paint for its class; an abandoned player car keeps the player
  paint so it reads as "yours" from a distance. Same flat shading, same
  vertex-colour meshes, drawn as instanced packs with shadows only on `high`.
- Driving cars hold their lanes at real widths and stop at junction stop
  lines; they never clip a kerb visually because a driving body has no terrain
  contact. A disturbed car tumbles with full physics; a wreck sits where it
  died, darkened, and smokes.
- Pedestrians are one low-poly walker in a handful of tints, walking the
  footways at 1.2–1.6 m/s, turning at block corners. They dodge sideways from
  a car's corridor, dive when it is close, get up, and shake a fist when it
  was very close; never limp, never bleed, never lie still for more than a
  moment. The dive is the joke, not the danger.
- Honks are short, per class (deeper for heavy), on a cooldown; the fist-shake
  is silent.

## Damage and debris (M3)

- The player's car darkens toward graphite by a quarter per stage (four
  stages at 30 / 60 / 85 / 100 % damage). The front bumper collapses onto its
  centroid at stage 1, the rear at 2, mirrors and spoiler at 3, glass goes dark
  at 4. One geometry, vertices moved in place; no dents, no textures, no
  detached wheels.
- Debris is up to 32 flat-shaded boxes with fake physics (gravity, one bounce,
  spin, gone within a few seconds): bumper bits in silver or charcoal on a
  damage stage, a burst in the car's paint on a wreck or a takedown, chalk or
  paint planks plus a few steel bits on a billboard.
- Smoke is 160 soft points: grey from a stage-2 car, dark from stage 3, with
  orange "fire" points at stage 4 and on every wreck; drifts with the car's
  velocity, dies within seconds. Never a full-screen effect.
- Wrecked: the engine cuts, the overlay says WRECKED with a countdown, and the
  respawn rolls the car out at 8 m/s on the nearest road. No fade to black, no
  camera cut longer than the snap.

## Billboards (M3)

- Fifty per island. A panel on two steel posts, both faces in one of the car
  paints or chalk, a dark stripe along the bottom edge; 8 × 2.5 m roadside
  panels on the highway verges facing the road, 5 × 2.5 m gates across the
  footways in the blocks, bottom edge 2.5 m up so every car passes under the
  panel between the posts.
- Smashing is a reward, not a crash: the panel vanishes, planks fly on with
  the car, the camera takes a jolt, a splinter and a two-note chime play, and
  the counter ticks. The car keeps 95 % of its speed.

## Police, the interceptor and the hideout (M4)

- Two more silhouettes, built the same way as the three playable classes
  (`src/render/carProfiles.ts`, `src/sim/vehicle/presets.ts`): the **sports**
  car, a low wedge coupe with a 1.2 m roof, a fastback tail and a lip spoiler,
  the fastest body in the game and the one the interceptor is built on; the
  **police** saloon, four doors, square shoulders, a deep front bumper and a
  1.5 m roof, three hundred kilos heavier than the muscle car so it arrives
  with momentum.
- Police livery, palette colours only: `policeWhite` body, a `policeBlue`
  band along the flanks from the front arch to the rear arch at belt height,
  `policeWhite` doors over it so the car reads white-blue-white from the side,
  `ink` bumpers and mirror caps. No text, no badge, no decal sheet: the shape,
  the two colours and the light bar carry it. An unliveried police body in
  another paint is a civilian saloon, which is what a parked one at a junction
  should look like until its lights come on.
- Light bar: one flat box across the roof at the B pillar, 0.9 m wide,
  0.12 m tall, `ink` housing with two lenses, left `policeBlue`, right
  `carRed`. They alternate at 2 Hz, emissive by vertex colour only (no
  lights): the lens colours are rewritten in place like the brake lamps. Off
  means the two lenses are `charcoal`. A pursuit reads at 150 m from the bar
  alone, which is what the roadblock rule needs.
- Interceptor livery is the same two colours on the sports body with the band
  running higher and no roof bar: a low-profile bar behind the rear window, so
  the two unit types are told apart at a glance from behind.
- The hideout is a one-room drive-in box, the same at all three drop-offs:
  14 × 20 × 6 m, `concrete` walls and floor, a `graphite` roof, an 8 m
  opening with a `carOrange` band over it (the one colour a chase has time to
  read), one `charcoal` roller door with a `carOrange` bar along its bottom
  edge that unrolls from the lintel, and a warm strip light on the ceiling.
  The door race and the shut door are seen from the back corner, past the
  car, out through the opening. The totals are a panel over that view in the
  HUD's own type, legible at 800x450. No props, no clutter, no second room.
- On the radar the three garages are a pitched outline in `carOrange` with
  the door as a dark band across its foot, clamped to the rim like the
  landmarks: where a run can end is always on the map.

## The run HUD, coins and ramps (M4)

- The bag sits top right under the stars (70 px from the top): the primary
  number (44 px, the heavy italic, skewed, accent yellow, a flat black
  shadow, counting up over 0.3 s) with the live multiplier beside it at
  18 px in the same accent (`×1`, `×1.25`, `×1.6`, `×2.2`, `×3`), popping
  0.3 s when the police see the player at a new level. Yellow means "not
  yours yet". Hidden behind a shut door and under the busted card.
- The coin counter under it, smaller, in ink with the coin glyph: white
  means safe. Placed coins are `carOrange` octagonal discs on the lane
  centre, spinning slowly; spilled coins are `carWhite` and larger, so a
  scramble reads from afar. Never a counter for the spill.
- The busted bar: a red skewed track with BUSTED over it, centre-bottom
  between the drift readout and the swap prompt, only while it is filling.
  The busted card (BAG, YOU KEEP, BANK) and the wall behind the door (BAG,
  MULTIPLIER, BANKED, BEST RUN, BANK) are one panel style: 54 px titles
  (BUSTED in danger red, BANKED in accent yellow), 18 px lines with the
  values right-aligned and the one that counts in yellow, one line of run
  counts in 16 px that wraps only at its separators, and a keycap with ANY
  KEY. The swap prompt hides while either is up. The wall carries a wanted
  poster under the counts: a dashed card tilted −2°, WANTED in danger red at
  12 px, a swatch of the car's paint and its class (MUSCLE CAR, VAN, …) at
  14 px: the police remember the car, not the driver.
- The swap prompt reads SWAP for a civilian car and BORROW for a police
  car, same keycap, same size, accent cyan. COPS LOST YOU (yellow, a gain)
  on every escape and COVER BLOWN (ink) join the popup stack. The player's
  own cruiser drives with its light bar flashing while the disguise holds
  and dark once it is blown.
- Cold open captions (M4 slice 4): top centre where the key hints sit
  (the hints hide meanwhile), skewed −10°, keycaps at 20 px beside one
  26 px heavy italic word (DRIVE, SWAP in cyan, BOOST); the three keyless
  verbs get a short line instead (SMASH THE BILLBOARD, RAM THEM INTO A WALL
  and GET IT TO THE HIDEOUT in accent yellow, PICK UP THE PACKAGE); a 12 px
  `N SKIP` underneath. A caption slides in over 0.25 s and shows only while
  its cue holds; the bottom swap prompt hides while the caption says SWAP.
  Never a modal, never over the car.
- Job markers: a flat `carOrange` ring (4 m radius, 24 segments) on the
  road with a 3 m beacon post, unlit so it reads in the towers' shade,
  pulsing ±8 % in scale; a ring glyph on the radar. Hidden while a job
  runs.
- Ramps are `ramp` red kickers drawn from their collision profile (an
  eased-in slope up, one slab down), a `barrier` white lip at the ridge, on
  the park strip outside the highway with the run-out kept clear; the
  "STUNT!" popup follows the TAKEDOWN! style at 24 px with the airtime in
  seconds. Speed cameras are a `steel` pole with an
  `ink` head; the flash is a 100 ms white overlay at 60 %, then FLASHED with
  the speed in the popup stack. The roadblock's sawhorse is `barrier` white
  with `cone` orange stripes on `steel` trestles, between two cruisers
  standing along the lane with their bars flashing; the spike strip is a low
  `ink` bar with `steel` teeth across the open lane. Parked patrols flash
  their bars within 200 m at heat 3+ and are dark otherwise. The heavy unit
  is the van in `policeWhite` with the band broken at its door seams and a
  wide roof bar; the Chief is the interceptor's body in `ink` with a
  `carOrange` band and a single red lens.

## Camera and motion

- Chase camera behind and above, FOV 60 → up to 80 with speed and boost, pulls back and drops with speed, follows the velocity direction so drifts show the car sideways. Very small shake at high speed. Steering input itself never swivels the view; actual yaw contributes only 0.04 s of heading lead and at most 0.65 m of lateral look offset. Heading follow is capped at 110°/s; speed/boost FOV changes ease at 2.5/s. See `src/render/ChaseCamera.ts`.
- Sparks: only where the body scrapes a wall, at the contact point on the car's flank, thrown backwards along the wall. Chunky bright points with short tails, hot white-yellow to orange, additive, dead within half a second. Never in front of the car.
- Speed lines: a screen-space pass of short streaks rushing outward from the frame's periphery above ~100 km/h and under boost (cyan lean). The centre of the frame, where the road is, is masked out; nothing is ever drawn in front of the car. This is how Burnout/NFS/Mario Kart do it: FOV, camera, peripheral blur or lines, sound; world particles only behind or beside the car.

## Tone

Slapstick. Drivers shake fists, cones fly, police are pompous and unlucky. Text is short, playful and never sarcastic at the player's expense.
