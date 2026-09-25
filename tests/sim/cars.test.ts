/**
 * Every vehicle class must pass the same handling pins, each with its own
 * numbers. Adding a car means adding a row here.
 *
 * The six-speed change (2026-09-22) moved 0-100 down by 0.3-0.6 s in every
 * class: an extra ratio keeps the engine nearer peak torque, which is the
 * point of the change, not a regression. Only the two lower bounds that this
 * crossed were moved with it (compact 9 -> 8.5, heavy 10 -> 9.6); the top
 * speeds and every other pin are untouched.
 *
 * The compact became the city car (M8.8 slice 2, 2026-09-25): quicker than the
 * muscle car to about 80 km/h, level at 100, slower above. Its 0-100 moved
 * from 8.9 s to 5.9 s and its window with it (8.5-13 -> 5.6-6.5); its top
 * (145 -> 144 km/h) and every other pin stand. The slice's own pins follow
 * the table.
 */
import { describe, expect, test } from 'vitest';
import { CAR_PRESETS, type CarId } from '../../src/sim';
import { TrackBot } from '../../src/app/trackBot';
import { GRASS } from '../../src/sim/city/surface';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

interface Expectations {
  to100: [number, number];
  top: [number, number];
  brake100: [number, number];
  driftBand: [number, number];
  driftMinSpeed: number;
  /** Heading change of a 0.35 s full-lock pulse at 60 km/h, minimum degrees. */
  pulse60: number;
  /** Track bot flying lap, seconds (the class benchmark). */
  botLap: [number, number];
  /** The least upness while it turns, drifts or laps: a bike leans into its turns (M8.8 slice 14); absent, a car stays flat. */
  upTurning?: number;
}

const CARS: Record<CarId, Expectations> = {
  muscle: { to100: [5.8, 7.2], top: [160, 180], brake100: [22, 42], driftBand: [18, 42], driftMinSpeed: 50, pulse60: 20, botLap: [30, 40] },
  compact: { to100: [5.6, 6.5], top: [130, 165], brake100: [22, 42], driftBand: [12, 40], driftMinSpeed: 40, pulse60: 20, botLap: [33, 43] },
  heavy: { to100: [9.6, 16], top: [105, 140], brake100: [24, 48], driftBand: [10, 40], driftMinSpeed: 35, pulse60: 12, botLap: [35, 46] },
  sports: { to100: [3.8, 5.6], top: [185, 212], brake100: [15, 30], driftBand: [22, 42], driftMinSpeed: 55, pulse60: 20, botLap: [30, 38] },
  police: { to100: [6.2, 8.6], top: [158, 185], brake100: [24, 44], driftBand: [18, 40], driftMinSpeed: 55, pulse60: 18, botLap: [32, 40] },
  // the 4×4 (M8.8 slice 10): 7.8 s, 165 km/h, 36 m, a 27° drift, a 38.5 s lap on the van's budget
  offroad: { to100: [7.5, 9], top: [150, 170], brake100: [25, 40], driftBand: [10, 40], driftMinSpeed: 35, pulse60: 12, botLap: [34, 44] },
  // the motorbike (M8.8 slice 14): 4.5 s, 179 km/h, 27 m, a 36° slide, a 36.1 s lap, leaning 45° at most
  moto: { to100: [4.2, 5.2], top: [165, 185], brake100: [18, 40], driftBand: [20, 45], driftMinSpeed: 25, pulse60: 12, botLap: [31, 42], upTurning: 0.6 },
};

