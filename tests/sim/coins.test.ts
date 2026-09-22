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
import { COINS_PER_CHUNK_MAX, COIN_HEIGHT, EXTRA_COIN_BASE, type CoinDesc } from '../../src/sim/city/coins';
import { GARAGE } from '../../src/sim/city/cover';
import type { CityChunk } from '../../src/sim/city/City';
import { projectOnLane } from '../../src/sim/city/roads';
import type { StaticDesc } from '../../src/sim/scene';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

function allChunks(sim: SimWorld): CityChunk[] {
  const out: CityChunk[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(sim.city!.generate(cx, cz));
  return out;
}

function allCoins(sim: SimWorld): CoinDesc[] {
  return allChunks(sim).flatMap((chunk) => chunk.coins);
}

/** A coin (a metre across, half a metre either side of its centre) against a solid: oriented for boxes, radial for cylinders. */
function hitsStatic(c: CoinDesc, st: StaticDesc, margin: number): boolean {
  const s = st.shape, p = st.position;
  if (s.kind === 'cylinder') {
    if (p.y + s.halfHeight <= c.y - 0.5 || p.y - s.halfHeight >= c.y + 0.5) return false;
    return Math.hypot(c.x - p.x, c.z - p.z) < s.radius + margin;
  }
  if (s.kind === 'box' || s.kind === 'gable') {
    // into the box's frame: rotate by the conjugate quaternion
    const q = st.rotation;
    const dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z;
    const ix = -q.x, iy = -q.y, iz = -q.z, iw = q.w;
    const tx = 2 * (iy * dz - iz * dy), ty = 2 * (iz * dx - ix * dz), tz = 2 * (ix * dy - iy * dx);
    const lx = dx + iw * tx + (iy * tz - iz * ty), ly = dy + iw * ty + (iz * tx - ix * tz), lz = dz + iw * tz + (ix * ty - iy * tx);
    return Math.abs(lx) < s.hx + margin && Math.abs(ly) < s.hy + 0.5 && Math.abs(lz) < s.hz + margin;
  }
  if (s.kind === 'prism') {
    if (s.y1 <= c.y - 0.5 || s.y0 >= c.y + 0.5) return false;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const pt of s.points) { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z); }
    return c.x > minX - margin && c.x < maxX + margin && c.z > minZ - margin && c.z < maxZ + margin;
  }
  return false;
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

/** Drive the chassis along a straight at 60 km/h between two distances from `origin`. */
function driveStraight(sim: SimWorld, origin: { x: number; z: number; yaw: number }, lateral: number, fromS: number, toS: number): void {
  const fx = Math.sin(origin.yaw), fz = Math.cos(origin.yaw), rx = -fz, rz = fx;
  const px = origin.x + fx * fromS + rx * lateral, pz = origin.z + fz * fromS + rz * lateral;
  sim.city?.sync(px, pz, true);
  sim.vehicle.teleport({ x: px, y: 0.6, z: pz }, origin.yaw);
  run(sim, (toS - fromS) / (60 / 3.6), (_t, _c, s) => s.vehicle.setVelocity(fx * 60 / 3.6, s.vehicle.telemetry.vy, fz * 60 / 3.6));
}

