# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-24 — M8.6 slice 1: wrecks lie like wrecks

Done: a stopped car keeps its pose (rotation and height written from its body, drawn and lent again so, never moved onto
its lane); one at rest on a side or an end is turned over the edge onto its wheels (D3, D4). Found: the traffic's centre
of mass sat 1.05 m up (the collider's frame read as the body's); now 0.38 of the box (0.53 m). The bot's level-5 run: no
wreck and no bust in 120 s (3 and 8 before): the balance at the gate. Two M8 pins leaned on the old weight: the braced
roadblock car's damage factor 3.5 → 4 (the compact's 80 km/h wreck was 1.000 exactly, now 0.998); the terrace pin's
baseline was a settling step and its cruiser turned (median of the plain steps, held straight). Pins M8.6 1.1–1.3, 1.4
long. Verify green.

## 2026-09-24 — M8.6 slice 0: on four wheels

Done: a driving lent body turns about the vertical only (`lockDriving`: roll and pitch locked with its height); a shaken
car meets the ground with every axis free (`unlock`; `disturb` now lets a driving car go too) and drives on only level
within 6°, not rocking, within 15 cm of its road; leaning at rest it is rocked toward level; overdue, a wreck. Pins M8.6
0.1 (pushed on its flank and carrying the player on its tail: level, on its road; the old code tipped it to 67°), 0.2
(dropped at a 20° lean: the reattach turns it 0°, the old one 20°), 0.4 long (the chase read: 0 of 49,082 driving
samples leaning over 3° or sunk; before, 18 % and ten cars). The sim step in the chase 0.50 ms (0.81). Verify green.

## 2026-09-24 — M8.6 "Solid cars": Marcin's screenshots, measured, and the plan

Marcin's six screenshots of a five-star chase: police cars and wrecks on two wheels, in the road, on a nose, a truck on a
car, the officer inside his car; frames dropping. The chase read (the bot, level 5, 120 s, every lent body every step):
18 % of the driving samples tilted over 15°, ten cars sunk (one by 2.5 m), two driving on their roofs (a lent body's
height is held but its roll and pitch were free); 4 of 12 wrecks at rest on a side; the officer in the player's car on
6.5 % of his steps; the sim 0.8 ms a step, the only steps over 8 ms the city loading a part (15–27 ms). DESIGN §18 and
`docs/M8.6_PLAN.md` set the fix, slices 0–5 and the gate; it starts now, his notes being the word. The platform after.

## 2026-09-24 — M8.5 gate (with M8's): the numbers

**Suites.** `verify:gate` green (480 tests, 192 s; smoke 59.8 fps, 3.96 MB); `game` 15/15, `heat` 10/10 (the 14:29 crash
did not come back), `city` 5/5 (low 88 draws / 202k, high 114 / 274k), `life` 4/4 (52.1 fps; red three times first:
twice its p95 on the 33.4 quantum as at M7, once at 30 fps with Marcin's Chrome open), `boot` 200/200 (p50 0.64, p95
0.94 s), `screens` 51/51 with the new checks (the calm drive's seven at ten sizes; the first run's ten red were the
check's own wait), `balance` green (the first car at minute 6.7). **The A/B** against 0.7.0 on the same road: traffic
51.5 against 51.8 fps, no traffic 57.6 against 58.2; the chaos run 53.7–55.0 fps, p95 33.3, the props' phase 0.13 ms.
**Found:** time to control 4.32 s (0.7.0) against 4.69 (medians of five pairs), the props' placement; with the road
paint's older cost both now read only what is near (ARCHITECTURE 89, every answer equal to the digit): 3.91 against
3.97. The kid's pass found an E keycap on every job's card (since M5.5) and the trials' dashes on GOALS: fixed. Not
met: the heap 58–65 MB against M8's 50 (the brief's 250 holds), the quick tests at 60–63 s (BACKLOG). Report
`docs/M8.5_REPORT.md`; M7's entries to `docs/history/PROGRESS_M7.md`; 0.8.5. Marcin asked to clear stray processes:
mine stopped (a run he declined had started, two preview servers, log watchers), three old watchers too; three other
Claude Code sessions idle, left to him. Next: his 0.8.5 notes, then M9 on his word.

