/**
 * Takedowns (docs/history/M3_PLAN.md slice 7): an open-road rear-end is not a
 * takedown; a wreck cannot be taken down twice.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** The island's east boundary wall face (a fixed, restitution-1 solid) is at x = 786.5. */
const WALL_FACE = 786.5;

function count(sim: Awaited<ReturnType<typeof createWorld>>, kind: string): number {
  let n = 0;
  sim.events.readFrom(0, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('takedowns (long)', () => {
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
