/**
 * The roads' surfaces (M8.10 slice 6b, docs/M8.10_PLAN.md): each road's strip a hair over the ground, broken at every
 * junction where one polygon takes over: its arms' ends, cut square where the corners' curves end, and between them the
 * kerbs round each corner on a curve (the pavements on it); the pavements on their 14 cm kerbs along the town's roads and
 * round the corners (and the kerbs' pieces the wheels climb); the paint: the centre and lane lines, the edge lines, the
 * stop lines, the zebra crossings, the arrows, the parking bays, each laid on the strip's triangles. Worked out once
 * (`roadSurfaces`: all the ground it reads kept in the data, so the island's bake keeps them), the render's triangles a
 * chunk made from that (`surfaceMeshes`); no Three.js.
 */
import { PARKING, PARKING_STYLE, type ParkingBay } from '../city/markings';
import type { FootwayRun } from '../city/props';
import type { RoadGraph } from '../city/roads';
import { ISLAND_COLORS, PALETTE } from '../palette';
import type { P2 } from './geom';
import { HALF_WIDTH, type Ground, type GroundProbe } from './ground';
import { districtOf, type RoadClass } from './plan';
import type { Piece } from './structures';

/** The strips over the ground, the paint over the strips (m): under the physics' ground's own error, over the mesh's. */
export const ROAD_LIFT = 0.04;
export const PAINT_LIFT = 0.012;
/** A pavement's kerb over the road and its width (m). */
export const KERB = 0.14;
export const PAVEMENT = 3;
/**
 * A strip's edge hangs this far under it where no pavement stands, and a pavement's outer edge under the ground there (m):
 * past what the view's ground is drawn under the road (its grid's reach, M8.10).
 */
const SKIRT = 1.2;
/** A strip's span is halved where the ground at its middle is further than this from the span's straight line (m). */
const BEND = 0.01;
/** A node is on a road within this of its centreline (m: the network merges ends within 8). */
const ON_ROAD = 6;
/**
 * A junction's corner (Marcin, 2026-09-28: the boxes ran to whichever section came next, 15–50 m of bare asphalt, cut
 * across the corners with the grass in them): its kerb curves round this radius (m), its curve starting at most this far
 * from where the two kerbs' lines cross (m: an acute corner's curve is tighter).
 */
const CORNER_RADIUS = 6;
const CORNER_REACH = 10;
/** Two arms parting by less than this merge (the highway's ramps): the gore, no curve (rad). */
const MERGE = (35 * Math.PI) / 180;
/** Two arms within this of a straight line have no corner between them: their kerb runs on (rad). */
const STRAIGHT = (10 * Math.PI) / 180;
/** An arm's strip starts this far past its corners' curves, and at least this far from its node (m). */
const ARM_PAST = 0.5;
const ARM_LEAST = 2;
/** A corner's curve in pieces of at most this (rad). */
const ARC_STEP = (22.5 * Math.PI) / 180;
/** A pavement stops where it would come within this of another road's carriageway (m). */
const CLEAR_OF_ROAD = 0.3;
/** An arm's strip starts no further than this from its node (m): a merge's gore, a sharp fork of two avenues. */
const MERGE_REACH = 40;
/** The roads with pavements, and those with parking bays along them (wide enough to park clear of the lane). */
const PAVED: ReadonlySet<RoadClass> = new Set<RoadClass>(['avenue', 'street', 'side']);
const BAYS: ReadonlySet<RoadClass> = new Set<RoadClass>(['avenue', 'street']);
/** The roads with white edge lines (no kerb to read the edge by). */
const EDGED: ReadonlySet<RoadClass> = new Set<RoadClass>(['serpentine', 'ramp', 'taxiway']);
/** Paint (m): a line's width, a centre's dash (6 on, 6 off), the highway's lane dash (4 in 12), its lanes' divider and edge line. */
const LINE = 0.18;
const DASH = 6;
const LANE_DASH = 12;
const DIVIDER = 8;
const HIGHWAY_EDGE = 16;
/** An approach (m from the box's edge): the zebra's middle and its stripes, the stop line, the arrow; the double line before it. */
const ZEBRA = { at: 2.5, stripe: 1.6, length: 3.5, pitch: 3 } as const;
const STOP = { zebra: 6, plain: 1.5, depth: 0.5 } as const;
const ARROW = 9;
const SOLID = 24;
/** Parking bays start and end this far from a box's edge (clear of the approach's paint) (m). */
const BAY_CLEAR = 20;
/** A footway run goes on while the pavement's edge keeps within this of its straight line (m). */
const RUN_BEND = 0.3;
/**
 * A paint quad is halved where the strip under its middle or an edge's middle is further than this from its corners'
 * straight lines (m), up to `PAINT_SPLITS` times: laid flat across a crest a zebra's stripes sank under the asphalt but
 * for their ends (Crown's crossings, 2026-09-28).
 */
const PAINT_SAG = 0.006;
const PAINT_SPLITS = 6;

/** A section's points across its strip, as fractions of the half width right of the middle: its right edge to its left. */
export const ACROSS = [1, 0.5, 0, -0.5, -1] as const;
/** A road's strip: its sections (the centre, the unit right, the heights at the `ACROSS` points), their stations. */
export interface Strip {
  road: number;
  id: string;
  cls: RoadClass;
  hw: number;
  closed: boolean;
  x: number[]; z: number[]; rx: number[]; rz: number[];
  h: number[][];
  s: number[];
  /** Per segment: drawn (outside the junctions' boxes and the decks). */
  drawn: boolean[];
  /** Per segment: its pavements (1 the right one, 2 the left one); where none, the strip's edge hangs its skirt. */
  walk: number[];
  /** Per point: the ground at the pavement's outer edge, the right then the left (NaN where no pavement reaches). */
  out: number[];
  /** Per point: its pavements that go on round a junction's corner there (1 the right one, 2 the left one): no end face. */
  joined: number[];
}

/** A junction's rim point: where it is and, on an arm, its road's strip, station and offset (on a kerb: −1, NaN, NaN). */
export interface RimPoint { x: number; y: number; z: number; strip: number; s: number; o: number }
/**
 * A junction's side between two neighbouring arms: its kerb along the rim from `from` to `to` (rim indices, round),
 * and where a pavement goes round it each of those points' outer point (x, y, z each) and, at a corner, the pavement's
 * back corner `q` (x, y, z); no pavement: both empty (the edge's skirt hangs).
 */
export interface JunctionSide { from: number; to: number; outer: number[]; q: number[] }
/**
 * A junction: its middle; its rim round it (each arm's end section, its right edge to its left as it leaves, and between
 * two arms their side's kerb: straight on, round a corner's curve, or across a merge); its fan's rim (`core`: the rim
 * with each corner's curve cut off at its kerbs' crossing) and its fan from the middle to each of that rim's pairs, cut
 * `cut` times each way on the ground, the points of that grid past its corners (`fanOrder`) per core point; each
 * corner's curve fanned from its kerbs' crossing (`fillets`: that point's x, y, z, then the curve's first and last rim
 * index); its sides.
 */
export interface Junction { x: number; y: number; z: number; rim: RimPoint[]; core: RimPoint[]; grid: number[]; cut: number; fillets: number[]; sides: JunctionSide[] }

/** A junction's fan is cut at most this many times each way (`layFan`). */
const FAN_CUTS = 8;

/** A fan's triangle cut `n` times each way: its grid's points past the middle and the rim's two, (u toward the first rim point, v the next). */
function fanOrder(n: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (let u = 0; u <= n; u++) for (let v = 0; u + v <= n; v++) if (!(u === 0 && v === 0) && u !== n && v !== n) out.push([u, v]);
  return out;
}

/**
 * A fan's triangle whose rim pair is this close (m: an arm's section's piece) is cut along its spokes only, in rings:
 * the ground bends along a spoke over a crest, hardly across a few metres (half its triangles on Crown's crossings).
 */
const THIN_EDGE = 5;

/** A fan's triangle's grid points (`fanOrder`'s, or a thin one's on its spokes only) and its faces as their (u, v) corners. */
function fanCells(n: number, thin: boolean): { points: Array<readonly [number, number]>; faces: Array<readonly [number, number, number, number, number, number]> } {
  const faces: Array<readonly [number, number, number, number, number, number]> = [];
  if (thin) {
    const points: Array<readonly [number, number]> = [];
    for (let u = 1; u < n; u++) points.push([u, 0]);
    for (let v = 1; v < n; v++) points.push([0, v]);
    faces.push([0, 0, 1, 0, 0, 1]);
    for (let k = 1; k < n; k++) faces.push([k, 0, k + 1, 0, 0, k + 1], [k, 0, 0, k + 1, 0, k]);
    return { points, faces };
  }
  for (let u = 0; u < n; u++) for (let v = 0; u + v < n; v++) {
    faces.push([u, v, u + 1, v, u, v + 1]);
    if (u + v < n - 1) faces.push([u + 1, v, u + 1, v + 1, u, v + 1]);
  }
  return { points: fanOrder(n), faces };
}

/**
 * A junction's fan's faces, each as its three corners: from its middle to each pair of rim points, in the grid it was cut
 * to. What is drawn, and what the wheels read there (the island's physics).
 */
