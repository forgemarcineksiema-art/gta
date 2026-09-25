/**
 * Stunt jumps (docs/M4_PLAN.md slice 6): twenty ramps on the park strip
 * outside the highway, clear ahead and apart; a launch at 90 km/h flies,
 * pays the bag by the airtime with the slow motion through the flight, and
 * lands upright; a hop off a kerb pays nothing. The mega-ramp (M8.8 slice
 * 21): the muscle car on full boost flies it over the street and lands
 * upright on its landing slope, the slow motion at the apex only; it counts
 * once for the hunt and pays its own.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { MEGA, RAMP_HALF_WIDTH, type JumpDesc } from '../../src/sim/city/jumps';
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

describe('M8.8 slice 21: the mega-ramp', () => {
  /** Full boost from the strip north of the street at z 0 up the mega-ramp; what the flight did. */
  function fly(sim: SimWorld): { lip: number; apex: number; landing: number; slowAtLaunch: number; slowAtApex: number; jumps: number; paid: number } {
    const mega = sim.jumps!.descs.length - 1;
    const seq = sim.events.sequence, bag = sim.run.bag;
    sim.city!.sync(MEGA.x, MEGA.z, true);
    sim.vehicle.teleport({ x: MEGA.x, y: 1, z: -60 }, MEGA.yaw);
    sim.vehicle.setVelocity(0, 0, 0);
    run(sim, 0.5);
    let lip = 0, apex = 0, landing = NaN, slowAtLaunch = -1, slowAtApex = 0, jumps = 0;
    let cursor = seq;
    run(sim, 16, (_t, c, s) => {
      const p = s.vehicle.body.translation();
      c.throttle = 1;
      c.boost = 1;
      s.vehicle.boostMeter = 1;
      c.steer = Math.max(-1, Math.min(1, (p.x - MEGA.x) * 0.3));
      if (s.jumps!.flying === mega) {
        if (slowAtLaunch < 0) { slowAtLaunch = s.life.state.slowMo; lip = p.z; }
        slowAtApex = Math.max(slowAtApex, s.life.state.slowMo);
        apex = Math.max(apex, p.y);
      }
      cursor = s.events.readFrom(cursor, (e) => { if (e.kind === 'jump' && e.target === mega) { jumps++; landing = p.z - MEGA.z; } });
    });
    return { lip, apex, landing, slowAtLaunch, slowAtApex, jumps, paid: sim.run.bag - bag };
  }

  it('M8.8 21.1 the muscle car on full boost from the run-up flies over the street and lands upright on the landing slope', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const mega = sim.jumps!.descs[sim.jumps!.descs.length - 1]!;
      const f = fly(sim);
      expect(f.jumps).toBe(1);
      // high over the street at z 225, down on the slope beyond it, upright and whole
      expect(f.apex).toBeGreaterThan(20);
      const slope = mega.landing!;
      expect(f.landing).toBeGreaterThan(slope[1]!.along);
      expect(f.landing).toBeLessThan(slope[slope.length - 1]!.along);
      expect(upness(sim)).toBeGreaterThanOrEqual(0.99);
      expect(sim.life.state.wrecked).toBe(false);
      // the slow motion at the apex, not from the lip
      expect(f.slowAtLaunch).toBe(0);
      expect(f.slowAtApex).toBeCloseTo(MEGA.apexSlowMo, 5);
      expect(f.paid).toBe(BALANCE.bag.megaJump);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 21.2 the mega-ramp is the twenty-first jump and counts once', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const jumps = sim.jumps!;
      expect(jumps.descs.length).toBe(BALANCE.jumps.count + 1);
      const mega = jumps.descs.length - 1;
      let hunts = 0;
      const seq = sim.events.sequence;
      for (let k = 0; k < 2; k++) {
        const f = fly(sim);
        expect(f.jumps, `flight ${k}`).toBe(1);
        expect(jumps.found[mega]).toBe(1);
        expect(jumps.foundCount).toBe(1);
      }
      sim.events.readFrom(seq, (e) => { if (e.kind === 'hunt') hunts++; });
      expect(hunts).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);
});
