/**
 * The island's plan (M8.10, docs/M8.10_PLAN.md §1 and slice 0): drawn by hand, the sketches' own numbers
 * (docs/island/plan.jpg, placed.jpg), metres, the island's middle at the origin. The coast, the ground's heights, the
 * districts, the main roads, the places and every placed thing; what fills the plan (the districts' own streets, the
 * lots, the buildings, the things on the pavements) comes from the seed, by each district's rule, in later slices. Pure
 * data and a few reads of it; no Three.js, no DOM.
 *
 * The axes: the numbers below are written as the sketches draw them (x east, z south: north up, east right), and every
 * export is in the world's axes (+X west, +Z north: the game's full map draws −x to the right and −z down), so the map in
 * the game shows the island as the sketches do. `W` turns a sketch point into a world point (a half turn).
 */
import type { HiddenCar } from '../city/stash';
import type { JobKind } from '../jobs/catalog';
import { catmullRom, crossAt, inPolygon, polygonArea, roundedRect, type P2 } from './geom';

/** A sketch point in the world (+X west, +Z north). */
const W = (p: P2): P2 => [-p[0], -p[1]];
const Ws = (ps: readonly P2[]): P2[] => ps.map(W);
/** A sketch rectangle in the world, its corners kept as minima and maxima. */
const Wrect = (r: { x0: number; z0: number; x1: number; z1: number }): { x0: number; z0: number; x1: number; z1: number } => ({ x0: -r.x1, z0: -r.z1, x1: -r.x0, z1: -r.z0 });

// ---------------------------------------------------------------- the land and the water

/**
 * The coast: control points of a closed Catmull-Rom curve, clockwise on the map from the north-west headland. The
 * segments' indices (`COAST_PARTS`) name its kinds: the cliffs under the hill, the port's quays, the bay, the beaches.
 */
export const COAST: readonly P2[] = Ws([
  [-880, -420], [-862, -560], [-792, -680], [-680, -758], [-540, -798], [-380, -792], [-240, -764], [-100, -772], [40, -762],
  [220, -762], [520, -762], [660, -770], [780, -732], [866, -642], [900, -500], [912, -330], [902, -160], [882, 0], [866, 160],
  [892, 330], [902, 500], [884, 640], [846, 760],
  [806, 752], [786, 640], [778, 540], [744, 436],
  [640, 376], [520, 366], [424, 404],
  [366, 484], [356, 600], [392, 684], [470, 724], [540, 752], [505, 800],
  [300, 806], [100, 796], [-100, 806], [-300, 794], [-470, 782], [-620, 786], [-760, 740], [-850, 650], [-890, 520],
  [-902, 360], [-906, 180], [-902, 0], [-892, -200],
]);

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

/** The port's basin, cut into the north coast; `shore` is the coast's line where the basin opens to the sea (world z). */
export const BASIN = { ...Wrect({ x0: 232, x1: 508, z0: -790, z1: -578 }), shore: 762 } as const;

/** The airfield's causeway off the east coast (a rounded rectangle) and the islet beyond the runway's end. */
export const CAUSEWAY = { ...Wrect({ x0: 948, z0: -560, x1: 1065, z1: 150 }), r: 24 } as const;
export const ISLET: readonly P2[] = Ws([[1030, 305], [1072, 322], [1082, 360], [1060, 398], [1018, 404], [988, 378], [990, 330]]);

/** The bay's water inside the Quay's shores (its clear shallows and the reef are drawn over it). */
export const BAY: readonly P2[] = Ws([[424, 404], [640, 376], [744, 436], [778, 540], [786, 640], [806, 752], [540, 752], [470, 724], [392, 684], [356, 600], [366, 484]]);

/** The plan's frame: the sea round the island, the world's bounds for chunks and maps (symmetric about the origin). */
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
  { x: 470, z: 400, h: 50, sx: 200, sz: 200 },
  { x: 700, z: 660, h: 18, sx: 130, sz: 100 },
  { x: 470, z: -300, h: 16, sx: 150, sz: 140 },
  { x: 230, z: -500, h: 10, sx: 110, sz: 100 },
  { x: -150, z: -150, h: 5, sx: 280, sz: 240 },
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

