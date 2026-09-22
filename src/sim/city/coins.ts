/**
 * Coins on the road (docs/DESIGN.md §3.2): the twelve-year-old's reward
 * layer. Runs of coins along the lane centres and a line through every
 * billboard, placed per lane from the city seed and handed to the chunk that
 * holds each coin, so a run that crosses a chunk border is one run. Picked by
 * the chassis footprint; always the player's, never at risk. The spill (§2.2)
 * lays part of the bag on the lane ahead of a wreck as a short-lived pool of
 * bigger coins that pay back into the bag.
 *
 * No allocation per step: the picked set and the spill pool are typed arrays.
 */
import { BALANCE } from '../balance';
import type { EventLog } from '../events';
import { mulberry32 } from '../random';
import type { PlayerProbe } from '../traffic/Traffic';
import type { LanePose, LaneProjection, LaneTables } from '../traffic/lanes';
import type { City } from './City';
import type { BillboardDesc } from './collectibles';
import type { RoadGraph } from './roads';
import { BLOCK } from './roads';

export interface CoinDesc {
  /** Stable: chunk index × COINS_PER_CHUNK_MAX + slot. */
  id: number;
  x: number;
  z: number;
  /** The lane it lies on, or -1 for a billboard's line. */
  lane: number;
}

export const COINS_PER_CHUNK_MAX = 256;
const CHUNKS = 49;
/** Metres left clear at a lane's start and before its end (the junction box and its approach). */
const LANE_START = 10;
const LANE_END = 30;

function chunkOf(v: number): number {
  return Math.max(-3, Math.min(3, Math.floor((v + BLOCK / 2) / BLOCK)));
}

/** Points along a polyline at the distances `at`, in order. */
function samplePolyline(points: readonly { x: number; z: number }[], at: number[], out: Array<{ x: number; z: number }>): void {
  let seg = 0, travelled = 0;
  for (const s of at) {
    while (seg + 1 < points.length) {
      const a = points[seg] as { x: number; z: number }, b = points[seg + 1] as { x: number; z: number };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (s <= travelled + len || seg + 2 === points.length) {
        const t = len > 0 ? Math.max(0, Math.min(1, (s - travelled) / len)) : 0;
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        break;
      }
      travelled += len;
      seg++;
    }
  }
}