for (const [id, e] of Object.entries(CARS) as Array<[CarId, Expectations]>) {
  describe(`car: ${id}`, () => {
    test('rests without creeping', async () => {
      const sim = await createWorld({ spawn: 'lot', car: id });
      run(sim, 1);
      const p0 = position(sim);
      run(sim, 6);
      const p1 = position(sim);
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
      expect(upness(sim)).toBeGreaterThan(0.99);
    });

    test('0-100 and top speed in class', async () => {
      const sim = await createWorld({ spawn: 'straight', car: id });
      run(sim, 1);
      const t = runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
      expect(t).toBeGreaterThan(e.to100[0]);
      expect(t).toBeLessThan(e.to100[1]);
      let last = -1;
      let v = 0;
      for (let i = 0; i < 60; i++) {
        run(sim, 1, (_t, c, s) => {
          c.throttle = 1;
          const p = position(s);
          if (p.z > 500) s.vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z - 500 }, true);
        });
        v = kmh(sim);
        if (v - last < 0.3) break;
        last = v;
      }
      expect(v).toBeGreaterThan(e.top[0]);
      expect(v).toBeLessThan(e.top[1]);
    });

    test('brakes from 100 km/h in class distance', async () => {
      const sim = await createWorld({ spawn: 'straight', car: id });
      run(sim, 1);
      runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
      const z0 = position(sim).z;
      const t = runUntil(sim, 10, (s) => kmh(s) < 2, (_t, c) => (c.brake = 1));
      expect(t).toBeGreaterThan(0);
      const d = position(sim).z - z0;
      expect(d).toBeGreaterThan(e.brake100[0]);
      expect(d).toBeLessThan(e.brake100[1]);
    });

    test('holds a handbrake drift in its band and stays flat', async () => {
      const sim = await createWorld({ spawn: 'skidpad', car: id });
      run(sim, 1);
      runUntil(sim, 20, (s) => kmh(s) >= 70, fullThrottle);
      let minSpeed = Infinity;
      let minUp = 1;
      const angles: number[] = [];
      run(sim, 2.5, (_t, c, s) => {
        c.throttle = 1;
        c.steer = 1;
        c.handbrake = s.vehicle.driftTime < 0.5 ? 1 : 0;
        if (s.vehicle.driftTime > 1) {
          expect(s.vehicle.drifting).toBe(true);
          angles.push(Math.abs(s.vehicle.telemetry.driftAngleDeg));
          minSpeed = Math.min(minSpeed, kmh(s));
          minUp = Math.min(minUp, upness(s));
        }
      });
      expect(angles.length).toBeGreaterThan(30);
      for (const a of angles) {
        expect(a).toBeGreaterThan(e.driftBand[0]);
        expect(a).toBeLessThan(e.driftBand[1]);
      }
      expect(minSpeed).toBeGreaterThan(e.driftMinSpeed);
      expect(minUp).toBeGreaterThan(e.upTurning ?? 0.93);
    });

    test('turns sharply on grip at 60 km/h and stays composed at 120', async () => {
      const yawOf = (s: Awaited<ReturnType<typeof createWorld>>): number => {
        const q = s.transforms.currRot;
        const i = s.vehicle.slot * 4;
        return (Math.atan2(2 * ((q[i] as number) * (q[i + 2] as number) + (q[i + 3] as number) * (q[i + 1] as number)), 1 - 2 * ((q[i] as number) ** 2 + (q[i + 1] as number) ** 2)) * 180) / Math.PI;
      };
      for (const [target, min, max] of [
        [60, e.pulse60, 90],
        [120, 2, 20],
      ] as Array<[number, number, number]>) {
        const sim = await createWorld({ spawn: 'straight', car: id });
        run(sim, 1);
        const reached = runUntil(sim, 40, (s) => kmh(s) >= target, fullThrottle);
        if (reached < 0) continue; // a class that cannot reach the speed is not tested at it
        const y0 = yawOf(sim);
        let minUp = 1;
        run(sim, 0.35, (_t, c, s) => {
          c.steer = 1;
          c.throttle = 1;
          minUp = Math.min(minUp, upness(s));
        });
        run(sim, 1, (_t, c, s) => {
          c.throttle = 1;
          minUp = Math.min(minUp, upness(s));
        });
        const turned = Math.abs(yawOf(sim) - y0);
        expect(turned).toBeGreaterThan(min);
        expect(turned).toBeLessThan(max);
        expect(minUp).toBeGreaterThan(e.upTurning ?? 0.9);
      }
    });

    test('clips a kerb at speed without rolling and lands the 16 degree ramp', async () => {
      const sim = await createWorld({ spawn: 'kerbs', car: id });
      run(sim, 1);
      runUntil(sim, 25, (s) => kmh(s) >= 90, fullThrottle);
      let minUp = 1;
      run(sim, 4, (_t, c, s) => {
        c.throttle = 1;
        c.steer = position(s).x < 63.4 ? -0.25 : 0.1;
        minUp = Math.min(minUp, upness(s));
      });
      expect(minUp).toBeGreaterThan(0.9);
      const jump = await createWorld({ spawn: 'ramps', car: id });
      run(jump, 1);
      runUntil(jump, 30, (s) => position(s).z > 105, fullThrottle);
      const tAir = runUntil(jump, 5, (s) => s.vehicle.telemetry.airborne, fullThrottle);
      expect(tAir).toBeGreaterThan(0);
      let minUpAir = 1;
      runUntil(jump, 5, (s) => !s.vehicle.telemetry.airborne, (_t, c, s) => {
        c.throttle = 1;
        minUpAir = Math.min(minUpAir, upness(s));
      });
      run(jump, 1, fullThrottle);
      expect(minUpAir).toBeGreaterThan(0.85);
      expect(upness(jump)).toBeGreaterThan(0.97);
      expect(jump.vehicle.telemetry.groundedWheels).toBe(4);
    });
  });
}

