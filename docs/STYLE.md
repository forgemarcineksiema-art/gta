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
| coin | `#ffd23f` | | |

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
- The bike (M8.8 slice 15, `render/cars/bikeMesh.ts`): a sport bike in blocks,
  paint on the tank, fairing, nose, tail and front mudguard, charcoal frame,
  chrome fork and exhaust; its own two wheels on the body, the front one turning
  with the fork; under 3,000 triangles. The rider astride in the officer's navy,
  boots, a white helmet with a dark visor, arms to the bars, thrown up in a fall;
  under 1,500 triangles; bike and rider lean as one. The topper sits on the
  helmet a size down; the neon under the bike; no car part fits. Left in the
  street it stands among the traffic without its rider. The chase sits closer
  and lower behind a small body.

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
  independent (`DETAIL_NEAR` / `DETAIL_FAR` in `render/city/CityView.ts`).
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
  separate layer (`render/city/skyline.ts`) whose fog fades over three times the fog
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
  thickness reaches a pixel (`render/city/roadPaint.ts`). Vertical thin members shimmer
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
  shadow; gains in accent yellow. Each shows for 1.2 s; two slots (four until
  M8.5) recycle in order so a burst never reflows. Since M8.5 (DESIGN.md
  §17.3, `src/ui/hud/voice.ts`) a pop is only what pays or counts outside the
  combo (TAKEDOWN!, BILLBOARD 13/50, FLASHED, COPS LOST YOU, COMBO +2,100,
  DAILY DONE…); the combo's tricks, DODGED and FRESH WHEELS say nothing, and
  nothing pops over the wall or the busted card. The ticker's lead for the
  stars' news is the stars (`★★★ ROADBLOCKS UP`), never LEVEL.
- Damage bar (M3): under the boost bar, only once damaged; a 120 × 8 px
  skewed track filling in ink, danger red from stage 3, and the WRECKED
  overlay (54 px title at 30 % height, a 16 px line with the countdown and the
  reset key) at stage 4.
- Swap prompt (M3): a keycap and SWAP in accent cyan at 18 px, centred above
  the speedo, only while a car is within reach; never a button.
- The corners (M8.5, DESIGN.md §17.2; `src/ui/hud/corners.ts` decides): a calm
  drive shows seven things, the goal line and the arrow (top centre), the
  stars and the bank (top right), the radar (bottom left), the speed and
  the boost (bottom right). The bag shows from its first money and its ×
  from ×1.3; the damage once dented; the combo top left while it runs; the
  district's and landmark's names over the radar fade in for four seconds
  on a change and at a new run. No gear, no ONCOMING, no drift readout, no
  standing counters: a find pops with its count (BILLBOARD 13/50, NEW JUMP
  4/20, CACHE 5/30) and the full map's head carries the three. Behind a
  shut door and on the busted card the driving screen goes whole.
- Billboard counter (M3, off the screen since M8.5): BILLBOARDS n/50 under the damage bar, 16 px heavy
  italic, accent yellow when complete. Under it the day's caches (M5.5): CACHES n/30 in the same
  type, accent yellow at thirty; each cache is a gold dot inside the radar's
  circle until found.
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
  glow. Numbers in `MINIMAP` (`src/ui/map/minimapModel.ts`).
- The way's route (M8.7 slice 1, DESIGN §20.3 rule 4): on the radar a 5 px
  line in the way's cyan `#2bd1ff` on a dark edge 2 px wider each side, round
  joins, over the roads and under the rings, the units and the car, from the
  car to the goal; it draws itself out from the car over 0.5 s (eased out)
  when the goal or the route changes (a missed turn) and is still otherwise.
  The goal's badge at its end: an ink disc 7 px in a 3 px cyan ring with a
  dark edge, on the rim with a cyan chevron when the goal is past it. The
  full map draws the whole route at 4 px and the badge at 9 px. Cyan means
  the way on the maps and nothing else.

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
  velocity, dies within seconds. Never a full-screen effect: a puff is sized
  in metres (0.3 m growing to about 1.2 m), the car's own smoke thins with
  speed (half as dense at 36 km/h, a quarter at 108) and every puff fades
  out between 7 and 3.5 m from the camera, so the trail a moving car leaves
  never washes over it. A stopped stage-2 car shows a thin column off the
  bonnet.
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
  (`src/render/cars/carProfiles.ts`, `src/sim/vehicle/presets.ts`): the **sports**
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
- The stars answer every crime (M5.5): the star that fills scales up
  1.35× for 0.3 s, and a `+n` in danger red at 16 px pops under the row for
  0.6 s (rises 14 px and fades), so the ratchet is never silent. The number
  is the one text the stars allow themselves.
