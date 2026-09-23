# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

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

## 2026-09-23 — Marcin's M5 playtest: polish before the platform

Marcin played the gate build and answered the watch list. Busted is fair;
the pursuit is mediocre because the police drive like traffic and traffic
drives evenly at one speed, blind to its surroundings. He never got above
heat 1 and did not know how. The door works. After the intro he had no idea
what to do or what the game is about. The disguise and steal-to-order were
invisible. The coins, for the second time: too many, everywhere, on every
lane, from the first second, uncollectable; they must be a treat and lie
along the job's route. The garage is empty, not dark; the wall is small at
1080p; the "slow turn" arrest worry is nothing; abandoned cars need
thought. And: "M6 Platforma dopiero gdy gra będzie dopracowana", no Basic
Launch with a game that is not good.

### Done

- `main` pushed (13 commits since the M4 gate were local).
- Research (four briefs, 2026-09-23): police pursuit design in GTA V / IV,
  NFS Most Wanted 2005, NFS Heat, Hot Pursuit, Driver SF, Watch Dogs,
  Mafia, Saints Row; civilian traffic in GTA V (driving-style flags,
  per-driver ability and aggressiveness, per-class handling, population by
  zone and hour, pull-over for sirens), Burnout, Forza, Driver SF, Watch
  Dogs 2; collectible placement in Subway Surfers, Sonic, Mario Kart,
  Nintendo's course dojo, Forza's boards, Burnout's smashes, a 2018 study
  and the GDC 2019 exploration talk; loop legibility in GTA, Forza,
  Burnout, Crazy Taxi, Hit & Run, the accessibility guideline and the
  CrazyGames quality page. Sources in `docs/M5.5_PLAN.md` §8.
- `docs/DESIGN.md` §13: his findings, the decision (M5.5 before M6), and
  the design for each: heat that moves (patrols at heat 0, seen crimes
  double and start the chase, reckless driving counts, the numbers, the
  `+n` pop and the ticker), the goal line and the six-step chain, coins as
  breadcrumbs (static only at goals, thirty caches a day, the route line
  during a job, the tip), the garage dressed and the wall sized, "bring it
  home, pay to keep it", traffic with character (pace and temper, overtakes,
  the flinch, the pull-over, the gawk, the taxi and the bus), the police as
  a different animal (the driving mode, pressure instead of a flat speed,
  the refill cadence, arrivals in view, the search disc and the escape
  ring, dispatch lines, sirens by heat). §11 and §12 revised.
- `docs/M5.5_PLAN.md`: the contract (slices 0–7, numbers, pins,
  measurements, the gate). `CLAUDE.md` and `docs/BACKLOG.md` point at it.
- Docs closed after M5.1 (aea0137): the stale known issues and the backlog's
  resolved lines.

### Decided

- By Marcin: M6 and Basic Launch wait for a game he would launch; the
  polish milestone runs on his playtests, as many passes as it takes.
- Set here (DESIGN §13, he overrides): everything above; the order of the
  slices (heat, coins, the goal line, traffic, police, the garage; the
  ownership slice on his word).

### Why he stayed at heat 1 (from the code)

`POLICE.budget[0]` is 0: no police car exists at heat 0, so nothing can
see a crime; heat comes only from takedowns, billboards, cameras,
roadblocks and jobs (2–10 points against a 20-point level), never from
rams, wrecks or speeding. The intro starts at 20 and level 2 is three
deliveries away.

### Next

- Marcin's signal, then M5.5 slice 0.

### Open problems

- Nothing new beyond DESIGN §13; the M5 known issues that remain open are
  the naive hunter (4 of 6), no bot escape from level 4, and the music bed.

## 2026-09-23 — M5.1

Marcin: "lecisz z M5.1", with no playtest notes yet. The plan names M5.1 as
the pass his notes drive; without them the scope is the gate's open items,
set here and worked in this order:

1. The single long frames (0.2–1 s at 4× CPU, open since M4): traced on
   this machine, which is Marcin's MX330 laptop; the cause fixed or bounded.
