/**
 * The top of the screen (M7 slice 1, docs/M7_PLAN.md D3): the job line, a
 * card, the intro's caption, the key hints and the news stack in one column;
 * `arrangeTop` decides which show. The job line, a card and a caption always
 * show when they want to; the hints and the news never under a card or a
 * caption; the column's order is fixed.
 */
import { describe, expect, it } from 'vitest';
import { TOP_ORDER, arrangeTop, topBit, type TopItem } from '../../src/ui/lanes';

describe('the top of the screen', () => {
  it('M7 1.1 every combination: the job line, a card and a caption always show; the hints and the news wait under a card or a caption', () => {
    const bits = TOP_ORDER.map(topBit);
    // five distinct bits, in the column's order
    expect(new Set(bits).size).toBe(5);
    expect(TOP_ORDER).toEqual(['jobLine', 'card', 'caption', 'hints', 'news']);
    const has = (mask: number, item: TopItem): boolean => (mask & topBit(item)) !== 0;
    for (let wants = 0; wants < 32; wants++) {
      const shown = arrangeTop(wants);
      // nothing shows that did not want to
      expect(shown & ~wants).toBe(0);
      for (const item of ['jobLine', 'card', 'caption'] as const) expect(has(shown, item)).toBe(has(wants, item));
      const covered = has(wants, 'card') || has(wants, 'caption');
      expect(has(shown, 'hints')).toBe(has(wants, 'hints') && !covered);
      expect(has(shown, 'news')).toBe(has(wants, 'news') && !covered);
    }
  });
});