const road = (id: string, cls: RoadClass, span: SpanKind, smooth: boolean, points: readonly P2[]): PlanRoad => ({ id, cls, span, smooth, points: Ws(points) });

/** The highway's loop, in order, clockwise on the map from the bay bridge's west end: each piece ends where the next begins. */
export const HIGHWAY: readonly PlanRoad[] = [
  road('highway-south-west', 'highway', 'ground', true, [[515, 752], [400, 714], [250, 704], [0, 700], [-250, 694], [-450, 676], [-620, 628], [-740, 540], [-790, 380], [-800, 180], [-796, 0], [-784, -150], [-766, -250]]),
  road('highway-tunnel', 'highway', 'tunnel', true, [[-766, -250], [-690, -390], [-560, -560], [-400, -662]]),
  road('highway-north', 'highway', 'ground', true, [[-400, -662], [-200, -650], [0, -641], [150, -640]]),
  road('highway-viaduct', 'highway', 'viaduct', false, [[150, -640], [600, -640]]),
  road('highway-east', 'highway', 'ground', true, [[600, -640], [720, -612], [794, -500], [806, -300], [796, -80], [786, 150], [800, 380], [840, 520], [852, 610]]),
  road('highway-bay-bridge', 'highway', 'bridge', false, [[852, 610], [515, 752]]),
];

/**
 * The highway's loop as one closed curve through every piece's points, so no kink where two pieces meet, sampled every
 * `spacing` m or so; each sample's piece (an index into `HIGHWAY`).
 */
export function highwayLoop(spacing: number): { pts: P2[]; piece: number[] } {
  const ctrl: P2[] = [], owner: number[] = [];
  HIGHWAY.forEach((p, k) => { for (let i = 0; i + 1 < p.points.length; i++) { ctrl.push(p.points[i] as P2); owner.push(k); } });
  const spanOf: number[] = [];
  const pts = catmullRom(ctrl, true, spacing, spanOf);
  return { pts, piece: spanOf.map((s) => owner[s] as number) };
}

/** The roundabouts: the centre's, the summit's round the tower, the Garden Parkway round the botanic garden. */
export const CIRCUS = { x: 0, z: 50 } as const;
export const SUMMIT = { x: 470, z: 400 } as const;
export const GARDEN = { x: 470, z: -300 } as const;
export const RINGS: readonly PlanRing[] = [
  { id: 'circus', cls: 'avenue', x: CIRCUS.x, z: CIRCUS.z, r: 40 },
  { id: 'summit', cls: 'avenue', x: SUMMIT.x, z: SUMMIT.z, r: 80 },
  { id: 'parkway', cls: 'avenue', x: GARDEN.x, z: GARDEN.z, r: 170 },
  { id: 'lighthouse-loop', cls: 'street', x: -834, z: -746, r: 16 },
];