2. The quick `verify` back under a minute of tests: `traffic.test.ts`'s
   drives over ~10 s move to `traffic.long.test.ts` (CLAUDE.md's rule);
   nothing loosened, every pin kept.
3. The jobs' placement off the time to control.
4. The coin rings round the job markers (DESIGN.md §3.2: "rings round job
   markers join in M5"; not built at the gate).
5. A review of the M5 code against M5_PLAN §10's checklist, with the fixes.

His notes, when they come, go first.

### 1. The long frames: found and fixed

Traced on this machine (MX330, Chrome's ANGLE on Direct3D 11, 4× CPU, the
60 s perf route). Long-animation-frame entries showed the page's main
thread idle through the stall (blocking 0 ms, the frame callback 31 ms,
rendering started 1.55 s late); new WebGL programs appear only in the first
6 s, so it is not shader compilation; the chunk streaming does not line up
with it. A Chrome trace with the GPU categories caught three stalls of 336,
372 and 643 ms, each inside one `CommandBuffer::Flush` in the GPU process,
each after the frame's second `glBufferSubData`: a whole-buffer write into
a buffer the GPU was still reading, which the D3D11 path waits out. three.js
rewrites every per-frame instanced attribute (traffic, peds, markers,
particles; 13 small uploads a frame) with `bufferSubData`.

The fix (`render/Renderer.ts`, `orphanWholeBufferUpdates`): a whole-buffer
update re-specifies the storage with `bufferData` (the driver orphans the
old one); range updates keep `bufferSubData`. Measured by alternating runs
with the swap injected in the page: long frames over 250 ms in 5 of 9 runs
without (433–1,717 ms), 0 of 9 with (worst 217 ms), fps the same or better.
Then `npm run perf` three times on the build: 56.9 / 55.7 / 56.6 fps, frame
max 100 / 133 / 83 ms (the M5 gate's 200 / 1,017, M4's 917 / 517), step p95
6.4–7.1 ms (`perf/m5.1-fix-*.json`).

### 2-5. Closed at Marcin's call

- Coin rings round the job markers: seven coins on the junction-facing half
  of each ring and a cap, laid on the jobs' first step (jobs 1.10).
- Review fixes: the daily police share moved to `BALANCE.dailies.police`;
  coins mark the save dirty; the cold open's comment and record 33 match the
  save's `seen`.
- Eleven tests over ~10 s moved unchanged into `*.long.test.ts` (8 files,
  green with LONG=1). The quick suite still reads ~66 s on this 4-core
  laptop; Marcin: not worth more time.
- The jobs' placement off the time to control: seed 42's sixteen defs are
  baked (`sim/jobs/baked.ts`, `npm run bake:jobs`; jobs 1.1 fails when the
  generator drifts), other seeds still place at boot. Time to control at
  20 Mbit and 4x CPU 3.70 s -> 3.30 / 3.30 / 3.43 s, the sim phase 1.32 s ->
  0.88-0.95 s. M5.1 closed.

## 2026-09-23 — M5, the launch minimum

Marcin: carry out the whole M5 plan. Working autonomously per
`docs/M5_PLAN.md`, slice by slice.

### Before slice 0

- §1.2 checked against the code at 3ae1f72: every row exists (Run with the
  bag, bank, coins, `maxHeat`, the fine and the spill; `cover.ts` with the
  three drop-offs and the chokepoints; the coins; the door and the wall;
  the cold open on the jobs skeleton; the bot policies; the twenty jumps;
  the descriptor, the disguise and `blown`; the ad points; the events; the
  measurements). One gap: `cover.ts` has no Palm Gardens fence; slice 2
  adds it, as the plan allows.
- `npm run verify` green before the first edit: 231 tests in 62.5 s.

### Slice 0 — save and prices

- `sim/save/format.ts`: `SaveV1`, frozen `DEFAULT_SAVE`, `serialize` in a
  fixed key order, `parse` that never throws, the migrations table
  (v0 → v1), field-by-field sanitising (a broken field falls back alone),
  `collect` / `apply`, and the billboards as a bit set in base64 ('' when
  none). `app/save.ts`: `SaveStore` (load, the debounce as a throttle with
  the first write at once, `flush` that skips an unchanged text,
  `unknownRaw` for a newer version, `pagehide` and hidden flushes).
- `SimWorld` owns `garage` and `dailies` (state from now; the wall in slice
  4, the draw in slice 6); `SimWorldOptions.save` is applied last in the
  constructor; `?car=` still wins. `App.boot` loads before the world,
  `?fresh=1` clears the key; the store marks dirty from the ring and
  flushes at the door and the card; the debug line shows `save n kB`.
- `balance.ts` carries §3.4, `measured` filled from the M4 gate.
- Tests: `save.test.ts` 0.1–0.6, `tests/app/save.test.ts` 0.7–0.10.

Measured: everything filled serializes to 1.1 kB (guard 32 kB); a
15-minute novice bot session with traffic and peds saves 359 bytes (15 min
of sim took 16 s of wall in Node). A reload in the browser kept the bank,
the compact, its respray and the billboard count.

Decided (set here):
- `jobs.timeBonus` stays at the jobs level where M4 put it, not inside
  `delivery` as §3.4 writes it: M4's pin 4.7 reads it there, and it is the
  rule for any timed arrival.
- `BALANCE.measured.runSeconds` is 600 as a floor: no bot run ended in the
  M4 measurement's ten minutes. `bagPerMinute` 406 and `coinsPerMinute` 36
  are the midpoints of the measured ranges.
- Money in the save is kept to the cent, not rounded to whole units:
  `playSeconds` is fractional and one rule serves every amount.
- The garage's drive-out sets the descriptor directly (kind, paint, a clean
  disguise on the dispatcher's clock) instead of `Pursuit.onSwap`, which
  would count an escape if a chase were on.
- The player's paint for a class is the garage's (`Garage.paintOf`): the
  swap leaves the old car in it and the descriptor takes it.

### Slice 1 — jobs framework, the arrow, getaway delivery

- `sim/jobs/catalog.ts` (kinds, the def, the descriptor packed as class
  index << 24 | paint, the order paints per class, the card's words),
  `sim/jobs/place.ts` (the generator's sixteen: corner aprons of the grid
  junctions `ROAD_HALF + 6` m out on both arms, the approach from the kerb
  corner clear of anything a car would hit by the billboard placer's
  `tallFootprint`, off every carriageway, 20 m from the doors, 25 m from the
  ramps, 15 m from the camera poles; the four escapes one per side of the
  island where a street meets the highway; the twelve others by
  farthest-point sampling from a seeded start; a delivery to the nearest
  drop-off at least 400 m by lane path; limit and payout from that path at
  the lanes' limits). A candidate's chunk is generated only when it is
  about to be picked.
- `Jobs` extended in place (same names): `hunting`, `idleTarget`,
  `arrowTarget`, a marker re-arms only once the car has left it, and only
  the cold open's own marker is live while it runs (its def is id 0).
- `render/Arrow.ts`: a 12-triangle chevron 1.2 m long, 2.5 m above the
  roof, full `carOrange` on a job and 40 % between jobs. `render/MarkerView.ts`
  instanced: rings and beacons in the kind's colour, the running job's
  target ringed. `ui/jobs.ts`: the line at the top centre and the 1.5 s card;
  the key hints give way to it. The radar's job rings are local (no rim
  chevrons for sixteen of them); the running target clamps to the rim.
  Sfx: the two-note start, the done chord, the failed buzz.
- Tests: `jobs.test.ts` 1.1–1.6 and 1.8; `jobs.long.test.ts` 1.7.

Measured (seed 42, traffic on): the road bot from each delivery ring into
its drop-off, time of limit and pay of payout: #9 scrapyard 45.2 of 75 s,
5,993 of 5,000; #10 hotel 46.1 of 71, 5,876; #11 scrapyard 84.7 of 120,
5,735; #12 scrapyard 32.0 of 51, 5,933; #14 scrapyard 59.0 of 74, 5,506;
#15 hideout 44.5 of 82, 6,145. Placement: 16 defs in 71–130 ms in Node
for seeds 42 / 7 / 123 (chunk generation is most of it). Smoke: 104 draws
(+4: the arrow, rings, beacons), 244k triangles (+1k), 60 fps. Tests 248
in 66 s (the quick set was 59 s before M5: over the minute already).

Decided (set here):
- Escape markers stand where a street meets the highway, one per side of
  the island: the chokepoints are highway lane points, which a ring off the
  carriageway cannot sit on, and these corners are the on-ramps.
- Every delivery pays the 5,000 floor at seed 42: the nearest drop-off 400 m
  away is 0.5–1.2 km by path, and `payoutPerKm` 4,000 reaches 5,000 only at
  1.25 km. Left for the balance script (slice 7) to tune, not guessed here.
- The arrow lies in a plane tipped 45° toward the camera and turns inside it
  to the bearing: a horizontal chevron is edge-on to a chase camera below
  it. `Arrow` takes the camera as an optional second constructor argument.
- In the cold open the arrow shows only while its delivery runs; the job
  line and card stay hidden (the captions lead).
- An order arrives only in the ordered class and not as a wreck; a swap away
  from the stolen car leaves the job waiting for it.

Perf after slice 1 (MX330, 4× CPU, 60 s bot): 56.5 fps, frame p95 16.8 ms,
step p95 7.0 ms, draws max 104, triangles max 266k, heap 48 MB, frame max
167 ms (`perf/m5-slice1.json`). The M4 bases were 54.7 / 55.4.

### Slice 2 — steal-to-order

- `Traffic.ensure(kind, paint, player, near, cosHalf)`: the nearest unseen
  driving civilian of the class in the 300–600 m band is repainted, else a
  car is spawned on a lane in the band out of view through `claim`;
  `paintOf`; `wanted` keeps the car from the despawn and from `claim`.
- `Jobs`: hunting keeps the wanted car while it is the class, the paint and
  a driving civilian, and asks again every `ensureSeconds` otherwise;
  `orderFound` once; Life's swap tells `Jobs.onSwap` before the record
  changes hands (the clock and the heat start there); the fence pays
  `payout × (1 − 0.1 × stage)`, a wreck never arrives. The wanted car cruises
  at `order.cruise` (0.5) of its lanes' limits, renewed every step as the
  cold open holds its candidate, and goes back to traffic when the job ends.
- The Palm Gardens fence is `palmFence(city)` in `place.ts`: the first clear
  lot 2 m past the Garden Parkway's pavement from the middle of the arc
  (−369, 419 at seed 42). The orders' fences are it, the scrapyard and the
  hotel; each order goes to the nearest one at least 400 m by path.
- `MarkerView` rings the wanted car within 150 m and in front of the camera;
  the job line says FIND A LIME COMPACT · 20 m, then DELIVER THE COMPACT.
- Tests: `order.test.ts` 2.1–2.6; `order.long.test.ts` 2.7 (the hunt).

Measured (seed 42, traffic on), the naive hunter (the road bot re-planning
the shortest lane path to the wanted car every 2 s): before the cruise, 2 of
6 reached within 15 m in 240 s (130 and 153 s); with the cruise at 0.5,
4 of 6 in 20.1, 81.3, 21.8 and 78.0 s. The traffic spawned the car in 17 of
18 hunts over three runs and repainted one: civilians live within the 320 m
despawn radius, so the 300–600 m band rarely holds one. Perf after slice 2:
56.9 fps, frame p95 16.8 ms, step p95 6.8 ms, draws max 104, heap 51 MB,
frame max 83 ms (`perf/m5-slice2.json`).

Decided (set here):
- The wanted car cruises at half its lanes' limits (`order.cruise`): at the
  full limit a hunter at 30 m/s through junctions closes too slowly and the
  car turns away at random; a car idling along is also what the job's
  fantasy is (spot it, pull alongside, take it).
- `order.long.test.ts` floors the naive hunter at 4 of 6: it loses the car
  where its re-plan routes through a U-turn; the player has the radar, the
  arrow and the ring.
- The fence lives in `place.ts`, not `cover.ts`: finding a clear lot needs
  the chunk's statics, and `cover.ts` is a pure function of constants.

### Slice 3 — pursuit escape

- The four escape markers (levels 2, 2, 3, 4) raise the heat to the level's
  threshold (never lower) and `Pursuit.force(radioSeconds)` puts the police
  on the player at once; the `escape` event pays `bounty × level` through
  `jobDone` (on top of the run's own `escapePerLevel`); busted and the door
  end it silently. `Pursuit.radioLeft`: for the first 8 s
  (`jobs.escape.radioSeconds`) the police know where the player is.
- Tests: `escape.test.ts` 3.1–3.5; `escape.long.test.ts` 3.6.

Measured, the skilled bot from each marker, seeds 42 / 7 / 123, traffic on,
up to 3 min: 6 of 12 escapes. Level 2: 5 of 6 (31–54 s, two by a swap);
level 3: 1 of 3 (11 s by a swap; busted at 37 and 42 s); level 4: 0 of 3
(busted at 43–62 s). Without the radio window a level-3 marker paid its
bounty in 16 s with no chase: the units spawn out of view, the pursuit went
straight to `lost` and the cooldown won it.

Decided (set here):
- The radio window (8 s): "the police have you" has to be true for long
  enough that the units reach the player before the cooldown can start,
  or the escape job is a free bounty.
- The quick suite's time is `traffic.test.ts` (M3, 68 s under the parallel
  load; the next longest is 27 s): the suite runs as long as its slowest
  file. Moving its bot drives into a long file is M3 housekeeping, in
  BACKLOG, not done here.

### Slice 4 — the garage: catalogue, paint, upgrades, prep, the offers

- `sim/garage/Garage.ts` (from slice 0) is complete: buy, select, the free
  respray, three stats in three tiers as multipliers on the preset
  (`tuningFor`), the lawyer and the fence (cash, or granted by a video),
  the police car locked until one escape from level 5 (`Run` sets it on the
  `escape` event), `applyToVehicle` (retune in place, heal, the descriptor).
  `CarMesh.setPaint` recolours the three paint tones with the damage kept;
  the renderer applies the garage's paints when its serial moves.
- `Run`: the fence adds `prep.fenceBonus` to the door's multiplier, the lawyer
  keeps `lawyerKeep` of a busted bag, both are spent at any run's end;
  `doubleLastBag()` once a door; `lastSerial` refreshes the totals.
- `ui/garage.ts` (`GarageUi`): tabs TOTALS / CARS / PAINT / TUNE / PREP /
  DAILIES in M4's wall panel, two levels of keys (steer between pages or
  items, throttle confirms and drives out on the totals, brake backs out),
  every item a button with the key's handler. The door's offer (DOUBLE THE
  BAG with the video icon beside BANK IT, same size, BANK IT focused) is
  answered before the pages open. Video buttons are hidden with no rewarded
  ad. `WallNav` replaces the plan's `ActionState` argument: `ui` may not
  import `input`.
- `App`: the one caller of the garage and of the ads. The shut door shows
  the garage car at once (a purchase or a respray is seen on the car behind
  the door); at most one ad a door: the offer when the bag is above 8,000
  and a rewarded ad exists, else the midgame request, never at the session's
  first door; the rewarded path blocks input, mutes only on `adStarted`,
  rewards only a finished ad, and answers the offer either way. DRIVE OUT
  applies the car, opens the door, flushes the save. `happyTime()` on the
  first car bought.
- Tests: `garage.test.ts` 4.1–4.6; `e2e/game.spec.ts` 4.7–4.10 (`npm run
  game`); the screens add `job`, `garage` and `dailies` at the ten sizes.

Measured: the door to driving out in a new car by keys, 6 presses (D, W,
W, S, S, W; target under 8). The compact's 0–100 is 8.87 s at tier 0 (in
cars.test.ts's 8.5–13 band) and 7.23 s at tier 3 power. `npm run heat` 10/10
on this build. Screens 31/31, looked at: the wall fits at 800×450 (the
key-hint strip overlapped its tabs for the first 12 s, the M4 known issue:
the hints now hide off the road). Perf after slice 4: 56.8 fps, frame p95
16.8 ms, step p95 6.4 ms, draws max 104, heap 48 MB, frame max 500 ms
(`perf/m5-slice4.json`; the M4 long-frame issue).

Decided (set here):
- The garage spends the bank and the coins (`Run.funds`, the bank first):
  DESIGN.md §3.3's first car is "3k in coins plus 8k in the bag at ×1.25",
  so coins must buy; the pools stay apart (D14: coins never enter the bank).
  The wall says CASH.
- The garage car is applied when the door shuts, not only at drive-out:
  the respray is "applied at once to the mesh in the garage", and the car
  behind the door is the one the next run starts in.
- FIRST NEW CAR shows at every door until the compact is owned (YOU HAVE n,
  or IT IS YOURS IN CARS once the cash is there), not only at the cold
  open's door: the goal stays in view.
- A video for a prep item already bought is never requested.

### Slice 5 — the cold open finished

- `SimWorldOptions.coldOpen` starts the script at boot unless the save has
  seen it; `App` asks for it on a plain load of a profile that has not
  (`coldopen=1` forces it, test parameters turn it off); the session flag
  is gone. The save's `seen` counts a started cold open, and the store is
  flushed as it starts: a reload mid-way never repeats it (M4's 4.9 pin,
  unchanged, and M5's e2e 5.4). The delivery inside is the real delivery
  on def id 0, the arrow shows while it runs; its door asks for no ad and
  offers nothing.
- Tests: `coldOpen.test.ts` 5.1–5.2 (5.3 is M4's long pin, kept);
  `e2e/game.spec.ts` 5.4–5.5.

Not measured: Marcin's first minute on `?fresh=1` with a stopwatch is his
(the gate report asks for it).

Decided (set here):
- `seen` is written when the cold open starts, not when it ends: the plan's
  slice text says completion or skip, but its own e2e 5.4 and M4's 4.9 want
  a reload after the first caption not to repeat it. The first minute is
  shown once per profile.

### Slice 6 — dailies and the streak

- `sim/dailies/Dailies.ts`: thirteen templates in the language of runs
  (bank N in one run, escape from heat 3 or 5, takedowns in a compact,
  billboards, an order without a scratch, deliveries, police takedowns,
  coins, near misses, banked runs in a row); `setDate` draws three distinct
  ones from `mulberry32(fnv1a(date))`, moves the streak by the civil
  calendar (`dayNumber`, no `Date`), pays the day's streak cash once;
  `step` counts from the ring (completions paid after the read);
  `onRunEnd` from `Run.endRun`; every reward into the bank.
- The daily police seed: `setDailyOrder(cover, seed)` orders each fixed site
  list and mans the first share today (chokepoints 60 %, parked junctions
  60 %, cameras 80 %); the roadblocks, the parked patrols and the cameras
  skip unmanned sites. Before a date every site is manned.
- `App` feeds the local date at boot and once a minute; `?date=` overrides;
  test sessions without it keep M4's all-manned police and draw nothing.
  The DAILIES page, DAILY DONE and DAY n STREAK popups, the day-7 topper (a
  40-triangle `carOrange` cone on whichever car the player drives).
- Tests: `dailies.test.ts` 6.0–6.5.

Decided (set here):
- The topper, once earned, stays when a streak breaks: a cosmetic a player
  earned is not taken back.
- Cameras join the daily share at 80 %: an unmanned camera keeps its pole
  (nothing new placed, nothing removed) and does not flash that day.
- Test sessions (`bot`, `manual`, `spawn`, …) draw no dailies and man every
  site unless `date` is given, so the perf runs and the M4 suites stay
  deterministic across calendar days.

### Slice 7 — the balance script

`npm run balance` (`tests/sim/balance.test.ts`, excluded from every other
run by `vite.config.ts` unless `BALANCE=1` or that npm script): 38 s.

The table (2026-09-23, on 386da51 plus the numbers below; seed 42, traffic
on, 180 s a level; busted runs drive on and the heat is put back after 10 s):

| Level | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| busted a minute, novice | 0.00 | 0.67 | 0.67 | 1.67 | 1.67 |
| busted a minute, skilled | 0.00 | 0.00 | 0.00 | 0.67 | 1.00 |
| expected bank a run, novice | 8.4k | 9.0k | 8.2k | 6.7k | 6.6k |
| expected bank a run, skilled | 8.4k | 19.8k | 36.7k | 27.6k | 18.4k |

From heat 0 the novice earns 520 a minute in the bag and 460 in coins (M4:
406 and 36 coins worth 426–564); the placed jobs pay 5,942 on average. The
best cash-out is level 2 for the novice and level 3 for the skilled bot.

The novice's first hour at level 2 (runs of 3.5 min banking 9.0k with the
coins, the cold open 7.8k in 1.5 min; purchases at a door): the compact at
minute 5.0, tier 1 power 8.6, the van 15.6, tier 1 grip 19.2, tier 2 power
22.7, tier 1 boost 26.2, tier 2 grip 33.3, tier 3 power 40.4, tier 2 boost
47.4, tier 3 grip 54.5; gaps 3.5–7.1 min, 5.5 min to the hour's end. The
three assertions hold.

Changed in `balance.ts`, each with its reason there:
- `jobs.delivery.payoutPerKm` 4,000 → 9,000: every placed delivery (0.55–
  1.27 km of lane path) paid the 5,000 floor; now 5,000–11,400, DESIGN.md
  §3.3's range.
- `tierPrices` 2,000 / 5,000 / 12,000 → 8,000 / 14,000 / 22,000: two tiers
  fell to one door, under the three-minute floor; the tiers now carry the
  first hour's cadence between the cars.
- `prices.heavy` 30,000 → 20,000: a 12-minute save at a novice's 2.5k a
  minute, over the ten-minute ceiling.

Decided (set here):
- The first-hour model buys at doors (the garage is on the wall) and orders
  the ladder compact, a tier, the van, the tiers, the sports car last: at
  any price above the van's the sports car is a longer save than the
  cadence allows, so it is the second hour's goal (the plan listed it
  sixth). The hour's tail with nothing new counts as a gap.
- The run length is the model's (two minutes a level and one to the door,
  shortened by the expected busts), not `measured.runSeconds`: the M4 bot
  never ends a run, so 600 s is a floor of a measurement artefact.
- The bot's busted rates differ from M4's five-minute counts (level 3
  novice 0.67 here, 1.0 there): 180 s at one seed is a short sample; the
  assertions are about the ordering, which both samples agree on.

### Slice 8 — the UI and audio pass, the gate

- The pause screen names the mute key and the sound's state; the key hints
  hide off the road (they overlapped the wall's tabs at 800×450 for the
  first 12 s, an M4 known issue) and give way to the job line.
- `?job=<id|kind>` starts in that ring; `?bot=job` (`app/jobBot.ts`) drives
  a delivery into its drop-off and hunts an order's car with
  `routeToAgent` (shared with the hunt measurement). `e2e/game.spec.ts` has
  the plan's six cases and three more: 9 / 9.
- The music bed is not in: a track means downloading a third-party file,
  which needs Marcin's yes on the file, its source and its licence
  (ASSETS.md, BACKLOG). Every other sound (the job stings, the purchase,
  the daily fanfare, the streak's chime) is oscillator notes on the master
  gain.
- Docs: CRAZYGAMES rows, ARCHITECTURE 41–49, STYLE, README, DEV, ASSETS,
  BACKLOG, M6_PLAN's as-built notes, `docs/M5_REPORT.md`. Package 0.5.0.
  The entries before M5 moved to `docs/history/PROGRESS_M4-gate.md`.

Gate (d21cedd and the report's commit): `verify:gate` green (282 tests),
`balance` green, `game` 9 / 9, `heat` 10 / 10, `city` 5 / 5, `life` 4 / 4,
`screens` 31 / 31 (100 images at the ten sizes, looked at). Startup 3.66 MB,
time to control 3.70 s, the low tour 74 draws / 199k triangles, heap 48–61
MB. Perf: 54.8 / 54.6 fps, frame p95 33.3 / 16.8 ms, step p95 8.4 / 7.3 ms,
against the M4 bases 54.7 / 55.4, 16.8 / 16.8, 7.6 / 7.0: no regression by
the protocol. Frame max 200 ms and 1.0 s (the M4 long-frame issue).

### Next

- Marcin plays the gate (`docs/M5_REPORT.md`, the five-minute script); his
  notes drive the M5.1 pass before M6. Asked of him: the first minute on
  `?fresh=1` with a stopwatch, `npm run perf:headed`, a yes or no on a music
  track.

### Open problems (as written at the gate; the first two closed in M5.1 above)

- Single long frames (0.2–1.0 s) in some 4× runs: closed in M5.1 (the
  whole-buffer upload stall, ARCHITECTURE record 50).
- The quick verify's tests took 73–75 s: eleven tests moved to the long set
  in M5.1; the quick suite reads ~60 s on this laptop.
- The skilled bot never escaped a level-4 marker; the naive hunter reaches
  4 of 6 wanted cars. Both are the bots' limits until a human says
  otherwise.

---

Older entries: the M4 gate and the sessions after it (2026-09-23) in
`docs/history/PROGRESS_M4-gate.md`; M4 (slices 0–8 and the design talks,
2026-09-22 to 2026-09-23) in `docs/history/PROGRESS_M4.md`; M0 through the M3 gate
(2026-09-20 to 2026-09-22) in `docs/history/PROGRESS_M0-M3.md`.
