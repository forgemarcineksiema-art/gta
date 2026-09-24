/**
 * The automatic quality's step (M7 slice 5; M8.6 slice 5, docs/M8.6_PLAN.md D10): from a window of frames, their mean
 * and the share that missed a vsync, what to change. The mean alone read a stutter as fine: on Marcin's MX330 at a 1.5
 * pixel ratio a pile of cruisers ran 47 fps with one frame in five past two vsyncs and one in fifteen past 50 ms, a
 * mean of 21 ms under the 24 that steps down; the misses count now. Pure: the renderer keeps the window and acts.
 */

import type { QualityTier } from './city/CityView';

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
