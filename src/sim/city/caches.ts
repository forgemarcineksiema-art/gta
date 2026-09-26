/**
 * The day's caches (docs/DESIGN.md §13.5, M5.5 slice 1): a finite, visible
 * goal in free roam. From a fixed list of candidate spots on the side streets
 * (`cacheSpots`, from the graph, farthest-point ordered and at least `minGap`
 * m apart) the date seed picks `perDay`, the same for every player that day
 * (`cachesFor`; no date, the first `perDay` by order, so the tours and the
 * perf runs never change). Each is a run of `run` coins ending on a cap worth
 * `cacheCap`, laid into the coins' `caches` pool; picking the cap finds it.
 * The tenth, twentieth and thirtieth pay `bonus` into the bank through the
 * 'cache' event (`Run` reads it). No allocation per step.
 *
 * On the island (M8.10 slice 15) the rule is the same over its streets, which
 * are shorter than the grid's 225 m blocks: a candidate every `ISLAND_CACHES.every`
 * m along each street's lane (the run clear of its ends), the plan's sixty
 * (§1.4) first in the farthest-point order; each run over its road's height.
 */
import { BALANCE } from '../balance';
import { fnv1a } from '../dailies/Dailies';
import type { Island } from '../island/Island';
import type { RoadClass } from '../island/plan';
import { mulberry32 } from '../random';
import type { SimWorld } from '../SimWorld';
import { COIN_HEIGHT, type CoinPoint } from './coins';
import { laneAt, laneLength } from './route';
import type { Lane, RoadGraph } from './roads';

export interface CacheSpot {
  lane: number;
  /** Where the run starts along the lane; the cap lies `run` pitches on. */
  s: number;
  /** The run's middle: what the radar shows and the spacing uses; its road's height there (the grid's 0). */
  x: number;
  z: number;
  y: number;
}

/**
 * The island's (m): a candidate every `every` m along a street's lane, the run `end` m clear of the lane's ends; the
 * plan's `count` spots (§1.4); the roads that hold them (every one but the highway and its ramps), the island's seed.
 */
export const ISLAND_CACHES = {
  every: 30, end: 12, count: 60, seed: 42,
  roads: new Set<RoadClass>(['avenue', 'street', 'side', 'serpentine', 'dirt', 'taxiway']),
} as const;

/** About 120 candidates: a side street's lane middle, ordered by farthest-point sampling from a seeded start, at least `minGap` m apart. */
export function cacheSpots(city: { graph: RoadGraph; seed: number }): CacheSpot[] {
  const c = BALANCE.coin.cache;
  const runLen = c.run * BALANCE.coin.pitch;
  const cands: CacheSpot[] = [];
  for (const lane of city.graph.lanes) {
    if (lane.highway || lane.special) continue;
    const len = laneLength(lane);
    if (len < runLen + 80) continue;
    const s = len / 2 - runLen / 2;
    const p = laneAt(lane, s + runLen / 2);
    cands.push({ lane: lane.id, s, x: p.x, z: p.z, y: p.y });
  }
  return spread(cands, city.seed, c.candidates, c.minGap);
}

/**
 * The island's sixty (M8.10 slice 15): a candidate every `ISLAND_CACHES.every` m along each street's lane, the first
 * `count` in the farthest-point order from the island's seed.
 */
export function islandCacheSpots(island: Island): CacheSpot[] {
  const I = ISLAND_CACHES, runLen = BALANCE.coin.cache.run * BALANCE.coin.pitch;
  const net = island.network, cls = new Map(net.lines.map((l) => [l.id, l.cls]));
  const cands: CacheSpot[] = [];
  for (const lane of net.graph.lanes) {
    const road = cls.get(net.laneRoad[lane.id] ?? '');
    if (lane.highway || !road || !I.roads.has(road)) continue;
    const room = laneLength(lane) - 2 * I.end - runLen;
    if (room < 0) continue;
    // the stations centred on the lane, `every` apart
    const k = Math.floor(room / I.every);
    for (let i = 0; i <= k; i++) {
      const s = I.end + room / 2 - (k * I.every) / 2 + i * I.every;
      const p = laneAt(lane, s + runLen / 2);
      cands.push({ lane: lane.id, s, x: p.x, z: p.z, y: p.y });
    }
  }
  return spread(cands, I.seed, I.count, 0);
}

/** Candidates in farthest-point order from a seeded start: at most `max`, stopping where the next is under `minGap` m from all before it. */
function spread(cands: readonly CacheSpot[], seed: number, max: number, minGap: number): CacheSpot[] {
  if (cands.length === 0) return [];
  const rnd = mulberry32(seed ^ 0xca5e);
  const dist = new Float64Array(cands.length).fill(Infinity);
  const out: CacheSpot[] = [];
  let pick = Math.floor(rnd() * cands.length);
  for (let n = 0; n < cands.length && n < max; n++) {
    const spot = cands[pick] as CacheSpot;
    out.push(spot);
    dist[pick] = -1;
    let best = -1, bestD = 0;
    for (let i = 0; i < cands.length; i++) {
      const d = dist[i] as number;
      if (d < 0) continue;
      const q = cands[i] as CacheSpot;
      const nd = Math.min(d, Math.hypot(q.x - spot.x, q.z - spot.z));
      dist[i] = nd;
      if (nd > bestD) { bestD = nd; best = i; }
    }
    if (best < 0 || bestD < minGap) break;
    pick = best;
  }
  return out;
}

