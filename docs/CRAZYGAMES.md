# CrazyGames compliance checklist

Checked on 2026-09-20 against docs.crazygames.com. The docs are the source of truth; this file is our checklist.

Status legend: `todo` (not done), `done` (implemented and verified), `n/a` (does not apply to this game), `blocked` (waiting on something external), `info` (pure information, no action).

Pages read (all fetched successfully): requirements/intro, requirements/technical, requirements/gameplay, requirements/ads, requirements/account-integration, requirements/game-covers, requirements/quality, sdk/intro, sdk/game, sdk/video-ads, sdk/data, sdk/user, sdk/banners (extra), resources/basic-launch-metrics, resources/getting-to-the-first-frame, resources/monetizing-driving, resources/midgame-ads-pacing, resources/crazygames-app, resources/html5/common-fixes, resources/html5/sitelock.

Launch model (requirements/intro): **Basic Launch** = live without SDK, no monetization, ads disabled. **Full Launch** = SDK integrated, all requirements below apply, revenue shared. Technical support is offered after 50k cumulative plays.

## 1. Technical

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| T1 | Total bundle size <= 250 MB. | requirements/technical | done | 3.51 MB total (M4 slice 2); `npm run budget` enforces 40 MB (our target) < 250 MB. |
| T2 | File count <= 1500 files. | requirements/technical | done | 5 files (M4 slice 2); budget enforces 200. |
| T3 | Initial download size <= 50 MB, measured "between the start of loading and the occurence of the first `Gameplay start` event" (`gameplayStart()`); <= 20 MB to be eligible for the mobile homepage. | requirements/technical | done | Measured by the smoke test into perf/startup.json: 3.51 MB before the first gameplayStart() (M4 slice 2) (target 8 MB, CI fails at 12 MB). |
| T4 | If the SDK is NOT integrated, the total file size is used instead and must be <= 50 MB (20 MB for mobile homepage). | requirements/technical | info | Applies to Basic Launch without SDK only. |
| T5 | Externally hosted/loaded files: QA measures time to reach gameplay, must be <= 20 seconds. | requirements/technical | todo | |
| T6 | Use only relative paths inside the bundle; never absolute paths. | requirements/technical | done | `base: './'` in vite.config.ts; `npm run budget` scans the build for absolute paths. |
| T7 | Must work in Chrome and Edge; Safari support expected (game is disabled on Safari if it does not work well). | requirements/technical | todo | |
| T8 | Chromebook: must run smoothly on a Chromium OS device with 4 GB RAM, otherwise the game is disabled on Chromium OS. | requirements/technical | todo | Perf budget target. |
| T9 | Support mouse and keyboard; touch if mobile is supported. | requirements/technical | todo | |
| T10 | Landscape must be playable on desktop; portrait games allowed only with black bars or side background images. | requirements/technical | todo | |
| T11 | Mobile: add `-webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;` to prevent unwanted selection/interactions. | requirements/technical | done | `user-select: none` + vendor prefixes on body in src/ui/styles.css. |
| T12 | Mobile: platform forces DPR=1 on iOS and low-memory Android, native `window.devicePixelRatio` elsewhere; rendering must look right at both. | requirements/technical | info | Test at DPR 1 explicitly. |
| T13 | iOS audio: call `AudioContext.resume()` inside a user gesture (`touchend`/`click`) to recover suspended audio after interruptions. | requirements/technical | done | EngineAudio resumes the context on keydown/pointerdown/touchstart/touchend/click. |
| T14 | Unity builds are disabled on iOS by default until enough plays; not relevant for a pure HTML5 build. | requirements/technical | n/a | |
| T15 | Basic Launch with SDK: trigger `gameplayStart()`; ads are prohibited. Full Launch: `gameplayStart`/`gameplayStop` mandatory, Data module (if saving progress), User module (if accounts), `loadingStart`/`loadingStop` optional. | requirements/technical | todo | M4: `gameplayStart` at the first controllable frame and on leaving the door and the card; `gameplayStop` entering them and on a user pause while driving; `loadingStart`/`loadingStop` around the boot; midgame requests at the door and the card (they return `adsDisabledBasicLaunch` during Basic Launch and the game goes on). The Data module comes with M5's save. |
| T16 | Sitelock/CSP must whitelist all CrazyGames domains plus the iOS/Android app origins (see section 14). | requirements/technical | todo | |
| T17 | If collecting personal data beyond SDK events, provide T&C / Privacy Policy as a non-blocking notice (not a popup). | requirements/technical | n/a | Set to `todo` if we add our own backend/analytics. |

