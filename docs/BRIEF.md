# BRIEF: open-world arcade driving game for CrazyGames

This file lives at `docs/BRIEF.md`. It states the intent for the whole project and will outlast any single session, so treat it as read-only. If you think something in it is wrong, tell me in a sentence or two with your evidence and keep working under it; don't edit it.

## 1. Roles and communication

You are the lead engineer and technical game designer. I'm Marcin: director, playtester, and the only human on the team. I'm an experienced solo developer with an engine-programming background (Rust), so be technical and direct and skip tutorials. When you recommend something, commit to one option and give the reason; don't hand me menus of alternatives.

Talk to me in Polish. Everything in the repository is in English: code, comments, docs, commit messages, in-game text. CrazyGames requires English localization, and English keeps the code consistent with the libraries' documentation.

## 2. Goal

Ship an original 3D browser game on CrazyGames that feels like a blend of four things:

- GTA: a seamless city to roam, any car you see can be yours, a wanted level that escalates.
- Need for Speed: police pursuits, street races, performance and visual tuning.
- Burnout: takedowns, boost earned by dangerous driving, crash spectacle, raw sense of speed.
- Saints Row: absurd humour, over-the-top activities, ridiculous customization.

Those titles describe a feel and nothing more. CrazyGames requires original names, assets and content, so nothing in the game may reference them: no real car brands or recognisable car likenesses, no borrowed names, logos, music or map layouts. Propose five working titles during M0; I'll pick one.

### What success means

CrazyGames puts every new game through a Basic Launch of 7 to 21 days and decides on Full Launch (where ads and revenue switch on) from three numbers. Their published marks for successful games are our targets:

| KPI | Target | What drives it |
|---|---|---|
| Conversion (still playing after 1 minute) | 80% or more | load under 10 s, small build, instant and legible onboarding |
| Average play time | 10 minutes or more | dense core loop, a clear next goal at all times |
| Day-1 retention | 10–15% | saved progress, unlocks, daily challenges, polish |

When you're unsure whether something is worth building, ask which of these three numbers it moves. If the answer is none, it goes to `docs/BACKLOG.md`.

## 3. Fixed design decisions

These are settled. Each one has a reason so you can apply its spirit to cases I didn't foresee.

**The player is always in a vehicle. No on-foot gameplay and no guns in v1.** On-foot play doubles the scope (character controller, animation, a second camera, combat) and is exactly where browser GTA-likes are weakest. Staying in the car also keeps us under the PEGI 12 ceiling, makes touch controls feasible, and lets the chase camera work without pointer lock, which sidesteps the problem of the mouse leaving the iframe. The "take any car" fantasy survives as **car-swap**: pull alongside any vehicle, press one key, a fast camera whip, and you're driving it while its former driver stands in the road shaking a fist. A swap gives you a fresh, undamaged car, so it is a tactical move during pursuits, not only a convenience.

**PEGI 12, slapstick tone.** Pedestrians always dive out of the way and can never be hit. No blood, drugs, gambling, sexual content or strong language. Violence is car against car and car against scenery. Police are comic antagonists; the helicopter carries a spotlight, not a gun.

**No menu before gameplay.** CrazyGames' Full Launch rules require landing in gameplay immediately (one click at most), and conversion depends on it. The game opens cold: the player is in a moving car in the middle of a chase within seconds of load. The first 60 seconds teach steer, boost, takedown, swap and escape through play, with keycap overlays and almost no text. It is skippable and never shown twice.

**One seamless city; everything starts in-world.** Activities begin by driving into a marker, not from a level-select screen. Free roam must pay out on its own: aim for something rewarding every 20–30 seconds (near miss, smash, collectible, heat change, stunt).

**Control is never taken away for more than 2 seconds.** Crash slow-motion is capped at 1.5 s and skippable; respawn is rolling. A car that lands on its roof rights itself; `R` resets to the nearest road.

**Desktop keyboard first, touch second**, with input abstracted from day one so touch is an added device, not a rewrite.

## 4. Systems for v1