## 2026-09-24 — M8.5 slice 4: the words

Done: §17.4 on every screen. The stars for heat (`ESCAPE FROM ★★★`, `ESCAPE ★★★★★ FIRST`), GARAGE for the hideout and the
door (the cold open's caption, the sentence `CRIMES FILL THE BAG · STARS MULTIPLY IT · A GARAGE BANKS IT`), the arrow for
a job's end (`DELIVER IT · FOLLOW THE ARROW`), COPS for the police (the map's key, the escape card), MORE STARS for the
hot fare. Words a child would ask about: the fence is BAG BONUS (a fence is also a thing you smash), the stars' news says
COPS ON YOUR TAIL, FAST COP CARS, HEAVY SUVS, a car driven in says KEEP IT without HOT. Pins M8.5 4.1 (the upper-case
literals of the UI and the sim's text tables hold no retired word), 4.2 (the dailies' ids and targets stand). Verify green.

## 2026-09-24 — M8.5 slice 3: the wall in four

Done: TOTALS · CARS · STYLE · GOALS (`ui/wallPages.ts` names them and the page of every button). TOTALS: BANKED (GARAGE
for an empty bag) with NEW BEST (`Run.lastBest`), one line of sums (`BAG 32,500 ×2.6` … `+84,500`), the sentence while it
teaches, the next goal, the counts (`ui/totals.ts`); no BANK, MULTIPLIER or BEST RUN line, no poster. CARS: the cars, the
chosen car's upgrades, then the lawyer and the fence FOR THE NEXT RUN. Decided: the boosters on CARS, not TOTALS as §17.5
said: W on TOTALS drives out, a row of buttons there is one key from spending by mistake (§17.5 and D8 say so now). GOALS:
the next goal, the day's three and the streak, the board (no quip, READY only when ready), the hunts, the trials, the
best run. Pins M8.5 3.1–3.3. The game suite still clicks PREP: it changes at the gate. Verify green.

## 2026-09-24 — M8.5 slice 2: one voice

Done: `ui/voice.ts` gives every event one place (the top, a pop, nowhere) and one text; the HUD asks it once per event.
The top centre: the stars' news led by the stars (`★★★ ROADBLOCKS UP`, never LEVEL), ROADBLOCK AHEAD, HELICOPTER ON YOU,
the suspect's car, a rival ready, the twins' new car. Gone: the evening news after a level and an escape, UNIT DOWN, a
rival driving by, the damage news, the duel's BEATEN pop and news (its job line says it), the combo's tricks as pops
(NEAR MISS, ONCOMING!), DODGED, FRESH WHEELS. Two pops at most (`Pops`); SKILL CHAIN is COMBO. Over the wall and the busted
card nothing speaks: the pops go and an owed line is dropped (it was stale by the next run). Pins M8.5 2.1–2.3. Verify green.

## 2026-09-24 — M8.5 slice 1: the four corners

