/**
 * The city's cars (docs/DESIGN.md §13.11, M5.5 slice 19). A body is what a
 * traffic record looks like and how big it is; its class is how it drives:
 * the planner's class, the swap's physics, the police's roles. The first
 * five bodies are the player's classes in their own shells (an abandoned
 * player car, a police unit, an order's car); the other eight are the
 * civilian set the spawner draws from. Appended, never renumbered: the index
 * is packed into descriptors next to the paint, so a descriptor written
 * before the bodies still reads. The first five classes' indices are their
 * shells'; a class added since (the 4×4, M8.8 slice 10) has its shell
 * appended after the last body, so its class index is not its body index:
 * read a body's class through `BODIES[index].car`, never the index.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import { CAR_IDS, CAR_PRESETS, type CarId } from '../vehicle/presets';
import { cloneTuning, type VehicleTuning } from '../vehicle/tuning';

/** The wanted board's cars (M6, DESIGN.md §14.3): the ten rivals' and the Chief's, never spawned as traffic. */
export type RivalBody = 'wagon' | 'pizza' | 'wrecker' | 'twin' | 'fakecop' | 'partybus' | 'lowrider' | 'limo' | 'bubble' | 'phantom' | 'chiefcar';
/** The crazy cars (M8.8 phase F): hidden, one in each district, each the only one that does its thing. */
export type CrazyBody = 'roller' | 'monster' | 'trolley';
export type CivilianBody = 'sedan' | 'hatch' | 'estate' | 'suv' | 'pickup' | 'taxi' | 'truck' | 'bus' | 'icecream' | RivalBody | 'roadster' | 'sweeper' | 'hotdog' | CrazyBody;
export type BodyId = CarId | CivilianBody;
export const RIVAL_BODIES: readonly RivalBody[] = ['wagon', 'pizza', 'wrecker', 'twin', 'fakecop', 'partybus', 'lowrider', 'limo', 'bubble', 'phantom', 'chiefcar'];
/** The civilian bodies from before M8.8, in their order. */
const FIRST_CIVILIANS: readonly CivilianBody[] = ['sedan', 'hatch', 'estate', 'suv', 'pickup', 'taxi', 'truck', 'bus', 'icecream', ...RIVAL_BODIES, 'roadster', 'sweeper', 'hotdog'];
/** The classes whose shells come first (their class index is their body index). */
const FIRST_SHELLS: readonly CarId[] = ['muscle', 'compact', 'heavy', 'sports', 'police'];
/** Every body added since, a class's shell or a civilian's, in the order it came: appended after the last. */
const ADDED: readonly BodyId[] = ['offroad', 'roller', 'monster', 'trolley', 'moto'];
export const CIVILIAN_BODIES: readonly CivilianBody[] = [...FIRST_CIVILIANS, ...ADDED.filter((id): id is CivilianBody => !(CAR_IDS as readonly BodyId[]).includes(id))];
export const BODY_IDS: readonly BodyId[] = [...FIRST_SHELLS, ...FIRST_CIVILIANS, ...ADDED];

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
  /** Long and tall (the trucks, the buses, the limo): the traffic's box stands higher. The tuning scales every body to its mass (M8.8 slice 4). */
  stretch: boolean;
  /** A trophy's own numbers on its class, applied after the mass (M8.8 slice 5): each is the best in the game at one thing. */
  tune?: (t: VehicleTuning) => void;
  /** The player's damage is divided by this (M8.8 slice 5: the Wrecker's twice, as in its hunt); 1 when absent. */
  armour?: number;
  /** The Fake Cruiser's disco bar (M8.8 slice 6): lit, so the civilians ahead pull over for the player in it. */
  lit?: boolean;
  /** The gold limo (M8.8 slice 6): busted in it, the Mayor pays and three quarters of the bag stay, as with the lawyer. */
  bribes?: boolean;
  /** The Chief's Cruiser (M8.8 slice 6): nobody reports it missing, so its disguise runs no dispatcher's clock. */
  unreported?: boolean;
  /** A race rival's acceleration (m/s², its lane follower's), from its car's 0–60 (M8.8 slice 6); absent, the traffic's. */
  aiAccel?: number;
  /** The steamroller's front drum (M8.8 slice 11): half its width and its length along the car (m); a record it touches is flattened. */
  drum?: { halfWidth: number; length: number };
  /** The monster truck (M8.8 slice 12): a car one of its wheels stands on this long (s) is flattened. */
  crush?: number;
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
function onShell(id: RivalBody, car: CarId, paint: number, more: Partial<BodySpec> = {}): BodySpec {
  const p = CAR_PRESETS[car];
  return civilian(id, car, p.chassisHalfExtents.x, p.chassisHalfExtents.z, p.wheelBase, p.trackWidth, p.mass, 1, { paints: [paint], ...more });
}

