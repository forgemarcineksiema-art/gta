/**
 * The bot drives the generator's deliveries (docs/M5_PLAN.md slice 1, 1.7):
 * from each delivery ring, the road bot on the shortest lane path into the
 * drop-off arrives inside the limit and is paid. City, seed 42, traffic on.
 * Long: run by `npm run verify:gate`. The times are slice 1's measurement.
 */
import { describe, expect, it } from 'vitest';
import { routeToDropOff } from '../../src/app/doorRoute';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { createWorld, runUntil } from './helpers';

describe('jobs (long)', () => {
  it('1.7 the bot drives every delivery from its ring into its drop-off inside the limit and takes at least 70 % of its route\'s coins', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    // the limits are measured clean: with the beat on (M5.5) the speeding bot gets a chase and the cruisers'
    // rams cost it a delivery; what the police do to a delivery is the balance script's and Marcin's question
    sim.police!.dispatching = false;
    try {
      const deliveries = sim.jobs.defs.filter((d) => d.kind === 'delivery');
      expect(deliveries.length).toBe(6);
      const rows: string[] = [];
      for (const d of deliveries) {
        sim.run.bag = 0;
        sim.heat.reset();
        sim.city?.sync(d.x, d.z, true);
        sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        sim.step();
        expect(sim.jobs.active).toBe(d.id);
        const site = sim.run.dropOffs.find((s) => Math.hypot(s.door.x - d.targetX, s.door.z - d.targetZ) < 6)!;
        const bot = new TrackBot(sim.carId, CITY_BOT_TUNING);
        bot.setPath(routeToDropOff(sim, site));
        // the route's coins (M5.5 1.4): laid on the chain's lanes, taken by a bot that follows the lanes
        let laid = 0, taken = 0;
        const t = runUntil(sim, d.limitSeconds + 5, (s) => {
          const coins = s.coins!;
          if (coins.routeTotal > 0) { laid = coins.routeTotal; taken = coins.routePicked; }
          return s.jobs.state === 'done' || s.jobs.state === 'failed';
        }, (_t, c, s) => bot.drive(s, c, 1 / 60));
        rows.push(`#${d.id} ${site.name}: ${t.toFixed(1)} s of ${d.limitSeconds} s, paid ${sim.jobs.lastPaid} of ${d.payout}, route coins ${taken}/${laid}${sim.jobs.lastTip ? ' (the tip)' : ''}`);
        expect(sim.jobs.state).toBe('done');
        expect(t).toBeLessThan(d.limitSeconds);
        expect(laid).toBeGreaterThanOrEqual(20);
        expect(laid).toBeLessThanOrEqual(120);
        expect(taken / laid).toBeGreaterThanOrEqual(0.7);
        // out of the garage for the next one: the door and its totals are not this test's
        if (sim.run.state === 'door') sim.run.openDoor();
        if (sim.run.state === 'closing') sim.run.state = 'running';
        sim.jobs.abandon();
      }
      console.info(`deliveries by the bot:\n  ${rows.join('\n  ')}`);
    } finally { sim.dispose(); }
  }, 300_000);
});
