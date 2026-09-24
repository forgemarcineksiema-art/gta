/**
 * The street furniture's places (M8 slice 0, docs/M8_PLAN.md D7): two lines on every footway and each district's
 * places, clear of the lanes, the walkers, the rings, the doors, the billboards' lines, the ramps, the junctions'
 * corners, the overpasses and the cold open's route, from each chunk's own random stream, so the buildings, the
 * billboards and the coins are those of 0.7.0 and the decoration that stood on the footways left the statics.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import { City, chunkCoord } from '../../src/sim/city/City';
import { gateLine, layoutCoins } from '../../src/sim/city/coins';
import { runOutFootprint, tallFootprint, CAR_TOP, type BillboardDesc } from '../../src/sim/city/collectibles';
import { DROP_OFF_LOTS, GARAGE, dropOffFor, toDropOff } from '../../src/sim/city/cover';
import { PROPS_PER_CHUNK, PROP_TYPES, propFootprint, type PropDesc } from '../../src/sim/city/props';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF, distanceToPolyline, underOverpass } from '../../src/sim/city/roads';
import { coldOpenRoute } from '../../src/sim/run/ColdOpen';
import { createWorld } from './helpers';

/** FNV-1a over a string (tests/sim/look.test.ts's fingerprint). */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

function allProps(city: City): PropDesc[] {
  const out: PropDesc[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(...city.props(cx, cz));
  return out;
}

/** A prop's footprint as points: its outline and middle, every 0.25 m or closer. */
function footprintPoints(p: PropDesc): Array<{ x: number; z: number }> {
  const f = propFootprint(p.kind), cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
  const out: Array<{ x: number; z: number }> = [];
  const nx = Math.max(2, Math.ceil(2 * f.hx / 0.25)), nz = Math.max(2, Math.ceil(2 * f.hz / 0.25));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -f.hx + 2 * f.hx * i / nx, lz = -f.hz + 2 * f.hz * j / nz;
    out.push({ x: p.x + cos * lx + sin * lz, z: p.z - sin * lx + cos * lz });
  }
  return out;
}

function segDist(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

function polylineDist(points: ReadonlyArray<{ x: number; z: number }>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) best = Math.min(best, segDist(x, z, points[i]!, points[i + 1]!));
  return best;
}

