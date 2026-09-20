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
  /** Anti-roll: transfers load between the wheels of one axle (N per metre of travel difference). */
  antiRollStiffness: number;

  // --- steering ------------------------------------------------------------
  maxSteerDegLow: number;
  maxSteerDegHigh: number;
  /** Speed at which steering authority reaches `maxSteerDegHigh`. */
  steerSpeedRef: number;
  /** How fast the wheel turns toward the input, in full locks per second. */
  steerRate: number;
  /** How fast it returns to centre, in full locks per second. */
  steerReturnRate: number;
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
  /** Upshift when rpm exceeds this fraction of the redline. */
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
  antiRollStiffness: 26000,

  maxSteerDegLow: 34,
  maxSteerDegHigh: 7,
  steerSpeedRef: 42,
  steerRate: 5.5,
  steerReturnRate: 9,
  ackermann: 1,

  torqueMax: 340,
  idleRpm: 900,
  redlineRpm: 7200,
  torqueCurve: [0.6, 0.86, 1.0, 0.93, 0.8],
  engineBrakeTorque: 55,
  engineInertia: 0.25,

  gearRatios: [3.6, 2.2, 1.55, 1.2, 0.95],
  reverseRatio: 3.2,
  finalDrive: 4.1,
  drivetrainEfficiency: 0.9,
  driveFrontShare: 0,
  shiftUpAt: 0.96,
  shiftDownAt: 0.5,
  shiftTime: 0.12,
  maxReverseSpeed: 7,

  brakeTorque: 5600,
  brakeFrontBias: 0.62,
  handbrakeTorque: 4000,

  wheelInertia: 1.2,
  slipLowSpeed: 2.0,

  muFront: 1.45,
  muRear: 1.5,
  slipAngPeakDeg: 8,
  slipAngTail: 0.7,
  slipRatioPeak: 0.12,
  slipRatioTail: 0.7,
  rollingResistance: 0.012,
  tireForceHeight: 0.85,

  tractionControl: 0.6,
  abs: 0.8,
  restDamping: 6,

  driftAssist: 1,
  handbrakeGripMul: 0.45,
  driftGripMul: 0.42,
  driftFrontGripMul: 0.7,
  driftEnterDeg: 20,
  driftExitDeg: 7,
  driftMinSpeed: 8,
  driftMinTime: 0.6,
  gripBlendRate: 4,
  driftMaxAngleDeg: 35,
  driftAngleGain: 70000,
  driftAngleDamping: 9000,
  driftYawTorqueMax: 26000,
  driftAutoCounterSteer: 1,
  driftVelocityFollow: 2.6,
  driftFollowAccelMax: 8,
  driftSpeedLoss: 0.15,
  driftThrottlePush: 4000,

  drag: 1.6,
  downforce: 1.8,
  extraGravity: 4,

  airPitchTorque: 6000,
  airRollTorque: 5000,
  airLevelTorque: 22000,
  airAngularDamping: 5000,
  flipRecoverySeconds: 1.5,

  boostTorqueMul: 1.25,
  boostThrust: 3200,
  boostDrain: 0.28,
  boostGainDrift: 0.16,
  boostGainAir: 0.35,
  boostInitial: 0.6,
};

export function cloneTuning(t: VehicleTuning): VehicleTuning {
  return JSON.parse(JSON.stringify(t)) as VehicleTuning;
}
