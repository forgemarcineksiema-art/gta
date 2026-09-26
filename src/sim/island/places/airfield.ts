/**
 * The airfield's and the islet's places (M8.10 slice 12, docs/M8.10_PLAN.md §1.2): on the causeway the runway's paint
 * (the threshold, its number, the centre and edge lines, the aiming points, the chevrons before the ramp), the three
 * hangars (open to the runway: the roadster waits in the middle one), the control tower, three parked planes; the two
 * taxiways' bridges from the coast (their decks, railings, walkways and piers); the mega-ramp at the runway's southern end
 * (M8.8 slice 21's ramp moved and sized for the islet: about 4 s in the air at the Phantom's top speed); the islet's palms
 * round its landing slope (`shapes/airfield.ts`). Nothing moves: statics, drawn in the grid's kit, their colliders by tag;
 * the runway's paint the place's own marks, laid by its view over the runway and the strip along its middle. The ramp's
 * desc is kept for the jumps (slice 15).
 */
import type { JumpDesc } from '../../city/jumps';
import { Architecture } from '../../city/architecture';
import { SEA } from '../../city/sea';
import { ACCENTS, CITY_COLORS, PALETTE } from '../../palette';
import { quatFromAxisAngle, quatFromYaw, type Quat, type StaticDesc } from '../../scene';
import { inPolygon, resample, type P2 } from '../geom';
import { HALF_WIDTH } from '../ground';
import { PLACES, ROADS, islet } from '../plan';
import type { Place, PlaceContext } from './place';

/**
 * The mega-ramp (m): its lip at the plan's place, launching south (the world's −Z) at the islet; the launch six pieces
 * of 10 m steepening to `LIP_DEG`, `halfWidth` either side of the runway's line. The profile is (along, height) from the
 * lip, as the grid's (`city/jumps.ts`).
 */
export const MEGA = { x: PLACES.megaRamp.x, z: PLACES.megaRamp.z, yaw: PLACES.megaRamp.yaw, halfWidth: 6 } as const;
const PIECES_DEG = [2, 7, 12, 17, 22, 27] as const;
export const MEGA_LAUNCH: ReadonlyArray<{ along: number; y: number }> = launch(PIECES_DEG);
/** The lip's angle (°) and height over the runway (m); where the launch's foot is on the runway (world z). */
export const LIP_DEG = PIECES_DEG[PIECES_DEG.length - 1] as number;
export const LIP_HEIGHT = (MEGA_LAUNCH[MEGA_LAUNCH.length - 1] as { y: number }).y;
export const RAMP_FOOT = MEGA.z + Math.cos(MEGA.yaw) * (MEGA_LAUNCH[0] as { along: number }).along;

/** The launch's profile from its pieces' angles (°), each 10 m along. */
function launch(degrees: readonly number[]): Array<{ along: number; y: number }> {
  const out = [{ along: -10 * degrees.length, y: 0 }];
  let y = 0;
  degrees.forEach((d, k) => { y += 10 * Math.tan((d * Math.PI) / 180); out.push({ along: -10 * (degrees.length - k - 1), y }); });
  return out;
}

/** The mega-ramp as a jump (slice 15 counts it and slows its apex): its heights over the runway's ground. */
export function megaJump(id: number): JumpDesc {
  return { id, x: MEGA.x, z: MEGA.z, yaw: MEGA.yaw, length: -(MEGA_LAUNCH[0] as { along: number }).along, height: LIP_HEIGHT, profile: MEGA_LAUNCH, halfWidth: MEGA.halfWidth, mega: true };
}

/** The runway (the plan's), its line and its ends: the threshold at its northern end, the ramp's foot at its southern. */
const RUNWAY = PLACES.runway;
const AXIS = (RUNWAY.x0 + RUNWAY.x1) / 2;
/** Paint over the runway's slab and the strip along its middle (m, as the roads' paint over theirs), its lines' width. */
const PAINT = { lift: 0.052, line: 0.9 } as const;
/** The taxiways' bridges (m): the railing just past the carriageway, the walkway to the fascia, the piers every `pier` m. */
const BRIDGE = { railing: 0.3, rail: 1.1, walkway: 16.5, pier: 12 } as const;

/** A mark of the runway's paint: a flat quad `hx` × `hz` (half) at (x, y, z), turned `yaw`, in its colour. */
export interface RunwayMark { x: number; y: number; z: number; hx: number; hz: number; yaw: number; colour: number }
/** The airfield's place: nothing moves; its paint for the view to lay over the runway (over the strip along its middle). */
export interface AirfieldPlace extends Place { readonly id: 'airfield'; readonly marks: readonly RunwayMark[] }

