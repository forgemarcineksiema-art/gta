/**
 * The camera's moments on top of the chase: the whip onto a swapped car, the door race seen from inside the garage,
 * and the takedown's slow motion (a cut to a low side view across the wreck, or a look at it from the chase).
 */
import type * as THREE from 'three';
import { GARAGE, SWAP, bodySpec, type BodyId, type SimWorld } from '../../sim';
import { sideCutEye, type ChaseCamera } from './ChaseCamera';

export class CameraDirector {
  /** The takedown whose side cut is on screen, -1 when none; the cut's eye, reused. */
  private sideCut = -1;
  private readonly cutEye = { x: 0, y: 0, z: 0 };

  constructor(private readonly chase: ChaseCamera, private readonly sim: SimWorld) {}

  /** Car-swap: whip the camera onto the new car, fitted to it. */
  onSwap(body: BodyId, roof: number): void {
    this.chase.whip(SWAP.whipSeconds);
    this.fit(body, roof);
  }

  /**
   * The chase fitted to the body: a bus needs it further back and higher to see past it; a small one (the bike, the
   * trolley: under 1.5 m half a length, M8.8 slice 15) brings it 3 m closer and 1.1 m lower for each metre short.
   */
  fit(body: BodyId, roof: number): void {
    const spec = bodySpec(body);
    const small = Math.max(0, 1.5 - spec.halfLength);
    this.chase.fit(Math.max(0, spec.halfLength - 2.7) * 1.1 - small * 3, Math.max(0, roof - 2.3) * 0.9 - small * 1.1);
  }

  /**
   * The door race and the shut door are seen from inside the garage: a held cut
   * from the back corner, past the car and out through the opening, so the
   * cruisers are heard arriving and the door is seen coming down. Released the
   * moment the run is driving again (a bail-out, busted, the door opened).
   */
  syncDoor(): void {
    const run = this.sim.run;
    const site = run.dropOff >= 0 && (run.state === 'closing' || run.state === 'door') ? run.dropOffs[run.dropOff] : undefined;
    if (!site) {
      this.chase.releaseCut();
      return;
    }
    if (this.chase.cutting) return;
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    // 1.2 m off the back wall, 4.5 m to the right, looking at the middle of the opening
    const along = GARAGE.depth / 2 - 1.2, across = 4.5, doorAlong = -GARAGE.depth / 2;
    this.chase.cut(
      site.x + fx * along - fz * across, 3.2, site.z + fz * along + fx * across,
      site.x + fx * doorAlong, 1.4, site.z + fz * doorAlong,
    );
  }

  /**
   * The takedown camera while the slow motion runs: a cut to a low side view across the wreck (M5.5 slice 17)
   * when a side has a clear line to it, else a look at it from the chase; released as soon as it ends or is skipped.
   */
  syncFocus(car: THREE.Vector3, vel: THREE.Vector3): void {
    const life = this.sim.life.state;
    const traffic = this.sim.traffic;
    if (life.slowMo > 0 && life.slowMoTarget >= 0 && traffic) {
      const i = life.slowMoTarget;
      const wx = traffic.x[i] as number, wz = traffic.z[i] as number, wy = (traffic.y[i] as number) + 0.8;
      if (this.sideCut !== i && !this.chase.cutting && this.sim.run.state === 'running' && this.cutToSide(wx, wy, wz, car, vel)) this.sideCut = i;
      if (this.sideCut !== i) this.chase.focus(wx, 0.8, wz, 0.2);
    } else {
      if (this.chase.focusing) this.chase.release();
      if (this.sideCut >= 0) {
        this.sideCut = -1;
        this.chase.releaseCut();
      }
    }
  }

  /** The side cut: the eye on the travel's left or right with a clear line to the wreck, looking past it at the car. */
  private cutToSide(wx: number, wy: number, wz: number, car: THREE.Vector3, vel: THREE.Vector3): boolean {
    let dx = vel.x, dz = vel.z;
    if (Math.hypot(dx, dz) < 1) { dx = wx - car.x; dz = wz - car.z; }
    const n = Math.hypot(dx, dz);
    if (n < 1e-3) return false;
    dx /= n; dz /= n;
    for (const side of [1, -1]) {
      const eye = sideCutEye(this.cutEye, wx, wy, wz, dx, dz, side);
      if (this.sim.clearFraction(eye.x, eye.y, eye.z, wx, wy, wz) < 0.99) continue;
      this.chase.cut(eye.x, eye.y, eye.z, wx + (car.x - wx) * 0.35, wy, wz + (car.z - wz) * 0.35);
      return true;
    }
    return false;
  }
}
