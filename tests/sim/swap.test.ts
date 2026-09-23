/**
 * Car-swap (docs/M3_PLAN.md slice 6): E next to a traffic car retunes the
 * player's vehicle in place, carries speed over, leaves the old car behind
 * with its driver shaking a fist, needs a candidate and the ground, works on
 * a wreck, and the new class drives like its preset.
 */
import { describe, expect, it } from 'vitest';
import { PedPose, type Pedestrians } from '../../src/sim/traffic/Pedestrians';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose } from '../../src/sim/traffic/lanes';
import { createWorld, kmh, run, runUntil } from './helpers';

const pose: LanePose = { x: 0, z: 0, yaw: 0 };

function streetLane(traffic: Traffic, minLength = 120): number {
  for (let i = 0; i < traffic.lanes.laneCount; i++) if ((traffic.lanes.limit[i] as number) === 14 && (traffic.lanes.length[i] as number) > minLength) return i;
  return 0;
}

function highwayLane(traffic: Traffic): number {
  for (let i = 0; i < traffic.lanes.laneCount; i++) if ((traffic.lanes.limit[i] as number) === traffic.tuning.speedHighway) return i;
  return 0;
}

/** Hold a horizontal speed along `yaw` without lifting the car: the vertical velocity is kept. */
function push(sim: Awaited<ReturnType<typeof createWorld>>, yaw: number, speed: number): void {
  sim.vehicle.setVelocity(Math.sin(yaw) * speed, sim.vehicle.telemetry.vy, Math.cos(yaw) * speed);
}

