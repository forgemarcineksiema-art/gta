/**
 * Third-person chase camera.
 *
 * The camera has a yaw (`heading`) that follows a blend of the car's nose and its
 * velocity direction with a rate limit, sits behind and above along that yaw, and
 * looks along it (so a drifting car stays centred while the view shows where it
 * is going). Reversing swings the camera around the car in a smooth orbit rather
 * than snapping. In flight the camera's height lags the car so the jump reads,
 * and a landing gives a short shake scaled by the impact.
 */
import * as THREE from 'three';
import type { VehicleTelemetry } from '../sim';

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
  /** Seconds of reversing before the camera swings round, and the swing speed in degrees per second. */
  reverseDelay: number;
  reverseOrbitRateDeg: number;
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
  headingRate: 6,
  headingRateDrift: 4.5,
  maxYawRateDeg: 220,
  velocityFollow: 0.6,
  driftVelocityFollow: 0.9,
  driftDistanceBonus: 0.8,
  driftHeightDrop: 0.3,
  fovBase: 60,
  fovPerSpeed: 0.28,
  fovBoost: 10,
  fovDrift: 4,
  fovMax: 92,
  fovRate: 4,
  shakeAmount: 0.05,
  shakeSpeedRef: 55,
  heightRateGround: 9,
  heightRateAir: 2.5,
  landingShake: 0.03,
  reverseDelay: 0.6,
  reverseOrbitRateDeg: 260,
};

export type CameraMode = 'chase' | 'far';

const DEG = Math.PI / 180;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class ChaseCamera {
  tuning: CameraTuning = { ...DEFAULT_CAMERA };
  mode: CameraMode = 'chase';
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** Camera yaw, radians: forward = (sin, 0, cos). */
  private heading = 0;
  /** 0 = forward view, 1 = reverse view; eases between them. */
  private reverseBlend = 0;
  private reverseTime = 0;
  private carY = 0;
  private fov: number;
  private shakeT = 0;
  private shakeEnergy = 0;
  private initialised = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.fov = this.tuning.fovBase;
    camera.fov = this.fov;
  }

  toggleMode(): void {
    this.mode = this.mode === 'chase' ? 'far' : 'chase';
  }

  update(car: THREE.Object3D, carVel: THREE.Vector3, tm: VehicleTelemetry, dt: number, snap: boolean): void {
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

    // reverse view: after a moment of backing up, orbit the camera round to the front
    if (tm.speed < -1.5) this.reverseTime += dt;
    else if (tm.speed > 0.5 || speed < 0.2) this.reverseTime = 0;
    const reverseWanted = this.reverseTime > t.reverseDelay ? 1 : 0;
    const orbitStep = (t.reverseOrbitRateDeg * DEG * dt) / Math.PI;
    this.reverseBlend += Math.max(-orbitStep, Math.min(orbitStep, reverseWanted - this.reverseBlend));

    if (!this.initialised || snap) {
      this.heading = yawTarget;
      this.carY = car.position.y;
      this.reverseBlend = 0;
      this.reverseTime = 0;
      this.initialised = true;
    } else {
      const rate = 1 - Math.exp(-dt * (tm.drifting ? t.headingRateDrift : t.headingRate));
      let delta = wrapAngle(yawTarget - this.heading) * rate;
      const cap = t.maxYawRateDeg * DEG * dt;
      delta = Math.max(-cap, Math.min(cap, delta));
      this.heading = wrapAngle(this.heading + delta);
    }

    // view yaw includes the reverse orbit
    const viewYaw = this.heading + Math.PI * this.reverseBlend;
    this.dir.set(Math.sin(viewYaw), 0, Math.cos(viewYaw));

    // height follows the car with lag in the air so a jump reads as height
    const hRate = 1 - Math.exp(-dt * (tm.airborne ? t.heightRateAir : t.heightRateGround));
    this.carY += (car.position.y - this.carY) * (snap ? 1 : hRate);

    const dist = (t.distance + speed * t.distancePerSpeed + (tm.drifting ? t.driftDistanceBonus : 0)) * modeMul;
    const height = Math.max(1.4, t.height - speed * t.heightDropPerSpeed - (tm.drifting ? t.driftHeightDrop : 0)) * modeMul;
    this.target.set(car.position.x - this.dir.x * dist, this.carY + height, car.position.z - this.dir.z * dist);

    if (snap || !this.initialised) {
      this.pos.copy(this.target);
    } else {
      const k = 1 - Math.exp(-dt * t.followRate);
      this.pos.lerp(this.target, k);
      this.pos.y = Math.max(this.pos.y, car.position.y + 0.6);
    }

    // shake: speed² plus a landing burst that decays
    if (tm.landingImpact > 0) this.shakeEnergy = Math.min(0.6, this.shakeEnergy + tm.landingImpact * t.landingShake);
    this.shakeEnergy *= Math.exp(-dt * 7);
    this.shakeT += dt * 37;
    const shake = t.shakeAmount * Math.pow(Math.min(1, speed / t.shakeSpeedRef), 2) * (tm.boosting ? 1.6 : 1) + this.shakeEnergy;
    const sx = Math.sin(this.shakeT * 1.3) * shake;
    const sy = Math.cos(this.shakeT * 1.7) * shake * 0.7;

    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    const ahead = (t.lookAhead + speed * t.lookAheadPerSpeed) * (tm.airborne ? 0.5 : 1);
    this.look.set(car.position.x + this.dir.x * ahead, car.position.y + t.lookHeight, car.position.z + this.dir.z * ahead);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);

    const fovTarget = Math.min(t.fovMax, t.fovBase + speed * t.fovPerSpeed + (tm.boosting ? t.fovBoost : 0) + (tm.drifting ? t.fovDrift : 0));
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-dt * t.fovRate));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
