/**
 * Each street-furniture kind's low-poly model (M8, docs/history/M8_PLAN.md §3.1): its parts in the prop's own frame (+Z
 * the face it turns to the road, y up from the ground), boxes and six-sided cylinders in the palette's colours.
 * A standing prop is drawn inside its chunk's mesh from these parts (`propStatics`); a knocked one by its kind's
 * instanced mesh built from the same parts, so both are one model.
 */
import { CITY_COLORS, PALETTE, PROP_TYPES, quatFromYaw, type PropDesc, type PropKind, type StaticDesc } from '../../sim';
import { ACCENTS } from '../../sim/palette';

/**
 * One part: a box (half extents) or a cylinder (`hx` its radius, `hy` its half height, six or eight sides); `glow` for a
 * part lit at dusk while it stands (a lamp's head, M8.9 R9).
 */
export interface PropPart { shape: 'box' | 'cylinder'; x: number; y: number; z: number; hx: number; hy: number; hz: number; color: number; sides?: number; glow?: boolean }

const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number, color: number): PropPart => ({ shape: 'box', x, y, z, hx, hy, hz, color });
const cyl = (x: number, y: number, z: number, r: number, hh: number, color: number, sides = 6): PropPart => ({ shape: 'cylinder', x, y, z, hx: r, hy: hh, hz: r, color, sides });

const POLE = 0x686678;
const TRUNK = 0x8b7966;
const STAKE = PALETTE.wafer;
const WOOD = CITY_COLORS.brick;
/** Crown Heights' accent: the terraces' umbrellas, the newsstand's awning; the Quay's, the fish stalls'. */
const CROWN = ACCENTS.crown;
const QUAY = ACCENTS.marina;
/** Fresh pine (pallets, crates, lobster pots) and a flamingo's pink. */
const PINE = 0xc9a26b;
const PINK = PALETTE.iceCream;

