/**
 * The next rival's car in the traffic (M7 slice 13, DESIGN.md §15): while
 * Granny Gears is not ready (the first steps not done), her wagon cruises
 * Palm Gardens as a car of the traffic, flagged a rival's (never a swap
 * candidate), and is gone once she is ready to park for the duel.
 */
import { describe, expect, it } from 'vitest';
import { CHAIN_ALL } from '../../src/sim';
import { CITY_COLORS } from '../../src/sim/palette';
import { districtAt } from '../../src/sim/city/City';
import { BODY_INDEX } from '../../src/sim/traffic/bodies';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

describe('the rival\'s teaser', () => {
  it('M7 13.1 the teaser is a rival\'s record, keeps to its district, and goes when the rival is ready', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, teasers: true });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      // parked on a Gardens street, facing north
      sim.city?.sync(-454.5, 330, true);
      sim.vehicle.teleport({ x: -454.5, y: 0.8, z: 330 }, 0);
      sim.vehicle.setVelocity(0, 0, 0);
      expect(sim.board.next()).toBe(0);
      expect(sim.board.ready(0)).toBe(false);
      let seenAt = -1, steps = 0, inTurf = 0;
      run(sim, 30, (_t, c, s) => {
        c.brake = 1;
        const a = s.board.teaser;
        if (a < 0) return;
        if (seenAt < 0) seenAt = s.time;
        expect(traffic.rival[a]).toBe(1);
        expect(traffic.body[a]).toBe(BODY_INDEX.wagon);
        expect(traffic.paintOf(a)).toBe(CITY_COLORS.lavender);
        steps++;
        if (districtAt(traffic.x[a] as number, traffic.z[a] as number).id === 'gardens') inTurf++;
      });
      expect(seenAt).toBeGreaterThanOrEqual(0);
      expect(seenAt).toBeLessThan(6);
      expect(steps).toBeGreaterThan(20 * 60);
      expect(inTurf).toBe(steps);
      // the first steps done: she is ready, and her cruising car goes (out of the player's sight)
      const last = sim.board.teaser;
      sim.run.chain = CHAIN_ALL;
      let goneAt = -1;
      run(sim, 20, (_t, c, s) => {
        c.brake = 1;
        if (goneAt < 0 && s.board.teaser < 0) goneAt = s.time;
      });
      expect(goneAt).toBeGreaterThan(0);
      if (last >= 0) expect(traffic.state[last] === AgentState.Free || traffic.rival[last] === 0 || traffic.body[last] !== BODY_INDEX.wagon).toBe(true);
      expect(sim.board.teaser).toBe(-1);
    } finally { sim.dispose(); }
  }, 60_000);
});
