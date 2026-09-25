/**
 * The garage is a showroom (docs/M8.9_PLAN.md R10): the door shut, the camera leaves the back corner for a view of the
 * car in the room's middle, three-quarters from the front, turning on a turntable (drawn only: the car in the game
 * does not move), framed in the left part of the screen; the wall takes the right. Pure: the director and the
 * player's car read these.
 */

export const SHOWROOM = {
  /** The camera's move from the back corner, and the car's glide to the room's middle (s). */
  seconds: 0.6,
  /** The turntable (degrees a second). */
  turnDegPerS: 8,
  /** The car's share of the frame from its left edge: the wall has the rest (45 % and its margin). */
  leftShare: 0.52,
  /** The eye's bearing from the room's axis toward the door, to the right of the way in (rad). */
  bearing: 0.55,
  /** How much of the band the turning car's footprint fills; the eye comes no nearer than `near` m nor further than `far`. */
  fill: 0.85,
  near: 5,
  far: 10.5,
  /** The car's front is turned this far from the eye to start with: three-quarters (rad). */
  threeQuarter: 0.6,
} as const;

export interface Vec3 { x: number; y: number; z: number }

export interface ShowroomShot {
  eye: Vec3;
  look: Vec3;
  /** The car's yaw on the turntable at its start (the game's convention: 0 faces +z). */
  carYaw: number;
}

export function newShot(): ShowroomShot {
  return { eye: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, carYaw: 0 };
}

/** A garage: its middle on the floor and its yaw (the way in along +yaw, from the door to the back wall). */
export interface ShowroomSite { x: number; y: number; z: number; yaw: number }

/**
 * The showroom's view of a car whose footprint reaches `radius` m from its middle and stands `height` m tall, in the
 * garage `site`, for a frame `aspect` wide over tall and a vertical `fovY` (rad): the eye far enough that the turning
 * car's footprint fits the left band, three-quarters from the front, looking past the car to the right so the car
 * stands in the band's middle. Writes `out`; no allocation.
 */
export function showroomShot(site: ShowroomSite, radius: number, height: number, aspect: number, fovY: number, out: ShowroomShot): ShowroomShot {
  const s = SHOWROOM;
  const half = Math.tan(fovY / 2) * aspect;
  // the band in angles off the view's axis (negative to the left): the frame's left edge to the band's right edge
  const left = Math.atan(-half), right = Math.atan((2 * s.leftShare - 1) * half);
  const centre = (left + right) / 2;
  const reach = ((right - left) / 2) * s.fill;
  const distance = Math.min(s.far, Math.max(s.near, radius / Math.sin(reach)));
  // the room's axes: along toward the back wall, across to the right of the way in
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  const rx = -fz, rz = fx;
  const along = -Math.cos(s.bearing) * distance, across = Math.sin(s.bearing) * distance;
  const eyeY = site.y + Math.min(3.4, Math.max(1.5, height * 0.95));
  out.eye.x = site.x + fx * along + rx * across;
  out.eye.y = eyeY;
  out.eye.z = site.z + fz * along + rz * across;
  // the view's axis: from the eye toward the car, turned right by the band's centre so the car stands left of it
  let dx = site.x - out.eye.x, dz = site.z - out.eye.z;
  const n = Math.hypot(dx, dz);
  dx /= n;
  dz /= n;
  const turn = -centre;
  // right of a heading (dx, dz) seen from above with y up: (-dz, dx)
  const ax = Math.cos(turn) * dx + Math.sin(turn) * -dz, az = Math.cos(turn) * dz + Math.sin(turn) * dx;
  out.look.x = out.eye.x + ax * distance;
  out.look.y = site.y + height * 0.45;
  out.look.z = out.eye.z + az * distance;
  // the car's front toward the eye, turned three-quarters
  out.carYaw = Math.atan2(out.eye.x - site.x, out.eye.z - site.z) + s.threeQuarter;
  return out;
}

/** The share of the way from the back corner to the showroom `t` s after the door shut: 0 → 1 over `seconds`, eased. */
export function showroomMix(t: number): number {
  const u = Math.max(0, Math.min(1, t / SHOWROOM.seconds));
  return u * u * (3 - 2 * u);
}

/** The turntable's yaw `t` s after the door shut. */
export function turntableYaw(start: number, t: number): number {
  return start + ((SHOWROOM.turnDegPerS * Math.PI) / 180) * Math.max(0, t);
}
