/**
 * The twenty ramps checked island-wide (docs/history/M4_PLAN.md 6.13): placement, clearance and spacing.
 * Long: run by `npm run verify:gate` and `npm run test:long` (CLAUDE.md), moved
 * unchanged from `jumps.test.ts` in M5.1.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CAR_TOP, tallFootprint } from '../../src/sim/city/collectibles';
import { RAMP_HALF_WIDTH, type JumpDesc } from '../../src/sim/city/jumps';
import { HIGHWAY_HALF, projectOnLane } from '../../src/sim/city/roads';
import { createWorld } from './helpers';

/** The ground a jump needs: from 20 m before the foot to the landing at 90 km/h (35 m past the ridge) and the run-out. */
function corridor(jd: JumpDesc): { from: number; to: number; half: number } {
  return { from: -jd.length - 20, to: 35 + BALANCE.jumps.runOut, half: RAMP_HALF_WIDTH + 1 };
}

describe('stunt jumps (long)', () => {
  it('6.13 twenty ramps, the same for a seed, clear ahead, 120 m apart, off every carriageway', async () => {
    for (const seed of [42, 7, 123]) {
      const a = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      const b = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        // the kickers: the mega-ramp (M8.8 slice 21) flies over a street on purpose, pinned in jumps.test
        const jumps = a.jumps!.descs.filter((j) => !j.profile);
        expect(jumps.length).toBe(BALANCE.jumps.count);
        expect(b.jumps!.descs).toEqual(a.jumps!.descs);
        const hit = { x: 0, z: 0, yaw: 0 };
        for (const jd of jumps) {
          for (const o of jumps) if (o !== jd) expect(Math.hypot(o.x - jd.x, o.z - jd.z)).toBeGreaterThanOrEqual(120);
          const c = corridor(jd);
          // nothing a car would hit, up to car height, along the corridor (the ramps face an axis)
          const cells = new Set<string>();
          for (let d = c.from; d <= c.to; d += 20) {
            const x = jd.x + Math.sin(jd.yaw) * d, z = jd.z + Math.cos(jd.yaw) * d;
            cells.add(`${Math.round(x / 225)},${Math.round(z / 225)}`);
            // off the carriageways: every lane further than the highway's half width
            for (const lane of a.city!.graph.lanes) expect(Math.sqrt(projectOnLane(lane, x, z, hit))).toBeGreaterThan(HIGHWAY_HALF);
          }
          for (const key of cells) {
            const [cx, cz] = key.split(',').map(Number) as [number, number];
            for (const st of a.city!.generate(cx, cz).statics) {
              if (st.collisionOnly) continue;
              const box = tallFootprint(st, CAR_TOP);
              if (!box) continue;
              // the corridor as an axis-aligned box
              const corners = [[c.from, -c.half], [c.from, c.half], [c.to, -c.half], [c.to, c.half]].map(([al, ac]) => ({
                x: jd.x + Math.sin(jd.yaw) * (al as number) - Math.cos(jd.yaw) * (ac as number),
                z: jd.z + Math.cos(jd.yaw) * (al as number) + Math.sin(jd.yaw) * (ac as number),
              }));
              const minX = Math.min(...corners.map((p) => p.x)), maxX = Math.max(...corners.map((p) => p.x));
              const minZ = Math.min(...corners.map((p) => p.z)), maxZ = Math.max(...corners.map((p) => p.z));
              const overlaps = box.minX < maxX && box.maxX > minX && box.minZ < maxZ && box.maxZ > minZ;
              expect(overlaps, `ramp ${jd.id} blocked by a static at ${st.position.x.toFixed(1)},${st.position.z.toFixed(1)}`).toBe(false);
            }
          }
        }
      } finally { a.dispose(); b.dispose(); }
    }
  }, 180_000);
});
