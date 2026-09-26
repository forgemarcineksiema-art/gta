# Progress log, M7 (archived at the M8.5 gate)

Moved from `docs/PROGRESS.md` at the M8.5 gate (2026-09-24), which closed M8's too: the M7 design talk, slices 0–13 and its gate. Newest first.

## 2026-09-24 — M7 gate: the numbers

**Suites.** `verify:gate` green (431 tests, 157 s, smoke 60 fps); on the final build `verify` green (360 tests in
46 s), `game` 14/14, `screens` 51/51 with the new wall check, `life` 4/4 (51.5 fps; red twice before at a frame p95
of 33.4000000000015 against < 33.4), `balance` green; `heat` 10/10, `city` 5/5 (control 3.93 s; tours 89 / 204k
low, 116 / 279k high), the boot loop 200 of 200 (p95 0.95 s). Version 0.7.0.

**Fixed at the gate.** The screens' images showed the news over the wall (over BANKED and its tabs at 800x450, over
STYLE's tabs wherever that page fills the height) and the stars over its corner at 800x450: the news now waits behind
a shut door (`arrangeTop`'s wall), the stars hide there with the bag and the coins, and the suite checks the wall's
states. The perf A/B's draw attribution found three draws a frame for nothing in
0.7.0 (the drop-offs' signs merged over the city, never culled; the empty skid ring) and up to fifteen in both
versions (instanced meshes with no instances: the police's liveries, the coins' pools, the debris): hidden while
empty (pins M7 4.3, G.3). The prices refitted on the careful novice (below).

**Perf A/B** (MX330, 4× CPU, `?quality=low`, alternating; the rows in docs/history/M7_REPORT.md): the protocol's first pairs
read −6.0 / −4.6 / −5.8 fps because 0.6.0's bot queues 25 s on the northern avenue in all three (cheap frames) while
0.7.0's traffic flows; on the same drive (the car teleported to 40 tour points: the chunks draw the same 20.5 a frame)
and in the fair runs (no traffic: +2.7 / −0.9 / +1.1; the first 20 s: +4.0 / −5.6 / +6.3) and the final build's
protocol (+2.5 / −1.7 / −2.1) 0.7.0 is 0.6.0's speed inside ±3, not the +2 expected. Traffic mean 1.83–1.95 ms against
2.35–2.95 (the 1.6 not reached); frames over 50 ms after 5 s 7–22 a run (0.6.0 as many, counted alike: 10 against
14); frame p95 33.4 against 33.3–33.4; heap 48 MB in the final runs.

**Balance** (129 s): the inputs moved with the careful novice (slice 10's D8), so the prices were refitted as the plan
asks: the compact 24,000 (18,000), the van 30,000 (20,000), the tiers 24,000 / 26,000 / 30,000 (15 / 17 / 21k); the
multipliers stay. Its bag is 3,647 a minute against the M6 gate's 1,157: its skill chains pay 4,660 in three minutes
at seed 42 against the plain bot's 860.

```
busted a minute (seeds 42 / 7 / 123): novice 0.44 / 0.33 / 0.33 / 0.67 / 0.33, skilled 0.11 / 0.56 / 0.56 / 0.22 / 0.22
bag 3,647 a minute (3,087 / 4,410 / 3,443), coins 150; job mean 7,018
expected bank a run: novice L1 8.1k  L2 12.0k  L3 13.2k  L4 13.0k  L5 11.0k (best L3)
                     skilled L1 12.2k  L2 18.4k  L3 20.0k  L4 21.7k  L5 19.1k (best L4)
the novice's first hour at L3 (runs of 2.6 min banking 13.2k): 6.7 compact · 12.0 tier 1 power · 14.6 kit · 17.2 heavy
  · 22.4 tier 1 grip · 25.1 kit · 27.7 tier 2 power · 30.3 kit · 32.9 tier 1 boost · 35.5 kit · 38.1 tier 2 grip
  · 40.8 kit · 43.4 tier 3 power · 46.0 kit · 48.6 tier 2 boost · 51.2 kit · 56.4 tier 3 grip · 59.1 kit
three cars at minute 17.2; something to see every 5.2 / 7.9 / 2.6 / 7.9 / 5.2 / 5.2 / 5.2 / 5.2 / 5.2 / 7.8 min
```

## 2026-09-24 — M7 gate: the long pins

`verify:gate` found six long pins red on the slices' traffic. Fixed in the game: a unit passing on the oncoming side
ends its pass 20 m before its lane's end and starts one only with room to (`PASS_CLEAR_OF_JUNCTION`; a unit still
out there took its U-turn from the oncoming side across the front of the car it passed); Granny Gears at 0.45 of
her pace (at 0.66 the plain bot still lost all three: its 1,158 m take 90–100 s behind traffic it never passes; now
it wins two of three, the careful bot three). Re-pinned, each with its reason in the file: the lane holding skips a
car blending back (slice 8, `Traffic.blending`); the same-lane spacing binds cars that overlap across the lane (a
pull-over and the standoff put two side by side by design); the police roster pin holds its level (the beat's
crimes took it from 2 to 3) and reads the roster over the run, not at its last step (a bust at 41 s read the
refill); G.1 asks three of three of the careful bot and one of the plain. Tried and dropped: braking chasing units
for U-turns (it cost the Chief his PIT). `verify:gate` green: 431 tests (159 s), smoke 60 fps.

## 2026-09-24 — M7 slice 13: the rivals' leftovers

Done: Granny Gears at three quarters of her pace (0.66, easing to 0.6 when ahead): at 0.88 she beat the careful bot
once in three and the plain one every time; G.1 now asks the careful bot for three of three and the plain one for one
(gate). Until the next rival is ready their car cruises their district in the traffic (`Board.tease`): placed out of
sight 120–260 m away, flagged a rival's (never a swap), routed at every junction to lanes whose both ends are the
district's own, named by the ticker the first time the player sees it near, removed out of sight once they are
ready. Off in the test helper's worlds (the bot pins' traffic predates it). The sweeper's brushes turn while it moves.
Pins M7 13.1, 13.2. Verify green (359 tests).

## 2026-09-24 — M7 slice 12: the maps and the wall

Done: `cityFootprints()`: the generator's lot decisions now come from one plan (`City.plan`, the same random stream;
the layout hash unchanged), so the big map draws the built blocks, the parks and the shallows under its roads from
the plan, built the first time the map opens. The radar's north up shipped with the settings (slice 3). The wall's
CARS and STYLE pages are grids (`ui/wallGrid.ts`): A/D along a row, W a row deeper, S a row back and from the first
row out to the tabs; the handbrake (or Enter) takes the card, since W and S now move (the plan named no confirm key);
the far corner of STYLE is 13 presses, not 58. game.spec's garage-by-keys case buys with the handbrake (gate).
Pins M7 12.1, 12.2. Verify green (357 tests).

## 2026-09-24 — M7 slice 11: the city's look

Done: the authored roads' frontage lots are computed once a road (`City.frontage`), so the first and last lot of each
side are corner shops (a shop's ground floor on the road and on the junction side, the fascia in the accent) and the
lot nearest each avenue's middle is its landmark (taller, its own colour, a lit roof sign, corner bands; four roads).
The parkway gives way at its merges (a double broken line 0–2.5 m past it) instead of a stop line 112 m out; a
quarter of the road paint is worn in 36 m stretches; each drop-off has a lit sign on an 11 m pole, seen up its street
from the ring (the plan's "nearest deck" sees it over two blocks of buildings; the street's mouth is where a driver
looks). Colliders, billboards and coins unchanged (hashed). Pins M7 11.1–11.3. Verify green (355 tests).

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
try, far parked cars kept out of the traffic. Contract `docs/history/M7_PLAN.md` (slices 0–14); `docs/history/M7_PLAN.md` renamed
`docs/history/M8_PLAN.md`. Verify green before the edits (374 tests). Next: his 0.6.0 notes, then M7 on his word.
