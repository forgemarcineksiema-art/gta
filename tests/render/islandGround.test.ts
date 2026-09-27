/** M8.10 slice 3: the island's ground drawn a chunk at a time (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../src/sim';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0, Island } from '../../src/sim/island/Island';
import { SUMMIT } from '../../src/sim/island/plan';
import { GroundView } from '../../src/render/island/GroundView';

describe('M8.10 slice 3: the ground\'s look', () => {
  beforeAll(async () => { await initPhysics(); });

  it('3.1 every chunk\'s ground, its cut shores\' faces and its skirts, is under 2,400 triangles', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    const view = new GroundView(island);
    let most = 0, total = 0;
    for (let j = 0; j < CHUNKS_Z; j++) for (let i = 0; i < CHUNKS_X; i++) {
      const m = view.build(i, j);
      expect(m.positions.length).toBe(m.triangles * 9);
      expect(m.positions.every(Number.isFinite), `chunk ${i},${j}`).toBe(true);
      most = Math.max(most, m.triangles);
      total += m.triangles;
    }
    expect(most).toBeLessThan(2400);
    // the hill is drawn, not left flat: the summit's chunk bends
    const [si, sj] = Island.chunkOf(SUMMIT.x, SUMMIT.z);
    expect(view.build(si, sj).triangles).toBeGreaterThan(100);
    expect(total).toBeGreaterThan(10000);
  });

  it('3.2 the drawn ground never stands 30 cm over a road\'s drawn surface (the highway\'s bank lay 1.9 m deep on the quay\'s sweep, grass over road edges on 148 spots)', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    const view = new GroundView(island), CELL = 2;
    let worst = 0, at = '', sampled = 0;
    for (let j = 0; j < CHUNKS_Z; j++) for (let i = 0; i < CHUNKS_X; i++) {
      const k = Island.chunkIndex(i, j), surf = island.surfaceMesh(k);
      if (!surf) continue;
      // the chunk's ground's faces by 2 m cells (its hanging faces, cut shores' and skirts', are not its top)
      const P = view.build(i, j).positions, x0 = CHUNK_X0 + i * CHUNK - 4, z0 = CHUNK_Z0 + j * CHUNK - 4, n = Math.ceil((CHUNK + 8) / CELL);
      const cells: number[][] = Array.from({ length: n * n }, () => []);
      for (let t = 0; t * 9 < P.length; t++) {
        const o = t * 9, xs = [P[o] as number, P[o + 3] as number, P[o + 6] as number], zs = [P[o + 2] as number, P[o + 5] as number, P[o + 8] as number];
        if (Math.abs(((xs[1] as number) - (xs[0] as number)) * ((zs[2] as number) - (zs[0] as number)) - ((zs[1] as number) - (zs[0] as number)) * ((xs[2] as number) - (xs[0] as number))) < 1e-4) continue;
        const ci0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / CELL)), ci1 = Math.min(n - 1, Math.floor((Math.max(...xs) - x0) / CELL));
        const cj0 = Math.max(0, Math.floor((Math.min(...zs) - z0) / CELL)), cj1 = Math.min(n - 1, Math.floor((Math.max(...zs) - z0) / CELL));
        for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) (cells[cj * n + ci] as number[]).push(t);
      }
      const groundAt = (x: number, z: number): number => {
        const ci = Math.floor((x - x0) / CELL), cj = Math.floor((z - z0) / CELL);
        if (ci < 0 || cj < 0 || ci >= n || cj >= n) return -Infinity;
        let top = -Infinity;
        for (const t of cells[cj * n + ci] as number[]) {
          const o = t * 9, ax = P[o] as number, az = P[o + 2] as number, bx = P[o + 3] as number, bz = P[o + 5] as number, cx = P[o + 6] as number, cz = P[o + 8] as number;
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz), u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
          if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
          top = Math.max(top, u * (P[o + 1] as number) + v * (P[o + 4] as number) + w * (P[o + 7] as number));
        }
        return top;
      };
      // each road face's corners, middle and edges' middles (not a steep one: a skirt's, a kerb's side)
      const S = surf.positions;
      for (let t = 0; t < surf.far; t++) {
        const o = t * 9, a = [S[o], S[o + 1], S[o + 2]] as number[], b = [S[o + 3], S[o + 4], S[o + 5]] as number[], c = [S[o + 6], S[o + 7], S[o + 8]] as number[];
        const ux = (b[0] as number) - (a[0] as number), uy = (b[1] as number) - (a[1] as number), uz = (b[2] as number) - (a[2] as number), vx = (c[0] as number) - (a[0] as number), vy = (c[1] as number) - (a[1] as number), vz = (c[2] as number) - (a[2] as number);
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (Math.abs(ny) < 0.6 * Math.hypot(nx, ny, nz)) continue;
        for (const [wa, wb, wc] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]] as const) {
          const x = wa * (a[0] as number) + wb * (b[0] as number) + wc * (c[0] as number), y = wa * (a[1] as number) + wb * (b[1] as number) + wc * (c[1] as number), z = wa * (a[2] as number) + wb * (b[2] as number) + wc * (c[2] as number);
          sampled++;
          const over = groundAt(x, z) - y;
          if (over > worst) { worst = over; at = `${x.toFixed(0)}, ${z.toFixed(0)}`; }
        }
      }
    }
    expect(sampled).toBeGreaterThan(300_000);
    expect(worst, at).toBeLessThan(0.3);
  });
});
