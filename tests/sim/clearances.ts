/**
 * D7's clearances as a test's own geometry (M8 slices 0, 2): the carriageways, the walkers' lines, the job rings,
 * the doors' approaches, the billboards' run-outs and lines, the ramps and their flights, the junctions' corners,
 * the overpasses and the cold open's route; what stands above the kerb in each chunk. Built once from a world.
 */
import type { SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import { chunkCoord } from '../../src/sim/city/City';
import { gateLine, layoutCoins } from '../../src/sim/city/coins';
import { runOutFootprint, tallFootprint, CAR_TOP, type BillboardDesc } from '../../src/sim/city/collectibles';
import { DROP_OFF_LOTS, GARAGE, dropOffFor, toDropOff } from '../../src/sim/city/cover';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF, underOverpass } from '../../src/sim/city/roads';
import { coldOpenRoute, coldOpenSpots } from '../../src/sim/run/ColdOpen';
import type { PropDesc, PropKind } from '../../src/sim/city/props';

type Pt = { x: number; z: number };

const MARKET_KINDS: ReadonlySet<PropKind> = new Set(['fruitStand', 'fishStall', 'crate', 'table', 'chair']);

/**
 * The places M8 slice 8 added, which keep their own rules (pins 8.1, 8.2): a mayhem zone's market (its stalls,
 * crates, tables and chairs within 60 m of the zone's ring) and the things the cold open drives through (on its
 * route by design). Null for everything else.
 */
export function slice8Place(sim: SimWorld): (p: PropDesc) => 'market' | 'route' | null {
  const zones = sim.jobs.defs.filter((d) => d.kind === 'mayhem');
  const loop = sim.city!.spawns.find((s) => s.name === 'loop'), hideout = sim.run.dropOffs[0];
  const route = loop && hideout ? coldOpenRoute(sim, loop.position.x, loop.position.z, hideout) : null;
  const spots = route ? coldOpenSpots(route) : [];
  return (p) => {
    if (spots.some((s) => s.kind === p.kind && Math.hypot(s.x - p.x, s.z - p.z) < 1e-3)) return 'route';
    if (MARKET_KINDS.has(p.kind) && zones.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < 60)) return 'market';
    return null;
  };
}

export function segDist(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** Polylines' segments by the 16 m cells they cross, so a point meets only its neighbours'. */
export class Segments {
  private readonly cells = new Map<string, Array<[{ x: number; z: number }, { x: number; z: number }]>>();
  add(points: ReadonlyArray<{ x: number; z: number }>): void {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!, b = points[i + 1]!;
      for (let cx = Math.floor(Math.min(a.x, b.x) / 16); cx <= Math.floor(Math.max(a.x, b.x) / 16); cx++) {
        for (let cz = Math.floor(Math.min(a.z, b.z) / 16); cz <= Math.floor(Math.max(a.z, b.z) / 16); cz++) {
          const key = `${cx},${cz}`;
          const list = this.cells.get(key) ?? [];
          list.push([a, b]);
          this.cells.set(key, list);
        }
      }
    }
  }
  /** The nearest distance from a point to any segment within one cell of it (Infinity beyond). */
  dist(x: number, z: number): number {
    let best = Infinity;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const [a, b] of this.cells.get(`${cx + i},${cz + j}`) ?? []) best = Math.min(best, segDist(x, z, a, b));
    }
    return best;
  }
}

export class Clearances {
  private readonly walkerSegs = new Segments();
  private readonly lineSegs = new Segments();
  private readonly routeSegs = new Segments();
  private readonly roadSegs = new Map<string, Segments>();
  private readonly boards: BillboardDesc[] = [];
  private readonly arcs: Pt[];
  private readonly rings: Array<{ x: number; z: number; r: number }>;
  private readonly doors = DROP_OFF_LOTS.map((lot) => dropOffFor(lot));
  private readonly tall = new Map<string, Array<(q: Pt) => boolean>>();
  private readonly frame = { along: 0, across: 0 };
  readonly routeLength: number;

