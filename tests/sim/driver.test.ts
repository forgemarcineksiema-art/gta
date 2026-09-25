/**
 * The AI driver (M8.8 slice 22): the track bot's method in the sim, driving any `Vehicle` along a path; a duel's race
 * rival near the player drives a physical car of its body with it, handed back to its lane when far. Its race against
 * the lane rival and the flips at junctions are the long pins (driver.long.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { TrackBot } from '../../src/app/trackBot';
import { Driver } from '../../src/sim/ai/Driver';
import { AI } from '../../src/sim/ai/AiCars';
import { CHAIN_ALL } from '../../src/sim/run/goal';
import { createWorld, run } from './helpers';

describe('M8.8 slice 22: the AI driver', () => {
  it('M8.8 22.1 on the playground\'s track the AI driver laps within 10 % of the track bot in the same car', async () => {
    for (const car of ['muscle', 'compact'] as const) {
      const a = await createWorld({ spawn: 'track', car });
      const bot = new TrackBot(car);
      try {
        for (let i = 0; i < 60 * 110 && a.lap.lapCount < 2; i++) { bot.drive(a, a.controls, 1 / 60); a.step(); }
      } finally { a.dispose(); }
      const b = await createWorld({ spawn: 'track', car });
      try {
        const driver = new Driver({ ...bot.tuning });
        driver.setPath(b.track.samples, true);
        for (let i = 0; i < 60 * 110 && b.lap.lapCount < 2; i++) { Object.assign(b.controls, driver.drive(b.vehicle)); b.step(); }
        expect(b.lap.lapCount, car).toBe(2);
        expect(Math.abs(b.lap.last - a.lap.last) / a.lap.last, car).toBeLessThan(0.1);
      } finally { b.dispose(); }
    }
  }, 120_000);

  it('M8.8 22.4 a duel\'s rival near the player drives a physical car of its body upright down its way, and goes back to its lane far off', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      sim.run.chain = CHAIN_ALL;
      // #10's race: pulled up at Granny's kerb
      const d = sim.jobs.defs.find((k) => k.kind === 'duel' && k.level === 0)!;
      const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
      sim.city?.sync(d.x - lx * 3, d.z - lz * 3, true);
      sim.vehicle.teleport({ x: d.x - lx * 3, y: 0.8, z: d.z - lz * 3 }, d.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.3);
      expect(sim.jobs.race.physical).toBe(true);
      const traffic = sim.traffic!, agent = sim.jobs.race.rivals[0]!;
      let physical = 0, minUp = 1, travelled = 0, px = traffic.x[agent] as number, pz = traffic.z[agent] as number;
      // the player kept 25 m behind it for 12 s
      run(sim, 12, (_t, _c, s) => {
        const yaw = traffic.yaw[agent] as number, fx = Math.sin(yaw), fz = Math.cos(yaw), v = traffic.speed[agent] as number;
        s.vehicle.teleport({ x: (traffic.x[agent] as number) - fx * 25, y: (traffic.y[agent] as number) + 0.8, z: (traffic.z[agent] as number) - fz * 25 }, yaw);
        s.vehicle.setVelocity(fx * v, 0, fz * v);
        travelled += Math.hypot((traffic.x[agent] as number) - px, (traffic.z[agent] as number) - pz);
        px = traffic.x[agent] as number;
        pz = traffic.z[agent] as number;
        const car = s.ai!.carOf(agent);
        if (traffic.puppet[agent] === 1 && car) {
          physical++;
          const r = car.body.rotation();
          minUp = Math.min(minUp, 1 - 2 * (r.x * r.x + r.z * r.z));
        }
      });
      expect(physical / (12 * 60)).toBeGreaterThan(0.95);
      expect(minUp).toBeGreaterThan(0.9);
      // down its way at the race's pace (about 12 m/s here)
      expect(travelled).toBeGreaterThan(100);
      expect(traffic.bodyOf(agent)).toBe('wagon');
      // the player gone: past the release radius it is a lane record again
      sim.vehicle.teleport({ x: (traffic.x[agent] as number) + AI.releaseRadius + 40, y: 0.8, z: traffic.z[agent] as number }, 0);
      run(sim, 0.5);
      expect(traffic.puppet[agent]).toBe(0);
      expect(sim.ai!.carOf(agent)).toBeNull();
    } finally { sim.dispose(); }
  }, 60_000);
});
