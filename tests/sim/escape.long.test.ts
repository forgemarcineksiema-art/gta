/**
 * Pursuit escape by the bot policies (docs/M5_PLAN.md slice 3's measurement):
 * from each escape marker, the skilled bot (swaps out of sight, turns away
 * while searched, boosts) drives until the job pays, it is busted, or three
 * minutes pass; seeds 42, 7 and 123, traffic on. The police have the player
 * on the radio for the first 8 s (`jobs.escape.radioSeconds`). Long: `npm run verify:gate`.
 */
import { describe, expect, it } from 'vitest';
import { BotPolicy } from '../../src/app/botPolicy';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { createWorld, runUntil } from './helpers';

describe('pursuit escape (long)', () => {
  it('3.6 the skilled bot escapes from the markers (the measurement)', async () => {
    const rows: string[] = [];
    let escaped = 0, runs = 0;
    for (const seed of [42, 7, 123]) {
      const probe = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      const markers = probe.jobs.defs.filter((d) => d.kind === 'escape').map((d) => d.id);
      probe.dispose();
      for (const id of markers) {
        const sim = await createWorld({ map: 'city', seed, traffic: 1, peds: 0, record: false });
        try {
          const d = sim.jobs.defOf(id)!;
          sim.city?.sync(d.x, d.z, true);
          sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
          sim.vehicle.setVelocity(0, 0, 0);
          sim.step();
          expect(sim.jobs.state).toBe('active');
          const bot = new BotPolicy('skilled', new TrackBot(sim.carId, CITY_BOT_TUNING));
          let busted = false, bySwap = false;
          const t = runUntil(sim, 180, (s) => {
            // the step's own events: the swap that won it is not read by the bot before the loop stops
            s.events.readFrom(s.events.sequence - 8, (e) => { if (e.kind === 'escape' && e.target === 1 && e.tick === s.tick - 1) bySwap = true; });
            return s.jobs.state === 'done' || busted;
          }, (_t, c, s) => {
            bot.drive(s, c, 1 / 60);
            if (s.run.state === 'busted') busted = true;
          });
          runs++;
          const outcome = sim.jobs.state === 'done' ? 'escaped' : busted ? 'busted' : 'still chased';
          if (outcome === 'escaped') escaped++;
          rows.push(`seed ${seed} level ${d.level}: ${outcome}${t > 0 ? ` at ${t.toFixed(1)} s` : ''}${bySwap ? ' by a swap' : ''}`);
        } finally { sim.dispose(); }
      }
    }
    console.info(`escapes by the skilled bot: ${escaped} of ${runs}\n  ${rows.join('\n  ')}`);
    expect(runs).toBe(12);
    expect(escaped).toBeGreaterThanOrEqual(1);
  }, 900_000);
});
