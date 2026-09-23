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
import type { BodyPart, CarProfile } from './carMesh';
import { CAR_PROFILES, POLICE as POLICE_CAR, SPORTS } from './carProfiles';

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

/**
 * The hidden ice-cream truck (M5.5 slice 16), 5.8 m: the box truck's shape shortened, a mint cab, a white box
 * with mint bands, the serving hatch with its counter and a pink awning on the kerb side, and on the roof a
 * wafer cone narrowing down under a pink scoop and a cherry.
 */
export const ICECREAM: CarProfile = {
  ...TRUCK,
  name: 'icecream',
  sections: [
    { z: 2.9, floor: 0.55, belt: 1.25, roof: 1.3, hwFloor: 1.0, hwBelt: 1.04, hwRoof: 1.0 },
    { z: 2.82, floor: 0.5, belt: 1.35, roof: 2.25, hwFloor: 1.04, hwBelt: 1.08, hwRoof: 0.98 },
    { z: 2.05, floor: 0.5, belt: 1.37, roof: 2.35, hwFloor: 1.04, hwBelt: 1.08, hwRoof: 1.0 },
    { z: 1.55, floor: 0.5, belt: 1.37, roof: 2.35, hwFloor: 1.04, hwBelt: 1.08, hwRoof: 1.0 },
    { z: 1.5, floor: 0.6, belt: 1.4, roof: 2.9, hwFloor: 1.1, hwBelt: 1.12, hwRoof: 1.1 },
    { z: -2.85, floor: 0.6, belt: 1.4, roof: 2.9, hwFloor: 1.1, hwBelt: 1.12, hwRoof: 1.1 },
    { z: -2.9, floor: 0.6, belt: 1.37, roof: 2.86, hwFloor: 1.08, hwBelt: 1.1, hwRoof: 1.08 },
  ],
  doorSeams: [2.78, 2.1],
  handleZ: 2.2,
  fixed: { from: 3, to: 6, color: PALETTE.carWhite },
  parts: [
    // mint bands along the box, the rear doors' seam, the bumper
    { size: [0.012, 0.22, 4.1], at: [1.126, 2.4, -0.65], color: 'paint', mirror: true },
    { size: [0.012, 0.1, 4.1], at: [1.126, 1.05, -0.65], color: 'paint', mirror: true },
    { size: [0.03, 1.9, 0.02], at: [0, 1.75, -2.91], color: PALETTE.slate },
    { size: [1.9, 0.12, 0.12], at: [0, 0.48, -2.8], color: PALETTE.charcoal },
    // the serving hatch on the kerb side (-X), its counter and the awning over it
    { size: [0.03, 0.75, 1.7], at: [-1.13, 1.85, -0.55], color: 0x294653 },
    { size: [0.22, 0.05, 1.7], at: [-1.24, 1.45, -0.55], color: PALETTE.lightGrey },
    { size: [0.36, 0.04, 1.9], at: [-1.3, 2.32, -0.55], color: PALETTE.iceCream },
    // the cone on the roof: the wafer narrowing down, the scoop, a cherry
    { size: [0.14, 0.14, 0.14], at: [0, 2.99, -0.9], color: PALETTE.wafer },
    { size: [0.24, 0.14, 0.24], at: [0, 3.12, -0.9], color: PALETTE.wafer },
    { size: [0.34, 0.14, 0.34], at: [0, 3.25, -0.9], color: PALETTE.wafer },
    { size: [0.52, 0.32, 0.52], at: [0, 3.48, -0.9], color: PALETTE.iceCream },
    { size: [0.34, 0.12, 0.34], at: [0, 3.69, -0.9], color: PALETTE.iceCream },
    { size: [0.1, 0.1, 0.1], at: [0, 3.8, -0.9], color: PALETTE.carRed },
  ],
  paint: 0x91aca3,
};

/**
 * The wanted board's cars (M6 slices 4–5, DESIGN.md §14.3): each rival's own, won in their duel. Built as the
 * city's set is, on their bodies' axles and footprints (sim/traffic/bodies.ts).
 */

