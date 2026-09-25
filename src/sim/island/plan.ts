/**
 * The island's plan (M8.10, docs/DESIGN.md §21, docs/M8.10_PLAN.md slice 0): drawn by hand, the sketches' own numbers
 * (docs/island/plan.jpg, placed.jpg), metres, x east and z south, the island's middle at the origin. The coast, the
 * ground's heights, the districts, the main roads, the places and every placed thing; what fills the plan (the
 * districts' own streets, the lots, the buildings, the things on the pavements) comes from the seed, by each district's
 * rule, in later slices. Pure data and a few reads of it; no Three.js, no DOM.
 */
import type { HiddenCar } from '../city/stash';
import type { JobKind } from '../jobs/catalog';
import { catmullRom, crossAt, inPolygon, polygonArea, roundedRect, type P2 } from './geom';

// ---------------------------------------------------------------- the land and the water

/**
 * The coast: control points of a closed Catmull-Rom curve, clockwise from the north-west headland. The segments'
 * indices (`COAST_PARTS`) name its kinds: the cliffs under the hill, the quays of the port, the bay's shores, the beach.
 */
export const COAST: readonly P2[] = [
  [-880, -420], [-862, -560], [-792, -680], [-680, -758], [-540, -798], [-380, -792], [-240, -764], [-100, -772], [40, -762],
  [220, -762], [520, -762], [660, -770], [780, -732], [866, -642], [900, -500], [912, -330], [902, -160], [882, 0], [866, 160],
  [892, 330], [902, 500], [884, 640], [846, 760],
  [806, 752], [786, 640], [778, 540], [744, 436],
  [640, 376], [520, 366], [424, 404],
  [366, 484], [356, 600], [392, 684], [470, 724], [540, 752], [505, 800],
  [300, 806], [100, 796], [-100, 806], [-300, 794], [-470, 782], [-620, 786], [-760, 740], [-850, 650], [-890, 520],
  [-902, 360], [-906, 180], [-902, 0], [-892, -200],
];

/** What each stretch of the coast is, by the control points' span indices (from, to inclusive, wrapping). */
export const COAST_PARTS: ReadonlyArray<{ kind: 'cliff' | 'quay' | 'bay' | 'beach' | 'rocks' | 'spit'; from: number; to: number }> = [
  { kind: 'cliff', from: 48, to: 5 },
  { kind: 'rocks', from: 6, to: 7 },
  { kind: 'quay', from: 8, to: 16 },
  { kind: 'rocks', from: 17, to: 21 },
  { kind: 'spit', from: 22, to: 25 },
  { kind: 'bay', from: 26, to: 29 },
  { kind: 'beach', from: 30, to: 32 },
  { kind: 'rocks', from: 33, to: 34 },
  { kind: 'beach', from: 35, to: 40 },
  { kind: 'rocks', from: 41, to: 47 },
];

/** The port's basin, cut into the north coast (open to the sea on its north side). */
export const BASIN = { x0: 232, x1: 508, z0: -790, z1: -578 } as const;

/** The airfield's causeway off the east coast (a rounded rectangle) and the islet beyond the runway's end. */
export const CAUSEWAY = { x0: 948, z0: -560, x1: 1065, z1: 150, r: 24 } as const;
export const ISLET: readonly P2[] = [[1030, 305], [1072, 322], [1082, 360], [1060, 398], [1018, 404], [988, 378], [990, 330]];

/** The bay's water inside the Quay's shores (its clear shallows and the reef are drawn over it). */
export const BAY: readonly P2[] = [[424, 404], [640, 376], [744, 436], [778, 540], [786, 640], [806, 752], [540, 752], [470, 724], [392, 684], [356, 600], [366, 484]];

/** The plan's frame: the sea round the island, the world's bounds for chunks and maps. */
export const BOUNDS = { x0: -1150, z0: -1000, x1: 1150, z1: 1000 } as const;