Done: `ui/corners.ts` decides the driving screen each frame: a calm drive shows the stars, the bank, the radar, the speed
and the boost (with the goal line and the arrow, seven; fourteen before); the bag from its first money and its × from
×1.3 (its place kept, so the bank never moves); the district's names for 4 s on a change and at a new run; the damage
once dented, the combo while it runs; nothing of it behind a shut door or on the busted card (the radar stops painting).
Gone: the gear (the debug block keeps it), ONCOMING, the drift readout, the three counters (a billboard's pop carries its
count, the full map's head all three), the job line's coin count. The tuning panel and its hint only with `?dev=1`. Pins
M8.5 1.1–1.5; STYLE's corners. The screens suite still reads the removed elements: it changes at the gate. Verify green.

## 2026-09-24 — M8.5 slice 0: one bank

Marcin: "Wykonaj". Done: a road coin lands in the bank the moment it is picked (a spilled coin still in the bag);
`Run.coins` and `Run.funds` are gone, every price checks the bank; save v6 folds a stored pool into the bank. The HUD's
white number with the coin is the bank, the wall's footer says BANK (was CASH): the wall's BANK and the footer are one
number. Pins M8.5 0.1–0.3; moved: coins 3.9 and 3.12 (the bank), the save's version and the migrations' banks (the
coins folded in), caches 1.6 and hunts 14.5 (a cap and a gate coin now land in the bank), long game 9.1 (the version);
the balance counts the road coins from the event ring. ARCHITECTURE 88. Verify green.

## 2026-09-24 — design talk: the clean screen (M8.5) before the platform

Marcin brought a review of the screen ("too dense for a child": fourteen things on a calm drive, seven tabs on the
wall, money under four names with BANK and CASH as two numbers on one screen) and agreed: crowded and chaotic in the
bad sense, and a CrazyGames game cannot ship careless. Counted on the M7 gate's screens: also heat under three names
(the stars, LEVEL, HEAT), the garage under three, four NEAR MISS pops beside the combo that already says it, the
news over the busted card, and the key hints naming the tuning panel, which opens without `?dev=1`. Set here, DESIGN
§17: each corner answers one question (seven things on a calm drive), one voice at a time, one name for each thing, a
road coin in the bank (save v6), the wall as TOTALS · CARS · STYLE · GOALS, the screen's budget in `CLAUDE.md`. The
contract `docs/M8.5_PLAN.md` (slices 0–5); the platform keeps M9. M8's gate closes inside M8.5's (one A/B, one
report, 0.8.5): the new work touches only the screen and the coin pool, and M8's long pins hold. Open for it: the
heat suite's last run crashed its browser at 14:29 (`Target crashed`). Next: M8.5 on his word.

## 2026-09-24 — M8 slice 9: the long game

Done: save version 5 with `career.smashed` (the player's smashes, lifetime; a v4 save migrates with 0; the save pins
moved to v5). Two dailies: SMASH 60 THINGS IN ONE RUN (a new `oneRun` count, cleared at a run's end short of it) and
FLATTEN 10 LAMP POSTS (the `prop` filter); the draw now picks from fifteen. Big Bernie's second requirement is SMASH
300 THINGS, read from the lifetime count; his jumps requirement is gone, the jumps keep their hunt. Pins M8 9.1–9.3.
Verify green.

## 2026-09-24 — M8 slice 8: mayhem and the cold open

Done: each mayhem zone's corner is a market along its footways (a fruit or fish stall on the frontage line, a crate
behind it in the yard, a table with two chairs after every other one; 40 and 41 things, 7,420 and 6,500 at the
sticker); a smash in the zone counts its bill, the quota 15,000 (jobs rebaked). The cold open drives through a café
terrace, a newspaper box and a newsstand. Decided: just past the billboard gate, not before it: the footway before
the gate is the hideout door's approach, and a newsstand there would hold a car crawling home. Loose things on the
route may stand in the gate's run-out. Pins M8 8.1, 8.2. Verify green.

## 2026-09-24 — M8 slice 7: everyone else

Done: a lent body (a civilian shoved loose, a police unit) knocks by the rule with its own mass, swept at its body's
velocity, the Δv on its body, nothing paid; a car on its lane within 200 m of the player ploughs lying props aside
(twice as much aside as ahead, the loose rule at its speed, never slowed). The walkers step after the knocks and dodge
a flying prop like a car; the guarantee holds against its bound swept over the step. A knocked prop's body never dents
a car (a post that holds is still a wall). Pins M8 7.1–7.4 (7.1 drives a cruiser's body along a terrace's row; the test
hook `Props.drop` lays a prop in a lane for 7.2). Pins 1.3 and 1.4 hold the heat at zero: their smashes now bring the
police, whose knocks are 7.1's. Verify green.

## 2026-09-24 — M8 slice 6: the pay

Done: a smash is a chain trick (`Trick.Smash`): the thing's points, its name as the chain's word; smashes within 0.5 s
of their group's first make one trick toward the multiplier (all their points add); an anchored thing that holds
against the car at 2 m/s or more loses the chain. The player's smash fills the boost by the kind and is a crime by its
heat (×2 in a unit's sight); anyone else's knock pays nothing. The run counts the smashes and the bill: `CITY DAMAGE`
after the counts on the door's wall, never the bag or the bank; the ticker's news when a district's bill passes 10,000
and 50,000. Pins M8 6.1–6.4 (a terrace is six pieces: 6.1 knocks it and the four things nearest). Verify green; its
tests took 82 s, over the minute: trimmed at the gate.

## 2026-09-24 — M8 slice 5: the spectacle

Done: a smashed prop throws its material's debris from where it stood, with the knock's way: glass shards, paper
fluttering down (a fifth of gravity), fruit rolling (round pieces, their own instanced mesh), splinters, plastic and
ceramic chunks, bolts; sparks off metal (`Sparks.burst`). The debris pool 32 → 96, each mesh hidden with nothing in
flight. The hydrant's column wobbles at its top and sinks over its last three seconds. `Sfx`: a voice per material
(metal clangs, glass shatters, wood cracks, plastic bonks, fruit squelches, paper rustles, ceramic clinks), quieter
with distance, and the jets' hiss by the nearest one (silent past 50 m). Pins M8 5.1, 5.2. Verify green (374).

## 2026-09-24 — M8 slice 4: the districts' sets

Done: the Works' kerbs (rows of cones, barriers) and front yards (barrels, pallets, crates, tyre stacks), the Gardens'
front gardens (picket fences on some, a letterbox by every path, flamingos, gnomes) and fruit stands, the Quay's
promenade (deckchairs under a parasol, lobster pots, its wooden benches) and fish stalls; their models. Thinned to the
plan's density: a sapling every 72 m (every 36 in the leafy Gardens), frontage slots every 15 m: a plain block's
streets hold 45–65 (a block with a highway side 25–51, the highway being out of M8; a block an avenue crosses up to
106). The island-wide placement pins (0.1, 0.2, 2.1, 3.1, 4.1) moved to long files (the quick tests were at 67 s); pin
1.3's slowest 40 → 8 km/h (a Crown kerb run of anchored things now costs speed; it never stops). Pins M8 4.1, 4.2.

## 2026-09-24 — M8 slice 3: the street set

Done: hydrants on any kerb line, parking meters in Crown Heights and the Works, newspaper boxes (Crown, Quay) and
newsstands (Crown) on the frontage line, a bus shelter at the middle of some Crown streets, a café terrace in front of
every avenue corner shop (a table with its umbrella either side of the door, two chairs each: the 2.1 m between the
frontage line and the shop leaves no room across); their models. A broken hydrant's water runs 20 s and pushes up with
1.2 kN at its own point on any car over it (the player's and lent bodies); a simple column until slice 5's spray.
The shelter is 1.2 m deep and the newsstand 1.6 m so both fit their lines. Round props' neighbour spacing uses their
radius. Pins M8 3.1–3.3. Verify green (375).

## 2026-09-24 — M8 slice 2: the trees

Done: a thick tree's trunk (the parks', the front gardens', the promenade's and the plaza's palms) is a solid cylinder
in the physics ring (`trunk`, restitution 1: a wall; the props' group, so no sight or wheel ray meets it); the street
trees are the saplings, which snap; every crown six-sided (BACKLOG's shadow-pass line shipped). Found by pin 2.1: two
edge parks' trees stood in a neighbour chunk's verge billboard run-out (0.7.0's placer sees only its own chunk), now
moved out of the verge's strip; jobs, billboards and coins unchanged. The corner clearance applies on the corner's
footways (a plaza palm 7 m off the road stays). Pin 1.1 in one world (2.6 → 0.9 s). Pins M8 2.1, 2.2 (the compact's
sapling costs 8 %, the formula's for 1,050 kg; the plan's 6 % is 1,400 kg's). Verify green.

## 2026-09-24 — M8 slice 1: the measurement (MX330, the plan's one exception)

Draws at the M7 gate's 40 tour points (`&life=0`): 69.0 a frame against 0.7.0's 68.9 (chunks 20.6 / 20.5), 116k / 115k
triangles: standing props add no draw. A/B, low, 4×, `&life=0`, the pavement bot (0.7.0 drives its lane), fps old/new:
first build 58.5/57.1, 57.6/37.6, 47.1/35.3, 57.1/56.8 (physics +0.9–1.6 ms with 9–12 bodies; in the machine's slow
state the new build fell 12–20). Rapier's cylinders were half the cost (Node, 16 bodies: 0.24–0.34 ms, capsules 0.12):
round props now collide as capsules, squat ones as boxes. Final: 58.2/56.9, 58.2/57.9, 57.6/56.7, 58.1/57.1 (−0.3 to
−1.3); physics 1.02–1.10 ms against 0.57–0.62, the props' phase 0.08 ms (budget 0.3), draws 77 / 72 (the down props by
kind), heap 65 / 61 MB. Inside ±3: the content goes on. Pin 1.3's kerb stretch sanity bound 250 → 200 m (it drives 249).

## 2026-09-24 — M8 slice 1: the knock

Done: `sim/props/Props.ts`: every loaded prop's state by id, a grid of 8 m cells, the player's footprint swept before
`world.step` (the probe's numbers, the body read only on a hit), the two-body rule (`knockImpulse`, `carSpeedLoss`),
anchored props' posts on their chunk's fixed body (restitution 1: a wall below the base's strength), 16 CCD bodies,
arcs past them, settling to lying, lying ones knocked from 1 m/s, the heal at 730 m after 60 s, `smash`; the render
collapses a knocked prop's range and `PropsView` draws the down ones by kind. Props are their own collision group:
the wheels', the police's and the helicopter's rays never meet one. `TrackBot.pavement` (opt-in). The M2 residency
pin counts the posts apart from its 600 (the posts are exactly the loaded anchored props). Pins M8 1.1–1.7. Verify green (370).

## 2026-09-24 — M8 slice 0: the props as data and where they stand

Done: `sim/city/props.ts`, the catalogue (all 26 rows of M8_PLAN §3.3, with their shapes) and `chunkProps`: the kerb line
(0.7 m: a lamp post every 36 m of the street, a sapling between, bins) and the frontage line (3.7 m: benches) on every
footway, the parks' and the promenade's benches, from each chunk's own stream; where nothing stands is `City.propRule`
(lanes, the walkers' band, rings, doors, billboards' lines and the verge's run-out, ramps, corners, overpasses, covers,
the cold open's route, anything built). The old footway lamps, street trees and benches left the statics: 1,979 props,
23–73 a block, drawn inside the chunk meshes with their vertex ranges (smoke: 125 draws as before). Deviation:
`City.props(cx, cz)`, not `CityChunk.props` (a chunk's props need the rings and the cold open's route, whose placement
reads chunk statics). Layout hash 11.1 unmoved (it hashes colliders; the decoration had none). Pins M8 0.1–0.3. Verify green (363).

## 2026-09-24 — design talk: M8 is the chaos, the platform becomes M9

Marcin, after the M7 gate (pushed on his word, `4f1a29f`): the platform moves to M9 and M8 is designed "seriously".
Proposed and taken ("Dobra, napisz M8"): the chaos, DESIGN §16 (set here). Found for it: the footway's lamp posts,
street trees, benches and railings are decoration without colliders (cars and walkers pass through them), and
nothing in the city breaks but the billboards and the scaffold towers. The design: props with mass and a base's
strength, the contact decided before the physics step (closed-form, pinned), a pool of 16 bodies, fallen props
that lie and heal, each district's things, the smash as a skill-chain trick, the bill at the door, save v5. The
contract `docs/M8_PLAN.md` (slices 0–10); the platform's plan renamed `docs/M9_PLAN.md`. Next: his 0.7.0 notes,
then M8 on his word.

---

Older entries: M7 (its design talk, slices and gate, 2026-09-24) in `docs/history/PROGRESS_M7.md`; M6 (its design talk, slices and gate, 2026-09-23 to 2026-09-24) in `docs/history/PROGRESS_M6.md`; M5.5 (its
slices, its gate and the overpass note, 2026-09-23) in `docs/history/PROGRESS_M5.5.md`;
M5, M5.1 and Marcin's M5 playtest (2026-09-23) in `docs/history/PROGRESS_M5.md`; the M4 gate and the sessions after it
(2026-09-23) in `docs/history/PROGRESS_M4-gate.md`; M4 (slices 0–8 and the design talks,
2026-09-22 to 2026-09-23) in `docs/history/PROGRESS_M4.md`; M0 through the M3 gate
(2026-09-20 to 2026-09-22) in `docs/history/PROGRESS_M0-M3.md`.