## 2. Gameplay

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| G1 | Text and images must be legible at `devicePixelRatio: 1` in a responsive 16:9 iframe at: 821x462, 907x510, 1077x606, 1216x684 (desktop non-fullscreen); 1280x720, 1366x768, 1536x864, 1920x1080 (desktop fullscreen); 800x450 (mobile); 1080x607 (tablet). | requirements/gameplay | todo | Add these to the QA matrix. |
| G2 | Physics/gameplay must behave identically at different refresh rates (e.g. 144 Hz, 165 Hz); do not tie simulation to frame count. | requirements/gameplay | done | Fixed 60 Hz step with accumulator; tests/sim/loop.test.ts proves bitwise-equal results at 30/60/144/165 Hz. |
| G3 | English localization required; extra languages must be accurate; detect language from SDK `systemInfo.locale`, fall back to English. | requirements/gameplay | todo | |
| G4 | Controls intuitive on every supported device; avoid restricted keys (`Escape`, `Ctrl/Cmd+W`); consider AZERTY layouts. | requirements/gameplay, requirements/quality | done | KeyboardEvent.code bindings (WASD positions + arrows), labels via getLayoutMap(); nothing on Escape; pause on P. |
| G5 | Game loads quickly and plays without errors or crashes. | requirements/gameplay | todo | |
| G6 | Name, assets and content must be original. | requirements/gameplay | todo | |
| G7 | No in-game fullscreen button; CrazyGames provides fullscreen itself. | requirements/gameplay | done | No fullscreen button in the UI. |
| G8 | No cross-promotion/external links except: privacy/terms, community links on menus, store links (desktop only), CrazyGames backlinks, same-series game links. App Store links are never allowed in-game. | requirements/gameplay | done | No external links in the game. |
| G9 | PEGI 12 compliant (audience aged 13+). | requirements/gameplay | todo | |
| G10 | Full Launch: player lands directly in gameplay or at most one click away from playing. | requirements/gameplay | done (M5) | A plain load starts in the cold open (first visit) or on the street in the garage car (every later one): no menu; the garage is a place behind the door. |

