/**
 * Records every fixed step: the controls that went in, the car's pose and the
 * telemetry that came out. Because the sim is deterministic, the control stream
 * alone reproduces a run; the pose stream drives the ghost car without
 * re-simulating; the telemetry stream feeds the graphs. Typed arrays that grow
 * by doubling, so recording costs nothing per frame after warm-up.
 */
import type { VehicleControls } from './controls';
import type { VehicleTelemetry } from './vehicle/Vehicle';

export const CONTROL_STRIDE = 6; // throttle, brake, steer, handbrake, boost, reset
export const POSE_STRIDE = 7; // x, y, z, qx, qy, qz, qw
export const TELEMETRY_STRIDE = 10; // speedKmh, driftAngleDeg, maxSlipDeg, gLong, gLat, steerDeg, throttle, brake, gear, rpm

export interface RecordingJSON {
  version: 1;
  car: string;
  spawn: string;
  ticks: number;
  controls: number[];
  poses: number[];
  telemetry: number[];
  lapStarts: number[];
}

export class Recorder {
  ticks = 0;
  controls = new Float32Array(CONTROL_STRIDE * 4096);
  poses = new Float32Array(POSE_STRIDE * 4096);
  telemetry = new Float32Array(TELEMETRY_STRIDE * 4096);
  /** Ticks at which laps started (for slicing a lap out of the stream). */
  readonly lapStarts: number[] = [];

  private grow(): void {
    const cap = this.controls.length / CONTROL_STRIDE;
    if (this.ticks < cap) return;
    const next = cap * 2;
    const c = new Float32Array(CONTROL_STRIDE * next);
    c.set(this.controls);
    this.controls = c;
    const p = new Float32Array(POSE_STRIDE * next);
    p.set(this.poses);
    this.poses = p;
    const t = new Float32Array(TELEMETRY_STRIDE * next);
    t.set(this.telemetry);
    this.telemetry = t;
  }

  /** Call once per step, after the sim stepped, with the controls that were applied. */
  record(c: VehicleControls, reset: boolean, pose: Float32Array, poseOffset: number, rot: Float32Array, rotOffset: number, tm: VehicleTelemetry): void {
    this.grow();
    const i = this.ticks;
    const co = i * CONTROL_STRIDE;
    this.controls[co] = c.throttle;
    this.controls[co + 1] = c.brake;
    this.controls[co + 2] = c.steer;
    this.controls[co + 3] = c.handbrake;
    this.controls[co + 4] = c.boost;
    this.controls[co + 5] = reset ? 1 : 0;
    const po = i * POSE_STRIDE;
    this.poses[po] = pose[poseOffset] as number;
    this.poses[po + 1] = pose[poseOffset + 1] as number;
    this.poses[po + 2] = pose[poseOffset + 2] as number;
    this.poses[po + 3] = rot[rotOffset] as number;
    this.poses[po + 4] = rot[rotOffset + 1] as number;
    this.poses[po + 5] = rot[rotOffset + 2] as number;
    this.poses[po + 6] = rot[rotOffset + 3] as number;
    const to = i * TELEMETRY_STRIDE;
    this.telemetry[to] = tm.speedKmh;
    this.telemetry[to + 1] = tm.driftAngleDeg;
    this.telemetry[to + 2] = tm.maxSlipDeg;
    this.telemetry[to + 3] = tm.gLong;
    this.telemetry[to + 4] = tm.gLat;
    this.telemetry[to + 5] = tm.steerDeg;
    this.telemetry[to + 6] = tm.throttle;
    this.telemetry[to + 7] = tm.brake;
    this.telemetry[to + 8] = tm.gear;
    this.telemetry[to + 9] = tm.rpm;
    this.ticks++;
  }

  /** Controls of a tick, written into `out`. */
  controlsAt(tick: number, out: VehicleControls): void {
    const co = tick * CONTROL_STRIDE;
    out.throttle = this.controls[co] as number;
    out.brake = this.controls[co + 1] as number;
    out.steer = this.controls[co + 2] as number;
    out.handbrake = this.controls[co + 3] as number;
    out.boost = this.controls[co + 4] as number;
    out.reset = (this.controls[co + 5] as number) > 0.5;
  }

  /** A copy of the pose stream between two ticks (for a ghost lap). */
  slicePoses(from: number, to: number): Float32Array {
    return this.poses.slice(from * POSE_STRIDE, Math.min(to, this.ticks) * POSE_STRIDE);
  }

  toJSON(car: string, spawn: string): RecordingJSON {
    const round = (arr: Float32Array, n: number, digits: number) => Array.from(arr.subarray(0, n), (v) => Number(v.toFixed(digits)));
    return {
      version: 1,
      car,
      spawn,
      ticks: this.ticks,
      controls: round(this.controls, this.ticks * CONTROL_STRIDE, 3),
      poses: round(this.poses, this.ticks * POSE_STRIDE, 4),
      telemetry: round(this.telemetry, this.ticks * TELEMETRY_STRIDE, 2),
      lapStarts: [...this.lapStarts],
    };
  }

  static fromJSON(j: RecordingJSON): Recorder {
    const r = new Recorder();
    r.ticks = j.ticks;
    r.controls = Float32Array.from(j.controls);
    r.poses = Float32Array.from(j.poses);
    r.telemetry = Float32Array.from(j.telemetry);
    r.lapStarts.push(...j.lapStarts);
    return r;
  }
}
