# The bug hunt — the prompt

What a session does when Marcin says "szukaj błędów w grze" (or types `/bughunt`, optionally with a focus: `/bughunt
police`, `/bughunt the wall at 800x450`). Distilled from the two hunts of 2026-09-27 (`git log --grep="bug hunt"`):
what found real bugs, what wasted time. It runs only on his word; it is not a slice, so its searching (agents, probes,
stills) is allowed here and nowhere else (`CLAUDE.md`, Pace).

**The deliverable**: the clear, player-visible bugs fixed and pinned, the rest one line each in `docs/BACKLOG.md`, one
commit (two at most) pushed to main, eight lines in `docs/PROGRESS.md`, and a short answer to Marcin in Polish.
When he then says "popraw też te z backlogu", the same rules fix that backlog section.

## 0. Before anything (5 min)

1. Read `CLAUDE.md`, the top of `docs/PROGRESS.md`, `docs/BACKLOG.md`, `git log --oneline -20`.
2. Read what the earlier hunts fixed: `git log --grep="bug hunt" --format="%h %s%n%b"`. That list goes into every
   agent's brief as "do not re-report". A hunt that finds the same things twice is wasted.
3. Start `npm run verify` in the background (must be green). Never edit `src/` or `tests/` while it runs. Stop any
   preview you started on 4173 before it: its smoke reuses whatever answers there.
4. The focus: the argument if one was given (then brief only the agents that cover it, deeper); else all five areas.

## 1. Search (45 min of wall time at most, everything in parallel)

### 1.1 Five read-only review agents, launched in one message, in the background

Each brief carries: the game in three lines (an arcade open-world driving game, the island is the world since
2026-09-26, the grid behind `?map=grid`, axes +X west / +Z north), **read-only** (no edits, no commits, no verify, no
e2e, no server on 4173; a single-file `npx vitest run <file>` or a scratch probe outside the repo is allowed only to
settle a finding), the "do not re-report" list from 0.2, its area's hunting list below, and this output format:

> At most 15 findings, ranked by player impact, each: `file:line` — what is wrong; the concrete scenario and what the
> player sees; confidence high/medium (skip low); the fix in one line. Trace the call path from where the game really
> reaches the code (a leftover only counts if it runs). End with one paragraph on what you checked and found clean.

- **A — the sim on the island's heights and stacked roads.** Every check in plan only (x, z) where roads cross one over
  another: the highway over the quay sweep, the gardens' passage, Palm Avenue, both taxiways, the lighthouse road; in
  its tunnel under the serpentine and both quarry tracks; the dry canal under four road bridges. Who counts, busts,
  finishes, knocks, dodges, yields, spawns, picks up, is seen or lends a body across two levels. Grid leftovers: `y = 0`,
  `CITY_HALF`, the ring's ±675, `districtAt`, `map === 'grid'` guards, a respawn or a spawn put on the ground under a
  deck or inside the hill, a flat ray on a steep street. Heights along lanes and across junctions (`heightOn`, not a
  clamped `heightAt`), a lent body's height, AI cars that fall.
- **B — the render, the maps, the audio on the island.** Views streamed by chunk (by middle or by nearest edge, what pops
  in and where), what is built and never disposed, per-frame allocations in `update`/`sync`, the shadow map's reach (a
  lit tunnel, a pop), the camera against walls, decks and the near plane, effects and signs at the right height, the
  radar and the full map (projection, order of fills, the island's own shapes), sounds keyed to places.
- **C — the run's state machines.** Busted, the door, the card and the ad: what still runs under them (rings, clocks,
  rivals, chases). Swap, reset, wreck and respawn mid-job (orders, fares, duels, escapes, trials): what is repaired,
  cleared, paid twice or never. Records freed and reused inside one step, flags never cleared (`rival`, `badge`,
  `armour`, `bad`, `takenDown`), the radio's window, the chain's steps and cards, the dailies (what counts, exploits),
  the board's duels, pay and bag arithmetic, NaN.
