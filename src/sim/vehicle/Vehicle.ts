/**
 * Arcade car on a Rapier rigid body, built from physical parts with explicit,
 * tunable assists on top.
 *
 *  - Chassis: one dynamic body with a cuboid collider and explicit mass properties.
 *  - Suspension: four raycasts, spring + split damping + bump stop + anti-roll.
 *  - Engine: torque curve over rpm, five automatic gears, reverse, rev limiter,
 *    engine braking. Engine rpm follows the driven wheels.
 *  - Wheels: each wheel has its own angular velocity. Longitudinal tyre force
 *    comes from the slip ratio and drives the wheel ODE, integrated implicitly so
 *    it is stable at 60 Hz even at standstill (burnouts and lock-ups emerge).
 *  - Tyres: lateral force from the slip angle with a peak-and-tail curve, a
 *    friction circle with the longitudinal force, and an impulse clamp so slow
 *    manoeuvres never chatter.
 *  - Assists: traction control, ABS, and a drift controller (yaw-rate command +
 *    velocity follow) that can each be scaled down to 0 to feel the raw model.
 *
 * Frame: +Z forward, +Y up, +X is the car's LEFT (right-handed). A positive
 * rotation about +Y turns the nose to the left, so "steer right" rotates by -steer.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleControls } from '../controls';
import * as M from '../math';
import type { Vec3 } from '../math';
import type { TransformBuffer } from '../transforms';
import type { VehicleTuning } from './tuning';

const WHEEL_FR = 0;
const WHEEL_FL = 1;
const WHEEL_RR = 2;
const WHEEL_RL = 3;
const WHEEL_SUBSTEPS = 2;
const RPM_PER_RAD_S = 60 / (2 * Math.PI);

export interface WheelState {
  /** Local attach point (recomputed by applyTuning). */
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
  /** Steering angle of this wheel (rad, + = right). */
  steer: number;
  /** Wheel angular velocity, rad/s (+ = rolling forward). */
  omega: number;
  /** Slip angle in radians (unsigned). */
  slipAngle: number;
  /** Longitudinal slip ratio (+ driving, - braking; -1 = locked). */
  slipRatio: number;
  /** Contact patch speeds along the wheel plane, m/s. */
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
  /** Current gear: 1..n, or -1 in reverse. */
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
  /** Largest driven-wheel slip ratio this step (wheelspin), and the most negative of all wheels (lock-up). */
  maxSlipRatio: number;
  minSlipRatio: number;
  /** True during the torque cut of a gear change. */
  shifting: boolean;
  /** World velocity, m/s. */
  vx: number;
  vy: number;
  vz: number;
}

