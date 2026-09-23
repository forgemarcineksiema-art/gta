/**
 * Covered streets (M5.5 slice 7, docs/M4_PLAN.md §5 A): one per district on a
 * grid street's middle, clear of the doors, ramps, cameras and plazas, with no
 * street tree or lamp under it; solid, so the police cannot see in through its
 * walls or down through its roof, only along the street through its open ends.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { chunkCoord, districtAt, LANDMARKS } from '../../src/sim/city/City';
import { COVER, coverStatics, type CoverDesc } from '../../src/sim/city/covers';
import { DROP_OFF_LOTS, dropOffFor } from '../../src/sim/city/cover';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** World point of a cover-frame point (u along the street, v across it). */
function at(c: CoverDesc, u: number, v: number): { x: number; z: number } {
  return c.axis === 'x' ? { x: c.x + u, z: c.z + v } : { x: c.x + v, z: c.z + u };
}

/** The player stopped at a point, the chunks round it loaded, the probe read. */
function stand(sim: SimWorld, x: number, z: number, yaw: number): void {
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.3, (_t, c) => { c.brake = 1; });
}

describe('covered streets', () => {
  it('7.1 one per district, mid-block on a grid street, clear of doors, ramps, cameras and plazas, no tree or lamp under it', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const city = sim.city!;
      expect(city.covers.map((c) => c.district).sort()).toEqual(['crown', 'foundry', 'gardens', 'marina']);
      expect(new Set(city.covers.map((c) => c.style)).size).toBe(4);
      const doors = DROP_OFF_LOTS.map((l) => dropOffFor(l).door);
      for (const c of city.covers) {
        expect(districtAt(c.x, c.z).id).toBe(c.district);
        // the middle of a block edge: 112.5 m from the junctions either side
        const along = c.axis === 'x' ? c.x : c.z, across = c.axis === 'x' ? c.z : c.x;
        expect(Math.abs(((along % 225) + 225) % 225 - 112.5)).toBeLessThan(0.01);
        expect(Math.abs(across % 225)).toBeLessThan(0.01);
        const near = (px: number, pz: number): number => {
          const u = Math.max(-COVER.length / 2, Math.min(COVER.length / 2, c.axis === 'x' ? px - c.x : pz - c.z));
          const p = at(c, u, 0);
          return Math.hypot(px - p.x, pz - p.z);
        };
        for (const d of doors) expect(near(d.x, d.z)).toBeGreaterThanOrEqual(COVER.clear);
        for (const j of city.jumps) expect(near(j.x, j.z)).toBeGreaterThanOrEqual(COVER.clear);
        for (const k of city.cameras) expect(near(k.poleX, k.poleZ)).toBeGreaterThanOrEqual(COVER.clear);
        for (const l of LANDMARKS) expect(near(l.x, l.z)).toBeGreaterThanOrEqual(COVER.clear);
        // its boxes are in the chunks, and nothing tall of the street's own stands under it
        const boxes = coverStatics(c);
        const keyOf = (st: { position: { x: number; y: number; z: number } }): string => `${st.position.x.toFixed(3)},${st.position.y.toFixed(3)},${st.position.z.toFixed(3)}`;
        const ids = new Set(boxes.map(keyOf));
        for (const st of boxes) expect(city.chunk(chunkCoord(st.position.x), chunkCoord(st.position.z)).statics).toContainEqual(st);
        for (const key of new Set(boxes.map((b) => `${chunkCoord(b.position.x)},${chunkCoord(b.position.z)}`))) {
          const [cx, cz] = key.split(',').map(Number) as [number, number];
          for (const st of city.chunk(cx, cz).statics) {
            if (ids.has(keyOf(st)) || st.position.y < 3) continue;
            const u = c.axis === 'x' ? st.position.x - c.x : st.position.z - c.z, v = c.axis === 'x' ? st.position.z - c.z : st.position.x - c.x;
            const under = Math.abs(u) < COVER.length / 2 && Math.abs(v) < COVER.half;
            expect(under, `a ${st.tag} at ${st.position.x.toFixed(1)},${st.position.z.toFixed(1)} under the ${c.style}`).toBe(false);
          }
        }
      }
    } finally { sim.dispose(); }
  }, 60_000);

  it('7.2 the police cannot see in through the walls or down through the roof, only along the street through the open ends', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const police = sim.police!;
      for (const c of sim.city!.covers) {
        const L = COVER.length / 2, W = COVER.half;
        const yaw = c.axis === 'x' ? Math.PI / 2 : 0;
        // beside the wall: the player inside by it, a patrol just outside it
        const inside = at(c, 0, W - 3);
        stand(sim, inside.x, inside.z, yaw);
        const outside = at(c, 8, W + 1);
        const side = traffic.spawnParkedPolice(outside.x, outside.z, yaw, 'police');
        expect(police.canSee(side, sim.probe, Math.hypot(outside.x - sim.probe.x, outside.z - sim.probe.z)), `${c.style}: through the wall`).toBe(false);
        traffic.clearAround(outside.x, outside.z, 1);
        // the roof: nothing sees down through it
        expect(sim.clearFraction(inside.x, 40, inside.z, inside.x, 0.8, inside.z), `${c.style}: through the roof`).toBeLessThan(1);
        // along the street: a patrol past the open end sees the player inside
        const end = at(c, L - 8, -4);
        stand(sim, end.x, end.z, yaw);
        const street = at(c, L + 30, -4);
        const axis = traffic.spawnParkedPolice(street.x, street.z, yaw + Math.PI, 'police');
        expect(police.canSee(axis, sim.probe, Math.hypot(street.x - sim.probe.x, street.z - sim.probe.z)), `${c.style}: through the open end`).toBe(true);
        traffic.clearAround(street.x, street.z, 1);
      }
    } finally { sim.dispose(); }
  }, 60_000);
});
