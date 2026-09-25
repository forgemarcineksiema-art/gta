/**
 * The pancake and the steamroller (M8.8 slice 11): every car its front drum touches is flattened, at any speed (a
 * squashed wreck, its driver out shaking a fist, one `flatten` event), a roadblock's car too, which breaches the block;
 * the roller does 30–40 km/h flat out; it stands on clear ground in the Works' yard until a swap finds it.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { GIANT_BALL, STASH_SPOTS } from '../../src/sim/city/stash';
import type { Chokepoint } from '../../src/sim/city/cover';
import type { Lane } from '../../src/sim/city/roads';
import { districtAt } from '../../src/sim/city/City';
import { ASPHALT } from '../../src/sim/city/surface';
import { GROUPS_TERRAIN } from '../../src/sim/collision';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { PedPose } from '../../src/sim/traffic/Pedestrians';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, fullThrottle, kmh, run, runUntil } from './helpers';

/** A straight two-point street lane at least `min` m long. */
function streetLane(sim: SimWorld, min = 150): number {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < min) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2) continue;
    return i;
  }
  throw new Error('no street lane');
}

function fists(sim: SimWorld): number {
  const peds = sim.peds!;
  let n = 0;
  for (let i = 0; i < peds.active.length; i++) if (peds.active[i] === 1 && peds.pose[i] === PedPose.Fist) n++;
  return n;
}

function count(sim: SimWorld, kind: string, from: number): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('M8.8 slice 11: the pancake and the steamroller', () => {
  it('M8.8 11.1 a sedan the drum touches at 10 km/h is a flattened wreck, its driver out, one event', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, body: 'roller' });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      const p = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(lane, 40, 0, p);
      sim.city?.sync(p.x, p.z, true);
      sim.vehicle.teleport({ x: p.x, y: 1, z: p.z }, p.yaw);
      run(sim, 0.5);
      const car = traffic.spawnAt(lane, 55, 'sedan');
      // it waits where it is: the drum comes to it
      traffic.pace[car] = 0;
      const seq = sim.events.sequence, before = fists(sim);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), v = 10 / 3.6;
      expect(runUntil(sim, 8, (s) => s.traffic!.flat[car] === 1, (_t, _c, s) => s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v))).toBeGreaterThan(0);
      run(sim, 0.2);
      expect(traffic.state[car]).toBe(AgentState.Wrecked);
      expect(traffic.hasBody(car)).toBe(false);
      expect(count(sim, 'flatten', seq)).toBe(1);
      expect(fists(sim)).toBe(before + 1);
      // the roller drives on over it: 2 s at 10 km/h is 5.6 m, nothing holding it back
      const along = (): number => (sim.vehicle.body.translation().x - p.x) * fx + (sim.vehicle.body.translation().z - p.z) * fz;
      const a0 = along();
      run(sim, 2, (_t, _c, s) => s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v));
      expect(along() - a0).toBeGreaterThan(5);
      expect(count(sim, 'flatten', seq)).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 11.2 a roadblock\'s car flattened breaches the roadblock: the block comes down and the bag pays', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60, body: 'roller' });
    sim.police!.dispatching = false;
    try {
      const graph = sim.city!.graph;
      const site = sim.cover!.chokepoints.find((c: Chokepoint) => {
        const lane = graph.lanes[c.lane] as Lane;
        return lane.highway && lane.offset === 4 && Math.abs(c.x + 679) < 1 && Math.abs(c.yaw) < 0.01 && c.z > 100 && c.z < 300;
      }) as Chokepoint;
      (sim.traffic as Traffic).clearAround(site.x, site.z, 80);
      sim.pursuit.force();
      sim.roadblocks!.raise(site);
      const blocker = sim.roadblocks!.agents[1];
      expect(blocker).toBeGreaterThanOrEqual(0);
      // straight at the car half, 25 m back, 20 km/h
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw), right = POLICE.roadblock.gap / 2, v = 20 / 3.6;
      const x = site.x - fx * 25 - fz * right, z = site.z - fz * 25 + fx * right;
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x, y: 1, z }, site.yaw);
      run(sim, 0.4, (_t, c, s) => { c.brake = 1; s.pursuit.force(); });
      const bag = sim.run.bag, broken = sim.roadblocks!.broken;
      expect(runUntil(sim, 8, (s) => s.roadblocks!.active === 0, (_t, _c, s) => {
        s.pursuit.force();
        s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v);
      })).toBeGreaterThan(0);
      expect((sim.traffic as Traffic).flat[blocker]).toBe(1);
      expect(sim.roadblocks!.broken).toBe(broken + 1);
      expect(sim.run.bag - bag).toBeGreaterThanOrEqual(BALANCE.bag.roadblock);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 11.3 the steamroller\'s top speed is 30-40 km/h', async () => {
    const sim = await createWorld({ spawn: 'straight', body: 'roller' });
    try {
      run(sim, 1);
      let top = 0;
      run(sim, 20, (_t, c, s) => { fullThrottle(_t, c, s); top = Math.max(top, kmh(s)); });
      expect(top).toBeGreaterThan(30);
      expect(top).toBeLessThan(40);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 11.4 its stash spot is clear ground in the Works\' yard', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const spot = STASH_SPOTS.roller;
      expect(districtAt(spot.x, spot.z).id).toBe('foundry');
      expect(Math.hypot(spot.x - GIANT_BALL.x, spot.z - GIANT_BALL.z)).toBeGreaterThan(10);
      sim.city!.sync(spot.x, spot.z, true);
      run(sim, 0.1);
      expect(sim.city!.surface.at(spot.x, spot.z)).toBe(ASPHALT);
      // nothing but the ground under the roller's footprint, from a kerb's height up to its roof
      let hits = 0;
      const shape = new RAPIER.Cuboid(1.3, 1.1, 3.2);
      const rot = { x: 0, y: Math.sin(spot.yaw / 2), z: 0, w: Math.cos(spot.yaw / 2) };
      sim.world.intersectionsWithShape({ x: spot.x, y: 1.4, z: spot.z }, rot, shape, (col) => {
        if ((col.collisionGroups() >>> 16) !== (GROUPS_TERRAIN >>> 16)) hits++;
        return true;
      });
      expect(hits).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
