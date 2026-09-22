/**
 * Takedowns (docs/M3_PLAN.md slice 7): shoving a car the player has just hit
 * into a wall or into another car wrecks it, pays boost and starts the slow
 * motion; an open-road rear-end is not a takedown; a wreck cannot be taken
 * down twice.
 */
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../../src/sim/economy';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** The island's east boundary wall face (a fixed, restitution-1 solid) is at x = 786.5. */
const WALL_FACE = 786.5;

function count(sim: Awaited<ReturnType<typeof createWorld>>, kind: string): number {
  let n = 0;
  sim.events.readFrom(0, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('takedowns', () => {
  it('into a wall: the shoved car wrecks, boost is paid, slow motion runs and ends', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const yaw = Math.PI / 2; // +x, toward the wall
    const z = 100;
    sim.vehicle.teleport({ x: WALL_FACE - 26, y: 1, z }, yaw);
    // a parked compact with its nose 1.6 m from the wall; the ram at 47 km/h is under the direct-hit closing
    // speed, so only the slam into the wall can score it
    const agent = traffic.spawnAtPoint(WALL_FACE - 3.5, z, yaw, 'compact', AgentState.Abandoned);
    sim.vehicle.boostMeter = 0.2;
    try {
      run(sim, 0.5);
      expect(traffic.hasBody(agent)).toBe(true);
      let takedownAt = -1;
      let slowMoSeen = 0;
      let paid = 0;
      for (let i = 0; i < 4 * 60; i++) {
        if (i < 60) sim.vehicle.setVelocity(Math.sin(yaw) * (49 / 3.6), sim.vehicle.telemetry.vy, Math.cos(yaw) * (49 / 3.6));
        const boostBefore = sim.vehicle.boostMeter;
        sim.step();
        slowMoSeen = Math.max(slowMoSeen, sim.life.state.slowMo);
        if (takedownAt < 0 && count(sim, 'takedown') > 0) { takedownAt = sim.time; paid = sim.vehicle.boostMeter - boostBefore; }
      }
      expect(takedownAt).toBeGreaterThan(0);
      expect(takedownAt).toBeLessThan(2.5);
      expect(traffic.state[agent]).toBe(AgentState.Wrecked);
      // the takedown step pays its boost (the wrong-way lane pays a trickle on top over the run)
      expect(paid).toBeGreaterThanOrEqual(ECONOMY.takedownBoost - 0.01);
      expect(paid).toBeLessThanOrEqual(ECONOMY.takedownBoost + 0.02);
      expect(slowMoSeen).toBeCloseTo(ECONOMY.slowMoSeconds, 2);
      // slow motion counts down in sim time at dt / slowMoScale: 1.2 s of wall time is 0.42 s of sim time
      expect(sim.life.state.slowMo).toBe(0);
      expect(count(sim, 'takedown')).toBe(1);
    } finally { sim.dispose(); }
  }, 30_000);

  it('into traffic: the shoved car hits another car and wrecks with the bigger bonus', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const yaw = Math.PI / 2;
    const z = 100;
    sim.vehicle.teleport({ x: WALL_FACE - 80, y: 1, z }, yaw);
    // A compact parked 1.5 m behind a heavy. The ram is held for a second and then coasts the last
    // 13 m, so what lands on the compact is ~44 km/h: enough to shove it into the heavy, still under
    // the 14 m/s direct-hit closing speed. The launch speed is what the coast (engine braking, and so
    // the gearing) leaves at that distance, hence 49 rather than a round 47.
    const first = traffic.spawnAtPoint(WALL_FACE - 54, z, yaw, 'compact', AgentState.Abandoned);
    const second = traffic.spawnAtPoint(WALL_FACE - 48, z, yaw, 'heavy', AgentState.Abandoned);
    sim.vehicle.boostMeter = 0.1;
    try {
      run(sim, 0.5);
      for (let i = 0; i < 4 * 60; i++) {
        if (i < 60) sim.vehicle.setVelocity(Math.sin(yaw) * (49 / 3.6), sim.vehicle.telemetry.vy, Math.cos(yaw) * (49 / 3.6));
        sim.step();
      }
      expect(count(sim, 'takedownTraffic')).toBeGreaterThanOrEqual(1);
      expect(traffic.state[first]).toBe(AgentState.Wrecked);
      expect(sim.vehicle.boostMeter).toBeGreaterThanOrEqual(0.1 + ECONOMY.takedownTrafficBoost - 0.01);
      void second;
    } finally { sim.dispose(); }
  }, 30_000);

  it('a hard direct hit at closing speed is a takedown on its own', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const yaw = Math.PI / 2;
    const z = 100;
    sim.vehicle.teleport({ x: WALL_FACE - 80, y: 1, z }, yaw);
    // parked across the road, far from any wall
    const agent = traffic.spawnAtPoint(WALL_FACE - 50, z, yaw + Math.PI / 2, 'compact', AgentState.Abandoned);
    try {
      run(sim, 0.5);
      for (let i = 0; i < 2 * 60; i++) {
        if (i < 40) sim.vehicle.setVelocity(Math.sin(yaw) * (100 / 3.6), sim.vehicle.telemetry.vy, Math.cos(yaw) * (100 / 3.6));
        sim.step();
      }
      expect(count(sim, 'takedown')).toBe(1);
      expect(traffic.state[agent]).toBe(AgentState.Wrecked);
    } finally { sim.dispose(); }
  }, 30_000);

  it('an open-road rear-end is not a takedown, and a wreck is taken down once', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    let lane = 0;
    for (let i = 0; i < traffic.lanes.laneCount; i++) if ((traffic.lanes.limit[i] as number) === 14 && (traffic.lanes.length[i] as number) > 120) { lane = i; break; }
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    traffic.speed[agent] = 10;
    try {
      for (let i = 0; i < 180; i++) {
        if (i < 25) sim.vehicle.setVelocity(Math.sin(pose.yaw) * (80 / 3.6), sim.vehicle.telemetry.vy, Math.cos(pose.yaw) * (80 / 3.6));
        sim.step();
      }
      expect(count(sim, 'hit')).toBeGreaterThan(0);
      expect(count(sim, 'takedown') + count(sim, 'takedownTraffic')).toBe(0);
      expect(traffic.state[agent]).not.toBe(AgentState.Wrecked);
    } finally { sim.dispose(); }
    // once: a wreck rammed into the wall again produces nothing
    const again = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const t2 = again.traffic as Traffic;
    const yaw = Math.PI / 2;
    const z = 100;
    again.vehicle.teleport({ x: WALL_FACE - 40, y: 1, z }, yaw);
    const wreck = t2.spawnAtPoint(WALL_FACE - 14, z, yaw, 'compact', AgentState.Wrecked);
    try {
      run(again, 0.5);
      for (let i = 0; i < 3 * 60; i++) {
        if (i < 40) again.vehicle.setVelocity(Math.sin(yaw) * (90 / 3.6), again.vehicle.telemetry.vy, Math.cos(yaw) * (90 / 3.6));
        again.step();
      }
      expect(t2.state[wreck]).toBe(AgentState.Wrecked);
      expect(count(again, 'takedown') + count(again, 'takedownTraffic')).toBe(0);
    } finally { again.dispose(); }
  }, 30_000);
});
