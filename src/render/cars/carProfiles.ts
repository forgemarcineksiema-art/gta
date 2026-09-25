/**
 * Visual profiles per vehicle class (see sim/vehicle/presets.ts for the matching
 * tuning). Heights above ground with the car at rest, +Z forward.
 */
import { PALETTE, type CarId } from '../../sim';
import type { BodyPart, CarProfile } from './carMesh';

/** A long-bonnet coupe: the first car. Heights above ground, length 4.5 m, width ~1.9 m at the belt. */
export const MUSCLE: CarProfile = {
  name: 'muscle',
  sections: [
    { z: 2.25, floor: 0.34, belt: 0.78, roof: 0.83, hwFloor: 0.8, hwBelt: 0.88, hwRoof: 0.8 },
    { z: 1.95, floor: 0.32, belt: 0.88, roof: 0.94, hwFloor: 0.88, hwBelt: 0.98, hwRoof: 0.87 },
    { z: 1.3, floor: 0.32, belt: 0.91, roof: 0.96, hwFloor: 0.88, hwBelt: 1.0, hwRoof: 0.88 },
    { z: 0.65, floor: 0.32, belt: 0.89, roof: 0.94, hwFloor: 0.86, hwBelt: 0.97, hwRoof: 0.87 },
    { z: -0.05, floor: 0.32, belt: 0.91, roof: 1.39, hwFloor: 0.85, hwBelt: 0.96, hwRoof: 0.73 },
    { z: -0.86, floor: 0.32, belt: 0.93, roof: 1.37, hwFloor: 0.87, hwBelt: 0.99, hwRoof: 0.73 },
    { z: -1.55, floor: 0.33, belt: 0.96, roof: 1.0, hwFloor: 0.89, hwBelt: 1.0, hwRoof: 0.87 },
    { z: -1.95, floor: 0.34, belt: 0.9, roof: 0.95, hwFloor: 0.85, hwBelt: 0.95, hwRoof: 0.86 },
    { z: -2.25, floor: 0.38, belt: 0.85, roof: 0.91, hwFloor: 0.8, hwBelt: 0.9, hwRoof: 0.81 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.42],
  doorSeams: [0.72, -0.52],
  handleZ: -0.25,
  headlight: { width: 0.42, height: 0.17, y: 0.665, inset: 0.27 },
  taillight: { width: 0.57, height: 0.16, y: 0.71, inset: 0.32 },
  grille: { width: 0.63, height: 0.18, y: 0.65 },
  bumperHeight: 0.1,
  lipSpoiler: true,
  mirrors: true,
  exhausts: 2,
  wheelInset: 0.015,
  paint: PALETTE.carRed,
};

/** Small hatchback: short bonnet, tall greenhouse, upright tail. */
export const COMPACT: CarProfile = {
  name: 'compact',
  sections: [
    { z: 1.9, floor: 0.36, belt: 0.66, roof: 0.7, hwFloor: 0.66, hwBelt: 0.76, hwRoof: 0.72 },
    { z: 1.55, floor: 0.32, belt: 0.78, roof: 0.82, hwFloor: 0.74, hwBelt: 0.84, hwRoof: 0.8 },
    { z: 0.95, floor: 0.32, belt: 0.86, roof: 0.9, hwFloor: 0.76, hwBelt: 0.85, hwRoof: 0.8 },
    { z: 0.4, floor: 0.32, belt: 0.88, roof: 1.42, hwFloor: 0.76, hwBelt: 0.85, hwRoof: 0.68 },
    { z: -0.9, floor: 0.32, belt: 0.88, roof: 1.44, hwFloor: 0.76, hwBelt: 0.85, hwRoof: 0.68 },
    { z: -1.55, floor: 0.34, belt: 0.9, roof: 1.3, hwFloor: 0.74, hwBelt: 0.84, hwRoof: 0.7 },
    { z: -1.9, floor: 0.4, belt: 0.88, roof: 0.96, hwFloor: 0.66, hwBelt: 0.78, hwRoof: 0.72 },
  ],
  glassSides: [3, 4],
  glassTops: [2, 5],
  aPillar: 2,
  cPillar: 4,
  pillars: [-0.3],
  doorSeams: [0.55, -0.6],
  handleZ: -0.05,
  headlight: { width: 0.34, height: 0.14, y: 0.6, inset: 0.22 },
  taillight: { width: 0.3, height: 0.22, y: 0.76, inset: 0.18 },
  grille: { width: 0.5, height: 0.1, y: 0.58 },
  bumperHeight: 0.12,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.005,
  paint: PALETTE.carBlue,
};

/** Delivery van: flat nose, one long box, tall. */
export const HEAVY: CarProfile = {
  name: 'heavy',
  sections: [
    { z: 2.7, floor: 0.5, belt: 0.95, roof: 1.0, hwFloor: 0.9, hwBelt: 0.98, hwRoof: 0.95 },
    { z: 2.3, floor: 0.45, belt: 1.05, roof: 1.1, hwFloor: 0.96, hwBelt: 1.0, hwRoof: 0.97 },
    { z: 1.75, floor: 0.45, belt: 1.1, roof: 1.15, hwFloor: 0.96, hwBelt: 1.0, hwRoof: 0.97 },
    { z: 1.05, floor: 0.45, belt: 1.12, roof: 2.15, hwFloor: 0.96, hwBelt: 1.0, hwRoof: 0.94 },
    { z: 0.2, floor: 0.45, belt: 1.12, roof: 2.2, hwFloor: 0.96, hwBelt: 1.0, hwRoof: 0.96 },
    { z: -2.5, floor: 0.45, belt: 1.12, roof: 2.2, hwFloor: 0.96, hwBelt: 1.0, hwRoof: 0.96 },
    { z: -2.7, floor: 0.5, belt: 1.1, roof: 2.15, hwFloor: 0.9, hwBelt: 0.98, hwRoof: 0.94 },
  ],
  glassSides: [3, 4],
  glassTops: [2],
  aPillar: 2,
  cPillar: -1,
  pillars: [0.6],
  doorSeams: [1.05, 0.2],
  handleZ: 0.62,
  headlight: { width: 0.34, height: 0.22, y: 0.82, inset: 0.24 },
  taillight: { width: 0.24, height: 0.5, y: 1.05, inset: 0.16 },
  grille: { width: 1.2, height: 0.14, y: 0.78 },
  bumperHeight: 0.18,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.025,
  paint: PALETTE.carOrange,
};

/** Low wedge coupe: long nose, fastback tail, roof 1.2 m. The interceptor's body. */
export const SPORTS: CarProfile = {
  name: 'sports',
  sections: [
    { z: 2.1, floor: 0.28, belt: 0.66, roof: 0.7, hwFloor: 0.76, hwBelt: 0.86, hwRoof: 0.78 },
    { z: 1.8, floor: 0.26, belt: 0.74, roof: 0.79, hwFloor: 0.86, hwBelt: 0.96, hwRoof: 0.86 },
    { z: 1.2, floor: 0.26, belt: 0.77, roof: 0.81, hwFloor: 0.88, hwBelt: 0.99, hwRoof: 0.88 },
    { z: 0.55, floor: 0.26, belt: 0.76, roof: 0.8, hwFloor: 0.87, hwBelt: 0.98, hwRoof: 0.88 },
    { z: -0.15, floor: 0.26, belt: 0.78, roof: 1.2, hwFloor: 0.86, hwBelt: 0.97, hwRoof: 0.7 },
    { z: -0.9, floor: 0.26, belt: 0.8, roof: 1.19, hwFloor: 0.88, hwBelt: 1.0, hwRoof: 0.7 },
    { z: -1.5, floor: 0.27, belt: 0.83, roof: 0.92, hwFloor: 0.9, hwBelt: 1.01, hwRoof: 0.86 },
    { z: -1.85, floor: 0.29, belt: 0.8, roof: 0.86, hwFloor: 0.86, hwBelt: 0.96, hwRoof: 0.84 },
    { z: -2.1, floor: 0.33, belt: 0.74, roof: 0.8, hwFloor: 0.79, hwBelt: 0.88, hwRoof: 0.79 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.5],
  doorSeams: [0.62, -0.58],
  handleZ: -0.3,
  headlight: { width: 0.46, height: 0.12, y: 0.56, inset: 0.24 },
  taillight: { width: 0.52, height: 0.12, y: 0.66, inset: 0.28 },
  grille: { width: 0.7, height: 0.12, y: 0.5 },
  bumperHeight: 0.09,
  lipSpoiler: true,
  mirrors: true,
  exhausts: 2,
  wheelInset: -0.01,
  paint: PALETTE.carLime,
};

/** Patrol saloon: four doors, square shoulders, a deep front bumper to ram with. */
export const POLICE: CarProfile = {
  name: 'police',
  sections: [
    { z: 2.3, floor: 0.36, belt: 0.82, roof: 0.88, hwFloor: 0.82, hwBelt: 0.9, hwRoof: 0.82 },
    { z: 2.0, floor: 0.34, belt: 0.92, roof: 0.98, hwFloor: 0.9, hwBelt: 1.0, hwRoof: 0.89 },
    { z: 1.35, floor: 0.34, belt: 0.95, roof: 1.0, hwFloor: 0.9, hwBelt: 1.02, hwRoof: 0.9 },
    { z: 0.7, floor: 0.34, belt: 0.95, roof: 1.0, hwFloor: 0.89, hwBelt: 1.01, hwRoof: 0.9 },
    { z: 0.0, floor: 0.34, belt: 0.97, roof: 1.48, hwFloor: 0.88, hwBelt: 0.99, hwRoof: 0.76 },
    { z: -1.0, floor: 0.34, belt: 0.99, roof: 1.5, hwFloor: 0.9, hwBelt: 1.02, hwRoof: 0.77 },
    { z: -1.65, floor: 0.35, belt: 1.0, roof: 1.1, hwFloor: 0.91, hwBelt: 1.02, hwRoof: 0.89 },
    { z: -2.05, floor: 0.36, belt: 0.95, roof: 1.02, hwFloor: 0.87, hwBelt: 0.97, hwRoof: 0.88 },
    { z: -2.3, floor: 0.4, belt: 0.89, roof: 0.96, hwFloor: 0.82, hwBelt: 0.92, hwRoof: 0.83 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.5],
  doorSeams: [0.85, -0.5],
  handleZ: -0.2,
  headlight: { width: 0.4, height: 0.16, y: 0.72, inset: 0.26 },
  taillight: { width: 0.5, height: 0.18, y: 0.78, inset: 0.3 },
  grille: { width: 0.66, height: 0.16, y: 0.7 },
  bumperHeight: 0.14,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 2,
  wheelInset: 0.01,
  paint: PALETTE.policeWhite,
};

/** The 4×4 (M8.8 slice 10): a boxy wagon high on big wheels, 4.6 m and 1.95 m tall, a roof rack, a bull bar, a spare on the tailgate. */
export const OFFROAD: CarProfile = {
  name: 'offroad',
  sections: [
    { z: 2.3, floor: 0.64, belt: 1.02, roof: 1.08, hwFloor: 0.9, hwBelt: 0.94, hwRoof: 0.9 },
    { z: 2.12, floor: 0.6, belt: 1.12, roof: 1.17, hwFloor: 0.95, hwBelt: 0.98, hwRoof: 0.95 },
    { z: 1.05, floor: 0.6, belt: 1.18, roof: 1.23, hwFloor: 0.95, hwBelt: 0.98, hwRoof: 0.95 },
    { z: 0.55, floor: 0.6, belt: 1.2, roof: 1.92, hwFloor: 0.95, hwBelt: 0.98, hwRoof: 0.86 },
    { z: -2.05, floor: 0.6, belt: 1.2, roof: 1.94, hwFloor: 0.95, hwBelt: 0.98, hwRoof: 0.87 },
    { z: -2.3, floor: 0.64, belt: 1.18, roof: 1.9, hwFloor: 0.92, hwBelt: 0.96, hwRoof: 0.86 },
  ],
  glassSides: [3, 4],
  glassTops: [2],
  aPillar: 2,
  cPillar: 4,
  pillars: [-0.6],
  doorSeams: [1.0, -0.65],
  handleZ: 0.3,
  headlight: { width: 0.3, height: 0.22, y: 0.93, inset: 0.26 },
  taillight: { width: 0.2, height: 0.32, y: 1.12, inset: 0.14 },
  grille: { width: 0.9, height: 0.24, y: 0.9 },
  bumperHeight: 0.16,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: -0.03,
  wheelStyle: 'heavy',
  parts: [
    // the roof rack's rails and its three cross bars
    { size: [0.06, 0.06, 2.2], at: [0.7, 1.99, -0.75], color: PALETTE.graphite, mirror: true },
    ...[-1.7, -0.75, 0.2].map((z): BodyPart => ({ size: [1.46, 0.05, 0.06], at: [0, 2.03, z], color: PALETTE.graphite })),
    // the bull bar over the grille and the spare wheel on the tailgate
    { size: [1.2, 0.08, 0.08], at: [0, 1.0, 2.38], color: PALETTE.charcoal },
    { size: [0.08, 0.5, 0.08], at: [0.5, 0.78, 2.38], color: PALETTE.charcoal, mirror: true },
    { size: [0.72, 0.72, 0.26], at: [0, 1.28, -2.44], color: PALETTE.tyre },
    { size: [0.4, 0.4, 0.28], at: [0, 1.28, -2.45], color: PALETTE.silver },
  ],
  paint: PALETTE.sand,
};

/**
 * The motorbike's shell (M8.8 slice 14): a slim fairing, tank, seat and tail over its two wheels, 2.1 m, the class's
 * footprint in the tables. The bike and its rider are drawn by bikeMesh.ts (slice 15).
 */
export const MOTO: CarProfile = {
  name: 'moto',
  sections: [
    { z: 1.05, floor: 0.58, belt: 0.8, roof: 0.84, hwFloor: 0.12, hwBelt: 0.15, hwRoof: 0.12 },
    { z: 0.7, floor: 0.52, belt: 0.95, roof: 1.06, hwFloor: 0.2, hwBelt: 0.25, hwRoof: 0.2 },
    { z: 0.1, floor: 0.52, belt: 0.95, roof: 1.0, hwFloor: 0.22, hwBelt: 0.26, hwRoof: 0.22 },
    { z: -0.3, floor: 0.56, belt: 0.86, roof: 0.9, hwFloor: 0.18, hwBelt: 0.2, hwRoof: 0.18 },
    { z: -1.05, floor: 0.62, belt: 0.8, roof: 0.85, hwFloor: 0.1, hwBelt: 0.12, hwRoof: 0.1 },
  ],
  glassSides: [0, 0],
  glassTops: [],
  aPillar: -1,
  cPillar: -1,
  pillars: [],
  doorSeams: [],
  handleZ: 0,
  headlight: { width: 0.14, height: 0.1, y: 0.72, inset: 0.05 },
  taillight: { width: 0.1, height: 0.06, y: 0.76, inset: 0.02 },
  grille: null,
  bumperHeight: 0.04,
  lipSpoiler: false,
  mirrors: false,
  exhausts: 1,
  wheelInset: 0,
  wheelStyle: 'sports',
  paint: PALETTE.carMagenta,
};

export const CAR_PROFILES: Record<CarId, CarProfile> = { muscle: MUSCLE, compact: COMPACT, heavy: HEAVY, sports: SPORTS, police: POLICE, offroad: OFFROAD, moto: MOTO };
