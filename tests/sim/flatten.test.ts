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
import { createWorld, fullThrottle, kmh, run, runUntil, upness } from './helpers';

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

  /** The monster truck on a street lane, and a car standing across its way 25 m ahead (a sedan, or a parked unit). */
  async function across(unit: boolean): Promise<{ sim: SimWorld; car: number }> {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, body: 'monster' });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const lane = streetLane(sim);
    const p = { x: 0, z: 0, yaw: 0 }, c = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 30, 0, p);
    traffic.lanes.positionAt(lane, 55, 0, c);
    sim.city?.sync(p.x, p.z, true);
    sim.vehicle.teleport({ x: p.x, y: 2, z: p.z }, p.yaw);
    run(sim, 1);
    const car = unit ? traffic.spawnParkedPolice(c.x, c.z, c.yaw + Math.PI / 2, 'police')
      : traffic.spawnProp(c.x, c.z, c.yaw + Math.PI / 2, 'sedan', AgentState.Parked, 0xffffff);
    return { sim, car };
  }

  it('M8.8 12.1 at 30 km/h into a parked sedan the monster truck climbs it (0.6 m or more), flattens it and stays upright', async () => {
    const { sim, car } = await across(false);
    try {
      const y0 = sim.vehicle.body.translation().y;
      let top = y0, minUp = 1;
      run(sim, 5, (_t, c, s) => {
        c.throttle = kmh(s) < 30 ? 1 : 0;
        top = Math.max(top, s.vehicle.body.translation().y);
        minUp = Math.min(minUp, upness(s));
      });
      expect(sim.traffic!.flat[car]).toBe(1);
      expect(top - y0).toBeGreaterThanOrEqual(0.6);
      expect(minUp).toBeGreaterThan(0.9);
      expect(upness(sim)).toBeGreaterThan(0.97);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 12.2 the monster truck rests without creeping and lands the 16° ramp upright', async () => {
    const lot = await createWorld({ spawn: 'lot', body: 'monster' });
    try {
      run(lot, 1);
      const p0 = lot.vehicle.body.translation();
      run(lot, 6);
      const p1 = lot.vehicle.body.translation();
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
      expect(upness(lot)).toBeGreaterThan(0.99);
    } finally { lot.dispose(); }
    const jump = await createWorld({ spawn: 'ramps', body: 'monster' });
    try {
      run(jump, 1);
      runUntil(jump, 30, (s) => s.vehicle.body.translation().z > 105, fullThrottle);
      expect(runUntil(jump, 5, (s) => s.vehicle.telemetry.airborne, fullThrottle)).toBeGreaterThan(0);
      let minUpAir = 1;
      runUntil(jump, 5, (s) => !s.vehicle.telemetry.airborne, (_t, c, s) => { c.throttle = 1; minUpAir = Math.min(minUpAir, upness(s)); });
      run(jump, 1, fullThrottle);
      expect(minUpAir).toBeGreaterThan(0.85);
      expect(upness(jump)).toBeGreaterThan(0.97);
      expect(jump.vehicle.telemetry.groundedWheels).toBe(4);
    } finally { jump.dispose(); }
  }, 60_000);

  it('M8.8 12.3 a unit under the monster truck\'s wheels is flattened, a takedown', async () => {
    const { sim, car } = await across(true);
    try {
      const seq = sim.events.sequence;
      run(sim, 5, (_t, c, s) => { c.throttle = kmh(s) < 30 ? 1 : 0; });
      expect(sim.traffic!.flat[car]).toBe(1);
      let takedowns = 0;
      sim.events.readFrom(seq, (e) => { if ((e.kind === 'takedown' || e.kind === 'takedownTraffic') && e.target === car) takedowns++; });
      expect(takedowns).toBe(1);
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

  it('M8.8 12.4 the monster truck stands on the Gardens\' park strip between two jumps, on clear ground off the road', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const spot = STASH_SPOTS.monster;
      expect(districtAt(spot.x, spot.z).id).toBe('gardens');
      const near = Math.min(...sim.city!.jumps.map((j) => Math.hypot(j.x - spot.x, j.z - spot.z)));
      expect(near).toBeGreaterThan(20);
      expect(near).toBeLessThan(120);
      sim.city!.sync(spot.x, spot.z, true);
      run(sim, 0.1);
      // the strip between the edge parks' rows is the quarter's soil (dirt), the jumps' own ground
      expect(sim.city!.surface.at(spot.x, spot.z)).not.toBe(ASPHALT);
      let hits = 0;
      sim.world.intersectionsWithShape({ x: spot.x, y: 2.2, z: spot.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Cuboid(1.6, 1.6, 3.0), (col) => {
        if ((col.collisionGroups() >>> 16) !== (GROUPS_TERRAIN >>> 16)) hits++;
        return true;
      });
      expect(hits).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