/** Today's `n` spots (indices into the list): the date seed's shuffle, or the first `n` by order without a date. */
export function cachesFor(spots: readonly CacheSpot[], date: string, n: number): number[] {
  const count = Math.min(n, spots.length);
  const order: number[] = [];
  for (let i = 0; i < spots.length; i++) order.push(i);
  if (date) {
    const rnd = mulberry32(fnv1a(date) ^ 0xca5e);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i] as number;
      order[i] = order[j] as number;
      order[j] = t;
    }
  }
  return order.slice(0, count);
}

export class Caches {
  readonly total = BALANCE.coin.cache.perDay;
  /** Found today, per slot of today's list. */
  readonly found: Uint8Array;
  count = 0;
  /** The local date today's were drawn for; '' before the first. */
  date = '';
  /** Bumps when the day's list or the count changes (the radar, the counter). */
  serial = 0;
  readonly spots: readonly CacheSpot[];
  /** Today's spots (indices into `spots`). */
  today: number[] = [];
  private readonly capIds: Int32Array;
  /** The lanes the spots are on: the grid's or the island's. */
  private readonly graph: RoadGraph | null;
  private laid = false;

  constructor(private readonly sim: SimWorld) {
    this.spots = sim.city ? cacheSpots(sim.city) : sim.island ? islandCacheSpots(sim.island) : [];
    this.graph = sim.city?.graph ?? sim.island?.network.graph ?? null;
    this.found = new Uint8Array(this.total);
    this.capIds = new Int32Array(this.total).fill(-1);
  }

  /** The app's local date: a new date draws today's and forgets yesterday's finds; the same date lays what the save kept. */
  setDate(local: string): void {
    if (local === this.date) {
      if (!this.laid) this.lay();
      return;
    }
    this.date = local;
    this.found.fill(0);
    this.count = 0;
    this.lay();
  }

  /** Today's runs into the coins' pool: a found one is not laid again. */
  lay(): void {
    const coins = this.sim.coins;
    const graph = this.graph;
    if (!coins || !graph) return;
    coins.clearExtra('caches');
    this.today = cachesFor(this.spots, this.date, this.total);
    const c = BALANCE.coin;
    const points: CoinPoint[] = [];
    let k = 0;
    for (let slot = 0; slot < this.today.length; slot++) {
      this.capIds[slot] = -1;
      if (this.found[slot] === 1) continue;
      const spot = this.spots[this.today[slot] as number] as CacheSpot;
      const lane = graph.lanes[spot.lane] as Lane;
      // each coin over its lane's road (the grid's 0, the island's hills)
      for (let j = 0; j < c.cache.run; j++) {
        const p = laneAt(lane, spot.s + j * c.pitch);
        points.push({ x: p.x, y: p.y + COIN_HEIGHT, z: p.z, lane: -4, value: c.value, phase: j });
        k++;
      }
      const cap = laneAt(lane, spot.s + c.cache.run * c.pitch);
      points.push({ x: cap.x, y: cap.y + COIN_HEIGHT, z: cap.z, lane: -4, value: c.cacheCap, phase: c.cache.run });
      this.capIds[slot] = coins.extraId('caches', k);
      k++;
    }
    coins.addExtra(points, 'caches');
    this.laid = true;
    this.serial++;
  }

  /** A cap picked finds its cache; every tenth pays a bonus into the bank. */
  step(): void {
    if (!this.laid) this.lay();
    const coins = this.sim.coins;
    if (!coins) return;
    for (let slot = 0; slot < this.today.length; slot++) {
      const id = this.capIds[slot] as number;
      if (id < 0 || this.found[slot] === 1 || coins.picked[id] !== 1) continue;
      this.found[slot] = 1;
      this.capIds[slot] = -1;
      this.count++;
      this.serial++;
      const bonus = this.count % 10 === 0 ? (BALANCE.coin.cache.bonus[this.count / 10 - 1] ?? 0) : 0;
      const spot = this.spots[this.today[slot] as number] as CacheSpot;
      this.sim.events.push('cache', bonus, spot.x, spot.y + COIN_HEIGHT, spot.z, this.count);
    }
  }

  /** The save's day: the date and the finds, before the first step (the first step lays what is left). */
  restore(date: string, found: Uint8Array): void {
    this.date = date;
    this.count = 0;
    for (let i = 0; i < this.total; i++) {
      this.found[i] = i < found.length && found[i] === 1 ? 1 : 0;
      if (this.found[i] === 1) this.count++;
    }
    this.laid = false;
    this.serial++;
  }
}
