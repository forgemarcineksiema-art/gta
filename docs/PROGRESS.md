# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-23 — Marcin's playtest of 0.5.5: the overpass ramps drawn as stairs

Marcin: "what is wrong with this road?" The city geometry builder read every static's rotation as a yaw, so the
overpass ramps' pitched 10 m pieces were drawn level at their middle heights: steps up to a metre tall with dark
fronts, the walls and lines stepped too, cars sinking into the fronts while the physics (the colliders' whole
rotation) drove the smooth profile. Since slice 8; its pins checked the driving, not the drawing. Fix: a pitched
static takes its quaternion's matrix (`CityView`); only the overpasses draw pitched statics (the jumps' are
collision-only). Pin `tests/render/overpass.test.ts`: rays down both ramps of two overpasses meet the profile
within 0.1 m (0.51 before).

## 2026-09-23 — M5.5 gate: the numbers, the perf fix, the balance

**Perf.** The first two gate runs against `perf/m5.1-fix-1..3.json` were a regression by §5.3 (frame p95 33.4 in
both, above the bases' 16.8 / 33.3 / 16.8; fps 51.2 / 52.6; step p95 11.2 / 9.7): the traffic phase had doubled
(1.6 → 3.0 ms mean). A per-method profile named two pair scans over the pool (48 → 58 records with the parked cars):
`aheadGap` ran the police and parking predicates for every pair before the geometry; `unstick` took a square root and
a spacing for every pair, four passes a step. Both reject by position first now, the logic unchanged (the same pose
after a minute at two seeds); traffic in Node 290–360 → 176–196 µs a step. Re-run (`perf/m5.5-gate-fix-1..2.json`):
53.7 / 53.9 fps, frame p95 33.3 / 33.3, step p95 8.7 / 9.2, traffic 2.4 ms, draws 133, heap 48 MB. Time to control
4.3 / 3.8 s; startup 3.80 MB. Verify: 338 quick tests in 98 s, smoke 60 fps; `verify:gate` 363 green (208 s).

**Balance** (`npm run balance`, 160 s). The measurement changed, the assertions did not (ARCHITECTURE 65): the capture
averages seeds 42 / 7 / 123, and after a card the heat returns once the car is 50 m from where it fell (a bot wedged
at the lights was carded there every 13 s, eight times on one level).

```
time to level from heat 0, novice: level 2 174 s, level 3 219 s; skilled: level 2 47 s, level 3 121 s
busted a minute (seeds 42 / 7 / 123):
  level 1: novice 0.33 (0.33 / 0.33 / 0.33), skilled 0.44 (1.00 / 0.00 / 0.33)
  level 2: novice 0.78 (0.33 / 0.67 / 1.33), skilled 0.44 (0.00 / 0.67 / 0.67)
  level 3: novice 0.44 (0.33 / 0.67 / 0.33), skilled 0.44 (0.67 / 0.00 / 0.67)
  level 4: novice 0.22 (0.00 / 0.33 / 0.33), skilled 0.11 (0.00 / 0.00 / 0.33)
  level 5: novice 0.44 (0.67 / 0.33 / 0.33), skilled 0.11 (0.00 / 0.00 / 0.33)
bag 1,571 a minute (1,633 / 2,513 / 567), coins 241 a minute; the placed jobs' mean payout 7,018
expected bank a run: novice L1 6.1k  L2 6.1k  L3 6.2k  L4 6.8k  L5 6.4k  (best L4, 2,863 a minute)
                     skilled L1 5.1k  L2 6.7k  L3 6.9k  L4 8.7k  L5 10.8k (best L5)
the novice's first hour at L4 (runs of 2.4 min banking 6.8k; the cold open 7.8k in 1.5 min):
  3.9 compact · 8.7 tier 1 power · 13.4 heavy · 18.2 tier 1 grip · 25.3 tier 2 power · 27.7 tier 1 boost
  · 34.9 tier 2 grip · 42.0 tier 3 power · 46.8 tier 2 boost · 53.9 tier 3 grip
```

(a) holds; **(b) and (c) are red**: the first car at 3.9 (5–7), one gap 2.4 (≥ 3). The income a minute is on DESIGN
§3.3's target; the runs are short because the road bot queues at the downtown lights with units behind it and is
busted even at level 1. Not fitted: prices stay; the careful bot's overtake while chased (tried) made it a rammer, bag
4,079 a minute. Marcin's first hour decides `prices.compact` and tier 1 (BACKLOG). Level 4 carding the bot less than
2 and 3 at every seed (thinner streets, fewer queues) is in BACKLOG too.

## 2026-09-23 — M5.5 gate: the long pins

The long pins had not run since slice 0; ten were red. Fixed in the game (each a real defect the pins found):
billboards past the overpass ramps (four verge panels' run-outs met the ramps' walls; more slots, ids unchanged);
the arrest (a unit passing the stopped player to the front slot at 9.1 m/s: within 10 m it now moves at 7 m/s at
most); the pull-over (1.5 m left a car in the suspect's lane at 4 m/s for as long as the chase lasted: 3 m); the
standoff (nose to nose with a player who is not moving on, a civilian pulls over after 1 s); the cold open (heat
capped at level 2, no rams, its route's bays kept empty: the M5.5 heat rules took the first minute to level 4-5);
lanes by height (a ring beside an overpass routed its coins and the bot onto the deck above: `nearestLane` takes the
road's height for the route coins, the oncoming check, a race's start and the bot). The delivery pin drives a
careful test bot (it brakes over its stopping distance, waits in a queue instead of resetting, overtakes: slice 3's
drivers keep their own pace); the other bot pins keep the M5 bot. Re-pinned, with the reason: police.long's roster at level 5 is the budget less the
helicopter's place up to the budget (a patrol that joins in), its civilian floor from the density by level (§13.8)
and the police's holdings; traffic.pool.long's heading limit (60°) skips a unit on a chase plan (slice 4's mode);
city.long measures height above the road under the car (slice 8); brain.nudge.long's car drives at the limit.

## 2026-09-23 — M5.5 slice 18: police extras

Done: the ticket book. While the busted bar fills an officer (a new pedestrian look: blue shirt, navy cap, badge, the
book in hand) walks from the nearest cruiser to the driver's door, paced to arrive as it fills, writes through the
card, and walks back once it closes; the bar is drawn as a citation pad whose three lines fill. Pursuit breakers:
eight scaffold towers on mid-block pavements, two a district, on the big map; driven through at speed one topples
across its lane behind the car, crushes what stands there (a cruiser is the player's takedown), stands 25 s as a
barrier (each cruiser written off on it pays) and is back next run. The donut shop: a pink kiosk under a giant donut
in the Works; two cruisers in its bays whenever the player is near (borrowable), units that stand down head its way.
The news: after each level's line the ticker names the suspect and the district, and an escape. Pins 18.1–18.4.

## 2026-09-23 — M5.5 slice 17: life extras

Done: traffic lights at the nine downtown crossings (no highway or authored road at them): 14 s green, 3 s amber,
1 s all red per pair of arms, each crossing offset 6 s per block; a car stops at the line on red however long (no
honk, no forcing through after the 9 s wait), on amber only when it can still stop; a chasing unit or a racer runs
it. Poles, heads and lamps are the renderer's (no collider, like the street lamps; the chunks' statics, which the job
placement reads, unchanged). Parked cars: 40 % of the kerbside bays hold one (the same bays and cars every time),
placed 80–220 m out, at most 10, apart from the moving traffic's count; swap candidates. The takedown's side cut: a
low view across the wreck from whichever side has a clear line to it, held for the slow motion. The second
pedestrian silhouette and walk shipped with slice 20. Pins 17.1–17.3.

## 2026-09-23 — M5.5 slice 16: hidden cars and the toys

Done: the ice-cream truck (a new body at the end of the list, never drawn by the spawner: a shortened box truck, mint
cab, white box, a serving hatch under a pink awning, a wafer cone with a scoop and a cherry on the roof) stands on
the south edge park's lawn in Palm Gardens whenever the player is within 260 m, a music-box tune of our own audible
from 160 m. A swap into it finds it for good (HIDDEN CAR FOUND): the wall shows its card, it drives out as the van
stretched to its body in its own paint, no upgrades; the save carries the find and the choice. The giant ball: a
4.4 m beach ball (180 kg) on the open yard south of the Works street; a car sends it rolling. The crumple: each damage
stage dents the shell where the hit landed, the wreck caves it in there and squashes the roof; a fresh car restores
it. Pins 16.1–16.4.

## 2026-09-23 — M5.5 slice 15: the full-screen map

Done: holding Tab (its focus hop prevented; the hint strip names it) lays a map over the drive: north up and west
left like the radar's compass, the whole island with roads, district tints and names, the landmarks, the three
garages, the jobs on offer (or the running job's target and a zone's edge), the day's caches, the ten speed cameras,
the cover (the four covered streets and the overpasses' decks), the police units (lit in a chase), the helicopter,
the search disc and a race's rivals, and the car's arrow; a key on the right draws each glyph. Repaints at 15 Hz
while held, nothing hidden; never over the wall, the card or the slow motion's skip. The radar's paths and glyphs
are shared (`buildMapPaths`, `drawGlyph`). Pins: Tab in the keyboard suite, the projection in the minimap suite.

## 2026-09-23 — M5.5 slice 14: the hunts and the skill chain

Done: the skill chain (DESIGN §7). Near misses (100), oncoming near misses (200), each second in the oncoming lane
(50), drifts (100 a second) and flights (150 a second past 0.3 s, a drift or a flight capped at 300) are tricks;
every three tricks add one to the multiplier, up to ×5. The chain lives 4 s after its last trick (held while a drift,
a flight or the oncoming lane lasts), then banks points × multiplier into the bag; a wall hit at 5 m/s or more, a
wreck or busted loses it; pulling into a door banks it first. The HUD shows it bottom centre over a draining bar.
The hunts: the first paid jump off each ramp counts (saved within v2); the 20th ramp pays 20,000 and the 50th
billboard 30,000 into the bank; JUMPS n/20 under BILLBOARDS (whose counter now refreshes on a smash). Pins 14.1–14.5.

## 2026-09-23 — M5.5 slice 13: fares with hot passengers

Done: fares are the taxi's job. Driving a taxi with no job, every 6 s a walker 40–140 m ahead on the pavement stops
and hails (right arm up, a yellow beacon over them); stopping within 7 m takes them in (gone from the pavement) and
starts a fare to a lane's middle 300–900 m on by path: the arrow, the clock (the path at 9 m/s plus 8 s plus the
last fare's leftover), 1.6 a metre, +20 % for each fare in a row. Near misses tip 50, jumps 150. One in four is hot:
a crook with a suitcase, double pay, the heat rising 0.8 a second while they ride. The delivered fare pays the ride
and the tips and the next passenger waves just up the road; out of the taxi, a failed or dropped fare ends the
chain. A fare's def lives only for its ride. Pins 13.1–13.3. Choice: fares only in a taxi (the taxi body now has a
job).

## 2026-09-23 — M5.5 slice 12: takedown rage and mayhem

Done: one timed-zone rule set for the brief's takedown rage and mayhem: a 160 m ring round the marker (drawn on the
ground and on the radar in the job's colour), 60 s on the clock, counted only inside it (the line says BACK INTO THE
ZONE outside). Rage: six takedowns (a car or a unit wrecked); mayhem: 5,000 of property damage priced per event (a
traffic hit 40 a m/s of impact up to 600, a wall 10 up to 150, a wreck 600, a unit 1,000, a billboard 400, a camera
500, a roadblock 800). The quota pays 10,000 / 8,000 with the delivery's time bonus (up to 15,000 / 12,000); the
start adds heat 10 / 15; the clock fails it. Two of each at free corners well apart (placed after the others; jobs
re-baked, 28 defs); the marker rings' coin pool grew to 32 markers. Pins 12.1–12.3.

## 2026-09-23 — M5.5 slice 11: street races

Done: four street races (lime markers), placed like the trials after them (the other jobs unchanged), to a finish
1.2–2 km on by path, any route, no coins. Starting one puts three rivals (two sports cars, a muscle car in race
paints) on a standing grid 16–48 m ahead; they race in the police's driving mode (junction boxes run, ×1.5
acceleration, round slower cars, a 0.5 s gap), taking at each junction the exit with the shortest way on to the
finish, at 1.85× the lane's limit, rubber-banded 0.72–1.25 by how far they are ahead of or behind the player. The
player's place over the line pays 6,000 / 2,500 / 1,000 into the bag; fourth pays nothing and fails, as does the
clock (the path at 10 m/s). The HUD shows the place live; the rivals are lime on the radar; home, they drive on as
traffic. Jobs re-baked (24 defs). Pins 11.1–11.3. The police come by heat as ever. At the gate: the bot beats a
rival at seed 42 once in three.

## 2026-09-23 — M5.5 slice 10: the time trial on a coin line

Done: four time trials (gold markers), placed after the sixteen jobs (those unchanged) from a free corner in each
district in turn (Crown Heights has none left clear, so the Works has two) to a lane point 1.1–1.9 km on by path.
Starting one lays the coin line to the finish, no heat; the finish reaches 12 m across the road; the time wins gold,
silver or bronze (the path at 24, 20 and 16.5 m/s) paying 8,000 / 5,000 / 3,000 into the bag, the clean line's tip
on top; slower than bronze fails. The HUD runs the time with the best medal still in reach; the card lists the three
times and your best; the best medal per trial is kept, saved (a field added within save v2) and on the wall's
DAILIES page. Jobs re-baked (20 defs). Pins 10.1–10.3.

## 2026-09-23 — M5.5 slice 9: the helicopter

Done: from heat level 4, while a pursuit is on, a police helicopter flies in from the island's edge (the radio: AIR
UNIT ON SCENE) and hangs over the car at 40 m with its searchlight: the light is its sight, so in the open it holds
the chase with no car near (it flies at 50 m/s and leads the car), and only a covered street's roof, an overpass's
deck or a building hides the car. Lost, it spirals the light out from the last fix; hidden under a roof the level's
cooldown runs out into an escape. It keeps its place in the budget from level 4 (the table now 2/2/4/5/7/9, the
ground rosters unchanged). Drawn with a spinning rotor, a blinking bar, an additive cone and spot; on the radar; the
rotor thumps by distance and muffles the whole mix overhead. Pins 9.1–9.3; roster and PIT pins re-pinned (the PIT
drive in four flat passes before the ramp). Not measured here: the busted rates at 4 and 5 (the gate).

## 2026-09-23 — M5.5 slice 8: overpasses

Done: the highway climbs over its four crossings with the central streets (x = 0 and z = 0 at the ring): a 7.5 m
deck over a 48 m span on a girder, 110 m smoothstep ramps (grade under 11 %, the car stays on its wheels at 25 m/s)
between retaining walls, parapets, abutments and lane lines, all pitched boxes along the graph's new height profile
(RoadPoint.y). The ring meets those four streets no more; they run on under the deck to their stubs. Traffic drives
at the road's height, nose up the ramps (lent bodies held at it); resets, police sight, route coins and the highway
spawn take the height; no roadblock, camera, verge coin hook, lamp or tree on a ramp (two cameras moved a segment
out). Jobs re-baked (one delivery's drop-off moved). Pins 8.1–8.4; city and minimap counts re-pinned (80 lanes on
the highway). The long pins (the city tour, the bot laps) are re-pinned at the gate.

## 2026-09-23 — M5.5 slice 7: covered streets and the camera occlusion rule

Done: one covered street per district over the middle of a grid street near its door (the Gardens': near the
Glasshouse), 64 m long, over the carriageway and both pavements, clear of doors, ramps, cameras and plazas: an
arcade under a two-storey frontage bridge in Crown Heights, a steel gantry with a crane bridge in the Works, a
plane-tree canopy with hedges in the Gardens, a brick warehouse with a gable roof on the Quay. Solid roof and walls,
open ends: the police see in only along the street. No street tree or lamp under them. The camera's occlusion rule:
a solid static between the car and the camera pulls it in along the boom at once, then lets it out at the ground
height's pace (one ray a frame through the sim's new clearFraction query). Pins 7.1–7.4.

