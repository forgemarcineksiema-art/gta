/**
 * The top of the screen (M7 slice 1, DESIGN.md §15.3, docs/M7_PLAN.md D3). Five things want the top centre: the
 * job line, a job's card, the intro's caption, the key hints and the news. They stack in one column in that order,
 * so none is ever drawn over another; this decides which of them show. The stacking is the column's.
 */
export type TopItem = 'jobLine' | 'card' | 'caption' | 'hints' | 'news';

/** The column's order, top to bottom. */
export const TOP_ORDER: readonly TopItem[] = ['jobLine', 'card', 'caption', 'hints', 'news'];

const BIT: Readonly<Record<TopItem, number>> = { jobLine: 1, card: 2, caption: 4, hints: 8, news: 16 };

/** The item's bit in a `wants` mask. */
export function topBit(item: TopItem): number {
  return BIT[item];
}

/**
 * Of the items that want to show (a mask of `topBit`s), the ones that do: everything, except the key hints under a
 * card or a caption (the card carries its own key, the caption teaches the same ones) and the news while a card or a
 * caption is up (it waits, its clock stopped); while the wall behind a shut door or the busted card has the screen
 * (`screenTaken`, M8.5), the hints and the news wait too (the STYLE page fills the screen's height: the M7 gate's
 * screens found the news over its tabs). No allocation.
 */
export function arrangeTop(wants: number, taken = false): number {
  return taken || wants & (BIT.card | BIT.caption) ? wants & ~(BIT.hints | BIT.news) : wants;
}

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