  constructor(private readonly sim: SimWorld) {
    const city = sim.city!, graph = city.graph;
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) this.boards.push(...city.chunk(cx, cz).billboards);
    for (const b of this.boards) { const line = gateLine(graph, b) ?? []; if (line.length > 1) this.lineSegs.add(line); }
    this.arcs = layoutCoins(city.jumps);
    const loop = city.spawns.find((s) => s.name === 'loop')!;
    const route = coldOpenRoute(sim, loop.position.x, loop.position.z, sim.run.dropOffs[0]!)!.samples;
    this.routeLength = route.length;
    this.routeSegs.add(route);
    this.rings = sim.jobs.defs.map((d) => ({ x: d.x, z: d.z, r: d.kind === 'duel' ? BALANCE.board.ringRadius : BALANCE.jobs.markerRadius }));
    // the walkers' lines: every footway's middle (a lane shifted onto its pavement, as Pedestrians walks them)
    for (const lane of graph.lanes) {
      if (lane.highway) continue;
      const road = lane.special ? graph.special.find((r) => r.name === lane.special) : null;
      const out = (road ? road.halfWidth : ROAD_HALF) + 2.25 - lane.offset;
      const pts = lane.points;
      this.walkerSegs.add(pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
        const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        return { x: p.x - tz / l * out, z: p.z + tx / l * out };
      }));
    }
    for (const road of graph.special) { const segs = new Segments(); segs.add(road.centre); this.roadSegs.set(road.name, segs); }
    // every chunk's statics that stand above the kerb: a box turned about +Y by its own yaw, anything else by its bounds
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      const list: Array<(q: Pt) => boolean> = [];
      for (const st of city.generate(cx, cz).statics) {
        const f = tallFootprint(st, CAR_TOP);
        if (!f) continue;
        const s = st.shape, rot = st.rotation;
        const turned = (s.kind === 'box' || s.kind === 'gable') && rot.x === 0 && rot.z === 0;
        const yaw = turned ? 2 * Math.atan2(rot.y, rot.w) : 0, c = Math.cos(yaw), sn = Math.sin(yaw);
        list.push((q) => {
          if (!turned) return q.x > f.minX && q.x < f.maxX && q.z > f.minZ && q.z < f.maxZ;
          const dx = q.x - st.position.x, dz = q.z - st.position.z;
          return Math.abs(c * dx - sn * dz) < (s as { hx: number }).hx && Math.abs(sn * dx + c * dz) < (s as { hz: number }).hz;
        });
      }
      this.tall.set(`${cx},${cz}`, list);
    }
  }

  /** Why a point breaks D7 (into `why`, each prefixed with `at`); nothing when it keeps every clearance. */
  point(q: Pt, at: string, why: string[]): void {
    const graph = this.sim.city!.graph;
    // off every carriageway: the grid streets (the highway included) and the authored roads
    for (let g = -3; g <= 3; g++) {
      const half = Math.abs(g) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      if (Math.abs(q.z) <= 3 * BLOCK + HIGHWAY_HALF && Math.abs(q.x - g * BLOCK) < half) why.push(`${at}: on the street x ${g * BLOCK}`);
      if (Math.abs(q.x) <= 3 * BLOCK + HIGHWAY_HALF && Math.abs(q.z - g * BLOCK) < half) why.push(`${at}: on the street z ${g * BLOCK}`);
    }
    for (const road of graph.special) if (this.roadSegs.get(road.name)!.dist(q.x, q.z) < road.halfWidth) why.push(`${at}: on ${road.name}`);
    // the walkers' band: 0.9 m either side of their line
    if (this.walkerSegs.dist(q.x, q.z) < 0.9) why.push(`${at}: in the walkers' band`);
    for (const r of this.rings) if (Math.hypot(q.x - r.x, q.z - r.z) < r.r) why.push(`${at}: in a ring at ${r.x.toFixed(0)},${r.z.toFixed(0)}`);
    for (const d of this.doors) {
      toDropOff(d, q.x, q.z, this.frame);
      const front = -GARAGE.depth / 2;
      if (this.frame.along > front - d.lot.setback - 4.5 && this.frame.along < front && Math.abs(this.frame.across) < GARAGE.doorWidth / 2 + 1) why.push(`${at}: before the ${d.name}'s door`);
    }
    for (const b of this.boards) {
      const box = runOutFootprint(b);
      if (q.x > box.minX && q.x < box.maxX && q.z > box.minZ && q.z < box.maxZ) why.push(`${at}: in billboard ${b.id}'s run-out`);
    }
    if (this.lineSegs.dist(q.x, q.z) < 1.1) why.push(`${at}: on a billboard's line`);
    // the ramps: their slabs and the flight over them to the landing
    for (const j of this.sim.city!.jumps) {
      const fx = Math.sin(j.yaw), fz = Math.cos(j.yaw), dx = q.x - j.x, dz = q.z - j.z;
      const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
      if (along > -j.length - 2 && along < j.length + 2 && Math.abs(across) < 2.6) why.push(`${at}: on ramp ${j.id}`);
    }
    if (this.arcs.some((c) => Math.hypot(c.x - q.x, c.z - q.z) < 2.6)) why.push(`${at}: under a jump's flight`);
    // 12 m from every junction's corner, on its footways (where a car turning at speed cuts across)
    for (const n of graph.nodes) {
      const gx = Math.round(n.x / BLOCK), gz = Math.round(n.z / BLOCK);
      const vx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      const footway = Math.abs(q.x - n.x) < vx + 4.5 || Math.abs(q.z - n.z) < vz + 4.5;
      if (!footway) continue;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (Math.hypot(q.x - n.x - sx * vx, q.z - n.z - sz * vz) < 12) why.push(`${at}: at a corner of ${n.id}`);
    }
    if (underOverpass(q.x, q.z)) why.push(`${at}: under an overpass`);
    if (this.routeSegs.dist(q.x, q.z) < 1.1) why.push(`${at}: on the cold open's route`);
  }

  /** Whether any point stands in something built above the kerb, in its chunk or the ones round it. */
  built(pts: readonly Pt[], x: number, z: number): boolean {
    for (let cz = chunkCoord(z) - 1; cz <= chunkCoord(z) + 1; cz++) for (let cx = chunkCoord(x) - 1; cx <= chunkCoord(x) + 1; cx++) {
      for (const inside of this.tall.get(`${cx},${cz}`) ?? []) if (pts.some(inside)) return true;
    }
    return false;
  }
}