describe('coins', () => {
  it('3.8 the layout is deterministic per seed, clear of every solid, never doubled, a gate line through every billboard, an arc over every ramp, 1,500-3,000 on the island', async () => {
    const counts: number[] = [];
    for (const seed of [42, 7, 123]) {
      const a = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      const b = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        const chunks = allChunks(a);
        const coins = chunks.flatMap((chunk) => chunk.coins);
        expect(allCoins(b)).toEqual(coins);
        counts.push(coins.length);
        expect(coins.length).toBeGreaterThanOrEqual(1500);
        expect(coins.length).toBeLessThanOrEqual(3000);
        expect(new Set(coins.map((c) => c.id)).size).toBe(coins.length);
        const hit = { x: 0, z: 0, yaw: 0 };
        let caps = 0;
        for (const chunk of chunks) {
          expect(chunk.coins.length).toBeLessThan(COINS_PER_CHUNK_MAX);
          for (const c of chunk.coins) {
            expect(c.id % COINS_PER_CHUNK_MAX).toBeLessThan(COINS_PER_CHUNK_MAX);
            expect(c.y).toBeGreaterThanOrEqual(COIN_HEIGHT);
            expect(c.value === BALANCE.coin.value || c.value === BALANCE.coin.cap).toBe(true);
            if (c.value === BALANCE.coin.cap) caps++;
            // a lane's coin lies on its road: at most a lane's width across from the lane centre
            if (c.lane >= 0) expect(Math.sqrt(projectOnLane(a.city!.graph.lanes[c.lane]!, c.x, c.z, hit))).toBeLessThan(10);
            // never inside a kerb, a post, a tree or a wall: the line is drivable
            for (const st of chunk.statics) {
              if (st.tag === 'road' || st.tag === 'ground' || st.tag === 'skyline' || st.tag?.startsWith('paint')) continue;
              if (hitsStatic(c, st, 0.3)) throw new Error(`seed ${seed}: coin ${c.id} (lane ${c.lane}) at ${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)} sits in a ${st.shape.kind} tagged ${st.tag} at ${st.position.x.toFixed(1)}, ${st.position.z.toFixed(1)}`);
            }
          }
        }
        // one line per road: no two coins of the island closer than a chassis width
        const cell = new Map<string, CoinDesc[]>();
        for (const c of coins) {
          const key = `${Math.floor(c.x / 4)},${Math.floor(c.z / 4)}`;
          const list = cell.get(key) ?? [];
          list.push(c);
          cell.set(key, list);
        }
        for (const c of coins) {
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            for (const o of cell.get(`${Math.floor(c.x / 4) + i},${Math.floor(c.z / 4) + j}`) ?? []) {
              if (o.id <= c.id) continue;
              if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 + (o.y - c.y) ** 2 < 2 * 2) throw new Error(`seed ${seed}: coins ${c.id} and ${o.id} double up at ${c.x.toFixed(1)}, ${c.z.toFixed(1)}`);
            }
          }
        }
        // every line ends on a cap: at least one cap per twelve coins
        expect(caps).toBeGreaterThanOrEqual(coins.length / 14);
        // the gate line: the cap sits on the panel's centre
        for (const chunk of chunks) for (const board of chunk.billboards) {
          const cap = chunk.coins.find((c) => c.value === BALANCE.coin.cap && Math.hypot(c.x - board.x, c.z - board.z) < 0.6);
          expect(cap, `seed ${seed}: billboard ${board.id} has no gate line`).toBeDefined();
        }
        // the arc: coins in the air past every ridge, the cap on the ground beyond them
        for (const jd of a.city!.jumps) {
          const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
          const along = (c: CoinDesc): number => (c.x - jd.x) * fx + (c.z - jd.z) * fz;
          const near = coins.filter((c) => Math.abs((c.x - jd.x) * -fz + (c.z - jd.z) * fx) < 1 && along(c) > -12 && along(c) < 45);
          const air = near.filter((c) => c.y > 2.5 && along(c) > 0);
          expect(air.length, `seed ${seed}: ramp ${jd.id} has ${air.length} coins in the air`).toBeGreaterThanOrEqual(3);
          const cap = near.find((c) => c.value === BALANCE.coin.cap);
          expect(cap, `seed ${seed}: ramp ${jd.id} has no cap`).toBeDefined();
          expect(along(cap!)).toBeGreaterThan(Math.max(...air.map(along)));
        }
      } finally { a.dispose(); b.dispose(); }
    }
    console.log(`[coins] whole island: ${counts.join(' / ')} coins for seeds 42 / 7 / 123`);
  }, 180_000);

  it('3.9 a run driven at 60 km/h is picked once, coin by coin, its cap worth five, and a second pass picks nothing', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const { lane, x, z, yaw } = street(sim, 0);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const hit = { x: 0, z: 0, yaw: 0 };
      const laneDesc = sim.city!.graph.lanes[lane]!;
      // this lane's coins on its centre in order, and its first run (consecutive coins one pitch apart)
      const mine = allCoins(sim).filter((c) => c.lane === lane && Math.sqrt(projectOnLane(laneDesc, c.x, c.z, hit)) < 0.5)
        .map((c) => ({ c, s: (c.x - x) * fx + (c.z - z) * fz })).sort((p, q) => p.s - q.s);
      expect(mine.length).toBeGreaterThan(0);
      const runCoins = [mine[0]!];
      for (let k = 1; k < mine.length && mine[k]!.s - mine[k - 1]!.s < BALANCE.coin.pitch + 0.01; k++) runCoins.push(mine[k]!);
      expect(runCoins.length).toBeGreaterThanOrEqual(BALANCE.coin.runMin);
      const worth = runCoins.reduce((sum, { c }) => sum + c.value, 0);
      expect(runCoins[runCoins.length - 1]!.c.value).toBe(BALANCE.coin.cap);
      const startS = runCoins[0]!.s - 15, endS = runCoins[runCoins.length - 1]!.s + 10;
      const before = sim.coins!.pickedCount;
      driveStraight(sim, { x, z, yaw }, 0, startS, endS);
      expect(sim.coins!.pickedCount - before).toBe(runCoins.length);
      for (const { c } of runCoins) expect(sim.coins!.picked[c.id]).toBe(1);
      expect(sim.run.coins).toBe(worth);
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
