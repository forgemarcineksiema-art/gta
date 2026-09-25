/**
 * The island's ground (M8.10 slice 2, docs/M8.10_PLAN.md): its height at any point. The plan's hills; the main roads
 * graded into them (each road's profile smoothed to its class's grade, the ends it shares with another road at one
 * height); a beach's slope into the water; the shelf under the sea. Built once (the roads' profiles, a grid of the road
 * and coast segments near each cell, the land's mask); a read allocates nothing.
 */
import { catmullRom, circle, polylineLength, resample, type P2 } from './geom';
import { BASIN, BOUNDS, COAST, COAST_PARTS, HIGHWAY, RINGS, ROADS, causeway, islet, naturalHeight, type PlanRoad, type RoadClass } from './plan';

/** A road's half width by class (m), its carriageway without the pavement. */
export const HALF_WIDTH: Readonly<Record<RoadClass, number>> = { highway: 19, avenue: 12, street: 9, serpentine: 7, dirt: 5, taxiway: 12, ramp: 7 };
/** The steepest a road's profile may run, by class (rise over run). */
export const MAX_GRADE: Readonly<Record<RoadClass, number>> = { highway: 0.06, avenue: 0.1, street: 0.16, serpentine: 0.12, dirt: 0.18, taxiway: 0.02, ramp: 0.08 };
/** The ground flat with the road this far past its edge, then blended back to the hill over `BLEND` (m). */
const SHOULDER = 2;
const BLEND = 12;
/** A road's profile is sampled every `STEP` m and smoothed over ± `SMOOTH` samples. */
const STEP = 6;
const SMOOTH = 5;
/** The water's edge, the sea floor, how far out the shelf falls to it, how far in a beach rises from it (m). */
export const WATERLINE = 0.3;
const SEA_FLOOR = -4;
const SHELF = 40;
const BEACH = 20;
/** The grid of segments near each cell (m), and the land's mask (m). */
const CELL = 32;
const MASK = 2;
/** At most this many roads count at one point. */
const NEAR = 8;

/** A road of the ground: its centreline and its profile's heights, one per point. */
export interface GradedRoad { id: string; cls: RoadClass; pts: P2[]; h: number[]; closed: boolean }

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
 * A road's profile: the natural heights along it, smoothed, held to its class's grade, its ends pinned where it meets
 * a road already graded (a T or a shared end).
 */
function profile(pts: P2[], cls: RoadClass, closed: boolean, start: number | null, end: number | null): number[] {
  const n = pts.length;
  const h = pts.map(([x, z]) => naturalHeight(x, z));
  const pin = (): void => {
    if (closed) return;
    if (start !== null) h[0] = start;
    if (end !== null) h[n - 1] = end;
  };
  pin();
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
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
  const g = MAX_GRADE[cls];
  const span = (i: number, j: number): number => Math.hypot((pts[j] as P2)[0] - (pts[i] as P2)[0], (pts[j] as P2)[1] - (pts[i] as P2)[1]);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) { const lim = g * span(i - 1, i), p = h[i - 1] as number; h[i] = Math.max(p - lim, Math.min(p + lim, h[i] as number)); }
    for (let i = n - 2; i >= 0; i--) { const lim = g * span(i, i + 1), p = h[i + 1] as number; h[i] = Math.max(p - lim, Math.min(p + lim, h[i] as number)); }
    pin();
  }
  return h;
}

/** The plan's roads on the ground, in the order they are graded: the highway, the roundabouts, the avenues, the rest. */
function groundRoads(): Array<{ id: string; cls: RoadClass; pts: P2[]; closed: boolean }> {
  const order: RoadClass[] = ['highway', 'avenue', 'taxiway', 'ramp', 'street', 'serpentine', 'dirt'];
  const open = (r: PlanRoad): { id: string; cls: RoadClass; pts: P2[]; closed: boolean } => ({ id: r.id, cls: r.cls, closed: false, pts: r.smooth ? catmullRom(r.points, false, STEP) : resample(r.points, STEP) });
  const out = [...HIGHWAY, ...ROADS].filter((r) => r.span === 'ground').map(open);
  for (const ring of RINGS) out.push({ id: ring.id, cls: ring.cls, closed: true, pts: circle(ring.x, ring.z, ring.r, Math.max(12, Math.round((2 * Math.PI * ring.r) / STEP))) });
  // rings before the avenues that end on them: a stable sort by class, the rings first within the avenues
  return out.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || Number(b.closed) - Number(a.closed));
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

