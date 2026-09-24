/**
 * One purse (M8.5 slice 0, docs/DESIGN.md §17.4, D1): a road coin lands in
 * the bank the moment it is picked, a spilled coin goes back into the bag,
 * and the garage spends the bank alone.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { createWorld, run } from './helpers';

describe('one purse', () => {
  it('M8.5 0.1 a road coin raises the bank by its worth and the run\'s coin count by one; a spilled coin raises the bag', async () => {
    const sim = await createWorld({ record: false });
    try {
      sim.run.bank = 1_000;
      sim.events.push('coin', BALANCE.coin.value, 0, 0, 0, -1);
      sim.events.push('coin', BALANCE.coin.cap, 0, 0, 0, 7);
      run(sim, 1 / 60);
      const bank = 1_000 + BALANCE.coin.value + BALANCE.coin.cap;
      expect(sim.run.bank).toBe(bank);
      expect(sim.run.counts.coins).toBe(2);
      expect(sim.run.bag).toBe(0);
      sim.events.push('coin', 250, 0, 0, 0, -2);
      run(sim, 1 / 60);
      expect(sim.run.bag).toBe(250);
      expect(sim.run.bank).toBe(bank);
      expect(sim.run.counts.coins).toBe(2);
      // no second pool
      expect('coins' in sim.run).toBe(false);
    } finally { sim.dispose(); }
  });

  it('M8.5 0.3 a price over the bank buys nothing and takes nothing; the price exactly empties it', async () => {
    const sim = await createWorld({ record: false });
    try {
      const price = BALANCE.prices.compact;
      sim.run.bank = price - 1;
      expect(sim.garage.buy('compact')).toBe('cash');
      expect(sim.garage.owned.has('compact')).toBe(false);
      expect(sim.run.spend(price)).toBe(false);
      expect(sim.run.bank).toBe(price - 1);
      sim.run.bank = price;
      expect(sim.garage.buy('compact')).toBe('ok');
      expect(sim.garage.owned.has('compact')).toBe(true);
      expect(sim.run.bank).toBe(0);
    } finally { sim.dispose(); }
  });
});