export function fanFaces(j: Junction, face: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => void): void {
  const rim = j.core, grid = j.grid, cut = j.cut, fl = j.fillets;
  const cells = [fanCells(cut, false), fanCells(cut, true)].map((c) => ({ ...c, index: new Map(c.points.map(([u, v], k) => [u * 64 + v, k])) }));
  // each corner's curve from its kerbs' crossing, a spoke to each of its points in rings
  for (let f = 0; f + 4 < fl.length;) {
    const cx = fl[f] as number, cy = fl[f + 1] as number, cz = fl[f + 2] as number, from = fl[f + 3] as number, to = fl[f + 4] as number, base = f + 5;
    const at = (i: number, k: number): readonly [number, number, number] => {
      if (k === 0) return [cx, cy, cz];
      if (k === cut) { const r = j.rim[i] as RimPoint; return [r.x, r.y, r.z]; }
      const o = base + 3 * ((i - from) * (cut - 1) + k - 1);
      return [fl[o] as number, fl[o + 1] as number, fl[o + 2] as number];
    };
    for (let i = from; i < to; i++) for (let k = 0; k < cut; k++) {
      const p = at(i, k), q = at(i, k + 1), r = at(i + 1, k + 1);
      if (k === 0) { face(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); continue; }
      const s = at(i + 1, k);
      face(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
      face(p[0], p[1], p[2], r[0], r[1], r[2], s[0], s[1], s[2]);
    }
    f = base + 3 * (to - from + 1) * (cut - 1);
  }
  let n = 0;
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i] as RimPoint, b = rim[(i + 1) % rim.length] as RimPoint;
    const c = cells[thinPair(a, b) ? 1 : 0] as (typeof cells)[number];
    const at = (u: number, v: number): readonly [number, number, number] => {
      if (u === 0 && v === 0) return [j.x, j.y, j.z];
      if (u === cut) return [a.x, a.y, a.z];
      if (v === cut) return [b.x, b.y, b.z];
      const k = n + 3 * (c.index.get(u * 64 + v) as number);
      return [grid[k] as number, grid[k + 1] as number, grid[k + 2] as number];
    };
    for (const [u0, v0, u1, v1, u2, v2] of c.faces) {
      const p = at(u0, v0), q = at(u1, v1), r = at(u2, v2);
      face(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
    }
    n += 3 * c.points.length;
  }
}

/** A corner's kerbs' crossing on a fan's rim (its `strip`): inside the junction, its rim pairs' chords on the ground. */
const CROSSING = -2;
/**
 * A fan's faces lie at most this far under the ground and its lift at their middles (m): the view's ground is drawn
 * under a junction's asphalt at most as high as it lies.
 */
const FAN_MISS = 0.03;

/** A fan's rim pair inside the junction (to a corner's kerbs' crossing): its chord on the ground, not straight. */
function inner(a: RimPoint, b: RimPoint): boolean {
  return a.strip === CROSSING || b.strip === CROSSING;
}

/** A fan's rim pair on the rim and this close: its triangle cut in rings (`fanCells`). */
function thinPair(a: RimPoint, b: RimPoint): boolean {
  return !inner(a, b) && Math.hypot(b.x - a.x, b.z - a.z) <= THIN_EDGE;
}

/**
 * A junction's fan laid on the ground `height` gives (with its lift): its grid and its corners' pieces' rings (`corners`:
 * each piece's crossing, x, y, z, and its curve's first and last rim index), cut as few times each way as keep every
 * face's middle within `FAN_MISS` of it, at most `FAN_CUTS` (by the old estimate, a miss falling with the cut's square,
 * Crown's crossings stood up to 0.57 m under their banks: the grass through the asphalt of Marcin's still, 2026-09-28).
 */
function layFan(j: Junction, height: (x: number, z: number) => number, corners: readonly number[]): void {
  const core = j.core, n = core.length;
  for (let cut = 1; ; cut++) {
    j.cut = cut;
    const grid: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = core[i] as RimPoint, b = core[(i + 1) % n] as RimPoint, straight = !inner(a, b);
      for (const [u, v] of fanCells(cut, thinPair(a, b)).points) {
        const x = j.x + ((a.x - j.x) * u + (b.x - j.x) * v) / cut, z = j.z + ((a.z - j.z) * u + (b.z - j.z) * v) / cut;
        // on the rim's chord: straight between its points (an arm's section's edge, a kerb's), so the seams are exact
        grid.push(x, u + v === cut && straight ? a.y + ((b.y - a.y) * v) / cut : height(x, z), z);
      }
    }
    j.grid = grid;
    const fillets: number[] = [];
    for (let f = 0; f + 4 < corners.length; f += 5) {
      const cx = corners[f] as number, cz = corners[f + 2] as number, from = corners[f + 3] as number, to = corners[f + 4] as number;
      fillets.push(cx, corners[f + 1] as number, cz, from, to);
      for (let i = from; i <= to; i++) {
        const r = j.rim[i] as RimPoint;
        for (let k = 1; k < cut; k++) {
          const x = cx + ((r.x - cx) * k) / cut, z = cz + ((r.z - cz) * k) / cut;
          fillets.push(x, height(x, z), z);
        }
      }
    }
    j.fillets = fillets;
    if (cut >= FAN_CUTS) return;
    let worst = 0;
    fanFaces(j, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const x = (ax + bx + cx) / 3, z = (az + bz + cz) / 3;
      worst = Math.max(worst, height(x, z) - (ay + by + cy) / 3);
    });
    if (worst <= FAN_MISS) return;
  }
}

/** A junction's rim as its outline (x, z): what the view's ground keeps under. */
export function junctionOutline(j: Junction): P2[] {
  return j.rim.map((r) => [r.x, r.z] as const);
}

export type PaintKind = 'centre' | 'lane' | 'edge' | 'stop' | 'zebra' | 'arrow' | 'bay';
/** A quad of paint on a strip: its corners' stations and offsets, and heights. */
export interface Paint { kind: PaintKind; strip: number; s: number[]; o: number[]; y: number[]; colour: number }
/**
 * A chunk's surfaces: three corners a triangle, a colour a triangle; its first `far` triangles its far level (M8.10
 * slice 18: the strips, the junctions, the skirts and the pavements' tops, without the kerbs' faces and the paint).
 */
export interface SurfaceChunk { positions: number[]; colors: number[]; far: number }
export interface RoadSurfaces {
  strips: Strip[];
  junctions: Junction[];
  paint: Paint[];
  parking: ParkingBay[];
  /** The kerbs' pieces a chunk: the pavement's band, its middle at its top. */
  kerbs: Map<number, Piece[]>;
  /** The pavements as the grid's footway runs (straight, from the road's edge outward), for the props' lines. */
  footways: FootwayRun[];
}

/** The segment of a strip holding station `s` (clamped). */
function segmentAt(st: Strip, s: number): number {
  let lo = 0, hi = st.s.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((st.s[mid + 1] as number) < s) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

/**
 * The strip's height at a fraction `t` along segment `k`, `o` m right of its middle: on the very triangles the render
 * draws (each band between two of the `ACROSS` points a quad split from its start's outer corner to its end's inner).
 */
export function heightOn(st: Strip, k: number, t: number, o: number): number {
  const u = Math.max(-1, Math.min(1, o / st.hw));
  let j = 0;
  while (j < ACROSS.length - 2 && u < (ACROSS[j + 1] as number)) j++;
  const f0 = ACROSS[j] as number, f1 = ACROSS[j + 1] as number, v = (f0 - u) / (f0 - f1);
  const h0 = st.h[k] as number[], h1 = st.h[k + 1] as number[];
  const p = h0[j] as number, q = h1[j] as number, r = h1[j + 1] as number, s = h0[j + 1] as number;
  return t >= v ? p + (t - v) * (q - p) + v * (r - p) : p + t * (r - p) + (v - t) * (s - p);
}

/** Where station `s`, `o` m right of the middle, is on a strip (into `out`), on its surface. */
export function onStrip(st: Strip, s: number, o: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const k = segmentAt(st, s), s0 = st.s[k] as number, s1 = st.s[k + 1] as number;
  const t = Math.max(0, Math.min(1, (s - s0) / (s1 - s0 || 1)));
  const xa = (st.x[k] as number) + (st.rx[k] as number) * o, za = (st.z[k] as number) + (st.rz[k] as number) * o;
  const xb = (st.x[k + 1] as number) + (st.rx[k + 1] as number) * o, zb = (st.z[k + 1] as number) + (st.rz[k + 1] as number) * o;
  out.x = xa + (xb - xa) * t;
  out.z = za + (zb - za) * t;
  out.y = heightOn(st, k, t, o);
  return out;
}

/** A road's line as its strip runs it: its points (a ring's first again at its end), each one's station, its length. */
interface Line { x: number[]; z: number[]; s: number[]; closed: boolean; total: number }

function lineOf(pts: readonly P2[], closed: boolean): Line {
  const line: Line = { x: [], z: [], s: [], closed, total: 0 };
  const count = closed ? pts.length + 1 : pts.length;
  for (let k = 0; k < count; k++) {
    const p = pts[k % pts.length] as P2;
    if (k > 0) line.total += Math.hypot(p[0] - (line.x[k - 1] as number), p[1] - (line.z[k - 1] as number));
    line.x.push(p[0]); line.z.push(p[1]); line.s.push(line.total);
  }
  return line;
}

/** Station `s` on a line (a ring's taken round, an open one's clamped), into `out`. */
function lineAt(line: Line, s: number, out: { x: number; z: number }): void {
  const v = line.closed ? ((s % line.total) + line.total) % line.total : Math.max(0, Math.min(line.total, s));
  let k = 0;
  while (k + 2 < line.s.length && (line.s[k + 1] as number) < v) k++;
  const s0 = line.s[k] as number, s1 = line.s[k + 1] as number, t = s1 > s0 ? (v - s0) / (s1 - s0) : 0;
  out.x = (line.x[k] as number) + ((line.x[k + 1] as number) - (line.x[k] as number)) * t;
  out.z = (line.z[k] as number) + ((line.z[k + 1] as number) - (line.z[k] as number)) * t;
}

/** The nearest point of a line to (x, z): how far, and its station. */
function lineNearest(line: Line, x: number, z: number): { d: number; s: number } {
  let bd = Infinity, bs = 0;
  for (let k = 0; k + 1 < line.x.length; k++) {
    const ax = line.x[k] as number, az = line.z[k] as number, dx = (line.x[k + 1] as number) - ax, dz = (line.z[k + 1] as number) - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < bd) { bd = d; bs = (line.s[k] as number) + t * ((line.s[k + 1] as number) - (line.s[k] as number)); }
  }
  return { d: bd, s: bs };
}

