/** Seeded, independently reproducible chunks. Only nearby solid bodies live in Rapier. */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_PROP, GROUPS_SOLID, GROUPS_TERRAIN } from '../collision';
import { PALETTE } from '../palette';
import { POLICE } from '../police/tuning';
import { BALANCE } from '../balance';
import type { SpawnPoint } from '../playground';
import { mulberry32 } from '../random';
import { IDENTITY_QUAT as IDENTITY_ROT, quatFromYaw, type StaticDesc } from '../scene';
import { Architecture, CITY_COLORS, type LandmarkStyle } from './architecture';
import { CAR_TOP, RUN_OUT_REACH, VERGE, placeBillboards, runOutFootprint, tallFootprint, type BillboardDesc } from './collectibles';
import { DROP_OFF_LOTS, GARAGE, cameraSites, dropOffAt, dropOffFor, hideoutSign, hideoutStatics, toDropOff, type DropOff } from './cover';
import { COVER, coverStatics, insideCover, placeCovers, type CoverAvoid, type CoverDesc } from './covers';
import { cameraStatics, placeCameras, type CameraDesc } from './cameras';
import { RAMP_HALF_WIDTH, jumpStatics, placeJumps, type JumpDesc } from './jumps';
import { gateLine, layoutCoins, placeCoins, type CoinDesc, type CoinPoint } from './coins';
import { buildRoadMarkings } from './markings';
import { PROP_LINES, chunkProps, type FootwayRun, type PropContext, type PropDesc, type PropPlace } from './props';
import { signalPoles, signalledNodes } from './signals';
import { BLOCK, CITY_HALF, HIGHWAY_HALF, HIGHWAY_LANE_OFFSETS, OVERPASS_NODES, ROAD_HALF, buildCityRoute, buildRoadGraph, distanceToPolyline, highwayHeightAt, projectOnLane, underOverpass, type Lane, type RoadPoint, type SpecialRoad } from './roads';
import { overpassStatics } from './overpass';

export const DISTRICTS = [
  { id: 'crown', name: 'CROWN HEIGHTS', color: 0xb497d6, accent: 0xf5cd75, landmark: 'Crown Tower' },
  { id: 'foundry', name: 'SUNSET WORKS', color: 0xd98768, accent: 0x5daeb5, landmark: 'The Waterworks' },
  { id: 'gardens', name: 'PALM GARDENS', color: 0xe7bd87, accent: 0x8bb583, landmark: 'Glasshouse' },
  { id: 'marina', name: 'CORAL QUAY', color: 0xeaa7ab, accent: 0x67c9ce, landmark: 'Coral Hotel' },
] as const;
export function districtAt(x: number, z: number): typeof DISTRICTS[number] {
  return DISTRICTS[(z >= 0 ? 2 : 0) + (x >= 0 ? 1 : 0)] as typeof DISTRICTS[number];
}
/** Low landmarks need an open corner; towers can rise behind the street frontage. */
export const LANDMARKS = DISTRICTS.map((d, i) => {
  const offset = i < 2 ? 85 : 40;
  return { district: d.id, name: d.landmark, x: (i % 2 ? 450 : -450) + offset, z: (i < 2 ? -450 : 450) + offset, offset };
});
export function chunkCoord(v: number): number { return Math.max(-3, Math.min(3, Math.floor((v + BLOCK / 2) / BLOCK))); }
export interface CityChunk { key: string; x: number; z: number; statics: StaticDesc[]; billboards: BillboardDesc[]; coins: CoinDesc[] }

type Pt = { x: number; z: number };
/** Where a pavement band may begin or end along an authored road, with the edge to start on. */
interface ClipEdge { t: number; dir: Pt | null }
/** Pavement cut on a grid strip: the strip's fixed coordinate and the range to leave out. */
interface StripCut { axis: 'x' | 'z'; line: number; from: number; to: number }
interface RoadJoins {
  /** Pavement quads at the junctions (wedges between the two carriageways, slivers past a crossing). */
  prisms: Array<{ points: Pt[]; colour: number }>;
  cuts: StripCut[];
  /** Band clip per road side (index 0 = right-normal side -1, 1 = +1), in metres from a0. */
  start: [ClipEdge | null, ClipEdge | null];
  end: [ClipEdge | null, ClipEdge | null];
}
const PAVEMENT = 4.5;

/** An axis-aligned rectangle of the map: centre and half extents (m). */
export interface Rect { x: number; z: number; hx: number; hz: number }
/** A closed polygon of the map (world x, z). */
export type Polygon = ReadonlyArray<{ x: number; z: number }>;

/** A lot's decision (M7 slice 12): what the generator builds on it, decided before anything is built. */
type LotPlan =
  | { ox: number; oz: number; kind: 'park'; px: number; pz: number }
  | { ox: number; oz: number; kind: 'dropOff'; dropOff: DropOff }
  | { ox: number; oz: number; kind: 'building'; variant: number; px: number; pz: number; w: number; depth: number; setback: number; floors: number; backlot: boolean };

/** A chunk quarter: its district, whether an authored road passes it, its rectangle (pavement included) and its lots. */
interface QuarterPlan {
  sx: number; sz: number;
  d: typeof DISTRICTS[number];
  open: boolean;
  qx: number; qz: number; hx: number; hz: number;
  lots: LotPlan[];
}

/** The shallows round the island on the big map (m out from the seawall). */
const SHALLOWS = 40;

/** A circle the street furniture keeps out of (a job's ring, a parked hidden car, a breaker's tower). */
export interface PropRing { x: number; z: number; r: number }
/**
 * The keep-outs' margins (m, M8 D7): a grid footway's run stops this short of its chunk's edge where it runs toward
 * the neighbour (whose billboard's line may come this far); a car's half width plus room on the cold open's route
 * and a billboard's line; past a door's opening, a ramp's side and before and after it; clear of an overpass, a
 * covered street, a signal's or a sign's pole.
 */
const PROP_KEEP = { edge: 8, route: 1.6, line: 1.5, door: 2, doorOut: 0.5, rampSide: 2, rampBefore: 6, rampAfter: 80, overpass: 2, cover: 1, pole: 0.5, statics: 0.3 } as const;

/**
 * Whether two rectangles overlap (separating axes): each a centre, the cosine and sine of its yaw (local +X is
 * (cos, -sin), local +Z (sin, cos)) and its half extents.
 */
