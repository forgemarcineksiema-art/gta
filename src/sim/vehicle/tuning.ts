/**
 * Every handling tunable in one typed object. Editable live in the dev panel
 * (`?dev=1`, key `\``); the panel's "copy patch" button prints a patch to paste here.
 *
 * Units: metres, seconds, kilograms, newtons, N·m, radians unless the name says `Deg`.
 * The car's local axes are +Z forward, +Y up; +X is the car's LEFT (right-handed frame).
 *
 * Layers, from physical to arcade:
 *   chassis + suspension  -> plain rigid-body mechanics
 *   engine + gearbox      -> torque curve, ratios, automatic shifting
 *   tyres                 -> slip-angle / slip-ratio model with a friction circle
 *   assists               -> traction control, ABS, drift controller (each can be turned down to 0)
 */
export interface VehicleTuning {
  // --- chassis -------------------------------------------------------------
  /** Total mass in kg. */
  mass: number;
  /** Collider half extents (x: half width, y: half height, z: half length). */
  chassisHalfExtents: { x: number; y: number; z: number };
  /** Collider centre above the body origin. The origin sits at axle height. */
  chassisOffsetY: number;
  /** Centre of mass height relative to the body origin (negative = low, stable). */
  centerOfMassY: number;
  /** Multiplier on the box inertia tensor (lower = turns/pitches faster). */
  inertiaScale: { x: number; y: number; z: number };
  angularDamping: number;

  // --- geometry ------------------------------------------------------------
  wheelBase: number;
  trackWidth: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Height of the suspension attach point relative to the body origin. */
  suspensionAttachY: number;

  // --- suspension ----------------------------------------------------------
  suspensionRestLength: number;
  /** N/m per wheel. */
  suspensionStiffness: number;
  /** N·s/m per wheel (compression). */
  suspensionDampingCompression: number;
  /** N·s/m per wheel (rebound). */
  suspensionDampingRebound: number;
  /** Extra stiffness once the spring is fully compressed. */
  bumpStopStiffness: number;
  /** Progressive damping, N·s²/m²: a hard landing is absorbed by the damper instead of the bump stop. */
  suspensionDampingProgressive: number;
  /** Anti-roll: transfers load between the wheels of one axle (N per metre of travel difference). */
  antiRollStiffness: number;

  // --- steering ------------------------------------------------------------
  maxSteerDegLow: number;
  maxSteerDegHigh: number;
  /** Speed at which steering authority reaches `maxSteerDegHigh`. */
  steerSpeedRef: number;
  /** How fast the input ramps toward full lock, in locks per second (a 100 ms tap reaches steerRate/10 of the lock before the curve). */
  steerRate: number;
  /** How fast it returns to centre, in locks per second. */
  steerReturnRate: number;
  /** Sensitivity curve exponent on the ramped input: 1 = linear, higher = gentle taps, full lock when held. */
  steerCurve: number;
  /** Ackermann: 0 = both fronts steer the same, 1 = geometrically correct inner/outer angles. */
  ackermann: number;

  // --- engine --------------------------------------------------------------
  /** Peak engine torque, N·m. */
  torqueMax: number;
  idleRpm: number;
  redlineRpm: number;
  /** Torque curve as fractions of torqueMax at rpm fractions [idle, 0.35, 0.65, 0.9, 1.0] of the redline. */
  torqueCurve: [number, number, number, number, number];
  /** Engine braking torque at the redline when coasting, N·m (scales with rpm). */
  engineBrakeTorque: number;
  /** Engine rotational inertia seen at the crank (rpm response), kg·m². */
  engineInertia: number;