let coastCache: readonly P2[] | null = null;
let causewayCache: readonly P2[] | null = null;
let isletCache: readonly P2[] | null = null;
/** The coast sampled every 6 m, a closed polygon (built once; the plan never changes). */
export function coastline(): readonly P2[] {
  return (coastCache ??= catmullRom(COAST, true, 6));
}
/** The airfield's causeway as a closed polygon. */
export function causeway(): readonly P2[] {
  return (causewayCache ??= roundedRect(CAUSEWAY.x0, CAUSEWAY.z0, CAUSEWAY.x1, CAUSEWAY.z1, CAUSEWAY.r));
}
/** The islet as a closed polygon. */
export function islet(): readonly P2[] {
  return (isletCache ??= catmullRom(ISLET, true, 6));
}
/** Inside the port's basin (water). */
export function inBasin(x: number, z: number): boolean {
  return x > BASIN.x0 && x < BASIN.x1 && z > BASIN.z0 && z < BASIN.z1;
}
/** On land: the island less its basin, the causeway, the islet. */
export function onLand(x: number, z: number): boolean {
  return (inPolygon(x, z, coastline()) && !inBasin(x, z)) || inPolygon(x, z, causeway()) || inPolygon(x, z, islet());
}
/** The land's area (m²): the island less the basin's part inside its coast, and the causeway with the islet. */
export function landArea(): { island: number; extra: number } {
  let basin = 0;
  for (let x = BASIN.x0 + 1; x < BASIN.x1; x += 2) for (let z = BASIN.z0 + 1; z < BASIN.z1; z += 2) if (inPolygon(x, z, coastline())) basin += 4;
  return { island: polygonArea(coastline()) - basin, extra: polygonArea(causeway()) + polygonArea(islet()) };
}

// ---------------------------------------------------------------- the ground

/** A hill: its top's height over the base and its spread (Gaussian, m). */
export interface Hill { x: number; z: number; h: number; sx: number; sz: number }

/** The ground's base height over the sea, and its hills: Crown's summit and its north-west ridge, the Gardens' two. */
export const GROUND_BASE = 2;
export const HILLS: readonly Hill[] = [
  { x: -470, z: -400, h: 50, sx: 200, sz: 200 },
  { x: -700, z: -660, h: 18, sx: 130, sz: 100 },
  { x: -470, z: 300, h: 16, sx: 150, sz: 140 },
  { x: -230, z: 500, h: 10, sx: 110, sz: 100 },
  { x: 150, z: 150, h: 5, sx: 280, sz: 240 },
];

/** The ground's height before any road is graded into it (m over the sea). */
export function naturalHeight(x: number, z: number): number {
  let h = GROUND_BASE;
  for (const hill of HILLS) {
    const dx = x - hill.x, dz = z - hill.z;
    h += hill.h * Math.exp(-((dx * dx) / (2 * hill.sx * hill.sx) + (dz * dz) / (2 * hill.sz * hill.sz)));
  }
  return h;
}

// ---------------------------------------------------------------- the main roads

export type RoadClass = 'highway' | 'avenue' | 'street' | 'serpentine' | 'dirt' | 'taxiway' | 'ramp';
/** How a stretch of road meets the ground: on it, under it, or over it. */
export type SpanKind = 'ground' | 'tunnel' | 'viaduct' | 'bridge';

/**
 * A road of the plan: its class, its control points (a Catmull-Rom curve if `smooth`, else straight segments), and how
 * it meets the ground. A roundabout is a `ring`: its centre and radius.
 */
export interface PlanRoad {
  id: string;
  cls: RoadClass;
  points: readonly P2[];
  smooth: boolean;
  span: SpanKind;
}
export interface PlanRing { id: string; cls: RoadClass; x: number; z: number; r: number }

/** The highway's loop, in order, clockwise from the bay bridge's west end: each piece ends where the next begins. */
export const HIGHWAY: readonly PlanRoad[] = [
  { id: 'highway-south-west', cls: 'highway', span: 'ground', smooth: true, points: [[515, 752], [400, 714], [250, 704], [0, 700], [-250, 694], [-450, 676], [-620, 628], [-740, 540], [-790, 380], [-800, 180], [-796, 0], [-784, -150], [-766, -250]] },
  { id: 'highway-tunnel', cls: 'highway', span: 'tunnel', smooth: true, points: [[-766, -250], [-690, -390], [-560, -560], [-400, -662]] },
  { id: 'highway-north', cls: 'highway', span: 'ground', smooth: true, points: [[-400, -662], [-200, -650], [0, -641], [150, -640]] },
  { id: 'highway-viaduct', cls: 'highway', span: 'viaduct', smooth: false, points: [[150, -640], [600, -640]] },
  { id: 'highway-east', cls: 'highway', span: 'ground', smooth: true, points: [[600, -640], [720, -612], [794, -500], [806, -300], [796, -80], [786, 150], [800, 380], [840, 520], [852, 610]] },
  { id: 'highway-bay-bridge', cls: 'highway', span: 'bridge', smooth: false, points: [[852, 610], [515, 752]] },
];