const AXIS_Y: Readonly<Vec3> = { x: 0, y: 1, z: 0 };
const AXIS_Z: Readonly<Vec3> = { x: 0, y: 0, z: 1 };
const AXIS_RIGHT: Readonly<Vec3> = { x: -1, y: 0, z: 0 };

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
  collider: RAPIER.Collider;
  readonly wheels: WheelState[] = [];
  readonly slot: number;
  tuning: VehicleTuning;

  /** Commanded steering angle at the front axle (bicycle model), radians (+ = right). */
  steer = 0;
  drifting = false;
  driftTime = 0;
  boostMeter: number;
  boosting = false;
  airTime = 0;
  flippedTime = 0;
  /** 1..n forward, -1 reverse. */
  gear = 1;
  rpm: number;
  shiftTimer = 0;
  /** Blended grip multipliers (drop instantly, recover at gripBlendRate). */
  rearGripMul = 1;
  frontGripMul = 1;
  /** Body slip angle of the previous step, radians (drift controller damping). */
  private bodySlipPrev = 0;
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
    this.collider = world.createCollider(this.colliderDesc(), this.body);

    this.slot = transforms.allocate();
    // order: FR, FL, RR, RL (x = -ht is the right side)
    const defs: Array<[boolean, boolean]> = [
      [true, false],
      [true, true],
      [false, false],
      [false, true],
    ];
    for (const [isFront, isLeft] of defs) {
      this.wheels.push({
        local: M.v3(),
        isFront,
        isLeft,
        grounded: false,
        compression: 0,
        load: 0,
        contact: M.v3(),
        normal: M.v3(0, 1, 0),
        center: M.v3(),
        steer: 0,
        omega: 0,
        slipAngle: 0,
        slipRatio: 0,
        forwardSpeed: 0,
        lateralSpeed: 0,
        spin: 0,
        slot: transforms.allocate(),
      });
    }
    this.placeWheels();
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
      maxSlipRatio: 0,
      minSlipRatio: 0,
      shifting: false,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    this.writeTransforms(true);
  }

  private colliderDesc(): RAPIER.ColliderDesc {
    const t = this.tuning;
    const he = t.chassisHalfExtents;
    return RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z)
      .setTranslation(0, t.chassisOffsetY, 0)
      .setFriction(0.3)
      .setRestitution(0.05)
      .setMassProperties(t.mass, { x: 0, y: t.centerOfMassY, z: 0 }, boxInertia(t), { x: 0, y: 0, z: 0, w: 1 });
  }

  private placeWheels(): void {
    const t = this.tuning;
    const hb = t.wheelBase * 0.5;
    const ht = t.trackWidth * 0.5;
    for (const w of this.wheels) {
      M.set(w.local, w.isLeft ? ht : -ht, t.suspensionAttachY, w.isFront ? hb : -hb);
    }
  }

  /** Re-applies structural tuning (mass, inertia, collider size, wheel positions) to the live body. */
  applyTuning(): void {
    this.world.removeCollider(this.collider, false);
    this.collider = this.world.createCollider(this.colliderDesc(), this.body);
    this.body.setAngularDamping(this.tuning.angularDamping);
    this.placeWheels();
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
    M.rotate(s.right, s.q, AXIS_RIGHT);
    M.rotate(s.up, s.q, AXIS_Y);

    const forwardSpeed = M.dot(s.vel, s.fwd);
    const speed = M.length(s.vel);
    const absFwd = Math.abs(forwardSpeed);
    const throttle = M.clamp01(controls.throttle);
    const brakeIn = M.clamp01(controls.brake);
    const handbrake = controls.handbrake > 0.5;

    // ---- steering: rate limited, speed sensitive, Ackermann ------------------
    const authority = M.smoothstep(absFwd / t.steerSpeedRef);
    const maxSteer = M.lerp(t.maxSteerDegLow, t.maxSteerDegHigh, authority) * M.DEG;
    const target = M.clamp(controls.steer, -1, 1) * maxSteer;
    const returning = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
    const rate = (returning ? t.steerReturnRate : t.steerRate) * (t.maxSteerDegLow * M.DEG);
    this.steer = M.moveToward(this.steer, target, rate * dt);

    // ---- boost --------------------------------------------------------------
    this.boosting = controls.boost > 0.5 && this.boostMeter > 0;
    if (this.boosting) this.boostMeter = Math.max(0, this.boostMeter - t.boostDrain * dt);

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
    } else if (absFwd <= t.driftMinSpeed * 0.7 || grounded === 0) {
      // too slow, or fully airborne; a briefly lifted inner rear wheel does not end a drift
      this.drifting = false;
    }
    if (this.drifting) this.driftTime += dt;
    // front wheels: Ackermann on the commanded angle; in a drift they align with the velocity
    // (automatic counter-steer, what a drifting car visibly does) plus a share of the input
    const bodySlip = bodySlipDeg * M.DEG;
    if (this.drifting && t.driftAutoCounterSteer > 0 && absFwd > t.driftMinSpeed) {
      // velocity left of the nose (bodySlip > 0) -> wheels turn left (negative steer): steer = bodySlip... sign: + is right
      const aligned = bodySlip + M.clamp(controls.steer, -1, 1) * 0.25 * t.maxSteerDegLow * M.DEG;
      this.applyAckermann(M.lerp(this.steer, M.clamp(aligned, -0.9, 0.9), t.driftAutoCounterSteer));
    } else {
      this.applyAckermann(this.steer);
    }
    const rearTarget = handbrake ? t.handbrakeGripMul : this.drifting ? t.driftGripMul : 1;
    const frontTarget = this.drifting ? t.driftFrontGripMul : 1;
    const blend = t.gripBlendRate * dt;
    this.rearGripMul = rearTarget < this.rearGripMul ? rearTarget : M.moveToward(this.rearGripMul, rearTarget, blend);
    this.frontGripMul = frontTarget < this.frontGripMul ? frontTarget : M.moveToward(this.frontGripMul, frontTarget, blend);

    // ---- engine, gearbox, brakes: torques per wheel -----------------------------
    // reverse engages from a near-standstill with the brake pedal; throttle leaves it
    if (this.gear !== -1 && brakeIn > 0.5 && throttle === 0 && absFwd < 0.5) this.gear = -1;
    if (this.gear === -1 && (throttle > 0 || forwardSpeed > 0.5)) {
      this.gear = 1;
      this.shiftTimer = 0;
    }
    const drivePedal = this.gear === -1 ? brakeIn : throttle;
    const brakePedal = this.gear === -1 ? 0 : brakeIn;
    const ratio = (this.gear === -1 ? -t.reverseRatio : (t.gearRatios[this.gear - 1] ?? 1)) * t.finalDrive;

    // engine rpm follows the driven wheels; below idle the clutch slips
    let drivenOmega = 0;
    let drivenCount = 0;
    for (const w of this.wheels) {
      const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
      if (share > 0) {
        drivenOmega += w.omega;
        drivenCount++;
      }
    }
    drivenOmega = drivenCount > 0 ? drivenOmega / drivenCount : 0;
    const wheelRpm = Math.abs(drivenOmega * ratio) * RPM_PER_RAD_S;
    const targetRpm = Math.max(t.idleRpm, Math.min(t.redlineRpm * 1.05, wheelRpm));
    // small lag on the reported rpm (engine inertia) so the note does not jitter
    this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-dt / Math.max(0.01, t.engineInertia * 0.2)));

    // automatic shifting with a torque cut
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.gear > 0 && this.shiftTimer === 0 && grounded > 0) {
      if (wheelRpm > t.redlineRpm * t.shiftUpAt && this.gear < t.gearRatios.length) {
        this.gear++;
        this.shiftTimer = t.shiftTime;
      } else if (wheelRpm < t.redlineRpm * t.shiftDownAt && this.gear > 1) {
        this.gear--;
        this.shiftTimer = t.shiftTime;
      }
    }
    const shifting = this.shiftTimer > 0;

    // engine torque at the crank
    let crankTorque = 0;
    if (drivePedal > 0 && !shifting && wheelRpm < t.redlineRpm) {
      crankTorque = drivePedal * t.torqueMax * torqueCurve(t, Math.max(t.idleRpm, wheelRpm)) * (this.boosting ? t.boostTorqueMul : 1);
      if (this.gear === -1 && absFwd > t.maxReverseSpeed) crankTorque = 0;
    } else if (drivePedal === 0) {
      crankTorque = -t.engineBrakeTorque * (wheelRpm / t.redlineRpm);
    }
    // traction control: ease off when the driven wheels spin
    let tcCut = 1;
    if (t.tractionControl > 0 && crankTorque > 0) {
      let worst = 0;
      for (const w of this.wheels) {
        const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
        if (share > 0 && w.grounded) worst = Math.max(worst, w.slipRatio);
      }
      const excess = (worst - t.slipRatioPeak * 1.5) / (t.slipRatioPeak * 2);
      if (excess > 0) tcCut = Math.max(1 - t.tractionControl, 1 - excess * t.tractionControl);
    }
    const axleTorque = crankTorque * ratio * t.drivetrainEfficiency * tcCut;

    // ---- tyres: per wheel, with the wheel ODE integrated implicitly -------------
    const comHeight = t.chassisOffsetY + t.centerOfMassY;
    let maxSlipAng = 0;
    let maxSlipRatio = -1;
    let minSlipRatio = 1;
    const h = dt / WHEEL_SUBSTEPS;
    const wheelMass = t.mass * 0.25 * 0.6; // effective mass behind one contact patch, conservative
    for (const w of this.wheels) {
      const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
      const driveTorque = axleTorque * share * 0.5; // open differential: equal split
      const bias = w.isFront ? t.brakeFrontBias : 1 - t.brakeFrontBias;
      const pedalTorque = brakePedal * t.brakeTorque * bias * 0.5;
      const handTorque = handbrake && !w.isFront ? t.handbrakeTorque : 0;
      const brakeTorque = pedalTorque + handTorque;

      if (!w.grounded) {
        this.spinFreeWheel(w, driveTorque, brakeTorque, dt);
        w.slipAngle = 0;
        w.slipRatio = 0;
        w.forwardSpeed = forwardSpeed;
        w.lateralSpeed = 0;
        w.spin += w.omega * dt;
        continue;
      }

      // wheel frame on the contact plane (fronts steered; right = -steer about up)
      if (w.isFront && w.steer !== 0) {
        M.quatSetAxisAngle(s.q2, s.up.x, s.up.y, s.up.z, -w.steer);
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

      const mu = w.isFront ? t.muFront * this.frontGripMul : t.muRear * this.rearGripMul;
      const muLoad = mu * w.load;
      const r = t.wheelRadius;
      const vRef = Math.max(Math.abs(vFwd), t.slipLowSpeed);

      // --- lateral: slip angle -> force, peak/tail curve, impulse clamp
      w.slipAngle = Math.atan2(Math.abs(vLat), Math.max(Math.abs(vFwd), 0.5));
      if (w.slipAngle > maxSlipAng) maxSlipAng = w.slipAngle;
      const peakA = t.slipAngPeakDeg * M.DEG;
      const latCurve = w.slipAngle <= peakA ? w.slipAngle / peakA : 1 - (1 - t.slipAngTail) * M.clamp01((w.slipAngle - peakA) / (60 * M.DEG - peakA));
      let fLat = -Math.sign(vLat) * muLoad * latCurve;
      const latImpulseCap = (wheelMass * Math.abs(vLat)) / dt;
      if (Math.abs(fLat) > latImpulseCap) fLat = -Math.sign(vLat) * latImpulseCap;

      // --- longitudinal: wheel angular velocity solved per substep against the slip-ratio tyre
      let fLong = 0;
      for (let sub = 0; sub < WHEEL_SUBSTEPS; sub++) {
        const kappaPrev = (w.omega * r - vFwd) / vRef;
        let bt = brakeTorque;
        // ABS: release the pedal brake on a wheel that is locking (the handbrake is meant to lock)
        if (t.abs > 0 && pedalTorque > 0 && kappaPrev < -t.slipRatioPeak * 2) bt = pedalTorque * (1 - t.abs) + handTorque;
        const dir = w.omega !== 0 ? Math.sign(w.omega) : Math.sign(vFwd || 1);
        const torque = driveTorque - dir * bt;
        let omegaNew = solveWheel(t, w.omega, torque, vFwd, vRef, muLoad, h);
        // a brake can stop a wheel but never spin it the other way
        if (bt > 0 && omegaNew * dir < 0) omegaNew = 0;
        w.omega = omegaNew;
        w.slipRatio = (w.omega * r - vFwd) / vRef;
        longForce(t, w.slipRatio, muLoad);
        fLong = lfForce;
      }
      if (share > 0 && w.slipRatio > maxSlipRatio) maxSlipRatio = w.slipRatio;
      if (w.slipRatio < minSlipRatio) minSlipRatio = w.slipRatio;
      // rolling resistance
      fLong -= Math.sign(vFwd) * Math.min(Math.abs(vFwd) * 200, t.rollingResistance * w.load);

      // --- friction circle
      const mag = Math.hypot(fLat, fLong);
      if (mag > muLoad && mag > 0) {
        const kk = muLoad / mag;
        fLat *= kk;
        fLong *= kk;
      }
      w.spin += w.omega * dt;

      M.scale(s.force, s.wheelRight, fLat);
      M.addScaled(s.force, s.force, s.wheelFwd, fLong);
      // apply above the contact patch to limit body roll (arcade)
      M.addScaled(s.point, w.contact, s.up, (comHeight + t.wheelRadius) * t.tireForceHeight);
      body.addForceAtPoint(s.force, s.point, true);
    }

    // ---- boost thrust ---------------------------------------------------------
    if (this.boosting && grounded > 0) {
      M.scale(s.force, s.fwd, t.boostThrust);
      body.addForce(s.force, true);
    }

    // ---- drift assists (arcade layer) -------------------------------------------
    if (this.drifting && t.driftAssist > 0) {
      // the stick sets the drift angle: steer right (+) -> nose right of the velocity -> negative body slip
      const targetSlip = -M.clamp(controls.steer, -1, 1) * t.driftMaxAngleDeg * M.DEG;
      const err = targetSlip - bodySlip;
      const slipRate = (bodySlip - this.bodySlipPrev) / dt;
      const torque = M.clamp(err * t.driftAngleGain - slipRate * t.driftAngleDamping, -t.driftYawTorqueMax, t.driftYawTorqueMax) * t.driftAssist;
      M.scale(s.force, s.up, torque);
      body.addTorque(s.force, true);

      M.set(s.a, s.vel.x, 0, s.vel.z);
      const speedH = M.length(s.a);
      M.set(s.b, s.fwd.x, 0, s.fwd.z);
      M.normalize(s.b, s.b);
      if (speedH > 1 && M.dot(s.a, s.b) > 0) {
        M.scale(s.b, s.b, speedH);
        M.sub(s.b, s.b, s.a);
        M.scale(s.b, s.b, t.driftVelocityFollow * t.driftAssist);
        const accel = M.length(s.b);
        if (accel > t.driftFollowAccelMax) M.scale(s.b, s.b, t.driftFollowAccelMax / accel);
        M.scale(s.force, s.b, t.mass);
        body.addForce(s.force, true);
        const slip = Math.abs(Math.sin(bodySlipDeg * M.DEG));
        M.scale(s.force, s.a, -t.mass * t.driftSpeedLoss * slip);
        body.addForce(s.force, true);
      }
      if (throttle > 0 && grounded > 0) {
        M.scale(s.force, s.fwd, throttle * t.driftThrottlePush * t.driftAssist);
        body.addForce(s.force, true);
      }
    }

    // ---- aero, extra gravity, rest damping --------------------------------------
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
    if (grounded > 0 && speed < 0.5 && throttle === 0 && brakeIn === 0 && !handbrake) {
      M.scale(s.force, s.vel, -t.restDamping * t.mass);
      body.addForce(s.force, true);
      M.scale(s.force, s.angvel, -t.restDamping * t.mass * 0.5);
      body.addTorque(s.force, true);
    }

    // ---- air control and levelling -------------------------------------------
    const airborne = grounded === 0;
    if (airborne) {
      this.airTime += dt;
      const pitchIn = throttle - brakeIn; // positive torque about `right` (-X) lifts the nose
      const rollIn = controls.steer; // positive roll about +Z drops the right side
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

    this.bodySlipPrev = bodySlip;

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
    tm.load = shifting ? 0 : M.clamp01((crankTorque > 0 ? drivePedal : 0) * (0.5 + 0.5 * torqueCurve(t, this.rpm)) + (this.boosting ? 0.3 : 0));
    tm.airTime = this.airTime;
    tm.driftTime = this.driftTime;
    tm.maxSlipDeg = maxSlipAng / M.DEG;
    tm.maxSlipRatio = maxSlipRatio;
    tm.minSlipRatio = minSlipRatio;
    tm.shifting = shifting;
    tm.vx = s.vel.x;
    tm.vy = s.vel.y;
    tm.vz = s.vel.z;
  }

  private spinFreeWheel(w: WheelState, driveTorque: number, brakeTorque: number, dt: number): void {
    const t = this.tuning;
    const brakeSigned = -Math.sign(w.omega) * Math.min(brakeTorque, (Math.abs(w.omega) * t.wheelInertia) / dt);
    w.omega += ((driveTorque + brakeSigned) / t.wheelInertia) * dt;
    // the driveline cannot spin a free wheel past the rev limiter
    const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
    if (share > 0) {
      const ratio = Math.abs((this.gear === -1 ? t.reverseRatio : (t.gearRatios[this.gear - 1] ?? 1)) * t.finalDrive);
      const omegaMax = t.redlineRpm / RPM_PER_RAD_S / ratio;
      w.omega = M.clamp(w.omega, -omegaMax, omegaMax);
    }
  }

  /** Inner wheel steers more than the outer one by the wheelbase/track geometry. */
  private applyAckermann(d: number): void {
    const t = this.tuning;
    const fr = this.wheels[WHEEL_FR] as WheelState;
    const fl = this.wheels[WHEEL_FL] as WheelState;
    if (Math.abs(d) < 1e-4 || t.ackermann <= 0) {
      fr.steer = d;
      fl.steer = d;
      return;
    }
    const R = t.wheelBase / Math.tan(Math.abs(d));
    const inner = Math.atan(t.wheelBase / (R - t.trackWidth * 0.5));
    const outer = Math.atan(t.wheelBase / (R + t.trackWidth * 0.5));
    const innerA = M.lerp(Math.abs(d), inner, t.ackermann);
    const outerA = M.lerp(Math.abs(d), outer, t.ackermann);
    // steering right (+): the right wheel is inner
    if (d > 0) {
      fr.steer = innerA;
      fl.steer = outerA;
    } else {
      fr.steer = -outerA;
      fl.steer = -innerA;
    }
  }

  teleport(position: Vec3, yaw: number): void {
    const q = M.quatSetAxisAngle(scratch.q3, 0, 1, 0, yaw);
    this.body.setTranslation(position, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.drifting = false;
    this.bodySlipPrev = 0;
    this.airTime = 0;
    this.gear = 1;
    this.shiftTimer = 0;
    this.rpm = this.tuning.idleRpm;
    for (const w of this.wheels) {
      w.grounded = false;
      w.compression = 0;
      w.omega = 0;
      w.steer = 0;
      w.slipRatio = 0;
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
      // wheel rotation = body * steer(yaw, right = -steer) * spin(pitch)
      M.quatSetAxisAngle(s.q2, 0, 1, 0, -wh.steer);
      M.quatMul(s.q3, s.q, s.q2);
      M.quatSetAxisAngle(s.q2, 1, 0, 0, wh.spin);
      M.quatMul(s.q3, s.q3, s.q2);
      const drop = wh.grounded ? t.suspensionRestLength - wh.compression : t.suspensionRestLength;
      M.rotate(s.a, s.q, wh.local);
      M.add(s.point, s.pos, s.a);
      M.addScaled(wh.center, s.point, s.up, -drop);
      if (both) tb.writeBoth(wh.slot, wh.center.x, wh.center.y, wh.center.z, s.q3.x, s.q3.y, s.q3.z, s.q3.w);
      else tb.write(wh.slot, wh.center.x, wh.center.y, wh.center.z, s.q3.x, s.q3.y, s.q3.z, s.q3.w);
    }
  }
}

/** Engine torque fraction at an rpm, piecewise linear over the tuning's curve. */
export function torqueCurve(t: VehicleTuning, rpm: number): number {
  const x = M.clamp(rpm / t.redlineRpm, 0, 1.05);
  const x0 = t.idleRpm / t.redlineRpm;
  const xs = [x0, 0.35, 0.65, 0.9, 1.0];
  const ys = t.torqueCurve;
  if (x <= x0) return ys[0];
  for (let i = 1; i < 5; i++) {
    const x1 = xs[i] as number;
    if (x <= x1) {
      const xa = xs[i - 1] as number;
      return M.lerp(ys[i - 1] as number, ys[i] as number, (x - xa) / (x1 - xa));
    }
  }
  return ys[4];
}

/**
 * One substep of the wheel rotation: find ω such that
 *   I (ω - ω₀) / h = T - r·F(κ(ω)),   κ = (ω r - v) / vRef.
 * F is piecewise linear in κ (slope muLoad/peak up to the peak, then a decaying
 * plateau), so the linear-regime solution is closed-form and unconditionally
 * stable; if it lands past the peak the plateau solution is used, and if the two
 * disagree the answer sits on the boundary. No stiff ODE, no explicit overshoot.
 */
function solveWheel(t: VehicleTuning, omega0: number, torque: number, vFwd: number, vRef: number, muLoad: number, h: number): number {
  const r = t.wheelRadius;
  const I = t.wheelInertia;
  const peak = t.slipRatioPeak;
  const slope = muLoad / peak;
  const A = I / h;
  const B = (slope * r * r) / vRef;
  const omegaLin = (A * omega0 + torque + (slope * r * vFwd) / vRef) / (A + B);
  const kLin = (omegaLin * r - vFwd) / vRef;
  if (Math.abs(kLin) <= peak) return omegaLin;
  const sgn = Math.sign(kLin);
  const kPrev = Math.abs((omega0 * r - vFwd) / vRef);
  const tail = 1 - (1 - t.slipRatioTail) * M.clamp01((Math.max(kPrev, peak) - peak) / (1 - peak));
  const omegaSat = omega0 + (h * (torque - sgn * muLoad * tail * r)) / I;
  const kSat = (omegaSat * r - vFwd) / vRef;
  if (sgn * kSat >= peak) return omegaSat;
  return (sgn * peak * vRef + vFwd) / r;
}

/** Outputs of `longForce` (module scratch: no allocation in the wheel loop). */
let lfForce = 0;
let lfSlope = 0;

/**
 * Longitudinal tyre force from the slip ratio: linear up to the peak, then a
 * decay to the tail. Leaves the force and the local slope dF/dκ (0 when
 * saturated, which the implicit wheel integrator needs) in `lfForce` / `lfSlope`.
 */
function longForce(t: VehicleTuning, kappa: number, muLoad: number): void {
  const peak = t.slipRatioPeak;
  const a = Math.abs(kappa);
  if (a <= peak) {
    lfSlope = muLoad / peak;
    lfForce = lfSlope * kappa;
    return;
  }
  const tail = 1 - (1 - t.slipRatioTail) * M.clamp01((a - peak) / (1 - peak));
  lfForce = Math.sign(kappa) * muLoad * tail;
  lfSlope = 0;
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