- The ticker (M5.5): one line at the top centre where the job line sits,
  20 px heavy italic uppercase skewed −10°, ink with a flat black shadow,
  the lead word in danger red (`LEVEL 2` · `INTERCEPTORS ON THE ROAD`), 2 s;
  the job line and the key hints hide meanwhile, the intro's captions
  outrank it. The dispatch lines of the police pass join it.
- The bank under it (the coin counter until M8.5: a road coin lands in the
  bank), smaller, in ink with the coin glyph: white means safe; it pops once
  per coin and the number flashes the accent on a cap. Coins are `coin` gold (`#ffd23f`, the accent's value: the glyph and
  the coin are one thing, and the one palette colour the HUD shares),
  octagonal prisms a metre across and 16 cm thick on edge at bonnet height,
  lit from within (emissive 0.35) so they never go dark in shadow, spinning
  with a per-coin phase so a line ripples away from the player, bobbing
  6 cm. The cap a line ends on is half as big again. Spilled coins are
  `carWhite` and larger still, so a scramble reads from afar. A picked coin
  flies into the bonnet in 0.16 s and shrinks to nothing; no sparkle, no
  burst. Never a counter for the spill. The layout itself is DESIGN.md §3.5.
- The busted bar: a red skewed track with BUSTED over it, centre-bottom
  between the drift readout and the swap prompt, only while it is filling.
  The busted card (BAG, YOU KEEP, BANK) and the wall behind the door (BAG,
  MULTIPLIER, BANKED, BEST RUN, BANK) are one panel style: 54 px titles
  (BUSTED in danger red, BANKED in accent yellow), 18 px lines with the
  values right-aligned and the one that counts in yellow, one line of run
  counts in 16 px that wraps only at its separators, and a keycap with ANY
  KEY. The swap prompt hides while either is up. Since M8.5 (DESIGN.md
  §17.5, `src/ui/hud/totals.ts`) the wall says BANKED (GARAGE for an empty bag)
  with a NEW BEST tag in accent cyan when it is one, then one line of sums
  (`BAG 32,500 ×2.6` … `+84,500`), the sentence while it teaches, the next
  goal and the counts; the busted card `BAG 48,750 · YOU KEEP HALF` …
  `+24,375` and BANK. No wanted poster.
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
- One kind at a time, M8.7 slice 4 (DESIGN §20.3 rule 10): a kind the
  chain brings out gets a card after the step's own, twice as long: its
  40 px badge over NEW: its name (NOWOŚĆ: …), what it asks, LOOK FOR ITS
  SIGN; its signs rise from the ground over 0.6 s (eased out). A click on a
  ring's badge on the full map makes it the goal (a pointer cursor there).
- Job signs, M8.7 slice 3 (DESIGN §20.3 rules 5–7; `sim/glyphs.ts`,
  `render/run/signs.ts`): every marker is a ring on the road and a round
  sign 1.4 m across on a 3.3 m steel pole (`#6d6d78`), always turned to the
  camera about the vertical: an ink face `#f7f3ea`, a dark rim `#160e28`
  0.14 m wide, and its kind's pictogram in the dark, extruded 3 cm (a parcel,
  a car key, a police light, a stopwatch, a chequered flag, a crash star, a
  claw hammer, a taxi, the garage's house, the Chief's star, a rival's
  poster number in bold seven-segment digits). Colour says the state and
  nothing else: open white; the goal cyan (its rim and its ring, the sign
  bobbing 0.12 m at 1 Hz, the ring pulsing ±16 %); closed grey `#8d8a96`
  with a slate pictogram. A rival's sign floats over its parked car, a
  running job's over its target, the key over the wanted car, the taxi over
  a hailer, the house over a door the way leads to. Within 100 m the nearest
  open sign ahead carries its pay a metre over it in the line's yellow type.
  The maps draw the same pictogram in a badge (open ink, the goal in a cyan
  ring, closed grey), on the radar 14.5 px across with its edge (the gate's
  floor at 800×450 is 14); the goal line's badge is 30 px. The kinds' colours are
  gone everywhere (the line's words ink, the card's edge cyan, a zone's edge
  cyan); the boost bar's fill is dim ink, since cyan is the way's.