/** Granny Gears' wagon: the estate hot-rodded, a blower through the bonnet, side pipes, flower pots on the rack. */
export const WAGON: CarProfile = {
  ...ESTATE,
  name: 'wagon',
  exhausts: 0,
  wheelStyle: 'muscle',
  parts: [
    { size: [0.05, 0.05, 1.8], at: [0.6, 1.475, -0.92], color: PALETTE.silver, mirror: true },
    { size: [1.25, 0.04, 0.05], at: [0, 1.5, -0.25], color: PALETTE.silver },
    { size: [1.25, 0.04, 0.05], at: [0, 1.5, -1.6], color: PALETTE.silver },
    // three pots across the rack, their leaves and a pink bloom on each
    ...[-0.45, -0.95, -1.45].flatMap((z, k): BodyPart[] => [
      { size: [0.3, 0.24, 0.3], at: [k === 1 ? 0 : (k === 0 ? 0.28 : -0.28), 1.64, z], color: PALETTE.wafer },
      { size: [0.36, 0.14, 0.36], at: [k === 1 ? 0 : (k === 0 ? 0.28 : -0.28), 1.83, z], color: PALETTE.grass },
      { size: [0.14, 0.1, 0.14], at: [k === 1 ? 0 : (k === 0 ? 0.28 : -0.28), 1.95, z], color: PALETTE.iceCream },
    ]),
    // the blower: its case through the bonnet and the intake on top
    { size: [0.44, 0.2, 0.56], at: [0, 1.0, 1.35], color: PALETTE.chrome },
    { size: [0.32, 0.14, 0.3], at: [0, 1.16, 1.35], color: PALETTE.ink },
    // side pipes along the sills
    { size: [0.09, 0.09, 1.9], at: [0.97, 0.33, -0.1], color: PALETTE.chrome, mirror: true },
  ],
  paint: 0xb1a8ba,
};

/** Pepperoni Pete's pizza hatch: the hatchback under a giant slice sign, point down, crust up, pepperoni on it. */
export const PIZZA: CarProfile = {
  ...HATCH,
  name: 'pizza',
  parts: [
    { size: [0.1, 0.12, 0.1], at: [0, 1.52, -0.35], color: PALETTE.ink },
    ...[0.16, 0.34, 0.52, 0.7].map((w, k): BodyPart => ({ size: [w, 0.12, 0.06], at: [0, 1.64 + k * 0.12, -0.35], color: PALETTE.coin })),
    { size: [0.84, 0.13, 0.1], at: [0, 2.12, -0.35], color: PALETTE.wafer },
    { size: [0.12, 0.1, 0.08], at: [0.14, 1.94, -0.35], color: PALETTE.carRed },
    { size: [0.12, 0.1, 0.08], at: [-0.18, 1.88, -0.35], color: PALETTE.carRed },
    { size: [0.1, 0.09, 0.08], at: [0.06, 1.74, -0.35], color: PALETTE.carRed },
    { size: [0.12, 0.1, 0.08], at: [-0.04, 2.02, -0.35], color: PALETTE.carRed },
    // the hot bag strapped to the tailgate side
    { size: [0.012, 0.12, 1.9], at: [0.875, 0.62, 0.1], color: PALETTE.coin, mirror: true },
  ],
  paint: PALETTE.carRed,
};

/** Tow Truck Tina's wrecker: the pickup with a winch, a crane over the bed, its hook, a tow bar and an amber bar. */
export const WRECKER: CarProfile = {
  ...PICKUP,
  name: 'wrecker',
  parts: [
    { size: [0.07, 0.05, 2.02], at: [0.925, 1.225, -1.61], color: 'paint', mirror: true },
    { size: [0.9, 0.22, 0.22], at: [0, 1.32, -0.78], color: PALETTE.steel },
    { size: [0.18, 0.9, 0.18], at: [0, 1.65, -0.95], color: PALETTE.charcoal },
    { size: [0.14, 0.14, 1.62], at: [0, 2.06, -1.72], color: PALETTE.charcoal },
    { size: [0.03, 0.55, 0.03], at: [0, 1.76, -2.5], color: PALETTE.ink },
    { size: [0.16, 0.14, 0.09], at: [0, 1.44, -2.5], color: PALETTE.steel },
    { size: [1.2, 0.08, 0.1], at: [0, 0.52, -2.64], color: PALETTE.charcoal },
    { size: [1.2, 0.1, 0.22], at: [0, 1.89, 0.05], color: PALETTE.charcoal },
    { size: [0.3, 0.12, 0.24], at: [0.38, 1.95, 0.05], color: PALETTE.cone, mirror: true },
  ],
  paint: PALETTE.carOrange,
};

