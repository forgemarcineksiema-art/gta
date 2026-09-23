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
 *    bag and the coins a minute.
 * 2. The EV model of §2.7 with those rates: one job per level, two minutes
 *    each, the placed jobs' mean payout; capture as a Poisson rate per level;
 *    busted keeps the fine; the door pays the level's multiplier; coins are
 *    kept either way. The expected bank per cash-out level, both profiles.
 * 3. The first hour of a novice at its best cash-out level (the cold open,
 *    then runs of two minutes a level and one to the door, as long as the
 *    model expects them; dailies left out): the minute each purchase becomes
 *    affordable at a door (the wall is where the garage is), in the ladder's
 *    order: the compact, the tiers between the cars, the sports car last.
 * 4. Three assertions: (a) the skilled profile's best cash-out level is
 *    higher than the novice's; (b) the compact is affordable between minute
 *    5 and 7; (c) no gap between purchases in the first hour is over 10
 *    minutes or under 3.
 */
import { describe, expect, it } from 'vitest';
import { BotPolicy, type PolicyName } from '../../src/app/botPolicy';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { BALANCE } from '../../src/sim/balance';
import type { SimWorld } from '../../src/sim';
import { createWorld, run, runUntil } from './helpers';

const SECONDS = 180;
const LEVELS = [1, 2, 3, 4, 5];
/** The M4 gate's reference seeds (BALANCE.measured). */
const SEEDS = [42, 7, 123];
/** After a card the heat comes back only this far (m) from where it fell: one trap is one capture, not a loop. */
const AWAY = 50;
/** Minutes of a run spent at each level, and the drive to the door (DESIGN.md §2.7). */
const STAGE_MINUTES = 2;
const DOOR_MINUTES = 1;
const HOUR = 60;

interface Capture { busted: number; perMinute: number }

/** Busted a minute at a level: the bot drives on after each card, the heat is put back after 10 s. */
async function capture(policy: PolicyName, level: number, seed: number): Promise<Capture> {
  const threshold = BALANCE.heatThresholds[level - 1] as number;
  const sim = await createWorld({ map: 'city', seed, traffic: 1, peds: 0, record: false, heat: threshold });
  let busted = 0, rearm = -1, fellX = 0, fellZ = 0;
  try {
    const bot = new BotPolicy(policy, new TrackBot(sim.carId, CITY_BOT_TUNING));
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
    const bot = new BotPolicy('novice', new TrackBot(sim.carId, CITY_BOT_TUNING));
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
    const jobs = sim.jobs.defs.filter((d) => d.kind !== 'escape');
    const jobMean = jobs.reduce((n, d) => n + d.payout, 0) / jobs.length;
    return { bag: bag / (SECONDS / 60), coins: sim.run.coins / (SECONDS / 60), jobMean };
  } finally { sim.dispose(); }
}

