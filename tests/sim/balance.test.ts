/**
 * The balance script (docs/M5_PLAN.md slice 7, D12; DESIGN.md §2.7, §3.3):
 * `npm run balance`, outside `verify` (it steps the sim for minutes).
 *
 * 1. The capture probe: the road bot under the police, headless, traffic on,
 *    180 s at each level 1–5 with the novice and the skilled policies of
 *    `app/botPolicy.ts`, averaged over the M4 reference seeds 42 / 7 / 123
 *    (M5.5 gate: one seed's 180 s counts busts in steps of 0.33 a minute, and a
 *    single bust more or less moved the optimum two levels); busted a minute
 *    per level (after a card the run drives on and the heat is put back after
 *    10 s, as M4 measured, once the car is `AWAY` m from where the card fell:
 *    a bot wedged in a queue at the lights was busted there every 13 s, eight
 *    cards for one trap). The same novice at heat 0, same seeds, gives the
 *    bag and the coins a minute. The novice drives as a cautious player does
 *    (M7 slice 10, docs/M7_PLAN.md D8): the careful bot, which waits at the
 *    lights and in a queue and backs off and goes round a car that will not
 *    move on; the skilled keeps the plain bot's speed.
 * 2. The model (`model.ts`, the quick half the fitting runs on): the EV of
 *    §2.7 on the measured rates pooled so they never fall with the level, one
 *    job per level, two minutes each, the placed jobs' mean payout; busted
 *    keeps the fine; the door pays the level's multiplier; coins are kept
 *    either way. The expected bank per cash-out level, both profiles.
 * 3. The first hour of a novice at its best cash-out level (the cold open,
 *    then runs as long as the model expects them; dailies left out): the
 *    minute each purchase becomes affordable at a door, in the ladder's order:
 *    the compact, the tiers between the cars, the sports car last; at a door
 *    with no rung affordable, four minutes after the last thing seen bought,
 *    the cheapest kit item not had (M6).
 * 4. The four assertions: (a) the skilled profile's best cash-out level is at
 *    least one above the novice's, its bank rising from level 1 to it; (b) the
 *    compact is bought between minute 5 and 7; (c) no gap between purchases in
 *    the first hour is over 10 minutes or under 3; (d) something to see bought,
 *    a car or a kit item, at least every 8 minutes. And the minute each of the
 *    wanted board's cash gates is reached: a 40,000 run (Neon Niko) and three
 *    cars owned (Fake Frank).
 */
import { describe, expect, it } from 'vitest';
import { BotPolicy, type PolicyName } from '../../src/app/botPolicy';
import { CITY_BOT_TUNING, TrackBot, type TrackBotTuning } from '../../src/app/trackBot';
import { BALANCE } from '../../src/sim/balance';
import type { SimWorld } from '../../src/sim';
import { createWorld, run, runUntil } from './helpers';
import { best, COLD_OPEN, evTable, LEVELS, pooled, verdict, type ModelInput } from './model';

const SECONDS = 180;
/** The M4 gate's reference seeds (BALANCE.measured). */
const SEEDS = [42, 7, 123];
/** After a card the heat comes back only this far (m) from where it fell: one trap is one capture, not a loop. */
const AWAY = 50;
/** The novice is the careful bot (it goes round a car that will not move on, too); the skilled the plain one. */
const BOT: Record<PolicyName, Partial<TrackBotTuning>> = {
  novice: { ...CITY_BOT_TUNING, careful: true, unblock: true },
  skilled: CITY_BOT_TUNING,
};

interface Capture { busted: number; perMinute: number }