/** The roundabouts: the centre's, the summit's round the tower, the Garden Parkway round the botanic garden. */
export const CIRCUS = { x: 0, z: -50 } as const;
export const SUMMIT = { x: -470, z: -400 } as const;
export const GARDEN = { x: -470, z: 300 } as const;
export const RINGS: readonly PlanRing[] = [
  { id: 'circus', cls: 'avenue', x: CIRCUS.x, z: CIRCUS.z, r: 40 },
  { id: 'summit', cls: 'avenue', x: SUMMIT.x, z: SUMMIT.z, r: 80 },
  { id: 'parkway', cls: 'avenue', x: GARDEN.x, z: GARDEN.z, r: 170 },
  { id: 'lighthouse-loop', cls: 'street', x: 834, z: 746, r: 16 },
];

/** The avenues from the centre, and the roads the places need. */
export const HARBOUR_ROAD: readonly P2[] = [[8, -89], [30, -200], [90, -380], [160, -500], [215, -560]];
export const PALM_AVENUE: readonly P2[] = [[0, -10], [18, 150], [10, 350], [-20, 550], [-50, 690], [-60, 752]];
export const WEST_AVENUE: readonly P2[] = [[-40, -50], [-200, -40], [-400, -30], [-600, -20], [-760, -6]];
export const EAST_AVENUE: readonly P2[] = [[40, -50], [200, -60], [400, -66], [600, -72], [760, -76]];
export const QUAY_SWEEP: readonly P2[] = [[720, 392], [640, 322], [520, 312], [410, 345], [335, 430], [310, 560], [318, 640]];
export const ROADS: readonly PlanRoad[] = [
  { id: 'crown-avenue-up', cls: 'avenue', span: 'ground', smooth: false, points: [[-32, -74], [-406, -352]] },
  { id: 'crown-avenue-down', cls: 'avenue', span: 'ground', smooth: false, points: [[33, -27], [520, 312]] },
  { id: 'harbour-road', cls: 'avenue', span: 'ground', smooth: true, points: HARBOUR_ROAD },
  { id: 'east-avenue', cls: 'avenue', span: 'ground', smooth: true, points: EAST_AVENUE },
  { id: 'west-avenue', cls: 'avenue', span: 'ground', smooth: true, points: WEST_AVENUE },
  { id: 'palm-avenue', cls: 'avenue', span: 'ground', smooth: true, points: PALM_AVENUE },
  { id: 'quay-sweep', cls: 'avenue', span: 'ground', smooth: true, points: QUAY_SWEEP },
  { id: 'beach-road', cls: 'avenue', span: 'ground', smooth: true, points: [[-560, 752], [-470, 750], [-250, 752], [-60, 752], [150, 752], [260, 750]] },
  { id: 'serpentine', cls: 'serpentine', span: 'ground', smooth: true, points: [[-650, -400], [-705, -425], [-730, -395], [-690, -360], [-700, -330], [-745, -318], [-735, -280], [-690, -250], [-705, -215], [-760, -200], [-784, -150]] },
  { id: 'ramp-west', cls: 'ramp', span: 'ground', smooth: false, points: [[-760, -6], [-796, 0]] },
  { id: 'ramp-east', cls: 'ramp', span: 'ground', smooth: false, points: [[760, -76], [796, -80]] },
  { id: 'ramp-north', cls: 'ramp', span: 'ground', smooth: true, points: [[60, -641], [120, -600], [160, -545]] },
  { id: 'ramp-south', cls: 'ramp', span: 'ground', smooth: false, points: [[-10, 652], [-60, 700]] },
  { id: 'lighthouse-road', cls: 'street', span: 'ground', smooth: true, points: [[720, 392], [772, 450], [800, 540], [806, 640], [818, 720], [826, 734]] },
  { id: 'taxiway-north', cls: 'taxiway', span: 'ground', smooth: false, points: [[760, -200], [1005, -200]] },
  { id: 'taxiway-south', cls: 'taxiway', span: 'ground', smooth: false, points: [[720, 60], [1005, 60]] },
  { id: 'quarry-track-north', cls: 'dirt', span: 'ground', smooth: true, points: [[-650, -580], [-685, -565], [-710, -540]] },
  { id: 'quarry-track-south', cls: 'dirt', span: 'ground', smooth: true, points: [[-650, -400], [-655, -430], [-670, -455]] },
];

