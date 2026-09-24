/**
 * The city's cars (docs/DESIGN.md §13.11, M5.5 slice 19). A body is what a
 * traffic record looks like and how big it is; its class is how it drives:
 * the planner's class, the swap's physics, the police's roles. The first
 * five bodies are the player's classes in their own shells (an abandoned
 * player car, a police unit, an order's car); the other eight are the
 * civilian set the spawner draws from. Appended, never renumbered: the index
 * is packed into descriptors next to the paint, and a class's index is its
 * own body's index, so a descriptor written before the bodies still reads.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import { CAR_IDS, CAR_PRESETS, type CarId } from '../vehicle/presets';
import { cloneTuning, type VehicleTuning } from '../vehicle/tuning';

/** The wanted board's cars (M6, DESIGN.md §14.3): the ten rivals' and the Chief's, never spawned as traffic. */
export type RivalBody = 'wagon' | 'pizza' | 'wrecker' | 'twin' | 'fakecop' | 'partybus' | 'lowrider' | 'limo' | 'bubble' | 'phantom' | 'chiefcar';
export type CivilianBody = 'sedan' | 'hatch' | 'estate' | 'suv' | 'pickup' | 'taxi' | 'truck' | 'bus' | 'icecream' | RivalBody | 'roadster' | 'sweeper' | 'hotdog';
export type BodyId = CarId | CivilianBody;
export const RIVAL_BODIES: readonly RivalBody[] = ['wagon', 'pizza', 'wrecker', 'twin', 'fakecop', 'partybus', 'lowrider', 'limo', 'bubble', 'phantom', 'chiefcar'];
export const CIVILIAN_BODIES: readonly CivilianBody[] = ['sedan', 'hatch', 'estate', 'suv', 'pickup', 'taxi', 'truck', 'bus', 'icecream', ...RIVAL_BODIES, 'roadster', 'sweeper', 'hotdog'];
export const BODY_IDS: readonly BodyId[] = [...CAR_IDS, ...CIVILIAN_BODIES];

/** Traffic's paints (the order cards name them in jobs/catalog.ts). */
export const CIVILIAN_PAINTS: readonly number[] = [
  PALETTE.carLime, PALETTE.carBlue, PALETTE.carOrange, PALETTE.carMagenta,
  PALETTE.carWhite, PALETTE.carBlack, CITY_COLORS.mint, CITY_COLORS.peach,
];
/** The bus company's liveries. */
const BUS_PAINTS: readonly number[] = [CITY_COLORS.mint, PALETTE.carOrange, PALETTE.carBlue, CITY_COLORS.peach];

export interface BodySpec {
  id: BodyId;
  /** The class it drives as: the swap's physics, the police's roles, the class factor when `pace` is 0. */
  car: CarId;
  halfWidth: number;
  halfLength: number;
  /** Axle spacing and track; the wheels' radius and width are the class's. */
  wheelBase: number;
  trackWidth: number;
  /** Kg; 0 takes the traffic tuning's class mass (the player's shells). */
  mass: number;
  /** Share of the lane's limit on top of the driver's pace (DESIGN.md §13.8); 0 takes the class's. */
  pace: number;
  paints: readonly number[];
  /** Pulls over for a siren by slowing only, never to the kerb (the van, the truck, the bus). */
  big: boolean;
  /** Never changes lane and goes straight on where it can (the bus). */
  keepsLane: boolean;
  /** Overtakes when the car ahead is this share of `overtake.slowerBy` slower: under 1 hops lanes (the taxi). */
  hops: number;
  /** A swap drives the class stretched to this body, every force scaled with the mass (the truck, the bus). */
  stretch: boolean;
}

function shell(id: CarId): BodySpec {
  const p = CAR_PRESETS[id];
  return {
    id, car: id, halfWidth: p.chassisHalfExtents.x, halfLength: p.chassisHalfExtents.z, wheelBase: p.wheelBase, trackWidth: p.trackWidth,
    mass: 0, pace: 0, paints: CIVILIAN_PAINTS, big: id === 'heavy', keepsLane: false, hops: 1, stretch: false,
  };
}

