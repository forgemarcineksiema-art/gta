/**
 * The trees by their trunks (M8 slice 2, docs/M8_PLAN.md D8): a thick tree (a park's, a front garden's, the quay's
 * palms) has a solid trunk in the physics ring, a wall, and stands clear of every D7 clearance; a street tree is a
 * staked sapling that snaps at speed and costs the rule's share of it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BLOCK } from '../../src/sim/city/roads';
import { CAR_TOP, tallFootprint } from '../../src/sim/city/collectibles';
import { GROUP_PROP } from '../../src/sim/collision';
import { PROP_TYPES, type PropDesc } from '../../src/sim/city/props';
import { PropState, carSpeedLoss } from '../../src/sim/props/Props';
import type { StaticDesc } from '../../src/sim/scene';
import { Clearances } from './clearances';
import { createWorld, run } from './helpers';

const KMH = 1 / 3.6;

describe('the trees (M8 slice 2)', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, car: 'compact' }); });
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

  it('M8 2.2 the compact at 40 km/h into a park tree: a wall\'s hit and damage; at 60 through a sapling it snaps at the rule\'s cost', () => {
    const city = sim.city!;
    // a trunk with 12 m of clear ground on one side: the approach
    sim.spawnAt('gardens');
    let found: { st: StaticDesc; yaw: number } | null = null;
    for (const entry of city.active.values()) {
      for (const st of entry.chunk.statics) {
        if (st.tag !== 'trunk' || found) continue;
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          const blocked = [...city.active.values()].some((e) => e.chunk.statics.some((o) => {
            if (o === st) return false;
            const f = tallFootprint(o, CAR_TOP);
            if (!f) return false;
            for (let d = 1; d <= 12; d += 0.5) {
              const x = st.position.x - fx * d, z = st.position.z - fz * d;
              if (x > f.minX - 1.2 && x < f.maxX + 1.2 && z > f.minZ - 1.2 && z < f.maxZ + 1.2) return true;
            }
            return false;
          }));
          const props = [...city.active.values()].some((e) => city.props(e.chunk.x, e.chunk.z).some((p) => {
            for (let d = 1; d <= 12; d += 0.5) if (Math.hypot(p.x - (st.position.x - fx * d), p.z - (st.position.z - fz * d)) < 2) return true;
            return false;
          }));
          if (!blocked && !props) { found = { st, yaw }; break; }
        }
      }
    }
    expect(found).not.toBeNull();
    const { st, yaw } = found!;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    sim.vehicle.teleport({ x: st.position.x - fx * 10, y: 1, z: st.position.z - fz * 10 }, yaw);
    run(sim, 0.4);
    const seq = sim.events.sequence;
    const lv = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 90; i++) {
      if (sim.events.sequence === seq || i < 30) sim.vehicle.setVelocity(fx * 40 * KMH, sim.vehicle.body.linvel(lv).y, fz * 40 * KMH);
      sim.step();
    }
    const hits: number[] = [];
    sim.events.readFrom(seq, (e) => { if (e.kind === 'hit') hits.push(e.value); });
    expect(hits.length).toBeGreaterThan(0);
    expect(Math.max(...hits)).toBeGreaterThan(8);
    expect(sim.life.state.damage).toBeGreaterThan(0);
    // the car stopped at it: the trunk held
    expect(Math.hypot(sim.vehicle.body.linvel(lv).x, lv.z)).toBeLessThan(3);

    // a sapling at 60 km/h, head on from the road
    sim.life.heal();
    let sapling: PropDesc | null = null;
    for (const entry of city.active.values()) {
      const list = city.props(entry.chunk.x, entry.chunk.z);
      for (const p of list) if (!sapling && p.kind === 'sapling' && !list.some((o) => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 6)) sapling = p;
    }
    expect(sapling).not.toBeNull();
    const p = sapling!, sx = Math.sin(p.yaw), sz = Math.cos(p.yaw), carYaw = Math.atan2(-sx, -sz);
    sim.vehicle.teleport({ x: p.x + sx * 9, y: 1, z: p.z + sz * 9 }, carYaw);
    run(sim, 0.4);
    const v = 60 * KMH;
    let before = 0, after = 0;
    for (let i = 0; i < 120 && sim.props!.state[p.id] === PropState.Standing; i++) {
      sim.vehicle.setVelocity(Math.sin(carYaw) * v, sim.vehicle.body.linvel(lv).y, Math.cos(carYaw) * v);
      before = Math.hypot(lv.x, lv.z);
      sim.step();
      after = Math.hypot(sim.vehicle.body.linvel(lv).x, lv.z);
    }
    expect(sim.props!.state[p.id]).not.toBe(PropState.Standing);
    const want = carSpeedLoss(sim.vehicle.tuning.mass, PROP_TYPES.sapling, before)! / before;
    // the compact's 1,050 kg: 8 % (the plan's 6 % is a 1,400 kg car's)
    expect(Math.abs((before - after) / before - want)).toBeLessThan(0.01);
    expect(want).toBeGreaterThan(0.07);
  }, 60_000);
});
