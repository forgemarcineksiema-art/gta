/**
 * Arcade raycast car on a Rapier rigid body.
 *
 * One dynamic body (the chassis) with four raycast suspensions. Each grounded
 * wheel pushes the chassis up with a spring-damper and applies lateral /
 * longitudinal tyre forces from a simplified slip model with an explicit drift
 * state. No wheel bodies, no joints: cheap, stable, and fully tunable.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleControls } from '../controls';
import * as M from '../math';
import type { Vec3 } from '../math';
import type { TransformBuffer } from '../transforms';
import type { VehicleTuning } from './tuning';

const WHEEL_RL = 2;
const WHEEL_RR = 3;

export interface WheelState {
  /** Local attach point. */
  local: Vec3;
  isFront: boolean;
  isLeft: boolean;
  grounded: boolean;
  /** Spring compression in metres (0 = fully extended). */
  compression: number;
  /** Vertical load in N. */
  load: number;
  /** Contact point (world). */
  contact: Vec3;
  /** Ground normal at the contact (world). */
  normal: Vec3;
  /** Wheel centre (world) for the renderer. */
  center: Vec3;
  /** Slip angle in radians (unsigned). */
  slipAngle: number;
  /** Forward speed of the contact patch along the wheel plane, m/s. */
  forwardSpeed: number;
  lateralSpeed: number;
  /** Rolling angle for the visual wheel. */
  spin: number;
  /** Transform slot for the renderer. */
  slot: number;
}

export interface VehicleTelemetry {
  /** Signed forward speed, m/s. */
  speed: number;
  speedKmh: number;
  drifting: boolean;
  driftAngleDeg: number;
  boost: number;
  boosting: boolean;
  airborne: boolean;
  groundedWheels: number;
  steer: number;
  steerDeg: number;
  gear: number;
  rpm: number;
  /** 0..1 engine load for audio. */
  load: number;
  throttle: number;
  airTime: number;
  /** Seconds spent drifting in the current drift. */
  driftTime: number;
  /** Largest tyre slip angle this step, degrees (for skid audio). */
  maxSlipDeg: number;
}

const AXIS_X: Readonly<Vec3> = { x: 1, y: 0, z: 0 };
const AXIS_Y: Readonly<Vec3> = { x: 0, y: 1, z: 0 };
const AXIS_Z: Readonly<Vec3> = { x: 0, y: 0, z: 1 };

const scratch = {
  pos: M.v3(),
  vel: M.v3(),
  angvel: M.v3(),
  fwd: M.v3(),
  right: M.v3(),
  up: M.v3(),
  a: M.v3(),
  b: M.v3(),
  force: M.v3(),
  point: M.v3(),
  wheelFwd: M.v3(),
  wheelRight: M.v3(),
  rayDir: M.v3(),
  rearLocal: M.v3(),
  q: { x: 0, y: 0, z: 0, w: 1 },
  q2: { x: 0, y: 0, z: 0, w: 1 },
  q3: { x: 0, y: 0, z: 0, w: 1 },
};

export class Vehicle {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly wheels: WheelState[] = [];
  readonly slot: number;
  tuning: VehicleTuning;

  /** Current steering angle at the front wheels, radians (+ = right). */
  steer = 0;
  drifting = false;
  driftTime = 0;
  boostMeter: number;
  boosting = false;
  airTime = 0;
  flippedTime = 0;
  gear = 1;
  rpm: number;
  /** Blended grip multipliers (drop instantly, recover at gripBlendRate). */
  rearGripMul = 1;
  frontGripMul = 1;
  readonly telemetry: VehicleTelemetry;
  /** Where `reset` puts the car: updated by the world (nearest spawn point). */
  resetPose: { position: Vec3; yaw: number };

  private readonly ray: RAPIER.Ray;
  private readonly world: RAPIER.World;
  private readonly transforms: TransformBuffer;

  constructor(world: RAPIER.World, transforms: TransformBuffer, tuning: VehicleTuning, position: Vec3, yaw: number) {
    this.world = world;
    this.transforms = transforms;
    this.tuning = tuning;
    this.boostMeter = tuning.boostInitial;
    this.rpm = tuning.idleRpm;
    this.resetPose = { position: { ...position }, yaw };

    const rot = M.quatSetAxisAngle({ x: 0, y: 0, z: 0, w: 1 }, 0, 1, 0, yaw);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rot)
      .setAngularDamping(tuning.angularDamping)
      .setLinearDamping(0)
      .setCcdEnabled(true)
      .setCanSleep(false);
    this.body = world.createRigidBody(desc);

