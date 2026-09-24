import { FIXED_HZ, SimWorld, clearControls, initPhysics, type SimWorldOptions, type VehicleControls } from '../../src/sim';

/**
 * A headless world; the rivals' teaser off unless asked for (the bot pins' traffic predates it, M7 slice 13), and every
 * job kind shown from the start unless asked for the game's reveal (M8.7 D10: the pins start any kind's ring).
 */
export async function createWorld(opts: SimWorldOptions = {}): Promise<SimWorld> {
  await initPhysics();
  return new SimWorld({ teasers: false, reveal: true, ...opts });
}

export type Script = (tick: number, c: VehicleControls, sim: SimWorld) => void;

/**
 * Step for `seconds`, calling `script` before each step. Controls are cleared
 * before every call, so a script states everything it wants held. Returns steps taken.
 */
export function run(sim: SimWorld, seconds: number, script: Script = () => undefined): number {
  const steps = Math.round(seconds * FIXED_HZ);
  for (let i = 0; i < steps; i++) {
    clearControls(sim.controls);
    script(sim.tick, sim.controls, sim);
    sim.step();
  }
  return steps;
}

/** Step until `predicate` is true or `maxSeconds` elapsed. Returns elapsed seconds or -1. */
export function runUntil(sim: SimWorld, maxSeconds: number, predicate: (sim: SimWorld) => boolean, script: Script = () => undefined): number {
  const steps = Math.round(maxSeconds * FIXED_HZ);
  for (let i = 0; i < steps; i++) {
    clearControls(sim.controls);
    script(sim.tick, sim.controls, sim);
    sim.step();
    if (predicate(sim)) return (i + 1) / FIXED_HZ;
  }
  return -1;
}

export function kmh(sim: SimWorld): number {
  return sim.vehicle.telemetry.speedKmh;
}

export function position(sim: SimWorld): { x: number; y: number; z: number } {
  const p = sim.transforms.currPos;
  const i = sim.vehicle.slot * 3;
  return { x: p[i] as number, y: p[i + 1] as number, z: p[i + 2] as number };
}

/** World-up component of the car's up axis: 1 = level, 0 = on its side, -1 = roof down. */
export function upness(sim: SimWorld): number {
  const q = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  const x = q[i] as number;
  const y = q[i + 1] as number;
  const z = q[i + 2] as number;
  const w = q[i + 3] as number;
  // rotate (0,1,0) by q, take y
  return 1 - 2 * (x * x + z * z) + 0 * (y + w);
}

export const fullThrottle: Script = (_t, c) => {
  c.throttle = 1;
};
