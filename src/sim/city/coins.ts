/**
 * Coins on the road (docs/DESIGN.md §13.5, M5.5 slice 1): a coin is attached
 * to a goal or it does not exist. No coin lies on a road for being a road.
 *
 * - static, in the chunks: the gate line through a billboard (`gateCoins`
 *   and the cap on the panel) and the arc over a ramp (`arcCoins` in the
 *   air and the cap on the landing);
 * - run-time pools (`addExtra` / `clearExtra` by tag): the rings' pool, empty
 *   since M8.9 R7 (no coins round a ring: they pulled a player through a ring
 *   that says slow down), the day's caches (`caches.ts`,
 *   by the date seed) and the running job's route (`routeLine`: runs into and
 *   out of every turn, a run every `straightEvery` m of straight, the cap on
 *   the target; laid at the job's start, cleared at its end).
 *
 * Picked by a box round the chassis with a reach, so the catch reads as a
 * magnet in the view; coins in the air need the car in the air. Always the
 * player's, never at risk. The spill (§2.2) lays part of the bag on the lane
 * ahead of a wreck as a short-lived pool of bigger coins that pay back into
 * the bag. No allocation per step: the picked set and the spill pool are
 * typed arrays.
 *
 * Every coin is laid at its road's height (M8.10 slice 15, the island's hills): a line on a lane at the lane's, a coin
 * off it (a gate's swerve, a panel, the pools laid without one) at the ground's (the grid's 0). The island's own static
 * lines (a gate through its billboards, an arc over its ramps) are laid a chunk at a time (`layChunk`), their ids after
 * the pools'.
 */
import { BALANCE } from '../balance';
import type { EventLog } from '../events';
import type { PlayerProbe } from '../traffic/Traffic';
import type { LanePose, LaneProjection, LaneTables } from '../traffic/lanes';
import type { City } from './City';
import { BILLBOARD_WIDTH, type BillboardDesc } from './collectibles';
import { rampProfile, type JumpDesc } from './jumps';
import { alongLane, laneAt, laneLength, type Pt } from './route';
import { BLOCK, type Lane, type RoadGraph } from './roads';

export interface CoinDesc {
  /**
   * Stable: chunk index × COINS_PER_CHUNK_MAX + slot; run-time coins from EXTRA_COIN_BASE in their pool's range; the
   * island's chunks' from ISLAND_COIN_BASE.
   */
  id: number;
  x: number;
  /** The centre's height: COIN_HEIGHT over the road, higher in a ramp's arc. */
  y: number;
  z: number;
  /** -1 for a gate line or a ramp arc; the run-time pools: -3 the markers' rings, -4 the caches, -5 the route. */
  lane: number;
  /** `BALANCE.coin.value`, or `cap` for the bigger coin a line ends on (`cacheCap` on a cache). */
  value: number;
  /** Index along its line: the view spins the line as a ripple running away from the player. */
  phase: number;
}

export type CoinPoint = Omit<CoinDesc, 'id'>;

export const COINS_PER_CHUNK_MAX = 256;
const CHUNKS = 49;
/** Run-time coins take ids after every chunk's, each pool in its own range. */
export const EXTRA_COIN_BASE = CHUNKS * COINS_PER_CHUNK_MAX;
export type ExtraTag = 'rings' | 'caches' | 'route';
/** Each pool's slot range within the extras (the rings: 32 markers × 8, M5.5's 28 jobs; the caches: 30 × 9; a route: 300 at most). */
export const EXTRA_RANGES: Readonly<Record<ExtraTag, readonly [number, number]>> = { rings: [0, 256], caches: [256, 576], route: [576, 1024] };
export const EXTRA_COINS_MAX = 1024;
/**
 * The island's static lines (M8.10 slice 15) take ids after the pools': chunk index × COINS_PER_CHUNK_MAX + slot from
 * here, for up to `ISLAND_COIN_CHUNKS` chunks (the island has 10 × 8).
 */
