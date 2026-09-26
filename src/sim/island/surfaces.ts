/**
 * The roads' surfaces (M8.10 slice 6b, docs/M8.10_PLAN.md): each road's strip a hair over the ground, broken at every
 * junction where one polygon from its arms' edges takes over; the pavements on their 14 cm kerbs along the town's
 * roads, stopping at the crossings' corners (and the kerbs' pieces the wheels climb); the paint: the centre and lane
 * lines, the edge lines, the stop lines, the zebra crossings, the arrows, the parking bays. Worked out once
 * (`roadSurfaces`: all the ground it reads kept in the data, so the island's bake keeps them), the render's triangles a
 * chunk made from that (`surfaceMeshes`); no Three.js.
 */
import { PARKING, PARKING_STYLE, type ParkingBay } from '../city/markings';
import type { FootwayRun } from '../city/props';
import type { RoadGraph } from '../city/roads';
import { ISLAND_COLORS, PALETTE } from '../palette';
import type { P2 } from './geom';
import { HALF_WIDTH, type Ground } from './ground';
import { districtOf, type RoadClass } from './plan';
import type { Piece } from './structures';

/** The strips over the ground, the paint over the strips (m): under the physics' ground's own error, over the mesh's. */
export const ROAD_LIFT = 0.04;
export const PAINT_LIFT = 0.012;
/** A pavement's kerb over the road and its width (m). */
export const KERB = 0.14;
export const PAVEMENT = 3;
/** A strip's edge hangs this far under it where no pavement stands (m). */
const SKIRT = 0.5;
/** A strip's span is halved where the ground at its middle is further than this from the span's straight line (m). */
const BEND = 0.01;
/** A pavement stops this far past the carriageway of a road crossing it: the corner (m). */
const CORNER = 6;
/** A junction's box reaches this far past the widest other road's half width along each road through it (m). */
const BOX_PAD = 2;
/** A node is on a road within this of its centreline (m: the network merges ends within 8). */
const ON_ROAD = 6;
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
}
/** A junction's rim point: where it is and, on an arm, its road's strip, station and offset. */
export interface RimPoint { x: number; y: number; z: number; strip: number; s: number; o: number }
/**
 * A junction: its middle, its rim, and per rim point its fan's points on the ground: the spoke's middle to it, to the
 * next, the chord's middle between them (x, y, z each).
 */
export interface Junction { x: number; y: number; z: number; rim: RimPoint[]; fan: number[] }
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