## 2026-09-23 — M5.5 slice 20: pedestrians with bodies

Done: four silhouettes of boxes, 150–200 triangles each (was one 72-triangle figure): a man in a long coat and
scarf, a woman in a jacket and skirt with a bag on her arm, a worker in a hi-vis vest, boots and a yellow hard hat,
a stooped old man in a flat cap with a stick. Each vertex names its limb and joint; one instanced material swings
legs and arms by a per-instance phase from the metres walked (the bob follows the same gait), throws the arms
forward in the dive, pushes up getting up, and shakes the fist (the old man shakes his stick). Dressed by district
at spawn: coats in Crown Heights, workers in the Works, old men in the Gardens, bags on the Quay, each district's
own six clothes colours (palette.ts). Four draws instead of one. Pins 20.1–20.3.

## 2026-09-23 — M5.5 slice 19: traffic's own bodies (taken before 7–18: Marcin asked for the city's models outright)

Done: eight civilian bodies (sedan, hatchback, estate, SUV, pickup, taxi, box truck, 12 m bus) on the player's
profile format, drawn instanced with a paint mask (glass, lights and a truck's box keep their colour), 386–460
triangles a body (was 244–268); each record has its body's footprint, collider and mass; queues are spaced by the
bodies; buses on the streets, three times as many on the Crown avenues, never on the highway, straight on at
junctions, never changing lane; taxis round the tower, hop lanes; trucks and pickups in the Works; the player's
shells never spawn ambient; trucks and buses honk low. A swap takes the body: the bus and truck are the heavy
stretched (every force × mass), the rest their class on its axles, the paint kept, the radio names it (SUSPECT IN A
YELLOW TAXI), the camera backs off for the bus. Fix: a unit set on an exit before its route came takes the route's.
Not done: the garage keeps classes (a pickup driven home offers the van). Pins 19.1–19.6.

## 2026-09-23 — M5.5 slice 6: bring it home, pay to keep it

Done: a car driven through a door whose class the garage does not own is HOT on the CARS page (`HOT · KEEP IT n`,
cyan): kept for 30 % of its price (the police car 60 %, still locked behind its escape), owned from then on in the
paint it came in and selected for the drive-out; the purchase ticks the chain's car step. Declining costs nothing.
Not done: the SELL / KEEP choice at a fence (an order's car driven to a door instead can be kept). Pin garage 6.1;
verify 288 green.

## 2026-09-23 — M5.5 slice 5: the garage dressed, the wall sized

Done: the garage's things along its walls (a pegboard with tools over a workbench and its lamp, four tyres by the
door, an oil drum, a hose on its hook, a shelf of boxes, the wanted poster on the back wall), one merged mesh a
garage, no shadows, the car's floor clear (pin 5.1); the wall scales ×1.2 from 1536×864 and ×1.4 at 1080p (660 →
790 → 920 px, the type with it), unchanged at the small sizes. Smoke 108 draws (+3), 60 fps. Verify 287 green.
The screens at the ten sizes at the gate.