/**
 * The trophies' own numbers (M8.8 slice 5, R2: the car you beat is the car you get), each the best in the game at one
 * thing, measured by `tests/sim/bodies.long.test.ts` against every other body.
 */
const TROPHY = {
  /** #10 Granny's hot-rodded estate, a blower through the bonnet: the widest held drift. */
  wagon: (t: VehicleTuning): void => { t.torqueMax *= 1.2; t.driftThrottlePush *= 1.2; t.driftMaxAngleDeg = 45; },
  /** #9 Pepperoni Pete's hatch, the bad driver's weave: the quickest to change direction. */
  pizza: (t: VehicleTuning): void => { t.steerRate *= 1.5; t.muFront *= 1.08; t.maxSteerDegHigh = 10; t.inertiaScale = { x: 1, y: 0.65, z: 1 }; },
  /** #7 the Twins' coupé under its wing: the most grip in a corner. */
  twin: (t: VehicleTuning): void => { t.muFront *= 1.08; t.muRear *= 1.08; t.downforce *= 1.3; },
  /** #5 Big Bernie's bus at race pace: 6.5 t on the lightest drag, the hardest thing to meet. */
  partybus: (t: VehicleTuning): void => { t.drag *= 0.7; },
  /** #4 Neon Niko's lowrider, low, slow, then suddenly not: the longest boost. */
  lowrider: (t: VehicleTuning): void => { t.boostDrain *= 0.6; },
  /** #2 Professor Pip's microcar, absurdly fast: 550 kg on a motorbike's engine, the quickest to 100, short-geared. */
  bubble: (t: VehicleTuning): void => {
    t.torqueMax *= 2;
    t.drag *= 1.6;
    t.redlineRpm = 9000;
    t.gearRatios = [3.4, 2.45, 1.85, 1.45, 1.15, 0.95];
    t.maxSteerDegHigh = 4.5;
    t.steerRate = 5;
  },
  /** #1 the Ghost's phantom, lights off round the loop: the highest top speed. */
  phantom: (t: VehicleTuning): void => { t.torqueMax *= 1.1; t.drag *= 0.6; t.gearRatios = [3.85, 2.88, 2.15, 1.61, 1.12, 0.85]; },
} as const;

/** The crazy cars' own numbers on their class, after the mass (M8.8 phase F). */
const CRAZY = {
  /** The steamroller: 9 t on the van's drivetrain, geared to a walking giant's 35 km/h (the rev limit in third and up). */
  roller: (t: VehicleTuning): void => {
    t.torqueMax *= 0.45;
    t.gearRatios = [9.5, 7.2, 6.0, 6.0, 6.0, 6.0];
    t.maxSteerDegHigh = 12;
    t.steerRate = 3;
    t.boostTorqueMul = 1.15;
    t.boostThrust *= 0.3;
  },
  /**
   * The monster truck: 4.2 t on 0.95 m wheels and 0.8 m springs, the chassis' underside 1.8 m up so a car passes under
   * it and only the wheels meet it (their rays stand on its roof); the gearing lengthened for the wheels, the mass low.
   */
  monster: (t: VehicleTuning): void => {
    t.wheelRadius = 0.95;
    t.wheelWidth = 0.62;
    t.suspensionRestLength = 0.8;
    t.suspensionAttachY = 0.3;
    t.chassisHalfExtents = { x: t.chassisHalfExtents.x, y: 0.4, z: t.chassisHalfExtents.z };
    t.chassisOffsetY = 0.88;
    t.centerOfMassY = -0.9;
    t.climbSlope = 0.8;
    t.finalDrive *= 0.95 / 0.42;
    t.antiRollStiffness *= 1.5;
    t.airPitchTorque *= 2;
    t.airRollTorque *= 2;
    t.airLevelTorque *= 2;
    t.airAngularDamping *= 2;
  },
  /**
   * The rocket trolley: a shopping trolley, its rider and a rocket, 180 kg. The motor is a push (a walking pace on the
   * throttle alone, no engine to brake with); the rocket is the boost, 8 s of it, the meter filling by itself in 4;
   * castors that steer like a brick.
   */
  trolley: (t: VehicleTuning): void => {
    t.wheelRadius = 0.12;
    t.wheelWidth = 0.06;
    t.suspensionRestLength = 0.12;
    t.suspensionAttachY = 0.05;
    t.chassisHalfExtents = { x: t.chassisHalfExtents.x, y: 0.4, z: t.chassisHalfExtents.z };
    t.chassisOffsetY = 0.5;
    t.centerOfMassY = -0.3;
    t.torqueMax = 1;
    t.engineBrakeTorque = 0;
    t.gearRatios = [12, 12, 12, 12, 12, 12];
    // on the rocket 0–100 in 4.2 s (after the Bubble), 187 km/h flat out
    t.drag = 0.56;
    t.boostThrust = 1560;
    t.boostTorqueMul = 1;
    t.boostDrain = 0.125;
    t.boostRegen = 0.25;
    t.boostInitial = 1;
    // a brick's steering: 12° of lock at a walk, 1° from 54 km/h, turned slowly (the plan's 2° turned it 13° in the
    // 100 km/h pulse, more than the van; 1° turned slowly, 2°, less than every body)
    t.maxSteerDegLow = 12;
    t.maxSteerDegHigh = 1;
    t.steerSpeedRef = 15;
    t.steerRate = 2;
  },
} as const;

