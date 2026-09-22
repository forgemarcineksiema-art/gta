/**
 * Stunt jumps (docs/M4_PLAN.md slice 6): twenty ramps on the park strip
 * outside the highway, clear ahead and apart; a launch at 90 km/h flies,
 * pays the bag by the airtime with the slow motion through the flight, and
 * lands upright; a hop off a kerb pays nothing.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CAR_TOP, tallFootprint } from '../../src/sim/city/collectibles';
import { RAMP_HALF_WIDTH, type JumpDesc } from '../../src/sim/city/jumps';
import { HIGHWAY_HALF, projectOnLane } from '../../src/sim/city/roads';
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
  it('6.13 twenty ramps, the same for a seed, clear ahead, 120 m apart, off every carriageway', async () => {
    for (const seed of [42, 7, 123]) {
      const a = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      const b = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        const jumps = a.jumps!.descs;
        expect(jumps.length).toBe(BALANCE.jumps.count);
        expect(b.jumps!.descs).toEqual(jumps);
        const hit = { x: 0, z: 0, yaw: 0 };
        for (const jd of jumps) {
          for (const o of jumps) if (o !== jd) expect(Math.hypot(o.x - jd.x, o.z - jd.z)).toBeGreaterThanOrEqual(120);
          const c = corridor(jd);
          // nothing a car would hit, up to car height, along the corridor (the ramps face an axis)
          const cells = new Set<string>();
          for (let d = c.from; d <= c.to; d += 20) {
            const x = jd.x + Math.sin(jd.yaw) * d, z = jd.z + Math.cos(jd.yaw) * d;
            cells.add(`${Math.round(x / 225)},${Math.round(z / 225)}`);
            // off the carriageways: every lane further than the highway's half width
            for (const lane of a.city!.graph.lanes) expect(Math.sqrt(projectOnLane(lane, x, z, hit))).toBeGreaterThan(HIGHWAY_HALF);
          }
          for (const key of cells) {
            const [cx, cz] = key.split(',').map(Number) as [number, number];
            for (const st of a.city!.generate(cx, cz).statics) {
              if (st.collisionOnly) continue;
              const box = tallFootprint(st, CAR_TOP);
              if (!box) continue;
              // the corridor as an axis-aligned box
              const corners = [[c.from, -c.half], [c.from, c.half], [c.to, -c.half], [c.to, c.half]].map(([al, ac]) => ({
                x: jd.x + Math.sin(jd.yaw) * (al as number) - Math.cos(jd.yaw) * (ac as number),
                z: jd.z + Math.cos(jd.yaw) * (al as number) + Math.sin(jd.yaw) * (ac as number),
              }));
              const minX = Math.min(...corners.map((p) => p.x)), maxX = Math.max(...corners.map((p) => p.x));
              const minZ = Math.min(...corners.map((p) => p.z)), maxZ = Math.max(...corners.map((p) => p.z));
              const overlaps = box.minX < maxX && box.maxX > minX && box.minZ < maxZ && box.maxZ > minZ;
              expect(overlaps, `ramp ${jd.id} blocked by a static at ${st.position.x.toFixed(1)},${st.position.z.toFixed(1)}`).toBe(false);
            }
          }
        }
      } finally { a.dispose(); b.dispose(); }
    }
  }, 180_000);

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
