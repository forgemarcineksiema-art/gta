/**
 * The city's props leave the traffic alone (M7 slice 0, D6): with the stash's
 * roadster standing 245 m from a stopped player, or not there at all, every
 * traffic record within 200 m of the player is the same for two minutes. The
 * M5.5 and M6 gates lost hours to bot pins that a car parked far away had
 * flipped. Long: two minutes of two worlds.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** A lane point 240–250 m from `spot`, the car on it facing along. */
function standoff(sim: SimWorld, spot: { x: number; z: number }): { x: number; z: number; yaw: number } {
  const lanes = (sim.traffic as Traffic).lanes;
  const pose = { x: 0, z: 0, yaw: 0 };
  for (let i = 0; i < lanes.laneCount; i++) {
    for (let s = 0; s < (lanes.length[i] as number); s += 5) {
      lanes.positionAt(i, s, 0, pose);
      const d = Math.hypot(pose.x - spot.x, pose.z - spot.z);
      if (d > 240 && d < 250) return { ...pose };
    }
  }
  throw new Error('no lane point 240-250 m from the spot');
}

async function world(roadster: boolean): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
  if (!roadster) sim.stash.found.add('roadster');
  const at = standoff(sim, sim.stash.spots.roadster);
  sim.city?.sync(at.x, at.z, true);
  sim.vehicle.teleport({ x: at.x, y: 0.8, z: at.z }, at.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  return sim;
}

describe('props (long)', () => {
  it('M7 0.1 a hidden car standing 245 m away changes nothing within 200 m of the player in two minutes', async () => {
    const a = await world(true);
    const b = await world(false);
    try {
      const ta = a.traffic as Traffic, tb = b.traffic as Traffic;
      let compared = 0;
      for (let second = 0; second < 120; second++) {
        run(a, 1, (_t, c) => { c.brake = 1; });
        run(b, 1, (_t, c) => { c.brake = 1; });
        const p = a.probe;
        for (let i = 0; i < ta.pool; i++) {
          const near = (ta.state[i] !== AgentState.Free && Math.hypot((ta.x[i] as number) - p.x, (ta.z[i] as number) - p.z) < 200)
            || (tb.state[i] !== AgentState.Free && Math.hypot((tb.x[i] as number) - p.x, (tb.z[i] as number) - p.z) < 200);
          if (!near) continue;
          compared++;
          expect(ta.state[i], `record ${i} at ${second} s`).toBe(tb.state[i]);
          expect(Math.abs((ta.x[i] as number) - (tb.x[i] as number)), `record ${i} x at ${second} s`).toBeLessThan(1e-3);
          expect(Math.abs((ta.z[i] as number) - (tb.z[i] as number)), `record ${i} z at ${second} s`).toBeLessThan(1e-3);
        }
      }
      // the roadster stood there all along, on a prop's record, and the traffic was busy around the player
      expect(ta.isProp(a.stash.agents[1] as number)).toBe(true);
      expect(b.stash.agents[1]).toBe(-1);
      expect(compared).toBeGreaterThan(500);
    } finally { a.dispose(); b.dispose(); }
  }, 240_000);
});
