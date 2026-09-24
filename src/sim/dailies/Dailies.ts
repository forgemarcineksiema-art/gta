/**
 * Daily challenges and the login streak (docs/M5_PLAN.md slice 6, DESIGN.md
 * §3.4). Three challenges in the language of runs, drawn from the local date
 * (`YYYY-MM-DD`, passed in by the app: the sim never reads a clock, D3), the
 * same three for everyone on a date; progress from the event ring and from
 * the run's ends; each completion pays its reward into the bank (never the
 * bag, D14). The streak counts consecutive days the game was opened, pays
 * rising cash once a day, and at day seven puts the topper on the car.
 *
 * The date also seeds the day's police layout (`setDailyOrder` on the cover
 * sites): which chokepoints, parked-patrol junctions and cameras are manned
 * today. Jobs, coins, ramps and the city stay fixed.
 *
 * No allocation per step.
 */
import { BALANCE } from '../balance';
import { setDailyOrder } from '../city/cover';
import { PROP_KINDS, type PropKind } from '../city/props';
import type { EventKind, SimEvent } from '../events';
import type { JobKind } from '../jobs/catalog';
import { mulberry32 } from '../random';
import type { SimWorld } from '../SimWorld';
import type { CarId } from '../vehicle/presets';

/** What a challenge counts: an event kind, a banked run's total ('banked'), or banked runs in a row ('run'). */
export type DailyKind = EventKind | 'banked' | 'run';

export interface DailyTemplate {
  id: number;
  text: string;
  kind: DailyKind;
  /** How many to count; for 'banked' the cash in one run; for a threshold event the value it must reach. */
  target: number;
  /** Counted only in this class. */
  car?: CarId;
  /** Counted only for this job kind (`jobDone`). */
  job?: JobKind;
  /** A police car's takedown only. */
  police?: boolean;
  /** One event whose value reaches `target` completes it (an escape from a level, an airtime). */
  threshold?: boolean;
  /** A smash of this kind of street furniture only (M8 slice 9). */
  prop?: PropKind;
  /** Counted within one run: a run that ends short of it starts the count again. */
  oneRun?: boolean;
  /** 0, 1, 2 → `BALANCE.dailies.rewards`. */
  weight: 0 | 1 | 2;
}

/** About twelve, in the language of runs (DESIGN.md §3.4); ids are stable, the save stores them. */
export const DAILY_TEMPLATES: readonly DailyTemplate[] = [
  { id: 0, text: 'BANK 10,000 IN ONE RUN', kind: 'banked', target: 10000, weight: 0 },
  { id: 1, text: 'BANK 25,000 IN ONE RUN', kind: 'banked', target: 25000, weight: 1 },
  { id: 2, text: 'BANK 50,000 IN ONE RUN', kind: 'banked', target: 50000, weight: 2 },
  { id: 3, text: 'ESCAPE FROM ★★★', kind: 'escape', target: 3, threshold: true, weight: 1 },
  { id: 4, text: 'ESCAPE FROM ★★★★★', kind: 'escape', target: 5, threshold: true, weight: 2 },
  { id: 5, text: '3 TAKEDOWNS IN A COMPACT', kind: 'takedown', target: 3, car: 'compact', weight: 1 },
  { id: 6, text: 'SMASH 3 BILLBOARDS', kind: 'billboard', target: 3, weight: 0 },
  { id: 7, text: 'DELIVER AN ORDER WITHOUT A SCRATCH', kind: 'jobDone', target: 1, job: 'order', weight: 1 },
  { id: 8, text: 'COMPLETE 2 DELIVERIES', kind: 'jobDone', target: 2, job: 'delivery', weight: 1 },
  { id: 9, text: '2 POLICE TAKEDOWNS', kind: 'takedown', target: 2, police: true, weight: 1 },
  { id: 10, text: 'PICK UP 150 COINS', kind: 'coin', target: 150, weight: 0 },
  { id: 11, text: '10 NEAR MISSES', kind: 'nearMiss', target: 10, weight: 0 },
  { id: 12, text: 'BANK 3 RUNS WITHOUT GETTING BUSTED', kind: 'run', target: 3, weight: 1 },
  // the chaos (M8 slice 9): the player's smashes only
  { id: 13, text: 'SMASH 60 THINGS IN ONE RUN', kind: 'smash', target: 60, oneRun: true, weight: 1 },
  { id: 14, text: 'FLATTEN 10 LAMP POSTS', kind: 'smash', target: 10, prop: 'lamp', weight: 0 },
];

