/**
 * Handling pins (docs/BRIEF.md §8). Once the feel is approved these numbers
 * protect it: a change that moves them is a change of feel and must be deliberate.
 */
import { describe, expect, test } from 'vitest';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

describe('acceleration and top speed', () => {
  test('0-100 km/h in about 5 s', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    const t = runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    expect(t).toBeGreaterThan(4.0);
    expect(t).toBeLessThan(6.0);
  });

  test('top speed about 170 km/h without boost', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    run(sim, 20, fullThrottle);
    const v = kmh(sim);
    expect(v).toBeGreaterThan(160);
    expect(v).toBeLessThan(180);
  });

  test('top speed about 230 km/h with boost', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    run(sim, 20, (_t, c, s) => {
      c.throttle = 1;
      c.boost = 1;
      s.vehicle.boostMeter = 1;
    });
    const v = kmh(sim);
    expect(v).toBeGreaterThan(220);
    expect(v).toBeLessThan(240);
  });

  test('boost meter drains while boosting and refills while drifting', async () => {
    const sim = await createWorld({ spawn: 'skidpad' });
    sim.vehicle.boostMeter = 0.5;
    run(sim, 1, (_t, c) => {
      c.throttle = 1;
      c.boost = 1;
    });
    expect(sim.vehicle.boostMeter).toBeLessThan(0.5);
    const before = sim.vehicle.boostMeter;
    runUntil(sim, 10, (s) => kmh(s) >= 60, fullThrottle);
    run(sim, 2, (_t, c, s) => {
      c.throttle = 1;
      c.steer = 1;
      c.handbrake = s.vehicle.driftTime < 0.4 ? 1 : 0;
    });
    expect(sim.vehicle.telemetry.drifting).toBe(true);
    expect(sim.vehicle.boostMeter).toBeGreaterThan(before);
  });
});

describe('braking', () => {
  test('stops from 100 km/h within a sane distance', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    const z0 = position(sim).z;
    const t = runUntil(sim, 10, (s) => kmh(s) < 2, (_t, c) => {
      c.throttle = 0;
      c.brake = 1;
    });
    const d = position(sim).z - z0;
    expect(t).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(45);
  });

  test('reverses when braking from a standstill', async () => {
    const sim = await createWorld({ spawn: 'lot' });
    run(sim, 1);
    run(sim, 3, (_t, c) => (c.brake = 1));
    expect(kmh(sim)).toBeLessThan(-10);
    expect(kmh(sim)).toBeGreaterThan(-40);
  });
});

describe('drift', () => {
  test('a handbrake tap with throttle and steer holds a drift in the 12..45 degree band', async () => {
    const sim = await createWorld({ spawn: 'skidpad' });
    run(sim, 1);
    runUntil(sim, 10, (s) => kmh(s) >= 70, fullThrottle);
    const angles: number[] = [];
    let minSpeed = Infinity;
    let minUp = 1;
    for (let i = 0; i < 25; i++) {
      run(sim, 0.1, (_t, c) => {
        c.throttle = 1;
        c.steer = 1;
        c.handbrake = i < 5 ? 1 : 0;
      });
      if (i >= 10) {
        const tm = sim.vehicle.telemetry;
        expect(tm.drifting).toBe(true);
        angles.push(Math.abs(tm.driftAngleDeg));
        minSpeed = Math.min(minSpeed, tm.speedKmh);
        minUp = Math.min(minUp, upness(sim));
      }
    }
    for (const a of angles) {
      expect(a).toBeGreaterThan(12);
      expect(a).toBeLessThan(45);
    }
    // a drift is not a spin-out: the car keeps rolling and stays flat
    expect(minSpeed).toBeGreaterThan(35);
    expect(minUp).toBeGreaterThan(0.95);
  });

  test('centring the wheel ends the drift and the car straightens within a second', async () => {
    const sim = await createWorld({ spawn: 'skidpad' });
    run(sim, 1);
    runUntil(sim, 10, (s) => kmh(s) >= 70, fullThrottle);
    run(sim, 2, (_t, c, s) => {
      c.throttle = 1;
      c.steer = 1;
      c.handbrake = s.vehicle.driftTime < 0.4 ? 1 : 0;
    });
    expect(sim.vehicle.drifting).toBe(true);
    const t = runUntil(sim, 2, (s) => !s.vehicle.drifting && Math.abs(s.vehicle.telemetry.driftAngleDeg) < 5, (_t, c) => {
      c.throttle = 1;
      c.steer = 0;
      c.handbrake = 0;
    });
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1.0);
  });

  test('a straight-line handbrake at speed does not spin the car', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    let maxAngle = 0;
    run(sim, 2, (_t, c, s) => {
      c.throttle = 0;
      c.handbrake = 1;
      maxAngle = Math.max(maxAngle, Math.abs(s.vehicle.telemetry.driftAngleDeg));
    });
    expect(maxAngle).toBeLessThan(8);
  });
});

