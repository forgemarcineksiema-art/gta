/**
 * The fifty billboards checked island-wide (M3): clearance and run-out against every chunk.
 * Long: run by `npm run verify:gate` and `npm run test:long` (CLAUDE.md), moved
 * unchanged from `collectibles.test.ts` in M5.1.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { initPhysics } from '../../src/sim';
import { City, type CityChunk } from '../../src/sim/city/City';
import { distanceToPolyline } from '../../src/sim/city/roads';
import { CAR_TOP, PANEL_TOP, panelFootprint, runOutFootprint, tallFootprint } from '../../src/sim/city/collectibles';

beforeAll(initPhysics);

function allChunks(city: City): CityChunk[] {
  const out: CityChunk[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(city.generate(cx, cz));
  return out;
}

describe('billboards (long)', () => {
  it('stand clear of anything taller than a metre with a run-out either side, off the carriageways and near a road', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const city = new City(world, 42);
    try {
      for (const chunk of allChunks(city)) {
        for (const b of chunk.billboards) {
          // the panel's own footprint clear up to its top; ten metres of run-out either side clear up to car height
          const box = panelFootprint(b);
          const sweep = runOutFootprint(b);
          const overlaps = (a: typeof box, c: typeof box): boolean => a.minX < c.maxX && a.maxX > c.minX && a.minZ < c.maxZ && a.maxZ > c.minZ;
          for (const st of chunk.statics) {
            const where = `billboard ${b.id} in chunk ${chunk.key} meets a ${st.shape.kind} tagged ${st.tag ?? '?'} at ${st.position.x.toFixed(0)},${st.position.z.toFixed(0)}`;
            const tall = tallFootprint(st, PANEL_TOP);
            expect(tall !== null && overlaps(box, tall), where).toBe(false);
            const low = tallFootprint(st, CAR_TOP);
            expect(low !== null && overlaps(sweep, low), `${where} in the run-out`).toBe(false);
          }
          for (const road of city.graph.special) {
            expect(distanceToPolyline(road.centre, b.x, b.z) - road.halfWidth).toBeGreaterThanOrEqual(6.5);
          }
          // off every grid carriageway: streets run along the chunk centre lines at multiples of 225 m
          const offStreetX = Math.abs(b.x - Math.round(b.x / 225) * 225);
          const offStreetZ = Math.abs(b.z - Math.round(b.z / 225) * 225);
          const halfX = Math.abs(Math.round(b.x / 225)) === 3 ? 19 : 12;
          const halfZ = Math.abs(Math.round(b.z / 225)) === 3 ? 19 : 12;
          expect(offStreetX >= halfX + 0.5 || offStreetZ >= halfZ + 0.5).toBe(true);
          const near = city.nearestRoad(b.x, b.z, { name: 'n', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
          expect(Math.hypot(near.position.x - b.x, near.position.z - b.z), `billboard ${b.id} in chunk ${chunk.key} at ${b.x.toFixed(0)},${b.z.toFixed(0)} is far from a lane`).toBeLessThan(25);
        }
      }
    } finally { world.free(); }
  });
});
