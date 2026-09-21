# Design notes — the run, progression, the city as a level, and the platform

Written 2026-09-22 between the M3 gate and M4. `docs/BRIEF.md` stays the
source of truth; this file records the design decisions taken on top of it,
so they survive context loss, and names every place where a decision changes
a brief number or a milestone's scope. Status per section is marked
**decided** (Marcin said so on 2026-09-22) or **set here** (my call, noted in
`docs/PROGRESS.md`; he overrides by saying so).

## 1. What the brief fixes and what this leaves alone

Brief §3 is untouched: always in a vehicle, PEGI 12 slapstick, no menu before
gameplay, one seamless city with everything starting in-world, control never
taken away for more than 2 s, keyboard first. The player stays the getaway
driver. What changes is the *shape of a session*: the brief's open world has
no arc; runs give it one without a loading screen.

## 2. The run — decided

A session is a sequence of runs. A run starts at the hideout with heat 0 and
an empty bag, escalates through jobs and free-roam chaos, and ends one of two
ways: the player reaches a drop-off without an active pursuit and banks the
bag with a multiplier, or the police box the player in and the bag is lost.
Totals, then the next run from the same spot in the same city.

### 2.1 Heat and pursuit are two things

- **Heat** is a ratchet: 0–100 points, five thresholds, rises through the run
  and never decays inside it. How badly the city wants you.
- **Pursuit** is a state: the police have you or they don't. Breaking line of
  sight and surviving the level's cooldown ends it and the units withdraw.
  Heat stays, so the next detection (a patrol passing, a speed camera, the next
  job) answers at the current level.

Escaping stays a verb performed every couple of minutes that brings relief;
the run still escalates. HUD: five stars, filled is heat, pulsing red is an
active pursuit. No text.

### 2.2 Coins, bag, bank, and the fine — set here

Coins picked up on the road are the player's at once, always (§3.2).
Everything else earned in a run goes into the **bag**. At a drop-off the bag
lands in the **bank** multiplied by the highest heat reached. Busted pays a
**fine**: the bag lands at half, with no multiplier. The bet is the
multiplier, not the bag: at heat 4 the door pays ×2.2 and busted pays ×0.5,
a four-and-a-half-fold swing, and nobody leaves with nothing.

Why half and not zero. A twelve-year-old who loses ten minutes of earnings to
a roadblock quits; he does not retry. Subway Surfers and Hill Climb Racing
keep every coin on death and top the charts partly for that reason. Full loss
is a roguelite rule for an older audience. Half at ×1 keeps the tension where
the skilled player feels it and keeps the beginner's progress. The lawyer
(§3.4) raises the fine's keep to three quarters.

### 2.3 The cycle

1. Start at the hideout: heat 0, bag 0, in the garage car, drive out.
2. Jobs are markers in the city (brief §4 activities), each with a payout and
   a heat cost: a race adds little, mayhem a lot, a getaway delivery in
   between. Free-roam chaos pays and heats too: police takedowns, billboards,
   speed cameras, the skill chain (§7).
3. Drive to the hideout or a drop-off (§6.3); entry needs no active pursuit.
   The bag lands in the bank multiplied by the highest heat reached.
4. The door closes, the totals, the door opens, heat 0. Same city, no load.

The brief's respray shop and the hideout are one place with one verb: bank
and reset.

### 2.4 Busted

Boxed in by at least two units and under 5 km/h for 3 s, a visible bar
filling so there is always a moment to break out; the bar is an officer
walking up with a ticket book and flooring it mid-walk drains it. The fine
(§2.2); coins and bank kept. A wrecked car never ends the run: swap or the M3 rolling
respawn, as today. `R` under pursuit teleports within line of sight, so reset
is not an escape.

### 2.5 Identity: car-swap ends a pursuit

