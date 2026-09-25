/**
 * The island's ground (M8.10 slices 2–3, docs/M8.10_PLAN.md): its height at any point and what covers it. The plan's
 * hills; the main roads graded into them (each road's profile smoothed to its class's grade, the ends it shares with
 * another road at one height); the coast: a beach sloping into the sea down to its level, a steep edge (a quay, a
 * cliff, the rocks) keeping the land's height a physics cell out past its line and falling there under the water; the
 * shelf under the sea. What covers it: the carriageways, the paved places and the port's aprons, the quarry's dirt, the
 * beaches' sand, grass. Built once (the roads' profiles, a grid of the road and shore segments near each cell, the
 * land's mask); a read allocates nothing.
 */
import { SEA } from '../city/sea';
import { ASPHALT, DIRT, GRASS, SAND, type SurfaceKind } from '../city/surface';
import { catmullRom, circle, inPolygon, polylineLength, resample, signedArea, type P2 } from './geom';
import { BASIN, BOUNDS, COAST, COAST_PARTS, PLACES, RINGS, ROADS, causeway, highwayLoop, islet, naturalHeight, type PlanRoad, type RoadClass, type SpanKind } from './plan';
import { districtStreets } from './streets';

/** A road's half width by class (m), its carriageway without the pavement. */
export const HALF_WIDTH: Readonly<Record<RoadClass, number>> = { highway: 19, avenue: 12, street: 9, serpentine: 7, dirt: 5, taxiway: 12, ramp: 7, side: 8 };
/** The steepest a road's profile may run, by class (rise over run). */
export const MAX_GRADE: Readonly<Record<RoadClass, number>> = { highway: 0.06, avenue: 0.1, street: 0.16, serpentine: 0.12, dirt: 0.18, taxiway: 0.02, ramp: 0.08, side: 0.08 };
/** The ground flat with the road this far past its edge, then blended back to the hill over `BLEND` (m). */
export const SHOULDER = 2;
export const BLEND = 12;
/** A road's profile is sampled every `STEP` m and smoothed over ± `SMOOTH` samples. */
const STEP = 6;
const SMOOTH = 5;
/**
 * The coast (m): a steep edge keeps the land's height `LIP` out past its line (more than a physics cell, so the height
 * field's fall is beyond the wall behind the line) and stands in water to `FOOT` beyond it; the shelf falls to
 * `SEA_FLOOR` over `SHELF`; a beach rises from the sea's level over `BEACH` inland.
 */
const LIP = 2.4;
export const FOOT = -3;
const SEA_FLOOR = -4;
const SHELF = 40;
const BEACH = 20;
/** How far in from a quay the port's apron is paved (m). */
export const APRON = 14;
/** A road under an overpass runs this far below its deck (m: a lorry's clearance and the deck's depth). */
const UNDER = 7;
/** Under the tunnel the physics' ground is dug this far below its floor, this far each side of its line (m). */
const TRENCH_DEPTH = 3;
const TRENCH = 23;
/** How far a point's side of a steep edge is read, for the render's cut along it (m). */
export const COAST_REACH = 12;
/** The grid of segments near each cell (m), and the land's mask (m). */
const CELL = 32;
const MASK = 2;
/** At most this many roads count at one point. */
const NEAR = 8;

/** A road of the ground: its centreline and its profile's heights, one per point. */
export interface GradedRoad { id: string; cls: RoadClass; pts: P2[]; h: number[]; closed: boolean; deck?: boolean[] }

/** What a stretch of shore is: the plan's kinds; the basin's are quays, the causeway's rocks, the islet's a beach. */
export type CoastKind = 'cliff' | 'quay' | 'bay' | 'beach' | 'rocks' | 'spit';
export const COAST_KINDS: readonly CoastKind[] = ['cliff', 'quay', 'bay', 'beach', 'rocks', 'spit'];
const BEACH_KIND = COAST_KINDS.indexOf('beach');
const QUAY_KIND = COAST_KINDS.indexOf('quay');

/** A shore: its points, each segment's kind, and the side its land lies on (+1 left of the way it runs, −1 right). */
export interface CoastLine { pts: P2[]; closed: boolean; kinds: CoastKind[]; land: 1 | -1 }

/** What the render reads at a point beside its height (`Ground.probe`). */
export interface GroundProbe {
  h: number;
  /** The signed distance to the nearest steep edge (+ inland) within `COAST_REACH`; ± `COAST_REACH` beyond, by the mask. */
  steep: number;
  /** The kind of that edge (an index into `COAST_KINDS`), or -1 with none near. */
  steepKind: number;
  /** The distance past the nearest road's carriageway (negative on it); Infinity with no road near. */
  road: number;
  surface: SurfaceKind;
}