/** Busted a minute at a level: the bot drives on after each card, the heat is put back after 10 s. */
async function capture(policy: PolicyName, level: number, seed: number): Promise<Capture> {
  const threshold = BALANCE.heatThresholds[level - 1] as number;
  const sim = await createWorld({ map: 'city', seed, traffic: 1, peds: 0, record: false, heat: threshold });
  let busted = 0, rearm = -1, fellX = 0, fellZ = 0;
  try {
    const bot = new BotPolicy(policy, new TrackBot(sim.carId, BOT[policy]));
    run(sim, SECONDS, (_t, c, s) => {
      if (s.run.state === 'busted') {
        busted++;
        s.run.closeCard();
        rearm = 10;
        fellX = s.probe.x;
        fellZ = s.probe.z;
      } else if (s.run.state === 'door') {
        s.run.openDoor();
        rearm = 10;
        fellX = s.probe.x;
        fellZ = s.probe.z;
      }
      if (rearm > 0) {
        rearm = Math.max(1e-6, rearm - 1 / 60);
        if (rearm <= 1e-6 && Math.hypot(s.probe.x - fellX, s.probe.z - fellZ) >= AWAY) {
          rearm = -1;
          s.heat.set(threshold);
        }
      }
      // the probe is a level, not a run: the chase's drip and the seen crimes (M5.5) are put back
      else if (s.heat.level !== level) s.heat.set(threshold);
      bot.drive(s, c, 1 / 60);
    });
  } finally { sim.dispose(); }
  return { busted, perMinute: busted / (SECONDS / 60) };
}

/** The bag and the coins a minute from heat 0, the novice. */
async function earnings(seed: number): Promise<{ bag: number; coins: number; jobMean: number }> {
  const sim: SimWorld = await createWorld({ map: 'city', seed, traffic: 1, peds: 0, record: false });
  try {
    const bot = new BotPolicy('novice', new TrackBot(sim.carId, BOT.novice));
    let bag = 0;
    let last = 0;
    run(sim, SECONDS, (_t, c, s) => {
      // the bag keeps what it earned even across a card or a door
      if (s.run.bag > last) bag += s.run.bag - last;
      last = s.run.bag;
      if (s.run.state === 'busted') { s.run.closeCard(); last = 0; }
      if (s.run.state === 'door') { s.run.openDoor(); last = 0; }
      bot.drive(s, c, 1 / 60);
    });
    // the repeatable jobs: a duel (M6) pays its purse once, one rival at a time behind the board's requirements
    const jobs = sim.jobs.defs.filter((d) => d.kind !== 'escape' && d.kind !== 'duel');
    const jobMean = jobs.reduce((n, d) => n + d.payout, 0) / jobs.length;
    return { bag: bag / (SECONDS / 60), coins: sim.run.coins / (SECONDS / 60), jobMean };
  } finally { sim.dispose(); }
}

/** Seconds from heat 0 to levels 2 and 3 for a policy that only drives (M5.5 slice 0; -1 = not inside the cap). */
async function timeToLevel(policy: PolicyName, cap = 540): Promise<{ t2: number; t3: number }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
  try {
    const bot = new BotPolicy(policy, new TrackBot(sim.carId, BOT[policy]));
    let t2 = -1;
    const t3 = runUntil(sim, cap, (s) => {
      if (t2 < 0 && s.heat.level >= 2) t2 = s.time;
      if (s.run.state === 'busted') s.run.closeCard();
      else if (s.run.state === 'door') s.run.openDoor();
      return s.heat.level >= 3;
    }, (_t, c, s) => bot.drive(s, c, 1 / 60));
    return { t2, t3 };
  } finally { sim.dispose(); }
}