M3's swap is a pure vehicle change today (`Life.swap`: retune in place, carry
the speed, heal, the fist-shaking driver, one `swap` event). A pursuit
remembers a target descriptor (class + paint) and a line-of-sight state. A
`swap` while no unit has line of sight clears the descriptor and the pursuit
ends at once; a swap in view does nothing. The units then drive to the
descriptor's last known position, the abandoned car, and box it in while its
ex-driver shakes a fist at them: the rule explains itself. Cost: one
condition in M4's detection model.

### 2.6 Heat levels, starting table

| Heat | Response | Breaking the pursuit |
|---|---|---|
| 1 | two patrols, light ramming | 6 s without line of sight |
| 2 | four patrols plus interceptors | 8 s |
| 3 | roadblocks and spike strips at chokepoints, visible from afar; parked patrols at junctions with lights on | 10 s |
| 4 | heavy SUVs, helicopter with a spotlight | lose the helicopter under cover first (§5), then 12 s |
| 5 | everything plus the Chief in a boss car | as 4, 15 s |

Bag multiplier by the highest heat reached: ×1 / ×1.25 / ×1.6 / ×2.2 / ×3.
Roadblocks come from the billboard placer's clear-footprint query on the lanes
ahead and always have a weak point (a sawhorse instead of a car): a skill
check, not a wall. Spike strips are a tuning state (grip drop and a pull),
healed by a swap. All numbers are placeholders for `balance.ts`.

### 2.7 The shape of the decision

Back-of-envelope: one job per heat level, two minutes each, 10k per job.
Capture chance per minute by level 3/8/15/25/40 % for a novice, 1/2/4/8/15 %
for a skilled player. Expected bank by the heat at which the player cashes out:

| Cash out at heat | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| novice | 9k | 20k | 28k | 28k | 18k |
| skilled | 10k | 24k | 42k | 65k | 80k |

The table assumes a full loss; with the fine the novice's curve flattens and
the optimum moves up about one level, which is the intent. The novice's
optimum sits at 3–4 and greed to 5 costs them; the skilled player's optimum
is 5. That property is the point: "one more job or run"
calibrates itself to skill. The balance script prints this table for two
profiles and asserts the optimum rises with skill; the capture rates come from
the bot driving under the police headless, not from guesses.

### 2.8 Pacing and the cold open

Target run: 8–15 minutes. Two or three jobs and a cash-out at heat 2 is the
natural mobile session. The first run is the brief's cold open: 90 s, already
in a pursuit at heat 1 with one delivery, the five verbs through keycaps, the
last caption "get it to the hideout", and totals that show the first new car
is one run away. Route in §6.6.

### 2.9 The hideout door as the results screen — decided

The hideout is a one-room drive-in garage. The door closes behind the car,
the totals appear painted on the wall, the engine idles, any key opens the
door and the player drives out. A cut camera as with the takedown focus. This
is the only interior worth building: a straight box, no ramps. Ad points: §9.

## 3. Audience and progression — set here, revised 2026-09-22

Marcin's challenge: are these activities what players want, and for whom.
Honest answer: the first version of this section was free-to-play mobile
design (three currencies, reputation gates on districts and job types, eleven
income sources). CrazyGames players do not read menus and never forgive a
locked district. Revised around the audience.

### 3.1 Who plays

- **Core:** 11–16, a school Chromebook or a family laptop, keyboard, sessions
  of 5–15 minutes, no account, arriving from a thumbnail and giving the game
  30 seconds. Their reward language is Subway Surfers and Hill Climb Racing:
  coins on the road, a car to unlock, a medal to beat. They want to drive
  fast, crash, be chased by the police and get a new car.
- **Second:** 16–25 wanting GTA or NFS on a machine that cannot run them.
  They get the heat, the bag and the takedowns.
- The design test for every feature: does a twelve-year-old understand it
  from the HUD alone. Stars and coins pass; "reputation" does not.

### 3.2 Two currencies, not three

