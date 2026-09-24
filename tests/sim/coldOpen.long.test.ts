/**
 * The cold open driven through (docs/M4_PLAN.md slice 4, 4.5): the scripted
 * bot takes every verb in order to the door inside 120 s. Long: run by `npm
 * run verify:gate`.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { BALANCE } from '../../src/sim/balance';
import { COLD_OPEN_VERBS, type ColdOpenVerb } from '../../src/sim/run/ColdOpen';
import { createWorld, runUntil } from './helpers';

describe('cold open (long)', () => {
  it('4.5 the bot takes every verb in order to the door inside 120 s', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    sim.coldOpen.start();
    const co = sim.coldOpen;
    try {
      // it backs off a car that will not move on (M6 gate: slice 9's hidden cars moved the traffic, and the bot pushed
      // a wreck it had made at walking pace for the rest of the two minutes)
      // it rolls into the delivery's ring under the start speed (M8.7 D8, D12)
      const bot = new TrackBot('heavy', { ...CITY_BOT_TUNING, unblock: true, takeRings: true });
      bot.setPath(co.route!.samples);
      const order: string[] = [];
      const captions: ColdOpenVerb[] = [];
      let cursor = sim.events.sequence;
      const t = runUntil(sim, 120, (s) => {
        cursor = s.events.readFrom(cursor, (e) => {
          if (e.kind === 'swap' || e.kind === 'billboard' || e.kind === 'door') order.push(e.kind);
        });
        if (co.caption && captions[captions.length - 1] !== co.caption) captions.push(co.caption);
        return !co.active;
      }, (_t, c, s) => {
        bot.drive(s, c, 1 / 60);
        // the scripted policy: take the candidate when it is in reach, boost when told
        if (s.life.state.swapCandidate >= 0 && !co.done.includes('swap')) c.swap = true;
        if (co.verb === 'boost') c.boost = 1;
      });
      expect(t).toBeGreaterThan(0);
      expect(order.filter((k, i) => order.indexOf(k) === i)).toEqual(['swap', 'billboard', 'door']);
      expect(sim.run.state).toBe('door');
      expect(co.seen).toBe(true);
      // every caption shown came in the verbs' order; the takedown is optional and times out
      const index = captions.map((c) => COLD_OPEN_VERBS.indexOf(c));
      for (let i = 1; i < index.length; i++) expect(index[i]!).toBeGreaterThan(index[i - 1]!);
      expect(captions[0]).toBe('steer');
      expect(captions).toContain('swap');
      expect(captions).toContain('escape');
      expect(co.done).toEqual(expect.arrayContaining([...COLD_OPEN_VERBS]));
      // the delivery paid into the bag before the door banked it
      expect(sim.run.lastBanked).toBeGreaterThanOrEqual(BALANCE.coldOpen.payout);
    } finally { sim.dispose(); }
  }, 120_000);

});