export const ISLAND_COIN_BASE = EXTRA_COIN_BASE + EXTRA_COINS_MAX;
export const ISLAND_COIN_CHUNKS = 128;
/** Whether a coin's id is a run-time pool's (the rings', the caches', a route's), not a chunk's. */
export function isExtraCoin(id: number): boolean {
  return id >= EXTRA_COIN_BASE && id < ISLAND_COIN_BASE;
}
const TAG_LANE: Readonly<Record<ExtraTag, number>> = { rings: -3, caches: -4, route: -5 };
/** A coin's centre hovers this high over the road: bonnet height, half a metre of air under it. */
export const COIN_HEIGHT = 1.0;
/** The ground's height at a point: the grid's flat 0, the island's hills. */
export type GroundAt = (x: number, z: number) => number;
const FLAT: GroundAt = () => 0;
/** A spill keeps to a lane at the wreck's own level: a lane more than this over or under the wreck is another road's (m). */
const OTHER_LEVEL = 3;
/** The verge hook turns off the outer lane on this radius (m): a drift at speed, a firm turn at 50 km/h. */
const HOOK_RADIUS = 30;
/** A route's runs keep this far from a lane's ends (m) and this far from each other. */
const TURN_INSET = 6;
const RUN_GAP = 10;
const TURN_RAD = 15 * Math.PI / 180;

function chunkOf(v: number): number {
  return Math.max(-3, Math.min(3, Math.floor((v + BLOCK / 2) / BLOCK)));
}