/** The avenues from the centre (sketch copies kept for the districts' borders), and the roads the places need. */
const HARBOUR_SKETCH: readonly P2[] = [[8, -89], [30, -200], [90, -380], [160, -500], [215, -560]];
const PALM_SKETCH: readonly P2[] = [[0, -10], [18, 150], [10, 350], [-20, 550], [-50, 690], [-60, 752]];
export const HARBOUR_ROAD: readonly P2[] = Ws(HARBOUR_SKETCH);
export const PALM_AVENUE: readonly P2[] = Ws(PALM_SKETCH);
/** The Quay's sweep round the bay's north and west shores, then under the highway to the beach road's east end. */
export const QUAY_SWEEP: readonly P2[] = Ws([[720, 392], [640, 322], [520, 312], [410, 345], [335, 430], [310, 560], [318, 640], [300, 700], [260, 750]]);
export const ROADS: readonly PlanRoad[] = [
  road('crown-avenue-up', 'avenue', 'ground', false, [[-32, -74], [-406, -352]]),
  road('crown-avenue-down', 'avenue', 'ground', false, [[33, -27], [520, 312]]),
  road('harbour-road', 'avenue', 'ground', true, HARBOUR_SKETCH),
  road('east-avenue', 'avenue', 'ground', true, [[40, -50], [200, -60], [400, -66], [600, -72], [760, -76]]),
  road('west-avenue', 'avenue', 'ground', true, [[-40, -50], [-200, -40], [-400, -30], [-600, -20], [-760, -6]]),
  road('palm-avenue', 'avenue', 'ground', true, PALM_SKETCH),
  { id: 'quay-sweep', cls: 'avenue', span: 'ground', smooth: true, points: QUAY_SWEEP },
  road('beach-road', 'avenue', 'ground', true, [[-560, 752], [-470, 750], [-250, 752], [-60, 752], [150, 752], [260, 750]]),
  // from the summit's ring down the west side to the highway
  road('serpentine', 'serpentine', 'ground', true, [[-550, -400], [-650, -400], [-705, -425], [-730, -395], [-690, -360], [-700, -330], [-745, -318], [-735, -280], [-690, -250], [-705, -215], [-760, -200], [-784, -150]]),
  road('ramp-west', 'ramp', 'ground', false, [[-760, -6], [-796, 0]]),
  road('ramp-east', 'ramp', 'ground', false, [[760, -76], [796, -80]]),
  // off the highway into the harbour road's end
  road('ramp-north', 'ramp', 'ground', true, [[60, -641], [130, -605], [215, -560]]),
  // off Palm Avenue, merging into the highway westward
  road('ramp-south', 'ramp', 'ground', true, [[-33, 610], [-90, 672], [-150, 698]]),
  road('lighthouse-road', 'street', 'ground', true, [[720, 392], [772, 450], [800, 540], [806, 640], [818, 720], [826, 734]]),
  // the beach road's west end under the highway up to the Garden Parkway
  road('gardens-passage', 'street', 'ground', true, [[-560, 752], [-555, 690], [-530, 590], [-503, 467]]),
  // the airfield: a road inland of the highway through the east avenue's end, the taxiways under the highway to the
  // runway's middle, the runway between them
  road('airfield-road', 'street', 'ground', true, [[720, 60], [745, 0], [760, -76], [760, -200]]),
  road('taxiway-north', 'taxiway', 'ground', false, [[760, -200], [1025, -200]]),
  road('taxiway-south', 'taxiway', 'ground', false, [[720, 60], [1025, 60]]),
  road('runway-link', 'taxiway', 'ground', false, [[1025, -200], [1025, 60]]),
  // the quarry: in from the summit's ring, across its floor, out to the serpentine
  road('quarry-track-north', 'dirt', 'ground', true, [[-527, -457], [-600, -540], [-650, -580], [-685, -565], [-710, -540]]),
  road('quarry-floor', 'dirt', 'ground', true, [[-710, -540], [-718, -500], [-670, -455]]),
  road('quarry-track-south', 'dirt', 'ground', true, [[-650, -400], [-655, -430], [-670, -455]]),
];

// ---------------------------------------------------------------- the districts

export type DistrictId = 'crown' | 'foundry' | 'gardens' | 'marina';

/**
 * The district at a point: on the map's upper half (north of the centre's line) Crown Heights west of the harbour road
 * and Sunset Works east of it; on the lower half Palm Gardens west of Palm Avenue and Coral Quay east of it.
 */
export function districtOf(x: number, z: number): DistrictId {
  const sx = -x, sz = -z;
  if (sz < -50) return sx < crossAt(HARBOUR_SKETCH, Math.max(-560, Math.min(-89, sz))) ? 'crown' : 'foundry';
  return sx < crossAt(PALM_SKETCH, Math.max(-10, Math.min(752, sz))) ? 'gardens' : 'marina';
}

// ---------------------------------------------------------------- the places

const Wp = (x: number, z: number): { x: number; z: number } => ({ x: -x, z: -z });

