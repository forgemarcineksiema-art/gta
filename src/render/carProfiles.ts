/**
 * Visual profiles per vehicle class (see sim/vehicle/presets.ts for the matching
 * tuning). Heights above ground with the car at rest, +Z forward.
 */
import type { CarId } from '../sim';
import { MUSCLE, type CarProfile } from './carMesh';

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
  wheelInset: -0.05,
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
  cPillar: 4,
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
  wheelInset: -0.04,
};

export const CAR_PROFILES: Record<CarId, CarProfile> = { muscle: MUSCLE, compact: COMPACT, heavy: HEAVY };
