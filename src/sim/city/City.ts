/** Seeded, independently reproducible chunks. Only nearby solid bodies live in Rapier. */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_SOLID, GROUPS_TERRAIN } from '../collision';
import { PALETTE } from '../palette';
import { POLICE } from '../police/tuning';
import { BALANCE } from '../balance';
import type { SpawnPoint } from '../playground';
import { mulberry32 } from '../random';
import { IDENTITY_QUAT as IDENTITY_ROT, quatFromYaw, type StaticDesc } from '../scene';
import { Architecture, CITY_COLORS } from './architecture';
import { placeBillboards, type BillboardDesc } from './collectibles';
import { cameraSites, dropOffAt, hideoutStatics, nearDoor } from './cover';
import { cameraStatics, placeCameras, type CameraDesc } from './cameras';
import { jumpStatics, placeJumps, type JumpDesc } from './jumps';
import { layoutCoins, placeCoins, type CoinDesc, type CoinPoint } from './coins';
import { buildRoadMarkings } from './markings';
import { BLOCK, CITY_HALF, HIGHWAY_HALF, HIGHWAY_LANE_OFFSETS, ROAD_HALF, buildCityRoute, buildRoadGraph, distanceToPolyline, projectOnLane, type Lane, type RoadPoint, type SpecialRoad } from './roads';

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
  readonly spawns: SpawnPoint[];
  readonly active = new Map<string, { body: RAPIER.RigidBody; chunk: CityChunk }>();
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
  constructor(readonly world: RAPIER.World, readonly seed = 42) {
    this.cameras = placeCameras(cameraSites(this.graph), POLICE.cameras.count);
    this.jumps = placeJumps(seed, BALANCE.jumps.count);
    this.coinLayout = layoutCoins(this.jumps);
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
      this.spawns.push({ name, position: { x: x - (name === 'highway' ? HIGHWAY_LANE_OFFSETS[0] : 4.5), y: 1, z: z + 40 }, yaw: 0 });
    }
    // The authored loop starts on the first Crown diagonal, heading for the tower junction.
    const first = this.graph.lanes.find((l) => l.special === 'Crown Diagonal West' && this.graph.nodes[l.from]?.x === -675);
    if (first) this.spawns.push({ name: 'loop', position: { x: first.x0, y: 1, z: first.z0 }, yaw: first.yaw0 });
  }

  generate(cx: number, cz: number): CityChunk {
    const x = cx * BLOCK, z = cz * BLOCK;
    const rnd = mulberry32(this.seed ^ Math.imul(cx + 19, 73856093) ^ Math.imul(cz + 23, 19349663));
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
    statics.push(...(this.roadMarkings.chunks.get(`${cx},${cz}`) ?? []));
    // Authored roads that come near this chunk. Their corridor (half width plus
    // pavement) overrides the grid apron and lots, so nothing is built on them.
    const corridors = this.graph.special.filter((road) => road.centre.some((pt) => Math.abs(pt.x - x) < BLOCK / 2 + road.halfWidth + 8 && Math.abs(pt.z - z) < BLOCK / 2 + road.halfWidth + 8));
    const roadClearance = (px: number, pz: number): number => {
      let best = Infinity;
      for (const road of corridors) best = Math.min(best, distanceToPolyline(road.centre, px, pz) - road.halfWidth);
      return best;
    };
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
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const d = districtAt(x + sx * 55, z + sz * 55);
      const c = CITY_COLORS;
      const hx = (BLOCK / 2 - vx) / 2, hz = (BLOCK / 2 - vz) / 2;
      const qx = x + sx * (vx + hx), qz = z + sz * (vz + hz);
      const open = corridors.some((road) => road.centre.some((pt) => Math.abs(pt.x - qx) < hx + road.halfWidth + 6 && Math.abs(pt.z - qz) < hz + road.halfWidth + 6));
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
        if (park) {
          const px = x + sx * ox, pz = z + sz * oz;
          box(px, 0.16, pz, 18, 0.015, 18, PALETTE.grass, 'decor', 'top');
          box(px, 0.18, pz, 1.6, 0.01, 18, PALETTE.kerb, 'decor', 'top');
          architecture.tree(px - 7, pz, d.id === 'marina');
          architecture.tree(px + 9, pz + 8, d.id === 'marina');
          box(px + 4, 0.65, pz - 5, 1.4, 0.12, 0.4, c.brick);
          box(px + 4, 0.9, pz - 5.35, 1.4, 0.35, 0.08, c.brick);
          continue;
        }
        const variant = Math.floor(rnd() * 3);
        // A drop-off garage stands on this lot instead of its building (the draw above keeps the lot stream).
        const dropOff = dropOffAt(cx, cz, sx, sz, ox, oz);
        if (dropOff) {
          statics.push(...hideoutStatics(dropOff));
          continue;
        }
        const w = d.id === 'gardens' ? 7 + variant : (ox === 85 ? 15 : 10) + variant;
        const depth = d.id === 'gardens' ? 8 + variant : (oz === 85 ? 16 : 10) + variant;
        const setback = d.id === 'gardens' ? 6 : d.id === 'foundry' ? 7 : 1.3;
        const px = x + sx * (ox === 40 ? vx + 4.5 + setback + w : 82);
        const pz = z + sz * (oz === 40 ? vz + 4.5 + setback + depth : 82);
        // Higher offices cluster around Crown Tower; the street still has a human-scale podium.
        const centreDistance = Math.hypot(px + 365, pz + 365);
        const floors = d.id === 'crown' ? (backlot ? 7 + Math.max(0, 5 - Math.floor(centreDistance / 100)) : 3 + variant)
          : d.id === 'foundry' ? 1 : d.id === 'gardens' ? 2 : 3 + variant;
        architecture.building(px, pz, w, depth, d.id, sx, sz, floors, variant, d.accent, ox === 40 || backlot, oz === 40 || backlot);
        // Paths join actual entrances to the public footway; yards are intentionally set back.
        if (ox === 40) box(x + sx * (vx + 4.5 + setback / 2), 0.17, pz, setback / 2, 0.01, 1.5, PALETTE.kerb, 'decor', 'top');
        if (oz === 40) box(px, 0.17, z + sz * (vz + 4.5 + setback / 2), 1.5, 0.01, setback / 2, PALETTE.kerb, 'decor', 'top');
        if (d.id === 'gardens') {
          if (ox === 40) {
            architecture.tree(x + sx * (vx + 7), pz + sz * 5);
            box(x + sx * (vx + 5.5), 0.65, pz - sz * 6, 0.7, 0.5, 4, c.hedge);
          }
        }
      }
      if (d.id !== 'foundry') for (const along of [57, 106]) {
        if (roadClearance(x + sx * (vx + 2.7), z + sz * along) > 3 && !nearDoor(x + sx * (vx + 2.7), z + sz * along, 4)) architecture.tree(x + sx * (vx + 2.7), z + sz * along, d.id === 'marina');
        if (roadClearance(x + sx * along, z + sz * (vz + 2.7)) > 3 && !nearDoor(x + sx * along, z + sz * (vz + 2.7), 4)) architecture.tree(x + sx * along, z + sz * (vz + 2.7), d.id === 'marina');
      }
      // Street lamps and planted verges are outside the driving corridor.
      for (const offset of [36, 80]) {
        if (roadClearance(x + sx * (vx + 2), z + sz * offset) < 1.5 || nearDoor(x + sx * (vx + 2), z + sz * offset, 4)) continue;
        box(x + sx * (vx + 2), 4, z + sz * offset, 0.18, 4, 0.18, 0x686678);
        box(x + sx * (vx + 1), 8, z + sz * offset, 1.4, 0.28, 0.45, PALETTE.laneMark);
      }
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
    // Last: the billboards need every static in place to find clear ground.
    const billboards = placeBillboards(cx, cz, statics, roadClearance);
    const coins = placeCoins(cx, cz, this.coinLayout, billboards, this.graph);
    // speed cameras after the billboards, so the placer's clearance and the coin lines never change for them
    for (const cam of this.cameras) if (chunkCoord(cam.poleX) === cx && chunkCoord(cam.poleZ) === cz) statics.push(...cameraStatics(cam));
    for (const jd of this.jumps) if (chunkCoord(jd.x) === cx && chunkCoord(jd.z) === cz) statics.push(...jumpStatics(jd));
    return { key: `${cx},${cz}`, x: cx, z: cz, statics, billboards, coins };
  }

  /** Coral Quay's seawall edge: paved promenade, railing, palms, benches and masts. */
  private promenade(cx: number, cz: number, architecture: Architecture): void {
    const box = architecture.box.bind(architecture), c = CITY_COLORS;
    const start = architecture.statics.length;
    // Built along local X at the wall (local +Z is the sea); rotated for the east edge.
    const half = BLOCK / 2, wall = CITY_HALF;
    box(0, 0.16, -5, half, 0.02, 4, PALETTE.kerb, 'decor', 'top');
    for (let u = -half + 11; u < half; u += 22) architecture.tree(u, -8.5, true);
    for (let u = -half + 22; u < half; u += 44) { box(u, 0.6, -3.2, 1.2, 0.08, 0.35, c.brick); box(u, 0.85, -3.5, 1.2, 0.3, 0.06, c.brick); }
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
    // An authored road leaving a junction at a shallow angle runs inside the grid
    // street's corridor for tens of metres: its kerbs and furniture must not be
    // laid on that carriageway or its pavement.
    const onGridStreet = (px: number, pz: number): boolean => {
      const gx = Math.round(px / BLOCK), gz = Math.round(pz / BLOCK);
      const halfX = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, halfZ = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      return Math.abs(px - gx * BLOCK) < halfX + 5 || Math.abs(pz - gz * BLOCK) < halfZ + 5;
    };
    const c = CITY_COLORS;
    const paving = road.kind === 'service' ? c.yard : road.kind === 'parkway' ? PALETTE.grass : PALETTE.kerb;
    // Frontage: buildings face the authored road, spaced along it, both sides.
    const frontage = road.kind === 'avenue' ? { district: 'crown', hx: 10, hz: 10, gap: 3, setback: 1.3, floors: 4, accent: 0xf5cd75 }
      : road.kind === 'quay' ? { district: 'marina', hx: 12, hz: 9, gap: 5, setback: 1.3, floors: 4, accent: 0x67c9ce }
      : road.kind === 'parkway' ? { district: 'gardens', hx: 8, hz: 8, gap: 8, setback: 6, floors: 2, accent: 0x8bb583 } : null;
    const vx = Math.abs(cx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const footprintClear = (px: number, pz: number, yaw: number, hx: number, hz: number): boolean => {
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] as const) {
        const wx = px + cos * lx + sin * lz, wz = pz - sin * lx + cos * lz;
        // Inside a block interior: clear of this and the neighbouring grid streets' pavements.
        const dx = Math.abs(wx - x), dz = Math.abs(wz - z);
        if (Math.min(dx, BLOCK - dx) < vx + 5 || Math.min(dz, BLOCK - dz) < vz + 5) return false;
        if (Math.abs(wx) > CITY_HALF - 8 || Math.abs(wz) > CITY_HALF - 8) return false;
      }
      return true;
    };
    const pitch = frontage ? 2 * frontage.hx + frontage.gap : Infinity;
    const fronts = [{ side: 1, next: 40 }, { side: -1, next: 40 + pitch / 2 }];
    let along = 0, nextTree = 13, nextLamp = 30, nextYard = 45;
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
        while (nextTree < along) {
          if (nextTree >= startAlong && road.kind !== 'service') {
            const t = (nextTree - startAlong) / len, side = Math.floor(nextTree / 27) % 2 ? 1 : -1;
            const tx = a.x + dx * t + nx * side * (hw + 2.7), tz = a.z + dz * t + nz * side * (hw + 2.7);
            if (!onGridStreet(tx, tz)) architecture.tree(tx, tz, road.kind === 'quay');
          }
          nextTree += 27;
        }
        for (const front of fronts) while (frontage && front.next < along) {
          if (front.next >= startAlong) {
            const ts = (front.next - startAlong) / len, index = Math.round(front.next / pitch), side = front.side;
            const ox = nx * side, oz = nz * side;
            const yaw = Math.atan2(ox, oz), variant = (index * 7 + (side > 0 ? 0 : 1)) % 3;
            const depth = frontage.hz + (variant === 1 ? 1 : 0), width = frontage.hx + (variant === 2 ? 1 : 0) + ((index * 3 + (side > 0 ? 1 : 0)) % 3) - 1;
            const centre = hw + 4.5 + frontage.setback + depth;
            const px = a.x + dx * ts + ox * centre, pz = a.z + dz * ts + oz * centre;
            // Corners fill up to the grid pavement; the footprint check is the real limit.
            if (!nearJunction(px, pz, ROAD_HALF + 8 + width) && footprintClear(px, pz, yaw, width + 1.5, depth + 1.5)) {
              // Crown's avenue climbs toward the tower junction; the quay alternates heights.
              const floors = road.kind === 'avenue' ? 4 + Math.round(6 * Math.max(0, 1 - Math.hypot(px + 450, pz + 450) / 330))
                : road.kind === 'quay' ? ([3, 4, 6, 4, 5][index % 5] as number) : frontage.floors + (variant === 1 ? 1 : 0);
              architecture.rotatedBuilding(px, pz, yaw, width, depth, frontage.district, floors, variant, frontage.accent);
              // Entrance path from the door to the road's pavement.
              const path = box(a.x + dx * ts + ox * (hw + 4.5 + frontage.setback / 2), 0.17, a.z + dz * ts + oz * (hw + 4.5 + frontage.setback / 2), 1.5, 0.01, frontage.setback / 2, PALETTE.kerb, 'decor', 'top');
              path.rotation = quatFromYaw(yaw);
            }
          }
          front.next += pitch;
        }
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
        while (nextLamp < along) {
          if (nextLamp >= startAlong) {
            const t = (nextLamp - startAlong) / len, side = Math.floor(nextLamp / 45) % 2 ? -1 : 1;
            const px = a.x + dx * t + nx * side * (hw + 2), pz = a.z + dz * t + nz * side * (hw + 2);
            if (onGridStreet(px, pz)) { nextLamp += 45; continue; }
            box(px, 4, pz, 0.18, 4, 0.18, 0x686678);
            const head = box(px - nx * side, 8, pz - nz * side, 0.45, 0.28, 1.4, PALETTE.laneMark);
            head.rotation = rot;
          }
          nextLamp += 45;
        }
      }
    }
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
        this.world.removeRigidBody(entry.body); this.active.delete(key); this.unloaded++;
      }
    }
  }

  private load(ix: number, iz: number): void {
    const chunk = this.chunk(ix, iz);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const st of chunk.statics) {
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
  }

  /** Project onto the closest driveable lane instead of resetting to a distant junction. */
  nearestRoad(x: number, z: number, out: SpawnPoint): SpawnPoint {
    let best = Infinity;
    const hit = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < this.graph.lanes.length; i++) {
      const b = this.laneBounds[i] as { minX: number; maxX: number; minZ: number; maxZ: number };
      const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx * dx + dz * dz >= best) continue;
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, hit);
      if (dist < best) { best = dist; out.position.x = hit.x; out.position.z = hit.z; out.yaw = hit.yaw; }
    }
    return out;
  }

  /** The lane whose polyline is closest to a point, through the lane bounds; -1 with no lanes. */
  nearestLane(x: number, z: number): number {
    let best = Infinity;
    let found = -1;
    const hit = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < this.graph.lanes.length; i++) {
      const b = this.laneBounds[i] as { minX: number; maxX: number; minZ: number; maxZ: number };
      const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx * dx + dz * dz >= best) continue;
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, hit);
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
}
