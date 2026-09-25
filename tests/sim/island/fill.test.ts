/** M8.10 slice 7a: the lots, the buildings and the palms (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../../src/sim';
import { GRASS } from '../../../src/sim/city/surface';
import { Island } from '../../../src/sim/island/Island';
import { footprint, reserved, type Lot } from '../../../src/sim/island/fill';
import { districtOf } from '../../../src/sim/island/plan';
import { PAVEMENT } from '../../../src/sim/island/surfaces';

describe('M8.10 slice 7a: the lots and the buildings', () => {
  let island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { await initPhysics(); island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 })); }, 60_000);

  it('7.1 no building over a road, a pavement or another lot', () => {
    const { lots } = island.fill, g = island.ground;
    for (const l of lots) for (const [x, z] of footprint(l)) {
      expect(g.nearOtherRoad(x, z, -1, PAVEMENT), `a lot at ${l.x.toFixed(0)}, ${l.z.toFixed(0)}`).toBe(false);
    }
    // no two footprints share a point: each one's points outside every other near it
    const inside = (l: Lot, x: number, z: number): boolean => {
      const dx = x - l.x, dz = z - l.z, u = dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw), v = dx * Math.sin(l.yaw) + dz * Math.cos(l.yaw);
      return Math.abs(u) < l.hx - 0.01 && Math.abs(v) < l.hz - 0.01;
    };
    for (const a of lots) for (const b of lots) {
      if (a === b || Math.hypot(a.x - b.x, a.z - b.z) > 80) continue;
      for (const [x, z] of footprint(b)) expect(inside(a, x, z), `lots at ${a.x.toFixed(0)}, ${a.z.toFixed(0)} and ${b.x.toFixed(0)}, ${b.z.toFixed(0)}`).toBe(false);
    }
  });

  it('7.2 every building on land, on grass, off the plan\'s reserved places, its plinth down to its lowest ground', () => {
    const g = island.ground;
    for (const l of island.fill.lots) {
      for (const [x, z] of footprint(l)) {
        expect(g.onLand(x, z) && g.surface(x, z) === GRASS && !reserved(x, z), `a lot at ${l.x.toFixed(0)}, ${l.z.toFixed(0)}`).toBe(true);
        expect(g.surfaceHeight(x, z)).toBeGreaterThanOrEqual(l.foot - 1e-6);
        expect(g.surfaceHeight(x, z)).toBeLessThanOrEqual(l.base + 1e-6);
      }
    }
  });

  it('7.3 each district\'s buildings: Crown\'s offices, the Works\' sheds, the Gardens\' houses, the Quay\'s blocks', () => {
    const count: Record<string, number> = {};
    for (const l of island.fill.lots) count[l.district] = (count[l.district] ?? 0) + 1;
    console.log('7.3', JSON.stringify(count));
    // (Crown's 104 before its places; the car park, the HQ, the hideout, the landing block, the arcade and the Works'
    // west shed stand on seven of those lots now: 97)
    expect(count.crown ?? 0).toBeGreaterThan(90);
    expect(count.foundry ?? 0).toBeGreaterThan(20);
    expect(count.gardens ?? 0).toBeGreaterThan(80);
    expect(count.marina ?? 0).toBeGreaterThan(40);
    // Crown's tallest nearer the summit
    const crown = island.fill.lots.filter((l) => l.district === 'crown');
    const near = crown.filter((l) => Math.hypot(l.x - 470, l.z - 400) < 200), far = crown.filter((l) => Math.hypot(l.x - 470, l.z - 400) > 350);
    const mean = (ls: Lot[]): number => ls.reduce((s, l) => s + l.floors, 0) / Math.max(1, ls.length);
    expect(mean(near)).toBeGreaterThan(mean(far) + 1);
  });

  it('7.4 R2: 150 palms or more in Palm Gardens, none in Crown Heights', () => {
    const by: Record<string, number> = {};
    for (const p of island.fill.palms) by[districtOf(p.x, p.z)] = (by[districtOf(p.x, p.z)] ?? 0) + 1;
    console.log('7.4', JSON.stringify(by));
    expect(by.gardens ?? 0).toBeGreaterThanOrEqual(150);
    expect(by.crown ?? 0).toBe(0);
  });
});
