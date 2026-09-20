/**
 * The vehicle classes as tuning presets. Each is the default tuning with the
 * numbers that make the class: mass, engine, drivetrain, geometry, suspension.
 * Visual profiles live in render/carProfiles.ts under the same ids.
 */
import { DEFAULT_TUNING, cloneTuning, type VehicleTuning } from './tuning';

export type CarId = 'muscle' | 'compact' | 'heavy';
export const CAR_IDS: CarId[] = ['muscle', 'compact', 'heavy'];

function preset(overrides: Partial<VehicleTuning>): VehicleTuning {
  return { ...cloneTuning(DEFAULT_TUNING), ...overrides };
}

export const CAR_PRESETS: Record<CarId, VehicleTuning> = {
  /** Long-bonnet rear-drive coupe: the starter car. */
  muscle: cloneTuning(DEFAULT_TUNING),

  /** Small front-drive hatch: light, nimble, slow, safe. Drifts only on the handbrake. */
  compact: preset({
    mass: 1050,
    chassisHalfExtents: { x: 0.85, y: 0.34, z: 1.9 },
    chassisOffsetY: 0.46,
    centerOfMassY: 0.0,
    wheelBase: 2.45,
    trackWidth: 1.5,
    wheelRadius: 0.3,
    wheelWidth: 0.2,
    suspensionRestLength: 0.28,
    suspensionStiffness: 42000,
    suspensionDampingCompression: 3600,
    suspensionDampingRebound: 4800,
    antiRollStiffness: 14000,
    maxSteerDegLow: 36,
    maxSteerDegHigh: 6,
    steerSpeedRef: 30,
    torqueMax: 150,
    redlineRpm: 6600,
    gearRatios: [3.8, 2.2, 1.5, 1.1, 0.9],
    finalDrive: 4.2,
    driveFrontShare: 1,
    lsdLock: 0.2,
    brakeTorque: 4200,
    brakeFrontBias: 0.66,
    wheelInertia: 0.9,
    muFront: 2.1,
    muRear: 2.25,
    powerOversteer: 0,
    driftMaxAngleDeg: 30,
    driftThrottlePush: 3200,
    drag: 1.05,
    downforce: 1.2,
    boostTorqueMul: 1.35,
    boostThrust: 2000,
  }),

  /** Delivery van: heavy, tall, soft, slow to turn, bulldozes. */
  heavy: preset({
    mass: 2400,
    chassisHalfExtents: { x: 1.0, y: 0.5, z: 2.7 },
    chassisOffsetY: 0.75,
    centerOfMassY: 0.05,
    inertiaScale: { x: 1.15, y: 1.1, z: 1.15 },
    wheelBase: 3.4,
    trackWidth: 1.8,
    wheelRadius: 0.4,
    wheelWidth: 0.3,
    suspensionAttachY: 0.22,
    suspensionRestLength: 0.36,
    suspensionStiffness: 90000,
    suspensionDampingCompression: 7500,
    suspensionDampingRebound: 9500,
    antiRollStiffness: 60000,
    maxSteerDegLow: 32,
    maxSteerDegHigh: 4.5,
    steerSpeedRef: 28,
    steerRate: 4.5,
    torqueMax: 380,
    redlineRpm: 5200,
    gearRatios: [4.2, 2.5, 1.6, 1.15, 0.85],
    finalDrive: 4.0,
    brakeTorque: 9500,
    handbrakeTorque: 6000,
    wheelInertia: 2.0,
    muFront: 2.0,
    muRear: 2.1,
    slipAngPeakDeg: 9,
    powerOversteer: 0.08,
    driftMaxAngleDeg: 28,
    driftAngleGain: 260000,
    driftYawTorqueMax: 60000,
    driftThrottlePush: 7000,
    driftVelocityFollow: 2.2,
    tireForceHeight: 0.9,
    drag: 2.2,
    downforce: 1.0,
    airPitchTorque: 9000,
    airRollTorque: 7000,
    airLevelTorque: 50000,
    airAngularDamping: 12000,
    boostTorqueMul: 1.3,
    boostThrust: 4000,
  }),
};