    const he = tuning.chassisHalfExtents;
    const colliderDesc = RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z)
      .setTranslation(0, tuning.chassisOffsetY, 0)
      .setFriction(0.3)
      .setRestitution(0.05)
      .setMassProperties(tuning.mass, { x: 0, y: tuning.centerOfMassY, z: 0 }, boxInertia(tuning), { x: 0, y: 0, z: 0, w: 1 });
    this.collider = world.createCollider(colliderDesc, this.body);

    this.slot = transforms.allocate();
    const hb = tuning.wheelBase * 0.5;
    const ht = tuning.trackWidth * 0.5;
    const ay = tuning.suspensionAttachY;
    const defs: Array<[number, number, boolean, boolean]> = [
      [-ht, hb, true, true],
      [ht, hb, true, false],
      [-ht, -hb, false, true],
      [ht, -hb, false, false],
    ];
    for (const [x, z, isFront, isLeft] of defs) {
      this.wheels.push({
        local: M.v3(x, ay, z),
        isFront,
        isLeft,
        grounded: false,
        compression: 0,
        load: 0,
        contact: M.v3(),
        normal: M.v3(0, 1, 0),
        center: M.v3(),
        slipAngle: 0,
        forwardSpeed: 0,
        lateralSpeed: 0,
        spin: 0,
        slot: transforms.allocate(),
      });
    }
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.telemetry = {
      speed: 0,
      speedKmh: 0,
      drifting: false,
      driftAngleDeg: 0,
      boost: this.boostMeter,
      boosting: false,
      airborne: false,
      groundedWheels: 0,
      steer: 0,
      steerDeg: 0,
      gear: 1,
      rpm: this.rpm,
      load: 0,
      throttle: 0,
      airTime: 0,
      driftTime: 0,
      maxSlipDeg: 0,
    };
    this.writeTransforms(true);
  }

  /** Apply one fixed step of vehicle forces. Call before `world.step()`. */
  update(controls: VehicleControls, dt: number): void {
    const t = this.tuning;
    const body = this.body;
    const s = scratch;

    if (controls.reset) {
      this.teleport(this.resetPose.position, this.resetPose.yaw);
    }

    body.resetForces(true);
    body.resetTorques(true);

    body.translation(s.pos);
    body.rotation(s.q);
    body.linvel(s.vel);
    body.angvel(s.angvel);
    M.rotate(s.fwd, s.q, AXIS_Z);
    M.rotate(s.right, s.q, AXIS_X);
    M.rotate(s.up, s.q, AXIS_Y);

    const forwardSpeed = M.dot(s.vel, s.fwd);
    const speed = M.length(s.vel);
    const absFwd = Math.abs(forwardSpeed);

    // ---- steering: rate limited, speed sensitive ---------------------------
    const authority = M.smoothstep(absFwd / t.steerSpeedRef);
    let maxSteer = M.lerp(t.maxSteerDegLow, t.maxSteerDegHigh, authority) * M.DEG;
    if (this.drifting) maxSteer = Math.min(t.driftMaxSteerDeg * M.DEG, maxSteer * t.driftSteerMul);
    const target = M.clamp(controls.steer, -1, 1) * maxSteer;
    const returning = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
    const rate = (returning ? t.steerReturnRate : t.steerRate) * (t.maxSteerDegLow * M.DEG);
    this.steer = M.moveToward(this.steer, target, rate * dt);

    // ---- boost --------------------------------------------------------------
    this.boosting = controls.boost > 0.5 && this.boostMeter > 0;
    if (this.boosting) {
      this.boostMeter = Math.max(0, this.boostMeter - t.boostDrain * dt);
    }
    const driveMul = this.boosting ? t.boostForceMul : 1;
    const vmax = this.boosting ? t.boostMaxSpeed : t.maxSpeed;

    // ---- suspension raycasts --------------------------------------------------
    M.scale(s.rayDir, s.up, -1);
    const rayLen = t.suspensionRestLength + t.wheelRadius;
    let grounded = 0;
    for (const w of this.wheels) {
      M.rotate(s.a, s.q, w.local);
      M.add(s.point, s.pos, s.a);
      this.ray.origin.x = s.point.x;
      this.ray.origin.y = s.point.y;
      this.ray.origin.z = s.point.z;
      this.ray.dir.x = s.rayDir.x;
      this.ray.dir.y = s.rayDir.y;
      this.ray.dir.z = s.rayDir.z;
      const hit = this.world.castRayAndGetNormal(this.ray, rayLen, true, undefined, undefined, undefined, body);
      if (hit && hit.timeOfImpact > 0) {
        const d = hit.timeOfImpact;
        w.grounded = true;
        grounded++;
        w.compression = rayLen - d;
        M.addScaled(w.contact, s.point, s.rayDir, d);
        M.addScaled(w.center, s.point, s.rayDir, Math.max(0, d - t.wheelRadius));
        w.normal.x = hit.normal.x;
        w.normal.y = hit.normal.y;
        w.normal.z = hit.normal.z;
        if (M.dot(w.normal, s.up) < 0) M.scale(w.normal, w.normal, -1);
      } else {
        w.grounded = false;
        w.compression = 0;
        w.load = 0;
        M.addScaled(w.center, s.point, s.rayDir, t.suspensionRestLength);
        M.copy(w.contact, w.center);
        M.copy(w.normal, s.up);
      }
    }

    // ---- spring + damper (with anti-roll) ---------------------------------
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i] as WheelState;
      if (!w.grounded) continue;
      M.rotate(s.a, s.q, w.local);
      M.add(s.point, s.pos, s.a);
      body.velocityAtPoint(s.point, s.b);
      const vAlongRay = M.dot(s.b, s.rayDir); // + = compressing
      let f = t.suspensionStiffness * w.compression;
      f += (vAlongRay > 0 ? t.suspensionDampingCompression : t.suspensionDampingRebound) * vAlongRay;
      const over = w.compression - t.suspensionRestLength;
      if (over > 0) f += t.bumpStopStiffness * over;
      // anti-roll bar: couple with the other wheel on the same axle
      const other = this.wheels[i ^ 1] as WheelState;
      if (other.grounded) f += t.antiRollStiffness * (w.compression - other.compression);
      if (f < 0) f = 0;
      w.load = f;
      M.scale(s.force, s.up, f);
      body.addForceAtPoint(s.force, s.point, true);
    }

    // ---- drift state ----------------------------------------------------------
    const rl = this.wheels[WHEEL_RL] as WheelState;
    const rr = this.wheels[WHEEL_RR] as WheelState;
    const handbrake = controls.handbrake > 0.5;
    const rearGrounded = rl.grounded || rr.grounded;
    M.set(s.rearLocal, 0, 0, -t.wheelBase * 0.5);
    M.rotate(s.a, s.q, s.rearLocal);
    M.add(s.point, s.pos, s.a);
    body.velocityAtPoint(s.point, s.b);
    const rearFwd = M.dot(s.b, s.fwd);
    const rearLat = M.dot(s.b, s.right);
    const rearSlip = Math.atan2(Math.abs(rearLat), Math.max(0.5, Math.abs(rearFwd)));
    const bodySlipDeg = (Math.atan2(M.dot(s.vel, s.right), Math.max(0.5, forwardSpeed)) * 180) / Math.PI;
    if (rearGrounded && absFwd > t.driftMinSpeed) {
      if (!this.drifting && (handbrake || rearSlip > t.driftEnterDeg * M.DEG)) {
        this.drifting = true;
        this.driftTime = 0;
      } else if (this.drifting && !handbrake && this.driftTime > t.driftMinTime && rearSlip < t.driftExitDeg * M.DEG) {
        this.drifting = false;
      }
    } else if (absFwd <= t.driftMinSpeed * 0.7 || !rearGrounded) {
      this.drifting = false;
    }
    if (this.drifting) this.driftTime += dt;
    // grip multipliers blend so a released handbrake or an ending drift never snaps the rear
    const rearTarget = handbrake ? t.handbrakeGripMul : this.drifting ? t.driftGripMul : 1;
    const frontTarget = this.drifting ? t.driftFrontGripMul : 1;
    const blend = t.gripBlendRate * dt;
    this.rearGripMul = rearTarget < this.rearGripMul ? rearTarget : M.moveToward(this.rearGripMul, rearTarget, blend);
    this.frontGripMul = frontTarget < this.frontGripMul ? frontTarget : M.moveToward(this.frontGripMul, frontTarget, blend);

    // ---- tyre forces --------------------------------------------------------
    const throttle = M.clamp01(controls.throttle);
    const brake = M.clamp01(controls.brake);
    const speedRatio = M.clamp01(absFwd / vmax);
    const driveAvailable = t.driveForce * driveMul * (1 - Math.pow(speedRatio, t.driveFalloffExp));
    const comHeight = t.chassisOffsetY + t.centerOfMassY;
    let maxSlip = 0;
    for (const w of this.wheels) {
      if (!w.grounded) {
        w.slipAngle = 0;
        w.forwardSpeed = forwardSpeed;
        w.lateralSpeed = 0;
        w.spin += (forwardSpeed / t.wheelRadius) * dt;
        continue;
      }
      // wheel frame on the contact plane
      if (w.isFront && this.steer !== 0) {
        M.quatSetAxisAngle(s.q2, s.up.x, s.up.y, s.up.z, this.steer);
        M.rotate(s.wheelFwd, s.q2, s.fwd);
      } else {
        M.copy(s.wheelFwd, s.fwd);
      }
      const nd = M.dot(s.wheelFwd, w.normal);
      M.addScaled(s.wheelFwd, s.wheelFwd, w.normal, -nd);
      M.normalize(s.wheelFwd, s.wheelFwd);
      M.cross(s.wheelRight, w.normal, s.wheelFwd);
      M.normalize(s.wheelRight, s.wheelRight);

      body.velocityAtPoint(w.contact, s.b);
      const vFwd = M.dot(s.b, s.wheelFwd);
      const vLat = M.dot(s.b, s.wheelRight);
      w.forwardSpeed = vFwd;
      w.lateralSpeed = vLat;
      w.slipAngle = Math.atan2(Math.abs(vLat), Math.max(0.3, Math.abs(vFwd)));
      if (w.slipAngle > maxSlip) maxSlip = w.slipAngle;
      w.spin += (vFwd / t.wheelRadius) * dt;

      // grip budget
      const mu = w.isFront ? t.muFront * this.frontGripMul : t.muRear * this.rearGripMul;
      // slip curve: linear to the peak, then decays to the tail (a sliding tyre grips less)
      const peak = t.slipPeakDeg * M.DEG;
      const over = w.slipAngle - peak;
      const curve = over <= 0 ? 1 : 1 - (1 - t.slipTail) * M.clamp01(over / (60 * M.DEG - peak));
      const maxF = mu * w.load * curve;

      // lateral
      let fLat = -vLat * t.latStiffness * w.load;

      // longitudinal
      let fLong = 0;
      const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
      if (share > 0 && throttle > 0) {
        fLong += throttle * driveAvailable * share * 0.5;
      }
      if (brake > 0) {
        if (forwardSpeed > 0.5) {
          fLong -= brake * t.brakeForce * 0.25;
        } else if (share > 0) {
          const revRatio = M.clamp01(absFwd / t.maxReverseSpeed);
          fLong -= brake * t.reverseForce * share * 0.5 * (1 - revRatio);
        }
      }
      if (throttle === 0 && brake === 0) {
        fLong -= Math.sign(vFwd) * Math.min(Math.abs(vFwd) * 400, t.engineBrakeForce * 0.25);
      }
      if (handbrake && !w.isFront) {
        fLong -= Math.sign(vFwd) * Math.min(Math.abs(vFwd) * 2500, t.handbrakeForce * 0.5);
      }
      fLong -= Math.sign(vFwd) * Math.min(Math.abs(vFwd) * 100, t.rollingResistance * 0.25);

      // friction circle
      const mag = Math.hypot(fLat, fLong);
      if (mag > maxF && mag > 0) {
        const k = maxF / mag;
        fLat *= k;
        fLong *= k;
      }

      M.scale(s.force, s.wheelRight, fLat);
      M.addScaled(s.force, s.force, s.wheelFwd, fLong);
      // apply above the contact patch to limit body roll (arcade)
      M.addScaled(s.point, w.contact, s.up, (comHeight + t.wheelRadius) * t.tireForceHeight);
      body.addForceAtPoint(s.force, s.point, true);
    }

    // ---- drift assists ---------------------------------------------------------
    // While drifting the car is steered by a yaw-rate controller and the velocity
    // vector is pulled toward the nose: holding steer gives a stable angle, centring
    // straightens out, counter-steer straightens faster. Speed is kept on purpose.
    if (this.drifting) {
      const yawRate = M.dot(s.angvel, s.up);
      const targetYaw = M.clamp(controls.steer, -1, 1) * t.driftYawRate;
      const torque = M.clamp((targetYaw - yawRate) * t.driftYawGain, -t.driftYawTorqueMax, t.driftYawTorqueMax);
      M.scale(s.force, s.up, torque);
      body.addTorque(s.force, true);

      // horizontal velocity and horizontal nose direction
      M.set(s.a, s.vel.x, 0, s.vel.z);
      const speedH = M.length(s.a);
      M.set(s.b, s.fwd.x, 0, s.fwd.z);
      M.normalize(s.b, s.b);
      if (speedH > 1 && M.dot(s.a, s.b) > 0) {
        // velocity follow: accelerate toward (nose * speedH), capped
        M.scale(s.b, s.b, speedH);
        M.sub(s.b, s.b, s.a);
        M.scale(s.b, s.b, t.driftVelocityFollow);
        const accel = M.length(s.b);
        if (accel > t.driftFollowAccelMax) M.scale(s.b, s.b, t.driftFollowAccelMax / accel);
        M.scale(s.force, s.b, t.mass);
        body.addForce(s.force, true);
        // scrub: lose speed with the slip angle
        const slip = Math.abs(Math.sin(bodySlipDeg * M.DEG));
        M.scale(s.force, s.a, -t.mass * t.driftSpeedLoss * slip);
        body.addForce(s.force, true);
      }
      if (throttle > 0 && absFwd < vmax) {
        M.scale(s.force, s.fwd, throttle * driveAvailable * t.driftThrottleGain);
        body.addForce(s.force, true);
      }
    }

    // ---- aero, extra gravity --------------------------------------------------
    if (speed > 0.1) {
      M.scale(s.force, s.vel, -t.drag * speed);
      body.addForce(s.force, true);
    }
    if (grounded > 0) {
      M.scale(s.force, s.up, -t.downforce * forwardSpeed * forwardSpeed);
      body.addForce(s.force, true);
    }
    M.set(s.force, 0, -t.extraGravity * t.mass, 0);
    body.addForce(s.force, true);

    // ---- air control and levelling -------------------------------------------
    const airborne = grounded === 0;
    if (airborne) {
      this.airTime += dt;
      // throttle lifts the nose, brake drops it; steer rolls. Levelling always acts.
      const pitchIn = brake - throttle;
      const rollIn = -controls.steer;
      M.scale(s.force, s.right, pitchIn * t.airPitchTorque);
      M.addScaled(s.force, s.force, s.fwd, rollIn * t.airRollTorque);
      M.cross(s.a, s.up, AXIS_Y);
      M.addScaled(s.force, s.force, s.a, t.airLevelTorque);
      M.addScaled(s.force, s.force, s.angvel, -t.airAngularDamping);
      body.addTorque(s.force, true);
      this.boostMeter = Math.min(1, this.boostMeter + t.boostGainAir * dt);
    } else {
      this.airTime = 0;
    }
    if (this.drifting && absFwd > t.driftMinSpeed) {
      this.boostMeter = Math.min(1, this.boostMeter + t.boostGainDrift * dt);
    }

    // ---- flip recovery ----------------------------------------------------------
    if (s.up.y < 0.15 && speed < 1.5) {
      this.flippedTime += dt;
      if (this.flippedTime > t.flipRecoverySeconds) {
        const yaw = M.yawOf(s.q);
        this.teleport({ x: s.pos.x, y: s.pos.y + 1.2, z: s.pos.z }, yaw);
        this.flippedTime = 0;
      }
    } else {
      this.flippedTime = 0;
    }

    this.updateGearbox(absFwd, throttle, vmax, dt);

    // ---- telemetry ----------------------------------------------------------
    const tm = this.telemetry;
    tm.speed = forwardSpeed;
    tm.speedKmh = forwardSpeed * 3.6;
    tm.drifting = this.drifting;
    tm.driftAngleDeg = bodySlipDeg;
    tm.boost = this.boostMeter;
    tm.boosting = this.boosting;
    tm.airborne = airborne;
    tm.groundedWheels = grounded;
    tm.steer = this.steer;
    tm.steerDeg = this.steer / M.DEG;
    tm.gear = this.gear;
    tm.rpm = this.rpm;
    tm.throttle = throttle;
    tm.load = M.clamp01(throttle * (1 - 0.6 * speedRatio) + (this.boosting ? 0.3 : 0));
    tm.airTime = this.airTime;
    tm.driftTime = this.driftTime;
    tm.maxSlipDeg = maxSlip / M.DEG;
  }

  private updateGearbox(absFwd: number, throttle: number, vmax: number, dt: number): void {
    const t = this.tuning;
    const n = t.gearCount;
    const top = (g: number) => vmax * Math.pow(g / n, 0.8);
    while (this.gear < n && absFwd > top(this.gear) * 0.97) this.gear++;
    while (this.gear > 1 && absFwd < top(this.gear - 1) * 0.8) this.gear--;
    const lo = this.gear === 1 ? 0 : top(this.gear - 1) * 0.8;
    const hi = top(this.gear);
    const ratio = M.clamp01((absFwd - lo) / Math.max(0.1, hi - lo));
    let targetRpm = t.idleRpm + (t.redlineRpm - t.idleRpm) * ratio;
    if (absFwd < 0.5) targetRpm = t.idleRpm + throttle * (t.redlineRpm - t.idleRpm) * 0.6;
    this.rpm = M.lerp(this.rpm, targetRpm, 1 - Math.exp(-dt * 12));
  }

  teleport(position: Vec3, yaw: number): void {
    const q = M.quatSetAxisAngle(scratch.q3, 0, 1, 0, yaw);
    this.body.setTranslation(position, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.drifting = false;
    this.airTime = 0;
    for (const w of this.wheels) {
      w.grounded = false;
      w.compression = 0;
    }
    this.writeTransforms(true);
  }

  /** Copy body + wheel poses into the transform buffer. Call after `world.step()`. */
  writeTransforms(both = false): void {
    const s = scratch;
    const tb = this.transforms;
    const t = this.tuning;
    this.body.translation(s.pos);
    this.body.rotation(s.q);
    if (both) tb.writeBoth(this.slot, s.pos.x, s.pos.y, s.pos.z, s.q.x, s.q.y, s.q.z, s.q.w);
    else tb.write(this.slot, s.pos.x, s.pos.y, s.pos.z, s.q.x, s.q.y, s.q.z, s.q.w);
    M.rotate(s.up, s.q, AXIS_Y);
    for (const wh of this.wheels) {
      // wheel rotation = body * steer(yaw) * spin(pitch)
      const steer = wh.isFront ? this.steer : 0;
      M.quatSetAxisAngle(s.q2, 0, 1, 0, steer);
      M.quatMul(s.q3, s.q, s.q2);
      M.quatSetAxisAngle(s.q2, 1, 0, 0, wh.spin);
      M.quatMul(s.q3, s.q3, s.q2);
      // wheel centre from the current body pose so the wheels never float
      const drop = wh.grounded ? t.suspensionRestLength - wh.compression : t.suspensionRestLength;
      M.rotate(s.a, s.q, wh.local);
      M.add(s.point, s.pos, s.a);
      M.addScaled(wh.center, s.point, s.up, -drop);
      if (both) tb.writeBoth(wh.slot, wh.center.x, wh.center.y, wh.center.z, s.q3.x, s.q3.y, s.q3.z, s.q3.w);
      else tb.write(wh.slot, wh.center.x, wh.center.y, wh.center.z, s.q3.x, s.q3.y, s.q3.z, s.q3.w);
    }
  }
}

function boxInertia(t: VehicleTuning): Vec3 {
  const m = t.mass;
  const w = t.chassisHalfExtents.x * 2;
  const h = t.chassisHalfExtents.y * 2 + 0.5; // a little taller than the collider: the cabin
  const l = t.chassisHalfExtents.z * 2;
  return {
    x: (m / 12) * (h * h + l * l) * t.inertiaScale.x,
    y: (m / 12) * (w * w + l * l) * t.inertiaScale.y,
    z: (m / 12) * (w * w + h * h) * t.inertiaScale.z,
  };
}
