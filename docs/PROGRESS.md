# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-25 — M8.9 slice 5: one colour, one meaning

Done (R1): `SIGNALS` in `sim/palette.ts` (money, way, trouble, police, ink, off, outline), the CSS's `:root` the same
(`--money` … `--outline`, `--panel`, and three non-signals: the backdrop, the ticket's paper and ink), `ui/colors.ts`
for the canvases. Every old accent moved by its meaning: selection, titles, the combo, a full boost, NEW BEST, the next
car, the streak, the hunts, the escape bar, the video icon, a kept car's frame, the next rival's chip and the tabs to
ink; the radar's player and highway, the garages and the landmarks to ink, a race's rivals red; a pop is yellow only when
it names money; the news' lead by its tone (the stars red, the radio blue, the rest ink); the stars ink, flashing red and
blue while seen. The +n stays till slice 8's meter. The look's chase is the skilled bot at three stars. Pins M8.9
5.1–5.5. Verify green; stills: the flash, the blue radio, the white tabs.

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
