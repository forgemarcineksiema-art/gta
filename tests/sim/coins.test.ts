/**
 * Coins and the spill (docs/M4_PLAN.md slice 3b): placement per chunk from
 * the seed, a run picked once at 60 km/h, the wreck's spill laid on the lane
 * ahead and scrambled back by the rolling respawn, an untouched spill
 * expiring, and coins surviving busted.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { COINS_PER_CHUNK_MAX, type CoinDesc } from '../../src/sim/city/coins';
import { GARAGE } from '../../src/sim/city/cover';
import { projectOnLane, type Lane } from '../../src/sim/city/roads';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

function allCoins(sim: SimWorld): CoinDesc[] {
  const out: CoinDesc[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(...sim.city!.generate(cx, cz).coins);
  return out;
}

function laneLength(lane: Lane): number {
  let len = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) len += Math.hypot(lane.points[i + 1]!.x - lane.points[i]!.x, lane.points[i + 1]!.z - lane.points[i]!.z);
  return len;
}

/** Distance along a lane's polyline to the projection of a point. */
function alongLane(lane: Lane, x: number, z: number): number {
  let best = Infinity, at = 0, travelled = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i]!, b = lane.points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len)));
    const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
    if (d < best) { best = d; at = travelled + t * len; }
    travelled += len;
  }
  return at;
}

/** A straight street lane and its pose at `s`. */
function street(sim: SimWorld, s: number): { lane: number; x: number; z: number; yaw: number } {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < 150) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2) continue;
    const pose = { x: 0, z: 0, yaw: 0 };
    lanes.positionAt(i, s, 0, pose);
    return { lane: i, ...pose };
  }
  throw new Error('no straight street lane');
}

describe('coins', () => {
  it('3.8 placement is deterministic, on the lane centres, clear of the lane ends, 2,000-3,500 on the island', async () => {
    const counts: number[] = [];
    for (const seed of [42, 7, 123]) {
      const a = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      const b = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        const coins = allCoins(a);
        expect(allCoins(b)).toEqual(coins);
        counts.push(coins.length);
        expect(coins.length).toBeGreaterThanOrEqual(2000);
        expect(coins.length).toBeLessThanOrEqual(3500);
        const ids = new Set(coins.map((c) => c.id));
        expect(ids.size).toBe(coins.length);
        const hit = { x: 0, z: 0, yaw: 0 };
        for (const c of coins) {
          expect(c.id % COINS_PER_CHUNK_MAX).toBeLessThan(COINS_PER_CHUNK_MAX);
          if (c.lane < 0) continue;
          const lane = a.city!.graph.lanes[c.lane]!;
          expect(Math.sqrt(projectOnLane(lane, c.x, c.z, hit))).toBeLessThan(1);
          expect(laneLength(lane) - alongLane(lane, c.x, c.z)).toBeGreaterThanOrEqual(30 - 1e-6);
        }
      } finally { a.dispose(); b.dispose(); }
    }
    console.log(`[coins] whole island: ${counts.join(' / ')} coins for seeds 42 / 7 / 123`);
  }, 120_000);

  it('3.9 a coin run driven at 60 km/h is picked once, coin by coin, and a second pass picks nothing', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const { lane, x, z, yaw } = street(sim, 0);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      // this lane's coins in order, and its first run (consecutive coins one pitch apart)
      const mine = allCoins(sim).filter((c) => c.lane === lane)
        .map((c) => ({ c, s: (c.x - x) * fx + (c.z - z) * fz })).sort((p, q) => p.s - q.s);
      const runCoins = [mine[0]!];
      for (let k = 1; k < mine.length && mine[k]!.s - mine[k - 1]!.s < BALANCE.coin.pitch + 0.01; k++) runCoins.push(mine[k]!);
      expect(runCoins.length).toBeGreaterThanOrEqual(BALANCE.coin.runMin);
      const startS = runCoins[0]!.s - 15, endS = runCoins[runCoins.length - 1]!.s + 10;
      const drive = (): void => {
        const px = x + fx * startS, pz = z + fz * startS;
        sim.city?.sync(px, pz, true);
        sim.vehicle.teleport({ x: px, y: 0.6, z: pz }, yaw);
        run(sim, ((endS - startS) / (60 / 3.6)), (_t, _c, s) => s.vehicle.setVelocity(fx * 60 / 3.6, s.vehicle.telemetry.vy, fz * 60 / 3.6));
      };
      const before = sim.coins!.pickedCount;
      drive();
      expect(sim.coins!.pickedCount - before).toBe(runCoins.length);
      for (const { c } of runCoins) expect(sim.coins!.picked[c.id]).toBe(1);
      expect(sim.run.coins).toBe(runCoins.length * BALANCE.coin.value);
      expect(sim.run.bag).toBe(0);
      drive();
      expect(sim.coins!.pickedCount - before).toBe(runCoins.length);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.10 a wreck spills 30 % of the bag on the lane ahead, and the rolling respawn scrambles it all back', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const { x, z, yaw } = street(sim, 30);
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
      run(sim, 0.5);
      sim.run.bag = 10_000;
      (sim.life as unknown as { wreck(): void }).wreck();
      const coins = sim.coins!;
      const sp = BALANCE.spill;
      expect(sim.run.bag).toBe(7_000);
      expect(coins.spillLeft()).toBe(sp.coins);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      for (let k = 0; k < sp.coins; k++) {
        expect(coins.spillValue[k]).toBe(250);
        const ahead = ((coins.spillX[k] as number) - sim.probe.x) * fx + ((coins.spillZ[k] as number) - sim.probe.z) * fz;
        expect(Math.abs(ahead - (sp.startAhead + k * sp.pitch))).toBeLessThan(1.5);
      }
      // R: the rolling respawn on the nearest road, then straight on
      run(sim, 1 / 60, (_t, c) => { c.reset = true; });
      run(sim, sp.seconds - 1, (_t, c) => { c.throttle = 1; });
      expect(coins.spillLeft()).toBe(0);
      expect(sim.run.bag).toBe(10_000);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.11 an untouched spill is gone after ten seconds and the bag keeps what it lost', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const { x, z, yaw } = street(sim, 30);
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
      run(sim, 0.5);
      sim.run.bag = 10_000;
      (sim.life as unknown as { wreck(): void }).wreck();
      sim.spawnAt('marina');
      run(sim, BALANCE.spill.seconds + 0.2);
      expect(sim.coins!.spillLeft()).toBe(0);
      expect(sim.run.bag).toBe(7_000);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.12 coins survive busted: the fine takes half the bag and none of the coins', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 20 });
    sim.police!.dispatching = false;
    try {
      const site = sim.run.dropOffs[1]!;
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      const along = -GARAGE.depth / 2 - 16;
      const px = site.x + fx * along, pz = site.z + fz * along;
      sim.city?.sync(px, pz, true);
      sim.vehicle.teleport({ x: px, y: 0.8, z: pz }, site.yaw);
      for (const across of [3.5, -3.5]) (sim.traffic as Traffic).spawnParkedPolice(px - fz * across, pz + fx * across, site.yaw, 'police');
      sim.run.bag = 4_000;
      sim.run.coins = 730;
      run(sim, 3.5);
      expect(sim.run.state).toBe('busted');
      expect(sim.run.coins).toBe(730);
      expect(sim.run.bank).toBe(2_000);
    } finally { sim.dispose(); }
  }, 60_000);
});