describe('stability', () => {
  test('clipping a kerb at 100 km/h does not roll the car', async () => {
    const sim = await createWorld({ spawn: 'kerbs' });
    run(sim, 1);
    runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    let minUp = 1;
    run(sim, 4, (_t, c, s) => {
      c.throttle = 1;
      c.steer = position(s).x < 63.4 ? 0.25 : -0.1;
      minUp = Math.min(minUp, upness(s));
    });
    expect(minUp).toBeGreaterThan(0.9);
  });

  test('highway driving on a keyboard stays straight: tapping steer at 150 km/h', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    runUntil(sim, 20, (s) => kmh(s) >= 150, fullThrottle);
    const x0 = position(sim).x;
    let maxYawDeg = 0;
    run(sim, 3, (t, c, s) => {
      c.throttle = 1;
      // 100 ms taps left/right every half second
      const phase = t % 30;
      c.steer = phase < 6 ? 1 : phase >= 15 && phase < 21 ? -1 : 0;
      const q = s.transforms.currRot;
      const i = s.vehicle.slot * 4;
      const yaw = Math.atan2(2 * ((q[i] as number) * (q[i + 2] as number) + (q[i + 3] as number) * (q[i + 1] as number)), 1 - 2 * ((q[i] as number) ** 2 + (q[i + 1] as number) ** 2));
      maxYawDeg = Math.max(maxYawDeg, Math.abs(yaw) / (Math.PI / 180));
    });
    expect(Math.abs(position(sim).x - x0)).toBeLessThan(6);
    expect(maxYawDeg).toBeLessThan(6);
  });

  test('every ramp lands on the wheels and settles within a second', async () => {
    const sim = await createWorld({ spawn: 'ramps' });
    run(sim, 1);
    let jumps = 0;
    let wasAir = false;
    let landedTick = -1;
    let minUpInAir = 1;
    const settleTimes: number[] = [];
    run(sim, 20, (_t, c, s) => {
      c.throttle = 1;
      const tm = s.vehicle.telemetry;
      if (tm.airborne) {
        if (!wasAir) jumps++;
        wasAir = true;
        minUpInAir = Math.min(minUpInAir, upness(s));
      } else if (wasAir) {
        wasAir = false;
        landedTick = s.tick;
      }
      if (landedTick >= 0 && !tm.airborne) {
        const settled = tm.groundedWheels === 4 && upness(s) > 0.98 && Math.abs(s.vehicle.body.linvel().y) < 0.5;
        if (settled) {
          settleTimes.push((s.tick - landedTick) / 60);
          landedTick = -1;
        } else if (s.tick - landedTick > 60) {
          settleTimes.push(99);
          landedTick = -1;
        }
      }
    });
    expect(jumps).toBeGreaterThanOrEqual(3);
    expect(minUpInAir).toBeGreaterThan(0.75);
    expect(upness(sim)).toBeGreaterThan(0.98);
    for (const t of settleTimes) expect(t).toBeLessThan(1.0);
  });

  test('an upside-down car rights itself', async () => {
    const sim = await createWorld({ spawn: 'lot' });
    run(sim, 1);
    // flip it: roof down, 1.5 m up
    sim.vehicle.body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    sim.vehicle.body.setTranslation({ x: 0, y: 1.5, z: -40 }, true);
    run(sim, 4);
    expect(upness(sim)).toBeGreaterThan(0.95);
  });

  test('R resets to the nearest spawn point', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    const z0 = position(sim).z;
    run(sim, 6, fullThrottle);
    expect(position(sim).z - z0).toBeGreaterThan(80);
    sim.controls.reset = true;
    sim.step();
    run(sim, 1);
    expect(Math.abs(kmh(sim))).toBeLessThan(5);
    const p = position(sim);
    const nearest = sim.nearestSpawn(p.x, p.z);
    expect(Math.hypot(nearest.position.x - p.x, nearest.position.z - p.z)).toBeLessThan(1);
  });
});
