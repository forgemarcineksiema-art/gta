/**
 * The camera's moments on top of the chase: the whip onto a swapped car, the door race seen from inside the garage,
 * the showroom behind the shut door (docs/M8.9_PLAN.md R10, `showroom.ts`), the takedown's slow motion (a cut to
 * a low side view across the wreck, or a look at it from the chase), the mega-ramp's apex, and the moments without
 * control: BUSTED's crane and the circle round a wreck (R14, `shots.ts`). The chase holds one cut at a time; each shot
 * releases only the cut it made (the door's sync released any, every frame: the takedown's side cut never showed).
 */
import type * as THREE from 'three';
import { GARAGE, SWAP, bodySpec, type BodyId, type SimWorld } from '../../sim';
import { sideCutEye, type ChaseCamera } from './ChaseCamera';
import { newShot, showroomMix, showroomShot, type ShowroomShot, type ShowroomSite } from './showroom';
import { circleShot, craneShot, newStillShot, openingShot, openingWeight } from './shots';

/** Who holds the chase's cut: the door and the showroom, the moments without control, the takedown, the apex. */
type CutOwner = 'door' | 'still' | 'side' | 'apex';
/** A shot may take the cut from one ranked under it, never from one over it. */
const RANK: Record<CutOwner, number> = { door: 3, still: 2, side: 1, apex: 1 };

/** The two sides of the travel a side shot looks from, the left first. */
const SIDES = [1, -1] as const;

/**
 * A side shot's eye (`SIDE_CUT`) for a subject at (x, y, z) travelling (dx, dz), unit: on the travel's left, else on its
 * right, whichever `clear` finds a clear line from to the subject; null when neither (M8.9 R14, the mega-ramp's apex).
 */
export function sideShot(
  out: { x: number; y: number; z: number }, x: number, y: number, z: number, dx: number, dz: number,
  clear: (ex: number, ey: number, ez: number) => boolean,
): { x: number; y: number; z: number } | null {
  for (const side of SIDES) {
    sideCutEye(out, x, y, z, dx, dz, side);
    if (clear(out.x, out.y, out.z)) return out;
  }
  return null;
}