/** A strip's frame: its middle and its unit right. */
interface Frame { x: number; z: number; rx: number; rz: number }

/** The strip's frame at road point `k` (a ring's taken round): its heading from the point before to the one after. */
function pointFrame(pts: readonly P2[], closed: boolean, k: number): Frame {
  const n = pts.length, i = k % n, p = pts[i] as P2;
  const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)] as P2, next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)] as P2;
  const tx = next[0] - prev[0], tz = next[1] - prev[1], l = Math.hypot(tx, tz) || 1;
  // a car's right facing +Z is −X: the right of (tx, tz) is (−tz, tx)
  return { x: p[0], z: p[1], rx: -tz / l, rz: tx / l };
}

/** A frame `f` of the way from `a` to `b` (its right's turn eased between theirs). */
function lerpFrame(a: Frame, b: Frame, f: number): Frame {
  const rx = a.rx + (b.rx - a.rx) * f, rz = a.rz + (b.rz - a.rz) * f, l = Math.hypot(rx, rz) || 1;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, rx: rx / l, rz: rz / l };
}

/** The strip's frame at station `s` of its road (a ring's taken round), as its sections have it. */
function frameAt(pts: readonly P2[], line: Line, s: number): Frame {
  const v = line.closed ? ((s % line.total) + line.total) % line.total : Math.max(0, Math.min(line.total, s));
  let k = 1;
  while (k + 1 < line.s.length && (line.s[k] as number) < v) k++;
  const s0 = line.s[k - 1] as number, s1 = line.s[k] as number;
  return lerpFrame(pointFrame(pts, line.closed, k - 1), pointFrame(pts, line.closed, k), s1 > s0 ? (v - s0) / (s1 - s0) : 0);
}

/**
 * An arm of a junction: its road, the node's station on it, the way it leaves (+1 up its stations, −1 down); its heading
 * out and where it starts (its road's point at the node), for the order round; its half width, whether it has
 * pavements, its heading's angle; where its strip starts (from the node's station), how far it may, that section's index;
 * its frame there and its heading out there.
 */
interface Arm {
  road: number; at: number; dir: 1 | -1; dx: number; dz: number; ox: number; oz: number; hw: number; paved: boolean; angle: number;
  end: number; room: number; k: number; ex: number; ez: number; erx: number; erz: number; edx: number; edz: number;
}
/**
 * The side between an arm and the next round (its right, the next one's left): a corner (the kerbs' crossing `c`, the
 * curve's middle `o`, its radius and its tangents' reach from `c`, the pavement's back corner `q`), a merge, straight
 * on, or the outside of a bend; how much further out each arm's strip must start for it (≤ 0: none).
 */
interface SideShape { kind: 'corner' | 'merge' | 'straight' | 'outer'; ta: number; tb: number; c: P2; o: P2; r: number; reach: number; q: P2; pave: boolean }

/** Where two lines cross: `p + d·t` and `q + e·u`; the two stations (NaN when they run parallel). */
function crossing(px: number, pz: number, dx: number, dz: number, qx: number, qz: number, ex: number, ez: number): { t: number; u: number } {
  const cr = dx * ez - dz * ex;
  if (Math.abs(cr) < 1e-9) return { t: NaN, u: NaN };
  const wx = qx - px, wz = qz - pz;
  return { t: (wx * ez - wz * ex) / cr, u: (wx * dz - wz * dx) / cr };
}

/**
 * The side between arms `a` and `b` (`b` the next round), from their strips' starts: A's right kerb through its start's
 * right edge, B's left through its left edge, each along its heading there (stations out from those sections). `fit`:
 * a corner's curve made to end inside both starts (two junctions close along a road leave its arm no room for the whole
 * curve: 31 m between Crown Avenue's crossing and the grid's next), none where it cannot; its pavement only where the
 * curve leaves one room (`pave`).
 */
function sideShape(a: Arm, b: Arm, fit = false): SideShape {
  let gap = Math.atan2(b.edz, b.edx) - Math.atan2(a.edz, a.edx);
  while (gap <= 0) gap += 2 * Math.PI;
  while (gap > 2 * Math.PI) gap -= 2 * Math.PI;
  // each arm's right as it leaves (toward the next round): (−dz, dx)
  const nax = -a.edz, naz = a.edx, nbx = -b.edz, nbz = b.edx;
  const none: SideShape = { kind: gap < Math.PI ? 'straight' : 'outer', ta: 0, tb: 0, c: [0, 0], o: [0, 0], r: 0, reach: 0, q: [0, 0], pave: true };
  if (Math.abs(gap - Math.PI) <= STRAIGHT) return { ...none, kind: 'straight' };
  if (gap > Math.PI) return none;
  const pax = a.ex + nax * a.hw, paz = a.ez + naz * a.hw, pbx = b.ex - nbx * b.hw, pbz = b.ez - nbz * b.hw;
  const kerb = crossing(pax, paz, a.edx, a.edz, pbx, pbz, b.edx, b.edz);
  if (!Number.isFinite(kerb.t)) return { ...none, kind: 'straight' };
  // (a merge's strips start past the gore, where their kerbs part: `MERGE_REACH` from the node at most)
  if (gap < MERGE) return { ...none, kind: 'merge', ta: kerb.t + ARM_PAST, tb: kerb.u + ARM_PAST };
  const cx = pax + a.edx * kerb.t, cz = paz + a.edz * kerb.t;
  const half = gap / 2;
  let reach = Math.min(CORNER_RADIUS / Math.tan(half), CORNER_REACH);
  if (fit) reach = Math.min(reach, -ARM_PAST - kerb.t, -ARM_PAST - kerb.u);
  if (reach < 0.5) return { ...none, kind: 'straight' };
  const r = reach * Math.tan(half), bx = a.edx + b.edx, bz = a.edz + b.edz, bl = Math.hypot(bx, bz) || 1, off = r / Math.sin(half);
  // the pavements' outer lines' crossing: the back of the corner
  const back = crossing(a.ex + nax * (a.hw + PAVEMENT), a.ez + naz * (a.hw + PAVEMENT), a.edx, a.edz, b.ex - nbx * (b.hw + PAVEMENT), b.ez - nbz * (b.hw + PAVEMENT), b.edx, b.edz);
  const qx = a.ex + nax * (a.hw + PAVEMENT) + a.edx * back.t, qz = a.ez + naz * (a.hw + PAVEMENT) + a.edz * back.t;
  // each strip starts `ARM_PAST` past its tangent and past the back corner
  return {
    kind: 'corner', ta: Math.max(kerb.t + reach + ARM_PAST, back.t + 0.1), tb: Math.max(kerb.u + reach + ARM_PAST, back.u + 0.1),
    c: [cx, cz], o: [cx + (bx / bl) * off, cz + (bz / bl) * off], r, reach, q: [qx, qz],
    pave: r >= PAVEMENT + 0.5 && back.t <= -0.1 && back.u <= -0.1,
  };
}

