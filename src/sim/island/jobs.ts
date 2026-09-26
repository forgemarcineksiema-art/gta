/**
 * The island's jobs (M8.10 slice 14, docs/M8.10_PLAN.md §1.4): the plan's 28 rings and the wanted board's 11 rivals,
 * where the ground gives each a reason. A ring stands at the kerb corner nearest its plan point, seen from both of its
 * streets: `CORNER_OUT` m past both carriageways (the grid's rule), nothing a car would hit between it and the kerb, off
 * the decks, the doors, the drive-throughs, the jumps, the cameras and the rails, apart from the others, lying on the
 * ground's slope. A rival waits in the kerbside bay nearest theirs on their turf (the Chief in the headquarters' yard).
 * The ends: a delivery's drop and an order's fence at the plan's places (the scrapyard's garage; else the kerb of the
 * town's road nearest the place), a race's finish and a trial's where the plan's words put it (a trial down the
 * serpentine, along the highway or through the canal passed point by point: the lanes' shortest way would cut its
 * hairpins or leave the highway, and no lane runs down the canal), a zone round the plan's place, a duel's at its
 * place or as far as its band says. Pay and clocks from the lanes' paths, as the grid's generator reckons them
 * (`jobs/place.ts`), the junctions' curves counted, from whichever of a ring's roads is shortest. Worked out once, when
 * the world is built; it allocates.
 */
import { BALANCE } from '../balance';
import { CHIEF, RIVALS, type RivalDef } from '../board/rivals';
import type { DropOff } from '../city/cover';
import { alongLane, laneAt } from '../city/route';
import { projectOnLane, type Lane, type RoadGraph } from '../city/roads';
import { ORDER_KINDS, orderPaints, packDescriptor, type JobDef, type JobKind } from '../jobs/catalog';
import { mulberry32 } from '../random';
import type { StaticDesc } from '../scene';
import type { LaneTables } from '../traffic/lanes';
import type { StreetMap } from '../traffic/streets';
import { inLot } from './fill';
import { distanceToPolyline, type P2 } from './geom';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0, Island } from './Island';
import type { CrownPlace } from './places/crown';
import type { WorksPlace } from './places/works';
import { CAMERAS, JOBS, JUMPS, PLACES, RIVAL_RINGS, districtOf, type PlanJob, type RoadClass } from './plan';
import { canalLength, inCanal, pointAt } from './shapes/works';
import { DECK } from './structures';

/** Metres past both carriageways a ring stands (the grid's `CORNER_OUT`), and the clear ground past its middle. */
export const CORNER_OUT = 6;
const CLEAR_PAST = 3;
/** Two roads make a corner between them when their arms part by more than this and less than `WIDEST` (rad). */
const NARROWEST = (25 * Math.PI) / 180;
const WIDEST = (150 * Math.PI) / 180;
/** Kept from a garage's door, a jump, a camera's pole, a drive-through's site, a deck's edge and the railway's line (m). */
const DOOR_CLEAR = 20;
const JUMP_CLEAR = 25;
const POLE_CLEAR = 15;
const SERVICE_CLEAR = 12;
const DECK_CLEAR = 4;
const RAIL_CLEAR = 8;
/** A palm's trunk may stand in a ring's band (a thin post, as a lamp's), not this near its middle nor on the way in (m). */
const PALM_CLEAR = 2.5;
/**
 * Two rings keep this far apart (two corners of one crossing may hold one each, as the plan puts them); a rival's bay
 * this far from every ring and door, and `RIVAL_APART` from another rival's (m).
 */
export const RING_GAP = 25;
const RIVAL_CLEAR = 20;
const RIVAL_APART = 60;
/** A rival the plan puts this near their hunt's home waits at home (m): Tina at the scrapyard, the Nephew under the tower. */
const AT_HOME = 300;
/**
 * A ring lies on the ground's slope (tilted to the plane through the ground under it): no steeper than `RING_STEEPEST`
 * (rise over run: a bank beside a street on Crown's hill), the ground off that plane by `RING_BENT` m at most (a crease
 * where two banks meet would bury it).
 */
export const RING_STEEPEST = 0.35;
export const RING_BENT = 0.4;
/** A zone's middle keeps its ring within this share of its radius: moved from the plan's place toward a ring further out. */
const ZONE_REACH = 0.85;
/** A drive starts from the lanes within this of a ring or a bay (m) and this near the ground's height there (m). */
const START_REACH = 24;
const NEAR_HEIGHT = 3;
/** A raised slab (a deck, a floor, a ramp) standing up this far over the ground is one a car would hit, and reaching under `CAR_TOP` (m). */
const STANDS = 0.4;
const CAR_TOP = 2.2;
/** A lane point is the ground's when its height is within this of the drawn ground's there (m): no deck, no tunnel. */
const ON_GROUND = 0.6;
/**
 * A trial's way along a road: a point every `ROAD_STEP` m (the way's line follows its bends; each counts within the
 * sea trial's reach, 25 m); the canal's every `CANAL_STEP` m, none this near a bridge over it (m).
 */
const ROAD_STEP = 40;
const CANAL_STEP = 110;
const BRIDGE_CLEAR = 30;
/** An order's fence is the scrapyard's garage when the plan's point is within this of its door (m). */
const GARAGE_NEAR = 30;

/**
 * A kerb corner: the ring's middle and its facing (the junction's middle), the kerb corner it is reached from, the
 * junction's middle, and the two roads (their strips) it is seen from.
 */
