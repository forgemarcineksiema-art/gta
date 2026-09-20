/**
 * The one seam between the game and the portal that hosts it.
 * Game code never touches `window.CrazyGames`; it talks to this interface.
 * See docs/CRAZYGAMES.md for the rules each method must follow.
 */

export type PlatformName = 'local' | 'crazygames';

/** Reported by the SDK: `local` on localhost, `disabled` off-portal, `crazygames` on the portal. */
export type PlatformEnvironment = 'local' | 'disabled' | 'crazygames';

export type DeviceType = 'desktop' | 'mobile' | 'tablet';

/** Error codes as the CrazyGames SDK v3 spells them, plus `unavailable` when no SDK is present. */
export type AdErrorCode = 'adsDisabledBasicLaunch' | 'unfilled' | 'adblock' | 'adCooldown' | 'other' | 'unavailable';

export type AdResult = { status: 'finished' } | { status: 'error'; code: AdErrorCode };

export type AdType = 'midgame' | 'rewarded';

export type AdEvent = 'adStarted' | 'adFinished' | 'adError';

export interface PlatformInfo {
  name: PlatformName;
  environment: PlatformEnvironment;
  locale: string;
  device: DeviceType;
  /** True inside the CrazyGames mobile app (safe-area padding needed). */
  inApp: boolean;
}

export interface Platform {
  readonly name: PlatformName;
  /** Must resolve before anything else is called. Never throws: a broken SDK degrades to `disabled`. */
  init(): Promise<PlatformInfo>;
  info(): PlatformInfo;

  /** Bracket asset loading. */
  loadingStart(): void;
  loadingStop(): void;
  /** Fire when the player gains control, and on every resume from a game-made break. */
  gameplayStart(): void;
  /** Fire on every game-made break (pause, menus, results, ads). Never on focus loss. */
  gameplayStop(): void;
  /** Optional celebration hook (level up, unlock). */
  happyTime(): void;

  /** Whether an ad of this type could be shown right now (used to hide rewarded buttons). */
  adsAvailable(type: AdType): boolean;
  /** Requests an ad. Resolves after the ad finishes or fails; never rejects. */
  requestAd(type: AdType): Promise<AdResult>;
  /** Subscribe to ad lifecycle events (audio mute hook). Returns an unsubscribe function. */
  onAdEvent(listener: (event: AdEvent, code?: AdErrorCode) => void): () => void;
  hasAdblock(): Promise<boolean>;

  /** Key/value save. Values are JSON strings; the whole store must stay well under 1 MB. */
  saveData(key: string, value: string): Promise<void>;
  loadData(key: string): Promise<string | null>;
  clearData(key: string): Promise<void>;
}