describe('the street furniture\'s places (M8 slice 0)', () => {
  let sim: SimWorld, city: City, props: PropDesc[];
  beforeAll(async () => {
    sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    city = sim.city!;
    props = allProps(city);
  });
  afterAll(() => sim.dispose());

  it('M8 0.1 every prop keeps D7\'s clearances and 0.3 m from its neighbours; the list is the same twice, its ids stable', async () => {
    expect(props.length).toBeGreaterThan(1500);
    const kinds = new Set(props.map((p) => p.kind));
    for (const k of ['lamp', 'sapling', 'bin', 'bench'] as const) expect(kinds.has(k), k).toBe(true);
    // ids: the chunk's index × PROPS_PER_CHUNK + its place in the chunk's list
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      city.props(cx, cz).forEach((p, i) => expect(p.id).toBe(((cz + 3) * 7 + (cx + 3)) * PROPS_PER_CHUNK + i));
    }
    // the same list from another world
    const again = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try { expect(JSON.stringify(allProps(again.city!))).toBe(JSON.stringify(props)); } finally { again.dispose(); }

    const graph = city.graph;
    const boards: BillboardDesc[] = [];
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) boards.push(...city.chunk(cx, cz).billboards);
    const lines = boards.map((b) => gateLine(graph, b) ?? []);
    const arcs = layoutCoins(city.jumps);
    const loop = city.spawns.find((s) => s.name === 'loop')!;
    const route = coldOpenRoute(sim, loop.position.x, loop.position.z, sim.run.dropOffs[0]!)!.samples;
    expect(route.length).toBeGreaterThan(300);
    const rings = sim.jobs.defs.map((d) => ({ x: d.x, z: d.z, r: d.kind === 'duel' ? BALANCE.board.ringRadius : BALANCE.jobs.markerRadius }));
    const doors = DROP_OFF_LOTS.map((lot) => dropOffFor(lot));
    // the walkers' lines: every footway's middle (a lane shifted onto its pavement, as Pedestrians walks them)
    const walkers: Array<Array<{ x: number; z: number }>> = [];
    for (const lane of graph.lanes) {
      if (lane.highway) continue;
      const road = lane.special ? graph.special.find((r) => r.name === lane.special) : null;
      const out = (road ? road.halfWidth : ROAD_HALF) + 2.25 - lane.offset;
      const pts = lane.points;
      walkers.push(pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
        const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        return { x: p.x - tz / l * out, z: p.z + tx / l * out };
      }));
    }
    const frame = { along: 0, across: 0 };
    const why: string[] = [];
    for (const p of props) {
      const pts = footprintPoints(p);
      const at = `${p.kind} ${p.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`;
      for (const q of pts) {
        // off every carriageway: the grid streets (the highway included) and the authored roads
        for (let g = -3; g <= 3; g++) {
          const half = Math.abs(g) === 3 ? HIGHWAY_HALF : ROAD_HALF;
          if (Math.abs(q.z) <= 3 * BLOCK + HIGHWAY_HALF && Math.abs(q.x - g * BLOCK) < half) why.push(`${at}: on the street x ${g * BLOCK}`);
          if (Math.abs(q.x) <= 3 * BLOCK + HIGHWAY_HALF && Math.abs(q.z - g * BLOCK) < half) why.push(`${at}: on the street z ${g * BLOCK}`);
        }
        for (const road of graph.special) if (distanceToPolyline(road.centre, q.x, q.z) < road.halfWidth) why.push(`${at}: on ${road.name}`);
        // the walkers' band: 0.9 m either side of their line
        if (walkers.some((w) => polylineDist(w, q.x, q.z) < 0.9)) why.push(`${at}: in the walkers' band`);
        for (const r of rings) if (Math.hypot(q.x - r.x, q.z - r.z) < r.r) why.push(`${at}: in a ring at ${r.x.toFixed(0)},${r.z.toFixed(0)}`);
        for (const d of doors) {
          toDropOff(d, q.x, q.z, frame);
          const front = -GARAGE.depth / 2;
          if (frame.along > front - d.lot.setback - 4.5 && frame.along < front && Math.abs(frame.across) < GARAGE.doorWidth / 2 + 1) why.push(`${at}: before the ${d.name}'s door`);
        }
        for (const b of boards) {
          const box = runOutFootprint(b);
          if (q.x > box.minX && q.x < box.maxX && q.z > box.minZ && q.z < box.maxZ) why.push(`${at}: in billboard ${b.id}'s run-out`);
        }
        for (const line of lines) if (line.length > 1 && polylineDist(line, q.x, q.z) < 1.1) why.push(`${at}: on a billboard's line`);
        // the ramps: their slabs and the flight over them to the landing
        for (const j of city.jumps) {
          const fx = Math.sin(j.yaw), fz = Math.cos(j.yaw), dx = q.x - j.x, dz = q.z - j.z;
          const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
          if (along > -j.length - 2 && along < j.length + 2 && Math.abs(across) < 2.6) why.push(`${at}: on ramp ${j.id}`);
        }
        if (arcs.some((c) => Math.hypot(c.x - q.x, c.z - q.z) < 2.6)) why.push(`${at}: under a jump's flight`);
        // 12 m from every junction's corner
        for (const n of graph.nodes) {
          const gx = Math.round(n.x / BLOCK), gz = Math.round(n.z / BLOCK);
          const vx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (Math.hypot(q.x - n.x - sx * vx, q.z - n.z - sz * vz) < 12) why.push(`${at}: at a corner of ${n.id}`);
        }
        if (underOverpass(q.x, q.z)) why.push(`${at}: under an overpass`);
        if (polylineDist(route, q.x, q.z) < 1.1) why.push(`${at}: on the cold open's route`);
      }
      // nothing built above the kerb in its chunk or the ones round it
      for (let cz = chunkCoord(p.z) - 1; cz <= chunkCoord(p.z) + 1; cz++) for (let cx = chunkCoord(p.x) - 1; cx <= chunkCoord(p.x) + 1; cx++) {
        if (Math.abs(cx) > 3 || Math.abs(cz) > 3) continue;
        for (const st of city.chunk(cx, cz).statics) {
          const f = tallFootprint(st, CAR_TOP);
          if (!f) continue;
          const s = st.shape, rot = st.rotation;
          // a box turned about +Y by its own yaw; anything else by its bounds
          const turned = (s.kind === 'box' || s.kind === 'gable') && rot.x === 0 && rot.z === 0;
          const yaw = turned ? 2 * Math.atan2(rot.y, rot.w) : 0, c = Math.cos(yaw), sn = Math.sin(yaw);
          const inside = (q: { x: number; z: number }): boolean => {
            if (!turned) return q.x > f.minX && q.x < f.maxX && q.z > f.minZ && q.z < f.maxZ;
            const dx = q.x - st.position.x, dz = q.z - st.position.z;
            return Math.abs(c * dx - sn * dz) < (s as { hx: number }).hx && Math.abs(sn * dx + c * dz) < (s as { hz: number }).hz;
          };
          if (pts.some(inside)) why.push(`${at}: in a ${st.tag} static at ${st.position.x.toFixed(1)},${st.position.z.toFixed(1)}`);
        }
      }
    }
    // 0.3 m between two props' footprints (their bounding circles)
    const r = (p: PropDesc): number => { const f = propFootprint(p.kind); return Math.hypot(f.hx, f.hz); };
    const grid = new Map<string, PropDesc[]>();
    for (const p of props) {
      const key = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`;
      grid.set(key, [...(grid.get(key) ?? []), p]);
    }
    for (const p of props) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of grid.get(`${Math.floor(p.x / 8) + i},${Math.floor(p.z / 8) + j}`) ?? []) {
        if (o.id <= p.id) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < r(o) + r(p) + 0.3) why.push(`${p.kind} ${p.id} and ${o.kind} ${o.id} closer than 0.3 m`);
      }
    }
    expect(why.slice(0, 12)).toEqual([]);
    // every kind's footprint fits its line: the kerb line's things inside the 1.35 m before the walkers
    for (const k of ['lamp', 'sapling', 'bin'] as const) expect(0.7 + Math.hypot(propFootprint(k).hx, propFootprint(k).hz)).toBeLessThan(1.35);
    expect(PROP_TYPES.lamp.tall && PROP_TYPES.sapling.tall && !PROP_TYPES.bin.tall && !PROP_TYPES.bench.tall).toBe(true);
  }, 120_000);

  it('M8 0.2 the buildings, the billboards and the coins are those of 0.7.0; the footway\'s decoration left the statics', () => {
    const parts: string[] = [];
    const f = (v: number): string => v.toFixed(3);
    let decoration = 0;
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      const chunk = city.generate(cx, cz);
      for (const st of chunk.statics) {
        const s = st.shape;
        // the old lamp posts (a 0.18 × 8 m pole in the lamps' grey) and street trees (a 0.24 m trunk) on a footway
        const lamp = s.kind === 'box' && s.hx === 0.18 && s.hy === 4 && s.hz === 0.18 && st.color === 0x686678;
        const trunk = s.kind === 'cylinder' && s.radius === 0.24 && s.halfHeight === 2.35;
        if (lamp) decoration++;
        if (trunk) {
          // a thick tree is fine (a park's, a garden's, the promenade's, a plaza's); one within a footway of a street is not
          const gx = Math.round(st.position.x / BLOCK), gz = Math.round(st.position.z / BLOCK);
          const hx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, hz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
          // a grid street runs inside the highway's ring (and the two central ones out to their stubs by the sea)
          const ring = 3 * BLOCK + HIGHWAY_HALF + 4.5;
          const onGrid = ((Math.abs(st.position.z) < ring || gx === 0) && Math.abs(st.position.x - gx * BLOCK) < hx + 4.5)
            || ((Math.abs(st.position.x) < ring || gz === 0) && Math.abs(st.position.z - gz * BLOCK) < hz + 4.5);
          const onRoad = city.graph.special.some((r) => distanceToPolyline(r.centre, st.position.x, st.position.z) < r.halfWidth + 4.5);
          if (onGrid || onRoad) decoration++;
        }
        if (st.tag !== 'building' && st.tag !== 'kerb') continue;
        if (s.kind === 'prism') parts.push(`p${s.points.map((pt) => `${f(pt.x)},${f(pt.z)}`).join(';')}`);
        else if (s.kind === 'box') parts.push(`b${f(st.position.x)},${f(st.position.z)},${f(s.hx)},${f(s.hz)},${st.rotation.y.toFixed(5)},${st.rotation.w.toFixed(5)}`);
        else parts.push(`${s.kind}${f(st.position.x)},${f(st.position.z)}`);
      }
      for (const b of chunk.billboards) parts.push(`B${b.id},${f(b.x)},${f(b.z)},${b.yaw.toFixed(4)}`);
      for (const c of chunk.coins) parts.push(`C${f(c.x)},${f(c.z)}`);
    }
    // 0.7.0's layout (M7 pin 11.1): every collider's footprint, billboard and coin where it was
    expect(fnv(parts.join('|'))).toBe(2338173748);
    expect(decoration).toBe(0);
  });
});