## 2026-09-23 — M5.5 slice 4: the police as a different animal

Done: pressure instead of a flat speed (within 60 m the player's speed + 4, within 25 m the class's for the ram or
the PIT, the catch-up only out of the player's view); the police driving mode (a unit on a chase runs the junction
box, brakes and pulls away ×1.5, goes round a slower car on the oncoming side or the highway's other lane, swings
out round a car pulling over); the refill cadence by level (8/10/8/7/6/5 s, the Chief ×2); every third arrival
from level 2 pulls out of a side street 60–100 m ahead, in view; the radar draws the units (lit in a chase, grey on
the beat) and the search disc growing 60→150 m; the stars pulse slower and a ring drains as the cooldown runs; the
radio in the ticker (ROADBLOCK AHEAD, UNIT DOWN, SUSPECT IN A <paint> <car> at a chase's start and after a seen
swap; one line per 6 s); the siren yelps from level 2, the low voice from 3; 100 × level into the bag every 10 s
of chase. Not done: tighter junction curves for units (cosmetic). Pins pressure 4.1–4.7; the Chief's cadence pin
reads the table. Verify 286 green.

## 2026-09-23 — M5.5 slice 3: traffic with character

Done: a driver per record (pace 0.85/1.0/1.1/1.18 of the limit × the class, a 0.9–1.6 s time gap, one in eight bad:
0.6 s, a weave, junctions jumped after 3 s); following at the time gap behind what is ahead at its speed; a car's
`shift` across its lane carried through the junction curves; the highway overtake and return; the flinch (brake,
kerb, honk) at the player head-on; the pull-over for a lit unit and the unit going round; the pass round a dead car
on the oncoming side (the M3 abandoned-car queue); the angry driver (one bumped in ten turns after the player,
honking); the clone cap; traffic thinning to 60 % at heat 4–5. Pins drivers 3.1–3.5; verify 278 green; the
limit/lane pin in traffic.long updated for the shift and the paces. The taxi and the bus ride on slice 19's bodies.