export function airfieldPlaces(ctx: PlaceContext): Place[] {
  const ground = ctx.ground;
  const at = (x: number, z: number): number => ground.surfaceHeight(x, z);
  /** A kit writing into the chunk of (x, z), and where its statics start. */
  const kitAt = (x: number, z: number): { kit: Architecture; list: StaticDesc[]; start: number } => {
    const list = ctx.statics(x, z);
    return { kit: new Architecture(list), list, start: list.length };
  };
  /** Build a thing about the origin with `make`, then turn it to `yaw` at (x, z) and lift it onto `y`. */
  const place = (x: number, z: number, yaw: number, y: number, make: (kit: Architecture) => void): void => {
    const { kit, list, start } = kitAt(x, z);
    make(kit);
    kit.rotateFrom(start, x, z, yaw);
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += y;
  };

  const marks: RunwayMark[] = [];
  runwayPaint(marks, at);
  megaRamp(ctx, at);
  for (const [k, r] of PLACES.hangars.entries()) hangar(r, k, place, at);
  tower(place, at);
  // three planes parked by the runway between the tower and the northern taxiway, their noses toward the runway
  plane(place, at, -978, 336, 'jet', PALETTE.carBlue);
  plane(place, at, -978, 284, 'jet', PALETTE.carRed);
  plane(place, at, -982, 238, 'prop', PALETTE.carOrange);
  for (const r of ROADS) if (r.cls === 'taxiway' && r.id !== 'runway-link') bridge(ctx, r.points);
  isletPalms(place, at);
  const airfield: AirfieldPlace = { id: 'airfield', marks };
  return [airfield];
}

type Marker = (x: number, z: number, hx: number, hz: number, colour: number, yaw?: number) => void;

/**
 * The runway's paint: its edge lines (the western broken at the taxiways' mouths), the threshold's stripes and its
 * number (18: it runs south) at the northern end, the centre line's dashes, the aiming points and the touchdown bars, and
 * yellow chevrons pointing down the last stretch at the ramp.
 */
function runwayPaint(marks: RunwayMark[], at: (x: number, z: number) => number): void {
  const white = PALETTE.roadWhite, north = RUNWAY.z1, foot = RAMP_FOOT;
  const mark: Marker = (x, z, hx, hz, colour, yaw = 0) => { marks.push({ x, y: at(x, z) + PAINT.lift, z, hx, hz, yaw, colour }); };
  // a line along the runway from z0 to z1 (z0 < z1) at x, in pieces of at most 60 m
  const line = (x: number, z0: number, z1: number, width = PAINT.line, colour: number = white): void => {
    for (let z = z0; z < z1 - 0.5; z += 60) { const e = Math.min(z1, z + 60); mark(x, (z + e) / 2, width / 2, (e - z) / 2, colour); }
  };
  // the taxiways' mouths on the western edge (their carriageways and a little)
  const mouths = ROADS.filter((r) => r.cls === 'taxiway' && r.id !== 'runway-link').map((r) => (r.points[r.points.length - 1] as P2)[1]).sort((a, b) => a - b);
  const edge = HALF_WIDTH.taxiway + 3;
  const west = RUNWAY.x1 - 1, east = RUNWAY.x0 + 1;
  line(east, foot, north - 1);
  let from = foot;
  for (const m of mouths) {
    if (m - edge > from) line(west, from, m - edge);
    from = Math.max(from, m + edge);
  }
  if (north - 1 > from) line(west, from, north - 1);
  // the threshold: six stripes each side of the line, 30 m long
  for (let k = 0; k < 6; k++) for (const side of [-1, 1]) mark(AXIS + side * (2.7 + 2.9 * k), north - 18, 0.9, 15, white);
  // the number, 18, read by a car heading south (its right is +X, its top toward −Z)
  digits(mark, '18', AXIS, north - 40);
  // the centre line's dashes: 30 m on, 20 m off
  for (let z = north - 60; z - 30 > foot + 110; z -= 50) mark(AXIS, z - 15, PAINT.line / 2, 15, white);
  // the aiming points, and the touchdown zone's bars
  for (const side of [-1, 1]) {
    mark(AXIS + side * 9, north - 300, 2, 20, white);
    for (const k of [0, 1, 2]) mark(AXIS + side * (4.5 + 2.2 * k), north - 160, 0.75, 11, white);
    for (const k of [0, 1]) mark(AXIS + side * (4.5 + 2.2 * k), north - 440, 0.75, 11, white);
  }
  // the chevrons before the ramp: three yellow V's pointing at it (−Z)
  for (const tip of [foot + 30, foot + 60, foot + 90]) for (const side of [-1, 1]) {
    const dx = side * Math.SQRT1_2, dz = Math.SQRT1_2;
    mark(AXIS + dx * 7, tip + dz * 7, 0.8, 7, PALETTE.roadYellow, Math.atan2(dx, dz));
  }
}

