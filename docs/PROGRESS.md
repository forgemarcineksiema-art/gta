# Progress log

Free-form session log: done, decided and why, next, open problems. Newest session first. Dates are absolute.

## 2026-09-25 — M8.9 slice 0: the pay label, the sign in the camera, the pause's veil

Done (R7, R12): `PayLabel` wrote its place only when it moved half a pixel from `NaN`, so it never did and sat in the
screen's top-left corner since M8.7 slice 3; now `moved()` is true from an unplaced point, and the label names the kind
in ink with the pay in yellow (UCIECZKA +3000, a rival by name). A sign whose face grows past 15 % of the screen's height
shrinks with its pole and is gone at 20 % (`signFold`, stateless by size: at the resting 60° that is 8.8 m to 6.6 m
from the camera), so driving through a ring never fills the screen. The pause is its own fixed layer on the UI's root
(z 45): its veil covers the line, the bag and the bank. Pins M8.9 0.1–0.4. Verify green; the stills come with slice 1.

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
