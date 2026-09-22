# M6 "Platform" — milestone contract

For the agent who builds M6 after the M5 gate. Written 2026-09-22. The brief's
M6 line: `CrazyGamesPlatform`, the full compliance checklist, touch controls,
the mobile tier and safe areas, the ≤ 20 MB mobile target confirmed, the
submission package (zip, description, control instructions, tags, a cover-art
brief per the game-covers page). Then Basic Launch, and iteration on the three
KPIs before anything else. Design: `docs/DESIGN.md` §9. The checklist with the
SDK facts as read on 2026-09-20: `docs/CRAZYGAMES.md`. Standing rules:
`CLAUDE.md`. Work the slices in order; each ends in a commit with verify
green, a pin or an e2e check, and one measurement in `docs/PROGRESS.md`.

## 0. Ground rules that bite in this milestone

- The SDK is a script tag, not a package (`docs/CRAZYGAMES.md`: no official
  npm package exists). `await window.CrazyGames.SDK.init()` before any other
  call; nothing may run before it resolves. The adapter tolerates all three
  environments (`local`, `crazygames`, `disabled`) and a missing SDK (the
  script blocked or offline): a 3 s timeout on the script, then the game
  runs on a no-op adapter with `environment: 'disabled'`. The game never
  fails to start because of the platform.
- Game code never touches `window.CrazyGames`. Everything goes through the
  `Platform` interface that exists (`src/platform/Platform.ts`); the
  interface changes only if a documented SDK fact forces it, and then
  `LocalPlatform` changes with it.
- The docs drift. Slice 0 re-reads the SDK and requirement pages listed in
  `docs/CRAZYGAMES.md` and updates the checklist and the "facts that differ"
  table before writing the adapter; the 2026-09-20 read is the starting
  point, not the truth.
- `gameplayStart()` at control and on every resume from a game-made break;
  `gameplayStop()` on every game-made break and never on focus loss; the
  first `gameplayStart()` fixes the initial download measurement, so
  nothing heavy loads before it and the music bed streams after it.
- Input stays abstracted: touch is an `InputDevice` that writes the same
  `ActionState`; no game code learns about fingers. `KeyboardEvent.code`
  and the layout map stay as they are.
- Quality tiers never change the sim except through the one lever decision
  22 reserved for M6: traffic density on the mobile tier. Everything else
  about the mobile tier is rendering.
- No new runtime dependency for the sitelock or anything else; the
  obfuscation is hand-written, a few lines.
- Perf A/B as before; the M5 gate smoke and the mobile proxy run are the
  baselines.
- Stop at the gate, before destructive operations, or to change a brief
  fixed decision. Submission itself is Marcin's (the portal, the title, the
  covers).

## 1. Layout to add

```
index.html                        the SDK script tag with an onerror flag; the rotate overlay root
src/platform/sdk.d.ts             the minimal typings of the v3 API we use (game, ad, data, user.systemInfo, settings)
src/platform/CrazyGamesPlatform.ts the adapter: init with timeout, info, brackets, ads with callbacks → AdResult, data, mute setting
src/platform/DisabledPlatform.ts  the no-op adapter for a missing or disabled SDK (LocalPlatform without the overlay)
src/platform/sitelock.ts          isCrazyGames() per the docs plus localhost, 127.0.0.1 and the preview tool; obfuscated by hand
src/platform/index.ts             createPlatform(): CrazyGames when the SDK object exists and init resolves, else Local (dev) or Disabled
src/input/TouchDevice.ts          pointer events → actions; src/input/touchModel.ts the pure geometry (zones, dead band, lock), Node-tested
src/ui/touch.ts                   the control layer: steer zone, pedals, boost, handbrake, swap, reset, pause; safe-area padding
src/render/Renderer.ts            QUALITY.mobile and the tier choice from device type
src/sim/traffic/tuning.ts         TRAFFIC.agentsMobile / bodiesMobile (decision 22 revisited)
tools/package.mjs                 builds the submission zip, checks paths, size and count, writes the manifest into docs/SUBMISSION.md
docs/SUBMISSION.md                title, description, tags, controls text, the cover brief, the preview video spec, the QA log
tests/input/touch.test.ts, tests/platform/sitelock.test.ts, tests/platform/crazygames.test.ts (a mock SDK object)
e2e/platform.spec.ts              the adapter against a mocked window.CrazyGames injected before the page scripts; the disabled path
e2e/mobile.spec.ts                800×450 and 1080×607 with synthetic touches; the mobile perf proxy
```

## 2. Slices

### Slice 0 — the SDK re-read and `CrazyGamesPlatform`

