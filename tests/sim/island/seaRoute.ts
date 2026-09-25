/**
 * The hovercraft flown along a route of points on the island's sea (M8.10 slice 12's pins): put on the water at the
 * first point facing the second, the nose where the push has to go (the velocity wanted less the velocity it has), the fan
 * on when the nose is round to it (the fleet's sea pins' autopilot), slowing onto the last point; then held a second.
 */
import { SEA, clearControls, type SimWorld } from '../../../src/sim';

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function flyTo(sim: SimWorld, route: ReadonlyArray<readonly [number, number]>, seconds: number, kmh = 90): { arrived: boolean; x: number; y: number; z: number } {
  const [x0, z0] = route[0] as readonly [number, number], [x1, z1] = route[1] as readonly [number, number];
  sim.island?.sync(x0, z0, true);
  sim.vehicle.teleport({ x: x0, y: SEA.level + 1, z: z0 }, Math.atan2(x1 - x0, z1 - z0));
  let k = 1;
  for (let i = 0; i < seconds * 60 && k < route.length; i++) {
    const c = sim.controls, point = route[k] as readonly [number, number];
    const p = sim.vehicle.body.translation(), r = sim.vehicle.body.rotation(), tm = sim.vehicle.telemetry;
    const dx = point[0] - p.x, dz = point[1] - p.z, d = Math.hypot(dx, dz);
    clearControls(c);
    if (d < 10) { k++; sim.step(); continue; }
    const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
    const want = (kmh / 3.6) * (k === route.length - 1 ? Math.min(1, d / 30) : 1);
    const px = (dx / d) * want - tm.vx, pz = (dz / d) * want - tm.vz;
    const err = wrap(Math.atan2(px, pz) - yaw);
    c.steer = Math.max(-1, Math.min(1, -2 * err));
    c.handbrake = Math.abs(err) > 1.5 ? 1 : 0;
    c.throttle = Math.cos(err) > 0.7 ? Math.min(1, Math.hypot(px, pz) / 3) : 0;
    sim.step();
  }
  for (let i = 0; i < 60; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
  const p = sim.vehicle.body.translation();
  return { arrived: k === route.length, x: p.x, y: p.y, z: p.z };
}
