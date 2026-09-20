/**
 * Handling pins (docs/BRIEF.md §8). Once the feel is approved these numbers
 * protect it: a change that moves them is a change of feel and must be deliberate.
 */
import { describe, expect, test } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

function yawDeg(s: SimWorld): number {
  const q = s.transforms.currRot;
  const i = s.vehicle.slot * 4;
  const x = q[i] as number;
  const y = q[i + 1] as number;
  const z = q[i + 2] as number;
  const w = q[i + 3] as number;
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) / (Math.PI / 180);
}

describe('at rest', () => {
  test('a parked car does not creep, jitter or spin its wheels', async () => {
    const sim = await createWorld({ spawn: 'lot' });
    run(sim, 1);
    const p0 = position(sim);
    run(sim, 10);
    const p1 = position(sim);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.005);
    expect(Math.abs(kmh(sim))).toBeLessThan(0.01);
    for (const w of sim.vehicle.wheels) expect(Math.abs(w.omega)).toBeLessThan(0.01);
    expect(sim.vehicle.telemetry.rpm).toBeCloseTo(sim.vehicle.tuning.idleRpm, 0);
  });
});

describe('acceleration and top speed', () => {
  test('0-100 km/h in about 5 s', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    const t = runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    expect(t).toBeGreaterThan(4.2);
    expect(t).toBeLessThan(5.8);
  });

  test('launch: the rears work the tyre but traction control keeps it usable', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    let maxKappa = 0;
    run(sim, 2, (_t, c, s) => {
      c.throttle = 1;
      maxKappa = Math.max(maxKappa, s.vehicle.telemetry.maxSlipRatio);
    });
    expect(maxKappa).toBeGreaterThan(sim.vehicle.tuning.slipRatioPeak * 0.5);
    expect(maxKappa).toBeLessThan(0.6);
    expect(kmh(sim)).toBeGreaterThan(45);
  });

  test('gears shift up in order and the engine stays between idle and the limiter', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    const t = sim.vehicle.tuning;
    let lastGear = 1;
    let shifts = 0;
    let maxRpm = 0;
    let minRpm = Infinity;
    run(sim, 20, (_t, c, s) => {
      c.throttle = 1;
      const tm = s.vehicle.telemetry;
      if (tm.gear !== lastGear) {
        expect(tm.gear).toBe(lastGear + 1);
        lastGear = tm.gear;
        shifts++;
      }
      maxRpm = Math.max(maxRpm, tm.rpm);
      minRpm = Math.min(minRpm, tm.rpm);
    });
    expect(shifts).toBeGreaterThanOrEqual(3);
    expect(maxRpm).toBeLessThanOrEqual(t.redlineRpm * 1.06);
    expect(minRpm).toBeGreaterThanOrEqual(t.idleRpm * 0.99);
  });

  /**
   * Full throttle until the speed stops climbing (< 0.3 km/h over a second). The
   * straight is only a kilometre long, so the car is wrapped back 500 m whenever it
   * passes z = 500, keeping its velocity and state (the ground is flat there).
   */
  const plateau = (sim: SimWorld, boost: boolean): number => {
    let last = -1;
    let v = 0;
    for (let i = 0; i < 60; i++) {
      run(sim, 1, (_t, c, s) => {
        c.throttle = 1;
        if (boost) {
          c.boost = 1;
          s.vehicle.boostMeter = 1;
        }
        const p = position(s);
        if (p.z > 500) s.vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z - 500 }, true);
      });
      v = kmh(sim);
      if (v - last < 0.3) break;
      last = v;
    }
    return v;
  };

  test('top speed about 170 km/h without boost', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    const v = plateau(sim, false);
    expect(v).toBeGreaterThan(160);
    expect(v).toBeLessThan(180);
  });

  test('top speed about 230 km/h with boost', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    const v = plateau(sim, true);
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
  test('stops from 100 km/h in a sane distance without locking the fronts', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    const z0 = position(sim).z;
    let minKappa = 0;
    const t = runUntil(sim, 10, (s) => kmh(s) < 2, (_t, c, s) => {
      c.brake = 1;
      minKappa = Math.min(minKappa, s.vehicle.telemetry.minSlipRatio);
    });
    const d = position(sim).z - z0;
    expect(t).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(22);
    expect(d).toBeLessThan(42);
    expect(minKappa).toBeGreaterThan(-0.9);
  });

  test('reverses when braking from a standstill, capped at a walking-plus pace', async () => {
    const sim = await createWorld({ spawn: 'lot' });
    run(sim, 1);
    run(sim, 4, (_t, c) => (c.brake = 1));
    expect(sim.vehicle.telemetry.gear).toBe(-1);
    expect(kmh(sim)).toBeLessThan(-15);
    expect(kmh(sim)).toBeGreaterThan(-32);
    run(sim, 3, fullThrottle);
    expect(sim.vehicle.telemetry.gear).toBeGreaterThan(0);
    expect(kmh(sim)).toBeGreaterThan(10);
  });

  test('the handbrake locks the rear wheels and does not turn the car on a straight', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    runUntil(sim, 15, (s) => kmh(s) >= 100, fullThrottle);
    let maxAngle = 0;
    let lockedSteps = 0;
    run(sim, 2, (_t, c, s) => {
      c.handbrake = 1;
      maxAngle = Math.max(maxAngle, Math.abs(s.vehicle.telemetry.driftAngleDeg));
      const rear = s.vehicle.wheels.filter((w) => !w.isFront);
      if (rear.every((w) => w.slipRatio < -0.9)) lockedSteps++;
    });
    expect(maxAngle).toBeLessThan(6);
    expect(lockedSteps).toBeGreaterThan(60);
  });
});

