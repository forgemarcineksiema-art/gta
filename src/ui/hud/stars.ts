/**
 * The HUD's star in a line of text (docs/M8.9_PLAN.md R2): Rubik has no ★, and a font's star would not be the HUD's.
 * A text that names stars (ESCAPE ★★★, the stars' news, the Chief's poster) gets the stars' own shape in place of each
 * ★, sized and coloured as its letters, outlined as they are (`.star` in `styles.css`); any other text is written as
 * it is. Written on change only, as every text of the HUD.
 */

/** The HUD's star in its 24-unit box, clockwise from the top point (the stars top right draw the same). */
export const STAR = [12, 2, 15, 8.4, 22, 9.3, 16.9, 14.2, 18.2, 21.2, 12, 17.8, 5.8, 21.2, 7.1, 14.2, 2, 9.3, 9, 8.4] as const;

/** The star's outline as a path's `d`. */
export const STAR_OUTLINE = `M${STAR.slice(0, 2).join(' ')} ${STAR.slice(2).join(' ')}Z`;

const SVG = 'http://www.w3.org/2000/svg';

/** One star, inline: an SVG the size of a letter. */
export function starIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'star');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', STAR_OUTLINE);
  svg.appendChild(path);
  return svg;
}

/** A text into an element, each ★ drawn as the HUD's star. */
export function starText(e: Element, text: string): void {
  if (!text.includes('★')) {
    e.textContent = text;
    return;
  }
  e.textContent = '';
  const parts = text.split('★');
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) e.appendChild(starIcon());
    const part = parts[i] as string;
    if (part !== '') e.appendChild(document.createTextNode(part));
  }
}