- Job markers, M8.7 slice 2 (DESIGN §20.3 rules 8–9): with the police on
  the player every ring is closed and drawn grey `#8d8a96` (the radar's and
  the full map's too); a job taken lights its ring in the way's cyan, growing
  35 % over 0.4 s, with the start's two-note chime. The cold open's pickup
  caption reads PICK UP THE PACKAGE · SLOW DOWN IN THE RING.
- Job markers (M5): a flat ring (4 m radius, 24 segments) on the corner
  apron with a 3 m beacon post, unlit so it reads in the towers' shade,
  pulsing ±8 % in scale, in the kind's colour: a delivery `carOrange`, a
  steal-to-order `carMagenta`, an escape `policeBlue`. Sixteen, always
  resident, two instanced draws. While a job runs the others hide and its
  target (the drop-off, the fence) gets the ring and beacon pulsing ±16 %;
  the wanted car of an order carries a magenta ring under it within 150 m
  and in front of the camera. On the radar the rings show only inside the
  circle (sixteen rim chevrons would be noise); the running job's target
  clamps to the rim in its colour.

## Jobs, the arrow and the wall (M5)

- No arrow (M8.7 slice 1, DESIGN §20, Marcin's decision): where to go is the
  radar's route (the minimap entry above). The markers, the goal line and
  the colours below change by M8.7's later slices.
- The job line: top centre where the key hints sit (they give way), 20 px
  heavy italic uppercase skewed −10° in the popup type: the job, its clock
  in accent yellow (danger red from 10 s), the distance in ink at 16 px
  (`DELIVERY 1:15 · 370 m`, `FIND A LIME COMPACT · 420 m`, `ESCAPE ★★★`),
  and, while a route is laid, its coins taken of laid in accent yellow
  (`· 12/48`); the result line adds `· CLEAN LINE` when all were taken.
  The kind's words take its colour (an order magenta, an escape cyan). The
  result replaces it for 2 s at 24 px: DELIVERED / SOLD / BOUNTY +n in
  accent yellow, TOO LATE in danger red.
- The job card: under the line for the first 1.5 s, the panel style with a
  4 px left edge in the kind's colour, the title at 26 px (DELIVERY, STEAL
  TO ORDER, ESCAPE), what it asks at 14 px (GET IT TO THE DROP-OFF, WANTED:
  CYAN COMPACT, THE POLICE HAVE YOU), the payout at 44 px in accent yellow,
  the limit at 14 px dim (`1:15 · FASTER PAYS MORE`, `4:00 FROM THE SWAP ·
  NO SCRATCHES`, `LOSE THEM`).
- The wall behind the door is one panel at every drop-off: a row of tabs
  (since M8.5 four: TOTALS, CARS, STYLE, GOALS, `src/ui/wall/wallPages.ts`; CARS
  carries TUNE's rows and PREP's under the cars, GOALS the day's three, the
  board and the hunts; the current tab on accent
  yellow), one page at a time, and a footer with the key hint, BANK in
  accent yellow and DRIVE OUT. The totals page is M4's (BANKED, the lines,
  the counts, the wanted poster) plus, at the first door, FIRST NEW CAR:
  10,000 · YOU HAVE n in accent cyan. CARS: five cards with the car's paint
  swatch, its word, and SELECTED / OWNED / the price (danger red when the
  bank is short) / ESCAPE HEAT 5 FIRST. PAINT: seven 52 × 40 px swatches of
  the palette's car paints; the current one ringed in ink. TUNE: three rows,
  the stat at 18 px, ●●○ dots in accent, the next price or MAX. PREP: each
  item with its line and two buttons of the same size, the cash price and
  ▶ FREE (the video icon: a cyan frame with a play triangle). A focused
  item has an accent border and a flat black shadow; everything is a
  button, so a click does what the key does. On screens under 560 px tall
  the title drops to 38 px and the lines to 15 px.
