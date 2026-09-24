/**
 * The wall's keys as a grid (M7 slice 12, DESIGN.md §15): on the CARS and STYLE pages the cards stand in rows, A and
 * D walk a row, W goes a row deeper and S a row back, and S from the first row leaves the page for the tabs (the
 * wall's own grammar: W in, S out). Pure: the rows are counts of the cards a row shows.
 */

export interface GridPos {
  row: number;
  col: number;
}

export type GridMove = 'left' | 'right' | 'deeper' | 'back';

/**
 * The focus after a move in rows of `rows[r]` cards (empty rows are stepped over), or null when the move leaves the
 * page. Along a row the focus stops at its ends; between rows it keeps its column where the row is long enough.
 */
export function gridMove(rows: readonly number[], at: GridPos, move: GridMove): GridPos | null {
  const len = rows[at.row] ?? 0;
  if (move === 'left') return { row: at.row, col: Math.max(0, at.col - 1) };
  if (move === 'right') return { row: at.row, col: Math.min(len - 1, at.col + 1) };
  const step = move === 'deeper' ? 1 : -1;
  for (let r = at.row + step; r >= 0 && r < rows.length; r += step) {
    const n = rows[r] ?? 0;
    if (n > 0) return { row: r, col: Math.min(at.col, n - 1) };
  }
  // no row further back: out to the tabs; none deeper: stay
  return move === 'back' ? null : { row: at.row, col: at.col };
}

/** The first card of the first row that has one: where the keys come in from the tabs. */
export function gridStart(rows: readonly number[]): GridPos | null {
  for (let r = 0; r < rows.length; r++) if ((rows[r] ?? 0) > 0) return { row: r, col: 0 };
  return null;
}