function civilian(id: CivilianBody, car: CarId, halfWidth: number, halfLength: number, wheelBase: number, trackWidth: number, mass: number, pace: number, more: Partial<BodySpec> = {}): BodySpec {
  return { id, car, halfWidth, halfLength, wheelBase, trackWidth, mass, pace, paints: CIVILIAN_PAINTS, big: false, keepsLane: false, hops: 1, stretch: false, ...more };
}

/** A rival's car on a class's own shell's footprint (the Twin, the Fake Cruiser, the Phantom, the Chief's Cruiser). */
function onShell(id: RivalBody, car: CarId, paint: number): BodySpec {
  const p = CAR_PRESETS[car];
  return civilian(id, car, p.chassisHalfExtents.x, p.chassisHalfExtents.z, p.wheelBase, p.trackWidth, p.mass, 1, { paints: [paint] });
}

/** Indexed like BODY_IDS. Sizes in metres; the profiles in render/bodyProfiles.ts are drawn on these wheels. */
export const BODIES: readonly BodySpec[] = [
  ...CAR_IDS.map(shell),
  civilian('sedan', 'muscle', 0.92, 2.35, 2.8, 1.6, 1400, 1),
  civilian('hatch', 'compact', 0.87, 2.05, 2.55, 1.52, 1150, 1),
  civilian('estate', 'muscle', 0.92, 2.42, 2.85, 1.6, 1450, 0.97),
  civilian('suv', 'heavy', 0.96, 2.35, 2.8, 1.68, 1900, 1),
  civilian('pickup', 'heavy', 0.98, 2.7, 3.3, 1.72, 2100, 0.95),
  civilian('taxi', 'muscle', 0.92, 2.35, 2.8, 1.6, 1450, 1.1, { paints: [PALETTE.coin], hops: 0.5 }),
  civilian('truck', 'heavy', 1.12, 3.5, 4.2, 1.9, 4000, 0.85, { big: true, stretch: true }),
  civilian('bus', 'heavy', 1.27, 6.0, 6.6, 2.24, 6500, 0.8, { paints: BUS_PAINTS, big: true, keepsLane: true, stretch: true }),
  // the hidden car (M5.5 slice 16): never drawn by the spawner (its share is 0), stashed by city/stash.ts
  civilian('icecream', 'heavy', 1.12, 2.9, 3.4, 1.9, 2800, 0.85, { paints: [CITY_COLORS.mint], big: true, stretch: true }),
  // the wanted board's cars (M6 slices 1, 4–5): never spawned (share 0), raced or hunted in a duel, won into the garage
  civilian('wagon', 'muscle', 0.92, 2.42, 2.85, 1.6, 1450, 1, { paints: [CITY_COLORS.lavender] }),
  civilian('pizza', 'compact', 0.87, 2.05, 2.55, 1.52, 1150, 1, { paints: [PALETTE.carRed] }),
  civilian('wrecker', 'heavy', 0.98, 2.7, 3.3, 1.72, 2100, 1, { paints: [PALETTE.carOrange] }),
  onShell('twin', 'sports', CITY_COLORS.mint),
  onShell('fakecop', 'police', PALETTE.policeWhite),
  // Big Bernie's bus races: it overtakes where the city's buses keep their lane
  civilian('partybus', 'heavy', 1.27, 6.0, 6.6, 2.24, 6500, 1, { paints: [PALETTE.carMagenta], big: true, stretch: true }),
  civilian('lowrider', 'sports', 0.95, 2.55, 3.1, 1.62, 1500, 1, { paints: [PALETTE.carBlue] }),
  civilian('limo', 'muscle', 0.95, 3.4, 4.6, 1.62, 2400, 1, { paints: [PALETTE.carGold], stretch: true }),
  civilian('bubble', 'compact', 0.72, 1.45, 1.75, 1.2, 550, 1, { paints: [PALETTE.carLime] }),
  onShell('phantom', 'sports', PALETTE.carBlack),
  onShell('chiefcar', 'police', PALETTE.policeWhite),
  // three more hidden cars (M6 slice 9), stashed like the ice-cream truck: a roadster, a street sweeper, a hot-dog van
  civilian('roadster', 'muscle', 0.84, 2.2, 2.9, 1.5, 1100, 1, { paints: [PALETTE.carRed] }),
  civilian('sweeper', 'heavy', 1.1, 2.9, 3.2, 1.86, 3200, 0.8, { paints: [PALETTE.carWhite], big: true, stretch: true }),
  civilian('hotdog', 'heavy', 1.08, 2.8, 3.3, 1.86, 2600, 0.85, { paints: [PALETTE.coin], big: true, stretch: true }),
];

