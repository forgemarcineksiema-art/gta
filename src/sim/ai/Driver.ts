/**
 * The AI driver (M8.8 slice 22): drives a `Vehicle` along a path of samples the way the track bot drives the player's
 * (its method, in the sim): pure pursuit at a point `look` m ahead, and a speed plan that keeps to the slowest of the
 * corner speeds ahead (`latAccel` of grip) reachable at its braking, capped by the plan's own speed. Or straight at a
 * point (slice 23: a unit's ram, its PIT, its slot in a box), at a speed, braking to stop there when it is a place to
 * stop at. No allocation per step.
 */
import * as M from '../math';
import { createControls, type VehicleControls } from '../controls';
import type { TrackSample } from '../track';
import type { Vehicle } from '../vehicle/Vehicle';

export interface DriverTuning {
  /** Lookahead = base + speed × perSpeed, clamped (m, s). */
  lookBase: number;
  lookPerSpeed: number;
  lookMin: number;
  lookMax: number;
  /** Steer per radian of pursuit angle. */
  steerGain: number;
  /** The corners' lateral budget and the braking the plan assumes, m/s². */
  latAccel: number;
  brakeAccel: number;
  /** How far ahead the plan looks (m) and the speed on a straight (m/s). */
  planAhead: number;
  vMax: number;
}

/** The track bot's defaults (app/trackBot.ts), which lap the test track as it does. */
export const DRIVER: DriverTuning = {
  lookBase: 5, lookPerSpeed: 0.5, lookMin: 7, lookMax: 34, steerGain: 2.6, latAccel: 17, brakeAccel: 9, planAhead: 90, vMax: 58,
};

export class Driver {
  readonly controls: VehicleControls = createControls();
  /** The plan's own speed on top of the corners' (a race's pace), m/s. */
  cap = Infinity;
  /** The path's sample nearest the car, and whether the path loops. */
  idx = 0;
  private path: readonly TrackSample[] = [];
  private loop = false;
  /** Driving at a point instead of along the path: the point, the speed, and whether to stop there. */
  private aiming = false;
  private aimX = 0;
  private aimZ = 0;
  private aimSpeed = 0;
  private arrive = false;
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };

  constructor(public tuning: DriverTuning = DRIVER) {}

  /** Follows `samples` from now on (3 m apart); `loop` false stops at the last. */
  setPath(samples: readonly TrackSample[], loop = false): void {
    this.path = samples;
    this.loop = loop;
    this.idx = 0;
  }

  /** Drives at a point from now on, at `speed` m/s, braking to stop there when `arrive`; `follow` goes back to the path. */
  aim(x: number, z: number, speed: number, arrive: boolean): void {
    this.aiming = true;
    this.aimX = x;
    this.aimZ = z;
    this.aimSpeed = speed;
    this.arrive = arrive;
  }

  follow(): void {
    this.aiming = false;
  }

  /** Metres of an open path left ahead of the car. */
  get left(): number {
    return this.loop ? Infinity : Math.max(0, this.path.length - 1 - this.idx) * 3;
  }

  private at(i: number, m: number): number {
    return this.loop ? ((i % m) + m) % m : Math.max(0, Math.min(m - 1, i));
  }

  /** The controls for one step of `vehicle` along the path. */
  drive(vehicle: Vehicle): VehicleControls {
    const c = this.controls, t = this.tuning, S = this.path, m = S.length;
    if (this.aiming) return this.driveAt(vehicle);
    if (m < 2) {
      c.throttle = 0;
      c.brake = 1;
      c.steer = 0;
      return c;
    }
    const p = vehicle.body.translation(this.pos), yaw = M.yawOf(vehicle.body.rotation(this.rot));
    const speed = Math.max(0, vehicle.telemetry.speed);
    // the nearest sample, searched a little back and further on from the last
    let best = this.idx, bestD = Infinity;
    for (let k = -8; k <= 24; k++) {
      const i = this.at(this.idx + k, m), s = S[i] as TrackSample;
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.idx = best;
    // pursuit: the sample `look` m on (+ yaw turns the nose left; steer right is +)
    const look = Math.max(t.lookMin, Math.min(t.lookMax, t.lookBase + speed * t.lookPerSpeed));
    const target = S[this.at(best + Math.round(look / 3), m)] as TrackSample;
    let d = Math.atan2(target.x - p.x, target.z - p.z) - yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    c.steer = Math.max(-1, Math.min(1, -d * t.steerGain));
    // the plan: the slowest speed the road ahead allows, reachable with the braking assumed; an open path's end a stop
    let allowed = Math.min(t.vMax, this.cap), dist = 0;
    for (let k = 0; dist < t.planAhead && (this.loop || best + k < m); k++) {
      const s = S[this.at(best + k, m)] as TrackSample;
      const vCorner = Math.min(t.vMax, Math.sqrt(t.latAccel / Math.max(1e-4, Math.abs(s.curvature))));
      const vHere = Math.sqrt(vCorner * vCorner + 2 * t.brakeAccel * dist);
      if (vHere < allowed) allowed = vHere;
      dist += 3;
    }
    if (!this.loop) allowed = Math.min(allowed, Math.sqrt(2 * t.brakeAccel * this.left));
    return this.pedals(allowed, speed);
  }

  /** Straight at the aim point: steered at it, at its speed, stopping on it when it is a place to stop at. */
  private driveAt(vehicle: Vehicle): VehicleControls {
    const c = this.controls, t = this.tuning;
    const p = vehicle.body.translation(this.pos), yaw = M.yawOf(vehicle.body.rotation(this.rot));
    const speed = Math.max(0, vehicle.telemetry.speed);
    const dx = this.aimX - p.x, dz = this.aimZ - p.z, d = Math.hypot(dx, dz);
    let a = Math.atan2(dx, dz) - yaw;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    c.steer = Math.max(-1, Math.min(1, -a * t.steerGain));
    const allowed = this.arrive ? Math.min(this.aimSpeed, Math.sqrt(2 * t.brakeAccel * Math.max(0, d - 1))) : this.aimSpeed;
    return this.pedals(allowed, speed);
  }

  /** The pedals for a speed: on under it, the brake well over it; a hold is the brake to a stop, then the handbrake (the brake held at a standstill would reverse). */
  private pedals(allowed: number, speed: number): VehicleControls {
    const c = this.controls;
    c.boost = 0;
    if (allowed < 0.5) {
      c.throttle = 0;
      c.brake = speed > 0.5 ? 1 : 0;
      c.handbrake = 1;
      return c;
    }
    c.throttle = speed < allowed - 0.5 ? 1 : 0;
    c.brake = speed > allowed + 1.5 ? 1 : 0;
    c.handbrake = 0;
    return c;
  }
}
