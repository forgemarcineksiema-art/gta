/**
 * Third-person chase camera.
 *
 * The view's yaw is one number with one smoother (M8.9 R14): a critically damped
 * spring, its turn capped and eased, stepped finely enough to move alike at 30, 60
 * and 120 Hz. Its target is a blend of the car's nose and its travel (so a drifting
 * car stays centred while the view shows where it is going); the reverse view, the
 * nose turned half round, is the player's: the reverse gear after a moment of
 * backing up, ended by any forward gear at once; a slide tail first (a spin, a ram)
 * is followed along its travel and held when it stops, until the gas or the reverse
 * says which way. The camera sits behind and above along the view and looks along
 * it. In flight the camera's height lags the car so the jump reads. A hit, a
 * landing or a scrape jolts the view in the camera's own axes, by the physics (the
 * contact's normal and speed, the landing's speed), alike whichever way the car
 * goes. A small, bounded look-ahead follows actual angular motion. Steering input alone must never swivel the view: quick
 * corrections should not move the road under the player.
 */
import * as THREE from 'three';
import type { VehicleTelemetry } from '../../sim';

export interface CameraTuning {
  distance: number;
  distancePerSpeed: number;
  height: number;
  heightDropPerSpeed: number;
  lookAhead: number;
  lookAheadPerSpeed: number;
  lookHeight: number;
  /** Position follow stiffness (1/s). */
  followRate: number;
  /** The view's spring (rad/s; a steady turn lags by 2/omega s of it), and while drifting. */
  yawOmega: number;
  yawOmegaDrift: number;
  /** Caps on how fast the view can yaw (degrees per second) and on how fast that changes (degrees per second²). */
  maxYawRateDeg: number;
  maxYawAccelDeg: number;
  /** Share of the velocity direction in the heading (0 = nose, 1 = velocity), and while drifting. */
  velocityFollow: number;
  driftVelocityFollow: number;
  driftDistanceBonus: number;
  driftHeightDrop: number;
  fovBase: number;
  fovPerSpeed: number;
  fovBoost: number;
  fovDrift: number;
  fovMax: number;
  fovRate: number;
  /** How fast the camera height follows the car on the ground and in the air (1/s). */
  heightRateGround: number;
  heightRateAir: number;
  /**
   * The jolt (M8.9 R14): a spring in the camera's own axes (its natural frequency, rad/s, and damping ratio) kicked by
   * the physics: degrees a second of turn per m/s of a hit's speed change and of a landing's, and per unit of `kick()`;
   * the scrape's tremble at full scrape and the road's rumble per g of the chassis' vertical load off its mean, degrees.
   */
  joltOmega: number;
  joltDamping: number;
  joltHit: number;
  joltLanding: number;
  joltKick: number;
  joltScrape: number;
  joltRumble: number;
  /** The most of a hit's or a landing's speed the jolt takes, m/s (a mega-ramp's 22 m/s landing would throw 50 px). */
  joltCap: number;
  /**
   * Big air (M8.9 R14): the camera kept between these over the car in the air (m; a long fall's lag left it 12 m up at the
   * landing), and the share of the way the look leans toward where the car will come down on a long flight.
   */
  airMinOver: number;
  airMaxOver: number;
  airLean: number;
  /**
   * Seconds of backing up in the reverse gear, faster than `reverseSpeed` m/s, before the view turns round: a back-up
   * off a wall and a three-point turn are over before it.
   */
  reverseDelay: number;
  reverseSpeed: number;
  /** Extra camera height while looking back, m. */
  reverseHeight: number;
  /** A slide tail first starts over this speed (m/s); under `holdSpeed` the view holds until the player chooses. */
  slideSpeed: number;
  holdSpeed: number;
  /** Look-ahead: seconds of yaw rate added to the heading (not while drifting). */
  headingLead: number;
  /** Look-ahead: lateral look offset per rad/s of actual yaw rate, m. */
  lookSideYaw: number;
  lookSideMax: number;
  /** Look-ahead smoothing (1/s) and the speed at which it is fully active (m/s). */
  lookSideRate: number;
  lookSideSpeedRef: number;
}