- **Coins on the road** (Marcin's idea, 2026-09-22; an addition, not a
  replacement for anything). Instanced, one draw call, placed in lines along
  the lanes, in arcs over jumps, in rings around billboards and job markers.
  They mark the suggested line of a time trial and the cold-open route, so
  they are navigation as well as reward. Always kept, never at risk.
- **The bag.** Job payouts, chaos bonuses (police takedowns, cameras,
  roadblocks) and the skill chain. At risk until banked, multiplied by the
  highest heat. The strategist's game sits on top of the kid's game.
- **No reputation.** Unlocks are cash only; every job and every district is
  open from the first run. Discovery is the progression: heat 3 shows
  roadblocks for the first time, heat 4 the helicopter, a first escape from
  heat 5 unlocks the Interceptor.

### 3.3 Earnings (placeholders for `balance.ts`)

| Source | Value |
|---|---|
| coin | 10; about 60 a minute at normal driving |
| billboard, jump, camera | 300–500 into the bag |
| police takedown, roadblock breach | 1,000–1,500 into the bag |
| skill chain | 50–300 per event, multiplier to ×5, banks on a clean end |
| time trial | 3,000 / 5,000 / 8,000 by medal |
| getaway delivery | 5,000–12,000 |
| rampage zone | 6,000–15,000 |