export interface Corner { x: number; z: number; yaw: number; kx: number; kz: number; jx: number; jz: number; roads: [number, number] }

/** A job's end: where it is and the lane the drive ends on, the metres along it. */
export interface IslandTarget { x: number; z: number; lane: number; s: number }

/**
 * Every kerb corner of the island's junctions: between each two neighbouring arms of two different roads parting by
 * a corner's angle, the point `CORNER_OUT` m past both carriageways (the arms' directions from the junction's middle
 * to their sections' middles, each road's half width from its strip).
 */
export function kerbCorners(island: Island): Corner[] {
  const out: Corner[] = [];
  const strips = island.surfaces.strips;
  for (const j of island.surfaces.junctions) {
    // the arms: the rim's sections (a road through the junction has two), each by its middle point, its road's half width
    const arms: Array<{ ux: number; uz: number; a: number; hw: number; strip: number }> = [];
    for (const p of j.rim) {
      if (p.o !== 0) continue;
      const dx = p.x - j.x, dz = p.z - j.z, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      arms.push({ ux: dx / l, uz: dz / l, a: Math.atan2(dz, dx), hw: (strips[p.strip] as { hw: number }).hw, strip: p.strip });
    }
    arms.sort((a, b) => a.a - b.a);
    for (let k = 0; k < arms.length; k++) {
      const A = arms[k] as (typeof arms)[number], B = arms[(k + 1) % arms.length] as (typeof arms)[number];
      if (A.strip === B.strip) continue;
      let gap = B.a - A.a;
      if (gap <= 0) gap += 2 * Math.PI;
      if (gap < NARROWEST || gap > WIDEST) continue;
      // the point `dA` off A's line toward B and `dB` off B's toward A: J + (dB·uA + dA·uB) / sin(gap)
      const sin = Math.sin(gap);
      const at = (dA: number, dB: number): P2 => [j.x + (dB * A.ux + dA * B.ux) / sin, j.z + (dB * A.uz + dA * B.uz) / sin];
      const [x, z] = at(A.hw + CORNER_OUT, B.hw + CORNER_OUT), [kx, kz] = at(A.hw, B.hw);
      out.push({ x, z, yaw: Math.atan2(j.x - x, j.z - z), kx, kz, jx: j.x, jz: j.z, roads: [A.strip, B.strip] });
    }
  }
  return out;
}

/** A thing a car would hit: its footprint's bounds on the ground. */
interface Blocker { x0: number; x1: number; z0: number; z1: number }

/**
 * The ground under a ring at (x, z): the plane through the drawn ground at its middle and eight points round its edge
 * (a least-squares fit), its height at the middle, its rise per metre along x and z, and how far the ground strays from
 * it (m). The ring is drawn on it (`render/run/signs.ts`); a corner too steep or bent keeps none.
 */
export function ringGround(island: Island, x: number, z: number, out: { y: number; sx: number; sz: number; bent: number }): { y: number; sx: number; sz: number; bent: number } {
  const r = BALANCE.jobs.markerRadius, g = island.ground, h0 = g.surfaceHeight(x, z);
  let sum = h0, cx = 0, cz = 0;
  const hs = RING_HEIGHTS;
  for (let k = 0; k < 8; k++) {
    const c = Math.cos((k * Math.PI) / 4), s = Math.sin((k * Math.PI) / 4), h = g.surfaceHeight(x + c * r, z + s * r);
    hs[k] = h;
    sum += h;
    cx += h * c;
    cz += h * s;
  }
  // over eight points evenly round a circle: Σcos² = Σsin² = 4, Σcos·sin = Σcos = Σsin = 0
  out.y = sum / 9;
  out.sx = cx / (4 * r);
  out.sz = cz / (4 * r);
  let bent = Math.abs(h0 - out.y);
  for (let k = 0; k < 8; k++) bent = Math.max(bent, Math.abs((hs[k] as number) - (out.y + (out.sx * Math.cos((k * Math.PI) / 4) + out.sz * Math.sin((k * Math.PI) / 4)) * r)));
  out.bent = bent;
  return out;
}
const RING_HEIGHTS = new Float64Array(8);

/** The blockers' cells (m): a chunk's area cut into squares, each listing the blockers over it. */
const BLOCK_CELL = 25;
const CELLS_ACROSS = Math.round(CHUNK / BLOCK_CELL);

/**
 * The things a car would hit (the fill's and the places' statics): a building's walls and plinths, a tree's trunk, a
 * raised deck, floor or ramp, each by its footprint's bounds, listed in the `BLOCK_CELL` squares they cover, a chunk's
 * worth at a time as first asked.
 */
export class Blockers {
  private readonly cells = new Map<number, Blocker[]>();
  private readonly built = new Set<number>();
  /** Each chunk's own blockers, worked out once. */
  private readonly own = new Map<number, Blocker[]>();
  constructor(private readonly island: Island) {}