- The door's offer: under the totals, DOUBLE THE BAG with the video icon and
  BANK IT, the same size side by side, BANK IT focused; the tabs and DRIVE
  OUT dim until it is answered. Never at the session's first door.
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

## The city's people and things, the new HUD (M5.5)

- **Traffic bodies** (slice 19): eight civilian shells (sedan, hatchback,
  estate, SUV, pickup, taxi, box truck, 12 m bus) in the player cars'
  profile format, 386–460 triangles, one instanced draw with a paint mask:
  glass `ink`, lights and a truck's box keep their colour, the rest takes
  the record's paint. The taxi is `coin` yellow with a roof sign; buses
  wear the district's colour. The player's shells never spawn as traffic.
- **Pedestrians** (slice 20): four silhouettes of boxes, 150–200 triangles
  (the long coat and scarf, the jacket and skirt with a bag, the hi-vis
  worker in a hard hat, the stooped old man with a stick), dressed by
  district from each district's six clothes colours in `palette.ts`; the
  walk, the dive, the push-up and the fist (the old man's stick) are one
  vertex-shader swing by limb. The officer (slice 18) is a fifth look:
  blue shirt, navy cap, badge, the ticket book in hand.
- **The ice-cream truck** (slice 16): a shortened box truck, `mint` cab,
  white box, a serving hatch under a pink awning, a wafer cone with a scoop
  and a cherry on the roof. **The giant ball**: a 4.4 m beach ball, six
  flat gores (`carRed`, `coin`, `carBlue`, white, `carLime`, `carOrange`)
  and white caps. **The crumple**: each damage stage dents the shell where the
  hit landed; a wreck caves it and squashes the roof.
- **The donut shop** (slice 18): a pink kiosk with a dark serving window,
  a light counter and a pink-and-white striped awning; over it on a `steel`
  pole a giant donut on its edge, `wafer` dough, pink icing on the upper
  half with a few yellow and blue sprinkles.
- **Pursuit breakers** (slice 18): scaffold towers of `steel` tubes and
  braces, `sand` plank decks every 2.2 m and a `carLime` safety mesh on the
  street face, standing on mid-block pavements; down, they lie across the
  lane as a barrier.
- **Traffic lights** (slice 17): a `steel` pole at each corner of the nine
  downtown crossings, an `ink` head, three lamps of which one is lit.
  **Parked cars** are traffic bodies at the kerbside bays.
- **Covered streets and overpasses** (slices 7–8): each district's cover
  in its own material (an arcade under a frontage bridge, a steel gantry, a
  plane-tree canopy, a brick warehouse); the overpass is a `concrete` deck
  on a girder, ramps between retaining walls, parapets and lane lines.
- **The helicopter** (slice 9): a police-white body with a spinning rotor,
  a blinking bar, an additive searchlight cone and a spot on the ground.
- **The goal line** (slice 2): the job line's place at the top centre, a
  12 px dot in the colour of the goal's ring, the goal in
  capitals (LOSE THEM in danger red); the chain's cards in the job card's
  frame with an accent border. **The ticker** (slice 4): one italic
  uppercase line at the top centre, the level in danger red before the
  text; captions over the ticker over the goal line over the hints, one at
  a time. **The ring** (slice 4): under the stars, draining as the
  cooldown runs; the stars pulse slower.
- **Fares** (slice 13): a hailing walker raises the right arm under a
  yellow beacon; a hot passenger is a crook with a suitcase.
- **The skill chain** (slice 14): top left under the bag's corner, the
  multiplier in the accent (the second accent at ×5), the points in
  tabular figures, the last trick's word, over a draining bar.
- **The big map** (slice 15): the whole screen while Tab is held, the
  island on a dark violet veil at 84 %, north up; roads, district tints and
  names, landmarks, garages, jobs, caches, cameras, cover, units, the
  helicopter, the search disc, the rivals and the car's arrow, with a key
  on the right drawing each glyph as the radar does.
- **The ticket pad** (slice 18): the busted bar is a cream citation pad,
  a danger-red BUSTED head, three ruled lines that fill with navy ink,
  tilted 3° and skewed like the rest of the HUD, under the swap prompt.

## The wanted board and the kit (M6)

- **The rivals' cars** (slices 4–5), built as the city's set is, under 3,000 triangles: Granny's lavender wagon (a
  chrome blower through the bonnet, side pipes, three terracotta pots with pink blooms on the rack), Pete's red hatch
  under a pizza slice sign (crust up, point down, pepperoni), Tina's orange wrecker (winch, crane, hook, amber bar,
  tow bar), the twins' mint and peach coupes (twin stripes in the dark tone, a wing), Frank's white saloon under a
  five-colour disco bar with a magenta band and a drawn yellow star, Bernie's magenta party bus (a chrome-railed roof
  deck, speaker stacks, a disco ball, lime and yellow stripes), Niko's long low blue lowrider (chrome bumpers, pink
  pinstripes, the spare on the tail; it hops at a standstill), the Nephew's 6.8 m gold limo (three windows a side,
  chrome trim, red and white flags), Pip's lime one-door bubble, the Ghost's black phantom (skirts, a slim wing, the
  headlamps dark), the Chief's white cruiser in gold trim with a gold star a side, his light bar and a push bar.
