/**
 * The bot policies (docs/M4_PLAN.md slice 5, 5.8): 120 s at heat 40 with
 * traffic on. The skilled bot swaps and escapes by a swap; the novice never
 * swaps; neither needs a reset. They go round what blocks them, as a player
 * does (the bot's unblock, M8.6 gate): since M8.6 a wreck no longer slides off
 * a push, and the skilled bot shoved one onto a queued car at 0.6 m/s till it
 * reset (M8.7 gate). Long: run by `npm run verify:gate`.
 */
import { describe, expect, it } from 'vitest';
import { BotPolicy, type PolicyName } from '../../src/app/botPolicy';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { createWorld, run } from './helpers';

async function drive(name: PolicyName): Promise<BotPolicy> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 40 });
  const policy = new BotPolicy(name, new TrackBot('muscle', { ...CITY_BOT_TUNING, unblock: true }));
  try {
    run(sim, 120, (_t, c, s) => {
      policy.drive(s, c, 1 / 60);
      // a busted card or a door would stop the clock; the measurement drives on
      if (s.run.state === 'busted') s.run.closeCard();
      if (s.run.state === 'door') s.run.openDoor();
    });
  } finally { sim.dispose(); }
  return policy;
}

describe('bot policies (long)', () => {
  it('5.8 the skilled bot swaps and escapes by a swap; the novice never swaps; neither resets', async () => {
    const skilled = await drive('skilled');
    const novice = await drive('novice');
    expect(skilled.swaps).toBeGreaterThanOrEqual(1);
    expect(skilled.escapesBySwap).toBeGreaterThanOrEqual(1);
    expect(novice.swaps).toBe(0);
    expect(skilled.resets).toBe(0);
    expect(novice.resets).toBe(0);
  }, 120_000);
});
