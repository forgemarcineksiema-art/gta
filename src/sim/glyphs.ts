/**
 * The signs' pictograms (docs/M8.7_PLAN.md D5; DESIGN.md §20.3 rule 5): one outline per kind, drawn at four sizes
 * by one source: the sign's face in the world (extruded), the radar's and the full map's glyph, and the goal line's
 * badge. Pure data in a unit square, x right and y down; a shape is an outer polygon and its holes, each a flat
 * list of x, y pairs, filled even-odd. No Three.js, no DOM: the render and the ui both read it.
 *
 * Bold silhouettes only, told apart in grey at 14 px: a parcel (delivery), a car key (steal to order), a police
 * light (escape), a stopwatch (time trial), a chequered flag (street race), a crash star (takedown rage), a hammer
 * (mayhem), a taxi (a fare), the house (the garage), the Chief's star, and the digits of a rival's poster number.
 */
import { posterNumber } from './board/rivals';
import type { JobDef, JobKind } from './jobs/catalog';
import type { Goal } from './run/goal';

export interface GlyphShape {
  outer: readonly number[];
  holes?: readonly (readonly number[])[];
}

export type GlyphId = 'parcel' | 'key' | 'siren' | 'watch' | 'flag' | 'crash' | 'hammer' | 'taxi' | 'house' | 'star'
  | 'd0' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8' | 'd9'
  // the HUD's own (docs/M8.9_PLAN.md R4): the bag's sack, the bank's coin, the boost's flame; not signs, so not in GLYPH_ORDER
  | 'sack' | 'coin' | 'flame';

/** A regular polygon's points (a circle at `n` sides), clockwise from the top. */
function circle(cx: number, cy: number, r: number, n = 20): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  }
  return out;
}

/** A rectangle from (x0, y0) to (x1, y1). */
function rect(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

/** A star of `n` points between radii `ro` and `ri`, the first point up. */
function star(cx: number, cy: number, ro: number, ri: number, n: number, turn = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + turn;
    const r = i % 2 === 0 ? ro : ri;
    out.push(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  }
  return out;
}

/** A polygon turned `a` radians about the square's centre (clockwise on the screen for a positive angle), scaled `k` about it. */
function turn(pts: number[], a: number, k = 1): number[] {
  const c = Math.cos(a) * k, s = Math.sin(a) * k, out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = (pts[i] as number) - 0.5, y = (pts[i + 1] as number) - 0.5;
    out.push(0.5 + x * c - y * s, 0.5 + x * s + y * c);
  }
  return out;
}

/** A polygon shrunk toward its centroid by `k` (the parcel's faces, so the gaps between them draw its edges). */
function inset(pts: number[], k: number): number[] {
  let cx = 0, cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) { cx += pts[i * 2] as number; cy += pts[i * 2 + 1] as number; }
  cx /= n; cy /= n;
  return pts.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * k : cy + (v - cy) * k));
}

/** A seven-segment digit in a cell `w` wide from (x0, y0) to y1: the segments of `lit` (a..g). */
function digit(lit: string, x0: number, y0: number, w: number, y1: number): GlyphShape[] {
  const t = w * 0.34, h = y1 - y0, m = y0 + h / 2;
  const seg: Record<string, number[]> = {
    a: rect(x0, y0, x0 + w, y0 + t),
    b: rect(x0 + w - t, y0, x0 + w, m + t / 2),
    c: rect(x0 + w - t, m - t / 2, x0 + w, y1),
    d: rect(x0, y1 - t, x0 + w, y1),
    e: rect(x0, m - t / 2, x0 + t, y1),
    f: rect(x0, y0, x0 + t, m + t / 2),
    g: rect(x0, m - t / 2, x0 + w, m + t / 2),
  };
  return [...lit].map((s) => ({ outer: seg[s] as number[] }));
}

const DIGIT_SEGMENTS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

