/**
 * What a body drives like, measured on the playground (M8.8 slices 4–5): the table the gate report carries and the
 * "best at" pins of the trophies and the new vehicles read. Not a test file: the long pins import it. Every measure
 * takes an optional tuning (a candidate's, while tuning); without one the body drives as the game gives it.
 */
import type { SimWorld } from '../../src/sim';
import { bodySpec, type BodyId } from '../../src/sim/traffic/bodies';
import type { VehicleTuning } from '../../src/sim/vehicle/tuning';
import { createWorld, fullThrottle, kmh, position, run, runUntil } from './helpers';

export interface BodyRow {
  body: BodyId;
  /** Seconds from a standstill at full throttle; -1 when not reached in 25 s. */
  to60: number;
  to100: number;
  /** km/h at full throttle without boost, held on the straight until it stops rising. */
  top: number;
  /** Metres from 100 km/h to a stop on full brake; -1 when 100 is not reached. */
  brake100: number;
}

function world(spawn: string, body: BodyId, tuning?: VehicleTuning, damage = false): Promise<SimWorld> {
  return createWorld({ spawn, body, ...(tuning ? { tuning } : {}), ...(damage ? { damage: true } : {}) });
}

export async function measureBody(body: BodyId, tuning?: VehicleTuning): Promise<BodyRow> {
  const sim = await world('straight', body, tuning);
  let to60 = -1, to100 = -1, top = 0;
  try {
    run(sim, 1);
    to60 = runUntil(sim, 25, (s) => kmh(s) >= 60, fullThrottle);
    if (to60 > 0) {
      const more = runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
      to100 = more > 0 ? to60 + more : -1;
    }
    let last = -1;
    for (let i = 0; i < 120; i++) {
      run(sim, 1, (_t, c, s) => {
        c.throttle = 1;
        const p = position(s);
        if (p.z > 500) s.vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z - 500 }, true);
      });
      top = kmh(sim);
      if (top - last < 0.05) break;
      last = top;
    }
  } finally { sim.dispose(); }
  let brake100 = -1;
  if (to100 > 0) {
    const b = await world('straight', body, tuning);
    try {
      run(b, 1);
      runUntil(b, 25, (s) => kmh(s) >= 100, fullThrottle);
      const z0 = position(b).z;
      if (runUntil(b, 10, (s) => kmh(s) < 2, (_t, c) => (c.brake = 1)) > 0) brake100 = position(b).z - z0;
    } finally { b.dispose(); }
  }
  return { body, to60, to100, top, brake100 };
}

/** Degrees: the mean held drift angle on the skidpad, the cars pin's protocol (70 km/h, full steer and throttle, a handbrake flick). 0 without a drift. */
export async function driftHeld(body: BodyId, tuning?: VehicleTuning): Promise<number> {
  const sim = await world('skidpad', body, tuning);
  try {
    run(sim, 1);
    if (runUntil(sim, 20, (s) => kmh(s) >= 70, fullThrottle) < 0) return 0;
    let sum = 0, n = 0;
    run(sim, 2.5, (_t, c, s) => {
      c.throttle = 1;
      c.steer = 1;
      c.handbrake = s.vehicle.driftTime < 0.5 ? 1 : 0;
      if (s.vehicle.driftTime > 1 && s.vehicle.drifting) { sum += Math.abs(s.vehicle.telemetry.driftAngleDeg); n++; }
    });
    return n > 30 ? sum / n : 0;
  } finally { sim.dispose(); }
}

/** The car's heading from its transform (radians), as cars.test reads it. */
function yawOf(sim: SimWorld): number {
  const q = sim.transforms.currRot, i = sim.vehicle.slot * 4;
  return Math.atan2(2 * ((q[i] as number) * (q[i + 2] as number) + (q[i + 3] as number) * (q[i + 1] as number)), 1 - 2 * ((q[i] as number) ** 2 + (q[i + 1] as number) ** 2));
}

/** Degrees of heading a 0.35 s full-lock pulse at 60 km/h turns the car, a second on (cars.test's pulse). */
export async function pulse60(body: BodyId, tuning?: VehicleTuning): Promise<number> {
  const sim = await world('straight', body, tuning);
  try {
    run(sim, 1);
    if (runUntil(sim, 40, (s) => kmh(s) >= 60, fullThrottle) < 0) return 0;
    const y0 = yawOf(sim);
    run(sim, 0.35, (_t, c) => { c.steer = 1; c.throttle = 1; });
    run(sim, 1, fullThrottle);
    const d = yawOf(sim) - y0;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
  } finally { sim.dispose(); }
}

/** g: the best half second of lateral acceleration in a full-lock turn at 80 km/h, the speed held (the skidpad). */
export async function grip80(body: BodyId, tuning?: VehicleTuning): Promise<number> {
  const sim = await world('skidpad', body, tuning);
  try {
    run(sim, 1);
    if (runUntil(sim, 25, (s) => kmh(s) >= 80, fullThrottle) < 0) return 0;
    const window: number[] = [];
    let best = 0, sum = 0;
    run(sim, 3, (_t, c, s) => {
      c.steer = 1;
      c.throttle = kmh(s) < 80 ? 0.5 : 0;
      const g = Math.abs(s.vehicle.telemetry.gLat);
      window.push(g);
      sum += g;
      if (window.length > 30) sum -= window.shift() as number;
      if (window.length === 30) best = Math.max(best, sum / 30);
    });
    return best;
  } finally { sim.dispose(); }
}

/** The playground's wall face the damage pins drive into (damage.long.test.ts). */
const WALL_X = 257;

/** Damage (0..1) of a head-on hit into the playground's wall at 40 km/h, the nose 5.75 m off it. */
export async function wallDamage(body: BodyId, tuning?: VehicleTuning): Promise<number> {
  const sim = await world('walls', body, tuning, true);
  try {
    run(sim, 1);
    const th = Math.PI / 2;
    sim.vehicle.teleport({ x: WALL_X - 3.5 - bodySpec(body).halfLength, y: 0.6, z: 20 }, th);
    run(sim, 0.5);
    const v = 40 / 3.6;
    sim.vehicle.body.setLinvel({ x: Math.sin(th) * v, y: 0, z: Math.cos(th) * v }, true);
    run(sim, 2);
    return sim.life.state.damage;
  } finally { sim.dispose(); }
}