// ---------------------------------------------------------------- the districts

export type DistrictId = 'crown' | 'foundry' | 'gardens' | 'marina';

/**
 * The district at a point: north of the centre's east-west line Crown Heights west of the harbour road and Sunset
 * Works east of it; south of it Palm Gardens west of Palm Avenue and Coral Quay east of it.
 */
export function districtOf(x: number, z: number): DistrictId {
  if (z < CIRCUS.z) return x < crossAt(HARBOUR_ROAD, Math.max(-560, Math.min(-89, z))) ? 'crown' : 'foundry';
  return x < crossAt(PALM_AVENUE, Math.max(-10, Math.min(752, z))) ? 'gardens' : 'marina';
}

// ---------------------------------------------------------------- the places

/** The places' footprints: the parks, the set pieces, the buildings of their own. */
export const PLACES = {
  summitPlaza: { x: SUMMIT.x, z: SUMMIT.z, r: 72 },
  botanicGarden: { x: GARDEN.x, z: GARDEN.z, r: 158 },
  circusIsland: { x: CIRCUS.x, z: CIRCUS.z, r: 28 },
  stadium: { x: 610, z: 178, rx: 104, rz: 72 },
  quarry: [[-790, -560], [-715, -606], [-630, -572], [-602, -492], [-642, -432], [-736, -440], [-786, -492]] as readonly P2[],
  golf: [[-470, 720], [-560, 768], [-620, 776], [-760, 730], [-842, 646], [-880, 520], [-850, 420], [-790, 470], [-740, 560], [-640, 640], [-560, 690]] as readonly P2[],
  carPark: { x0: -285, z0: -215, x1: -205, z1: -135 },
  headquarters: { x0: -190, z0: -120, x1: -120, z1: -58 },
  donutShop: { x0: 58, z0: -122, x1: 86, z1: -100 },
  waterworks: { x: 550, z: -135 },
  hotel: { x: 640, z: 346, hx: 36, hz: 16 },
  lighthouse: { x: 834, z: 746 },
  towerTop: { x: SUMMIT.x, z: SUMMIT.z },
  glasshouse: { x: GARDEN.x, z: GARDEN.z },
  cranes: [[300, -570], [370, -570], [440, -570]] as readonly P2[],
  containerYards: [{ x0: 60, z0: -740, x1: 215, z1: -600 }, { x0: 528, z0: -730, x1: 760, z1: -590 }],
  hangars: [{ x0: 955, z0: -545, x1: 993, z1: -509 }, { x0: 955, z0: -500, x1: 993, z1: -464 }, { x0: 955, z0: -455, x1: 993, z1: -419 }],
  controlTower: { x: 975, z: -385 },
  runway: { x0: 1005, z0: -540, x1: 1045, z1: 130 },
  megaRamp: { x: 1025, z: 132, yaw: 0 },
  marinaPiers: [470, 520, 570, 620] as readonly number[],
  pleasurePier: { x0: 356, z0: 556, x1: 474, z1: 565 },
  ferrisWheel: { x: 484, z: 560 },
  duck: { x: 650, z: 565 },
  canal: [[-60, -240], [40, -262], [250, -298], [460, -304], [650, -286], [930, -270]] as readonly P2[],
  canalWidth: 32,
  railway: [[760, -515], [185, -515]] as readonly P2[],
  railYard: { x0: 200, z0: -541, x1: 440, z1: -489 },
  crossings: [280, 460, 640, 760] as readonly number[],
  beaches: [
    { points: [[505, 796], [300, 792], [100, 784], [-100, 792], [-300, 782], [-470, 772]] as readonly P2[], width: 70 },
    { points: [[370, 486], [360, 600], [394, 680]] as readonly P2[], width: 46 },
  ],
} as const;

// ---------------------------------------------------------------- what stands where (DESIGN §21.4, placed.jpg)

