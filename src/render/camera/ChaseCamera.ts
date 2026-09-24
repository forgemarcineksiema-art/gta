/**
 * Third-person chase camera.
 *
 * The camera has a yaw (`heading`) that follows a blend of the car's nose and its
 * velocity direction with a rate limit, sits behind and above along that yaw, and
 * looks along it (so a drifting car stays centred while the view shows where it
 * is going). Reversing swings the camera around the car in a smooth orbit rather
 * than snapping. In flight the camera's height lags the car so the jump reads,
 * and a landing gives a short shake scaled by the impact. A small, bounded
 * look-ahead follows actual angular motion. Steering input alone must never
 * swivel the view: quick corrections should not move the road under the player.
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
  /** Yaw follow stiffness (1/s), and while drifting. */
  headingRate: number;
  headingRateDrift: number;
  /** Cap on how fast the view can yaw, degrees per second. */
  maxYawRateDeg: number;
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
  shakeAmount: number;
  shakeSpeedRef: number;
  /** How fast the camera height follows the car on the ground and in the air (1/s). */
  heightRateGround: number;
  heightRateAir: number;
  /** Shake per m/s of landing impact. */
  landingShake: number;
  /** Shake per m/s of a wall or prop hit, and at full scrape. */
  impactShake: number;
  scrapeShake: number;
  /** Seconds of reversing before the camera swings round. */
  reverseDelay: number;
  /** Seconds of forward driving, or of standing still, before it swings back. */
  reverseReturnDelay: number;
  reverseStillDelay: number;
  /** Natural frequency of the critically damped swing (rad/s): 3.5 settles in about 1.3 s. */
  reverseOrbitOmega: number;
  /** Extra camera height while looking back, m. */
  reverseHeight: number;
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
  headingRate: 5,
  headingRateDrift: 3.8,
  maxYawRateDeg: 110,
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
  shakeAmount: 0.02,
  shakeSpeedRef: 55,
  heightRateGround: 9,
  heightRateAir: 2.5,
  landingShake: 0.03,
  impactShake: 0.02,
  scrapeShake: 0.012,
  reverseDelay: 0.7,
  reverseReturnDelay: 0.3,
  reverseStillDelay: 1.2,
  reverseOrbitOmega: 3.5,
  reverseHeight: 0.3,
  headingLead: 0.04,
  lookSideYaw: 0.4,
  lookSideMax: 0.65,
  lookSideRate: 3,
  lookSideSpeedRef: 14,
};

export type CameraMode = 'chase' | 'far';