/** A list of segments in typed arrays, and for each grid cell the segments within reach of it. */
class SegmentGrid {
  readonly ax: Float32Array; readonly az: Float32Array; readonly bx: Float32Array; readonly bz: Float32Array;
  readonly ha: Float32Array; readonly hb: Float32Array; readonly hw: Float32Array; readonly kind: Uint16Array;
  readonly start: Int32Array; readonly items: Int32Array;
  readonly nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL);
  readonly nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL);
  constructor(segs: ReadonlyArray<{ a: P2; b: P2; ha: number; hb: number; hw: number; kind: number; reach: number }>) {
    const n = segs.length;
    this.ax = new Float32Array(n); this.az = new Float32Array(n); this.bx = new Float32Array(n); this.bz = new Float32Array(n);
    this.ha = new Float32Array(n); this.hb = new Float32Array(n); this.hw = new Float32Array(n); this.kind = new Uint16Array(n);
    const lists: number[][] = Array.from({ length: this.nx * this.nz }, () => []);
    segs.forEach((s, k) => {
      this.ax[k] = s.a[0]; this.az[k] = s.a[1]; this.bx[k] = s.b[0]; this.bz[k] = s.b[1];
      this.ha[k] = s.ha; this.hb[k] = s.hb; this.hw[k] = s.hw; this.kind[k] = s.kind;
      const i0 = Math.max(0, Math.floor((Math.min(s.a[0], s.b[0]) - s.reach - BOUNDS.x0) / CELL));
      const i1 = Math.min(this.nx - 1, Math.floor((Math.max(s.a[0], s.b[0]) + s.reach - BOUNDS.x0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(s.a[1], s.b[1]) - s.reach - BOUNDS.z0) / CELL));
      const j1 = Math.min(this.nz - 1, Math.floor((Math.max(s.a[1], s.b[1]) + s.reach - BOUNDS.z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (lists[j * this.nx + i] as number[]).push(k);
    });
    this.start = new Int32Array(lists.length + 1);
    let total = 0;
    lists.forEach((l, c) => { this.start[c] = total; total += l.length; });
    this.start[lists.length] = total;
    this.items = new Int32Array(total);
    lists.forEach((l, c) => this.items.set(l, this.start[c]));
  }
  /** The cell's first and past-last item, or [0, 0] outside the grid. */
  cell(x: number, z: number): number {
    const i = Math.floor((x - BOUNDS.x0) / CELL), j = Math.floor((z - BOUNDS.z0) / CELL);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }
}

/** Coast segments' kinds: a steep edge (a quay, a cliff, rocks, the spit) or a gentle one (a beach, the bay's beach). */
const STEEP = 0;
const GENTLE = 1;

export class Ground {
  /** The roads graded into the ground, in the order they were graded. */
  readonly roads: GradedRoad[] = [];
  private readonly roadGrid: SegmentGrid;
  private readonly coastGrid: SegmentGrid;
  /** Land (1) or water (0) every `MASK` m over the plan's bounds. */
  private readonly mask: Uint8Array;
  private readonly maskNx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / MASK);
  private readonly maskNz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / MASK);

  constructor() {
    // the land: the island less the basin, the causeway, the islet
    this.mask = new Uint8Array(this.maskNx * this.maskNz);
    const coast = catmullRom(COAST, true, 6);
    fillPolygon(this.mask, this.maskNx, this.maskNz, coast, 1);
    fillPolygon(this.mask, this.maskNx, this.maskNz, causeway(), 1);
    fillPolygon(this.mask, this.maskNx, this.maskNz, islet(), 1);
    for (let j = 0; j < this.maskNz; j++) for (let i = 0; i < this.maskNx; i++) {
      const x = BOUNDS.x0 + (i + 0.5) * MASK, z = BOUNDS.z0 + (j + 0.5) * MASK;
      if (x > BASIN.x0 && x < BASIN.x1 && z > BASIN.z0 && z < BASIN.z1) this.mask[j * this.maskNx + i] = 0;
    }
    // the roads' profiles, each end pinned to a road graded before it that it meets
    for (const r of groundRoads()) {
      const endHeight = (p: P2): number | null => {
        let best: { d: number; h: number } | null = null;
        for (const other of this.roads) {
          const hit = onRoad(other, p[0], p[1]);
          if (hit.d < 3 && (!best || hit.d < best.d)) best = hit;
        }
        return best ? best.h : null;
      };
      const first = r.pts[0] as P2, last = r.pts[r.pts.length - 1] as P2;
      const h = profile(r.pts, r.cls, r.closed, r.closed ? null : endHeight(first), r.closed ? null : endHeight(last));
      this.roads.push({ id: r.id, cls: r.cls, pts: r.pts, h, closed: r.closed });
    }
    const segs: Array<{ a: P2; b: P2; ha: number; hb: number; hw: number; kind: number; reach: number }> = [];
    this.roads.forEach((road, r) => {
      const n = road.pts.length, last = road.closed ? n : n - 1, hw = HALF_WIDTH[road.cls];
      // a road segment's kind is its road's index: where two roads overlap, each road counts once, by its nearest segment
      for (let i = 0; i < last; i++) segs.push({ a: road.pts[i] as P2, b: road.pts[(i + 1) % n] as P2, ha: road.h[i] as number, hb: road.h[(i + 1) % n] as number, hw, kind: r, reach: hw + SHOULDER + BLEND });
    });
    this.roadGrid = new SegmentGrid(segs);
    // the coast's segments by kind: the island's by its parts, the causeway's steep, the islet's gentle
    const coastSegs: Array<{ a: P2; b: P2; ha: number; hb: number; hw: number; kind: number; reach: number }> = [];
    const spanKind = (span: number): number => {
      for (const p of COAST_PARTS) {
        const inside = p.from <= p.to ? span >= p.from && span <= p.to : span >= p.from || span <= p.to;
        if (inside) return p.kind === 'beach' ? GENTLE : STEEP;
      }
      return STEEP;
    };
    let span = 0, acc = 0;
    const spans: number[] = [];
    for (let i = 0; i < COAST.length; i++) {
      const a = COAST[i] as P2, b = COAST[(i + 1) % COAST.length] as P2;
      const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
      for (let k = 0; k < steps; k++) spans.push(i);
    }
    for (let i = 0; i < coast.length; i++) {
      span = spans[i] ?? span;
      coastSegs.push({ a: coast[i] as P2, b: coast[(i + 1) % coast.length] as P2, ha: 0, hb: 0, hw: 0, kind: spanKind(span), reach: SHELF });
      acc++;
    }
    const ring = (poly: readonly P2[], kind: number): void => {
      for (let i = 0; i < poly.length; i++) coastSegs.push({ a: poly[i] as P2, b: poly[(i + 1) % poly.length] as P2, ha: 0, hb: 0, hw: 0, kind, reach: SHELF });
    };
    ring(causeway(), STEEP);
    ring(islet(), GENTLE);
    ring(basinQuays(), STEEP);
    this.coastGrid = new SegmentGrid(coastSegs);
    void acc;
  }

  /** Land or water, by the mask (2 m). */
  onLand(x: number, z: number): boolean {
    const i = Math.floor((x - BOUNDS.x0) / MASK), j = Math.floor((z - BOUNDS.z0) / MASK);
    return i >= 0 && j >= 0 && i < this.maskNx && j < this.maskNz && this.mask[j * this.maskNx + i] === 1;
  }

  /** The distance to the nearest coast segment within `reach` (any kind, or gentle only), else Infinity. */
  private coastDistance(x: number, z: number, reach: number, gentleOnly: boolean): number {
    const g = this.coastGrid, c = g.cell(x, z);
    if (c < 0) return Infinity;
    let best = reach;
    for (let k = g.start[c] as number, end = g.start[c + 1] as number; k < end; k++) {
      const s = g.items[k] as number;
      if (gentleOnly && g.kind[s] !== GENTLE) continue;
      const ax = g.ax[s] as number, az = g.az[s] as number, dx = (g.bx[s] as number) - ax, dz = (g.bz[s] as number) - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    }
    return best < reach ? best : Infinity;
  }

  /** The ground's height at (x, z), m over the sea. */
  height(x: number, z: number): number {
    let h: number;
    if (this.onLand(x, z)) {
      h = naturalHeight(x, z);
      const d = this.coastDistance(x, z, BEACH, true);
      if (d < BEACH) h = WATERLINE + (h - WATERLINE) * smooth01(d / BEACH);
    } else {
      const d = this.coastDistance(x, z, SHELF, false);
      h = d < SHELF ? SEA_FLOOR + (WATERLINE - SEA_FLOOR) * (1 - smooth01(d / SHELF)) : SEA_FLOOR;
    }
    const g = this.roadGrid, c = g.cell(x, z);
    if (c < 0) return h;
    // each road near the point by its nearest segment: its distance, its profile's height there, its weight
    const near = this.near;
    let count = 0;
    for (let k = g.start[c] as number, end = g.start[c + 1] as number; k < end; k++) {
      const s = g.items[k] as number;
      const ax = g.ax[s] as number, az = g.az[s] as number, dx = (g.bx[s] as number) - ax, dz = (g.bz[s] as number) - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      const reach = (g.hw[s] as number) + SHOULDER;
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

  /** The roads near the point being read (no allocation per read). */
  private readonly near = { road: new Int32Array(NEAR), d: new Float64Array(NEAR), h: new Float64Array(NEAR), w: new Float64Array(NEAR) };

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