/** The Twins' coupe: the sports car with twin stripes in its dark tone and a wing on the tail. */
export const TWIN: CarProfile = {
  ...SPORTS,
  name: 'twin',
  lipSpoiler: false,
  parts: [
    { size: [0.12, 0.012, 1.25], at: [0.15, 0.818, 1.18], color: 'dark', mirror: true },
    { size: [0.12, 0.012, 0.78], at: [0.15, 1.207, -0.52], color: 'dark', mirror: true },
    { size: [0.06, 0.2, 0.1], at: [0.55, 0.97, -1.95], color: PALETTE.charcoal, mirror: true },
    { size: [1.5, 0.05, 0.3], at: [0, 1.09, -1.95], color: 'paint' },
  ],
  paint: 0x91aca3,
};

/** Fake Frank's cruiser: the police saloon under a disco bar, a magenta band and a star he drew himself. */
export const FAKECOP: CarProfile = {
  ...POLICE_CAR,
  name: 'fakecop',
  parts: [
    { size: [1.2, 0.08, 0.26], at: [0, 1.54, -0.45], color: PALETTE.charcoal },
    ...[PALETTE.iceCream, PALETTE.carLime, PALETTE.coin, PALETTE.carBlue, PALETTE.carMagenta].map((c, k): BodyPart => ({ size: [0.2, 0.12, 0.22], at: [-0.48 + k * 0.24, 1.63, -0.45], color: c })),
    { size: [0.012, 0.14, 2.6], at: [0.955, 0.72, -0.1], color: PALETTE.carMagenta, mirror: true },
    { size: [0.012, 0.16, 0.16], at: [0.96, 0.84, 0.3], color: PALETTE.coin, mirror: true },
  ],
  paint: PALETTE.policeWhite,
};

/** Big Bernie's party bus: the bus with a railed roof deck, speaker stacks, a disco ball and party stripes. */
export const PARTYBUS: CarProfile = {
  ...BUS,
  name: 'partybus',
  parts: [
    ...(BUS.parts ?? []).filter((p) => p.at[1] < 3.0),
    { size: [0.05, 0.05, 10.6], at: [1.15, 3.46, -0.3], color: PALETTE.chrome, mirror: true },
    { size: [2.3, 0.05, 0.05], at: [0, 3.46, 4.95], color: PALETTE.chrome },
    { size: [2.3, 0.05, 0.05], at: [0, 3.46, -5.6], color: PALETTE.chrome },
    ...[4.95, 2.4, -0.2, -2.8, -5.6].map((z): BodyPart => ({ size: [0.05, 0.45, 0.05], at: [1.15, 3.22, z], color: PALETTE.chrome, mirror: true })),
    { size: [0.5, 0.7, 0.5], at: [0.7, 3.35, 3.7], color: PALETTE.ink, mirror: true },
    { size: [0.3, 0.3, 0.02], at: [0.7, 3.45, 3.95], color: PALETTE.steel, mirror: true },
    { size: [0.05, 0.8, 0.05], at: [0, 3.4, -1.5], color: PALETTE.steel },
    { size: [0.42, 0.42, 0.42], at: [0, 3.95, -1.5], color: PALETTE.chrome },
    { size: [0.012, 0.16, 11.4], at: [1.275, 1.28, 0], color: PALETTE.carLime, mirror: true },
    { size: [0.012, 0.1, 11.4], at: [1.275, 1.08, 0], color: PALETTE.coin, mirror: true },
  ],
  paint: PALETTE.carMagenta,
};

