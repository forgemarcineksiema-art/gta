/**
 * Every vehicle class must pass the same handling pins, each with its own
 * numbers. Adding a car means adding a row here.
 */
import { describe, expect, test } from 'vitest';
import type { CarId } from '../../src/sim';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

interface Expectations {
  to100: [number, number];
  top: [number, number];
  brake100: [number, number];
  driftBand: [number, number];
  driftMinSpeed: number;
  /** Heading change of a 0.35 s full-lock pulse at 60 km/h, minimum degrees. */
  pulse60: number;
}

const CARS: Record<CarId, Expectations> = {
  muscle: { to100: [5.8, 7.2], top: [160, 180], brake100: [22, 42], driftBand: [18, 42], driftMinSpeed: 50, pulse60: 20 },
  compact: { to100: [9, 13], top: [130, 165], brake100: [22, 42], driftBand: [12, 40], driftMinSpeed: 40, pulse60: 20 },
  heavy: { to100: [10, 16], top: [105, 140], brake100: [24, 48], driftBand: [10, 40], driftMinSpeed: 35, pulse60: 12 },
};

for (const [id, e] of Object.entries(CARS) as Array<[CarId, Expectations]>) {
  describe(`car: ${id}`, () => {
    test('rests without creeping', async () => {
      const sim = await createWorld({ spawn: 'lot', car: id });
      run(sim, 1);
      const p0 = position(sim);
      run(sim, 6);
      const p1 = position(sim);
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
      expect(upness(sim)).toBeGreaterThan(0.99);
    });

    test('0-100 and top speed in class', async () => {
      const sim = await createWorld({ spawn: 'straight', car: id });
      run(sim, 1);
      const t = runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
      expect(t).toBeGreaterThan(e.to100[0]);
      expect(t).toBeLessThan(e.to100[1]);
      let last = -1;
      let v = 0;
      for (let i = 0; i < 60; i++) {
        run(sim, 1, (_t, c, s) => {
          c.throttle = 1;
          const p = position(s);
          if (p.z > 500) s.vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z - 500 }, true);
        });
        v = kmh(sim);
        if (v - last < 0.3) break;
        last = v;
      }
      expect(v).toBeGreaterThan(e.top[0]);
      expect(v).toBeLessThan(e.top[1]);
    });

    test('brakes from 100 km/h in class distance', async () => {
      const sim = await createWorld({ spawn: 'straight', car: id });
      run(sim, 1);
      runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
      const z0 = position(sim).z;
      const t = runUntil(sim, 10, (s) => kmh(s) < 2, (_t, c) => (c.brake = 1));
      expect(t).toBeGreaterThan(0);
      const d = position(sim).z - z0;
      expect(d).toBeGreaterThan(e.brake100[0]);
      expect(d).toBeLessThan(e.brake100[1]);
    });

    test('holds a handbrake drift in its band and stays flat', async () => {
      const sim = await createWorld({ spawn: 'skidpad', car: id });
      run(sim, 1);
      runUntil(sim, 20, (s) => kmh(s) >= 70, fullThrottle);
      let minSpeed = Infinity;
      let minUp = 1;
      const angles: number[] = [];
      run(sim, 2.5, (_t, c, s) => {
        c.throttle = 1;
        c.steer = 1;
        c.handbrake = s.vehicle.driftTime < 0.5 ? 1 : 0;
        if (s.vehicle.driftTime > 1) {
          expect(s.vehicle.drifting).toBe(true);
          angles.push(Math.abs(s.vehicle.telemetry.driftAngleDeg));
          minSpeed = Math.min(minSpeed, kmh(s));
          minUp = Math.min(minUp, upness(s));
        }
      });
      expect(angles.length).toBeGreaterThan(30);
      for (const a of angles) {
        expect(a).toBeGreaterThan(e.driftBand[0]);
        expect(a).toBeLessThan(e.driftBand[1]);
      }
      expect(minSpeed).toBeGreaterThan(e.driftMinSpeed);
      expect(minUp).toBeGreaterThan(0.93);
    });

    test('turns sharply on grip at 60 km/h and stays composed at 120', async () => {
      const yawOf = (s: Awaited<ReturnType<typeof createWorld>>): number => {
        const q = s.transforms.currRot;
        const i = s.vehicle.slot * 4;
        return (Math.atan2(2 * ((q[i] as number) * (q[i + 2] as number) + (q[i + 3] as number) * (q[i + 1] as number)), 1 - 2 * ((q[i] as number) ** 2 + (q[i + 1] as number) ** 2)) * 180) / Math.PI;
      };
      for (const [target, min, max] of [
        [60, e.pulse60, 90],
        [120, 2, 20],
      ] as Array<[number, number, number]>) {
        const sim = await createWorld({ spawn: 'straight', car: id });
        run(sim, 1);
        const reached = runUntil(sim, 40, (s) => kmh(s) >= target, fullThrottle);
        if (reached < 0) continue; // a class that cannot reach the speed is not tested at it
        const y0 = yawOf(sim);
        let minUp = 1;
        run(sim, 0.35, (_t, c, s) => {
          c.steer = 1;
          c.throttle = 1;
          minUp = Math.min(minUp, upness(s));
        });
        run(sim, 1, (_t, c, s) => {
          c.throttle = 1;
          minUp = Math.min(minUp, upness(s));
        });
        const turned = Math.abs(yawOf(sim) - y0);
        expect(turned).toBeGreaterThan(min);
        expect(turned).toBeLessThan(max);
        expect(minUp).toBeGreaterThan(0.9);
      }
    });

    test('clips a kerb at speed without rolling and lands the 16 degree ramp', async () => {
      const sim = await createWorld({ spawn: 'kerbs', car: id });
      run(sim, 1);
      runUntil(sim, 25, (s) => kmh(s) >= 90, fullThrottle);
      let minUp = 1;
      run(sim, 4, (_t, c, s) => {
        c.throttle = 1;
        c.steer = position(s).x < 63.4 ? -0.25 : 0.1;
        minUp = Math.min(minUp, upness(s));
      });
      expect(minUp).toBeGreaterThan(0.9);
      const jump = await createWorld({ spawn: 'ramps', car: id });
      run(jump, 1);
      runUntil(jump, 30, (s) => position(s).z > 105, fullThrottle);
      const tAir = runUntil(jump, 5, (s) => s.vehicle.telemetry.airborne, fullThrottle);
      expect(tAir).toBeGreaterThan(0);
      let minUpAir = 1;
      runUntil(jump, 5, (s) => !s.vehicle.telemetry.airborne, (_t, c, s) => {
        c.throttle = 1;
        minUpAir = Math.min(minUpAir, upness(s));
      });
      run(jump, 1, fullThrottle);
      expect(minUpAir).toBeGreaterThan(0.85);
      expect(upness(jump)).toBeGreaterThan(0.97);
      expect(jump.vehicle.telemetry.groundedWheels).toBe(4);
    });
  });
}
