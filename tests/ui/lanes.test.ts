/**
 * The top of the screen (M7 slice 1, docs/M7_PLAN.md D3; docs/M8.9_PLAN.md R5): the job line, a card, the intro's
 * caption, the key hints and the news stack in one column in a fixed order, so none is drawn over another; the top's
 * voice gives the line at most one more (`voice.test.ts`, M8.9 9.1).
 */
import { describe, expect, it } from 'vitest';
import { TOP_ORDER } from '../../src/ui/hud/lanes';

describe('the top of the screen', () => {
  it('M7 1.1 the column\'s order is fixed: the line, a card, the caption, the hints, the news', () => {
    expect(TOP_ORDER).toEqual(['jobLine', 'card', 'caption', 'hints', 'news']);
  });
});