function smooth(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The chain turns between these lanes (a straight-through junction is not a decision). */
export function isTurn(lane: Lane, next: Lane): boolean {
  return Math.abs(wrap(next.yaw0 - lane.yaw)) >= TURN_RAD;
}

function push(out: CoinPoint[], p: Pt, y: number, lane: number, value: number, phase: number): void {
  out.push({ x: p.x, y, z: p.z, lane, value, phase });
}

/**
 * Over a ramp: `arcCoins` coins in the flight of a car launched at `arc.speed`, the cap on the landing; `ground` the
 * height under a point (the grid's 0, the island's hills: M8.10 slice 15), the ramp standing on it, the flight from its
 * lip until it meets it.
 */
function arc(jd: JumpDesc, out: CoinPoint[], ground: GroundAt): void {
  const c = BALANCE.coin;
  const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
  const floor = (a: number): number => ground(jd.x + fx * a, jd.z + fz * a);
  // the ground under the lip: the island's foot stands at its `y` (a roof's, a deck's), the ground's rise to the lip on it
  const lip = jd.y === undefined ? floor(0) : jd.y + floor(0) - floor(-jd.length);
  const profile = rampProfile(jd);
  const surface = (a: number): number => {
    for (let i = 0; i + 1 < profile.length; i++) {
      const p = profile[i] as { along: number; y: number }, q = profile[i + 1] as { along: number; y: number };
      if (a >= p.along && a <= q.along) return p.y + (q.y - p.y) * ((a - p.along) / (q.along - p.along || 1));
    }
    return 0;
  };
  const tan = jd.height / jd.length;
  const v2 = c.arc.speed * c.arc.speed / (1 + tan * tan);
  const flight = (a: number): number => jd.height + a * tan - c.arc.gravity * a * a / (2 * v2);
  const at = (a: number): Pt => ({ x: jd.x + fx * a, z: jd.z + fz * a });
  const up = (a: number): boolean => lip + flight(a) > floor(a) + 0.3 && a < ARC_REACH;
  let phase = 0;
  let a = c.pitch;
  for (let laid = 0; up(a) && laid < c.arcCoins; a += c.pitch, laid++) push(out, at(a), Math.max(floor(a) + surface(a), lip + flight(a)) + COIN_HEIGHT, -1, c.value, phase++);
  while (up(a)) a += c.pitch;
  const cap = at(a + c.pitch);
  push(out, cap, ground(cap.x, cap.z) + COIN_HEIGHT, -1, c.cap, phase);
}

/** An arc's flight is followed this far past its lip at most (m). */
const ARC_REACH = 400;

/**
 * The static layout from the seed: an arc over every ramp, over the ground under it (`ground`, the grid's 0). The gate
 * lines are placed per chunk with their billboards.
 */
export function layoutCoins(jumps: readonly JumpDesc[], ground: GroundAt = FLAT): CoinPoint[] {
  const out: CoinPoint[] = [];
  for (const jd of jumps) arc(jd, out, ground);
  return out;
}

/**
 * The line through a billboard: a footway gate's `gateCoins` coins swerving
 * from the lane it stands beside onto the footway and the cap on the panel;
 * a verge panel's the last `gateCoins` of a hook off the ring's outer lane
 * and the cap on the panel. Null when no lane runs past the panel. Each coin
 * over the ground at its point (`ground`, the grid's 0); a verge's hook only
 * off a lane on the ground (not a deck's, nor the tunnel's).
 */
export function gateLine(graph: RoadGraph, b: BillboardDesc, ground: GroundAt = FLAT): CoinPoint[] | null {
  const c = BALANCE.coin;
  const n = c.gateCoins;
  const out: CoinPoint[] = [];
  const verge = b.width !== BILLBOARD_WIDTH;
  const heading = verge ? b.yaw + Math.PI / 2 : b.yaw;
  for (const lane of graph.lanes) {
    if (lane.special || lane.highway !== verge) continue;
    if (Math.abs(Math.cos(lane.yaw - heading)) < 0.9) continue;
    const mid = lane.points[Math.floor(lane.points.length / 2)] as Pt;
    if (Math.abs(mid.x - b.x) > 200 || Math.abs(mid.z - b.z) > 200) continue;
    const len = laneLength(lane);
    const { s, lateral } = alongLane(lane, b.x, b.z);
    if (verge) {
      if (lateral < 14 || lateral > 20 || s > len - 10) continue;
      // a panel beside an overpass's ramp: its hook would run through the wall (a lane off the ground's height)
      const beside = laneAt(lane, s);
      if (Math.abs(beside.y - ground(beside.x, beside.z)) > 0.05) continue;
      const theta = Math.acos(1 - lateral / HOOK_RADIUS);
      const sArc = s - HOOK_RADIUS * Math.sin(theta);
      // the corner chunks' slots sit 39 m along the lane: the arc must start on it
      if (sArc < 4) continue;
      const p0 = laneAt(lane, sArc);
      const tx = Math.sin(p0.yaw), tz = Math.cos(p0.yaw);
      const rx = -tz, rz = tx;
      const cx = p0.x + rx * HOOK_RADIUS, cz = p0.z + rz * HOOK_RADIUS;
      const step = c.pitch / HOOK_RADIUS;
      const phis: number[] = [];
      for (let phi = step; phi < theta - 0.5 * step; phi += step) phis.push(phi);
      let phase = 0;
      for (const phi of phis.slice(Math.max(0, phis.length - n))) {
        const p = { x: cx - rx * HOOK_RADIUS * Math.cos(phi) + tx * HOOK_RADIUS * Math.sin(phi), z: cz - rz * HOOK_RADIUS * Math.cos(phi) + tz * HOOK_RADIUS * Math.sin(phi) };
        push(out, p, ground(p.x, p.z) + COIN_HEIGHT, -1, c.value, phase++);
      }
      push(out, { x: b.x, z: b.z }, ground(b.x, b.z) + COIN_HEIGHT, -1, c.cap, phase);
      return out;
    }
    if (lateral < 8 || lateral > 12 || s < n * c.pitch + 2 || s > len - 4) continue;
    let phase = 0;
    for (let k = -n; k < 0; k++) {
      const p = laneAt(lane, s + k * c.pitch, lateral * smooth((k + n) / n));
      push(out, p, ground(p.x, p.z) + COIN_HEIGHT, -1, c.value, phase++);
    }
    const cap = laneAt(lane, s, lateral);
    push(out, cap, ground(cap.x, cap.z) + COIN_HEIGHT, -1, c.cap, phase);
    return out;
  }
  return null;
}

/** This chunk's coins: the layout's inside it, then the gate line through each of its billboards. */
export function placeCoins(cx: number, cz: number, layout: readonly CoinPoint[], billboards: readonly BillboardDesc[], graph: RoadGraph): CoinDesc[] {
  const index = (cz + 3) * 7 + (cx + 3);
  const out: CoinDesc[] = [];
  const take = (p: CoinPoint): void => {
    if (out.length >= COINS_PER_CHUNK_MAX) return;
    out.push({ id: index * COINS_PER_CHUNK_MAX + out.length, x: p.x, y: p.y, z: p.z, lane: p.lane, value: p.value, phase: p.phase });
  };
  for (const p of layout) if (chunkOf(p.x) === cx && chunkOf(p.z) === cz) take(p);
  for (const b of billboards) {
    const line = gateLine(graph, b);
    if (line) for (const p of line) take(p);
  }
  return out;
}

/**
 * The coins along a job's route (DESIGN.md §13.5): on the chain's own lanes
 * only, where a decision is. A run of `route.turn` out of every turn (from
 * `TURN_INSET` past the lane's start) and into every turn (ending `TURN_INSET`
 * before its end), a run of `route.straight` every `straightEvery` m of the
 * straight between them, and on the last lane a run before the cap, which
 * sits on `end` (the target) at the height of its lane where it is left.
 * `s0` is where the chain's first lane is joined, `sEnd` where its last lane
 * is left. Each coin over its lane's road (the grid's 0, the island's hills).
 */
export function routeLine(graph: RoadGraph, chain: readonly number[], s0: number, sEnd: number, end: Pt, out: CoinPoint[]): void {
  const c = BALANCE.coin;
  const r = c.route;
  const pitch = c.pitch;
  let phase = 0;
  const run = (lane: Lane, from: number, n: number): void => {
    for (let k = 0; k < n; k++) {
      const p = laneAt(lane, from + k * pitch);
      push(out, p, COIN_HEIGHT + p.y, TAG_LANE.route, c.value, phase++);
    }
  };
  const turnSpan = (r.turn - 1) * pitch;
  for (let i = 0; i < chain.length; i++) {
    const lane = graph.lanes[chain[i] as number] as Lane;
    const prev = i > 0 ? graph.lanes[chain[i - 1] as number] as Lane : null;
    const next = i + 1 < chain.length ? graph.lanes[chain[i + 1] as number] as Lane : null;
    const from = i === 0 ? s0 : 0;
    const to = next ? laneLength(lane) : sEnd;
    if (to - from < TURN_INSET * 2) continue;
    const entry = prev && isTurn(prev, lane) ? from + TURN_INSET : -1;
    const exit = !next || isTurn(lane, next) ? to - TURN_INSET - turnSpan : -1;
    const a = entry >= 0 ? entry + turnSpan + RUN_GAP : from;
    const b = exit >= 0 ? exit - RUN_GAP : to;
    if (entry >= 0 && entry + turnSpan <= to) run(lane, entry, r.turn);
    for (let s = a + r.straightEvery / 2; s + (r.straight - 1) * pitch <= b; s += r.straightEvery) run(lane, s, r.straight);
    if (exit >= 0 && exit >= Math.max(from, entry >= 0 ? entry + turnSpan + RUN_GAP : from)) run(lane, exit, r.turn);
  }
  const last = chain[chain.length - 1];
  if (last !== undefined) push(out, end, COIN_HEIGHT + laneAt(graph.lanes[last] as Lane, sEnd).y, TAG_LANE.route, c.cap, phase);
}

/**
 * A line of coins point to point (M8.8 slice 20, the sea trial; M8.10 slice 15, the dry canal): runs of the route's
 * straight count along each leg of `points`, `y` their centres' height or its reader, the cap on the last point.
 */
export function polyLine(points: readonly Pt[], y: number | ((x: number, z: number) => number), out: CoinPoint[]): void {
  const c = BALANCE.coin, r = c.route, pitch = c.pitch, at = (x: number, z: number): number => typeof y === 'number' ? y : y(x, z);
  let phase = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Pt, b = points[i + 1] as Pt;
    const length = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
    for (let s = r.straightEvery / 2; s + (r.straight - 1) * pitch <= length; s += r.straightEvery) {
      for (let k = 0; k < r.straight; k++) {
        const x = a.x + ux * (s + k * pitch), z = a.z + uz * (s + k * pitch);
        push(out, { x, z }, at(x, z), TAG_LANE.route, c.value, phase++);
      }
    }
  }
  const last = points[points.length - 1];
  if (last) push(out, last, at(last.x, last.z), TAG_LANE.route, c.cap, phase);
}