const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The basin's three quays as a polyline: from the shore in along one side, across its inner end, out along the other. */
export function basinQuays(): P2[] {
  const inner = Math.abs(BASIN.z0 - BASIN.shore) < Math.abs(BASIN.z1 - BASIN.shore) ? BASIN.z1 : BASIN.z0;
  return [[BASIN.x0, BASIN.shore], [BASIN.x0, inner], [BASIN.x1, inner], [BASIN.x1, BASIN.shore]];
}

/** The height of a road's profile at its closest point to (x, z), and that distance. */
function onRoad(road: GradedRoad, x: number, z: number): { d: number; h: number } {
  let bestD = Infinity, bestH = 0;
  const n = road.pts.length, last = road.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = road.pts[i] as P2, b = road.pts[(i + 1) % n] as P2;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < bestD) { bestD = d; bestH = (road.h[i] as number) + ((road.h[(i + 1) % n] as number) - (road.h[i] as number)) * t; }
  }
  return { d: bestD, h: bestH };
}

/**
 * A road's profile: the natural heights along it, smoothed, held to its class's grade; its pinned points (where it
 * meets a road already graded, or a crossing's flat) kept at their heights through both.
 */
function profile(pts: P2[], cls: RoadClass, closed: boolean, pins: ReadonlyMap<number, number>): number[] {
  const n = pts.length;
  const h = pts.map(([x, z]) => naturalHeight(x, z));
  const pin = (): void => { for (const [i, v] of pins) h[i] = v; };
  pin();
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    for (let i = 0; i < n; i++) {
      if (pins.has(i) || (!closed && (i === 0 || i === n - 1))) continue;
      let s = 0, c = 0;
      for (let k = -SMOOTH; k <= SMOOTH; k++) {
        let j = i + k;
        if (closed) j = ((j % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        s += src[j] as number;
        c++;
      }
      h[i] = s / c;
    }
    pin();
  }
  const span = (i: number, j: number): number => Math.hypot((pts[j] as P2)[0] - (pts[i] as P2)[0], (pts[j] as P2)[1] - (pts[i] as P2)[1]);
  // held to the grade both ways, a pinned point never moved (re-pinning after the limit left a step there); where two
  // pins are further apart in height than the class's grade allows between them, the least grade that joins them
  let g = MAX_GRADE[cls];
  const pinned = [...pins.keys()].sort((a, b) => a - b);
  for (let k = 0; k + 1 < pinned.length; k++) {
    const a = pinned[k] as number, b = pinned[k + 1] as number;
    if (b - a < 2) continue;
    let run = 0;
    for (let i = a; i < b; i++) run += span(i, i + 1);
    g = Math.max(g, Math.abs((pins.get(b) as number) - (pins.get(a) as number)) / (run || 1));
  }
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 1; i < n; i++) {
      if (pins.has(i)) continue;
      const lim = g * span(i - 1, i), p = h[i - 1] as number;
      h[i] = Math.max(p - lim, Math.min(p + lim, h[i] as number));
    }
    for (let i = n - 2; i >= 0; i--) {
      if (pins.has(i)) continue;
      const lim = g * span(i, i + 1), p = h[i + 1] as number;
      h[i] = Math.max(p - lim, Math.min(p + lim, h[i] as number));
    }
  }
  return h;
}

/** The plan's roads on the ground, in the order they are graded: the highway, the roundabouts, the avenues, the rest. */
function groundRoads(): Array<{ id: string; cls: RoadClass; pts: P2[]; closed: boolean; deck?: boolean[] }> {
  const order: RoadClass[] = ['highway', 'avenue', 'taxiway', 'ramp', 'street', 'serpentine', 'dirt', 'side'];
  const open = (r: PlanRoad): { id: string; cls: RoadClass; pts: P2[]; closed: boolean; deck?: boolean[] } => ({ id: r.id, cls: r.cls, closed: false, pts: r.smooth ? catmullRom(r.points, false, STEP) : resample(r.points, STEP) });
  const out = [...ROADS, ...districtStreets().roads].filter((r) => r.span === 'ground').map(open);
  // the highway's stretches between its tunnel and its decks, off its one smooth loop, each to the mouth or the
  // abutment it runs into; graded through its overpasses (the ground under those follows the road passing beneath)
  const loop = highwayLoop(STEP);
  let start = -1;
  for (let i = 0; i <= loop.pts.length; i++) {
    const carried = i < loop.pts.length && (loop.span[i] === 'ground' || loop.span[i] === 'overpass');
    if (carried && start < 0) start = i;
    if (!carried && start >= 0) {
      out.push({ id: `highway-${start}`, cls: 'highway', closed: false, pts: loop.pts.slice(start, i + 1), deck: loop.span.slice(start, i + 1).map((s) => s === 'overpass') });
      start = -1;
    }
  }
  for (const ring of RINGS) out.push({ id: ring.id, cls: ring.cls, closed: true, pts: circle(ring.x, ring.z, ring.r, Math.max(12, Math.round((2 * Math.PI * ring.r) / STEP))) });
  // rings before the avenues that end on them: a stable sort by class, the rings first within the avenues
  // the districts' streets after every main road (their crossings' heights are worked out between them)
  const district = (r: { id: string }): number => (DISTRICT_STREET.test(r.id) ? 1 : 0);
  return out.sort((a, b) => district(a) - district(b) || order.indexOf(a.cls) - order.indexOf(b.cls) || Number(b.closed) - Number(a.closed));
}

