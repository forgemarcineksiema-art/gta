/**
 * Every handling tunable in one typed object. Editable live in the dev panel
 * (`?dev=1`, key `\``); the panel's "copy JSON" button prints a patch to paste here.
 *
 * Units: metres, seconds, kilograms, newtons, radians unless the name says `Deg`.
 * The car's local axes are +Z forward, +X right, +Y up.
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
  /** How fast the wheel turns toward the input, rad/s. */
  steerRate: number;
  /** How fast it returns to centre, rad/s. */
  steerReturnRate: number;
  /** Extra steering authority while drifting (multiplier on maxSteer). */
  driftSteerMul: number;

  // --- drive ---------------------------------------------------------------
  /** Peak driving force at the tyres, N (all driven wheels together). */
  driveForce: number;
  /** Fraction of drive force sent to the front axle (0 = RWD, 1 = FWD). */
  driveFrontShare: number;
  /** Speed where the drive force runs out without boost, m/s. */
  maxSpeed: number;
  /** Shape of the force fall-off toward maxSpeed (higher = flatter, then a cliff). */
  driveFalloffExp: number;
  reverseForce: number;
  maxReverseSpeed: number;
  brakeForce: number;
  /** Force opposing motion when coasting, N. */
  engineBrakeForce: number;
  /** Rear-wheel brake force from the handbrake, N. */
  handbrakeForce: number;

  // --- tyres ---------------------------------------------------------------
  /** Lateral force per (m/s of lateral slip) per N of load. */
  latStiffness: number;
  /** Peak grip coefficient (friction circle radius = mu * load). */
  muFront: number;
  muRear: number;
  /** Rear grip multiplier while the handbrake is held. */
  handbrakeGripMul: number;
  /** Slip angle at which lateral grip peaks, degrees. */
  slipPeakDeg: number;
  /** Lateral grip left at large slip angles (fraction of peak). */
  slipTail: number;
  /** Fraction (0 contact patch .. 1 centre of mass) at which tyre forces are applied. */
  tireForceHeight: number;

  // --- drift state ---------------------------------------------------------
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
  /** Steering lock cap while drifting, degrees. */
  driftMaxSteerDeg: number;
  /** How fast rear grip returns after a drift / handbrake, per second (blend of the multiplier). */
  gripBlendRate: number;
  /** Yaw rate commanded by full steer while drifting, rad/s. */
  driftYawRate: number;
  /** Yaw controller gain, N·m per rad/s of error. */
  driftYawGain: number;
  /** Yaw controller torque cap, N·m. */
  driftYawTorqueMax: number;
  /** How fast the velocity vector turns to follow the nose while drifting (1/s). */
  driftVelocityFollow: number;
  /** Cap on the velocity-follow acceleration, m/s². */
  driftFollowAccelMax: number;
  /** Speed lost per second at 90° of slip, as a fraction of speed. */
  driftSpeedLoss: number;
  /** Throttle push along the nose while drifting (fraction of available drive force). */
  driftThrottleGain: number;

  // --- aero & gravity ------------------------------------------------------
  /** Aerodynamic drag: F = drag * v². */
  drag: number;
  /** Downforce: F = downforce * v², pressing the car onto the road. */
  downforce: number;
  rollingResistance: number;
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
  boostForceMul: number;
  boostMaxSpeed: number;
  /** Meter units per second while boosting (meter is 0..1). */
  boostDrain: number;
  boostGainDrift: number;
  boostGainAir: number;
  /** Starting meter in the playground. */
  boostInitial: number;

  // --- fake gearbox for audio/HUD ------------------------------------------
  gearCount: number;
  idleRpm: number;
  redlineRpm: number;
}

export const DEFAULT_TUNING: VehicleTuning = {
  mass: 1300,
  chassisHalfExtents: { x: 0.95, y: 0.32, z: 2.25 },
  chassisOffsetY: 0.42,
  centerOfMassY: -0.05,
  inertiaScale: { x: 1.0, y: 1.0, z: 1.0 },
  angularDamping: 1.2,

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
  driftSteerMul: 1.6,

  driveForce: 8200,
  driveFrontShare: 0.0,
  maxSpeed: 50,
  driveFalloffExp: 3.0,
  reverseForce: 5000,
  maxReverseSpeed: 9,
  brakeForce: 16000,
  engineBrakeForce: 700,
  handbrakeForce: 9000,

  latStiffness: 0.55,
  muFront: 1.45,
  muRear: 1.5,
  handbrakeGripMul: 0.3,
  slipPeakDeg: 9,
  slipTail: 0.55,
  tireForceHeight: 0.85,

  driftGripMul: 0.42,
  driftFrontGripMul: 0.8,
  driftEnterDeg: 20,
  driftExitDeg: 7,
  driftMinSpeed: 8,
  driftMinTime: 0.6,
  driftMaxSteerDeg: 46,
  gripBlendRate: 4,
  driftYawRate: 1.7,
  driftYawGain: 14000,
  driftYawTorqueMax: 22000,
  driftVelocityFollow: 2.6,
  driftFollowAccelMax: 14,
  driftSpeedLoss: 0.22,
  driftThrottleGain: 0.9,

  drag: 0.45,
  downforce: 1.8,
  rollingResistance: 220,
  extraGravity: 4,

  airPitchTorque: 6000,
  airRollTorque: 5000,
  airLevelTorque: 22000,
  airAngularDamping: 5000,
  flipRecoverySeconds: 1.5,

  boostForceMul: 1.8,
  boostMaxSpeed: 67,
  boostDrain: 0.28,
  boostGainDrift: 0.16,
  boostGainAir: 0.35,
  boostInitial: 0.6,

  gearCount: 5,
  idleRpm: 900,
  redlineRpm: 7200,
};

export function cloneTuning(t: VehicleTuning): VehicleTuning {
  return JSON.parse(JSON.stringify(t)) as VehicleTuning;
}