Content targets: a city of roughly 1.5 × 1.5 km with four visually distinct districts and a highway loop; 8 vehicles across classes (compact, muscle, sports, heavy, plus an unlockable police car and one novelty vehicle); 6 activity types with about 5 instances each; 50 smashable billboards, 20 stunt jumps, 10 speed cameras.

- **Vehicle handling.** A custom arcade model on a Rapier rigid body: four raycast suspensions, a simplified tyre model with an explicit drift state, speed-sensitive steering, downforce, light air control. Keyboard input is digital, so steering needs rate limiting and speed-dependent authority or highway driving becomes twitchy. You may evaluate Rapier's built-in raycast vehicle controller, but the feel targets in M1 decide, not convenience. All tunables live in a typed `VehicleTuning` object, editable live in a dev-only panel.
- **Sense of speed.** FOV widening, camera pull-back and drop, subtle shake, cheap speed streaks, wind audio, dense roadside objects. Perceived speed matters more than the km/h figure.
- **Boost.** Earned by risk: near misses, oncoming lane, drifts, airtime, takedowns.
- **Takedowns and damage.** Ramming rivals and police into walls or traffic triggers a short takedown camera. Damage shows through detachable parts, smoke, then fire; a wrecked car forces a swap or respawn. Collisions with light props barely slow the player; heavy hits are crashes.
- **Traffic with simulation LOD.** Traffic follows lane splines kinematically and becomes a full physics body only near the player or on impact. Pedestrians are instanced, kinematic, and always dodge. This is what makes a living city affordable on a Chromebook.
- **Heat.** Five levels: patrol cars, interceptors, roadblocks, heavy units, helicopter spotlight. Escape by breaking line of sight and surviving a cooldown, or by reaching a respray shop. Boxed in and stopped for a few seconds means busted.
- **Activities, data-driven:** street race, pursuit escape, takedown rage (hit a takedown quota under a timer), mayhem (cause a cash amount of property damage under a timer), getaway delivery, stunt and collectible hunts.
- **Progression.** Cash and reputation; a garage with purchasable cars, performance upgrades and visual customization ranging from paint and wheels to silly roof toppers; district unlocks; three daily challenges and a login streak. All numbers live in one `balance.ts`, and a script simulates progression from assumed earnings per minute and prints the time to each unlock. Target: first new car within 5–7 minutes, then a meaningful unlock every 5–10 minutes through the first hour.
- **Save.** Versioned JSON with migrations and debounced writes. On CrazyGames it goes through the SDK's Data module (a localStorage-like API that syncs across devices for logged-in players and stores locally for guests; the SDK merges guest data on sign-in), so the whole save must stay well under its 1 MB cap. `LocalPlatform` uses plain localStorage.
- **Art direction.** Low-poly, flat-shaded, vertex colours or one shared palette texture, no per-asset textures. This keeps the download tiny and guarantees the consistent style CrazyGames' quality guidelines ask for. The city is generated procedurally from a seed; vehicles are either built in code from parametric profiles or taken from CC0 packs. Any third-party asset is recorded in `docs/ASSETS.md` with source URL and licence, and nothing without a clear licence goes in. During M0, write a one-page style guide (palette, time of day, lighting, UI typography) and commit to it. Avoid the generic default look; the cover thumbnail and first frame decide whether anyone plays.
- **Audio.** Engine sound synthesized in WebAudio from RPM and load; small SFX; music streamed after gameplay has started. One master mute hook for ads.

## 5. Tech stack and architecture

Fixed: TypeScript (strict), Three.js on WebGL2, Rapier 3D (WASM), Vite, Vitest, Playwright. UI is plain DOM and CSS over the canvas, with no UI framework. No editor-based engine: everything must be text you can build, run and test from a terminal, because that is the loop you work in. No WebGPU for now, because of Chromebooks and Safari. Every runtime dependency costs bytes, so each one gets a line of justification in `docs/ARCHITECTURE.md`.

Layering, enforced by lint rules on imports:

