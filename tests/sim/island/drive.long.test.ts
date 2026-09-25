/**
 * The island's long drives (M8.10 slices 2 and 6a, docs/M8.10_PLAN.md): a car along the highway across four chunk
 * borders, and across the viaduct and the bay bridge. Over ten seconds each: run with LONG=1 (the gate).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { clearControls, initPhysics, type SimWorld } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { createWorld } from '../helpers';

/** Settle the car where it was put, then steer it along the island's route toward `aheadOf`, `seconds` long. */
function driveRoute(sim: SimWorld, island: Island, k0: number, seconds: number, onStep: () => boolean): void {
  const samples = island.route.samples;
  let k = k0;
  for (let i = 0; i < 60 * seconds; i++) {
    const p = sim.vehicle.body.translation();
    const at = (n: number): { x: number; z: number } => samples[Math.min(samples.length - 1, n)] as { x: number; z: number };
    while (k + 1 < samples.length && Math.hypot(at(k + 1).x - p.x, at(k + 1).z - p.z) < Math.hypot(at(k).x - p.x, at(k).z - p.z)) k++;
    const aim = at(k + 8);
    const q = sim.vehicle.body.rotation();
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    let err = Math.atan2(aim.x - p.x, aim.z - p.z) - yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    clearControls(sim.controls);
    sim.controls.steer = Math.max(-1, Math.min(1, -err * 2.5));
    sim.controls.throttle = sim.vehicle.telemetry.speedKmh < 95 ? 1 : 0;
    sim.step();
    if (onStep()) break;
  }
}

describe('M8.10: the island\'s long drives', () => {
  beforeAll(async () => { await initPhysics(); });

  it('2.4 along the highway across four chunk borders the wheels keep the road', async () => {
    const sim: SimWorld = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    const samples = island.route.samples;
    // the south coast's stretch, heading west (world axes: the sketch's (320, 704) is (-320, -704))
    let k0 = 0, best = Infinity;
    samples.forEach((s, k) => { const d = Math.hypot(s.x + 320, s.z + 704); if (d < best) { best = d; k0 = k; } });
    // 180 m back, on the ground: the quay sweep's overpass (slice 6a) is ahead, crossed at speed
    k0 = Math.max(0, k0 - 60);
    const s0 = samples[k0];
    if (!s0) throw new Error('route');
    island.sync(s0.x, s0.z, true);
    sim.vehicle.teleport({ x: s0.x, y: island.heightAt(s0.x, s0.z) + 0.6, z: s0.z }, s0.yaw);
    for (let i = 0; i < 90; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    let lifted = 0;
    const gone = (): number => Math.hypot(sim.vehicle.body.translation().x - s0.x, sim.vehicle.body.translation().z - s0.z);
    driveRoute(sim, island, k0, 40, () => {
      if (sim.vehicle.telemetry.groundedWheels < 4) lifted++;
      return gone() > 820;
    });
    expect(gone()).toBeGreaterThan(800);
    expect(lifted).toBeLessThanOrEqual(4);
  }, 180_000);

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
  }, 180_000);
});