- **The posters** (slice 5): ten on the hideout's back wall either side of the player's own and the Chief's above it;
  a white card, a band (red waiting, cyan the next, grey beaten), the rival's car as a swatch of their paint, a gold bar
  under a beaten one. The duel's ring, the line and the card are the cyan (`carBlue`) no other job wears.
- **The driver's kit** (slices 6–7): toppers of a few boxes (the cone, a rubber duck, a shark fin, a crown, a traffic
  light, a donut, a dish, a mattress, a trophy, a flamingo, the rivals' seven), under 300 triangles, seated on the roof
  of whatever the player drives; neon as a soft additive glow in the body's footprint, no light; the boost's flame as
  two short additive cones at the tail; a drift's tyre smoke low off the rear tyres; each in its item's colour (the
  flame orange and the smoke a pale grey when none is worn).
- **The car's kit** (slice 8): chrome stars, a deep dish with a wide chrome lip, gold wires, white discs; a lip, a wing
  or the giant red wing on the boot (not on the big ones); slammed 6 cm or lifted 10 cm, the body over its wheels.
- **The hidden cars** (slice 9): a red 1930s roadster (open cockpit, a tall grille, wire wheels, running boards), a
  white street sweeper (orange hopper, black brushes under the nose, an amber bar), a yellow hot-dog van (the sausage
  in its bun on the roof, a mustard zigzag, a red and white awning).

## Camera and motion

- Chase camera behind and above, FOV 60 → up to 80 with speed and boost, pulls back and drops with speed, follows the velocity direction so drifts show the car sideways. Very small shake at high speed. Steering input itself never swivels the view; actual yaw contributes only 0.04 s of heading lead and at most 0.65 m of lateral look offset. Heading follow is capped at 110°/s; speed/boost FOV changes ease at 2.5/s. See `src/render/camera/ChaseCamera.ts`.
- Sparks: only where the body scrapes a wall, at the contact point on the car's flank, thrown backwards along the wall. Chunky bright points with short tails, hot white-yellow to orange, additive, dead within half a second. Never in front of the car.
- Speed lines: a screen-space pass of short streaks rushing outward from the frame's periphery above ~100 km/h and under boost (cyan lean). The centre of the frame, where the road is, is masked out; nothing is ever drawn in front of the car. This is how Burnout/NFS/Mario Kart do it: FOV, camera, peripheral blur or lines, sound; world particles only behind or beside the car.

## Tone

Slapstick. Drivers shake fists, cones fly, police are pompous and unlucky. Text is short, playful and never sarcastic at the player's expense.
