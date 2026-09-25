/**
 * The hovercraft (M8.8 slice 18): the car model on an air cushion. The four rays are its springs and push nothing
 * along; a fan pushes it, rudders yaw it, the skirt drags a little. On a road it slides as on ice: 0–80 in about 10 s,
 * under 0.3 g across, a full turn at 60 km/h taken wide and flat; at rest it hovers where it stopped.
 */
import { describe, expect, it } from 'vitest';
import { ASPHALT, DIRT, GRASS } from '../../src/sim/city/surface';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

describe('M8.8 slice 18: the hovercraft', () => {
  it('M8.8 18.1 on asphalt it reaches 80 km/h, and at full lock its lateral grip stays under 0.3 g', async () => {
    const sim = await createWorld({ spawn: 'straight', body: 'hover' });
    try {
      run(sim, 1);
      const t80 = runUntil(sim, 15, (s) => kmh(s) >= 80, fullThrottle);
      expect(t80).toBeGreaterThan(0);
      let g = 0;
      run(sim, 3, (_t, c, s) => {
        c.throttle = kmh(s) < 80 ? 1 : 0.4;
        c.steer = 1;
        g = Math.max(g, Math.abs(s.vehicle.telemetry.gLat));
      });
      expect(g).toBeGreaterThan(0.05);
      expect(g).toBeLessThan(0.3);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 18.2 no tyre force on any surface: it coasts alike on asphalt, grass and dirt', async () => {
    const coast: number[] = [];
    for (const ground of [ASPHALT, GRASS, DIRT] as const) {
      const sim = await createWorld({ spawn: 'straight', body: 'hover' });
      try {
        sim.vehicle.ground = { at: () => ground };
        run(sim, 1);
        let force = 0;
        runUntil(sim, 15, (s) => kmh(s) >= 60, (t, c, s) => {
          fullThrottle(t, c, s);
          c.steer = 0.3;
          for (const w of s.vehicle.wheels) force = Math.max(force, w.tyreForce);
        });
        run(sim, 2, (_t, _c, s) => { for (const w of s.vehicle.wheels) force = Math.max(force, w.tyreForce); });
        expect(force, `ground ${ground}`).toBe(0);
        expect(sim.vehicle.wheels.every((w) => w.surface === ground)).toBe(true);
        coast.push(Math.hypot(sim.vehicle.telemetry.vx, sim.vehicle.telemetry.vz));
      } finally { sim.dispose(); }
    }
    const [road, grass, dirt] = coast as [number, number, number];
    expect(Math.abs(grass - road)).toBeLessThan(road * 0.01);
    expect(Math.abs(dirt - road)).toBeLessThan(road * 0.01);
  }, 60_000);

  it('M8.8 18.3 a full turn at 60 km/h slides wide and stays flat', async () => {
    const sim = await createWorld({ spawn: 'lot', body: 'hover' });
    try {
      run(sim, 1);
      runUntil(sim, 20, (s) => kmh(s) >= 60, fullThrottle);
      const a = position(sim);
      let heading = 0, far = 0, up = 1;
      const turned = runUntil(sim, 15, () => Math.abs(heading) >= 2 * Math.PI, (_t, c, s) => {
        c.throttle = kmh(s) < 60 ? 1 : 0.3;
        c.steer = 1;
        heading += s.vehicle.telemetry.yawRate / 60;
        up = Math.min(up, upness(s));
        const p = position(s);
        far = Math.max(far, Math.hypot(p.x - a.x, p.z - a.z));
      });
      expect(turned).toBeGreaterThan(0);
      // a car at 60 km/h turns inside 30 m; the hovercraft's path runs out three times as far
      expect(far).toBeGreaterThan(60);
      expect(up).toBeGreaterThan(0.95);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 18.4 at rest it hovers where it stopped, level, on its four springs', async () => {
    const sim = await createWorld({ spawn: 'lot', body: 'hover' });
    try {
      run(sim, 1);
      const p0 = position(sim);
      run(sim, 6);
      const p1 = position(sim);
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
      expect(upness(sim)).toBeGreaterThan(0.99);
      expect(sim.vehicle.telemetry.groundedWheels).toBe(4);
    } finally { sim.dispose(); }
  }, 60_000);
});