  // --- drivetrain ----------------------------------------------------------
  gearRatios: number[];
  reverseRatio: number;
  finalDrive: number;
  drivetrainEfficiency: number;
  /** Fraction of drive torque sent to the front axle (0 = RWD, 1 = FWD). */
  driveFrontShare: number;
  /** Limited-slip differential: 0 = open (equal torque), 1 = the lock torque can reach half the axle torque. */
  lsdLock: number;
  /** Lock torque available with no drive torque, N·m (keeps both wheels turning together off throttle). */
  lsdPreload: number;
  /** How hard the diff resists a speed difference, N·m per rad/s. */
  lsdStiffness: number;
  /**
   * Six speeds on every car. Gears 1-5 are spaced geometrically over the range
   * the car can actually reach on its own, so the fifth is the top-speed gear;
   * the sixth is an overdrive the car only pulls on boost or downhill.
   */
  shiftUpAt: number;
  /** Downshift when rpm falls below this fraction of the redline. */
  shiftDownAt: number;
  /** Torque cut during a shift, seconds. */
  shiftTime: number;
  /** Reverse is cut above this speed, m/s. */
  maxReverseSpeed: number;

  // --- brakes --------------------------------------------------------------
  /** Total brake torque at full pedal, N·m, split by `brakeFrontBias`. */
  brakeTorque: number;
  brakeFrontBias: number;
  /** Handbrake torque on each rear wheel, N·m. */
  handbrakeTorque: number;

  // --- wheels --------------------------------------------------------------
  /** Rotational inertia per wheel (including its share of the drivetrain), kg·m². */
  wheelInertia: number;
  /** Speed floor used to regularise slip at low speed, m/s. */
  slipLowSpeed: number;

  // --- tyres ---------------------------------------------------------------
  muFront: number;
  muRear: number;
  /** Slip angle at which lateral grip peaks, degrees. */
  slipAngPeakDeg: number;
  /** Lateral grip left at large slip angles (fraction of peak). */
  slipAngTail: number;
  /** Slip ratio at which longitudinal grip peaks. */
  slipRatioPeak: number;
  /** Longitudinal grip left when the wheel is fully spinning or locked (fraction of peak). */
  slipRatioTail: number;
  /** Rolling resistance force per wheel per N of load. */
  rollingResistance: number;
  /**
   * How steeply a wheel climbs onto what it meets from the ground (M8.8 slice 12, the monster truck onto a car): the
   * contact rises at most this share of the distance driven; 0, every car's, puts the wheel on it at once.
   */
  climbSlope: number;

  // --- two wheels (M8.8 slice 14, the motorbike) --------------------------------------
  /** 1: the four rays stand on a narrow track straight down and push straight up, and the upright controller holds the roll. */
  twoWheel: number;
  /** The lean the controller holds: the angle of the lateral acceleration, at most this (deg). */
  leanMaxDeg: number;
  /** The controller: roll acceleration per radian of lean error (1/s²) and per rad/s of roll rate (1/s). */
  leanGain: number;
  leanDamping: number;
  /** A fall: a hit over this (m/s), or a lean past `tumbleDeg` under 5 m/s, lets go of the roll for `tumbleSeconds`, then it is righted. */
  tumbleImpact: number;
  tumbleDeg: number;
  tumbleSeconds: number;

  // --- the air cushion (M8.8 slice 18, the hovercraft) --------------------------------------
  /**
   * 1: the four rays are the cushion (springs straight down and up, no tyre force at all), the fan pushes and the rudder
   * yaws; no drift controller, no brakes (the brake reverses the fan).
   */
  hover: number;
  /** The fan's push along the nose at full throttle, N (the power tier scales it; the brake pulls half of it back). */
  fanThrust: number;
  /** The cushion's drag on the ground: along the nose and across it, N per m/s (the side's is split between bow and stern). */
  hoverDrag: number;
  hoverSideDrag: number;
  /** The rudders' yaw at full lock in full air: the fan's or the speed's (`rudderSpeedRef` m/s is full), N·m; twice on the handbrake. */
  rudderTorque: number;
  rudderSpeedRef: number;
  /** Off the road (M8.8 slice 9): on grass and on dirt, the tyres' grip and their rolling resistance, factors on asphalt's. */
  grassGrip: number;
  grassRoll: number;
  dirtGrip: number;
  dirtRoll: number;
  /** Load sensitivity: grip per N drops by this fraction per unit of load above the static share (weight transfer costs total grip). */
  loadSensitivity: number;
  /** Fraction (0 contact patch .. 1 centre of mass) at which tyre forces are applied. Arcade roll control. */
  tireForceHeight: number;

