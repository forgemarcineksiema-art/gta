/**
 * The coin layout checked island-wide (docs/M4_PLAN.md 3.8, redrawn 2026-09-23): three seeds, every chunk.
 * Long: run by `npm run verify:gate` and `npm run test:long` (CLAUDE.md), moved
 * unchanged from `coins.test.ts` in M5.1.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { COINS_PER_CHUNK_MAX, COIN_HEIGHT, type CoinDesc } from '../../src/sim/city/coins';
import type { CityChunk } from '../../src/sim/city/City';
import { projectOnLane } from '../../src/sim/city/roads';
import type { StaticDesc } from '../../src/sim/scene';
import type { SimWorld } from '../../src/sim';
import { createWorld } from './helpers';

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

describe('coins (long)', () => {
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
});
