/**
 * Kinematic traffic on the city graph: braking for a stopped player, wrecks and
 * towing. The flow, lane holding and separation over a long bot drive are in
 * traffic.long.test.ts; determinism, the cost of a full pool and lent bodies in
 * traffic.pool.long.test.ts.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose, LaneProjection } from '../../src/sim/traffic/lanes';
import { createWorld, run } from './helpers';

const pose: LanePose = { x: 0, z: 0, yaw: 0 };

describe('traffic', () => {

  it('stops behind a stopped player and does not hit them', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lanes = traffic.lanes;
    let lane = -1;
    for (let i = 0; i < lanes.laneCount; i++) {
      if ((lanes.limit[i] as number) === 14 && (lanes.length[i] as number) > 110) { lane = i; break; }
    }
    expect(lane).toBeGreaterThanOrEqual(0);
    lanes.positionAt(lane, 90, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    expect(agent).toBeGreaterThanOrEqual(0);
    try {
      run(sim, 8);
      const here = sim.vehicle.body.translation();
      const proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      lanes.project(lane, here.x, here.z, proj);
      const along = proj.s - (traffic.s[agent] as number);
      const hits: string[] = [];
      sim.events.readFrom(0, (e) => { if (e.kind === 'hit') hits.push(e.kind); });
      expect(hits).toEqual([]);
      expect(traffic.speed[agent] as number).toBeLessThan(1);
      expect(along).toBeGreaterThanOrEqual(5);
      expect(along).toBeLessThanOrEqual(9);
    } finally { sim.dispose(); }
  }, 30_000);

  it('pushes a car in a rear-end and keeps most of the player speed', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 120);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    traffic.speed[agent] = 10;
    let hitAt = -1;
    let hitSpeed = 0;
    let pushed = false;
    let maxSpeed = 0;
    let after = -1;
    try {
      for (let i = 0; i < 180; i++) {
        const yaw = pose.yaw;
        if (hitAt < 0 && i < 25) sim.vehicle.setVelocity(Math.sin(yaw) * (80 / 3.6), 0, Math.cos(yaw) * (80 / 3.6));
        sim.step();
        maxSpeed = Math.max(maxSpeed, traffic.speed[agent]);
        if (maxSpeed > 12) pushed = true;
        if (hitAt < 0) {
          sim.events.readFrom(0, (e) => {
            if (e.kind === 'hit' && e.target === agent) hitAt = sim.time;
          });
          if (hitAt >= 0) hitSpeed = Math.abs(sim.vehicle.telemetry.speed);
        } else if (sim.time >= hitAt + 1 && after < 0) {
          after = Math.abs(sim.vehicle.telemetry.speed);
          break;
        }
      }
      expect(hitAt).toBeGreaterThan(0);
      expect(hitAt).toBeLessThan(2);
      expect(pushed).toBe(true);
      expect(after).toBeGreaterThan(hitSpeed * 0.25);
      expect(after).toBeLessThan(hitSpeed * 0.85);
      expect(sim.hasNaN()).toBe(false);
      const held = traffic.state[agent] === AgentState.Disturbed || traffic.state[agent] === AgentState.Physical || traffic.state[agent] === AgentState.Wrecked;
      expect(held).toBe(true);
    } finally { sim.dispose(); }
  }, 30_000);

  it('knocks a stopped physical car sideways in a T-bone and stays upright', async () => {
    const sim = await createWorld({ map: 'city', seed: 5, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 120);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    // A stopped car across the lane: a wreck is a physical obstacle that never drives off.
    const agent = traffic.spawnAt(lane, 48, 'compact', AgentState.Wrecked);
    sim.step();
    expect(traffic.hasBody(agent)).toBe(true);
    traffic.setFacing(agent, pose.yaw + Math.PI / 2);
    const x0 = traffic.x[agent] as number;
    const z0 = traffic.z[agent] as number;
    const fx = Math.sin(pose.yaw);
    const fz = Math.cos(pose.yaw);
    let moved = 0;
    try {
      for (let i = 0; i < 100; i++) {
        if (i < 15) sim.vehicle.setVelocity(fx * (100 / 3.6), 0, fz * (100 / 3.6));
        sim.step();
        const dx = (traffic.x[agent] as number) - x0;
        const dz = (traffic.z[agent] as number) - z0;
        moved = Math.max(moved, Math.abs(dx * fx + dz * fz));
      }
      expect(moved).toBeGreaterThanOrEqual(3);
      expect(upnessOf(sim)).toBeGreaterThan(0.8);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 30_000);

  it('keeps a wreck as a stopped obstacle', async () => {
    const sim = await createWorld({ map: 'city', seed: 11, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 140);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 30, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 44, 'compact');
    try {
      // ram it hard enough for wreckImpact
      let wrecked = false;
      for (let i = 0; i < 240 && !wrecked; i++) {
        if (i < 20) sim.vehicle.setVelocity(Math.sin(pose.yaw) * 40, 0, Math.cos(pose.yaw) * 40);
        sim.step();
        wrecked = traffic.state[agent] === AgentState.Wrecked;
      }
      console.log(`[traffic] wreck by impact: ${wrecked}`);
      if (!wrecked) traffic.wreck(agent);
      // let the flung wreck slide to a stop, then park the player 15 m behind it so the pool keeps it, and watch 15 s
      run(sim, 6); // no input: the brake from a standstill would engage reverse
      const wx = traffic.x[agent] as number;
      const wz = traffic.z[agent] as number;
      sim.vehicle.teleport({ x: wx - Math.sin(pose.yaw) * 15, y: 1, z: wz - Math.cos(pose.yaw) * 15 }, pose.yaw);
      run(sim, 1);
      const x0 = traffic.x[agent] as number;
      const z0 = traffic.z[agent] as number;
      run(sim, 15);
      expect(traffic.state[agent]).toBe(AgentState.Wrecked);
      expect(traffic.speed[agent] as number).toBeLessThan(0.1);
      expect(Math.hypot((traffic.x[agent] as number) - x0, (traffic.z[agent] as number) - z0)).toBeLessThan(0.5);
      // still an obstacle: the body pool keeps it while the player is near
      expect(traffic.hasBody(agent)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('returns a body once the player drives away', async () => {
    const sim = await createWorld({ map: 'city', seed: 9, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 140);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 30, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 48, 'muscle');
    let disturbed = false;
    try {
      for (let i = 0; i < 150 && !disturbed; i++) {
        sim.vehicle.setVelocity(Math.sin(pose.yaw) * 25, 0, Math.cos(pose.yaw) * 25);
        sim.step();
        disturbed = traffic.state[agent] === AgentState.Disturbed || traffic.state[agent] === AgentState.Wrecked;
      }
      expect(disturbed).toBe(true);
      traffic.lanes.positionAt(lane, 30, 0, pose);
      const away = 90;
      sim.vehicle.teleport({ x: pose.x + Math.sin(pose.yaw) * -away, y: 1, z: pose.z + Math.cos(pose.yaw) * -away }, pose.yaw);
      for (let i = 0; i < 90; i++) sim.step();
      const dx = (traffic.x[agent] as number) - sim.vehicle.body.translation().x;
      const dz = (traffic.z[agent] as number) - sim.vehicle.body.translation().z;
      expect(Math.hypot(dx, dz)).toBeLessThan(traffic.tuning.despawn);
      expect(traffic.state[agent]).not.toBe(AgentState.Free);
      expect(traffic.state[agent] === AgentState.Kinematic || traffic.state[agent] === AgentState.Wrecked).toBe(true);
      expect(traffic.state[agent]).not.toBe(AgentState.Physical);
      expect(traffic.state[agent]).not.toBe(AgentState.Disturbed);
    } finally { sim.dispose(); }
  }, 30_000);

  it('tows a wreck away once it is old enough and out of sight, and never one in view', async () => {
    const sim = await createWorld({ map: 'city', seed: 9, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const tow = traffic.tuning.wreckTow;
    try {
      const lane = longLane(traffic, 14, 120);
      traffic.lanes.positionAt(lane, 60, 0, pose);
      // Facing +Z: a wreck 80 m up the +Z axis is inside the view cone, one 80 m down it is behind.
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, 0);
      const behind = traffic.spawnAtPoint(pose.x, pose.z - 80, 0, 'compact', AgentState.Wrecked);
      const ahead = traffic.spawnAtPoint(pose.x, pose.z + 80, 0, 'compact', AgentState.Wrecked);
      expect(behind).toBeGreaterThanOrEqual(0);
      expect(ahead).toBeGreaterThanOrEqual(0);

      run(sim, tow - 2);
      expect(traffic.state[behind]).toBe(AgentState.Wrecked);
      expect(traffic.wreckedFor[behind] as number).toBeGreaterThan(tow - 3);
      expect(traffic.towedAway).toBe(0);

      run(sim, 3);
      expect(traffic.state[behind]).toBe(AgentState.Free);
      expect(traffic.towedAway).toBe(1);
      // The one the player is looking at stays where it died, however long it sits there.
      expect(traffic.state[ahead]).toBe(AgentState.Wrecked);
      expect(traffic.wreckedFor[ahead] as number).toBeGreaterThan(tow);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

});

function longLane(traffic: Traffic, limit: number, minLength: number): number {
  for (let i = 0; i < traffic.lanes.laneCount; i++) {
    if ((traffic.lanes.limit[i] as number) === limit && (traffic.lanes.length[i] as number) > minLength) return i;
  }
  return 0;
}

function upnessOf(sim: { vehicle: { slot: number }; transforms: { currRot: Float32Array } }): number {
  const q = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  const x = q[i] as number;
  const z = q[i + 2] as number;
  return 1 - 2 * (x * x + z * z);
}
