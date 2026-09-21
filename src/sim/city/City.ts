/** Seeded, independently reproducible chunks. Only nearby solid bodies live in Rapier. */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_SOLID, GROUPS_TERRAIN } from '../collision';
import { PALETTE } from '../palette';
import type { SpawnPoint } from '../playground';
import { IDENTITY_QUAT as IDENTITY_ROT, quatFromYaw, type StaticDesc } from '../scene';
import { Architecture, CITY_COLORS } from './architecture';
import { BLOCK, CITY_HALF, HIGHWAY_HALF, ROAD_HALF, buildCityRoute, buildRoadGraph, distanceToPolyline, projectOnLane, type RoadPoint, type SpecialRoad } from './roads';

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
export interface CityChunk { key: string; x: number; z: number; statics: StaticDesc[] }

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class City {
  readonly graph = buildRoadGraph();
  readonly route = buildCityRoute(this.graph);
  readonly spawns: SpawnPoint[];
  readonly active = new Map<string, { body: RAPIER.RigidBody; chunk: CityChunk }>();
  loaded = 0;
  unloaded = 0;
  private cx = Infinity;
  private cz = Infinity;
  private complete = false;
  constructor(readonly world: RAPIER.World, readonly seed = 42) {
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
      this.spawns.push({ name, position: { x: x - (name === 'highway' ? 6 : 4.5), y: 1, z: z + 40 }, yaw: 0 });
    }
    // The authored loop starts on the first Crown diagonal, heading for the tower junction.
    const first = this.graph.lanes.find((l) => l.special === 'Crown Diagonal West' && this.graph.nodes[l.from]?.x === -675);
    if (first) this.spawns.push({ name: 'loop', position: { x: first.x0, y: 1, z: first.z0 }, yaw: first.yaw0 });
  }

  generate(cx: number, cz: number): CityChunk {
    const x = cx * BLOCK, z = cz * BLOCK;
    const rnd = random(this.seed ^ Math.imul(cx + 19, 73856093) ^ Math.imul(cz + 23, 19349663));
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
    // Paved parking / service shoulders visually separate the active carriageway.
    // Keep the existing junction envelope for drift, U-turns and the lane graph.
    for (const side of [-1, 1]) for (const along of [-1, 1]) {
      box(x + side * (vx - 2), 0.017, z + along * 68.75, 2, 0.001, 43.75, PALETTE.asphaltLight, 'decor', 'top');
      box(x + along * 68.75, 0.017, z + side * (vz - 2), 43.75, 0.001, 2, PALETTE.asphaltLight, 'decor', 'top');
    }
    for (let d = -100; d <= 100; d += 12) {
      if (Math.abs(d) < 26) continue;
      box(x, 0.022, z + d, 0.12, 0.006, 2.8, PALETTE.laneMark);
      box(x + d, 0.022, z, 2.8, 0.006, 0.12, PALETTE.laneMark);
    }
    // Authored roads that come near this chunk. Their corridor (half width plus
    // pavement) overrides the grid apron and lots, so nothing is built on them.
    const corridors = this.graph.special.filter((road) => road.centre.some((pt) => Math.abs(pt.x - x) < BLOCK / 2 + road.halfWidth + 8 && Math.abs(pt.z - z) < BLOCK / 2 + road.halfWidth + 8));
    const roadClearance = (px: number, pz: number): number => {
      let best = Infinity;
      for (const road of corridors) best = Math.min(best, distanceToPolyline(road.centre, px, pz) - road.halfWidth);
      return best;
    };
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
        // Continuous kerb edge and paving joints provide a metre-scale reference at speed.
        box(x + sx * (vx + 0.12), 0.16, z + sz * (vz + hz), 0.12, 0.02, hz, c.trim);
        box(x + sx * (vx + hx), 0.16, z + sz * (vz + 0.12), hx, 0.02, 0.12, c.trim);
        for (let along = 26; along < 110; along += 6) {
          box(x + sx * (vx + 2.3), 0.16, z + sz * along, 2.2, 0.002, 0.025, c.yard, 'decor', 'top');
          box(x + sx * along, 0.16, z + sz * (vz + 2.3), 0.025, 0.002, 2.2, c.yard, 'decor', 'top');
        }
      } else {
        // Open quarter: the interior sits at road level and the grid pavements are
        // only the 4.5 m strips, cut where the authored road passes through.
        box(qx, 0.008, qz, hx, 0.001, hz, d.id === 'foundry' ? c.yard : d.id === 'gardens' ? PALETTE.grass : c.soil, 'decor', 'top');
        for (const axis of ['x', 'z'] as const) {
          const length = axis === 'x' ? hz * 2 : hx * 2;
          const start = axis === 'x' ? vz : vx;
          let runStart = -1;
          for (let along = 0; along <= length + 1e-6; along += 1.5) {
            const end = along >= length;
            const px = axis === 'x' ? x + sx * (vx + 2.25) : x + sx * (start + along);
            const pz = axis === 'x' ? z + sz * (start + along) : z + sz * (vz + 2.25);
            const blocked = end || roadClearance(px, pz) < 5.5;
            if (!blocked && runStart < 0) runStart = along;
            if (blocked && runStart >= 0) {
              const stop = Math.min(along, length), mid = start + (runStart + stop) / 2, half = (stop - runStart) / 2;
              if (half > 1) {
                if (axis === 'x') {
                  box(x + sx * (vx + 2.25), 0.07, z + sz * mid, 2.25, 0.07, half, PALETTE.kerb, 'kerb');
                  box(x + sx * (vx + 0.12), 0.16, z + sz * mid, 0.12, 0.02, half, c.trim);
                } else {
                  box(x + sx * mid, 0.07, z + sz * (vz + 2.25), half, 0.07, 2.25, PALETTE.kerb, 'kerb');
                  box(x + sx * mid, 0.16, z + sz * (vz + 0.12), half, 0.02, 0.12, c.trim);
                }
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
      // Parking strips explain the generous road width without altering the driving envelope.
      for (const along of [38, 50, 62, 74, 86, 98]) {
        box(x + sx * (vx - 2), 0.026, z + sz * along, 1.65, 0.005, 0.065, PALETTE.laneMark, 'decor', 'top');
        box(x + sx * along, 0.026, z + sz * (vz - 2), 0.065, 0.005, 1.65, PALETTE.laneMark, 'decor', 'top');
      }
      if (d.id !== 'foundry') for (const along of [57, 106]) {
        if (roadClearance(x + sx * (vx + 2.7), z + sz * along) > 3) architecture.tree(x + sx * (vx + 2.7), z + sz * along, d.id === 'marina');
        if (roadClearance(x + sx * along, z + sz * (vz + 2.7)) > 3) architecture.tree(x + sx * along, z + sz * (vz + 2.7), d.id === 'marina');
      }
      // Street lamps and planted verges are outside the driving corridor.
      for (const offset of [36, 80]) {
        if (roadClearance(x + sx * (vx + 2), z + sz * offset) < 1.5) continue;
        box(x + sx * (vx + 2), 4, z + sz * offset, 0.18, 4, 0.18, 0x686678);
        box(x + sx * (vx + 1), 8, z + sz * offset, 1.4, 0.15, 0.45, PALETTE.laneMark);
      }
      // Crosswalks, kept out of the highway.
      if (vx === ROAD_HALF && vz === ROAD_HALF) for (let i = 0; i < 4; i++) {
        box(x + sx * (2 + i * 2.5), 0.025, z + sz * 16, 0.7, 0.008, 2, PALETTE.laneMark);
        box(x + sx * 16, 0.025, z + sz * (2 + i * 2.5), 2, 0.008, 0.7, PALETTE.laneMark);
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
    // Visible seawalls match the persistent boundary colliders.
    if (Math.abs(cx) === 3) box(Math.sign(cx) * CITY_HALF, 2, z, 1, 2, BLOCK / 2, PALETTE.kerb, 'boundary');
    if (Math.abs(cz) === 3) box(x, 2, Math.sign(cz) * CITY_HALF, BLOCK / 2, 2, 1, PALETTE.kerb, 'boundary');
    return { key: `${cx},${cz}`, x: cx, z: cz, statics };
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
    const a0 = road.centre[0] as RoadPoint, a1 = road.centre[road.centre.length - 1] as RoadPoint;
    const nearJunction = (px: number, pz: number, margin: number) =>
      Math.max(Math.abs(px - a0.x), Math.abs(pz - a0.z)) < margin || Math.max(Math.abs(px - a1.x), Math.abs(pz - a1.z)) < margin;
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
    let along = 0, nextDash = 0, nextTree = 13, nextLamp = 30;
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
      const surface = box(mx, 0.019, mz, hw, 0.001, len / 2 + 0.25, PALETTE.asphalt, 'road', 'top');
      surface.rotation = rot;
      if (!nearJunction(mx, mz, 26)) {
        while (nextDash < along) {
          if (nextDash >= startAlong) {
            const t = (nextDash - startAlong) / len;
            const dash = box(a.x + dx * t, 0.028, a.z + dz * t, 0.12, 0.004, 1.4, PALETTE.laneMark);
            dash.rotation = rot;
          }
          nextDash += 12;
        }
      }
      if (!nearJunction(mx, mz, ROAD_HALF + 12)) {
        for (const side of [-1, 1]) {
          const kerb = box(mx + nx * side * (hw + 2.25), 0.07, mz + nz * side * (hw + 2.25), 2.25, 0.07, len / 2 + 0.3, paving === PALETTE.grass ? c.soil : paving, 'kerb');
          kerb.rotation = rot;
          const edge = box(mx + nx * side * (hw + 0.12), 0.16, mz + nz * side * (hw + 0.12), 0.12, 0.02, len / 2 + 0.3, c.trim);
          edge.rotation = rot;
          if (paving === PALETTE.grass) {
            const lawn = box(mx + nx * side * (hw + 2.25), 0.145, mz + nz * side * (hw + 2.25), 2.25, 0.005, len / 2 + 0.3, PALETTE.grass, 'decor', 'top');
            lawn.rotation = rot;
          }
        }
        while (nextTree < along) {
          if (nextTree >= startAlong && road.kind !== 'service') {
            const t = (nextTree - startAlong) / len, side = Math.floor(nextTree / 27) % 2 ? 1 : -1;
            architecture.tree(a.x + dx * t + nx * side * (hw + 2.7), a.z + dz * t + nz * side * (hw + 2.7), road.kind === 'quay');
          }
          nextTree += 27;
        }
        for (const front of fronts) while (frontage && front.next < along) {
          if (front.next >= startAlong) {
            const ts = (front.next - startAlong) / len, index = Math.round(front.next / pitch), side = front.side;
            const ox = nx * side, oz = nz * side;
            const yaw = Math.atan2(ox, oz), variant = (index * 7 + (side > 0 ? 0 : 1)) % 3;
            const depth = frontage.hz + (variant === 1 ? 1 : 0), width = frontage.hx + (variant === 2 ? 1 : 0);
            const centre = hw + 4.5 + frontage.setback + depth;
            const px = a.x + dx * ts + ox * centre, pz = a.z + dz * ts + oz * centre;
            if (!nearJunction(px, pz, ROAD_HALF + 30 + width) && footprintClear(px, pz, yaw, width + 1.5, depth + 1.5)) {
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
        while (nextLamp < along) {
          if (nextLamp >= startAlong) {
            const t = (nextLamp - startAlong) / len, side = Math.floor(nextLamp / 45) % 2 ? -1 : 1;
            const px = a.x + dx * t + nx * side * (hw + 2), pz = a.z + dz * t + nz * side * (hw + 2);
            box(px, 4, pz, 0.18, 4, 0.18, 0x686678);
            const head = box(px - nx * side, 8, pz - nz * side, 0.45, 0.15, 1.4, PALETTE.laneMark);
            head.rotation = rot;
          }
          nextLamp += 45;
        }
      }
    }
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
    const chunk = this.generate(ix, iz);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const st of chunk.statics) {
      if ((st.tag !== 'building' && st.tag !== 'kerb') || st.shape.kind !== 'box') continue;
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
    for (const lane of this.graph.lanes) {
      const dist = projectOnLane(lane, x, z, hit);
      if (dist < best) { best = dist; out.position.x = hit.x; out.position.z = hit.z; out.yaw = hit.yaw; }
    }
    return out;
  }
}
