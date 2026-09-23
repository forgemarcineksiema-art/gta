/**
 * The three garages checked against their neighbours (docs/M4_PLAN.md 3.0).
 * Long: run by `npm run verify:gate` and `npm run test:long` (CLAUDE.md), moved
 * unchanged from `run.test.ts` in M5.1.
 */
import { describe, expect, it } from 'vitest';
import { GARAGE, dropOffFor, hideoutStatics } from '../../src/sim/city/cover';
import type { StaticDesc } from '../../src/sim';
import { type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld } from './helpers';

/** Axis-aligned bounds and top of a static, for the clearance pin. */
function bounds(st: StaticDesc): { minX: number; maxX: number; minZ: number; maxZ: number; top: number } | null {
  const p = st.position;
  const yaw = 2 * Math.atan2(st.rotation.y, st.rotation.w);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const s0 = st.shape;
  if (s0.kind === 'box' || s0.kind === 'gable') {
    const ex = c * s0.hx + s * s0.hz, ez = s * s0.hx + c * s0.hz;
    return { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, top: p.y + s0.hy };
  }
  if (s0.kind === 'cylinder') return { minX: p.x - s0.radius, maxX: p.x + s0.radius, minZ: p.z - s0.radius, maxZ: p.z + s0.radius, top: p.y + s0.halfHeight };
  if (s0.kind === 'prism') {
    const xs = s0.points.map((q) => q.x), zs = s0.points.map((q) => q.z);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), top: s0.y1 };
  }
  return null;
}

describe('the run (long)', () => {
  it('3.0 builds three garages clear of their neighbours, each on a kerb-side approach lane', async () => {
    for (const seed of [42, 7, 123]) {
      const sim = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        const sites = sim.run.dropOffs;
        expect(sites.map((s) => s.name)).toEqual(['hideout', 'scrapyard', 'hotel']);
        for (const site of sites) {
          expect(dropOffFor(site.lot)).toEqual({ ...site, approachLane: -1 });
          const own = new Set(hideoutStatics(site).map((st) => JSON.stringify(st)));
          const chunk = sim.city!.generate(site.lot.cx, site.lot.cz);
          // every garage piece is in its chunk
          for (const key of own) expect(chunk.statics.some((st) => JSON.stringify(st) === key)).toBe(true);
          const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
          for (const st of chunk.statics) {
            if (own.has(JSON.stringify(st))) continue;
            const b = bounds(st);
            if (!b || b.top < 0.3) continue;
            // the static's bounds in the drop-off frame (axis-aligned: the garages face a grid street)
            let minA = Infinity, maxA = -Infinity, minC = Infinity, maxC = -Infinity;
            for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) {
              const dx = x - site.x, dz = z - site.z;
              const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
              minA = Math.min(minA, along); maxA = Math.max(maxA, along);
              minC = Math.min(minC, across); maxC = Math.max(maxC, across);
            }
            // the garage plus half a metre, and a 4 m apron the width of the door in front of it
            const hitsBox = maxA > -GARAGE.depth / 2 - 0.5 && minA < GARAGE.depth / 2 + 0.5 && maxC > -GARAGE.width / 2 - 0.5 && minC < GARAGE.width / 2 + 0.5;
            const hitsApron = maxA > -GARAGE.depth / 2 - 4 && minA < -GARAGE.depth / 2 && maxC > -GARAGE.doorWidth / 2 && minC < GARAGE.doorWidth / 2;
            if (hitsBox || hitsApron) throw new Error(`seed ${seed}: ${site.name} meets a ${st.tag ?? 'static'} ${st.shape.kind} at ${st.position.x.toFixed(1)}, ${st.position.z.toFixed(1)}`);
          }
          // the lane past the door: within 20 m of it, parallel to its face, with the door on the kerb (right) side
          const lane = sim.city!.graph.lanes[site.approachLane]!;
          const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
          (sim.traffic as Traffic).lanes.project(site.approachLane, site.door.x, site.door.z, proj);
          expect(Math.hypot(proj.x - site.door.x, proj.z - site.door.z)).toBeLessThan(20);
          expect(Math.abs(Math.sin(proj.yaw - site.yaw))).toBeGreaterThan(0.99);
          const right = { x: -Math.cos(proj.yaw), z: Math.sin(proj.yaw) };
          expect((site.door.x - proj.x) * right.x + (site.door.z - proj.z) * right.z).toBeGreaterThan(0);
          expect(lane.highway).toBe(false);
        }
      } finally { sim.dispose(); }
    }
  }, 120_000);
});
