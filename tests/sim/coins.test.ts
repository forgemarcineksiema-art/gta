/**
 * Coins and the spill (docs/M4_PLAN.md slice 3b, the coin layer redesigned
 * 2026-09-23, DESIGN.md §3.5): the layout from the seed as lines (no coin in a
 * static, none doubled, a gate line through every billboard, an arc over
 * every ramp, a cap on every line), a run picked once at 60 km/h, the reach
 * and the height rule, the wreck's spill laid on the lane ahead and scrambled
 * back by the rolling respawn, an untouched spill expiring, and coins
 * surviving busted.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { EXTRA_COIN_BASE } from '../../src/sim/city/coins';
import { GARAGE } from '../../src/sim/city/cover';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

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

/** Drive the chassis along a straight at 60 km/h between two distances from `origin`. */
function driveStraight(sim: SimWorld, origin: { x: number; z: number; yaw: number }, lateral: number, fromS: number, toS: number): void {
  const fx = Math.sin(origin.yaw), fz = Math.cos(origin.yaw), rx = -fz, rz = fx;
  const px = origin.x + fx * fromS + rx * lateral, pz = origin.z + fz * fromS + rz * lateral;
  sim.city?.sync(px, pz, true);
  sim.vehicle.teleport({ x: px, y: 0.6, z: pz }, origin.yaw);
  run(sim, (toS - fromS) / (60 / 3.6), (_t, _c, s) => s.vehicle.setVelocity(fx * 60 / 3.6, s.vehicle.telemetry.vy, fz * 60 / 3.6));
}

describe('coins', () => {

  it('3.9 a run driven at 60 km/h is picked once, coin by coin, its cap worth five, and a second pass picks nothing', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const { x, z, yaw } = street(sim, 0);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      // no road carries a line of its own (M5.5): a route's run of six and its cap, laid on this street's centre
      const c = BALANCE.coin;
      const points = [];
      for (let k = 0; k < c.route.straight; k++) points.push({ x: x + fx * (60 + k * c.pitch), z: z + fz * (60 + k * c.pitch) });
      points.push({ x: x + fx * (60 + c.route.straight * c.pitch), z: z + fz * (60 + c.route.straight * c.pitch), value: c.cap });
      expect(sim.coins!.addExtra(points, 'route')).toBe(points.length);
      const runCoins = sim.coins!.extra.filter((e) => e.lane === -5);
      expect(runCoins.length).toBe(points.length);
      expect(runCoins[runCoins.length - 1]!.value).toBe(c.cap);
      expect(c.cap).toBe(5 * c.value);
      const worth = runCoins.reduce((sum, e) => sum + e.value, 0);
      const startS = 45, endS = 60 + c.route.straight * c.pitch + 10;
      const before = sim.coins!.pickedCount;
      driveStraight(sim, { x, z, yaw }, 0, startS, endS);
      expect(sim.coins!.pickedCount - before).toBe(runCoins.length);
      for (const e of runCoins) expect(sim.coins!.picked[e.id]).toBe(1);
      expect(sim.coins!.routePicked).toBe(runCoins.length);
      // in the bank the moment they are picked (M8.5 D1), counted one by one for the wall and the dailies
      expect(sim.run.bank).toBe(worth);
      expect(sim.run.counts.coins).toBe(runCoins.length);
      expect(sim.run.bag).toBe(0);
      driveStraight(sim, { x, z, yaw }, 0, startS, endS);
      expect(sim.coins!.pickedCount - before).toBe(runCoins.length);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.13 the reach: a coin a metre beside the car is caught, one three metres off is not, one in the air is not caught from the road', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const { x, z, yaw } = street(sim, 0);
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
      const coins = sim.coins!;
      const at = (s: number, lateral: number): { x: number; z: number } => ({ x: x + fx * s + rx * lateral, z: z + fz * s + rz * lateral });
      // three run-time coins on an empty stretch: one beside the path, one well off it, one overhead
      coins.addExtra([at(60, 1.0), at(80, 3.0), at(100, 0)]);
      const overhead = coins.extra[2]!;
      overhead.y = 3.0;
      // the placed coins are taken as picked: only the three count
      coins.picked.fill(1, 0, EXTRA_COIN_BASE);
      const before = coins.pickedCount;
      driveStraight(sim, { x, z, yaw }, 0, 40, 115);
      expect(coins.picked[coins.extra[0]!.id]).toBe(1);
      expect(coins.picked[coins.extra[1]!.id]).toBe(0);
      expect(coins.picked[overhead.id]).toBe(0);
      expect(coins.pickedCount - before).toBe(1);
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

  it('3.12 coins survive busted: the fine takes half the bag and none of the bank the coins are in', async () => {
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
      sim.run.bank = 730;
      run(sim, 3.5);
      expect(sim.run.state).toBe('busted');
      expect(sim.run.bank).toBe(730 + 2_000);
    } finally { sim.dispose(); }
  }, 60_000);
});