## 2026-09-23 — M5.5 slice 2: the goal line and the chain

Done: `sim/run/goal.ts` (one goal, one point: the job; LOSE THEM, the door with a bag; the chain's step when it says
more: BANK IT, BUY THE COMPACT · n TO GO / at a door, ESCAPE THE COPS, STEAL TO ORDER, FILL THE BAG n/20,000; the door
above 8,000; TAKE A JOB), the arrow follows it; the chain as six bits ticked in any order from the ring, never from
the intro (`ColdOpen.endTick`), a card per step (STEP n OF 6 · DONE · NEXT), the wall's next-step line and the
sentence until the level-2 escape; the first order's card stays until the car is ringed (SWAP INTO IT + the key);
BORROW's second line the first three times; a delivery ring within 250 m of every door (re-baked). Pins chain 2.1,
2.3, 2.4, 2.5; verify 273 green. At the gate: e2e 2.5/2.6 and the `goal`/`chain` screens.

## 2026-09-23 — M5.5 slice 1: coins as breadcrumbs

Done: the static island is the gate lines (4 + the cap) and the arcs (3 in
the air + the cap) only, 330 coins at every seed; the rings, the day's
thirty caches (`caches.ts`, the date seed over ~60 side-street spots 150 m
apart) and a job's route (`routeLine`: runs into and out of every turn,
every 80 m of straight, the cap on the target taken by arriving; every coin
taken pays a 10 % tip, the job line counts `12/48`) are run-time pools with
their own id ranges; the intro's line runs at the same rhythm with the cap
on its marker; CACHES n/30 on the HUD, gold dots on the radar, a bonus into
the bank at every tenth; values 20 / 100 / 250; the save is v2 (the day's
finds, and slice 2's `chain` and `borrowHints` reserved).

Measured: the novice bot between jobs picks 4 coins a minute (was 32–40);
the road bot takes ≥ 70 % of every delivery's route (jobs.long 1.7);
`npm run balance` green again with the tiers at 12,000 / 16,000 / 22,000
(the beat's police income put the compact and tier 1 on one door): the
compact at minute 5.0, then every 3.5–7.1 min. Pins changed with the
design: coins 3.8 (the layout), 3.9 (a laid run), the intro's 4.3 (runs, not
a carpet), the save's v1 shape. verify:gate 294 green, heat 10/10, game 9/9.

Marcin, on the way: two slices in an hour and a half is too slow, and the
plan must hold everything discussed before the platform: no M6 until the
whole game is in. §4 of `docs/M5.5_PLAN.md` now lists the rest; from here
a slice is code and pins, the measurements and the suites run at the gate.

## 2026-09-23 — M5.5 slice 0: heat that moves

Marcin: "Lecisz". Working autonomously per `docs/M5.5_PLAN.md`, slice 0
(DESIGN.md §13.3). Verify green before the first edit (264 quick tests
after the doc commits).

### Done

- **The beat.** `POLICE.budget[0]` is 2: two saloons drive their lanes at
  heat 0 with the lights off, recycled near the player (`Police.recycle`),
  watching (`Police.watch` runs the sight rays at every level). The roster
  beyond the beat goes off duty after a door or busted (`standDown` keeps
  the first `budget` live units). The beat is part of the traffic: a world
  with `traffic: 0` (the tours, the sandboxes) has none.
- **Heat judged by what the police see.** `Heat.add(points, seen)`: a crime
  in a unit's or a parked patrol's sight (`Police.crimeSeen()`, wired in
  `SimWorld`) pays `seenFactor` 2 and never leaves the player below level 1
  (`Heat.wanted`); unseen, the ratchet rises quietly. Reckless driving
  counts: a civilian rammed above the disturb threshold (`heat.hit` 2, once
  per car per 3 s), the chase's drip (`chasePerSecond` 0.1 while the
  pursuit is active, `Heat.tick`), speeding within a patrol's sight by 30
  km/h over the road's limit (`Police.speeding`: wanted at once and
  `speedingSeen` 3 flat, once per 20 s; the limit under the player from the
  nearest lane every `routeSeconds`). A rammed police car is the witness
  (`policeHit` 6 seen). The numbers: delivery 10, order 8, billboard 3,
  camera 6, traffic takedown 5, police takedown 12, roadblock 8.
