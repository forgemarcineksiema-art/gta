# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-24 — M7 slice 10: the money

Done: `tests/sim/model.ts`, the EV table and the first hour, pure; the balance script measures and calls it, its
novice now the careful bot. Decided: the model pools the measured capture rates where they fall with the level (a
level's police have all the level below has; the M6 gate's novice was caught more at 2 than at 3, luck of three
seeds). Fitted on the M6 gate's inputs: multipliers ×1.3 / ×1.65 / ×2.6 / ×3 (novice best door level 2, skilled 4,
its bank rising to it), the compact 18,000 (minute 6.3, not 3.9), tiers 15,000 / 17,000 / 21,000 (a purchase every
4.8–7.2 minutes, something to see every 7.2 at most). Pins M7 10.1, 10.2; the door and garage pins read the new
values. Verify green (352 tests).

## 2026-09-24 — M7 slice 9: the police's corners and levels 4–5

Done: a unit on a chase takes a turn on its inside line, 1.6 m in from the traffic's curve from 14 m out (a left
turn cuts in over the middle, a right one hugs the kerb), so it reads as police driving: 2.4 m shorter through a
right-angle junction than a civilian. The box's slots go to a heavy within reach before a nearer saloon
(`POLICE.arrest.heavyFirst`, 12 m; `slotCost`), so levels 4–5 box with their weight. Whether that makes level 4 catch
as often as level 3 is the balance's capture table at the gate. Pins M7 9.1, 9.2. Verify green (350 tests).

## 2026-09-24 — M7 slice 8: the civilians

Done: the standoff goes round on the side away from the player: with the player at its kerb (the M6 gate's case,
where it pulled toward them for good) it swings out on the oncoming side when that is clear, else to its kerb; it
crawls at 1.5 m/s until clear of the player by where it actually is (a lent body lags its path), its carrot close
so it turns aside within a car length, and never touches them. A shoved car whose body is returned blends back onto
its lane over a second instead of jumping (3 m in one step before). Measured, not changed: the forced junction
entries (two a minute at seeds 42 and 7) are the bad drivers' early claim (their character since M5.5) and side
streets at the highway waiting on its flow. Pins M7 8.1, 8.3. Verify green (348 tests).

## 2026-09-24 — M7 slice 7: the boot