/** Seven-segment digits on the runway: `text` centred at x, its foot at z, read heading −Z. */
function digits(mark: Marker, text: string, x: number, z: number): void {
  const W = 6, H = 16, S = 1.3, gap = 3;
  // the segments' middles (u right, v up the page) and half sizes
  const SEG: Record<string, [number, number, number, number]> = {
    a: [0, H - S / 2, W / 2, S / 2], b: [W / 2 - S / 2, (3 * H) / 4, S / 2, H / 4], c: [W / 2 - S / 2, H / 4, S / 2, H / 4], d: [0, S / 2, W / 2, S / 2],
    e: [-W / 2 + S / 2, H / 4, S / 2, H / 4], f: [-W / 2 + S / 2, (3 * H) / 4, S / 2, H / 4], g: [0, H / 2, W / 2, S / 2], one: [0, H / 2, S / 2, H / 2],
  };
  const LIT: Record<string, string[]> = {
    '0': ['a', 'b', 'c', 'd', 'e', 'f'], '1': ['one'], '2': ['a', 'b', 'g', 'e', 'd'], '3': ['a', 'b', 'g', 'c', 'd'], '4': ['f', 'g', 'b', 'c'],
    '5': ['a', 'f', 'g', 'c', 'd'], '6': ['a', 'f', 'g', 'e', 'c', 'd'], '7': ['a', 'b', 'c'], '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'], '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  };
  const total = text.length * W + (text.length - 1) * gap;
  [...text].forEach((ch, i) => {
    const cu = -total / 2 + W / 2 + i * (W + gap);
    for (const s of LIT[ch] ?? []) {
      const [u, v, hu, hv] = SEG[s] as [number, number, number, number];
      mark(x + cu + u, z - v, hu, hv, PALETTE.roadWhite);
    }
  });
}

/** A box turned by `q` (a yaw, a pitch), its middle at (x, y, z): the ramp's pieces. */
function turned(x: number, y: number, z: number, hx: number, hy: number, hz: number, q: Quat, colour: number, tag: string, collisionOnly = false): StaticDesc {
  return { shape: { kind: 'box', hx, hy, hz }, position: { x, y, z }, rotation: q, color: colour, tag, ...(collisionOnly ? { collisionOnly } : {}) };
}

function mulQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * The mega-ramp: each launch piece a red block from its deck down into the ground (drawn), over it a thin slab the wheels
 * ride (terrain) and under it a solid core 0.8 m below the deck (a wall to a car that meets its side, clear of a car on
 * it); the white lip; a floodlight mast either side of the lip.
 */