/** The roads' surfaces on the island's ground and network; `chunkOf` names a point's chunk; no bay where `noBay` says. */
export function roadSurfaces(ground: Ground, graph: RoadGraph, chunkOf: (x: number, z: number) => number, noBay: (x: number, z: number) => boolean = () => false): RoadSurfaces {
  const kerbs = new Map<number, Piece[]>();

  // the strips' sections, on the ground's surface: one at each of the road's points, and between two where the ground
  // bends away from the straight line between them (a crest, a dip, a junction's edge) by more than `BEND`
  const strips: Strip[] = ground.roads.map((road, index) => {
    const hw = HALF_WIDTH[road.cls], n = road.pts.length, count = road.closed ? n + 1 : n;
    const st: Strip = { road: index, id: road.id, cls: road.cls, hw, closed: road.closed, x: [], z: [], rx: [], rz: [], h: [], s: [], drawn: [], walk: [], out: [] };
    const section = (x: number, z: number, rx: number, rz: number): number[] => ACROSS.map((f) => ground.surfaceHeight(x + rx * hw * f, z + rz * hw * f) + ROAD_LIFT);
    const push = (x: number, z: number, rx: number, rz: number, h: number[], drawn: boolean): void => {
      const k = st.x.length;
      if (k > 0) {
        st.s.push((st.s[k - 1] as number) + Math.hypot(x - (st.x[k - 1] as number), z - (st.z[k - 1] as number)));
        st.drawn.push(drawn);
      } else st.s.push(0);
      st.x.push(x); st.z.push(z); st.rx.push(rx); st.rz.push(rz); st.h.push(h);
    };
    const frame = (k: number): { x: number; z: number; rx: number; rz: number } => {
      const i = k % n, p = road.pts[i] as P2;
      const prev = road.pts[road.closed ? (i - 1 + n) % n : Math.max(0, i - 1)] as P2, next = road.pts[road.closed ? (i + 1) % n : Math.min(n - 1, i + 1)] as P2;
      const tx = next[0] - prev[0], tz = next[1] - prev[1], l = Math.hypot(tx, tz) || 1;
      // a car's right facing +Z is −X: the right of (tx, tz) is (−tz, tx)
      return { x: p[0], z: p[1], rx: -tz / l, rz: tx / l };
    };
    // the sections from `a` (its heights `ha`) to `b` (`hb`), halving the span where the ground bends, twice at most
    const between = (a: { x: number; z: number; rx: number; rz: number }, ha: number[], b: { x: number; z: number; rx: number; rz: number }, hb: number[], drawn: boolean, depth: number): void => {
      if (depth < 2) {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nl = Math.hypot(a.rx + b.rx, a.rz + b.rz) || 1;
        const m = { x: mx, z: mz, rx: (a.rx + b.rx) / nl, rz: (a.rz + b.rz) / nl }, hm = section(mx, mz, m.rx, m.rz);
        if (hm.some((h, i) => Math.abs(h - ((ha[i] as number) + (hb[i] as number)) / 2) > BEND)) {
          between(a, ha, m, hm, drawn, depth + 1);
          push(m.x, m.z, m.rx, m.rz, hm, drawn);
          between(m, hm, b, hb, drawn, depth + 1);
          return;
        }
      }
    };
    let a = frame(0), ha = section(a.x, a.z, a.rx, a.rz);
    push(a.x, a.z, a.rx, a.rz, ha, true);
    for (let k = 1; k < count; k++) {
      const b = frame(k), hb = section(b.x, b.z, b.rx, b.rz);
      // over an overpass the deck draws the road, from the last point on the ground
      const drawn = !(road.deck?.[(k - 1) % n] === true || road.deck?.[k % n] === true);
      between(a, ha, b, hb, drawn, 0);
      push(b.x, b.z, b.rx, b.rz, hb, drawn);
      a = b;
      ha = hb;
    }
    return st;
  });

  // the nodes on each road, and each junction's box along each road through it
  interface OnRoad { strip: number; s: number; box: number; lo: number; hi: number }
  const project = (st: Strip, x: number, z: number): { d: number; s: number } => {
    let bd = Infinity, bs = 0;
    for (let k = 0; k + 1 < st.x.length; k++) {
      const ax = st.x[k] as number, az = st.z[k] as number, dx = (st.x[k + 1] as number) - ax, dz = (st.z[k + 1] as number) - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < bd) { bd = d; bs = (st.s[k] as number) + t * ((st.s[k + 1] as number) - (st.s[k] as number)); }
    }
    return { d: bd, s: bs };
  };
  const junctions: Junction[] = [];
  const at: Array<{ node: number; on: OnRoad[] }> = [];
  for (const node of graph.nodes) {
    const on: OnRoad[] = [];
    strips.forEach((st, i) => {
      if (st.cls === 'highway' && st.drawn.every((d) => !d)) return;
      const hit = project(st, node.x, node.z);
      if (hit.d < ON_ROAD) on.push({ strip: i, s: hit.s, box: 0, lo: -1, hi: -1 });
    });
    if (on.length < 2) continue;
    for (const o of on) {
      const others = on.filter((q) => q !== o).map((q) => (strips[q.strip] as Strip).hw);
      o.box = Math.max(...others) + BOX_PAD;
    }
    at.push({ node: node.id, on });
  }
  // a box's sections are not drawn; its arms are the sections just outside it
  for (const { on } of at) for (const o of on) {
    const st = strips[o.strip] as Strip, total = st.s[st.s.length - 1] as number;
    const gap = (s: number): number => { const d = Math.abs(s - o.s); return st.closed ? Math.min(d, total - d) : d; };
    for (let k = 0; k + 1 < st.s.length; k++) if (gap(st.s[k] as number) < o.box || gap(st.s[k + 1] as number) < o.box) st.drawn[k] = false;
  }
  for (const { on } of at) for (const o of on) {
    const st = strips[o.strip] as Strip, count = st.s.length;
    // the arms: the nearest drawn segment's end on each side of the node
    let lo = -1, hi = -1;
    for (let k = 0; k + 1 < count; k++) {
      if (!st.drawn[k]) continue;
      const mid = ((st.s[k] as number) + (st.s[k + 1] as number)) / 2;
      if (mid < o.s && (lo < 0 || k + 1 > lo)) lo = k + 1;
      if (mid > o.s && (hi < 0 || k < hi)) hi = k;
    }
    // (on a ring, the arm past its seam)
    if (st.closed && lo < 0) for (let k = count - 2; k >= 0; k--) if (st.drawn[k]) { lo = k + 1; break; }
    if (st.closed && hi < 0) for (let k = 0; k + 1 < count; k++) if (st.drawn[k]) { hi = k; break; }
    const reach = o.box + 12;
    const near = (k: number): boolean => k >= 0 && (() => { const d = Math.abs((st.s[k] as number) - o.s), total = st.s[count - 1] as number; return (st.closed ? Math.min(d, total - d) : d) < reach; })();
    o.lo = near(lo) ? lo : -1;
    o.hi = near(hi) ? hi : -1;
  }
  for (const { node, on } of at) {
    const nd = graph.nodes[node] as { x: number; z: number };
    const rim: RimPoint[] = [];
    for (const o of on) {
      const st = strips[o.strip] as Strip;
      for (const k of [o.lo, o.hi]) {
        if (k < 0) continue;
        ACROSS.forEach((f, i) => {
          const o2 = f * st.hw;
          rim.push({ x: (st.x[k] as number) + (st.rx[k] as number) * o2, y: (st.h[k] as number[])[i] as number, z: (st.z[k] as number) + (st.rz[k] as number) * o2, strip: o.strip, s: st.s[k] as number, o: o2 });
        });
      }
    }
    if (rim.length < 2 * ACROSS.length) continue;
    rim.sort((a, b) => Math.atan2(a.z - nd.z, a.x - nd.x) - Math.atan2(b.z - nd.z, b.x - nd.x));
    const j: Junction = { x: nd.x, y: ground.surfaceHeight(nd.x, nd.z) + ROAD_LIFT, z: nd.z, rim, fan: [] };
    junctions.push(j);
    // a fan from the middle, each triangle in four: the spokes' middles and the corners' chords on the ground
    const lifted = (x: number, z: number): number[] => [x, ground.surfaceHeight(x, z) + ROAD_LIFT, z];
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i] as RimPoint, b = rim[(i + 1) % rim.length] as RimPoint;
      const ma = lifted((j.x + a.x) / 2, (j.z + a.z) / 2), mb = lifted((j.x + b.x) / 2, (j.z + b.z) / 2);
      // along an arm's own section the chord is the strip's edge: straight, so the seam is exact
      const edge = a.strip === b.strip && a.s === b.s ? [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2] : lifted((a.x + b.x) / 2, (a.z + b.z) / 2);
      j.fan.push(...ma, ...mb, ...edge);
    }
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
          && ![[e0[0], e0[2]], [e1[0], e1[2]], [outX0, outZ0], [outX1, outZ1]].some(([x, z]) => ground.nearOtherRoad(x as number, z as number, st.road, CORNER));
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
        // the kerb's piece: the band's middle at its top
        const cx = ((e0[0] as number) + (e1[0] as number) + outX0 + outX1) / 4, cz = ((e0[2] as number) + (e1[2] as number) + outZ0 + outZ1) / 4;
        const ya = ((top0[1] as number) + (out0[1] as number)) / 2, yb = ((top1[1] as number) + (out1[1] as number)) / 2;
        const dx = (st.x[k + 1] as number) - (st.x[k] as number), dz = (st.z[k + 1] as number) - (st.z[k] as number), run = Math.hypot(dx, dz);
        const key = chunkOf(cx, cz);
        let list = kerbs.get(key);
        if (!list) { list = []; kerbs.set(key, list); }
        list.push({ x: cx, y: (ya + yb) / 2, z: cz, yaw: Math.atan2(dx, dz), pitch: Math.atan2(yb - ya, run), length: Math.hypot(run, yb - ya) });
      }
    }
    close(0);
    close(1);
  }

  // the paint
  const paint: Paint[] = [], parking: ParkingBay[] = [];
  const corner = { x: 0, y: 0, z: 0 };
  const put = (kind: PaintKind, si: number, s: number[], o: number[], colour: number, lift = PAINT_LIFT): void => {
    const st = strips[si] as Strip, y: number[] = [];
    for (let i = 0; i < 4; i++) {
      onStrip(st, s[i] as number, o[i] as number, corner);
      y.push(corner.y + lift);
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
    // the approaches: a run's end at a box where this road is not the one widest road through it
    const junctionAt = (k: number): { stop: boolean; through: boolean } | null => {
      for (const { on } of at) {
        const o = on.find((q) => q.strip === si && (q.lo === k || q.hi === k));
        if (!o) continue;
        const widest = Math.max(...on.map((q) => (strips[q.strip] as Strip).hw));
        const alone = on.filter((q) => (strips[q.strip] as Strip).hw === widest).length === 1;
        return { stop: st.cls !== 'highway' && !(st.hw === widest && alone), through: o.lo >= 0 && o.hi >= 0 };
      }
      return null;
    };
    const lane = Math.min(4.5, st.hw - 3.5);
    const bays = BAYS.has(st.cls);
    const stopOuter = bays ? st.hw - 3.4 : st.hw - 0.6;
    for (const [ka, kb] of runs) {
      const sa = st.s[ka] as number, sb = st.s[kb] as number;
      const start = junctionAt(ka), end = junctionAt(kb);
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
        if (room < stop + ARROW + 3) return room;
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
        return stop + ARROW + 3;
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

/** The `i`-th point across section `k` of a strip (x, its height there, z). */
function stripPoint(st: Strip, k: number, i: number): number[] {
  const o = (ACROSS[i] as number) * st.hw;
  return [(st.x[k] as number) + (st.rx[k] as number) * o, (st.h[k] as number[])[i] as number, (st.z[k] as number) + (st.rz[k] as number) * o];
}

/**
 * The render's triangles a chunk (`chunkOf` names a triangle's by its middle) from the surfaces' data, reading no ground:
 * the junctions' fans, the strips' bands, their pavements on their kerbs (or their edges' skirts), the paint.
 */
export function surfaceMeshes(s: RoadSurfaces, chunkOf: (x: number, z: number) => number): Map<number, SurfaceChunk> {
  // (the detail, drawn near only, kept apart and put after each chunk's far level)
  const chunks = new Map<number, SurfaceChunk>(), details = new Map<number, SurfaceChunk>();
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, colour: number, detail = false): void => {
    const key = chunkOf((ax + bx + cx) / 3, (az + bz + cz) / 3), into = detail ? details : chunks;
    let c = into.get(key);
    if (!c) { c = { positions: [], colors: [], far: 0 }; into.set(key, c); }
    c.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    c.colors.push(colour);
  };
  const quad = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], colour: number, detail = false): void => {
    tri(a[0] as number, a[1] as number, a[2] as number, b[0] as number, b[1] as number, b[2] as number, c[0] as number, c[1] as number, c[2] as number, colour, detail);
    tri(a[0] as number, a[1] as number, a[2] as number, c[0] as number, c[1] as number, c[2] as number, d[0] as number, d[1] as number, d[2] as number, colour, detail);
  };
  // a fan from each junction's middle, each triangle in four: the spokes' middles and the corners' chords on the ground
  for (const j of s.junctions) {
    const colour = PALETTE.asphalt, rim = j.rim, f = j.fan;
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i] as RimPoint, b = rim[(i + 1) % rim.length] as RimPoint, n = 9 * i;
      const mx = f[n] as number, my = f[n + 1] as number, mz = f[n + 2] as number, nx = f[n + 3] as number, ny = f[n + 4] as number, nz = f[n + 5] as number;
      const ex = f[n + 6] as number, ey = f[n + 7] as number, ez = f[n + 8] as number;
      tri(j.x, j.y, j.z, mx, my, mz, nx, ny, nz, colour);
      tri(mx, my, mz, a.x, a.y, a.z, ex, ey, ez, colour);
      tri(mx, my, mz, ex, ey, ez, nx, ny, nz, colour);
      tri(nx, ny, nz, ex, ey, ez, b.x, b.y, b.z, colour);
    }
  }
  for (const st of s.strips) {
    const colour = st.cls === 'dirt' ? ISLAND_COLORS.dirt : st.cls === 'taxiway' ? PALETTE.concrete : PALETTE.asphalt;
    const count = st.s.length, last = ACROSS.length - 1, walked = [false, false];
    for (let k = 0; k + 1 < count; k++) {
      if (!st.drawn[k]) { walked[0] = walked[1] = false; continue; }
      // the bands as `heightOn` reads them
      for (let i = 0; i < last; i++) quad(stripPoint(st, k, i), stripPoint(st, k + 1, i), stripPoint(st, k + 1, i + 1), stripPoint(st, k, i + 1), colour);
      for (const [side, e0, e1] of [[1, stripPoint(st, k, 0), stripPoint(st, k + 1, 0)], [-1, stripPoint(st, k, last), stripPoint(st, k + 1, last)]] as const) {
        const w = side > 0 ? 0 : 1;
        if (((st.walk[k] as number) & (w === 0 ? 1 : 2)) === 0) {
          walked[w] = false;
          // the edge's skirt
          quad(e0, [e0[0] as number, (e0[1] as number) - SKIRT, e0[2] as number], [e1[0] as number, (e1[1] as number) - SKIRT, e1[2] as number], e1, colour);
          continue;
        }
        const outX0 = (st.x[k] as number) + (st.rx[k] as number) * side * (st.hw + PAVEMENT), outZ0 = (st.z[k] as number) + (st.rz[k] as number) * side * (st.hw + PAVEMENT);
        const outX1 = (st.x[k + 1] as number) + (st.rx[k + 1] as number) * side * (st.hw + PAVEMENT), outZ1 = (st.z[k + 1] as number) + (st.rz[k + 1] as number) * side * (st.hw + PAVEMENT);
        const g0 = st.out[2 * k + w] as number, g1 = st.out[2 * (k + 1) + w] as number;
        const top0 = [e0[0] as number, (e0[1] as number) + KERB, e0[2] as number], top1 = [e1[0] as number, (e1[1] as number) + KERB, e1[2] as number];
        const out0 = [outX0, g0 + ROAD_LIFT + KERB, outZ0], out1 = [outX1, g1 + ROAD_LIFT + KERB, outZ1];
        quad(top0, top1, out1, out0, ISLAND_COLORS.paving);
        quad(e0, e1, top1, top0, PALETTE.kerb, true);
        quad(out0, out1, [outX1, g1 - 0.3, outZ1], [outX0, g0 - 0.3, outZ0], PALETTE.kerb, true);
        // its end where it starts after a gap, and where it stops before one (the next segment decides)
        if (!walked[w]) quad(e0, top0, out0, [outX0, g0 - 0.3, outZ0], PALETTE.kerb, true);
        walked[w] = true;
        const ends = k + 2 >= count || !st.drawn[k + 1];
        if (ends) quad(e1, top1, out1, [outX1, g1 - 0.3, outZ1], PALETTE.kerb, true);
      }
    }
  }
  // the paint, on its strip at its heights
  const corner = { x: 0, y: 0, z: 0 }, v = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of s.paint) {
    const st = s.strips[p.strip] as Strip;
    for (let i = 0; i < 4; i++) {
      onStrip(st, p.s[i] as number, p.o[i] as number, corner);
      const q = v[i] as number[];
      q[0] = corner.x; q[1] = p.y[i] as number; q[2] = corner.z;
    }
    quad(v[0] as number[], v[1] as number[], v[2] as number[], v[3] as number[], p.colour, true);
  }
  for (const c of chunks.values()) c.far = c.colors.length;
  for (const [key, d] of details) {
    let c = chunks.get(key);
    if (!c) { c = { positions: [], colors: [], far: 0 }; chunks.set(key, c); }
    c.positions = c.positions.concat(d.positions);
    c.colors = c.colors.concat(d.colors);
  }
  return chunks;
}