- **D — the screen's text, the platform and the input.** Every string through `t()` with its `pl.ts` entry, cached
  values and sibling layers after a language switch, Polish word lengths in fixed-width cards, 800×450 overflow (the
  pause, the wall's pages, GOALS), what "press any key" really takes. `gameplayStart/Stop` pairs on every path (the
  wall clicked under the pause), ads, blur and visibility. Keys: `code` only, prevented defaults (Space, arrows, Tab,
  Enter), keys read while paused, **edge presses against the fixed step** (a press set in every step of a 30 fps frame
  ran twice; one read in a 144 Hz frame with no step was lost), keycaps and the layout map.
- **E — the lifecycle, the save and long sessions.** The loop after a hidden tab or a hitch, the pause's sound, the
  save (versions, corrupt text, blocked storage, two tabs, test pages writing the real profile), `island.bin` and the
  host's cache, WebGL context loss, resize, what grows over twenty minutes (arrays, listeners, audio nodes, GPU memory).

### 1.2 Headless probes, while the agents read

Scratch only, in `output/probe/` (git-ignored). Vitest swallows a probe's console: write the results to a file. A
config for probes outside `tests/`:

```ts
// output/probe/probe.config.mts; run: npx vitest run --config output/probe/probe.config.mts --root . <file>
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['output/probe/**/*.probe.test.ts'], environment: 'node', testTimeout: 3_600_000 } });
```

- **The chase** (it found the lent cars sunk into a hill's junction): an island world, seed 42, traffic and walkers on,
  heat 30, `new BotPolicy('skilled', new TrackBot('muscle', { ...CITY_BOT_TUNING, unblock: true }))` driving 300 s
  (close the busted card and open the door when they come). Every 0.5 s log, with the place and the time, at most three
  per spot: the player or any record NaN; anything more than 1.5 m under `island.ground.height()` (the physics' ground,
  the tunnel and the canal dug) or 25 m over it; a unit standing 20 s on a chase far from the player; the bot's resets;
  a step over 60 ms; money NaN or negative; and the events' counts. Another seed, `novice`, or heat 60 for a second run.
- **Trace a flagged spot**: the same seed is deterministic; run to the moment, log the record's state, lane, `s`, speed,
  `blocker` and height every step, and find the first bad step. Then read the code that wrote it.
- Compare with the right height: `ground.height` is the physics (dug), `ground.surfaceHeight` the drawn surface and the
  traffic's `roadAt`, `lanes.heightOn(lane, s, next)` a lane's road across its junction, `sim.floorBelow` the first
  solid under a point.

### 1.3 The real screen

The built-in browser pane does not draw while Claude's window is minimized, and real-time play there is too slow to
steer: use a scratch Playwright spec (`output/probe/`, a config with `testDir: '.'`, `baseURL` 4173 and `webServer:
npx vite preview --port 4173 --strictPort`, `reuseExistingServer: true`) against the verify's fresh `dist/`.

- In `?fresh=1&manual=1&coldopen=1&lang=pl` a pilot in the page steers the first minute by keys: hold W/A/D/S by
  `KeyboardEvent` on `window` toward `window.__game.sim.coldOpen.route.samples` a few samples ahead, then
  `window.advanceTime(17)`, a step at a time. A still every 5 s, and the state from `window.render_game_to_text()`.
- Stills at 800×450 and 1280×720: the calm drive, the pause and its settings, the wall's four pages (put the car at
  `sim.run.dropOffs[0]`: 40 m out, a bag, then 2 m out and `advanceTime(3600)` shuts the door), a chase at three stars
  (`sim.heat.add(60)`), the full map held. Look at every one; log the console's errors and warnings.

## 2. Where this game's bugs hide

Read each finding against these; most of the 2026-09-27 bugs were one of them.

- **Frame against step.** Anything in `App.frame` inside `loop.advance` runs 0 to 5 times a frame: an edge (`pressed`)
  set there twice; a one-shot sound or effect read from telemetry every frame struck again while paused or between steps.
- **Two levels.** A distance or an area in x and z where a deck, the tunnel or a bridge stacks two roads. The rule
  where one exists: a record's `y` within 3 m of the player's road (`probe.y - 0.5`), or the lane's own height there.
- **The grid's shape.** `y = 0`, ±675, `CITY_HALF`, district quadrants, a map-only branch; on the island, the events'
  `y` (many push 0: harmless for sounds, wrong for anything drawn there).