## 3. Ads

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| A1 | Never show a midgame ad while the player is actively playing; only at natural breaks (level transition, map change, after death, post-race summary). | requirements/ads | done (adapter side, M4 slice 8) | `App.adBreak` (`src/app/App.ts`): a midgame request at the shut door (not the session's first door, which ends the cold open) and at the busted card, both game-made breaks already bracketed by `gameplayStop`/`gameplayStart`; only when `adsAvailable('midgame')`. The wrecked overlay, a takedown's slow motion and the auto-pause on blur are never ad points. One ad at most per door (the rewarded door offer is M5's). e2e 8.1–8.5 in `e2e/heat.spec.ts`. |
| A2 | Do not implement own cooldown timers: the SDK enforces max 1 midgame ad every 3 minutes and takes game start into account; early requests return `adCooldown`. | requirements/ads, resources/midgame-ads-pacing | info | Just request at every natural break. |
| A3 | On `adStarted`: pause the game, mute audio, block all UI (disable buttons or show a blocking spinner) until `adFinished` or `adError`. Mute only when the ad actually starts, not on request. | requirements/ads, sdk/video-ads | done (adapter side, M4 slice 8) | `App` blocks input from the request (`InputManager.blocked`) and holds the break open (`adShowing`); `adStarted` mutes the one master gain (`EngineAudio.setMuted`, which the engine, `Sfx` and the siren share); `adFinished`/`adError` unmute and unblock. e2e 8.1 reads the gain and presses a key during the ad. |
| A4 | On `adError` (any code incl. `unfilled`, `adblock`, `adsDisabledBasicLaunch`, `adCooldown`, `other`) the game must continue normally. | requirements/ads, sdk/video-ads | done (adapter side, M4 slice 8) | The error event unblocks at once and the next key drives on; no reward exists at these points. e2e 8.2 (`?ad=error&adError=adCooldown`), 8.3 (`?ad=off`: no request). |
| A5 | Rewarded ads are occasional optional bonuses, not a core loop; do not offer too often (show a timer or hide the button). | requirements/ads | done (M5) | Rewarded offers only at the door (DOUBLE THE BAG, above an 8,000 bag, at most once a door) and on the wall's PREP page (the lawyer, the fence), each beside a cash button of the same size; never on a driving screen. |
| A6 | Rewarded ad button must not appear on an active gameplay screen and must not be misleading; show a video icon; skip/close must be equally prominent and never hidden or delayed. | requirements/ads | done (M5) | Every rewarded button carries the video icon (a cyan frame with a play triangle); the decline (BANK IT) is the same size, beside it, and focused by default; `e2e/game.spec.ts` 4.7–4.9. |
| A7 | Reward only on `adFinished`; never reward on `adError`. | requirements/ads | done (M5) | `App.rewarded` pays only when `requestAd` resolves `finished`; an error pays nothing and leaves the cash path (e2e 4.8). |
| A8 | Do not chain ads (more than one rewarded ad for a single reward). | requirements/ads | done (M5) | One video per reward: the double offer is answered either way after its one request (no second ask); a prep item already bought never requests (e2e 4.9 counts one request for the door). |
| A9 | Do not offer an out-of-lives/revive rewarded ad every time the player loses a life; revive max once per session. | requirements/ads, resources/monetizing-driving | n/a | No lives and no revive: busted keeps half the bag by design, and the lawyer is a cash item with a video alternative, not a revive. |
| A10 | Do not combine a midgame ad between levels with a rewarded "keep playing" ad for the same level. | requirements/ads | done (M5) | At most one ad a door: the rewarded offer when it shows, else the midgame request; never both (`App.openWall`). |
| A11 | Banners only on useful screens open >= 5 seconds on average, never during active gameplay, max 2 per screen, must not block UI at any size. | requirements/ads | todo | Garage/menu only if we use banners. |
| A12 | Adblock users must be able to play normally; never block them. Features may be restricted with a notice, but rewarded buttons must not stay clickable with no effect (use `hasAdblock()` to hide/disable). | requirements/ads | done (M5) | `adsAvailable('rewarded')` false hides every video button (never disabled); the adblock case reports unavailable in `LocalPlatform` (`?adblock=1`), and the M6 adapter must do the same from `hasAdblock()`; the game plays fully on the cash paths (e2e 4.7). |
| A13 | During Basic Launch ads are disabled and no revenue is shared; `requestAd` returns `adsDisabledBasicLaunch`. | requirements/ads, resources/basic-launch-metrics | info | |

## 4. Account / User

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| U1 | Pick one of four scenarios: no accounts; show CrazyGames profile (username + avatar); in-game guest accounts with no external logins; full backend integration with auto login/registration by CrazyGames `userId`. | requirements/account-integration | todo | Decide scenario. |
| U2 | Request the current user via `getUser()` every time the game starts (device sharing, profile changes); do not auto-trigger `showAuthPrompt()`. | requirements/account-integration | todo | |
| U3 | Guests must be able to play; only CrazyGames login is allowed (no Facebook/Google/email); no logout that leads to external logins. | requirements/account-integration | todo | |
| U4 | Backend (if any) must verify identity with the JWT from `getUserToken()` (1 hour lifetime) using the public key at `https://sdk.crazygames.com/publicKey.json`; never trust `__dangerousUserId`. | requirements/account-integration, sdk/user | n/a | Set `todo` if we add a backend. |
| U5 | Refresh stored username/avatar each launch; auto-create game account for new CrazyGames users; optionally migrate guest progress (`showAccountLinkPrompt()`). | requirements/account-integration | n/a | |
| U6 | Use `addAuthListener` to detect a guest logging in mid-session and reload profile/progress. | requirements/account-integration | todo | |
| U7 | Multiplayer (if any): report rooms with `updateRoom`, support invite links, instant multiplayer flow, persistent rooms, respect `settings.disableChat`. | requirements/intro, sdk/game | n/a | |
| U8 | In-game purchases are invite-only and must use the CrazyGames Xsolla account and `userId`; not available inside the CrazyGames App. | requirements/intro, resources/crazygames-app | n/a | |

## 5. Data / Save

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| D1 | Use the Data module (`getItem`/`setItem`/`removeItem`/`clear`) for progress; it is the preferred save method and syncs across devices for logged-in users. | requirements/account-integration, sdk/data | done (adapter side, M5) | One key (`save`), one versioned JSON document through `Platform.saveData/loadData` (`src/app/save.ts`); the format is `src/sim/save/format.ts` (pins in `tests/sim/save.test.ts`). `LocalPlatform` keeps it in `localStorage`; `CrazyGamesPlatform` (M6) maps the same three calls onto the Data module. |
| D2 | Total game data as a JSON string must stay <= 1 MB (1048576 bytes); exceeding it raises error code `dataLimitExcedeed` (sic) and the data is no longer backed up. | sdk/data | done (M5) | Everything filled serializes to 1.1 kB; a 15-minute bot session saves 359 bytes; `BALANCE.save.maxBytes` (32 kB) warns in the console; save test 0.4 pins the filled size. |
| D3 | Saving is debounced 1 s (up to 30 s in exceptional cases); do not rely on immediate persistence. | sdk/data | info | |
| D4 | Guest data lives in `localStorage`; on login the SDK migrates guest data to the account automatically. | sdk/data | info | |
| D5 | Data is preloaded at `init()`; read only after `await init()` resolves. | sdk/data | done (adapter side, M5) | `App.boot` awaits `platform.init()` before `SaveStore.load()`, and the world is built from the loaded save; nothing reads the data before init resolves. |
| D6 | Games with in-game purchases must not rely on Automatic Progress Save (APS). | requirements/account-integration | n/a | |

## 6. Game covers

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| C1 | Landscape cover 16:9 at 1920x1080 px. | requirements/game-covers | todo | |
| C2 | Portrait cover 2:3 at 800x1200 px. | requirements/game-covers | todo | |
| C3 | Square cover 1:1 at 800x800 px. | requirements/game-covers | todo | |
| C4 | Covers share consistent art; no borders; only the game title as text (no "New", "Updated", "Play", "Play now"); no icons/store logos; no copyrighted material; not blurry/pixelated; not a plain screenshot. | requirements/game-covers | todo | |
| C5 | Preview video: 15-20 s (cut at 20 s), <= 50 MB, landscape 1080p 16:9 AND portrait 1080p 2:3, opening frame = static cover; no black screens/logos/transitions/black bars/cursor/promo text/app or social icons/fast-forward/sound. | requirements/game-covers | todo | |

## 7. Quality

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| Q1 | Onboarding inside gameplay, skippable, visual over text, core mechanics only; show keyboard overlay/mouse gestures. | requirements/quality | done (M4–M5) | The cold open is the onboarding: in gameplay, a verb at a time with keycaps, skippable (N), once per profile (the save's `seen`, written as it starts). |
| Q2 | Buttons clearly labeled, not sized or delayed to push ads or other behaviour. | requirements/quality | todo | |
| Q3 | Clear reachable goals, easy to learn, consistent controls, responsive input, balanced pacing, no repetitive chores. | requirements/quality | partly (M5.5) | Goals: the goal line always names one thing to do and the arrow points at it (TAKE A JOB · 320 m, LOSE THEM, BANK IT, BUY THE COMPACT · n TO GO); the first quarter hour is a six-step chain with a card per step and the next step on the wall. Pacing: the balance script's first hour is red at the gate (the first car at minute 3.9 in the model, one gap of 2.4 minutes; BACKLOG); Marcin's playtest judges it. |
| Q4 | Consistent resolution and audio levels, no compression artifacts, coherent art style, name/imagery match the genre. | requirements/quality | todo | |
| Q5 | Game must be maintainable/updatable; core genre features must not change after submission; name must not be confusable with other games or use IP you do not own. | requirements/quality | todo | |

## 8. Basic Launch metrics

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| B1 | Basic Launch ends when the game has been live >= 7 days AND reached 500 plays; hard stop after 21 days. | resources/basic-launch-metrics | info | |
| B2 | KPIs: average play time 10+ minutes; Day 1 retention 10-15%; conversion (>= 1 minute played) 80%+. | resources/basic-launch-metrics | info | Design target for the demo loop. |
| B3 | Dashboard updates daily; updates are auto-approved and counted on next refresh; ads stay disabled even if the SDK is integrated. | resources/basic-launch-metrics | info | |
| B4 | Games with strong KPIs progress to Full Launch (SDK + monetization). | resources/basic-launch-metrics | info | |

## 9. First frame / loading

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| L1 | Load time and size are measured up to the first `gameplayStart()`, which must be real gameplay, not a loading screen. | resources/getting-to-the-first-frame | done | gameplayStart() fires on the first rendered frame with the car controllable (App.frame); loadingStart/Stop bracket physics init + scene build. |
| L2 | Perception targets: < 100 ms instant; 1 s fine; 10 s attention wanders (must show feedback). Show immediate feedback rather than chase zero. | resources/getting-to-the-first-frame | info | |
| L3 | Load tutorial-critical assets first, call `gameplayStart()` when the tutorial is playable, stream the rest during the tutorial. | resources/getting-to-the-first-frame | todo | |
| L4 | Reduce build: Brotli compression, compressed textures (ASTC), Vorbis audio, compressed models; keep startup code light and defer heavy work to async tasks. | resources/getting-to-the-first-frame | todo | |
| L5 | Runtime: minimize per-frame allocations, profile on low-end devices, mind physics and audio latency. | resources/getting-to-the-first-frame | todo | |

## 10. Driving-game monetization

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| M1 | Never show an ad while a race is active; request midgame ads on the post-race summary after results are visible. | resources/monetizing-driving | done (M5) | No ad while driving; the door's ad is requested once the totals are up (the midgame) or offered on the wall (the rewarded). |
| M2 | Rewarded ad ideas: post-race 2x/3x multiplier, fuel/energy refill, cosmetic unlocks, test drive of premium vehicle, level skip, once-per-session revive with buff. | resources/monetizing-driving | done (M5) | Picked: the post-run double (DOUBLE THE BAG at the door) and the prep items (the lawyer, the fence) as rewarded alternatives to cash. |
| M3 | Banner spot: the garage/tuning screen. | resources/monetizing-driving | todo | |
| M4 | Benchmarks: driving games average 8.7 min play time, 5.7% D1 retention, top titles 7 ad impressions per play. | resources/monetizing-driving | info | |

## 11. Midgame ad pacing

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| P1 | SDK throttles to at most one midgame ad every 3 minutes with extra safeguards around game start and rewarded ads. | resources/midgame-ads-pacing | info | |
| P2 | Delay the first midgame ad until the tutorial is done, or 3-5 minutes played, or level 3-4 reached. | resources/midgame-ads-pacing | done (M4–M5) | No midgame ad at the session's first door (the cold open's end on a first visit); the SDK paces the rest. |
| P3 | Request at every natural break (between levels/rounds, after milestones); prefer rewarded before big rewards; no custom cooldowns. | resources/midgame-ads-pacing | todo | |
| P4 | Midgame ads are typically 40-60% of revenue in casual games. | resources/midgame-ads-pacing | info | |

## 12. CrazyGames app (mobile)

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| X1 | Detect the app via `window.CrazyGames.SDK.user.systemInfo.applicationType` in `["google_play_store", "apple_store"]`. | resources/crazygames-app | todo | |
| X2 | In the app games run fullscreen edge-to-edge: pad UI with `env(safe-area-inset-top/right/bottom/left, 0px)`. | resources/crazygames-app | todo | |
| X3 | Disable Xsolla / external payment flows inside the app. | resources/crazygames-app | n/a | |
| X4 | CSP `frame-ancestors` must include `https://app.crazygames.com` (Android) and `capacitor://app.crazygames.com` (iOS). | resources/crazygames-app | todo | |

## 13. Common fixes (HTML5)

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| F1 | Prevent page scroll: `window.addEventListener("wheel", e => e.preventDefault(), { passive: false })`. | resources/html5/common-fixes | done | App: wheel listener with preventDefault (passive: false). |
| F2 | Prevent key scrolling: `preventDefault()` on `keydown` for `ArrowUp`, `ArrowDown`, `" "` (space). | resources/html5/common-fixes | done | KeyboardDevice prevents default on Space and all four arrows (also on repeat). |
| F3 | Handle `visibilitychange` (`hidden`/`visible`) to pause/resume; reported broken on the Samsung app webview. | resources/html5/common-fixes | done | App pauses the sim on blur/visibilitychange without calling gameplayStop; resumes on focus/click. |
| F4 | Disable the right-click context menu: `document.addEventListener("contextmenu", e => e.preventDefault())`. | resources/html5/common-fixes | done | App: contextmenu preventDefault on document. |

## 14. Sitelock

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| S1 | Check hostname with the documented `isCrazyGames()` (`parts.indexOf("crazygames")` is not -1 and >= `parts.length - 3`); on failure show "Available only on CrazyGames" or a blank screen. Keep localhost/preview working for dev. | resources/html5/sitelock | todo | |
| S2 | Obfuscate the sitelock (e.g. obfuscator.io). | resources/html5/sitelock | todo | |
| S3 | Iframe/self-hosted: `Content-Security-Policy: frame-ancestors 'self' *.crazygames.com https://app.crazygames.com capacitor://app.crazygames.com;` (bare hosts imply https only, so the `capacitor://` entry is mandatory for iOS). | resources/html5/sitelock | n/a | Only if we host the game ourselves. |
| S4 | Domain list to allow: `*.crazygames.com`, `crazygames.*` (www.crazygames.fr/.co.id/.cz/.dk/.hu/.nl/.no/.pl/.com.br/.ro/.fi/.se/.ru/.com.ua/.at/.jp/.pt/.vn/.com.vn/.co.kr, de./it./vn./gr./ar./th.crazygames.com), `games.crazygames.com` (video ads). | resources/html5/sitelock | info | |

## SDK v3 API reference (as read today)

**Script and init**
- `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>` in `<head>` of `index.html`.
- `await window.CrazyGames.SDK.init();` — must be awaited; "the SDK is unusable until initialized". No method may be called before init resolves.
- npm: the docs never mention npm, TypeScript types or bundler imports. `registry.npmjs.org/@crazygames/sdk` and `/crazygames-sdk` both return 404; an npm search for "crazygames" returns only third-party wrappers (`@adlad/plugin-crazygames` 1.1.0, `web-sdk-wrapper` 2.0.2, `@wonderlandengine/upsdk-provider-crazygames` 0.2.0). Conclusion: **there is no official npm package; use the script tag.**
- `window.CrazyGames.SDK.environment` → `"local"` (localhost/127.0.0.1, demo ads), `"crazygames"` (production domains), `"disabled"` (any other domain; SDK calls throw).
- Error format: `{ code: string, message: string }`, e.g. `{code: 'userAlreadySignedIn', message: 'The user is already signed in'}`.
- QA: `crazygames.com/preview` (Preview tool) is the realistic test environment.
- Modules: `ad`, `banner`, `game`, `user`, `data`.

**game module** (`window.CrazyGames.SDK.game.*`, all sync unless noted)
- `gameplayStart()` — "whenever the player starts playing or resumes playing after a break (game start, resume, revive, enter next level, ...)". First call fixes the initial download measurement.
- `gameplayStop()` — "on every game break (entering a menu, ending level, pausing the game, ...)"; NOT when the user switches focus or leaves the game area.
- `loadingStart()` / `loadingStop()` — wrap loading phases (optional).
- `happytime()` — sparingly, on special achievements (boss beaten, highscore).
- `reportGameCompletedPercentage(0..100)` — progression milestones; 100 only at meaningful completion.
- `setGameContext({...})` / `clearGameContext()` — data attached to user feedback reports.
- `settings` → `{ disableChat: boolean, muteAudio: boolean }`; `muteAudio` overrides in-game audio toggle. `addSettingsChangeListener(fn)` / `removeSettingsChangeListener(fn)`.
- Multiplayer: `isInstantMultiplayer` (boolean; replaces deprecated `isInstantJoin`), `updateRoom({ roomId, isJoinable, inviteParams })`, `leftRoom()`, `inviteParams` (object or `null`), `addJoinRoomListener(fn)` / `removeJoinRoomListener(fn)`, `inviteLink(params)` (Promise<string>), `getInviteParam(key)` (string or null). `showInviteButton(params)` / `hideInviteButton()` are deprecated (use room data).

**ad module** (`window.CrazyGames.SDK.ad.*`)
- `requestAd("midgame" | "rewarded", { adStarted: () => {}, adFinished: () => {}, adError: (error) => {} })` — callbacks object, not a promise in HTML5. `error.code` is one of: `adsDisabledBasicLaunch` ("during Basic Launch ads are disabled"), `unfilled` ("no ad available"), `adblock` ("an adblocker prevents showing ads"), `adCooldown` ("the ad was requested too soon, the usual midgame ad request interval is 3 minutes"), `other`.
- `await hasAdblock()` → boolean.

**banner module** (`window.CrazyGames.SDK.banner.*`) (extra page, sdk/banners)
- `await requestBanner({ id, width, height })` with static sizes 728x90, 300x250, 320x50, 468x60, 320x100; `await requestResponsiveBanner(containerId)` (970x90, 320x50, 160x600, 336x280, 728x90, 300x600, 468x60, 970x250, 300x250, 250x250, 120x600); `clearBanner(id)`, `clearAllBanners()`.
- Error codes: `bannersDisabledBasicLaunch`, `unfilled`, `missingId`, `notVisible`, `noAvailableSizes`, `notCreated`, `videoAdPlaying`, `invalidSize`, `bannerCooldown`, `maxRefreshReached`, `bannersDisabledMobileApp`, `other`.

**data module** (`window.CrazyGames.SDK.data.*`, localStorage-like, sync)
- `getItem(key: string): string | null`, `setItem(key: string, value: string): void`, `removeItem(key: string): void`, `clear(): void`.
- Limit 1 MB = 1048576 bytes of JSON; error code `dataLimitExcedeed`; message "Game data when converted to a JSON string cannot exceed 1048576 bytes. Data was not saved". Debounce 1 s (up to 30 s). Data is preloaded during `init()`. Guest data migrates to the account on login.

**user module** (`window.CrazyGames.SDK.user.*`)
- `isUserAccountAvailable` — **property** (boolean), not a method.
- `await getUser()` → `{ __dangerousUserId, username (6-20 chars, alphanumeric/period/underscore), profilePictureUrl }` or `null`.
- `await getUserToken()` → JWT valid 1 hour; payload `{ userId, gameId, username, profilePictureUrl, iat, exp }`; verify with `https://sdk.crazygames.com/publicKey.json`.
- `await showAuthPrompt()` → user; errors `showAuthPromptInProgress`, `userAlreadySignedIn`, `userCancelled`.
- `await showAccountLinkPrompt()` → `{ response: "yes" | "no" }`; errors `showAccountLinkPromptInProgress`, `userNotAuthenticated`.
- `addAuthListener(fn)` / `removeAuthListener(fn)` — fires on login only, not logout.
- `listFriends(page, size)` — paginated, max size 50.
- `systemInfo` — **property**: `{ countryCode, locale, device: { type: "desktop"|"tablet"|"mobile" }, os: { name, version }, browser: { name, version }, applicationType: "google_play_store"|"apple_store"|"pwa"|"web" }`.
- Generic errors: `userNotAuthenticated`, `unexpectedError`, `rateLimited` (min 250 ms between calls).
- Local testing query params: `?user_account_available=false`, `?show_auth_prompt_response=user1|user2|user_cancelled`, `?user_response=user1|user2|logged_out`, `?token_response=user1|user2|expired_token|logged_out`.

**Viewport sizes for UI legibility (DPR 1, 16:9 iframe)**
821x462, 907x510, 1077x606, 1216x684 (desktop non-fullscreen); 1280x720, 1366x768, 1536x864, 1920x1080 (desktop fullscreen); 800x450 (mobile); 1080x607 (tablet).

## Facts that differ from what we assumed

| Assumption | Docs say | Verdict |
|---|---|---|
| (a) Initial download measured from load start to first `gameplayStart()` | "measured between the start of loading and the occurence of the first `Gameplay start` event". Without SDK the total file size is used instead. | Confirmed (with the no-SDK caveat). |
| (b) `gameplayStop()` not needed on focus loss | "Don't call when user switches focus or leaves game area." | Confirmed. |
| (c) URL `https://sdk.crazygames.com/crazygames-sdk-v3.js` + `await window.CrazyGames.SDK.init()` | Identical. | Confirmed. |
| (d) Environment values `local` and `disabled` | Three values: `local`, `crazygames`, `disabled`. | Confirmed; add `crazygames`. |
| (e) Ads disabled during Basic Launch, error `adsDisabledBasicLaunch` | Confirmed; plus `unfilled`, `adblock`, `adCooldown`, `other`. Banners have the separate code `bannersDisabledBasicLaunch`. | Confirmed; handle `adCooldown` too. |
| (f) 1 MB data cap | 1048576 bytes of JSON; error code is spelled `dataLimitExcedeed`. | Confirmed (note the misspelling). |
| (g) 250 MB / 1500 files, initial 50 MB (20 MB mobile homepage) | Identical; plus externally hosted games judged by <= 20 s to gameplay. | Confirmed. |
| (h) Ten legibility sizes | Identical list. | Confirmed. |

Additional facts we had not assumed:
- No official npm package exists; script tag is the only documented install path.
- `isUserAccountAvailable` and `systemInfo` are properties, not methods; `inviteLink()` returns a Promise.
- Basic Launch: ends at >= 7 days AND 500 plays (max 21 days); KPI targets 10+ min play, 10-15% D1, 80%+ conversion.
- The SDK owns midgame cooldown (3 min); implementing our own timer is discouraged.
- `showInviteButton`/`hideInviteButton` are deprecated in favour of `updateRoom`.
- Common-fixes page contains only four browser-behaviour fixes (scroll, keys, visibilitychange, contextmenu); nothing on CORS/audio autoplay.
