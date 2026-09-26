/**
 * A turned rectangle the island keeps clear (M8.10 slice 15): a jump's run-up and landing, a billboard's run-out, a
 * breaker and where it falls. The lots, the props and the kerbside bays keep off them.
 */

/** Its middle, the way its length runs (a heading: +Z turned toward +X), its half width across and half length along (m). */
export interface Keep { x: number; z: number; yaw: number; hx: number; hz: number }

/** Whether (x, z) is within `margin` m of a kept rectangle. */
export function inKeep(k: Keep, x: number, z: number, margin = 0): boolean {
  const dx = x - k.x, dz = z - k.z, c = Math.cos(k.yaw), s = Math.sin(k.yaw);
  return Math.abs(dx * c - dz * s) < k.hx + margin && Math.abs(dx * s + dz * c) < k.hz + margin;
}
