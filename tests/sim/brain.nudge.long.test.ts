/**
 * The police brain over a traffic drive (M4 slice 3c, 3c.1): over ~10 s of wall time under the parallel suite.
 * Long: run by `npm run verify:gate` and `npm run test:long` (CLAUDE.md), moved unchanged from
 * `brain.test.ts` in M5.1.
 */
import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** The island's east boundary wall face (a fixed, restitution-1 solid). */

/** A straight street lane long enough for a chase-and-bump. */
function streetLane(traffic: Traffic): number {
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) === TRAFFIC.speedStreet && (lanes.length[i] as number) > 150) return i;
  }
  return -1;
}

describe('the police brain (long)', () => {
  it('3c.1 a nudge from behind leaves a police car and a civilian driving on, dented at most', async () => {
    for (const kind of ['police', 'civilian'] as const) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      const traffic = sim.traffic as Traffic;
      try {
        const lane = streetLane(traffic);
        expect(lane).toBeGreaterThanOrEqual(0);
        const pose = { x: 0, z: 0, yaw: 0 };
        traffic.lanes.positionAt(lane, 20, 0, pose);
        sim.city?.sync(pose.x, pose.z, true);
        sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
        run(sim, 0.5);
        // a police record ahead on the lane (the dispatcher never spawns in view, so the flag is set by hand)
        const agent = traffic.spawnAt(lane, 50, kind === 'police' ? 'police' : 'compact');
        expect(agent).toBeGreaterThanOrEqual(0);
        if (kind === 'police') traffic.police[agent] = 1;
        // close from 30 m back at 4 m/s over the car's 14 m/s, let go at the touch
        let touched = false, maxDv = 0;
        run(sim, 10, (_t, _c, s) => {
          const dv = traffic.playerDv[agent] as number;
          maxDv = Math.max(maxDv, dv);
          if (dv > 0.5) touched = true;
          if (!touched) s.vehicle.setVelocity(Math.sin(pose.yaw) * 18, s.vehicle.telemetry.vy, Math.cos(pose.yaw) * 18);
        });
        run(sim, 6);
        console.log(`[brain] ${kind} nudged at dv ${maxDv.toFixed(1)} m/s: state ${traffic.state[agent]}, damage ${(traffic.damage[agent] as number).toFixed(2)}, speed ${(traffic.speed[agent] as number).toFixed(1)}`);
        expect(touched).toBe(true);
        expect(maxDv).toBeGreaterThan(TRAFFIC.disturbedImpact);
        expect(traffic.state[agent]).not.toBe(AgentState.Wrecked);
        expect(traffic.state[agent]).not.toBe(AgentState.Free);
        expect(traffic.damage[agent] as number).toBeLessThan(0.3);
        expect(traffic.speed[agent] as number).toBeGreaterThan(4);
      } finally { sim.dispose(); }
    }
  }, 60_000);
});
