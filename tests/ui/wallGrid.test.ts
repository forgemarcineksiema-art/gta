import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIT } from '../../src/sim/garage/kit';
import { STYLE_SLOTS, GARAGE_PAINTS } from '../../src/ui/wall/garage';
import { gridMove, gridStart, type GridMove, type GridPos } from '../../src/ui/wall/wallGrid';

/** Every card reached from the first by the keys, and whether S from the first row leaves the page. */
function walk(rows: number[]): { reached: Set<string>; leaves: boolean } {
  const start = gridStart(rows);
  const reached = new Set<string>();
  if (!start) return { reached, leaves: false };
  const queue: GridPos[] = [start];
  let leaves = false;
  while (queue.length) {
    const at = queue.pop() as GridPos;
    const key = `${at.row},${at.col}`;
    if (reached.has(key)) continue;
    reached.add(key);
    for (const move of ['left', 'right', 'deeper', 'back'] as GridMove[]) {
      const next = gridMove(rows, at, move);
      if (next === null) { if (at.row === start.row) leaves = true; continue; }
      expect(next.col).toBeLessThan(rows[next.row] as number);
      queue.push(next);
    }
  }
  return { reached, leaves };
}

describe('the wall\'s keys as a grid (M7 slice 12)', () => {
  it('M7 12.2 every card on STYLE and CARS is reachable; S from the first row leaves the page, from any other it goes up a row', () => {
    // STYLE: the paints, then a row a kit slot
    const style = [GARAGE_PAINTS.length, ...STYLE_SLOTS.map((slot) => KIT.filter((k) => k.slot === slot).length)];
    expect(style.reduce((a, b) => a + b, 0)).toBe(GARAGE_PAINTS.length + KIT.length);
    const s = walk(style);
    expect(s.reached.size).toBe(GARAGE_PAINTS.length + KIT.length);
    expect(s.leaves).toBe(true);
    // a row back keeps the column where it can, and never leaves from a deeper row
    expect(gridMove(style, { row: 4, col: 10 }, 'back')).toEqual({ row: 3, col: Math.min(10, (style[3] as number) - 1) });
    expect(gridMove(style, { row: 1, col: 0 }, 'back')).toEqual({ row: 0, col: 0 });
    expect(gridMove(style, { row: 0, col: 3 }, 'back')).toBeNull();
    // the last row: W stays; the row's ends stop A and D
    expect(gridMove(style, { row: 8, col: 2 }, 'deeper')).toEqual({ row: 8, col: 2 });
    expect(gridMove(style, { row: 2, col: 0 }, 'left')).toEqual({ row: 2, col: 0 });
    expect(gridMove(style, { row: 2, col: (style[2] as number) - 1 }, 'right')).toEqual({ row: 2, col: (style[2] as number) - 1 });
    // the far corner in rows, not a walk of the whole page: W to the last row, D to its end
    let at: GridPos = { row: 0, col: 0 }, presses = 0;
    while (at.row < style.length - 1) { at = gridMove(style, at, 'deeper') as GridPos; presses++; }
    while (at.col < (style[at.row] as number) - 1) { at = gridMove(style, at, 'right') as GridPos; presses++; }
    expect(presses).toBeLessThan(20);
    // CARS: one row, the hidden cars not in it; an empty row is stepped over
    const cars = walk([5]);
    expect(cars.reached.size).toBe(5);
    expect(cars.leaves).toBe(true);
    expect(gridMove([3, 0, 2], { row: 0, col: 2 }, 'deeper')).toEqual({ row: 2, col: 1 });
    expect(gridStart([0, 0, 4])).toEqual({ row: 2, col: 0 });
  });
});

describe('the showroom wall (M8.9 slice 13)', () => {
  it('M8.9 13.4 the wall on the right walks the same grid: the rows are the pages’ own, never read off the layout', () => {
    const garage = readFileSync(new URL('../../src/ui/wall/garage.ts', import.meta.url), 'utf8');
    for (const read of ['offsetTop', 'offsetLeft', 'getBoundingClientRect', 'clientWidth']) expect(garage.includes(read), read).toBe(false);
    // the cars in one row, a row per upgrade, the boosters two by two: the same walk at any width
    const rows = [7, 1, 1, 1, 2, 2];
    expect(gridMove(rows, { row: 0, col: 6 }, 'deeper')).toEqual({ row: 1, col: 0 });
    expect(gridMove(rows, { row: 4, col: 1 }, 'deeper')).toEqual({ row: 5, col: 1 });
    expect(gridMove(rows, { row: 0, col: 3 }, 'back')).toBeNull();
    // the wall: on the right, 45 % of the width at most
    const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.run__wall \{\s*left: auto;\s*right: calc\(1rem \+ var\(--safe-right\)\);\s*transform: translateY\(-50%\);\s*width: min\(45vw, 36rem\);/);
  });
});
