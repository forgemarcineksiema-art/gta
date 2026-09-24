# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

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
