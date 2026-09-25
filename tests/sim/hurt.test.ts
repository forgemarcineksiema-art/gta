/**
 * Damage you can feel (M8.8 slice 7): from stage 2 the engine gives part of its torque and the car pulls toward the
 * side of the hit that raised the stage; mild enough that control is never taken, nothing new on the screen; a swap,
 * the door's drive-out or a fresh car clears both, as they clear the damage.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { DAMAGE } from '../../src/sim/economy';
import * as M from '../../src/sim/math';
import { STRAIGHT } from '../../src/sim/playground';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, fullThrottle, kmh, position, run, runUntil, type Script } from './helpers';

/** The playground's right-hand wall's inner face (x), along the walls lane. */
const WALL_X = 257;

/** 80 km/h held on the throttle alone. */
const hold80: Script = (_t, c, s) => {
  const k = kmh(s);
  c.throttle = k < 79 ? 0.6 : k < 80.3 ? 0.3 : 0;
  c.brake = k > 81.5 ? 0.2 : 0;
};

function yaw(sim: SimWorld): number {
  return M.yawOf(sim.vehicle.body.rotation());
}

describe('M8.8 slice 7: damage you can feel', () => {
  it('M8.8 7.1 a hit on the right raises the stage to 3: 100 m at 80 km/h with no steering, the car drifts 0.5–1.5 m right', async () => {
    const sim = await createWorld({ spawn: 'walls', car: 'muscle', damage: true });
    try {
      run(sim, 1);
      sim.life.setDamage(0.84);
      expect(sim.life.state.stage).toBe(2);
      // along the right-hand wall, heading back down the lane: the car's right side faces it
      sim.vehicle.teleport({ x: WALL_X - 2, y: 0.6, z: 20 }, Math.PI);
      run(sim, 0.5);
      sim.vehicle.body.setLinvel({ x: 10, y: 0, z: 0 }, true);
      run(sim, 1);
      expect(sim.life.state.stage).toBe(3);
      expect(sim.vehicle.torqueMul).toBe(DAMAGE.handling.torque[3]);
      sim.vehicle.teleport({ x: STRAIGHT.x, y: 0.6, z: STRAIGHT.zStart + 10 }, 0);
      run(sim, 1);
      runUntil(sim, 25, (s) => kmh(s) >= 80, fullThrottle);
      run(sim, 2, hold80);
      const p0 = position(sim), a = yaw(sim);
      const fx = Math.sin(a), fz = Math.cos(a);
      let right = 0;
      expect(runUntil(sim, 20, (s) => {
        const p = position(s);
        const dx = p.x - p0.x, dz = p.z - p0.z;
        right = dx * -fz + dz * fx;
        return dx * fx + dz * fz >= 100;
      }, hold80)).toBeGreaterThan(0);
      expect(right).toBeGreaterThan(0.5);
      expect(right).toBeLessThan(1.5);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 7.2 at stage 3 the 0-100 is at most 15 % slower, in the muscle car and the van', async () => {
    for (const car of ['muscle', 'heavy'] as const) {
      const times: number[] = [];
      for (const damage of [0, 0.9]) {
        const sim = await createWorld({ spawn: 'straight', car, damage: true });
        try {
          run(sim, 1);
          sim.life.setDamage(damage);
          times.push(runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle));
        } finally { sim.dispose(); }
      }
      const [whole, hurt] = times as [number, number];
      expect(whole, car).toBeGreaterThan(0);
      expect(hurt, car).toBeGreaterThan(whole * 1.05);
      expect(hurt, car).toBeLessThanOrEqual(whole * 1.15);
    }
  }, 60_000);

  it('M8.8 7.3 a swap clears both: the engine whole, no pull', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      run(sim, 0.6);
      sim.life.setDamage(0.9);
      const p = position(sim), a = yaw(sim);
      // a hit on the car's left
      sim.life.hurt(3, p.x + Math.cos(a) * 1.5, p.z - Math.sin(a) * 1.5);
      expect(sim.vehicle.torqueMul).toBe(DAMAGE.handling.torque[3]);
      expect(sim.vehicle.lateralPull).toBeGreaterThan(0);
      const traffic = sim.traffic as Traffic;
      const agent = traffic.spawnParkedPolice(p.x - Math.cos(a) * 3.5, p.z + Math.sin(a) * 3.5, a, 'police');
      run(sim, 0.3);
      expect(sim.life.state.swapCandidate).toBe(agent);
      run(sim, 1 / 60, (_t, c) => { c.swap = true; });
      expect(sim.carId).toBe('police');
      expect(sim.life.state.stage).toBe(0);
      expect(sim.vehicle.torqueMul).toBe(1);
      expect(sim.vehicle.lateralPull).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