/** The roads' surfaces on the island's ground and network; `chunkOf` names a point's chunk; no bay where `noBay` says. */
export function roadSurfaces(ground: Ground, graph: RoadGraph, chunkOf: (x: number, z: number) => number, noBay: (x: number, z: number) => boolean = () => false): RoadSurfaces {
  const kerbs = new Map<number, Piece[]>();
  const lines = ground.roads.map((road) => lineOf(road.pts, road.closed));
  const pt = { x: 0, z: 0 };

  // the junctions' arms, from the roads' lines: the nodes two roads or more pass, each road's ways out of it
  const nodes: Array<{ node: number; arms: Arm[]; sides: SideShape[] }> = [];
  const onRoads = new Map<number, number[]>();
  for (const node of graph.nodes) {
    const arms: Arm[] = [];
    let roads = 0;
    ground.roads.forEach((road, r) => {
      // (the highway on its decks all the way passes over)
      if (road.cls === 'highway' && road.deck && road.pts.every((_, i) => road.deck?.[i] === true)) return;
      const line = lines[r] as Line, hit = lineNearest(line, node.x, node.z);
      if (hit.d >= ON_ROAD) return;
      roads++;
      for (const dir of [1, -1] as const) {
        const left = line.closed ? Infinity : dir > 0 ? line.total - hit.s : hit.s;
        if (left < 3) continue;
        lineAt(line, hit.s, pt);
        const ox = pt.x, oz = pt.z;
        lineAt(line, hit.s + dir * Math.min(8, left), pt);
        const dx = pt.x - ox, dz = pt.z - oz, l = Math.hypot(dx, dz) || 1;
        arms.push({
          road: r, at: hit.s, dir, dx: dx / l, dz: dz / l, ox, oz, hw: HALF_WIDTH[road.cls], paved: PAVED.has(road.cls), angle: Math.atan2(dz, dx),
          end: ARM_LEAST + ARM_PAST, room: 0, k: -1, ex: 0, ez: 0, erx: 0, erz: 0, edx: 0, edz: 0,
        });
      }
    });
    if (roads < 2 || arms.length < 2) continue;
    arms.sort((a, b) => a.angle - b.angle);
    nodes.push({ node: node.id, arms, sides: [] });
    for (const a of arms) {
      let list = onRoads.get(a.road);
      if (!list) { list = []; onRoads.set(a.road, list); }
      list.push(a.at);
    }
  }
  // each arm's room: short of halfway to the next node along its road, of the road's end and of `MERGE_REACH`
  for (const { arms } of nodes) for (const a of arms) {
    const line = lines[a.road] as Line;
    let room = line.closed ? line.total / 2 : a.dir > 0 ? line.total - a.at - 1 : a.at - 1;
    for (const s of onRoads.get(a.road) ?? []) {
      let d = a.dir * (s - a.at);
      if (line.closed) d = ((d % line.total) + line.total) % line.total;
      if (d > 1) room = Math.min(room, d / 2 - 0.25);
    }
    a.room = Math.max(0.5, Math.min(room, MERGE_REACH));
    a.end = Math.min(a.end, a.room);
  }
  // each arm's strip starts past its corners: its start's frame read, the corners worked out from the kerbs there, the
  // start moved out as far as they need, again till they fit (a curving road's heading turns with its start)
  const place = (a: Arm): void => {
    const f = frameAt((ground.roads[a.road] as { pts: readonly P2[] }).pts, lines[a.road] as Line, a.at + a.dir * a.end);
    a.ex = f.x; a.ez = f.z; a.erx = f.rx; a.erz = f.rz;
    // its heading out: up the stations the strip's own (rz, −rx)
    a.edx = a.dir * f.rz; a.edz = -a.dir * f.rx;
  };
  for (const n of nodes) {
    for (const a of n.arms) place(a);
    for (let pass = 0; pass < 6; pass++) {
      n.sides = n.arms.map((a, i) => sideShape(a, n.arms[(i + 1) % n.arms.length] as Arm));
      const grow = n.arms.map(() => 0);
      n.sides.forEach((side, i) => {
        grow[i] = Math.max(grow[i] as number, side.ta);
        const b = (i + 1) % n.arms.length;
        grow[b] = Math.max(grow[b] as number, side.tb);
      });
      let moved = false;
      n.arms.forEach((a, i) => {
        const g = grow[i] as number;
        if (g > 0.01 && a.end < a.room - 0.01) { a.end = Math.min(a.room, a.end + g); moved = true; place(a); }
      });
      if (!moved) break;
    }
    n.sides = n.arms.map((a, i) => sideShape(a, n.arms[(i + 1) % n.arms.length] as Arm, true));
  }
  const cuts: number[][] = ground.roads.map(() => []);
  for (const { arms } of nodes) for (const a of arms) {
    const line = lines[a.road] as Line;
    let s = a.at + a.dir * a.end;
    if (line.closed) s = ((s % line.total) + line.total) % line.total;
    (cuts[a.road] as number[]).push(s);
  }

  // the strips' sections, on the ground's surface: one at each of the road's points and at each arm's start, and between
  // two where the ground bends away from the straight line between them (a crest, a dip) by more than `BEND`
  const strips: Strip[] = ground.roads.map((road, index) => {
    const hw = HALF_WIDTH[road.cls], n = road.pts.length, count = road.closed ? n + 1 : n, line = lines[index] as Line;
    const st: Strip = { road: index, id: road.id, cls: road.cls, hw, closed: road.closed, x: [], z: [], rx: [], rz: [], h: [], s: [], drawn: [], walk: [], out: [], joined: [] };
    const forced = [...(cuts[index] as number[])].sort((a, b) => a - b);
    const section = (x: number, z: number, rx: number, rz: number): number[] => ACROSS.map((f) => ground.surfaceHeight(x + rx * hw * f, z + rz * hw * f) + ROAD_LIFT);
    const push = (x: number, z: number, rx: number, rz: number, h: number[], drawn: boolean): void => {
      const k = st.x.length;
      if (k > 0) {
        st.s.push((st.s[k - 1] as number) + Math.hypot(x - (st.x[k - 1] as number), z - (st.z[k - 1] as number)));
        st.drawn.push(drawn);
      } else st.s.push(0);
      st.x.push(x); st.z.push(z); st.rx.push(rx); st.rz.push(rz); st.h.push(h);
    };
    const frame = (k: number): Frame => pointFrame(road.pts, road.closed, k);
    // the sections from `a` (its heights `ha`) to `b` (`hb`), halving the span where the ground bends, twice at most
    const between = (a: Frame, ha: number[], b: Frame, hb: number[], drawn: boolean, depth: number): void => {
      if (depth < 2) {
        const m = lerpFrame(a, b, 0.5), hm = section(m.x, m.z, m.rx, m.rz);
        if (hm.some((h, i) => Math.abs(h - ((ha[i] as number) + (hb[i] as number)) / 2) > BEND)) {
          between(a, ha, m, hm, drawn, depth + 1);
          push(m.x, m.z, m.rx, m.rz, hm, drawn);
          between(m, hm, b, hb, drawn, depth + 1);
          return;
        }
      }
    };
    let a = frame(0), ha = section(a.x, a.z, a.rx, a.rz), sa = 0;
    push(a.x, a.z, a.rx, a.rz, ha, true);
    for (let k = 1; k < count; k++) {
      const b = frame(k), hb = section(b.x, b.z, b.rx, b.rz), sb = line.s[k] as number, from = a;
      // over an overpass the deck draws the road, from the last point on the ground
      const drawn = !(road.deck?.[(k - 1) % n] === true || road.deck?.[k % n] === true);
      // an arm's start inside this span: a section of its own
      for (const f of forced) {
        if (f <= sa + 0.01 || f >= sb - 0.01) continue;
        const m = lerpFrame(from, b, (f - (line.s[k - 1] as number)) / (sb - (line.s[k - 1] as number))), hm = section(m.x, m.z, m.rx, m.rz);
        between(a, ha, m, hm, drawn, 0);
        push(m.x, m.z, m.rx, m.rz, hm, drawn);
        a = m; ha = hm; sa = f;
      }
      between(a, ha, b, hb, drawn, 0);
      push(b.x, b.z, b.rx, b.rz, hb, drawn);
      a = b; ha = hb; sa = sb;
    }
    st.joined = new Array<number>(st.s.length).fill(0);
    return st;
  });

  // a box's segments are not drawn: from each arm's node to its start, and on to the road's end where no arm leaves that way
  for (const { arms } of nodes) {
    for (const a of arms) {
      const st = strips[a.road] as Strip, total = st.s[st.s.length - 1] as number, line = lines[a.road] as Line;
      let s = a.at + a.dir * a.end;
      if (line.closed) s = ((s % total) + total) % total;
      let best = 0, bd = Infinity;
      st.s.forEach((v, k) => { const d = Math.abs(v - s); if (d < bd) { bd = d; best = k; } });
      a.k = best;
      const lo = Math.min(a.at, a.at + a.dir * a.end), hi = Math.max(a.at, a.at + a.dir * a.end);
      // (no arm the other way: the road ends in the box)
      const ends = !line.closed && !arms.some((b) => b !== a && b.road === a.road);
      const from = ends && a.dir > 0 ? -1 : lo, to = ends && a.dir < 0 ? total + 1 : hi;
      for (let k = 0; k + 1 < st.s.length; k++) {
        let mid = ((st.s[k] as number) + (st.s[k + 1] as number)) / 2;
        if (line.closed) {
          // a ring's box may run past its seam
          if (mid < from) mid += total;
          else if (mid > to) mid -= total;
        }
        if (mid > from && mid < to) st.drawn[k] = false;
      }
    }
  }

  // each junction's rim: the arms' end sections and between them their sides' kerbs; its fan on the ground
  const junctions: Junction[] = [];
  const shapes: Array<{ j: Junction; arms: Arm[]; shapes: SideShape[] }> = [];
  const probe: GroundProbe = { h: 0, steep: 0, steepKind: -1, road: 0, surface: 0 }, edge = { x: 0, y: 0, z: 0 };
  for (const { arms, sides } of nodes) {
    // the junction's own surface: the ground on a carriageway, and past the carriageways (a corner's curve cuts off the
    // bank beside it) its arms' kerbs' heights, each by how near (a bank followed, Crown's corners stood 0.6 m over their
    // asphalt)
    const graded = (x: number, z: number): number => {
      ground.probe(x, z, probe);
      if (probe.road <= 0) return probe.h + ROAD_LIFT;
      let sum = 0, weight = 0;
      for (const a of arms) {
        const st = strips[a.road] as Strip, total = st.s[st.s.length - 1] as number;
        const dx = x - a.ex, dz = z - a.ez, t = dx * a.edx + dz * a.edz, l = -dx * a.edz + dz * a.edx;
        let s = a.at + a.dir * (a.end + t);
        if (st.closed) s = ((s % total) + total) % total;
        const w = 1 / (Math.max(0, Math.abs(l) - a.hw) ** 2 + 0.25);
        sum += onStrip(st, s, a.dir * (l < 0 ? -1 : 1) * st.hw, edge).y * w;
        weight += w;
      }
      return sum / weight;
    };
    const rimOf = (x: number, z: number): RimPoint => ({ x, y: graded(x, z), z, strip: -1, s: NaN, o: NaN });
    const rim: RimPoint[] = [], core: RimPoint[] = [], fillets: number[] = [], ranges: Array<[number, number]> = [];
    // (a point on the rim, and on the fan's rim too)
    const both = (p: RimPoint): void => { rim.push(p); core.push(p); };
    arms.forEach((a, i) => {
      const st = strips[a.road] as Strip, k = a.k;
      // its end section, its left edge to its right as it leaves (up the stations its right is the strip's right)
      const order = a.dir > 0 ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
      for (const q of order) {
        const o = (ACROSS[q] as number) * st.hw;
        both({ x: (st.x[k] as number) + (st.rx[k] as number) * o, y: (st.h[k] as number[])[q] as number, z: (st.z[k] as number) + (st.rz[k] as number) * o, strip: a.road, s: st.s[k] as number, o });
      }
      const from = rim.length - 1, side = sides[i] as SideShape, b = arms[(i + 1) % arms.length] as Arm;
      if (side.kind === 'corner') {
        const [cx, cz] = side.c, [ox, oz] = side.o, reach = side.reach;
        const tax = cx + a.edx * reach, taz = cz + a.edz * reach, tbx = cx + b.edx * reach, tbz = cz + b.edz * reach;
        const first = rim.length, c: RimPoint = { ...rimOf(cx, cz), strip: CROSSING };
        both(rimOf(tax, taz));
        // the curve round its middle, from A's tangent to B's (the short way); the fan's rim across its kerbs' crossing
        const a0 = Math.atan2(taz - oz, tax - ox);
        let sweep = Math.atan2(tbz - oz, tbx - ox) - a0;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep < -Math.PI) sweep += 2 * Math.PI;
        const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
        for (let p = 1; p < pieces; p++) rim.push(rimOf(ox + Math.cos(a0 + (sweep * p) / pieces) * side.r, oz + Math.sin(a0 + (sweep * p) / pieces) * side.r));
        core.push(c);
        both(rimOf(tbx, tbz));
        fillets.push(c.x, c.y, c.z, first, rim.length - 1);
      } else if (side.kind === 'outer') {
        // round the outside of a bend: each kerb back to its foot across from the node
        const nax = -a.edz, naz = a.edx, nbx = -b.edz, nbz = b.edx;
        const pax = a.ex + nax * a.hw, paz = a.ez + naz * a.hw, pbx = b.ex - nbx * b.hw, pbz = b.ez - nbz * b.hw;
        const ta = Math.min(0, (a.ox - pax) * a.edx + (a.oz - paz) * a.edz), tb = Math.min(0, (b.ox - pbx) * b.edx + (b.oz - pbz) * b.edz);
        both(rimOf(pax + a.edx * ta, paz + a.edz * ta));
        both(rimOf(pbx + b.edx * tb, pbz + b.edz * tb));
      }
      ranges.push([from, rim.length]);
    });
    // (each side from its arm's right edge to the next arm's left edge: the next section's first point)
    const n = core.length;
    const jsides: JunctionSide[] = ranges.map(([from, next]) => ({ from, to: next % rim.length, outer: [], q: [] }));
    // its middle, where the fan folds least: the arms' starts at the node, its rim's own middle or its points' mean
    let ax = 0, az = 0, mx = 0, mz = 0, area = 0, gx = 0, gz = 0;
    for (const a of arms) { ax += a.ox / arms.length; az += a.oz / arms.length; }
    for (let i = 0; i < n; i++) {
      const p = core[i] as RimPoint, q = core[(i + 1) % n] as RimPoint, w = p.x * q.z - q.x * p.z;
      area += w; gx += (p.x + q.x) * w; gz += (p.z + q.z) * w; mx += p.x / n; mz += p.z / n;
    }
    const folds = (x: number, z: number): number => {
      let f = 0;
      for (let i = 0; i < n; i++) {
        const p = core[i] as RimPoint, q = core[(i + 1) % n] as RimPoint;
        if ((p.x - x) * (q.z - z) - (p.z - z) * (q.x - x) < 0) f++;
      }
      return f;
    };
    const middles: P2[] = [[ax, az], ...(Math.abs(area) > 1e-6 ? [[gx / (3 * area), gz / (3 * area)] as const] : []), [mx, mz]];
    const [jx, jz] = middles.reduce((best, m) => (folds(m[0], m[1]) < folds(best[0], best[1]) ? m : best));
    const j: Junction = { x: jx, y: graded(jx, jz), z: jz, rim, core, grid: [], cut: 2, fillets, sides: jsides };
    // its fan on the ground, cut as fine as it bends
    layFan(j, graded, fillets);
    junctions.push(j);
    shapes.push({ j, arms, shapes: sides });
  }

  // the strips and their pavements, and the pavements' footway runs (the props' lines, slice 7b)
  const footways: FootwayRun[] = [];
  for (const st of strips) {
    const paved = PAVED.has(st.cls), count = st.s.length;
    // the `i`-th point across section `k`
    const pt = (k: number, i: number): number[] => stripPoint(st, k, i);
    const last = ACROSS.length - 1;
    st.out = new Array<number>(2 * count).fill(NaN);
    // each side's footway run being laid: straight while the pavement's edge keeps within `RUN_BEND` of its line
    const runs: Array<FootwayRun | null> = [null, null];
    const close = (w: number): void => { const r = runs[w]; if (r && r.length > 1) footways.push(r); runs[w] = null; };
    for (let k = 0; k + 1 < count; k++) {
      st.walk.push(0);
      if (!st.drawn[k]) { close(0); close(1); continue; }
      for (const [side, e0, e1] of [[1, pt(k, 0), pt(k + 1, 0)], [-1, pt(k, last), pt(k + 1, last)]] as const) {
        const w = side > 0 ? 0 : 1;
        const outX0 = (st.x[k] as number) + (st.rx[k] as number) * side * (st.hw + PAVEMENT), outZ0 = (st.z[k] as number) + (st.rz[k] as number) * side * (st.hw + PAVEMENT);
        const outX1 = (st.x[k + 1] as number) + (st.rx[k + 1] as number) * side * (st.hw + PAVEMENT), outZ1 = (st.z[k + 1] as number) + (st.rz[k + 1] as number) * side * (st.hw + PAVEMENT);
        const walk = paved && ground.onLand(outX0, outZ0) && ground.onLand(outX1, outZ1)
          && ![[e0[0], e0[2]], [e1[0], e1[2]], [outX0, outZ0], [outX1, outZ1]].some(([x, z]) => ground.nearOtherRoad(x as number, z as number, st.road, CLEAR_OF_ROAD));
        if (walk) {
          // the footway run: on from the last while this stretch's end stays on its line, else a new one from here
          const ex = e1[0] as number, ez = e1[2] as number;
          const r = runs[w];
          const along = r ? (ex - r.x) * r.dx + (ez - r.z) * r.dz : 0, off = r ? Math.abs((ex - r.x) * r.dz - (ez - r.z) * r.dx) : Infinity;
          if (r && off < RUN_BEND && along > r.length) r.length = along;
          else {
            close(w);
            const sx = e0[0] as number, sz = e0[2] as number, l = Math.hypot(ex - sx, ez - sz) || 1, dx = (ex - sx) / l, dz = (ez - sz) / l;
            // from the road across the footway: the side's way out (the right of the way it runs is (−dz, dx))
            runs[w] = { x: sx, z: sz, dx, dz, nx: -side * dz, nz: side * dx, length: l, along: st.s[k] as number, district: districtOf(sx, sz), street: st.cls === 'avenue' ? 'avenue' : 'grid', entrances: [] };
          }
        } else close(w);
        if (!walk) continue;
        st.walk[k] = (st.walk[k] as number) | (w === 0 ? 1 : 2);
        const g0 = ground.surfaceHeight(outX0, outZ0), g1 = ground.surfaceHeight(outX1, outZ1);
        st.out[2 * k + w] = g0;
        st.out[2 * (k + 1) + w] = g1;
        const top0 = [e0[0] as number, (e0[1] as number) + KERB, e0[2] as number], top1 = [e1[0] as number, (e1[1] as number) + KERB, e1[2] as number];
        const out0 = [outX0, g0 + ROAD_LIFT + KERB, outZ0], out1 = [outX1, g1 + ROAD_LIFT + KERB, outZ1];
        addKerb(kerbs, chunkOf, top0, top1, out0, out1);
      }
    }
    close(0);
    close(1);
  }

  // the pavements round the junctions' corners (and on across a T's straight side), where both arms' pavements reach it
  for (const { j, arms, shapes: sides } of shapes) {
    const n = j.rim.length;
    arms.forEach((a, i) => {
      const b = arms[(i + 1) % arms.length] as Arm, side = sides[i] as SideShape, js = j.sides[i] as JunctionSide;
      if (side.kind === 'merge' || !side.pave || !a.paved || !b.paved) return;
      // A's right as it leaves and B's left: which pavement of each strip, on which segment next to its end section
      const sa = strips[a.road] as Strip, sb = strips[b.road] as Strip;
      const aw = a.dir > 0 ? 0 : 1, bw = b.dir > 0 ? 1 : 0;
      const aSeg = a.dir > 0 ? a.k : a.k - 1, bSeg = b.dir > 0 ? b.k : b.k - 1;
      if (aSeg < 0 || bSeg < 0 || aSeg >= sa.walk.length || bSeg >= sb.walk.length) return;
      if (((sa.walk[aSeg] as number) & (aw === 0 ? 1 : 2)) === 0 || ((sb.walk[bSeg] as number) & (bw === 0 ? 1 : 2)) === 0) return;
      // each kerb point's way out across the pavement: an arm's edge its strip's, a straight kerb its arm's, a curve's to its middle
      const count = ((js.to - js.from + n) % n) + 1, outer: number[] = [];
      for (let p = 0; p < count; p++) {
        const r = j.rim[(js.from + p) % n] as RimPoint;
        let nx: number, nz: number, y: number;
        if (p === 0 || p === count - 1) {
          const st = p === 0 ? sa : sb, k = p === 0 ? a.k : b.k, w = p === 0 ? aw : bw, sign = w === 0 ? 1 : -1;
          nx = (st.rx[k] as number) * sign; nz = (st.rz[k] as number) * sign;
          y = st.out[2 * k + w] as number;
          if (!Number.isFinite(y)) y = ground.surfaceHeight(r.x + nx * PAVEMENT, r.z + nz * PAVEMENT);
        } else {
          if (side.kind === 'corner' && p > 1 && p < count - 2) {
            const dx = side.o[0] - r.x, dz = side.o[1] - r.z, l = Math.hypot(dx, dz) || 1;
            nx = dx / l; nz = dz / l;
          } else if (p <= (count - 1) / 2) { nx = -a.edz; nz = a.edx; } else { nx = b.edz; nz = -b.edx; }
          y = ground.surfaceHeight(r.x + nx * PAVEMENT, r.z + nz * PAVEMENT);
        }
        outer.push(r.x + nx * PAVEMENT, y + ROAD_LIFT + KERB, r.z + nz * PAVEMENT);
      }
      js.outer = outer;
      if (side.kind === 'corner') js.q = [side.q[0], ground.surfaceHeight(side.q[0], side.q[1]) + ROAD_LIFT + KERB, side.q[1]];
      // the kerbs' pieces along it, and its arms' pavements joined to it (no end face there)
      for (let p = 0; p + 1 < count; p++) {
        const r0 = j.rim[(js.from + p) % n] as RimPoint, r1 = j.rim[(js.from + p + 1) % n] as RimPoint;
        if (Math.hypot(r1.x - r0.x, r1.z - r0.z) < 0.05) continue;
        addKerb(kerbs, chunkOf, [r0.x, r0.y + KERB, r0.z], [r1.x, r1.y + KERB, r1.z], outer.slice(3 * p, 3 * p + 3), outer.slice(3 * p + 3, 3 * p + 6));
      }
      sa.joined[a.k] = (sa.joined[a.k] as number) | (aw === 0 ? 1 : 2);
      sb.joined[b.k] = (sb.joined[b.k] as number) | (bw === 0 ? 1 : 2);
    });
  }

  // the paint
  const paint: Paint[] = [], parking: ParkingBay[] = [];
  const corner = { x: 0, y: 0, z: 0 };
  // a quad of paint laid on the strip's triangles: halved (its longer way) where the strip bends under it
  const put = (kind: PaintKind, si: number, s: number[], o: number[], colour: number, lift = PAINT_LIFT, depth = 0): void => {
    const st = strips[si] as Strip, y: number[] = [];
    for (let i = 0; i < 4; i++) {
      onStrip(st, s[i] as number, o[i] as number, corner);
      y.push(corner.y + lift);
    }
    if (depth < PAINT_SPLITS) {
      // its middle's and its edges' middles' misses from their corners' straight lines
      let miss = Math.abs(onStrip(st, ((s[0] as number) + (s[2] as number)) / 2, ((o[0] as number) + (o[2] as number)) / 2, corner).y + lift - ((y[0] as number) + (y[2] as number)) / 2);
      for (let i = 0; i < 4; i++) {
        const k = (i + 1) % 4;
        miss = Math.max(miss, Math.abs(onStrip(st, ((s[i] as number) + (s[k] as number)) / 2, ((o[i] as number) + (o[k] as number)) / 2, corner).y + lift - ((y[i] as number) + (y[k] as number)) / 2));
      }
      if (miss > PAINT_SAG) {
        const len = Math.hypot((s[1] as number) - (s[0] as number), (o[1] as number) - (o[0] as number)), wide = Math.hypot((s[3] as number) - (s[0] as number), (o[3] as number) - (o[0] as number));
        const mid = (i: number, k: number, f: number): [number, number] => [(s[i] as number) + ((s[k] as number) - (s[i] as number)) * f, (o[i] as number) + ((o[k] as number) - (o[i] as number)) * f];
        if (len >= wide) {
          const [s01, o01] = mid(0, 1, 0.5), [s32, o32] = mid(3, 2, 0.5);
          put(kind, si, [s[0] as number, s01, s32, s[3] as number], [o[0] as number, o01, o32, o[3] as number], colour, lift, depth + 1);
          put(kind, si, [s01, s[1] as number, s[2] as number, s32], [o01, o[1] as number, o[2] as number, o32], colour, lift, depth + 1);
        } else {
          const [s03, o03] = mid(0, 3, 0.5), [s12, o12] = mid(1, 2, 0.5);
          put(kind, si, [s[0] as number, s[1] as number, s12, s03], [o[0] as number, o[1] as number, o12, o03], colour, lift, depth + 1);
          put(kind, si, [s03, s12, s[2] as number, s[3] as number], [o03, o12, o[2] as number, o[3] as number], colour, lift, depth + 1);
        }
        return;
      }
    }
    paint.push({ kind, strip: si, s, o, y, colour });
  };
  // a line from `s0` to `s1`, `o` m right of the middle, split at the sections so it lies on the strip
  const line = (kind: PaintKind, si: number, s0: number, s1: number, o: number, width: number, colour: number): void => {
    const st = strips[si] as Strip;
    let a = s0;
    while (a < s1 - 0.01) {
      const k = segmentAt(st, a + 0.001), b = Math.min(s1, st.s[k + 1] as number);
      put(kind, si, [a, b, b, a], [o - width / 2, o - width / 2, o + width / 2, o + width / 2], colour);
      a = b;
    }
  };
  // a rectangle `along` × `across` at station `s`, offset `o`, turned by `turn` (rad, from along the road toward its right)
  const rect = (kind: PaintKind, si: number, s: number, o: number, along: number, across: number, colour: number, turn = 0, lift = PAINT_LIFT): void => {
    const c = Math.cos(turn), sn = Math.sin(turn), ss: number[] = [], oo: number[] = [];
    for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const a = (u * along) / 2, b = (w * across) / 2;
      ss.push(s + a * c - b * sn);
      oo.push(o + a * sn + b * c);
    }
    put(kind, si, ss, oo, colour, lift);
  };
  // the approaches: each arm's start where its road is not the one widest road through its junction
  const approaches = new Map<string, { stop: boolean; through: boolean }>();
  for (const { arms } of nodes) {
    const widest = Math.max(...arms.map((a) => a.hw)), alone = new Set(arms.filter((a) => a.hw === widest).map((a) => a.road)).size === 1;
    for (const a of arms) {
      const st = strips[a.road] as Strip;
      approaches.set(`${a.road}:${a.k}`, { stop: st.cls !== 'highway' && !(a.hw === widest && alone), through: arms.some((b) => b !== a && b.road === a.road) });
    }
  }
  // each strip's drawn runs, and each run's ends at a junction's box
  for (const [si, st] of strips.entries()) {
    // no paint on the dirt, nor on the rings (one way round, read by their kerbs)
    const count = st.s.length;
    if (st.cls === 'dirt' || st.closed) continue;
    const runs: Array<[number, number]> = [];
    for (let k = 0; k + 1 < count; k++) {
      if (!st.drawn[k]) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === k) last[1] = k + 1;
      else runs.push([k, k + 1]);
    }
    const lane = Math.min(4.5, st.hw - 3.5);
    const bays = BAYS.has(st.cls);
    const stopOuter = bays ? st.hw - 3.4 : st.hw - 0.6;
    for (const [ka, kb] of runs) {
      const sa = st.s[ka] as number, sb = st.s[kb] as number;
      const start = approaches.get(`${si}:${ka}`) ?? null, end = approaches.get(`${si}:${kb}`) ?? null;
      // the approaches' paint: toward the start (traffic running −s, its right the road's left) and toward the end
      // each approach has half the run: a short run between two boxes keeps what fits (the stop line, then the zebra)
      const room = (sb - sa) / 2;
      const approach = (at0: number, dir: 1 | -1, j: { stop: boolean; through: boolean } | null): number => {
        if (!j?.stop || room < STOP.plain + 1) return 0;
        const side = dir, zebra = PAVED.has(st.cls) && room > STOP.zebra + 1;
        const away = (d: number): number => at0 - dir * d;
        if (zebra) for (let o = -st.hw + 1.5; o <= st.hw - 1.5 + 1e-6; o += ZEBRA.pitch) rect('zebra', si, away(ZEBRA.at), o, ZEBRA.length, ZEBRA.stripe, PALETTE.roadWhite);
        const stop = zebra ? STOP.zebra : STOP.plain;
        rect('stop', si, away(stop), (side * (0.3 + stopOuter)) / 2, STOP.depth, stopOuter - 0.3, PALETTE.roadWhite);
        // the centre's line from the stop line on (Marcin, 2026-09-28: it stopped 18 m short of it, at the arrow's back)
        const clear = stop + STOP.depth / 2;
        if (room < stop + ARROW + 3) return Math.min(room, clear);
        // the arrow on the approach's lane, pointing at the junction: straight on through it, else left or right
        const a = away(stop + ARROW), o = side * lane;
        if (j.through) {
          rect('arrow', si, a - dir * 0.5, o, 3.6, 0.45, PALETTE.roadWhite);
          // each wing's front end at the shaft's tip
          for (const w of [-1, 1]) rect('arrow', si, a + dir * 1.1, o + w * 0.55, 1.65, 0.45, PALETTE.roadWhite, -w * dir * Math.PI / 4);
        } else {
          rect('arrow', si, a - dir * 0.6, o, 2.4, 0.45, PALETTE.roadWhite);
          const bar = a + dir * 0.6;
          rect('arrow', si, bar, o, 0.45, 2.9, PALETTE.roadWhite);
          // a head at each end of the bar: two strokes meeting at its tip
          for (const w of [-1, 1]) for (const u of [-1, 1]) rect('arrow', si, bar + u * 0.45, o + w * 1.25, 1.27, 0.45, PALETTE.roadWhite, -Math.atan2(w, u));
        }
        return clear;
      };
      const clearA = approach(sa, -1, start), clearB = approach(sb, 1, end);
      const from = sa + clearA, to = sb - clearB;
      if (to - from < 2) continue;
      // the lines along the run
      if (st.cls === 'highway') {
        for (const side of [-1, 1]) line('centre', si, from, to, side * 0.24, LINE, PALETTE.roadYellow);
        for (let d = Math.ceil(from / LANE_DASH) * LANE_DASH; d + 4 <= to; d += LANE_DASH) for (const side of [-1, 1]) line('lane', si, d, d + 4, side * DIVIDER, 0.22, PALETTE.roadWhite);
      } else if (st.cls === 'taxiway') {
        line('centre', si, from, to, 0, LINE, PALETTE.roadYellow);
      } else {
        // a double line near an approach, dashes between
        const solidA = start?.stop ? Math.min(to, from + SOLID) : from, solidB = end?.stop ? Math.max(solidA, to - SOLID) : to;
        if (solidA > from) for (const side of [-1, 1]) line('centre', si, from, solidA, side * 0.2, LINE * 0.8, PALETTE.roadYellow);
        if (solidB < to) for (const side of [-1, 1]) line('centre', si, solidB, to, side * 0.2, LINE * 0.8, PALETTE.roadYellow);
        for (let d = Math.ceil(solidA / (2 * DASH)) * 2 * DASH; d + DASH <= solidB; d += 2 * DASH) line('centre', si, d, d + DASH, 0, LINE, PALETTE.roadYellow);
      }
      // the edge lines, broken at another road's mouth
      if (st.cls === 'highway' || EDGED.has(st.cls)) {
        const edge = st.cls === 'highway' ? HIGHWAY_EDGE : st.hw - 0.6;
        for (const side of [-1, 1]) {
          for (let d = from; d < to - 0.5; d += 3) {
            const e = Math.min(to, d + 3);
            onStrip(st, (d + e) / 2, side * (edge + 1), corner);
            if (!ground.nearOtherRoad(corner.x, corner.z, st.road, 0)) line('edge', si, d, e, side * edge, 0.22, PALETTE.roadWhite);
          }
        }
      }
      // the parking bays along the kerbs, in the district's groups
      const style = bays ? PARKING_STYLE[districtOf((st.x[ka] as number + (st.x[kb] as number)) / 2, ((st.z[ka] as number) + (st.z[kb] as number)) / 2)] : undefined;
      if (!style) continue;
      const b0 = sa + BAY_CLEAR, b1 = sb - BAY_CLEAR;
      for (const side of [-1, 1]) {
        const o = side * (st.hw - 0.2 - PARKING.width / 2);
        let group = 0, inGroup = 0;
        for (let d = b0; d + PARKING.length <= b1; d += PARKING.length) {
          if (inGroup === style.group) { inGroup = 0; group++; continue; }
          inGroup++;
          if (group % style.every !== 0) continue;
          const mid = d + PARKING.length / 2;
          onStrip(st, mid, o, corner);
          // (none where a kicker or a gate stands in the kerbside strip: slice 15)
          if (!ground.onLand(corner.x, corner.z) || ground.nearOtherRoad(corner.x, corner.z, st.road, 2) || noBay(corner.x, corner.z)) continue;
          const k = segmentAt(st, mid), yaw = Math.atan2((st.x[k + 1] as number) - (st.x[k] as number), (st.z[k + 1] as number) - (st.z[k] as number));
          // a car in it faces the way its side's traffic runs: +s on the right, −s on the left
          parking.push({ road: st.id, x: corner.x, z: corner.z, yaw: side > 0 ? yaw : yaw + Math.PI, width: PARKING.width, length: PARKING.length });
          rect('bay', si, mid, o, PARKING.length, PARKING.width, PALETTE.asphaltBay);
          for (const e of [-1, 1]) rect('bay', si, mid, o + e * (PARKING.width / 2 - 0.12), PARKING.length, 0.24, style.colour, 0, PAINT_LIFT + 0.006);
          rect('bay', si, d + 0.12, o, 0.24, PARKING.width - 0.48, style.colour, 0, PAINT_LIFT + 0.006);
          rect('bay', si, d + PARKING.length - 0.12, o, 0.24, PARKING.width - 0.48, style.colour, 0, PAINT_LIFT + 0.006);
        }
      }
    }
  }
  return { strips, junctions, paint, parking, kerbs, footways };
}

