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

**The pitch in one line — decided 2026-09-22.** You are the getaway driver
who never keeps a car: steal, wreck, swap, escape, bank. The brief's four
references describe the feel; this sentence is the identity, and it goes on
the cover, at the top of the store description and into the first 20 seconds
of play. The swap leads, because it is the one mechanic no other city driving
game on the platform has.

## 2. The run — decided

A session is a sequence of runs. A run starts at the hideout with heat 0 and
an empty bag, escalates through jobs and free-roam chaos, and ends one of two
ways: the player gets through a drop-off's door, pursuit or not, and banks
the bag with a multiplier (§2.3), or the police box the player in and the
bag lands at half with no multiplier (§2.2, §2.4). Totals, then the next run
from the same spot in the same city.

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
lands in the **bank** multiplied by the highest heat at which the police had
the player (§2.6). Busted pays a
**fine**: the bag lands at half, with no multiplier. The bet is the
multiplier, not the bag: at heat 4 the door pays ×2.2 and busted pays ×0.5,
a four-and-a-half-fold swing, and nobody leaves with nothing.

Why half and not zero. A twelve-year-old who loses ten minutes of earnings to
a roadblock quits; he does not retry. Subway Surfers and Hill Climb Racing
keep every coin on death and top the charts partly for that reason. Full loss
is a roguelite rule for an older audience. Half at ×1 keeps the tension where
the skilled player feels it and keeps the beginner's progress. The lawyer
(§3.4) raises the fine's keep to three quarters.

**The bag spills on a wreck — decided 2026-09-22.** The rings rule from
Sonic: when the player's car is wrecked, a share of the bag (30 % to start)
bursts out as coins laid along the lane ahead of the wreck, and they vanish
after ten seconds. A swap or the rolling respawn drives straight through
them; what is picked up goes back into the bag. This is the risk that does
not depend on the police: a twelve-year-old reads it the first time, the
strategist gets a reason to drive clean at heat 1–2, and the scene is
slapstick. Busted still takes half; a wreck takes what you fail to scramble
back. Numbers in `balance.ts`; built in M4 slice 3 with the coins.

### 2.3 The cycle

1. Start at the hideout: heat 0, bag 0, in the garage car, drive out.
2. Jobs are markers in the city (brief §4 activities), each with a payout and
   a heat cost: a race adds little, mayhem a lot, a getaway delivery in
   between. Free-roam chaos pays and heats too: police takedowns, billboards,
   speed cameras, the skill chain (§7).
3. Drive to the hideout or a drop-off (§6.3). Entry is always allowed
   (revised 2026-09-22, decided: back to the brief, where reaching the
   respray shop is itself an escape). The door takes 3 s to close behind a
   car that pulls in, and busted still counts inside it: two units at the
   door before it shuts, and the run ends on the threshold. The player keeps
   the wheel the whole time (brief §3, never more than 2 s without
   control): reversing back out over the door line cancels the closing, so
   the last-second bail-out is always there (set here, 2026-09-22). The bag
   lands in the bank multiplied by the highest heat at which the police had
   you (§2.6).
4. The door closes, the totals, the door opens, heat 0. Same city, no load.

The brief's respray shop and the hideout are one place with one verb: bank
and reset. Why the door is an escape and not a test: the earlier rule
("entry needs no active pursuit") turned every door into a skill check,
and a novice at heat 3 who cannot shake the patrols could never bank, only
wreck or get busted. The brief's version is kinder and more getaway: you
dive in, the door drops, the cruisers scream past. The 3 s door keeps the
tension where it belongs: the last hundred metres with sirens closing, the
door crawling down, the bar filling. It is the climax of every run and the
police comedy in one shot.

### 2.4 Busted

Boxed in by at least two units and under 5 km/h for 3 s, a visible bar
filling so there is always a moment to break out; the bar is an officer
walking up with a ticket book and flooring it mid-walk drains it. The
police make the box themselves: a player who slows under ~22 km/h is
surrounded (§2.10), so stopping near them is the risk, not bad luck. The fine
(§2.2); coins and bank kept. A wrecked car never ends the run: swap or the M3 rolling
respawn, as today, minus the spill (§2.2). `R` under pursuit teleports within line of sight, so reset
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

**The disguise — decided 2026-09-22.** A police car is a car, so `E` beside
a unit takes it, and the unit's driver stands in the road shaking a fist.
While the player drives a police-liveried car and no unit has seen a crime
from it, patrols do not detect the player at all: they pass, parked patrols
sit still, the stars stay quiet. The first crime event (takedown, billboard,
camera, ram) with a unit in line of sight blows the disguise: the descriptor
becomes "police saloon" or "interceptor" and the pursuit runs as usual. Heat
still rises for every crime, seen or not. One more condition in detection,
and the best joke in the game: escaping the police in their own car. Watch
item in §12. The swap prompt reads BORROW instead of SWAP when the candidate
is a police car (set here, 2026-09-22): the disguise has to be discoverable
without a tutorial line. The dispatcher notices the missing unit 30 s after
the theft and the cover is blown (set here 2026-09-22 on the slice-5
measurement, §12).

### 2.6 Heat levels, starting table

| Heat | Response | Breaking the pursuit |
|---|---|---|
| 1 | two patrols, light ramming | 6 s without line of sight |
| 2 | four patrols plus interceptors | 8 s |
| 3 | roadblocks and spike strips at chokepoints, visible from afar; parked patrols at junctions with lights on | 10 s |
| 4 | heavy SUVs, helicopter with a spotlight | lose the helicopter under cover first (§5), then 12 s |
| 5 | everything plus the Chief in a boss car | as 4, 15 s |

Bag multiplier by the highest heat at which the pursuit went active, not
merely reached (revised 2026-09-22, decided): ×1 / ×1.3 / ×1.65 / ×2.6 /
×3 (fitted by the model's quick half, M7 slice 10, §2.7; ×1.25 / ×1.6 /
×2.2 before). The disguise (§2.5) made "reached" exploitable: a cruiser, billboards
and cameras with no witness, heat 5 without a single chase, the door at ×3.
Now the city has to have seen you at that level; a crime nobody saw raises
the stars but not the bounty. On the HUD the multiplier jumps when the
stars pulse red at a new level, which is the legible version of the rule.
Roadblocks come from the billboard placer's clear-footprint query on the lanes
ahead and always have a weak point (a sawhorse instead of a car): a skill
check, not a wall. Spike strips are a tuning state (grip drop and a pull),
healed by a swap. All numbers are placeholders for `balance.ts`. At launch
levels 4 and 5 have no helicopter (§5): heavy SUVs and the Chief on the
ground, and breaking the pursuit is the cooldown alone, 12 and 15 s.

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