/**
 * The shores: the island's coast opened at the basin's mouth (its two ends on the basin's corners), the basin's quays,
 * the causeway's edges, the islet's beach. Each segment's kind from the plan's parts by its control span.
 */
function shores(): CoastLine[] {
  const spanOf: number[] = [];
  const ring = catmullRom(COAST, true, 6, spanOf);
  const kindOf = (span: number): CoastKind => {
    for (const p of COAST_PARTS) {
      const inside = p.from <= p.to ? span >= p.from && span <= p.to : span >= p.from || span <= p.to;
      if (inside) return p.kind;
    }
    return 'rocks';
  };
  const land = (poly: readonly P2[]): 1 | -1 => (signedArea(poly) > 0 ? 1 : -1);
  const inMouth = (p: P2): boolean => p[0] > BASIN.x0 && p[0] < BASIN.x1 && p[1] > BASIN.z0 && p[1] < BASIN.z1;
  // rotate the ring to start just past the mouth, then keep it up to the mouth
  const n = ring.length;
  let start = 0;
  for (let i = 0; i < n; i++) if (inMouth(ring[i] as P2) && !inMouth(ring[(i + 1) % n] as P2)) start = (i + 1) % n;
  const pts: P2[] = [], kinds: CoastKind[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (inMouth(ring[i] as P2)) break;
    pts.push(ring[i] as P2);
    kinds.push(kindOf(spanOf[i] ?? 0));
  }
  // the ends on the basin's corners, the nearer corner to each end
  const corners: P2[] = [[BASIN.x0, BASIN.shore], [BASIN.x1, BASIN.shore]];
  const nearer = (p: P2): P2 => (Math.hypot(p[0] - BASIN.x0, p[1] - BASIN.shore) < Math.hypot(p[0] - BASIN.x1, p[1] - BASIN.shore) ? corners[0] : corners[1]) as P2;
  const first = pts[0] as P2, last = pts[pts.length - 1] as P2;
  pts.unshift(nearer(first));
  kinds.unshift('quay');
  pts.push(nearer(last));
  // (a segment's kind is its start point's: the last point's kind is the closing corner's, unused)
  const quays = basinQuays();
  const mid = quays[1] as P2, next = quays[2] as P2;
  // the basin's land is away from its middle: the side of the inner end's segment opposite the basin's centre
  const cx = (BASIN.x0 + BASIN.x1) / 2, cz = (BASIN.z0 + BASIN.z1) / 2;
  const left = (next[0] - mid[0]) * (cz - mid[1]) - (next[1] - mid[1]) * (cx - mid[0]) > 0;
  return [
    { pts, closed: false, kinds, land: land(ring) },
    { pts: quays, closed: false, kinds: ['quay', 'quay', 'quay'], land: left ? -1 : 1 },
    { pts: causeway().slice(), closed: true, kinds: causeway().map(() => 'rocks' as const), land: land(causeway()) },
    { pts: islet().slice(), closed: true, kinds: islet().map(() => 'beach' as const), land: land(islet()) },
  ];
}

/**
 * How many samples each way a crossing's flat reaches (two, 12 m), fewer where the next crossing along the street is
 * nearer than two flats: the `q`-th of a street's crossings `on` (by their points' indices).
 */
export function plateau(on: ReadonlyArray<readonly [number, number]>, q: number): number {
  const i = (on[q] as readonly [number, number])[0];
  const before = q > 0 ? i - (on[q - 1] as readonly [number, number])[0] : Infinity;
  const after = q + 1 < on.length ? (on[q + 1] as readonly [number, number])[0] - i : Infinity;
  return Math.max(0, Math.min(2, Math.floor((Math.min(before, after) - 1) / 2)));
}

/** The highway's stretches of one span, each from the last point on the ground before it to the first after. */
function stretches(kind: SpanKind): Array<{ pts: P2[] }> {
  const loop = highwayLoop(STEP), n = loop.pts.length, out: Array<{ pts: P2[] }> = [];
  for (let i = 0; i < n; i++) {
    if (loop.span[i] !== kind || loop.span[(i - 1 + n) % n] === kind) continue;
    const pts: P2[] = [loop.pts[(i - 1 + n) % n] as P2];
    let k = i;
    while (loop.span[k % n] === kind && k < i + n) { pts.push(loop.pts[k % n] as P2); k++; }
    pts.push(loop.pts[k % n] as P2);
    out.push({ pts });
  }
  return out;
}