/**
 * A kerb's piece (the wheels' slab under a pavement's band) from its band's four corners: the kerb's top at its start
 * and end, the outer edge's; its middle at its top, into its chunk's list.
 */
function addKerb(kerbs: Map<number, Piece[]>, chunkOf: (x: number, z: number) => number, top0: ArrayLike<number>, top1: ArrayLike<number>, out0: ArrayLike<number>, out1: ArrayLike<number>): void {
  const cx = ((top0[0] as number) + (top1[0] as number) + (out0[0] as number) + (out1[0] as number)) / 4, cz = ((top0[2] as number) + (top1[2] as number) + (out0[2] as number) + (out1[2] as number)) / 4;
  const ya = ((top0[1] as number) + (out0[1] as number)) / 2, yb = ((top1[1] as number) + (out1[1] as number)) / 2;
  // along the band's middle
  const dx = ((top1[0] as number) + (out1[0] as number) - (top0[0] as number) - (out0[0] as number)) / 2, dz = ((top1[2] as number) + (out1[2] as number) - (top0[2] as number) - (out0[2] as number)) / 2, run = Math.hypot(dx, dz);
  if (run < 0.05) return;
  const key = chunkOf(cx, cz);
  let list = kerbs.get(key);
  if (!list) { list = []; kerbs.set(key, list); }
  list.push({ x: cx, y: (ya + yb) / 2, z: cz, yaw: Math.atan2(dx, dz), pitch: Math.atan2(yb - ya, run), length: Math.hypot(run, yb - ya) });
}