/** The places' footprints: the parks, the set pieces, the buildings of their own. */
export const PLACES = {
  summitPlaza: { ...SUMMIT, r: 72 },
  botanicGarden: { ...GARDEN, r: 158 },
  circusIsland: { ...CIRCUS, r: 28 },
  stadium: { ...Wp(610, 178), rx: 104, rz: 72 },
  quarry: Ws([[-790, -560], [-715, -606], [-630, -572], [-602, -492], [-642, -432], [-736, -440], [-786, -492]]),
  golf: Ws([[-470, 720], [-560, 768], [-620, 776], [-760, 730], [-842, 646], [-880, 520], [-850, 420], [-790, 470], [-740, 560], [-640, 640], [-560, 690]]),
  carPark: Wrect({ x0: -285, z0: -215, x1: -205, z1: -135 }),
  headquarters: Wrect({ x0: -190, z0: -120, x1: -120, z1: -58 }),
  donutShop: Wrect({ x0: 58, z0: -122, x1: 86, z1: -100 }),
  waterworks: Wp(550, -135),
  hotel: { ...Wp(640, 346), hx: 36, hz: 16 },
  lighthouse: Wp(834, 746),
  towerTop: SUMMIT,
  glasshouse: GARDEN,
  cranes: Ws([[300, -570], [370, -570], [440, -570]]),
  containerYards: [Wrect({ x0: 60, z0: -740, x1: 215, z1: -600 }), Wrect({ x0: 528, z0: -730, x1: 760, z1: -590 })],
  hangars: [Wrect({ x0: 955, z0: -545, x1: 993, z1: -509 }), Wrect({ x0: 955, z0: -500, x1: 993, z1: -464 }), Wrect({ x0: 955, z0: -455, x1: 993, z1: -419 })],
  controlTower: Wp(975, -385),
  runway: Wrect({ x0: 1005, z0: -540, x1: 1045, z1: 130 }),
  /** The mega-ramp at the runway's southern end, launching south (the world's −Z) toward the islet. */
  megaRamp: { ...Wp(1025, 132), yaw: Math.PI },
  /** The marina's four piers: each a line from the bay's north shore into the water. */
  marinaPiers: [470, 520, 570, 620].map((x) => ({ from: W([x, 372]), to: W([x, 464]) })),
  pleasurePier: Wrect({ x0: 356, z0: 556, x1: 474, z1: 565 }),
  ferrisWheel: Wp(484, 560),
  duck: Wp(650, 565),
  canal: Ws([[-60, -240], [40, -262], [250, -298], [460, -304], [650, -286], [930, -270]]),
  canalWidth: 32,
  railway: Ws([[760, -515], [185, -515]]),
  railYard: Wrect({ x0: 200, z0: -541, x1: 440, z1: -489 }),
  /** The level crossings: where the streets cross the railway. */
  crossings: Ws([[280, -515], [460, -515], [640, -515], [760, -515]]),
  beaches: [
    { points: Ws([[505, 796], [300, 792], [100, 784], [-100, 792], [-300, 782], [-470, 772]]), width: 70 },
    { points: Ws([[370, 486], [360, 600], [394, 680]]), width: 46 },
  ],
} as const;

// ---------------------------------------------------------------- what stands where (the plan's §1.4, placed.jpg)

