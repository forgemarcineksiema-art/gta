/**
 * The balance model's quick half (M7 slice 10, docs/M7_PLAN.md D8): the EV table of DESIGN.md §2.7 and the first
 * hour's purchases, pure, from measured inputs. `balance.test.ts` measures the inputs with the bots at the gate and
 * calls this; `model.test.ts` runs it on the last gate's recorded inputs in the quick set, so fitting a price or a
 * multiplier takes a second, not the bots' minutes.
 */
import { BALANCE } from '../../src/sim/balance';
import { KIT } from '../../src/sim/garage/kit';

/** Minutes of a run spent at each level, and the drive to the door (DESIGN.md §2.7). */
export const STAGE_MINUTES = 2;
export const DOOR_MINUTES = 1;
export const HOUR = 60;
export const LEVELS = [1, 2, 3, 4, 5];

export interface Ev { level: number; bank: number; minutes: number; perMinute: number }

/** What the model reads: busted a minute by level (index = level, 0 unused), the bag, the coins, the jobs' mean. */
export interface ModelInput {
  novice: readonly number[];
  skilled: readonly number[];
  bagPerMinute: number;
  coinsPerMinute: number;
  jobMean: number;
}

/** The economy's knobs the model prices with (`BALANCE` by default). */
export interface Knobs {
  multiplier: readonly number[];
  fine: number;
  prices: { compact: number; heavy: number; offroad: number; sports: number };
  tierPrices: readonly number[];
}

export const BALANCE_KNOBS: Knobs = { multiplier: BALANCE.multiplier, fine: BALANCE.fine, prices: BALANCE.prices, tierPrices: BALANCE.tierPrices };

/**
 * DESIGN.md §2.7: stages 1..L of two minutes, each a job and the free-roam bag; a Poisson capture at each
 * stage's rate; busted mid-stage keeps the fine of the bag so far (half the stage earned); the door pays the
 * bag at level L's multiplier; the coins of every minute driven are kept.
 */
export function ev(rates: readonly number[], bagPerMinute: number, coinsPerMinute: number, job: number, cashOut: number, knobs: Knobs = BALANCE_KNOBS): Ev {
  let alive = 1, bank = 0, minutes = 0, bag = 0, t = 0;
  for (let l = 1; l <= cashOut; l++) {
    const survive = Math.exp(-(rates[l] ?? 0) * STAGE_MINUTES);
    const busted = alive * (1 - survive);
    // busted mid-stage: half the stage's free roam in the bag, the job not done, half its time driven
    bank += busted * (knobs.fine * (bag + bagPerMinute * STAGE_MINUTES / 2) + coinsPerMinute * (t + STAGE_MINUTES / 2));
    minutes += busted * (t + STAGE_MINUTES / 2);
    alive *= survive;
    bag += job + bagPerMinute * STAGE_MINUTES;
    t += STAGE_MINUTES;
  }
  const runMinutes = t + DOOR_MINUTES;
  bank += alive * (bag * (knobs.multiplier[cashOut] ?? 1) + coinsPerMinute * runMinutes);
  minutes += alive * runMinutes;
  return { level: cashOut, bank, minutes, perMinute: bank / minutes };
}

export function best(list: readonly Ev[]): Ev {
  return list.reduce((a, b) => (b.bank > a.bank ? b : a));
}

/**
 * The rates the EV reads (M7 slice 10): a level's police have everything the level below has, so a driver's true
 * rate of capture never falls with the level; where the measured rates fall (three seeds of three minutes count
 * busts in steps of a ninth: the M6 gate's novice was caught 0.78 a minute at level 2 and 0.44 at 3), neighbouring
 * levels are pooled to their mean (the non-decreasing fit, each level measured over the same minutes).
 */
export function pooled(rates: readonly number[]): number[] {
  const sums: number[] = [], counts: number[] = [];
  for (let l = 1; l < rates.length; l++) {
    sums.push(rates[l] as number);
    counts.push(1);
    for (let n = sums.length; n > 1 && (sums[n - 2] as number) / (counts[n - 2] as number) > (sums[n - 1] as number) / (counts[n - 1] as number); n--) {
      sums[n - 2] = (sums[n - 2] as number) + (sums.pop() as number);
      counts[n - 2] = (counts[n - 2] as number) + (counts.pop() as number);
    }
  }
  const out = [0];
  for (let b = 0; b < sums.length; b++) for (let k = 0; k < (counts[b] as number); k++) out.push((sums[b] as number) / (counts[b] as number));
  return out;
}

/** Both profiles' EV rows, cash-out level 1 to 5, on the pooled rates. */
export function evTable(input: ModelInput, knobs: Knobs = BALANCE_KNOBS): { novice: Ev[]; skilled: Ev[] } {
  const row = (rates: readonly number[]): Ev[] => LEVELS.map((level) => ev(pooled(rates), input.bagPerMinute, input.coinsPerMinute, input.jobMean, level, knobs));
  return { novice: row(input.novice), skilled: row(input.skilled) };
}

/**
 * The purchase ladder in the order a player buys: the compact, a tier, the van, then the tiers with the 4×4 among
 * them (M8.8 slice 10), the sports car last (the second hour's goal; the tiers carry the first).
 */
export function ladder(knobs: Knobs = BALANCE_KNOBS): Array<[string, number]> {
  const t = knobs.tierPrices;
  return [
    ['compact', knobs.prices.compact], ['tier 1 power', t[0] as number], ['heavy', knobs.prices.heavy],
    ['tier 1 grip', t[0] as number], ['tier 2 power', t[1] as number], ['tier 1 boost', t[0] as number],
    ['offroad', knobs.prices.offroad],
    ['tier 2 grip', t[1] as number], ['tier 3 power', t[2] as number], ['tier 2 boost', t[1] as number],
    ['tier 3 grip', t[2] as number], ['tier 3 boost', t[2] as number], ['sports', knobs.prices.sports],
  ];
}

