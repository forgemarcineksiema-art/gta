/**
 * The shots of the moments the player has no control (docs/M8.9_PLAN.md R14): BUSTED's crane back from the car and the
 * units round it, and the circle round a wreck. Each starts where the chase camera stood and looked, so it is a move,
 * not a cut. Pure: the director cuts to what these return and keeps their eyes on a clear line to the car.
 */

export interface Vec3 { x: number; y: number; z: number }

export interface StillShot {
  eye: Vec3;
  look: Vec3;
}

export function newStillShot(): StillShot {
  return { eye: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
}

export const CRANE = {
  /** The rise and the draw-back, eased (s). */
  seconds: 3,
  /** The eye at the end: this high over the car and this far back from it along the chase's line (m). */
  up: 5,
  back: 18,
  /**
   * Where the car stands on the screen at the end, up the frame from its middle (-1 its bottom): under the busted card,
   * which takes the frame's middle (first framed over the middle, the car and the units were behind it).
   */
  carAt: -0.5,
} as const;

export const CIRCLE = {
  /** The respawn's wait (s). */
  seconds: 3,
  /** The eye's distance from the wreck and its height over it at the end (m). */
  radius: 8,
  up: 3,
  /** The turn round the wreck over `seconds`, eased (rad): a fifth of a turn stays under 40°/s at its fastest. */
  turn: (72 * Math.PI) / 180,
} as const;

/**
 * The crane `t` s after the card came up, from the chase's eye `fromEye` and look `fromLook`, back from a car at `car`
 * for a vertical field of view `fovY` (rad): the eye rises and draws back along the line from the car to where the chase
 * stood, the view tilted up from the car so the car and the units round it stand in the frame's lower part.
 */
export function craneShot(fromEye: Vec3, fromLook: Vec3, car: Vec3, t: number, fovY: number, out: StillShot): StillShot {
  let dx = fromEye.x - car.x, dz = fromEye.z - car.z;
  const n = Math.hypot(dx, dz) || 1;
  dx /= n;
  dz /= n;
  const m = smoother(t / CRANE.seconds);
  const ex = car.x + dx * CRANE.back, ey = car.y + CRANE.up, ez = car.z + dz * CRANE.back;
  mix(out.eye, fromEye, ex, ey, ez, m);
  // the view's pitch at the end: the line down to the car raised by the angle that puts the car at `carAt`
  const pitch = -Math.atan2(CRANE.up, CRANE.back) + Math.atan(-CRANE.carAt * Math.tan(fovY / 2));
  const lx = ex - dx * Math.cos(pitch) * CRANE.back, ly = ey + Math.sin(pitch) * CRANE.back, lz = ez - dz * Math.cos(pitch) * CRANE.back;
  mix(out.look, fromLook, lx, ly, lz, m);
  return out;
}

/**
 * The circle `t` s into the wreck, from the chase's eye `fromEye` and look `fromLook`, round a wreck at `wreck`: the eye
 * turns round it from the chase's bearing to `CIRCLE.radius` out and `CIRCLE.up` over it, the look settles on it.
 */
export function circleShot(fromEye: Vec3, fromLook: Vec3, wreck: Vec3, t: number, out: StillShot): StillShot {
  const r0 = Math.hypot(fromEye.x - wreck.x, fromEye.z - wreck.z);
  const a0 = Math.atan2(fromEye.x - wreck.x, fromEye.z - wreck.z);
  const m = smooth(t / CIRCLE.seconds);
  const a = a0 + CIRCLE.turn * m;
  const r = r0 + (CIRCLE.radius - r0) * m;
  out.eye.x = wreck.x + Math.sin(a) * r;
  out.eye.y = fromEye.y + (wreck.y + CIRCLE.up - fromEye.y) * m;
  out.eye.z = wreck.z + Math.cos(a) * r;
  mix(out.look, fromLook, wreck.x, wreck.y + 0.8, wreck.z, m);
  return out;
}

function mix(out: Vec3, from: Vec3, x: number, y: number, z: number, m: number): void {
  out.x = from.x + (x - from.x) * m;
  out.y = from.y + (y - from.y) * m;
  out.z = from.z + (z - from.z) * m;
}

function smooth(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

function smoother(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * c * (c * (c * 6 - 15) + 10);
}