function megaRamp(ctx: PlaceContext, at: (x: number, z: number) => number): void {
  const fx = Math.sin(MEGA.yaw), fz = Math.cos(MEGA.yaw), w = MEGA.halfWidth;
  const first = MEGA_LAUNCH[0] as { along: number; y: number };
  const base = at(MEGA.x + fx * first.along, MEGA.z + fz * first.along);
  const put = (st: StaticDesc): void => { ctx.statics(st.position.x, st.position.z).push(st); };
  for (let k = 0; k + 1 < MEGA_LAUNCH.length; k++) {
    const a = MEGA_LAUNCH[k] as { along: number; y: number }, b = MEGA_LAUNCH[k + 1] as { along: number; y: number };
    const angle = Math.atan2(b.y - a.y, b.along - a.along), half = Math.hypot(b.along - a.along, b.y - a.y) / 2;
    const along = (a.along + b.along) / 2, mid = base + (a.y + b.y) / 2;
    const q = mulQuat(quatFromYaw(MEGA.yaw), quatFromAxisAngle(1, 0, 0, -angle));
    // a box `depth` deep under the deck's piece (its top the deck `drop` m down), its middle moved along its own down
    const under = (depth: number, drop: number, hw: number, colour: number, tag: string, only: boolean): StaticDesc => {
      const off = drop + depth / 2;
      return turned(MEGA.x + fx * (along + off * Math.sin(angle)), mid - off * Math.cos(angle), MEGA.z + fz * (along + off * Math.sin(angle)), hw, depth / 2, half + 0.3, q, colour, tag, only);
    };
    const deep = b.y + 3;
    put(under(deep, 0, w, PALETTE.ramp, 'decor', false));
    put(under(0.3, 0, w, PALETTE.ramp, 'kerb', true));
    if (b.y > 1.5) put(under(deep, 0.8, w - 0.2, PALETTE.ramp, 'building', true));
  }
  // the lip: a white band along the top edge, facing back at the driver
  const lip = MEGA_LAUNCH[MEGA_LAUNCH.length - 1] as { along: number; y: number };
  const q = mulQuat(quatFromYaw(MEGA.yaw), quatFromAxisAngle(1, 0, 0, -(LIP_DEG * Math.PI) / 180));
  put(turned(MEGA.x + fx * (lip.along - 0.35), base + lip.y - 0.12, MEGA.z + fz * (lip.along - 0.35), w + 0.05, 0.14, 0.4, q, PALETTE.barrier, 'decor'));
  // floodlight masts either side of the lip, on the runway
  for (const side of [-1, 1]) {
    const x = MEGA.x + side * (w + 5), z = MEGA.z - fz * 4, list = ctx.statics(x, z), start = list.length;
    new Architecture(list).mast(x, z);
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += at(x, z);
  }
}

type Placer = (x: number, z: number, yaw: number, y: number, make: (kit: Architecture) => void) => void;

/**
 * A hangar on its rect, open to the runway (its door side the rect's eastern, −X): walls on three sides, a gabled roof
 * along it, the lintel over the door and the door's two leaves slid aside; its number over the door.
 */
function hangar(r: { x0: number; z0: number; x1: number; z1: number }, k: number, place: Placer, at: (x: number, z: number) => number): void {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2, wall = 10;
  const shell = [CITY_COLORS.stone, PALETTE.lightGrey, CITY_COLORS.chalk][k % 3] as number;
  place(cx, cz, 0, at(cx, cz), (kit) => {
    // the back wall (the western, +X) and the two side walls: solid
    kit.box(hx - 0.3, wall / 2, 0, 0.3, wall / 2, hz, shell, 'building');
    for (const side of [-1, 1]) kit.box(0, wall / 2, side * (hz - 0.3), hx, wall / 2, 0.3, shell, 'building');
    // the lintel over the door, the roof along the hangar (its ridge along x), its eaves
    kit.box(-hx + 0.4, wall - 1.2, 0, 0.4, 1.2, hz, shell);
    kit.statics.push({ shape: { kind: 'gable', hx: hx + 0.6, hy: 2.6, hz: hz + 0.6 }, position: { x: 0, y: wall + 2.6, z: 0 }, rotation: quatFromYaw(0), color: CITY_COLORS.roof, tag: 'decor' });
    // the door's leaves slid aside against the front of the side walls, a stripe of the Works' teal on each
    for (const side of [-1, 1]) {
      kit.box(-hx - 0.4, (wall - 2.4) / 2, side * (hz - 4.2), 0.25, (wall - 2.4) / 2, 4, PALETTE.silver, 'building');
      kit.box(-hx - 0.66, 2.2, side * (hz - 4.2), 0.02, 0.5, 4, ACCENTS.foundry, 'decor', 'x-');
    }
    // its number over the door, in three bars (1, 2, 3)
    for (let b = 0; b <= k; b++) kit.box(-hx - 0.05, wall - 1.2, (b - k / 2) * 1.6, 0.05, 0.9, 0.35, PALETTE.charcoal, 'decor', 'x-');
  });
}