  /** Whether any point of `pts` is inside a blocker (grown by `margin`, at most a cell). */
  hits(pts: readonly P2[], margin: number): boolean {
    for (const [x, z] of pts) {
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        for (const b of this.cell(x + di * margin, z + dj * margin)) if (x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin) return true;
      }
    }
    return false;
  }

  /** The blockers over the cell holding (x, z). */
  private cell(x: number, z: number): readonly Blocker[] {
    const [i, j] = Island.chunkOf(x, z);
    this.build(i, j);
    return this.cells.get(cellKey(x, z)) ?? NONE;
  }

  /** A chunk's cells: every blocker of its statics and its neighbours' (a building across a chunk's edge) over its area. */
  private build(i: number, j: number): void {
    const index = Island.chunkIndex(i, j);
    if (this.built.has(index)) return;
    this.built.add(index);
    const x0 = CHUNK_X0 + i * CHUNK, z0 = CHUNK_Z0 + j * CHUNK;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (i + di < 0 || j + dj < 0 || i + di >= CHUNKS_X || j + dj >= CHUNKS_Z) continue;
      for (const b of this.ownOf(Island.chunkIndex(i + di, j + dj))) {
        if (b.x1 < x0 || b.x0 > x0 + CHUNK || b.z1 < z0 || b.z0 > z0 + CHUNK) continue;
        for (let cz = Math.max(z0, Math.floor(b.z0 / BLOCK_CELL) * BLOCK_CELL); cz <= Math.min(z0 + CHUNK - 1, b.z1); cz += BLOCK_CELL) {
          for (let cx = Math.max(x0, Math.floor(b.x0 / BLOCK_CELL) * BLOCK_CELL); cx <= Math.min(x0 + CHUNK - 1, b.x1); cx += BLOCK_CELL) {
            const key = cellKey(cx, cz);
            let list = this.cells.get(key);
            if (!list) { list = []; this.cells.set(key, list); }
            list.push(b);
          }
        }
      }
    }
  }

  /** A chunk's own statics that a car would hit: a wall or a trunk always, a slab the wheels ride where it stands up off the ground (a ramp, a deck). */
  private ownOf(index: number): Blocker[] {
    let list = this.own.get(index);
    if (list) return list;
    list = [];
    const g = this.island.ground;
    for (const st of this.island.fill.chunks.get(index) ?? []) {
      const b = footprint(st);
      if (!b) continue;
      if (st.tag === 'kerb') {
        const ground = g.surfaceHeight(st.position.x, st.position.z);
        if (b.top - ground < STANDS || b.bottom - ground > CAR_TOP) continue;
      }
      list.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 });
    }
    this.own.set(index, list);
    return list;
  }
}
const NONE: readonly Blocker[] = [];
/** A point's blockers' cell, across the island's chunks. */
function cellKey(x: number, z: number): number {
  return Math.floor((z - CHUNK_Z0) / BLOCK_CELL) * CHUNKS_X * CELLS_ACROSS + Math.floor((x - CHUNK_X0) / BLOCK_CELL);
}

/** A static's bounds on the ground and its top's and bottom's heights, when a car would meet it: walls, trunks, raised slabs. */
function footprint(st: StaticDesc): { x0: number; x1: number; z0: number; z1: number; top: number; bottom: number } | null {
  if (st.tag !== 'building' && st.tag !== 'trunk' && st.tag !== 'kerb') return null;
  const s = st.shape, p = st.position;
  if (s.kind === 'box' || s.kind === 'gable') {
    // a turned box's bounds (its heading only: the pitched slabs' tilt is small)
    const yaw = 2 * Math.atan2(st.rotation.y, st.rotation.w), c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    const hx = c * s.hx + sn * s.hz, hz = sn * s.hx + c * s.hz;
    return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, top: p.y + s.hy, bottom: p.y - s.hy };
  }
  if (s.kind === 'cylinder') return { x0: p.x - s.radius, x1: p.x + s.radius, z0: p.z - s.radius, z1: p.z + s.radius, top: p.y + s.halfHeight, bottom: p.y - s.halfHeight };
  if (s.kind === 'prism') {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of s.points) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    return { x0, x1, z0, z1, top: s.y1, bottom: s.y0 };
  }
  return null;
}

/** What keeps a ring off a spot, named: the island's garages, drive-throughs, decks and crossings, the plan's jumps and cameras. */
function keptOff(island: Island, x: number, z: number): string | null {
  const r = BALANCE.jobs.markerRadius;
  for (const g of island.garages) if (Math.hypot(g.door.x - x, g.door.z - z) < DOOR_CLEAR + g.door.width / 2) return 'door';
  for (const s of island.services) if (Math.hypot(s.x - x, s.z - z) < s.half + SERVICE_CLEAR) return 'drive-through';
  // a ramp, a gap, a drop (a crest is the road's own: a car flies along it, past the corner)
  for (const j of JUMPS) if (j.kind !== 'crest' && Math.hypot(j.at[0] - x, j.at[1] - z) < JUMP_CLEAR) return 'jump';
  for (const c of CAMERAS) if (Math.hypot(c[0] - x, c[1] - z) < POLE_CLEAR) return 'camera';
  // off the railway (the freight train runs through) and its yard's sidings
  const yard = PLACES.railYard;
  if (distanceToPolyline(x, z, PLACES.railway) < RAIL_CLEAR || (x > yard.x0 - r && x < yard.x1 + r && z > yard.z0 - r && z < yard.z1 + r)) return 'rails';
  // under or over a deck (the viaduct, the bay bridge, an overpass): its pieces' middles and half width
  for (const s of island.structures) {
    if (s.kind === 'tunnel') continue;
    for (const p of s.pieces) {
      const dx = x - p.x, dz = z - p.z, along = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw), across = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
      if (Math.abs(along) <= p.length / 2 + r && Math.abs(across) < DECK.half + r + DECK_CLEAR) return 'deck';
    }
  }
  return null;
}