export class Coins {
  /** One byte per (chunk, slot), then one per extra coin, then per island chunk's (slot). */
  readonly picked = new Uint8Array(ISLAND_COIN_BASE + ISLAND_COIN_CHUNKS * COINS_PER_CHUNK_MAX);
  pickedCount = 0;
  /** Coins laid at run time, outside the chunks, in their pools' id ranges. */
  readonly extra: CoinDesc[] = [];
  /** Bumps when extra coins are laid or cleared, so the view registers them. */
  extraSerial = 0;
  /** The island's static lines by chunk index (`layChunk`; the grid's chunks hold their own), and a serial the view reads. */
  readonly chunks = new Map<number, readonly CoinDesc[]>();
  chunkSerial = 0;
  /** The running job's route: coins laid and coins taken (the job line and the tip). */
  routeTotal = 0;
  routePicked = 0;
  /** The spill pool: position, its centre's height (its lane's road's and COIN_HEIGHT), value, seconds left (0 = empty). */
  readonly spillX: Float32Array;
  readonly spillY: Float32Array;
  readonly spillZ: Float32Array;
  readonly spillValue: Float32Array;
  readonly spillTtl: Float32Array;
  /** Bumps whenever the spill pool changes shape (laid, a coin picked, expired) so the view repacks. */
  spillSerial = 0;
  private readonly extraNext: Record<ExtraTag, number> = { rings: 0, caches: 0, route: 0 };
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };

  /**
   * `city`: the grid's, whose loaded chunks hold their static coins (null on the island). `ground`: the ground's height
   * a coin laid without one stands over (the grid's 0; the island's hills, `StreetMap.groundAt`).
   */
  constructor(private readonly city: City | null, private readonly lanes: LaneTables, private readonly ground: GroundAt = FLAT) {
    const n = BALANCE.spill.coins;
    this.spillX = new Float32Array(n);
    this.spillY = new Float32Array(n).fill(COIN_HEIGHT);
    this.spillZ = new Float32Array(n);
    this.spillValue = new Float32Array(n);
    this.spillTtl = new Float32Array(n);
  }

  /**
   * An island chunk's static line (M8.10 slice 15: a gate through a billboard, an arc over a ramp), by its index: ids from
   * `ISLAND_COIN_BASE`, the chunk's `COINS_PER_CHUNK_MAX` at most; laid again, it replaces the chunk's.
   */
  layChunk(index: number, points: readonly CoinPoint[]): void {
    if (index < 0 || index >= ISLAND_COIN_CHUNKS) throw new Error(`coins: island chunk ${index} past ${ISLAND_COIN_CHUNKS}`);
    const out: CoinDesc[] = [];
    for (const p of points) {
      if (out.length >= COINS_PER_CHUNK_MAX) break;
      out.push({ id: ISLAND_COIN_BASE + index * COINS_PER_CHUNK_MAX + out.length, x: p.x, y: p.y, z: p.z, lane: p.lane, value: p.value, phase: p.phase });
    }
    this.chunks.set(index, out);
    this.chunkSerial++;
  }

  /**
   * Picks in the reach box round the chassis this step (`reach.ahead` past the
   * bumpers, `reach.side` past the doors, `reach.up` about the bonnet); pushes
   * one 'coin' per coin (target: its id, or -2 for a spilled one). Returns the
   * value picked.
   */
  step(player: PlayerProbe, dt: number, events: EventLog): number {
    const reach = BALANCE.coin.reach;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const rx = -fz, rz = fx;
    const hl = player.halfLength + reach.ahead, hw = player.halfWidth + reach.side;
    const cy = player.y + 0.5;
    let value = 0;
    // a grid chunk is 225 m across: its coins are only worth testing when its first is within 250 m; an island chunk's
    // 250 m, its list within its diagonal and a car's reach
    if (this.city) for (const entry of this.city.active.values()) value += this.pickChunk(entry.chunk.coins, 250, player, fx, fz, rx, rz, hl, hw, cy, events);
    if (this.chunks.size > 0) for (const coins of this.chunks.values()) value += this.pickChunk(coins, 370, player, fx, fz, rx, rz, hl, hw, cy, events);
    const extra = this.extra;
    const routeLo = EXTRA_COIN_BASE + EXTRA_RANGES.route[0];
    for (let i = 0; i < extra.length; i++) {
      const coin = extra[i] as CoinDesc;
      if (this.picked[coin.id] === 1) continue;
      const dx = coin.x - player.x, dz = coin.z - player.z;
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(coin.y - cy) > reach.up) continue;
      if (Math.abs(dx * fx + dz * fz) > hl || Math.abs(dx * rx + dz * rz) > hw) continue;
      this.picked[coin.id] = 1;
      this.pickedCount++;
      if (coin.id >= routeLo) this.routePicked++;
      value += coin.value;
      events.push('coin', coin.value, coin.x, coin.y, coin.z, coin.id);
    }
    for (let k = 0; k < this.spillTtl.length; k++) {
      const ttl = this.spillTtl[k] as number;
      if (ttl <= 0) continue;
      const dx = (this.spillX[k] as number) - player.x, dz = (this.spillZ[k] as number) - player.z;
      if (Math.abs(dx * fx + dz * fz) <= hl + 0.3 && Math.abs(dx * rx + dz * rz) <= hw + 0.3) {
        const v = this.spillValue[k] as number;
        this.spillTtl[k] = 0;
        this.spillSerial++;
        value += v;
        events.push('coin', v, this.spillX[k] as number, this.spillY[k] as number, this.spillZ[k] as number, -2);
        continue;
      }
      const left = ttl - dt;
      this.spillTtl[k] = left > 0 ? left : 0;
      if (left <= 0) this.spillSerial++;
    }
    return value;
  }

  /** A chunk's static coins in the reach box (`step`'s), picked, when its first is within `near` m; the value picked. */
  private pickChunk(coins: readonly CoinDesc[], near: number, player: PlayerProbe, fx: number, fz: number, rx: number, rz: number, hl: number, hw: number, cy: number, events: EventLog): number {
    if (coins.length === 0) return 0;
    const first = coins[0] as CoinDesc;
    if (Math.abs(first.x - player.x) > near || Math.abs(first.z - player.z) > near) return 0;
    const up = BALANCE.coin.reach.up;
    let value = 0;
    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i] as CoinDesc;
      if (this.picked[coin.id] === 1) continue;
      const dx = coin.x - player.x, dz = coin.z - player.z;
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(coin.y - cy) > up) continue;
      if (Math.abs(dx * fx + dz * fz) > hl || Math.abs(dx * rx + dz * rz) > hw) continue;
      this.picked[coin.id] = 1;
      this.pickedCount++;
      value += coin.value;
      events.push('coin', coin.value, coin.x, coin.y, coin.z, coin.id);
    }
    return value;
  }

  /**
   * Lay `total` over the spill pool on the lane that runs the way the wreck
   * faced: from `startAhead` m past the wreck at `pitch`, each coin an equal
   * share (the remainder on the first ones), for `seconds`. The rolling
   * respawn comes out on that lane, so it drives through them. With the
   * wreck's height given (`y`), a lane at another level (a deck over it, the
   * street under it) is not its; each coin over its lane's road, or over the
   * ground with no lane near.
   */
  spill(x: number, z: number, yaw: number, total: number, events: EventLog, y = Number.NaN): void {
    const sp = BALANCE.spill;
    const lanes = this.lanes;
    const level = Number.isFinite(y);
    let lane = -1, best = Infinity, bestS = 0;
    for (let i = 0; i < lanes.laneCount; i++) {
      if (Math.hypot((lanes.midX[i] as number) - x, (lanes.midZ[i] as number) - z) > (lanes.length[i] as number) / 2 + 30) continue;
      lanes.project(i, x, z, this.proj);
      // near and facing the way the car did: the other carriageway's lane runs backwards
      let cost = this.proj.dist + (1 - Math.cos(this.proj.yaw - yaw)) * 20;
      if (level) {
        lanes.positionAt(i, this.proj.s, 0, this.pose);
        if (Math.abs((this.pose.y ?? 0) - y) > OTHER_LEVEL) cost += 1000;
      }
      if (cost < best) { best = cost; lane = i; bestS = this.proj.s; }
    }
    // the burst leaves the wreck from its road (its lane's there, or the ground's)
    let road = this.ground(x, z);
    if (lane >= 0) {
      lanes.positionAt(lane, bestS, 0, this.pose);
      road = this.pose.y ?? 0;
    }
    const n = this.spillTtl.length;
    const base = Math.floor(total / n);
    let rest = total - base * n;
    for (let k = 0; k < n; k++) {
      let px = x + Math.sin(yaw) * (sp.startAhead + k * sp.pitch);
      let pz = z + Math.cos(yaw) * (sp.startAhead + k * sp.pitch);
      let py = this.ground(px, pz);
      if (lane >= 0) {
        const s = bestS + sp.startAhead + k * sp.pitch;
        const outs = lanes.outs(lane);
        let next = -1;
        for (const o of outs) if (lanes.straightThrough(lane, o)) { next = o; break; }
        lanes.positionAt(lane, s, 0, this.pose, next >= 0 ? next : (outs[0] ?? -1));
        px = this.pose.x;
        pz = this.pose.z;
        py = this.pose.y ?? 0;
      }
      this.spillX[k] = px;
      this.spillY[k] = py + COIN_HEIGHT;
      this.spillZ[k] = pz;
      this.spillValue[k] = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      this.spillTtl[k] = sp.seconds;
    }
    this.spillSerial++;
    events.push('spill', total, x, road + 0.5, z, -1);
  }

  /**
   * Lays coins into a pool (beyond its room they are dropped); returns how many were laid. The id of the k-th coin laid
   * is `extraId(tag, k)`. A point without its height stands `COIN_HEIGHT` over the ground there.
   */
  addExtra(points: ReadonlyArray<Pt & { y?: number; value?: number; phase?: number }>, tag: ExtraTag = 'rings'): number {
    const [lo, hi] = EXTRA_RANGES[tag];
    let n = 0;
    for (const p of points) {
      const slot = lo + (this.extraNext[tag]);
      if (slot >= hi) break;
      this.extraNext[tag]++;
      const id = EXTRA_COIN_BASE + slot;
      this.picked[id] = 0;
      this.extra.push({ id, x: p.x, y: p.y ?? this.ground(p.x, p.z) + COIN_HEIGHT, z: p.z, lane: TAG_LANE[tag], value: p.value ?? BALANCE.coin.value, phase: p.phase ?? n });
      n++;
    }
    if (tag === 'route') this.routeTotal += n;
    if (n > 0) this.extraSerial++;
    return n;
  }

  /** A coin taken by rule rather than by the reach box (the cap on a job's target, taken on arrival). */
  take(id: number, events: EventLog): void {
    if (id < 0 || id >= this.picked.length || this.picked[id] === 1) return;
    const routeLo = EXTRA_COIN_BASE + EXTRA_RANGES.route[0];
    for (let i = 0; i < this.extra.length; i++) {
      const coin = this.extra[i] as CoinDesc;
      if (coin.id !== id) continue;
      this.picked[id] = 1;
      this.pickedCount++;
      if (id >= routeLo) this.routePicked++;
      events.push('coin', coin.value, coin.x, coin.y, coin.z, coin.id);
      return;
    }
  }

  /** The id the k-th coin laid into a pool since its last clear carries. */
  extraId(tag: ExtraTag, k: number): number {
    return EXTRA_COIN_BASE + (EXTRA_RANGES[tag][0]) + k;
  }

  /** Takes a pool's coins off the road (picked or not). */
  clearExtra(tag: ExtraTag = 'rings'): void {
    const [lo, hi] = EXTRA_RANGES[tag];
    let w = 0, removed = 0;
    for (let i = 0; i < this.extra.length; i++) {
      const coin = this.extra[i] as CoinDesc;
      const slot = coin.id - EXTRA_COIN_BASE;
      if (slot >= lo && slot < hi) {
        this.picked[coin.id] = 1;
        removed++;
        continue;
      }
      this.extra[w++] = coin;
    }
    this.extra.length = w;
    this.extraNext[tag] = 0;
    if (tag === 'route') {
      this.routeTotal = 0;
      this.routePicked = 0;
    }
    if (removed > 0) this.extraSerial++;
  }

  /** Spilled coins still on the road. */
  spillLeft(): number {
    let n = 0;
    for (let k = 0; k < this.spillTtl.length; k++) if ((this.spillTtl[k] as number) > 0) n++;
    return n;
  }
}
