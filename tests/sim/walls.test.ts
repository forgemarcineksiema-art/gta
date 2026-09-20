/**
 * Wall pins. Every class: a glancing hit slides along the wall and comes out
 * pointing where it is going with most of its speed; a steep hit deflects and
 * aligns instead of pivoting nose-in; a head-on hit stops, bounces a little,
 * stays on its wheels and can be reversed out of; a stopped car peels off the
 * wall only when the driver asks (throttle + steer) and never turns on its own.
 * The walls lane is a straight barrier at x = 257 (face) along +Z.
 */
import { describe, expect, test } from 'vitest';
import type { CarId } from '../../src/sim';
import { createWorld, kmh, position, run, upness } from './helpers';

type World = Awaited<ReturnType<typeof createWorld>>;

const WALL_X = 257;

function yawOf(s: World): number {
  const q = s.transforms.currRot;
  const i = s.vehicle.slot * 4;
  return (Math.atan2(2 * ((q[i] as number) * (q[i + 2] as number) + (q[i + 3] as number) * (q[i + 1] as number)), 1 - 2 * ((q[i] as number) ** 2 + (q[i + 1] as number) ** 2)) * 180) / Math.PI;
}

/** Puts the car 8 m from the wall face heading `deg` degrees into it at `kmhIn`. */
async function launch(car: CarId, deg: number, kmhIn: number): Promise<World> {
  const sim = await createWorld({ spawn: 'walls', car });
  run(sim, 1);
  const th = (deg * Math.PI) / 180;
  sim.vehicle.teleport({ x: WALL_X - 8, y: 0.6, z: 20 }, th);
  run(sim, 0.5);
  const v = kmhIn / 3.6;
  sim.vehicle.body.setLinvel({ x: Math.sin(th) * v, y: 0, z: Math.cos(th) * v }, true);
  return sim;
}

interface HitResult {
  impact: number;
  vAfter1: number;
  yawAfter1: number;
  endV: number;
  endYaw: number;
  endZ: number;
  minUp: number;
  minX: number;
  maxScrape: number;
  sides: Set<number>;
}

function drive(sim: World, seconds: number): HitResult {
  const t0 = sim.tick;
  const r: HitResult = { impact: 0, vAfter1: -1, yawAfter1: 0, endV: 0, endYaw: 0, endZ: 0, minUp: 1, minX: Infinity, maxScrape: 0, sides: new Set() };
  let hitT = -1;
  run(sim, seconds, (t, c, s) => {
    c.throttle = 1;
    const tm = s.vehicle.telemetry;
    const rt = (t - t0) / 60;
    if (hitT < 0 && tm.impact > 0.5) {
      hitT = rt;
      r.impact = tm.impact;
    }
    if (hitT >= 0) {
      r.minUp = Math.min(r.minUp, upness(s));
      r.minX = Math.min(r.minX, position(s).x);
      r.maxScrape = Math.max(r.maxScrape, tm.scrape);
      if (tm.contactSide !== 0) r.sides.add(tm.contactSide);
      if (r.vAfter1 < 0 && rt >= hitT + 1) {
        r.vAfter1 = kmh(s);
        r.yawAfter1 = yawOf(s);
      }
    }
  });
  r.endV = kmh(sim);
  r.endYaw = yawOf(sim);
  r.endZ = position(sim).z;
  return r;
}

const CARS: CarId[] = ['muscle', 'compact', 'heavy'];

