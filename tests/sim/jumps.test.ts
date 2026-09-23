/**
 * Stunt jumps (docs/M4_PLAN.md slice 6): twenty ramps on the park strip
 * outside the highway, clear ahead and apart; a launch at 90 km/h flies,
 * pays the bag by the airtime with the slow motion through the flight, and
 * lands upright; a hop off a kerb pays nothing.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { RAMP_HALF_WIDTH, type JumpDesc } from '../../src/sim/city/jumps';
import type { SimWorld } from '../../src/sim';
import { createWorld, run, upness } from './helpers';

/** Along and across a ramp's heading from its ridge. */
function local(jd: JumpDesc, x: number, z: number): { along: number; across: number } {
  const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
  return { along: (x - jd.x) * fx + (z - jd.z) * fz, across: -(x - jd.x) * fz + (z - jd.z) * fx };
}

/** The ground a jump needs: from 20 m before the foot to the landing at 90 km/h (35 m past the ridge) and the run-out. */
function corridor(jd: JumpDesc): { from: number; to: number; half: number } {
  return { from: -jd.length - 20, to: 35 + BALANCE.jumps.runOut, half: RAMP_HALF_WIDTH + 1 };
}

describe('stunt jumps', () => {

  it('6.14 off the first ramp at 90 km/h: airtime, the bag by the formula, slow motion in the air, an upright landing on clear ground', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const jd = sim.jumps!.descs[0]!;
      const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
      const x = jd.x - fx * 70, z = jd.z - fz * 70;
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x, y: 0.8, z }, jd.yaw);
      run(sim, 0.4, (_t, c) => { c.brake = 1; });
      const bag = sim.run.bag;
      let jumps = 0, airtime = 0, landedAt = -1, landing = 0, slowInAir = true, flew = false;
      let seq = sim.events.sequence;
      const v = 90 / 3.6;
      run(sim, 6.5, (_t, _c, s) => {
        const at = local(jd, s.probe.x, s.probe.z);
        // held at 90 km/h up to the foot of the ramp, then left to fly
        if (at.along < -jd.length - 1 && !flew) s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v);
        if (s.jumps!.flying >= 0) {
          flew = true;
          if (s.life.state.slowMo <= 0) slowInAir = false;
        }
        seq = s.events.readFrom(seq, (e) => {
          if (e.kind !== 'jump') return;
          jumps++;
          airtime = e.value;
          landedAt = s.time;
          landing = at.along;
        });
      });
      expect(jumps).toBe(1);
      expect(airtime).toBeGreaterThanOrEqual(BALANCE.jumps.minAirSeconds);
      expect(slowInAir).toBe(true);
      expect(landing).toBeLessThan(corridor(jd).to - BALANCE.jumps.runOut + 5);
      expect(sim.run.bag - bag).toBe(Math.round(BALANCE.bag.jump + BALANCE.bag.jumpPerSecond * airtime));
      expect(sim.life.state.wrecked).toBe(false);
      expect(sim.time - landedAt).toBeGreaterThan(1);
      expect(upness(sim)).toBeGreaterThanOrEqual(0.99);
      // the slow motion ran out within two seconds of touching down
      expect(sim.life.state.slowMo).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('6.15 a hop off a kerb pays nothing', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      // across the park strip's apron and off its kerb onto the highway, at 60 km/h
      const x = -730, z = 300;
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x, y: 0.9, z }, Math.PI / 2);
      run(sim, 0.4, (_t, c) => { c.brake = 1; });
      let seq = sim.events.sequence, jumps = 0, flew = false, airborne = false;
      run(sim, 3, (_t, _c, s: SimWorld) => {
        s.vehicle.setVelocity(60 / 3.6, s.vehicle.telemetry.vy, 0);
        if (s.vehicle.telemetry.groundedWheels === 0) airborne = true;
        if (s.jumps!.flying >= 0) flew = true;
        seq = s.events.readFrom(seq, (e) => { if (e.kind === 'jump') jumps++; });
      });
      expect(sim.probe.x).toBeGreaterThan(-690);
      expect(flew).toBe(false);
      expect(jumps).toBe(0);
      void airborne;
    } finally { sim.dispose(); }
  }, 60_000);
});
