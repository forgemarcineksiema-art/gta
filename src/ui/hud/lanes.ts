/**
 * The top of the screen (M7 slice 1, DESIGN.md §15.3, docs/history/M7_PLAN.md D3). Five things want the top centre: the
 * job line, a job's card, the intro's caption, the key hints and the news. They stack in one column in that order,
 * so none is ever drawn over another. Which of them show is the top's voice's (`voice.ts`, docs/M8.9_PLAN.md R5):
 * the goal line and at most one more.
 */
export type TopItem = 'jobLine' | 'card' | 'caption' | 'hints' | 'news';

/** The column's order, top to bottom. */
export const TOP_ORDER: readonly TopItem[] = ['jobLine', 'card', 'caption', 'hints', 'news'];

/** The column at the top centre, in the HUD's layer; the items' own elements are moved into it in `TOP_ORDER`. */
export function mountTop(parent: HTMLElement, items: Readonly<Partial<Record<TopItem, HTMLElement>>>): HTMLElement {
  const column = document.createElement('div');
  column.className = 'hud__top';
  for (const item of TOP_ORDER) {
    const e = items[item];
    if (e && !column.contains(e)) column.appendChild(e);
  }
  parent.appendChild(column);
  return column;
}