describe('drift', () => {
  test('a handbrake tap with throttle and steer holds a drift in the 18..42 degree band without spinning out', async () => {
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
      if (i >= 8) {
        const tm = sim.vehicle.telemetry;
        expect(tm.drifting).toBe(true);
        angles.push(Math.abs(tm.driftAngleDeg));
        minSpeed = Math.min(minSpeed, tm.speedKmh);
        minUp = Math.min(minUp, upness(sim));
      }
    }
    for (const a of angles) {
      expect(a).toBeGreaterThan(18);
      expect(a).toBeLessThan(42);
    }
    expect(minSpeed).toBeGreaterThan(35);
    expect(minUp).toBeGreaterThan(0.95);
    // the front wheels visibly counter-steer (point along the velocity, away from the turn)
    expect(sim.vehicle.wheels[0]?.steer ?? 0).toBeLessThan(0);
  });

  test('half steer holds a smaller angle than full steer', async () => {
    const angleFor = async (steer: number): Promise<number> => {
      const sim = await createWorld({ spawn: 'skidpad' });
      run(sim, 1);
      runUntil(sim, 10, (s) => kmh(s) >= 70, fullThrottle);
      let sum = 0;
      let n = 0;
      run(sim, 2.5, (_t, c, s) => {
        c.throttle = 1;
        c.steer = steer;
        c.handbrake = s.vehicle.driftTime < 0.4 ? 1 : 0;
        if (s.vehicle.driftTime > 1.2) {
          sum += Math.abs(s.vehicle.telemetry.driftAngleDeg);
          n++;
        }
      });
      return n > 0 ? sum / n : 0;
    };
    const full = await angleFor(1);
    const half = await angleFor(0.5);
    expect(half).toBeGreaterThan(8);
    expect(half).toBeLessThan(full * 0.8);
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
    });
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1.0);
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
      c.steer = position(s).x < 63.4 ? -0.25 : 0.1; // the right-hand kerb sits at +X, which is the car's left
      minUp = Math.min(minUp, upness(s));
    });
    expect(minUp).toBeGreaterThan(0.9);
  });

  test('highway driving on a keyboard stays composed: steer taps at 150 km/h', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    run(sim, 1);
    runUntil(sim, 25, (s) => kmh(s) >= 150, fullThrottle);
    const x0 = position(sim).x;
    let maxYaw = 0;
    let maxSlip = 0;
    run(sim, 3, (t, c, s) => {
      c.throttle = 1;
      // 100 ms taps left/right every half second
      const phase = t % 30;
      c.steer = phase < 6 ? 1 : phase >= 15 && phase < 21 ? -1 : 0;
      maxYaw = Math.max(maxYaw, Math.abs(yawDeg(s)));
      maxSlip = Math.max(maxSlip, s.vehicle.telemetry.maxSlipDeg);
    });
    expect(Math.abs(position(sim).x - x0)).toBeLessThan(12);
    expect(maxYaw).toBeLessThan(6);
    expect(maxSlip).toBeLessThan(sim.vehicle.tuning.slipAngPeakDeg); // the tyres never pass their peak: taps never turn into a slide
    expect(sim.vehicle.drifting).toBe(false);
    // hands off: heading settles within a second
    run(sim, 1, fullThrottle);
    const yawA = yawDeg(sim);
    run(sim, 0.5, fullThrottle);
    expect(Math.abs(yawDeg(sim) - yawA)).toBeLessThan(0.5);
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

  test('live tuning: applyTuning changes the mass without breaking the car', async () => {
    const sim = await createWorld({ spawn: 'lot' });
    run(sim, 1);
    sim.vehicle.tuning.mass = 1800;
    sim.vehicle.applyTuning();
    run(sim, 2);
    expect(sim.vehicle.body.mass()).toBeCloseTo(1800, 0);
    expect(sim.hasNaN()).toBe(false);
    expect(upness(sim)).toBeGreaterThan(0.99);
  });
});