/** The `i`-th point across section `k` of a strip (x, its height there, z). */
function stripPoint(st: Strip, k: number, i: number): number[] {
  const o = (ACROSS[i] as number) * st.hw;
  return [(st.x[k] as number) + (st.rx[k] as number) * o, (st.h[k] as number[])[i] as number, (st.z[k] as number) + (st.rz[k] as number) * o];
}

/**
 * The render's triangles a chunk (`chunkOf` names a triangle's by its middle) from the surfaces' data, reading no ground:
 * the junctions' fans and their sides' kerbs and pavements, the strips' bands, their pavements on their kerbs (or their
 * edges' skirts), the paint.
 */
export function surfaceMeshes(s: RoadSurfaces, chunkOf: (x: number, z: number) => number): Map<number, SurfaceChunk> {
  const e = new Emitter(chunkOf, -1);
  s.junctions.forEach((j) => e.junction(j));
  for (const st of s.strips) for (let k = 0; k + 1 < st.s.length; k++) e.segment(st, k);
  const v = new Float64Array(12);
  s.paint.forEach((p) => e.paint(p, paintCorners(s, p, v)));
  return e.done();
}

/**
 * Which junctions, strips' segments (strip and segment, in pairs) and paint quads lay triangles in each chunk (M8.10
 * slice 18: a chunk's triangles made alone, in the order the island's are): the chunks a junction's or a segment's box
 * touches, the chunks a paint quad's two triangles' middles are in (its corners kept, twelve a quad).
 */
