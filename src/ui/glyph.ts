/**
 * The pictograms on the screen (docs/M8.9_PLAN.md R4): one drawing wherever a glyph appears, as SVG path data from
 * `sim/glyphs.ts`'s outlines. The goal's badge, the bag's sack, the bank's coin and the boost's flame read it.
 */
import { GLYPHS, type GlyphId } from '../sim/glyphs';

/** A glyph's shapes as `d` strings, one per shape (filled even-odd), its unit square narrowed by `sx` about `cx`. */
export function glyphPaths(id: GlyphId, cx = 0.5, sx = 1): string[] {
  const out: string[] = [];
  for (const shape of GLYPHS[id]) {
    let d = '';
    for (const pts of [shape.outer, ...(shape.holes ?? [])]) {
      for (let i = 0; i < pts.length; i += 2) {
        d += `${i === 0 ? 'M' : 'L'}${(cx + ((pts[i] as number) - 0.5) * sx).toFixed(3)} ${(pts[i + 1] as number).toFixed(3)}`;
      }
      d += 'Z';
    }
    out.push(d);
  }
  return out;
}

/** A glyph's `<path>` elements' markup (their fill is the parent's). */
export function glyphMarkup(id: GlyphId, cx = 0.5, sx = 1): string {
  return glyphPaths(id, cx, sx).map((d) => `<path d="${d}" fill-rule="evenodd"/>`).join('');
}

/** A glyph as an inline SVG in the unit square, filled with the text's colour: the HUD's sack, coin and flame. */
export function glyphIcon(id: GlyphId, className: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  svg.innerHTML = glyphMarkup(id);
  return svg;
}