/**
 * Why a ring cannot stand on a corner, or null where it can: on land, off every carriageway and deck, clear of the
 * doors, the drive-throughs, the plan's jumps and cameras and the crossings; nothing a car would hit on the ring or
 * between it and its kerb corner (a lot, a wall, a trunk, a raised slab), and the ground under it level enough for the
 * flat ring.
 */
export function cornerFault(island: Island, blockers: Blockers, c: Corner): string | null {
  const g = island.ground, r = BALANCE.jobs.markerRadius;
  if (!g.onLand(c.x, c.z)) return 'water';
  if (g.nearOtherRoad(c.x, c.z, -1, r + 1)) return 'road';
  const kept = keptOff(island, c.x, c.z);
  if (kept) return kept;
  // the ring's edge and middle, and the way in from the kerb corner to `CLEAR_PAST` beyond the middle
  const ring: P2[] = [[c.x, c.z]];
  for (let k = 0; k < 8; k++) ring.push([c.x + Math.cos((k * Math.PI) / 4) * r, c.z + Math.sin((k * Math.PI) / 4) * r]);
  if (ring.some(([x, z]) => !g.onLand(x, z))) return 'water';
  if (ring.some(([x, z]) => inCanal(x, z))) return 'canal';
  const dx = c.x - c.kx, dz = c.z - c.kz, len = Math.hypot(dx, dz) || 1, way: P2[] = [];
  for (let d = 0; d <= len + CLEAR_PAST; d += 1) way.push([c.kx + (dx / len) * d, c.kz + (dz / len) * d]);
  const pts = [...ring, ...way];
  if (pts.some(([x, z]) => island.fill.lots.some((l) => Math.abs(l.x - x) < l.hx + l.hz + 2 && Math.abs(l.z - z) < l.hx + l.hz + 2 && inLot(l, x, z, 0.5)))) return 'lot';
  if (island.fill.palms.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < PALM_CLEAR || way.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 1.5))) return 'palm';
  if (blockers.hits(pts, 0.3)) return 'wall';
  const plane = ringGround(island, c.x, c.z, PLANE);
  return Math.hypot(plane.sx, plane.sz) > RING_STEEPEST ? 'slope' : plane.bent > RING_BENT ? 'bent' : null;
}
const PLANE = { y: 0, sx: 0, sz: 0, bent: 0 };

/** Metres and seconds from the nearest of a drive's starts to each lane's start, by the lanes and their junctions' curves (the shortest by metres). */
export interface LanePaths { length: Float64Array; time: Float64Array; starts: ReadonlyArray<{ lane: number; s: number }> }

/**
 * The lanes' paths from the points a drive may start at (a lane each and the metres along it: a ring's corner is as
 * near two roads, either way along each): an O(n²) Dijkstra over the few hundred lanes, once per place.
 */
export function pathsFrom(graph: RoadGraph, lanes: LaneTables, starts: ReadonlyArray<{ lane: number; s: number }>): LanePaths {
  const n = graph.lanes.length, len = lanes.length, lim = lanes.limit;
  const length = new Float64Array(n).fill(Infinity), time = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  for (const { lane, s } of starts) {
    const rest = Math.max(0, (len[lane] as number) - s);
    for (const v of (graph.lanes[lane] as Lane).next) {
      const c = lanes.connectionLength(lane, v), d = rest + c;
      if (d >= (length[v] as number)) continue;
      length[v] = d;
      time[v] = rest / (lim[lane] as number) + c / Math.min(lim[lane] as number, lim[v] as number);
    }
  }
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && (length[i] as number) < best) { best = length[i] as number; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const v of (graph.lanes[u] as Lane).next) {
      const c = lanes.connectionLength(u, v), d = best + (len[u] as number) + c;
      if (d >= (length[v] as number)) continue;
      length[v] = d;
      time[v] = (time[u] as number) + (len[u] as number) / (lim[u] as number) + c / Math.min(lim[u] as number, lim[v] as number);
    }
  }
  return { length, time, starts };
}

/**
 * Metres from each lane's start to a target on the lanes, by the lanes and their junctions' curves: a reverse O(n²)
 * Dijkstra, so every bay's drive to one end is read at once (`driveTo`).
 */
export function pathsTo(graph: RoadGraph, lanes: LaneTables, t: { lane: number; s: number }): Float64Array {
  const n = graph.lanes.length, len = lanes.length;
  const dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  const preds: number[][] = graph.lanes.map(() => []);
  for (const l of graph.lanes) for (const v of l.next) (preds[v] as number[]).push(l.id);
  dist[t.lane] = t.s;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && (dist[i] as number) < best) { best = dist[i] as number; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const p of preds[u] as number[]) {
      const d = (len[p] as number) + lanes.connectionLength(p, u) + best;
      if (d < (dist[p] as number)) dist[p] = d;
    }
  }
  return dist;
}

/** The drive from `s` m along `lane` to the target `rev` was laid to (`pathsTo`'s), m. */
export function driveTo(rev: Float64Array, graph: RoadGraph, lanes: LaneTables, t: { lane: number; s: number }, lane: number, s: number): number {
  if (lane === t.lane && s <= t.s) return t.s - s;
  let best = Infinity;
  const rest = Math.max(0, (lanes.length[lane] as number) - s);
  for (const v of (graph.lanes[lane] as Lane).next) best = Math.min(best, rest + lanes.connectionLength(lane, v) + (rev[v] as number));
  return best;
}