function events(sim: Awaited<ReturnType<typeof createWorld>>, kind: string): number {
  let n = 0;
  sim.events.readFrom(0, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('car-swap', () => {
  it('takes the car alongside, carries the speed, leaves the old car and a fist-shaking driver', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const peds = sim.peds as Pedestrians;
    const lane = streetLane(traffic);
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const yaw = pose.yaw;
    run(sim, 0.5); // settle on the wheels before pushing
    const agent = traffic.spawnAt(lane, 40, 'compact', AgentState.Kinematic, -2.5);
    traffic.speed[agent] = 11;
    // the M3 driver: the lane's limit, no weave (M5.5 drivers draw a pace and a temper at spawn)
    traffic.pace[agent] = 1;
    traffic.bad[agent] = 0;
    try {
      run(sim, 1, () => { push(sim, yaw, 11); });
      expect(sim.life.state.swapCandidate).toBe(agent);
      const oldX = sim.vehicle.body.translation().x;
      const oldZ = sim.vehicle.body.translation().z;
      const agentX = traffic.x[agent] as number;
      const agentZ = traffic.z[agent] as number;
      const agentSpeed = traffic.speed[agent];
      sim.controls.swap = true;
      sim.step();
      expect(sim.carId).toBe('compact');
      const p = sim.vehicle.body.translation();
      expect(Math.hypot(p.x - agentX, p.z - agentZ)).toBeLessThan(1.5);
      expect(Math.abs(sim.vehicle.telemetry.speed - agentSpeed)).toBeLessThan(agentSpeed * 0.1 + 0.3);
      expect(sim.life.state.damage).toBe(0);
      expect(sim.vehicle.tuning.mass).toBe(1050);
      // the old car stands where the player was, as the player's class, abandoned
      expect(traffic.state[agent]).toBe(AgentState.Abandoned);
      expect(traffic.kindOf(agent)).toBe('muscle');
      expect(Math.hypot((traffic.x[agent] as number) - oldX, (traffic.z[agent] as number) - oldZ)).toBeLessThan(1);
      let fist = -1;
      for (let i = 0; i < peds.capacity; i++) if (peds.active[i] && peds.pose[i] === PedPose.Fist) fist = i;
      expect(fist).toBeGreaterThanOrEqual(0);
      expect(Math.hypot((peds.x[fist] as number) - oldX, (peds.z[fist] as number) - oldZ)).toBeLessThan(4);
      expect(events(sim, 'swap')).toBe(1);
      // it settles as a physical obstacle the next steps and stays put
      run(sim, 2);
      expect(traffic.state[agent]).toBe(AgentState.Abandoned);
      expect(Math.hypot((traffic.x[agent] as number) - oldX, (traffic.z[agent] as number) - oldZ)).toBeLessThan(2);
    } finally { sim.dispose(); }
  }, 30_000);

  it('does nothing without a candidate, and never in the air', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = streetLane(traffic);
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 52, 'compact');
    traffic.speed[agent] = 0;
    try {
      run(sim, 0.5, () => { traffic.speed[agent] = 0; });
      expect(sim.life.state.swapCandidate).toBe(-1);
      sim.controls.swap = true;
      sim.step();
      expect(sim.carId).toBe('muscle');
      expect(events(sim, 'swap')).toBe(0);
      // alongside but airborne: no swap (one step after the teleport so the telemetry sees the wheels in the air)
      traffic.lanes.positionAt(lane, traffic.s[agent] as number, 0, pose);
      sim.vehicle.teleport({ x: pose.x, y: 4, z: pose.z }, pose.yaw);
      sim.step();
      expect(sim.vehicle.telemetry.groundedWheels).toBe(0);
      sim.controls.swap = true;
      sim.step();
      expect(sim.carId).toBe('muscle');
      expect(events(sim, 'swap')).toBe(0);
    } finally { sim.dispose(); }
  }, 30_000);

  it('swaps out of a wreck into a fresh car, and the old wreck stays a wreck', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    // east boundary wall at x = 787.5: from the highway lane at x ~ 681, 110 km/h toward +x
    const lane = highwayLane(traffic);
    traffic.lanes.positionAt(lane, 100, 0, pose);
    const yaw = Math.PI / 2; // +x
    sim.vehicle.teleport({ x: 700, y: 1, z: pose.z, }, yaw);
    try {
      run(sim, 0.5);
      let wrecked = false;
      for (let i = 0; i < 6 * 60 && !wrecked; i++) {
        if (i < 30) push(sim, yaw, 110 / 3.6);
        sim.step();
        wrecked = sim.life.state.wrecked;
      }
      expect(wrecked).toBe(true);
      expect(sim.vehicle.engineCut).toBe(true);
      const p = sim.vehicle.body.translation();
      const agent = traffic.spawnAtPoint(p.x, p.z + 3, yaw, 'heavy', AgentState.Wrecked);
      sim.step();
      expect(sim.life.state.swapCandidate).toBe(agent);
      sim.controls.swap = true;
      sim.step();
      expect(sim.carId).toBe('heavy');
      expect(sim.life.state.wrecked).toBe(false);
      expect(sim.vehicle.engineCut).toBe(false);
      expect(sim.life.state.damage).toBe(0);
      expect(traffic.state[agent]).toBe(AgentState.Wrecked);
      expect(traffic.kindOf(agent)).toBe('muscle');
    } finally { sim.dispose(); }
  }, 30_000);

  it('drives like the new class after the swap', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = highwayLane(traffic);
    traffic.lanes.positionAt(lane, 10, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    run(sim, 0.5); // settle on the wheels
    // a parked compact 2.5 m to the right (right of +Z heading is -X)
    const p0 = sim.vehicle.body.translation();
    const agent = traffic.spawnAtPoint(p0.x - Math.cos(pose.yaw) * 2.5, p0.z + Math.sin(pose.yaw) * 2.5, pose.yaw, 'compact', AgentState.Abandoned);
    try {
      run(sim, 0.3);
      expect(sim.life.state.swapCandidate).toBe(agent);
      sim.controls.swap = true;
      sim.step();
      expect(sim.carId).toBe('compact');
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.5);
      const t = runUntil(sim, 20, (s) => kmh(s) >= 100, (_t, c) => { c.throttle = 1; });
      // cars.test.ts pins the compact at 9-13 s
      expect(t).toBeGreaterThan(8.5);
      expect(t).toBeLessThan(13.5);
    } finally { sim.dispose(); }
  }, 60_000);
});