- **Fault follows speed.** A contact is the player's crime only when the
  other car was not the faster one (`faultMargin` 1 m/s): found by jobs
  4.8, where a beat patrol braking late behind a stopped player, and then
  the player reversing into it, made the player wanted and boxed. The
  police read a contact two steps after it (the manifolds of physics N are
  sensed in Traffic.step N+1, read in Police.preStep N+2), so both speeds
  come from a decaying maximum (×0.8 a step). Heat's hit rule reads the
  speeds of the same step (Life pushes the hit right after physics).
- **Legible.** `HeatHud`: a red `+n` under the stars for 0.6 s on every
  discrete gain (`Heat.lastGain` / `gainSerial`), the star that fills
  scales 1.35× once. A level-up is an event (`heatLevel`): the HUD's
  ticker shows `LEVEL n · <news>` for 2 s at the top centre (the job line
  yields, the hints hide), `Sfx` plays a two-tone wail. The intro's initial
  heat is `set`, not added: no ticker at boot.
- The balance probe holds its level (`Heat.set`) against the drip and the
  seen crimes; a `time to level` row joins the tables. The shipping seed's
  jobs re-baked (heat 10 / 8).
- Tests: `heat.test.ts` 0.1–0.4 (seen ×2 and the floor, the hit cooldown
  and the exclusions, the drip, the numbers and the event);
  `heat.long.test.ts` 0.5 (the novice bot from heat 0 at three seeds: level
  2 inside 300 s, level 3 inside 540 s, never level 3 inside a minute);
  `police.long` "heat 0 keeps the beat driving its lanes with no chase";
  `brain` 3c.3 now pins the witness rule and the chase after it.