/** The drive from the paths' nearest start to a target on the lanes (metres, seconds); Infinity where none reaches it. */
export function pathTo(p: LanePaths, lanes: LaneTables, t: { lane: number; s: number }): { length: number; time: number } {
  let length = Infinity, time = Infinity;
  for (const st of p.starts) {
    if (st.lane !== t.lane || t.s < st.s || t.s - st.s >= length) continue;
    length = t.s - st.s;
    time = length / (lanes.limit[t.lane] as number);
  }
  const d = p.length[t.lane] as number;
  if (Number.isFinite(d) && d + t.s < length) {
    length = d + t.s;
    time = (p.time[t.lane] as number) + t.s / (lanes.limit[t.lane] as number);
  }
  return { length, time };
}

/**
 * Where a drive from (x, z) may start: every lane within `reach` m that runs at the ground's height there (not a deck
 * over it nor the tunnel under it), the metres along it; the nearest lane when none does.
 */
export function startsNear(island: Island, streets: StreetMap, x: number, z: number, reach: number): Array<{ lane: number; s: number }> {
  const out: Array<{ lane: number; s: number }> = [], hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
  const ground = island.ground.surfaceHeight(x, z);
  for (const lane of streets.graph.lanes) {
    if (projectOnLane(lane, x, z, hit) > reach * reach || Math.abs((hit.y ?? 0) - ground) > NEAR_HEIGHT) continue;
    out.push({ lane: lane.id, s: alongLane(lane, hit.x, hit.z).s });
  }
  if (out.length > 0) return out;
  const lane = streets.nearestLane(x, z, ground);
  return lane < 0 ? [] : [{ lane, s: alongLane(streets.graph.lanes[lane] as Lane, x, z).s }];
}

/**
 * The lane nearest (x, z) among those `keep` allows whose line runs on the ground there (no deck, no tunnel), and the
 * point on it: a job's end on the road beside a place.
 */
export function groundLane(island: Island, graph: RoadGraph, x: number, z: number, keep: (lane: Lane) => boolean = () => true): IslandTarget | null {
  const hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
  let best: IslandTarget | null = null, bestD = Infinity;
  for (const lane of graph.lanes) {
    if (!keep(lane)) continue;
    const d = projectOnLane(lane, x, z, hit);
    if (d >= bestD || Math.abs((hit.y ?? 0) - island.ground.surfaceHeight(hit.x, hit.z)) > ON_GROUND) continue;
    bestD = d;
    best = { x: hit.x, z: hit.z, lane: lane.id, s: alongLane(lane, hit.x, hit.z).s };
  }
  return best;
}

/** A lane's middle as a finish, when it runs on the ground there (its line's own height: a deck's, the tunnel's). */
function laneMiddle(island: Island, graph: RoadGraph, lanes: LaneTables, lane: number): IslandTarget | null {
  const len = lanes.length[lane] as number, p = laneAt(graph.lanes[lane] as Lane, len / 2);
  if (Math.abs(p.y - island.ground.surfaceHeight(p.x, p.z)) > ON_GROUND) return null;
  return { x: p.x, z: p.z, lane, s: len / 2 };
}

/** A drop-off as a job's end: 4 m inside its door (any car through the opening passes within the ring), on its street's lane. */
function garageTarget(graph: RoadGraph, site: DropOff): IslandTarget {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw), r = BALANCE.jobs.markerRadius;
  return { x: site.door.x + fx * r, z: site.door.z + fz * r, lane: site.approachLane, s: alongLane(graph.lanes[site.approachLane] as Lane, site.door.x, site.door.z).s };
}

/**
 * A trial's way off the lanes' shortest: its points in turn and its finish; where it is joined (its first point, on its
 * road at the road's height: a deck's, the tunnel's) and its metres from there to the finish.
 */
export interface Run { route: Array<{ x: number; y?: number; z: number }>; finish: { x: number; z: number }; from: { x: number; y: number; z: number }; along: number }

/** A line of the network or the canal's: its points (with their heights), their stations, whether it closes on itself. */
interface Line { pts: ReadonlyArray<{ x: number; y?: number; z: number }>; s: readonly number[]; closed: boolean }

/** A point's station along a line (its nearest point's). */
function stationOf(line: Line, x: number, z: number): number {
  const n = line.pts.length, last = line.closed ? n : n - 1;
  let best = Infinity, at = 0;
  for (let i = 0; i < last; i++) {
    const a = line.pts[i] as { x: number; z: number }, b = line.pts[(i + 1) % n] as { x: number; z: number }, dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = (line.s[i] as number) + t * Math.sqrt(len2); }
  }
  return at;
}

/** The point `s` along a line (wrapped round a closed one), with its height. */
function pointOf(line: Line, s: number): { x: number; y: number; z: number } {
  const total = line.s[line.s.length - 1] as number, n = line.pts.length;
  const d = line.closed ? ((s % total) + total) % total : Math.max(0, Math.min(total, s));
  for (let i = 0; i + 1 < line.s.length; i++) {
    const s0 = line.s[i] as number, s1 = line.s[i + 1] as number;
    if (d > s1 && i + 2 < line.s.length) continue;
    const a = line.pts[i] as { x: number; y?: number; z: number }, b = line.pts[(i + 1) % n] as { x: number; y?: number; z: number }, t = s1 > s0 ? (d - s0) / (s1 - s0) : 0;
    return { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t };
  }
  const p = line.pts[0] as { x: number; y?: number; z: number };
  return { x: p.x, y: p.y ?? 0, z: p.z };
}