A five-minute novice run: about 3k in coins plus 8k in the bag at ×1.25 is
13k. Cars, cash only: Hatch 10k (run 2, inside the brief's 5–7 minutes), Van
30k, Coupe 60k, Muscle Pro 100k, Interceptor 120k plus one heat-5 escape, GT
160k, the ice-cream truck a hidden car (§8). Upgrades stay three stats × three
tiers as multipliers on the preset; looks stay cash-only and carry the
descriptor; repainting at the hideout is the respray, free. Dailies, the
streak and the two prep items (lawyer, fence) are in §3.4.

### 3.4 Dailies and retention

Three daily challenges in the language of runs ("bank 20k in one run",
"escape from heat 4", "three takedowns in a compact"), refreshed at local
midnight, 3–10k each. A login streak of seven days with rising cash and a
topper on day 7. Preparation items in the garage, one-shot: the **lawyer**
(keep half the bag when busted, 5k) and the **fence** (+50 % bag multiplier
this run, 8k); both are also rewarded-ad offers with these cash prices as the
equal alternative. Save: versioned JSON through the platform's data module,
under 1 MB, `Collectibles.smashed` included.

## 4. Activities — set here

All six brief types ship in M5, plus fares. Ordered by build cost, the cheap
ones first so the city fills early.

1. **Fares** (Crazy Taxi). A pedestrian hails from the kerb; stop alongside
   and they hop in (no on-foot: the ped mesh moves to the passenger seat). A
   big arrow to the destination, a timer, tips for near misses, jumps and
   drifts on the way, the passenger screaming on jumps and cheering a drift.
   Some fares are hot: a crook with a suitcase, double pay, heat rising while
   they ride. A delivered fare extends the timer, so fares chain, as in the
   original. The cheapest job: pedestrians, the event log and the HUD exist.
2. **Getaway delivery**: pick something up, get it to a drop-off under heat.
   The cold-open job.
3. **Time trial on a coin line** with bronze, silver and gold medals (the
   Moto X3M hook): the race type with no AI and the first to ship; the coins
   mark the line, leaving it is allowed, the clock decides.
4. **Street race, point-to-point, free routing** (Burnout Paradise): rivals on
   the bot's lane follower at race speed with a rubber band, the physics body
   near the player. The police join at heat 2 or more.
5. **Takedown rage** and **mayhem** as in the brief, sharing one timed-zone
   rule set and one HUD.
6. **Pursuit escape**: starts the player at a set heat with a bounty for the
   escape, so the heat system has a front door for players who want the chase
   without the build-up.
7. **Stunt and collectible hunts**: jumps with the slow motion, billboards,
   coins, hidden cars.

Every job uses the Crazy Taxi arrow: one big destination arrow over the car,
no map needed. Ghost time-attack against the recorder's pose stream,
order-free checkpoints (Midnight Club) and road rules (Burnout) are the M5
stretch.

## 5. Cover — decided: covered streets in M4, overpasses in M4 after the loop works

The city is flat: `RoadPoint` has x and z only, lanes carry no height, the
chase camera has no occlusion handling, buildings are solid boxes.

- **Covered streets.** A roof and side walls with portal openings over a
  stretch of an existing street: static boxes, no change to the road graph,
  traffic and the bot unaffected. Helicopter line of sight is one `castRay`
  from the spotlight to the car against statics. Needs the camera's first
  occlusion rule (pull in when a static sits between camera and car). One per
  district: an arcade under a frontage row in Crown Heights, a factory gantry
  in Sunset Works, a tree-canopy tunnel over the parkway in Palm Gardens, a
  warehouse pass-through on the Coral Quay.
- **Highway overpasses** at the four avenue crossings. A third dimension in
  the road graph: lanes with height, kinematic traffic at height, the bot
  route, road meshes, markings, the minimap, the city pins. Two or three
  slices that reopen M2; they go after the run loop has proven itself and
  before the helicopter slice, since heat 4 needs them.
- **Multi-storey car park**: backlog, v1.1 (the camera in 3 m ceilings is a
  week on its own).

## 6. The city as a level — set here

The island today: 1,575 × 1,575 m, 49 chunks of 225 m, a perimeter highway
loop, four districts with a landmark each, the avenue, service road, parkway
and quay as authored roads, the Crown Tower junction at the centre.

### 6.1 District roles in the run

| District | Character | Role in the loop |
|---|---|---|
| Crown Heights (NW) | towers, dense grid | home: the hideout under the Crown Tower block; a grid full of escape turns; low-heat jobs (races, deliveries) |
| Sunset Works (NE) | one-floor industry, yards, the Waterworks | mayhem and takedown rage in the yards; gantry cover; a scrapyard drop-off |
| Palm Gardens (SW) | low houses, parks, the parkway, the Glasshouse | races on the parkway curves, stunt jumps on park lots, ghost roads |
| Coral Quay (SE) | the Coral Hotel, promenade, piers | getaway deliveries, the biggest jumps (piers), water as risk; the hotel garage drop-off |
| Highway loop | four lanes each way in paint | the pursuit racetrack: interceptors, roadblocks, spike strips, speed cameras, overpass cover at the avenue crossings |

Difficulty follows the reputation gates: the districts open in the order of
their police response geography, Crown Heights with the most turns and the
weakest patrols, the highway and the Quay with the fastest units.

### 6.2 Reward density

At 60–120 km/h a reward every 20–30 s is one every 400–800 m of road. Fifty
billboards, twenty jumps, ten cameras, about thirty job markers and traffic
near misses over roughly 25 km of road give one point reward per 230 m plus
the continuous chain. The generator places jumps on park lots and the pier
ends, cameras on the highway straights and the avenue, markers at junction
corners so they read from two streets.

### 6.3 Hideout and drop-offs

Three: the hideout in Crown Heights, the Sunset Works scrapyard, the Coral
Hotel garage. Each has one approach street the police can block at heat 3+
and a second, longer way in, so a blocked door is a detour, not a wall.

### 6.4 Chokepoints and cover

Roadblock sites: the four highway on-ramps and the Crown Tower junction, all
visible from 150 m. Cover sites: one covered street per district on the way
from that district's jobs to its drop-off, and the four overpasses.

### 6.5 Navigation

The four landmarks already read from anywhere; the hideout gets a lit sign
visible from the highway. The full-screen map (M5) shows jobs, drop-offs,
cover, cameras and the pursuit's units.

### 6.6 The cold-open route

Spawn on the Crown diagonal heading for the tower junction (the existing
`loop` spawn), already at heat 1 with two patrols behind. A delivery marker
600 m ahead through the junction. On the way: a billboard gate on the footway
(smash), a swap candidate alongside at the junction (swap), a patrol that
lines up for a wall (takedown), the delivery, then "get it to the hideout"
300 m on, with the patrols losing sight in the grid (escape). About 1.5 km,
90 s at 60 km/h, skippable, never shown twice.

## 7. Free-roam scoring — set here

- **Skill chain** (Forza Horizon): near misses, drifts, airtime and oncoming
  build a combo multiplier; the chain banks into the bag when it ends cleanly
  and a wall hit loses it. Free with the M3 event log.
- **Speed cameras and speed zones**: a flash is heat plus a bag bonus
  proportional to the speed over the limit.
- **Stunt jumps** reuse the M3 slow motion and camera focus.

## 8. Ideas from other games, placed

| Idea | From | Cost | Where |
|---|---|---|---|
| Pursuit breakers: smashable props that drop a static onto the road behind the player (scaffold, water tower, petrol canopy); police crash or reroute, doubles as cover | NFS Most Wanted | medium | M4 stretch |
| Hidden cars in the city: a swap into a stashed car unlocks it | Forza Horizon barn finds | low | M5 (the ice-cream truck) |
| Fares with hot passengers and the chained timer | Crazy Taxi | low | M5 (§4) |
| One big destination arrow over the car for every job | Crazy Taxi | very low | M5 |
| Police withdraw to the nearest donut shop when a pursuit ends; the shop is a marker building, the units path to it and park | mine | very low | M4 polish |
| A news ticker at heat changes ("a red muscle car is terrorizing Crown Heights"), one line, no voice | mine | very low | M4 polish |
| A wanted poster on the hideout wall showing the car the police are looking for; teaches the identity rule without text | mine | very low | M4 |
| Daily seed: the police layout (roadblock sites, patrol routes, the Chief's car) from the date, with the daily challenges on it | mine | low | M5 |
| A speed-camera flash shows the "photo" (a HUD card with the car's paint, the speed and the fine) | GTA, real life | low | M5 polish |
| A giant ball in a plaza, one dynamic sphere | Rocket League | very low | M5 free-roam toy |
| Body crumple by vertex displacement on the low-poly mesh | BeamNG, Wreckfest | low, render only | M5 polish, thumbnail value |
| Derby in a park lot: eight cars, last one rolling | Wreckfest | low-medium | v1.1 |
| Crash mode: bounce the wreck with boost taps for cash | Burnout Showtime | low-medium | v1.1 |
| Cop mode: "the suspect is a red muscle car", catch and stop it, same descriptor and pursuit systems from the other side | Chase HQ, GTA vigilante | medium | first post-launch update |
| Asynchronous rivals: a friend's ghost on a road | Autolog | needs a backend | post-launch |
| Cops vs robbers multiplayer | — | netcode and a server | v2; the fixed step is all that is designed now |

Tonal reference: **The Simpsons: Hit & Run**. Car-only, slapstick, a damage
meter that forces a swap, collectibles, a "hit and run" meter that is this
heat system by another name. Driver: San Francisco is the swap's lineage.

## 9. What success on CrazyGames means and how the design serves it

The Basic Launch KPIs (`docs/CRAZYGAMES.md` B2, M4): average play time 10+
minutes, day-1 retention 10–15 %, conversion (at least one minute played)
80 %+. Driving games average 8.7 min and 5.7 % D1; top titles show 7 ad
impressions per play. Strong KPIs are what moves a game to Full Launch and
onto the front page.

- **Conversion** is decided in the first 20 seconds: time to control (2.7 s
  today), the cold open in a live pursuit, no menu, no text, a thumbnail and
  a first frame with the takedown in it. The screens run at all ten sizes is
  part of this, not QA trivia.
- **Play time** is the run: 8–15 minutes with a climax, "one more run" at the
  door, the daily challenges visible on the wall. Sessions end at a door, not
  mid-chase.
- **Retention** is the save through the SDK data module, the streak, the
  unlock cadence (something new every 5–10 min in the first hour), the
  Interceptor and cop mode as later reasons, and updates after launch
  (updated games get re-featured).
- **Rating** is no crashes, Chromebook performance, legibility at every size,
  and controls that explain themselves.
- **Revenue** is the door and the busted flow (midgame, the SDK paces at one
  per 3 min) and the rewarded offers (prep items in the garage, "double the
  bag" at the door). One ad at most per door: the rewarded offer when the bag
  is above a threshold, else the midgame request. Never during driving, never
  on a navigation button, mute on `adStarted`, no reward on `adError`.
- **Discovery** is the title, the cover and the tags: car, police chase, open
  world, driving, 3D. The description leads with the fantasy in one line.
- **Mobile** is M6: touch, the mobile tier, under 20 MB (3.5 MB today) for
  the mobile homepage.

## 10. Engineering constraints

- **Body pool.** Traffic has 16 dynamic bodies. Police must ram, so they are
  bodies. Heat 4–5 is eight or more units from the same pool on the low tier:
  a unit budget per level, police priority in the pool, and the wreck
  tow-away become prerequisites.
- **Presets.** Sports and police are new; the police car is a class tuned for
  ramming.
- **Cash.** The whole M3 economy pays boost; `balance.ts` starts in M4.
- **Traffic step.** 0.3 ms per step in Node with 48 agents; profile in the
  browser before adding police agents.
- **Highway lanes.** One graph lane per direction with sub-lane offsets;
  roadblocks and police on the highway want the real lanes (decision 14).
- **Cover** needs the camera occlusion rule and the line-of-sight ray.

## 11. Milestones as they stand now

- **M4 Heat**, slice order: 0 housekeeping (screens inspection, wreck
  tow-away, traffic step profile in the browser, the sports and police
  presets, real highway lanes); 1 heat and pursuit as two systems with
  patrols at level 1; 2 police units per level with the pool budget,
  interceptors, ramming; 3 busted with the bar, the hideout door, bag and
  bank with the multiplier, `balance.ts`; 4 the identity rule and the police
  chasing the old car; 5 roadblocks, spike strips, parked patrols, speed
  cameras; 6 covered streets and the camera occlusion rule; 7 overpasses; 8
  the helicopter and the Chief; 9 ad points through the adapter, the gate.
  Free-roam chaos alone fills the bag in M4.
- **M5 The game**: jobs (§4), the garage and progression (§3), save, dailies,
  the cold open (§6.6), the skill chain, the full map, the balance script
  with the EV assertion and the bot as the capture probe, UI and audio passes.
- **M6 Platform** as in the brief.

## 12. Playtest watch list

- Is busted legible and fair: the bar, a clear last moment to break out; does
  the fine read as fair, or does the beginner still quit.
- Do players go above heat 2 at all; if not, multipliers up or level 3 down.
- Does "the pursuit ended but the heat stayed" land through the HUD alone.
- Does a run stay under 15 minutes.
- The ratchet's risk: two accidental takedowns early put roadblocks on a race
  the player wanted to run calmly. Quiet heat until re-detection is the
  mitigation; watch whether it is enough.

## References

Burnout Paradise (free-route races, road rules, showtime), Need for Speed
Most Wanted 2005 (pursuit breakers, heat levels), Need for Speed Hot Pursuit
2010 (police in races), Midnight Club (order-free checkpoints), Forza Horizon
(skill chains, speed zones, barn finds), The Simpsons: Hit & Run (tone),
Driver: San Francisco (the swap), Chase HQ (suspect pursuit), Wreckfest
(derby), Trackmania (ghost time-attack).