- Pins touched, each with its reason in the file: `jobs.test` (the job
  pins run with the beat off: a scripted brake past standstill reverses
  into a patrol), `cameras` 6.11, `traffic.pool.long` (the tow pin) and
  `jobs.long` 1.7 likewise; `traffic.long` "under the limit" and
  `traffic.pool.long` "returns the body far away" skip police records (a
  chasing unit runs its plan's speed and keeps its body further out by
  M4's rule); `roadblocks` 6.3 floors the drip; `police.long` "the level-1
  pair" holds level 1 (the bot's speeding and the drip escalate it).

### Measured

- Time to level from heat 0 (the novice bot, traffic on, seeds 42 / 7 /
  123): level 2 at 41 / 42 / 83 s, level 3 at 200 / 74 / 152 s (speedings
  8 / 3 / 4). Before the flat speeding and the 20 s cooldown: level 3 at
  34–71 s, a runaway. The skilled bot (seed 42): level 2 at 159 s, level 3
  at 319 s. The bot speeds everywhere and rams; a human's curve is slower.
- `npm run balance`: busted a minute (novice / skilled) level 1 0.00 /
  0.00, 2 0.67 / 0.00, 3 1.00 / 0.00, 4 2.33 / 1.00, 5 2.00 / 0.33. The
  novice's bag from heat 0 is now **1,453 a minute** (M4: 406): with the
  beat the speeding bot is chased at once and wrecks cruisers (police
  takedown 1,500 into the bag). Best cash-out novice L2 / skilled L3 (the
  ordering assertion holds); the first hour buys the compact **and** tier 1
  power at minute 5.0, so the script's assertion (c) (no gap under three
  minutes) is **red**: the economy was tuned without police income at heat
  0. Not loosened; slice 1 re-times the hour with the new coin income and
  retunes the prices, as the plan says.
