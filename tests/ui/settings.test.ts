/**
 * The settings (M7 slice 3, docs/history/M7_PLAN.md D5): a volume step is a gain on a
 * dB curve (10 full, 3 dB a step, 0 silent); the radar north up holds its
 * heading at north whatever the car does. The save's version 4 is pinned in
 * tests/sim/save.test.ts (M7 3.1).
 */
import { describe, expect, it } from 'vitest';
import { volumeGain } from '../../src/sim';
import { advance, type MinimapState } from '../../src/ui/map/minimapModel';

describe('the settings', () => {
  it('M7 3.2 a volume step maps to a gain on a dB curve: 10 is 0 dB, 3 dB a step, 0 is silence', () => {
    expect(volumeGain(10)).toBe(1);
    expect(volumeGain(0)).toBe(0);
    expect(20 * Math.log10(volumeGain(7))).toBeCloseTo(-9, 9);
    for (let s = 1; s <= 10; s++) expect(volumeGain(s)).toBeGreaterThan(volumeGain(s - 1));
    // out of range clamps
    expect(volumeGain(14)).toBe(1);
    expect(volumeGain(-2)).toBe(0);
  });

  it('M7 3.3 north up: the radar holds its heading at north whatever the car does; turning, it follows the car', () => {
    const state: MinimapState = { heading: 1.2, radiusM: 120 };
    for (let i = 0; i < 120; i++) advance(state, 1 / 60, 2.5, 10, -3, 12, false, true);
    expect(Math.abs(state.heading)).toBeLessThan(1e-3);
    advance(state, 1 / 60, 2.5, 10, -3, 12, true, false);
    expect(state.heading).toBeCloseTo(Math.atan2(10, -3), 6);
  });
});
