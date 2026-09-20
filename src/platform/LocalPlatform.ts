/**
 * Offline stand-in for the CrazyGames SDK. Simulates ads with a DOM overlay and
 * lets every SDK failure path be forced from the URL so it can be tested without
 * the portal:
 *
 *   ?ad=error&adError=adblock      every ad request fails with that code
 *   ?ad=off                        ads report as unavailable (buttons hidden)
 *   ?adblock=1                     hasAdblock() resolves true
 *   ?adDuration=1                  simulated ad length in seconds (default 3)
 *   ?locale=de                     reported locale
 *   ?device=mobile                 reported device type
 */
import type { AdErrorCode, AdEvent, AdResult, AdType, Platform, PlatformInfo } from './Platform';

const AD_ERROR_CODES: AdErrorCode[] = ['adsDisabledBasicLaunch', 'unfilled', 'adblock', 'adCooldown', 'other', 'unavailable'];

export interface LocalPlatformCalls {
  loadingStart: number;
  loadingStop: number;
  gameplayStart: number;
  gameplayStop: number;
  happyTime: number;
  adRequests: number;
}

export class LocalPlatform implements Platform {
  readonly name = 'local' as const;
  /** Call counters, read by the smoke test through `window.__game`. */
  readonly calls: LocalPlatformCalls = { loadingStart: 0, loadingStop: 0, gameplayStart: 0, gameplayStop: 0, happyTime: 0, adRequests: 0 };
  private readonly params: URLSearchParams;
  private readonly listeners = new Set<(event: AdEvent, code?: AdErrorCode) => void>();
  private cachedInfo: PlatformInfo | null = null;
  private adInProgress = false;

  constructor(search: string = typeof location === 'undefined' ? '' : location.search) {
    this.params = new URLSearchParams(search);
  }

  init(): Promise<PlatformInfo> {
    const device = this.params.get('device');
    this.cachedInfo = {
      name: 'local',
      environment: 'local',
      locale: this.params.get('locale') ?? (typeof navigator === 'undefined' ? 'en' : navigator.language.slice(0, 2)),
      device: device === 'mobile' || device === 'tablet' ? device : 'desktop',
      inApp: false,
    };
    return Promise.resolve(this.cachedInfo);
  }

  info(): PlatformInfo {
    if (!this.cachedInfo) throw new Error('Platform.init() not awaited');
    return this.cachedInfo;
  }

  loadingStart(): void {
    this.calls.loadingStart++;
  }
  loadingStop(): void {
    this.calls.loadingStop++;
  }
  gameplayStart(): void {
    this.calls.gameplayStart++;
  }
  gameplayStop(): void {
    this.calls.gameplayStop++;
  }
  happyTime(): void {
    this.calls.happyTime++;
  }

  adsAvailable(_type: AdType): boolean {
    return this.params.get('ad') !== 'off' && this.params.get('adblock') !== '1';
  }

  onAdEvent(listener: (event: AdEvent, code?: AdErrorCode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  hasAdblock(): Promise<boolean> {
    return Promise.resolve(this.params.get('adblock') === '1');
  }

  async requestAd(type: AdType): Promise<AdResult> {
    this.calls.adRequests++;
    if (this.adInProgress) return { status: 'error', code: 'other' };
    if (!this.adsAvailable(type)) {
      this.emit('adError', 'unavailable');
      return { status: 'error', code: 'unavailable' };
    }
    if (this.params.get('ad') === 'error') {
      const raw = this.params.get('adError') ?? 'other';
      const code = (AD_ERROR_CODES as string[]).includes(raw) ? (raw as AdErrorCode) : 'other';
      this.emit('adError', code);
      return { status: 'error', code };
    }
    const seconds = Number(this.params.get('adDuration') ?? '3');
    this.adInProgress = true;
    this.emit('adStarted');
    await this.showOverlay(type, Number.isFinite(seconds) ? seconds : 3);
    this.adInProgress = false;
    this.emit('adFinished');
    return { status: 'finished' };
  }

  saveData(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalPlatform.saveData failed', e);
    }
    return Promise.resolve();
  }

  loadData(key: string): Promise<string | null> {
    try {
      return Promise.resolve(localStorage.getItem(key));
    } catch {
      return Promise.resolve(null);
    }
  }

  clearData(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return Promise.resolve();
  }

  private emit(event: AdEvent, code?: AdErrorCode): void {
    for (const l of this.listeners) l(event, code);
  }

  private showOverlay(type: AdType, seconds: number): Promise<void> {
    if (typeof document === 'undefined') return new Promise((r) => setTimeout(r, seconds * 1000));
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'fake-ad';
      el.setAttribute('data-ad-type', type);
      const label = document.createElement('div');
      label.className = 'fake-ad__label';
      el.appendChild(label);
      document.body.appendChild(el);
      const started = performance.now();
      const tickFn = () => {
        const left = Math.max(0, seconds - (performance.now() - started) / 1000);
        label.textContent = `SIMULATED ${type.toUpperCase()} AD  ·  ${left.toFixed(1)} s`;
        if (left > 0) requestAnimationFrame(tickFn);
        else {
          el.remove();
          resolve();
        }
      };
      tickFn();
    });
  }
}