export interface SurfaceIndex { junctions: Map<number, number[]>; segments: Map<number, number[]>; paint: Map<number, number[]>; corners: Float64Array }

export function surfaceIndex(s: RoadSurfaces, chunkOf: (x: number, z: number) => number): SurfaceIndex {
  const index: SurfaceIndex = { junctions: new Map(), segments: new Map(), paint: new Map(), corners: new Float64Array(s.paint.length * 12) };
  // an entry (one number, or two: `v2` NaN for none) into a chunk's list
  const into = (map: Map<number, number[]>, key: number, v: number, v2 = NaN): void => {
    let list = map.get(key);
    if (!list) { list = []; map.set(key, list); }
    list.push(v);
    if (v2 === v2) list.push(v2);
  };
  // a box's chunks: its corners' (a box smaller than a chunk touches no other)
  const box = (map: Map<number, number[]>, x0: number, x1: number, z0: number, z1: number, v: number, v2 = NaN): void => {
    const a = chunkOf(x0, z0), b = chunkOf(x1, z0), c = chunkOf(x0, z1), d = chunkOf(x1, z1);
    into(map, a, v, v2);
    if (b !== a) into(map, b, v, v2);
    if (c !== a && c !== b) into(map, c, v, v2);
    if (d !== a && d !== b && d !== c) into(map, d, v, v2);
  };
  s.junctions.forEach((j, n) => {
    let x0 = j.x, x1 = j.x, z0 = j.z, z1 = j.z;
    for (const r of j.rim) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); z0 = Math.min(z0, r.z); z1 = Math.max(z1, r.z); }
    for (const side of j.sides) for (const list of [side.outer, side.q]) for (let i = 0; i + 2 < list.length; i += 3) {
      const x = list[i] as number, z = list[i + 2] as number;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    box(index.junctions, x0 - 1, x1 + 1, z0 - 1, z1 + 1, n);
  });
  s.strips.forEach((st, n) => {
    const reach = st.hw + PAVEMENT + 1;
    for (let k = 0; k + 1 < st.s.length; k++) {
      if (!st.drawn[k]) continue;
      const xa = st.x[k] as number, za = st.z[k] as number, xb = st.x[k + 1] as number, zb = st.z[k + 1] as number;
      box(index.segments, Math.min(xa, xb) - reach, Math.max(xa, xb) + reach, Math.min(za, zb) - reach, Math.max(za, zb) + reach, n, k);
    }
  });
  const v = new Float64Array(12);
  s.paint.forEach((p, n) => {
    paintCorners(s, p, v);
    index.corners.set(v, n * 12);
    // its two triangles' middles (a, b, c) and (a, c, d), as the emitter names them
    const a = chunkOf(((v[0] as number) + (v[3] as number) + (v[6] as number)) / 3, ((v[2] as number) + (v[5] as number) + (v[8] as number)) / 3);
    const b = chunkOf(((v[0] as number) + (v[6] as number) + (v[9] as number)) / 3, ((v[2] as number) + (v[8] as number) + (v[11] as number)) / 3);
    into(index.paint, a, n);
    if (b !== a) into(index.paint, b, n);
  });
  return index;
}