export const GLYPHS: Readonly<Record<GlyphId, readonly GlyphShape[]>> = {
  // the three faces of a box seen from above a corner; the gaps between them are its edges
  parcel: [
    { outer: inset([0.5, 0.1, 0.87, 0.3, 0.5, 0.5, 0.13, 0.3], 0.9) },
    { outer: inset([0.13, 0.34, 0.47, 0.54, 0.47, 0.92, 0.13, 0.72], 0.9) },
    { outer: inset([0.53, 0.54, 0.87, 0.34, 0.87, 0.72, 0.53, 0.92], 0.9) },
  ],
  // a round bow with its hole, the blade and two teeth
  key: [
    { outer: circle(0.28, 0.42, 0.2), holes: [circle(0.28, 0.42, 0.08, 14)] },
    { outer: rect(0.44, 0.36, 0.92, 0.48) },
    { outer: rect(0.7, 0.48, 0.78, 0.64) },
    { outer: rect(0.84, 0.48, 0.92, 0.58) },
  ],
  // the police light: a dome on its base, three rays over it
  siren: [
    { outer: [0.26, 0.72, 0.26, 0.56, 0.3, 0.46, 0.38, 0.39, 0.5, 0.36, 0.62, 0.39, 0.7, 0.46, 0.74, 0.56, 0.74, 0.72] },
    { outer: rect(0.16, 0.74, 0.84, 0.88) },
    { outer: rect(0.46, 0.08, 0.54, 0.28) },
    { outer: [0.14, 0.2, 0.2, 0.14, 0.34, 0.28, 0.28, 0.34] },
    { outer: [0.86, 0.2, 0.8, 0.14, 0.66, 0.28, 0.72, 0.34] },
  ],
  // a stopwatch: the case with its face cut out, the hand, the crown on its stem
  watch: [
    { outer: circle(0.5, 0.58, 0.36), holes: [circle(0.5, 0.58, 0.26)] },
    { outer: [0.47, 0.6, 0.53, 0.6, 0.66, 0.4, 0.61, 0.37] },
    { outer: rect(0.46, 0.14, 0.54, 0.24) },
    { outer: rect(0.38, 0.06, 0.62, 0.14) },
  ],
  // the pole and a flag of three by two squares, every other one cut out
  flag: [
    { outer: rect(0.14, 0.08, 0.22, 0.94) },
    { outer: rect(0.22, 0.1, 0.88, 0.54), holes: [rect(0.44, 0.1, 0.66, 0.32), rect(0.22, 0.32, 0.44, 0.54), rect(0.66, 0.32, 0.88, 0.54)] },
  ],
  // a crash: a jagged burst
  crash: [{ outer: star(0.5, 0.5, 0.46, 0.2, 9, 0.12) }],
  // a claw hammer, tilted: the flat face on the left, the claw on the right, the handle down
  hammer: [
    { outer: turn([0.16, 0.1, 0.36, 0.1, 0.36, 0.16, 0.66, 0.16, 0.9, 0.08, 0.84, 0.24, 0.9, 0.4, 0.66, 0.32, 0.36, 0.32, 0.36, 0.38, 0.16, 0.38], -0.5, 0.86) },
    { outer: turn(rect(0.43, 0.32, 0.58, 0.94), -0.5, 0.86) },
  ],
  // a taxi: the body, the cabin, the roof sign, the wheels cut out
  taxi: [
    { outer: [0.08, 0.72, 0.08, 0.56, 0.2, 0.52, 0.3, 0.36, 0.7, 0.36, 0.8, 0.52, 0.92, 0.56, 0.92, 0.72],
      holes: [circle(0.28, 0.72, 0.1, 12), circle(0.72, 0.72, 0.1, 12)] },
    { outer: rect(0.4, 0.2, 0.6, 0.32) },
    { outer: circle(0.28, 0.72, 0.07, 12) },
    { outer: circle(0.72, 0.72, 0.07, 12) },
  ],
  // the garage: a house with its door cut out
  house: [{ outer: [0.12, 0.5, 0.5, 0.12, 0.88, 0.5, 0.88, 0.9, 0.12, 0.9], holes: [rect(0.36, 0.56, 0.64, 0.9)] }],
  // the Chief's star
  star: [{ outer: star(0.5, 0.54, 0.44, 0.18, 5) }],
  d0: digit(DIGIT_SEGMENTS[0] as string, 0.18, 0.1, 0.64, 0.9),
  d1: digit(DIGIT_SEGMENTS[1] as string, 0.18, 0.1, 0.64, 0.9),
  d2: digit(DIGIT_SEGMENTS[2] as string, 0.18, 0.1, 0.64, 0.9),
  d3: digit(DIGIT_SEGMENTS[3] as string, 0.18, 0.1, 0.64, 0.9),
  d4: digit(DIGIT_SEGMENTS[4] as string, 0.18, 0.1, 0.64, 0.9),
  d5: digit(DIGIT_SEGMENTS[5] as string, 0.18, 0.1, 0.64, 0.9),
  d6: digit(DIGIT_SEGMENTS[6] as string, 0.18, 0.1, 0.64, 0.9),
  d7: digit(DIGIT_SEGMENTS[7] as string, 0.18, 0.1, 0.64, 0.9),
  d8: digit(DIGIT_SEGMENTS[8] as string, 0.18, 0.1, 0.64, 0.9),
  d9: digit(DIGIT_SEGMENTS[9] as string, 0.18, 0.1, 0.64, 0.9),
  // the bag: a sack tied at the neck (the gap between its top and its body is the string)
  sack: [
    { outer: [0.3, 0.08, 0.42, 0.16, 0.5, 0.1, 0.58, 0.16, 0.7, 0.08, 0.63, 0.22, 0.6, 0.28, 0.4, 0.28, 0.37, 0.22] },
    { outer: [0.4, 0.32, 0.6, 0.32, 0.74, 0.42, 0.85, 0.56, 0.89, 0.71, 0.84, 0.85, 0.7, 0.93, 0.5, 0.95, 0.3, 0.93, 0.16, 0.85, 0.11, 0.71, 0.15, 0.56, 0.26, 0.42] },
  ],
  // the bank: a coin, its rim and its face
  coin: [
    { outer: circle(0.5, 0.5, 0.44, 28), holes: [circle(0.5, 0.5, 0.33, 28)] },
    { outer: circle(0.5, 0.5, 0.24, 20) },
  ],
  // the boost: a flame with a lick on its left and its core cut out
  flame: [
    {
      outer: [0.5, 0.04, 0.62, 0.2, 0.74, 0.34, 0.84, 0.5, 0.86, 0.64, 0.8, 0.78, 0.68, 0.9, 0.5, 0.95, 0.32, 0.9, 0.2, 0.78, 0.14, 0.64, 0.16, 0.5, 0.24, 0.38, 0.3, 0.46, 0.34, 0.3, 0.42, 0.18],
      holes: [[0.5, 0.5, 0.58, 0.62, 0.62, 0.72, 0.58, 0.82, 0.5, 0.86, 0.42, 0.82, 0.38, 0.72, 0.42, 0.62]],
    },
  ],
};

