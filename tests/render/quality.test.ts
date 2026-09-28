/**
 * The automatic quality reads the stutter, not only the mean (M8.6 slice 5, D10): the step from a window of frames.
 */
import { describe, expect, it } from 'vitest';
import { AUTO_QUALITY, AutoQuality, qualityStep, type QualityStep, type QualityTier } from '../../src/render/quality';

/** The automatic quality fed `seconds` of frames from `next` (ms, by the frame's index): the steps it took, its tier and scale. */
function drive(seconds: number, next: (i: number) => number): { steps: QualityStep[]; tier: QualityTier; scale: number } {
  const auto = new AutoQuality(false), steps: QualityStep[] = [];
  let tier: QualityTier = 'high';
  for (let t = 0, i = 0; t < seconds; i++) {
    const dt = next(i) / 1000;
    t += dt;
    const step = auto.frame(dt, tier);
    if (step === null || step === 'hold') continue;
    steps.push(step);
    if (step === 'low' || step === 'high') tier = step;
  }
  return { steps, tier, scale: auto.scale };
}

/** `count` frames of `ms` each. */
function frames(count: number, ms: number): number[] {
  return new Array<number>(count).fill(ms);
}

/** A window of frames at these lengths (ms): its mean and the share that missed a vsync. */
function window(list: number[]): [number, number] {
  const mean = list.reduce((s, f) => s + f, 0) / list.length;
  return [mean, list.filter((f) => f > AUTO_QUALITY.missed * 1000).length / list.length];
}

describe('the automatic quality', () => {
  it('M8.6 5.2 the pile at 47 fps, one frame in five past two vsyncs: high steps down, though the mean is under 24 ms', () => {
    // 3 s of it: 110 frames on the vsync, 27 at two vsyncs, 3 past 50 ms (the MX330 at a 1.5 pixel ratio)
    const [mean, missed] = window([...frames(110, 16.7), ...frames(27, 33.4), 66.7, 66.7, 83.3]);
    expect(mean).toBeLessThan(AUTO_QUALITY.lowMean);
    expect(qualityStep(mean, missed, 'high', false, 1)).toBe('low');
    // a settled tier moves the resolution instead
    expect(qualityStep(mean, missed, 'high', true, 1)).toBe('down');
    expect(qualityStep(mean, missed, 'low', true, AUTO_QUALITY.minScale)).toBe('hold');
  });

  it('M8.6 5.3 a smooth window holds high, climbs back from low, and a frame missed now and then changes nothing', () => {
    const [mean, missed] = window(frames(180, 16.7));
    expect(qualityStep(mean, missed, 'high', false, 1)).toBe('hold');
    expect(qualityStep(mean, missed, 'low', false, 1)).toBe('high');
    expect(qualityStep(mean, missed, 'low', false, 0.8)).toBe('up');
    const [mean2, missed2] = window([...frames(178, 16.7), 33.4, 33.4]);
    expect(qualityStep(mean2, missed2, 'high', false, 1)).toBe('hold');
    expect(qualityStep(mean2, missed2, 'low', false, 1)).toBe('high');
    // the mean's own rule stands: a steady 40 ms steps down
    const [mean3, missed3] = window(frames(75, 40));
    expect(qualityStep(mean3, missed3, 'high', false, 1)).toBe('low');
  });

  it("5.4 a 30 Hz pace (a 30 Hz screen, a browser's battery saver) keeps high and the full picture; a pile of cruisers at 60 Hz still steps down; a steady 25 fps too", () => {
    // every frame on a 30 Hz screen's time: it went to low and the smallest picture
    const paced = drive(90, () => 1000 / 30);
    expect(paced.steps).toEqual([]);
    expect([paced.tier, paced.scale]).toEqual(['high', 1]);
    // the MX330's pile (5.2), again and again: down as before
    const pile = [...frames(110, 16.7), ...frames(27, 33.4), 66.7, 66.7, 83.3];
    expect(drive(30, (i) => pile[i % pile.length] as number).steps[0]).toBe('low');
    // slower than any 30 Hz pace: down too
    expect(drive(30, () => 40).steps[0]).toBe('low');
  });
});