/** 32-bit FNV-1a of a string: the date's seed. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Days since 1970-01-01 for a `YYYY-MM-DD` date (the civil calendar, no clock); NaN for anything else. */
export function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return NaN;
  let y = Number(m[1]);
  const mo = Number(m[2]), d = Number(m[3]);
  // Howard Hinnant's days_from_civil
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export class Dailies {
  /** The local date the three were drawn for, `YYYY-MM-DD`; '' before the first. */
  date = '';
  readonly ids: [number, number, number] = [-1, -1, -1];
  readonly progress: [number, number, number] = [0, 0, 0];
  readonly done: [boolean, boolean, boolean] = [false, false, false];
  readonly streak = { count: 0, last: '', topper: false };
  /** Bumps when the day's three, their progress or the streak change (the wall's page). */
  serial = 0;
  private cursor: number;
  /** Completions found while reading the ring, paid after it (a push inside a read would overwrite unread entries). */
  private readonly finished: [boolean, boolean, boolean] = [false, false, false];

  constructor(private readonly sim: SimWorld) {
    this.cursor = sim.events.sequence;
  }

  /** Slot i's template, or null before a draw. */
  template(i: number): DailyTemplate | null {
    return DAILY_TEMPLATES[this.ids[i] ?? -1] ?? null;
  }

  /** Slot i's line for the wall; '' before a draw. */
  text(i: number): string {
    return this.template(i)?.text ?? '';
  }

  /** Slot i's progress for the wall, e.g. `2/3` or `12,400/25,000`. */
  progressText(i: number): string {
    const t = this.template(i);
    if (!t) return '';
    if (t.threshold) return this.done[i] ? '1/1' : '0/1';
    const p = Math.min(t.target, this.progress[i] ?? 0);
    return `${Math.round(p).toLocaleString('en-US')}/${t.target.toLocaleString('en-US')}`;
  }

  /** Slot i's cash. */
  reward(i: number): number {
    const t = this.template(i);
    return t ? (BALANCE.dailies.rewards[t.weight] ?? 0) : 0;
  }

  /**
   * The app's local date, at boot and once a minute. A new date draws three
   * distinct challenges from it, clears their progress, reseeds the day's
   * police layout, and moves the streak (yesterday → +1, a gap → 1), paying
   * the day's streak cash once. The same date again does nothing.
   */
  setDate(local: string): void {
    if (!Number.isFinite(dayNumber(local))) return;
    this.sim.caches?.setDate(local);
    if (local === this.date) {
      // a save from today: the police layout is today's too
      if (this.sim.cover && this.sim.cover.daily.seed !== fnv1a(local)) setDailyOrder(this.sim.cover, fnv1a(local));
      return;
    }
    this.date = local;
    const seed = fnv1a(local);
    const rng = mulberry32(seed);
    for (let i = 0; i < 3; i++) {
      let id = (rng() * DAILY_TEMPLATES.length) | 0;
      // distinct: walk on from a repeat
      while (this.ids.indexOf(id) >= 0 && this.ids.indexOf(id) < i) id = (id + 1) % DAILY_TEMPLATES.length;
      this.ids[i] = id;
      this.progress[i] = 0;
      this.done[i] = false;
    }
    if (this.sim.cover) setDailyOrder(this.sim.cover, seed);
    const s = this.streak;
    if (s.last !== local) {
      const gap = dayNumber(local) - dayNumber(s.last);
      s.count = gap === 1 ? s.count + 1 : 1;
      s.last = local;
      if (s.count >= 7) s.topper = true;
      const table = BALANCE.dailies.streak;
      const cash = table[Math.min(s.count, table.length) - 1] ?? 0;
      this.sim.run.earn(cash);
      this.sim.events.push('streak', cash, 0, 0, 0, s.count);
    }
    this.serial++;
  }

  /** Progress from this step's events; completions pay into the bank. */
  step(): void {
    this.cursor = this.sim.events.readFrom(this.cursor, this.onEvent);
    for (let i = 0; i < 3; i++) {
      if (!this.finished[i]) continue;
      this.finished[i] = false;
      this.complete(i);
    }
  }

  /** The run's end (Run calls it at the door and on busted): the banked-run challenges. */
  onRunEnd(banked: number, _maxHeat: number, busted: boolean): void {
    for (let i = 0; i < 3; i++) {
      const t = this.template(i);
      if (!t || this.done[i]) continue;
      if (t.kind === 'banked') {
        if (!busted && banked >= t.target) this.complete(i);
      } else if (t.kind === 'run') {
        this.progress[i] = busted ? 0 : (this.progress[i] ?? 0) + 1;
        this.serial++;
        if ((this.progress[i] ?? 0) >= t.target) this.complete(i);
      } else if (t.oneRun) {
        this.progress[i] = 0;
        this.serial++;
      }
    }
  }

  private complete(i: number): void {
    if (this.done[i]) return;
    const t = this.template(i);
    if (t) this.progress[i] = t.target;
    this.done[i] = true;
    const cash = this.reward(i);
    this.sim.run.earn(cash);
    this.serial++;
    this.sim.events.push('dailyDone', cash, 0, 0, 0, i);
  }

  private readonly onEvent = (e: SimEvent): void => {
    for (let i = 0; i < 3; i++) {
      const t = DAILY_TEMPLATES[this.ids[i] as number];
      if (!t || this.done[i] || this.finished[i]) continue;
      if (!this.counts(t, e)) continue;
      if (t.threshold) {
        if (e.value >= t.target) this.finished[i] = true;
        continue;
      }
      this.progress[i] = (this.progress[i] as number) + 1;
      this.serial++;
      if ((this.progress[i] as number) >= t.target) this.finished[i] = true;
    }
  };

  /** Whether an event is one of the template's. */
  private counts(t: DailyTemplate, e: SimEvent): boolean {
    const sim = this.sim;
    if (t.car && sim.carId !== t.car) return false;
    switch (t.kind) {
      case 'takedown':
        if (e.kind !== 'takedown' && e.kind !== 'takedownTraffic') return false;
        return !t.police || sim.traffic?.police[e.target] === 1;
      case 'nearMiss':
        return e.kind === 'nearMiss' || e.kind === 'nearMissOncoming';
      case 'coin':
        // a road coin, not the bag's spill coming back
        return e.kind === 'coin' && e.target !== -2;
      case 'smash':
        // the player's (a bill), of the kind when it names one
        if (e.kind !== 'smash' || e.value <= 0) return false;
        return !t.prop || sim.props?.kind[e.target] === PROP_KINDS.indexOf(t.prop);
      case 'jobDone': {
        if (e.kind !== 'jobDone') return false;
        const d = sim.jobs.defOf(e.target);
        if (!d || (t.job && d.kind !== t.job)) return false;
        // an order without a scratch: paid in full
        return d.kind !== 'order' || e.value >= d.payout;
      }
      default:
        return e.kind === t.kind;
    }
  }
}