/** Neon Niko's lowrider: a long low coupe on hydraulics, chrome bumpers, pink pinstripes, the spare on the tail. */
export const LOWRIDER: CarProfile = {
  name: 'lowrider',
  sections: [
    { z: 2.55, floor: 0.26, belt: 0.62, roof: 0.66, hwFloor: 0.84, hwBelt: 0.9, hwRoof: 0.82 },
    { z: 2.3, floor: 0.24, belt: 0.72, roof: 0.76, hwFloor: 0.9, hwBelt: 0.98, hwRoof: 0.88 },
    { z: 1.2, floor: 0.24, belt: 0.76, roof: 0.8, hwFloor: 0.9, hwBelt: 1.0, hwRoof: 0.9 },
    { z: 0.45, floor: 0.24, belt: 0.77, roof: 0.81, hwFloor: 0.9, hwBelt: 1.0, hwRoof: 0.9 },
    { z: -0.2, floor: 0.24, belt: 0.79, roof: 1.2, hwFloor: 0.9, hwBelt: 1.0, hwRoof: 0.76 },
    { z: -1.2, floor: 0.24, belt: 0.8, roof: 1.19, hwFloor: 0.9, hwBelt: 1.0, hwRoof: 0.76 },
    { z: -1.75, floor: 0.25, belt: 0.82, roof: 0.86, hwFloor: 0.9, hwBelt: 1.0, hwRoof: 0.9 },
    { z: -2.55, floor: 0.28, belt: 0.78, roof: 0.82, hwFloor: 0.86, hwBelt: 0.94, hwRoof: 0.86 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.7],
  doorSeams: [0.5, -0.75],
  handleZ: -0.4,
  headlight: { width: 0.36, height: 0.12, y: 0.52, inset: 0.24 },
  taillight: { width: 0.3, height: 0.1, y: 0.62, inset: 0.24 },
  grille: { width: 0.9, height: 0.14, y: 0.46 },
  bumperHeight: 0.1,
  lipSpoiler: false,
  mirrors: true,
  exhausts: 2,
  wheelInset: -0.02,
  wheelStyle: 'sports',
  parts: [
    { size: [1.7, 0.1, 0.08], at: [0, 0.34, 2.56], color: PALETTE.chrome },
    { size: [1.7, 0.1, 0.08], at: [0, 0.36, -2.56], color: PALETTE.chrome },
    { size: [0.5, 0.5, 0.12], at: [0, 0.62, -2.6], color: PALETTE.rubber },
    { size: [0.22, 0.22, 0.13], at: [0, 0.62, -2.61], color: PALETTE.chrome },
    { size: [0.012, 0.03, 4.4], at: [0.955, 0.66, 0], color: PALETTE.iceCream, mirror: true },
  ],
  paint: PALETTE.carBlue,
};

/** The Mayor's Nephew's limo: the saloon stretched to 6.8 m, three windows a side, chrome trim, flags on the wings. */
export const LIMO: CarProfile = {
  ...SEDAN,
  name: 'limo',
  sections: [
    { z: 3.4, floor: 0.36, belt: 0.72, roof: 0.77, hwFloor: 0.78, hwBelt: 0.85, hwRoof: 0.79 },
    { z: 3.15, floor: 0.33, belt: 0.83, roof: 0.87, hwFloor: 0.86, hwBelt: 0.91, hwRoof: 0.86 },
    { z: 2.3, floor: 0.33, belt: 0.87, roof: 0.91, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.87 },
    { z: 1.9, floor: 0.33, belt: 0.89, roof: 0.93, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.87 },
    { z: 1.05, floor: 0.33, belt: 0.91, roof: 1.43, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.72 },
    { z: -2.0, floor: 0.33, belt: 0.92, roof: 1.42, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.72 },
    { z: -2.65, floor: 0.34, belt: 0.94, roof: 0.99, hwFloor: 0.87, hwBelt: 0.92, hwRoof: 0.86 },
    { z: -3.4, floor: 0.38, belt: 0.9, roof: 0.95, hwFloor: 0.8, hwBelt: 0.87, hwRoof: 0.83 },
  ],
  pillars: [0.05, -1.0],
  doorSeams: [1.85, 0.05, -1.0, -1.95],
  handleZ: 0.95,
  parts: [
    { size: [0.02, 0.36, 0.02], at: [0.72, 1.1, 3.0], color: PALETTE.chrome, mirror: true },
    { size: [0.012, 0.16, 0.26], at: [0.72, 1.2, 2.86], color: PALETTE.carRed, mirror: true },
    { size: [0.014, 0.06, 0.26], at: [0.72, 1.2, 2.86], color: PALETTE.carWhite, mirror: true },
    { size: [0.012, 0.03, 6.4], at: [0.93, 0.6, 0], color: PALETTE.chrome, mirror: true },
    { size: [0.015, 0.42, 0.015], at: [0.42, 1.16, -3.05], color: PALETTE.steel },
  ],
  paint: PALETTE.carGold,
};

/** Professor Pip's bubble: a one-door microcar, the whole nose a door, glass all round. */
export const BUBBLE: CarProfile = {
  name: 'bubble',
  sections: [
    { z: 1.45, floor: 0.3, belt: 0.55, roof: 0.62, hwFloor: 0.7, hwBelt: 0.8, hwRoof: 0.7 },
    { z: 1.2, floor: 0.28, belt: 0.72, roof: 1.05, hwFloor: 0.82, hwBelt: 0.92, hwRoof: 0.78 },
    { z: 0.7, floor: 0.28, belt: 0.78, roof: 1.42, hwFloor: 0.86, hwBelt: 0.96, hwRoof: 0.8 },
    { z: -0.3, floor: 0.28, belt: 0.8, roof: 1.46, hwFloor: 0.86, hwBelt: 0.96, hwRoof: 0.8 },
    { z: -1.0, floor: 0.3, belt: 0.8, roof: 1.2, hwFloor: 0.84, hwBelt: 0.94, hwRoof: 0.78 },
    { z: -1.45, floor: 0.34, belt: 0.72, roof: 0.82, hwFloor: 0.76, hwBelt: 0.84, hwRoof: 0.74 },
  ],
  glassSides: [2, 3],
  glassTops: [1, 3],
  aPillar: 1,
  cPillar: 3,
  pillars: [],
  doorSeams: [1.15],
  handleZ: 1.3,
  headlight: { width: 0.2, height: 0.14, y: 0.52, inset: 0.16 },
  taillight: { width: 0.16, height: 0.12, y: 0.64, inset: 0.12 },
  grille: null,
  bumperHeight: 0.08,
  lipSpoiler: false,
  mirrors: false,
  exhausts: 1,
  wheelInset: 0.005,
  wheelStyle: 'compact',
  parts: [
    { size: [0.9, 0.06, 0.06], at: [0, 0.4, 1.47], color: PALETTE.chrome },
    { size: [0.9, 0.06, 0.06], at: [0, 0.42, -1.47], color: PALETTE.chrome },
  ],
  paint: PALETTE.carLime,
};

/** The Ghost's phantom: the sports car in matte black, skirts and a slim wing, its lamps dark. */
export const PHANTOM: CarProfile = {
  ...SPORTS,
  name: 'phantom',
  lipSpoiler: false,
  lampsOff: true,
  parts: [
    { size: [0.03, 0.08, 2.2], at: [0.96, 0.32, -0.1], color: PALETTE.ink, mirror: true },
    { size: [0.06, 0.18, 0.1], at: [0.55, 0.96, -1.98], color: PALETTE.ink, mirror: true },
    { size: [1.55, 0.04, 0.26], at: [0, 1.06, -1.98], color: PALETTE.charcoal },
  ],
  paint: PALETTE.carBlack,
};

/** The Chief's cruiser: the police saloon in gold trim, a gold star a side, his own light bar and a push bar. */
export const CHIEFCAR: CarProfile = {
  ...POLICE_CAR,
  name: 'chiefcar',
  parts: [
    { size: [0.012, 0.12, 3.9], at: [0.955, 0.78, -0.05], color: PALETTE.carGold, mirror: true },
    { size: [0.014, 0.22, 0.22], at: [0.96, 0.84, 0.25], color: PALETTE.carGold, mirror: true },
    { size: [1.25, 0.09, 0.28], at: [0, 1.545, -0.45], color: PALETTE.charcoal },
    { size: [0.5, 0.12, 0.26], at: [0.32, 1.64, -0.45], color: PALETTE.carRed },
    { size: [0.5, 0.12, 0.26], at: [-0.32, 1.64, -0.45], color: PALETTE.policeBlue },
    { size: [1.3, 0.3, 0.08], at: [0, 0.6, 2.34], color: PALETTE.ink },
  ],
  paint: PALETTE.policeWhite,
};

/** Every body's profile: the player's five classes, the city's eight, the hidden truck and the wanted board's cars. */
export const BODY_PROFILES: Record<BodyId, CarProfile> = {
  ...CAR_PROFILES,
  sedan: SEDAN, hatch: HATCH, estate: ESTATE, suv: SUV, pickup: PICKUP, taxi: TAXI, truck: TRUCK, bus: BUS, icecream: ICECREAM,
  wagon: WAGON, pizza: PIZZA, wrecker: WRECKER, twin: TWIN, fakecop: FAKECOP, partybus: PARTYBUS,
  lowrider: LOWRIDER, limo: LIMO, bubble: BUBBLE, phantom: PHANTOM, chiefcar: CHIEFCAR,
};