- **Past a lane's end.** `s` over the lane's length is on the junction's curve: a height, a heading or a limit read by a
  clamp there is the lane's end's.
- **Breaks.** The busted card, the door and the ad stop the player, not the sim: rings, clocks and rivals still step.
- **Swap, reset, respawn.** Each repairs, clears or moves something: what a job, a chase window or a pay rule read before.
- **Records.** Freed and filled again inside one traffic step; flags set for a duel, a chase or a prop and never cleared.
- **The pause.** Its veil lets the pointer through to the wall; its keys; its sound; its line and title after a switch.
- **Text.** A cache of a number or a label kept across a language switch; a sibling layer `relabel` never reaches; a
  Polish word in a 6 rem card; 450 px of height.
- **Streaming and light.** A chunk's things by its middle (pops at its border); the shadow map's box (±140 m across the
  sun, ±265 m along it); the near plane (0.6 m) under a slab.

Known false alarms, not bugs: the island's lap timer (its highway track has no gates, it never starts); a kinematic car
25 m over `ground.height` over the canal (it is on a bridge: compare the drawn surface); a unit standing far off in a
chase (a roadblock); MUSCLE CAR in English on the Polish screen (`pl.ts` keeps it); 6650 without a space (Polish writes
four digits whole).

## 3. Triage

- A finding counts when it is traced to `file:line` with a scenario a player can reach, or reproduced by a probe. Read
  the code yourself before fixing an agent's finding; two agents reporting the same thing is strong evidence.
- **Fix now**: seen by a player (a wrong screen, a lost press, a car in the ground, a bust from under a bridge), an
  exploit that skips the game (a duel won through a tunnel), money or progress lost; and a fix that is clear and local.
- **BACKLOG**: rare, cosmetic, design questions (a rule's intent), or a fix that needs a talk. One line each under
  `## The island (the Nth bug hunt, date)`: what, where it shows, the file.
- Never change a fixed decision of the brief (walkers always dodge, no standing HUD element, control never taken away).

## 4. Fix

- One pass over the fix-now list, file by file. Match the code's style: its comments say what the player saw.
- **Pin where the sim shows it**: a Vitest pin that fails without the fix (check it: `git stash push <file>`, run the
  pin, `git stash pop`). Share one world across a file's pins (`beforeAll`) to keep the quick verify quick; a pin over
  ~10 s goes to `*.long.test.ts`. Pin what the player sees (a car's height against the road, not a helper's return).
  A shader patch gets a text pin (its replacements matched), since a miss is silent.
- App, UI, audio and CSS fixes need no pin; a fix that changes the look gets one stills run, looked at.
- `npx tsc`, `npx eslint --fix` on the touched files, then **one** `npm run verify` in the background; green before the
  commit. The bake is re-made when `src/sim` changed (the build runs it, ~15 s).
- Commit only your own paths (never `git add -A`): `<areas>: the Nth bug hunt`, a body listing the fixes in plain words
  with their pins, `Verify green (N tests)`, the `Co-Authored-By:` line. Push with `timeout 90 git push origin HEAD:main`.

## 5. Report

- `docs/PROGRESS.md`: eight lines at most, newest first: how it searched, what it fixed (pins in brackets), "The rest in
  BACKLOG."
- To Marcin, in Polish, a few lines: that it is on main, the fixed bugs as a player meets them (plain words, no paths,
  no jargon), how many went to the backlog, the tests green. Nothing else unless he asks.

## 6. Traps met

- A bare `sleep` is blocked: wait on a log with an `until grep -q … ; do sleep 3; done` loop (in the background, or with
  a long timeout).
- Test titles with an apostrophe written through `node -e` or a heredoc lose their escapes: write files with the Write
  and Edit tools, or double-quote the title.
- `isolate: false`: every test file in a worker shares its modules; a pin that passes alone can fail in the full run when
  the world it shares was stepped first (run the whole file, not `-t`, before trusting it).
- The chase probe's step is ~1.6 ms; the verify's tests take 100 s alone and up to 460 s with five agents reading: run
  the probes after the verify's test stage, not beside it, when timing matters.
