/**
 * GOALS in pictures (docs/M8.9_PLAN.md R10): the day's three with a bar each, the wanted board as the rivals' cars
 * (the beaten ticked, the next framed), the hunts as three counters with their glyphs, the best run. Pure: the wall's
 * page draws what this says, the pictures from the atlas by their keys.
 */
import { CHIEF, RIVALS, posterNumber, type SimWorld } from '../../sim';
import type { GlyphId } from '../../sim/glyphs';

export interface GoalsModel {
  /** The day's three: the words, the share done (0..1, the bar), done, the reward. */
  dailies: Array<{ text: string; share: number; done: boolean; reward: number }>;
  /** The board: each rival's car (a picture key), its poster number or the Chief's star, beaten, next or waiting. */
  board: Array<{ picture: string; label: string; state: 'beaten' | 'next' | 'waiting' }>;
  /** The hunts: the billboards, the jumps, the day's caches, each its glyph and its count. */
  hunts: Array<{ glyph: GlyphId; n: number; of: number }>;
  bestRun: number;
}

export function goalsModel(sim: SimWorld): GoalsModel {
  const d = sim.dailies;
  const dailies: GoalsModel['dailies'] = [];
  for (let i = 0; i < 3; i++) {
    const text = d.text(i);
    if (text) dailies.push({ text, share: d.share(i), done: d.done[i] === true, reward: d.reward(i) });
  }
  const b = sim.board, next = b.next();
  const board = RIVALS.map((r, i) => ({
    picture: `body:${r.body}`,
    label: i === CHIEF ? '★' : `#${posterNumber(i)}`,
    state: b.isBeaten(i) ? 'beaten' as const : i === next ? 'next' as const : 'waiting' as const,
  }));
  const hunts: GoalsModel['hunts'] = [];
  const c = sim.collectibles, j = sim.jumps, k = sim.caches;
  if (c) hunts.push({ glyph: 'board', n: c.smashedCount, of: c.total });
  if (j) hunts.push({ glyph: 'ramp', n: j.foundCount, of: j.descs.length });
  if (k) hunts.push({ glyph: 'coin', n: k.count, of: k.total });
  return { dailies, board, hunts, bestRun: sim.run.bestRun };
}
