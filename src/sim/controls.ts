/**
 * Abstract vehicle controls consumed by the sim each fixed step.
 * Filled by `app/` from the input layer (or by a bot / a test script).
 * Values are already device-agnostic: analog in [-1, 1] / [0, 1].
 */
export interface VehicleControls {
  /** 0..1 */
  throttle: number;
  /** 0..1 (foot brake / reverse when stopped) */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** 0 | 1 */
  handbrake: number;
  /** 0 | 1 */
  boost: number;
  /** Edge-triggered: consumed by the sim on the step it is seen. */
  reset: boolean;
}

export function createControls(): VehicleControls {
  return { throttle: 0, brake: 0, steer: 0, handbrake: 0, boost: 0, reset: false };
}

export function clearControls(c: VehicleControls): void {
  c.throttle = 0;
  c.brake = 0;
  c.steer = 0;
  c.handbrake = 0;
  c.boost = 0;
  c.reset = false;
}