function rectsOverlap(ax: number, az: number, ac: number, as: number, ahx: number, ahz: number, bx: number, bz: number, bc: number, bs: number, bhx: number, bhz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const axes = [ac, -as, as, ac, bc, -bs, bs, bc];
  for (let k = 0; k < 8; k += 2) {
    const ux = axes[k] as number, uz = axes[k + 1] as number;
    const ra = ahx * Math.abs(ac * ux - as * uz) + ahz * Math.abs(as * ux + ac * uz);
    const rb = bhx * Math.abs(bc * ux - bs * uz) + bhz * Math.abs(bs * ux + bc * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}

/**
 * A coordinate of an edge park's tree kept out of the highway verge's billboard strip (its run-out's reach either
 * side of the verge line): moved past its outer edge (M8 D8).
 */
function offVerge(v: number): number {
  const a = Math.abs(v), lo = VERGE - RUN_OUT_REACH - 0.5, hi = VERGE + RUN_OUT_REACH + 0.5;
  return a > lo && a < hi ? Math.sign(v) * hi : v;
}

/** Distance from (px, pz) to the segment a–b. */
function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/**
 * A rotated footprint inside a block interior of chunk (cx, cz): clear of that chunk's and the neighbouring grid
 * streets' pavements, and of the island's edge.
 */
function lotClear(cx: number, cz: number, px: number, pz: number, yaw: number, hx: number, hz: number): boolean {
  const x = cx * BLOCK, z = cz * BLOCK;
  const vx = Math.abs(cx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] as const) {
    const wx = px + cos * lx + sin * lz, wz = pz - sin * lx + cos * lz;
    const dx = Math.abs(wx - x), dz = Math.abs(wz - z);
    if (Math.min(dx, BLOCK - dx) < vx + 5 || Math.min(dz, BLOCK - dz) < vz + 5) return false;
    if (Math.abs(wx) > CITY_HALF - 8 || Math.abs(wz) > CITY_HALF - 8) return false;
  }
  return true;
}

/** An authored road's frontage row: the district style, a lot's half size, the gap and setback, floors, accent. */
interface Frontage { district: string; hx: number; hz: number; gap: number; setback: number; floors: number; accent: number }
function frontageOf(road: SpecialRoad): Frontage | null {
  return road.kind === 'avenue' ? { district: 'crown', hx: 10, hz: 10, gap: 3, setback: 1.3, floors: 4, accent: 0xf5cd75 }
    : road.kind === 'quay' ? { district: 'marina', hx: 12, hz: 9, gap: 5, setback: 1.3, floors: 4, accent: 0x67c9ce }
    : road.kind === 'parkway' ? { district: 'gardens', hx: 8, hz: 8, gap: 8, setback: 6, floors: 2, accent: 0x8bb583 } : null;
}

/**
 * A lot of an authored road's frontage row (M7 slice 11): a road's are computed once, in the order the chunks
 * emit them, so a lot knows its place in the row: the first and last on each side are corner shops, the one
 * nearest the middle its landmark.
 */
export interface FrontageLot {
  /** The centreline segment whose chunk emits it. */
  segment: number;
  /** Metres along the road from its first junction; the side (1 right of the road's direction, -1 left). */
  along: number;
  side: number;
  px: number; pz: number; yaw: number;
  width: number; depth: number; floors: number; variant: number;
  /** The entrance path's centre, between the door and the pavement. */
  pathX: number; pathZ: number;
  /** A corner lot's side face toward its junction: 1 its local +X, -1 its -X; 0 not a corner. */
  turn: number;
  landmark: boolean;
}

/**
 * One landmark per avenue (M7 slice 11): a building of its own kind on the frontage lot nearest the road's middle,
 * so each reads as a place: its body and its sign's colour and its floors, by road.
 */
export const AVENUE_LANDMARKS: Readonly<Record<string, LandmarkStyle>> = {
  'Crown Diagonal West': { district: 'crown', body: CITY_COLORS.brick, sign: PALETTE.carMagenta, floors: 14 },
  'Crown Diagonal North': { district: 'crown', body: CITY_COLORS.mint, sign: PALETTE.carGold, floors: 12 },
  'Quay Sweep': { district: 'marina', body: CITY_COLORS.lavender, sign: PALETTE.carOrange, floors: 9 },
  // among the parkway's houses, an apartment block
  'Garden Parkway': { district: 'marina', body: CITY_COLORS.stone, sign: PALETTE.carLime, floors: 5 },
};

/** The big map's island (M7 slice 12, docs/M7_PLAN.md §3.2): blocks, parks and the shallows. */
export function cityFootprints(city: City): { parks: Rect[]; blocks: Rect[]; water: Polygon[] } {
  return city.footprints();
}

export class City {
  readonly graph = buildRoadGraph();
  readonly roadMarkings = buildRoadMarkings(this.graph, districtAt);
  readonly route = buildCityRoute(this.graph);
  /** Axis-aligned bounds per lane, so the reset projection skips distant lanes. */
  private readonly laneBounds = this.graph.lanes.map((lane) => {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const pt of lane.points) { b.minX = Math.min(b.minX, pt.x); b.maxX = Math.max(b.maxX, pt.x); b.minZ = Math.min(b.minZ, pt.z); b.maxZ = Math.max(b.maxZ, pt.z); }
    return b;
  });
  /** Recently generated chunk descriptors: render tiles reload often at the fog edge. */
  private readonly chunkCache = new Map<string, CityChunk>();
  private readonly frames = new Map<string, { cum: number[]; nx: number[]; nz: number[]; total: number }>();
  private readonly joins = new Map<string, RoadJoins>();
  /** Each authored road's frontage lots, and by segment (M7 slice 11). */
  private readonly lots = new Map<string, FrontageLot[]>();
  private readonly lotsBySegment = new Map<string, Map<number, FrontageLot[]>>();
  private footprintCache: { parks: Rect[]; blocks: Rect[]; water: Polygon[] } | null = null;
  /** What the street furniture keeps out of that the world knows (M8): set once before any prop is asked for. */
  private propKeepOut: { rings: ReadonlyArray<PropRing>; route: () => ReadonlyArray<{ x: number; z: number }> } | null = null;
  private propRoute: ReadonlyArray<{ x: number; z: number }> | null = null;
  /** Each chunk's props, placed the first time asked for (all 49 are small). */
  private readonly propLists = new Map<string, PropDesc[]>();
  readonly spawns: SpawnPoint[];
  readonly active = new Map<string, { body: RAPIER.RigidBody; chunk: CityChunk }>();
  /** The physics ring took a chunk in (its fixed body) or let it go (M8: the props' posts live on that body). */
  onLoad: ((cx: number, cz: number, body: RAPIER.RigidBody) => void) | null = null;
  onUnload: ((cx: number, cz: number) => void) | null = null;
  loaded = 0;
  unloaded = 0;
  private cx = Infinity;
  private cz = Infinity;
  private complete = false;
  /** The ten speed cameras (slice 6): their poles go into the chunks that hold them. */
  readonly cameras: readonly CameraDesc[];
  /** The twenty stunt ramps (slice 6), likewise. */
  readonly jumps: readonly JumpDesc[];
  /** The island's coin layout from the seed (every line but the gate lines); each chunk takes the ones inside it. */
  readonly coinLayout: readonly CoinPoint[];
  /** The four covered streets (M5.5 slice 7); their boxes go into the chunks that hold them. */
  readonly covers: readonly CoverDesc[];
  private readonly coverBoxes: readonly StaticDesc[];
  /** The highway's four overpasses (M5.5 slice 8), likewise by chunk. */
  private readonly overpassBoxes: readonly StaticDesc[];
  constructor(readonly world: RAPIER.World, readonly seed = 42) {
    this.cameras = placeCameras(cameraSites(this.graph), POLICE.cameras.count);
    this.jumps = placeJumps(seed, BALANCE.jumps.count);
    this.coinLayout = layoutCoins(this.jumps);
    // a covered street near each district's door (the Gardens': its landmark), clear of doors, ramps, cameras and plazas
    const doors = DROP_OFF_LOTS.map((lot) => dropOffFor(lot));
    const anchors: Record<string, { x: number; z: number }> = {};
    for (const d of DISTRICTS) {
      const door = doors.find((o) => districtAt(o.x, o.z).id === d.id)?.door;
      const site = LANDMARKS.find((l) => l.district === d.id);
      anchors[d.id] = door ?? site ?? { x: 0, z: 0 };
    }
    const avoid: CoverAvoid[] = [
      ...doors.map((o) => ({ x: o.door.x, z: o.door.z, r: COVER.clear })),
      ...this.jumps.map((j) => ({ x: j.x, z: j.z, r: COVER.clear })),
      ...this.cameras.map((c) => ({ x: c.poleX, z: c.poleZ, r: COVER.clear })),
      ...LANDMARKS.map((l) => ({ x: l.x, z: l.z, r: COVER.clear })),
    ];
    this.covers = placeCovers(this.graph, anchors, avoid);
    this.coverBoxes = this.covers.flatMap((c) => coverStatics(c));
    this.overpassBoxes = OVERPASS_NODES.flatMap((_, k) => overpassStatics(k));
    // The one unbroken collision plane eliminates suspension seams at roads and chunk borders.
    world.createCollider(RAPIER.ColliderDesc.cuboid(CITY_HALF, 0.5, CITY_HALF)
      .setTranslation(0, -0.5, 0).setFriction(1).setCollisionGroups(GROUPS_TERRAIN));
    for (const axis of [0, 1]) for (const sign of [-1, 1]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(axis === 0 ? 1 : CITY_HALF, 2, axis === 1 ? 1 : CITY_HALF)
        .setTranslation(axis === 0 ? sign * CITY_HALF : 0, 2, axis === 1 ? sign * CITY_HALF : 0)
        .setCollisionGroups(GROUPS_SOLID).setRestitution(1));
    }
    this.spawns = [];
    const start = this.route.start;
    this.spawns.unshift({ name: 'city', position: { x: start.x, y: 1, z: start.z }, yaw: start.yaw });
    for (const [name, x, z] of [['crown', -450, -450], ['foundry', 450, -450], ['gardens', -450, 450], ['marina', 450, 450], ['highway', -675, 0]] as const) {
      // Facing +Z, right is -X: the highway spawn sits in its inner lane, the street spawns on their single lane.
      const px = x - (name === 'highway' ? HIGHWAY_LANE_OFFSETS[0] : 4.5), pz = z + 40;
      this.spawns.push({ name, position: { x: px, y: 1 + (name === 'highway' ? highwayHeightAt(px, pz) : 0), z: pz }, yaw: 0 });
    }
    // The authored loop starts on the first Crown diagonal, heading for the tower junction.
    const first = this.graph.lanes.find((l) => l.special === 'Crown Diagonal West' && this.graph.nodes[l.from]?.x === -675);
    if (first) this.spawns.push({ name: 'loop', position: { x: first.x0, y: 1, z: first.z0 }, yaw: first.yaw0 });
  }

  /** The authored roads near a chunk centre (their corridor overrides the grid's apron and lots), and the clearance to them. */
  private corridorsNear(x: number, z: number): { corridors: SpecialRoad[]; roadClearance: (px: number, pz: number) => number } {
    const corridors = this.graph.special.filter((road) => road.centre.some((pt) => Math.abs(pt.x - x) < BLOCK / 2 + road.halfWidth + 8 && Math.abs(pt.z - z) < BLOCK / 2 + road.halfWidth + 8));
    const roadClearance = (px: number, pz: number): number => {
      let best = Infinity;
      for (const road of corridors) best = Math.min(best, distanceToPolyline(road.centre, px, pz) - road.halfWidth);
      return best;
    };
    return { corridors, roadClearance };
  }

  /**
   * A chunk's quarters and their lots, decided from the chunk's random stream in the generator's order: a lot is
   * reserved for a landmark, left to an authored road's frontage, a park, a drop-off or a building.
   */
  private plan(cx: number, cz: number, corridors: readonly SpecialRoad[], roadClearance: (px: number, pz: number) => number): QuarterPlan[] {
    const x = cx * BLOCK, z = cz * BLOCK;
    const rnd = mulberry32(this.seed ^ Math.imul(cx + 19, 73856093) ^ Math.imul(cz + 23, 19349663));
    const vx = Math.abs(cx) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const vz = Math.abs(cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const out: QuarterPlan[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const d = districtAt(x + sx * 55, z + sz * 55);
      const hx = (BLOCK / 2 - vx) / 2, hz = (BLOCK / 2 - vz) / 2;
      const qx = x + sx * (vx + hx), qz = z + sz * (vz + hz);
      const open = corridors.some((road) => road.centre.some((pt) => Math.abs(pt.x - qx) < hx + road.halfWidth + 6 && Math.abs(pt.z - qz) < hz + road.halfWidth + 6));
      const lots: LotPlan[] = [];
      for (const ox of [40, 85]) for (const oz of [40, 85]) {
        // Reserve authored destinations before filling ordinary parcels.
        const landmarkOffset = d.id === 'crown' || d.id === 'foundry' ? 85 : 40;
        if (Math.abs(cx) === 2 && Math.abs(cz) === 2 && sx === 1 && sz === 1 && ox === landmarkOffset && oz === landmarkOffset) continue;
        // Lots whose footprint could meet an authored road's frontage row are left
        // to that road (its buildings, trees and pavements furnish the corridor).
        if (open && [[0, 0], [-18, -18], [18, -18], [-18, 18], [18, 18]].some(([ex, ez]) => roadClearance(x + sx * ox + (ex as number), z + sz * oz + (ez as number)) < 40)) continue;
        const backlot = ox === 85 && oz === 85;
        const edge = Math.abs(x + sx * ox) > 702 || Math.abs(z + sz * oz) > 702;
        const park = edge || (backlot && d.id === 'gardens') || (backlot && rnd() < 0.35);
        if (park) { lots.push({ ox, oz, kind: 'park', px: x + sx * ox, pz: z + sz * oz }); continue; }
        const variant = Math.floor(rnd() * 3);
        const dropOff = dropOffAt(cx, cz, sx, sz, ox, oz);
        if (dropOff) { lots.push({ ox, oz, kind: 'dropOff', dropOff }); continue; }
        const w = d.id === 'gardens' ? 7 + variant : (ox === 85 ? 15 : 10) + variant;
        const depth = d.id === 'gardens' ? 8 + variant : (oz === 85 ? 16 : 10) + variant;
        const setback = d.id === 'gardens' ? 6 : d.id === 'foundry' ? 7 : 1.3;
        const px = x + sx * (ox === 40 ? vx + 4.5 + setback + w : 82);
        const pz = z + sz * (oz === 40 ? vz + 4.5 + setback + depth : 82);
        // Higher offices cluster around Crown Tower; the street still has a human-scale podium.
        const centreDistance = Math.hypot(px + 365, pz + 365);
        const floors = d.id === 'crown' ? (backlot ? 7 + Math.max(0, 5 - Math.floor(centreDistance / 100)) : 3 + variant)
          : d.id === 'foundry' ? 1 : d.id === 'gardens' ? 2 : 3 + variant;
        lots.push({ ox, oz, kind: 'building', variant, px, pz, w, depth, setback, floors, backlot });
      }
      out.push({ sx, sz, d, open, qx, qz, hx, hz, lots });
    }
    return out;
  }

  /**
   * The island for the big map (M7 slice 12): the block interiors inside their pavements where no authored road
   * passes, the parks (the park lots and the Gardens' open quarters) and the shallows round the seawall. Read from
   * the lot plans, never from built chunks, so it costs a few hundred small decisions once.
   */
  footprints(): { parks: Rect[]; blocks: Rect[]; water: Polygon[] } {
    if (this.footprintCache) return this.footprintCache;
    const parks: Rect[] = [], blocks: Rect[] = [];
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      const { corridors, roadClearance } = this.corridorsNear(cx * BLOCK, cz * BLOCK);
      for (const q of this.plan(cx, cz, corridors, roadClearance)) {
        // the interior: the quarter less its two 4.5 m pavements
        const inner = { x: q.qx + q.sx * PAVEMENT / 2, z: q.qz + q.sz * PAVEMENT / 2, hx: q.hx - PAVEMENT / 2, hz: q.hz - PAVEMENT / 2 };
        if (!q.open) blocks.push(inner);
        else if (q.d.id === 'gardens') parks.push(inner);
        for (const lot of q.lots) if (lot.kind === 'park') parks.push({ x: lot.px, z: lot.pz, hx: 18, hz: 18 });
      }
    }
    const h = CITY_HALF, w = SHALLOWS;
    const water: Polygon[] = [
      [{ x: -h - w, z: -h - w }, { x: h + w, z: -h - w }, { x: h + w, z: -h }, { x: -h - w, z: -h }],
      [{ x: -h - w, z: h }, { x: h + w, z: h }, { x: h + w, z: h + w }, { x: -h - w, z: h + w }],
      [{ x: -h - w, z: -h }, { x: -h, z: -h }, { x: -h, z: h }, { x: -h - w, z: h }],
      [{ x: h, z: -h }, { x: h + w, z: -h }, { x: h + w, z: h }, { x: h, z: h }],
    ];
    this.footprintCache = { parks, blocks, water };
    return this.footprintCache;
  }

  generate(cx: number, cz: number): CityChunk {
    const x = cx * BLOCK, z = cz * BLOCK;
    const statics: StaticDesc[] = [];
    const architecture = new Architecture(statics);
    const box = architecture.box.bind(architecture);
    const cylinder = architecture.cylinder.bind(architecture);
    const vx = Math.abs(cx) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const vz = Math.abs(cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    box(x, -0.06, z, BLOCK / 2, 0.05, BLOCK / 2, PALETTE.grass, 'ground');
    // Split the cross into disjoint rectangles: no z-fighting at intersections.
    box(x, 0, z, vx, 0.01, BLOCK / 2, PALETTE.asphalt, 'road');
    for (const side of [-1, 1]) {
      const half = (BLOCK / 2 - vx) / 2;
      box(x + side * (vx + half), 0, z, half, 0.01, vz, PALETTE.asphalt, 'road');
    }
    // One owner per whole-road marking, including marks across chunk boundaries.
    // Non-colliding top faces: road .010/.034, parking pad .040, paint .064.
    for (const st of this.roadMarkings.chunks.get(`${cx},${cz}`) ?? []) if (!underOverpass(st.position.x, st.position.z, 1)) statics.push(st);
    // Authored roads that come near this chunk. Their corridor (half width plus
    // pavement) overrides the grid apron and lots, so nothing is built on them.
    const { corridors, roadClearance } = this.corridorsNear(x, z);
    // every lot's decision first, from the chunk's random stream (the footprints read the same plan, M7 slice 12)
    const plans = this.plan(cx, cz, corridors, roadClearance);
    // Junction pavements of the authored roads: computed once per road, emitted by
    // the chunk that holds each piece, and their strip cuts apply to any chunk.
    const joinCuts: StripCut[] = [];
    for (const road of corridors) {
      const joins = this.joinsFor(road);
      joinCuts.push(...joins.cuts);
      for (const piece of joins.prisms) {
        let mx = 0, mz = 0;
        for (const pt of piece.points) { mx += pt.x / piece.points.length; mz += pt.z / piece.points.length; }
        if (Math.abs(mx - x) < BLOCK / 2 && Math.abs(mz - z) < BLOCK / 2) architecture.prism(piece.points, 0, 0.14, piece.colour);
      }
    }
    for (const q of plans) {
      const { sx, sz, d, open, qx, qz, hx, hz } = q;
      const c = CITY_COLORS;
      if (!open) {
        // The collision apron stays continuous. Visually, pavement is only 4.5 m wide;
        // the interior is gardens, courtyards or a paved industrial service yard.
        box(qx, 0.07, qz, hx, 0.07, hz, d.id === 'foundry' ? c.yard : c.soil, 'kerb');
        box(x + sx * (vx + 2.25), 0.145, z + sz * (vz + hz), 2.25, 0.005, hz, PALETTE.kerb, 'decor', 'top');
        box(x + sx * (vx + hx), 0.145, z + sz * (vz + 2.25), hx, 0.005, 2.25, PALETTE.kerb, 'decor', 'top');
        // No kerb lip and no paving joints: a flat line seen from the driving camera
        // is only (length along the view × camera height / distance²) tall on screen,
        // so a 4 cm lip or a 12 cm joint is sub-pixel past 30 m and shimmers.
        // The pavement edge is the colour boundary and the 14 cm kerb face.
      } else {
        // Open quarter: the interior sits at road level and the grid pavements are
        // only the 4.5 m strips, cut where the authored road passes through.
        box(qx, 0.008, qz, hx, 0.001, hz, d.id === 'foundry' ? c.yard : d.id === 'gardens' ? PALETTE.grass : c.soil, 'decor', 'top');
        for (const axis of ['x', 'z'] as const) {
          const length = axis === 'x' ? hz * 2 : hx * 2;
          const start = axis === 'x' ? vz : vx;
          const line = axis === 'x' ? x + sx * (vx + 2.25) : z + sz * (vz + 2.25);
          const cuts = joinCuts.filter((cut) => cut.axis === axis && Math.abs(cut.line - line) < 0.1);
          let runStart = -1;
          for (let along = 0; along <= length + 1e-6; along += 1.5) {
            const end = along >= length;
            const px = axis === 'x' ? x + sx * (vx + 2.25) : x + sx * (start + along);
            const pz = axis === 'x' ? z + sz * (start + along) : z + sz * (vz + 2.25);
            const free = axis === 'x' ? pz : px;
            // Blocked where the authored carriageway would meet the strip box, and over
            // the junction wedge that replaces the strip there (exact edge match).
            const blocked = end || roadClearance(px, pz) < 2.5 || cuts.some((cut) => free >= cut.from && free <= cut.to);
            if (!blocked && runStart < 0) {
              // Start exactly on the wedge's end edge when a cut ended within the last sample.
              const snap = cuts.find((cut) => free - (axis === 'x' ? sz : sx) * 1.5 <= cut.to && free > cut.to);
              runStart = snap ? (axis === 'x' ? sz * (snap.to - z) : sx * (snap.to - x)) - start : along;
            }
            if (blocked && runStart >= 0) {
              const stop = Math.min(along, length), mid = start + (runStart + stop) / 2, half = (stop - runStart) / 2;
              if (half > 1) {
                if (axis === 'x') box(x + sx * (vx + 2.25), 0.07, z + sz * mid, 2.25, 0.07, half, PALETTE.kerb, 'kerb');
                else box(x + sx * mid, 0.07, z + sz * (vz + 2.25), half, 0.07, 2.25, PALETTE.kerb, 'kerb');
              }
              runStart = -1;
            }
          }
        }
      }
      for (const lot of q.lots) {
        const { ox } = lot;
        if (lot.kind === 'park') {
          const { px, pz } = lot;
          box(px, 0.16, pz, 18, 0.015, 18, PALETTE.grass, 'decor', 'top');
          box(px, 0.18, pz, 1.6, 0.01, 18, PALETTE.kerb, 'decor', 'top');
          // a verge billboard's run-out may cross an edge park, and a trunk is solid (M8 D8): its trees stand out of that strip
          architecture.tree(offVerge(px - 7), offVerge(pz), d.id === 'marina');
          architecture.tree(offVerge(px + 9), offVerge(pz + 8), d.id === 'marina');
          // its benches are props (M8, `props`)
          continue;
        }
        // A drop-off garage stands on this lot instead of its building (the plan's draw keeps the lot stream).
        if (lot.kind === 'dropOff') {
          statics.push(...hideoutStatics(lot.dropOff));
          continue;
        }
        const { oz, variant, w, depth, setback, px, pz, floors, backlot } = lot;
        architecture.building(px, pz, w, depth, d.id, sx, sz, floors, variant, d.accent, ox === 40 || backlot, oz === 40 || backlot);
        // Paths join actual entrances to the public footway; yards are intentionally set back.
        if (ox === 40) box(x + sx * (vx + 4.5 + setback / 2), 0.17, pz, setback / 2, 0.01, 1.5, PALETTE.kerb, 'decor', 'top');
        if (oz === 40) box(px, 0.17, z + sz * (vz + 4.5 + setback / 2), 1.5, 0.01, setback / 2, PALETTE.kerb, 'decor', 'top');
        if (d.id === 'gardens') {
          if (ox === 40 && !insideCover(this.covers, x + sx * (vx + 7), pz + sz * 5, 4)) {
            architecture.tree(x + sx * (vx + 7), pz + sz * 5);
            box(x + sx * (vx + 5.5), 0.65, pz - sz * 6, 0.7, 0.5, 4, c.hedge);
          }
        }
      }
      // the street trees and the lamp posts are props on the kerb line (M8, `props`)
    }
    // Each landmark owns a reserved plaza, with paths back to both bordering streets.
    if (Math.abs(cx) === 2 && Math.abs(cz) === 2) {
      const d = districtAt(x, z);
      const site = LANDMARKS.find((l) => l.district === d.id);
      if (!site) throw new Error(`Missing landmark for ${d.id}`);
      const px = site.x, pz = site.z;
      box(px, 0.165, pz, 24, 0.015, 24, PALETTE.kerb, 'decor', 'top');
      if (site.offset === 85) {
        box(x + 49, 0.165, pz + 20, 36, 0.015, 2, PALETTE.kerb, 'decor', 'top');
        box(px + 20, 0.165, z + 49, 2, 0.015, 36, PALETTE.kerb, 'decor', 'top');
      } else {
        box(x + 15, 0.165, pz, 3, 0.015, 2, PALETTE.kerb, 'decor', 'top');
        box(px, 0.165, z + 15, 2, 0.015, 3, PALETTE.kerb, 'decor', 'top');
      }
      if (d.id === 'crown') {
        architecture.building(px, pz, 14, 14, 'crown', 1, 1, 30, 0, d.accent);
        box(px, 97, pz, 10, 3, 10, CITY_COLORS.stone, 'building');
        box(px, 103, pz, 6, 3, 6, d.accent);
        box(px, 115, pz, 0.4, 9, 0.4, d.accent);
      } else if (d.id === 'foundry') {
        for (const a of [-8, 8]) for (const b of [-8, 8]) box(px + a, 15, pz + b, 1, 15, 1, d.accent, 'building');
        cylinder(px, 34, pz, 14, 6, d.color);
        box(px, 40.5, pz, 14, 0.5, 14, d.accent);
        // The works chimney: the tallest thing in the north-east, striped at the top.
        cylinder(px + 30, 33, pz - 30, 2.4, 33, CITY_COLORS.brick);
        cylinder(px + 30, 62, pz - 30, 2.6, 1.5, d.accent);
        cylinder(px + 30, 66, pz - 30, 2.6, 1.5, PALETTE.laneMark);
        box(px + 30, 3, pz - 30, 4, 3, 4, CITY_COLORS.brick, 'building');
      } else if (d.id === 'gardens') {
        box(px, 5, pz, 18, 5, 18, d.accent, 'building');
        for (const side of [-1, 1]) for (const bay of [-12, -6, 0, 6, 12]) {
          box(px + side * 18.08, 5.3, pz + bay, 0.01, 3.8, 2.5, CITY_COLORS.windowLight, 'decor', side > 0 ? 'x+' : 'x-');
          box(px + bay, 5.3, pz + side * 18.08, 2.5, 3.8, 0.01, CITY_COLORS.windowLight, 'decor', side > 0 ? 'z+' : 'z-');
        }
        box(px - 18.1, 1.4, pz, 0.01, 1.2, 1.2, CITY_COLORS.shop, 'decor', 'x-');
        cylinder(px, 12, pz, 17, 2, PALETTE.glass);
        cylinder(px, 15, pz, 12, 1, PALETTE.glass);
        cylinder(px, 17, pz, 6, 1, d.accent);
        // The gardens mast: a slim beacon so the low glasshouse still marks its district from afar.
        cylinder(px + 26, 23, pz + 26, 0.7, 23, CITY_COLORS.trim);
        box(px + 26, 47.5, pz + 26, 1.6, 1.6, 1.6, d.accent);
        box(px + 26, 1, pz + 26, 2.5, 1, 2.5, CITY_COLORS.stone, 'building');
      } else {
        architecture.building(px, pz, 16, 12, 'marina', 1, 1, 14, 0, d.accent);
        box(px, 46.5, pz, 7, 2, 10, d.accent, 'building');
        box(px, 50, pz, 11, 1.4, 0.4, PALETTE.laneMark);
        box(px, 50, pz, 0.4, 1.4, 12, PALETTE.laneMark);
        for (const side of [-1, 1]) architecture.tree(px + side * 21, pz - 19, true);
      }
    }
    for (const road of corridors) this.specialRoad(road, cx, cz, architecture);
    if ((cx === 3 && cz === 2) || (cx === 2 && cz === 3)) this.waterfront(cx, architecture);
    if ((cx === 3 && cz >= 1) || (cz === 3 && cx >= 1)) this.promenade(cx, cz, architecture);
    // Visible seawalls match the persistent boundary colliders.
    // Coral Quay's edges are a low parapet with a coping so the promenade sees the
    // water; the invisible 4 m boundary collider is unchanged. Elsewhere a seawall.
    const quay = x > 0 && z > 0;
    if (Math.abs(cx) === 3) {
      box(Math.sign(cx) * CITY_HALF, quay ? 0.55 : 2, z, 1, quay ? 0.55 : 2, BLOCK / 2, PALETTE.kerb, 'boundary');
      if (quay) box(Math.sign(cx) * CITY_HALF, 1.16, z, 1.15, 0.07, BLOCK / 2, CITY_COLORS.trim, 'boundary');
    }
    if (Math.abs(cz) === 3) {
      box(x, quay ? 0.55 : 2, Math.sign(cz) * CITY_HALF, BLOCK / 2, quay ? 0.55 : 2, 1, PALETTE.kerb, 'boundary');
      if (quay) box(x, 1.16, Math.sign(cz) * CITY_HALF, BLOCK / 2, 0.07, 1.15, CITY_COLORS.trim, 'boundary');
    }
    // the covered streets' and the overpasses' boxes, each in the chunk holding its centre
    for (const st of this.coverBoxes) if (chunkCoord(st.position.x) === cx && chunkCoord(st.position.z) === cz) statics.push(st);
    for (const st of this.overpassBoxes) if (chunkCoord(st.position.x) === cx && chunkCoord(st.position.z) === cz) statics.push(st);
    // Last: the billboards need every static in place to find clear ground.
    const billboards = placeBillboards(cx, cz, statics, roadClearance);
    const coins = placeCoins(cx, cz, this.coinLayout, billboards, this.graph);
    // speed cameras after the billboards, so the placer's clearance and the coin lines never change for them
    for (const cam of this.cameras) if (chunkCoord(cam.poleX) === cx && chunkCoord(cam.poleZ) === cz) statics.push(...cameraStatics(cam));
    for (const jd of this.jumps) if (chunkCoord(jd.x) === cx && chunkCoord(jd.z) === cz) statics.push(...jumpStatics(jd));
    return { key: `${cx},${cz}`, x: cx, z: cz, statics, billboards, coins };
  }

  /** Coral Quay's seawall edge: paved promenade, palms and masts (its benches are props). */
  private promenade(cx: number, cz: number, architecture: Architecture): void {
    const box = architecture.box.bind(architecture);
    const start = architecture.statics.length;
    // Built along local X at the wall (local +Z is the sea); rotated for the east edge.
    const half = BLOCK / 2, wall = CITY_HALF;
    box(0, 0.16, -5, half, 0.02, 4, PALETTE.kerb, 'decor', 'top');
    for (let u = -half + 11; u < half; u += 22) architecture.tree(u, -8.5, true);
    // its benches are props (M8, `props`)
    for (let u = -half + 30; u < half; u += 75) architecture.mast(u, -7.6);
    const yaw = cx === 3 ? Math.PI / 2 : 0;
    architecture.rotateFrom(start, cx === 3 ? wall : cx * BLOCK, cx === 3 ? cz * BLOCK : wall, yaw);
  }

  /** Coral Quay's sea edge: a pier with a pavilion and moored boats beyond the seawall. */
  private waterfront(cx: number, architecture: Architecture): void {
    const box = architecture.box.bind(architecture), c = CITY_COLORS;
    const start = architecture.statics.length;
    // Built along +X from the seawall; rotated for the south edge.
    box(31, 1.2, 0, 31, 0.22, 4.2, c.trim);
    for (let d = 4; d < 62; d += 8) for (const side of [-1, 1]) architecture.cylinder(d, 0.1, side * 3.4, 0.3, 1.1, c.roof);
    for (let d = 8; d < 60; d += 16) box(d, 2.0, -4.6, 0.12, 0.6, 0.12, c.roof);
    box(57, 3.3, 0, 3.6, 1.9, 3.6, PALETTE.kerb);
    architecture.statics.push({ shape: { kind: 'gable', hx: 4.2, hy: 1.4, hz: 4.2 }, position: { x: 57, y: 6.4, z: 0 }, rotation: IDENTITY_ROT, color: c.brick, tag: 'decor' });
    box(24, 4.2, 4.8, 0.14, 3, 0.14, 0x686678);
    box(24, 7.2, 4.8, 0.45, 0.14, 1.2, PALETTE.laneMark);
    for (const [bx, bz, colour] of [[16, -13, PALETTE.carWhite], [30, 12, PALETTE.carBlue], [46, -12, PALETTE.carOrange], [70, 9, PALETTE.carWhite]] as const) {
      box(bx, -0.1, bz, 3.2, 0.5, 1.2, colour);
      box(bx + 0.4, 0.9, bz, 1.2, 0.55, 0.9, c.chalk);
      box(bx - 0.6, 1.9, bz, 0.06, 1.4, 0.06, c.roof);
    }
    const yaw = cx === 3 ? Math.PI / 2 : 0;
    architecture.rotateFrom(start, cx === 3 ? CITY_HALF : 400, cx === 3 ? 400 : CITY_HALF, yaw);
  }

  /** Simplified landmark shapes for the renderer's always-visible skyline layer. */
  landmarkSilhouettes(): StaticDesc[] {
    const statics: StaticDesc[] = [];
    const a = new Architecture(statics), c = CITY_COLORS;
    for (const site of LANDMARKS) {
      const d = DISTRICTS.find((x) => x.id === site.district);
      if (!d) continue;
      const { x, z } = site;
      if (site.district === 'crown') {
        a.box(x, 46.9, z, 13.5, 46.9, 13.5, c.stone, 'skyline');
        a.box(x, 97, z, 9.6, 2.9, 9.6, c.stone, 'skyline');
        a.box(x, 103, z, 5.7, 2.9, 5.7, d.accent, 'skyline');
        a.box(x, 115, z, 0.38, 8.8, 0.38, d.accent, 'skyline');
      } else if (site.district === 'foundry') {
        for (const p of [-8, 8]) for (const q of [-8, 8]) a.box(x + p, 15, z + q, 0.9, 14.9, 0.9, d.accent, 'skyline');
        a.cylinder(x, 34, z, 13.6, 5.9, d.color);
        a.cylinder(x + 30, 33, z - 30, 2.3, 32.9, c.brick);
        a.cylinder(x + 30, 62, z - 30, 2.5, 1.4, d.accent);
      } else if (site.district === 'gardens') {
        a.cylinder(x, 12, z, 16.5, 1.9, PALETTE.glass);
        a.cylinder(x + 26, 23, z + 26, 0.65, 22.9, c.trim);
        a.box(x + 26, 47.5, z + 26, 1.5, 1.5, 1.5, d.accent, 'skyline');
      } else {
        a.box(x, 22.3, z, 15.5, 22.2, 11.5, c.peach, 'skyline');
        a.box(x, 46.5, z, 6.8, 1.9, 9.8, d.accent, 'skyline');
        a.box(x, 50, z, 10.8, 1.3, 0.38, PALETTE.laneMark, 'skyline');
      }
    }
    for (const st of statics) st.tag = 'skyline';
    return statics;
  }

  /**
   * One authored road, drawn segment by segment; a segment belongs to the chunk
   * that contains its midpoint, so neighbouring chunks never draw it twice. The
   * surface is a raised top face over the grid cross, so junction overlaps do not
   * z-fight; pavements are rotated kerb boxes that stop short of the junctions.
   */
  private specialRoad(road: SpecialRoad, cx: number, cz: number, architecture: Architecture): void {
    const x = cx * BLOCK, z = cz * BLOCK, hw = road.halfWidth;
    const box = architecture.box.bind(architecture);
    const joins = this.joinsFor(road);
    const a0 = road.centre[0] as RoadPoint, a1 = road.centre[road.centre.length - 1] as RoadPoint;
    const nearJunction = (px: number, pz: number, margin: number) =>
      Math.max(Math.abs(px - a0.x), Math.abs(pz - a0.z)) < margin || Math.max(Math.abs(px - a1.x), Math.abs(pz - a1.z)) < margin;
    const c = CITY_COLORS;
    const paving = road.kind === 'service' ? c.yard : road.kind === 'parkway' ? PALETTE.grass : PALETTE.kerb;
    const footprintClear = (px: number, pz: number, yaw: number, hx: number, hz: number): boolean => lotClear(cx, cz, px, pz, yaw, hx, hz);
    // Frontage: buildings face the authored road, spaced along it, both sides (the lots computed once a road).
    const lots = this.frontageBySegment(road);
    let along = 0, nextYard = 45;
    for (let i = 0; i + 1 < road.centre.length; i++) {
      const a = road.centre[i] as RoadPoint, b = road.centre[i + 1] as RoadPoint;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, yaw = Math.atan2(dx, dz);
      const rot = quatFromYaw(yaw);
      // Right-hand normal when facing along the segment: (-dz, dx) / len.
      const nx = -dz / len, nz = dx / len;
      const startAlong = along;
      along += len;
      if (Math.abs(mx - x) >= BLOCK / 2 || Math.abs(mz - z) >= BLOCK / 2) continue;
      const surface = box(mx, 0.033, mz, hw, 0.001, len / 2 + 0.25, PALETTE.asphalt, 'road', 'top');
      surface.rotation = rot;
      // Pavement bands follow the centreline exactly: one quad per segment between
      // the carriageway edge and the edge 4.5 m out, using the shared point normals,
      // so consecutive quads meet edge to edge on curves. At the junctions they
      // start on the wedge's end edge (`dir`) so the three pieces tile exactly.
      for (const side of [-1, 1] as const) {
        const startClip = joins.start[side > 0 ? 1 : 0], endClip = joins.end[side > 0 ? 1 : 0];
        let ta = startAlong, tb = along, dirA: Pt | null = null, dirB: Pt | null = null;
        if (startClip && startClip.t > ta) { if (startClip.t >= tb) continue; ta = startClip.t; dirA = startClip.dir; }
        if (endClip && endClip.t < tb) { if (endClip.t <= ta) continue; tb = endClip.t; dirB = endClip.dir; }
        const pa = this.sampleRoad(road, ta), pb = this.sampleRoad(road, tb);
        const ea = { x: pa.x + pa.nx * side * hw, z: pa.z + pa.nz * side * hw }, eb = { x: pb.x + pb.nx * side * hw, z: pb.z + pb.nz * side * hw };
        const oa = dirA ?? { x: pa.nx * side, z: pa.nz * side }, ob = dirB ?? { x: pb.nx * side, z: pb.nz * side };
        const quad = [ea, eb, { x: eb.x + ob.x * PAVEMENT, z: eb.z + ob.z * PAVEMENT }, { x: ea.x + oa.x * PAVEMENT, z: ea.z + oa.z * PAVEMENT }];
        if (paving === PALETTE.grass) {
          architecture.prism(quad, 0, 0.13, c.soil);
          architecture.prism(quad, 0.13, 0.14, PALETTE.grass, 'decor');
        } else architecture.prism(quad, 0, 0.14, paving);
      }
      if (!nearJunction(mx, mz, ROAD_HALF + 12)) {
        // the street trees and the lamp posts are props on the kerb line (M8, `props`)
        for (const lot of lots.get(i) ?? []) this.frontageBuilding(road, lot, architecture);
        while (road.kind === 'service' && nextYard < along) {
          if (nextYard >= startAlong) {
            const t = (nextYard - startAlong) / len, k = Math.round(nextYard / 30), side = k % 2 ? -1 : 1;
            const ox = nx * side, oz = nz * side, ax = a.x + dx * t, az = a.z + dz * t;
            const place = (offset: number) => ({ x: ax + ox * offset, z: az + oz * offset });
            const clear = (pt: { x: number; z: number }, r: number) => footprintClear(pt.x, pt.z, yaw, r, r);
            const kind = k % 5;
            if (kind === 0 || kind === 3) {
              // Container rows parallel to the road, two colours, a second tier on the inner one.
              const row = place(hw + 13);
              if (clear(row, 8)) {
                architecture.container(row.x, row.z, yaw + Math.PI / 2, PALETTE.carOrange);
                const back = place(hw + 16.2);
                if (clear(back, 8)) { architecture.container(back.x, back.z, yaw + Math.PI / 2, PALETTE.carBlue); architecture.container(back.x, back.z, yaw + Math.PI / 2, CITY_COLORS.brick, 1); }
              }
            } else if (kind === 1) {
              const pt = place(hw + 15);
              if (clear(pt, 7)) { architecture.tank(pt.x, pt.z, 4.2, 7.5, CITY_COLORS.stone, road.kind === 'service' ? 0x5daeb5 : PALETTE.laneMark); }
            } else if (kind === 2) {
              const pt = place(hw + 20);
              if (clear(pt, 13)) architecture.gantry(pt.x, pt.z, yaw + Math.PI / 2, 22, 0x5daeb5);
            } else {
              const pt = place(hw + 12);
              if (clear(pt, 3)) architecture.mast(pt.x, pt.z);
            }
            // Fence between the pavement and the yard on this side.
            const f = place(hw + 5.6);
            if (footprintClear(f.x, f.z, yaw, 13, 0.5)) architecture.fence(f.x, f.z, yaw + Math.PI / 2, 26);
          }
          nextYard += 30;
        }
      }
    }
  }

  /**
   * An authored road's frontage lots (M7 slice 11), computed once, in the order the chunks emit them: every
   * `pitch` m on both sides from 40 m, off the segments near a junction, where the footprint clears the grid's
   * pavements (the chunk that emits the segment decides, as it always did). Then the first and last lot of each
   * side turn a face toward their junction, and the lot nearest the middle is the road's landmark.
   */
  frontage(road: SpecialRoad): readonly FrontageLot[] {
    const cached = this.lots.get(road.name);
    if (cached) return cached;
    const lots: FrontageLot[] = [];
    const f = frontageOf(road);
    if (f) {
      const hw = road.halfWidth;
      const a0 = road.centre[0] as RoadPoint, a1 = road.centre[road.centre.length - 1] as RoadPoint;
      const nearJunction = (px: number, pz: number, margin: number) =>
        Math.max(Math.abs(px - a0.x), Math.abs(pz - a0.z)) < margin || Math.max(Math.abs(px - a1.x), Math.abs(pz - a1.z)) < margin;
      const pitch = 2 * f.hx + f.gap;
      const fronts = [{ side: 1, next: 40 }, { side: -1, next: 40 + pitch / 2 }];
      let along = 0;
      for (let i = 0; i + 1 < road.centre.length; i++) {
        const a = road.centre[i] as RoadPoint, b = road.centre[i + 1] as RoadPoint;
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const nx = -dz / len, nz = dx / len;
        const startAlong = along;
        along += len;
        // the chunk holding the segment's midpoint emits it (one on a chunk border belongs to none)
        const cx = Math.round(mx / BLOCK), cz = Math.round(mz / BLOCK);
        if (Math.abs(mx - cx * BLOCK) >= BLOCK / 2 || Math.abs(mz - cz * BLOCK) >= BLOCK / 2) continue;
        if (nearJunction(mx, mz, ROAD_HALF + 12)) continue;
        for (const front of fronts) while (front.next < along) {
          if (front.next >= startAlong) {
            const ts = (front.next - startAlong) / len, index = Math.round(front.next / pitch), side = front.side;
            const ox = nx * side, oz = nz * side;
            const yaw = Math.atan2(ox, oz), variant = (index * 7 + (side > 0 ? 0 : 1)) % 3;
            const depth = f.hz + (variant === 1 ? 1 : 0), width = f.hx + (variant === 2 ? 1 : 0) + ((index * 3 + (side > 0 ? 1 : 0)) % 3) - 1;
            const centre = hw + 4.5 + f.setback + depth;
            const px = a.x + dx * ts + ox * centre, pz = a.z + dz * ts + oz * centre;
            // Corners fill up to the grid pavement; the footprint check is the real limit.
            if (!nearJunction(px, pz, ROAD_HALF + 8 + width) && lotClear(cx, cz, px, pz, yaw, width + 1.5, depth + 1.5)) {
              // Crown's avenue climbs toward the tower junction; the quay alternates heights.
              const floors = road.kind === 'avenue' ? 4 + Math.round(6 * Math.max(0, 1 - Math.hypot(px + 450, pz + 450) / 330))
                : road.kind === 'quay' ? ([3, 4, 6, 4, 5][index % 5] as number) : f.floors + (variant === 1 ? 1 : 0);
              const path = hw + 4.5 + f.setback / 2;
              lots.push({ segment: i, along: front.next, side, px, pz, yaw, width, depth, floors, variant,
                pathX: a.x + dx * ts + ox * path, pathZ: a.z + dz * ts + oz * path, turn: 0, landmark: false });
            }
          }
          front.next += pitch;
        }
      }
      // local +X is the road's direction on its right-hand side (side 1) and against it on the left
      for (const side of [1, -1]) {
        const row = lots.filter((l) => l.side === side);
        const first = row[0], last = row[row.length - 1];
        if (first) first.turn = first === last && first.along > along / 2 ? side : -side;
        if (last && last !== first) last.turn = side;
      }
      let middle: FrontageLot | null = null;
      for (const lot of lots) if (lot.turn === 0 && (!middle || Math.abs(lot.along - along / 2) < Math.abs(middle.along - along / 2))) middle = lot;
      if (middle && AVENUE_LANDMARKS[road.name]) middle.landmark = true;
    }
    this.lots.set(road.name, lots);
    return lots;
  }

  private frontageBySegment(road: SpecialRoad): Map<number, FrontageLot[]> {
    let map = this.lotsBySegment.get(road.name);
    if (!map) {
      map = new Map();
      for (const lot of this.frontage(road)) {
        const list = map.get(lot.segment) ?? [];
        list.push(lot);
        map.set(lot.segment, list);
      }
      this.lotsBySegment.set(road.name, map);
    }
    return map;
  }

  /** One frontage lot's building (the road's landmark, a corner shop or the row's own) and its entrance path. */
  private frontageBuilding(road: SpecialRoad, lot: FrontageLot, architecture: Architecture): void {
    const f = frontageOf(road);
    if (!f) return;
    const landmark = lot.landmark ? AVENUE_LANDMARKS[road.name] : undefined;
    if (landmark) architecture.rotatedLandmark(lot.px, lot.pz, lot.yaw, lot.width, lot.depth, landmark, f.accent);
    else if (lot.turn !== 0) architecture.rotatedCornerShop(lot.px, lot.pz, lot.yaw, lot.width, lot.depth, f.district, lot.floors, lot.variant, f.accent, lot.turn);
    else architecture.rotatedBuilding(lot.px, lot.pz, lot.yaw, lot.width, lot.depth, f.district, lot.floors, lot.variant, f.accent);
    // Entrance path from the door to the road's pavement.
    const path = architecture.box(lot.pathX, 0.17, lot.pathZ, 1.5, 0.01, f.setback / 2, PALETTE.kerb, 'decor', 'top');
    path.rotation = quatFromYaw(lot.yaw);
  }

  /** Cumulative lengths and averaged right normals of an authored road's centreline. */
  private frame(road: SpecialRoad): { cum: number[]; nx: number[]; nz: number[]; total: number } {
    const cached = this.frames.get(road.name);
    if (cached) return cached;
    const pts = road.centre, n = pts.length, cum = [0], nx: number[] = [], nz: number[] = [];
    for (let i = 0; i + 1 < n; i++) {
      const a = pts[i] as RoadPoint, b = pts[i + 1] as RoadPoint;
      cum.push((cum[i] as number) + Math.hypot(b.x - a.x, b.z - a.z));
    }
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)] as RoadPoint, b = pts[Math.min(n - 1, i + 1)] as RoadPoint;
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      nx.push(-tz / l); nz.push(tx / l);
    }
    const frame = { cum, nx, nz, total: cum[n - 1] as number };
    this.frames.set(road.name, frame);
    return frame;
  }

  /** Centreline point and unit right normal at `t` metres from the road's first junction. */
  private sampleRoad(road: SpecialRoad, t: number): { x: number; z: number; nx: number; nz: number } {
    const f = this.frame(road), pts = road.centre;
    const tt = Math.max(0, Math.min(f.total, t));
    let i = 0;
    while (i + 2 < pts.length && (f.cum[i + 1] as number) < tt) i++;
    const seg = (f.cum[i + 1] as number) - (f.cum[i] as number) || 1, u = (tt - (f.cum[i] as number)) / seg;
    const a = pts[i] as RoadPoint, b = pts[i + 1] as RoadPoint;
    const nx = (f.nx[i] as number) + ((f.nx[i + 1] as number) - (f.nx[i] as number)) * u;
    const nz = (f.nz[i] as number) + ((f.nz[i + 1] as number) - (f.nz[i] as number)) * u;
    const l = Math.hypot(nx, nz) || 1;
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, nx: nx / l, nz: nz / l };
  }

  /**
   * How an authored road's pavements meet the grid at both of its junctions.
   * For each side of the road, its carriageway edge E(u) is followed out of the
   * junction cross (u = metres from the node). The grid strip it leaves through is
   * the one it joins. If the side faces that street, the pavement between the two
   * carriageways is a wedge from the point where they separate until it is 9 m
   * wide; there the road's own band and the grid strip take over, both starting on
   * the wedge's end edge. If the side faces away, the road is crossing the strip
   * and the uncovered remainder is a sliver. Nothing overlaps and nothing is missing.
   */
  private joinsFor(road: SpecialRoad): RoadJoins {
    const cached = this.joins.get(road.name);
    if (cached) return cached;
    const f = this.frame(road), hw = road.halfWidth;
    const joins: RoadJoins = { prisms: [], cuts: [], start: [null, null], end: [null, null] };
    for (const end of ['a0', 'a1'] as const) {
      const node = end === 'a0' ? (road.centre[0] as RoadPoint) : (road.centre[road.centre.length - 1] as RoadPoint);
      const gx = Math.round(node.x / BLOCK), gz = Math.round(node.z / BLOCK);
      const vx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      const T = (u: number) => end === 'a0' ? u : f.total - u;
      for (const side of [-1, 1] as const) {
        const edge = (u: number): Pt & { nx: number; nz: number } => {
          const s = this.sampleRoad(road, T(u));
          // `side` is the road's own convention (its right normal along increasing t).
          return { x: s.x + s.nx * side * hw, z: s.z + s.nz * side * hw, nx: s.nx * side, nz: s.nz * side };
        };
        // Leave the junction cross.
        let uExit = -1;
        for (let u = 0; u <= Math.min(140, f.total / 2); u += 0.5) {
          const e = edge(u);
          if (Math.abs(e.x - node.x) > vx && Math.abs(e.z - node.z) > vz) { uExit = u; break; }
        }
        if (uExit < 0) continue;
        const ex = edge(uExit);
        const sx = Math.sign(ex.x - node.x), sz = Math.sign(ex.z - node.z);
        const excessX = Math.abs(ex.x - node.x) - vx, excessZ = Math.abs(ex.z - node.z) - vz;
        // Crossed the x = node.x ± vx line last: joins the strip with a fixed x offset (loop axis 'x').
        const axis: 'x' | 'z' = excessX <= excessZ ? 'x' : 'z';
        const kerbLine = axis === 'x' ? node.x + sx * vx : node.z + sz * vz;
        const outerLine = axis === 'x' ? node.x + sx * (vx + PAVEMENT) : node.z + sz * (vz + PAVEMENT);
        const stripLine = axis === 'x' ? node.x + sx * (vx + PAVEMENT / 2) : node.z + sz * (vz + PAVEMENT / 2);
        const off = (e: Pt) => axis === 'x' ? Math.abs(e.x - node.x) : Math.abs(e.z - node.z);
        const free = (e: Pt) => axis === 'x' ? e.z : e.x;
        const half = axis === 'x' ? vx : vz;
        // Does this side face the street it joins?
        const towardStreet = axis === 'x' ? -sx * ex.nx : -sz * ex.nz;
        const faces = towardStreet > 0;
        const target = faces ? half + 2 * PAVEMENT : half + PAVEMENT;
        let uEnd = -1;
        for (let u = uExit; u <= Math.min(160, f.total / 2); u += 0.5) if (off(edge(u)) >= target) { uEnd = u; break; }
        if (uEnd < 0) continue;
        // Sample the wedge at the road's own points so its edge matches the band.
        const us: number[] = [uExit + (faces ? 2.5 : 0)];
        for (const cum of f.cum) { const u = end === 'a0' ? cum : f.total - cum; if (u > (us[0] as number) + 0.5 && u < uEnd - 0.5) us.push(u); }
        us.sort((a, b) => a - b); us.push(uEnd);
        const foot = (e: Pt, line: number): Pt => axis === 'x' ? { x: line, z: e.z } : { x: e.x, z: line };
        for (let i = 0; i + 1 < us.length; i++) {
          const ea = edge(us[i] as number), eb = edge(us[i + 1] as number);
          const line = faces ? kerbLine : outerLine;
          const raw = [ea, eb, foot(eb, line), foot(ea, line)].map((pt) => ({ x: pt.x, z: pt.z }));
          const points = raw.filter((pt, i) => { const prev = raw[(i + raw.length - 1) % raw.length] as Pt; return Math.hypot(pt.x - prev.x, pt.z - prev.z) > 0.05; });
          if (points.length < 3) continue;
          joins.prisms.push({ points, colour: PALETTE.kerb });
        }
        const eEnd = edge(uEnd), eStart = edge(uExit);
        // The strip is absent from before the carriageways separate until the wedge ends.
        const fromFree = free(eStart), toFree = free(eEnd);
        joins.cuts.push({ axis, line: stripLine, from: Math.min(fromFree, toFree) - 3, to: Math.max(fromFree, toFree) });
        // The band starts on the wedge's end edge: for a facing side that edge runs from E
        // to the kerb line, perpendicular to the street; otherwise the band starts square.
        let dir: Pt | null = null;
        if (faces) {
          const q = foot(eEnd, kerbLine), l = Math.hypot(q.x - eEnd.x, q.z - eEnd.z) || 1;
          dir = { x: (q.x - eEnd.x) / l, z: (q.z - eEnd.z) / l };
        }
        const clip: ClipEdge = { t: T(uEnd), dir };
        const index = side > 0 ? 1 : 0;
        if (end === 'a0') joins.start[index] = clip; else joins.end[index] = clip;
      }
    }
    this.joins.set(road.name, joins);
    return joins;
  }

  /**
   * Keep the 3×3 neighbourhood resident. A normal step loads at most one missing
   * chunk (nearest first), so crossing into a new row costs three steps instead of
   * one long one; a spawn or teleport loads all of them before the next step.
   * Removal waits until the neighbourhood is complete: load before removal.
   */
  sync(x: number, z: number, immediate = false): void {
    const cx = chunkCoord(x), cz = chunkCoord(z);
    if (cx === this.cx && cz === this.cz && this.complete) return;
    this.cx = cx; this.cz = cz;
    let missing = 0;
    for (let pass = 0; pass < (immediate ? 9 : 1); pass++) {
      let best = Infinity, bx = 0, bz = 0;
      missing = 0;
      for (let iz = Math.max(-3, cz - 1); iz <= Math.min(3, cz + 1); iz++) {
        for (let ix = Math.max(-3, cx - 1); ix <= Math.min(3, cx + 1); ix++) {
          if (this.active.has(`${ix},${iz}`)) continue;
          missing++;
          const d = (ix - cx) ** 2 + (iz - cz) ** 2;
          if (d < best) { best = d; bx = ix; bz = iz; }
        }
      }
      if (!missing) break;
      this.load(bx, bz); missing--;
    }
    this.complete = missing === 0;
    if (!this.complete) return;
    for (const [key, entry] of this.active) {
      if (Math.abs(entry.chunk.x - cx) > 2 || Math.abs(entry.chunk.z - cz) > 2) {
        this.onUnload?.(entry.chunk.x, entry.chunk.z);
        this.world.removeRigidBody(entry.body); this.active.delete(key); this.unloaded++;
      }
    }
  }

  private load(ix: number, iz: number): void {
    const chunk = this.chunk(ix, iz);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const st of chunk.statics) {
      // a thick tree's trunk (M8 D8): a wall, in the props' group (no ray of sight or of the wheels meets it)
      if (st.tag === 'trunk' && st.shape.kind === 'cylinder') {
        this.world.createCollider(RAPIER.ColliderDesc.cylinder(st.shape.halfHeight, st.shape.radius)
          .setTranslation(st.position.x, st.position.y, st.position.z).setFriction(1).setRestitution(1).setCollisionGroups(GROUPS_PROP), body);
        continue;
      }
      if (st.tag !== 'building' && st.tag !== 'kerb') continue;
      if (st.shape.kind === 'prism') {
        const pts = st.shape.points, y0 = st.shape.y0, y1 = st.shape.y1, hull = new Float32Array(pts.length * 6);
        pts.forEach((pt, i) => { hull.set([pt.x, y0, pt.z], i * 3); hull.set([pt.x, y1, pt.z], (pts.length + i) * 3); });
        const desc = RAPIER.ColliderDesc.convexHull(hull);
        if (desc) this.world.createCollider(desc.setFriction(1).setRestitution(st.tag === 'building' ? 1 : 0)
          .setCollisionGroups(st.tag === 'building' ? GROUPS_SOLID : GROUPS_TERRAIN), body);
        continue;
      }
      if (st.shape.kind !== 'box') continue;
      const p = st.position, s = st.shape;
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz)
        .setTranslation(p.x, p.y, p.z).setRotation(st.rotation).setFriction(1).setRestitution(st.tag === 'building' ? 1 : 0)
        .setCollisionGroups(st.tag === 'building' ? GROUPS_SOLID : GROUPS_TERRAIN), body);
    }
    this.active.set(`${ix},${iz}`, { body, chunk }); this.loaded++;
    this.onLoad?.(ix, iz, body);
  }

  /** Project onto the closest driveable lane instead of resetting to a distant junction. */
  nearestRoad(x: number, z: number, out: SpawnPoint, y = 0.5): SpawnPoint {
    let best = Infinity;
    const hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < this.graph.lanes.length; i++) {
      const b = this.laneBounds[i] as { minX: number; maxX: number; minZ: number; maxZ: number };
      const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx * dx + dz * dz >= best) continue;
      // the height gap counts: under a bridge the street is nearer than the deck over it
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, hit, y - 0.5);
      if (dist < best) { best = dist; out.position.x = hit.x; out.position.z = hit.z; out.position.y = 1 + (hit.y ?? 0); out.yaw = hit.yaw; }
    }
    return out;
  }

  /** The lane whose polyline is closest to a point, through the lane bounds; -1 with no lanes. */
  /**
   * The lane nearest a point; with the road height under it given (M5.5 gate), a lane over or under counts its
   * height gap, so a car on the street under an overpass is not on the highway above it.
   */
  nearestLane(x: number, z: number, y?: number): number {
    let best = Infinity;
    let found = -1;
    const hit = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < this.graph.lanes.length; i++) {
      const b = this.laneBounds[i] as { minX: number; maxX: number; minZ: number; maxZ: number };
      const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx * dx + dz * dz >= best) continue;
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, hit, y);
      if (dist < best) { best = dist; found = i; }
    }
    return found;
  }

  /** Cached generation: the last 16 chunks asked for, resident physics chunks first. */
  chunk(cx: number, cz: number): CityChunk {
    const key = `${cx},${cz}`;
    const resident = this.active.get(key)?.chunk;
    if (resident) return resident;
    const cached = this.chunkCache.get(key);
    if (cached) { this.chunkCache.delete(key); this.chunkCache.set(key, cached); return cached; }
    const chunk = this.generate(cx, cz);
    this.chunkCache.set(key, chunk);
    if (this.chunkCache.size > 16) this.chunkCache.delete(this.chunkCache.keys().next().value as string);
    return chunk;
  }

  /**
   * What the street furniture keeps out of that only the world knows (M8, D7): the job rings (a duel's round its
   * bay), the stash's cars, the breakers' towers, the donut shop; and the cold open's route, computed the first
   * time a chunk asks. Set by the world before any prop is asked for.
   */
  setPropKeepOut(rings: ReadonlyArray<PropRing>, route: () => ReadonlyArray<{ x: number; z: number }>): void {
    this.propKeepOut = { rings, route };
    this.propRoute = null;
    this.propLists.clear();
  }

  /** A chunk's street furniture (M8): placed the first time it is asked for, the same list every time after. */
  props(cx: number, cz: number): readonly PropDesc[] {
    const key = `${cx},${cz}`;
    let list = this.propLists.get(key);
    if (!list) {
      list = chunkProps(cx, cz, this.propContext(cx, cz));
      this.propLists.set(key, list);
    }
    return list;
  }

  /**
   * A chunk's footway runs, its places and the rule of where nothing may stand (M8, D7). The grid footways run from
   * each quarter's kerb corner along its two streets (never beside the highway, never outside its ring) on the
   * street's own rhythm (the world coordinate along it); an authored road's run from each of its segments this
   * chunk draws, both sides, between the junctions' wedges, on the road's rhythm (metres from its first junction).
   */
  private propContext(cx: number, cz: number): PropContext {
    const keep = this.propKeepOut;
    if (!keep) throw new Error('City.props: setPropKeepOut first (the rings and the cold open\'s route)');
    const x = cx * BLOCK, z = cz * BLOCK;
    const ring = 3 * BLOCK;
    const chunk = this.chunk(cx, cz);
    const { corridors, roadClearance } = this.corridorsNear(x, z);
    const plans = this.plan(cx, cz, corridors, roadClearance);
    const vx = Math.abs(cx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const runs: FootwayRun[] = [];
    const places: PropPlace[] = [];
    for (const q of plans) {
      const { sx, sz } = q;
      for (const lot of q.lots) if (lot.kind === 'park') places.push({ kind: 'park', x: lot.px, z: lot.pz, dx: 0, dz: 1, half: 18, nx: 1, nz: 0 });
      if (Math.abs(q.qx) >= ring || Math.abs(q.qz) >= ring) continue;
      // a building's entrance path meets the footway in front of its lot
      const alongZ: Array<{ x: number; z: number }> = [], alongX: Array<{ x: number; z: number }> = [];
      for (const lot of q.lots) {
        if (lot.kind !== 'building') continue;
        if (lot.ox === 40) alongZ.push({ x: x + sx * (vx + 4.5), z: lot.pz });
        if (lot.oz === 40) alongX.push({ x: lot.px, z: z + sz * (vz + 4.5) });
      }
      // toward a neighbour the run stops short of the edge (its billboard's line may come that far)
      const endZ = BLOCK / 2 - (sz < 0 ? PROP_KEEP.edge : 0), endX = BLOCK / 2 - (sx < 0 ? PROP_KEEP.edge : 0);
      if (Math.abs(cx) !== 3) {
        const z0 = z + sz * vz;
        runs.push({ x: x + sx * vx, z: z0, dx: 0, dz: sz, nx: sx, nz: 0, length: endZ - vz, along: sz * z0, district: q.d.id, street: 'grid', entrances: alongZ });
      }
      if (Math.abs(cz) !== 3) {
        const x0 = x + sx * vx;
        runs.push({ x: x0, z: z + sz * vz, dx: sx, dz: 0, nx: 0, nz: sz, length: endX - vx, along: sx * x0, district: q.d.id, street: 'grid', entrances: alongX });
      }
    }
    for (const road of corridors) {
      const f = this.frame(road), joins = this.joinsFor(road), hw = road.halfWidth;
      const a0 = road.centre[0] as RoadPoint, a1 = road.centre[road.centre.length - 1] as RoadPoint;
      const lots = this.frontageBySegment(road);
      for (let i = 0; i + 1 < road.centre.length; i++) {
        const a = road.centre[i] as RoadPoint, b = road.centre[i + 1] as RoadPoint;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        if (Math.abs(mx - x) >= BLOCK / 2 || Math.abs(mz - z) >= BLOCK / 2) continue;
        const nearEnd = Math.max(Math.abs(mx - a0.x), Math.abs(mz - a0.z)) < ROAD_HALF + 12 || Math.max(Math.abs(mx - a1.x), Math.abs(mz - a1.z)) < ROAD_HALF + 12;
        if (nearEnd) continue;
        const len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
        const entrances = (lots.get(i) ?? []).map((lot) => ({ x: lot.pathX, z: lot.pathZ }));
        // a café terrace in front of each of an avenue's corner shops (Crown Heights, M8 slice 3)
        if (road.kind === 'avenue') for (const lot of lots.get(i) ?? []) {
          if (lot.turn === 0) continue;
          const at = this.sampleRoad(road, lot.along), nx = at.nx * lot.side, nz = at.nz * lot.side;
          const ddx = -nz * lot.side, ddz = nx * lot.side;
          places.push({ kind: 'terrace', x: at.x + nx * hw, z: at.z + nz * hw, dx: ddx, dz: ddz, half: lot.width, nx, nz });
        }
        for (const side of [-1, 1] as const) {
          const startClip = joins.start[side > 0 ? 1 : 0], endClip = joins.end[side > 0 ? 1 : 0];
          const t0 = Math.max(f.cum[i] as number, startClip ? startClip.t : 0), t1 = Math.min(f.cum[i + 1] as number, endClip ? endClip.t : f.total);
          if (t1 <= t0) continue;
          // the right normal (-dz, dx) on side 1
          const nx = -dz * side, nz = dx * side, u = t0 - (f.cum[i] as number);
          runs.push({ x: a.x + dx * u + nx * hw, z: a.z + dz * u + nz * hw, dx, dz, nx, nz, length: t1 - t0, along: t0, district: districtAt(mx, mz).id, street: road.kind, entrances });
        }
      }
    }
    // the promenade along the Quay's seawall (its benches); `promenade` builds it along local X, the sea at local +Z
    if ((cx === 3 && cz >= 1) || (cz === 3 && cx >= 1)) {
      places.push(cx === 3 ? { kind: 'promenade', x: CITY_HALF, z, dx: 0, dz: -1, half: BLOCK / 2, nx: 1, nz: 0 }
        : { kind: 'promenade', x, z: CITY_HALF, dx: 1, dz: 0, half: BLOCK / 2, nx: 0, nz: 1 });
    }
    return { seed: this.seed, runs, places, blocked: this.propRule(cx, cz, chunk, corridors, keep.rings) };
  }

  /** The rule of where nothing may stand for a chunk's props (M8, D7): see `PropContext.blocked`. */
  private propRule(cx: number, cz: number, chunk: CityChunk, corridors: readonly SpecialRoad[], rings: ReadonlyArray<PropRing>): PropContext['blocked'] {
    const x0 = cx * BLOCK, z0 = cz * BLOCK, reach = BLOCK / 2 + 30;
    const ring = 3 * BLOCK;
    const band = PROP_LINES.walkers, lo = band.middle - band.half, hi = band.middle + band.half;
    // what stands above the kerb: the chunk's tall statics as rectangles turned by their yaw (the rest by their bounds)
    const tall: Array<{ x: number; z: number; cos: number; sin: number; hx: number; hz: number }> = [];
    for (const st of chunk.statics) {
      const f = tallFootprint(st, CAR_TOP);
      if (!f) continue;
      const s = st.shape, q = st.rotation;
      if ((s.kind === 'box' || s.kind === 'gable') && q.x === 0 && q.z === 0) {
        const yaw = 2 * Math.atan2(q.y, q.w);
        tall.push({ x: st.position.x, z: st.position.z, cos: Math.cos(yaw), sin: Math.sin(yaw), hx: s.hx, hz: s.hz });
      } else tall.push({ x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, cos: 1, sin: 0, hx: (f.maxX - f.minX) / 2, hz: (f.maxZ - f.minZ) / 2 });
    }
    const near = (px: number, pz: number): boolean => Math.abs(px - x0) < reach && Math.abs(pz - z0) < reach;
    const circles = rings.filter((r) => near(r.x, r.z));
    for (const site of DROP_OFF_LOTS.map((lot) => dropOffFor(lot))) {
      const s = hideoutSign(site);
      if (near(s.poleX, s.poleZ)) circles.push({ x: s.poleX, z: s.poleZ, r: PROP_KEEP.pole });
    }
    for (const node of signalledNodes(this.graph)) {
      const n = this.graph.nodes[node];
      if (n && near(n.x, n.z)) for (const p of signalPoles(n.x, n.z)) circles.push({ x: p.x, z: p.z, r: PROP_KEEP.pole });
    }
    const doors = DROP_OFF_LOTS.map((lot) => dropOffFor(lot)).filter((d) => near(d.door.x, d.door.z));
    const boards = chunk.billboards.map((b) => ({ box: runOutFootprint(b), line: gateLine(this.graph, b) ?? [] }));
    const jumps = this.jumps.filter((j) => near(j.x, j.z));
    // the cold open's route near the chunk (its segments, x0 z0 x1 z1), computed once for the city
    const whole = (this.propRoute ??= this.propKeepOut?.route() ?? []);
    const route: number[] = [];
    for (let i = 0; i + 1 < whole.length; i++) {
      const p = whole[i] as { x: number; z: number }, q = whole[i + 1] as { x: number; z: number };
      if (near(p.x, p.z) || near(q.x, q.z)) route.push(p.x, p.z, q.x, q.z);
    }
    const ends = corridors.flatMap((road) => [road.centre[0] as RoadPoint, road.centre[road.centre.length - 1] as RoadPoint]);
    const frame = { along: 0, across: 0 };
    return (x, z, yaw, hx, hz) => {
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      // local +X is (cos, -sin), local +Z is (sin, cos): the footprint's world half extents
      const ex = Math.abs(cos) * hx + Math.abs(sin) * hz, ez = Math.abs(sin) * hx + Math.abs(cos) * hz, br = Math.hypot(hx, hz);
      // the grid streets: their carriageways and the walkers' bands (the highway's only on its island side)
      const gx = Math.round(x / BLOCK), gz = Math.round(z / BLOCK);
      const halfX = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, halfZ = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      const dX = Math.abs(x - gx * BLOCK), dZ = Math.abs(z - gz * BLOCK);
      const streetX = Math.abs(z) <= ring + HIGHWAY_HALF + 4.5 || gx === 0, streetZ = Math.abs(x) <= ring + HIGHWAY_HALF + 4.5 || gz === 0;
      if (streetX) {
        if (dX - ex < halfX) return true;
        const walkers = Math.abs(gx) !== 3 || Math.abs(x) < ring;
        if (walkers && dX - ex < halfX + hi && dX + ex > halfX + lo) return true;
      }
      if (streetZ) {
        if (dZ - ez < halfZ) return true;
        const walkers = Math.abs(gz) !== 3 || Math.abs(z) < ring;
        if (walkers && dZ - ez < halfZ + hi && dZ + ez > halfZ + lo) return true;
      }
      // the authored roads: their carriageways and walkers' bands, the footprint's extent along the road's normal
      for (const road of corridors) {
        let best = Infinity, nx = 0, nz = 0;
        for (let i = 0; i + 1 < road.centre.length; i++) {
          const a = road.centre[i] as RoadPoint, b = road.centre[i + 1] as RoadPoint;
          const ddx = b.x - a.x, ddz = b.z - a.z;
          const t = Math.max(0, Math.min(1, ((x - a.x) * ddx + (z - a.z) * ddz) / (ddx * ddx + ddz * ddz || 1)));
          const px = x - a.x - ddx * t, pz = z - a.z - ddz * t, d = Math.hypot(px, pz);
          if (d < best) { best = d; nx = d > 1e-9 ? px / d : 0; nz = d > 1e-9 ? pz / d : 0; }
        }
        const c = best - road.halfWidth;
        if (c > 4.5 + br) continue;
        const e = Math.abs(nx * cos - nz * sin) * hx + Math.abs(nx * sin + nz * cos) * hz;
        if (c - e < 0) return true;
        if (c - e < hi && c + e > lo) return true;
      }
      // a junction's corners, and 12 m round an authored road's junction
      for (let nzi = Math.max(-3, gz - 1); nzi <= Math.min(3, gz + 1); nzi++) for (let nxi = Math.max(-3, gx - 1); nxi <= Math.min(3, gx + 1); nxi++) {
        const vx = Math.abs(nxi) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(nzi) === 3 ? HIGHWAY_HALF : ROAD_HALF;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          if (Math.hypot(x - (nxi * BLOCK + sx * vx), z - (nzi * BLOCK + sz * vz)) < PROP_LINES.corner + br) return true;
        }
      }
      for (const n of ends) if (Math.max(Math.abs(x - n.x), Math.abs(z - n.z)) < ROAD_HALF + PROP_LINES.corner + br) return true;
      // the world's circles: rings, parked cars, towers, poles
      for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + br) return true;
      // a door's approach: from the road edge to its opening, the door's width and room either side
      for (const site of doors) {
        toDropOff(site, x, z, frame);
        const front = -GARAGE.depth / 2;
        if (frame.along > front - site.lot.setback - 4.5 - PROP_KEEP.doorOut - br && frame.along < front + PROP_KEEP.doorOut + br
          && Math.abs(frame.across) < GARAGE.doorWidth / 2 + PROP_KEEP.door + br) return true;
      }
      // a billboard's run-out and its line of coins in from the lane; on the highway's outer verge any stretch may
      // hold a panel of the chunk next door, so its run-out's strip along the whole verge
      const verge = VERGE + RUN_OUT_REACH;
      if (Math.abs(Math.abs(x) - VERGE) - ex < RUN_OUT_REACH && Math.abs(z) < verge) return true;
      if (Math.abs(Math.abs(z) - VERGE) - ez < RUN_OUT_REACH && Math.abs(x) < verge) return true;
      for (const b of boards) {
        if (x + ex > b.box.minX && x - ex < b.box.maxX && z + ez > b.box.minZ && z - ez < b.box.maxZ) return true;
        for (let i = 0; i + 1 < b.line.length; i++) {
          const p = b.line[i] as CoinPoint, q = b.line[i + 1] as CoinPoint;
          if (segmentDistance(x, z, p.x, p.z, q.x, q.z) < PROP_KEEP.line + br) return true;
        }
      }
      // a ramp, the way up to it and its run-out
      for (const j of jumps) {
        const fx = Math.sin(j.yaw), fz = Math.cos(j.yaw), dx = x - j.x, dz = z - j.z;
        const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
        if (along > -j.length - PROP_KEEP.rampBefore - br && along < j.length + PROP_KEEP.rampAfter + br && Math.abs(across) < RAMP_HALF_WIDTH + PROP_KEEP.rampSide + br) return true;
      }
      if (underOverpass(x, z, PROP_KEEP.overpass + br) || insideCover(this.covers, x, z, PROP_KEEP.cover + br)) return true;
      // the cold open's route
      for (let i = 0; i + 3 < route.length; i += 4) {
        if (segmentDistance(x, z, route[i] as number, route[i + 1] as number, route[i + 2] as number, route[i + 3] as number) < PROP_KEEP.route + br) return true;
      }
      // anything built that stands above the kerb
      const m = PROP_KEEP.statics;
      for (const t of tall) if (rectsOverlap(x, z, cos, sin, hx + m, hz + m, t.x, t.z, t.cos, t.sin, t.hx, t.hz)) return true;
      return false;
    };
  }
}