function polylineLength(points: readonly { x: number; z: number }[]): number {
  let len = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as { x: number; z: number }, b = points[i + 1] as { x: number; z: number };
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

/**
 * Every lane's coins, from the seed: runs of `runMin..runMax` at `pitch`,
 * gaps of `gapMin..gapMax`, clear of the lane's first 10 m and last 30 m.
 * Computed once per city; each chunk takes the ones inside it.
 */
export function laneCoins(graph: RoadGraph, seed: number): Array<{ x: number; z: number; lane: number }> {
  const c = BALANCE.coin;
  const out: Array<{ x: number; z: number; lane: number }> = [];
  const at: number[] = [];
  const pts: Array<{ x: number; z: number }> = [];
  for (const lane of graph.lanes) {
    const rnd = mulberry32(seed ^ Math.imul(lane.id + 101, 2654435761));
    const len = polylineLength(lane.points);
    at.length = 0;
    let s = LANE_START + rnd() * c.gapMin;
    while (s < len - LANE_END) {
      const n = c.runMin + Math.floor(rnd() * (c.runMax - c.runMin + 1));
      for (let k = 0; k < n && s + k * c.pitch <= len - LANE_END; k++) at.push(s + k * c.pitch);
      s += n * c.pitch + c.gapMin + rnd() * (c.gapMax - c.gapMin);
    }
    pts.length = 0;
    samplePolyline(lane.points, at, pts);
    for (const p of pts) out.push({ x: p.x, z: p.z, lane: lane.id });
  }
  return out;
}

/** This chunk's coins: the lane coins inside it, then a line of coins through each of its billboards. */
export function placeCoins(cx: number, cz: number, lanes: ReadonlyArray<{ x: number; z: number; lane: number }>, billboards: readonly BillboardDesc[]): CoinDesc[] {
  const index = (cz + 3) * 7 + (cx + 3);
  const out: CoinDesc[] = [];
  const push = (x: number, z: number, lane: number): void => {
    if (out.length >= COINS_PER_CHUNK_MAX) return;
    out.push({ id: index * COINS_PER_CHUNK_MAX + out.length, x, z, lane });
  };
  for (const coin of lanes) if (chunkOf(coin.x) === cx && chunkOf(coin.z) === cz) push(coin.x, coin.z, coin.lane);
  // through the panel along its normal, the way a car smashes it, over the run-out the placer kept clear
  const n = BALANCE.coin.billboardLine;
  const pitch = 2.5;
  for (const b of billboards) {
    const nx = Math.sin(b.yaw), nz = Math.cos(b.yaw);
    for (let k = 0; k < n; k++) {
      const d = (k - (n - 1) / 2) * pitch;
      if (Math.abs(d) < 1) continue;
      push(b.x + nx * d, b.z + nz * d, -1);
    }
  }
  return out;
}

export class Coins {
  /** One byte per (chunk, slot). */
  readonly picked = new Uint8Array(CHUNKS * COINS_PER_CHUNK_MAX);
  pickedCount = 0;
  /** The spill pool: position, value, seconds left (0 = empty). */
  readonly spillX: Float32Array;
  readonly spillZ: Float32Array;
  readonly spillValue: Float32Array;
  readonly spillTtl: Float32Array;
  /** Bumps whenever the spill pool changes shape (laid, a coin picked, expired) so the view repacks. */
  spillSerial = 0;
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };

  constructor(private readonly city: City, private readonly lanes: LaneTables) {
    const n = BALANCE.spill.coins;
    this.spillX = new Float32Array(n);
    this.spillZ = new Float32Array(n);
    this.spillValue = new Float32Array(n);
    this.spillTtl = new Float32Array(n);
  }

  /** Picks under the chassis this step; pushes one 'coin' per coin (target: its id, or -2 for a spilled one). Returns the value picked. */
  step(player: PlayerProbe, dt: number, events: EventLog): number {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const rx = -fz, rz = fx;
    const hl = player.halfLength + 0.4, hw = player.halfWidth + 0.4;
    let value = 0;
    for (const entry of this.city.active.values()) {
      const coins = entry.chunk.coins;
      if (coins.length === 0) continue;
      // a chunk is 225 m across: its coins are only worth testing when it is near
      const first = coins[0] as CoinDesc;
      if (Math.abs(first.x - player.x) > 250 || Math.abs(first.z - player.z) > 250) continue;
      for (let i = 0; i < coins.length; i++) {
        const coin = coins[i] as CoinDesc;
        if (this.picked[coin.id] === 1) continue;
        const dx = coin.x - player.x, dz = coin.z - player.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
        if (Math.abs(dx * fx + dz * fz) > hl || Math.abs(dx * rx + dz * rz) > hw) continue;
        this.picked[coin.id] = 1;
        this.pickedCount++;
        value += BALANCE.coin.value;
        events.push('coin', BALANCE.coin.value, coin.x, 0.8, coin.z, coin.id);
      }
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
        events.push('coin', v, this.spillX[k] as number, 0.8, this.spillZ[k] as number, -2);
        continue;
      }
      const left = ttl - dt;
      this.spillTtl[k] = left > 0 ? left : 0;
      if (left <= 0) this.spillSerial++;
    }
    return value;
  }

  /**
   * Lay `total` over the spill pool on the lane that runs the way the wreck
   * faced: from `startAhead` m past the wreck at `pitch`, each coin an equal
   * share (the remainder on the first ones), for `seconds`. The rolling
   * respawn comes out on that lane, so it drives through them.
   */
  spill(x: number, z: number, yaw: number, total: number, events: EventLog): void {
    const sp = BALANCE.spill;
    const lanes = this.lanes;
    let lane = -1, best = Infinity, bestS = 0;
    for (let i = 0; i < lanes.laneCount; i++) {
      if (Math.hypot((lanes.midX[i] as number) - x, (lanes.midZ[i] as number) - z) > (lanes.length[i] as number) / 2 + 30) continue;
      lanes.project(i, x, z, this.proj);
      // near and facing the way the car did: the other carriageway's lane runs backwards
      const cost = this.proj.dist + (1 - Math.cos(this.proj.yaw - yaw)) * 20;
      if (cost < best) { best = cost; lane = i; bestS = this.proj.s; }
    }
    const n = this.spillTtl.length;
    const base = Math.floor(total / n);
    let rest = total - base * n;
    for (let k = 0; k < n; k++) {
      let px = x + Math.sin(yaw) * (sp.startAhead + k * sp.pitch);
      let pz = z + Math.cos(yaw) * (sp.startAhead + k * sp.pitch);
      if (lane >= 0) {
        const s = bestS + sp.startAhead + k * sp.pitch;
        const outs = lanes.outs(lane);
        let next = -1;
        for (const o of outs) if (lanes.straightThrough(lane, o)) { next = o; break; }
        lanes.positionAt(lane, s, 0, this.pose, next >= 0 ? next : (outs[0] ?? -1));
        px = this.pose.x;
        pz = this.pose.z;
      }
      this.spillX[k] = px;
      this.spillZ[k] = pz;
      this.spillValue[k] = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      this.spillTtl[k] = sp.seconds;
    }
    this.spillSerial++;
    events.push('spill', total, x, 0.5, z, -1);
  }

  /** Spilled coins still on the road. */
  spillLeft(): number {
    let n = 0;
    for (let k = 0; k < this.spillTtl.length; k++) if ((this.spillTtl[k] as number) > 0) n++;
    return n;
  }
}