- Verify: quick 264 tests; `verify:gate` 288 green after the pin work
  (135 s of tests); `heat` 10 / 10, `game` 9 / 9, `life` 4 / 4; smoke 60
  fps, 104 draws, 3.67 MB.
- Perf (MX330, 4× CPU, 60 s bot, `perf/m5.5-slice0-1..2.json`): 55.3 /
  55.6 fps, frame p95 33.3 / 33.3 ms, step p95 7.8 / 7.6 ms, frame max 100
  / 133 ms, against the M5.1 bases 56.9 / 55.7 / 56.6 fps, p95 16.8 / 33.3
  / 16.8, step 6.4 / 7.1 / 7.1, max 100 / 133 / 83. The step p95 is up
  0.5–0.7 ms: the perf route now carries the beat and, when the bot speeds
  past a patrol, a chase; the fps sits at the bottom of the bases' spread
  (the ±3 fps noise band). Watched at the slice 3 / 4 A/B, where the
  protocol asks for alternating runs.
- In the build (this session's browser pane): the ticker `LEVEL 1 ·
  PATROLS ON YOUR TAIL`, the `+20` and `+12` pops under the stars, the
  star fill, two beat units at heat 0, the chase after a seen crime.

### Decided (set here)

- Speeding past a patrol is not doubled: the sighting is the crime, so it
  makes the player wanted and pays 3 flat, once per 20 s. At 6 every 5 s
  the road bot reached level 3 in 34 s.
- The faster car is at fault (the rule above); a decaying maximum stands
  in for the speeds at the contact because the police read it late.
- The beat exists only with civilians (`trafficDensity > 0`): the tours
  and the sandbox pins keep their road, and the beat is what the city's
  traffic includes.
- The plan's `Pursuit.detect()` is not needed: the level-1 floor plus the
  unit's own sight start the chase on the next step.

### Next

- Slice 1: coins as breadcrumbs (DESIGN §13.5), then the balance re-run
  and the price retune.

### Open problems

- The balance script's assertion (c) is red until slice 1 retunes (above).
- The delivery limits were measured clean; with the beat a speeding
  novice takes a delivery under two cruisers, and the limit factor 1.3 may
  be tight. Marcin's playtest decides; the knob is
  `BALANCE.jobs.delivery.limitFactor`.
- The perf step p95 +0.5–0.7 ms with the beat (above).

---

Older entries: M5, M5.1 and Marcin's M5 playtest (2026-09-23) in
`docs/history/PROGRESS_M5.md`; the M4 gate and the sessions after it
(2026-09-23) in `docs/history/PROGRESS_M4-gate.md`; M4 (slices 0–8 and the design talks,
2026-09-22 to 2026-09-23) in `docs/history/PROGRESS_M4.md`; M0 through the M3 gate
(2026-09-20 to 2026-09-22) in `docs/history/PROGRESS_M0-M3.md`.