- Re-read the pages in `docs/CRAZYGAMES.md` (the list at the top) and
  update the checklist, the API reference and the "facts that differ" table
  with the date. Then the adapter over v3: `init()` awaits the SDK with a
  3 s timeout and reports `environment`; `info()` from `user.systemInfo`
  (locale, device type, `applicationType` → `inApp`); the four brackets and
  `happytime`; `requestAd(type)` wraps the callbacks object into the
  `AdResult` promise and fans `adStarted` / `adFinished` / `adError` out to
  `onAdEvent` listeners; `adsAvailable` from `environment` and the last
  `adError` code (`adsDisabledBasicLaunch` and `adblock` hide the buttons
  until the next `init`); `hasAdblock`; `saveData` / `loadData` /
  `clearData` over the sync data module, reads only after `init`;
  `settings.muteAudio` and its listener drive the master gain like an ad
  mute. `sdk.d.ts` holds only what is used.
- `createPlatform()`: CrazyGames when `window.CrazyGames` exists, Local on
  localhost without it (dev), Disabled otherwise.
- Pins (Vitest with a mock SDK object; e2e with the mock injected before the
  page scripts): every method maps to the documented call; `disabled` never
  throws and the game reaches control; the brackets count matches
  `LocalPlatform`'s over the same scripted session; every ad error code
  maps to `AdResult`; the save round-trips through the data module; a
  missing SDK falls back inside 3 s and control is reached.
- Measurement: time to control on the preview build with the mock SDK
  against the M5 gate (the script tag and `init` are on the startup path).

### Slice 1 — the compliance sweep and the sitelock

- Walk `docs/CRAZYGAMES.md` row by row: T5–T17, G1–G10, A1–A13, D1–D6,
  L1–L5, F1–F4, X1–X4, S1–S4. Each row ends `done`, `n/a` with the reason,
  or `blocked` with what is missing. The account scenario is U1 scenario 1,
  no accounts, at launch: the save is guest data in the data module, the
  SDK migrates it on login by itself (D4), `addAuthListener` reloads the
  save so a login mid-session is not lost (U6).
- The sitelock: the documented `isCrazyGames()` check on the hostname, plus
  `localhost`, `127.0.0.1` and the preview tool's origin; on failure a blank
  page with one line, "Available on CrazyGames"; the check's strings are
  built from char codes and the function is not exported under a readable
  name. `?sitelock=off` never exists; the dev server passes because it is
  localhost.
