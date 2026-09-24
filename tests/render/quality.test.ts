/**
 * The automatic quality reads the stutter, not only the mean (M8.6 slice 5, D10): the step from a window of frames.
 */
import { describe, expect, it } from 'vitest';
import { AUTO_QUALITY, qualityStep } from '../../src/render/quality';

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
});