const DEG = Math.PI / 180;
/** The occlusion rule's gap kept to the static that blocks, and the shortest boom it pulls to, m. */
const BOOM_MARGIN = 0.4;
const BOOM_MIN = 1.6;

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
  /** How much of the boom is out: pulled in at once by a static between, let out again at the ground height's pace. */
  private boom = 1;
  private readonly shown = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** Camera yaw, radians: forward = (sin, 0, cos). */
  private heading = 0;
  /** Orbit parameter: 0 = forward view, 1 = reverse view. Driven by a critically damped spring. */
  private reverseU = 0;
  private reverseVel = 0;
  private reverseTarget = 0;
  private reverseTime = 0;
  private forwardTime = 0;
  private stillTime = 0;
  private carY = 0;
  /** Smoothed lateral look offset, metres to the car's left. */
  private lookSide = 0;
  private fov: number;
  private shakeT = 0;
  private shakeEnergy = 0;
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
  /** An external jolt (a billboard through the windscreen): adds bounded shake energy. */
  kick(amount: number): void {
    this.shakeEnergy = Math.min(0.7, this.shakeEnergy + amount);
  }

  /** A longer or taller body than the classes (the bus): the camera sits this much further back and higher. */
  fit(distance: number, height: number): void {
    this.extraDistance = distance;
    this.extraHeight = height;
  }

  whip(seconds: number): void {
    this.whipLeft = seconds;
    this.fovPunch = 10;
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

    // nose yaw and velocity yaw on the ground plane
    this.fwd.set(0, 0, 1).applyQuaternion(car.quaternion);
    const yawNose = Math.atan2(this.fwd.x, this.fwd.z);
    let yawTarget = yawNose;
    if (speed > 2.5 && carVel.dot(this.fwd) > -0.5) {
      const yawVel = Math.atan2(carVel.x, carVel.z);
      const k = (tm.drifting ? t.driftVelocityFollow : t.velocityFollow) * Math.min(1, speed / 12);
      yawTarget = yawNose + wrapAngle(yawVel - yawNose) * k;
    }
    // look-ahead: lead the heading into the turn, and slide the look point to the inside
    const lookActive = Math.min(1, speed / t.lookSideSpeedRef) * (1 - this.reverseU);
    if (!tm.drifting) yawTarget += tm.yawRate * t.headingLead * lookActive;
    const sideTarget = Math.max(-t.lookSideMax, Math.min(t.lookSideMax, tm.yawRate * t.lookSideYaw * lookActive));
    this.lookSide += (sideTarget - this.lookSide) * (snap ? 1 : 1 - Math.exp(-dt * t.lookSideRate));

    // reverse view: after a moment of backing up the camera orbits round to the front of the car,
    // and returns after a moment of driving forward or of standing still. The orbit parameter is a
    // critically damped spring: no jerk at either end, and a change of mind mid-swing eases back.
    if (tm.speed < -1.5) {
      this.reverseTime += dt;
      this.forwardTime = 0;
      this.stillTime = 0;
    } else if (tm.speed > 0.8) {
      this.forwardTime += dt;
      this.reverseTime = 0;
      this.stillTime = 0;
    } else {
      this.stillTime += dt;
    }
    if (this.reverseTime > t.reverseDelay) this.reverseTarget = 1;
    if (this.forwardTime > t.reverseReturnDelay || this.stillTime > t.reverseStillDelay) this.reverseTarget = 0;
    const w = t.reverseOrbitOmega;
    const acc = (this.reverseTarget - this.reverseU) * w * w - 2 * w * this.reverseVel;
    this.reverseVel += acc * dt;
    this.reverseU = Math.max(0, Math.min(1, this.reverseU + this.reverseVel * dt));

    if (!this.initialised || snap) {
      this.heading = yawTarget;
      this.carY = car.position.y;
      this.lookSide = 0;
      this.reverseU = 0;
      this.reverseVel = 0;
      this.reverseTarget = 0;
      this.reverseTime = 0;
      this.forwardTime = 0;
      this.stillTime = 0;
      this.initialised = true;
    } else {
      const whipping = this.whipLeft > 0;
      if (whipping) this.whipLeft = Math.max(0, this.whipLeft - dt);
      const rate = 1 - Math.exp(-dt * (whipping ? 20 : tm.drifting ? t.headingRateDrift : t.headingRate));
      let delta = wrapAngle(yawTarget - this.heading) * rate;
      const cap = (whipping ? 720 : t.maxYawRateDeg) * DEG * dt;
      delta = Math.max(-cap, Math.min(cap, delta));
      this.heading = wrapAngle(this.heading + delta);
    }

    // view yaw includes the reverse orbit
    const viewYaw = this.heading + Math.PI * this.reverseU;
    this.dir.set(Math.sin(viewYaw), 0, Math.cos(viewYaw));

    // height follows the car with lag in the air so a jump reads as height
    const hRate = 1 - Math.exp(-dt * (tm.airborne ? t.heightRateAir : t.heightRateGround));
    this.carY += (car.position.y - this.carY) * (snap ? 1 : hRate);

    const dist = (t.distance + this.extraDistance + speed * t.distancePerSpeed + (tm.drifting ? t.driftDistanceBonus : 0)) * modeMul;
    const height = Math.max(1.4, t.height + this.extraHeight - speed * t.heightDropPerSpeed - (tm.drifting ? t.driftHeightDrop : 0) + t.reverseHeight * this.reverseU) * modeMul;
    this.target.set(car.position.x - this.dir.x * dist, this.carY + height, car.position.z - this.dir.z * dist);

    if (snap || !this.initialised) {
      this.pos.copy(this.target);
    } else {
      const k = 1 - Math.exp(-dt * t.followRate * (this.whipLeft > 0 ? 2 : 1));
      this.pos.lerp(this.target, k);
      this.pos.y = Math.max(this.pos.y, car.position.y + 0.6);
    }

    // shake: speed² plus a landing burst that decays
    if (tm.landingImpact > 0) this.shakeEnergy = Math.min(0.6, this.shakeEnergy + tm.landingImpact * t.landingShake);
    if (tm.impact > 0.5) this.shakeEnergy = Math.min(0.7, this.shakeEnergy + tm.impact * t.impactShake);
    this.shakeEnergy *= Math.exp(-dt * 7);
    this.shakeT += dt * 37;
    const shake = t.shakeAmount * Math.pow(Math.min(1, speed / t.shakeSpeedRef), 2) * (tm.boosting ? 1.6 : 1) + this.shakeEnergy + tm.scrape * t.scrapeShake;
    const sx = Math.sin(this.shakeT * 1.3) * shake;
    const sy = Math.cos(this.shakeT * 1.7) * shake * 0.7;

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
    this.camera.position.set(this.shown.x + sx, this.shown.y + sy, this.shown.z);
    const ahead = (t.lookAhead + speed * t.lookAheadPerSpeed) * (tm.airborne ? 0.5 : 1);
    // left of the view direction is (cos yaw, 0, -sin yaw)
    this.look.set(
      car.position.x + this.dir.x * ahead + this.dir.z * this.lookSide,
      car.position.y + t.lookHeight,
      car.position.z + this.dir.z * ahead - this.dir.x * this.lookSide,
    );
    // takedown focus: the look point blends toward the target and back (8/s), the view narrows a little
    if (this.focusLeft > 0) this.focusLeft = Math.max(0, this.focusLeft - dt);
    const focusTarget = this.focusLeft > 0 ? 1 : 0;
    this.focusAmount += (focusTarget - this.focusAmount) * (snap ? 1 : 1 - Math.exp(-dt * 8));
    if (this.focusAmount > 0.001) this.look.lerp(this.focusPoint, this.focusAmount);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);

    this.fovPunch *= Math.exp(-dt * 6);
    const fovTarget = Math.min(t.fovMax, t.fovBase + speed * t.fovPerSpeed + (tm.boosting ? t.fovBoost : 0) + (tm.drifting ? t.fovDrift : 0) + this.fovPunch - 6 * this.focusAmount);
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-dt * (this.fovPunch > 0.5 ? 12 : t.fovRate)));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
