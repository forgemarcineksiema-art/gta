/**
 * The player's car is always seen (M8.6 D9; DESIGN.md §18.2 rule 7): a car between the camera and the player's car, or
 * within `FADE.near` m of the camera, is drawn thinned through a screen door (a 4×4 ordered pattern discards its
 * pixels: no transparency, no sorting, no extra draw call) down to `FADE.floor` over `FADE.seconds`, and back when
 * clear. At the floor the 4×4 pattern is a one-pixel checker, which reads as half transparent (M8.9 R12: the coarse
 * halftone only while it fades). The camera pulls in for walls and roofs (ChaseCamera's occlusion rule); a car in the
 * way is thinned instead, so the camera stays where the player put it. Pure: the view writes what these return into
 * its instances.
 */

/** The 4×4 ordered (Bayer) pattern's ranks, row by row: a fragment is drawn while the fade is above its (rank + 0.5) / 16. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Whether the screen door draws the pixel at (x, y) at `fade` (the shader's rule, for the pins). */
export function doorDraws(fade: number, x: number, y: number): boolean {
  if (fade >= 0.999) return true;
  return fade > ((BAYER4[(x % 4) + (y % 4) * 4] as number) + 0.5) / 16;
}

export const FADE = {
  /** What is left of a car in the way (the pattern's share drawn): a half, the one-pixel checker. */
  floor: 0.5,
  /** From whole to thinned, and back (s). */
  seconds: 0.15,
  /** A car this close to the camera is thinned wherever it stands (m). */
  near: 2.5,
  /** The box grown by this before the camera's line is tested against it (m). */
  grow: 0.4,
} as const;

/**
 * True when the segment a→b meets a car's box: the box stands on the car's origin (x, y, z), under its middle on the
 * road, turned by the rotation (qx, qy, qz, qw), `hw` half wide, `hh` half high, `hl` half long, grown by `grow`.
 */
export function blocks(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number,
  hw: number, hh: number, hl: number, grow: number,
): boolean {
  // both ends in the car's frame: rotated by the inverse of q (v' = v + w·t + u × t, t = 2 u × v, u = -q.xyz)
  const a0 = toLocal(ax - x, ay - y, az - z, -qx, -qy, -qz, qw, 0);
  const a1 = toLocal(ax - x, ay - y, az - z, -qx, -qy, -qz, qw, 1);
  const a2 = toLocal(ax - x, ay - y, az - z, -qx, -qy, -qz, qw, 2);
  const b0 = toLocal(bx - x, by - y, bz - z, -qx, -qy, -qz, qw, 0);
  const b1 = toLocal(bx - x, by - y, bz - z, -qx, -qy, -qz, qw, 1);
  const b2 = toLocal(bx - x, by - y, bz - z, -qx, -qy, -qz, qw, 2);
  let lo = 0, hi = 1;
  for (let k = 0; k < 3; k++) {
    const p = k === 0 ? a0 : k === 1 ? a1 : a2;
    const d = (k === 0 ? b0 : k === 1 ? b1 : b2) - p;
    const min = k === 0 ? -hw - grow : k === 1 ? -grow : -hl - grow;
    const max = k === 0 ? hw + grow : k === 1 ? 2 * hh + grow : hl + grow;
    if (Math.abs(d) < 1e-9) {
      if (p < min || p > max) return false;
      continue;
    }
    let t0 = (min - p) / d, t1 = (max - p) / d;
    if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}

/** One component (0 x, 1 y, 2 z) of the vector (vx, vy, vz) rotated by the unit quaternion (ux, uy, uz, w). */
function toLocal(vx: number, vy: number, vz: number, ux: number, uy: number, uz: number, w: number, k: 0 | 1 | 2): number {
  const tx = 2 * (uy * vz - uz * vy), ty = 2 * (uz * vx - ux * vz), tz = 2 * (ux * vy - uy * vx);
  if (k === 0) return vx + w * tx + (uy * tz - uz * ty);
  if (k === 1) return vy + w * ty + (uz * tx - ux * tz);
  return vz + w * tz + (ux * ty - uy * tx);
}

/** The fade a car heads for: thinned when it stands in the camera's way or at the camera, whole otherwise. */
export function fadeTarget(inWay: boolean, fromCamera: number): number {
  return inWay || fromCamera < FADE.near ? FADE.floor : 1;
}

/** A fade moved toward its target at the whole range per `FADE.seconds`. */
export function stepFade(fade: number, target: number, dt: number): number {
  const rate = (1 - FADE.floor) / FADE.seconds * dt;
  return fade < target ? Math.min(target, fade + rate) : Math.max(target, fade - rate);
}
