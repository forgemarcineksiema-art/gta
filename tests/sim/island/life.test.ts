/** M8.10 slice 13: the island's streets as the traffic reads them, and a second of its life (docs/M8.10_PLAN.md). */
import { describe, expect, it } from 'vitest';
import { clearControls } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { AgentState, type Traffic } from '../../../src/sim/traffic/Traffic';
import { createWorld } from '../helpers';

describe('M8.10 slice 13: the island\'s streets', () => {
  it('13.0 lights at the avenues\' junctions, bays, footways, heights; the traffic, the walkers and the police run', async () => {
    const sim = await createWorld({ map: 'island', seed: 42, traffic: 1, peds: 1, record: false });
    try {
      const island = sim.island as Island, traffic = sim.traffic as Traffic, streets = traffic.streets;
      expect(streets.signals.length).toBeGreaterThan(5);
      expect(streets.bays.length).toBeGreaterThan(150);
      // a lit junction's arriving ways in two phases
      for (const id of streets.signals) {
        const phases = new Set(streets.graph.lanes.filter((l) => l.to === id).map((l) => streets.signalAxis(l)));
        expect(phases.size, `the light at node ${id}`).toBe(2);
      }
      expect(streets.graph.lanes.filter((l) => Number.isFinite(streets.footway(l))).length).toBeGreaterThan(200);
      expect(sim.police).not.toBeNull();
      for (let i = 0; i < 60; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      // the cars on the road's surface, across the junctions too (the highway's in its tunnel and on its decks not)
      let moving = 0;
      for (let i = 0; i < traffic.pool; i++) {
        if (traffic.state[i] !== AgentState.Kinematic) continue;
        moving++;
        const lane = streets.graph.lanes[traffic.lane[i] as number];
        if (lane?.highway) continue;
        expect(Math.abs((traffic.y[i] as number) - island.ground.surfaceHeight(traffic.x[i] as number, traffic.z[i] as number)), `a car at ${(traffic.x[i] as number).toFixed(0)}, ${(traffic.z[i] as number).toFixed(0)}`).toBeLessThan(0.3);
      }
      expect(moving).toBeGreaterThan(5);
      expect(sim.peds?.count() ?? 0).toBeGreaterThan(5);
    } finally { sim.dispose(); }
  }, 60_000);
});
