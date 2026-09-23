/**
 * The city's cars (docs/DESIGN.md §13.11, M5.5 slice 19): eight civilian
 * silhouettes on the player's cars' profile format (carMesh.ts; STYLE
 * §Vehicles), each drawn on the axles and footprint of its body in
 * sim/traffic/bodies.ts and the wheels of its class. Heights above the ground
 * at rest, +Z forward, sections from the nose back. The traffic draws them
 * with bodyMesh.ts (a few hundred triangles, instanced); the player drives
 * one after a swap with carMesh.ts in full detail.
 */
import { PALETTE, type BodyId } from '../sim';
import type { CarProfile } from './carMesh';
import { CAR_PROFILES } from './carProfiles';

/** A three-box saloon, 4.7 m: the city's most common car. */
export const SEDAN: CarProfile = {
  name: 'sedan',
  sections: [
    { z: 2.35, floor: 0.36, belt: 0.72, roof: 0.77, hwFloor: 0.78, hwBelt: 0.85, hwRoof: 0.79 },
    { z: 2.1, floor: 0.33, belt: 0.83, roof: 0.87, hwFloor: 0.86, hwBelt: 0.91, hwRoof: 0.86 },
    { z: 1.25, floor: 0.33, belt: 0.87, roof: 0.91, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.87 },
    { z: 0.85, floor: 0.33, belt: 0.89, roof: 0.93, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.87 },
    { z: 0.0, floor: 0.33, belt: 0.91, roof: 1.43, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.72 },
    { z: -0.95, floor: 0.33, belt: 0.92, roof: 1.42, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.72 },
    { z: -1.6, floor: 0.34, belt: 0.94, roof: 0.99, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.86 },
    { z: -2.35, floor: 0.38, belt: 0.9, roof: 0.95, hwFloor: 0.8, hwBelt: 0.87, hwRoof: 0.83 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.45],
  doorSeams: [0.84, -0.45, -1.3],
  handleZ: -0.05,
  headlight: { width: 0.4, height: 0.12, y: 0.62, inset: 0.25 },
  taillight: { width: 0.4, height: 0.15, y: 0.79, inset: 0.24 },
  grille: { width: 0.62, height: 0.1, y: 0.54 },
  bumperHeight: 0.12,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.01,
  paint: PALETTE.carWhite,
};

/** A five-door hatchback, 4.1 m: short nose, tall glasshouse, the tail cut off upright. */
export const HATCH: CarProfile = {
  name: 'hatch',
  sections: [
    { z: 2.05, floor: 0.34, belt: 0.64, roof: 0.68, hwFloor: 0.72, hwBelt: 0.8, hwRoof: 0.74 },
    { z: 1.8, floor: 0.31, belt: 0.76, roof: 0.8, hwFloor: 0.8, hwBelt: 0.87, hwRoof: 0.82 },
    { z: 1.1, floor: 0.31, belt: 0.84, roof: 0.88, hwFloor: 0.81, hwBelt: 0.87, hwRoof: 0.82 },
    { z: 0.35, floor: 0.31, belt: 0.87, roof: 1.46, hwFloor: 0.81, hwBelt: 0.87, hwRoof: 0.7 },
    { z: -1.0, floor: 0.31, belt: 0.89, roof: 1.45, hwFloor: 0.81, hwBelt: 0.87, hwRoof: 0.7 },
    { z: -1.7, floor: 0.33, belt: 0.91, roof: 1.33, hwFloor: 0.8, hwBelt: 0.86, hwRoof: 0.72 },
    { z: -2.05, floor: 0.4, belt: 0.9, roof: 1.0, hwFloor: 0.74, hwBelt: 0.82, hwRoof: 0.76 },
  ],
  glassSides: [3, 4],
  glassTops: [2, 5],
  aPillar: 2,
  cPillar: 4,
  pillars: [-0.33],
  doorSeams: [1.06, -0.33, -1.0],
  handleZ: 0.1,
  headlight: { width: 0.36, height: 0.12, y: 0.57, inset: 0.22 },
  taillight: { width: 0.26, height: 0.2, y: 0.76, inset: 0.16 },
  grille: { width: 0.5, height: 0.08, y: 0.5 },
  bumperHeight: 0.12,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.005,
  wheelStyle: 'compact',
  paint: PALETTE.carWhite,
};

/** An estate, 4.84 m: the saloon's nose, a long roof with rails, an upright tailgate. */
export const ESTATE: CarProfile = {
  name: 'estate',
  sections: [
    { z: 2.42, floor: 0.36, belt: 0.72, roof: 0.77, hwFloor: 0.78, hwBelt: 0.85, hwRoof: 0.79 },
    { z: 2.17, floor: 0.33, belt: 0.83, roof: 0.87, hwFloor: 0.86, hwBelt: 0.91, hwRoof: 0.86 },
    { z: 1.3, floor: 0.33, belt: 0.87, roof: 0.91, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.87 },
    { z: 0.95, floor: 0.33, belt: 0.89, roof: 0.93, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.87 },
    { z: 0.1, floor: 0.33, belt: 0.91, roof: 1.46, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.73 },
    { z: -1.95, floor: 0.34, belt: 0.93, roof: 1.44, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.74 },
    { z: -2.3, floor: 0.36, belt: 0.93, roof: 1.38, hwFloor: 0.86, hwBelt: 0.91, hwRoof: 0.76 },
    { z: -2.42, floor: 0.4, belt: 0.9, roof: 1.02, hwFloor: 0.8, hwBelt: 0.87, hwRoof: 0.8 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 6],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.52, -1.35],
  doorSeams: [0.92, -0.52, -1.35],
  handleZ: -0.1,
  headlight: { width: 0.4, height: 0.12, y: 0.62, inset: 0.25 },
  taillight: { width: 0.2, height: 0.24, y: 0.76, inset: 0.14 },
  grille: { width: 0.62, height: 0.1, y: 0.54 },
  bumperHeight: 0.12,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.01,
  parts: [{ size: [0.05, 0.05, 1.8], at: [0.6, 1.475, -0.92], color: PALETTE.silver, mirror: true }],
  paint: PALETTE.carWhite,
};

/** A family SUV, 4.7 m and 1.75 m tall: high floor, upright glass, roof rails. */
export const SUV: CarProfile = {
  name: 'suv',
  sections: [
    { z: 2.35, floor: 0.5, belt: 0.9, roof: 0.95, hwFloor: 0.84, hwBelt: 0.9, hwRoof: 0.86 },
    { z: 2.12, floor: 0.46, belt: 1.0, roof: 1.04, hwFloor: 0.91, hwBelt: 0.96, hwRoof: 0.92 },
    { z: 1.1, floor: 0.46, belt: 1.05, roof: 1.09, hwFloor: 0.91, hwBelt: 0.96, hwRoof: 0.92 },
    { z: 0.4, floor: 0.46, belt: 1.07, roof: 1.73, hwFloor: 0.91, hwBelt: 0.96, hwRoof: 0.8 },
    { z: -1.7, floor: 0.46, belt: 1.09, roof: 1.73, hwFloor: 0.91, hwBelt: 0.96, hwRoof: 0.8 },
    { z: -2.2, floor: 0.47, belt: 1.09, roof: 1.64, hwFloor: 0.9, hwBelt: 0.95, hwRoof: 0.82 },
    { z: -2.35, floor: 0.52, belt: 1.05, roof: 1.2, hwFloor: 0.86, hwBelt: 0.92, hwRoof: 0.84 },
  ],
  glassSides: [3, 4],
  glassTops: [2, 5],
  aPillar: 2,
  cPillar: 4,
  pillars: [-0.6],
  doorSeams: [1.02, -0.6, -1.65],
  handleZ: 0.2,
  headlight: { width: 0.44, height: 0.13, y: 0.8, inset: 0.26 },
  taillight: { width: 0.24, height: 0.26, y: 0.9, inset: 0.15 },
  grille: { width: 0.7, height: 0.14, y: 0.66 },
  bumperHeight: 0.08,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.01,
  wheelStyle: 'heavy',
  parts: [{ size: [0.05, 0.05, 1.8], at: [0.66, 1.755, -0.65], color: PALETTE.silver, mirror: true }],
  paint: PALETTE.carWhite,
};

/** A regular-cab pickup, 5.4 m: long bonnet, a short cab, the open bed dark from above. */
export const PICKUP: CarProfile = {
  name: 'pickup',
  sections: [
    { z: 2.7, floor: 0.52, belt: 0.98, roof: 1.03, hwFloor: 0.88, hwBelt: 0.94, hwRoof: 0.9 },
    { z: 2.48, floor: 0.48, belt: 1.1, roof: 1.14, hwFloor: 0.93, hwBelt: 0.98, hwRoof: 0.94 },
    { z: 1.25, floor: 0.48, belt: 1.14, roof: 1.18, hwFloor: 0.93, hwBelt: 0.98, hwRoof: 0.94 },
    { z: 0.6, floor: 0.48, belt: 1.16, roof: 1.83, hwFloor: 0.93, hwBelt: 0.98, hwRoof: 0.82 },
    { z: -0.5, floor: 0.48, belt: 1.16, roof: 1.83, hwFloor: 0.93, hwBelt: 0.98, hwRoof: 0.82 },
    { z: -0.6, floor: 0.48, belt: 1.16, roof: 1.2, hwFloor: 0.93, hwBelt: 0.98, hwRoof: 0.96 },
    { z: -2.62, floor: 0.5, belt: 1.16, roof: 1.2, hwFloor: 0.93, hwBelt: 0.98, hwRoof: 0.96 },
    { z: -2.7, floor: 0.55, belt: 1.12, roof: 1.16, hwFloor: 0.88, hwBelt: 0.94, hwRoof: 0.92 },
  ],
  glassSides: [3, 4],
  glassTops: [2, 4],
  darkTops: [5],
  aPillar: 2,
  cPillar: -1,
  pillars: [],
  doorSeams: [1.2, -0.45],
  handleZ: -0.2,
  headlight: { width: 0.4, height: 0.16, y: 0.84, inset: 0.24 },
  taillight: { width: 0.16, height: 0.3, y: 0.9, inset: 0.1 },
  grille: { width: 0.9, height: 0.2, y: 0.72 },
  bumperHeight: 0.1,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 1,
  wheelInset: 0.01,
  wheelStyle: 'heavy',
  parts: [{ size: [0.07, 0.05, 2.02], at: [0.925, 1.225, -1.61], color: 'paint', mirror: true }],
  paint: PALETTE.carWhite,
};

/** The sedan in the coin's yellow, a roof sign and an ink band along the flanks: the tower's taxi. */
export const TAXI: CarProfile = {
  ...SEDAN,
  name: 'taxi',
  parts: [
    { size: [0.6, 0.2, 0.28], at: [0, 1.53, -0.45], color: PALETTE.coin },
    { size: [0.5, 0.08, 0.3], at: [0, 1.53, -0.45], color: PALETTE.ink },
    { size: [0.012, 0.07, 3.1], at: [0.918, 0.8, 0.1], color: PALETTE.ink, mirror: true },
  ],
  paint: PALETTE.coin,
};

/** A cab-over box truck, 7 m: the cab in the paint, a white box with a stripe of it, roll-up doors. */
export const TRUCK: CarProfile = {
  name: 'truck',
  sections: [
    { z: 3.5, floor: 0.55, belt: 1.3, roof: 1.36, hwFloor: 1.0, hwBelt: 1.04, hwRoof: 1.0 },
    { z: 3.4, floor: 0.5, belt: 1.4, roof: 2.35, hwFloor: 1.04, hwBelt: 1.08, hwRoof: 0.98 },
    { z: 2.45, floor: 0.5, belt: 1.42, roof: 2.45, hwFloor: 1.04, hwBelt: 1.08, hwRoof: 1.0 },
    { z: 1.85, floor: 0.5, belt: 1.42, roof: 2.45, hwFloor: 1.04, hwBelt: 1.08, hwRoof: 1.0 },
    { z: 1.8, floor: 0.62, belt: 1.45, roof: 3.2, hwFloor: 1.1, hwBelt: 1.12, hwRoof: 1.12 },
    { z: -3.45, floor: 0.62, belt: 1.45, roof: 3.2, hwFloor: 1.1, hwBelt: 1.12, hwRoof: 1.12 },
    { z: -3.5, floor: 0.62, belt: 1.42, roof: 3.16, hwFloor: 1.08, hwBelt: 1.1, hwRoof: 1.1 },
  ],
  glassSides: [1, 2],
  glassTops: [0],
  aPillar: 0,
  cPillar: -1,
  pillars: [],
  doorSeams: [3.35, 2.5],
  handleZ: 2.65,
  headlight: { width: 0.34, height: 0.16, y: 0.78, inset: 0.2 },
  taillight: { width: 0.18, height: 0.14, y: 0.78, inset: 0.12 },
  grille: { width: 1.0, height: 0.3, y: 1.05 },
  bumperHeight: 0.15,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 0,
  wheelInset: 0.01,
  wheelStyle: 'heavy',
  fixed: { from: 3, to: 6, color: PALETTE.carWhite },
  parts: [
    { size: [0.012, 0.3, 4.6], at: [1.126, 2.2, -0.8], color: 'paint', mirror: true },
    { size: [0.03, 2.2, 0.02], at: [0, 1.95, -3.51], color: PALETTE.slate },
    { size: [1.9, 0.02, 0.02], at: [0, 1.3, -3.51], color: PALETTE.slate },
    { size: [2.0, 0.12, 0.12], at: [0, 0.48, -3.4], color: PALETTE.charcoal },
    { size: [0.28, 0.3, 0.9], at: [-0.86, 0.42, 0.3], color: PALETTE.steel },
  ],
  paint: PALETTE.carBlue,
};

/** A city bus, 12 m on two axles: a flat face with a big screen, a glass band, doors on the kerb side. */
export const BUS: CarProfile = {
  name: 'bus',
  sections: [
    { z: 6.0, floor: 0.45, belt: 1.05, roof: 1.12, hwFloor: 1.2, hwBelt: 1.24, hwRoof: 1.2 },
    { z: 5.92, floor: 0.4, belt: 1.12, roof: 2.95, hwFloor: 1.24, hwBelt: 1.27, hwRoof: 1.22 },
    { z: -5.92, floor: 0.4, belt: 1.12, roof: 3.0, hwFloor: 1.24, hwBelt: 1.27, hwRoof: 1.24 },
    { z: -6.0, floor: 0.45, belt: 1.1, roof: 2.95, hwFloor: 1.2, hwBelt: 1.24, hwRoof: 1.2 },
  ],
  glassSides: [1, 2],
  glassTops: [0],
  aPillar: 0,
  cPillar: -1,
  pillars: [4.55, 3.25, 1.95, 0.65, -0.65, -1.95, -3.25, -4.55],
  doorSeams: [],
  handleZ: 99,
  headlight: { width: 0.36, height: 0.16, y: 0.75, inset: 0.22 },
  taillight: { width: 0.2, height: 0.3, y: 0.85, inset: 0.12 },
  grille: null,
  windowMargins: { bottom: 0.12, top: 0.5 },
  bumperHeight: 0.14,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 0,
  wheelInset: 0.01,
  wheelStyle: 'heavy',
  parts: [
    // the doors on the kerb side (+X is the left), the screen, the roof's cooling pod, the rear window and engine grille
    { size: [0.03, 2.3, 1.15], at: [-1.265, 1.55, 4.7], color: 0x294653 },
    { size: [0.03, 2.3, 1.15], at: [-1.265, 1.55, -0.6], color: 0x294653 },
    { size: [1.9, 0.26, 0.04], at: [0, 2.76, 5.99], color: PALETTE.ink },
    { size: [1.2, 0.12, 0.05], at: [0, 2.76, 5.995], color: PALETTE.carOrange },
    { size: [1.4, 0.25, 2.2], at: [0, 3.12, 1.0], color: PALETTE.lightGrey },
    { size: [2.0, 0.9, 0.03], at: [0, 2.2, -6.01], color: 0x294653 },
    { size: [1.6, 0.4, 0.03], at: [0, 0.85, -6.01], color: PALETTE.charcoal },
  ],
  paint: PALETTE.carOrange,
};

/** Every body's profile: the player's five classes and the city's eight. */
export const BODY_PROFILES: Record<BodyId, CarProfile> = {
  ...CAR_PROFILES,
  sedan: SEDAN, hatch: HATCH, estate: ESTATE, suv: SUV, pickup: PICKUP, taxi: TAXI, truck: TRUCK, bus: BUS,
};