- `sim/`: game state, physics, vehicles, traffic, heat, activities. No Three.js and no DOM imports, so it runs headless in Node for tests.
- `render/`, `audio/`, `ui/`: read sim state and never write it.
- `input/`: devices mapped to abstract actions. Use `KeyboardEvent.code` so WASD positions work on AZERTY without configuration, and label keys through `navigator.keyboard.getLayoutMap()` where available. Arrow keys always work too. Prevent default on arrows and space so the page doesn't scroll. Don't bind anything essential to Escape (the browser uses it to leave fullscreen); pause on `P`, and also pause the sim on blur and `visibilitychange` (that automatic pause must not call the SDK's `gameplayStop`; see section 7).
- `platform/`: one `Platform` interface (init, loading start/stop, gameplay start/stop, midgame and rewarded ad requests returning a typed result, adblock check, save/load, locale, device type) with `CrazyGamesPlatform` and `LocalPlatform` implementations. `LocalPlatform` simulates ads with an overlay and can force each SDK error code via a query parameter, so every failure path is testable offline. Game code never touches `window.CrazyGames` directly, which also keeps other portals open later.

The simulation runs on a fixed 60 Hz step with an accumulator, capped substeps and render interpolation. CrazyGames explicitly requires physics to behave the same at 144 and 165 Hz, and a fixed step is also what makes the sim testable. Avoid per-frame allocations in hot loops; GC hitches ruin a driving game. Skip generic ECS frameworks and abstractions for hypothetical needs; plain typed arrays and modules are enough.

## 6. Budgets

Platform limits are the hard ceiling; our targets are far tighter because conversion depends on them. `npm run budget` fails the build when a target is exceeded.

| Budget | Our target | Platform limit |
|---|---|---|
| Bytes requested before the first gameplay-start event, measured uncompressed since we don't know how the platform counts | 8 MB, CI fails at 12 MB | 50 MB; 20 MB for the mobile homepage |
| Total build size / file count | 40 MB / 200 files | 250 MB / 1500 files |
| Time from navigation to a controllable car, on a 20 Mbit link with 4× CPU throttle | 6 s | top games load in under 10 s |
| Frame rate | 60 fps on a mid-range desktop iGPU; a stable 30+ on the low tier | must run smoothly on a 4 GB Chromebook or the game is disabled on ChromeOS |
| Draw calls / visible triangles | 150 / 250k on low, 300 / 600k on high | none |
| JS heap | 250 MB | none |

Quality tiers are chosen from a short startup benchmark and adjusted at runtime through dynamic resolution, shadow quality, traffic density and draw distance. Cap the device pixel ratio.

## 7. CrazyGames compliance

Before writing any platform code, read the current documentation and distil it into `docs/CRAZYGAMES.md` as a checklist with a status column that you keep up to date. The documentation is the source of truth; the summary below was checked on 2026-09-20 and may have drifted.

Read under `https://docs.crazygames.com/`: `requirements/intro`, `requirements/technical`, `requirements/gameplay`, `requirements/ads`, `requirements/account-integration`, `requirements/game-covers`, `requirements/quality`, `sdk/intro` (HTML5 v3), `sdk/game`, `sdk/video-ads`, `sdk/data`, `sdk/user`, `resources/basic-launch-metrics`, `resources/getting-to-the-first-frame`, `resources/monetizing-driving`, `resources/midgame-ads-pacing`, `resources/crazygames-app`, `resources/html5/common-fixes`, `resources/html5/sitelock`.

What I already know:

- The initial download is measured from load start to the first `gameplayStart()` call on the SDK's game module, so fire it at the moment the player gains control, not before and not later, and again on every resume. Call `gameplayStop()` on every game break the game itself creates (pause, menus, results, ads) but not on focus loss or tab switches; the platform tracks those itself. Bracket asset loading with `loadingStart()`/`loadingStop()`.
- Relative paths only (`base: './'` in Vite). The game runs in an iframe and must work in Chrome and Edge; it gets disabled on Safari if it misbehaves there.
- Text and UI must be legible at a device pixel ratio of 1 at these sizes: 821×462, 907×510, 1077×606, 1216×684 (desktop, not fullscreen); 1280×720, 1366×768, 1536×864, 1920×1080 (fullscreen); 800×450 (mobile); 1080×607 (tablet).
- No custom fullscreen button, no cross-promotion or external links, English required, additional locales follow the SDK's locale value.
- SDK v3 loads from `https://sdk.crazygames.com/crazygames-sdk-v3.js` and needs `await window.CrazyGames.SDK.init()` before use. It reports a `local` environment on localhost and is `disabled` on other domains, so the adapter must tolerate all three.
- Ads go through the SDK only, and they stay disabled during Basic Launch (the SDK answers with `adsDisabledBasicLaunch`). The game must play well with ads off, and there must be no rewarded-ad buttons that do nothing: hide them whenever ads are unavailable, including under adblock. Players with adblock must be able to play normally.
- Midgame ads belong at natural breaks (busted screen, activity results), never during driving and never on navigation buttons such as menu, settings or shop. Block input from the request until `adFinished` or `adError`. Mute on `adStarted`, not on request, and unmute on finish or error. The SDK throttles frequency itself (about one per three minutes), so request at every natural break and treat `adError` as a normal outcome.
- Rewarded ads are optional treats: double an activity payout, one second chance per activity, a daily cosmetic crate. Each offer needs a non-ad alternative (pay with cash), a decline button of equal size and style, a clear video icon, no offer during active driving, no offer after every failure, no chaining, and no reward on `adError`.
- Mobile: `user-select: none` on the body, safe-area padding for the CrazyGames app, and resuming the AudioContext inside a user gesture on iOS.

Design the ad placements into the loop from M4 onward, when busted and results screens first exist, even though real ads only switch on at Full Launch.

## 8. Verification

You can't feel whether the game is fun, but you can measure much more than a unit test suite usually does. Build these tools early and rely on them.

- **Headless sim tests (Vitest, Node).** Scripted input against `sim/`: 0–100 km/h time, top speed with and without boost, braking distance, a held drift staying within an angle band, no rollover when clipping a kerb at 100 km/h, a landed jump settling within a second, identical results when the render rate is simulated at 30, 60, 144 and 165 Hz, and a 10,000-step soak with no NaNs or escaped bodies. Once I approve the handling in M1, these tests pin it so later work can't silently change the feel.
- **Autopilot perf run.** `?bot=1&seed=42&duration=60` drives the road graph and records frame-time percentiles, `renderer.info` counts and heap into `window.__perf`. A Playwright script runs it under 4× CPU throttle via CDP, writes `perf/latest.json`, checks the budgets and flags regressions above 10% against the previous run. Headless software GL says little about real GPU cost, so treat these numbers as a CPU-side and regression signal; I'll supply real-device numbers with `npm run perf:headed`.
- **Screenshot review.** Playwright captures the HUD, pause, results and garage screens at every size in section 7. Look at the images yourself and fix what is illegible or overlapping.
- **Budget check.** `npm run budget` measures the bytes requested before gameplay-start, total size, file count, and scans the build for absolute paths.
- **`npm run verify`** runs typecheck, lint, sim tests, build, budget and a smoke test (loads, reaches gameplay-start, the bot drives for 20 s with no console errors). It must pass before every milestone gate and at the start of every session.

Keep tests to this list and to what a milestone explicitly calls for. Scratch scripts don't need to be committed.

## 9. Milestones

Each milestone ends in a playable build and a gate where you stop and I play. Work is a vertical slice every time.

- **M0 Foundations.** Repo, toolchain, `verify` pipeline, fixed-step loop, platform adapter with `LocalPlatform`, a flat test lot, debug HUD, style guide, five title proposals, and a `CLAUDE.md` that distils this brief's standing rules (language, layering, budgets, working method, where things live) so they survive context compaction.
- **M1 The car.** Handling, camera, boost, synthesized engine audio, and a test playground with a slalom, skidpad, ramps, kerbs and a long straight. Starting targets for the first car, to be tuned by playtest: 0–100 km/h in about 5 s, about 170 km/h top speed and about 230 with boost, a handbrake drift that is easy to start and hold with throttle and counter-steer, stable landings, stable highway driving on a keyboard. This milestone gets a disproportionate share of the effort. If driving a grey box around an empty lot isn't fun for five minutes, nothing built on top will rescue the game, so we don't move on until I say the car feels right.
- **M2 The city.** Procedural generation, chunk streaming, road graph with lanes, minimap, districts, fog and draw distance, first pass at quality tiers. Gate: budgets hold with the bot driving the whole map.
- **M3 Life.** Traffic with simulation LOD, dodging pedestrians, collisions, damage, car-swap, takedowns, near misses and the boost economy, collectibles.
- **M4 Heat.** Police AI, five heat levels, escape and respray, busted and wrecked flows, ad-break points wired through the adapter.
- **M5 The game.** Activities, progression, garage, save, daily challenges, the cold-open onboarding, UI and audio passes, the balance simulation.
- **M6 Platform.** `CrazyGamesPlatform`, full compliance checklist, touch controls, mobile tier and safe areas, the ≤ 20 MB mobile target confirmed, submission package (zip, description, control instructions, tags, a cover-art brief per the game-covers page). We submit for Basic Launch first and iterate on the three KPIs before anything else.

Things only I can do: judge feel, test on real hardware, use the CrazyGames developer portal and its preview and QA tools, choose the title, submit.

## 10. How to work

**Autonomy.** Work autonomously within a milestone. I am not watching the session in real time and can't answer questions mid-milestone, so a question like "should I…?" halts all work until I come back. For reversible actions that follow from this brief, decide, act, and note the assumption in `docs/PROGRESS.md`. If your last paragraph is a plan or a list of next steps, that is work to do now, not a place to stop; don't stop because the session is long. Stop only at a milestone gate, before a destructive or hard-to-reverse operation (deleting work, rewriting git history, anything outside this repo), when you want to change a fixed decision from this brief, or when you are blocked on something only I can provide. If one part is blocked, finish everything else first and then say exactly what is missing.

**Progress updates.** Before starting, say in a line what you're about to do, and post brief updates as you go so I can follow along when I do look. Command output is visible only to you, so put anything I need to read in your message.

**Gate report.** At each gate, write a message that stands on its own: what was built, `verify` and perf numbers, how to run it, a five-minute playtest script (what to try and what to watch for), the tuning knobs that matter and where they live, known issues, and your proposed scope for the next milestone.

**State across sessions.** Context will be compacted or restarted many times. Durable state lives in the repo: `CLAUDE.md` (standing rules), `docs/PROGRESS.md` (a free-form session log: done, decided and why, next, open problems), `docs/ARCHITECTURE.md` (structure and short decision records), `docs/BACKLOG.md`, `docs/CRAZYGAMES.md`, and git history. Commit small and often with descriptive messages; never leave significant work uncommitted. At the start of a session, read `CLAUDE.md` and `docs/PROGRESS.md`, check the last 15 commits, and run `npm run verify` before touching anything.

**Scope.** Build what the current milestone asks for, completely. A good idea outside it, a nearby bug that doesn't block the milestone, or a refactor you'd like to do goes to `docs/BACKLOG.md` with a line of context and gets a mention in the gate report. Implement the real behaviour rather than shaping code to make a test pass; if a test or a budget is wrong, say so instead of working around it. Never loosen a test or a budget just to get green.

**Edits.** Prefer targeted edits over rewriting whole files when the result is the same.

**Subagents.** Use them for independent workstreams that don't share state, such as reading the platform docs while you scaffold, and keep working while they run. Do small or sequential tasks directly.

**Research.** Three.js, Rapier and the CrazyGames SDK change between versions. Check the current docs and the installed package's types rather than relying on memory of an API.

## 11. Start

Do M0 and continue straight into M1; M0 has nothing for me to playtest. Stop at the M1 gate with the gate report.