export type RingKind = Exclude<JobKind, 'fare' | 'duel'>;
/** A job's ring, and where its job leads (a delivery's drop, an order's fence, a trial's finish), if anywhere. */
export interface PlanJob { kind: RingKind; at: P2; to?: P2; level?: number }
export const JOBS: readonly PlanJob[] = [
  { kind: 'delivery', at: [-470, -505], to: [150, -610] },
  { kind: 'delivery', at: [460, -410], to: [-250, 745] },
  { kind: 'delivery', at: [260, 60], to: [-560, -220] },
  { kind: 'delivery', at: [-600, 120], to: [985, -300] },
  { kind: 'delivery', at: [720, 110], to: [-560, 760] },
  { kind: 'delivery', at: [525, -560], to: [838, 752] },
  { kind: 'order', at: [-290, -490], to: [700, -135] },
  { kind: 'order', at: [640, -380], to: [120, -700] },
  { kind: 'order', at: [-150, 300], to: [700, -135] },
  { kind: 'order', at: [380, 440], to: [120, -700] },
  { kind: 'order', at: [140, -40], to: [700, -135] },
  { kind: 'order', at: [-700, 150], to: [120, -700] },
  { kind: 'escape', at: [-740, -10], level: 2 },
  { kind: 'escape', at: [-380, -400], level: 3 },
  { kind: 'escape', at: [650, -590], level: 3 },
  { kind: 'escape', at: [200, 752], level: 4 },
  { kind: 'trial', at: [-560, -400], to: [-784, -150] },
  { kind: 'trial', at: [160, -545], to: [0, 700] },
  { kind: 'trial', at: [-470, 130], to: [-470, 470] },
  { kind: 'trial', at: [-60, -240], to: [900, -272] },
  { kind: 'race', at: [500, 150] },
  { kind: 'race', at: [-110, -310] },
  { kind: 'race', at: [-60, 752] },
  { kind: 'race', at: [215, -560] },
  { kind: 'rage', at: [620, -700] },
  { kind: 'rage', at: [720, 30] },
  { kind: 'mayhem', at: [-380, -220] },
  { kind: 'mayhem', at: [150, 752] },
];

/** The rivals' rings on their turf: `rival` is `RIVALS`' index (10, the Chief, at the headquarters). */
export const RIVAL_RINGS: ReadonlyArray<{ rival: number; at: P2 }> = [
  { rival: 0, at: [-240, 470] }, { rival: 1, at: [380, 300] }, { rival: 2, at: [640, -200] }, { rival: 3, at: [410, 345] },
  { rival: 4, at: [280, -470] }, { rival: 5, at: [-290, -220] }, { rival: 6, at: [100, 752] }, { rival: 7, at: [-560, -310] },
  { rival: 8, at: [-600, 409] }, { rival: 9, at: [-705, -215] }, { rival: 10, at: [-110, -88] },
];

/** The three garages' doors. */
export const GARAGES: ReadonlyArray<{ name: 'hideout' | 'scrapyard' | 'hotel'; at: P2 }> = [
  { name: 'hideout', at: [-470, -265] }, { name: 'scrapyard', at: [700, -135] }, { name: 'hotel', at: [560, 343] },
];

export type JumpKind = 'crest' | 'ramp' | 'gap' | 'drop' | 'mega';
/** The twenty jumps: mostly the ground's own (§21.4); the big ones land through a billboard (`billboard`). */
export const JUMPS: ReadonlyArray<{ at: P2; kind: JumpKind; billboard: boolean }> = [
  { at: [-107, -131], kind: 'crest', billboard: true }, { at: [-228, -220], kind: 'crest', billboard: false }, { at: [-350, -310], kind: 'crest', billboard: false },
  { at: [-290, -400], kind: 'crest', billboard: false }, { at: [-560, -470], kind: 'crest', billboard: false }, { at: [-715, -330], kind: 'gap', billboard: false },
  { at: [-700, -445], kind: 'drop', billboard: false }, { at: [370, -300], kind: 'gap', billboard: true }, { at: [150, -275], kind: 'drop', billboard: false },
  { at: [600, -640], kind: 'ramp', billboard: true }, { at: [320, -500], kind: 'ramp', billboard: false }, { at: [545, 440], kind: 'gap', billboard: true },
  { at: [50, 770], kind: 'ramp', billboard: false }, { at: [-760, 700], kind: 'ramp', billboard: false }, { at: [610, 178], kind: 'ramp', billboard: false },
  { at: [-245, -175], kind: 'gap', billboard: true }, { at: [1025, 132], kind: 'mega', billboard: true }, { at: [-470, 250], kind: 'crest', billboard: false },
  { at: [0, -50], kind: 'ramp', billboard: true }, { at: [640, -515], kind: 'ramp', billboard: true },
];