  // --- assists -------------------------------------------------------------
  /** 0..1: cuts drive torque when driven wheels spin past 1.5x the peak slip ratio. */
  tractionControl: number;
  /** 0..1: releases brake torque on a wheel that is about to lock. */
  abs: number;
  /** Extra damping on the whole body below 0.5 m/s with no input, 1/s (kills creep). */
  restDamping: number;

  // --- drift state (arcade layer) ------------------------------------------
  /** 0..1 master scale for the drift controller (yaw command + velocity follow). */
  driftAssist: number;
  /** Rear grip lost under full throttle at full lock at highway speed (ramps in from 20 to 32 m/s): steering alone can start a slide. */
  powerOversteer: number;
  /** 1: a brake tap while turning hard at speed starts a drift (NFS style); 0: brakes only brake. */
  brakeDriftEntry: number;
  /** Rear grip multiplier while the handbrake is held. */
  handbrakeGripMul: number;
  /** Rear grip multiplier while in the drift state (handbrake released). */
  driftGripMul: number;
  /** Front grip multiplier while drifting. */
  driftFrontGripMul: number;
  /** Rear slip angle that enters the drift state, degrees. */
  driftEnterDeg: number;
  /** Rear slip angle below which the drift ends, degrees. */
  driftExitDeg: number;
  /** Minimum speed to be in a drift, m/s. */
  driftMinSpeed: number;
  /** A drift cannot end before this many seconds (lets the angle build after a handbrake tap). */
  driftMinTime: number;
  /** The rear must stay below driftExitDeg for this long before the drift ends (keyboard taps do not kill it). */
  driftExitHold: number;
  /** With the drift button held and the stick centred, this fraction of driftMaxAngleDeg is held. */
  driftCentreHold: number;
  /** How fast the commanded angle grows, degrees per second. */
  driftAngleRateIn: number;
  /** How fast the commanded angle shrinks toward straight, degrees per second. */
  driftAngleRateOut: number;
  /** How fast grip returns after a drift / handbrake, per second (blend of the multiplier). */
  gripBlendRate: number;
  /** Drift angle commanded by full steer, degrees (steer sets the angle; centre straightens; counter-steer swaps sides). */
  driftMaxAngleDeg: number;
  /** Angle controller: yaw torque per radian of angle error, N·m/rad. */
  driftAngleGain: number;
  /** Angle controller damping: yaw torque per rad/s of angle rate, N·m·s/rad. */
  driftAngleDamping: number;
  /** Angle controller torque cap, N·m. */
  driftYawTorqueMax: number;
  /** 0..1: in a drift the front wheels align with the velocity (automatic counter-steer), plus a little player input. */
  driftAutoCounterSteer: number;
  /** How fast the velocity vector turns to follow the nose while drifting (1/s). */
  driftVelocityFollow: number;
  /** Cap on the velocity-follow acceleration, m/s². */
  driftFollowAccelMax: number;
  /** Speed lost per second at 90° of slip, as a fraction of speed. */
  driftSpeedLoss: number;
  /** Push along the nose at full throttle while drifting, N (what the spinning rears cannot deliver). */
  driftThrottlePush: number;

  // --- aero & gravity ------------------------------------------------------
  /** Aerodynamic drag: F = drag * v². */
  drag: number;
  /** Downforce: F = downforce * v², pressing the car onto the road. */
  downforce: number;
  /** Extra gravity applied to the car only, m/s². */
  extraGravity: number;

