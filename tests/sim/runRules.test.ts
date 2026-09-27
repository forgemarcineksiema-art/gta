/**
 * The run's rules the second bug hunt found open (2026-09-27, docs/PROGRESS.md): the door's rewarded double reaches the
 * chain and the day's banked runs; a car found in play is the chain's step with its card; a duel's racer driving on as
 * traffic loses its duel's own flags.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { DAILY_TEMPLATES } from '../../src/sim/dailies/Dailies';
import { STEP } from '../../src/sim/run/goal';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

describe("the run's rules (the second bug hunt)", () => {
  it("the door's double: 13,000 banked made 26,000 on the wall, and the chain's 20,000 and the 25,000 daily with it", async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const r = sim.run;
      run(sim, 0.1);
      const daily = DAILY_TEMPLATES.findIndex((t) => t.kind === 'banked' && t.target === 25_000);
      expect(daily).toBeGreaterThanOrEqual(0);
      sim.dailies.ids[0] = daily;
      sim.dailies.progress[0] = 0;
      sim.dailies.done[0] = false;
      // a door's totals: the bag banked
      r.state = 'door';
      r.lastBag = 13_000;
      r.lastBanked = 13_000;
      r.lastDoubled = false;
      expect(r.doubleLastBag()).toBe(true);
      expect(r.lastBanked).toBe(13_000 * BALANCE.offer.doorMultiplier);
      expect(r.chain & (1 << STEP.big)).not.toBe(0);
      expect(sim.dailies.done[0]).toBe(true);
    } finally { sim.dispose(); }
  });

  it("a car found in play is the chain's step, said (its card); one owned at the start is done silently", async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const r = sim.run;
      sim.garage.owned.add('compact');
      run(sim, 2 / 60);
      expect(r.chain & (1 << STEP.car)).not.toBe(0);
      const serial = r.chainSerial;
      expect(serial).toBe(0);
    } finally { sim.dispose(); }
    const play = await createWorld({ map: 'playground' });
    try {
      const r = play.run;
      run(play, 0.1);
      // a hidden car found before the first buy (the stash owns it)
      play.garage.owned.add('icecream');
      run(play, 2 / 60);
      expect(r.chain & (1 << STEP.car)).not.toBe(0);
      expect(r.chainSerial).toBe(1);
      expect(r.chainLast).toBe(STEP.car);
    } finally { play.dispose(); }
  });

  it("a duel's racer driving on as traffic: the badge, the armour and the temper go with its duel, its rival's flag stays", async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const a = traffic.spawnRacer(0, 10, 'muscle', 0, true);
      expect(a).toBeGreaterThanOrEqual(0);
      traffic.badge[a] = 1;
      traffic.bad[a] = 1;
      traffic.armour[a] = 3;
      traffic.endRace(a);
      expect(traffic.state[a]).toBe(AgentState.Kinematic);
      expect([traffic.badge[a], traffic.bad[a], traffic.armour[a], traffic.rival[a], traffic.racer[a]]).toEqual([0, 0, 1, 1, 0]);
    } finally { sim.dispose(); }
  });
});