The model's quick half (M7 slice 10, set here): the table and the first hour
run apart from the bots (`tests/sim/model.ts`), on the last gate's measured
inputs, in a second; the bots measure at the gate. A level's police have
everything the level below has, so the model pools the measured rates where
they fall with the level (three seeds of three minutes count busts in ninths:
the M6 gate's novice was caught 0.78 a minute at level 2 and 0.44 at 3). On the
M6 gate's inputs, with the multipliers of §2.6 and the prices of §3.3, the
novice's best door is level 2 (6.9k a run of 2.4 minutes) and the skilled
driver's level 4 (4.8k / 6.6k / 6.9k / 7.2k from level 1); the compact at
minute 6.3, a purchase every 4.8–7.2 minutes, something to see every 7.2 at
most. The gate's novice is the careful bot, which waits at lights and drives
round a queue like a cautious player.

### 2.8 Pacing and the cold open

Target run: 8–15 minutes. Two or three jobs and a cash-out at heat 2 is the
natural mobile session. The first run is the brief's cold open: 90 s, already
in a pursuit at heat 1 with one delivery, the five verbs through keycaps, the
last caption "get it to the hideout", and totals that show the first new car
is one run away. Route in §6.6.

Build order — decided 2026-09-22: the cold open is prototyped in M4 right
after slice 3, not in M5. Conversion is decided in the first 20 seconds, and
after slice 3 everything the first version needs exists: a patrol behind the
player, the bag, the door. The prototype adds the delivery marker, the route
and the keycap captions, and from then on it is played by hand every session,
so that no later slice is tuned against a first minute that does not exist.

### 2.9 The hideout door as the results screen — decided

The hideout is a one-room drive-in garage. The door closes behind the car,
the totals appear painted on the wall, the engine idles, any key opens the
door and the player drives out. A cut camera as with the takedown focus. This
is the only interior worth building: a straight box, no ramps. Ad points: §9.
Two additions, set 2026-09-22: the multiplier the run is currently earning
sits on the HUD beside the bag for the whole run (`×1.6`), rising when the
police see you at a new level (§2.6), which is the entire "one more level"
pull without a word of text; and the wall shows one line of the run's
counts under the totals (jobs, takedowns, escapes, billboards, coins), so a
run reads as a story and not only as a sum. The door itself is the run's
last beat (§2.3): 3 s to close, busted live until it shuts, the camera
already cut to the interior so the sirens are heard and not seen.

### 2.10 The police brain — set here, 2026-09-22 (Marcin's playtest)

Marcin, after playing slice 3a: being busted took long minutes of sitting
beside the police, the units took ages to work out what was happening, and
a light touch wrote a police car off; go strongly into police intelligence,
reactions and capabilities. Measured before any change: every police wreck
in nine bot minutes was a nudge that failed the old settle test, and a
player stopped at heat 2 was never busted in 90 s. What the police do now,
in the order a chase meets it:

- **Chase.** Route to where the player will be in 1.2 s; close in and shove
  a fast player (the saloon's ram, the interceptor's PIT). Unchanged.
- **Cut off.** From heat 2 every second saloon routes to where the player
  will be in 4 s, so units come from ahead as well as from behind.
- **Arrest.** A player under ~22 km/h is boxed: the units within 60 m take
  the slots behind, ahead and beside the player (a slot behind a wall is
  skipped), drive straight there braking to arrive at walking pace, round
  the player's car rather than through it, and hold; the rest stand by
  behind. Two in reach fill the busted bar. A player who floors it away
  (over ~32 km/h) is chased again.
- **Search.** Sight lost, the units drive to the last fix and fan out, a
  different exit each at the junctions there, until the escape timer runs
  out. Escaping is breaking sight and getting away from where you were
  seen, not only breaking sight.
- **React.** A police car the player hits while nobody is chasing notices
  at once and it costs 4 heat: bumping a cop is a crime.
- **Take a hit.** Every car keeps a damage value; a nudge dents, it does
  not kill, and a shoved car drives back onto its road. Police cars carry
  armour (1.6×: harder to shake, harder to write off, and the takedown
  slam has to be harder by the same factor); a police car written off by
  accumulated damage inside the takedown window is still the player's
  takedown.

What comes next is already in the plan and builds on this: roadblocks,
spike strips and parked patrols at level 3 (M4 slice 6), heavies and the
Chief at 4–5 (slice 7), the swap escape with the units boxing the
abandoned car (slice 5). Mine, not yet placed, for when the KPIs ask for
more police: civilians pulling over for a unit with its lights on (units
arrive faster through traffic), radio chatter as a sound layer that names
the car the police are looking for, and a unit that lost the player
parking at the last fix with its lights on as a visible "they are looking
here".

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
  replacement for anything). Instanced, one draw call, laid as lines that
  say something (§3.5, 2026-09-23; since his second verdict the same day
  only at goals and along a job's route, §13.5): runs and weaves along the lanes, links
  through turns, arcs over jumps, gate lines through billboards; rings round
  job markers join in M5. They mark the suggested line of a time trial and
  the cold-open route, so they are navigation as well as reward. Always kept, never at risk. Built
  in M4 slice 3 with the bag, not in M5 (decided 2026-09-22): they are the
  twelve-year-old's reward layer and the cheapest one. Boost is a means and
  the bag is a number; without coins M4 has nothing visible every 20–30 s.
- **The bag.** Job payouts, chaos bonuses (police takedowns, cameras,
  roadblocks) and the skill chain. At risk until banked, multiplied by the
  highest heat. The strategist's game sits on top of the kid's game.
- **No reputation.** Unlocks are cash only; every job and every district is
  open from the first run. Discovery is the progression: heat 3 shows
  roadblocks for the first time, heat 4 the heavy units (the helicopter
  joins in update 1, §5), a first escape from heat 5 unlocks the police car
  (the Interceptor of §3.3; at launch the police saloon, `docs/M5_PLAN.md`
  D13).

### 3.3 Earnings (placeholders for `balance.ts`)

| Source | Value |
|---|---|
| coin | 10, the cap a line ends on 50; 32–40 coins a minute worth 426–564 for a driver who ignores the lines (§3.5) |
| billboard, jump, camera | 300–500 into the bag |
| police takedown, roadblock breach | 1,000–1,500 into the bag |
| skill chain | 50–300 per event, multiplier to ×5, banks on a clean end |
| time trial | 3,000 / 5,000 / 8,000 by medal |
| getaway delivery | 5,000–12,000 |
| steal-to-order | 4,000–10,000, minus 10 % per damage stage on the delivered car |
| wreck spill | 30 % of the bag as coins ahead of the wreck, 10 s to recover |
| rampage zone | 6,000–15,000 |

A five-minute novice run: about 3k in coins plus 8k in the bag at ×1.3 is
13k. Cars, cash only (the prices fitted by the model's quick half, M7 slice
10, §2.7, refitted at the M7 gate on the careful novice's 13k a run of 2.6
minutes): the compact 24,000 (the second run's door after the cold open, at
minute 6.7, inside the brief's 5–7), the van 30,000, the sports car 60,000
(the second hour's goal), the police car 120,000 plus one heat-5 escape; the
hidden cars are found, not bought (§8). Upgrades stay three stats × three
tiers as multipliers on the preset, 24,000 / 26,000 / 30,000 a tier, two or
three runs each; looks stay cash-only and carry the descriptor; repainting at
the hideout is the respray, free. Dailies, the
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

### 3.5 The coin layer as lines — set here, 2026-09-23 (Marcin's playtest); the layout superseded by §13.5 the same day

Marcin after the M4 gate: the coins are placed "hopelessly and thoughtlessly",
and their look and the moment of picking one up could be much better. What
shipped in slice 3b was a carpet: runs of 8–12 at random along every directed
lane, so a highway carriageway carried four unsynchronised dotted lines, one
of them beside the double yellow, and no line began or ended anywhere; thin
orange discs the colour of the cones, gone edge-on twice a spin; a pickup
that blinked the coin out of the list. Redesigned in one slice, sim, view,
HUD and audio together.

**A coin line is a sentence.** It starts, it has a shape, and it ends on a
bigger coin, the **cap** (worth five), at the thing it pointed at. Never a
carpet: a road carries one figure (a street's two directions share it; the
ring's carriageways are two roads), and every figure comes from the city
seed, so the layout is the same for every player and the M5 time trial on a
coin line is a route, not a lottery. The figures:

| Figure | Where | What it says |
|---|---|---|
| run | the lane's centre, 8–12 coins at 4.5 m | rhythm: a scale on the bell while you hold the line |
| weave | out to the oncoming lane over three coins, held, back | dodge the traffic for it (the near-miss pays the bag as well) |
| link | the lane's last 18 m, the junction curve, the next lane's first 13.5 m | turn here: the trails' navigation |
| sweep | three stretches on each authored bend, cutting to the inside by the local curvature (left onto the oncoming lane, right to the kerb) | the racing line |
| gate | from the lane it stands beside, out onto the footway, through the panel (the cap), back to the road inside 22 m | this billboard, and you are back before the street tree |
| hook | off the ring's outer lane on a 30 m radius, through the verge panel (the cap), two coins into the run-out | leave the highway for it |
| arc | three up the ramp's face, the flight of a car launched at 97 km/h, the cap on the landing | jump, and jump fast: a coin in the air needs the car in the air |

The layout: ten **trails**, random walks of eight lanes with a run or a weave
on each and a link through every turn taken (a turn twice as likely as
straight on, never a U-turn, one link per junction and per lane entered);
fillers on about half of the roads left; sweeps on every bend; a gate line
through every billboard; an arc over every ramp. Every lane keeps a **gate
window** clear (the placer picks the panel's slot against the chunk's statics
at generation time, so the layout cannot know which side it lands on; it
keeps both directions' windows free of runs, weaves and link heads, and a
weave also keeps the oncoming lane's). The island carries about 2,300 coins
(2,405 / 2,303 / 2,344 for seeds 42 / 7 / 123), 400 of them the gate lines,
100 in the air. Numbers in `balance.ts` `coin`.

**The catch.** The pickup box reaches a metre past the bumpers and 1.2 m past
the doors, 1.5 m up and down about the bonnet: a line a metre off the car's
path still pays, the adjacent lane's does not. In the view the picked coin
flies into the bonnet in 0.16 s, swelling a little and shrinking to nothing as
it lands; the counter pops once per coin and flashes gold on a cap; the bell
climbs a semitone per coin while they keep coming and a cap adds a fifth that
rings on. No sparkle, no burst: the car catches the coin, that is the whole
effect (Marcin's taste: no generic VFX).

**The look.** Gold (`PALETTE.coin`, the one palette colour the HUD's accent
shares, because the glyph on the counter and the coin on the road must be
one thing), an octagonal prism a metre across and 16 cm thick standing on
edge at bonnet height, lit from within so it never goes dark in shadow,
spinning with a per-coin phase so a line ripples away from the player at
about 30 m/s and bobbing 6 cm. The cap is half as big again; the spill's
coins stay white and bigger still.

Measured with the novice bot (lane centres, no intent), five minutes from
heat 0, traffic on, seeds 42 / 7 / 123: 39 / 32 / 40 coins a minute worth
534 / 426 / 564 a minute; the carpet gave 42–53 coins worth 420–530. So the
economy of §3.3 holds for a player who ignores the lines, and a player who
follows them earns more: the caps are a third of the take.

## 4. Activities — set here

Three ship at launch: getaway delivery, steal-to-order and pursuit escape
(§11, decided 2026-09-22; steal-to-order replaced the time trial the same
day, because it is cheaper and it is the only job that sells the swap). The
time trial, street races with rivals, takedown rage, mayhem, the hunts and
fares follow in the second post-launch update. The list is ordered by build
cost, the cheap ones first so the city fills early.

0. **Steal-to-order** (Gone in 60 Seconds; decided 2026-09-22). The marker
   is not a place but a car: "wanted: a cyan compact, no scratches, four
   minutes". Traffic already spawns every class in a fixed set of paints, so
   the player hunts the city for one, swaps into it, and brings it to the
   drop-off; the payout falls by 10 % per damage stage on the delivered car
   and the timer runs from the swap. It uses swap, damage, traffic paints,
   heat and the hideout, all of which exist, and needs only a marker with a
   descriptor and a delivery condition. The one job in which the swap is the
   goal, not the tool: the identity of the game as a job.
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
   Moto X3M hook): the race type with no AI and the first race in update 2;
   the coins mark the line, leaving it is allowed, the clock decides.
4. **Street race, point-to-point, free routing** (Burnout Paradise): rivals on
   the bot's lane follower at race speed with a rubber band, the physics body
   near the player. The police join at heat 2 or more.
5. **Takedown rage** and **mayhem** as in the brief, sharing one timed-zone
   rule set and one HUD.
6. **Pursuit escape**: starts the player at a set heat with a bounty for the
   escape, so the heat system has a front door for players who want the chase
   without the build-up.
7. **Stunt and collectible hunts**: jumps with the slow motion, billboards,
   coins, hidden cars. The twenty stunt jumps themselves are v1 content
   (brief §4) and ship in M4 slice 6 (decided 2026-09-22): ramps placed by
   the generator on park lots and pier ends, airtime paid into the bag with
   the M3 slow motion; they are the cheapest reward in free roam. The hunt
   (a counter and a reward for all twenty) is update 2.

Every job uses the Crazy Taxi arrow: one big destination arrow over the car,
no map needed. Between jobs it does not vanish (set here, 2026-09-22): dimmed,
it points at the nearest marker, and at the hideout once the bag is above the
door offer's threshold, so nobody wanders and the run's exit is pointed at
exactly when it is worth taking. Ghost time-attack against the recorder's pose stream,
order-free checkpoints (Midnight Club) and road rules (Burnout) are the M5
stretch.

## 5. Cover — revised 2026-09-22: cover, overpasses and the helicopter are the first post-launch update

Decided on 2026-09-22 (Marcin, on the launch-scope recommendation in §11):
covered streets, the highway overpasses and the helicopter leave M4 and form
the first update after Basic Launch. They are the three most expensive M4
slices (the overpasses reopen M2, cover needs the camera occlusion rule, the
helicopter needs both), they gate only heat 4–5, and the three KPIs are
measured live from Basic Launch, where an update gets the game re-featured.
Heat 4 and 5 ship on the ground: heavy SUVs and the Chief, the cooldown as the
only escape. The contracts below and in `docs/M4_PLAN.md` (post-launch
section) stand for that update.

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
| Sunset Works (NE) | one-floor industry, yards, the Waterworks | mayhem and takedown rage in the yards; gantry cover (update 1); a scrapyard drop-off |
| Palm Gardens (SW) | low houses, parks, the parkway, the Glasshouse | races on the parkway curves, stunt jumps on park lots, ghost roads |
| Coral Quay (SE) | the Coral Hotel, promenade, piers | getaway deliveries, the biggest jumps (piers), water as risk; the hotel garage drop-off |
| Highway loop | two lanes each way, real graph lanes since M4 slice 0 | the pursuit racetrack: interceptors, roadblocks, spike strips, speed cameras, overpass cover at the avenue crossings (update 1) |

Every district is open from the first run (§3.2); difficulty follows the
police response geography: Crown Heights with the most turns to break sight
in, the highway and the Quay with the long straights where interceptors and
roadblocks bite.

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
Every one of the three has the same wall (set 2026-09-22): the totals and,
from M5, the garage pages; banking at the scrapyard buys a car as well as
banking at home. The wall is DOM, so the three doors cost one screen.

### 6.4 Chokepoints and cover

Roadblock sites: the four highway on-ramps and the Crown Tower junction, all
visible from 150 m. Cover sites (update 1): one covered street per district on the way
from that district's jobs to its drop-off, and the four overpasses.

### 6.5 Navigation

The four landmarks already read from anywhere; the hideout gets a lit sign
visible from the highway. The full-screen map (update 2) shows jobs, drop-offs,
cover, cameras and the pursuit's units.

### 6.6 The cold-open route

Revised 2026-09-22: the swap is the second verb, not the fourth. The game
shows the one thing nobody else on the platform has inside ten seconds, and
the thumbnail and the first frame say the same thing.

Spawn on the Crown diagonal heading for the tower junction (the existing
`loop` spawn) in a beat-up van, damage stage 2, already at heat 1 with two
patrols behind. Within the first ten seconds a muscle car draws alongside:
the keycap says `E`, the whip, FRESH WHEELS (swap). A delivery marker 600 m
ahead through the junction; a coin line marks the route. On the way: boost
on the straight (boost), a billboard gate on the footway (smash), a patrol
that lines up for a wall (takedown), the delivery, then "get it to the
hideout" 300 m on, with the patrols losing sight in the grid (escape). About
1.5 km, 90 s at 60 km/h, skippable, never shown twice.

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
| Steal-to-order: the job marker is a car descriptor, not a place; deliver it undamaged | Gone in 60 Seconds, GTA | very low | M5 launch (§4) |
| The bag spills as coins on a wreck, ten seconds to scramble them back | Sonic's rings | low | M4 slice 3 (§2.2) |
| The disguise: swap into a police car and the patrols pass you until they see you sin | Driver, GTA | very low | M4 slice 5 (§2.5) |
| Cars as tools: the heavy breaches the car half of a roadblock, the sports car outruns interceptors, the police car is the disguise | Burnout, Driver | low | M4 slices 5–6 |
| Fares with hot passengers and the chained timer | Crazy Taxi | low | M5 (§4) |
| One big destination arrow over the car for every job | Crazy Taxi | very low | M5 |
| Police withdraw to the nearest donut shop when a pursuit ends; the shop is a marker building, the units path to it and park | mine | very low | M4 polish |
| A news ticker at heat changes ("a red muscle car is terrorizing Crown Heights"), one line, no voice | mine | very low | M4 polish |
| A wanted poster on the hideout wall showing the car the police are looking for; teaches the identity rule without text | mine | very low | M4 |
| Daily seed: the police layout (roadblock sites, parked-patrol junctions, camera sites) from the date, with the daily challenges on it; jobs, coins and the city fixed | mine | low | M5 slice 6, with the dailies |
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
- **Mobile** is M9 (the brief's M6): touch, the mobile tier, under 20 MB
  (3.8 MB today) for the mobile homepage.

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

The contracts with done criteria, pins and measurements per slice are
`docs/M4_PLAN.md` (its §5 holds update 1), `docs/M5_PLAN.md` and
`docs/M6_PLAN.md` (the board), `docs/M7_PLAN.md` (the polish),
`docs/M8_PLAN.md` (the chaos), `docs/M8.5_PLAN.md` (the clean screen) and
`docs/M9_PLAN.md` (the platform); this
section is the summary. Update 2 gets its contract after the first Basic
Launch numbers.

Revised 2026-09-22 (decided by Marcin): the game goes to Basic Launch after
M4 and a minimum M5, and the rest ships as updates. Revised again
2026-09-23 (decided by Marcin, §13.1): the minimum was never the bar; the
platform milestone starts only when the game plays well, so M5.5 (below)
sits between M5 and M6 and runs on his playtests. The platform measures
the three KPIs live from the first day and re-features updated games; no
design table replaces that data, and the biggest milestone (M5) should not sit
between the run loop and the first numbers. This deviates from the brief's v1
list in two places, the helicopter and the activity count, and Marcin decided
both.

- **M4 Heat**, slice order: 0 housekeeping, 1 heat and pursuit as two
  systems with patrols at level 1, 2 police units per level with the pool
  budget and interceptors (all three done); 3 busted with the bar, the
  hideout door, bag and bank with the multiplier live on the HUD,
  `balance.ts` (3a), and the coins with the spill (3b, §3.2); 4 the cold open
  prototype on a minimal delivery job (§2.8, §6.6); 5 the identity rule, the
  disguise with the BORROW prompt, the police chasing the old car, the bot
  policies; 6 roadblocks, spike strips, parked patrols, speed cameras and the
  twenty stunt jumps, with the busted-rate decision rule (§12); 7 levels 4
  and 5 on the ground, heavy SUVs and the Chief; 8 ad points through the
  adapter, polish, the gate.
- **M5 The launch minimum**: the cold open finished on the save's seen flag,
  save through the platform, the garage with the catalogue and paint (§3.3),
  three jobs (getaway delivery, steal-to-order, pursuit escape), the Crazy
  Taxi arrow with its idle target, the daily police seed with the dailies,
  the balance script with the EV assertion
  and the bot as the capture probe, the UI and audio passes, dailies and the
  streak (revised 2026-09-22: no longer conditional; the brief lists them in
  v1 and they are the one D1 lever; if anything slips it is the day-7
  topper).
- **M5.5 The city lives** (decided 2026-09-23, §13; the contract is
  `docs/M5.5_PLAN.md`): heat that moves with patrols at heat 0, coins as
  breadcrumbs, the goal line and the first quarter hour's chain, traffic
  with character, the police as a different animal, the garage dressed
  and the wall sized; optionally "bring it home, pay to keep it". As many
  passes as his playtests ask for.
- **Everything that was "update 1", "update 2" or "polish" is M5.5 too**
  (decided by Marcin, 2026-09-23): the air (cover, the overpasses, the
  helicopter, §5), the jobs (the time trial, street races, takedown rage,
  mayhem, fares, the hunts, the skill chain, the full map, §4, §7), the
  hidden cars and the toys (§8), the life and police extras of the backlog.
  `docs/M5.5_PLAN.md` §4 slices 7–18.
- **M6 The board** (decided by Marcin 2026-09-23 that a milestone sits
  here; what it is, §14, set here; the contract is `docs/M6_PLAN.md`): the
  wanted board of ten rivals and the Chief, their duels and their cars, the
  garage keeping bodies, the driver's kit and the car's kit, three more
  hidden cars. On his word after the M5.5 playtest.
- **M7 Polish** (decided by Marcin 2026-09-24 that the next milestone
  improves and fixes what the game has; what goes in, §15, set here; the
  contract is `docs/M7_PLAN.md`): the recorded issues a player can meet,
  worked off, plus our own music, a settings row, skid marks and the
  screen's lanes. On his word after the M6 playtest.
- **M8 Chaos** (decided by Marcin 2026-09-24 that a milestone designed
  "seriously" sits here; what it is, §16, set here; the contract is
  `docs/M8_PLAN.md`): the street made of things with mass, the knock
  decided before the physics step, each district's things, the smash as a
  trick, the bill at the door. On his word after the 0.7.0 playtest.
- **M8.5 The clean screen** (set here 2026-09-24 after Marcin's review of
  the screen, §17; the contract is `docs/M8.5_PLAN.md`): each corner
  answers one question, one voice at a time, one name for each thing, the
  wall in four pages, a road coin in the bank. On his word; M8's gate
  closes inside its gate.
- **M9 Platform**, the brief's M6 (`docs/M9_PLAN.md`), then Basic Launch;
  only when all of it is in and on his word that the game is good.
- Later, by the KPIs: cop mode, ghosts, multiplayer (§8).

## 12. Playtest watch list

- Is busted legible and fair: the bar, a clear last moment to break out; does
  the fine read as fair, or does the beginner still quit.
- Do players go above heat 2 at all; if not, multipliers up or level 3 down.
- The door race (§2.3): does 3 s read as a chance or as a trap; does a
  novice at heat 3 reach a door at all now that it always opens.
- Does "the pursuit ended but the heat stayed" land through the HUD alone.
- Does a run stay under 15 minutes.
- The ratchet's risk: two accidental takedowns early put roadblocks on a race
  the player wanted to run calmly. Quiet heat until re-detection is the
  mitigation; watch whether it is enough.
- The bag's risk at heat 1–3 is unproven (2026-09-22). Rams shove and never
  stop, busted needs two units and 3 s under 5 km/h, and a swap out of sight
  ends the pursuit at once: below the roadblocks a novice may be uncatchable,
  which makes ×1.25 and ×1.6 free money and the §2.7 table fiction. M4 slice
  6 measures the bot's busted rate per level before anyone tunes
  `balance.ts`. Decision rule: if level 3 comes out below the §2.7 novice
  assumption (15 % a minute, about one busted in five minutes), the ratchet
  gets a cost that is not the police, speed cameras and parked patrols from
  level 2 instead of 3, and the level 1–2 multipliers come down. Measured
  in slice 6 (2026-09-22): busted in five minutes at levels 1 / 2 / 3, the
  novice bot 0–5 / 2–6 / 1–16, the skilled one 0–2 / 1–2 / 0–2; the rule
  does not fire and nothing changed.
- The disguise (§2.5): does a police car make heat 1–2 trivial, since a
  chasing unit rams from alongside and is therefore always a swap candidate.
  If the bot's escape-by-disguise share is above half at level 2, the
  disguise gets a timer (a dispatcher noticing the missing unit) before it
  gets removed. Measured in slice 5 (2026-09-22): a bot that takes the
  ramming unit's car in sight was disguised for 114 of 120 s at level 2 and
  every escape was in the cruiser, so the timer is in: the cover is blown
  30 s after the theft (`POLICE.disguise.seconds`). With it the same bot is
  disguised 30 s, chased 50–89 s of 120, and 3 of its 8 escapes were in the
  cruiser. Watch whether 30 s still reads as the joke.
- The arrest (§2.10): does ~11 s from a stop to busted at heat 2 read as
  fair; does the box read (units parking round the car) before the bar
  does. The knobs are `POLICE.arrest` and `POLICE.busted`. (The "slow
  junction turn as a trap" worry is dropped, 2026-09-23: Marcin: a driver
  who crashes on a corner drives off, the police are not there yet; and
  busted itself reads as fair.)
- From the M5 playtest (2026-09-23, §13.10): does the goal line read
  without the sentence on the wall; does the search disc read as "get
  away from here"; does the pull-over make levels 1–2 too easy; are 730
  coins still too many; do the patrols at heat 0 read as a threat or as
  decoration.
- The spill (§2.2): does the scramble read as a chance or as a punishment,
  and does a novice recover any of it. If the bot's recovery share is under a
  third, the coins live longer or land closer to the respawn.

## 13. The M5 playtest and the polish before the platform — 2026-09-23

Marcin played the M5 gate build (0.5.0 with M5.1) and the verdict reorders
the roadmap. This section records what he found, the decision it forced,
and the design that answers each finding. Status: **decided** where he said
so, **set here** for the answers (he overrides by saying so). The contract
is `docs/M5.5_PLAN.md`.

### 13.1 The decision — decided

**M6 (the platform, the submission; M7 since 2026-09-23, §14, M8 since
2026-09-24, §15, and M9 since later that day, §16) starts only when the
game plays well.**
Basic Launch is not a beta: the platform reads the three KPIs from the first
day and a game that is not good gets its verdict in a week; updates during
Basic Launch continue, they do not rescue a bad first week. So a polish
milestone sits between M5 and M6, worked from his playtest notes, as many
passes as it takes, each pass a playable build he judges. §11's launch
timing ("Basic Launch after M4 and a minimum M5") is revised by this: the
minimum was never the bar, the bar is a game he would launch.

### 13.2 What the playtest found

In the order he gave it:

1. Busted is fair, but the pursuit as a whole is mediocre: the police drive
   like every other car, and every car drives evenly, at one speed, blind to
   its surroundings. He suspects the whole traffic, not only the police.
2. He never got above heat 1 and does not know how.
3. The door works and reads well.
4. After the intro he had no idea what to do or what the game is about.
5. The disguise (BORROW, the 30 s) and steal-to-order were invisible: he did
   not know they exist, and asked whether "hunting" is how you get a car.
6. The coins, the second time: far too many, everywhere, on two or three
   lanes at once, all present from the first second, laid so they cannot be
   collected; wherever you drive you hit some, so they mean nothing. They
   should be a treat, a small goal; during a job they should lie along the
   player's route so they can be collected.
7. The garage reads empty, not dark. The wall is small at 1920×1080.
8. A crash on a corner is not an arrest trap: the driver drives off, the
   police are not there yet. Dropped from the watch list.
9. Abandoned cars: the player should not lose cars for good; recovery or
   repair rather than loss; think it through.

Points 1, 2, 4 and 6 are bigger than everything in `docs/BACKLOG.md`, which
is why the backlog did not predict them: it lists what the bots and the
numbers could see. This section is the answer, one subsection each.

### 13.3 Heat that moves — set here

Why he stayed at level 1, from the code as shipped: heat points come only
from takedowns (4 traffic, 10 police), billboards (2), cameras (5),
roadblocks (6), a rammed patrol (4) and the jobs (a delivery 6, an order 4),
against thresholds of 20 / 40 / 60 / 80 / 100. The intro starts at 20
(level 1); level 2 is twenty points away, three deliveries and a billboard.
Worse, `POLICE.budget[0]` is 0: **at heat 0 there is no police car on the
island**, so a fresh run has nobody to see anything, and a player who
drives dirty (rams traffic, wrecks a civilian by shoving, speeds past
nothing) earns no heat at all. GTA's rule is the opposite: patrol cars are
ambient traffic, the wanted level comes from a crime a cop *sees*, and it
comes at once. Need for Speed's rule is that the chase itself is the heat:
the longer they hold you, the more they send. Both apply here:

- **Cops on the beat at heat 0.** Two units cruise at every level, level 0
  included (`budget[0] = 2`), lights off, on ordinary lane driving with the
  patrol-recycle rule keeping them near the player. They are the city's
  eyes and the first thing a new player sees flashing in the mirror.
- **A crime a unit sees counts double and starts the chase.** `Heat` reads
  `Police.crimeSeen()` for each crime event: seen, the points are ×2 and
  `Pursuit` goes to `detected` that step (a cop who saw it comes after you);
  unseen, the ratchet rises as before and the next sighting answers at the
  new level. The disguise rule is unchanged: a crime seen from the police
  car blows the cover.
- **Reckless driving is a crime.** A `hit` on a civilian above the disturb
  threshold: `heat.hit` 2 (3 s cooldown per car); the chase itself:
  `heat.chasePerSecond` 0.1 while the pursuit is active (a minute of chase is
  a third of a level, NFS's escalation); speeding within a patrol's sight
  by 30 km/h over the limit makes the player wanted and pays
  `heat.speedingSeen` 3 flat, once per 20 s (as built: the sighting is the
  crime, so it is not doubled; at 6 every 5 s the road bot reached level 3
  in 34 s).
- **Fault follows speed** (as built, slice 0). A contact is the player's
  crime only when the other car was not the faster one (`faultMargin` 1
  m/s): the beat's patrols brake late for a stopped player and a cruiser
  rear-ending you at a junction must not make you wanted, while reversing
  into one, or shoving a parked one, does. The police read a contact two
  steps after it, so both speeds come from a decaying maximum.
- **The numbers move:** delivery 10, order 8, billboard 3, camera 6, traffic
  takedown 5, police takedown 12, roadblock 8, police hit 6. Target: the
  novice bot from heat 0 reaches level 2 inside 5 minutes of one job and
  dirty driving, level 3 by 9; the balance script measures it (the busted
  table already runs per level; a "time to level" row joins it).
- **Legible:** every gain pops a small red `+n` under the stars for 0.6 s
  and the star that fills scales up once; a level-up plays the two-note
  siren sting and one ticker line at the top for 2 s (`LEVEL 2 ·
  INTERCEPTORS ON THE ROAD`, `LEVEL 3 · ROADBLOCKS UP`, the news ticker of
  §8, comic, no voice). §2.1's "no text" HUD keeps its stars; the number is
  the one teacher a twelve-year-old needs, and it is tiny.

### 13.4 The run made legible: the goal line and the first quarter hour — set here

The intro teaches the verbs and never the sentence. After the door the
player has sixteen rings, an arrow and no reason. Every open-world game that
onboards well keeps **one line that says what to do next** and one marker
that says where (GTA's mission text, Forza's next event, Crazy Taxi's arrow
and clock); the run needs the same, in the run's own words.

- **The goal line** lives where the job line sits (top centre) and is the
  job line when a job runs. Otherwise: `TAKE A JOB · 320 m` with the
  nearest ring's colour dot (the arrow points at it, as today); with a bag
  above the door threshold: `BANK IT · 540 m` (the arrow at the nearest
  door); under pursuit: `LOSE THEM` with the escape ring (§13.9). One line,
  one marker, always: the rule every game in the research keeps (GTA's
  objective line and one yellow blip, Forza's auto-routed next event,
  Crazy Taxi's arrow and clock, Burnout's compass), and the accessibility
  guideline behind it: the player always knows the goal they are working
  toward. The first goal is under forty seconds away (The Witcher 3's
  rule): the placement guarantees a ring within 250 m of every door.
- **The first quarter hour is a chain**, six steps counted on the wall's
  TOTALS page and in the save (`save.chain`, a byte): 1 TAKE A JOB, 2 BANK
  THE BAG, 3 BUY YOUR FIRST CAR (the compact, 24,000), 4 LOSE THE COPS AT
  LEVEL 2, 5 STEAL A CAR TO ORDER, 6 BANK 20,000 IN ONE RUN. The goal line
  shows the chain's step when it is more specific than the default (`BUY THE
  COMPACT · 1,800 TO GO` once the cash is within one run of it). Each done
  step shows a card (the job card's style) and pays nothing: the reward is
  the next step. After step 6 the line falls back to the defaults for good.
- **The sentence** sits on the wall under BANKED until step 4 is done:
  `CRIMES FILL THE BAG · THE POLICE MULTIPLY IT · THE DOOR BANKS IT`. It is
  the whole game in eleven words and the one line of text this design
  allows itself.
- **The two hidden verbs get their moment.** The first magenta ring's card
  stays up until the wanted car is found and reads `IT'S IN TRAFFIC · SWAP
  INTO IT` with the swap keycap; the BORROW prompt carries a second line the
  first three times it shows, `COPS WON'T KNOW YOU · 30 s`; COVER BLOWN
  stays. Neither is a tutorial screen; both are the prompt saying one thing
  more, once.

### 13.5 Coins as breadcrumbs, never a carpet — set here, after Marcin's verdict

The M4 gate rant was about placement and §3.5 answered it with figures; the
figures still covered the island (2,300 coins, one figure per road, ten
random trails), so from the driver's seat it was the same carpet in a
better font. The verdict is the rule now: **a coin is attached to a goal or
it does not exist.** The genre agrees (research 2026-09-23, sources in
`docs/M5.5_PLAN.md` §8): Subway Surfers' coins exist only where the run
goes, in streaks of 4–6 that trace one jump; Sonic's rings run along the
intended route and "guide the player"; Mario Kart caps coins at ten and lays
them to "highlight the curve of the track"; Nintendo's own course dojo warns
that too many coins "lose their power, inflation"; Burnout Paradise and
Forza Horizon have no coins at all and count finite, mapped collectibles
(570 smashes, 150–200 boards) instead; a 2018 study found coins on the
natural path get collected more and finish more levels than designer-scattered
or off-path ones; and the GDC 2019 talk on rewarding exploration names the
first failure mode of collectibles: "tedious, too many".

- **No coin lies on a road for being a road.** The trails, the fillers and
  the sweeps are gone. The main carriageways carry nothing between jobs.
- **Static coins only where a goal is**: the gate line through a billboard
  (4 coins and the cap, from 8), the arc over a ramp (3 and the cap), the
  ring's approach (M5.1's seven and the cap, unchanged), and **thirty
  caches a day**: a run of 8 ending on a cap worth 100, on side streets and
  the parkway's bends, drawn by the date seed from a fixed list of about
  120 candidate spots (the generator's, like the police sites), counted on
  the HUD as `CACHES n/30` under the billboards: a finite, visible goal that
  is new every day and reads as one on the radar (a gold dot); the tenth,
  twentieth and thirtieth pay a bonus into the bank (500 / 1,000 / 2,000,
  Burnout's "every tenth" rule). About 730 coins resident island-wide, from
  2,300, every one at something.
- **Route coins during a job**: when a job's target is known (a delivery
  from the ring; an order once the car is taken; the intro's delivery), the
  lane path to the target is laid with coins **in the path's own lanes
  only**, and only where a decision is: a run of 5 into and out of every
  turn (the navigation), a run of 6 on every straight longer than 80 m, the
  cap at the target; about 40–70 coins a job at 4.5 m (0.2 s at 80 km/h,
  the rhythm rule). Taking every coin of a route pays a `+10 %` tip on the
  job (the "clean line"), and the job line counts them (`DELIVERY 1:15 ·
  370 m · 12/48`). Laid through the run-time pool (the intro's mechanism;
  512 coins cover any route) and cleared when the job ends, picked ones
  stay picked. A hunt lays none (the target moves); an escape lays none
  (the goal is not a place).
- **Between jobs the arrow is enough.** No breadcrumbs to the nearest ring:
  that would be the carpet again, on the player's road this time.
- **Values**: a coin 20 (from 10), a cap 100 (from 50), a cache's cap 250;
  the counter's pop and the bell are unchanged. The balance script re-runs
  with the new income (a job's route about 1,000–1,400 in coins plus the
  tip; the caches up to 3,700 a day) and the first hour is re-timed.
- **The look and the catch stay** (§3.5): he did not fault them this time.
- As built (slice 1, 2026-09-23): the static island holds only the gate
  lines and the arcs (about 330 coins at seed 42); the rings, the caches and
  the route are run-time pools with their own id ranges; the caches' spots
  are the side streets' lane middles (about 60 candidates after the 150 m
  spacing, so about half of tomorrow's thirty are new); the intro's line
  runs at the same rhythm with the cap on its marker; arriving takes the cap
  on a job's target, so the tip never hinges on the last metre.

### 13.6 The garage dressed, the wall sized — set here

- The garage is a room with nothing in it; STYLE.md asked for no clutter,
  which reads as unfinished. Along the walls, never on the floor the car
  needs: a pegboard with tools, a tyre stack, a workbench with a lamp, an
  oil drum, a coiled hose, and the wanted poster as a plane on the back
  wall (the HUD's poster, drawn once in geometry). Flat boxes in the
  palette, one merged mesh per garage, no shadows inside.
- The wall panel: `width: clamp(640px, 48vw, 960px)` and a root type size
  from the viewport height, `clamp(14px, 1.6vh, 20px)`, so at 1920×1080
  the panel is 922 px wide with 17 px lines and a 62 px title, and at
  800×450 it is what it is today. Answering his question: about 900 px at
  1080p, half the screen, and the type grows with it.

### 13.7 Cars are never lost: bring it home, pay to keep it — set here

What exists: the garage owns *classes*; drive-out gives a fresh car of the
class in the garage's paint; the car a swap leaves behind is a traffic
record and gone. Nothing is ever lost because nothing in the street is the
player's: the garage car is an archetype. That is the right rule for a
getaway driver who never keeps a car (§1), and it stays: leaving a car in
the street costs nothing, damage is healed at drive-out for free, the
respray is free. What it lacks is the other half of the brief's fantasy,
"any car you see can be yours", made literal:

- **Any car driven through a door is on the wall.** The CARS page shows it
  as HOT with one button: `KEEP IT · 3,000` (30 % of its price; the police
  car 60 % and still locked behind one heat-5 escape). Paying launders it
  (new plates, a free respray) and the class is owned from then on, in that
  paint. Declining costs nothing; the next run starts in the garage's car.
  Buying at full price stays for a player who never brings one home.
- The steal-to-order fence pays cash for a car; keeping it is the
  alternative, and the wall says so on an order's car (`SELL · 6,000` /
  `KEEP · 3,000`).
- Scheduled as the last slice of M5.5 (his call whether it ships there);
  the descriptor at the door, one page on the wall, one field in the save.

### 13.8 Traffic with character — set here

Why it reads as "równiutko, systemowo", from the code: `Traffic.plan` gives
every car its lane's limit as the desired speed, one number per road type
(street 50 km/h, avenue 58, highway 79), so every car on a road drives the
same speed to the decimal; there are no lane changes (the highway's two
lanes per direction are used only at junction exits); the only reactions
are braking for a car ahead, a wobble on contact and a honk after nine
seconds at a junction; nothing reacts to a siren; nothing differs between
one driver and the next. Traffic like that is a conveyor, and police built
on it (§13.9) are a faster conveyor.

What the big games do (research 2026-09-23, sources in `docs/M5.5_PLAN.md`
§8): GTA V gives every driver a bitmask of driving-style flags (stop for
vehicles, steer around obstructions, change lanes around obstructions, go
the wrong way only when the own lane is full) and two scalars, ability and
aggressiveness; every vehicle class has its own brake distances and corner
speeds; sports cars "go faster", big vehicles take wider turns and keep
more space, buses avoid junction turns; the population is set per zone and
hour with clone caps; drivers pull over for a siren; a bumped driver may
get angry. Burnout keeps traffic as a hazard with steady lanes and a mix
of compacts, vans, trucks and buses; Forza pays near misses at speed, and
its players' three hated patterns are spawning in view, braking for no
reason and swerving into oncoming. Driver: San Francisco places traffic to
form lines to weave through. The cheap rules they share: speed = road ×
personality × class; lane changes only with a reason; brake and swerve
when the player comes at you; pull over for sirens; bigger vehicles behave
bigger; density by place and by heat.

The design, all of it on the existing records (no new system):

- **A driver per record.** Two bytes seeded at spawn: `pace` (slow 0.85,
  normal 1.0, brisk 1.1, fast 1.18 of the limit, weighted 15 / 55 / 22 /
  8 %) and `temper` (the gap time 0.9–1.6 s, the honk readiness, and the
  one driver in eight who is bad: a 0.6 s gap, a ±0.5 m drift in the lane,
  a junction claim jumped after 3 s). Class factors on top: sports 1.1,
  heavy 0.9, the taxi 1.1, the bus 0.8. The highway then carries 67 to
  93 km/h in one direction instead of 79 everywhere, and the player has
  someone to overtake and someone to be overtaken by.
- **Overtakes with a reason.** On roads with two lanes per direction (the
  highway; the avenues where the second lane exists) a car whose leader is
  2 m/s slower changes lane when the target lane is clear one gap time
  ahead and behind, indicates for a second (the lights byte), and returns
  when clear. Streets keep their one lane; nobody drives the wrong way to
  overtake (Forza's hated swerve).
- **The flinch.** A car with the player closing head-on in its lane inside
  2.5 s brakes hard, pulls 1.2 m to its kerb side and honks; a car passed
  within a metre at over 10 m/s closing honks and wobbles (exists); a car
  cut in front of brakes (exists) and flashes. One bumped driver in ten
  tailgates the player for 8 s, never rams, then gives up: GTA IV's angry
  driver, comic and cheap (a temporary plan target).
- **Pull over for the siren.** A civilian with a lit unit within 60 m
  behind it on its road pulls 1.5 m to the kerb and slows to 4 m/s until
  the unit has passed, plus 3 s; the bus and the heavy only slow. The road
  parts for the chase, the chase reads from the traffic itself, and the
  police get through where the player had to weave. From level 4 the
  density thins to 60 % (GTA's five-star streets are nearly empty).
- **The gawk.** A car reaching a wreck or a stopped car in its lane stops
  2 s behind it, then goes around through the oncoming lane when it is
  clear (the one wrong-way move, GTA's "only when the own lane is full").
  This also closes the M3 issue of traffic queueing behind an abandoned
  car for good.
- **Two silhouettes that behave differently**: the **taxi** (the compact
  body in the coin yellow with an ink roof sign; pace fast, a lane-hopper;
  a swap gives a compact) and the **bus** (the heavy preset stretched 1.6×
  in length, pace 0.8, never changes lane, a moving wall for the chase; a
  swap gives the bus, which is the slapstick the brief asks for). The bus
  is the stretch item of its slice: if the profile or the perf bites, the
  taxi ships alone.
- **Population rules**: no same class-and-paint pair within 150 m (GTA's
  clone cap); density by district (the quay and the parkway lighter, the
  avenue and the highway denser) and by heat.

Measured at the slice: the speed spread on a highway lane (coefficient of
variation ≥ 10 %), lane changes a minute on the highway, pull-overs per
chase, the novice bot's near misses a minute before and after, and the
traffic step's p95 (this is where the cost is).

### 13.9 The police as a different animal — set here

What exists is a good chase brain on traffic's legs: prediction, the
cut-off from level 2, the ram, the PIT, the heavy's shove, the box, the
search fan-out, roadblocks, spikes, parked patrols, the Chief. But a unit
drives with traffic's lane follower: it waits at junction reservations,
stays behind a civilian in its lane, runs 108 km/h flat whatever the player
does (the catch-up 173 km/h beyond 55 m, in view or not), and the HUD
shows the chase's state as five pulsing stars and nothing else. That is
why busted is fair and the chase is mediocre: the tactics are right, the
driving and the reading are not.

What the genre does (research 2026-09-23): every good pursuit system keeps
explicit SEEN and SEARCH states with a last-known position the units drive
to and a search zone the player can see (GTA V's vision cones on the radar,
GTA IV's circle frozen at the last-seen point, Driver: San Francisco's
flashing circle, Watch Dogs' two circles, Mafia III's blue disc); escape is
time outside every sensor, reset on re-sighting, and its progress is shown
(GTA's star flash slows, NFS's EVADE bar drains, then a cooldown with
hiding spots); dispatch holds a minimum count per level and refills on a
cadence that shrinks with heat (NFS Most Wanted 3:00 to 1:00); tactics are
a vocabulary picked from relative position and speed (pursue at a distance,
rear-quarter ram, low-speed PIT, box, rolling roadblock, static roadblock
on the predicted route, spikes, the helicopter as a sensor); the radio
announces the tactic before it lands (NFS's 10-codes; GTA's "suspect last
seen in a red muscle car"); cops ignore lanes and lights and target the
player while traffic yields; catch-up is allowed only out of sight and
capped in view (NFS Heat's visible rubber band is what its players call
cheating); and a chase escalates by time in pursuit and by units wrecked.

The design, each item on the existing planner:

- **The police driving mode.** A unit in a chase or a search runs the
  junction box without a reservation (civilians yield by the pull-over
  rule), swings out around a slower civilian through the oncoming lane
  when it is clear (the wrong-way move, reserved for units and the gawk),
  cuts junction curves with handles at 0.25 of the gap (traffic's 0.42),
  and brakes and accelerates at 1.5× the class. Lights and siren on, as
  now. A unit off duty drives like traffic again.
- **Pressure, not a flat speed.** Within 60 m a chasing unit's desired
  speed is the player's plus 4 m/s (never under 12 m/s), capped by its
  class; beyond 60 m the catch-up applies only out of the player's view
  cone, and a unit far off in view runs its class speed. The cops are
  always in the mirror and never visibly cheating.
- **Refill on a cadence by level**: `reinforceSeconds` becomes a table,
  12 / 10 / 8 / 6 / 5 s for levels 1–5 (NFS's cadence compressed to a
  run's length), and a wrecked unit's replacement is announced (below).
- **Arrivals you can see.** From level 2 one reinforcement in three spawns
  in view: at a side street 60–100 m ahead, pulling out with its lights on
  (GTA's roadside ambush). The rest arrive out of view as now.
- **The visible search.** The radar draws units: lit blue blips in a chase,
  grey dots on patrol; in `lost` it draws the search zone, a translucent
  blue disc at the last fix growing from 60 to 150 m over the cooldown
  (GTA IV, Driver SF): "get away from where they saw you" made visible.
  The stars' pulse slows as the cooldown runs down (GTA V) and a thin ring
  under the stars drains with it (NFS's EVADE), so "did I lose them" is
  answered on the HUD and not by guessing.
- **The radio as one line.** The ticker of §13.3 also calls tactics before
  they land, NFS's 10-codes in plain comic English, one line, 2 s, at most
  one every 6 s: `DISPATCH · ROADBLOCK AHEAD ON THE AVENUE`, `DISPATCH ·
  SPIKES OUT`, `DISPATCH · SUSPECT IN A LIME COMPACT` (the identity rule
  taught by the radio: they remember the car), `DISPATCH · UNIT DOWN, SEND
  ANOTHER`, `DISPATCH · WE LOST HIM`.
- **Sirens by heat.** The siren adds a tone per level (one at 1, the
  two-tone at 2, a third texture at 3 and up); the rotor's low-pass waits
  for the helicopter (update 1).
- **A chase pays and escalates.** `heat.chasePerSecond` (§13.3) and a
  bounty in the bag per 10 s in pursuit, 100 × level (NFS's per-10-s
  bounty), beside the police takedown's 1,500 that exists: a long chase is
  worth something and gets worse.
- **Traffic in the chase**: the pull-over and the thinning of §13.8; the
  bus never yields (a bus across a junction is a wall for both sides).

Measured at the slice: the busted rates per level by both bots before and
after (the balance script), the share of chase time a unit spends within
60 m of the player at level 2 for the skilled bot (target 60 % or more),
the cut-offs, rams and PITs a minute, and the step p95 at levels 3 and 5.

### 13.11 Life's models: the city's cars and people — set here, 2026-09-23 (Marcin: "what about the car and pedestrian models")

The M3 shortcut stands in the frame every second: the traffic is the
player's three bodies in other paints (record 29) and the pedestrians are
one walker in a handful of tints. Marcin: not shippable, and he should not
have had to say it. The rule from here: **the city's cars and people are a
designed set, not a paint job.** Eight civilian silhouettes (sedan,
hatchback, estate, SUV, pickup, taxi, box truck, bus) built the way the
player's cars are (parametric profiles, flat shading, the palette; STYLE
§Vehicles), each with its own footprint in the traffic record so the
planner, the swap and the chase treat a bus as a bus; four pedestrian
silhouettes with a walk cycle in the instanced shader, tints by district,
the dive and the fist on all of them. Spawn weights make the districts
read: buses on the avenues, trucks in the Works, taxis round the tower.
Slices 19 and 20 of `docs/M5.5_PLAN.md`; the taxi's and the bus's
behaviour (§13.8) rides on these bodies.

### 13.10 What this section changes elsewhere

- §3.2 and §3.5 (the coin layer): superseded by §13.5; the look and the
  catch stand, the layout does not.
- §11: the launch timing (§13.1) and the milestone list (M5.5 before M6).
- §12: the arrest's "slow junction turn" item is dropped at Marcin's word;
  new watch items: does the goal line read without the sentence, does the
  search disc read as "get away from here", does the pull-over make level
  1–2 too easy, are 730 coins still too many.
- `docs/BACKLOG.md`: the abandoned-car tow (closed by the gawk), the
  ticker, the heat-scaled sirens and the radio chatter (scheduled here);
  the garage's "dark" note corrected to "empty".

## 14. M6 "The board": rivals, their cars, your style — set here, 2026-09-23

Marcin, after the M5.5 gate: a new M6 before the platform, the platform
becoming M7 (decided; M8 since 2026-09-24, §15, M9 since later that day,
§16). What M6 is, is my idea (set here; he overrides). The contract is
`docs/M6_PLAN.md`; the platform's is `docs/M9_PLAN.md`.

### 14.1 What is missing after M5.5

The first quarter hour has a spine (the chain, §13.4) and the city is full
of things to do. After the chain's sixth step there is no goal longer than
one run and nobody to beat: jobs, money and dailies, Forza's checklist
without Forza's championships. Nothing in the game has a face, and the
Saints Row pillar of the brief (absurd humour, ridiculous customization) is
the thinnest of the four: "visual customization ranging from paint and
wheels to silly roof toppers" is today the paint and the day-7 cone, and
the brief's eight vehicles are six to own. The KPIs say where it bites:
play time needs a clear next goal at all times past minute fifteen, and
day-1 retention needs a reason to come back that has a name (a rival
nearly beaten, a car nearly won).

### 14.2 The idea: the wanted board

The genre's proven answer is Need for Speed Most Wanted's (2005) blacklist:
named rivals beaten one at a time, each win taking the rival's car. In our
fiction it is the police's own board: the ten drivers the city wants most,
ten wanted posters on the hideout's back wall where the one poster hangs
today. The player starts off the board. Beating a rival in a duel takes
their place, their car and their signature item, and the player's poster
climbs. At #1 the Chief comes in person (§14.5).

- **Every rival asks for something first**: two requirements printed on
  the poster, each a thing the game already has (win a street race, gold on
  a trial, escape at ★★★, a hot fare, bank 40,000 in one run). The ten
  posters walk the player through every activity in the city in order: the
  chain's rule (§13.4) stretched over the first four or five hours. The
  counters are lifetime, so nothing done before the board opens is wasted.
- **The goal line follows the board** once the chain is done: `CHALLENGE
  GRANNY GEARS · 640 m` with the arrow on her ring when she is ready, else
  her first open requirement, `#9 NEEDS: WIN A STREET RACE`, with the arrow
  on the nearest race. There is always a named next thing.
- **One rival at a time**: only the next rival's ring is live; the beaten
  stay on the map as rematches for a quarter of the purse (a car is won
  once). Losing costs nothing but the heat; the ring stays.
- **Rewards**: the purse goes into the bag like every job's pay (the run's
  rule, §2.2); the car and the item are the player's at once and never at
  risk (a twelve-year-old who wins a car and loses it to busted quits).
- In the game it is the `WANTED BOARD`, never "most wanted" (brief §2: no
  borrowed names). No number is attached to the player: the board is
  posters and names, so §3.2's "no reputation" stands and nothing is locked
  by it.

### 14.3 The ten

Two duel formats on what exists, and a twist per rival that is one of the
game's own verbs turned on the player, so the board teaches them too:

- **Race**: the rival and the player to one finish by any route (M5.5's
  race with the rival's pace and rubber band by rank).
- **Hunt**: the rival carries a bag to their door; wreck their car (its
  armour grows with rank) before it gets there. A wrecked rival's bag bursts
  as coins on the road (the spill, run the other way). Their arrival, or
  three minutes, loses it.

| # | Rival | Turf | Their car | Duel | Twist | Their item | Purse |
|---|---|---|---|---|---|---|---|
| 10 | Granny Gears | Palm Gardens | the Wagon: a hot-rodded estate, a blower through the bonnet, flower pots on the roof rack | race along the parkway to the Glasshouse | none, heat 0: the duel taught | flower-pot topper | 4,000 |
| 9 | Pepperoni Pete | Coral Quay | the Pizza Hatch: a hatchback under a giant slice | race to a customer's door | drives like the bad driver: weaves, takes the oncoming lane | pizza topper | 6,000 |
| 8 | Tow Truck Tina | Sunset Works | the Wrecker: a pickup with a crane, a hook and an amber bar | hunt to the scrapyard | heavy: twice the armour, a shove like the heavy van's | amber beacon | 8,000 |
| 7 | The Twins | Coral Quay | the Twin: one sports coupé, two of them, mint and peach | race against both | they never drive the same car twice: a twin who falls 150 m behind swaps into a car ahead of you out of your view, and the radio names it | two-tone neon | 10,000 |
| 6 | Fake Frank | Sunset Works | the Fake Cruiser: a police saloon under a disco light bar | hunt to the donut shop | the disguise: the units ignore him, and ramming him is hitting a police car | disco light bar | 12,000 |
| 5 | Big Bernie | Crown Heights | the Party Bus: the bus with a roof deck and speakers | race down the avenues | a bus at race pace that never yields: traffic bounces off it | air horn | 15,000 |
| 4 | Neon Niko | Coral Quay | the Lowrider: a long low coupé on hydraulics | race along the promenade, heat 3 | the pursuit breakers: every scaffold tower he passes with you behind falls on you | pink neon | 18,000 |
| 3 | The Mayor's Nephew | Crown Heights | the Gold Limo: stretched, gold, flags on the wings | hunt to the Crown Tower | a police escort: two units beside the limo ram you from the start | the flags | 22,000 |
| 2 | Professor Pip | Palm Gardens | the Bubble: a one-door microcar, absurdly fast | race, heat 4 | the helicopter over you from the start: the cover is the way | propeller cap | 30,000 |
| 1 | The Ghost | the highway | the Phantom: a matte black sports car with its lights off | race round the whole loop, heat 4 | no blip on the radar and no lights: seen only in view | ghost smoke | 50,000 |

Requirements, lifetime counts, two a poster: #10 the chain's six steps; #9
win a street race, bronze on a trial; #8 escape at ★★★, 10 takedowns; #7
win a rage or mayhem zone, deliver 3 fares; #6 deliver 3 cars to order, own
3 cars; #5 silver on 2 trials, 10 stunt jumps; #4 bank 40,000 in one run,
25 billboards; #3 escape at ★★★★, a hot fare; #2 win 3 street races, 40
caches (the day's thirty cannot make it: the second day is the D1 lever,
said on the poster); #1 escape at ★★★★★, gold on a trial. The intended pace:
#10 at about minute 20, a rival every 15–25 minutes after it, #2 on day
two. The pace and the band of the race rivals and the hunted cars' armour
rise with rank (`BALANCE.board`); the numbers are the balance script's and
Marcin's hours'.

### 14.4 Your style: the driver's kit travels, the car's kit stays home

The identity (§1: the getaway driver who never keeps a car) and
customization meet in one rule. **The driver's kit is the player's and
goes into every car they swap into**: the topper on the roof, the neon under
the sills, the horn, the boost flame, the tyre smoke. Take a bus with a
rubber duck on your roof and the bus wears the duck; the day-7 cone already
works this way. **The car's kit belongs to a car in the garage**: the paint
(exists), the wheels, the spoiler, the stance. It is what you drive out in.

- **Toppers**: the streak's cone; for sale a rubber duck, a shark fin, a
  crown, a traffic light, a giant donut (the police's weakness), a satellite
  dish, a mattress, a trophy and a flamingo; won only, six rivals' (the
  flower pots, the pizza, the amber beacon, the disco light bar, the flags,
  the propeller cap) and the Chief's gold star. Each a few boxes in the
  palette, under 300 triangles, seated on the body's roof.
- **Neon**: six colours, and the rivals' two-tone and pink; an additive
  quad under the car in its footprint, no light.
- **Horns**: five of our own synthesized like the engine (a clown's, a
  goose, a doorbell, a two-tone, a kazoo) and Bernie's air horn won. **The
  horn is a verb** (H): the car ahead in your lane within 25 m pulls toward
  its kerb for 2 s (the pull-over's move at half), so honking through
  traffic works; a horn with nothing to do is a button pressed once.
- **Boost flame and tyre smoke**: five colours each; the Ghost's smoke won.
- **The car's kit**: five wheel styles in five colours, three spoilers (a
  lip, a wing, the silly one), three stances (low, stock, high: the body's
  height over the wheels, drawn only).
- Prices 500–12,000, so the first hour has something to see bought between
  the upgrade tiers (eight of its ten purchases today are stat tiers, which
  nobody sees).
- **The day's pick**: one kit item a day by the date seed at half price on
  the STYLE page; in M9 the same item free for a rewarded ad, the half
  price as the equal alternative. That is the brief's "daily cosmetic
  crate" (§7) without the randomness: PEGI 12 and the brief rule out
  gambling, and a crate you cannot see into is one.
- **Cosmetics never change handling, heat or the police's descriptor.** A
  kit that costs something in the chase is a kit nobody wears; the
  descriptor stays class and paint (§2.5).

### 14.5 The Chief

Beating #1 puts the Chief in his ring at the donut shop, the ticker's
`THE CHIEF WANTS HIS BOARD BACK`. The duel is the escape at ★★★★★ with the
Chief on the roster from the first second; losing him (the cooldown, as in
any escape) wins his own car, the Chief's Cruiser (the police body with gold
trim and a gold star on the roof), 100,000 into the bag and a gold frame
round the player's poster at #1. The police car's own unlock (one heat-5
escape) stands.

### 14.6 The collection

The garage keeps **bodies**, not classes (closing BACKLOG's "the garage
keeps classes"): every body is a car on the CARS page, counted (`CARS
9/28`): the five of the catalogue; the eight civilian bodies, only by
bringing one home (KEEP IT at 30 % of its own price); four hidden cars (the
ice-cream truck and, mine, one more in each district without one: a vintage
roadster under a tarp in a Crown Heights back lot, a street sweeper with
spinning brushes in a Works yard, a hot-dog van on the Coral Quay
promenade); the ten rivals' cars and the Chief's. Upgrades stay per class:
a power tier on the muscle class drives the Wagon and the taxi faster too,
which keeps the save and the balance small and every handling pin standing
(tier 0 is the preset bitwise). The SELL / KEEP choice at a fence (§13.7)
comes with it.

### 14.7 What it moves and what it costs

- **Play time**: a named next goal for four to five hours; rematches;
  something visible to buy every few minutes.
- **Day-1**: a rival nearly beaten, a car nearly won, #2's forty caches,
  the day's pick.
- **Conversion**: the first minute does not change; M9's cover brief gets a
  cast (a party bus, a granny's wagon, a duck on a roof).
- **Cost**: fourteen bodies (M5.5 built eight in one slice), two duel
  formats on the race and the takedown, eight twists on systems that exist,
  two wall pages, about forty kit items of a few boxes each, the save's
  version 3. Twelve slices.

### 14.8 What this section changes elsewhere

- §11: M6 is the board; the platform (the brief's M6) is M7 (decided by
  Marcin, 2026-09-23; M8 since 2026-09-24, §15; M9 since later that day,
  §16).
- §3.3's car list (Hatch, Van, Coupe, Muscle Pro, GT) is superseded by the
  bodies of §14.6.
- `docs/BACKLOG.md`: the garage keeps classes and SELL / KEEP at a fence
  are scheduled (M6 slice 0).
- The brief's v1 items it closes: visual customization (paint, wheels,
  toppers) and the eight vehicles (twenty-eight).

## 15. M7 "Polish": the same game, finished — set here, 2026-09-24

Marcin, after the M6 gate: the next milestone improves and fixes what the
game already has, and the platform becomes M8 (decided; M9 since later that
day, §16). What goes in and
in which order is set here (he overrides). The contract is
`docs/M7_PLAN.md`; the platform's is `docs/M9_PLAN.md`.

### 15.1 The bar

Nothing new to do: no rival, activity, district or mode. The bar is what a
player on a weak laptop meets in the first minutes, put as five tests:

1. **It loads every time**, and gives control inside 5 s.
2. **Nothing on screen covers anything else**, at any of the ten sizes.
3. **It never stutters**: no frame over 50 ms once driving, and the frame
   rate where the brief asks for it.
4. **It sounds alive**: music under the engine that rises with the heat.
5. **Every promise the rules make holds**: the first car in five to seven
   minutes (the brief), the bet at the door paying a good driver more, a
   first rival beaten at the first or second try, civilians and police
   that never stand nose to nose with the player for good.

### 15.2 What goes in: the recorded issues, worked off

Every issue a player can meet that the M5.5 and M6 gate reports and the
backlog record is worked off here and not carried again (Marcin at the M1
gate: a known-issues list is for working off). By test:

- **Loads**: the page stuck at LOADING once in 51 loads at the M6 gate.
- **Covers**: the top of the screen holds four things with no rule between
  them (the job line, the news ticker, the key hints, the intro's
  captions); in the intro's first second the level news prints across
  "W A S D DRIVE"; a job's card lands on the hints; the streak's pop sits
  on the speed.
- **Stutters**: about 2.5 MB of garbage a second and 20–30 ms collections;
  chunk building in the first second (55–95 ms frames); the quality
  switch's hitch; the traffic step at 2.4 ms under 4× CPU, the largest
  share of the step; the heap 10 MB up with every body's mesh built at
  load; the trees' shadow cost.
- **Sound**: no music at all. The brief's v1 asks for it once play has
  started; the licensed-file route has waited since M5 for a file.
- **Promises**: the economy model red on (a) (a good driver's best door is
  no higher than a beginner's) and (b) (the first car at minute 3.8); the
  standoff's civilian pulling toward the player's side; the plain junctions
  forced through after 9 s about once a minute; a shoved car snapping back
  onto its lane; police taking corners like traffic; level 4 catching less
  than levels 2–3; Granny Gears beaten by the careful bot two times in
  three and by the plain one not at all.
- **The city's leftovers**: avenues that read as generated (no corner
  shops, no building that stands out), the parkway's stop line 112 m from
  its merge, flat road paint, no hideout sign seen from the highway, the
  big map without blocks, parks or water, the spill's coins appearing in
  one step, the sweeper's brushes standing still, a rival never seen before
  their duel, and the wall's keys walking the STYLE page's 59 cards in one
  line.

### 15.3 Mine, added — set here

- **Our own music.** Synthesized in the browser like the engine and the
  hidden cars' tunes: no file, no licence question, no bytes to load. One
  groove in layers that the heat adds (bass and hats at heat 0, drums from
  1, a lead from 3, an alarm figure at 5), a sting for busted, the escape
  and the door. It is rendered once after gameplay starts into loops that
  play in sync, so playing it allocates nothing; the levels fade in over a
  bar. It sits 14 dB under the master, like the file it replaces.
- **A settings row on the pause screen**: music, effects, quality (auto,
  low, high), the radar (turning or north up). Saved. Still no menu before
  play (brief §3).
- **Skid marks.** A drift, a hard stop or a burnout leaves dark marks on the
  asphalt where the tyres were, fading after 30 s. Anchored in the world,
  the drift's own trace rather than a screen effect: Marcin's rule for
  effects is grounded and deliberate.
- **The screen's lanes.** The top centre is one lane with a priority: the
  intro's caption, then a job's card, then the job line, then the news. The
  key hints leave the top for the bottom centre; the pops (streak, tips,
  bounties) get their own lane under the bag.
- **The first rival is beaten at the first or second try.** Granny's pace
  is set so the plain bot beats her at least once in three and the careful
  bot every time: the board's first step teaches that rivals can be beaten.
- **Far props leave the traffic alone.** The hidden cars and the rivals'
  parked cars take records outside the traffic's pool, are not counted in
  its density and draw none of its random numbers, so adding one far away
  moves nothing near the player. The M5.5 and M6 gates each lost hours to
  bot tests flipped by such moves.

### 15.4 What stays out

New content of any kind; the platform (M9: the SDK, touch, the mobile tier,
the ads, the day's pick as a rewarded offer); cop mode, ghosts,
multiplayer; the multi-storey car park; the test bots' own limits that no
player meets (race #23's reset loop, the naive hunter's U-turn, the bot at
roadblocks: recorded, no date); the handling presets, unless Marcin's notes
ask.

### 15.5 Order

His notes on 0.6.0 come first, each one a slice ahead of the rest. Then in
the order a player meets things: the workshop (the quick verify under a
minute, the far props), the screen, the sound, the settings, the skid
marks, the stutters, the frame budget, the boot, the civilians, the police,
the money, the city's look, the maps and the wall, the rivals' leftovers,
the gate. Version 0.7.0, save version 4.

### 15.6 What this changes elsewhere

- §11: M7 is the polish, M8 the platform (decided by Marcin, 2026-09-24;
  M8 is the chaos and M9 the platform since later that day, §16).
- The platform plan is `docs/M9_PLAN.md` (then `M8_PLAN.md`); its perf bases become the M7
  gate's.
- The backlog lines M7 takes leave `docs/BACKLOG.md` as each ships.

## 16. M8 "Chaos": the city you can wreck — set here, 2026-09-24

Marcin, after the M7 gate: M8 is designed "seriously" and the platform
becomes M9 (decided). What M8 is, is my proposal from the design talk the
same day, which he took ("Dobra, napisz M8"); the design below is set here
(he overrides). The contract is `docs/M8_PLAN.md`; the platform's is
`docs/M9_PLAN.md`.

### 16.1 What is missing

Of the brief's four references, two are strong: GTA (the seamless city,
the stars, any car can be yours) and Need for Speed (pursuits, races,
tuning). Burnout and Saints Row are the thin ones. The cars already crash
well (dents, parts, smoke, the takedown's slow motion); the city does not.
Apart from the fifty billboards and the scaffold towers nothing in it
breaks, and worse, the street furniture is decoration only: the lamp posts,
the street trees, the benches and the railings have no collider, so the
car and the pedestrians pass through them. The brief asks the opposite
twice: light props that barely slow the player and heavy hits that are
crashes (§4), and free roam that pays every 20–30 seconds (§3). In the
genre that payment is the street: lamp posts, hydrants, benches, fences,
market stalls. Even the mayhem job prices only cars and billboards today.

### 16.2 The rule: the street is made of things with mass

Every piece of street furniture is a prop with a mass, a restitution and,
if it is anchored to the ground, a base that holds up to a break impulse.
When anything with wheels meets a prop, the sim decides the contact itself,
before the physics step, as a collision between two bodies:

- The impulse along the contact normal is `J = (1 + e) · v · m_car · m_prop
  / (m_car + m_prop)`, `v` the closing speed. A loose prop (a bin, a chair,
  a cone) always goes. An anchored prop (a lamp post, a hydrant, a sapling,
  a bus shelter) goes when `J` passes its base's break impulse; below it,
  it holds, and the car hits it like a wall, with the wall's damage and the
  skill chain lost.
- The car pays what the prop takes: `Δv = (J + J_base) / m_car` against its
  motion. For a 1,400 kg car at 60 km/h a bin (25 kg) costs 2 % of the
  speed, a sapling 6 %, a lamp post (140 kg, 700 N·s) 13 %, a kiosk (400 kg,
  3,000 N·s) over a third. A lamp post holds below about 18 km/h.
- The prop leaves with the momentum it received, up the slope of the
  bonnet, spinning about its centre of mass from the contact's height: a
  tall post hit at the bumper folds its top toward the car.
- Flying props are real rigid bodies for their few seconds in the air (a
  pool of sixteen); once they come to rest they lie where they fell, drawn
  but not simulated, and anything that drives over them knocks them again.
  With the pool empty a prop flies a ballistic arc instead; it never simply
  fails to move.
- The city heals: a fallen prop a minute out of sight stands again.

Deciding the contact before the solver matters: a static collider would
stop the car dead at any speed, a sensor would let it through and knock the
prop a step late. The rule is closed-form, deterministic and pinned in
Node, like the handling.

Trees split by trunk: the thick ones (the parks, the quay's palms, the
gardens) become solid, a crash; the street trees become thin staked
saplings that snap at speed.

### 16.3 What stands where

Two lines on every footway, clear of the walkers: the kerb line 0.7 m from
the road (lamp posts, saplings, hydrants, bins, parking meters) and the
frontage line from 3.7 m (terraces, benches, stalls, kiosks); the walkers'
line down the middle (2.25 m) stays free, so a walker never passes through
a post again. Then each district's own:

| District | Its things |
|---|---|
| Crown Heights | café terraces (tables, chairs, umbrellas) in front of the corner shops, bus shelters with glass, newsstand kiosks, parking meters |
| Sunset Works | pallets, barrels that roll, crates, traffic cones and barriers round the yards, stacked tyres |
| Palm Gardens | fruit stands that spill, lawn flamingos, garden gnomes, picket fences, letterboxes |
| Coral Quay | deckchairs and beach umbrellas on the promenade, fish stalls, lobster pots, wooden benches |

About 40–70 a block, from each chunk's own random stream so the buildings,
billboards and coins stay where they are. Never in a lane, a job's ring, a
door's approach, a billboard's line, a jump's ramp or run-out, within 12 m
of a junction's corner, or on the cold open's route except where it is
meant to smash through.

### 16.4 What it pays

- **The skill chain.** Every smash is a trick: its points by weight (a
  chair 10, a bin 20, a bench 40, a lamp post 80, a hydrant 100, a kiosk
  200) and the prop's name as the chain's word (`HYDRANT`, `FRUIT STAND`).
  Smashes within half a second count as one trick toward the multiplier,
  so a terrace pays its points without pumping the chain. The chain banks
  into the bag as today, and a crash still loses it: speed through the
  loose things, respect the anchored ones.
- **Boost**, a little per smash by weight (the brief: boost earned by
  risk).
- **Heat**: breaking public property is a crime, a point or three, times
  the police's sight (§13.3).
- **The bill**: each prop carries a sticker price (a lamp post 1,200, a
  hydrant 900, a bus shelter 2,500); the run's total is `CITY DAMAGE` on
  the door's wall and the mayhem job's measure. It is never the player's
  money: the city's cost, played for the joke.
- **The news**: the ticker names the damage ("PROPERTY DAMAGE IN CROWN
  HEIGHTS PASSES 10,000").
- **The long game**: a lifetime count (save version 5), two dailies
  (`SMASH 60 THINGS IN ONE RUN`, `FLATTEN 10 LAMP POSTS`), and Big Bernie's
  second requirement becomes `SMASH 300 THINGS` (his party bus that never
  yields; the jumps keep their hunt).

### 16.5 Everyone else

The police and every car on a physics body knock props by the same rule and
pay the same speed for them, so a café terrace is an escape tool: the
cruiser behind eats the tables too. Cars on their lanes push fallen things
off their path. The walkers treat a flying prop like a car and dive:
"never hit" holds for props by construction. Props never damage a car;
only what holds does, as a wall.

### 16.6 How it looks and sounds

Grounded, like everything since M1: glass shards from a shelter, paper
from a newsstand, fruit rolling from a stand, splinters from a pallet,
sparks from a post, and from a broken hydrant a water column for twenty
seconds that pushes a car with its real thrust (about 1.2 kN: the car
rocks in it, it does not fly). One synthesized voice per material (metal,
glass, wood, plastic, water). No screen effects.

### 16.7 What it moves and what it costs

Conversion: the first minute gains its spectacle (the cold open's van goes
through a café terrace before the billboard) and the cover its frame.
Play time: free roam pays every few seconds, and the pavement becomes a
choice with a price. Retention: a toy worth coming back to, and a named
requirement on the board. Cost: the frame on the low tier. Standing props
are drawn inside the city's existing chunk meshes (no extra draw call) and
simulate nothing; only what is down is separate (at most one draw per
type), and the pool caps the bodies. The first slice builds the mechanism
alone and measures it on the MX330 before any content lands.

### 16.8 What stays out

Destructible buildings, new districts, story missions, cop mode, multiplayer
(§8), traffic-light poles (the signals keep working), props on the highway,
the platform (M9).

### 16.9 What this changes elsewhere

- §11: M8 is the chaos, M9 the platform (decided by Marcin, 2026-09-24).
- §4 (mayhem) prices smashes by the bill; its zones are dressed as markets.
- §6.6: the cold open's footway run gains a café terrace and a newsstand
  before the billboard gate.
- §14.3: Big Bernie's second requirement.
- The balance is re-measured at the M8 gate and refitted if the smashes
  move its inputs.

## 17. M8.5 "The clean screen": what a twelve-year-old sees — set here, 2026-09-24

After the M8 slices Marcin brought a review of the screen: too dense for a
child. Stars, the bag with its multiplier, coins, the trick chain, the news,
the job line with its clock and its count, the arrow, the gear, the speed,
the boost, three counters (50/20/30) and the radar at once; seven tabs on
the garage wall; money under four names, BANK and CASH with two different
numbers on one screen; after M5 he himself did not know what to do after
the intro, and three milestones of systems have landed since; §3.1's rule,
"a twelve-year-old understands it from the HUD alone", never met a
twelve-year-old. His word: it is crowded and chaotic in the bad sense, and
a game going to CrazyGames cannot be made carelessly. The fix sits before
the platform, because M9's touch layer puts buttons on the same screen.
What the fix is, is set here (he overrides).

### 17.1 What the screen says today

Counted on the M7 gate's screens at 1280×720 (M8 adds the damage news to
the ticker and CITY DAMAGE to the wall's counts):

- **A calm drive** (no job, no stars): fourteen things. The goal line, the
  arrow, five stars, the bag `0 ×1`, the coins, the district and landmark
  names, the radar, the gear, the speed, `km/h`, the boost, BILLBOARDS 0/50,
  JUMPS 0/20, CACHES 0/30.
- **A job's first seconds on the chain**: twenty. The above, the step card,
  the combo and four NEAR MISS pops for the misses the combo already counts.
- **The busted card**: the stars' news over it; the radar, the speed and the
  three counters around it.
- **The door**: seven tabs; BAG, MULTIPLIER, BANKED, BEST RUN, BANK; the
  sentence, the first car's line, the counts, the WANTED poster; CASH in the
  footer. BANK and CASH differ by the coin pool (`funds` is the bank plus
  the coins, D14 of `docs/M5_PLAN.md`). The radar, the speed and the
  counters still show beside the wall.
- **Names**: money is COINS, BAG, BANK, CASH and BANKED; heat is the stars,
  LEVEL 3 (the news) and HEAT 3 (the dailies, the police car's card); the
  place the bag is banked is the GARAGE, the DOOR, the HIDEOUT, and a
  delivery ends at a DROP-OFF; the trick run is the SKILL CHAIN.
- **The key hints** name ` TUNING, the developer's panel, to every player,
  and the key opens it without `?dev=1`.

Why it happened: §3.1's test was run on each feature alone. Each milestone
added a system and gave it a place on the screen; none took one away. Why
it matters: the player is eleven to sixteen, gives the game thirty seconds,
and on a portal played worldwide often reads English slowly. A glyph, a
colour and a number are read before a word.

### 17.2 The rule: each corner answers one question

- **Top centre, what now?** The goal line, and the arrow in the world. A
  card, a caption or one message shows under the line for a moment and goes.
- **Top right, how hot and how much?** The stars; the bag with its ×; the
  bank.
- **Bottom left, where?** The radar.
- **Bottom right, the car.** The speed and the boost; the damage once dented.
- **Top left, the combo**, only while one runs.
- **The centre is the road**: the swap prompt, WRECKED, the ticket book and
  the busted card, nothing else.

A calm drive shows seven things: the line, the arrow, the stars, the bank,
the radar, the speed, the boost. Everything else appears when it happens
and goes:

- The bag appears with its first money, in a pop; a bag of `0` never shows.
  Its × appears at the first level that multiplies (×1.3, two stars): the
  moment that teaches it. `×1` never shows. The bag's place stays reserved,
  so the bank never jumps.
- The district's name shows for four seconds on entering one and at the
  drive-out.
- The three hunts leave the screen: a find pops with its count (BILLBOARD
  13/50, NEW JUMP 4/20, CACHE 5/30); the counts live on the wall's GOALS
  page and the full map.
- The gear goes (the box is automatic; the debug block keeps it). ONCOMING
  and the drift readout go (the combo's word says both). The job line loses
  its coin count (the coins are on the road; a fare's card says every coin
  is a tip).
- Behind a shut door and on the busted card the driving screen goes whole:
  the wall or the card has the screen.
- The key hints lose TUNING; the backtick opens the panel only with
  `?dev=1`.

### 17.3 One voice at a time

- **The top centre speaks only when it changes what you do**: the stars'
  news (led by the stars: `★★★ ROADBLOCKS UP`), a warning (ROADBLOCK AHEAD,
  HELICOPTER), the police's description of your car (SUSPECT IN A RED MUSCLE
  CAR, the identity rule's one teacher), a rival ready, the twins' new car.
  The evening news after a level and after an escape, UNIT DOWN, a rival
  driving by and the property damage news go: the screen tells those jokes
  better (the cruisers queue at the donut shop). Nothing speaks over the
  busted card.
- **One event, one text.** A trick the combo counts (a near miss, oncoming,
  a dodge, air, a smash) never pops: the combo shows it. The pops are what
  pays or counts outside it: TAKEDOWN!, a find with its count, FLASHED,
  COPS LOST YOU, the combo's end (COMBO +2,100), DAILY DONE, the streak,
  HIDDEN CAR, PURSUIT BREAKER. Two at a time at most.

### 17.4 One name for each thing

| The thing | On screen | Glyph | Never |
|---|---|---|---|
| money that is yours | BANK | the coin | CASH, FUNDS, COINS as a sum |
| money at risk in a run | BAG | the sack | — |
| what the stars do to the bag | ×1.3 … ×3 | — | MULTIPLIER |
| heat | the stars: `★★★`, 3 STARS | the star | HEAT, LEVEL |
| where the bag is banked | GARAGE | the house | DOOR, HIDEOUT |
| where a job ends | the ring the arrow points at | the arrow | DROP-OFF, MARK |
| the police | COPS; POLICE CAR for the car | — | UNITS, AIR UNIT |
| the trick run | COMBO | — | SKILL CHAIN, CHAIN |
| the booster that raises the bag's × | BAG BONUS | — | FENCE (a fence is a thing you smash) |

Names stay names: the districts, the rivals, the cars, the jobs, the kit.

The one change under the words: **a road coin goes into the bank.** The coin
pool was already the player's and already spent as one with the bank; two
numbers for one purse was the confusion. D14's reason holds (a child's money
is never at risk): the bank is never at risk either. `Run.coins` goes, the
save's v6 folds it into the bank, the garage spends the bank. The run still
counts its coins for the dailies and the wall. No amount moves.

### 17.5 The wall in four

TOTALS · CARS · STYLE · GOALS (was TOTALS, CARS, BOARD, STYLE, TUNE, PREP,
DAILIES).

- **TOTALS**: BANKED (GARAGE when the bag came in empty), with NEW BEST
  when it is one; one line of sums, the bag × the stars = +banked (busted:
  the bag, half kept); the sentence until step 4, now `CRIMES FILL THE BAG
  · STARS MULTIPLY IT · A GARAGE BANKS IT`; the next goal in one line; the
  run's counts. The footer: BANK and DRIVE OUT. The BANK line, BEST RUN
  and the WANTED poster leave: the footer holds the bank, GOALS the best
  run, and the poster answered no question at a door (the identity rule is
  taught where it acts: SUSPECT IN A RED MUSCLE CAR on the radio, the
  BORROW prompt's line).
- **CARS**: the cars, then the chosen car's POWER, GRIP and BOOST under
  them (TUNE's rows, under the car they belong to), then **for the next
  run** the lawyer and the fence (PREP's rows). Set at slice 3 instead of
  TOTALS: W on TOTALS drives out, so a row of buttons there would be one
  key away from spending by mistake; CARS is what you take out, and its
  footer holds DRIVE OUT too.
- **STYLE**: the paint and the kit as today.
- **GOALS**: the next goal; the day's three and the streak; the board (your
  place, the chips, the next rival in one line); the hunts, the trials'
  medals and the best run.

One rewarded offer on TOTALS: DOUBLE THE BAG (while it is open the wall
stays on TOTALS); the boosters' videos are CARS'. TOTALS fits 800×450
without scrolling; CARS and GOALS scroll like STYLE on a short screen.

### 17.6 The budget is fixed

- A new system gets no standing place on the driving screen: it speaks
  through the goal line, a card, the one message, a pop, the wall's GOALS
  page or the full map. `CLAUDE.md` carries this among the fixed decisions.
- M9's touch buttons take the thumbs' corners and carry no numbers.
- The gate counts: a calm drive shows exactly the seven; the top centre
  never more than the line and one card, caption or message; never more
  than two pops; no word on screen outside §17.4 but names.

### 17.7 The twelve-year-old's pass

There is no twelve-year-old to ask, so the gate plays one. On each state of
the screens suite the reviewer asks the five questions a child asks (what
do I do now, where, am I in trouble, how much have I got, what is it for)
and names the one thing on screen that answers each. A thing that answers
none is a defect; a question with two answers is a defect; a word a child
would have to ask about is a defect. The first five minutes are walked the
same way, from the cold open to the second door. This replaces §3.1's
feature-by-feature test with a whole-screen one; Marcin's playtest stays
the last word.

### 17.8 What stays out

No system is removed and no balance number moves; the cold open's route and
captions; the full map's layout; the job kinds; localisation (every word cut
here is one fewer to translate); the platform (M9).

### 17.9 What this changes elsewhere

- §2.2, §3.2 and D14: a road coin lands in the bank; the pools are one.
- §2.1: the stars' news leads with the stars.
- §3.1: the test is §17.7's.
- §13.3, §13.9: the ticker's lines are §17.3's.
- §13.4: the sentence's words.
- §11: M8.5 between M8 and M9, set here; the platform keeps its number.
- `CLAUDE.md`: the screen's budget among the fixed decisions.
- `docs/STYLE.md`: the corners replace the entries for the popups, the
  counters and the radar's label (slice 1).

## References

Burnout Paradise (free-route races, road rules, showtime), Need for Speed
Most Wanted 2005 (pursuit breakers, heat levels), Need for Speed Hot Pursuit
2010 (police in races), Midnight Club (order-free checkpoints), Forza Horizon
(skill chains, speed zones, barn finds), The Simpsons: Hit & Run (tone),
Driver: San Francisco (the swap), Chase HQ (suspect pursuit), Wreckfest
(derby), Trackmania (ghost time-attack), Gone in 60 Seconds (steal-to-order),
Sonic (the rings rule for the spill).
