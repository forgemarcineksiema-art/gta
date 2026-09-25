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
import { GROUP_WATER, GROUPS_CHASSIS_FLIPPED, GROUPS_CHASSIS_UPRIGHT, GROUPS_HOVER_FLIPPED, GROUPS_HOVER_UPRIGHT, QUERY_HOVER, QUERY_NOT_PROP } from '../collision';
import type { VehicleControls } from '../controls';
import * as M from '../math';
import type { Vec3 } from '../math';
import type { TransformBuffer } from '../transforms';
import { ASPHALT, DIRT, GRASS, type SurfaceKind, type SurfaceReader } from '../city/surface';
import type { VehicleTuning } from './tuning';

const WHEEL_FR = 0;
const WHEEL_FL = 1;
const WHEEL_RR = 2;
const WHEEL_RL = 3;
const WHEEL_SUBSTEPS = 2;
/** A rise in a wheel's contact this big in one step (m) is a thing met, climbed at `climbSlope`; a smaller one is the road. */
const CLIMB_STEP = 0.1;
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
  /** The tyre's force on the road this step, N (0 in the air, and always on the hovercraft's cushion: M8.8 slice 18). */
  tyreForce: number;
  /** Contact patch speeds along the wheel plane, m/s. */
  forwardSpeed: number;
  lateralSpeed: number;
  /** Rolling angle for the visual wheel. */
  spin: number;
  /** The ground under it (M8.8 slice 9): `ASPHALT`, `GRASS` or `DIRT`; asphalt in the air. */
  surface: SurfaceKind;
  /** The collider its ray stands on (a car's, under the monster truck's wheels: M8.8 slice 12), -1 in the air. */
  hitHandle: number;
  /** Its ray stands on the sea (M8.8 slice 20: the hovercraft's cushion). */
  water: boolean;
  /** The ray's length to its contact last step (m; the whole ray in the air): the climb's memory. */
  rayD: number;
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
  /** Down on two wheels: the bike and its rider in a fall (M8.8 slice 14), until they are stood up again. */
  tumbling: boolean;
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
  /** Vertical speed absorbed on the step the car touched down after a flight, m/s (0 otherwise). */
  landingImpact: number;
  /** Brake pedal 0..1 (the input, for brake lights). */
  brake: number;
  /** Metres covered in the current drift. */
  driftDistance: number;
  /** World velocity, m/s. */
  vx: number;
  vy: number;
  vz: number;
  /** Yaw rate about world up, rad/s (+ = nose turning left). */
  yawRate: number;
  /** Acceleration in the car's frame, in g (longitudinal + = forward, lateral + = left). */
  gLong: number;
  gLat: number;
  gVert: number;
  /** Speed change from body contacts (walls, props) this step, m/s; 0 when free. */
  impact: number;
  /** Collider handle of the strongest contact this step, or -1. */
  hitHandle: number;
  /** Summed normal impulse of that contact, N·s. */
  hitImpulse: number;
  /** 0..1 how hard the body is scraping along a wall right now. */
  scrape: number;
  /** Side of the current wall contact: +1 left, -1 right, 0 none. */
  contactSide: number;
  /** World point and normal (from the wall into the car) of the current body contact. */
  contactX: number;
  contactY: number;
  contactZ: number;
  contactNx: number;
  contactNy: number;
  contactNz: number;
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
  com: M.v3(),
  rel: M.v3(),
  fSum: M.v3(),
  tSum: M.v3(),
  q: { x: 0, y: 0, z: 0, w: 1 },
  q2: { x: 0, y: 0, z: 0, w: 1 },
  q3: { x: 0, y: 0, z: 0, w: 1 },
  n: M.v3(),
  cp: M.v3(),
};

/** Velocity of a world point on the body: v + ω × (p − com). Pure JS, no WASM call. */
function velAt(p: Vec3, out: Vec3): Vec3 {
  const s = scratch;
  M.sub(s.rel, p, s.com);
  M.cross(out, s.angvel, s.rel);
  return M.add(out, out, s.vel);
}

/** Accumulate a force at a world point (force + torque about the centre of mass). */
function forceAt(f: Vec3, p: Vec3): void {
  const s = scratch;
  M.add(s.fSum, s.fSum, f);
  M.sub(s.rel, p, s.com);
  M.cross(s.rel, s.rel, f);
  M.add(s.tSum, s.tSum, s.rel);
}

export class Vehicle {
  readonly body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  readonly wheels: WheelState[] = [];
  readonly slot: number;
  tuning: VehicleTuning;