/** One chunk's triangles made alone, from its index (as `surfaceMeshes` makes them); null where none. */
export function surfaceChunk(s: RoadSurfaces, index: SurfaceIndex, key: number, chunkOf: (x: number, z: number) => number): SurfaceChunk | null {
  const e = new Emitter(chunkOf, key);
  for (const n of index.junctions.get(key) ?? []) e.junction(s.junctions[n] as Junction);
  const segs = index.segments.get(key) ?? [];
  for (let i = 0; i < segs.length; i += 2) e.segment(s.strips[segs[i] as number] as Strip, segs[i + 1] as number);
  for (const n of index.paint.get(key) ?? []) e.paint(s.paint[n] as Paint, index.corners.subarray(n * 12, n * 12 + 12));
  return e.done().get(key) ?? null;
}

/** A paint quad's corners on its strip at its heights (x, y, z four times), into `out` (`onStrip`'s x and z; its own y). */
function paintCorners(s: RoadSurfaces, p: Paint, out: Float64Array): Float64Array {
  const st = s.strips[p.strip] as Strip;
  for (let i = 0; i < 4; i++) {
    const sv = p.s[i] as number, o = p.o[i] as number, k = segmentAt(st, sv), s0 = st.s[k] as number, s1 = st.s[k + 1] as number;
    const t = Math.max(0, Math.min(1, (sv - s0) / (s1 - s0 || 1)));
    const xa = (st.x[k] as number) + (st.rx[k] as number) * o, za = (st.z[k] as number) + (st.rz[k] as number) * o;
    const xb = (st.x[k + 1] as number) + (st.rx[k + 1] as number) * o, zb = (st.z[k + 1] as number) + (st.rz[k + 1] as number) * o;
    out[i * 3] = xa + (xb - xa) * t; out[i * 3 + 1] = p.y[i] as number; out[i * 3 + 2] = za + (zb - za) * t;
  }
  return out;
}

/** The surfaces' triangles as they are laid, a chunk's each (`only` the one kept, -1 all): its far level, then its detail. */
class Emitter {
  // (the detail, drawn near only, kept apart and put after each chunk's far level)
  private readonly chunks = new Map<number, SurfaceChunk>();
  private readonly details = new Map<number, SurfaceChunk>();
  constructor(private readonly chunkOf: (x: number, z: number) => number, private readonly only: number) {}

  private tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, colour: number, detail = false): void {
    const key = this.chunkOf((ax + bx + cx) / 3, (az + bz + cz) / 3), into = detail ? this.details : this.chunks;
    if (this.only >= 0 && key !== this.only) return;
    let c = into.get(key);
    if (!c) { c = { positions: [], colors: [], far: 0 }; into.set(key, c); }
    c.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    c.colors.push(colour);
  }

  private quad(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, d: ArrayLike<number>, colour: number, detail = false): void {
    this.tri(a[0] as number, a[1] as number, a[2] as number, b[0] as number, b[1] as number, b[2] as number, c[0] as number, c[1] as number, c[2] as number, colour, detail);
    this.tri(a[0] as number, a[1] as number, a[2] as number, c[0] as number, c[1] as number, c[2] as number, d[0] as number, d[1] as number, d[2] as number, colour, detail);
  }

  /**
   * A junction: its fan from the middle; round each side its pavement on its kerb (the band, the back corner's fill, the
   * kerb's face, the outer face), or where none the edge's skirt.
   */
  junction(j: Junction): void {
    fanFaces(j, (ax, ay, az, bx, by, bz, cx, cy, cz) => this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, PALETTE.asphalt));
    const n = j.rim.length;
    for (const side of j.sides) {
      const count = ((side.to - side.from + n) % n) + 1;
      const rim = (p: number): RimPoint => j.rim[(side.from + p) % n] as RimPoint;
      if (side.outer.length === 0) {
        for (let p = 0; p + 1 < count; p++) {
          const a = rim(p), b = rim(p + 1);
          this.quad([a.x, a.y, a.z], [a.x, a.y - SKIRT, a.z], [b.x, b.y - SKIRT, b.z], [b.x, b.y, b.z], PALETTE.asphalt);
        }
        continue;
      }
      const o = side.outer, out = (p: number): number[] => [o[3 * p] as number, o[3 * p + 1] as number, o[3 * p + 2] as number];
      for (let p = 0; p + 1 < count; p++) {
        const a = rim(p), b = rim(p + 1), ta = [a.x, a.y + KERB, a.z], tb = [b.x, b.y + KERB, b.z];
        this.quad(ta, tb, out(p + 1), out(p), ISLAND_COLORS.paving);
        this.quad([a.x, a.y, a.z], [b.x, b.y, b.z], tb, ta, PALETTE.kerb, true);
      }
      // the back: the outer points along the arms' kerbs and the corner's back point between them (its curve's inner
      // side filled from it)
      const back: number[][] = [];
      if (side.q.length === 3 && count >= 4) {
        const q = side.q;
        for (let p = 1; p + 2 < count; p++) {
          const a = out(p), b = out(p + 1);
          if (Math.abs((a[0] as number - (q[0] as number)) * (b[2] as number - (q[2] as number)) - (a[2] as number - (q[2] as number)) * (b[0] as number - (q[0] as number))) > 1e-4) this.tri(q[0] as number, q[1] as number, q[2] as number, b[0] as number, b[1] as number, b[2] as number, a[0] as number, a[1] as number, a[2] as number, ISLAND_COLORS.paving);
        }
        back.push(out(0), out(1), [q[0] as number, q[1] as number, q[2] as number], out(count - 2), out(count - 1));
      } else for (let p = 0; p < count; p++) back.push(out(p));
      for (let p = 0; p + 1 < back.length; p++) {
        const a = back[p] as number[], b = back[p + 1] as number[];
        this.quad(a, b, [b[0] as number, (b[1] as number) - KERB - ROAD_LIFT - SKIRT, b[2] as number], [a[0] as number, (a[1] as number) - KERB - ROAD_LIFT - SKIRT, a[2] as number], PALETTE.kerb, true);
      }
    }
  }

  /** A strip's segment `k` (none where it is not drawn): its bands, and each side's pavement on its kerb or its skirt. */
  segment(st: Strip, k: number): void {
    if (!st.drawn[k]) return;
    const colour = st.cls === 'dirt' ? ISLAND_COLORS.dirt : st.cls === 'taxiway' ? PALETTE.concrete : PALETTE.asphalt;
    const count = st.s.length, last = ACROSS.length - 1;
    // the bands as `heightOn` reads them
    for (let i = 0; i < last; i++) this.quad(stripPoint(st, k, i), stripPoint(st, k + 1, i), stripPoint(st, k + 1, i + 1), stripPoint(st, k, i + 1), colour);
    for (const [side, e0, e1] of [[1, stripPoint(st, k, 0), stripPoint(st, k + 1, 0)], [-1, stripPoint(st, k, last), stripPoint(st, k + 1, last)]] as const) {
      const w = side > 0 ? 0 : 1, bit = w === 0 ? 1 : 2;
      if (((st.walk[k] as number) & bit) === 0) {
        // the edge's skirt
        this.quad(e0, [e0[0] as number, (e0[1] as number) - SKIRT, e0[2] as number], [e1[0] as number, (e1[1] as number) - SKIRT, e1[2] as number], e1, colour);
        continue;
      }
      const outX0 = (st.x[k] as number) + (st.rx[k] as number) * side * (st.hw + PAVEMENT), outZ0 = (st.z[k] as number) + (st.rz[k] as number) * side * (st.hw + PAVEMENT);
      const outX1 = (st.x[k + 1] as number) + (st.rx[k + 1] as number) * side * (st.hw + PAVEMENT), outZ1 = (st.z[k + 1] as number) + (st.rz[k + 1] as number) * side * (st.hw + PAVEMENT);
      const g0 = st.out[2 * k + w] as number, g1 = st.out[2 * (k + 1) + w] as number;
      const top0 = [e0[0] as number, (e0[1] as number) + KERB, e0[2] as number], top1 = [e1[0] as number, (e1[1] as number) + KERB, e1[2] as number];
      const out0 = [outX0, g0 + ROAD_LIFT + KERB, outZ0], out1 = [outX1, g1 + ROAD_LIFT + KERB, outZ1];
      this.quad(top0, top1, out1, out0, ISLAND_COLORS.paving);
      this.quad(e0, e1, top1, top0, PALETTE.kerb, true);
      this.quad(out0, out1, [outX1, g1 - SKIRT, outZ1], [outX0, g0 - SKIRT, outZ0], PALETTE.kerb, true);
      // its end where it starts after a gap (the segment before it not drawn or with no pavement on this side), and
      // where it stops before one (the next not drawn), but where it goes on round a junction's corner
      const walked = k > 0 && st.drawn[k - 1] === true && ((st.walk[k - 1] as number) & bit) !== 0;
      if (!walked && ((st.joined[k] ?? 0) & bit) === 0) this.quad(e0, top0, out0, [outX0, g0 - SKIRT, outZ0], PALETTE.kerb, true);
      if ((k + 2 >= count || !st.drawn[k + 1]) && ((st.joined[k + 1] ?? 0) & bit) === 0) this.quad(e1, top1, out1, [outX1, g1 - SKIRT, outZ1], PALETTE.kerb, true);
    }
  }

  /** A paint quad on its strip at its heights, its corners given. */
  paint(p: Paint, v: ArrayLike<number>): void {
    this.quad([v[0] as number, v[1] as number, v[2] as number], [v[3] as number, v[4] as number, v[5] as number], [v[6] as number, v[7] as number, v[8] as number], [v[9] as number, v[10] as number, v[11] as number], p.colour, true);
  }

  /** The chunks' triangles, each its far level first. */
  done(): Map<number, SurfaceChunk> {
    for (const c of this.chunks.values()) c.far = c.colors.length;
    for (const [key, d] of this.details) {
      let c = this.chunks.get(key);
      if (!c) { c = { positions: [], colors: [], far: 0 }; this.chunks.set(key, c); }
      c.positions = c.positions.concat(d.positions);
      c.colors = c.colors.concat(d.colors);
    }
    return this.chunks;
  }
}