/**
 * A trial's way along one road (the network's line by its id), from its point nearest the ring to its point nearest
 * the finish, round a loop the way that passes nearest `via` (else the shorter): its points every `ROAD_STEP` m, so the
 * way's line follows its bends and the run keeps to it (a street's shortcut past the serpentine's hairpins is no way).
 */
export function roadRun(island: Island, road: string, ring: { x: number; z: number }, to: P2, via?: P2): Run | null {
  const line = island.network.lines.find((l) => l.id === road);
  if (!line) return null;
  const total = line.s[line.s.length - 1] as number, s0 = stationOf(line, ring.x, ring.z), s1 = stationOf(line, to[0], to[1]);
  let dir = s1 >= s0 ? 1 : -1, run = Math.abs(s1 - s0);
  if (line.closed) {
    const ahead = (((s1 - s0) % total) + total) % total;
    const near = (d: number, span: number): number => {
      if (!via) return span;
      let best = Infinity;
      for (let k = 0; k <= span; k += ROAD_STEP / 2) { const p = pointOf(line, s0 + d * k); best = Math.min(best, Math.hypot(p.x - via[0], p.z - via[1])); }
      return best;
    };
    // on: the stations rising; back: falling
    const on = near(1, ahead), back = near(-1, total - ahead);
    dir = on <= back ? 1 : -1;
    run = dir > 0 ? ahead : total - ahead;
  }
  const route: Array<{ x: number; y: number; z: number }> = [];
  for (let k = ROAD_STEP; k < run - ROAD_STEP / 4; k += ROAD_STEP) route.push(pointOf(line, s0 + dir * k));
  const finish = pointOf(line, s0 + dir * run), first = route.length > 0 ? ROAD_STEP : run;
  return { route, finish: { x: finish.x, z: finish.z }, from: pointOf(line, s0 + dir * first), along: run - first };
}

/**
 * The canal trial's way: points down the channel's middle every `CANAL_STEP` m, none by a bridge over it, its east end
 * the finish; joined at its west ramp's top, which no lane reaches (the drive there from the ring is a straight run).
 */
export function canalRun(island: Island): Run {
  const works = island.places.find((p) => p.id === 'works') as WorksPlace | undefined;
  const bridges = works?.bridges ?? [];
  const total = canalLength(), route: Array<{ x: number; z: number }> = [], p = { x: 0, z: 0 };
  for (let s = CANAL_STEP / 2; s < total - CANAL_STEP / 2; s += CANAL_STEP) {
    let at = s;
    // slid down the channel off a bridge
    for (let k = 0; k < 4; k++) {
      pointAt(at, p);
      if (!bridges.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < BRIDGE_CLEAR)) break;
      at += BRIDGE_CLEAR;
    }
    pointAt(at, p);
    route.push({ x: p.x, z: p.z });
  }
  const west = pointAt(0, { x: 0, z: 0 });
  pointAt(total, p);
  return { route, finish: { x: p.x, z: p.z }, from: { x: west.x, y: island.ground.surfaceHeight(west.x, west.z), z: west.z }, along: total };
}

/** A zone job's ring stands at its corner; its zone's middle is the plan's place (`targetX`, `targetZ`). */
const ZONES: ReadonlySet<JobKind> = new Set<JobKind>(['rage', 'mayhem']);

/** The order the plan's rings take their corners: those whose place is the job first (the trials, the races, the zones), the escapes last. */
const PICK_ORDER: readonly JobKind[] = ['trial', 'race', 'rage', 'mayhem', 'delivery', 'order', 'escape'];

/** A delivery's drop and an order's fence stand by a town's road: not the highway nor a ramp onto it. */
const NO_DROP: ReadonlySet<RoadClass> = new Set<RoadClass>(['highway', 'ramp']);

/**
 * The island's jobs for a seed (the orders' cars): the plan's 28 rings, each its plan index's id from 1 (the cold open's
 * is 0), then the eleven rivals from 29.
 */