/** The ten speed cameras (on the roads they watch). */
export const CAMERAS: readonly P2[] = [[-380, -655], [600, -640], [806, -200], [700, 674], [-250, 694], [-798, 200], [-120, -140], [1025, -200], [-100, 752], [60, -300]];

export type CoverKind = 'tunnel' | 'viaduct' | 'bridge' | 'stadium' | 'carpark' | 'arcade' | 'pergola' | 'warehouse' | 'cranes';
/** The thirteen places the helicopter cannot see into. */
export const COVERS: ReadonlyArray<{ kind: CoverKind; at: P2 }> = [
  { kind: 'tunnel', at: [-560, -560] }, { kind: 'viaduct', at: [375, -640] },
  { kind: 'bridge', at: [40, -262] }, { kind: 'bridge', at: [280, -300] }, { kind: 'bridge', at: [460, -304] }, { kind: 'bridge', at: [640, -287] }, { kind: 'bridge', at: [760, -278] },
  { kind: 'stadium', at: [610, 110] }, { kind: 'carpark', at: [-245, -175] }, { kind: 'arcade', at: [-335, -490] },
  { kind: 'pergola', at: [-150, 292] }, { kind: 'warehouse', at: [430, 358] }, { kind: 'cranes', at: [370, -570] },
];

export type BreakerKind = 'scaffold' | 'containers' | 'rocks' | 'flatcar' | 'pallets' | 'huts';
/** The eight things that come down on the chasers. */
export const BREAKERS: ReadonlyArray<{ kind: BreakerKind; at: P2 }> = [
  { kind: 'scaffold', at: [-200, -310] }, { kind: 'scaffold', at: [-560, -130] }, { kind: 'containers', at: [180, -640] }, { kind: 'containers', at: [560, -650] },
  { kind: 'rocks', at: [-650, -470] }, { kind: 'flatcar', at: [380, -515] }, { kind: 'pallets', at: [-600, 40] }, { kind: 'huts', at: [300, 700] },
];

/** Where the police's roadblocks go: where they cannot be driven round. */
export const ROADBLOCK_SITES: readonly P2[] = [[-766, -250], [-400, -662], [852, 610], [505, 750], [150, -640], [0, -50]];

/** The drive-throughs (DESIGN §21.3): fuel, repair, paint. */
export const SERVICES: ReadonlyArray<{ kind: 'fuel' | 'repair' | 'paint'; at: P2 }> = [
  { kind: 'fuel', at: [-690, 16] }, { kind: 'fuel', at: [620, -42] }, { kind: 'fuel', at: [-150, 728] },
  { kind: 'repair', at: [280, -425] }, { kind: 'repair', at: [-640, 70] },
  { kind: 'paint', at: [-380, -165] }, { kind: 'paint', at: [140, 420] },
];

/** The hidden cars and the fleet's finds, each where it waits. */
export const STASH: Readonly<Record<HiddenCar, P2>> = {
  icecream: [338, 575], roadster: [975, -470], sweeper: [725, 180], hotdog: [-470, -455],
  roller: [120, -700], monster: [-820, 560], trolley: [-245, -150], hover: [440, 388],
};

/** The slipways (their top on the shore, their way out to sea). */
export const SLIPWAYS: ReadonlyArray<{ at: P2; out: P2 }> = [{ at: [440, 388], out: [0, 1] }, { at: [-400, 770], out: [0, 1] }];

/** The sea trial's buoys: the route's control points, from the marina out of the bay, round the lighthouse, west. */
export const BUOYS: readonly P2[] = [[560, 480], [620, 640], [700, 770], [820, 830], [930, 800], [960, 700], [900, 860], [700, 880], [400, 870], [100, 860], [-200, 850]];

/** The first minute (§21.4): the route from the summit down Crown Avenue to the hotel's garage, and its six steps. */
export const FIRST_MINUTE: readonly P2[] = [[-406, -352], [-300, -273], [-160, -170], [-32, -74], [0, -50], [33, -27], [240, 125], [520, 312], [560, 343]];
export const FIRST_MINUTE_STEPS: ReadonlyArray<{ step: 'start' | 'swap' | 'billboard' | 'takedown' | 'delivery' | 'garage'; at: P2 }> = [
  { step: 'start', at: [-406, -352] }, { step: 'swap', at: [-300, -273] }, { step: 'billboard', at: [-160, -170] },
  { step: 'takedown', at: [0, -50] }, { step: 'delivery', at: [240, 125] }, { step: 'garage', at: [560, 343] },
];
