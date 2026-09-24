/**
 * The thick trees' trunks over the whole island (M8 slice 2, D8): each in the physics ring as a wall where its chunk
 * is loaded, none in a D7 clearance. Long: it loads every chunk's collision.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BLOCK } from '../../src/sim/city/roads';
import { GROUP_PROP } from '../../src/sim/collision';
import { Clearances } from './clearances';
import { createWorld } from './helpers';

describe('the trees over the island (M8 slice 2, long)', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false }); });
  afterAll(() => sim.dispose());

  it('M8 2.1 every thick trunk of the 49 chunks has its collider in the ring, and none stands in a clearance', () => {
    const city = sim.city!, clear = new Clearances(sim);
    let trunks = 0;
    const why: string[] = [];
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      city.sync(cx * BLOCK, cz * BLOCK, true);
      const posts: Array<{ x: number; z: number; r: number }> = [];
      sim.world.colliders.forEach((c) => {
        if (c.collisionGroups() >>> 16 !== GROUP_PROP || !c.parent()?.isFixed()) return;
        const t = c.translation();
        posts.push({ x: t.x, z: t.z, r: c.radius() });
      });
      for (const st of city.chunk(cx, cz).statics) {
        if (st.tag !== 'trunk' || st.shape.kind !== 'cylinder') continue;
        trunks++;
        const at = `trunk at ${st.position.x.toFixed(1)},${st.position.z.toFixed(1)}`;
        if (!posts.some((p) => Math.hypot(p.x - st.position.x, p.z - st.position.z) < 0.01 && Math.abs(p.r - (st.shape as { radius: number }).radius) < 1e-4)) why.push(`${at}: no collider`);
        const r = st.shape.radius;
        clear.point(st.position, at, why);
        for (let k = 0; k < 8; k++) clear.point({ x: st.position.x + Math.cos(k * Math.PI / 4) * r, z: st.position.z + Math.sin(k * Math.PI / 4) * r }, at, why);
      }
    }
    expect(trunks).toBeGreaterThan(100);
    expect(why.slice(0, 12)).toEqual([]);
  }, 60_000);
});
