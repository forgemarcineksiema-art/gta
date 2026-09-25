/**
 * The motorbike's model (M8.8 slice 14): the car model on two wheels, the rays straight down on a 0.1 m track and the
 * upright controller holding the lean of the turn's g; a hit or a lean past what it can hold is a fall, bike and rider
 * as one, stood up again after 1.2 s. Its handling row is in cars.test.
 */
import { describe, expect, it } from 'vitest';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

const DEG = 180 / Math.PI;

describe('M8.8 slice 14: the bike\'s model', () => {
  it('M8.8 14.2 in a half-g turn it leans 25-30° and holds its line', async () => {
    const sim = await createWorld({ spawn: 'lot', car: 'moto' });
    try {
      run(sim, 1);
      runUntil(sim, 10, (s) => kmh(s) >= 45, fullThrottle);
      const hold = (_t: number, c: { throttle: number; steer: number }, s: typeof sim): void => { c.steer = 0.45; c.throttle = kmh(s) < 44 ? 0.6 : 0.1; };
      run(sim, 3, hold);
      let g = 0, lean = 0, n = 0, rMin = Infinity, rMax = 0;
      run(sim, 3, (t, c, s) => {
        hold(t, c, s);
        const tm = s.vehicle.telemetry;
        g += Math.abs(tm.gLat);
        lean += Math.abs(s.vehicle.lean) * DEG;
        n++;
        const r = Math.abs(tm.speed / tm.yawRate);
        rMin = Math.min(rMin, r);
        rMax = Math.max(rMax, r);
      });
      expect(g / n).toBeGreaterThan(0.43);
      expect(g / n).toBeLessThan(0.57);
      expect(lean / n).toBeGreaterThan(25);
      expect(lean / n).toBeLessThan(30);
      // its line: the radius holds within a tenth
      expect(rMax / rMin).toBeLessThan(1.1);
      expect(sim.vehicle.tumbleLeft).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 14.3 a slalom at 60 km/h without a fall', async () => {
    const sim = await createWorld({ spawn: 'slalom', car: 'moto' });
    try {
      run(sim, 1);
      runUntil(sim, 10, (s) => kmh(s) >= 60, fullThrottle);
      let falls = 0;
      run(sim, 6, (t, c, s) => {
        c.throttle = kmh(s) < 60 ? 0.7 : 0.2;
        c.steer = Math.sin((t / 60) * Math.PI * 1.2) > 0 ? 0.6 : -0.6;
        if (s.vehicle.tumbleLeft > 0) falls++;
      });
      expect(falls).toBe(0);
      expect(kmh(sim)).toBeGreaterThan(50);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 14.4 a 12 m/s wall hit tumbles it, and it drives again within 2 s', async () => {
    const sim = await createWorld({ spawn: 'walls', car: 'moto', damage: true });
    try {
      run(sim, 1);
      sim.vehicle.teleport({ x: 257 - 8, y: 0.6, z: 20 }, Math.PI / 2);
      run(sim, 0.5);
      sim.vehicle.body.setLinvel({ x: 12, y: 0, z: 0 }, true);
      const fell = runUntil(sim, 2, (s) => s.vehicle.tumbleLeft > 0);
      expect(fell).toBeGreaterThan(0);
      // away from the wall on the throttle as soon as it is up again
      const drives = runUntil(sim, 2, (s) => s.vehicle.tumbleLeft === 0 && kmh(s) > 5 && upness(s) > 0.9, (_t, c, s) => {
        if (s.vehicle.tumbleLeft === 0) { c.throttle = 1; c.steer = 1; }
      });
      expect(drives).toBeGreaterThan(0);
      expect(sim.life.state.wrecked).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 14.5 at rest it stands upright without creeping', async () => {
    const sim = await createWorld({ spawn: 'lot', car: 'moto' });
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