/** Seconds from a standstill to `target` km/h on the straight at full throttle. */
async function timeTo(id: CarId, target: number): Promise<number> {
  const sim = await createWorld({ spawn: 'straight', car: id });
  try {
    run(sim, 1);
    return runUntil(sim, 25, (s) => kmh(s) >= target, fullThrottle);
  } finally { sim.dispose(); }
}

/** The turning circle's radius at 20 km/h on full lock, the speed held (m). */
async function circleAt20(id: CarId): Promise<number> {
  const sim = await createWorld({ spawn: 'lot', car: id });
  try {
    run(sim, 1);
    runUntil(sim, 10, (s) => kmh(s) >= 20, fullThrottle);
    let yaw = 0, n = 0, steps = 0;
    run(sim, 4, (_t, c, s) => {
      c.steer = 1;
      const v = kmh(s);
      c.throttle = v < 19.5 ? 0.6 : 0;
      c.brake = v > 21 ? 0.3 : 0;
      if (++steps > 120) { yaw += Math.abs(s.vehicle.telemetry.yawRate); n++; }
    });
    return 20 / 3.6 / (yaw / Math.max(1, n));
  } finally { sim.dispose(); }
}

describe('M8.8 slice 2: the compact, the city car', () => {
  test('M8.8 2.2 its 0-60 beats the muscle car\'s by 0.3 s or more', async () => {
    expect(await timeTo('compact', 60)).toBeLessThanOrEqual((await timeTo('muscle', 60)) - 0.3);
  });

  test('M8.8 2.3 its turning circle at 20 km/h is the smallest of the classes', async () => {
    const compact = await circleAt20('compact');
    // of the cars: the motorbike (slice 14) turns on a bike's wheelbase
    for (const id of Object.keys(CARS) as CarId[]) if (id !== 'compact' && CAR_PRESETS[id].twoWheel === 0) expect(compact).toBeLessThan(await circleAt20(id));
  });
});

for (const [id, e] of Object.entries(CARS) as Array<[CarId, Expectations]>) {
  test(`car: ${id} laps the test track in its benchmark window`, async () => {
    const sim = await createWorld({ spawn: 'track', car: id });
    const bot = new TrackBot(id);
    let laps = 0;
    let minUp = 1;
    for (let i = 0; i < 60 * 110 && laps < 2; i++) {
      bot.drive(sim, sim.controls, 1 / 60);
      sim.step();
      minUp = Math.min(minUp, upness(sim));
      laps = sim.lap.lapCount;
    }
    expect(laps).toBe(2);
    expect(bot.resets).toBe(0);
    expect(minUp).toBeGreaterThan(e.upTurning ?? 0.93);
    expect(sim.lap.last).toBeGreaterThan(e.botLap[0]);
    expect(sim.lap.last).toBeLessThan(e.botLap[1]);
  });
}

/** Seconds from a standstill to 100 km/h on the straight, on a lawn (every wheel reads grass) or on the road. */
async function to100On(id: CarId, lawn: boolean): Promise<number> {
  const sim = await createWorld({ spawn: 'straight', car: id });
  try {
    if (lawn) sim.vehicle.ground = { at: () => GRASS };
    run(sim, 1);
    return runUntil(sim, 40, (s) => kmh(s) >= 100, fullThrottle);
  } finally { sim.dispose(); }
}

describe('M8.8 slice 10: the 4×4', () => {
  // the sports car stays the quickest anywhere (300 N·m on 1,180 kg, 5.1 s on a lawn): beating it there would have
  // taken a lawn that stops the road cars dead, so the pin names the four the 4×4 trails or passes on the road
  test('M8.8 10.2 on a lawn its 0-100 beats the muscle car\'s, the compact\'s, the van\'s and the police car\'s; on the road the muscle car beats it', async () => {
    const lawn = await to100On('offroad', true);
    expect(lawn).toBeGreaterThan(0);
    for (const id of ['muscle', 'compact', 'heavy', 'police'] as const) expect(lawn, id).toBeLessThan(await to100On(id, true));
    expect(await to100On('muscle', false)).toBeLessThan(await to100On('offroad', false));
  });
});