export class CameraDirector {
  /** The takedown whose side cut is on screen, -1 when none; the cut's eye, reused. */
  private sideCut = -1;
  private readonly cutEye = { x: 0, y: 0, z: 0 };
  /** The mega-ramp's apex shot on the screen, and its eye (M8.9 R14). */
  private apexOn = false;
  private readonly apexEye = { x: 0, y: 0, z: 0 };
  /** Seconds since the door shut (-1 while it is open), the showroom's shot, its garage, and the back corner's cut. */
  private shutFor = -1;
  readonly shot: ShowroomShot = newShot();
  readonly site: ShowroomSite = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly corner = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 };
  /** The shot holding the chase's cut, null when the chase is free. */
  private owner: CutOwner | null = null;
  /** The moment without control on the screen, its clock, and the chase's eye and look it began from (M8.9 R14). */
  private still: 'crane' | 'circle' | null = null;
  private stillFor = 0;
  private readonly stillEye = { x: 0, y: 0, z: 0 };
  private readonly stillLook = { x: 0, y: 0, z: 0 };
  private readonly stillShot = newStillShot();
  /** The first second (M8.9 R14): seconds into it (-1: over or never), the first input's time in it, its shot. */
  private openFor = -1;
  private openInputAt = -1;
  private readonly openShot = newStillShot();

  constructor(private readonly chase: ChaseCamera, private readonly sim: SimWorld) {}

  /** The chase's cut for `owner`, unless a shot ranked over it holds the cut. */
  private hold(owner: CutOwner, x: number, y: number, z: number, lx: number, ly: number, lz: number): boolean {
    if (this.owner !== null && this.owner !== owner && RANK[this.owner] > RANK[owner]) return false;
    this.owner = owner;
    this.chase.cut(x, y, z, lx, ly, lz);
    return true;
  }

  /** `owner`'s cut given back to the chase; another's is left alone. */
  private drop(owner: CutOwner): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.chase.releaseCut();
  }

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
      this.drop('door');
      return;
    }
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    // 1.2 m off the back wall, 4.5 m to the right, looking at the middle of the opening; over its floor (the island's
    // garages stand on their streets, the hideout 42 m up the hill: M8.10)
    const along = GARAGE.depth / 2 - 1.2, across = 4.5, doorAlong = -GARAGE.depth / 2;
    const c = this.corner;
    c.x = site.x + fx * along - fz * across; c.y = site.y + 3.2; c.z = site.z + fz * along + fx * across;
    c.lx = site.x + fx * doorAlong; c.ly = site.y + 1.4; c.lz = site.z + fz * doorAlong;
    if (run.state !== 'door') {
      this.shutFor = -1;
      this.hold('door', c.x, c.y, c.z, c.lx, c.ly, c.lz);
      return;
    }
    // the door shut: from the corner to the showroom
    this.shutFor = this.shutFor < 0 ? 0 : this.shutFor + dt;
    this.site.x = site.x;
    this.site.y = site.y + GARAGE.floorTop;
    this.site.z = site.z;
    this.site.yaw = site.yaw;
    const s = showroomShot(this.site, radius, height, aspect, fovY, this.shot);
    const m = showroomMix(this.shutFor);
    this.hold(
      'door',
      c.x + (s.eye.x - c.x) * m, c.y + (s.eye.y - c.y) * m, c.z + (s.eye.z - c.z) * m,
      c.lx + (s.look.x - c.lx) * m, c.ly + (s.look.y - c.ly) * m, c.lz + (s.look.z - c.lz) * m,
    );
  }

  /** The game opens on the first second's shot (a real session's first frame; the tests' and the bots' do not). */
  open(): void {
    this.openFor = 0;
    this.openInputAt = -1;
  }

  /**
   * The first second (M8.9 R14): the island from high over and behind the car, handed down to the chase over
   * `OPENING.seconds`, the rest over `OPENING.hurry` once the player first drives; the chase follows the car under it
   * all the while and control is the player's from the first frame. Before the chase's update.
   */
  syncOpening(dt: number, car: THREE.Vector3, dx: number, dz: number, input: boolean): void {
    if (this.openFor < 0) return;
    this.openFor += dt;
    if (input && this.openInputAt < 0) this.openInputAt = this.openFor;
    const w = openingWeight(this.openFor, this.openInputAt);
    if (w <= 1e-3) {
      this.openFor = -1;
      this.chase.mixIn(0, 0, 0, 0, 0, 0, 0);
      return;
    }
    const s = openingShot(car, dx, dz, this.openShot);
    this.chase.mixIn(s.eye.x, s.eye.y, s.eye.z, s.look.x, s.look.y, s.look.z, w);
  }

  /**
   * The moments without control (M8.9 R14): while the busted card is up, the crane back from the car and the units round
   * it (framed under the card); while
   * the car is a wreck, the circle round it. Each begins where the chase stood (`eye`, its look) and keeps its eye on a
   * clear line to the car (pulled in along it as the chase's boom is); the chase is back in the frame control is (the
   * card's key, the respawn). Before the chase's update.
   */
  syncStill(dt: number, eye: THREE.Vector3, car: THREE.Vector3): void {
    const run = this.sim.run, life = this.sim.life.state;
    const want = run.state === 'busted' ? 'crane' : life.wrecked && run.state === 'running' ? 'circle' : null;
    if (want !== this.still) {
      this.drop('still');
      this.still = want;
      this.stillFor = 0;
      const look = this.chase.looking;
      this.stillEye.x = eye.x; this.stillEye.y = eye.y; this.stillEye.z = eye.z;
      this.stillLook.x = look.x; this.stillLook.y = look.y; this.stillLook.z = look.z;
    }
    if (!this.still) return;
    this.stillFor += dt;
    const s = this.still === 'crane'
      ? craneShot(this.stillEye, this.stillLook, car, this.stillFor, (this.chase.tuning.fovBase * Math.PI) / 180, this.stillShot)
      : circleShot(this.stillEye, this.stillLook, car, this.stillFor, this.stillShot);
    const cy = car.y + 0.9;
    const clear = this.sim.viewFraction(car.x, cy, car.z, s.eye.x, s.eye.y, s.eye.z);
    if (clear < 1) {
      const k = Math.max(0.2, clear - 0.05);
      s.eye.x = car.x + (s.eye.x - car.x) * k;
      s.eye.y = cy + (s.eye.y - cy) * k;
      s.eye.z = car.z + (s.eye.z - car.z) * k;
    }
    this.hold('still', s.eye.x, s.eye.y, s.eye.z, s.look.x, s.look.y, s.look.z);
  }

  /**
   * The takedown camera while the slow motion runs: a cut to a low side view across the wreck (M5.5 slice 17)
   * when a side has a clear line to it, else a look at it from the chase; released as soon as it ends or is skipped.
   */
  syncFocus(car: THREE.Vector3, vel: THREE.Vector3, alpha = 1): void {
    const life = this.sim.life.state;
    const traffic = this.sim.traffic;
    if (life.slowMo > 0 && life.slowMoTarget >= 0 && traffic) {
      const i = life.slowMoTarget;
      // where the wreck is drawn (its transform between the last two steps): its record moves a step at a time, four
      // frames apart in the slow motion, and the eye on it jerked with it
      const tb = this.sim.transforms, p = (traffic.slot[i] as number) * 3;
      const wx = lerp(tb.prevPos[p] as number, tb.currPos[p] as number, alpha);
      const wy = lerp(tb.prevPos[p + 1] as number, tb.currPos[p + 1] as number, alpha) + 0.8;
      const wz = lerp(tb.prevPos[p + 2] as number, tb.currPos[p + 2] as number, alpha);
      if (this.sideCut !== i && this.owner === null && this.sim.run.state === 'running' && this.cutToSide(wx, wy, wz, car, vel)) this.sideCut = i;
      if (this.sideCut !== i) this.chase.focus(wx, wy, wz, 0.2);
    } else if (life.slowMo > 0 && this.megaFlight()) {
      this.apexShot(car, vel);
    } else {
      if (this.chase.focusing) this.chase.release();
      if (this.sideCut >= 0) {
        this.sideCut = -1;
        this.drop('side');
      }
      if (this.apexOn) {
        this.apexOn = false;
        this.drop('apex');
      }
    }
  }

  /** On the mega-ramp's flight: its slow motion is the apex's alone. */
  private megaFlight(): boolean {
    const jumps = this.sim.jumps;
    return jumps !== null && jumps.flying >= 0 && jumps.descs[jumps.flying]?.mega === true;
  }

  /**
   * The mega-ramp's apex (M8.9 R14): while its slow motion runs, the car seen from beside its travel as a takedown's
   * wreck is, the eye held and the look on the car; the chase back when the slow motion ends, the car still high up.
   */
  private apexShot(car: THREE.Vector3, vel: THREE.Vector3): void {
    if (!this.apexOn) {
      const n = Math.hypot(vel.x, vel.z);
      if (this.owner !== null || this.sim.run.state !== 'running' || n < 1) return;
      const sim = this.sim, cx = car.x, cy = car.y + 0.5, cz = car.z;
      if (!sideShot(this.apexEye, cx, car.y, cz, vel.x / n, vel.z / n, (x, y, z) => sim.clearFraction(x, y, z, cx, cy, cz) >= 0.99)) return;
      this.apexOn = true;
    }
    this.hold('apex', this.apexEye.x, this.apexEye.y, this.apexEye.z, car.x, car.y + 0.5, car.z);
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
      return this.hold('side', eye.x, eye.y, eye.z, wx + (car.x - wx) * 0.35, wy, wz + (car.z - wz) * 0.35);
    }
    return false;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