export const BODY_INDEX = Object.fromEntries(BODY_IDS.map((id, i) => [id, i])) as Record<BodyId, number>;

export function bodySpec(body: BodyId): BodySpec {
  return BODIES[BODY_INDEX[body]] as BodySpec;
}

/** One of the player's five shells, not a civilian body. */
export function isShell(body: BodyId): body is CarId {
  return BODY_INDEX[body] < CAR_IDS.length;
}

/**
 * The police's own bodies: the disguise's drive-out (M8.8 slice 1). A unit taken on the street, whatever its class, is
 * police too (`SwapHandover.police`); the Fake Cruiser is not: the units know Frank's car.
 */
export function policeLiveried(body: BodyId): boolean {
  return body === 'police' || body === 'chiefcar';
}

/** A wanted board's car (M6): won from a rival, never kept at a door or spawned. */
export function isRivalBody(body: BodyId): body is RivalBody {
  return (RIVAL_BODIES as readonly BodyId[]).includes(body);
}

/** Forces and inertias that scale with the mass when a class is stretched to a bigger body. */
const STRETCHED = [
  'torqueMax', 'engineBrakeTorque', 'engineInertia', 'lsdPreload', 'lsdStiffness', 'brakeTorque', 'handbrakeTorque',
  'wheelInertia', 'suspensionStiffness', 'suspensionDampingCompression', 'suspensionDampingRebound', 'bumpStopStiffness',
  'suspensionDampingProgressive', 'antiRollStiffness', 'drag', 'downforce', 'driftYawTorqueMax', 'driftThrottlePush', 'boostThrust',
] as const satisfies ReadonlyArray<keyof VehicleTuning>;

/**
 * What the player drives after a swap into this body (M5.5_PLAN slice 19): the class's preset with the
 * body's footprint and axles; a truck or a bus is the heavy stretched to its body, every force scaled with
 * the mass so it still pulls and stops like the van, and turns like the long thing it is.
 */
export function bodyTuning(body: BodyId): VehicleTuning {
  const spec = bodySpec(body);
  const t = cloneTuning(CAR_PRESETS[spec.car]);
  if (isShell(body)) return t;
  t.chassisHalfExtents = { x: spec.halfWidth, y: t.chassisHalfExtents.y, z: spec.halfLength };
  t.wheelBase = spec.wheelBase;
  t.trackWidth = spec.trackWidth;
  if (spec.stretch) {
    const k = spec.mass / t.mass;
    t.mass = spec.mass;
    for (const key of STRETCHED) t[key] *= k;
  }
  return t;
}

/** The kind of road a lane is, for the spawn's factors: the grid's streets, the Crown diagonals, the highway, the Works chicane, the parkway, the quay. */
export type RoadKind = 'street' | 'avenue' | 'highway' | 'service' | 'parkway' | 'quay';

/** Spawn shares and the place's factors on them (TRAFFIC.bodies). */
export interface BodyWeights {
  /** Shares of the civilian bodies. */
  base: Readonly<Record<CivilianBody, number>>;
  /** Factors by district id (city/City.ts DISTRICTS) and by road kind; a missing factor is 1. */
  places: Readonly<Record<string, Partial<Record<CivilianBody, number>>>>;
}

/** The civilian body for a spawn: the base shares times the district's and the road's factors. `u` in [0, 1). */
export function pickBody(u: number, district: string, road: RoadKind, w: BodyWeights): CivilianBody {
  const d = w.places[district], r = w.places[road];
  let total = 0;
  for (const id of CIVILIAN_BODIES) total += weightOf(id, w, d, r);
  let x = u * total;
  for (const id of CIVILIAN_BODIES) {
    x -= weightOf(id, w, d, r);
    if (x < 0) return id;
  }
  return 'sedan';
}

function weightOf(id: CivilianBody, w: BodyWeights, d: Partial<Record<CivilianBody, number>> | undefined, r: Partial<Record<CivilianBody, number>> | undefined): number {
  return w.base[id] * (d?.[id] ?? 1) * (r?.[id] ?? 1);
}