  // --- air control & recovery ----------------------------------------------
  /** Pitch torque from throttle (nose up) / brake (nose down) in the air, N·m. */
  airPitchTorque: number;
  /** Roll torque from steering in the air, N·m. */
  airRollTorque: number;
  /** Torque that levels the car in the air, N·m per unit of tilt (sin of the angle). */
  airLevelTorque: number;
  /** Angular damping in the air, N·m per rad/s. */
  airAngularDamping: number;
  /** In flight the nose follows this fraction of the flight-path angle (nose up on the way up, down on the way down). */
  airFollowTrajectory: number;
  /** Extra nose-up in flight, degrees. */
  airPitchBiasDeg: number;
  /** Pitch limit in flight, degrees. */
  airPitchMaxDeg: number;
  /** Seconds before the predicted touchdown when the car levels to the ground it will land on. */
  airLandingLevelTime: number;
  /** Fraction of the vertical speed kept at touchdown (the rest is absorbed: no rebound hop). */
  landingRetainVertical: number;
  /** Fraction of the angular velocity kept at touchdown. */
  landingRetainSpin: number;
  /** Fraction of the total speed kept through a landing: the absorbed vertical part is redirected along the ground. */
  landingKeepMomentum: number;

  // ---- walls (arcade). The chassis only meets walls, buildings and props.
  /** Chassis friction against what it touches (Min combine rule: walls are slippery). */
  wallFriction: number;
  /** Chassis restitution (Multiply combine rule): walls carry 1.0 so a head-on hit bounces by this; props carry 0 and do not. */
  wallRestitution: number;
  /** Yaw acceleration per radian of misalignment while sliding along a wall, rad/s² per rad (times the yaw inertia). */
  wallAlignGain: number;
  /** Yaw-rate damping of that controller, 1/s (7 with a gain of 20 is near critical). */
  wallAlignDamping: number;
  /** Beyond this angle between the nose and the wall the hit is a crash and nothing aligns. */
  wallAlignMaxDeg: number;
  /** A body contact that changes the speed by more than this in one step is a hit, not a scrape, m/s. */
  wallHitSpeed: number;
  /** Fraction of the yaw rate kept on the step of a hit: a corner impulse spins a car round otherwise. */
  wallHitRetainSpin: number;
  /** Seconds the alignment keeps working after the body leaves the wall (the bounce). */
  wallMemory: number;
  /** Seconds upside-down and stopped before the car rights itself. */
  flipRecoverySeconds: number;

  // --- boost ---------------------------------------------------------------
  /** Engine torque multiplier while boosting. */
  boostTorqueMul: number;
  /** Extra thrust along the nose while boosting and grounded, N. */
  boostThrust: number;
  /** Meter units per second while boosting (meter is 0..1). */
  boostDrain: number;
  boostGainDrift: number;
  boostGainAir: number;
  /** The meter's own refill while not boosting, per second (M8.8 slice 13: the rocket trolley's 0.25; 0 on every other car). */
  boostRegen: number;
  /** Starting meter in the playground. */
  boostInitial: number;
}

