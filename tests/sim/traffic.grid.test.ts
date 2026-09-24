/**
 * The frame budget (M7 slice 6): the unstick finds its pairs through a grid
 * and gives the full scan's traffic bit for bit, with a fraction of the pair
 * checks; the player-gap projection runs only for cars the player could lead
 * (a player past a lane's end no longer stops the cars down the line).
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld } from './helpers';

async function drive(fullScan: boolean): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
  (sim.traffic as Traffic).unstickFullScan = fullScan;
  const bot = new TrackBot('muscle', CITY_BOT_TUNING);
  for (let i = 0; i < 1800; i++) { bot.drive(sim, sim.controls, 1 / 60); sim.step(); }
  return sim;
}

describe('the traffic\'s budget', () => {
  it('M7 6.1 the grid gives the full scan\'s traffic bit for bit with under a third of its pair checks; few cars project the player', async () => {
    const grid = await drive(false);
    const full = await drive(true);
    try {
      const a = grid.traffic as Traffic, b = full.traffic as Traffic;
      let live = 0;
      for (let i = 0; i < a.capacity; i++) {
        expect(a.state[i], `record ${i}`).toBe(b.state[i]);
        if (a.state[i] === AgentState.Free) continue;
        live++;
        expect(a.x[i], `record ${i} x`).toBe(b.x[i]);
        expect(a.z[i], `record ${i} z`).toBe(b.z[i]);
      }
      expect(live).toBeGreaterThan(30);
      expect(a.pairChecks * 3).toBeLessThan(b.pairChecks);
      // the player's projection for the few cars near them, not for every car every step
      expect(a.gapProjections / 1800).toBeLessThan(live / 3);
      console.info(`pair checks ${b.pairChecks} -> ${a.pairChecks}; gap projections ${(a.gapProjections / 1800).toFixed(1)} a step for ${live} cars`);
    } finally { grid.dispose(); full.dispose(); }
  }, 60_000);
});
