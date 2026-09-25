/**
 * The camera's moments on top of the chase: the whip onto a swapped car, the door race seen from inside the garage,
 * the showroom behind the shut door (docs/M8.9_PLAN.md R10, `showroom.ts`), and the takedown's slow motion (a cut to
 * a low side view across the wreck, or a look at it from the chase).
 */
import type * as THREE from 'three';
import { GARAGE, SWAP, bodySpec, type BodyId, type SimWorld } from '../../sim';
import { sideCutEye, type ChaseCamera } from './ChaseCamera';
import { newShot, showroomMix, showroomShot, type ShowroomShot, type ShowroomSite } from './showroom';

export class CameraDirector {
  /** The takedown whose side cut is on screen, -1 when none; the cut's eye, reused. */
  private sideCut = -1;
  private readonly cutEye = { x: 0, y: 0, z: 0 };
  /** Seconds since the door shut (-1 while it is open), the showroom's shot, its garage, and the back corner's cut. */
  private shutFor = -1;
  readonly shot: ShowroomShot = newShot();
  readonly site: ShowroomSite = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly corner = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 };

  constructor(private readonly chase: ChaseCamera, private readonly sim: SimWorld) {}

  /** Car-swap: whip the camera onto the new car; a bus needs it further back and higher to see past it. */
  onSwap(body: BodyId, roof: number): void {
    this.chase.whip(SWAP.whipSeconds);
    const spec = bodySpec(body);
    this.chase.fit(Math.max(0, spec.halfLength - 2.7) * 1.1, Math.max(0, roof - 2.3) * 0.9);
  }

  /** Seconds since the door shut, -1 while it is open: the car's glide to the turntable and its turn read it. */
  get shut(): number {
    return this.shutFor;
  }

  /**
   * The door race is seen from inside the garage: a held cut from the back corner, past the car and out through the
   * opening, so the cruisers are heard arriving and the door is seen coming down. The door shut, the camera leaves the
   * corner over `SHOWROOM.seconds` for the showroom's view of the car (M8.9 R10): `aspect` and `fovY` the frame's,
   * `radius` and `height` the car's. Released the moment the run is driving again (a bail-out, busted, the door opened).
   */
  syncDoor(dt: number, aspect: number, fovY: number, radius: number, height: number): void {
    const run = this.sim.run;
    const site = run.dropOff >= 0 && (run.state === 'closing' || run.state === 'door') ? run.dropOffs[run.dropOff] : undefined;
    if (!site) {
      this.shutFor = -1;
      this.chase.releaseCut();
      return;
    }
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    // 1.2 m off the back wall, 4.5 m to the right, looking at the middle of the opening
    const along = GARAGE.depth / 2 - 1.2, across = 4.5, doorAlong = -GARAGE.depth / 2;
    const c = this.corner;
    c.x = site.x + fx * along - fz * across; c.y = 3.2; c.z = site.z + fz * along + fx * across;
    c.lx = site.x + fx * doorAlong; c.ly = 1.4; c.lz = site.z + fz * doorAlong;
    if (run.state !== 'door') {
      this.shutFor = -1;
      this.chase.cut(c.x, c.y, c.z, c.lx, c.ly, c.lz);
      return;
    }
    // the door shut: from the corner to the showroom
    this.shutFor = this.shutFor < 0 ? 0 : this.shutFor + dt;
    this.site.x = site.x;
    this.site.y = GARAGE.floorTop;
    this.site.z = site.z;
    this.site.yaw = site.yaw;
    const s = showroomShot(this.site, radius, height, aspect, fovY, this.shot);
    const m = showroomMix(this.shutFor);
    this.chase.cut(
      c.x + (s.eye.x - c.x) * m, c.y + (s.eye.y - c.y) * m, c.z + (s.eye.z - c.z) * m,
      c.lx + (s.look.x - c.lx) * m, c.ly + (s.look.y - c.ly) * m, c.lz + (s.look.z - c.lz) * m,
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