/** Seconds from heat 0 to levels 2 and 3 for a policy that only drives (M5.5 slice 0; -1 = not inside the cap). */
async function timeToLevel(policy: PolicyName, cap = 540): Promise<{ t2: number; t3: number }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
  try {
    const bot = new BotPolicy(policy, new TrackBot(sim.carId, CITY_BOT_TUNING));
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

interface Ev { level: number; bank: number; minutes: number; perMinute: number }

/**
 * DESIGN.md §2.7: stages 1..L of two minutes, each a job and the free-roam bag; a Poisson capture at each
 * stage's rate; busted mid-stage keeps the fine of the bag so far (half the stage earned); the door pays the
 * bag at level L's multiplier; the coins of every minute driven are kept.
 */
function ev(rates: readonly number[], bagPerMinute: number, coinsPerMinute: number, job: number, cashOut: number): Ev {
  let alive = 1, bank = 0, minutes = 0, bag = 0, t = 0;
  for (let l = 1; l <= cashOut; l++) {
    const survive = Math.exp(-(rates[l] ?? 0) * STAGE_MINUTES);
    const busted = alive * (1 - survive);
    // busted mid-stage: half the stage's free roam in the bag, the job not done, half its time driven
    bank += busted * (BALANCE.fine * (bag + bagPerMinute * STAGE_MINUTES / 2) + coinsPerMinute * (t + STAGE_MINUTES / 2));
    minutes += busted * (t + STAGE_MINUTES / 2);
    alive *= survive;
    bag += job + bagPerMinute * STAGE_MINUTES;
    t += STAGE_MINUTES;
  }
  const runMinutes = t + DOOR_MINUTES;
  bank += alive * (bag * (BALANCE.multiplier[cashOut] ?? 1) + coinsPerMinute * runMinutes);
  minutes += alive * runMinutes;
  return { level: cashOut, bank, minutes, perMinute: bank / minutes };
}

/**
 * The purchase ladder in the order a player buys: the compact, a tier, the van, then the tiers, with the sports
 * car last (the plan put it sixth; at any price above the van's it is a longer save than the ten-minute cadence
 * allows, so it is the second hour's goal and the tiers carry the first).
 */
const LADDER: Array<[string, number]> = [
  ['compact', BALANCE.prices.compact],
  ['tier 1 power', BALANCE.tierPrices[0] as number],
  ['heavy', BALANCE.prices.heavy],
  ['tier 1 grip', BALANCE.tierPrices[0] as number],
  ['tier 2 power', BALANCE.tierPrices[1] as number],
  ['tier 1 boost', BALANCE.tierPrices[0] as number],
  ['tier 2 grip', BALANCE.tierPrices[1] as number],
  ['tier 3 power', BALANCE.tierPrices[2] as number],
  ['tier 2 boost', BALANCE.tierPrices[1] as number],
  ['tier 3 grip', BALANCE.tierPrices[2] as number],
  ['tier 3 boost', BALANCE.tierPrices[2] as number],
  ['sports', BALANCE.prices.sports],
];

describe('the balance script', () => {
  it('captures, the EV table, the first hour, and the three assertions', async () => {
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
    const earn = { bag: mean((e) => e.bag), coins: mean((e) => e.coins), jobMean: mean((e) => e.jobMean) };
    const out: string[] = [];
    for (const policy of ['novice', 'skilled'] as const) {
      const t = await timeToLevel(policy);
      const fmt = (v: number): string => (v < 0 ? 'not inside the cap' : `${v.toFixed(0)} s`);
      out.push(`time to level from heat 0, ${policy}: level 2 ${fmt(t.t2)}, level 3 ${fmt(t.t3)}`);
    }
    out.push(`busted a minute (seeds ${SEEDS.join(' / ')}, traffic on, ${SECONDS} s a level, M4 measured novice ${BALANCE.measured.bustedPerMinute.slice(1).join(' / ')}, skilled ${BALANCE.measured.bustedPerMinuteSkilled.slice(1).join(' / ')}):`, ...rows);
    out.push(`bag ${earn.bag.toFixed(0)} a minute (${earns.map((e) => e.bag.toFixed(0)).join(' / ')}), coins ${earn.coins.toFixed(0)} a minute from heat 0 (M4: ${BALANCE.measured.bagPerMinute}, ${BALANCE.measured.coinsPerMinute} coins); the placed jobs' mean payout ${earn.jobMean.toFixed(0)}`);

    const table: Record<PolicyName, Ev[]> = { novice: [], skilled: [] };
    for (const policy of ['novice', 'skilled'] as const) {
      for (const level of LEVELS) table[policy].push(ev(rates[policy], earn.bag, earn.coins, earn.jobMean, level));
    }
    const best = (list: Ev[]): Ev => list.reduce((a, b) => (b.bank > a.bank ? b : a));
    out.push('expected bank a run by cash-out level (DESIGN.md §2.7), and a minute:');
    for (const policy of ['novice', 'skilled'] as const) {
      out.push(`  ${policy.padEnd(7)} ${table[policy].map((e) => `L${e.level} ${(e.bank / 1000).toFixed(1)}k (${e.perMinute.toFixed(0)}/min)`).join('  ')}   best L${best(table[policy]).level}`);
    }

    // the first hour of a novice at its best level
    const nov = best(table.novice);
    const runMinutes = nov.minutes;
    const perRun = nov.bank;
    // the cold open: 90 s at heat 1, its delivery with a third of the clock left, the route's gate and a takedown
    const coldOpen = { minutes: 1.5, bank: Math.round(BALANCE.coldOpen.payout * (1 + BALANCE.jobs.timeBonus / 3)) + BALANCE.bag.billboard + BALANCE.bag.policeTakedown };
    let funds = coldOpen.bank + earn.coins * coldOpen.minutes;
    const bought: Array<[string, number]> = [];
    let rung = 0;
    // a tick at a time: coins as they come, a run's bank at its door, the purchases at the doors
    const step = 1 / 60, doorTicks = Math.round(runMinutes / step);
    for (let tick = 1, start = Math.round(coldOpen.minutes / step); start + tick <= HOUR / step && rung < LADDER.length; tick++) {
      funds += earn.coins * step;
      if (tick % doorTicks !== 0) continue;
      funds += perRun - earn.coins * runMinutes;
      const minute = (start + tick) * step;
      while (rung < LADDER.length && funds >= (LADDER[rung] as [string, number])[1]) {
        const [name, price] = LADDER[rung] as [string, number];
        funds -= price;
        bought.push([name, minute]);
        rung++;
      }
    }
    out.push(`the novice's first hour at L${nov.level} (runs of ${runMinutes.toFixed(1)} min banking ${(perRun / 1000).toFixed(1)}k with the coins; the cold open ${(coldOpen.bank / 1000).toFixed(1)}k in ${coldOpen.minutes} min):`);
    let prev = 0;
    const gaps: number[] = [];
    for (const [name, minute] of bought) {
      out.push(`  minute ${minute.toFixed(1).padStart(5)}  ${name}${prev > 0 ? `  (+${(minute - prev).toFixed(1)})` : ''}`);
      if (prev > 0) gaps.push(minute - prev);
      prev = minute;
    }
    console.info(out.join('\n'));

    // (a) the optimum rises with skill
    expect(best(table.skilled).level).toBeGreaterThan(best(table.novice).level);
    // (b) the first car inside the brief's five to seven minutes
    const compact = bought.find(([n]) => n === 'compact');
    expect(compact).toBeDefined();
    expect(compact![1]).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(compact![1]).toBeLessThanOrEqual(7);
    // (c) something new every three to ten minutes
    expect(Math.max(...gaps)).toBeLessThanOrEqual(10);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(3);
  }, 1_800_000);
});
