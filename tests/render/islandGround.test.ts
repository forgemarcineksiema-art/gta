/** M8.10 slice 3: the island's ground drawn a chunk at a time (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../src/sim';
import { CHUNKS_X, CHUNKS_Z, Island } from '../../src/sim/island/Island';
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
});