/** The control tower: a two-storey block at its foot, a shaft, the glass cab with its roof and a mast with a red light. */
function tower(place: Placer, at: (x: number, z: number) => number): void {
  const { x, z } = PLACES.controlTower;
  place(x, z, 0, at(x, z), (kit) => {
    kit.box(4, 3.5, 0, 9, 3.5, 6, CITY_COLORS.chalk, 'building');
    kit.box(4, 7.15, 0, 9.3, 0.15, 6.3, CITY_COLORS.trim);
    kit.box(0, 12, 0, 2.6, 12, 2.6, CITY_COLORS.stone, 'building');
    // the cab: its floor, the glass all round, a band under it, its roof overhanging
    kit.box(0, 24.3, 0, 5, 0.3, 5, CITY_COLORS.trim);
    kit.box(0, 26.2, 0, 4.7, 1.6, 4.7, CITY_COLORS.window);
    for (const [px, pz] of [[-4.7, -4.7], [4.7, -4.7], [-4.7, 4.7], [4.7, 4.7]] as const) kit.box(px, 26.2, pz, 0.15, 1.6, 0.15, CITY_COLORS.roof);
    kit.box(0, 28, 0, 5.6, 0.25, 5.6, CITY_COLORS.roof);
    kit.box(0, 29.4, 0, 0.12, 1.2, 0.12, PALETTE.steel);
    kit.box(0, 30.7, 0, 0.3, 0.2, 0.3, PALETTE.carRed, 'glow');
    // the windsock's mast and its sock by the block, orange and white
    kit.box(10, 4, 8, 0.1, 4, 0.1, PALETTE.steel);
    kit.box(10, 7.6, 9.3, 0.35, 0.35, 1.2, PALETTE.carOrange);
    kit.box(10, 7.55, 10.9, 0.28, 0.28, 0.4, PALETTE.carWhite);
  });
}

/**
 * A parked plane, its nose toward the runway (−X): a jet (low wings with two engines, a tailplane and a fin in its livery)
 * or a light prop plane (high wings, a propeller). The fuselage, the wings and the engines are solid.
 */
function plane(place: Placer, at: (x: number, z: number) => number, x: number, z: number, kind: 'jet' | 'prop', livery: number): void {
  const white = PALETTE.carWhite, dark = PALETTE.charcoal, glass = CITY_COLORS.window;
  // built along +Z (its nose at +Z), turned so the nose looks at −X
  place(x, z, -Math.PI / 2, at(x, z), (kit) => {
    if (kind === 'jet') {
      // the fuselage low enough that nothing drives under it; the wings over a car's roof
      kit.box(0, 2.5, 0, 1.3, 1.3, 9, white, 'building');
      kit.box(0, 2.35, 10, 1.05, 1.1, 1.2, white);
      kit.box(0, 2.1, 11.5, 0.65, 0.75, 0.5, white);
      kit.box(0, 3.0, 10.2, 1.07, 0.32, 0.9, glass);
      kit.box(0, 3.2, -10, 0.95, 0.95, 1.2, white);
      for (const side of [-1, 1]) kit.box(side * 1.31, 2.85, 0, 0.01, 0.26, 7.5, glass, 'decor', side > 0 ? 'x+' : 'x-');
      kit.box(0, 1.75, 0, 1.35, 0.22, 9.05, livery);
      // the wings, the engines under them (solid), the tailplane, the fin
      kit.box(0, 1.72, 0.5, 13, 0.16, 2.2, white, 'building');
      for (const side of [-1, 1]) {
        kit.box(side * 4.5, 0.98, 1.6, 0.7, 0.62, 1.8, PALETTE.silver, 'building');
        kit.box(side * 4.5, 0.98, 3.42, 0.5, 0.45, 0.04, dark);
      }
      kit.box(0, 3.9, -10.2, 4.2, 0.14, 1.2, white);
      kit.box(0, 5.8, -10.5, 0.16, 2.2, 1.3, livery);
      // the wheels
      for (const [gx, gz] of [[0, 9], [-1.6, 0], [1.6, 0]] as const) kit.box(gx, 0.6, gz, 0.25, 0.6, 0.45, dark);
    } else {
      kit.box(0, 1.5, 0, 0.7, 0.75, 3.8, white, 'building');
      kit.box(0, 2.1, 1.4, 0.72, 0.45, 1.0, glass);
      kit.box(0, 2.62, 1.2, 5.5, 0.08, 0.8, white, 'building');
      kit.box(0, 1.55, -4.2, 1.8, 0.07, 0.55, white);
      kit.box(0, 2.3, -4.3, 0.07, 0.75, 0.6, livery);
      kit.box(0, 1.5, 3.95, 0.2, 0.2, 0.15, dark);
      kit.box(0, 1.5, 4.08, 0.05, 1.0, 0.1, dark);
      kit.box(0, 1.2, 0, 0.72, 0.1, 3.82, livery);
      for (const [gx, gz] of [[0, 3], [-0.9, -0.3], [0.9, -0.3]] as const) kit.box(gx, 0.3, gz, 0.12, 0.3, 0.3, dark);
    }
  });
}