export type RingKind = Exclude<JobKind, 'fare' | 'duel'>;
/** A job's ring, and where its job leads (a delivery's drop, an order's fence, a trial's finish), if anywhere. */
export interface PlanJob { kind: RingKind; at: P2; to?: P2; level?: number }
const job = (kind: RingKind, at: P2, to?: P2, level?: number): PlanJob => ({ kind, at: W(at), ...(to ? { to: W(to) } : {}), ...(level !== undefined ? { level } : {}) });
export const JOBS: readonly PlanJob[] = [
  job('delivery', [-470, -505], [150, -610]),
  job('delivery', [460, -410], [-250, 745]),
  job('delivery', [260, 60], [-560, -220]),
  job('delivery', [-600, 120], [985, -300]),
  job('delivery', [720, 110], [-560, 760]),
  job('delivery', [525, -560], [838, 752]),
  job('order', [-290, -490], [700, -135]),
  job('order', [640, -380], [120, -700]),
  job('order', [-150, 300], [700, -135]),
  job('order', [380, 440], [120, -700]),
  job('order', [140, -40], [700, -135]),
  job('order', [-700, 150], [120, -700]),
  job('escape', [-740, -10], undefined, 2),
  job('escape', [-380, -400], undefined, 3),
  job('escape', [650, -590], undefined, 3),
  job('escape', [200, 752], undefined, 4),
  job('trial', [-560, -400], [-784, -150]),
  job('trial', [160, -545], [0, 700]),
  job('trial', [-470, 130], [-470, 470]),
  job('trial', [-60, -240], [900, -272]),
  job('race', [500, 150]),
  job('race', [-110, -310]),
  job('race', [-60, 752]),
  job('race', [215, -560]),
  job('rage', [620, -700]),
  job('rage', [720, 30]),
  job('mayhem', [-380, -220]),
  job('mayhem', [150, 752]),
];

/** The rivals' rings on their turf: `rival` is `RIVALS`' index (10, the Chief, at the headquarters). */
export const RIVAL_RINGS: ReadonlyArray<{ rival: number; at: P2 }> = ([
  [0, [-240, 470]], [1, [380, 300]], [2, [640, -200]], [3, [410, 345]], [4, [280, -470]], [5, [-290, -220]],
  [6, [100, 752]], [7, [-560, -310]], [8, [-600, 409]], [9, [-705, -215]], [10, [-110, -88]],
] as ReadonlyArray<readonly [number, P2]>).map(([rival, at]) => ({ rival, at: W(at) }));

/** The three garages' doors. */
export const GARAGES: ReadonlyArray<{ name: 'hideout' | 'scrapyard' | 'hotel'; at: P2 }> = [
  { name: 'hideout', at: W([-470, -265]) }, { name: 'scrapyard', at: W([700, -135]) }, { name: 'hotel', at: W([560, 343]) },
];

export type JumpKind = 'crest' | 'ramp' | 'gap' | 'drop' | 'mega';
/** The twenty jumps: mostly the ground's own (§1.4); the big ones land through a billboard (`billboard`). */
export const JUMPS: ReadonlyArray<{ at: P2; kind: JumpKind; billboard: boolean }> = ([
  [[-107, -131], 'crest', true], [[-228, -220], 'crest', false], [[-350, -310], 'crest', false], [[-290, -400], 'crest', false],
  [[-560, -470], 'crest', false], [[-715, -330], 'gap', false], [[-700, -445], 'drop', false], [[370, -300], 'gap', true],
  [[150, -275], 'drop', false], [[600, -640], 'ramp', true], [[320, -500], 'ramp', false], [[545, 440], 'gap', true],
  [[50, 770], 'ramp', false], [[-760, 700], 'ramp', false], [[610, 178], 'ramp', false], [[-245, -175], 'gap', true],
  [[1025, 132], 'mega', true], [[-470, 250], 'crest', false], [[0, -50], 'ramp', true], [[640, -515], 'ramp', true],
] as ReadonlyArray<readonly [P2, JumpKind, boolean]>).map(([at, kind, billboard]) => ({ at: W(at), kind, billboard }));

/** The ten speed cameras (on the roads they watch). */
export const CAMERAS: readonly P2[] = Ws([[-380, -655], [600, -640], [806, -200], [700, 674], [-250, 694], [-798, 200], [-120, -140], [1025, -200], [-100, 752], [60, -300]]);

