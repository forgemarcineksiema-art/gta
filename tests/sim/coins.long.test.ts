/**
 * The coin layout as breadcrumbs (M5.5 slice 1, docs/DESIGN.md §13.5): the
 * static coins lie only at goals (a gate line through every billboard, an
 * arc over every ramp), deterministic per seed, clear of every solid, never
 * doubled, no carriageway carries a line of its own; and the novice bot that
 * only drives picks almost nothing between jobs. Long: three seeds, every
 * chunk generated, five minutes of the bot.
 */
import { describe, expect, it } from 'vitest';
import { BotPolicy } from '../../src/app/botPolicy';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { BALANCE } from '../../src/sim/balance';
import { COINS_PER_CHUNK_MAX, COIN_HEIGHT, type CoinDesc } from '../../src/sim/city/coins';
import type { CityChunk } from '../../src/sim/city/City';
import { projectOnLane } from '../../src/sim/city/roads';
import type { StaticDesc } from '../../src/sim/scene';
import type { SimWorld } from '../../src/sim';
import { createWorld, run } from './helpers';

function allChunks(sim: SimWorld): CityChunk[] {
  const out: CityChunk[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(sim.city!.generate(cx, cz));
  return out;
}

function allCoins(sim: SimWorld): CoinDesc[] {
  return allChunks(sim).flatMap((chunk) => chunk.coins);
}

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

describe('coins (long)', () => {
  it('3.8 the static layout: deterministic per seed, only at goals (a gate line on every billboard, an arc over every ramp), clear of every solid, never doubled, 250-450 on the island', async () => {
    const counts: number[] = [];
    for (const seed of [42, 7, 123]) {
      const a = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      const b = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        const chunks = allChunks(a);
        const coins = chunks.flatMap((chunk) => chunk.coins);
        expect(allCoins(b)).toEqual(coins);
        counts.push(coins.length);
        expect(coins.length).toBeGreaterThanOrEqual(250);
        expect(coins.length).toBeLessThanOrEqual(450);
        expect(new Set(coins.map((c) => c.id)).size).toBe(coins.length);
        const city = a.city!;
        const hit = { x: 0, z: 0, yaw: 0 };
        let onLane = 0, billboards = 0;
        for (const chunk of chunks) {
          expect(chunk.coins.length).toBeLessThan(COINS_PER_CHUNK_MAX);
          billboards += chunk.billboards.length;
          for (const c of chunk.coins) {
            expect(c.id % COINS_PER_CHUNK_MAX).toBeLessThan(COINS_PER_CHUNK_MAX);
            expect(c.y).toBeGreaterThanOrEqual(COIN_HEIGHT);
            expect(c.value === BALANCE.coin.value || c.value === BALANCE.coin.cap).toBe(true);
            // at a goal: within 30 m of a billboard, or of a ramp within the flight of a car launched off it (the cap lands past 30 m)
            const nearGoal = chunk.billboards.some((bb) => Math.hypot(bb.x - c.x, bb.z - c.z) < 30) || city.jumps.some((jd) => Math.hypot(jd.x - c.x, jd.z - c.z) < 45);
            if (!nearGoal) throw new Error(`seed ${seed}: coin ${c.id} at ${c.x.toFixed(1)}, ${c.z.toFixed(1)} lies at no goal`);
            // never inside a kerb, a post, a tree or a wall: the line is drivable
            for (const st of chunk.statics) {
              if (st.tag === 'road' || st.tag === 'ground' || st.tag === 'skyline' || st.tag?.startsWith('paint')) continue;
              if (hitsStatic(c, st, 0.3)) throw new Error(`seed ${seed}: coin ${c.id} at ${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)} sits in a ${st.shape.kind} tagged ${st.tag} at ${st.position.x.toFixed(1)}, ${st.position.z.toFixed(1)}`);
            }
            // the carriageways carry no line: a coin on a lane centre is a gate line's first coin, one per billboard at most
            const lane = city.graph.lanes[city.nearestLane(c.x, c.z)]!;
            if (Math.sqrt(projectOnLane(lane, c.x, c.z, hit)) < 1.5 && c.y < 2) onLane++;
          }
        }
        expect(onLane).toBeLessThanOrEqual(billboards);
        // never doubled: no two coins of the island closer than a chassis width
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
        // the gate line: `gateCoins` before the cap, the cap on the panel's centre
        for (const chunk of chunks) for (const board of chunk.billboards) {
          const cap = chunk.coins.find((c) => c.value === BALANCE.coin.cap && Math.hypot(c.x - board.x, c.z - board.z) < 0.6);
          expect(cap, `seed ${seed}: billboard ${board.id} has no gate line`).toBeDefined();
          const line = chunk.coins.filter((c) => c.value === BALANCE.coin.value && Math.hypot(c.x - board.x, c.z - board.z) < BALANCE.coin.gateCoins * BALANCE.coin.pitch + 12);
          expect(line.length, `seed ${seed}: billboard ${board.id}'s line`).toBeGreaterThanOrEqual(BALANCE.coin.gateCoins);
        }
        // the arc: `arcCoins` in the air past every ridge, the cap on the ground beyond them
        for (const jd of city.jumps) {
          const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
          const along = (c: CoinDesc): number => (c.x - jd.x) * fx + (c.z - jd.z) * fz;
          const near = coins.filter((c) => Math.abs((c.x - jd.x) * -fz + (c.z - jd.z) * fx) < 1 && along(c) > -12 && along(c) < 45);
          const air = near.filter((c) => c.y > 2.5 && along(c) > 0);
          expect(air.length, `seed ${seed}: ramp ${jd.id} has ${air.length} coins in the air`).toBe(BALANCE.coin.arcCoins);
          const cap = near.find((c) => c.value === BALANCE.coin.cap);
          expect(cap, `seed ${seed}: ramp ${jd.id} has no cap`).toBeDefined();
          expect(along(cap!)).toBeGreaterThan(Math.max(...air.map(along)));
        }
      } finally { a.dispose(); b.dispose(); }
    }
    console.log(`[coins] the static layout: ${counts.join(' / ')} coins for seeds 42 / 7 / 123`);
  }, 180_000);

  it('1.5 the novice bot that only drives picks under 12 coins a minute between jobs, every one at a goal', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    // the roads, not the police: the beat stays out
    sim.police!.dispatching = false;
    try {
      const bot = new BotPolicy('novice', new TrackBot(sim.carId, CITY_BOT_TUNING));
      const seq = sim.events.sequence;
      run(sim, 300, (_t, c, s) => {
        if (s.run.state === 'busted') s.run.closeCard();
        else if (s.run.state === 'door') s.run.openDoor();
        bot.drive(s, c, 1 / 60);
      });
      let picked = 0, road = 0;
      sim.events.readFrom(seq, (e) => {
        if (e.kind !== 'coin' || e.target < 0) return;
        picked++;
        if (e.target < 49 * COINS_PER_CHUNK_MAX) {
          // a chunk coin: a gate line's or an arc's
          road++;
        }
      });
      const perMinute = picked / 5;
      console.log(`[coins] the novice bot, 5 min between jobs: ${picked} coins (${perMinute.toFixed(1)} a minute), ${road} of them at billboards and ramps, ${sim.coins!.pickedCount - picked} more picked than counted`);
      expect(perMinute).toBeLessThan(12);
      expect(sim.jobs.state).toBe('idle');
    } finally { sim.dispose(); }
  }, 300_000);
});
