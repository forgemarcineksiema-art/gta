/**
 * Each street-furniture kind's low-poly model (M8, docs/M8_PLAN.md §3.1): its parts in the prop's own frame (+Z
 * the face it turns to the road, y up from the ground), boxes and six-sided cylinders in the palette's colours.
 * A standing prop is drawn inside its chunk's mesh from these parts (`propStatics`); a knocked one by its kind's
 * instanced mesh built from the same parts, so both are one model.
 */
import { CITY_COLORS, PALETTE, PROP_TYPES, quatFromYaw, type PropDesc, type PropKind, type StaticDesc } from '../sim';

/** One part: a box (half extents) or a cylinder (`hx` its radius, `hy` its half height, six or eight sides). */
export interface PropPart { shape: 'box' | 'cylinder'; x: number; y: number; z: number; hx: number; hy: number; hz: number; color: number; sides?: number }

const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number, color: number): PropPart => ({ shape: 'box', x, y, z, hx, hy, hz, color });
const cyl = (x: number, y: number, z: number, r: number, hh: number, color: number, sides = 6): PropPart => ({ shape: 'cylinder', x, y, z, hx: r, hy: hh, hz: r, color, sides });

const POLE = 0x686678;
const TRUNK = 0x8b7966;
const STAKE = PALETTE.wafer;
const WOOD = CITY_COLORS.brick;

/**
 * The models (slice 0: the lamp post, the sapling, the bin, the bench; the rest come with their slices and stand
 * in as their collider's box until then).
 */
const MODELS: Partial<Record<PropKind, readonly PropPart[]>> = {
  // an 8 m steel pole on a base, its arm and lit head reaching over the road
  lamp: [
    box(0, 0.25, 0, 0.14, 0.25, 0.14, PALETTE.graphite),
    box(0, 4.1, 0, 0.08, 3.85, 0.08, POLE),
    box(0, 7.9, 0.6, 0.05, 0.05, 0.62, POLE),
    box(0, 7.83, 1.3, 0.2, 0.09, 0.38, PALETTE.laneMark),
  ],
  // a young street tree: a thin trunk between two stakes, a six-sided crown
  sapling: [
    box(0, 1.3, 0, 0.06, 1.3, 0.06, TRUNK),
    box(0.22, 0.75, 0, 0.025, 0.75, 0.025, STAKE),
    box(-0.22, 0.75, 0, 0.025, 0.75, 0.025, STAKE),
    cyl(0, 3.15, 0, 1.0, 0.85, CITY_COLORS.leaves),
    cyl(0.15, 4.25, 0, 0.6, 0.4, CITY_COLORS.hedge),
  ],
  // a green street bin and its lid
  bin: [
    cyl(0, 0.46, 0, 0.27, 0.46, CITY_COLORS.hedge),
    cyl(0, 0.95, 0, 0.3, 0.04, PALETTE.graphite),
  ],
  // wooden slats on two iron frames, the seat toward the road
  bench: [
    box(0, 0.45, 0.02, 0.9, 0.035, 0.2, WOOD),
    box(0, 0.72, -0.2, 0.9, 0.15, 0.025, WOOD),
    box(0.8, 0.23, -0.02, 0.035, 0.23, 0.2, PALETTE.graphite),
    box(-0.8, 0.23, -0.02, 0.035, 0.23, 0.2, PALETTE.graphite),
  ],
};

/** A kind's parts: its model, or its collider's box until its slice brings one. */
export function propParts(kind: PropKind): readonly PropPart[] {
  const model = MODELS[kind];
  if (model) return model;
  const s = PROP_TYPES[kind].shape;
  return s.kind === 'box' ? [box(0, s.hy, 0, s.hx, s.hy, s.hz, PALETTE.steel)] : [cyl(0, s.halfHeight, 0, s.radius, s.halfHeight, PALETTE.steel)];
}

/**
 * A standing prop's pieces for its chunk's mesh, pushed onto `out`: its parts at its place, each carrying its id.
 * A tall kind's pieces cast shadows and are drawn at both detail levels; a small kind's only near, in no shadow.
 */
export function propStatics(p: PropDesc, out: StaticDesc[]): void {
  const tall = PROP_TYPES[p.kind].tall;
  const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw), rotation = quatFromYaw(p.yaw);
  for (const part of propParts(p.kind)) {
    // local +Z maps to (sin yaw, cos yaw), local +X to (cos yaw, -sin yaw)
    const position = { x: p.x + cos * part.x + sin * part.z, y: part.y, z: p.z - sin * part.x + cos * part.z };
    const shape = part.shape === 'box' ? { kind: 'box' as const, hx: part.hx, hy: part.hy, hz: part.hz }
      : { kind: 'cylinder' as const, radius: part.hx, halfHeight: part.hy, ...(part.sides ? { sides: part.sides } : {}) };
    out.push({ shape, position, rotation, color: part.color, tag: tall ? 'prop' : 'prop-low', detailOnly: !tall, prop: p.id });
  }
}
