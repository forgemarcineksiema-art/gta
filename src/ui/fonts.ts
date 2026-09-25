/**
 * One typeface (docs/M8.9_PLAN.md R2, slice 6): Rubik (SIL Open Font License 1.1, `public/fonts/OFL.txt`), three faces
 * cut to the game's characters: Bold 700 for the labels, Black 900 and Black Italic 900 for the display. The build
 * carries them in `fonts/` beside the page, registered here with the page's own relative URL (CrazyGames serves the
 * build from any folder); `index.html` preloads the display face. A character outside the ranges falls to the
 * system's sans; the screen's ★ is the HUD's star drawn inline (`hud/stars.ts`), never a glyph.
 *
 * The canvases write their words only once `fontReady()`: a canvas does not redraw when a font arrives, and a word
 * measured in the fallback would be placed for the wrong width.
 */

/** The subsets' characters (docs/ASSETS.md has the command that cut them): Basic Latin, Latin-1, the Polish letters,
 * the dashes, the quotes, the ellipsis, the angle quotes of the settings' steps. */
export const FONT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], [0xa0, 0xff],
  [0x104, 0x107], [0x118, 0x119], [0x141, 0x144], [0x15a, 0x15b], [0x179, 0x17c],
  [0x2013, 0x2014], [0x2018, 0x2019], [0x201c, 0x201e], [0x2026, 0x2026], [0x2039, 0x203a],
];

export const FONT_FAMILY = 'Rubik';

/** What the screen writes in: Rubik, then the system's sans for anything outside its ranges. The CSS's `--font`. */
export const FONT_STACK = "Rubik, 'Segoe UI', Arial, system-ui, sans-serif";

/** The build's faces, beside the page. */
export const FONT_FACES: ReadonlyArray<{ file: string; weight: string; style: 'normal' | 'italic' }> = [
  { file: 'rubik-700.woff2', weight: '700', style: 'normal' },
  { file: 'rubik-900.woff2', weight: '900', style: 'normal' },
  { file: 'rubik-900i.woff2', weight: '900', style: 'italic' },
];

/** The ranges as a `unicode-range`: `U+20-7E, U+A0-FF, …`. */
export function unicodeRange(): string {
  const hex = (v: number): string => v.toString(16).toUpperCase();
  return FONT_RANGES.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ');
}

/** Whether the subsets draw this character. */
export function inRanges(code: number): boolean {
  for (const [a, b] of FONT_RANGES) if (code >= a && code <= b) return true;
  return false;
}

let ready = false;

/** Whether the display face is in: the canvases write their words from then on (at once where there is no page). */
export function fontReady(): boolean {
  return ready || typeof document === 'undefined';
}

/**
 * The faces registered with the document (`font-display: swap`: the first frames may use the fallback), and the
 * display face loaded. Never fails: a face that does not come leaves the system's sans, and the canvases write in it.
 */
export function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !('fonts' in document)) {
    ready = true;
    return Promise.resolve();
  }
  const range = unicodeRange();
  for (const f of FONT_FACES) {
    document.fonts.add(new FontFace(FONT_FAMILY, `url(./fonts/${f.file}) format('woff2')`, { weight: f.weight, style: f.style, display: 'swap', unicodeRange: range }));
  }
  return document.fonts.load(`900 16px ${FONT_FAMILY}`).then(() => { ready = true; }, () => { ready = true; });
}
