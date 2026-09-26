/** M8.10 slice 6b: the roads' surfaces, the junctions, the pavements and the paint (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../../src/sim';
import { CHUNK, CHUNKS_X, CHUNK_X0, CHUNK_Z0, Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { HALF_WIDTH } from '../../../src/sim/island/ground';
import { KERB, PAINT_LIFT, PAVEMENT, ROAD_LIFT, heightOn, onStrip, type Strip } from '../../../src/sim/island/surfaces';
import { GroundView } from '../../../src/render/island/GroundView';

describe('M8.10 slice 6b: the roads\' surfaces', () => {
  let island: Island, world: RAPIER.World;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { await initPhysics(); world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); island = new Island(world); }, 60_000);

  it('6.1 a strip lies on the ground: 4 cm over it at its points, within 10 cm between them (all but a few in a thousand)', () => {
    const g = island.ground, p = { x: 0, y: 0, z: 0 };
    let checked = 0, worst = 0, under = 0, off = 0;
    for (const st of island.surfaces.strips) for (let k = 0; k + 1 < st.s.length; k++) {
      if (!st.drawn[k]) continue;
      for (const t of [0, 0.5]) for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const s = (st.s[k] as number) + t * ((st.s[k + 1] as number) - (st.s[k] as number));
        onStrip(st, s, f * st.hw, p);
        const h = g.surfaceHeight(p.x, p.z);
        // (the tunnel's dug ground is under its own floor)
        if (Math.abs(g.height(p.x, p.z) - h) > 0.01) continue;
        const over = p.y - h;
        // its points across each section
        if (t === 0) expect(Math.abs(over - ROAD_LIFT), `${st.id} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(1e-4);
        worst = Math.max(worst, Math.abs(over));
        if (over < 0) under++;
        // between them the ground may bend within a span (where two roads meet it eases over a few metres)
        if (over < -0.1 || over > 0.1 + ROAD_LIFT) off++;
        checked++;
      }
    }
    console.log(`6.1 ${checked} points, the most off ${worst.toFixed(2)} m, ${under} under, ${off} more than 10 cm off`);
    expect(checked).toBeGreaterThan(40000);
    expect(off / checked).toBeLessThan(0.002);
    expect(under / checked).toBeLessThan(0.01);
  });

  it('6.2 each junction\'s rim meets its arms\' strips where their drawn stretches end', () => {
    const { junctions, strips } = island.surfaces;
    console.log(`6.2 ${junctions.length} junctions of ${island.network.graph.nodes.length} nodes`);
    expect(junctions.length).toBeGreaterThan(100);
    for (const j of junctions) for (const r of j.rim) {
      const st = strips[r.strip] as Strip, k = st.s.indexOf(r.s);
      expect(k, `${st.id}`).toBeGreaterThanOrEqual(0);
      // a drawn segment starts or ends there
      expect(st.drawn[k] === true || st.drawn[k - 1] === true, `${st.id} at ${r.x.toFixed(0)}, ${r.z.toFixed(0)}`).toBe(true);
      const on = k < st.s.length - 1 ? heightOn(st, k, 0, r.o) : heightOn(st, k - 1, 1, r.o);
      expect(Math.abs(on - r.y)).toBeLessThan(0.01);
    }
  });

  it('6.3 the paint lies on the strips, inside the carriageways, and every kind is there', () => {
    const { paint, strips, parking } = island.surfaces;
    const count: Record<string, number> = {};
    let centre = 0;
    for (const q of paint) {
      const st = strips[q.strip] as Strip, mid = q.s.reduce((a, b) => a + b, 0) / 4;
      count[q.kind] = (count[q.kind] ?? 0) + 1;
      for (let i = 0; i < 4; i++) {
        const s = q.s[i] as number, o = q.o[i] as number;
        expect(Math.abs(o), `${q.kind} on ${st.id}`).toBeLessThanOrEqual(st.hw + 1e-6);
        // the segment under the corner (at a section, the one toward the quad's middle)
        const after = st.s.findIndex((v) => v > s);
        let k = after < 0 ? st.s.length - 2 : Math.max(0, after - 1);
        if (k > 0 && st.s[k] === s && mid < s) k--;
        k = Math.min(k, st.drawn.length - 1);
        expect(st.drawn[k], `${q.kind} on ${st.id} at ${s.toFixed(1)}`).toBe(true);
        const t = ((s - (st.s[k] as number)) / ((st.s[k + 1] as number) - (st.s[k] as number)));
        const over = (q.y[i] as number) - heightOn(st, k, Math.max(0, Math.min(1, t)), o);
        expect(over).toBeGreaterThan(PAINT_LIFT - 1e-3);
        expect(over).toBeLessThan(PAINT_LIFT + 0.01);
      }
      if (q.kind === 'centre') centre += Math.abs((q.s[1] as number) - (q.s[0] as number));
    }
    console.log('6.3', JSON.stringify(count), `centre ${(centre / 1000).toFixed(1)} km, ${parking.length} bays`);
    expect(count.stop ?? 0).toBeGreaterThan(100);
    expect(count.zebra ?? 0).toBeGreaterThan(300);
    expect(count.arrow ?? 0).toBeGreaterThan(100);
    expect(count.edge ?? 0).toBeGreaterThan(200);
    expect(count.lane ?? 0).toBeGreaterThan(300);
    expect(centre).toBeGreaterThan(15000);
    expect(parking.length).toBeGreaterThan(150);
  });

  it('6.4 a chunk\'s ground and roads\' surfaces together under 10,000 triangles', () => {
    const view = new GroundView(island);
    let most = 0, surfaces = 0;
    for (const [k, c] of island.surfaceMeshes()) {
      const tris = c.colors.length + view.build(k % CHUNKS_X, Math.floor(k / CHUNKS_X)).triangles;
      most = Math.max(most, tris);
      surfaces = Math.max(surfaces, c.colors.length);
    }
    console.log(`6.4 the most a chunk ${most}, its surfaces' most ${surfaces}`);
    expect(most).toBeLessThan(10000);
  });

  it('6.5 a junction\'s box is its widest road\'s surface, and a pavement\'s kerb carries a wheel 14 cm over the road', () => {
    const g = island.ground, { junctions, strips } = island.surfaces;
    let checked = 0;
    for (const j of junctions) {
      // (by the highway its surface holds sway past its own edge)
      if (g.highwayAt(j.x, j.z) !== null || g.roads.some((r) => r.cls === 'highway' && r.pts.some((q) => Math.hypot(q[0] - j.x, q[1] - j.z) < 40))) continue;
      const arms = [...new Set(j.rim.map((r) => r.strip))].map((i) => strips[i] as Strip);
      const widest = Math.max(...arms.map((s) => s.hw)), top = arms.filter((s) => s.hw === widest);
      if (top.length !== 1) continue;
      const road = g.roads[(top[0] as Strip).road];
      if (!road) continue;
      // across the widest's carriageway at the node: its own profile, no other road's
      const n = road.pts.length;
      let bi = 0, bd = Infinity;
      road.pts.forEach((q, i) => { const d = Math.hypot(q[0] - j.x, q[1] - j.z); if (d < bd) { bd = d; bi = i; } });
      const a = road.pts[Math.max(0, bi - 1)] as [number, number], b = road.pts[Math.min(n - 1, bi + 1)] as [number, number];
      const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, hw = HALF_WIDTH[road.cls];
      for (const f of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const x = (road.pts[bi] as [number, number])[0] - (tz / l) * f * hw, z = (road.pts[bi] as [number, number])[1] + (tx / l) * f * hw;
        // the profile's height at the nearest point of that road
        let ph = Infinity, pd = Infinity;
        for (let i = 0; i + 1 < n; i++) {
          const p0 = road.pts[i] as [number, number], p1 = road.pts[i + 1] as [number, number], dx = p1[0] - p0[0], dz = p1[1] - p0[1];
          const t = Math.max(0, Math.min(1, ((x - p0[0]) * dx + (z - p0[1]) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(x - p0[0] - dx * t, z - p0[1] - dz * t);
          if (d < pd) { pd = d; ph = (road.h[i] as number) + ((road.h[i + 1] as number) - (road.h[i] as number)) * t; }
        }
        expect(Math.abs(g.surfaceHeight(x, z) - ph), `${road.id} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
    // a ray down onto a pavement lands on its kerb's top, 14 cm over the road's edge beside it
    const [ck, pieces] = [...island.surfaces.kerbs.entries()].sort((a, b) => b[1].length - a[1].length)[0] as [number, Array<{ x: number; y: number; z: number; yaw: number }>];
    island.sync(CHUNK_X0 + ((ck % CHUNKS_X) + 0.5) * CHUNK, CHUNK_Z0 + (Math.floor(ck / CHUNKS_X) + 0.5) * CHUNK, true);
    world.step();
    const down = (x: number, top: number, z: number): number | null => {
      const hit = world.castRay(new RAPIER.Ray({ x, y: top, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 20, true);
      return hit ? top - hit.timeOfImpact : null;
    };
    expect(pieces.length).toBeGreaterThan(20);
    for (const p of pieces.slice(0, 40)) {
      expect(Math.abs((down(p.x, p.y + 5, p.z) ?? -99) - p.y), `a kerb at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(0.03);
    }
    expect(KERB).toBe(0.14);
  });

  it('6.6 a foot\'s height read from the kerbs\' cells is every kerb piece\'s: on the pavements, across their edges, off them', () => {
    const all = [...island.surfaces.kerbs.values()].flat();
    // every piece's highest top at a point, the slow way
    const slow = (x: number, z: number): number => {
      let top = -Infinity;
      for (const p of all) {
        const dx = x - p.x, dz = z - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw), along = dx * s + dz * c, across = dx * c - dz * s;
        if (Math.abs(across) <= PAVEMENT / 2 && Math.abs(along) <= p.length / 2 + 0.2) top = Math.max(top, p.y + Math.tan(p.pitch) * along);
      }
      return Number.isFinite(top) ? top : island.ground.surfaceHeight(x, z);
    };
    let checked = 0;
    for (let k = 0; k < all.length; k += Math.max(1, Math.floor(all.length / 400))) {
      const p = all[k] as (typeof all)[number], s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      for (const [along, across] of [[0, 0], [p.length / 2, PAVEMENT / 2 - 0.05], [-p.length / 2 - 0.1, -PAVEMENT / 2 + 0.05], [0, PAVEMENT / 2 + 0.3], [p.length / 3, -PAVEMENT]] as const) {
        const x = p.x + s * along + c * across, z = p.z + c * along - s * across;
        expect(island.standAt(x, z), `at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeCloseTo(slow(x, z), 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });
});
