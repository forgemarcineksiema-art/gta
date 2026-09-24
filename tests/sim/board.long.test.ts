/**
 * The wanted board's first race by a bot (M6 gate criterion 4, docs/M6_PLAN.md
 * §7; M7 slice 13): a test bot pulled up at Granny Gears' bay drives the lane
 * path to the Glasshouse against her, three starts each (the traffic a
 * different moment each time): the careful bot wins all three, the plain M5
 * bot at least one (her pace since M7: the first duel is a newcomer's). City,
 * seed 42, traffic on, the police off (the race's heat is 0). Long: run by
 * `npm run verify:gate`.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { CHAIN_ALL } from '../../src/sim';
import { alongLane, chainPoints, laneChain, laneSpan, resample, type Pt } from '../../src/sim/city/route';
import type { Lane } from '../../src/sim/city/roads';
import { pointTarget } from '../../src/sim/jobs/place';
import { createWorld, run, runUntil } from './helpers';

describe('the wanted board (long)', () => {
  it('M6 G.1 (M7 13) the careful bot beats Granny Gears to the Glasshouse three times in three, the plain bot at least once', async () => {
    const results: string[] = [];
    const wins = { careful: 0, plain: 0 };
    for (const careful of [true, false]) for (const wait of [0, 20, 45]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
      try {
        sim.police!.dispatching = false;
        sim.run.chain = CHAIN_ALL;
        run(sim, wait, (_t, c) => { c.brake = 1; });
        const d = sim.jobs.defs.find((k) => k.kind === 'duel' && k.level === 0)!;
        const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
        sim.city?.sync(d.x - lx * 3, d.z - lz * 3, true);
        sim.vehicle.teleport({ x: d.x - lx * 3, y: 0.8, z: d.z - lz * 3 }, d.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        run(sim, 0.3);
        expect(sim.jobs.active).toBe(d.id);
        // the lane path from here to the finish
        const city = sim.city!;
        const p = sim.vehicle.body.translation();
        const start = city.nearestLane(p.x, p.z, p.y - 0.5);
        const target = pointTarget(city, d.targetX, d.targetZ);
        const raw: Pt[] = [];
        const s0 = alongLane(city.graph.lanes[start] as Lane, p.x, p.z).s;
        const chain = start === target.lane && target.s >= s0 ? [start] : laneChain(city.graph, start, target.lane);
        chainPoints(city.graph, chain, raw);
        laneSpan(city.graph.lanes[target.lane] as Lane, 0, target.s + 20, raw);
        const bot = new TrackBot(sim.carId, careful ? { ...CITY_BOT_TUNING, careful: true } : CITY_BOT_TUNING);
        bot.setPath(resample(raw));
        const t = runUntil(sim, d.limitSeconds + 5, (s) => s.jobs.state === 'done' || s.jobs.state === 'failed', (_t, c, s) => bot.drive(s, c, 1 / 60));
        const won = sim.jobs.state === 'done';
        if (won) wins[careful ? 'careful' : 'plain']++;
        results.push(`${careful ? 'careful' : 'plain'} bot, start after ${wait} s: ${won ? 'won' : sim.jobs.lastPlace === 2 ? 'Granny first' : 'too late'} at ${t.toFixed(1)} s of ${d.limitSeconds} s`);
      } finally { sim.dispose(); }
    }
    console.info(`Granny Gears against the bots:\n  ${results.join('\n  ')}`);
    expect(wins.careful).toBe(3);
    expect(wins.plain).toBeGreaterThanOrEqual(1);
  }, 1_200_000);
});