Read the boot for races: every await (the platform, Rapier's WASM, the save) resolves once and never waits on an
event that could have fired first; the one hang seen (a page at LOADING in the M6 gate's screens run) most likely
never ran the game's script. Done: `app/bootWatch.ts`: a phase over 5 s names itself on the loading screen (LOADING
· CITY), and 20 s without control offers STILL LOADING · CLICK TO RETRY (a reload only on the player's click); the
page's own inline fallback offers the same at 25 s if the script never ran. `npm run boot` (e2e/boot.spec.ts) runs
200 fresh boots at the gate. Plan's automatic phase retry dropped: a reload the player chooses is the honest retry.
Pin M7 7.1. Verify green (346 tests).

## 2026-09-24 — M7 slice 6: the frame budget

Profiled first (Node, a minute of the city): the traffic's plan, its unstick pass and the player-gap projection led.
Done: the unstick finds its pairs through a grid of 16 m cells in index order and falls back to the full scan from
the first push, so it is the full scan's traffic bit for bit (checked two ways) with 23× fewer pair checks; the
player-gap projection runs only for cars within reach of the player (1.5 a step, not 58). Found on the way: a player
past a lane's end (no next lane chosen yet) projected onto the end with no lateral, and cars braked for them from
anywhere down the line; now the projection must be beside the path. The traffic builds a body's mesh the first time
one spawns. Not done: the six-sided tree crowns (a quarter of the trees' triangles against their look; the gate's
A/B decides). Pins M7 6.1, 6.2. Verify green (345 tests).

## 2026-09-24 — M7 slice 5: no hitches

Measured first (Node, a minute of the city driven by the bot, traffic and walkers): no major collection, 19
scavenges of at most 2.1 ms, the worst step 4.6 ms; about 120 KB a step of short-lived numbers, which the
scavenges take cheaply. The sim is not what stutters, and its streaming was already one chunk of collision a step
(the render's one claim and a few parts a frame since M2.2). Done: the automatic quality settles after two tier
switches a session (each reallocates the drawing buffer and the shadow map; near the line it flipped every 15 s);
the perf run now counts frames over 50 ms after the first 5 s, for the gate. Plan's 1 KB-a-step pin replaced by
M7 5.1 (long: no major collection, under 40 scavenges, one chunk a step). Verify green (343 tests).

## 2026-09-24 — M7 slice 4: skid marks and the spill's burst

Done: `render/SkidMarks.ts`: a rear wheel sliding past 8° of slip angle or 0.25 of slip ratio above 3 m/s (a front
only when locked) lays a dark strip on the ground under its contact, darker the harder it slides, fading over 30 s
by its age in the shader; one mesh, a ring of 2,048 quads, only the new quads uploaded. Deviation from the plan: the
marks lie on any flat ground, grass included (a churned track reads right; the render has no surface query). The
spill's twelve coins now fly out of the wreck to their places on an arc, 20 ms apart. Pins M7 4.1–4.4 (a skidpad
drift marks, the run up to it does not). Verify green (343 tests).

## 2026-09-24 — M7 slice 3: the settings row

Done: the pause screen gains MUSIC and EFFECTS (0–10, the music at 7), QUALITY (AUTO, LOW, HIGH) and RADAR
(TURNS, NORTH UP): W/S a row, A/D its value, every value clickable; M still mutes all. The audio splits into an
effects bus and the music's under the master (both mutes take both); a step is 3 dB. QUALITY holds a tier or lets
the frame cost choose (`?quality=` still wins); north up holds the radar at north and turns the arrow. The world
carries `settings` for the save, version 4 (a v3 document migrates to the defaults; a broken field falls back
alone). Pins M7 3.1–3.3 (the v2 migration pin now ends at the current version); game.spec's settings case runs at
the gate. Verify green (339 tests).

## 2026-09-24 — M7 slice 2: our own music

Done: `audio/score.ts`, eight bars in A minor at 120 bpm over Am–F–C–G, written for the game: a driving octave
bass and offbeat keys when calm, four-on-the-floor drums with a clap roll from one star, a hook with an echo from
three, a siren figure at five; stings for busted (a slip and a sagging fall), an escape (up the chord) and the door
(the till's chord and bell). `audio/Music.ts` renders each layer once through an `OfflineAudioContext` a second after
gameplay starts (mono, the tail folded onto the loop's start), loops them from one start time, fades by the heat
over a bar, ducks 6 dB under a sting; the bus sits 14 dB under the master, so the ad and the player's mute take it.
No file, no bytes before play. Pins M7 2.1–2.4 (the pin caught a bass seventh outside A minor). Verify green (336).

## 2026-09-24 — M7 slice 1: the top of the screen

Done: the job line and its card, the intro's caption, the key hints and the news stack in one column at the top
centre (`ui/lanes.ts`: `mountTop`, and `arrangeTop` deciding who shows: the hints and the news wait under a card or a
caption, the news with its clock stopped); the news wraps inside the column instead of running under the stars. The
pops (streak, tips, bounties) moved from over the speed to a lane under the coins, two high on short screens.
Deviation from the plan: the hints stay at the top, under the job line, since the bottom centre holds the swap
prompt, the busted pad and the drift readout; the column stacks, so `arrangeTop` decides who, not where. Pin M7 1.1;
the screens suite checks every driving state for intersecting HUD boxes at the gate. Verify green (332 tests).

## 2026-09-24 — M7 slice 0: the workshop

Done: the quick verify's tests 105 → 39 s. Test files share their worker's modules (`isolate: false`: Rapier's WASM
initialised once a worker, not once a file: 65 → 37 s) and twelve slow files plus four slow tests moved to the long
set (breakers, the traffic bodies, the boost economy, the chain, pedestrians, heavies, identity, damage, races,
covers, cameras, signals; the jobs skeleton, a takedown). Props: the stash's hidden cars and the rivals' parked cars
take `PROP_RECORDS` (16) records above the traffic's pool (`spawnProp`); the spawner, the density count and a
claim never touch them. Pins M7 0.1 (long: a roadster 245 m away changes nothing within 200 m of a stopped player in
two minutes; it failed on record 12 at 0 s with the old pool spawn), 0.2. Verify green (331 tests in 39 s).

## 2026-09-24 — design talk: M7 is the polish, the platform becomes M8

Marcin: the next milestone improves and fixes what the game has; the platform moves to M8 (decided). Set here (DESIGN
§15): nothing new to do; the bar is five tests a player applies in the first minutes (it loads every time, nothing
covers anything, it never stutters, it sounds alive, every promise the rules make holds); every recorded issue a
player can meet (the M5.5 and M6 reports, the backlog's play items) worked off; mine added: our own synthesized
music that climbs with the heat, a settings row on the pause screen, skid marks, one rule for the top of the screen
(the intro's first second prints the level news across the key hints today), the first rival beatable at the first
try, far parked cars kept out of the traffic. Contract `docs/M7_PLAN.md` (slices 0–14); `docs/M7_PLAN.md` renamed
`docs/M8_PLAN.md`. Verify green before the edits (374 tests). Next: his 0.6.0 notes, then M7 on his word.

## 2026-09-24 — M6 gate: the numbers

**Verify.** `verify:gate` green: 399 tests with the long pins (215 s), lint 0, build, smoke 59.9 fps, startup 3.88 MB;
G.2 joined after (the quick `verify`: 374 tests in 110 s). `game` 12/12 (the first rival's race by the M5 bot: Granny first; the STYLE card;
the horn), `heat` 10/10, `city` 5/5 (time to control 3.97 s; low tour 86 draws / 197k tris, high 112 / 272k; heap
54–58 MB), `life` 4/4 (52.9 fps, step p95 9.9), `screens` 51/51 on a rerun (the first run: one page stuck at LOADING
for 30 s at 821x462, not seen again alone or in the rerun).

**Perf** (MX330, 4× CPU, 60 s bot; bases `perf/m5.5-gate-fix-1..2.json` 53.7 / 53.9 fps, frame p95 33.3 / 33.3, step
p95 8.7 / 9.2): `perf/m6-gate-1..3.json` 51.8 / 52.5 / 53.3 fps, frame p95 33.4 / 33.4 / 33.3, step p95 9.5 / 9.0 /
9.3, step mean 5.3 / 5.2 / 4.9 (bases 4.9), traffic 2.5 / 2.5 / 2.4 ms, draws 134 / 130 / 135, tris 279k, heap 58 MB
(48). Runs 1 and 2 put the frame p95 0.1 ms over the bases; the third matched them in frame p95 and step mean and the
fps are inside the MX330's ±3 band, so no regression called. The heap is up 10 MB in all three (BACKLOG). The save
with everything M6 can hold: 2,102 bytes of 32,768.

**Balance** (`npm run balance`, 124 s). The model's job mean left the duels out (a duel pays its purse once, one
rival at a time; with them the mean was 12,670 and every run banked 50 % more): 7,018 as at M5.5.

```
time to level from heat 0, novice: level 2 174 s, level 3 219 s; skilled: level 2 47 s, level 3 121 s
busted a minute (seeds 42 / 7 / 123):
  level 1: novice 0.33 (0.33 / 0.33 / 0.33), skilled 0.56 (1.00 / 0.33 / 0.33)
  level 2: novice 0.78 (0.33 / 0.67 / 1.33), skilled 0.33 (0.00 / 0.33 / 0.67)
  level 3: novice 0.44 (0.33 / 0.67 / 0.33), skilled 0.78 (0.67 / 1.00 / 0.67)
  level 4: novice 0.44 (0.00 / 1.00 / 0.33), skilled 0.11 (0.00 / 0.00 / 0.33)
  level 5: novice 0.44 (0.67 / 0.33 / 0.33), skilled 0.33 (0.00 / 0.67 / 0.33)
bag 1,157 a minute (1,633 / 1,270 / 567), coins 241 a minute
expected bank a run: novice L1 5.6k  L2 5.5k  L3 5.6k  L4 5.5k  L5 5.3k (best L3)
                     skilled L1 3.9k  L2 5.7k  L3 4.6k  L4 5.5k  L5 5.5k (best L2)
the novice's first hour at L3 (runs of 2.3 min banking 5.6k):
  3.8 compact · 8.5 tier 1 power · 10.8 kit: kazoo · 15.5 kit: clown horn · 17.8 heavy · 22.5 tier 1 grip
  · 24.8 kit: doorbell · 29.5 tier 2 power · 31.8 kit: slammed · 34.2 tier 1 boost · 36.5 kit: lifted
  · 41.2 kit: mattress · 43.5 tier 2 grip · 45.8 kit: goose · 50.5 kit: red smoke · 52.8 tier 3 power
  · 55.2 kit: blue smoke · 59.8 tier 2 boost
the board's cash gates: a 40,000 run not at L3 (5.6k a run); three cars at minute 17.8
something to see bought every 2.3 / 7.0 / 4.7 / 2.3 / 7.0 / 7.0 / 4.7 / 4.7 / 4.7 / 4.7 / 4.7 min
```

(c) and (d) hold (every gap 4.7–9.3 min; something to see at most every 7.0). **(a) and (b) are red**: the skilled
optimum (L2) under the novice's (L3), the first car at 3.8 (5–7, 3.9 at M5.5). Both banks a run are flat across the
levels, so the argmax follows the traffic's moment: M6's reserved bays moved seed 7's skilled captures at L3 and L5 from
0 to 1.00 and 0.67 a minute. Not fitted (BACKLOG): prices and the heat multiplier are Marcin's first hour.

## 2026-09-24 — M6 gate: the long pins, the STYLE page

The long pins were green through slice 8; slice 9 turned two red (bisected in a worktree). The three hidden cars take a
traffic record each within 260 m, so the traffic's moment moved, and two bots met what they had no rule for: the cold
open's bot rammed a car at 29 m/s on the escape straight and pushed the wreck at walking pace for 80 s; the careful
delivery bot, mid U-turn in a junction, waited nose to nose behind a crossing car as if in a queue. The test bot's, not
the game's: a careful driver and the cold open's bot now back off a car that will not move on (a dead one or one facing
it, 7 m ahead, 1.5 s under 2 m/s): 1.2 s in reverse with the wheel the other way, then round it 3 m on the far side
(`TrackBot.unblock`); the careful queue counts only cars facing its way. The other bot pins keep the M5 bot bitwise
(given to every bot, the heat pin's novice lost level 3 at two seeds). Assertions unchanged. Found on the way, the
standoff pulls a lent-body car toward its own kerb when the player stands there (BACKLOG). The three bay cars stand
parked like the rivals'. G.1: the careful bot beats Granny 2 of 3 (won 49.1 and 79.8 s; the first start, her 50.8 s).
G.2: the save with everything M6 can hold. The STYLE page (screens): nine rows squeezed into the wall, names cut,
nothing at 800x450, off the screen at 1920x1080; now it scrolls under the tabs (the keys bring the focus into view),
the cards are lower, and a scaled wall keeps to the screen's height. game.spec: the first rival's race, the STYLE card,
the horn.

## 2026-09-23 — M6 slice 10: the first hours' model buys the kit

Done: the balance script's first hour buys the cheapest kit item at a door with no rung affordable, four minutes after
the last thing seen bought; a fourth assertion, something to see bought (a car or a kit item) at least every 8 minutes;
it prints the board's cash gates (a 40,000 run, three cars). Run at the gate (Pace). The wall keeps CARS next to TOTALS
(the garage-by-keys pin's eight presses), BOARD after it; `?kit=all` owns the whole kit for playtests.

## 2026-09-23 — M6 slice 9: three hidden cars

Done: a roadster (1930s, open cockpit, long bonnet, running boards, wire wheels) in Crown Heights, a street sweeper
(brushes, suction mouth, amber bar, hopper) in Sunset Works, a hot-dog van (the sausage in its bun on the roof, a
striped awning) on the Coral Quay, appended bodies never spawned. Each waits in its district's kerbside bay furthest
from the middle and 60 m from every job and door (`stashSpots`; the bays kept clear of parked civilians), stands there
within 260 m, is found for good by a swap; `Stash` keeps a record each. The clue: the nearest unfound car's own figure
(a low jaunty motif, reversing beeps, a bell). 28 cars now. Pin M6 9.1. Verify green (373 tests).

## 2026-09-23 — M6 slice 8: the car's kit

Done: three car slots in the kit, bought once and fitted per car in the garage (`Garage.carKit`, the save's
`[wheels, rim, spoiler, stance]`, the rim unused): four wheels (chrome stars, a deep dish, gold wires, white discs, new
hub styles in `wheelGeometry`), three spoilers on the boot (a lip, a wing, the giant red one; the vans, trucks and buses
take none), two stances (slammed 6 cm, lifted 10 cm: the body over its wheels, drawn only). Shown while the garage's car
is driven (`SimWorld.garageDriven`, false after a swap); nothing of it touches the tuning. STYLE lists the car's rows
first (THIS CAR) and the driver's after (YOURS). Pins M6 8.1–8.3. Verify green (372 tests).

## 2026-09-23 — M6 slice 7: neon, horns, the boost's flame, tyre smoke

Done: the horn is a verb on H (hint strip, `horn` edge in the controls): a civilian ahead in the player's lane within 25
m moves 0.8 m toward its kerb for 2 s, once per 4 s (`Traffic.honked`), units and racers never; the 'horn' event plays
the worn one (a clown's, a goose, a doorbell, a two-tone, a kazoo, Bernie's air horn; the class's honk when none).
The game had no tyre smoke and no boost flame: now a drift smokes off the rear tyres and the boost burns at the tail, in
the worn colours (a pale grey and orange when none); neon is a soft additive quad in the body's footprint (the twins'
mint to peach). All ride on whatever car the player drives; STYLE shows all five rows. Pins M6 7.1–7.3 and the H key.
Verify green (369 tests).

## 2026-09-23 — M6 slice 6: the driver's kit and the STYLE page

Done: `garage/kit.ts`, the catalogue of 43 items in five slots (toppers now; neon, horns, flames, smoke drawn in slice
7), bought, won (a rival's from their win, the cone from the streak) or taken off (`BARE`); the day's pick is one item
not had, the same all day by the date, at half price (no crate, no dice). Seventeen toppers in `render/kitMesh.ts` (the
duck, a shark fin, a crown, a traffic light, a donut, a dish, a mattress, a trophy, a flamingo, the rivals' seven),
under 300 triangles each, on the roof of whatever car the player drives. PAINT is STYLE: the paint, then the roof's row;
a card wears, takes off or buys. The save keeps it. Pins M6 6.1–6.4. Verify green (365 tests).

## 2026-09-23 — M6 slices 4–5: the rivals' cars and the posters

Done: eleven profiles (`bodyProfiles.ts`) on their bodies: Granny's lavender wagon (a blower, side pipes, flower pots on
the rack), Pete's pizza hatch (a giant slice sign), Tina's wrecker (winch, crane, hook, amber bar), the twins' striped
winged coupe, Frank's fake cruiser (a disco bar, a magenta band, a drawn star), Bernie's party bus (a railed roof deck,
speakers, a disco ball, stripes), Niko's long low lowrider (chrome, pinstripes, the spare on the tail; it hops at a
standstill, the player's and a waiting one), the Nephew's 6.8 m gold limo (stretched, flags), Pip's one-door bubble,
the Ghost's black phantom (`lampsOff`), the Chief's gold-trimmed cruiser. The hideout's back wall: ten posters and the
Chief's either side of yours, rebuilt on a win. Pins M6 4.1–4.2, 5.1–5.3. Verify green (361 tests).

## 2026-09-23 — M6 slice 3: the rivals' twists

Done, each a flag on the duel (DESIGN §14.3): Pete races as the bad driver; a twin 150 m behind the player swaps, out of
the player's sight, into the civilian nearest ahead of them (at most every 12 s), the car races on as the twin, its driver
shakes a fist on the pavement and the radio names it; Fake Frank wears `Traffic.badge` (a hit on him is a hit on a unit:
the police's assault rule, seen, wanted); the party bus overtakes; Niko pulls a scaffold tower down within 10 m while the
player is within 120 m behind (`Breakers.pullAt`); the Nephew's two escort units join the roster at once with the chase
forced (`Police.escort`); the helicopter starts over Pip's race (`Helicopter.overhead`); the Ghost is off both maps.
Pins 3.1–3.9 in `twists.test.ts`. Verify green (356 tests).

## 2026-09-23 — M6 slice 2: the hunt and the Chief

Done: a hunt's rival pulls out 40 m ahead and drives home at 0.85 of their race pace with armour by rank (1.5 → 3; Tina
×2), `Traffic.armour` per record in the police's damage rule (`impactDamage`, one pure function now); the arrow is on
their car; wrecked (by anyone) they pay the purse, their car is won and their bag bursts as 1,500 in the spill's coins;
home first, or 3 minutes, loses. The Chief waits at the bay by the donut shop after the ten: his duel is the escape at
five stars with `Police.summonChief()` putting him on the roster within the second; lost, his cruiser is won. Pins M6
2.1–2.3. Verify green (351 tests).

## 2026-09-23 — M6 slice 1: the wanted board and the race

Done: `sim/board` (the ten rivals and the Chief, `Career`'s lifetime counts from the events, `Board`: the next rival,
requirements, rank, rematches at a quarter); duels as `JobKind` 'duel'. The corners' rings are all taken (three of eleven
fitted), so decided: a rival waits parked at a kerbside bay in their turf (the bay reserved, their car there within 220 m,
never a swap) and a pull-up under 4 m/s inside a 7 m ring starts the race; the rival pulls out as a racer at their rank's
pace and band; first over the line wins the purse (bag), the car (garage) and the place; the rival first or the clock
loses. The goal line follows the board after the chain; BOARD page, ticker news, `?board=n`. Hunts race until slice 2; the
cars are stand-in bodies until 4–5. Pins M6 1.1–1.6; 1.1 placement (39 defs), 1.10 rings, 19.1 bodies, 2.3 goal re-pinned
for the board. Verify green (348 tests).

## 2026-09-23 — M6 slice 0: the garage keeps bodies

Marcin: "Lecisz z M6". Done: the garage owns bodies (`Garage.car/owned/paint` by `BodyId`), upgrades stay per class (a
muscle tier drives the taxi too; tier 0 still the preset bitwise); a car the garage does not own driven through a door is
HOT, kept at 30 % of `BALANCE.bodyPrices` (a taxi 4,200); a hidden car found is owned. CARS: the catalogue's five and
every car kept or found in one scrolling row, `CARS n/14`. Save v3: v2's hidden cars join the owned, the one driven out
becomes the car; the kits, the board and the career reserved. Decided: no SELL / KEEP prompt at a fence (no wall there;
the order pays at the fence, the car can still be kept at a door). Pins M6 0.1, save 0.1b and M6 0.2, 16.2 on bodies; the
store's newer-version pin reads `SAVE_VERSION + 1`. Verify green (342 tests).

## 2026-09-23 — design talk: a new M6, the platform becomes M7

Marcin asked for an idea for a milestone before the platform, the platform becoming M7. Decided (set here, DESIGN
§14): M6 "The board", the police's wanted board of ten named rivals and the Chief, each behind two requirements that
walk the player through the city's activities, beaten in a race or a hunt with a twist that is one of the game's own
verbs, each win taking their car and their item; the garage keeps bodies (28 cars to collect); the driver's kit
(toppers, neon, horns, flame, smoke) travels into every swapped car, the car's kit (wheels, spoilers, stance) stays
home; three more hidden cars. Why: after the chain there is no goal longer than a run and nothing has a face; the
brief's customization is paint and one cone. Contract `docs/M6_PLAN.md` (slices 0–11); `docs/M6_PLAN.md` renamed
`docs/M7_PLAN.md`. Verify green before the edits (338 tests). Next: Marcin's 0.5.5 notes, then M6 on his word.

---

Older entries: M5.5 (its slices, its gate and the overpass note, 2026-09-23) in `docs/history/PROGRESS_M5.5.md`;
M5, M5.1 and Marcin's M5 playtest (2026-09-23) in `docs/history/PROGRESS_M5.md`; the M4 gate and the sessions after it
(2026-09-23) in `docs/history/PROGRESS_M4-gate.md`; M4 (slices 0–8 and the design talks,
2026-09-22 to 2026-09-23) in `docs/history/PROGRESS_M4.md`; M0 through the M3 gate
(2026-09-20 to 2026-09-22) in `docs/history/PROGRESS_M0-M3.md`.