- Pins: the sitelock accepts every domain in S4 and localhost, rejects
  `example.com` and a subdomain that merely contains the word; the
  visibility auto-pause never calls `gameplayStop` (exists, re-pinned with
  the real adapter's counters).
- Measurement: the checklist's counts per status, in PROGRESS.

### Slice 2 — touch controls

- `TouchDevice` implements `InputDevice` over pointer events with one
  pointer id per control; `touchModel.ts` is the pure geometry: the left
  third of the screen is the steer zone (horizontal drag from the touch-down
  point, dead band, full lock at `lockWidth`, the same rate limiting as the
  keyboard since the sim already shapes digital steering), the right side
  holds two pedals (throttle over brake, each at least 64 px at DPR 1),
  boost and handbrake above them, swap where the swap prompt sits (the
  prompt becomes the button), reset and pause in the top corners with a
  hold to reset. `label()` returns `''` so keycaps hide on touch.
- The layer shows when `platform.info().device` is not desktop or on the
  first pointer event of type touch, hides on the first `keydown`. The radar
  moves to the top-left on touch (BACKLOG UI note, one CSS rule).
  `touch-action: none` and `user-select: none` exist. The AudioContext
  resumes on `touchend` (exists).
- Pins (Node, on the model): positions map to actions with the dead band
  and the lock; two fingers do not steal each other's control; lifting a
  finger releases. e2e: a scripted touch sequence at 800×450 produces the
  expected `ActionState` values, drives the car 100 m and stops it.
- Measurement: Marcin on a phone over the LAN dev server, the first minute
  with a stopwatch; nothing else measures feel.

### Slice 3 — the mobile tier, safe areas, orientation, the 20 MB

- `QUALITY.mobile`: fog 80–260 m, shadows 512 or off (measured), DPR 1
  (the platform forces it on iOS anyway, T12), dynamic resolution floor
  0.6; `TRAFFIC.agentsMobile` 32 and `bodiesMobile` 12 (decision 22
  revisited: accepted that swap candidates and near misses thin a little on
  phones). Chosen by device type at boot, adjusted by the existing frame
  sampling.
- Safe areas: the CSS variables exist; the HUD's edge elements pad by them
  (X2, the CrazyGames app). Landscape only: a rotate overlay in portrait
  that pauses the sim without `gameplayStop` (T10). `inApp` from
  `applicationType` (X1).
- The 20 MB: a `mobile` row in `tools/budget.mjs` (bytes before
  gameplay-start ≤ 20 MB) so the mobile homepage eligibility is enforced,
  not assumed; today's 3.5 MB passes with margin.
- The mobile perf proxy: `npm run perf:mobile`, the bot 60 s at 800×450
  with 6× CPU throttle on the mobile tier; budget p95 ≤ 33.4 ms and 30 fps
  mean; recorded like `perf/latest.json`.
- Pins: the tier choice; the padding equals the inset in e2e with a
  simulated inset; the rotate overlay appears in portrait and pauses
  without a `gameplayStop`; the budget row.
- Measurement: the proxy run's numbers against the desktop low tier at 4×.

### Slice 4 — ads and data through the real adapter

- The door's midgame request and the rewarded offers from M5 run through
  `CrazyGamesPlatform` on the local environment (demo ads) and in the
  Preview tool: mute on `adStarted` only, input blocked until `adFinished`
  or `adError`, `adCooldown` treated as a normal outcome, no reward on
  `adError`, buttons hidden under `adblock` and `adsDisabledBasicLaunch`
  (A1–A13, M1–M3, P1–P3). The data module save with the `dataLimitExcedeed`
  code handled (log, keep playing, never lose the in-memory state).
- Pins (e2e, mock SDK): the event order per ad path; the mute node's gain
  during an ad; the reward only on `finished`; the save read after `init`
  only; the limit error handled.
- Measurement: the Preview tool session log in `docs/SUBMISSION.md` (dates,
  what was tried, what the SDK answered).

### Slice 5 — the submission package

- `tools/package.mjs`: builds, checks relative paths, total size and file
  count, zips `dist/` and writes the manifest (size, count, the commit) into
  `docs/SUBMISSION.md`. It fails on an absolute path, on the budget, on a
  forbidden word in the description.
- `docs/SUBMISSION.md`: the title (Marcin picks from `docs/TITLES.md`;
  blocked until then, the build says "Untitled Driving Game"); a one-line
  description that leads with the fantasy (DESIGN.md §1: the getaway driver
  who never keeps a car); the long description; tags (car, police chase,
  open world, driving, 3D, arcade); the controls text for keyboard and
  touch; the cover brief per the game-covers page (16:9 at 1920×1080, 2:3
  at 800×1200, 1:1 at 800×800; the swap moment: the player's car alongside
  a police car mid-whip, golden hour, the title as the only text, no
  screenshot, no borders, consistent art across the three); the preview
  video spec (15–20 s, both orientations, the opening frame equal to the
  cover, no black, no cursor, no sound); the QA log: Chrome and Edge clean,
  Safari behaving (T7), the ten sizes at DPR 1 (G1), the 4× throttle as the
  Chromebook proxy (T8), the Preview tool at the CrazyGames origin.
- Pins: the package script's three failures fire on a planted absolute
  path, an oversize file and a forbidden word.
- Measurement: the package's size and count.

### Slice 6 — the gate

- `verify` green with the new tests; `e2e/platform.spec.ts` and
  `e2e/mobile.spec.ts`; `npm run screens` at the ten sizes plus the touch
  layer at 800×450 and 1080×607; `npm run perf` A/B against the M5 gate and
  `npm run perf:mobile`; `docs/M6_REPORT.md` per `CLAUDE.md`;
  `docs/CRAZYGAMES.md` with every row `done`, `n/a` or `blocked` with a
  reason; decision records in ARCHITECTURE (the adapter's fallback ladder,
  the touch model, the mobile lever); BACKLOG; PROGRESS.
- Then Marcin submits for Basic Launch. The first data (conversion, play
  time, D1) decides update 1 versus update 2 first (DESIGN.md §11).

## 3. Numbers to start from

| Knob | Start | File |
|---|---|---|
| SDK init timeout | 3 s, then Disabled | platform/CrazyGamesPlatform.ts |
| touch steer | dead band 8 % of the zone width, full lock at 35 % of the screen width from the touch-down point | input/touchModel.ts |
| touch buttons | pedals ≥ 64 × 64 px at DPR 1; hold 0.6 s to reset | ui/touch.ts |
| mobile tier | fog 80–260 m, shadows 512 or off, DPR 1, resolution floor 0.6, 32 agents, 12 bodies | render/Renderer.ts, traffic/tuning.ts |
| mobile perf proxy | 800×450, 6× CPU throttle, p95 ≤ 33.4 ms, 30 fps mean | e2e/perf.spec.ts |
| mobile bytes | ≤ 20 MB before gameplay-start | tools/budget.mjs |

## 4. Five-minute playtest

On a phone over the LAN dev server: the cold open with the touch layer, a
swap by tapping the prompt, a drift on the handbrake button, a reset by
holding. Rotate to portrait: the overlay, the pause; back to landscape: the
resume. Switch apps and back: the engine resumes on the first tap. On the
desktop with `?ad=error&adError=adblock`: the offers are gone, the door still
works. In the Preview tool: a demo ad at the door, the mute during it, the
save surviving a reload. Report what felt wrong before what worked.
