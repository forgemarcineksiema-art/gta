/**
 * The quality tiers and the automatic quality (M7 slice 5; M8.6 slice 5, docs/history/M8.6_PLAN.md D10): from a window of
 * frames, their mean and the share that missed a vsync, what to change. The mean alone read a stutter as fine: on
 * Marcin's MX330 at a 1.5 pixel ratio a pile of cruisers ran 47 fps with one frame in five past two vsyncs and one in
 * fifteen past 50 ms, a mean of 21 ms under the 24 that steps down; the misses count now. `qualityStep` is pure;
 * `AutoQuality` keeps the window, and the renderer acts on what it returns.
 */

export type QualityTier = 'low' | 'high';
export const QUALITY = {
  low: { far: 340, near: 100, dpr: 1, shadow: 1024 },
  high: { far: 580, near: 180, dpr: 1.5, shadow: 2048 },
} as const;

/** `low`/`high`: switch the tier; `down`/`up`: move the resolution scale; `hold`: nothing. */
export type QualityStep = 'low' | 'high' | 'down' | 'up' | 'hold';

export const AUTO_QUALITY = {
  /** The window a step reads (s). */
  window: 3,
  /** A frame longer than this missed its vsync at 60 Hz (s). */
  missed: 0.022,
  /** Down from high over this mean (ms) or this share of missed frames. */
  lowMean: 24,
  lowMissed: 0.08,
  /** Up to high under this mean (ms) and this share. */
  highMean: 17.2,
  highMissed: 0.02,
  /** The resolution shrinks over this mean (ms) or `lowMissed`, grows under this mean and `highMissed`. */
  shrinkMean: 27,
  growMean: 18,
  /** The resolution scale's floor. */
  minScale: 0.65,
} as const;

/** What to change after a window with this mean frame (ms) and share of missed frames. */
export function qualityStep(meanMs: number, missedShare: number, tier: QualityTier, settled: boolean, scale: number): QualityStep {
  const a = AUTO_QUALITY;
  const stutters = missedShare > a.lowMissed, smooth = missedShare < a.highMissed;
  if (!settled && tier === 'high' && (meanMs > a.lowMean || stutters)) return 'low';
  if ((meanMs > a.shrinkMean || stutters) && scale > a.minScale) return 'down';
  if (meanMs < a.growMean && smooth && scale < 1) return 'up';
  if (!settled && tier === 'low' && meanMs < a.highMean && smooth) return 'high';
  return 'hold';
}

/**
 * Start conservatively, benchmark real frames, then use hysteresis and dynamic resolution. A tier switch reallocates
 * the drawing buffer and the shadow map, a hitch each time: the tier settles after two switches in a session (up
 * and back down on a machine near the line would otherwise flip every 15 s, M7 slice 5); the resolution still moves.
 */
export class AutoQuality {
  /** The resolution scale on top of the tier's pixel ratio. */
  scale = 1;
  private locked: boolean;
  private elapsed = 0;
  private frames = 0;
  private total = 0;
  /** Frames of the window that missed their vsync (M8.6 slice 5). */
  private missed = 0;
  private cooldown = 3;
  /** Automatic tier switches this session (M7 slice 5: two and it settles). */
  private switches = 0;

  /** `fixed`: `?quality=` fixed the tier, and the settings row leaves it. */
  constructor(private readonly fixed: boolean) {
    this.locked = fixed;
  }

  /**
   * The settings' QUALITY row (M7 slice 3): AUTO lets the frame cost choose, LOW and HIGH hold that tier. False when
   * the URL fixed the tier (the tests): the row changes nothing then.
   */
  setMode(mode: 'auto' | QualityTier): boolean {
    if (this.fixed) return false;
    this.locked = mode !== 'auto';
    this.cooldown = 3;
    this.reset();
    return true;
  }

  /** One frame of `dt` s at `tier`: the step to take once a window is read, null while it fills. */
  frame(dt: number, tier: QualityTier): QualityStep | null {
    if (this.locked) return null;
    if (this.cooldown > 0) { this.cooldown -= dt; return null; }
    this.elapsed += dt; this.frames++; this.total += dt;
    if (dt > AUTO_QUALITY.missed) this.missed++;
    if (this.elapsed < AUTO_QUALITY.window) return null;
    const step = qualityStep(this.total * 1000 / this.frames, this.missed / this.frames, tier, this.switches >= 2, this.scale);
    if (step === 'low' || step === 'high') { this.cooldown = 15; this.switches++; }
    else if (step === 'down') this.scale = Math.max(AUTO_QUALITY.minScale, this.scale - 0.1);
    else if (step === 'up') this.scale = Math.min(1, this.scale + 0.05);
    this.reset();
    return step;
  }

  private reset(): void {
    this.elapsed = 0; this.frames = 0; this.total = 0; this.missed = 0;
  }
}