  /** Ramped steering input in [-1, 1] before the sensitivity curve. */
  steerRaw = 0;
  /** Steering angle at the front axle (bicycle model), radians (+ = right). */
  steer = 0;
  drifting = false;
  /** Throttle and boost are ignored while a wreck cuts the engine. Brakes and steering still work. */
  engineCut = false;
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
  /** Outside grip factor on every tyre (a spike strip's puncture, M4 slice 6); 1 is sound tyres. */
  gripMul = 1;
  /** A constant sideways force at the rear axle, N, + to the right (a puncture pulling the car); 0 is none. */
  lateralPull = 0;
  /** Outside factor on the engine's torque (a hurt car's, M8.8 slice 7); 1 is a sound engine. */
  torqueMul = 1;
  /** On two wheels (M8.8 slice 14): the lean now and the one held (rad, + right side down), and a fall's seconds left. */
  lean = 0;
  leanTarget = 0;
  tumbleLeft = 0;
  /** The ground the wheels read (the city's surface map, M8.8 slice 9); null is asphalt everywhere. */
  ground: SurfaceReader | null = null;
  /** Body slip angle of the previous step, radians (drift controller damping). */
  private bodySlipPrev = 0;
  /** Drift side (+1 right) and the rate-limited commanded angle in degrees (+ = right). */
  driftDir = 1;
  driftTargetDeg = 0;
  driftDistance = 0;
  private driftExitTimer = 0;
  private wasAirborne = false;
  private collidesWithTerrain = false;
  private readonly prevVel = M.v3();
  // body contacts (walls, props), read back from Rapier's narrow phase each step
  private contactImpulse = 0;
  private pairImpulse = 0;
  private bestPairImpulse = 0;
  private bestPairHandle = -1;
  private contactCount = 0;
  private wallTouch = false;
  private pairFixed = false;
  private contactSide = 0;
  private wallTimer = 0;
  private readonly wallNormal = M.v3();
  private readonly contactNormal = M.v3();
  private readonly contactPoint = M.v3();
  private readonly onManifold = (m: RAPIER.TempContactManifold, flipped: boolean): void => {
    let imp = 0;
    const n = m.numContacts();
    for (let i = 0; i < n; i++) imp += m.contactImpulse(i);
    if (imp <= 0) return;
    this.pairImpulse += imp;
    const nrm = scratch.n;
    m.normal(nrm);
    // the manifold normal points from the first collider to the second; make it point into the car
    if (!flipped) M.scale(nrm, nrm, -1);
    M.addScaled(this.contactNormal, this.contactNormal, nrm, imp);
    this.contactImpulse += imp;
    if (this.contactCount === 0) {
      const p = m.solverContactPoint(0, scratch.cp);
      if (p) M.copy(this.contactPoint, p);
    }
    this.contactCount++;
    if (this.pairFixed && Math.abs(nrm.y) < 0.5) this.wallTouch = true;
  };
  private readonly onPair = (other: RAPIER.Collider): void => {
    const parent = other.parent();
    this.pairFixed = parent === null || parent.isFixed();
    this.pairImpulse = 0;
    this.world.contactPair(this.collider, other, this.onManifold);
    if (this.pairImpulse > this.bestPairImpulse) {
      this.bestPairImpulse = this.pairImpulse;
      this.bestPairHandle = other.handle;
    }
  };
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
        tyreForce: 0,
        forwardSpeed: 0,
        lateralSpeed: 0,
        spin: 0,
        surface: ASPHALT,
        hitHandle: -1,
        water: false,
        rayD: 0,
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
      tumbling: false,
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
      landingImpact: 0,
      brake: 0,
      driftDistance: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yawRate: 0,
      gLong: 0,
      gLat: 0,
      gVert: 0,
      impact: 0,
      scrape: 0,
      contactSide: 0,
      contactX: 0,
      contactY: 0,
      contactZ: 0,
      contactNx: 0,
      contactNy: 0,
      contactNz: 0,
      hitHandle: -1,
      hitImpulse: 0,
    };
    this.writeTransforms(true);
  }

  private colliderDesc(): RAPIER.ColliderDesc {
    const t = this.tuning;
    const he = t.chassisHalfExtents;
    return RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z)
      .setTranslation(0, t.chassisOffsetY, 0)
      .setFriction(t.wallFriction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(t.wallRestitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      // the hovercraft's chassis passes the slipways' gates (M8.8 slice 19)
      .setCollisionGroups(t.hover > 0 ? GROUPS_HOVER_UPRIGHT : GROUPS_CHASSIS_UPRIGHT)
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
    body.worldCom(s.com);
    M.set(s.fSum, 0, 0, 0);
    M.set(s.tSum, 0, 0, 0);
    M.rotate(s.fwd, s.q, AXIS_Z);
    M.rotate(s.right, s.q, AXIS_RIGHT);
    M.rotate(s.up, s.q, AXIS_Y);

    const forwardSpeed = M.dot(s.vel, s.fwd);
    const speed = M.length(s.vel);
    const absFwd = Math.abs(forwardSpeed);
    const throttle = this.engineCut ? 0 : M.clamp01(controls.throttle);
    const brakeIn = M.clamp01(controls.brake);
    const handbrake = controls.handbrake > 0.5;

    // ---- steering: ramped input, sensitivity curve, speed-sensitive lock, Ackermann ----
    // The keyboard is digital, so the input itself is shaped: it ramps at steerRate locks/s,
    // passes through a power curve (a short tap is a small correction, holding is full lock),
    // and the lock shrinks with speed. `steer` is the resulting angle at the front axle.
    const authority = M.smoothstep(absFwd / t.steerSpeedRef);
    const maxSteer = M.lerp(t.maxSteerDegLow, t.maxSteerDegHigh, authority) * M.DEG;
    const target = M.clamp(controls.steer, -1, 1);
    const returning = Math.abs(target) < Math.abs(this.steerRaw) || Math.sign(target) !== Math.sign(this.steerRaw);
    this.steerRaw = M.moveToward(this.steerRaw, target, (returning ? t.steerReturnRate : t.steerRate) * dt);
    this.steer = Math.sign(this.steerRaw) * Math.pow(Math.abs(this.steerRaw), t.steerCurve) * maxSteer;

    // ---- boost --------------------------------------------------------------
    this.boosting = !this.engineCut && controls.boost > 0.5 && this.boostMeter > 0;
    if (this.boosting) this.boostMeter = Math.max(0, this.boostMeter - t.boostDrain * dt);

    // ---- suspension raycasts --------------------------------------------------
    // on two wheels (M8.8 slice 14) the rays go straight down, so a lean never lifts them off the road; the hovercraft's
    // cushion (slice 18) too, so its springs never push it along
    const twoWheel = t.twoWheel > 0, hover = t.hover > 0, plumb = twoWheel || hover;
    if (plumb) M.set(s.rayDir, 0, -1, 0);
    else M.scale(s.rayDir, s.up, -1);
    const rayLen = t.suspensionRestLength + t.wheelRadius;
    // the hovercraft's cushion stands on the sea too (M8.8 slice 19); no other car's ray meets it
    const rayGroups = hover ? QUERY_HOVER : QUERY_NOT_PROP;
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
      const hit = this.world.castRayAndGetNormal(this.ray, rayLen, true, undefined, rayGroups, undefined, body);
      if (hit && hit.timeOfImpact > 0) {
        let d = hit.timeOfImpact;
        // a tall wheel rolls up onto what it meets (the monster truck onto a car, M8.8 slice 12): from the ground the
        // contact rises no faster than `climbSlope` of the way the car goes forward, where it would jump in one step
        if (t.climbSlope > 0 && w.grounded && w.rayD - d > CLIMB_STEP) d = Math.max(d, w.rayD - t.climbSlope * absFwd * dt);
        w.rayD = d;
        w.grounded = true;
        grounded++;
        w.compression = rayLen - d;
        M.addScaled(w.contact, s.point, s.rayDir, d);
        M.addScaled(w.center, s.point, s.rayDir, Math.max(0, d - t.wheelRadius));
        w.normal.x = hit.normal.x;
        w.normal.y = hit.normal.y;
        w.normal.z = hit.normal.z;
        w.hitHandle = hit.collider.handle;
        w.water = hover && ((hit.collider.collisionGroups() >>> 16) & GROUP_WATER) !== 0;
        if (M.dot(w.normal, s.up) < 0) M.scale(w.normal, w.normal, -1);
      } else {
        w.grounded = false;
        w.compression = 0;
        w.load = 0;
        w.hitHandle = -1;
        w.water = false;
        w.rayD = rayLen;
        M.addScaled(w.center, s.point, s.rayDir, t.suspensionRestLength);
        M.copy(w.contact, w.center);
        M.copy(w.normal, s.up);
      }
    }

    // ---- touchdown: sticky landing before the suspension sees the impact -----------
    // most of the vertical speed and spin is absorbed at the instant of contact, so the
    // dampers work on what is left and the car plants instead of being thrown back up
    // The same rule handles a landing and the kink at the foot of a ramp: the speed
    // into the surface is mostly absorbed, and the total speed is kept (arcade momentum)
    // by redirecting it along the surface.
    let landingImpact = 0;
    if (grounded > 0) {
      M.set(s.a, 0, 0, 0);
      for (const w of this.wheels) if (w.grounded) M.add(s.a, s.a, w.normal);
      M.normalize(s.a, s.a);
      const vn = M.dot(s.vel, s.a);
      if (vn < -2 && (this.wasAirborne || vn < -3.5)) {
        landingImpact = -vn;
        // a landing from a flight costs a little; a kink in the road only redirects
        const total = M.length(s.vel) * (this.wasAirborne ? t.landingKeepMomentum : 1);
        const vnKept = vn * t.landingRetainVertical;
        M.addScaled(s.b, s.vel, s.a, -vn); // tangential part
        const ht = M.length(s.b);
        const htNew = Math.max(ht, Math.sqrt(Math.max(0, total * total - vnKept * vnKept)));
        if (ht > 0.5) M.scale(s.b, s.b, htNew / ht);
        M.addScaled(s.b, s.b, s.a, vnKept);
        body.setLinvel(s.b, true);
        body.setAngvel({ x: s.angvel.x * t.landingRetainSpin, y: s.angvel.y, z: s.angvel.z * t.landingRetainSpin }, true);
        body.linvel(s.vel);
        body.angvel(s.angvel);
      }
    }
    // ---- body contacts: walls, buildings, props ----------------------------------
    // Rapier solved these during the last step; the impulses are read back for the
    // impact telemetry, and while the body scrapes a vertical face a yaw torque turns
    // the nose along the wall. Left alone, corner friction does the opposite: the nose
    // digs in, the car pivots into the wall and stops dead from 45 degrees up.
    this.contactImpulse = 0;
    this.contactCount = 0;
    this.bestPairImpulse = 0;
    this.bestPairHandle = -1;
    this.wallTouch = false;
    this.contactSide = 0;
    M.set(this.contactNormal, 0, 0, 0);
    this.world.contactPairsWith(this.collider, this.onPair);
    const impact = this.contactImpulse / t.mass;
    let scrape = 0;
    const touching = this.wallTouch && this.contactImpulse > 0;
    if (touching) {
      M.normalize(this.wallNormal, this.contactNormal); // from the wall into the car
      this.wallTimer = t.wallMemory;
      if (impact > t.wallHitSpeed) {
        // the hit itself: keep only part of the spin the corner impulse gave the body
        body.setAngvel({ x: s.angvel.x * t.wallHitRetainSpin, y: s.angvel.y * t.wallHitRetainSpin, z: s.angvel.z * t.wallHitRetainSpin }, true);
        body.angvel(s.angvel);
      }
    } else if (this.wallTimer > 0) {
      // the bounce: the car leaves the wall for a few steps and comes back; keep aligning
      this.wallTimer -= dt;
    }
    if (touching || this.wallTimer > 0) {
      M.copy(s.a, this.wallNormal);
      const into = -M.dot(s.fwd, s.a); // + when the nose points into the wall
      const noseDeg = Math.asin(M.clamp(Math.abs(into), 0, 1)) / M.DEG;
      // Sliding: the nose is turned toward the direction of travel along the wall, so
      // the car ends up pointing where it is going and never swings the long way round.
      // Nearly stopped: the driver's intent decides. Throttle with the nose in peels the
      // car off along the wall, to the steered side when it is square on (contact is
      // intermittent while it turns, hence the memory); with no input a stopped car
      // never turns on its own.
      M.addScaled(s.b, s.vel, s.a, -M.dot(s.vel, s.a));
      const vt = M.length(s.b);
      let active = M.clamp01(vt / 5);
      let aligning = false;
      if (vt >= 2) {
        if (noseDeg < t.wallAlignMaxDeg) {
          M.scale(s.b, s.b, 1 / vt);
          aligning = true;
        }
      } else if (throttle > 0.3 && into > 0) {
        active = 1;
        const steer = M.clamp(controls.steer, -1, 1);
        M.addScaled(s.b, s.fwd, s.a, -M.dot(s.fwd, s.a));
        const tl = M.length(s.b);
        if (Math.abs(steer) >= 0.2) {
          M.cross(s.b, s.a, s.up);
          M.normalize(s.b, s.b);
          if (M.dot(s.b, s.right) * steer < 0) M.scale(s.b, s.b, -1);
          aligning = true;
        } else if (tl > 1e-3 && noseDeg < 60) {
          M.scale(s.b, s.b, 1 / tl);
          aligning = true;
        }
      }
      if (aligning && grounded > 0) {
        M.cross(s.point, s.b, s.fwd);
        const err = Math.atan2(M.dot(s.point, s.up), M.dot(s.b, s.fwd));
        const yawInertia = boxInertia(t).y;
        const accel = M.clamp(-t.wallAlignGain * err - t.wallAlignDamping * s.angvel.y, -t.wallAlignGain, t.wallAlignGain);
        s.tSum.y += yawInertia * accel * active;
      }
      if (touching) {
        scrape = M.clamp01(vt / 12) * M.clamp01(impact / 0.04);
        this.contactSide = M.dot(s.a, s.right) > 0 ? 1 : -1; // the normal points away from the wall
      }
    }

    this.wasAirborne = grounded === 0;

    // ---- spring + damper (with anti-roll) ---------------------------------
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i] as WheelState;
      if (!w.grounded) continue;
      M.rotate(s.a, s.q, w.local);
      M.add(s.point, s.pos, s.a);
      velAt(s.point, s.b);
      const vAlongRay = M.dot(s.b, s.rayDir); // + = compressing
      let f = t.suspensionStiffness * w.compression;
      f += (vAlongRay > 0 ? t.suspensionDampingCompression : t.suspensionDampingRebound) * vAlongRay;
      // progressive damping on compression: a landing is absorbed by the damper, not by the bump stop
      if (vAlongRay > 0) f += t.suspensionDampingProgressive * vAlongRay * vAlongRay;
      const over = w.compression - t.suspensionRestLength;
      if (over > 0) f += t.bumpStopStiffness * over;
      const other = this.wheels[i ^ 1] as WheelState;
      if (other.grounded) f += t.antiRollStiffness * (w.compression - other.compression);
      // impulse cap: a wheel may stop its share of the chassis within the step, never reverse it
      const stopForce = t.suspensionStiffness * w.compression + (t.mass * 0.25 * Math.max(0, vAlongRay)) / dt;
      if (f > stopForce) f = stopForce;
      if (f < 0) f = 0;
      w.load = f;
      // two wheels and the cushion push straight up: the roll is the upright controller's, the cushion never drives
      M.scale(s.force, plumb ? AXIS_Y : s.up, f);
      forceAt(s.force, s.point);
    }

    // ---- drift state ----------------------------------------------------------
    const rl = this.wheels[WHEEL_RL] as WheelState;
    const rr = this.wheels[WHEEL_RR] as WheelState;
    const rearGrounded = rl.grounded || rr.grounded;
    M.set(s.rearLocal, 0, 0, -t.wheelBase * 0.5);
    M.rotate(s.a, s.q, s.rearLocal);
    M.add(s.point, s.pos, s.a);
    velAt(s.point, s.b);
    const rearFwd = M.dot(s.b, s.fwd);
    const rearLat = M.dot(s.b, s.right);
    const rearSlip = Math.atan2(Math.abs(rearLat), Math.max(0.5, Math.abs(rearFwd)));
    const bodySlipDeg = (Math.atan2(M.dot(s.vel, s.right), Math.max(0.5, forwardSpeed)) * 180) / Math.PI;
    // entry: handbrake while turning, a brake tap while turning hard at speed, or the rear stepping out
    const turning = Math.abs(controls.steer) > 0.2;
    const brakeEntry = t.brakeDriftEntry > 0 && brakeIn > 0.5 && Math.abs(controls.steer) > 0.6 && absFwd > 14;
    // the hovercraft has no drift controller (it slides on its own)
    if (!hover && rearGrounded && absFwd > t.driftMinSpeed) {
      if (!this.drifting && ((handbrake && turning) || brakeEntry || rearSlip > t.driftEnterDeg * M.DEG)) {
        this.drifting = true;
        this.driftTime = 0;
        this.driftDistance = 0;
        this.driftExitTimer = 0;
        // + = drifting to the right (nose right of the velocity, negative body slip)
        this.driftDir = Math.abs(controls.steer) > 0.05 ? Math.sign(controls.steer) : bodySlipDeg < 0 ? 1 : -1;
        this.driftTargetDeg = -bodySlipDeg;
      } else if (this.drifting) {
        // the drift ends only after the car has been asked to straighten and has done so for a while
        const wantsOut = !handbrake && Math.abs(this.driftTargetDeg) < 2 && rearSlip < t.driftExitDeg * M.DEG;
        this.driftExitTimer = wantsOut ? this.driftExitTimer + dt : 0;
        if (this.driftTime > t.driftMinTime && this.driftExitTimer > t.driftExitHold) this.drifting = false;
      }
    } else if (hover || absFwd <= t.driftMinSpeed * 0.7 || grounded === 0) {
      // too slow, or fully airborne; a briefly lifted inner rear wheel does not end a drift
      this.drifting = false;
    }
    if (this.drifting) {
      this.driftTime += dt;
      this.driftDistance += speed * dt;
      // commanded drift angle (+ = right), rate limited so keyboard taps modulate instead of cancelling
      const st = M.clamp(controls.steer, -1, 1);
      let cmd: number;
      if (st * this.driftDir > 0.05) cmd = st * t.driftMaxAngleDeg;
      else if (Math.abs(st) <= 0.05) cmd = handbrake ? this.driftDir * t.driftCentreHold * t.driftMaxAngleDeg : 0;
      else cmd = st * t.driftMaxAngleDeg; // counter-steer: shrinks the angle, swaps sides if held
      const growing = Math.abs(cmd) > Math.abs(this.driftTargetDeg) && cmd * this.driftTargetDeg >= 0;
      this.driftTargetDeg = M.moveToward(this.driftTargetDeg, cmd, (growing ? t.driftAngleRateIn : t.driftAngleRateOut) * dt);
      if (this.driftTargetDeg * this.driftDir < -1) this.driftDir = -this.driftDir;
    } else {
      this.driftTargetDeg = 0;
    }
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
    // power oversteer: full throttle at full lock above drift speed loosens the rear so steering alone can start a slide
    const powerOver = 1 - t.powerOversteer * throttle * Math.min(1, Math.abs(this.steerRaw)) * M.clamp01((absFwd - 20) / 12);
    const rearTarget = handbrake ? t.handbrakeGripMul : this.drifting ? t.driftGripMul : powerOver;
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
    // the hovercraft's engine turns the fan: its revs follow the pedal (the fan's pitch), never the road
    const fanPedal = hover ? Math.max(throttle, brakeIn * 0.5, this.boosting ? 1 : 0) : 0;
    const wheelRpm = hover ? t.idleRpm + (t.redlineRpm * 0.95 - t.idleRpm) * fanPedal : Math.abs(drivenOmega * ratio) * RPM_PER_RAD_S;
    const targetRpm = Math.max(t.idleRpm, Math.min(t.redlineRpm * 1.05, wheelRpm));
    // small lag on the reported rpm (engine inertia) so the note does not jitter
    this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-dt / Math.max(0.01, t.engineInertia * 0.2)));

    // automatic shifting with a torque cut
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (!hover && this.gear > 0 && this.shiftTimer === 0 && grounded > 0) {
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
      crankTorque = drivePedal * t.torqueMax * this.torqueMul * torqueCurve(t, Math.max(t.idleRpm, wheelRpm)) * (this.boosting ? t.boostTorqueMul : 1);
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

    // limited-slip differential: torque moves from the faster wheel of a driven axle to the slower one
    const lsdCap = t.lsdPreload + t.lsdLock * 0.5 * Math.abs(axleTorque);
    const lsdTorque = (left: WheelState, right: WheelState): number => M.clamp((left.omega - right.omega) * t.lsdStiffness, -lsdCap, lsdCap);
    const lsdFront = t.driveFrontShare > 0 ? lsdTorque(this.wheels[WHEEL_FL] as WheelState, this.wheels[WHEEL_FR] as WheelState) : 0;
    const lsdRear = t.driveFrontShare < 1 ? lsdTorque(this.wheels[WHEEL_RL] as WheelState, this.wheels[WHEEL_RR] as WheelState) : 0;

    // ---- tyres: per wheel, with the wheel ODE integrated implicitly -------------
    const staticLoad = (t.mass * (9.81 + t.extraGravity)) / 4;
    const comHeight = t.chassisOffsetY + t.centerOfMassY;
    let maxSlipAng = 0;
    let maxSlipRatio = -1;
    let minSlipRatio = 1;
    const h = dt / WHEEL_SUBSTEPS;
    const wheelMass = t.mass * 0.25 * 0.6; // effective mass behind one contact patch, conservative
    for (const w of this.wheels) {
      const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
      const lsd = w.isFront ? lsdFront : lsdRear;
      const driveTorque = axleTorque * share * 0.5 + (w.isLeft ? -lsd : lsd); // equal split plus the diff's transfer
      const bias = w.isFront ? t.brakeFrontBias : 1 - t.brakeFrontBias;
      // in a drift at speed the handbrake is the drift button (rear grip is already cut); it brakes on a straight or when slow
      const handIsBrake = handbrake && !w.isFront && !(this.drifting && absFwd > t.driftMinSpeed);
      const pedalTorque = (this.drifting && brakeEntry ? 0 : brakePedal) * t.brakeTorque * bias * 0.5;
      const handTorque = handIsBrake ? t.handbrakeTorque : 0;
      const brakeTorque = pedalTorque + handTorque;

      // the cushion has no tyres (M8.8 slice 18): its 'wheels' roll with the ground under them and push nothing
      if (hover) {
        velAt(w.contact, s.b);
        w.forwardSpeed = M.dot(s.b, s.fwd);
        w.lateralSpeed = M.dot(s.b, s.right);
        w.omega = w.grounded ? w.forwardSpeed / t.wheelRadius : w.omega;
        w.spin += w.omega * dt;
        w.slipAngle = 0;
        w.slipRatio = 0;
        w.tyreForce = 0;
        w.surface = w.grounded && this.ground ? this.ground.at(w.contact.x, w.contact.z) : ASPHALT;
        continue;
      }
      if (!w.grounded) {
        this.spinFreeWheel(w, driveTorque, brakeTorque, dt);
        w.slipAngle = 0;
        w.slipRatio = 0;
        w.forwardSpeed = forwardSpeed;
        w.lateralSpeed = 0;
        w.spin += w.omega * dt;
        w.surface = ASPHALT;
        w.tyreForce = 0;
        continue;
      }
      // the ground under the tyre (M8.8 slice 9): grass and dirt take grip and drag at the tyre
      const ground = this.ground ? this.ground.at(w.contact.x, w.contact.z) : ASPHALT;
      w.surface = ground;
      const groundGrip = ground === GRASS ? t.grassGrip : ground === DIRT ? t.dirtGrip : 1;
      const groundRoll = ground === GRASS ? t.grassRoll : ground === DIRT ? t.dirtRoll : 1;

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

      velAt(w.contact, s.b);
      const vFwd = M.dot(s.b, s.wheelFwd);
      const vLat = M.dot(s.b, s.wheelRight);
      w.forwardSpeed = vFwd;
      w.lateralSpeed = vLat;

      // load sensitivity: a heavily loaded tyre gives less grip per newton
      const loadMul = M.clamp(1 - t.loadSensitivity * (w.load / staticLoad - 1), 0.6, 1.3);
      const mu = (w.isFront ? t.muFront * this.frontGripMul : t.muRear * this.rearGripMul) * loadMul * this.gripMul * groundGrip;
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
      // rolling resistance (on a load capped at twice the static share, so a landing spike does not brake the car)
      fLong -= Math.sign(vFwd) * Math.min(Math.abs(vFwd) * 200, t.rollingResistance * groundRoll * Math.min(w.load, 0.5 * t.mass * 9.81));

      // --- friction circle
      const mag = Math.hypot(fLat, fLong);
      if (mag > muLoad && mag > 0) {
        const kk = muLoad / mag;
        fLat *= kk;
        fLong *= kk;
      }
      w.spin += w.omega * dt;
      w.tyreForce = Math.hypot(fLat, fLong);

      M.scale(s.force, s.wheelRight, fLat);
      M.addScaled(s.force, s.force, s.wheelFwd, fLong);
      // apply above the contact patch to limit body roll (arcade)
      M.addScaled(s.point, w.contact, s.up, (comHeight + t.wheelRadius) * t.tireForceHeight);
      forceAt(s.force, s.point);
    }

    // ---- the air cushion: fan, skirt drag, rudders (M8.8 slice 18) ------------------------
    if (hover) {
      // the fan pushes along the nose, in the air too; the brake reverses its pitch to half
      const push = (throttle - 0.5 * brakeIn) * t.fanThrust * this.torqueMul;
      M.scale(s.force, s.fwd, push);
      M.add(s.fSum, s.fSum, s.force);
      if (grounded > 0) {
        // the skirt drags on the ground: along the nose at the middle, across it half at the bow and half at the stern;
        // on the sea it bites (`hoverWaterGrip`), so there it runs where on a road it slides
        let wet = 0;
        for (const w of this.wheels) if (w.grounded && w.water) wet++;
        const side = t.hoverSideDrag * (1 + (t.hoverWaterGrip - 1) * wet / grounded);
        M.scale(s.force, s.fwd, -t.hoverDrag * forwardSpeed);
        M.add(s.fSum, s.fSum, s.force);
        for (let end = 1; end >= -1; end -= 2) {
          M.addScaled(s.point, s.pos, s.fwd, end * t.wheelBase * 0.5);
          velAt(s.point, s.b);
          M.scale(s.force, s.right, -0.5 * side * M.dot(s.b, s.right));
          forceAt(s.force, s.point);
        }
      }
      // the rudders in the fan's wash or the airflow of the speed, a third of it from the fan idling (so it turns from
      // rest); + steer (right) turns the nose right
      const air = M.clamp01(Math.max(0.3, fanPedal, absFwd / t.rudderSpeedRef));
      const yaw = -this.steerRaw * t.rudderTorque * air * (handbrake ? 2 : 1);
      M.scale(s.force, s.up, yaw);
      M.add(s.tSum, s.tSum, s.force);
    }

    // ---- boost thrust ---------------------------------------------------------
    if (this.boosting && grounded > 0) {
      M.scale(s.force, s.fwd, t.boostThrust);
      M.add(s.fSum, s.fSum, s.force);
    }

    // ---- drift assists (arcade layer) -------------------------------------------
    if (this.drifting && t.driftAssist > 0) {
      // the commanded angle (+ = right) -> nose right of the velocity -> negative body slip
      const targetSlip = -this.driftTargetDeg * M.DEG;
      const err = targetSlip - bodySlip;
      const slipRate = (bodySlip - this.bodySlipPrev) / dt;
      const torque = M.clamp(err * t.driftAngleGain - slipRate * t.driftAngleDamping, -t.driftYawTorqueMax, t.driftYawTorqueMax) * t.driftAssist;
      M.scale(s.force, s.up, torque);
      M.add(s.tSum, s.tSum, s.force);

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
        M.add(s.fSum, s.fSum, s.force);
        const slip = Math.abs(Math.sin(bodySlipDeg * M.DEG));
        M.scale(s.force, s.a, -t.mass * t.driftSpeedLoss * slip);
        M.add(s.fSum, s.fSum, s.force);
      }
      if (throttle > 0 && grounded > 0) {
        M.scale(s.force, s.fwd, throttle * t.driftThrottlePush * t.driftAssist);
        M.add(s.fSum, s.fSum, s.force);
      }
    }

    // ---- aero, extra gravity, rest damping --------------------------------------
    if (speed > 0.1) {
      M.scale(s.force, s.vel, -t.drag * speed);
      M.add(s.fSum, s.fSum, s.force);
    }
    if (grounded > 0) {
      M.scale(s.force, s.up, -t.downforce * forwardSpeed * forwardSpeed);
      M.add(s.fSum, s.fSum, s.force);
    }
    M.set(s.force, 0, -t.extraGravity * t.mass, 0);
    M.add(s.fSum, s.fSum, s.force);
    // a puncture drags at the rear axle while the car is on its wheels
    if (this.lateralPull !== 0 && grounded > 0) {
      M.set(s.rearLocal, 0, 0, -t.wheelBase * 0.5);
      M.rotate(s.a, s.q, s.rearLocal);
      M.add(s.point, s.pos, s.a);
      M.scale(s.force, s.right, this.lateralPull);
      forceAt(s.force, s.point);
    }
    if (grounded > 0 && speed < 0.5 && throttle === 0 && brakeIn === 0 && !handbrake) {
      M.scale(s.force, s.vel, -t.restDamping * t.mass);
      M.add(s.fSum, s.fSum, s.force);
      M.scale(s.force, s.angvel, -t.restDamping * t.mass * 0.5);
      M.add(s.tSum, s.tSum, s.force);
    }

    // ---- air control and levelling -------------------------------------------
    const airborne = grounded === 0;
    if (airborne) {
      this.airTime += dt;
      const pitchIn = throttle - brakeIn; // positive torque about `right` (-X) lifts the nose
      const rollIn = controls.steer; // positive roll about +Z drops the right side
      M.scale(s.force, s.right, pitchIn * t.airPitchTorque);
      M.addScaled(s.force, s.force, s.fwd, rollIn * t.airRollTorque);
      // attitude target: the nose follows the flight path (up while rising, down while falling),
      // and levels to the ground it is about to land on when touchdown is near
      const hs = Math.hypot(s.vel.x, s.vel.z);
      const flight = Math.atan2(s.vel.y, Math.max(hs, 1));
      const pitch = M.clamp(flight * t.airFollowTrajectory + t.airPitchBiasDeg * M.DEG, -t.airPitchMaxDeg * M.DEG, t.airPitchMaxDeg * M.DEG);
      M.set(s.a, s.fwd.x, 0, s.fwd.z);
      M.normalize(s.a, s.a);
      // target up = worldUp*cos(pitch) - horizontalForward*sin(pitch) (nose up tilts the roof backward)
      M.set(s.b, -s.a.x * Math.sin(pitch), Math.cos(pitch), -s.a.z * Math.sin(pitch));
      if (s.vel.y < 0) {
        this.ray.origin.x = s.pos.x;
        this.ray.origin.y = s.pos.y;
        this.ray.origin.z = s.pos.z;
        this.ray.dir.x = 0;
        this.ray.dir.y = -1;
        this.ray.dir.z = 0;
        const hit = this.world.castRayAndGetNormal(this.ray, 14, true, undefined, rayGroups, undefined, body);
        if (hit) {
          const gap = Math.max(0, hit.timeOfImpact - (t.suspensionRestLength + t.wheelRadius));
          if (gap / Math.max(0.5, -s.vel.y) < t.airLandingLevelTime) M.set(s.b, hit.normal.x, hit.normal.y, hit.normal.z);
        }
      }
      M.cross(s.a, s.up, s.b);
      M.addScaled(s.force, s.force, s.a, t.airLevelTorque);
      M.addScaled(s.force, s.force, s.angvel, -t.airAngularDamping);
      M.add(s.tSum, s.tSum, s.force);
      this.boostMeter = Math.min(1, this.boostMeter + t.boostGainAir * dt);
    } else {
      this.airTime = 0;
    }
    if (this.drifting && absFwd > t.driftMinSpeed) {
      this.boostMeter = Math.min(1, this.boostMeter + t.boostGainDrift * dt);
    }
    // a meter that fills by itself while it rests (M8.8 slice 13: the rocket trolley's; 0 on every other car)
    if (t.boostRegen > 0 && !this.boosting) this.boostMeter = Math.min(1, this.boostMeter + t.boostRegen * dt);

    // ---- two wheels: the upright controller and the fall (M8.8 slice 14) ------------------------
    if (twoWheel) {
      // the lean, + with the right side down, and its rate about the long axis
      const lean = Math.atan2(-s.right.y, s.up.y);
      const rollRate = M.dot(s.angvel, s.fwd);
      this.lean = lean;
      if (this.tumbleLeft > 0) {
        // bike and rider as one, left to fall; then stood up where they lie
        this.tumbleLeft -= dt;
        if (this.tumbleLeft <= 0) {
          this.tumbleLeft = 0;
          if (Math.abs(lean) > 20 * M.DEG || s.up.y < 0.9) this.teleport({ x: s.pos.x, y: s.pos.y + 0.4, z: s.pos.z }, M.yawOf(s.q));
        }
      } else if (impact > t.tumbleImpact || (Math.abs(lean) > t.tumbleDeg * M.DEG && speed < 5)) {
        this.tumbleLeft = t.tumbleSeconds;
      } else {
        // into the turn by the angle of the lateral acceleration (level in the air)
        const aRight = grounded > 0 ? -forwardSpeed * s.angvel.y : 0;
        const maxLean = t.leanMaxDeg * M.DEG;
        this.leanTarget = M.clamp(Math.atan2(aRight, 9.81), -maxLean, maxLean);
        const accel = t.leanGain * (this.leanTarget - lean) - t.leanDamping * rollRate;
        M.addScaled(s.tSum, s.tSum, s.fwd, accel * boxInertia(t).z);
      }
    }

    // ---- body vs terrain: only when the car is on its side or roof -------------------
    const flipped = s.up.y < 0.35;
    if (flipped !== this.collidesWithTerrain) {
      this.collidesWithTerrain = flipped;
      this.collider.setCollisionGroups(hover ? (flipped ? GROUPS_HOVER_FLIPPED : GROUPS_HOVER_UPRIGHT) : flipped ? GROUPS_CHASSIS_FLIPPED : GROUPS_CHASSIS_UPRIGHT);
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

    // one force and one torque into Rapier instead of a WASM call per wheel and effect
    body.addForce(s.fSum, true);
    body.addTorque(s.tSum, true);

    // ---- telemetry ----------------------------------------------------------
    const tm = this.telemetry;
    tm.speed = forwardSpeed;
    tm.speedKmh = forwardSpeed * 3.6;
    tm.drifting = this.drifting;
    tm.driftAngleDeg = bodySlipDeg;
    tm.boost = this.boostMeter;
    tm.boosting = this.boosting;
    tm.airborne = airborne;
    tm.tumbling = this.tumbleLeft > 0;
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
    tm.landingImpact = landingImpact;
    tm.brake = brakeIn;
    tm.driftDistance = this.driftDistance;
    tm.impact = impact;
    tm.hitHandle = this.bestPairHandle;
    tm.hitImpulse = this.bestPairImpulse;
    tm.scrape = scrape;
    tm.contactSide = this.wallTouch ? this.contactSide : 0;
    if (this.contactImpulse > 0) {
      M.normalize(s.b, this.contactNormal);
      tm.contactX = this.contactPoint.x;
      tm.contactY = this.contactPoint.y;
      tm.contactZ = this.contactPoint.z;
      tm.contactNx = s.b.x;
      tm.contactNy = s.b.y;
      tm.contactNz = s.b.z;
    }
    tm.vx = s.vel.x;
    tm.vy = s.vel.y;
    tm.vz = s.vel.z;
    // accelerations from the velocity change over the last step, in the car's frame
    M.sub(s.a, s.vel, this.prevVel);
    M.scale(s.a, s.a, 1 / (dt * 9.81));
    tm.yawRate = s.angvel.y;
    tm.gLong = M.dot(s.a, s.fwd);
    tm.gLat = -M.dot(s.a, s.right);
    tm.gVert = s.a.y;
    M.copy(this.prevVel, s.vel);
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

  /** A knock that drops a bike (M8.8 slice 17: a unit's ram or PIT): bike and rider tumble as after a hard hit; a car rides it out. */
  tumble(): void {
    if (this.tuning.twoWheel > 0 && this.tumbleLeft === 0) this.tumbleLeft = this.tuning.tumbleSeconds;
  }

  teleport(position: Vec3, yaw: number): void {
    const q = M.quatSetAxisAngle(scratch.q3, 0, 1, 0, yaw);
    this.body.setTranslation(position, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.steerRaw = 0;
    M.set(this.prevVel, 0, 0, 0);
    this.drifting = false;
    this.bodySlipPrev = 0;
    this.airTime = 0;
    this.gear = 1;
    this.shiftTimer = 0;
    this.rpm = this.tuning.idleRpm;
    this.lean = 0;
    this.leanTarget = 0;
    this.tumbleLeft = 0;
    for (const w of this.wheels) {
      w.grounded = false;
      w.compression = 0;
      w.omega = 0;
      w.steer = 0;
      w.slipRatio = 0;
    }
    this.writeTransforms(true);
  }

  /** Replace linear velocity. Swap calls this after `teleport`, which zeroes it. */
  setVelocity(vx: number, vy: number, vz: number): void {
    const v = scratch.vel;
    v.x = vx;
    v.y = vy;
    v.z = vz;
    this.body.setLinvel(v, true);
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
