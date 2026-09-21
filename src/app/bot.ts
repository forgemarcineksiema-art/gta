/**
 * Autopilot for perf runs and smoke tests (`?bot=1&seed=42&duration=60`).
 * Deterministic from the seed; cycles through driving patterns that exercise
 * the whole vehicle model and keeps itself inside the playground.
 */
import { mulberry32, type SimWorld, type VehicleControls } from '../sim';

type Phase = 'straight' | 'slalom' | 'drift' | 'boost' | 'brake';
const PHASES: Phase[] = ['straight', 'slalom', 'boost', 'drift', 'straight', 'brake', 'slalom', 'drift'];

export class BotDriver {
  private readonly rnd: () => number;
  private phaseIndex = 0;
  private phaseTime = 0;
  private phaseLen = 5;
  private wander = 0;
  private stuckTime = 0;
  private driftDir = 1;
  resets = 0;

  constructor(seed: number) {
    this.rnd = mulberry32(seed);
    this.nextPhase();
  }

  get phase(): Phase {
    return PHASES[this.phaseIndex % PHASES.length] as Phase;
  }

  private nextPhase(): void {
    this.phaseIndex++;
    this.phaseTime = 0;
    this.phaseLen = 4 + this.rnd() * 5;
    this.driftDir = this.rnd() < 0.5 ? -1 : 1;
  }

  /** Fill `controls` for one fixed step. */
  drive(sim: SimWorld, controls: VehicleControls, dt: number): void {
    const tm = sim.vehicle.telemetry;
    this.phaseTime += dt;
    if (this.phaseTime > this.phaseLen) this.nextPhase();

    const speed = Math.abs(tm.speed);
    this.wander += (this.rnd() - 0.5) * dt * 2;
    this.wander *= 0.98;

    controls.throttle = 1;
    controls.brake = 0;
    controls.handbrake = 0;
    controls.boost = 0;
    controls.steer = this.wander;

    switch (this.phase) {
      case 'straight':
        controls.steer = this.wander * 0.3;
        break;
      case 'slalom':
        controls.steer = Math.sin(this.phaseTime * 2.2) * 0.8;
        break;
      case 'boost':
        controls.boost = 1;
        controls.steer = this.wander * 0.2;
        break;
      case 'drift': {
        const t = this.phaseTime % 3;
        controls.steer = this.driftDir * (t < 1.2 ? 1 : 0.4);
        controls.handbrake = t > 0.3 && t < 0.9 ? 1 : 0;
        break;
      }
      case 'brake':
        controls.throttle = this.phaseTime % 2 < 1 ? 1 : 0;
        controls.brake = this.phaseTime % 2 < 1 ? 0 : 1;
        break;
    }

    // stay on the lot: steer toward the origin when far out
    const x = sim.transforms.currPos[sim.vehicle.slot * 3] as number;
    const z = sim.transforms.currPos[sim.vehicle.slot * 3 + 2] as number;
    const r = Math.hypot(x, z - 80);
    if (r > 170) {
      // heading toward the centre: compare desired yaw and current yaw
      const desired = Math.atan2(-x, 80 - z);
      const q = sim.transforms.currRot;
      const i = sim.vehicle.slot * 4;
      const qx = q[i] as number;
      const qy = q[i + 1] as number;
      const qz = q[i + 2] as number;
      const qw = q[i + 3] as number;
      const yaw = Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
      let d = desired - yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      controls.steer = Math.max(-1, Math.min(1, -d * 1.5)); // positive steer = right = negative yaw
      controls.handbrake = 0;
      controls.boost = 0;
      if (r > 260) {
        // far off the lot: go back to the lot spawn, not the nearest one (which may be far out too)
        sim.spawnAt('lot');
        this.resets++;
      }
    }

    // stuck: no movement while trying to drive
    if (speed < 0.8 && controls.throttle > 0) {
      this.stuckTime += dt;
      if (this.stuckTime > 2.5) {
        sim.spawnAt('lot');
        this.resets++;
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }
  }
}
