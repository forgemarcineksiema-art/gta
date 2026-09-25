/**
 * The screen's colours for the canvases (the radar, the full map): the signals of `sim/palette.ts` (docs/M8.9_PLAN.md
 * R1) as CSS strings, the same values `styles.css` names in `:root` (pinned equal). One colour, one meaning.
 */
import { SIGNALS } from '../sim/palette';

/** A colour as `#rrggbb`. */
export function css(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** A colour at an alpha, as `rgba(…)`. */
export function cssAlpha(c: number, a: number): string {
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
}

export const MONEY = css(SIGNALS.money);
export const WAY = css(SIGNALS.way);
export const TROUBLE = css(SIGNALS.trouble);
export const POLICE = css(SIGNALS.police);
export const INK = css(SIGNALS.ink);
export const OFF = css(SIGNALS.off);
export const OUTLINE = css(SIGNALS.outline);