/** Indexed like BODY_IDS. Sizes in metres; the profiles in render/bodyProfiles.ts are drawn on these wheels. */
export const BODIES: readonly BodySpec[] = [
  ...FIRST_SHELLS.map(shell),
  civilian('sedan', 'muscle', 0.92, 2.35, 2.8, 1.6, 1400, 1),
  civilian('hatch', 'compact', 0.87, 2.05, 2.55, 1.52, 1150, 1),
  civilian('estate', 'muscle', 0.92, 2.42, 2.85, 1.6, 1450, 0.97),
  // the SUV and the pickup drive as the 4×4 (M8.8 slice 10); a kept one moves with them
  civilian('suv', 'offroad', 0.96, 2.35, 2.8, 1.68, 1900, 1),
  civilian('pickup', 'offroad', 0.98, 2.7, 3.3, 1.72, 2100, 0.95),
  civilian('taxi', 'muscle', 0.92, 2.35, 2.8, 1.6, 1450, 1.1, { paints: [PALETTE.coin], hops: 0.5 }),
  civilian('truck', 'heavy', 1.12, 3.5, 4.2, 1.9, 4000, 0.85, { big: true, stretch: true }),
  civilian('bus', 'heavy', 1.27, 6.0, 6.6, 2.24, 6500, 0.8, { paints: BUS_PAINTS, big: true, keepsLane: true, stretch: true }),
  // the hidden car (M5.5 slice 16): never drawn by the spawner (its share is 0), stashed by city/stash.ts
  civilian('icecream', 'heavy', 1.12, 2.9, 3.4, 1.9, 2800, 0.85, { paints: [CITY_COLORS.mint], big: true, stretch: true }),
  // the wanted board's cars (M6 slices 1, 4–5): never spawned (share 0), raced or hunted in a duel, won into the garage
  // a race rival's acceleration is its car's (16.7 m/s over its 0–60 on the playground, M8.8 slice 6): the duel shows the car
  civilian('wagon', 'muscle', 0.92, 2.42, 2.85, 1.6, 1450, 1, { paints: [CITY_COLORS.lavender], tune: TROPHY.wagon, aiAccel: 7.1 }),
  civilian('pizza', 'compact', 0.87, 2.05, 2.55, 1.52, 1150, 1, { paints: [PALETTE.carRed], tune: TROPHY.pizza, aiAccel: 6.9 }),
  // #8 Tow Truck Tina's wrecker keeps the hunt's twice the armour: the toughest car in the game
  civilian('wrecker', 'heavy', 0.98, 2.7, 3.3, 1.72, 2100, 1, { paints: [PALETTE.carOrange], armour: 2, aiAccel: 4.2 }),
  onShell('twin', 'sports', CITY_COLORS.mint, { tune: TROPHY.twin, aiAccel: 7.9 }),
  // #6 Fake Frank's disco bar clears the road ahead; the units know his car, so it is no disguise (slice 1)
  onShell('fakecop', 'police', PALETTE.policeWhite, { lit: true, aiAccel: 5.3 }),
  // Big Bernie's bus races: it overtakes where the city's buses keep their lane
  civilian('partybus', 'heavy', 1.27, 6.0, 6.6, 2.24, 6500, 1, { paints: [PALETTE.carMagenta], big: true, stretch: true, tune: TROPHY.partybus, aiAccel: 4.2 }),
  civilian('lowrider', 'sports', 0.95, 2.55, 3.1, 1.62, 1500, 1, { paints: [PALETTE.carBlue], tune: TROPHY.lowrider, aiAccel: 7.9 }),
  // #3 the Mayor's Nephew's limo: his uncle pays when you are caught in it
  civilian('limo', 'muscle', 0.95, 3.4, 4.6, 1.62, 2400, 1, { paints: [PALETTE.carGold], stretch: true, bribes: true, aiAccel: 6.0 }),
  civilian('bubble', 'compact', 0.72, 1.45, 1.75, 1.2, 550, 1, { paints: [PALETTE.carLime], tune: TROPHY.bubble, aiAccel: 7.1 }),
  onShell('phantom', 'sports', PALETTE.carBlack, { tune: TROPHY.phantom, aiAccel: 8.7 }),
  // the Chief's own car: nobody reports it missing
  onShell('chiefcar', 'police', PALETTE.policeWhite, { unreported: true }),
  // three more hidden cars (M6 slice 9), stashed like the ice-cream truck: a roadster, a street sweeper, a hot-dog van
  civilian('roadster', 'muscle', 0.84, 2.2, 2.9, 1.5, 1100, 1, { paints: [PALETTE.carRed] }),
  civilian('sweeper', 'heavy', 1.1, 2.9, 3.2, 1.86, 3200, 0.8, { paints: [PALETTE.carWhite], big: true, stretch: true }),
  civilian('hotdog', 'heavy', 1.08, 2.8, 3.3, 1.86, 2600, 0.85, { paints: [PALETTE.coin], big: true, stretch: true }),
  // appended since, in the order they came (ADDED): the 4×4's shell (M8.8 slice 10)
  shell('offroad'),
  // the steamroller (slice 11), hidden in the Works' yard: a van's drivetrain under 9 t, 35 km/h flat out, a front drum
  // 1.5 m across and 1.9 m wide that flattens whatever it touches
  civilian('roller', 'heavy', 1.05, 2.9, 3.3, 1.9, 9000, 0, { paints: [PALETTE.coin], big: true, stretch: true, tune: CRAZY.roller, drum: { halfWidth: 0.95, length: 1.5 } }),
  // the monster truck (slice 12), on the Gardens' park strip by the jumps: the 4×4's drivetrain on wheels taller than a
  // car, so it climbs one and flattens it a fifth of a second after a wheel is on it
  civilian('monster', 'offroad', 1.3, 2.7, 3.4, 2.5, 4200, 0, { paints: [PALETTE.carLime], big: true, stretch: true, tune: CRAZY.monster, crush: 0.2 }),
  // the rocket trolley (slice 13), on the Crown Tower's plaza: the compact's class on castors, the boost its engine
  civilian('trolley', 'compact', 0.4, 0.7, 0.8, 0.6, 180, 0, { paints: [PALETTE.chrome], tune: CRAZY.trolley }),
  // the motorbike's shell (slice 14)
  shell('moto'),
];

