/**
 * The stars (docs/M8.9_PLAN.md R4, slice 8): no `+n`; the next star fills from its foot as the heat rises, 0 at a
 * level's start and whole at the next level's threshold.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { heatFill, starFillPath } from '../../src/ui/hud/heat';

/** The y values of a path's points. */
function ys(d: string): number[] {
  return [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2]));
}

describe('the stars (M8.9 slice 8)', () => {
  it('M8.9 8.2 the next star is empty at a level\'s start, whole at the next, rising in between', () => {
    const levels = [0, ...BALANCE.heatThresholds];
    for (let k = 0; k + 1 < levels.length; k++) {
      const lo = levels[k] as number, hi = levels[k + 1] as number;
      expect(heatFill(lo), `level ${k}`).toBe(0);
      expect(heatFill(hi - 1e-6), `level ${k}`).toBeGreaterThan(0.99);
      expect(heatFill((lo + hi) / 2), `level ${k}`).toBeCloseTo(0.5, 6);
      let last = -1;
      for (let p = lo; p < hi; p += (hi - lo) / 16) {
        const f = heatFill(p);
        expect(f).toBeGreaterThan(last);
        last = f;
      }
    }
    // the top level has no next star
    expect(heatFill(100)).toBe(0);

    // drawn from the foot: none at 0, the whole star at 1, and half of it keeps only the points below its middle
    expect(starFillPath(0)).toBe('');
    const whole = ys(starFillPath(1));
    expect(Math.min(...whole)).toBeCloseTo(2, 6);
    expect(Math.max(...whole)).toBeCloseTo(21.2, 6);
    const half = ys(starFillPath(0.5));
    expect(Math.min(...half)).toBeCloseTo(11.6, 6);
    expect(Math.max(...half)).toBeCloseTo(21.2, 6);
  });
});
