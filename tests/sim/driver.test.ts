/**
 * The AI driver (M8.8 slice 22): the track bot's method in the sim, driving any `Vehicle` along a path; a duel's race
 * rival near the player drives a physical car of its body with it, handed back to its lane when far. Its race against
 * the lane rival and the flips at junctions are the long pins (driver.long.test.ts). Slice 23: on a chase the units
 * nearest the player drive physical police cars; the police long pins (23.1) run with them.
 */
import { describe, expect, it } from 'vitest';
import { TrackBot } from '../../src/app/trackBot';
import { Driver } from '../../src/sim/ai/Driver';
import { AI } from '../../src/sim/ai/AiCars';
import { POLICE } from '../../src/sim/police/tuning';
import { CHAIN_ALL } from '../../src/sim/run/goal';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import type { Traffic } from '../../src/sim/traffic/Traffic';
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

  it('M8.8 23.3 on a chase the units nearest the player drive physical cars, no more than physicalUnits; the box closes; after the card they are lane records', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 100 });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      // the player stopped on a straight street at s = 100, five units coming up behind it
      let lane = -1;
      for (let i = 0; i < traffic.lanes.laneCount && lane < 0; i++) {
        if ((traffic.lanes.limit[i] as number) === TRAFFIC.speedStreet && (traffic.lanes.length[i] as number) >= 150
          && sim.city!.graph.lanes[i]!.points.length === 2) lane = i;
      }
      const at = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(lane, 100, 0, at);
      sim.city?.sync(at.x, at.z, true);
      sim.vehicle.teleport({ x: at.x, y: 0.9, z: at.z }, at.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 1.5, (_t, c, s) => { c.handbrake = 1; s.pursuit.force(); });
      const units: number[] = [];
      for (const s of [72, 62, 52, 42, 32]) {
        const unit = traffic.spawnPoliceAt(lane, s, 'police', sim.probe, 0, -1, 4, -1, true);
        expect(sim.police!.enlist(unit)).toBeGreaterThanOrEqual(0);
        units.push(unit);
      }
      let most = 0, nearest = 0;
      for (let k = 0; k < 12 * 60 && sim.run.state !== 'busted'; k++) {
        sim.controls.handbrake = 1;
        sim.pursuit.force();
        sim.step();
        most = Math.max(most, units.filter((u) => traffic.puppet[u] === 1).length);
        if (traffic.puppet[units[0]!] === 1) nearest++;
      }
      console.log(`[police] physical units: at most ${most} of ${units.length}, the nearest physical ${(nearest / 60).toFixed(1)} s`);
      expect(most).toBeGreaterThan(0);
      expect(most).toBeLessThanOrEqual(POLICE.physicalUnits);
      expect(nearest).toBeGreaterThan(60);
      expect(sim.run.state).toBe('busted');
      // the card closed, the chase over: every car parked, every unit a lane record again
      sim.run.closeCard();
      run(sim, 3, (_t, c) => { c.throttle = 0.5; });
      expect(sim.ai!.busy).toBe(0);
      expect(units.filter((u) => traffic.puppet[u] === 1).length).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 24.1 the switch off (`physicalUnits` 0, `AI.pool` 0): no car in the pool, a duel\'s rival and a chase\'s units stay lane records', async () => {
    const units0 = POLICE.physicalUnits, pool0 = AI.pool;
    POLICE.physicalUnits = 0;
    AI.pool = 0;
    try {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
      try {
        // no Vehicle made: the physics world is the one from before the AI drove
        expect(sim.ai!.cars.length).toBe(0);
        sim.run.chain = CHAIN_ALL;
        const d = sim.jobs.defs.find((k) => k.kind === 'duel' && k.level === 0)!;
        const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
        sim.city?.sync(d.x - lx * 3, d.z - lz * 3, true);
        sim.vehicle.teleport({ x: d.x - lx * 3, y: 0.8, z: d.z - lz * 3 }, d.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        run(sim, 0.3);
        const traffic = sim.traffic!, agent = sim.jobs.race.rivals[0]!;
        expect(agent).toBeGreaterThanOrEqual(0);
        let puppets = 0;
        // the player on the rival's tail, then through a chase at three stars
        run(sim, 3, (_t, _c, s) => {
          const yaw = traffic.yaw[agent] as number, fx = Math.sin(yaw), fz = Math.cos(yaw), v = traffic.speed[agent] as number;
          s.vehicle.teleport({ x: (traffic.x[agent] as number) - fx * 20, y: (traffic.y[agent] as number) + 0.8, z: (traffic.z[agent] as number) - fz * 20 }, yaw);
          s.vehicle.setVelocity(fx * v, 0, fz * v);
          for (let i = 0; i < traffic.capacity; i++) if (traffic.puppet[i] === 1) puppets++;
        });
        sim.heat.set(60);
        run(sim, 6, (_t, _c, s) => {
          const yaw = traffic.yaw[agent] as number, fx = Math.sin(yaw), fz = Math.cos(yaw), v = traffic.speed[agent] as number;
          s.vehicle.teleport({ x: (traffic.x[agent] as number) - fx * 20, y: (traffic.y[agent] as number) + 0.8, z: (traffic.z[agent] as number) - fz * 20 }, yaw);
          s.vehicle.setVelocity(fx * v, 0, fz * v);
          s.pursuit.force();
          for (let i = 0; i < traffic.capacity; i++) if (traffic.puppet[i] === 1) puppets++;
        });
        expect(sim.police!.units.some((u) => u >= 0)).toBe(true);
        expect(puppets).toBe(0);
        expect(sim.ai!.busy).toBe(0);
      } finally { sim.dispose(); }
    } finally {
      POLICE.physicalUnits = units0;
      AI.pool = pool0;
    }
  }, 60_000);
});
