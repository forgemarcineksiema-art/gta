/** M8.10 slice 10: Palm Gardens' jumps of the ground, driven (docs/M8.10_PLAN.md; the long set, LONG=1). */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { BEACH_JUMP, CREST, DUNE_JUMP, type Hump } from '../../../src/sim/island/shapes/gardens';
import { createWorld } from '../helpers';

describe('M8.10 slice 10: Palm Gardens, driven', () => {
  let sim: SimWorld;
  let island: Island;
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    island = sim.island as Island;
  }, 60_000);

  it('10.5 the ground\'s jumps: the crest, the dunes\' and the beach\'s each throw a car a second or more at 80 km/h', () => {
    // straight at the hump from 30 m before its ramp, held at the speed to its foot, then its own; the longest time
    // with no wheel on the ground from there on
    const fly = (h: Hump, kmh: number): number => {
      const v = kmh / 3.6, back = h.top + h.ramp + 30;
      const x = h.x - h.dx * back, z = h.z - h.dz * back;
      island.sync(x, z, true);
      sim.vehicle.teleport({ x, y: island.heightAt(x, z) + 0.8, z }, Math.atan2(h.dx, h.dz));
      let air = 0, most = 0;
      for (let i = 0; i < 360; i++) {
        const p = sim.vehicle.body.translation(), along = (p.x - h.x) * h.dx + (p.z - h.z) * h.dz;
        sim.controls.throttle = 1;
        if (along < -(h.top + h.ramp + 2)) sim.vehicle.setVelocity(h.dx * v, sim.vehicle.telemetry.vy, h.dz * v);
        sim.step();
        air = sim.vehicle.telemetry.groundedWheels === 0 && along > -(h.top + h.ramp) ? air + 1 : 0;
        most = Math.max(most, air);
        // landed after a flight, or well past it
        if ((most > 20 && air === 0) || along > h.top + h.ramp + 60) break;
      }
      return most / 60;
    };
    // a second or more at 80 km/h, a paid jump's least (half a second) at 60
    const times = ([['the crest', CREST], ['the dunes\' jump', DUNE_JUMP], ['the beach\'s dune', BEACH_JUMP]] as const).map(([name, h]) => [name, fly(h, 60), fly(h, 80)] as const);
    console.log(`10.5 at 60 and 80 km/h: ${times.map(([name, a, b]) => `${name} ${a.toFixed(2)}, ${b.toFixed(2)} s`).join('; ')}`);
    for (const [name, slow, fast] of times) {
      expect(slow, `${name} at 60 km/h`).toBeGreaterThanOrEqual(0.5);
      expect(fast, `${name} at 80 km/h`).toBeGreaterThanOrEqual(1);
    }
  });
});
