# M8 "Platform" — implementation plan

Renumbered twice (Marcin): the brief's M6, it was M6 until 2026-09-23 (M6
became the wanted board, `docs/M6_PLAN.md`, DESIGN §14) and M7 until
2026-09-24 (M7 became the polish, `docs/M7_PLAN.md`, DESIGN §15); older docs
that say M6 or M7 for the platform mean this milestone. What M6 hands over:
the STYLE page's day's pick (one known kit item a day at half price) becomes
a rewarded offer here, free for a video with the half price as the equal
alternative (slice 4); the horn (H) wants a touch button beside boost
(slice 2). What M7 hands over: the save's version (4, with the settings;
slice 0 checks it through the Data module), the settings row on the pause
screen (the SDK's mute and the quality ride on it), the synthesized music
(no file to load: the loading brackets only wrap the city). The perf bases
below are the M7 gate's wherever they say M5's.

Executor: the agent that starts after the M7 gate. Reviewer: Claude, at the
gate. Director, tester on real devices and the one who submits: Marcin. This
document is the milestone contract: what to build, in which order, with
which numbers, and what "done" means; each fixed decision carries its
reason. Written 2026-09-22 against commit `ba9a12f`; the SDK facts it relies
on were read from docs.crazygames.com on 2026-09-20 (`docs/CRAZYGAMES.md`)
and slice 0 re-reads them before any adapter code exists.

Read, in this order, before touching anything: `CLAUDE.md`, `docs/BRIEF.md`
(§3, §5 the platform seam, §6 budgets, §7 compliance, §8, §10),
`docs/CRAZYGAMES.md` in full, `docs/DESIGN.md` §9, `docs/PROGRESS.md`
(newest first), `docs/M5_REPORT.md`, `docs/ARCHITECTURE.md`,
`docs/STYLE.md`, then this file. Run `npm run verify`; green before the
first edit.

## 0. How to work on this milestone

- **Language, cadence, autonomy, scope, honesty, research, perf**: as in
  `docs/M5_PLAN.md` §0. One slice at a time, commit per slice with verify
  green and the measurement in PROGRESS, stop only at the gate or where the
  brief says to.
- **The docs are the truth and they drift.** Every SDK call in this plan is
  named the way `docs/CRAZYGAMES.md` recorded it; before writing the
  adapter the executor re-reads the pages listed at the top of that file,
  updates the checklist and the "facts that differ" table with the new
  date, and changes this plan's §8 where the docs moved. A method that the
  live docs no longer document is not called.
- **Never break the offline game.** Every slice must leave `npm run dev`
  and the whole test suite working with no SDK present; the platform is a
  seam, and the game behind it is what the tests cover.
- **Things only Marcin does**: the developer portal, the Preview tool
  session on the CrazyGames origin, real phones and the laptop, the title,
  the covers, the submission. The plan produces the package and the QA log
  for him.

## 1. Scope

Brief §9 (its M6, this M8): *"M6 Platform. `CrazyGamesPlatform`, full compliance checklist,
touch controls, mobile tier and safe areas, the ≤ 20 MB mobile target
confirmed, submission package (zip, description, control instructions,
tags, a cover-art brief per the game-covers page). We submit for Basic
Launch first and iterate on the three KPIs before anything else."*

### 1.1 In scope (gate-critical, §4 slices 0–6)

1. `CrazyGamesPlatform` over SDK v3 with a fallback ladder (SDK → local →
   disabled) and a mock-SDK test harness.
2. The compliance sweep: every row of `docs/CRAZYGAMES.md` ends `done`,
   `n/a` or `blocked` with a reason; the sitelock.
3. Touch controls as an `InputDevice` over a pure, Node-tested model; the
   control layer in DOM; keycaps hidden on touch.
4. The mobile tier (rendering plus the one traffic lever), safe-area
   padding, the landscape-only rotate overlay, the 20 MB budget row, the
   mobile perf proxy.
5. Ads and data end to end through the real adapter on the local
   environment and in the Preview tool.
6. The submission package script, `docs/SUBMISSION.md` (description, tags,
   controls, the cover brief, the video spec, the QA log).
7. The gate; then Marcin submits for Basic Launch.

### 1.2 Delivered by M5 and assumed here

The save through `Platform.saveData/loadData` (one key), the door's and the
garage's ad calls through `Platform.requestAd` with the input block and the
mute, `adsAvailable` hiding the video buttons, the seen flag, the ten-size
screens spec with ten states, `npm run game`. Slice 0 checks each.

As built in M5 (docs/M5_REPORT.md; read before slice 0):

- The save's key is `save` (`BALANCE.save.key`), one document of 0.4–1.1 kB,
  written at the door, the busted card, the drive-out, `pagehide`, a hidden
  tab and the cold open's start; a stored document of a newer version is
  never written over (`SaveStore.unknownRaw`). The Data module maps onto the
  same three calls.
- Rewarded ads: the door's DOUBLE THE BAG (above an 8,000 bag, once a door)
  and the wall's PREP page (the lawyer, the fence); midgame at the door when
  there is no offer and at the busted card; none at the session's first door.
  `adsAvailable('rewarded')` hides every video button: the SDK adapter must
  return false there when `hasAdblock()` is true (CRAZYGAMES.md A12).
- The wall is `ui/garage.ts`: every item is already a DOM button with the
  key's handler and the panel takes pointer events, so touch gets the
  garage by tapping; the driving controls are the touch work.
- The screens spec shoots ten states (hud, pause, life, bar, busted, door,
  job, garage, dailies, cold) at the ten sizes; `npm run game` has nine cases.
- The app reads the local date for the dailies (`?date=` overrides); test
  sessions without it draw no dailies and man every police site.
- `?job=<id|kind>` and `?bot=job` exist for tests; `?fresh=1` clears the save.

### 1.3 Out of scope

Accounts (scenario 1, no accounts, D5), banners, in-game purchases,
multiplayer rooms, a backend, WebGPU, a second locale (English only at
launch; the `locale` value is read and logged for later), the CrazyGames
app's payment flows, any new dependency, any change to `docs/BRIEF.md`,
update 1 and update 2 content.

### 1.4 Fixed by the brief and still binding

Everything in `docs/M5_PLAN.md` §1.4, plus: relative paths only; works in
an iframe; Chrome and Edge clean; Safari must not misbehave; no custom
fullscreen button; no external links; nothing bound to Escape; pause on
`P`; auto-pause on blur and `visibilitychange` without `gameplayStop`;
prevent default on arrows and space; UI legible at DPR 1 at the ten sizes.

## 2. Decisions (fixed for M8; each with its reason)

D1. **The SDK is a script tag in `index.html`, awaited with a timeout, and
the adapter ladder is CrazyGames → Local → Disabled.** `createPlatform()`
returns `CrazyGamesPlatform` when `window.CrazyGames?.SDK` exists and
`init()` resolves inside `sdkInitTimeoutMs`; `LocalPlatform` on localhost
without an SDK (dev and tests); `DisabledPlatform` (no overlay, no-op
brackets, `environment: 'disabled'`, `adsAvailable` false, `localStorage`
save) everywhere else. Reason: `docs/CRAZYGAMES.md` says the script tag is
the only documented install and `init()` must be awaited; a blocked script
(adblock, offline, a mirror) must not stop the game; the SDK itself reports
`disabled` off-portal and throws on calls, so a no-op adapter is the only
safe shape there.

D2. **`sdk.d.ts` is ours and minimal.** No official types exist; the file
declares only the members this plan uses, in the shapes the docs give
(`isUserAccountAvailable` and `systemInfo` are properties; `requestAd` takes
a callbacks object; the data module is sync). Reason: a hand-written
typing is a checked list of what we depend on, and it fails to compile when
a re-read of the docs changes a shape.

D3. **The mock SDK is the test double for the whole milestone.** An init
script (`e2e/mockSdk.ts` injected with `page.addInitScript`) defines
`window.CrazyGames.SDK` with the v3 shape, records every call into
`window.__sdkCalls`, and answers ads and data by parameters in the URL
(`?sdk=local|crazygames|disabled|missing`, `?sdkAd=finished|<code>`).
Reason: the real SDK cannot run in Playwright against localhost with
production behaviour; the mock makes every path deterministic and the
brackets countable, and the same mock serves the Vitest unit tests of the
adapter in Node.

D4. **Touch is an `InputDevice` over a pure model.** `touchModel.ts` holds
the layout and the mapping (zones from width, height and safe insets;
pointer position to steer value; hit test to control) with no DOM;
`TouchDevice` binds pointer events and writes `raw` like the keyboard.
Reason: brief §5 (devices map to abstract actions; touch is an added
device, not a rewrite); the model gets Node pins the way `minimapModel` did,
and the DOM layer stays thin.

D5. **Account scenario 1: no accounts.** `getUser`, `showAuthPrompt`,
tokens and friends are not called. The save is guest data in the data
module; the SDK migrates it on login by itself (D4 in the checklist);
`addAuthListener` reloads the save so a mid-session login is not lost.
Reason: nothing in the launch minimum needs an identity; every account
feature is a compliance surface (U1–U6) with no KPI behind it at Basic
Launch.

D6. **The mobile tier changes rendering plus one sim number.** `QUALITY.
mobile` (fog, shadows, DPR, the resolution floor) and `TRAFFIC.mobile`
(agents 32, bodies 12) chosen by device type at boot; the sim is otherwise
identical. Reason: decision 22 (M3) reserved exactly this lever for the platform milestone; the
body pool is the one CPU cost that scales with the phone, and thinner
traffic on a phone reads as fair (fewer swap candidates, fewer near misses)
where a slower step does not.

D7. **Landscape only, with a rotate overlay.** Portrait shows a full-screen
"ROTATE" card and pauses the sim without `gameplayStop`. Reason: T10 allows
portrait only with black bars or side art, and a driving HUD in portrait
fails the ten-size legibility rule anyway; the overlay is cheaper than a
portrait layout and honest.

D8. **The sitelock is the documented check, obfuscated by hand.** Strings
from char codes, the function unnamed, the result read once at boot; on
failure a blank page with one line. Reason: S1 and S2 ask for it and for
obfuscation; a dependency (obfuscator.io) costs bytes and a build step for
a few lines of protection that only needs to survive a text search.

D9. **The mobile perf proxy is the bot at 800×450 under 6× CPU throttle on
the mobile tier.** Reason: no phone runs in CI; a heavier throttle at the
mobile size on the MX330 is a repeatable CPU-side signal with the same
caveats as the desktop proxy, and Marcin's phone is the real number.

D10. **The package is built by a script that can fail.** `tools/package.mjs`
builds, checks paths, size and count, scans the description for forbidden
words, zips, and writes the manifest. Reason: the submission is a one-shot
by a human; the checks that a human forgets belong in the tool.

D11. **English only at launch; the locale is read and kept.** Reason: G3
requires English and accuracy for any extra language; a second locale is a
translation project with a KPI question behind it, and the SDK's `locale`
costs nothing to log now.

## 3. Architecture

### 3.1 New and changed modules

```
index.html                         the SDK script tag with onerror → window.__sdkFailed = true; the rotate overlay root; the touch root
src/platform/sdk.d.ts              declare namespace CrazyGamesSdk { … } for the members we use (§3.3)
src/platform/CrazyGamesPlatform.ts init with timeout, info, brackets, ads → AdResult, data, the mute setting listener, addAuthListener → reload hook
src/platform/DisabledPlatform.ts   no-op brackets, adsAvailable false, requestAd → { status: 'error', code: 'unavailable' }, localStorage save
src/platform/sitelock.ts           allowed(hostname): boolean; the obfuscated form; read once in main.ts
src/platform/index.ts              createPlatform(): the ladder of D1; exports the three adapters
src/main.ts                        the sitelock gate before App.boot; the blank page path
src/input/touchModel.ts            TouchLayout, layout(w, h, safe), steerValue(x, originX, w), hitTest(layout, x, y): Control | null
src/input/TouchDevice.ts           pointer events → raw actions; one pointer per control; label() → ''
src/ui/touch.ts                    the control layer DOM (zones and buttons), safe-area padding, show/hide rules, the swap prompt as a button
src/ui/rotate.ts                   the portrait overlay
src/ui/styles.css                  touch layer, rotate overlay, safe-area padding on HUD edges, radar top-left on touch
src/render/Renderer.ts             QUALITY.mobile, the tier from device type, the resolution floor per tier
src/sim/traffic/tuning.ts          TRAFFIC.mobile: { agents: 32, physicsBodies: 12 }; SimWorldOptions.tier?: 'desktop' | 'mobile'
src/app/App.ts                     device type → tier, the touch device, the rotate overlay, the mute setting, the auth reload, the date tick unchanged
src/audio/EngineAudio.ts           resume on touchend (exists), setMuted from the SDK setting
tools/budget.mjs                   + mobile row: bytes before gameplay-start ≤ 20 MB
tools/package.mjs                  build, check, zip dist/ → release/<name>-<version>.zip, write the manifest into docs/SUBMISSION.md
docs/SUBMISSION.md                 title, descriptions, tags, controls text, the cover brief, the video spec, the QA log, the manifest
e2e/mockSdk.ts                     the init script (D3)
e2e/platform.spec.ts               the adapter on every environment, the brackets, the ad paths, the data round trip, the sitelock, the fallback timing
e2e/mobile.spec.ts                 800×450 and 1080×607 with hasTouch: synthetic touches drive the car; the rotate overlay; safe-area padding
e2e/perf.spec.ts                   PERF_MOBILE=1: 800×450, 6× throttle, the mobile tier; `npm run perf:mobile`
tests/input/touch.test.ts          the model
tests/platform/sitelock.test.ts    the domain list
tests/platform/crazygames.test.ts  the adapter over the mock SDK object in Node
tests/platform/disabled.test.ts    the no-op adapter
```

### 3.2 Boot order with the SDK

```
index.html: <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js" onerror="window.__sdkFailed=true"></script>
main.ts:    if (!sitelock.allowed(location.hostname)) → blank page, stop
            App.boot(canvas)
App.boot:   platform = createPlatform()               // waits ≤ sdkInitTimeoutMs for window.CrazyGames or __sdkFailed
            info = await platform.init()              // SDK: await SDK.init(); environment; systemInfo
            platform.loadingStart()
            save = await SaveStore.load()             // data module reads only after init (D5 in the checklist)
            initPhysics(); new SimWorld({ …, tier: info.device === 'desktop' ? 'desktop' : 'mobile', save })
            new App(…)                                // touch device added when device !== 'desktop' or on the first touch pointer
            platform.loadingStop()
            first controllable frame → platform.gameplayStart()
```

Nothing before `gameplayStart()` grows except the script tag itself (about
30 kB from the SDK host; it counts toward the initial download by the
platform's own rule, and the budget row for mobile accounts for it).

### 3.3 Contracts (signatures the reviewer will check against)

```ts
// src/platform/sdk.d.ts (the members we use; re-checked against the live docs in slice 0)
declare namespace CrazyGamesSdk {
  type Environment = 'local' | 'crazygames' | 'disabled';
  interface AdCallbacks { adStarted?: () => void; adFinished?: () => void; adError?: (error: { code: string; message: string }) => void }
  interface SystemInfo { countryCode: string; locale: string; device: { type: 'desktop' | 'tablet' | 'mobile' }; os: { name: string; version: string }; browser: { name: string; version: string }; applicationType: 'google_play_store' | 'apple_store' | 'pwa' | 'web' }
  interface Sdk {
    init(): Promise<void>;
    environment: Environment;
    game: { gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void; happytime(): void;
            settings: { disableChat: boolean; muteAudio: boolean }; addSettingsChangeListener(fn: (s: { muteAudio: boolean }) => void): void };
    ad: { requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void; hasAdblock(): Promise<boolean> };
    data: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; clear(): void };
    user: { systemInfo: SystemInfo; addAuthListener(fn: (user: unknown) => void): void; isUserAccountAvailable: boolean };
  }
}
declare global { interface Window { CrazyGames?: { SDK: CrazyGamesSdk.Sdk }; __sdkFailed?: boolean } }
```

```ts
// src/platform/CrazyGamesPlatform.ts
export class CrazyGamesPlatform implements Platform {
  readonly name: 'crazygames';
  constructor(sdk: CrazyGamesSdk.Sdk, opts?: { onAuth?: () => void; onMute?: (muted: boolean) => void });
  init(): Promise<PlatformInfo>;                 // await sdk.init(); never throws: a throw → environment 'disabled', calls become no-ops
  info(): PlatformInfo;                          // name, environment, locale, device, inApp (applicationType in app stores)
  loadingStart(); loadingStop(); gameplayStart(); gameplayStop(); happyTime();   // no-ops when disabled
  adsAvailable(type: AdType): boolean;           // false when disabled, after 'adsDisabledBasicLaunch' or 'adblock', or while an ad runs
  requestAd(type: AdType): Promise<AdResult>;    // callbacks → promise; adStarted/adFinished/adError fanned out to onAdEvent listeners; serialised
  onAdEvent(listener): () => void;
  hasAdblock(): Promise<boolean>;
  saveData(key, value): Promise<void>;           // setItem; a throw with code 'dataLimitExcedeed' → resolves, logs once, sets `dataLimitHit`
  loadData(key): Promise<string | null>;         // getItem after init
  clearData(key): Promise<void>;
  readonly dataLimitHit: boolean;
  readonly lastAdError: AdErrorCode | null;
}

// src/platform/DisabledPlatform.ts
export class DisabledPlatform implements Platform { /* info(): name 'crazygames', environment 'disabled': the build is the portal build running off the portal; `PlatformName` needs no new member */ }

// src/platform/index.ts
export function createPlatform(opts?: { timeoutMs?: number; now?: () => number }): Platform;   // sync return of a lazy adapter whose init() performs the wait

// src/platform/sitelock.ts
export function allowed(hostname: string): boolean;   // exported under this name only from the module; main.ts imports it as a namespace member
```

`Platform` itself (`src/platform/Platform.ts`) does not change unless slice 0
finds a documented fact that forces it; if it does, `LocalPlatform` and the
mock change in the same commit.

```ts
// src/input/touchModel.ts
export type Control = 'steer' | 'throttle' | 'brake' | 'boost' | 'handbrake' | 'swap' | 'reset' | 'pause';
export interface Rect { x: number; y: number; w: number; h: number }
export interface TouchLayout { steer: Rect; buttons: Record<Exclude<Control, 'steer'>, Rect> }
export interface SafeInsets { top: number; right: number; bottom: number; left: number }
export function layout(width: number, height: number, safe: SafeInsets, t?: TouchTuning): TouchLayout;   // pure; DPR-independent CSS px
export function steerValue(x: number, originX: number, width: number, t?: TouchTuning): number;         // -1..1 with the dead band and the lock width
export function hitTest(l: TouchLayout, x: number, y: number): Control | null;

// src/input/TouchDevice.ts
export class TouchDevice implements InputDevice {
  constructor(target: HTMLElement, getLayout: () => TouchLayout, tuning?: TouchTuning);
  read(raw: Record<Action, number>): void;      // steer → steerLeft/steerRight; buttons → their actions; reset after `holdToReset` s
  label(action: Action): string;                // '' (keycaps hide)
  readonly active: boolean;                     // any pointer down
  dispose(): void;
}
```

```ts
// src/ui/touch.ts
export class TouchLayer { constructor(parent: HTMLElement, input: InputManager); show(): void; hide(): void; readonly visible: boolean; layout(): TouchLayout; update(sim: SimWorld): void /* the swap prompt button follows Life.swapCandidate */ }
// src/ui/rotate.ts
export class RotateOverlay { constructor(parent: HTMLElement, onChange: (portrait: boolean) => void); dispose(): void }
```

### 3.4 Tuning objects (every number lives here; the touch and tier ones in the dev panel)

```ts
// src/input/touchModel.ts
export interface TouchTuning { steerZoneWidth: 0.34; deadBand: 0.08; lockWidth: 0.35; buttonPx: 64; gapPx: 12; holdToReset: 0.6; edgePx: 16 }
// steerZoneWidth: the left share of the screen that steers; lockWidth: share of the screen width from the touch-down point to full lock
// src/platform/index.ts
export const PLATFORM = { sdkInitTimeoutMs: 3000 };
// src/render/Renderer.ts
QUALITY.mobile = { far: 260, near: 80, dpr: 1, shadow: 512, resolutionFloor: 0.6 };   // shadow 0 if the proxy needs it, measured in slice 3
// src/sim/traffic/tuning.ts
TRAFFIC.mobile = { agents: 32, physicsBodies: 12 };
// tools/budget.mjs
BUDGET.mobileStartupBytes = 20 * 1024 * 1024;
// e2e/perf.spec.ts (PERF_MOBILE=1)
{ width: 800, height: 450, throttle: 6, frameP95Ms: 33.4, fpsMeanMin: 30 }
```

## 4. Slices

### Slice 0 — the SDK re-read and `CrazyGamesPlatform` (2 days)

Files: `docs/CRAZYGAMES.md`, `index.html`, `src/platform/sdk.d.ts`,
`CrazyGamesPlatform.ts`, `DisabledPlatform.ts`, `index.ts`, `src/main.ts`,
`App.ts`, `e2e/mockSdk.ts`, `e2e/platform.spec.ts`,
`tests/platform/crazygames.test.ts`, `disabled.test.ts`.

Behaviour:

- Re-read the pages named at the top of `docs/CRAZYGAMES.md`; update every
  row whose wording changed, the API reference and the "facts that differ"
  table with the new date; amend §3.3 here where a shape moved.
- The script tag per §3.2, in `<head>`, synchronous as the docs show, with
  `onerror`. `createPlatform` waits until `window.CrazyGames` exists or
  `__sdkFailed` or the timeout, then builds the adapter; on localhost with
  no SDK it returns `LocalPlatform` (unchanged dev experience).
- The adapter per §3.3. `requestAd` serialises requests (a second call
  while one runs resolves `{ status: 'error', code: 'other' }` at once and
  is logged), maps every documented code to `AdErrorCode`, and sets
  `lastAdError` so `adsAvailable` hides buttons after
  `adsDisabledBasicLaunch` or `adblock` until the next `init`. `saveData`
  catches the `dataLimitExcedeed` error, resolves, sets `dataLimitHit`, logs
  once; the game keeps its in-memory state and keeps trying at the next
  flush. The mute setting: `settings.muteAudio` at init and on change →
  `onMute`, which `App` wires to `EngineAudio.setMuted` (the user's `M`
  cannot un-mute a platform mute; the toast says so). `addAuthListener` →
  `onAuth` → `App` reloads the save through `SaveStore.load` and `apply`
  at the next door (never mid-drive: control is never taken).
- `DisabledPlatform`: no-ops, `adsAvailable` false, `requestAd` →
  `unavailable`, the save on `localStorage` like `LocalPlatform` (so an
  off-portal mirror still keeps progress), no overlay.
- The mock (`e2e/mockSdk.ts`): `window.CrazyGames.SDK` with the §3.3 shape;
  `init()` resolves after 50 ms; `environment` from `?sdk=`; `requestAd`
  calls `adStarted` after 20 ms then `adFinished` after `?adDuration` or
  `adError({ code })` from `?sdkAd=`; `data` is an in-memory map that
  throws `{ code: 'dataLimitExcedeed' }` when `?sdkData=full`; `systemInfo`
  from `?device=`, `?locale=`, `?app=`; every call appended to
  `window.__sdkCalls` as `[name, ...args]`. `?sdk=missing` defines nothing
  and sets `__sdkFailed` after 100 ms.

Numbers: `sdkInitTimeoutMs` 3000.

Tests:

- `crazygames.test.ts` (Node, the same mock object built directly): 0.1
  every `Platform` method maps to the documented SDK call with the right
  arguments (`gameplayStart` → `game.gameplayStart`, `happyTime` →
  `game.happytime`, …); 0.2 `init` on an SDK whose `init` rejects yields
  `environment 'disabled'` and every later call is a no-op that does not
  throw; 0.3 each error code maps and `finished` maps; 0.4 a second
  `requestAd` while one runs resolves `other` at once and the first still
  finishes; 0.5 `adsAvailable('rewarded')` is false after `adblock` and
  after `adsDisabledBasicLaunch`, true after `unfilled`; 0.6 `saveData` on
  the limit error resolves and sets `dataLimitHit`; 0.7 `onMute` fires with
  the initial setting and on change; 0.8 `onAuth` fires on the listener.
- `disabled.test.ts`: 0.9 no-ops, `unavailable`, the localStorage-free
  save path in Node (an injectable store).
- `e2e/platform.spec.ts`: 0.10 `?sdk=crazygames`: `__sdkCalls` holds
  exactly one `init` before any other call, one `loadingStart` and
  `loadingStop`, one `gameplayStart` at control, and the counts match
  `LocalPlatform`'s over the same scripted session (a pause and resume, a
  door); 0.11 `?sdk=disabled`: control is reached, no SDK call after
  `init`; 0.12 `?sdk=missing`: control inside `sdkInitTimeoutMs + 1 s`;
  0.13 `?sdk=crazygames&sdkAd=finished` at a door: the order `requestAd`,
  `adStarted`, mute, `adFinished`, unmute, reward; 0.14 `sdkAd=adblock`:
  no reward, unmute, the video buttons hidden afterwards; 0.15
  `sdkData=full`: the game continues, `dataLimitHit` true, no error in the
  console log (a warning is allowed once).

Acceptance: verify green; time to control on the preview build with the
mock at `?sdk=crazygames` against the M5 gate (the script tag and `init`
are on the startup path; the difference goes into PROGRESS).

### Slice 1 — the compliance sweep and the sitelock (1 day)

Files: `docs/CRAZYGAMES.md`, `src/platform/sitelock.ts`, `src/main.ts`,
`index.html` (the blank page line), `tests/platform/sitelock.test.ts`,
`e2e/platform.spec.ts`.

Behaviour:

- Every row of the checklist visited and set: T5 (external files: none),
  T7 (Safari: Marcin's run, `blocked` until then), T8 (the 4× proxy and the
  laptop), T9, T10 (slice 3), T15 (Basic Launch with SDK: `gameplayStart`
  at control; ads are still requested at every door and busted card and
  answered `adsDisabledBasicLaunch`, which A13 names as the normal path, so
  nothing in the game branches on the launch phase), T16 (sitelock), G3 (English; locale logged), G5, G6, G9,
  G10, D1–D6, L3–L5, X1–X4 (slice 3), S1–S4, U1–U8 (scenario 1, `n/a` with
  the reason), M1–M4, P1–P3, Q1–Q5. Each `done` names the file or the test.
- The sitelock per D8: `allowed(hostname)` true for `localhost`,
  `127.0.0.1`, any host whose dot-split parts contain `crazygames` at index
  ≥ `parts.length − 3` (the documented rule, which covers every domain in
  S4 and the Preview tool's origin), false otherwise; `main.ts` renders one
  line "Available on CrazyGames" and stops before `App.boot`. The check is
  built from char codes and the module exports one unnamed default function
  re-exported under `allowed` by `index.ts` only.

Tests: 1.1 `allowed` for every S4 domain, `www.crazygames.com`,
`games.crazygames.com`, `localhost`, `127.0.0.1` → true; `example.com`,
`crazygames.example.com` (the word deeper than the last three parts),
`notcrazygames.com` → false; 1.2 the source of `sitelock.ts` contains
neither the string `crazygames` nor `localhost` (the obfuscation pin); e2e
1.3 the blank page on a spoofed hostname (Playwright `page.route` on a
non-allowed origin serving the build).

Acceptance: verify green; the checklist's counts per status in PROGRESS
(target: zero `todo`).

### Slice 2 — touch controls (2.5 days)

Files: `src/input/touchModel.ts`, `TouchDevice.ts`, `src/ui/touch.ts`,
`styles.css`, `App.ts`, `ui/hud.ts` (keycaps hidden on touch, the swap
prompt as the button), `ui/minimap.ts` (position), `tests/input/touch.test.ts`,
`e2e/mobile.spec.ts`.

Behaviour:

- Layout (`layout(w, h, safe)`): the steer zone is the left
  `steerZoneWidth` of the width, full height under the HUD's top band;
  pedals on the right edge: throttle above brake, each `buttonPx` square
  scaled up to 12 % of the height, `edgePx + safe.right` from the edge;
  boost and handbrake left of the pedals; swap at the swap prompt's place
  (bottom centre); reset and pause in the top corners inside the safe
  insets. Everything in CSS px; the DOM positions its elements from the same
  layout so the hit test and the visuals cannot disagree.
- Steering: on pointer-down in the zone the origin is the touch point;
  `steerValue` is 0 inside `deadBand × w`, then linear to ±1 at
  `lockWidth × w`; the sim's keyboard rate limiting and speed-sensitive
  lock apply unchanged (the device writes 0..1 into `steerLeft` /
  `steerRight` like a key). Pedals are digital (1 while held). Reset needs
  a hold of `holdToReset`; pause is a tap. Each control owns at most one
  `pointerId`; a second finger on the same control is ignored; lifting
  releases; `pointercancel` releases everything.
- Visibility: the layer shows when `platform.info().device !== 'desktop'`
  or on the first `pointerdown` with `pointerType === 'touch'`, hides on
  the first `keydown`; keycap hints hide with it (`label()` returns `''`
  and `InputManager.label` falls through to the keyboard's only when the
  keyboard is first in the device list, so the touch device is added
  first when it shows). The radar moves to the top-left while the layer is
  visible (one CSS class on `.minimap`).
- `touch-action: none` and `user-select: none` exist on the body; the
  AudioContext resumes on `touchend` (exists).

Numbers: §3.4 `TouchTuning`.

Tests:

- `touch.test.ts` (Node, the model): 2.1 `layout` at 800×450 with zero
  insets puts every button inside the viewport, none overlapping, pedals
  ≥ 64 px; with insets of 44/0/34/0 (a notch and a home bar) everything
  moves inside them; 2.2 `steerValue` is 0 within the dead band, ±1 at the
  lock width, linear between, clamped beyond; 2.3 `hitTest` returns the
  control under each button's centre and `null` between them and in the
  HUD band; 2.4 `TouchDevice` with a fake target: a down in the zone then a
  move to the right writes `steerRight` and not `steerLeft`; a second
  pointer on the throttle adds `throttle` without touching steer; lifting
  the first clears steer; `pointercancel` clears all; a reset hold shorter
  than `holdToReset` does nothing.
- `e2e/mobile.spec.ts` (a context with `hasTouch: true`, viewport 800×450,
  `?device=mobile&sdk=local`): 2.5 the layer is visible and the keycap
  hints are not; 2.6 `page.touchscreen.tap` on the throttle for 3 s of sim
  time moves the car 30 m forward; a steer drag turns the heading by more
  than 20°; the brake stops it; 2.7 at 1080×607 the same, and the layer
  does not cover the stars or the bag; 2.8 a `keydown` hides the layer.

Acceptance: verify green; the screens spec adds `touch-800x450.png` and
`touch-1080x607.png`, inspected; Marcin's first minute on a phone over the
LAN dev server with a stopwatch in PROGRESS (his numbers, not the
executor's).

### Slice 3 — the mobile tier, safe areas, orientation, the 20 MB (1.5 days)

Files: `src/render/Renderer.ts`, `CityView.ts` (`QUALITY.mobile`),
`src/sim/traffic/tuning.ts`, `SimWorld.ts` (`tier`), `App.ts`,
`src/ui/rotate.ts`, `styles.css`, `tools/budget.mjs`, `e2e/perf.spec.ts`,
`package.json` (`perf:mobile`), `e2e/mobile.spec.ts`.

Behaviour:

- `QUALITY.mobile` per §3.4, selected when `info.device !== 'desktop'`; the
  frame sampler may still step between `mobile` and `low`, never to `high`,
  on a phone. The resolution floor per tier (the existing dynamic
  resolution, floor 0.6 on mobile). `TRAFFIC.mobile` through
  `SimWorldOptions.tier` at construction (the pool sizes are constructor
  numbers; decision 22 revisited in ARCHITECTURE).
- Safe areas: the HUD's edge elements (stars, bag, speedo, radar, popups,
  the touch buttons) pad by the four CSS variables; `viewport-fit=cover` is
  in `index.html`. `inApp` from `applicationType` sets a class on the body
  for anything the app needs later.
- Orientation: `matchMedia('(orientation: portrait)')` → the overlay
  ("ROTATE YOUR DEVICE", one icon, no text beyond that), the sim paused as
  on focus loss (no `gameplayStop`), input blocked; back to landscape
  resumes. Desktop never shows it (a narrow window is not a phone: gate on
  `device !== 'desktop'`).
- The budget: a `mobile` row in `tools/budget.mjs` reporting bytes before
  gameplay-start against 20 MB, from the same `perf/startup.json`, plus the
  SDK script's size estimated as 32 kB when the smoke ran without it.
- `npm run perf:mobile`: `PERF_MOBILE=1 playwright test e2e/perf.spec.ts`
  at 800×450, `?device=mobile&bot=1&seed=42&duration=60`, CDP throttle 6,
  the budgets of §3.4, output `perf/mobile.json`.

Numbers: §3.4.

Tests: 3.1 (Vitest) `SimWorld({ tier: 'mobile' })` has 32 agents and 12
bodies, `'desktop'` 48 and 16, and the city tour pins are unaffected (they
pass no tier); e2e 3.2 `?device=mobile`: `renderer.quality` starts `mobile`
and never reads `high` over 30 s; 3.3 with an emulated inset (a CSS
variable override through `page.addStyleTag`) the stars' bounding box is
inside the inset; 3.4 a portrait viewport (450×800, `?device=mobile`) shows
the overlay and freezes `sim.tick`, landscape hides it and the tick moves,
`platformCalls.gameplayStop` unchanged; 3.5 `tools/budget.mjs` prints the
mobile row and it passes.

Acceptance: verify green; the proxy run's fps, p95, draws, tris and step
p95 in PROGRESS beside the desktop 4× numbers; `QUALITY.mobile.shadow` set
from what the proxy showed (512 or 0), with the numbers.

### Slice 4 — ads and data through the real adapter (1 day)

Files: `App.ts`, `ui/run.ts`, `ui/garage.ts`, `e2e/platform.spec.ts`,
`docs/SUBMISSION.md` (the QA log starts here).

Behaviour: the M5 flows unchanged in logic, exercised through
`CrazyGamesPlatform`: the door's midgame or rewarded offer, the garage's
prep offers, the busted card's midgame; `input.blocked` from the request to
the terminal event; the master gain to 0 on `adStarted` only; `adCooldown`
and `unfilled` are silent normal outcomes; after `adblock` or
`adsDisabledBasicLaunch` the video buttons stay hidden for the session; the
save through the data module with `dataLimitHit` handled. Then the same by
hand on the local environment (`npm run dev` with the real SDK script:
`environment 'local'` shows demo ads) and in the Preview tool on Marcin's
account, logged.

Tests (e2e, the mock): 4.1 the busted card with `sdkAd=finished`: one
`requestAd('midgame')`, the order of events, the gain; 4.2 the door with a
bag above the threshold and `sdkAd=adCooldown`: the rewarded request errors,
the bag banks at ×1 of its multiplier, no second request; 4.3 the garage
lawyer with `sdkAd=unfilled`: no item, the cash button still buys it; 4.4
the save round trip across a reload through the mock's data map; 4.5
`?sdk=crazygames` with the mock reporting `environment 'crazygames'` and
`sdkAd=adsDisabledBasicLaunch`: the first door's request errors silently
and every video button is hidden afterwards.

Acceptance: verify green; the local-environment demo ad session and the
Preview tool session logged in `docs/SUBMISSION.md` with dates.

### Slice 5 — the submission package (1 day)

Files: `tools/package.mjs`, `package.json` (`package`), `docs/SUBMISSION.md`,
`index.html` (title and meta description from the chosen title),
`docs/TITLES.md` (the pick recorded).

Behaviour:

- `npm run package`: `vite build`, then the budget checks, then a scan of
  every text file in `dist/` for absolute paths (the budget's regexes) and
  of `docs/SUBMISSION.md`'s description block for forbidden words (the
  reference names of brief §2, "Play now", "New", "Updated", any URL), then
  `release/<name>-<version>.zip` with `dist/` at the root and relative
  paths, then the manifest (size, count, the commit, the date) appended to
  the QA log. Fails on any check.
- `docs/SUBMISSION.md`: the title (Marcin's pick; `blocked` until then and
  the build says "Untitled Driving Game"); the one-line description leading
  with the fantasy (`docs/DESIGN.md` §1); the long description (under 600
  characters, the run, the swap, the police, the city); tags: car, police
  chase, open world, driving, 3D, arcade; the controls text for keyboard
  (`W A S D` / arrows, Space handbrake, Shift boost, E swap, R reset, P
  pause, M mute) and touch (steer left, pedals right, the buttons); the
  cover brief per C1–C5 (16:9 at 1920×1080, 2:3 at 800×1200, 1:1 at
  800×800; the swap moment: the player's car alongside a police cruiser
  mid-whip on the Crown diagonal at golden hour, the driver's fist in the
  road, the title as the only text, no borders, no screenshot, the same
  art on all three); the preview video spec (15–20 s, landscape 1080p 16:9
  and portrait 1080p 2:3, the opening frame equal to the cover, no black,
  no logos, no cursor, no text, no sound; a shot list: the whip, a
  takedown with the slow motion, a roadblock, the door); the QA log
  (Chrome and Edge clean at the ten sizes, Safari's behaviour, the 4×
  proxy and the laptop for the Chromebook line, the phone, the Preview
  tool sessions).

Tests: 5.1 `tools/package.mjs` fails on a planted absolute path in a temp
build, on a planted 41 MB file, on a planted "Play now" in the description
block; passes clean (the test drives the script's functions, exported for
it, not the whole build).

Acceptance: the zip built, its size and count in PROGRESS; `SUBMISSION.md`
complete except the title if Marcin has not picked.

### Slice 6 — the gate (1 day)

`npm run verify` green; `npm run platform` (the e2e) and `npm run mobile`
green; `npm run game`, `city`, `life` still green; `npm run screens` with
the touch states, inspected; `npm run perf` A/B against the M5 gate and
`npm run perf:mobile`; `docs/M8_REPORT.md` per `CLAUDE.md` including the
submission steps for Marcin (portal fields, the zip, the covers, the video);
`docs/CRAZYGAMES.md` with no `todo` row; ARCHITECTURE decision records (the
ladder, the mock as the test double, the touch model, the mobile lever,
scenario 1, the sitelock); BACKLOG; PROGRESS. Then Marcin submits.

## 5. Verification

### 5.1 Headless tests (Vitest, Node)

`tests/platform/*.test.ts` build the adapter over the mock SDK object
directly (no browser); `tests/input/touch.test.ts` drives the model and the
device with a fake event target; `SimWorld({ tier })` is one Vitest case.
No existing pin changes. About 30 new tests.

### 5.2 `e2e/platform.spec.ts` and `e2e/mobile.spec.ts`

Both against the preview build with the mock injected by `addInitScript`
(the real SDK script tag is present in `index.html`, so the specs route
`https://sdk.crazygames.com/**` to an empty 200 response with
`page.route`, and the mock defines the object instead). `mobile.spec.ts`
uses a browser context with `hasTouch: true` and `isMobile: true`, the
`?device=mobile` parameter for the adapter, and `page.touchscreen` for
taps; drags are pointer sequences through `page.mouse` on a touch context
(Playwright sends touch-typed pointer events there), and if that proves
false in 1.63 the spec dispatches `PointerEvent`s with `pointerType:
'touch'` through `page.evaluate` and says so.

### 5.3 Screens

The seven M5 states at the ten sizes plus `touch` at 800×450 and 1080×607
and `rotate` at 450×800; all inspected at the gate.

### 5.4 Performance protocol

Bases: the M5 gate's two desktop runs and the first two `perf:mobile` runs
on the M5 gate commit (taken in slice 3 before the tier lands, on the low
tier at 800×450 and 6×, as the "before"). After slices 0, 2 and 3 run the
desktop perf once and the mobile proxy once; at the gate twice each. The
desktop expectation is no change (the platform is not on the frame path;
the touch layer is DOM that repaints only on change). The mobile tier is
expected to be faster than `low` at the same size by the fog and shadow
cuts; a slower result is a bug.

### 5.5 Budgets that must hold at the gate

| Check | Limit | Where |
|---|---|---|
| `npm run verify:gate` | green, lint 0 warnings, the long pins included | tools/verify.mjs |
| Startup bytes before gameplay-start | ≤ 8 MB target, 12 MB fail | tools/budget.mjs |
| Mobile startup bytes | ≤ 20 MB (the SDK script counted) | tools/budget.mjs, new row |
| Total build / files | ≤ 40 MB / 200 | tools/budget.mjs |
| Time to control, 20 Mbit + CPU ×4, mock SDK present | ≤ 6 s | e2e/city.spec.ts |
| Fallback to Disabled with a missing SDK | control inside 4 s on top of the normal boot | e2e/platform.spec.ts |
| Desktop frame p95 under 4×, real GPU | < 33.4 ms | e2e/perf.spec.ts |
| Mobile proxy: frame p95 under 6× at 800×450 | < 33.4 ms, mean ≥ 30 fps | e2e/perf.spec.ts (PERF_MOBILE) |
| Sim step p95 under throttle | < 12 ms on both | e2e/perf.spec.ts |
| JS heap | ≤ 250 MB (expect well under 100 on mobile) | perf |
| `docs/CRAZYGAMES.md` | zero `todo` rows | slice 1 |

## 6. Records

PROGRESS entries per session as before. `docs/M8_REPORT.md`: built, verify
and both perf runs, how to run (including `npm run dev` with the real SDK
on localhost and the Preview tool steps), the five-minute playtest (§9), the
knobs, known issues, the submission checklist for Marcin, and the proposed
first update from the KPI reading order in `docs/DESIGN.md` §11.

## 7. Gate criteria (definition of done for M8)

1. Slices 0–5 committed with their tests.
2. `verify:gate`, `platform`, `mobile`, `game`, `city`, `life`, `screens`,
   `perf`, `perf:mobile` green; the images inspected.
3. Every budget in §5.5 holds; both perf comparisons per §5.4.
4. The game reaches control on `?sdk=crazygames`, `?sdk=local`,
   `?sdk=disabled` and `?sdk=missing`, and with the real SDK on
   `localhost` (`environment 'local'`, demo ads).
5. No SDK member outside `sdk.d.ts` is touched; no `window.CrazyGames`
   outside `src/platform/`; the sitelock pins pass; no new dependency;
   `docs/BRIEF.md` untouched; every M1–M5 pin unchanged.
6. The touch layer is playable by Marcin on a phone for a full run; his
   notes are in PROGRESS.
7. `docs/CRAZYGAMES.md` has no `todo` row; `docs/SUBMISSION.md` is complete
   except what only Marcin can fill; the zip exists and passed the script.
8. `docs/M8_REPORT.md`, ARCHITECTURE records, BACKLOG, PROGRESS.

## 8. API facts and traps

From `docs/CRAZYGAMES.md` as read on 2026-09-20 (re-verified in slice 0) and
the code at `ba9a12f`:

- SDK v3: `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">`
  in `<head>`; `await window.CrazyGames.SDK.init()` before anything;
  `SDK.environment` is `local` on localhost / 127.0.0.1 (demo ads),
  `crazygames` on the portal, `disabled` elsewhere (calls throw there).
  `game.gameplayStart/Stop`, `loadingStart/Stop`, `happytime` (lowercase
  t), `settings.muteAudio` with `addSettingsChangeListener`;
  `ad.requestAd(type, { adStarted, adFinished, adError })` is callbacks,
  not a promise; error codes `adsDisabledBasicLaunch`, `unfilled`,
  `adblock`, `adCooldown`, `other`; `ad.hasAdblock()` async;
  `data.getItem/setItem/removeItem/clear` sync, 1,048,576 bytes of JSON,
  error code `dataLimitExcedeed` (sic), debounced 1–30 s, preloaded at
  `init`; `user.systemInfo` and `user.isUserAccountAvailable` are
  properties; `user.addAuthListener` fires on login only. Sitelock:
  `parts.indexOf('crazygames') !== -1 && index >= parts.length - 3`.
  Legibility sizes: the ten in `docs/CRAZYGAMES.md`. The initial download
  is measured to the first `gameplayStart()`. Basic Launch: ads answer
  `adsDisabledBasicLaunch`; request anyway.
- No official npm package; no official types; the script tag is the only
  install (`docs/CRAZYGAMES.md` "SDK v3 API reference").
- `Platform` (`src/platform/Platform.ts`): `AdErrorCode` already includes
  `unavailable`; `PlatformInfo` has `inApp`; `LocalPlatform` reads
  `?device=`, `?locale=`; `createPlatform()` is sync today and stays sync
  (the wait moves into the adapter's `init`).
- `App.boot` (`src/app/App.ts`): `createPlatform()` → `await init()` →
  `loadingStart` → physics → sim → `App` → `loadingStop`; the first
  controllable frame calls `gameplayStart()` once (`started`); the
  auto-pause on blur / `visibilitychange` calls no SDK method; the user
  pause calls `gameplayStop/Start`. `GameHandle.platformCalls` is what the
  specs read; the CrazyGames adapter must expose the same counters.
- Input: `InputManager.addDevice`, `label` falls through devices in order;
  `KeyboardDevice` prevents default on Space and the arrows and latches
  taps; `ActionState` edges are per frame. `InputManager.blocked` is the ad
  window.
- Renderer: `QUALITY` in `src/render/CityView.ts` (`low`, `high` with
  `far`, `near`, `dpr`, `shadow`); the tier sampler in `Renderer.ts`
  (`qualityLocked` from `?quality=`, hysteresis 3 s windows, cooldown 15
  s, DPR from `QUALITY[tier].dpr × resolutionScale`); `pedView.setShadows`
  by tier. A third tier is one more key and one more branch in the sampler.
- CSS: `--safe-top/right/bottom/left` from `env()` exist in `styles.css`;
  `user-select: none` and `touch-action: none` on the body;
  `viewport-fit=cover` in `index.html`; `--minimap-size` for the radar.
- Audio: `EngineAudio.setMuted(bool)` and `toggleUserMute()`; the context
  resumes on `keydown`, `pointerdown`, `touchstart`, `touchend`, `click`.
- Tools: `tools/budget.mjs` reads `perf/startup.json` (from the smoke run)
  with `bytesBeforeGameplayStart` and the request list; `tools/verify.mjs`
  runs `playwright test e2e/smoke.spec.ts` as the smoke stage; the smoke
  asserts `gameplayStart === 1` and `loadingStart/Stop === 1`.
- Playwright 1.63 (`playwright.config.ts`): Chromium only, `vite preview`
  on 4173, GPU flags; CDP `Emulation.setCPUThrottlingRate` for the
  throttle; `test.use({ hasTouch: true, isMobile: true, viewport })` per
  spec; `page.touchscreen.tap(x, y)`; `page.addInitScript` runs before any
  page script; `page.route` can answer the SDK URL. Check the installed
  `@playwright/test` types for `touchscreen` and `hasTouch` before writing
  the mobile spec.
- Traps: the SDK script in `<head>` is on the startup path and counted;
  never `await` it longer than the timeout. `exactOptionalPropertyTypes`
  bites on the callbacks object (pass all three). `env()` values are `0px`
  outside the app; the emulated-inset test sets the variables directly.
  A narrow desktop window matches `(orientation: portrait)`: gate the
  overlay on the device type. `pointerType` for a mouse is `'mouse'`: the
  layer must not show on a click. The sitelock must not run in Vitest
  (`main.ts` only). Never write `crazygames` as a string in the sitelock
  source (the obfuscation pin greps for it).

## 9. Five-minute playtest script (for the gate report)

1. On a phone over the LAN (`npm run dev -- --host`): the cold open with
   the touch layer, the swap by tapping the prompt, a drift on the handbrake
   button, a reset by holding; the radar top-left, nothing under a thumb.
2. Rotate to portrait: the overlay, the pause; back: the resume. Switch
   apps and back: the engine resumes on the first tap.
3. On the desktop with the real SDK on localhost: a demo ad at the door,
   the mute during it, the reward after; with `?ad=off` in the local
   adapter the video buttons are gone and the cash ones work.
4. In the Preview tool: the same door, the save surviving a reload, the ten
   sizes in the responsive iframe.
5. Report what felt wrong before what worked: the steer zone's width and
   dead band, the pedal size, the overlay's tone, anything that looked
   different at DPR 1 on the phone.

## 10. Reviewer checklist (Claude, at the gate)

- Contracts of §3.3; `sdk.d.ts` matches the docs as re-read in slice 0 and
  contains nothing unused; no `window.CrazyGames` outside `src/platform/`.
- The ladder: every environment reaches control; the timeout; the disabled
  adapter's save path; the mute setting's precedence over `M`.
- The checklist: zero `todo`; each `done` names its evidence; each `n/a`
  its reason; each `blocked` what Marcin does.
- Touch: the model's pins, the device's pointer ownership, the layer's
  show/hide rules, keycaps hidden, the radar moved, safe insets honoured.
- The mobile tier: rendering only plus the one traffic lever; the tour pins
  untouched; the proxy numbers with the shadow decision explained.
- Ads and data on every mock path with the event order quoted; no reward
  on error; buttons hidden after `adblock` and `adsDisabledBasicLaunch`.
- The package: the script's checks proven by the planted failures; the zip
  inspected (relative paths, file count); `SUBMISSION.md` complete.
- Perf per §5.4 with all runs quoted; the fallback timing; the startup
  delta from the script tag.
- Docs: ARCHITECTURE records, STYLE (the touch layer and the overlay),
  README (touch controls, `perf:mobile`, `package`), BACKLOG, PROGRESS,
  `M8_REPORT.md` with the submission steps.
- Then Marcin submits; the first KPI reading decides update 1 versus
  update 2 (`docs/DESIGN.md` §11).