export const BODY_INDEX = Object.fromEntries(BODY_IDS.map((id, i) => [id, i])) as Record<BodyId, number>;

export function bodySpec(body: BodyId): BodySpec {
  return BODIES[BODY_INDEX[body]] as BodySpec;
}

/** One of the player's classes in its own shell, not a civilian body (a shell drives as the class it is). */
export function isShell(body: BodyId): body is CarId {
  return (BODIES[BODY_INDEX[body]] as BodySpec).car === body;
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

/** Forces and inertias that scale with a body's mass against its class's. */
const MASS_SCALED = [
  'torqueMax', 'engineBrakeTorque', 'engineInertia', 'lsdPreload', 'lsdStiffness', 'brakeTorque', 'handbrakeTorque',
  'wheelInertia', 'suspensionStiffness', 'suspensionDampingCompression', 'suspensionDampingRebound', 'bumpStopStiffness',
  'suspensionDampingProgressive', 'antiRollStiffness', 'drag', 'downforce', 'driftYawTorqueMax', 'driftThrottlePush', 'boostThrust',
] as const satisfies ReadonlyArray<keyof VehicleTuning>;

/**
 * What the player drives in this body: the class's preset with the body's footprint and axles at the body's own mass,
 * every force scaled with it, so it pulls and stops like its class and turns like the long or short thing it is (the
 * trucks and buses since M5.5_PLAN slice 19, every body since M8.8 slice 4: a Bubble is 550 kg in the player's hands as
 * on the street). A shell, and a rival on a shell, is its preset bitwise.
 */
export function bodyTuning(body: BodyId): VehicleTuning {
  const spec = bodySpec(body);
  const t = cloneTuning(CAR_PRESETS[spec.car]);
  if (isShell(body)) return t;
  t.chassisHalfExtents = { x: spec.halfWidth, y: t.chassisHalfExtents.y, z: spec.halfLength };
  t.wheelBase = spec.wheelBase;
  t.trackWidth = spec.trackWidth;
  const k = spec.mass / t.mass;
  if (k !== 1) {
    t.mass = spec.mass;
    for (const key of MASS_SCALED) t[key] *= k;
  }
  spec.tune?.(t);
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
