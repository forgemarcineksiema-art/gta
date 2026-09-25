# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-25 — M8.10 slice 6b: the roads' surfaces

Done: `island/surfaces.ts`: each road's strip 4 cm over the ground (5 points across, halved where the ground bends),
broken at the 128 junctions where a polygon from the arms' edges takes over; pavements on 14 cm kerbs along the
avenues and streets (their slabs the wheels climb, loaded with the physics' chunks); the paint: centre and lane lines,
edge lines, 259 stop lines with zebras and arrows, 1,061 parking bays (`surfaces.parking`). The ground: a narrower road
gives way to the wider across its carriageway (no bump in the main road), a street crosses it at its heights and
climbs from its edge. Pins 6.1–6.5 (6.1 at 4 cm, not the plan's 2: the ground's mesh under a strip needs the room to
stay in its 2,400 triangles). Open: a few streets near main roads climb their first stretch at up to 26 %.

## 2026-09-25 — M8.10 slice 6a: the highway's structures

Done: `island/structures.ts` cuts the highway into its structures: the tunnel under the hill, the viaduct over the
basin, the bridge over the bay's mouth and an overpass (30 m each way) wherever a main road crosses it. Decks are slabs
the wheels drive on, with railings; the tunnel has walls, a roof, a lid of ground over it and portals; the road under
an overpass dips 7 m below the deck. Drawn with piers, a cut in the ground at each mouth. Pins 6a.1–6a.4. Open: kerbs,
flat junction boxes and markings are 6b; the island's build takes 3.2 s here (the streets 1.7 s), too slow for the
switch's 6 s to control on the low tier: slice 18 speeds it up.

## 2026-09-25 — M8.10 slice 5: the districts' streets

Done: `island/streets.ts` lays each district's streets (15 km, 49 streets): Crown a 90 m grid round the summit, Works
180 × 150 m yards, the Gardens two crescents and radials round the botanic garden, the Quay a 120 m grid; each kept
where its district and the places allow, run on to the road it meets, and pruned until no end is loose. The ground
grades them after the main roads: the crossings' heights eased over the whole grid so no block is steeper than its
class, each street crossing flat 12 m each way (Crown's crests); a T on a main road takes its height. The network joins
them at grade. Open: at a crossing the ground blends two roads' surfaces, a bump of up to +8 % on Crown's hill (slice 6
lays each junction's box flat); a few Crown streets between two main roads run steeper than 16 %, never over 25 %.

## 2026-09-25 — M8.10 slice 4: the main network

Done: `island/network.ts` makes the main roads a `RoadGraph` (`Island.network`): the roads joined where one's end meets
another, split there, laned both ways (the highway two a way), the roundabouts one way round; lane heights the ground's,
the tunnel's or a deck's (8 m over the basin, 10 m over the bay's mouth), eased over 12 m at their ends. The plan had
nine ends in a field: the ramps, the harbour road, the beach road, the taxiways and the quarry tracks now meet roads (a
road inland of the airfield, the runway between the taxiways, a passage from the beach road under the highway to the
parkway, the quay sweep under it to the beach, the serpentine and a quarry track from the summit's ring). The highway is
one smooth loop (a kink at the tunnel's mouth made its inner lane 15 % steep); a road's pinned end no longer leaves a
step (Crown Avenue's top was 35 %). Pins 4.1–4.6. Changed at Marcin's word: one verify a slice, in the background.

## 2026-09-25 — M8.10 slice 3: the ground's look and the coast

Done: the ground drawn a mesh a chunk (`island/GroundView.ts`: an RTIN over 65×65 points, tight under the roads and at
the water, loose on the hills; 366 triangles a chunk at the median, 1,518 at most), cut along the steep shores and hung
with their faces, skirted at the chunks' borders, coloured by height, sand, dirt and verges; the roads follow it with
skirts, the paved places are slabs; bollards on the quays, a parapet on the cliffs and the bay, boulders on the rocks.
The coast: a beach meets the sea at its level (a car wades 6 m into the surf to the wall), a steep edge keeps the land a
physics cell past its line (the wall behind it rises with the land: the cliff tops were open), a car under the sea a
second goes back to the road; the wheels read SAND (0.85, dirt's drag), the quarry's dirt, the paving. Found: on grass a
handbraked car crept down pin 2.2's hill, so a braked wheel at a crawl now holds where it stopped (`Vehicle`, `HOLD`).

## 2026-09-25 — M8.10 slice 2: the ground with heights

Done: `?map=island` drives. The ground (`island/ground.ts`) is the plan's hills with the main roads graded in (each
profile smoothed to its class's grade, a T's end at the road it meets, two roads' surfaces blended where they overlap),
beaches sloping into the water and a shelf under the sea; `Island` keeps a 3×3 of height fields round the car (heights
worked out ahead, a field built one a step), the coast's wall, the sea for the hovercraft; `IslandView` draws it plainly.
Found: the world is +X west, +Z north, so the plan now turns the sketches' numbers a half turn (its map matches them);
Rapier's height field misses a plumb ray, so the wheels lean 1e-4 on the island only (`Vehicle.plumbTilt`). Pins 2.1–2.5;
2.5 counts a step's work, as its wall clock read 25 ms under the suite's load against 1.6 ms alone. The island's design
moved from DESIGN §21 into its plan's §1 (one file, as he keeps a design talk); CLAUDE.md is this session's now.
Looked at once: no errors, down Crown Avenue at 126 km/h; the roads' edges are jagged over the coarse ground (slice 3).

## 2026-09-25 — M8.10 slice 1: the atlas

Done: `npm run atlas` draws the island as the sim knows it: `tests/atlas/island.test.ts` (ATLAS=1, out of the quick set
as the balance is) writes `output/atlas/island.js` (the coast and its parts, the ground's height every 8 m, the
districts every 25 m, the roads, the places, what stands where, the glyphs); `tools/atlas.html` draws it in the
sketches' style; `tools/atlas.mjs` saves `island.png` and `placed.png` in about 15 s. Today it shows the plan: the main
roads only; the districts' streets, blocks and buildings join its dump in their slices. Looked at once: the names off
the places, the four landmarks drawn. DEV names it.

## 2026-09-25 — M8.10 slice 0: the plan as data

Done: `src/sim/island/plan.ts` holds the sketches' island as data: the coast (a closed curve through 49 points, its parts
cliffs, quays, bay, beach), the port's basin, the causeway, the islet, the hills (the ridge moved north-west so the
tower stands on the island's top, 52 m), the districts by the harbour road and Palm Avenue, the highway's loop, the
avenues and the places' roads, the places and DESIGN §21.4's placed things; `geom.ts` its geometry. Moved onto land:
the cranes onto the quay, the lighthouse and its road onto the spit (the highway 16 m east to leave it room), the
hovercraft's slipway, the ice-cream truck. The highway's loop is 5.4 km, the grid ring's length (the talk's 7 km was
wrong; DESIGN §21.1 says so). Pins 0.1–0.7 (`tests/sim/island/plan.test.ts`).

## 2026-09-25 — M8.10 "The island": the plan written (Marcin: "zapisujemy i zaczynamy")

After the atlas of the grid island (his words: a simple generator with a few authored roads; no palm in Palm Gardens,
no quay on Coral Quay, no hill under Crown Heights) Marcin took a hand-drawn island and its placements whole
(`docs/island/`), asked what the brief's four games have that it lacks and took the answer (a runway and a mega-ramp to
an islet, a stadium, a quarry and a car park, drive-throughs, a freight train, the police headquarters, a giant duck),
and kept the size (2.54 km² of land; the grid's 2.48). Written: DESIGN §21 (the plan by hand, the rest from the seed:
the brief's change, his) and `docs/M8.10_PLAN.md` (slices 0–19, the island behind `?map=island` until the switch). In
its own worktree (`m8.10-island`) beside M8.8 and M8.9, both idle; its `CLAUDE.md` lines go to Marcin (rule 7).

## 2026-09-25 — The FX pass (Marcin: "Ulepsz efekty fx")

Done: smoke and fire are low-poly puffs, not soft points (`fx/Smoke.ts`): flat-shaded icosahedra lit and fogged with
the world, one instanced draw, hidden while empty; fire is self-lit tongues, yellow to red, shrinking as they rise.
New (`fx/Kickup.ts`): dust off dirt and grass behind a rolling wheel (more when it spins or slides), the hovercraft's
spray on the sea (a mist at rest), a landing's ring of dust by its speed into the surface (a landing slope throws
none), sparks off the floor past 8 m/s. The boost flame has a hot core. Pins FX.1–FX.5 (`tests/render/fx.test.ts`).
Seen in the browser once (sea, stage 3, drift). Open: on the playground no tyre smoke (the probe needs traffic; old).

## 2026-09-25 — M8.8: the physical police and rivals on (Marcin's word)

Marcin: "Włącz fizyczne radiowozy i rywali". The units were on since slice 23 (a bot's chase at three and five stars
in the scratch: a physical unit the whole chase, 2.2 and 3.5 of them on average, 4 at most), the races' rivals since
slice 22; the hunts' rivals were lane records (their takedown needed a lent body, which slice 23 made needless). Now a
duel's rival of either format drives a physical car near the player; Frank's car takes two rams at 16 m/s over his
speed to wreck, the lane record one. Decided: after his word the gate's perf does not switch them off by itself; a
failed budget goes to him with its numbers. Pin M8.8 22.5 (`driver.test.ts`).

## 2026-09-25 — M8.9 slice 6: one typeface, two styles

Done (R2): Rubik (OFL) in three woff2 faces, 50 KB (`public/fonts/`), cut from Google's variable TTFs (the static ones
are gone) with the ranges in `ui/fonts.ts`, the display face preloaded. Two rules at the end of `styles.css` set every
text: the label (Bold, upright, 0.06 em, 1.5 px ring) and the display (Black Italic, 2 px ring and a 2×3 shadow). The
outline is a ring of shadows (a stroke eats glyphs where paint-order fails). No text skewed: the job card, tabs and
DRIVE OUT keep −8° on `::before` plates. The ★ drawn inline (`hud/stars.ts`); the tiers' dots and the tick drawn in
CSS; the maps write once the face is in. Pins M8.9 6.1–6.3, stills looked at; verify not run (Marcin: finish, no tests).
Open: the door's `×2.6` keeps the English decimal point in Polish.

## 2026-09-25 — M8.8 slice 24: the budget's switch

Done: the switch the budget decides with: `POLICE.physicalUnits` and `AI.pool` (now settable, read when the world is
built) both 0 make no car in the AI pool, so the physics world is the one from before the AI drove, and every rival and
unit stays a lane record. Pin M8.8 24.1 (`driver.test.ts`; it fails with the switch on). Decided: the decision itself,
`npm run perf` twice against the phase's start (`dca86e1`) with four physical units and a rival (sim step p95 under 4×
CPU up by 2 ms at most, frame p95 not up), is taken at the gate (the pace rule); if it fails both knobs ship at 0, the
numbers to BACKLOG.

## 2026-09-25 — M8.8 slice 23: the police on the car model

Done: on a chase, a box or an arrest the `POLICE.physicalUnits` (4) units nearest the player within 80 m drive physical
cars of their bodies (`AiCars`, four more cars in its pool; given back past 110 m or when it is over): along their
plan's lanes at its speed, or straight at its aim point (`Traffic.planAim`: a ram's, a PIT's, a box slot braked into
and held on the handbrake); the shove accelerations retire for them, a hit is two masses, sensed as a lent body's.
Police's and the takedowns' "has a body" is now `solid` (a lent body or a car). Decided: under the busted card the units
keep their cars and stand (given back as the card closes, or the lane blend moves them). Pin M8.8 23.3 (`driver.test.ts`);
23.1 (the police long pins, now with physical units) and 23.2 (the balance at level 3) at the gate.

## 2026-09-25 — M8.8 slice 22: the AI driver; the rivals on the car model

Done: `ai/Driver.ts`, the track bot's method in the sim (pursuit at a lookahead point, the corner-speed plan inside a
grip budget, capped by a plan's speed): it laps the test track to the hundredth of the bot's. `ai/AiCars.ts`, a pool
of two `Vehicle`s parked and switched off: a duel race's rival (`RaceField.physical`; the hunts keep lane rivals, whose
takedowns need a lent body) within 40 m of the player drives one, its record a `puppet` (the lane follower leaves it,
it is drawn where the car is, the car's collider answers for it), its path its lane, the race's exit and the next
(`Race.bestExit`), resampled at a new lane; past 60 m, or stalled 3 s off its lane out of sight, the record goes back
to its lane blended as a lent body's. Pins M8.8 22.1, 22.4 (`driver.test.ts`); 22.2 and 22.3 long, run at the gate.

## 2026-09-25 — M8.8 slice 21: the mega-ramp

Done: the twenty-first jump (`MEGA`, `megaRamp`: its own launch and landing surfaces on the desc), 8 m wide, a 60 m
climb steepening to a 16 m lip at 27° under an orange port crane, over the street at z 225 onto a long landing slope.
Decided: on Coral Quay's east strip, not the Works' (their strips have a kicker before every crossing street). The
muscle car on full boost from the strip north of z 0: 140 km/h at the lip, 28.8 m at the apex, 3.1 s in the air (the
apex's 0.6 s of slow motion on top; the kickers keep theirs through the flight), down upright at 105 m on the slope,
1,500 into the bag (`bag.megaJump`); the hunt counts it once (JUMPS n/21). The city's fingerprint and the long kicker
pin take it apart. Pins M8.8 21.1, 21.2 (`jumps.test.ts`); 21.3, the apex frame on the low tier, at the gate.

## 2026-09-25 — M8.8 slice 20: the heat at sea; the sea trial

Done: at sea the units stay ashore and a hovercraft out of their sight escapes by the cooldown; from four stars the
helicopter holds it (nothing needed changing: the sea is nobody's cover). The sea trial: a trial def with a `route`,
ten buoys (red floats, drawn by the edge chunks) from its ring at the south slipway's top round the island's corner and
the east pier to a finish off the east slipway, a kilometre; each buoy counts within 25 m in order, the finish only
after the last (a shortcut does not finish); coins buoy to buoy; its ring shown only to a hovercraft; the way by road to
the ring, then by the buoys. On the water the skirt bites (`hoverWaterGrip` 4 across), and the rudders get a third of
their air from the idling fan, so it turns from rest. Pins M8.8 20.1–20.4 (`sea.test.ts`).

## 2026-09-25 — M8.8 slice 19: the slipways and the sea

Done: the sea's surface at −0.5 m (`GROUP_WATER`, nothing collides with it), met by the hovercraft's rays alone
(`QUERY_HOVER`; `QUERY_NOT_PROP` now leaves it out too, so it is nobody's cover); walls `SEA.limit` 180 m out hold it
in. Two slipways (`city/sea.ts`) through Coral Quay's parapet, south at x 497 and east at z 255 between the palms: 8 m
ramps 9 m out from the deck to −1 m, props kept off their tops; at each the island's wall is a gate (`GROUP_GATE`)
every chassis stops at but the hovercraft's, whose rays pass through it (they fell through it at first). Down one,
150 m out and back up at 30 km/h; a muscle car stops at the top. The full map widens to keep a player at sea on it
(`mapHalf`). Pins M8.8 19.1–19.4 (`sea.test.ts`).

## 2026-09-25 — M8.8 slice 18: the hovercraft

Done: `hover` (PODUSZKOWIEC; the 4×4's class, 1.4 t) on the car model's `hover` mode: the four rays are the cushion's
springs, plumb like the bike's, and push nothing along (`WheelState.tyreForce` 0); the fan pushes along the nose
(`fanThrust` 5,000 N, the power tier's; the brake pulls half back), the skirt drags 130 N a m/s along and 100 across,
split bow and stern; the rudders yaw it (`rudderTorque` 4,500 N·m in the fan's wash or at 15 m/s; twice on the
handbrake); no drift controller, the engine's revs follow the fan. 0–80 in 10.2 s, 110 km/h, 0.27 g at full lock, a
full turn at 60 km/h in 7 s runs 95 m out; still, it hovers without creeping. A fan's drone, a shanty for a clue;
ONLY IT: CROSSES WATER (JEŹDZI PO WODZIE); on the Quay's south promenade where slice 19's slipway goes. Pins M8.8
18.1–18.4 (`hover.test.ts`).

## 2026-09-25 — M8.8 slice 17: the police and the bike

Done: a unit's ram or PIT that lands on a bike (the contact the roster counts as a ram) knocks it down: `Vehicle.tumble`,
bike and rider for 1.2 s, then up and away; a wreck only if the damage wrecks it. The ram's shove on a bike is
`POLICE.bikeShove` (0.6) of a car's. The arrest's slots close in by what a body's footprint lacks against the compact's
(`arrest.footLength` 1.9, `footWidth` 0.85, `slotReach`): a bike is boxed as tight as a compact, a car's slots unchanged.
The bots' bike case: `BotPolicy.keepCar` never swaps. Pins M8.8 17.2 (`police.test`: a ram at 50 km/h drops it, it rides
on inside 2 s); 17.1 long (`police.long`: stopped at heat 2, busted in 20 s, four worlds) and 17.3 (the balance: its
busted rate at level 3 within a quarter of the muscle car's) run at the gate.

## 2026-09-25 — M8.8 slice 16: scooters in the traffic, the bike in the catalogue

Done: `scooter` (SKUTER), the bike's class at 190 kg on 12-inch wheels, 11 N·m through a long reduction: 0–50 4.9 s,
69 km/h on the rev limit, a 0.45 g turn leans 25°, the 45 km/h slalom never falls; the Bubble's two-stroke. 0.05 of a
street's draw (4–5 %), twice in Crown Heights and on Coral Quay, never on the highway, at 0.9 of the limit; worth 6,000
kept. Drawn from `bikeMesh.ts`'s shapes (sport, scooter): leg shield, cowl, a red box; a courier in red rides a driven
one (the traffic's rider mesh, built with the first), a parked or left one stands empty. The model's ladder takes the
bike after the 4×4 (straight after the van the 4×4 waited 10.5 min, past the 10.1 pin's 10). Pins M8.8 16.1
(`bodies.test`), 16.2 (`swap.test`), 16.3 (`garage.test`); M7 6.2 counts the couriers' mesh.

## 2026-09-25 — M8.9 slice 15: the preview; GOALS in pictures

Done (R10): a focused card on STYLE shows on the car in the room (`sim/garage/look.ts`: the look is the car's paint and
kit with the focused paint or item in its place, drawn only; `PlayerCar.setLook`): paint, wheels, a spoiler, the stance,
a topper, neon; a flame or smoke puffs for 1 s; a horn sounds once (`Sfx.horn`); a spoiler, a flame or smoke turns the
turntable to show the tail. Leaving shows what the car wears again; buying makes it so. GOALS in pictures
(`ui/wall/goals.ts`): the day's three with a bar each (`Dailies.share`), the board as the rivals' cars from the atlas
(the beaten ticked, the next framed), the hunts as counters with their glyphs (`board`, `ramp`, `coin`), the best run.
The look suite shoots `preview` and `goals`. Pins M8.9 15.1–15.3. Stills and verify green.

## 2026-09-25 — M8.9 slice 14: the pictures

Done (R10): `render/cars/thumbs.ts` draws an atlas of 160×100 cells, one per body and per kit item, at the session's
first door, three a frame while the wall is up and never while the run drives (`ThumbQueue`); a car in its paint
three-quarters from the front (built for its shot and freed: the atlas keeps it; a respray draws it again), the car's
kit on a grey car, the neon, the flames, the smoke and the horns as swatches in their shapes (the flame is the glyph).
Drawn at twice the size into a render target and scaled down; the wall's cards draw their cells (`Pictures`, the ui's
shape of it) and show them in place of the swatch. Pins M8.9 14.1–14.3. Stills and verify green.

## 2026-09-25 — M8.8 slice 15: the rider, the look

Done: the bike drawn (`bikeMesh.ts`): a sport bike in blocks, paint on the tank, fairing, nose, tail and mudguard, its
own two wheels on the body, the front one in a fork that turns with the steer, the brake light (2,608 triangles); the
rider astride in navy and a white helmet, arms to the bars or thrown up in a fall (a `tumbling` flag on the telemetry;
200 triangles). The topper on the helmet a size down (the mesh's `crown`), the flame at the exhaust, the neon under it;
no car part fits a bike (`kit.fits`). The chase 3 m closer and 1.1 m lower a metre under 1.5 m half a length (the bike
1.35 m closer, the trolley 2.4), fitted at the start too. A bike left in the street stands among the traffic without its
rider; the ghost is a bike. The twin's voice came with slice 14. Pins M8.8 15.1, 15.2 (`tests/render/bodies.test.ts`).

## 2026-09-25 — M8.9 slice 13: the showroom

Done (R10): the door shut, the camera leaves the back corner over 0.6 s for the showroom (`render/camera/showroom.ts`):
the car glides to the room's middle and turns on a turntable at 8°/s (drawn only: `PlayerCar.showroom`, the sim's pose
untouched), three-quarters from the front, framed in the left 52 % at every size (the eye as far as the turning
footprint needs, 5–10.5 m, inside the room); the wall slides in on the right, `min(45vw, 36rem)`. The room: a pale
ceiling with three strip lights, a painted bay, the house in orange neon over the posters, and one warm light in the
scene from boot at zero, raised over the shut garage (the light count never changes). TOTALS fits 800×450. The buses
(12 m) overflow the band: the room is too small for them. Pins M8.9 13.1–13.4. Stills and verify green.

## 2026-09-25 — M8.9 slice 12: signs that read; faults that are not faults

Done (R7, R12): a sign never reads smaller than 28 px at 720p in the HUD's scale out to 150 m (`signScale`: drawn
larger about its centre past the depth where its face would shrink under it; beyond 150 m it shrinks with the world),
the goal's a quarter larger, the pay label over the face as drawn (`Renderer.signTop`); no coins round the rings (the
rings' pool stays empty; the route's coins stay); the helicopter's cone went: a lamp on its belly and a soft-edged spot;
a thinned car's steady state is a one-pixel checker (`FADE.floor` 0.5, where the 4×4 pattern is one), the halftone only
while it fades. The chase's teaching line drops its lead (the goal line says LOSE THEM). Pins M8.9 12.1–12.4. Stills
and verify green.

## 2026-09-25 — M8.8 slice 14: the bike's model

Done: a seventh class, `moto` (MOTORBIKE, MOTOR; JAMS, KORKI), the car model on two wheels (`twoWheel`): the four rays
on a 0.1 m track go straight down and push straight up, so a lean never lifts them; an upright controller holds the lean
of the turn's g (at most 50°, `leanGain` 220, `leanDamping` 30); a hit over 9 m/s, or a lean past 70° under 5 m/s, lets
go for 1.2 s and stands it up where it lies (`tumbleLeft`). 290 kg, 95 N·m to 11,000 rpm: 0–100 4.5 s, 179 km/h, 27 m
from 100, a 36.1 s lap; a half-g turn leans 26°, the 60 km/h slalom never falls, a 12 m/s wall drives again 1.2 s after.
A slim placeholder shell until slice 15; 36,000 on the wall. The cars row takes `upTurning` (a bike leans; cars keep 0.9);
the compact's tightest circle is of the cars. Pins M8.8 14.1 (its row), 14.2–14.5 (`bike.test.ts`).

## 2026-09-25 — M8.8 slice 13: the rocket trolley

Done: `trolley` (the compact's class on castors, 180 kg with its rider): a push is its engine (5.5 km/h on the throttle,
no engine braking), the rocket its boost (1,560 N: 0–100 4.2 s, 187 km/h), 8 s a meter that fills by itself in 4
(`boostRegen`, a new tuning number, 0 on every other car). The plan's 2° of lock at speed turned it 13° in the 100 km/h
pulse, more than the van: 1° from 54 km/h, turned slowly, turns it 2° (the bus 3.7, the least of the rest). Its rider
sits in the basket (boxes in the pedestrians' colours), the boost's flame at the rocket's nozzle (`CarProfile.nozzle`),
a rocket's roar for a voice, a countdown for a clue; on a corner of the Crown Tower's plaza. ONLY IT: RIDES A ROCKET
(TYLKO ON: JEŹDZI NA RAKIECIE). Pins M8.8 13.1, 13.3, 13.4 (`trolley.test.ts`), 13.2 long (bodies.long).

## 2026-09-25 — M8.9 slice 11: the words, the pause, the loading, the cards

Done (R11, R12): KÓŁKO for a job's ring and STREFA for a zone (ROZBIJAJ AUTA W STREFIE, GOTOWE · KÓŁKO JEST NA MAPIE),
R is OD NOWA (RESET in English), OSŁONA became UKRYCIE; every line in capitals (`#ui` sets them, the Polish table has no
lower case the screen shows: the hints, the resume line, WEŹ AUTO · OD NOWA, the landmarks, KM/H); the busted card says
NACIŚNIJ DOWOLNY KLAWISZ with no keycap. The pause in its order (PAUZA, the resume line, the sound, the settings, every
key: the swap and the sound joined the list, the build small); the loading screen on the sky's three stops with a thin
bar over the boot's phases (`BootWatch.progress`); WRAK at 20 %, over the debris. The look suite shoots `pause`,
`loading`, `wreck`. Pins M8.9 11.1–11.3. Stills and verify green.

## 2026-09-25 — M8.8 slice 12: the monster truck

Done: `monster` (the 4×4's class, 4.2 t, 0.95 m wheels on 0.8 m springs, the chassis' underside 1.8 m up, so a car
passes under it and only the wheels meet it): each wheel's ray keeps the collider it stands on (`WheelState.hitHandle`),
and a car a wheel has been on for 0.2 s is flattened (`BodySpec.crush`, `Life.wheelStep`), a unit as a takedown. A
ray put a wheel on a 1.4 m roof in one step and threw the truck: the contact now rises at most `climbSlope` (0.8) of the
way driven (`Vehicle`, rises over 0.1 m only), and the crushed car takes up the climb's spring (the rise to 1 m/s, pitch
and roll to 0.3). Across a sedan at 30 km/h: 0.66 m up, 22° at most, down on four wheels. Straddled lengthwise a car
passes between its wheels. On the Gardens' park strip between two jumps. Pins M8.8 12.1–12.4, the card in 11.5.

## 2026-09-25 — M8.9 slice 10: the radar and the full map

Done (R6): the radar answers where to go, where the police are, where to bank: streets mid-grey, the loop and the
highway pale, the route cyan 6 px (the brightest line), the goal's badge 20 px, rings as 6 px dots, units blue flashing
red with the stars while seen, a race's rivals as red arrows, the nearest garage only with money in the bag or a BANK
IT / BUY goal not already at a door, caches within 80 m, a 14 px ink arrow; every size in the disc's scale
(`radarScale`). Landmarks, the other garages, far caches, cameras, cover and breakers are the full map's, whose badges
are 12 px, route 6, key only what is on it now, and districts' names at a spot clear of every icon (`clearSpot`). The
painter records what it drew (`RADAR` bits). Pins M8.9 10.1–10.6. Stills and verify green.

## 2026-09-25 — M8.9 slice 9: one moment, one message

Done (R5): `TopVoice` (`ui/hud/voice.ts`) gives the goal line one more: the caption and the job's card (and its result)
take it, the rest waits in order (warning, the stars, news, a teaching line, the step card, NEW), a line 4 s at most
(the clock stops under the intro's caption), a card for its turn; the step and NEW cards wait out a running job. The
ticket speaks alone: no line, no pop, the swap prompt on the ticket (E POŻYCZ); the disguise's clock shows after the
borrow. Four hints for 8 s in sessions 1–2, the full list on the pause; three teaching lines once per profile; a card is
a title, one line (≤ 34, both languages) and its number; cards 2.5 s. Decided: `taught` and `sessions` join v6 as the
language did (no version bump while M8.8's build shares the save). Pins M8.9 9.1–9.6. Stills and verify green.

## 2026-09-25 — M8.8 slice 11: the pancake and the steamroller

Done: `Traffic.flatten` wrecks a record where it stands, flat at its heading, gives back its lent body and never lends
it again (nothing to hit); the render draws it a quarter high and a tenth wider (`traffic.flat`), a `flatten` event plays
a crunch and a two-note sag. The steamroller (`roller`, the van's class, 9 t, 33 km/h flat out) flattens every car its
front drum meets (`BodySpec.drum`, `Life.flattenStep`, a ground-rectangle overlap test): a driver climbs out shaking a
fist, a unit is a takedown, a roadblock's car breaches the block and pays. Hidden on the Works' yard by the giant ball,
a slow low chug for a clue; its card ONLY IT: FLATTENS CARS (TYLKO ON: ROZJEŻDŻA AUTA). Bodies added since M8.8 are
appended in the order they came (`ADDED`). The crazy cars are measured, not ranked, in bodies.long. Pins M8.8 11.1–11.5.

## 2026-09-25 — M8.8 slice 10: the 4×4 class

Done: a sixth class, `offroad` (4×4, TERENÓWKA; OFF-ROAD, TEREN): 1,950 kg, 4WD, 360 N·m to 6,000 rpm, 0.42 m wheels on
0.42 m springs; 0–100 7.8 s, 165 km/h, 36 m from 100, a 27° drift, a 38.5 s lap; on a lawn 8.0 s (the muscle car 8.3).
Its shell is appended after the last body; `isShell`, the descriptors, `Jobs`, `ensure` and the parked police read the
class through the body, never the index. The SUV and the pickup drive as it; 40,000 on the wall, which now lists the
catalogue by price; the model's first hour buys it. Decided: pin 10.2 leaves out the sports car (5.1 s on a lawn; beating
it would need grass that stops road cars dead); the track bot's budget stays hand-set (11, the van's; no rule fits the
five). Pins M8.8 10.1 (its row), 10.2, 10.3 (save.test), 10.4 (bodies.test).

## 2026-09-25 — M8.9 slice 8: the corners and the gauge

Done (R4): the stars without their panel, outlined, the next one filling from its foot (`heatFill`, 24 steps; the `+n`
went); the money block under them, the bank (the coin) then the bag (the sack, its × from ×1.3), the pops' lane under
it; the combo named KOMBO, its × from ×2; `ui/hud/gauge.ts`, a round dial of 150 px at 720p on the radar's dark disc:
the speed, km/h, the boost's 270° arc in ink (a pulse when full, white while boosting, the flame at its start), the
damage's inner arc in red for 3 s after a hit and standing from the third stage (NITRO and USZKODZENIA went). The sack,
the coin and the flame are `sim/glyphs.ts` outlines, drawn by `ui/glyph.ts`; the wall's sum drops ×1. The chase still
now carries a bag; screens' life frame sets stage 3. Pins M8.9 8.1–8.5. Stills and verify green.

## 2026-09-25 — M8.8 slice 9: grass and dirt

Done: `sim/city/surface.ts` lays each chunk's flat ground statics into 2 m cells the first time the city generates it
(0.1 s for all 49, 4.6 ms the worst chunk), the topmost deciding by colour: the grass's, the soil's (dirt), anything
else paved; every lane reads asphalt at every 3 m. Each grounded wheel reads its cell (`Vehicle.ground`,
`WheelState.surface`) and scales its grip and rolling resistance by the tuning's `grassGrip/Roll`, `dirtGrip/Roll` (the
4×4 gets its own). The plan's ×0.65/×4 made a lawn only 15 % slower for the muscle car (pin: 30); 0.7/×7 gives 35 %
(the compact 50, the van twice, the sports car 19), dirt 0.8/×5; a stronger ×8 made the compact hunt gears on its
wheelspin. Skid marks on asphalt only; drift smoke off grass or dirt in its colour. Pins M8.8 9.1, 9.2; 9.3 the gate's gc.

## 2026-09-25 — M8.9 slice 7: the HUD on one scale (slice 6, the typeface, waits for the font's download)

Done (R3): every size of the screen's rules is in rem (a one-off rewrite; borders, shadows, radii and the dev panel keep
their pixels) and `ui/scale.ts` sets the root's font size to 16 px × the height over 720, held to 0.85–1.5, from
`main.ts` before anything is laid out. The clamps by the height became fixed rem (the speed 3.4, the stars 1.6, the radar
10.35 = 165.6 px at 720p); the short screens' shrinks and the wall's ×1.2/×1.4 steps went (the scale does both); a label
is 1 rem at least, the keycaps too. Stills at 800×450, 1280×720, 1920×1080: no text under 13 px at any, TOTALS fits
800×450, the line 30 px at 1080p. Pins M8.9 7.1–7.3. Verify green.

## 2026-09-25 — M8.8 slice 8: a voice per engine

Done: `src/audio/voices.ts` gives each class a voice and the engine speaks in the body's (`EngineAudio.update` takes
`sim.carBody`): the muscle and police cars' V8 (four pulses a revolution, the engine as it was), the sports car's six
(three, smooth and bright), the compact's four (two, buzzier, an octave up at the same revs), the van's diesel for every
truck and bus (two, low, on a clatter of band-passed noise), the Bubble's two-stroke (one, a square's buzz and a rasp). A
swap glides the mix over about 0.3 s. Pins M8.8 8.1, 8.2 (`tests/audio/voices.test.ts`); the sound is Marcin's ear.

## 2026-09-25 — M8.9 slice 5: one colour, one meaning

Done (R1): `SIGNALS` in `sim/palette.ts` (money, way, trouble, police, ink, off, outline), the CSS's `:root` the same
(`--money` … `--outline`, `--panel`, and three non-signals: the backdrop, the ticket's paper and ink), `ui/colors.ts`
for the canvases. Every old accent moved by its meaning: selection, titles, the combo, a full boost, NEW BEST, the next
car, the streak, the hunts, the escape bar, the video icon, a kept car's frame, the next rival's chip and the tabs to
ink; the radar's player and highway, the garages and the landmarks to ink, a race's rivals red; a pop is yellow only when
it names money; the news' lead by its tone (the stars red, the radio blue, the rest ink); the stars ink, flashing red and
blue while seen. The +n stays till slice 8's meter. The look's chase is the skilled bot at three stars. Pins M8.9
5.1–5.5. Verify green; stills: the flash, the blue radio, the white tabs.

## 2026-09-25 — M8.8 slice 7: damage you can feel

Done: from stage 2 the engine gives 0.95 of its torque, at stage 3 0.9 (`DAMAGE.handling`, `Vehicle.torqueMul`), and the
car pulls toward the side of the hit that raised the stage (`Life.hurt`, summed with a puncture's pull); a swap, the
drive-out or a fresh car clears both (`heal`). The plan's numbers broke its own pins, measured on the straight: 0.85 made
the van's 0–100 19 % slower (pin: at most 15; 0.9 gives 12–14 % in every class), and half the spike's 900 N drifted the
muscle car 3.7 m in 100 m at 80 km/h (pin 0.5–1.5): the pull is 0.045 / 0.09 m/s² of the car's own mass, about a metre
in every class. The cold open's van (stage 2 by `setDamage`) gets the tired engine, no pull. Pins M8.8 7.1–7.3.

## 2026-09-25 — M8.8 slice 6: the three with connections; the rival at its car's pace

Done: the Fake Cruiser's disco bar pulls the road ahead over as a lit unit does (`BodySpec.lit`, `Traffic.playerLit`);
busted in the gold limo the Mayor pays: three quarters, the lawyer or not, the card says THE MAYOR KEEPS 3/4
(`bribes`, `Run.lastUncle`; the lawyer is still spent at the run's end, as at any door); the Chief's Cruiser runs no
dispatcher's clock (`unreported`), a seen crime still blows it. A duel's rival pulls away at its car's rate
(`aiAccel`, 16.7 m/s over the body's measured 0–60; in place of the unit's ×1.5): the Bubble 7.1 m/s², the Wrecker and
the Party Bus 4.2 (their hunts start slower). BEST AT: CLEARING THE ROAD, GETTING BUSTED, DISGUISE. Pins M8.8 6.1–6.4.

## 2026-09-25 — M8.9 slice 4: the sun and the clouds

Done (R9's sky): the sun's disc and a wide warm halo (an additive fan and ring) on the light's bearing but low, at 9°, in
the warm band (the plan had the disc on the light itself; at 32° it would stand in the violet like a moon, and the light
stays high so the streets are not all in shade); the dome warmer toward the sun below 40°; twelve flat octagon clouds,
seeded, 8°–25° up within 80° of the sun's bearing, orange-pink underneath and violet on top. All ride with the camera;
three sky meshes, two draws added. The look suite gains `sunward` (the calm street turned to the sun). Pins M8.9
4.1–4.3. Verify green; stills: the sun, its halo and the lit clouds over the Crown's lit offices.

## 2026-09-25 — M8.8 slice 5: the eight drivers' cars

Done: each trophy's own numbers on its class (`BodySpec.tune`, after the mass) make it the best in the game at one thing,
against every body (`bodyMeasure.ts`: drift, pulse, grip, wall, boost; `bodies.long.test.ts`): the Wagon holds a 43°
drift (next 36), the Pizza Hatch turns 31° in the 60 km/h pulse (29), the Wrecker takes half a hit (`BodySpec.armour` 2,
read by `Life`), the Twin holds 3.4 g (3.1), the Party Bus 159 km/h at 6.5 t, the Lowrider's nitro lasts 6 s (3.6), the
Bubble 0–100 in 3.7 s (4.3), the Phantom 228 km/h (204). The card says BEST AT (`carLine`; in Polish agreeing with the
car: NAJTWARDSZA, NAJSZYBSZY, `PL_BEST`). Pins M8.8 5.1–5.2 (long, run once here), 5.3; bodies 4.1 leaves the Twin and
the Phantom their own numbers. Verify green.

## 2026-09-25 — M8.9 slice 3: the city lit at dusk, with depth

Done (R9): `render/city/glow.ts` gives the city's one material a `cityLook` attribute (a byte of glow, a byte of
"facade") and a hook chained after the road paint's: after the light and before the fog it adds a warm glow and shades a
facade by its height. A quarter of the upper windows lit (the draw is the window's place to the decimetre, so the same
city lights the same windows), six in ten shop windows, the lamp heads (a `glow` part of the lamp prop; a knocked lamp
goes dark); the facades 0.8 at the ground to 1 at 12 m, times a contact band of 0.7 in the lowest 0.4 m. No vertex, draw
or light added. Stills: the lit windows and shop fronts read at 1280×720; the districts' numbers as slice 2's. Pins M8.9
3.1–3.4. Verify green.

## 2026-09-25 — M8.9 slice 2: the golden hour

Done (R8): the sun at 32° on its old bearing (was 51°; at the plan's 25° the streets sat in shade and read as night),
warm gold `#ffcf8f` at 2.4; the fill a lavender sky over a warm ground bounce at 1.5, shadows 0.85; the sky in three
stops on a 5°-ring dome (peach at the horizon, rose at 5°, deep violet from 15°), the fog and the background the
horizon's; `CITY_COLORS` a third more saturated, the asphalt bluer, `ACCENTS` one table for the districts' canopies,
rails and props (gold, teal, flower pink, aqua; were literals in City.ts and propMesh.ts). The look suite reads the
saturation on lit pixels only and the near-black share (a dark frame read colourful). Stills, the four districts: S
0.31–0.40 (0.19–0.20 before), over 0.5 16–30 % (4–6), band 0.26–0.32, behind the HUD 0.08–0.10 (0.25–0.36), near black
1 %. Pins M8.9 2.1–2.3. Verify green.

## 2026-09-25 — M8.9 slice 1: the look suite and the before set

Done: `e2e/look.spec.ts` (`npm run look`) shoots the plan's twelve states and the four districts' calm drives, reads the
world's numbers from the WebGL canvas alone in the frame's own task (mean saturation, the share over 0.5, the facades'
band, the luminance behind the HUD, the clipped share instead of "a sunlit chalk channel", which no frame can find by
itself) and the HUD's from the DOM (texts under 13 px, the top centre); `LOOK_STATES` picks, `LOOK_SIZES=all` adds the
small and the big screen, `LOOK_GATE=1` asserts §1.2. The before set (0.8.7 with slice 0) is in `screens/look/before/`:
the districts at S 0.193–0.202, 3.6–5.6 % over 0.5, band 0.19–0.22, behind the HUD 0.25–0.36, clipped ≤ 0.5 %; the heli
frame S 0.176, behind the HUD 0.41. Runs on this worktree's port (4238).

## 2026-09-25 — M8.8 slice 4: every body its own mass; any body at the start

Done: `bodyTuning` scales every body that is not a shell to its own mass, each force with it (the trucks' and buses'
rule since M5.5, now every body's): a Bubble is 550 kg in the player's hands as on the street, a taxi 1,450; a shell and
a rival on a shell stay their preset bitwise. `?body=<id>` and `SimWorldOptions.body` start the player in any body
(`SimWorld.setBody`; DEV). `tests/sim/bodyMeasure.ts` measures a body; the long `bodies.long.test.ts` measured all 28
once here (every body's 0–100 within 1 % of its class's) and writes `perf/bodies.json` for the report. Pins M8.8 4.1,
4.3 (bodies.test; 19.4's taxi mass moved to its own); 4.2 long. Verify green.

## 2026-09-25 — M8.8 slice 3: what a car is for, on its card

Done: every CARS card says its class's job in one quiet word under the name (`ROLE_WORDS` and `cardLine(body)` in
`sim/jobs/catalog.ts`): DRIFT, CITY, RAM, SPEED, DISGUISE; a civilian body its class's (a kept taxi DRIFT, a bus RAM).
In Polish DRIFT, MIASTO, TARAN, PRĘDKOŚĆ, PRZEBRANIE: DRIFT and MIASTO are the words the combo and the boot already say
(the plan's POŚLIZG would have been a second name). The line is a label (it follows the language) in the dim ink, no
colour of its own, so M8.9's tokens and scale take it as they come. Pins M8.8 3.1, 3.2 (`tests/ui/wall.test.ts`); the
ten sizes are the gate's screens. Verify green.

## 2026-09-25 — M8.8 slice 2: the compact, the city car

Done: the compact is quicker than the muscle car to about 80 km/h, level at 100, slower above (212 N·m with a strong
middle, 4.1 first, a 4.6 final drive, 0.8 overdrive, drag 1.3), and the quickest to change direction (yaw inertia ×0.85,
steer rate 7); still front-drive, no power oversteer. On the straight: 0–60 2.43 s (muscle 2.78), 0–100 5.93 s (6.17),
top 144 km/h (172); the turning circle at 20 km/h 4.0 m, the smallest (sports 4.8, muscle 5.1). Tuned on a scratch
harness over eleven candidates. cars.test's compact 0–100 window moved (8.5–13 → 5.6–6.5, header note) and the swap
and garage 4.4 pins' with it; its lap, drift and turns stand. Pins M8.8 2.2, 2.3. The city bot's lap is the gate's. Verify green.

## 2026-09-25 — M8.9 slice 0: the pay label, the sign in the camera, the pause's veil

Done (R7, R12): `PayLabel` wrote its place only when it moved half a pixel from `NaN`, so it never did and sat in the
screen's top-left corner since M8.7 slice 3; now `moved()` is true from an unplaced point, and the label names the kind
in ink with the pay in yellow (UCIECZKA +3000, a rival by name). A sign whose face grows past 15 % of the screen's height
shrinks with its pole and is gone at 20 % (`signFold`, stateless by size: at the resting 60° that is 8.8 m to 6.6 m
from the camera), so driving through a ring never fills the screen. The pause is its own fixed layer on the UI's root
(z 45): its veil covers the line, the bag and the bank. Pins M8.9 0.1–0.4. Verify green; the stills come with slice 1.

## 2026-09-25 — M8.8 slice 1: every police car is a disguise

Done: the descriptor carries `police` (a unit taken on the street, whatever its class, or the police's own bodies,
`policeLiveried`: the patrol car and the Chief's Cruiser; not the Fake Cruiser), and the disguise and the blown cover read
it, not the class. A borrowed interceptor or police van keeps its colours (`Life.swap`; `PlayerCar` shows the paint a car
came in on the road, the garage's only behind the door) and wears its class's livery with the bar lit while the disguise
holds (`PoliceView` builds the player's livery per class). BORROW's promise now holds for every unit. Pins M8.8 1.1–1.4
(`tests/sim/disguise.test.ts`). Verify green.

## 2026-09-25 — M8.8 slice 0: upgrades after a swap, the Chief's one car

Done: a car taken on the street drives with its class's upgrades (`Life.swap` retunes with `Garage.tuningFor`, as the
drive-out does; tier 0 is the body's stock bitwise). The Chief chases in his own cruiser (`chiefcar`, the police class,
its own paint) instead of an ink interceptor: `spawnPoliceAt` takes a body, his PIT stays (`pit` is the Chief or the
sports class); `PoliceView`'s Chief kit sits on the police shell, no band, its two lenses over his bar's red and blue,
picked by body. Pins M8.8 0.1 (swap.test), 0.2 (board.test M6 2.3); heavy.long 7.1 and 7.3 moved to the cruiser (the
long set, run at the gate). Verify green.

## 2026-09-25 — each worktree's e2e on its own port

Found setting up `m8.8-fleet`: the quick verify's smoke (and every e2e suite) served on 4173 and Playwright reused
whatever answered there, so from this worktree it tested the main folder's `vite preview` (Marcin's game), not the
branch. `e2e/port.ts` gives a linked worktree its own port from its folder's name (`m8.8-fleet` 4291, `m8.9-ui` 4238),
never reused, so a busy port fails the run instead of testing another build; the main folder keeps 4173 and its reuse;
`E2E_PORT` overrides. Pin `tests/tools/port.test.ts`; CLAUDE.md rule 6 and DEV say it. Verify green, the smoke on 4291.
And the harness keeps a worktree session's git inside its worktree (`git -C` on the main folder is refused), so a slice
reaches main by a fast-forward push to origin (CLAUDE.md rules 1–2); Marcin pulls in the main folder before he plays.

## 2026-09-25 — two milestones at once: M8.8 beside M8.9 (Marcin)

Marcin runs M8.8 (the fleet; session "Pojazdy w grze", branch `m8.8-fleet`) and M8.9 (the look; "UI/UX i style",
`m8.9-ui`) at the same time, each in its own worktree; M9 after both gates. The rules are CLAUDE.md's new section: nobody
works in the main folder; a slice reaches main by merging main in, verify, then `merge --ff-only`; shared files are added
to; the fleet's screen work goes through M8.9's look, and M8.9's pictures cover every body. Found: Playwright reuses
whatever answers on 4173, so an e2e run beside Marcin's game measures main's build. M8.8's plan follows (its gate runs
M8.7's unrun perf A/B, e2e and balance if M8.9's has not; its perf is an A/B against 0.8.7); DESIGN §11 and M9's header
say side by side, M9 after both. Docs only.

## 2026-09-25 — M8.9 "The look" planned (a review of every screen with Marcin)

Marcin opened a talk on the UI, the UX and the style: look at everything first. Every state captured in Polish at
800×450, 1280×720 and 1920×1080 (the intro step by step, every job kind, chases at three and five stars, busted, the
door's pages and offer, the full map, the pause; scratch in `output/ui-review/`, the twelve-frame sheet
`_przeglad-ui.png`) and measured: the world's mean saturation 0.18–0.21 with 2–5 % strong pixels, the sun 1.8 at 51°
over a fill of 1.35; the HUD's words on the sky at 1.1–2.3:1 against it; yellow and cyan with many meanings; fixed pixel
sizes (11–20 px); moments of nine things; a radar of sixteen kinds of mark; the bag without its glyph; the garage a text
sheet over the car. Two faults of M8.7: the pay label stuck in the top-left corner (`PayLabel.show` compares with NaN),
the camera flying through a sign. His mark 6/10, his bar "10, at least 9"; he accepted the review and the direction whole.
Set here: `docs/M8.9_PLAN.md`, design and contract in one file, seventeen slices after M8.8's gate, slice 0 (the two
faults) on his word before M8.8. He approved the plan's one exception to the pace rule (a visual slice ends with its
stills, under a minute; CLAUDE.md's Pace) and asked for the push; no work starts before his signal. Docs only; verify
not run (no code touched).

## 2026-09-25 — M8.7 gate: 0.8.7 (M8.6's gate closed inside it)

Report `docs/M8.7_REPORT.md`. `verify:gate` 525 of 526 on the final tree: the city tour's 120 s timeout at 134 s under
the suite's load (64 s alone); the gate now runs a worker a core. §20.5 read: six things at the ten sizes, greyscale, the
still test; the radar's signs were 13.4 px across, under the 14 px floor at 800×450, now 14.5; a bot's first five
minutes: the first job 11.6 s after the drive-out. Not run, stopped at Marcin's word: the perf A/B against 0.8.5, the e2e
suites, the balance (BACKLOG, the next gate's first job). The 0.8.5 copy for the A/B deleted. Next: his play of 0.8.7,
then M8.8 on his word. Verify green.

## 2026-09-24 — M8.8 "The fleet" planned (a talk with Marcin on the vehicles)

From "list every vehicle": the 28 bodies, the five classes measured (0–60, 0–100, top, 100–0), and what they lack. Found
in the code: a swap drops the class's upgrades; a borrowed interceptor or police van shows BORROW but gives no disguise
(the check is the class) and turns the garage's colour; the Fake Cruiser (#6) disguises like the 120,000 police car; the
Chief is two cars; the compact, the first purchase, is worse than the free starter at every speed. Designed with him:
a job per class, the trophies each best at one thing, the 4×4 on grass and dirt, three crazy cars, the motorbike, the
hovercraft and the sea, a mega-ramp instead of a helicopter, a steamroller instead of a tank, the police on the car
model. One document at his request, first as M10 after the launch; on 2026-09-25 he put the whole of it before the
platform: `docs/M8.8_PLAN.md`, on his word after M8.7's gate, then M9.

## 2026-09-24 — M8.7 gate, the long pins (M8.6's two with them)

`verify:gate` had nine red. Jobs 1.7 by its cause: two cars nose to nose in a junction's box (a forced entry and a turner)
waited for each other for ever, and delivery #12's queue stood behind them; now the one further past its line steers out
beside the other and crawls past (pin M8.7 5.1; #12 57 s of 62). Botpolicy 5.8: the bot shoved a wreck onto a queued car
at 0.6 m/s till it reset (M8.6's wrecks no longer slide off); the policy bots go round a block as the cold open's does.
The gc pin counted the bot's reset teleport as streaming; it skips that step. The skeleton and cold-open pins roll into
their rings (D8); the three timeouts pass alone. PROGRESS up to M8.6 archived. Verify green.

## 2026-09-24 — M8.7 slice 4: one kind at a time, the pick, the detour

Done (D10, D7's pick, D2's roadblock): the kinds come out with the chain (`BALANCE.reveal`: deliveries from the start;
races and trials after the first job; rage and mayhem after the first bank; escapes after the first car; orders after the
escape at two stars), each with a NEW card after its step's and its signs rising; the save's chain decides. The test
worlds show every kind (`reveal: true` in the helper, as the teasers are off); `?reveal=all` and `?job=` do in the game.
A click on a ring on the full map pins it as the goal until taken or let go (`Way.pick`). A roadblock up costs its lane
800 m in the field, so the route goes round it when it can; down, it comes back. Pins M8.7 4.1–4.4 (4.2 the NEW card's
words). Verify green.

## 2026-09-24 — M8.7 slice 3: the signs and the colours

Done (D5–D7): `sim/glyphs.ts` holds one outline per kind (parcel, key, police light, stopwatch, chequered flag, crash
star, claw hammer, taxi, house, star, seven-segment digits for a rival's number), drawn by the world, the maps and the
line. `render/run/signs.ts` chooses the signs (pure, pinned) and `MarkerView` draws them instanced: a round sign turned to
the camera on a steel pole, or floating over a rival's car, a job's target, the wanted car, a hailer, a door the way leads
to; open white, the goal cyan and bobbing, closed grey. The nearest open sign ahead within 100 m shows its pay (a DOM
label the app places from the camera). The line's dot became the goal's badge and TAKE A JOB its ring's name and pay
(DELIVERY +1,200). The kinds' colours are gone; the boost bar is dim ink. Pins M8.7 3.1–3.5. Verify green; looked at the gate.

## 2026-09-24 — M8.7 slice 2: taken by choice, not in a chase

Done (D8, D9, D11's ring): a ring starts its job when rolled into under 20 km/h (`startSpeed` 5.5 m/s; a rival keeps its
pull-up); driven through faster nothing starts, and the pass says SLOW DOWN IN THE RING (ZLECENIE · ZWOLNIJ W KÓŁKU) at
the top while the first job is to come, then on the session's first three passes (`ringPass`, the sim decides). The start
is the existing `jobStart` (its two-note chime; the plan's new `jobTaken` was not needed) and lights the ring cyan for
0.4 s. `Jobs.live` became `shown`; `open` adds: nothing opens with the police on the player (fares do not hail), grey on
the road and the maps, the cold open's ring excepted; its caption reads PICK UP THE PACKAGE · SLOW DOWN IN THE RING. Pins
M8.7 2.1–2.4; the way's 0.6 calls the chase off between deliveries. No bot starts a job by driving in. Verify green.

## 2026-09-24 — M8.7 slice 1: the route on the radar, no arrow

Done (D3, D4, D11's route): the radar draws the way's route, a 5 px cyan line on a dark edge over the roads and under the
rings, the units and the car, drawn out from the car over 0.5 s when the goal changes or the car leaves the route, still
otherwise; the goal's badge (an ink disc in a cyan ring) ends it, on the rim with a chevron when past. The full map draws
the whole route. The arrow is gone (`render/run/Arrow.ts`, `Jobs.arrowTarget`/`idleTarget`); the cards say FOLLOW THE
LINE (JEDŹ ZA LINIĄ). The cold open's ring is the goal in its own chase, so its route is there from the first second.
Pins M8.7 1.1 (the route's inner points on lanes), 1.2 (the draw-in), 1.4 (the cold open); corners count six; jobs 1.3,
1.8, the chain's 2.3 and the screens suite read the way. Verify green; the radar is looked at at the gate.

## 2026-09-24 — M8.7 slice 0: the goal holds, the way

Done (D1, D2, ARCHITECTURE 99): `run/way.ts` keeps the goal the line names and its route. A forward pass from the car's
lane every 0.5 s gives the rings' and doors' road distances; the pick holds unless another is under 0.6 of its distance and
150 m nearer. A reverse pass from the goal's lanes gives every lane its way on, laid on a goal or job-phase change and after
a moving goal's 10 m; the line's metres are the route's. Pins M8.7 0.1–0.6: forty route-following drives changed the goal
once, never back (the straight line: 25 times); at 15 of 53 places the road's nearest ring is not the line's; the field
equals a plain Dijkstra for 28 rings over 210 lanes; a delivery's route is at most 60 m longer than its limit's lane path.
Jobs 1.8 and the chain's 2.3 read the way. The arrow aims at the held goal until slice 1. Verify green.

## 2026-09-24 — the way: M8.7 planned from Marcin's notes on guidance

Marcin: the arrow is unintuitive, the radar's dots say nothing, the road says nothing, at a job there is "only some
stick", and in a chase nobody knows whether to flee or take a job. Found (DESIGN §20.1, the code and the M8.5 screens):
the arrow aims straight through the blocks, at 40 % in orange on the peach sky, where the card and the key hints cover it;
the goal is the straight-line nearest ring every frame, so it flips; nothing shows the way between jobs; a ring is a flat
circle and a 3 m pole told apart by eight colours; any ring starts at any speed, in a chase too; all seven kinds are open
from minute one. Decided by Marcin in the talk: one answer per question (he cut seven signals to four) and no arrow. Set
here (§20, `docs/M8.7_PLAN.md`, six slices): a goal that holds; the route on the radar, laid from the goal over the
lanes; road-sign pictograms shared by the world, the radar, the map and the line; colour by state (cyan the goal, white
open, grey closed); a job taken by rolling in under 20 km/h; nothing opened in a chase; the kinds one at a time with the
chain; the pick on the full map; the detour round a roadblock. CLAUDE.md's budget is six things. M8.6's gate closes
inside M8.7's (jobs 1.7 is the route's promise). Next: M8.7 on his word. Docs only; verify not run (no code touched).

---

Older entries: M8, M8.5 and M8.6 up to its gate's first pass, with the sessions between them (2026-09-24), in `docs/history/PROGRESS_M8-M8.6.md`; M7 (its design talk, slices and gate, 2026-09-24) in `docs/history/PROGRESS_M7.md`; M6 (its design talk, slices and gate, 2026-09-23 to 2026-09-24) in `docs/history/PROGRESS_M6.md`; M5.5 (its
slices, its gate and the overpass note, 2026-09-23) in `docs/history/PROGRESS_M5.5.md`;
M5, M5.1 and Marcin's M5 playtest (2026-09-23) in `docs/history/PROGRESS_M5.md`; the M4 gate and the sessions after it
(2026-09-23) in `docs/history/PROGRESS_M4-gate.md`; M4 (slices 0–8 and the design talks,
2026-09-22 to 2026-09-23) in `docs/history/PROGRESS_M4.md`; M0 through the M3 gate
(2026-09-20 to 2026-09-22) in `docs/history/PROGRESS_M0-M3.md`.