export const DEFAULT_TUNING: VehicleTuning = {
  mass: 1300,
  chassisHalfExtents: { x: 0.95, y: 0.32, z: 2.25 },
  chassisOffsetY: 0.42,
  centerOfMassY: -0.05,
  inertiaScale: { x: 1.0, y: 1.0, z: 1.0 },
  angularDamping: 1.0,

  wheelBase: 2.9,
  trackWidth: 1.72,
  wheelRadius: 0.36,
  wheelWidth: 0.28,
  suspensionAttachY: 0.18,

  suspensionRestLength: 0.32,
  suspensionStiffness: 62000,
  suspensionDampingCompression: 5200,
  suspensionDampingRebound: 6800,
  bumpStopStiffness: 250000,
  suspensionDampingProgressive: 400,
  antiRollStiffness: 26000,

  maxSteerDegLow: 34,
  maxSteerDegHigh: 5,
  steerSpeedRef: 34,
  steerRate: 6,
  steerReturnRate: 8,
  steerCurve: 2.4,
  ackermann: 1,

  torqueMax: 245,
  idleRpm: 900,
  redlineRpm: 7200,
  torqueCurve: [0.6, 0.86, 1.0, 0.93, 0.8],
  engineBrakeTorque: 55,
  engineInertia: 0.25,

  gearRatios: [4.33, 3.18, 2.33, 1.71, 1.25, 0.99],
  reverseRatio: 3.2,
  finalDrive: 4.1,
  drivetrainEfficiency: 0.9,
  driveFrontShare: 0,
  lsdLock: 0.5,
  lsdPreload: 60,
  lsdStiffness: 220,
  shiftUpAt: 0.96,
  shiftDownAt: 0.5,
  shiftTime: 0.12,
  maxReverseSpeed: 7,

  brakeTorque: 5600,
  brakeFrontBias: 0.62,
  handbrakeTorque: 4000,

  wheelInertia: 1.2,
  slipLowSpeed: 2.0,

  muFront: 2.2,
  muRear: 2.3,
  slipAngPeakDeg: 8,
  slipAngTail: 0.7,
  slipRatioPeak: 0.12,
  slipRatioTail: 0.7,
  rollingResistance: 0.012,
  climbSlope: 0,
  twoWheel: 0,
  leanMaxDeg: 50,
  leanGain: 120,
  leanDamping: 22,
  tumbleImpact: 9,
  tumbleDeg: 70,
  tumbleSeconds: 1.2,
  hover: 0,
  fanThrust: 0,
  hoverDrag: 0,
  hoverSideDrag: 0,
  rudderTorque: 0,
  rudderSpeedRef: 15,
  // a lawn costs a road car a third on its 0–100 (the muscle car 8.3 s, was 6.2); dirt about a fifth
  grassGrip: 0.7,
  grassRoll: 7,
  dirtGrip: 0.8,
  dirtRoll: 5,
  loadSensitivity: 0.15,
  tireForceHeight: 0.85,

  tractionControl: 0.6,
  abs: 0.8,
  restDamping: 6,

  driftAssist: 1,
  powerOversteer: 0.14,
  brakeDriftEntry: 1,
  handbrakeGripMul: 0.3,
  driftGripMul: 0.25,
  driftFrontGripMul: 0.9,
  driftEnterDeg: 14,
  driftExitDeg: 7,
  driftMinSpeed: 8,
  driftMinTime: 0.6,
  driftExitHold: 0.3,
  driftCentreHold: 0.4,
  driftAngleRateIn: 90,
  driftAngleRateOut: 45,
  gripBlendRate: 4,
  driftMaxAngleDeg: 35,
  driftAngleGain: 140000,
  driftAngleDamping: 9000,
  driftYawTorqueMax: 30000,
  driftAutoCounterSteer: 1,
  driftVelocityFollow: 2.6,
  driftFollowAccelMax: 8,
  driftSpeedLoss: 0.05,
  driftThrottlePush: 5000,

  drag: 1.12,
  downforce: 1.8,
  extraGravity: 3.5,

  airPitchTorque: 3500,
  airRollTorque: 3000,
  airLevelTorque: 22000,
  airAngularDamping: 5000,
  airFollowTrajectory: 0.8,
  airPitchBiasDeg: 4,
  airPitchMaxDeg: 25,
  airLandingLevelTime: 0.45,
  landingRetainVertical: 0.35,
  landingRetainSpin: 0.5,
  landingKeepMomentum: 0.92,
  wallFriction: 0.15,
  wallRestitution: 0.2,
  wallAlignGain: 20,
  wallAlignDamping: 7,
  wallAlignMaxDeg: 80,
  wallHitSpeed: 3,
  wallHitRetainSpin: 0.15,
  wallMemory: 0.5,
  flipRecoverySeconds: 1.5,

  boostTorqueMul: 1.25,
  boostThrust: 2500,
  boostDrain: 0.28,
  boostGainDrift: 0.16,
  boostGainAir: 0.35,
  boostRegen: 0,
  boostInitial: 0.6,
};

export function cloneTuning(t: VehicleTuning): VehicleTuning {
  return JSON.parse(JSON.stringify(t)) as VehicleTuning;
}