export const DEFAULT_CAMERA: CameraTuning = {
  distance: 6.4,
  distancePerSpeed: 0.045,
  height: 2.4,
  heightDropPerSpeed: 0.008,
  lookAhead: 3.0,
  lookAheadPerSpeed: 0.1,
  lookHeight: 0.9,
  followRate: 8,
  yawOmega: 10,
  yawOmegaDrift: 7.6,
  maxYawRateDeg: 150,
  maxYawAccelDeg: 600,
  velocityFollow: 0.6,
  driftVelocityFollow: 0.9,
  driftDistanceBonus: 0.8,
  driftHeightDrop: 0.3,
  fovBase: 60,
  fovPerSpeed: 0.18,
  fovBoost: 5,
  fovDrift: 1.5,
  fovMax: 80,
  fovRate: 2.5,
  heightRateGround: 9,
  heightRateAir: 2.5,
  joltOmega: 38,
  joltDamping: 0.35,
  joltHit: 9,
  joltLanding: 12,
  joltKick: 300,
  joltScrape: 0.25,
  joltRumble: 0.4,
  joltCap: 6,
  airMinOver: 0.8,
  airMaxOver: 4,
  airLean: 0.35,
  reverseDelay: 1.2,
  reverseSpeed: 1,
  reverseHeight: 0.3,
  slideSpeed: 4,
  holdSpeed: 2.5,
  headingLead: 0.04,
  lookSideYaw: 0.4,
  lookSideMax: 0.65,
  lookSideRate: 3,
  lookSideSpeedRef: 14,
};

export type CameraMode = 'chase' | 'far';

const DEG = Math.PI / 180;
/** The car-swap's whip: the view's spring and its cap (degrees per second), no cap on the change. */
const WHIP = { omega: 20, rateDeg: 720 } as const;
/** The view's spring and the jolt's are stepped at least this often a second: the same motion at 30, 60 and 120 Hz. */
const YAW_STEPS = 240;
/** A slide tail first ends when the nose is back within this of the travel (it starts past a right angle). */
const FACING = 70 * DEG;
/** The landing's forecast: the fall sampled this often (s) this many times, the car's origin this high over its wheels (m). */
const LANDING = { step: 0.15, samples: 27, ride: 0.5 } as const;
/** The lean toward the landing fades in as the time to it grows from `from` to `to` seconds. */
const AIR_LEAN = { from: 0.3, to: 1 } as const;
/**
 * The road's slope the rig pitches with (M8.9 R14): this share of it (the whole of it put a low sun ahead of a downhill
 * behind the HUD's top line), at most this steep (rad), eased at this rate (1/s), read while the car goes over 3 m/s
 * along the view; the camera kept this far over the ground under it (m).
 */
const SLOPE = { share: 0.6, max: 20 * DEG, rate: 3, minAlong: 3 } as const;
const GROUND_ROOM = 1.5;
/** The occlusion rule's gap kept to the static that blocks, and the shortest boom it pulls to, m. */
const BOOM_MARGIN = 0.4;
const BOOM_MIN = 1.6;
/**
 * The room the camera keeps under a ceiling, m: the near plane's half height at the widest view (0.6 m × tan 40°) and a
 * hair. Pulled in along a shallow line the boom's margin left it 7 cm under a deck's slab, and at its own height under
 * a low one it sat 0.3 m under it: the view's top cut into the slab (the lighthouse road under the bay bridge's ramp).
 */
const CEILING_ROOM = 0.6;