/** The models: the street's things (slices 0 and 3) and each district's (slice 4). */
const MODELS: Partial<Record<PropKind, readonly PropPart[]>> = {
  // an 8 m steel pole on a base, its arm and lit head reaching over the road
  lamp: [
    box(0, 0.25, 0, 0.14, 0.25, 0.14, PALETTE.graphite),
    box(0, 4.1, 0, 0.08, 3.85, 0.08, POLE),
    box(0, 7.9, 0.6, 0.05, 0.05, 0.62, POLE),
    { ...box(0, 7.83, 1.3, 0.2, 0.09, 0.38, PALETTE.laneMark), glow: true },
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
  // a red hydrant: its barrel, bonnet and the two side outlets
  hydrant: [
    cyl(0, 0.33, 0, 0.15, 0.33, PALETTE.carRed),
    cyl(0, 0.7, 0, 0.18, 0.06, PALETTE.carRed),
    cyl(0, 0.8, 0, 0.07, 0.05, PALETTE.steel),
    box(0, 0.46, 0, 0.26, 0.05, 0.05, PALETTE.steel),
  ],
  // a parking meter on its post
  meter: [
    box(0, 0.55, 0, 0.035, 0.55, 0.035, PALETTE.steel),
    box(0, 1.24, 0, 0.1, 0.16, 0.08, PALETTE.graphite),
    box(0, 1.28, 0.081, 0.07, 0.06, 0.004, PALETTE.glassDark),
  ],
  // a coin-operated newspaper box: its body, the window on the front, the lid
  newsbox: [
    box(0, 0.52, 0, 0.24, 0.42, 0.21, PALETTE.carBlue),
    box(0, 0.72, 0.211, 0.17, 0.13, 0.004, PALETTE.glass),
    box(0, 0.96, 0, 0.25, 0.03, 0.22, PALETTE.lightGrey),
  ],
  // a café table on its foot, the umbrella open over it
  table: [
    cyl(0, 0.37, 0, 0.06, 0.37, PALETTE.graphite),
    cyl(0, 0.75, 0, 0.4, 0.02, PALETTE.carWhite),
    box(0, 1.55, 0, 0.02, 0.8, 0.02, PALETTE.steel),
    cyl(0, 2.3, 0, 1.1, 0.07, CROWN),
  ],
  // a white café chair: its seat, its back away from the table, its sides
  chair: [
    box(0, 0.45, 0, 0.2, 0.02, 0.2, PALETTE.carWhite),
    box(0, 0.68, -0.19, 0.2, 0.21, 0.02, PALETTE.carWhite),
    box(0.19, 0.22, 0, 0.015, 0.22, 0.19, PALETTE.lightGrey),
    box(-0.19, 0.22, 0, 0.015, 0.22, 0.19, PALETTE.lightGrey),
  ],
  // a bus shelter open to the road: its glass back and ends, the roof, the posts, the seat, the timetable
  shelter: [
    box(0, 1.25, -0.56, 1.58, 1.05, 0.02, PALETTE.glass),
    box(1.58, 1.25, -0.1, 0.02, 1.05, 0.44, PALETTE.glass),
    box(-1.58, 1.25, -0.1, 0.02, 1.05, 0.44, PALETTE.glass),
    box(0, 2.42, -0.02, 1.65, 0.06, 0.6, PALETTE.graphite),
    box(1.6, 1.18, -0.58, 0.04, 1.18, 0.04, PALETTE.steel),
    box(-1.6, 1.18, -0.58, 0.04, 1.18, 0.04, PALETTE.steel),
    box(0, 0.45, -0.4, 1.0, 0.03, 0.14, PALETTE.steel),
    box(-1.2, 1.35, -0.53, 0.35, 0.55, 0.01, PALETTE.carMagenta),
  ],
  // a newsstand: its green booth, the roof, the awning over the counter, the papers and magazines on it
  kiosk: [
    box(0, 1.1, 0, 1.15, 1.1, 0.75, CITY_COLORS.hedge),
    box(0, 2.32, 0, 1.28, 0.1, 0.85, PALETTE.graphite),
    box(0, 1.95, 0.95, 1.2, 0.04, 0.22, CROWN),
    box(0, 0.95, 0.8, 1.05, 0.08, 0.07, PALETTE.carWhite),
    box(-0.55, 1.35, 0.76, 0.4, 0.3, 0.02, PALETTE.carMagenta),
    box(0.1, 1.35, 0.76, 0.2, 0.3, 0.02, PALETTE.carOrange),
    box(0.65, 1.35, 0.76, 0.35, 0.3, 0.02, PALETTE.carBlue),
  ],
  // the Works: a pallet's deck on three runners; a steel drum with its hoops; a crate; a traffic cone; a water-filled
  // barrier; a stack of four tyres
  pallet: [
    box(0, 0.12, 0, 0.6, 0.02, 0.5, PINE),
    box(0, 0.05, -0.44, 0.6, 0.05, 0.05, WOOD),
    box(0, 0.05, 0, 0.6, 0.05, 0.05, WOOD),
    box(0, 0.05, 0.44, 0.6, 0.05, 0.05, WOOD),
  ],
  barrel: [
    cyl(0, 0.44, 0, 0.28, 0.44, PALETTE.carOrange),
    cyl(0, 0.3, 0, 0.295, 0.02, PALETTE.graphite),
    cyl(0, 0.6, 0, 0.295, 0.02, PALETTE.graphite),
    cyl(0, 0.885, 0, 0.26, 0.01, PALETTE.steel),
  ],
  crate: [
    box(0, 0.4, 0, 0.39, 0.39, 0.39, PINE),
    box(0, 0.12, 0, 0.4, 0.04, 0.4, WOOD),
    box(0, 0.68, 0, 0.4, 0.04, 0.4, WOOD),
  ],
  cone: [
    box(0, 0.02, 0, 0.19, 0.02, 0.19, PALETTE.cone),
    cyl(0, 0.2, 0, 0.12, 0.17, PALETTE.cone),
    cyl(0, 0.34, 0, 0.095, 0.035, PALETTE.barrier),
    cyl(0, 0.52, 0, 0.065, 0.16, PALETTE.cone),
  ],
  barrier: [
    box(0, 0.35, 0, 0.9, 0.35, 0.18, PALETTE.carRed),
    box(0, 0.8, 0, 0.84, 0.1, 0.12, PALETTE.barrier),
  ],
  tyres: [
    cyl(0, 0.11, 0, 0.33, 0.1, PALETTE.tyre),
    cyl(0, 0.33, 0, 0.33, 0.1, PALETTE.tyre),
    cyl(0, 0.55, 0, 0.33, 0.1, PALETTE.tyre),
    cyl(0, 0.77, 0, 0.33, 0.1, PALETTE.tyre),
  ],
  // the Gardens: a fruit stand under its awning; a lawn flamingo; a garden gnome; two metres of picket fence; a letterbox on its post
  fruitStand: [
    box(0, 0.4, 0, 1.0, 0.4, 0.45, WOOD),
    box(-0.6, 0.88, 0.1, 0.28, 0.08, 0.2, PALETTE.carOrange),
    box(0, 0.88, 0.1, 0.28, 0.08, 0.2, PALETTE.carRed),
    box(0.6, 0.88, 0.1, 0.28, 0.08, 0.2, PALETTE.carLime),
    box(1.0, 1.2, -0.4, 0.03, 0.8, 0.03, PALETTE.steel),
    box(-1.0, 1.2, -0.4, 0.03, 0.8, 0.03, PALETTE.steel),
    box(0, 2.0, 0, 1.08, 0.03, 0.5, CITY_COLORS.leaves),
  ],
  flamingo: [
    box(0, 0.25, 0, 0.012, 0.25, 0.012, PALETTE.steel),
    box(0, 0.62, 0, 0.07, 0.07, 0.14, PINK),
    box(0, 0.78, 0.1, 0.025, 0.12, 0.025, PINK),
    box(0, 0.9, 0.14, 0.03, 0.03, 0.06, PINK),
  ],
  gnome: [
    cyl(0, 0.1, 0, 0.1, 0.1, PALETTE.carBlue),
    cyl(0, 0.22, 0, 0.075, 0.04, PALETTE.carWhite),
    cyl(0, 0.33, 0, 0.065, 0.08, PALETTE.carRed),
    cyl(0, 0.44, 0, 0.03, 0.04, PALETTE.carRed),
  ],
  fence: [
    box(0, 0.25, 0, 1.0, 0.03, 0.02, PALETTE.carWhite),
    box(0, 0.7, 0, 1.0, 0.03, 0.02, PALETTE.carWhite),
    box(-0.75, 0.45, 0.025, 0.05, 0.45, 0.015, PALETTE.carWhite),
    box(-0.25, 0.45, 0.025, 0.05, 0.45, 0.015, PALETTE.carWhite),
    box(0.25, 0.45, 0.025, 0.05, 0.45, 0.015, PALETTE.carWhite),
    box(0.75, 0.45, 0.025, 0.05, 0.45, 0.015, PALETTE.carWhite),
  ],
  letterbox: [
    box(0, 0.45, 0, 0.03, 0.45, 0.03, WOOD),
    box(0, 1.0, 0, 0.12, 0.1, 0.18, PALETTE.carRed),
    box(0.13, 1.06, -0.1, 0.01, 0.06, 0.02, PALETTE.carOrange),
  ],
  // the Quay: a deckchair facing the sea; a beach parasol; a fish stall on ice under its awning; a lobster pot
  deckchair: [
    box(0, 0.3, 0.1, 0.28, 0.03, 0.3, PALETTE.carBlue),
    box(0, 0.55, -0.25, 0.28, 0.3, 0.03, PALETTE.carWhite),
    box(0.29, 0.15, 0, 0.02, 0.15, 0.3, WOOD),
    box(-0.29, 0.15, 0, 0.02, 0.15, 0.3, WOOD),
  ],
  parasol: [
    cyl(0, 0.04, 0, 0.2, 0.04, PALETTE.graphite),
    box(0, 1.1, 0, 0.02, 1.1, 0.02, PALETTE.carWhite),
    cyl(0, 2.2, 0, 1.2, 0.07, PALETTE.carOrange),
  ],
  fishStall: [
    box(0, 0.42, 0, 1.1, 0.42, 0.45, PALETTE.carWhite),
    box(0, 0.88, 0.05, 1.0, 0.04, 0.35, PALETTE.lightGrey),
    box(-0.5, 0.95, 0.05, 0.15, 0.03, 0.05, PALETTE.silver),
    box(0, 0.95, 0.1, 0.15, 0.03, 0.05, PALETTE.carOrange),
    box(0.5, 0.95, 0, 0.15, 0.03, 0.05, PALETTE.silver),
    box(1.05, 1.2, -0.4, 0.03, 0.8, 0.03, PALETTE.steel),
    box(-1.05, 1.2, -0.4, 0.03, 0.8, 0.03, PALETTE.steel),
    box(0, 2.0, 0, 1.15, 0.03, 0.55, QUAY),
  ],
  lobsterPot: [
    box(0, 0.22, 0, 0.34, 0.22, 0.24, PINE),
    box(0, 0.46, 0, 0.3, 0.03, 0.25, WOOD),
    cyl(0.28, 0.06, 0.2, 0.06, 0.06, PALETTE.carOrange),
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
    // a lit part is tagged for the city's glow (a tall prop's part, so it casts as 'prop' does)
    out.push({ shape, position, rotation, color: part.color, tag: part.glow ? 'glow' : tall ? 'prop' : 'prop-low', detailOnly: !tall, prop: p.id });
  }
}