/** A district's street (streets.ts names them so). */
const DISTRICT_STREET = /^(crown|foundry|gardens|marina)-street-\d+$/;

/** The crossings on a street: each junction within 3 m of one of its points, as [the point's index, the junction's]. */
export function junctionsOn(pts: readonly P2[], junctions: readonly P2[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  junctions.forEach((j, k) => {
    let bi = -1, bd = 3;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - j[0], p[1] - j[1]); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) out.push([bi, k]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * The districts' crossings' heights: a main road's where one meets it (held there, and no flat: a T), else the
 * ground's there, eased until two crossings along a street differ by no more than its class's grade allows over the
 * block between their flats.
 */
function crossingHeights(streets: ReadonlyArray<{ cls: RoadClass; pts: P2[] }>, junctions: readonly P2[], graded: (p: P2) => number | null): { h: Float64Array; held: Uint8Array } {
  const h = new Float64Array(junctions.length), held = new Uint8Array(junctions.length);
  junctions.forEach((p, j) => { const v = graded(p); if (v !== null) { h[j] = v; held[j] = 1; } else h[j] = naturalHeight(p[0], p[1]); });
  const links: Array<[number, number, number]> = [];
  for (const r of streets) {
    const on = junctionsOn(r.pts, junctions);
    for (let k = 0; k + 1 < on.length; k++) {
      const [ia, ja] = on[k] as [number, number], [ib, jb] = on[k + 1] as [number, number];
      let d = 0;
      for (let i = ia; i < ib; i++) d += Math.hypot((r.pts[i + 1] as P2)[0] - (r.pts[i] as P2)[0], (r.pts[i + 1] as P2)[1] - (r.pts[i] as P2)[1]);
      const flats = (held[ja] === 1 ? 0 : 12) + (held[jb] === 1 ? 0 : 12);
      links.push([ja, jb, MAX_GRADE[r.cls] * Math.max(d - flats, d * 0.3)]);
    }
  }
  for (let pass = 0; pass < 60; pass++) {
    for (const [a, b, lim] of links) {
      if (held[b] === 0) h[b] = Math.max((h[a] as number) - lim, Math.min((h[a] as number) + lim, h[b] as number));
      if (held[a] === 0) h[a] = Math.max((h[b] as number) - lim, Math.min((h[b] as number) + lim, h[a] as number));
    }
  }
  return { h, held };
}

/** Fill a closed polygon into the mask by rows (the even-odd rule), with `value`. */
function fillPolygon(mask: Uint8Array, nx: number, nz: number, poly: readonly P2[], value: number): void {
  const xs: number[] = [];
  for (let j = 0; j < nz; j++) {
    const z = BOUNDS.z0 + (j + 0.5) * MASK;
    xs.length = 0;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[i] as P2, b = poly[k] as P2;
      if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(((xs[k] as number) - BOUNDS.x0) / MASK - 0.5));
      const i1 = Math.min(nx - 1, Math.floor(((xs[k + 1] as number) - BOUNDS.x0) / MASK - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * nx + i] = value;
    }
  }
}

interface Seg { a: P2; b: P2; ha: number; hb: number; hw: number; kind: number; reach: number; nx?: number; nz?: number; cap?: number }

/** A list of segments in typed arrays, and for each grid cell the segments within reach of it. */
class SegmentGrid {
  readonly ax: Float32Array; readonly az: Float32Array; readonly bx: Float32Array; readonly bz: Float32Array;
  readonly ha: Float32Array; readonly hb: Float32Array; readonly hw: Float32Array; readonly kind: Uint16Array;
  /** A shore segment's normal toward its land (0 for a road's). */
  readonly nx: Float32Array; readonly nz: Float32Array;
  /** A road segment whose road stops at a structure there reaches no further than its end: 1 before a, 2 past b. */
  readonly cap: Uint8Array;
  readonly start: Int32Array; readonly items: Int32Array;
  readonly cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL);
  readonly rows = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL);
  constructor(segs: readonly Seg[]) {
    const n = segs.length;
    this.ax = new Float32Array(n); this.az = new Float32Array(n); this.bx = new Float32Array(n); this.bz = new Float32Array(n);
    this.ha = new Float32Array(n); this.hb = new Float32Array(n); this.hw = new Float32Array(n); this.kind = new Uint16Array(n);
    this.nx = new Float32Array(n); this.nz = new Float32Array(n); this.cap = new Uint8Array(n);
    const lists: number[][] = Array.from({ length: this.cols * this.rows }, () => []);
    segs.forEach((s, k) => {
      this.ax[k] = s.a[0]; this.az[k] = s.a[1]; this.bx[k] = s.b[0]; this.bz[k] = s.b[1];
      this.ha[k] = s.ha; this.hb[k] = s.hb; this.hw[k] = s.hw; this.kind[k] = s.kind;
      this.nx[k] = s.nx ?? 0; this.nz[k] = s.nz ?? 0; this.cap[k] = s.cap ?? 0;
      const i0 = Math.max(0, Math.floor((Math.min(s.a[0], s.b[0]) - s.reach - BOUNDS.x0) / CELL));
      const i1 = Math.min(this.cols - 1, Math.floor((Math.max(s.a[0], s.b[0]) + s.reach - BOUNDS.x0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(s.a[1], s.b[1]) - s.reach - BOUNDS.z0) / CELL));
      const j1 = Math.min(this.rows - 1, Math.floor((Math.max(s.a[1], s.b[1]) + s.reach - BOUNDS.z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (lists[j * this.cols + i] as number[]).push(k);
    });
    this.start = new Int32Array(lists.length + 1);
    let total = 0;
    lists.forEach((l, c) => { this.start[c] = total; total += l.length; });
    this.start[lists.length] = total;
    this.items = new Int32Array(total);
    lists.forEach((l, c) => this.items.set(l, this.start[c]));
  }
  /** The cell's index, or -1 outside the grid. */
  cell(x: number, z: number): number {
    const i = Math.floor((x - BOUNDS.x0) / CELL), j = Math.floor((z - BOUNDS.z0) / CELL);
    return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i;
  }
}

export class Ground {
  /** The roads graded into the ground, in the order they were graded. */
  readonly roads: GradedRoad[] = [];
  /** The shores, for the island's wall and the coast's look. */
  readonly coasts: CoastLine[];
  private readonly roadGrid: SegmentGrid;
  private readonly coastGrid: SegmentGrid;
  /** Per road: 1 when it is paved (every class but dirt). */
  private readonly paved: Uint8Array;
  /** Per district crossing (`districtStreets().junctions`): 1 where it is on a main road (a T, no flat). */
  readonly crossingOnMain: Uint8Array;
  /** The tunnel's line from mouth to mouth, its floor's height at each point, and the box round its trench. */
  private tunnel: { pts: P2[]; floor: number[]; x0: number; x1: number; z0: number; z1: number } | null = null;
  /** Land (1) or water (0) every `MASK` m over the plan's bounds. */
  private readonly mask: Uint8Array;
  private readonly maskNx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / MASK);
  private readonly maskNz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / MASK);
  /** The shores near the point being read: the nearest's distance and kind, the nearest steep one's and its side, the nearest beach's and quay's distances. */
  private readonly shore = { d: Infinity, kind: 0, steep: Infinity, side: 1, steepKind: -1, beach: Infinity, quay: Infinity };
  /** The roads near the point being read (no allocation per read), and the nearest carriageway's edge. */
  private readonly near = { road: new Int32Array(NEAR), d: new Float64Array(NEAR), h: new Float64Array(NEAR), w: new Float64Array(NEAR) };
  private edge = Infinity;

  constructor() {
    // the land: the island less the basin, the causeway, the islet
    this.mask = new Uint8Array(this.maskNx * this.maskNz);
    fillPolygon(this.mask, this.maskNx, this.maskNz, catmullRom(COAST, true, 6), 1);
    fillPolygon(this.mask, this.maskNx, this.maskNz, causeway(), 1);
    fillPolygon(this.mask, this.maskNx, this.maskNz, islet(), 1);
    for (let j = 0; j < this.maskNz; j++) for (let i = 0; i < this.maskNx; i++) {
      const x = BOUNDS.x0 + (i + 0.5) * MASK, z = BOUNDS.z0 + (j + 0.5) * MASK;
      if (x > BASIN.x0 && x < BASIN.x1 && z > BASIN.z0 && z < BASIN.z1) this.mask[j * this.maskNx + i] = 0;
    }
    // the roads' profiles: the main roads first, each pinned where it meets one graded before it; then the districts'
    // streets, pinned at their crossings to heights worked out over the whole grid of them, so no block between two
    // crossings is steeper than its class allows, and each crossing flat across its box (a crest on Crown's hill)
    const graded = (p: P2): number | null => {
      let best: { d: number; h: number } | null = null;
      for (const other of this.roads) {
        const hit = onRoad(other, p[0], p[1]);
        if (hit.d < 3 && (!best || hit.d < best.d)) best = hit;
      }
      return best ? best.h : null;
    };
    const roads = groundRoads(), junctions = districtStreets().junctions;
    let crossings: { h: Float64Array; held: Uint8Array } | null = null;
    let overpasses: Array<{ x: number; z: number; deck: number }> | null = null;
    for (const r of roads) {
      const n = r.pts.length, pins = new Map<number, number>();
      if (!DISTRICT_STREET.test(r.id)) {
        if (!r.closed) for (const i of [0, n - 1]) { const v = graded(r.pts[i] as P2); if (v !== null) pins.set(i, v); }
        if (r.cls !== 'highway') {
          // a road passing under the highway dips beneath its overpass, level under the deck
          overpasses ??= stretches('overpass').map((s) => { const m = s.pts[Math.floor(s.pts.length / 2)] as P2; return { x: m[0], z: m[1], deck: this.highwayAt(m[0], m[1]) ?? naturalHeight(m[0], m[1]) }; });
          for (const o of overpasses) {
            let bi = -1, bd = 8;
            r.pts.forEach((p, i) => { const d = Math.hypot(p[0] - o.x, p[1] - o.z); if (d < bd) { bd = d; bi = i; } });
            if (bi >= 0) for (let k = bi - 2; k <= bi + 2; k++) if (k >= 0 && k < n) pins.set(k, o.deck - UNDER);
          }
        }
        this.roads.push({ id: r.id, cls: r.cls, pts: r.pts, h: profile(r.pts, r.cls, r.closed, pins), closed: r.closed, ...(r.deck ? { deck: r.deck } : {}) });
        continue;
      }
      crossings ??= crossingHeights(roads.filter((q) => DISTRICT_STREET.test(q.id)), junctions, graded);
      const c = crossings, on = junctionsOn(r.pts, junctions);
      on.forEach(([i, j], q) => {
        const m = c.held[j] === 1 ? 0 : plateau(on, q);
        for (let k = i - m; k <= i + m; k++) if (k >= 0 && k < n) pins.set(k, c.h[j] as number);
      });
      this.roads.push({ id: r.id, cls: r.cls, pts: r.pts, h: profile(r.pts, r.cls, r.closed, pins), closed: r.closed });
    }
    this.crossingOnMain = crossings?.held ?? new Uint8Array(junctions.length);
    // the tunnel: its floor straight between the ground at its mouths, a trench under it in the ground the physics reads
    const t = stretches('tunnel')[0];
    if (t) {
      const h0 = graded(t.pts[0] as P2) ?? 0, h1 = graded(t.pts[t.pts.length - 1] as P2) ?? 0;
      const s = [0];
      for (let i = 1; i < t.pts.length; i++) s.push((s[i - 1] as number) + Math.hypot((t.pts[i] as P2)[0] - (t.pts[i - 1] as P2)[0], (t.pts[i] as P2)[1] - (t.pts[i - 1] as P2)[1]));
      const total = s[s.length - 1] as number;
      const xs = t.pts.map((p) => p[0]), zs = t.pts.map((p) => p[1]);
      this.tunnel = { pts: t.pts, floor: s.map((d) => h0 + ((h1 - h0) * d) / total), x0: Math.min(...xs) - TRENCH, x1: Math.max(...xs) + TRENCH, z0: Math.min(...zs) - TRENCH, z1: Math.max(...zs) + TRENCH };
    }
    this.paved = Uint8Array.from(this.roads, (r) => (r.cls === 'dirt' ? 0 : 1));
    const segs: Seg[] = [];
    this.roads.forEach((road, r) => {
      const n = road.pts.length, last = road.closed ? n : n - 1, hw = HALF_WIDTH[road.cls];
      // a road segment's kind is its road's index: where two roads overlap, each road counts once, by its nearest segment
      // the highway's stretches on the ground stop at its structures: no reach past their ends
      const open = road.id.startsWith('highway-');
      const deck = road.deck;
      for (let i = 0; i < last; i++) {
        // over an overpass the highway is its deck's, not the ground's: it reaches no further than where it leaves the ground
        if (deck?.[i] === true && deck[i + 1] === true) continue;
        const cap = open ? (i === 0 || deck?.[i] === true ? 1 : 0) | (i === last - 1 || deck?.[i + 1] === true ? 2 : 0) : 0;
        segs.push({ a: road.pts[i] as P2, b: road.pts[(i + 1) % n] as P2, ha: road.h[i] as number, hb: road.h[(i + 1) % n] as number, hw, kind: r, reach: hw + SHOULDER + BLEND, cap });
      }
    });
    this.roadGrid = new SegmentGrid(segs);
    // the shores' segments by kind, each with its normal toward the land
    this.coasts = shores();
    const coastSegs: Seg[] = [];
    for (const line of this.coasts) {
      const n = line.pts.length, last = line.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = line.pts[i] as P2, b = line.pts[(i + 1) % n] as P2, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        coastSegs.push({ a, b, ha: 0, hb: 0, hw: 0, kind: COAST_KINDS.indexOf(line.kinds[i] ?? 'rocks'), reach: SHELF, nx: (-(b[1] - a[1]) / l) * line.land, nz: ((b[0] - a[0]) / l) * line.land });
      }
    }
    this.coastGrid = new SegmentGrid(coastSegs);
  }

  /** Land or water, by the mask (2 m). */
  onLand(x: number, z: number): boolean {
    const i = Math.floor((x - BOUNDS.x0) / MASK), j = Math.floor((z - BOUNDS.z0) / MASK);
    return i >= 0 && j >= 0 && i < this.maskNx && j < this.maskNz && this.mask[j * this.maskNx + i] === 1;
  }

  /** The shores within the shelf's reach of (x, z), into `shore`. */
  private nearestShore(x: number, z: number): void {
    const sh = this.shore, g = this.coastGrid, c = g.cell(x, z);
    sh.d = sh.steep = sh.beach = sh.quay = Infinity;
    sh.kind = 0;
    sh.side = 1;
    sh.steepKind = -1;
    if (c < 0) return;
    for (let k = g.start[c] as number, end = g.start[c + 1] as number; k < end; k++) {
      const s = g.items[k] as number;
      const ax = g.ax[s] as number, az = g.az[s] as number, dx = (g.bx[s] as number) - ax, dz = (g.bz[s] as number) - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      const kind = g.kind[s] as number;
      if (d < sh.d) { sh.d = d; sh.kind = kind; }
      if (kind === BEACH_KIND) {
        if (d < sh.beach) sh.beach = d;
        continue;
      }
      if (d < sh.steep) {
        sh.steep = d;
        sh.steepKind = kind;
        // which side of the segment's line: toward its land or the sea (the two segments meeting at a corner agree there)
        sh.side = (x - ax) * (g.nx[s] as number) + (z - az) * (g.nz[s] as number) >= 0 ? 1 : -1;
      }
      if (kind === QUAY_KIND && d < sh.quay) sh.quay = d;
    }
  }

  /** The highway's own graded height at (x, z) (on one of its stretches on the ground, within 4 m), or null. */
  highwayAt(x: number, z: number): number | null {
    let best: { d: number; h: number } | null = null;
    for (const r of this.roads) {
      if (r.cls !== 'highway') continue;
      const hit = onRoad(r, x, z);
      if (hit.d < 4 && (!best || hit.d < best.d)) best = hit;
    }
    return best ? best.h : null;
  }

  /** The ground's height at (x, z), m over the sea, as the physics has it: dug out under the tunnel. */
  height(x: number, z: number): number {
    const h = this.surfaceHeight(x, z), t = this.tunnel;
    if (!t || x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) return h;
    // the nearest point of the tunnel's line, between its mouths only
    let best = TRENCH, floor = 0;
    for (let i = 0; i + 1 < t.pts.length; i++) {
      const a = t.pts[i] as P2, b = t.pts[i + 1] as P2, dx = b[0] - a[0], dz = b[1] - a[1];
      const u = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
      if ((i === 0 && u < 0) || (i === t.pts.length - 2 && u > 1)) continue;
      const c = Math.max(0, Math.min(1, u)), d = Math.hypot(x - a[0] - dx * c, z - a[1] - dz * c);
      if (d < best) { best = d; floor = (t.floor[i] as number) + ((t.floor[i + 1] as number) - (t.floor[i] as number)) * c; }
    }
    return best < TRENCH ? Math.min(h, floor - TRENCH_DEPTH) : h;
  }

  /** The ground's surface at (x, z), m over the sea: the hill whole over the tunnel (what is drawn, and its lid). */
  surfaceHeight(x: number, z: number): number {
    this.nearestShore(x, z);
    const sh = this.shore;
    let h: number;
    if (this.onLand(x, z)) {
      h = naturalHeight(x, z);
      if (sh.beach < BEACH) h = SEA.level + (h - SEA.level) * smooth01(sh.beach / BEACH);
    } else if (sh.steep < LIP && sh.steep <= sh.beach) {
      // past a steep edge's line the land's height holds over a physics cell: the fall is beyond the wall
      h = naturalHeight(x, z);
    } else if (sh.d < SHELF) {
      const top = sh.kind === BEACH_KIND ? SEA.level : FOOT;
      h = top + (SEA_FLOOR - top) * smooth01(sh.d / SHELF);
    } else h = SEA_FLOOR;
    this.edge = Infinity;
    const g = this.roadGrid, c = g.cell(x, z);
    if (c < 0) return h;
    // each road near the point by its nearest segment: its distance, its profile's height there, its weight
    const near = this.near;
    let count = 0;
    for (let k = g.start[c] as number, end = g.start[c + 1] as number; k < end; k++) {
      const s = g.items[k] as number;
      const ax = g.ax[s] as number, az = g.az[s] as number, dx = (g.bx[s] as number) - ax, dz = (g.bz[s] as number) - az;
      const u = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), cap = g.cap[s] as number;
      if ((u < 0 && (cap & 1) !== 0) || (u > 1 && (cap & 2) !== 0)) continue;
      const t = Math.max(0, Math.min(1, u));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      const reach = (g.hw[s] as number) + SHOULDER;
      if (d - (g.hw[s] as number) < this.edge) this.edge = d - (g.hw[s] as number);
      if (d >= reach + BLEND) continue;
      const road = g.kind[s] as number;
      let slot = 0;
      while (slot < count && near.road[slot] !== road) slot++;
      if (slot === count) {
        if (count === NEAR) continue;
        near.road[slot] = road; near.d[slot] = Infinity; count++;
      }
      if (d < (near.d[slot] as number)) {
        near.d[slot] = d;
        near.h[slot] = (g.ha[s] as number) + ((g.hb[s] as number) - (g.ha[s] as number)) * t;
        near.w[slot] = d <= reach ? 1 : 1 - smooth01((d - reach) / BLEND);
      }
    }
    if (count === 0) return h;
    // the roads' heights blended by weight and nearness (no step where two roads' surfaces meet), then the hill's
    let sum = 0, weight = 0, most = 0;
    for (let i = 0; i < count; i++) {
      const w = near.w[i] as number, k = w / ((near.d[i] as number) + 2);
      sum += k * (near.h[i] as number);
      weight += k;
      most = Math.max(most, w);
    }
    return weight > 0 ? h + (sum / weight - h) * most : h;
  }

  /** The height and what the render reads at (x, z): the steep edge's side and distance, the carriageway's, the surface. */
  probe(x: number, z: number, out: GroundProbe): GroundProbe {
    out.h = this.surfaceHeight(x, z);
    const sh = this.shore;
    out.steep = sh.steep < COAST_REACH ? sh.side * sh.steep : this.onLand(x, z) ? COAST_REACH : -COAST_REACH;
    out.steepKind = sh.steep < COAST_REACH ? sh.steepKind : -1;
    out.road = this.edge;
    out.surface = this.surface(x, z);
    return out;
  }

  /**
   * What covers the ground at (x, z), for the wheels: a carriageway (paving wins where a dirt track meets a paved road),
   * the paved places and the port's aprons, the quarry's dirt, the beaches' and the islet's sand, else grass; the sea's
   * floor is sand.
   */
  surface(x: number, z: number): SurfaceKind {
    const g = this.roadGrid, c = g.cell(x, z);
    let dirt = false;
    if (c >= 0) {
      for (let k = g.start[c] as number, end = g.start[c + 1] as number; k < end; k++) {
        const s = g.items[k] as number;
        const ax = g.ax[s] as number, az = g.az[s] as number, dx = (g.bx[s] as number) - ax, dz = (g.bz[s] as number) - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) > (g.hw[s] as number)) continue;
        if (this.paved[g.kind[s] as number] === 1) return ASPHALT;
        dirt = true;
      }
    }
    if (dirt) return DIRT;
    if (!this.onLand(x, z)) return SAND;
    if (inPolygon(x, z, PLACES.quarry)) return DIRT;
    if (paved(x, z)) return ASPHALT;
    this.nearestShore(x, z);
    if (this.shore.quay < APRON) return ASPHALT;
    if (this.shore.beach < BEACH || onBeach(x, z) || inPolygon(x, z, islet())) return SAND;
    return GRASS;
  }

  /** The nearest point on a graded road to (x, z): where it is, its height and heading. */
  nearestRoad(x: number, z: number, out: { x: number; y: number; z: number; yaw: number }): number {
    let best = Infinity;
    for (const road of this.roads) {
      const n = road.pts.length, last = road.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = road.pts[i] as P2, b = road.pts[(i + 1) % n] as P2;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < best) {
          best = d;
          out.x = px; out.z = pz; out.yaw = Math.atan2(dx, dz);
          out.y = (road.h[i] as number) + ((road.h[(i + 1) % n] as number) - (road.h[i] as number)) * t;
        }
      }
    }
    return best;
  }

  /** The length of every graded road (m), for the pins. */
  length(id: string): number {
    const r = this.roads.find((q) => q.id === id);
    return r ? polylineLength(r.pts) : 0;
  }
}

/** The paved places: the yards, the runway and the hangars' aprons, the lots, the summit's plaza. */
function paved(x: number, z: number): boolean {
  const inRect = (r: { x0: number; z0: number; x1: number; z1: number }): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  if (Math.hypot(x - PLACES.summitPlaza.x, z - PLACES.summitPlaza.z) < PLACES.summitPlaza.r) return true;
  if (inRect(PLACES.runway) || inRect(PLACES.railYard) || inRect(PLACES.carPark) || inRect(PLACES.headquarters) || inRect(PLACES.donutShop)) return true;
  for (const r of PLACES.containerYards) if (inRect(r)) return true;
  for (const r of PLACES.hangars) if (inRect(r)) return true;
  return false;
}

/** On a beach's sand: within half its width of one of the plan's beaches. */
function onBeach(x: number, z: number): boolean {
  for (const b of PLACES.beaches) {
    const half = b.width / 2;
    for (let i = 0; i + 1 < b.points.length; i++) {
      const a = b.points[i] as P2, c = b.points[i + 1] as P2, dx = c[0] - a[0], dz = c[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < half) return true;
    }
  }
  return false;
}