describe('the balance script', () => {
  it('captures, the EV table, the first hour, and the four assertions', async () => {
    const rates: Record<PolicyName, number[]> = { novice: [0], skilled: [0] };
    const rows: string[] = [];
    for (const level of LEVELS) {
      const each: Record<PolicyName, number[]> = { novice: [], skilled: [] };
      for (const policy of ['novice', 'skilled'] as const) {
        for (const seed of SEEDS) each[policy].push((await capture(policy, level, seed)).perMinute);
        rates[policy][level] = each[policy].reduce((a, b) => a + b, 0) / SEEDS.length;
      }
      const seeds = (p: PolicyName): string => each[p].map((v) => v.toFixed(2)).join(' / ');
      rows.push(`  level ${level}: novice ${(rates.novice[level] as number).toFixed(2)} / min (${seeds('novice')}), skilled ${(rates.skilled[level] as number).toFixed(2)} / min (${seeds('skilled')})`);
    }
    const earns: Array<{ bag: number; coins: number; jobMean: number }> = [];
    for (const seed of SEEDS) earns.push(await earnings(seed));
    const mean = (f: (e: { bag: number; coins: number; jobMean: number }) => number): number => earns.reduce((n, e) => n + f(e), 0) / earns.length;
    const input: ModelInput = { novice: rates.novice, skilled: rates.skilled, bagPerMinute: mean((e) => e.bag), coinsPerMinute: mean((e) => e.coins), jobMean: mean((e) => e.jobMean) };
    const out: string[] = [];
    for (const policy of ['novice', 'skilled'] as const) {
      const t = await timeToLevel(policy);
      const fmt = (v: number): string => (v < 0 ? 'not inside the cap' : `${v.toFixed(0)} s`);
      out.push(`time to level from heat 0, ${policy}: level 2 ${fmt(t.t2)}, level 3 ${fmt(t.t3)}`);
    }
    out.push(`busted a minute (seeds ${SEEDS.join(' / ')}, traffic on, ${SECONDS} s a level, M4 measured novice ${BALANCE.measured.bustedPerMinute.slice(1).join(' / ')}, skilled ${BALANCE.measured.bustedPerMinuteSkilled.slice(1).join(' / ')}):`, ...rows);
    out.push(`pooled (never falling with the level): novice ${pooled(input.novice).slice(1).map((v) => v.toFixed(2)).join(' / ')}, skilled ${pooled(input.skilled).slice(1).map((v) => v.toFixed(2)).join(' / ')}`);
    out.push(`bag ${input.bagPerMinute.toFixed(0)} a minute (${earns.map((e) => e.bag.toFixed(0)).join(' / ')}), coins ${input.coinsPerMinute.toFixed(0)} a minute from heat 0 (M4: ${BALANCE.measured.bagPerMinute}, ${BALANCE.measured.coinsPerMinute} coins); the placed jobs' mean payout ${input.jobMean.toFixed(0)}`);

    const table = evTable(input);
    out.push('expected bank a run by cash-out level (DESIGN.md §2.7), and a minute:');
    for (const policy of ['novice', 'skilled'] as const) {
      out.push(`  ${policy.padEnd(7)} ${table[policy].map((e) => `L${e.level} ${(e.bank / 1000).toFixed(1)}k (${e.perMinute.toFixed(0)}/min)`).join('  ')}   best L${best(table[policy]).level}`);
    }

    const v = verdict(input);
    const h = v.hour;
    out.push(`the novice's first hour at L${h.run.level} (runs of ${h.run.minutes.toFixed(1)} min banking ${(h.run.bank / 1000).toFixed(1)}k with the coins; the cold open ${(COLD_OPEN.bank / 1000).toFixed(1)}k in ${COLD_OPEN.minutes} min):`);
    let prev = 0;
    for (const [name, minute] of h.bought) {
      out.push(`  minute ${minute.toFixed(1).padStart(5)}  ${name}${prev > 0 && !name.startsWith('kit') ? `  (+${(minute - prev).toFixed(1)})` : ''}`);
      if (!name.startsWith('kit')) prev = minute;
    }
    out.push(`the board's cash gates: a 40,000 run ${h.run.bank >= 40000 ? 'at every door' : `not at L${h.run.level} (${(h.run.bank / 1000).toFixed(1)}k a run)`}; three cars at ${h.thirdCar >= 0 ? `minute ${h.thirdCar.toFixed(1)}` : 'not in the first hour'} (${h.cars} owned)`);
    out.push(`something to see bought (a car or a kit item) every ${h.seenGaps.map((g) => g.toFixed(1)).join(' / ')} min`);
    console.info(out.join('\n'));

    // (a) the optimum rises with skill, the skilled bank climbing to it
    expect(v.skilledBest).toBeGreaterThanOrEqual(v.noviceBest + 1);
    expect(v.skilledRising).toBe(true);
    // (b) the first car inside the brief's five to seven minutes
    expect(v.compact).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(v.compact).toBeLessThanOrEqual(7);
    // (c) something new every three to ten minutes
    expect(Math.max(...h.gaps)).toBeLessThanOrEqual(10);
    expect(Math.min(...h.gaps)).toBeGreaterThanOrEqual(3);
    // (d) something to see bought at least every 8 minutes (M6)
    expect(h.seenGaps.length).toBeGreaterThan(0);
    expect(Math.max(...h.seenGaps)).toBeLessThanOrEqual(8);
  }, 1_800_000);
});
