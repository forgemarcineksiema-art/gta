/** Small allocation-free vector helpers over plain {x,y,z} / {x,y,z,w} objects. */
import type { Quat, Vec3 } from './scene';

export type { Quat, Vec3 };

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function set(o: Vec3, x: number, y: number, z: number): Vec3 {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}

export function copy(o: Vec3, a: Vec3): Vec3 {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
}

export function add(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  o.x = a.x + b.x;
  o.y = a.y + b.y;
  o.z = a.z + b.z;
  return o;
}

export function sub(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  o.x = a.x - b.x;
  o.y = a.y - b.y;
  o.z = a.z - b.z;
  return o;
}

export function scale(o: Vec3, a: Vec3, s: number): Vec3 {
  o.x = a.x * s;
  o.y = a.y * s;
  o.z = a.z * s;
  return o;
}

/** o = a + b * s */
export function addScaled(o: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  o.x = a.x + b.x * s;
  o.y = a.y + b.y * s;
  o.z = a.z + b.z * s;
  return o;
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normalize(o: Vec3, a: Vec3): Vec3 {
  const l = length(a);
  if (l > 1e-9) {
    o.x = a.x / l;
    o.y = a.y / l;
    o.z = a.z / l;
  } else {
    o.x = 0;
    o.y = 0;
    o.z = 0;
  }
  return o;
}

/** Rotate vector a by unit quaternion q into o. */
export function rotate(o: Vec3, q: Quat, a: Vec3): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const { x, y, z } = a;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  // v + w * t + cross(q.xyz, t)
  o.x = x + qw * tx + (qy * tz - qz * ty);
  o.y = y + qw * ty + (qz * tx - qx * tz);
  o.z = z + qw * tz + (qx * ty - qy * tx);
  return o;
}

export function quatMul(o: Quat, a: Quat, b: Quat): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  o.x = x;
  o.y = y;
  o.z = z;
  o.w = w;
  return o;
}

export function quatSetAxisAngle(o: Quat, ax: number, ay: number, az: number, angle: number): Quat {
  const h = angle * 0.5;
  const s = Math.sin(h);
  o.x = ax * s;
  o.y = ay * s;
  o.z = az * s;
  o.w = Math.cos(h);
  return o;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function moveToward(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function yawOf(q: Quat): number {
  // yaw of the +Z forward axis projected on XZ
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(fx, fz);
}

export const DEG = Math.PI / 180;

/** Heading from one ground point to another (0 = +Z, positive toward +X): the arrow's bearing. */
export function bearing(x0: number, z0: number, x1: number, z1: number): number {
  return Math.atan2(x1 - x0, z1 - z0);
}