/**
 * A taxiway's bridge over the water between the coast and the causeway: along its carriageway's edges a solid railing,
 * past it a walkway on a fascia down into the sea (the ground over the water is the road's deck alone), piers standing
 * proud of the fascia from the sea's floor. From land to land along the road, a few metres onto each shore.
 */
function bridge(ctx: PlaceContext, points: readonly P2[]): void {
  const ground = ctx.ground, pts = resample(points, 2);
  // the stretch over the water, by the land's mask
  let a = -1, b = -1;
  pts.forEach((p, i) => { if (!ground.onLand(p[0], p[1])) { if (a < 0) a = i; b = i; } });
  if (a < 0) return;
  const p0 = pts[Math.max(0, a - 3)] as P2, p1 = pts[Math.min(pts.length - 1, b + 3)] as P2;
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const ux = dx / len, uz = dz / len, rx = -uz, rz = ux, hw = HALF_WIDTH.taxiway;
  const deck = (s: number): number => ground.surfaceHeight(p0[0] + ux * s, p0[1] + uz * s);
  // in pieces of about 12 m, each on the road's height there
  const pieces = Math.max(1, Math.round(len / BRIDGE.pier));
  for (let k = 0; k < pieces; k++) {
    const s0 = (k * len) / pieces, s1 = ((k + 1) * len) / pieces, sm = (s0 + s1) / 2, y = deck(sm), half = (s1 - s0) / 2 + 0.05;
    const q = quatFromYaw(yaw);
    for (const side of [-1, 1]) {
      const off = (o: number): [number, number] => [p0[0] + ux * sm + rx * side * o, p0[1] + uz * sm + rz * side * o];
      const [rxp, rzp] = off(hw + BRIDGE.railing + 0.15);
      ctx.statics(rxp, rzp).push({ shape: { kind: 'box', hx: 0.15, hy: BRIDGE.rail / 2, hz: half }, position: { x: rxp, y: y + BRIDGE.rail / 2, z: rzp }, rotation: q, color: PALETTE.kerb, tag: 'building' });
      const walk = (hw + BRIDGE.railing + 0.3 + BRIDGE.walkway) / 2, wide = (BRIDGE.walkway - hw - BRIDGE.railing - 0.3) / 2;
      const [wx, wz] = off(walk);
      ctx.statics(wx, wz).push({ shape: { kind: 'box', hx: wide, hy: 0.15, hz: half }, position: { x: wx, y: y + 0.02, z: wz }, rotation: q, color: CITY_COLORS.stone, tag: 'decor' });
      const [fxp, fzp] = off(BRIDGE.walkway);
      const bottom = SEA.level - 0.8, top = y + 0.3;
      ctx.statics(fxp, fzp).push({ shape: { kind: 'box', hx: 0.3, hy: (top - bottom) / 2, hz: half }, position: { x: fxp, y: (top + bottom) / 2, z: fzp }, rotation: q, color: PALETTE.concrete, tag: 'decor' });
      // a pier in the water at each piece's end, standing proud of the fascia up to the walkway
      const [px, pz] = [p0[0] + ux * s1 + rx * side * (BRIDGE.walkway + 0.5), p0[1] + uz * s1 + rz * side * (BRIDGE.walkway + 0.5)];
      if (!ground.onLand(px, pz) && k + 1 < pieces) {
        const foot = ground.surfaceHeight(px, pz) - 0.5, head = y - 0.1;
        ctx.statics(px, pz).push({ shape: { kind: 'box', hx: 0.8, hy: (head - foot) / 2, hz: 0.9 }, position: { x: px, y: (head + foot) / 2, z: pz }, rotation: q, color: CITY_COLORS.stone, tag: 'decor' });
      }
    }
  }
}

/**
 * The islet's palms: a ring of them inside its beach, clear of the landing's strip down the runway's line and its run to
 * the far shore.
 */
function isletPalms(place: Placer, at: (x: number, z: number) => number): void {
  const poly = islet();
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p[0] / poly.length; cz += p[1] / poly.length; }
  let seed = 11;
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2 + rnd() * 0.12, r = 22 + rnd() * 18;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!inPolygon(x, z, poly) || Math.abs(x - MEGA.x) < 16) continue;
    // at least 6 m inside the shore
    if ([0, 1, 2, 3, 4, 5, 6, 7].some((q) => !inPolygon(x + Math.cos((q * Math.PI) / 4) * 6, z + Math.sin((q * Math.PI) / 4) * 6, poly))) continue;
    place(x, z, rnd() * Math.PI * 2, at(x, z), (kit) => kit.tree(0, 0, true));
  }
}