/** Each job kind's pictogram; a rival's is its number (`numberGlyphs`), the Chief's the star. */
export const KIND_GLYPH: Readonly<Record<JobKind, GlyphId>> = {
  delivery: 'parcel', order: 'key', escape: 'siren', trial: 'watch', race: 'flag', rage: 'crash', mayhem: 'hammer',
  fare: 'taxi', duel: 'star',
};

/** The pictograms in a fixed order: a drawn glyph is an index into this, or minus a rival's poster number. */
export const GLYPH_ORDER: readonly GlyphId[] = [
  'parcel', 'key', 'siren', 'watch', 'flag', 'crash', 'hammer', 'taxi', 'house', 'star',
  'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9',
];
const GLYPH_INDEX = new Map<GlyphId, number>(GLYPH_ORDER.map((g, i) => [g, i]));
export function glyphIndex(g: GlyphId): number {
  return GLYPH_INDEX.get(g) ?? 0;
}

/** A marker's pictogram: its kind's; a rival's, its poster number (the Chief's, the star). */
export function glyphOf(d: JobDef): number {
  if (d.kind === 'duel') {
    const n = posterNumber(d.level);
    return n > 0 ? -n : glyphIndex('star');
  }
  return glyphIndex(KIND_GLYPH[d.kind]);
}

/** The goal's pictogram (the line's badge, the maps'): its door's house, its def's, else none (-100). */
export function goalGlyph(goal: Goal, defOf: (id: number) => JobDef | null): number {
  if (!goal.hasTarget) return NO_GLYPH;
  if (goal.door >= 0) return glyphIndex('house');
  const d = goal.id >= 0 ? defOf(goal.id) : null;
  return d ? glyphOf(d) : NO_GLYPH;
}
export const NO_GLYPH = -100;

/** A number's digit glyphs, left to right (a rival's poster number, 1..10). */
export function numberGlyphs(n: number): GlyphId[] {
  return [...String(Math.max(0, Math.floor(n)))].map((c) => `d${c}` as GlyphId);
}

/**
 * Where the i-th of `count` digits sits on a sign: a digit's unit square is drawn narrowed by `sx` about the
 * column's centre `cx` (x' = cx + (x − 0.5) × sx), so a two-digit number's digits stand side by side.
 */
export function digitSlot(i: number, count: number): { cx: number; sx: number } {
  if (count <= 1) return { cx: 0.5, sx: 1 };
  return { cx: (i + 0.5) / count, sx: Math.min(1, 1.25 / count) };
}