export type CoverKind = 'tunnel' | 'viaduct' | 'bridge' | 'stadium' | 'carpark' | 'arcade' | 'pergola' | 'warehouse' | 'cranes';
/** The thirteen places the helicopter cannot see into. */
export const COVERS: ReadonlyArray<{ kind: CoverKind; at: P2 }> = ([
  ['tunnel', [-560, -560]], ['viaduct', [375, -640]],
  ['bridge', [40, -262]], ['bridge', [280, -300]], ['bridge', [460, -304]], ['bridge', [640, -287]], ['bridge', [760, -278]],
  ['stadium', [610, 110]], ['carpark', [-245, -175]], ['arcade', [-335, -490]], ['pergola', [-150, 292]], ['warehouse', [430, 358]], ['cranes', [370, -570]],
] as ReadonlyArray<readonly [CoverKind, P2]>).map(([kind, at]) => ({ kind, at: W(at) }));

export type BreakerKind = 'scaffold' | 'containers' | 'rocks' | 'flatcar' | 'pallets' | 'huts';
/** The eight things that come down on the chasers. */
export const BREAKERS: ReadonlyArray<{ kind: BreakerKind; at: P2 }> = ([
  ['scaffold', [-200, -310]], ['scaffold', [-560, -130]], ['containers', [180, -640]], ['containers', [560, -650]],
  ['rocks', [-650, -470]], ['flatcar', [380, -515]], ['pallets', [-600, 40]], ['huts', [300, 700]],
] as ReadonlyArray<readonly [BreakerKind, P2]>).map(([kind, at]) => ({ kind, at: W(at) }));

/** Where the police's roadblocks go: where they cannot be driven round. */
export const ROADBLOCK_SITES: readonly P2[] = Ws([[-766, -250], [-400, -662], [852, 610], [505, 750], [150, -640], [0, -50]]);

/** The drive-throughs (the plan's §1.3): fuel, repair, paint. */
export const SERVICES: ReadonlyArray<{ kind: 'fuel' | 'repair' | 'paint'; at: P2 }> = ([
  ['fuel', [-690, 16]], ['fuel', [620, -42]], ['fuel', [-150, 728]], ['repair', [280, -425]], ['repair', [-640, 70]], ['paint', [-380, -165]], ['paint', [140, 420]],
] as ReadonlyArray<readonly ['fuel' | 'repair' | 'paint', P2]>).map(([kind, at]) => ({ kind, at: W(at) }));

/** The hidden cars and the fleet's finds, each where it waits. */
export const STASH: Readonly<Record<HiddenCar, P2>> = {
  icecream: W([338, 575]), roadster: W([975, -470]), sweeper: W([725, 180]), hotdog: W([-470, -455]),
  roller: W([120, -700]), monster: W([-820, 560]), trolley: W([-245, -150]), hover: W([440, 388]),
};

/** The slipways (their top on the shore, their way out to sea: south on the map, the world's −Z). */
export const SLIPWAYS: ReadonlyArray<{ at: P2; out: P2 }> = [{ at: W([440, 388]), out: [0, -1] }, { at: W([-400, 770]), out: [0, -1] }];

/** The sea trial's buoys: the route's control points, from the marina out of the bay, round the lighthouse, west. */
export const BUOYS: readonly P2[] = Ws([[560, 480], [620, 640], [700, 770], [820, 830], [930, 800], [960, 700], [900, 860], [700, 880], [400, 870], [100, 860], [-200, 850]]);

/** The first minute (§1.4): the route from the summit down Crown Avenue to the hotel's garage, and its six steps. */
export const FIRST_MINUTE: readonly P2[] = Ws([[-406, -352], [-300, -273], [-160, -170], [-32, -74], [0, -50], [33, -27], [240, 125], [520, 312], [560, 343]]);
export const FIRST_MINUTE_STEPS: ReadonlyArray<{ step: 'start' | 'swap' | 'billboard' | 'takedown' | 'delivery' | 'garage'; at: P2 }> = ([
  ['start', [-406, -352]], ['swap', [-300, -273]], ['billboard', [-160, -170]], ['takedown', [0, -50]], ['delivery', [240, 125]], ['garage', [560, 343]],
] as ReadonlyArray<readonly ['start' | 'swap' | 'billboard' | 'takedown' | 'delivery' | 'garage', P2]>).map(([step, at]) => ({ step, at: W(at) }));