export function islandJobs(island: Island, streets: StreetMap, lanes: LaneTables, seed: number): JobDef[] {
  const cfg = BALANCE.jobs, graph = streets.graph, rng = mulberry32(seed ^ 0x0b5);
  const blockers = new Blockers(island);
  const corners = kerbCorners(island).filter((c) => cornerFault(island, blockers, c) === null);
  // each ring its corner: in `PICK_ORDER`, the nearest to its plan point `RING_GAP` from the rings placed before it
  const picked = new Map<number, Corner>();
  const order = JOBS.map((_j, i) => i).sort((a, b) => PICK_ORDER.indexOf((JOBS[a] as PlanJob).kind) - PICK_ORDER.indexOf((JOBS[b] as PlanJob).kind) || a - b);
  for (const i of order) {
    const [px, pz] = (JOBS[i] as PlanJob).at;
    let best: Corner | null = null, bestD = Infinity;
    for (const c of corners) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d >= bestD) continue;
      let apart = true;
      for (const q of picked.values()) if (Math.hypot(q.x - c.x, q.z - c.z) < RING_GAP) { apart = false; break; }
      if (!apart) continue;
      best = c;
      bestD = d;
    }
    if (best) picked.set(i, best);
  }
  const classOf = new Map(island.network.lines.map((l) => [l.id, l.cls] as const));
  const drop = (lane: Lane): boolean => !NO_DROP.has(classOf.get(island.network.laneRoad[lane.id] ?? '') ?? 'highway');
  const scrapyard = island.garages.find((g) => g.name === 'scrapyard');
  const defs: JobDef[] = [];
  JOBS.forEach((plan, i) => {
    const c = picked.get(i), to = plan.to;
    if (!c) return;
    const base = { id: i + 1, kind: plan.kind, x: c.x, z: c.z, yaw: c.yaw, descriptor: -1 };
    if (plan.kind === 'escape') {
      const level = plan.level ?? 2;
      defs.push({ ...base, targetX: 0, targetZ: 0, level, payout: cfg.escape.bounty * level, limitSeconds: 0, heat: 0 });
      return;
    }
    if (ZONES.has(plan.kind)) {
      // the zone round the plan's place, moved toward a ring further than `ZONE_REACH` of its radius from it
      const rule = cfg.zone[plan.kind as 'rage' | 'mayhem'], [px, pz] = plan.at, far = Math.hypot(px - c.x, pz - c.z), reach = ZONE_REACH * cfg.zone.radius;
      const k = far > reach ? reach / far : 1;
      defs.push({ ...base, targetX: c.x + (px - c.x) * k, targetZ: c.z + (pz - c.z) * k, level: rule.quota, payout: rule.payout, limitSeconds: cfg.zone.seconds, heat: rule.heat });
      return;
    }
    if (!to) return;
    const tr = cfg.trial;
    // the drives from the ring: from whichever of its two roads (either way along each) is shortest
    const fromRing = pathsFrom(graph, lanes, startsNear(island, streets, c.x, c.z, START_REACH));
    if (plan.kind === 'trial' && plan.along) {
      // along one road or down the canal: its points in turn, the finish at its end; the bronze clock on the drive to
      // where it is joined (by the lanes; the canal's straight across) and on along it
      const run = plan.along === 'canal' ? canalRun(island) : roadRun(island, plan.along, c, to, plan.via);
      if (!run) return;
      const lane = streets.nearestLane(run.from.x, run.from.z, run.from.y);
      const join = plan.along === 'canal' || lane < 0 ? Math.hypot(run.from.x - c.x, run.from.z - c.z)
        : pathTo(fromRing, lanes, { lane, s: alongLane(graph.lanes[lane] as Lane, run.from.x, run.from.z).s }).length;
      if (!Number.isFinite(join)) return;
      defs.push({ ...base, targetX: run.finish.x, targetZ: run.finish.z, level: 0, payout: tr.pay[2] as number, limitSeconds: Math.round((join + run.along) / (tr.speeds[0] as number)), heat: 0, route: run.route });
      return;
    }
    const fence = plan.kind === 'order' && scrapyard && Math.hypot(scrapyard.door.x - to[0], scrapyard.door.z - to[1]) < GARAGE_NEAR;
    const target = fence && scrapyard ? garageTarget(graph, scrapyard)
      : groundLane(island, graph, to[0], to[1], plan.kind === 'delivery' || plan.kind === 'order' ? drop : undefined);
    if (!target) return;
    const p = pathTo(fromRing, lanes, target);
    if (plan.kind === 'delivery') {
      const d = cfg.delivery;
      const payout = Math.max(d.payoutMin, Math.min(d.payoutMax, Math.round(d.payoutPerKm * p.length / 1000 / 100) * 100));
      defs.push({ ...base, targetX: target.x, targetZ: target.z, level: 0, payout, limitSeconds: Math.max(d.limitMin, Math.round(d.limitFactor * p.time)), heat: d.heat });
    } else if (plan.kind === 'order') {
      const o = cfg.order, carKind = ORDER_KINDS[(rng() * ORDER_KINDS.length) | 0] ?? 'compact', paints = orderPaints(carKind);
      const paint = paints[(rng() * paints.length) | 0] as number;
      defs.push({ ...base, targetX: target.x, targetZ: target.z, level: 0, descriptor: packDescriptor(carKind, paint), payout: o.payout[carKind as keyof typeof o.payout], limitSeconds: o.limitSeconds, heat: o.heat });
    } else if (plan.kind === 'trial') {
      defs.push({ ...base, targetX: target.x, targetZ: target.z, level: 0, payout: tr.pay[2] as number, limitSeconds: Math.round(p.length / (tr.speeds[0] as number)), heat: 0 });
    } else if (plan.kind === 'race') {
      defs.push({ ...base, targetX: target.x, targetZ: target.z, level: 0, payout: cfg.race.pay[0] as number, limitSeconds: Math.round(p.length / cfg.race.limitSpeed), heat: 0 });
    }
  });
  islandRivals(island, streets, lanes, defs);
  return defs;
}

/**
 * The wanted board's rivals (the grid's `placeRivals`, on the plan's places), each in a kerbside bay on their turf (the
 * Ghost's any, by the tunnel's mouth; the Chief in the headquarters' yard), `RIVAL_CLEAR` m from every ring and door and
 * `RIVAL_APART` from another rival's:
 * - a hunt home to a place (the scrapyard's garage, the kerb before the donut shop, the summit's ring under the tower):
 *   one the plan puts at home (within `AT_HOME`: Tina at the scrapyard, the Nephew under the tower) waits in the bay
 *   nearest their plan point and, home nearer than their band (`rival.path`) allows, runs the other way, off with the
 *   bag, to the lane's middle whose way is nearest the band's middle; another waits in the bay nearest their plan point
 *   whose way home is in the band (the grid's rule), else the one nearest it;
 * - a race: from the bay nearest their plan point to the finish nearest the band's middle, the Glasshouse's by the
 *   parkway's lanes, a lane's (the Ghost's far) by all the lanes' middles on the ground.
 */
