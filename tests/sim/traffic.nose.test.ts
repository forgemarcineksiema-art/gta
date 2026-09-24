/**
 * Nose to nose (M8.7 gate): two cars all but stopped, each in the other's
 * corridor (a forced entry and a turner in a junction's box), waited for each
 * other for ever and the queue behind them stood (jobs 1.7's delivery #12 ran
 * out of its clock behind one). The one further on its lane (the lower number
 * on a tie) steers out beside the other and crawls past; the other waits, then
 * follows. Neither is pushed back along its lane.
 */
import { describe, expect, it } from 'vitest';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

describe('traffic nose to nose', () => {
  it('M8.7 5.1 two cars nose to nose on one line: one goes round, the other follows; neither is pushed back', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const lanes = traffic.lanes;
      const graph = sim.city!.graph;
      // a long two-way street off the highway, its two lanes the same length
      const lane = graph.lanes.find((l) => !l.highway && l.special === undefined && (lanes.length[l.id] as number) > 120
        && graph.lanes.some((r) => r.from === l.to && r.to === l.from && Math.abs((lanes.length[r.id] as number) - (lanes.length[l.id] as number)) < 0.5))!;
      const back = graph.lanes.find((r) => r.from === lane.to && r.to === lane.from)!;
      const len = lanes.length[lane.id] as number;
      // both moved onto the street's middle line, 9 m apart, facing each other, stopped
      const a = traffic.spawnAt(lane.id, len / 2 - 4.5, 'sedan', AgentState.Kinematic, -(lanes.offset[lane.id] as number));
      const b = traffic.spawnAt(back.id, len / 2 - 4.5, 'sedan', AgentState.Kinematic, -(lanes.offset[back.id] as number));
      traffic.speed[a] = 0;
      traffic.speed[b] = 0;
      expect(Math.hypot((traffic.x[a] as number) - (traffic.x[b] as number), (traffic.z[a] as number) - (traffic.z[b] as number))).toBeCloseTo(9, 0);
      // the player off to the side, near enough to keep the two in the traffic's reach
      const mx = ((traffic.x[a] as number) + (traffic.x[b] as number)) / 2, mz = ((traffic.z[a] as number) + (traffic.z[b] as number)) / 2;
      sim.city?.sync(mx + 40, mz + 40, true);
      sim.vehicle.teleport({ x: mx + 40, y: 1, z: mz + 40 }, 0);
      const sa = traffic.s[a] as number, sb = traffic.s[b] as number;
      let backA = 0, backB = 0;
      for (let k = 0; k < 20 * 60; k++) {
        run(sim, 1 / 60);
        if (traffic.lane[a] === lane.id) backA = Math.max(backA, sa - (traffic.s[a] as number));
        if (traffic.lane[b] === back.id) backB = Math.max(backB, sb - (traffic.s[b] as number));
      }
      // both past each other and on down their streets; neither pushed back along its lane
      const goneA = traffic.lane[a] !== lane.id || (traffic.s[a] as number) > sa + 20;
      const goneB = traffic.lane[b] !== back.id || (traffic.s[b] as number) > sb + 20;
      expect(goneA).toBe(true);
      expect(goneB).toBe(true);
      expect(backA).toBeLessThan(0.5);
      expect(backB).toBeLessThan(0.5);
    } finally { sim.dispose(); }
  }, 30_000);
});
