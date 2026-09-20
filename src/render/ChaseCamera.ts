/**
 * Third-person chase camera with the sense-of-speed tricks from the brief:
 * FOV widening, pull-back and drop with speed, subtle shake, drift angle shown
 * by following the velocity direction instead of the car's nose.
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
  /** How much of the velocity direction is used for the camera heading at speed (0..1). */
  velocityFollow: number;
  fovBase: number;
  fovPerSpeed: number;
  fovBoost: number;
  fovMax: number;
  fovRate: number;
  shakeAmount: number;
  shakeSpeedRef: number;
}

export const DEFAULT_CAMERA: CameraTuning = {
  distance: 6.2,
  distancePerSpeed: 0.045,
  height: 2.4,
  heightDropPerSpeed: 0.008,
  lookAhead: 2.5,
  lookAheadPerSpeed: 0.12,
  lookHeight: 0.9,
  followRate: 7,
  velocityFollow: 0.75,
  fovBase: 60,
  fovPerSpeed: 0.28,
  fovBoost: 10,
  fovMax: 92,
  fovRate: 4,
  shakeAmount: 0.05,
  shakeSpeedRef: 55,
};

export type CameraMode = 'chase' | 'far';

export class ChaseCamera {
  tuning: CameraTuning = { ...DEFAULT_CAMERA };
  mode: CameraMode = 'chase';
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly velDir = new THREE.Vector3();
  private readonly heading = new THREE.Vector3(0, 0, 1);
  private readonly lastCarPos = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private fov: number;
  private shakeT = 0;
  private initialised = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.fov = this.tuning.fovBase;
    camera.fov = this.fov;
  }

  toggleMode(): void {
    this.mode = this.mode === 'chase' ? 'far' : 'chase';
  }

  update(car: THREE.Object3D, tm: VehicleTelemetry, dt: number, snap: boolean): void {
    const t = this.tuning;
    const speed = Math.abs(tm.speed);
    const modeMul = this.mode === 'far' ? 1.6 : 1;

    // car forward on the ground plane
    this.fwd.set(0, 0, 1).applyQuaternion(car.quaternion);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, 1);
    this.fwd.normalize();

    // velocity direction from the interpolated car position
    if (this.initialised && dt > 0) {
      this.velDir.copy(car.position).sub(this.lastCarPos);
      this.velDir.y = 0;
    } else {
      this.velDir.set(0, 0, 0);
    }
    this.lastCarPos.copy(car.position);
    let headingTarget = this.tmp.copy(this.fwd);
    if (this.velDir.lengthSq() > 1e-6 && speed > 3) {
      this.velDir.normalize();
      // reversing: keep looking forward
      if (this.velDir.dot(this.fwd) > -0.2) {
        const k = t.velocityFollow * Math.min(1, speed / 15);
        headingTarget = this.tmp.copy(this.fwd).lerp(this.velDir, k).normalize();
      }
    }
    const headRate = 1 - Math.exp(-dt * (tm.drifting ? 3.5 : 6));
    this.heading.lerp(headingTarget, snap ? 1 : headRate).normalize();

    const dist = (t.distance + speed * t.distancePerSpeed) * modeMul;
    const height = Math.max(1.4, t.height - speed * t.heightDropPerSpeed) * modeMul;
    this.target.copy(car.position).addScaledVector(this.heading, -dist);
    this.target.y = car.position.y + height;

    if (!this.initialised || snap) {
      this.pos.copy(this.target);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-dt * t.followRate);
      this.pos.lerp(this.target, k);
      // never let the camera drop below the car's road level
      this.pos.y = Math.max(this.pos.y, car.position.y + 0.8);
    }

    // shake grows with speed², tiny
    this.shakeT += dt * 37;
    const shake = t.shakeAmount * Math.pow(Math.min(1, speed / t.shakeSpeedRef), 2) * (tm.boosting ? 1.6 : 1);
    const sx = Math.sin(this.shakeT * 1.3) * shake;
    const sy = Math.cos(this.shakeT * 1.7) * shake * 0.7;

    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.look.copy(car.position).addScaledVector(this.fwd, t.lookAhead + speed * t.lookAheadPerSpeed);
    this.look.y += t.lookHeight;
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);

    const fovTarget = Math.min(t.fovMax, t.fovBase + speed * t.fovPerSpeed + (tm.boosting ? t.fovBoost : 0));
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-dt * t.fovRate));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