for (const car of CARS) {
  describe(`walls: ${car}`, () => {
    test('a 20 degree glance at 100 km/h slides along the wall and keeps its speed', async () => {
      const sim = await launch(car, 20, 100);
      const r = drive(sim, 3.5);
      expect(r.impact).toBeGreaterThan(3);
      expect(r.impact).toBeLessThan(8);
      expect(r.vAfter1).toBeGreaterThan(85);
      expect(Math.abs(r.yawAfter1)).toBeLessThan(8);
      expect(Math.abs(r.endYaw)).toBeLessThan(5);
      expect(r.endZ).toBeGreaterThan(100);
      expect(r.minUp).toBeGreaterThan(0.95);
      expect(r.maxScrape).toBeGreaterThan(0.5);
      // the wall is on the car's left (+X is left when heading +Z)
      expect(r.sides.has(1)).toBe(true);
      expect(r.sides.has(-1)).toBe(false);
    });

    test('a 45 degree hit at 100 km/h deflects along the wall with half its speed', async () => {
      const r = drive(await launch(car, 45, 100), 3.5);
      expect(r.impact).toBeGreaterThan(12);
      expect(r.impact).toBeLessThan(24);
      expect(r.vAfter1).toBeGreaterThan(50);
      expect(Math.abs(r.endYaw)).toBeLessThan(5);
      expect(r.minUp).toBeGreaterThan(0.95);
    });

    test('a 75 degree hit at 100 km/h aligns instead of pivoting nose-in', async () => {
      const r = drive(await launch(car, 75, 100), 3.5);
      expect(r.impact).toBeGreaterThan(24);
      expect(r.impact).toBeLessThan(36);
      expect(Math.abs(r.endYaw)).toBeLessThan(8);
      expect(r.endV).toBeGreaterThan(25);
      expect(r.minUp).toBeGreaterThan(0.95);
    });

    test('a 60 degree hit at 150 km/h stays on its wheels and comes out straight', async () => {
      const r = drive(await launch(car, 60, 150), 3.5);
      expect(r.impact).toBeGreaterThan(35);
      expect(r.impact).toBeLessThan(50);
      expect(Math.abs(r.endYaw)).toBeLessThan(5);
      expect(r.endV).toBeGreaterThan(45);
      expect(r.minUp).toBeGreaterThan(0.95);
    });

    test('a head-on hit at 100 km/h stops, bounces a little, stays square and reverses out', async () => {
      const sim = await launch(car, 90, 100);
      const r = drive(sim, 3.5);
      expect(r.impact).toBeGreaterThan(25);
      expect(r.vAfter1).toBeLessThan(10);
      expect(Math.abs(r.endYaw - 90)).toBeLessThan(15);
      expect(WALL_X - r.minX).toBeLessThan(12);
      expect(r.minUp).toBeGreaterThan(0.95);
      run(sim, 1); // let it settle against the wall
      const x0 = position(sim).x;
      run(sim, 2, (_t, c) => (c.brake = 1));
      expect(x0 - position(sim).x).toBeGreaterThan(3);
    });

    test('a head-on hit at 150 km/h does not roll or spin round', async () => {
      const r = drive(await launch(car, 90, 150), 3.5);
      expect(r.impact).toBeGreaterThan(40);
      expect(Math.abs(r.endYaw - 90)).toBeLessThan(35);
      expect(r.minUp).toBeGreaterThan(0.9);
    });

    test('stopped square on, the car peels off only when the driver steers', async () => {
      for (const steer of [-1, 0, 1]) {
        const sim = await createWorld({ spawn: 'walls', car });
        run(sim, 1);
        sim.vehicle.teleport({ x: WALL_X - 3.2, y: 0.6, z: 60 }, Math.PI / 2);
        run(sim, 0.5);
        sim.vehicle.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
        run(sim, 1.5);
        const p0 = position(sim);
        // unwrapped yaw progress in the steered direction (a full-lock FWD car keeps circling once free)
        let prev = yawOf(sim);
        let acc = 0;
        let best = 0;
        run(sim, 3, (_t, c, s) => {
          c.throttle = 1;
          c.steer = steer;
          const y = yawOf(s);
          let d = y - prev;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          acc += d;
          prev = y;
          // steer right (+) turns the nose toward +Z (yaw falls), left toward -Z
          best = Math.max(best, -acc * steer);
        });
        const p1 = position(sim);
        if (steer === 0) {
          expect(Math.abs(acc)).toBeLessThan(10);
        } else {
          expect(best).toBeGreaterThan(40);
          expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(3);
        }
      }
    });
  });
}

describe('props', () => {
  test('hitting the lot boxes reports a small impact and keeps most of the speed', async () => {
    const sim = await createWorld({ spawn: 'lot' });
    run(sim, 1);
    sim.vehicle.teleport({ x: 28, y: 0.6, z: -60 }, 0);
    run(sim, 0.5);
    sim.vehicle.body.setLinvel({ x: 0, y: 0, z: 60 / 3.6 }, true);
    let maxImpact = 0;
    let vBefore = 0;
    run(sim, 3, (_t, c, s) => {
      c.throttle = 1;
      const tm = s.vehicle.telemetry;
      if (position(s).z < -37) vBefore = kmh(s);
      maxImpact = Math.max(maxImpact, tm.impact);
    });
    expect(maxImpact).toBeGreaterThan(0.05);
    expect(maxImpact).toBeLessThan(10);
    expect(kmh(sim)).toBeGreaterThan(vBefore * 0.8);
  });
});
