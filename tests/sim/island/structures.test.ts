/** M8.10 slice 6a: the highway all the way round: its decks, its overpasses, its tunnel (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { clearControls, initPhysics } from '../../../src/sim';
import { Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { DECK } from '../../../src/sim/island/structures';
import { createWorld } from '../helpers';

/** The first thing a ray meets going down from (x, top, z): its height, or null. */
const down = (world: RAPIER.World, x: number, top: number, z: number): number | null => {
  const hit = world.castRay(new RAPIER.Ray({ x, y: top, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 200, true);
  return hit ? top - hit.timeOfImpact : null;
};

describe('M8.10 slice 6a: the highway all the way round', () => {
  beforeAll(async () => { await initPhysics(); });

  it('6a.1 the decks carry the highway: the viaduct, the bay bridge and the overpasses, each piece at its lanes\' height', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    world.step();
    const decks = island.structures.filter((s) => s.kind !== 'tunnel');
    expect(decks.map((s) => s.kind).sort()).toEqual(['bridge', 'overpass', 'overpass', 'overpass', 'overpass', 'overpass', 'viaduct']);
    for (const s of decks) s.pieces.forEach((p, k) => {
      island.sync(p.x, p.z, true);
      world.step();
      const y = down(world, p.x, p.y + 20, p.z);
      expect(y, `${s.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).not.toBeNull();
      // its two first and last pieces rise off the ground at its abutments
      const end = k <= 1 || k >= s.pieces.length - 2;
      expect(Math.abs((y ?? 0) - p.y), `${s.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(end ? 0.15 : 0.05);
    });
  });

  it('6a.2 a road passing under an overpass runs at least 5 m below its deck', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    for (const s of island.structures.filter((q) => q.kind === 'overpass')) {
      const mid = s.pieces[Math.floor(s.pieces.length / 2)];
      if (!mid) throw new Error('an empty overpass');
      expect(mid.y - island.heightAt(mid.x, mid.z), `overpass at ${mid.x.toFixed(0)}, ${mid.z.toFixed(0)}`).toBeGreaterThan(5);
    }
  });

  it('6a.3 in the tunnel the floor carries the car and the hill\'s ground lies below it; the hill is whole above', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    const tunnel = island.structures.find((s) => s.kind === 'tunnel');
    expect(tunnel).toBeDefined();
    for (const p of tunnel?.pieces ?? []) {
      island.sync(p.x, p.z, true);
      world.step();
      expect(island.heightAt(p.x, p.z), 'the ground under the floor').toBeLessThan(p.y - 1);
      const y = down(world, p.x, p.y + 2, p.z);
      expect(Math.abs((y ?? 0) - p.y), `floor at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(0.05);
      // above the roof, the lid: a ray from over the hill meets the hill's surface, not the tunnel
      expect(down(world, p.x, p.y + 80, p.z) ?? 0, 'the lid').toBeGreaterThan(p.y + DECK.clear);
    }
  });

  it('6a.4 a car on the highway crosses the viaduct and the bay bridge on its wheels', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    for (const kind of ['viaduct', 'bridge'] as const) {
      const s = island.structures.find((q) => q.kind === kind);
      const first = s?.pieces[0], last = s?.pieces[(s?.pieces.length ?? 1) - 1];
      if (!first || !last) throw new Error(kind);
      // from 60 m before the deck, heading along it
      const x0 = first.x - Math.sin(first.yaw) * 60, z0 = first.z - Math.cos(first.yaw) * 60;
      island.sync(x0, z0, true);
      sim.vehicle.teleport({ x: x0, y: island.heightAt(x0, z0) + 0.8, z: z0 }, first.yaw);
      for (let i = 0; i < 30; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      let lowest = Infinity, grounded = 0, steps = 0;
      for (let i = 0; i < 60 * 25; i++) {
        const p = sim.vehicle.body.translation();
        // steer for the deck's far end
        const q = sim.vehicle.body.rotation();
        const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
        let err = Math.atan2(last.x - p.x, last.z - p.z) - yaw;
        err = Math.atan2(Math.sin(err), Math.cos(err));
        clearControls(sim.controls);
        sim.controls.steer = Math.max(-1, Math.min(1, -err * 2.5));
        sim.controls.throttle = sim.vehicle.telemetry.speedKmh < 80 ? 1 : 0;
        sim.step();
        if (Math.hypot(p.x - first.x, p.z - first.z) < 20 || s.pieces.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 3)) {
          lowest = Math.min(lowest, p.y);
          steps++;
          if (sim.vehicle.telemetry.groundedWheels >= 3) grounded++;
        }
        if (Math.hypot(p.x - last.x, p.z - last.z) < 15) break;
      }
      const end = sim.vehicle.body.translation();
      expect(Math.hypot(end.x - last.x, end.z - last.z), kind).toBeLessThan(15);
      expect(grounded / Math.max(1, steps), kind).toBeGreaterThan(0.9);
      expect(lowest, kind).toBeGreaterThan(Math.min(...s.pieces.map((r) => r.y)) - 1);
    }
  });
});