function smooth01(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** The takedown's side cut (M5.5 slice 17): metres to the side of the wreck, behind it along the travel, above it. */
export const SIDE_CUT = { side: 9, back: 3, up: 1.2 } as const;

/**
 * The side cut's eye for a wreck at (wx, wy, wz) and the player's travel (dx, dz), unit: `side` +1 on the travel's
 * left, -1 on its right, `SIDE_CUT.back` m behind the wreck so the car driving on is in the frame beyond it.
 */
export function sideCutEye(out: { x: number; y: number; z: number }, wx: number, wy: number, wz: number, dx: number, dz: number, side: number): { x: number; y: number; z: number } {
  // left of the travel (dx, dz) is (dz, -dx): +X is left when facing +Z
  out.x = wx + dz * side * SIDE_CUT.side - dx * SIDE_CUT.back;
  out.y = wy + SIDE_CUT.up;
  out.z = wz - dx * side * SIDE_CUT.side - dz * SIDE_CUT.back;
  return out;
}

export class ChaseCamera {
  tuning: CameraTuning = { ...DEFAULT_CAMERA };
  mode: CameraMode = 'chase';
  private readonly camera: THREE.PerspectiveCamera;
  private whipLeft = 0;
  private fovPunch = 0;
  private focusLeft = 0;
  private focusAmount = 0;
  private readonly focusPoint = new THREE.Vector3();
  /** Metres added behind and above for a long or tall body (the bus), set on a swap. */
  private extraDistance = 0;
  private extraHeight = 0;
  /**
   * The occlusion rule (M5.5 slice 7): the share of the way from the car to the camera that is clear of
   * solid statics (the sim's `clearFraction`); null shows the camera where it is, as the tests' cameras do.
   */
  occluder: ((ax: number, ay: number, az: number, bx: number, by: number, bz: number) => number) | null = null;
  /** The room over a point up to a ceiling, at most `reach` (the world's query; null: none). */
  ceiling: ((x: number, y: number, z: number, reach: number) => number) | null = null;
  /** The height of the first surface a wheel would meet under a point (the world's query; null: none). */
  floor: ((x: number, y: number, z: number) => number) | null = null;
  /** The car's fall in the air, m/s² (the world's gravity and the car's own extra). */
  gravity = 9.81 + 3.5;
  /** A shot the chase takes over from (the first second, M8.9 R14): its eye and look, and its weight over the chase's. */
  private readonly mixEye = new THREE.Vector3();
  private readonly mixLook = new THREE.Vector3();
  private mixWeight = 0;
  /** The road's slope along the view (rad, + uphill), eased. */
  private slope = 0;
  /** How far the look leans toward the landing, and the landing it leans to. */
  private lean = 0;
  /** The look-ahead's share, a half in the air. */
  private airLook = 1;
  private readonly landing = new THREE.Vector3();
  /** How much of the boom is out: pulled in at once by a static between, let out again at the ground height's pace. */
  private boom = 1;
  private readonly shown = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** The view's yaw, radians (forward = (sin, 0, cos)), and how fast it turns (rad/s). */
  private yaw = 0;
  private turnRate = 0;
  /** Seconds backing up in the reverse gear; the reverse view on; a slide tail first followed; the view held after one. */
  private backFor = 0;
  private reversing = false;
  private sliding = false;
  private holding = false;
  /** The angle between the nose and the travel the last time the car moved (rad). */
  private lastSlip = 0;
  private carY = 0;
  /** Smoothed lateral look offset, metres to the car's left. */
  private lookSide = 0;
  private fov: number;
  /** The jolt's pitch, yaw and roll in the camera's own axes (rad) and their rates; its tremble's clock; the load's mean (g). */
  private joltPitch = 0;
  private joltYaw = 0;
  private joltRoll = 0;
  private joltPitchV = 0;
  private joltYawV = 0;
  private joltRollV = 0;
  private joltT = 0;
  private loadMean = 0;
  private initialised = false;
  /** A held hard cut (the garage interior at the door): position and look, until `releaseCut()`. */
  private cutActive = false;
  private snapNext = false;
  private readonly cutPos = new THREE.Vector3();
  private readonly cutLook = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.fov = this.tuning.fovBase;
    camera.fov = this.fov;
  }

  toggleMode(): void {
    this.mode = this.mode === 'chase' ? 'far' : 'chase';
  }

  /** Car-swap: for `seconds` the view swings to the new car at up to 720°/s and follows twice as fast, with a FOV punch. No cut. */
  /** An external jolt (a billboard through the windscreen, a tower coming down): the view nods, bounded. */
  kick(amount: number): void {
    this.joltPitchV -= Math.min(0.7, amount) * this.tuning.joltKick * DEG;
  }

  /** A longer or taller body than the classes (the bus): the camera sits this much further back and higher; a small one (the bike) closer and lower, negative. */
  fit(distance: number, height: number): void {
    this.extraDistance = distance;
    this.extraHeight = height;
  }

  whip(seconds: number): void {
    this.whipLeft = seconds;
    this.fovPunch = 10;
    // the new car is driven from here: whatever the last one was doing (backing up, a slide) is not its
    this.clearIntent();
  }

  /**
   * Where the car in the air comes down (`landing`) and in how many seconds, -1 past the forecast's reach or with no
   * floor query: its fall sampled every `LANDING.step` s against the floor under each sample, looked for from the last
   * sample's height; the crossing found between the two.
   */
  private forecastLanding(p: THREE.Vector3, v: THREE.Vector3): number {
    const floor = this.floor;
    if (!floor) return -1;
    const g = this.gravity;
    let px = p.x, py = p.y, pz = p.z;
    for (let i = 1; i <= LANDING.samples; i++) {
      const s = i * LANDING.step;
      const x = p.x + v.x * s, y = p.y + v.y * s - 0.5 * g * s * s, z = p.z + v.z * s;
      const f = floor(x, py, z) + LANDING.ride;
      if (y <= f) {
        const u = Math.max(0, Math.min(1, (py - f) / Math.max(1e-6, py - y)));
        this.landing.set(px + (x - px) * u, f - LANDING.ride, pz + (z - pz) * u);
        return (i - 1 + u) * LANDING.step;
      }
      px = x;
      py = y;
      pz = z;
    }
    return -1;
  }

  private clearJolt(): void {
    this.joltPitch = this.joltYaw = this.joltRoll = 0;
    this.joltPitchV = this.joltYawV = this.joltRollV = 0;
  }

  private clearIntent(): void {
    this.backFor = 0;
    this.reversing = false;
    this.sliding = false;
    this.holding = false;
  }

  /** Takedown camera: keep following the player but look at a point for `seconds`. Any later `release()` ends it early. */
  focus(x: number, y: number, z: number, seconds: number): void {
    this.focusPoint.set(x, y, z);
    this.focusLeft = seconds;
  }

  release(): void {
    this.focusLeft = 0;
  }

  get focusing(): boolean {
    return this.focusLeft > 0;
  }

  /** Hard cut to a fixed camera, held until `releaseCut()`; the chase snaps back behind the car after it. */
  cut(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void {
    this.cutActive = true;
    this.cutPos.set(x, y, z);
    this.cutLook.set(lookX, lookY, lookZ);
  }

  releaseCut(): void {
    if (!this.cutActive) return;
    this.cutActive = false;
    this.snapNext = true;
  }

  get cutting(): boolean {
    return this.cutActive;
  }

  /**
   * A shot laid over the chase at `weight` (1 the shot, 0 the chase), set each frame by the director while the chase takes
   * over from it: the chase follows the car underneath all the while, so there is nothing to catch up when it is gone.
   */
  mixIn(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number, weight: number): void {
    this.mixEye.set(x, y, z);
    this.mixLook.set(lookX, lookY, lookZ);
    this.mixWeight = Math.max(0, Math.min(1, weight));
  }

  /** Where the chase looked in its last update (a shot that starts from the chase starts from here). */
  get looking(): THREE.Vector3 {
    return this.look;
  }

  update(car: THREE.Object3D, carVel: THREE.Vector3, tm: VehicleTelemetry, dt: number, snap: boolean): void {
    if (this.cutActive) {
      this.camera.position.copy(this.cutPos);
      this.camera.up.copy(this.up);
      this.camera.lookAt(this.cutLook);
      if (Math.abs(this.camera.fov - this.tuning.fovBase) > 0.01) {
        this.camera.fov = this.tuning.fovBase;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    snap ||= !this.initialised || this.snapNext;
    this.snapNext = false;
    const t = this.tuning;
    const speed = Math.hypot(carVel.x, carVel.z);
    const modeMul = this.mode === 'far' ? 1.6 : 1;

    // the nose's yaw and the travel's on the ground plane, and the angle between them
    this.fwd.set(0, 0, 1).applyQuaternion(car.quaternion);
    const yawNose = Math.atan2(this.fwd.x, this.fwd.z);
    const yawTravel = Math.atan2(carVel.x, carVel.z);
    const slip = speed > 0.5 ? Math.abs(wrapAngle(yawTravel - yawNose)) : 0;
    if (snap) this.clearIntent();
    // the reverse view is the player's (M8.9 R14): the reverse gear with the car backing up for `reverseDelay`, not the
    // way the car happens to move; any forward gear (the gas) ends it at once
    if (tm.gear === -1 && tm.speed < -t.reverseSpeed) this.backFor += dt;
    else this.backFor = 0;
    if (tm.gear !== -1) this.reversing = false;
    else if (this.backFor > t.reverseDelay || this.holding) {
      this.reversing = true;
      this.holding = false;
    }
    // a slide tail first (the travel swung behind the nose at speed without the reverse gear: a spin, a ram) is followed
    // along its travel; slowed down, the view holds until the player says which way: the gas turns it behind the nose,
    // the reverse keeps it
    if (!this.reversing && tm.gear !== -1 && speed > t.slideSpeed && slip > Math.PI / 2 && this.lastSlip <= Math.PI / 2) this.sliding = true;
    if (speed > 0.5) this.lastSlip = slip;
    if (this.sliding && slip < FACING) this.sliding = false;
    if (this.sliding && speed < t.holdSpeed) {
      this.sliding = false;
      this.holding = true;
    }
    if (this.holding && (tm.throttle > 0 || (speed > t.holdSpeed && slip < FACING))) this.holding = false;

    let yawTarget = yawNose;
    if (this.reversing) {
      yawTarget = yawNose + Math.PI;
    } else if (this.sliding) {
      yawTarget = yawTravel;
    } else if (this.holding) {
      yawTarget = this.yaw;
    } else if (speed > 2.5 && carVel.dot(this.fwd) > -0.5) {
      const k = (tm.drifting ? t.driftVelocityFollow : t.velocityFollow) * Math.min(1, speed / 12);
      yawTarget = yawNose + wrapAngle(yawTravel - yawNose) * k;
    }
    // how far the view looks back at the car (0 behind it, 1 in front of it): the reverse view's height, and no lead
    const back = Math.max(0, -Math.cos(wrapAngle(this.yaw - yawNose)));
    // look-ahead: lead the view into the turn, and slide the look point to the inside (the chase only)
    const chasing = !this.reversing && !this.sliding && !this.holding;
    const lookActive = chasing ? Math.min(1, speed / t.lookSideSpeedRef) * (1 - back) : 0;
    if (!tm.drifting) yawTarget += tm.yawRate * t.headingLead * lookActive;
    const sideTarget = Math.max(-t.lookSideMax, Math.min(t.lookSideMax, tm.yawRate * t.lookSideYaw * lookActive));
    this.lookSide += (sideTarget - this.lookSide) * (snap ? 1 : 1 - Math.exp(-dt * t.lookSideRate));

    if (!this.initialised || snap) {
      this.yaw = wrapAngle(yawTarget);
      this.turnRate = 0;
      this.carY = car.position.y;
      this.lookSide = 0;
      this.initialised = true;
    } else {
      const whipping = this.whipLeft > 0;
      if (whipping) this.whipLeft = Math.max(0, this.whipLeft - dt);
      // one spring for every turn of the view: a corner's small errors as the old follow took them, a half turn eased in
      // and out at the cap, a swap's whip stiffer and faster
      const w = whipping ? WHIP.omega : tm.drifting ? t.yawOmegaDrift : t.yawOmega;
      const maxRate = (whipping ? WHIP.rateDeg : t.maxYawRateDeg) * DEG;
      const maxAcc = whipping ? Infinity : t.maxYawAccelDeg * DEG;
      const n = Math.max(1, Math.ceil(dt * YAW_STEPS)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const acc = Math.max(-maxAcc, Math.min(maxAcc, w * w * wrapAngle(yawTarget - this.yaw) - 2 * w * this.turnRate));
        this.turnRate = Math.max(-maxRate, Math.min(maxRate, this.turnRate + acc * h));
        this.yaw = wrapAngle(this.yaw + this.turnRate * h);
      }
    }
    this.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    // the road's slope along the view (M8.9 R14): the travel's rise over its run along the view on the ground, eased,
    // held in the air; the rig pitches with it, the camera over the road behind and the look down (or up) the road ahead
    const along = carVel.x * this.dir.x + carVel.z * this.dir.z;
    if (snap) this.slope = 0;
    if (!tm.airborne && Math.abs(along) > SLOPE.minAlong) {
      const want = Math.max(-SLOPE.max, Math.min(SLOPE.max, Math.atan(carVel.y / along)));
      this.slope += (want - this.slope) * (snap ? 1 : 1 - Math.exp(-dt * SLOPE.rate));
    }
    const grade = Math.tan(this.slope) * SLOPE.share;

    // height follows the car with lag in the air so a jump reads as height
    const hRate = 1 - Math.exp(-dt * (tm.airborne ? t.heightRateAir : t.heightRateGround));
    this.carY += (car.position.y - this.carY) * (snap ? 1 : hRate);

    const dist = (t.distance + this.extraDistance + speed * t.distancePerSpeed + (tm.drifting ? t.driftDistanceBonus : 0)) * modeMul;
    const height = Math.max(1.4, t.height + this.extraHeight - speed * t.heightDropPerSpeed - (tm.drifting ? t.driftHeightDrop : 0) + t.reverseHeight * back) * modeMul;
    // in the air the lag reads the jump, within bounds: never more than `airMaxOver` over the car, never under
    // `airMinOver` (M8.9 R14)
    const airLow = car.position.y + t.airMinOver * modeMul, airHigh = car.position.y + t.airMaxOver * modeMul;
    if (tm.airborne) this.carY = Math.min(airHigh - height, Math.max(airLow - height, this.carY));
    this.target.set(car.position.x - this.dir.x * dist, this.carY + height - dist * grade, car.position.z - this.dir.z * dist);

    if (snap || !this.initialised) {
      this.pos.copy(this.target);
    } else {
      const k = 1 - Math.exp(-dt * t.followRate * (this.whipLeft > 0 ? 2 : 1));
      this.pos.lerp(this.target, k);
      this.pos.y = Math.max(this.pos.y, car.position.y + 0.6);
      if (tm.airborne) this.pos.y = Math.min(airHigh, Math.max(airLow, this.pos.y));
    }

    // the jolt (M8.9 R14): the camera a loosely held body, so a hit throws the car across the screen the way it goes in
    // the world, a landing or a push up lifts it, a frontal hit nods the view, and the view catches up: a spring in the
    // camera's own axes, alike whichever way the car is going
    if (snap) {
      this.clearJolt();
      this.loadMean = tm.gVert;
    } else {
      if (tm.impact > 0.5) {
        // the contact's normal points from the wall into the car: the way the car is thrown; the screen's right is
        // (-dir.z, 0, dir.x)
        const nx = tm.contactNx, nz = tm.contactNz;
        const side = -nx * this.dir.z + nz * this.dir.x;
        const toward = -(nx * this.dir.x + nz * this.dir.z);
        const kick = Math.min(tm.impact, t.joltCap) * t.joltHit * DEG;
        this.joltYawV += kick * side;
        this.joltRollV += kick * side * 0.3;
        this.joltPitchV -= kick * (Math.max(0, tm.contactNy) + 0.6 * Math.max(0, toward));
      }
      if (tm.landingImpact > 0) this.joltPitchV -= Math.min(tm.landingImpact, t.joltCap) * t.joltLanding * DEG;
      // the scrape's tremble and the road's rumble move the spring's rest
      this.joltT += dt;
      this.loadMean += (tm.gVert - this.loadMean) * (1 - Math.exp(-dt * 2));
      const tremble = tm.scrape * t.joltScrape * DEG;
      const restPitch = -(tm.gVert - this.loadMean) * t.joltRumble * DEG + tremble * Math.sin(this.joltT * 46);
      const restYaw = tremble * Math.sin(this.joltT * 70 + 1.3);
      const w = t.joltOmega, c = 2 * t.joltDamping * w;
      const n = Math.max(1, Math.ceil(dt * YAW_STEPS)), h = dt / n;
      for (let i = 0; i < n; i++) {
        this.joltPitchV += (w * w * (restPitch - this.joltPitch) - c * this.joltPitchV) * h;
        this.joltYawV += (w * w * (restYaw - this.joltYaw) - c * this.joltYawV) * h;
        this.joltRollV += (-w * w * this.joltRoll - c * this.joltRollV) * h;
        this.joltPitch += this.joltPitchV * h;
        this.joltYaw += this.joltYawV * h;
        this.joltRoll += this.joltRollV * h;
      }
    }

    // the occlusion rule: a wall, a roof or a building between the car and the camera pulls the camera in
    // along the boom at once; it lets out again at the height's ground pace when the way is clear
    this.shown.copy(this.pos);
    if (this.occluder) {
      const ox = car.position.x, oy = car.position.y + t.lookHeight, oz = car.position.z;
      const len = Math.hypot(this.pos.x - ox, this.pos.y - oy, this.pos.z - oz);
      const clear = this.occluder(ox, oy, oz, this.pos.x, this.pos.y, this.pos.z);
      const want = clear >= 1 || len < 1e-3 ? 1 : Math.max(Math.min(1, BOOM_MIN / len), (clear * len - BOOM_MARGIN) / len);
      this.boom = snap || want < this.boom ? want : this.boom + (want - this.boom) * (1 - Math.exp(-dt * t.heightRateGround));
      if (this.boom < 0.999) this.shown.set(ox + (this.pos.x - ox) * this.boom, oy + (this.pos.y - oy) * this.boom, oz + (this.pos.z - oz) * this.boom);
    }
    // never under `GROUND_ROOM` over the ground under it (a dip's far slope rising behind the car; M8.9 R14)
    if (this.floor) {
      const under = this.floor(this.shown.x, this.shown.y + 1, this.shown.z);
      if (this.shown.y < under + GROUND_ROOM) this.shown.y = under + GROUND_ROOM;
    }
    // under a ceiling (pulled in to it, or at its own height under a low deck): down out of it, never under the car's
    // roof line
    if (this.ceiling) {
      const room = this.ceiling(this.shown.x, this.shown.y, this.shown.z, CEILING_ROOM);
      if (room < CEILING_ROOM) this.shown.y = Math.max(car.position.y + 0.3, this.shown.y - (CEILING_ROOM - room));
    }
    this.camera.position.copy(this.shown);
    // the look-ahead halves in the air, eased both ways: switched in one frame it threw the car 25 px on the screen at
    // every take-off and landing
    this.airLook += ((tm.airborne ? 0.5 : 1) - this.airLook) * (snap ? 1 : 1 - Math.exp(-dt * 6));
    const ahead = (t.lookAhead + speed * t.lookAheadPerSpeed) * this.airLook;
    // left of the view direction is (cos yaw, 0, -sin yaw)
    this.look.set(
      car.position.x + this.dir.x * ahead + this.dir.z * this.lookSide,
      car.position.y + t.lookHeight + ahead * grade,
      car.position.z + this.dir.z * ahead - this.dir.x * this.lookSide,
    );
    // a long flight: the look leans toward where the car will come down, so the landing is seen (M8.9 R14)
    const toLand = tm.airborne && !snap ? this.forecastLanding(car.position, carVel) : -1;
    const leanTarget = toLand > 0 ? t.airLean * smooth01((toLand - AIR_LEAN.from) / (AIR_LEAN.to - AIR_LEAN.from)) : 0;
    this.lean += (leanTarget - this.lean) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    if (this.lean > 0.001) this.look.lerp(this.landing, this.lean);
    // takedown focus: the look point blends toward the target and back (8/s), the view narrows a little
    if (this.focusLeft > 0) this.focusLeft = Math.max(0, this.focusLeft - dt);
    const focusTarget = this.focusLeft > 0 ? 1 : 0;
    this.focusAmount += (focusTarget - this.focusAmount) * (snap ? 1 : 1 - Math.exp(-dt * 8));
    if (this.focusAmount > 0.001) this.look.lerp(this.focusPoint, this.focusAmount);
    if (this.mixWeight > 0) {
      this.camera.position.lerp(this.mixEye, this.mixWeight);
      this.look.lerp(this.mixLook, this.mixWeight);
    }
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);
    // the jolt on top, in the camera's own axes: yaw (a turn to the left moves the car right on the screen), pitch, roll
    if (this.joltPitch !== 0 || this.joltYaw !== 0 || this.joltRoll !== 0) {
      this.camera.rotateY(this.joltYaw);
      this.camera.rotateX(this.joltPitch);
      this.camera.rotateZ(this.joltRoll);
    }

    this.fovPunch *= Math.exp(-dt * 6);
    const fovTarget = Math.min(t.fovMax, t.fovBase + speed * t.fovPerSpeed + (tm.boosting ? t.fovBoost : 0) + (tm.drifting ? t.fovDrift : 0) + this.fovPunch - 6 * this.focusAmount);
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-dt * (this.fovPunch > 0.5 ? 12 : t.fovRate)));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