export interface FirstHour {
  /** The novice's run: its level, minutes and bank. */
  run: Ev;
  bought: Array<[string, number]>;
  /** Minutes between the ladder's purchases (the kit not counted), and between things seen bought (a car, a kit item). */
  gaps: number[];
  seenGaps: number[];
  cars: number;
  /** The minute the third car is owned, -1 if not in the hour. */
  thirdCar: number;
}

/** The cold open: 90 s at heat 1, its delivery with a third of the clock left, the route's gate and a takedown. */
export const COLD_OPEN = { minutes: 1.5, bank: Math.round(BALANCE.coldOpen.payout * (1 + BALANCE.jobs.timeBonus / 3)) + BALANCE.bag.billboard + BALANCE.bag.policeTakedown };

/**
 * The first hour of a novice at its best cash-out level: the cold open, then runs one after another, the coins as
 * they come; at each door the ladder's next rungs it can afford, else, four minutes after the last thing seen bought,
 * the cheapest kit item not had (a twelve-year-old's buy, M6).
 */
export function firstHour(input: ModelInput, knobs: Knobs = BALANCE_KNOBS): FirstHour {
  const nov = best(evTable(input, knobs).novice);
  const runMinutes = nov.minutes, perRun = nov.bank;
  const steps = ladder(knobs);
  let funds = COLD_OPEN.bank + input.coinsPerMinute * COLD_OPEN.minutes;
  const bought: Array<[string, number]> = [];
  let rung = 0;
  const kitShop = KIT.filter((k) => k.price > 0).sort((a, b) => a.price - b.price);
  let kitNext = 0, lastSeen = COLD_OPEN.minutes, cars = 1;
  const seen: number[] = [];
  const CARS = new Set(['compact', 'heavy', 'offroad', 'sports']);
  const step = 1 / 60, doorTicks = Math.round(runMinutes / step);
  for (let tick = 1, start = Math.round(COLD_OPEN.minutes / step); start + tick <= HOUR / step && rung < steps.length; tick++) {
    funds += input.coinsPerMinute * step;
    if (tick % doorTicks !== 0) continue;
    funds += perRun - input.coinsPerMinute * runMinutes;
    const minute = (start + tick) * step;
    let rungBought = false;
    while (rung < steps.length && funds >= (steps[rung] as [string, number])[1]) {
      const [name, price] = steps[rung] as [string, number];
      funds -= price;
      bought.push([name, minute]);
      rung++;
      rungBought = true;
      if (CARS.has(name)) { cars++; seen.push(minute); lastSeen = minute; }
    }
    const kit = kitShop[kitNext];
    if (!rungBought && kit && minute - lastSeen >= 4 && funds >= kit.price) {
      funds -= kit.price;
      kitNext++;
      bought.push([`kit: ${kit.name.toLowerCase()}`, minute]);
      seen.push(minute);
      lastSeen = minute;
    }
  }
  const gaps: number[] = [];
  let prev = 0;
  for (const [name, minute] of bought) {
    if (name.startsWith('kit')) continue;
    if (prev > 0) gaps.push(minute - prev);
    prev = minute;
  }
  const seenGaps = seen.map((m, k) => m - (k === 0 ? COLD_OPEN.minutes : seen[k - 1] as number));
  const third = bought.filter(([n]) => CARS.has(n))[1];
  return { run: nov, bought, gaps, seenGaps, cars, thirdCar: third ? third[1] : -1 };
}

/** What the four assertions read (DESIGN.md §2.7, docs/M7_PLAN.md slice 10). */
export interface Verdict {
  noviceBest: number;
  skilledBest: number;
  /** The skilled bank never falls from level 1 to its best level. */
  skilledRising: boolean;
  /** The minute the compact is bought, -1 if not in the hour. */
  compact: number;
  hour: FirstHour;
}

export function verdict(input: ModelInput, knobs: Knobs = BALANCE_KNOBS): Verdict {
  const t = evTable(input, knobs);
  const skilledBest = best(t.skilled).level;
  let skilledRising = true;
  for (let l = 1; l < skilledBest; l++) if ((t.skilled[l] as Ev).bank < (t.skilled[l - 1] as Ev).bank) skilledRising = false;
  const hour = firstHour(input, knobs);
  const compact = hour.bought.find(([n]) => n === 'compact');
  return { noviceBest: best(t.novice).level, skilledBest, skilledRising, compact: compact ? compact[1] : -1, hour };
}

/**
 * The M7 gate's measured inputs (docs/PROGRESS.md, 2026-09-24; three seeds' busts over three minutes, so the rates
 * are ninths; the careful bot as the novice): the quick pin's and the fitting's. The M6 gate's were a bag of 1,157 a
 * minute and 241 in coins, the novice 3 / 7 / 4 / 4 / 4 ninths, the skilled 5 / 3 / 7 / 1 / 3.
 */
export const GATE_INPUT: ModelInput = {
  novice: [0, 4 / 9, 3 / 9, 3 / 9, 6 / 9, 3 / 9],
  skilled: [0, 1 / 9, 5 / 9, 5 / 9, 2 / 9, 2 / 9],
  bagPerMinute: 3647,
  coinsPerMinute: 150,
  jobMean: 7018,
};