function islandRivals(island: Island, streets: StreetMap, lanes: LaneTables, defs: JobDef[]): void {
  const graph = streets.graph, net = island.network;
  const markers = defs.map((d) => ({ x: d.x, z: d.z }));
  for (const g of island.garages) markers.push({ x: g.door.x, z: g.door.z });
  const taken: Array<{ x: number; z: number }> = [];
  const free = (b: { x: number; z: number }): boolean => markers.every((m) => Math.hypot(m.x - b.x, m.z - b.z) >= RIVAL_CLEAR)
    && taken.every((t) => Math.hypot(t.x - b.x, t.z - b.z) >= RIVAL_APART);
  const crown = island.places.find((p) => p.id === 'crown') as CrownPlace | undefined;
  const scrapyard = island.garages.find((g) => g.name === 'scrapyard');
  const middles: IslandTarget[] = [];
  for (let l = 0; l < graph.lanes.length; l++) { const m = laneMiddle(island, graph, lanes, l); if (m) middles.push(m); }
  const on = (road: string) => (l: Lane): boolean => net.laneRoad[l.id] === road;
  const shop = PLACES.donutShop;
  // a hunt's home: the kerb of its road nearest it (the scrapyard's: 4 m inside its garage's door)
  const home = (target: RivalDef['target']): IslandTarget | null => {
    if (target === 'scrapyard') return scrapyard ? garageTarget(graph, scrapyard) : null;
    if (target === 'donuts') return groundLane(island, graph, (shop.x0 + shop.x1) / 2, (shop.z0 + shop.z1) / 2, (l) => !l.highway);
    if (target === 'tower') return groundLane(island, graph, PLACES.towerTop.x, PLACES.towerTop.z, on('summit'));
    return null;
  };
  const band = (length: number, [lo, hi]: readonly [number, number]): number => (length < lo ? lo - length : length > hi ? length - hi : Math.abs(length - (lo + hi) / 2) * 1e-3);
  // a bay's way out: the lane it faces along, the metres along it
  const laneOf = (b: { x: number; z: number }): { lane: number; s: number } => {
    const lane = streets.nearestLane(b.x, b.z, streets.groundAt(b.x, b.z));
    return { lane, s: alongLane(graph.lanes[lane] as Lane, b.x, b.z).s };
  };
  // the finish among `finishes` whose way from `from` is nearest the band's middle
  const byBand = (from: { lane: number; s: number }, finishes: readonly IslandTarget[], path: readonly [number, number]): { target: IslandTarget | null; length: number } => {
    const paths = pathsFrom(graph, lanes, [from]);
    let target: IslandTarget | null = null, length = 0, bestErr = Infinity;
    for (const t of finishes) {
      const p = pathTo(paths, lanes, t);
      if (!Number.isFinite(p.length)) continue;
      const err = band(p.length, path);
      if (err < bestErr) { bestErr = err; target = t; length = p.length; }
    }
    return { target, length };
  };
  for (let i = 0; i <= CHIEF; i++) {
    const rival = RIVALS[i] as RivalDef, plan = RIVAL_RINGS.find((r) => r.rival === i);
    if (!plan) continue;
    const [px, pz] = plan.at;
    const pool = (rival.target === 'none' ? (crown?.bays ?? []) : streets.bays.filter((b) => rival.turf === 'highway' || districtOf(b.x, b.z) === rival.turf))
      .filter(free).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    let bay = pool[0];
    if (!bay) continue;
    let target: IslandTarget | null = null, length = 0;
    const end = home(rival.target);
    if (end) {
      const rev = pathsTo(graph, lanes, end), drive = (b: { x: number; z: number }): number => { const at = laneOf(b); return driveTo(rev, graph, lanes, end, at.lane, at.s); };
      if (Math.hypot(end.x - px, end.z - pz) < AT_HOME) {
        // at home, as the plan puts them: home, or (nearer than the band) off with the bag
        length = drive(bay);
        if (Number.isFinite(length) && length >= rival.path[0]) target = end;
        else ({ target, length } = byBand(laneOf(bay), middles, rival.path));
      } else {
        // the nearest bay whose way home is in the band, else the one nearest it
        let bestErr = Infinity;
        for (const b of pool) {
          const d = drive(b);
          if (!Number.isFinite(d)) continue;
          const err = band(d, rival.path);
          if (err < bestErr - 1e-9) { bestErr = err; bay = b; length = d; target = end; }
          if (err < 1) break;
        }
      }
    } else if (rival.target === 'glasshouse') {
      ({ target, length } = byBand(laneOf(bay), middles.filter((m) => net.laneRoad[m.lane] === 'parkway'), rival.path));
    } else if (rival.target !== 'none') {
      ({ target, length } = byBand(laneOf(bay), middles, rival.path));
    }
    taken.push(bay);
    defs.push({
      id: JOBS.length + 1 + i, kind: 'duel', x: bay.x, z: bay.z, yaw: bay.yaw, targetX: target ? target.x : bay.x, targetZ: target ? target.z : bay.z,
      level: i, descriptor: -1, payout: rival.purse, limitSeconds: target ? Math.round(length / BALANCE.board.limitSpeed) : 0, heat: 0,
    });
  }
}
