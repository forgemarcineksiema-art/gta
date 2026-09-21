/** Seeded, independently reproducible chunks. Only nearby solid bodies live in Rapier. */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_SOLID, GROUPS_TERRAIN } from '../collision';
import { PALETTE } from '../palette';
import type { SpawnPoint } from '../playground';
import type { StaticDesc } from '../scene';
import { Architecture, CITY_COLORS } from './architecture';
import { BLOCK, CITY_HALF, HIGHWAY_HALF, ROAD_HALF, buildCityRoute, buildRoadGraph } from './roads';

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
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const d = districtAt(x + sx * 55, z + sz * 55);
      const c = CITY_COLORS;
      const hx = (BLOCK / 2 - vx) / 2, hz = (BLOCK / 2 - vz) / 2;
      // The collision apron stays continuous. Visually, pavement is only 4.5 m wide;
      // the interior is gardens, courtyards or a paved industrial service yard.
      box(x + sx * (vx + hx), 0.07, z + sz * (vz + hz), hx, 0.07, hz,
        d.id === 'foundry' ? c.yard : c.soil, 'kerb');
      box(x + sx * (vx + 2.25), 0.145, z + sz * (vz + hz), 2.25, 0.005, hz, PALETTE.kerb, 'decor', 'top');
      box(x + sx * (vx + hx), 0.145, z + sz * (vz + 2.25), hx, 0.005, 2.25, PALETTE.kerb, 'decor', 'top');
      // Continuous kerb edge and paving joints provide a metre-scale reference at speed.
      box(x + sx * (vx + 0.12), 0.16, z + sz * (vz + hz), 0.12, 0.02, hz, c.trim);
      box(x + sx * (vx + hx), 0.16, z + sz * (vz + 0.12), hx, 0.02, 0.12, c.trim);
      for (let along = 26; along < 110; along += 6) {
        box(x + sx * (vx + 2.3), 0.16, z + sz * along, 2.2, 0.002, 0.025, c.yard, 'decor', 'top');
        box(x + sx * along, 0.16, z + sz * (vz + 2.3), 0.025, 0.002, 2.2, c.yard, 'decor', 'top');
      }
      for (const ox of [40, 85]) for (const oz of [40, 85]) {
        // Reserve authored destinations before filling ordinary parcels.
        const landmarkOffset = d.id === 'crown' || d.id === 'foundry' ? 85 : 40;
        if (Math.abs(cx) === 2 && Math.abs(cz) === 2 && sx === 1 && sz === 1 && ox === landmarkOffset && oz === landmarkOffset) continue;
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
        architecture.tree(x + sx * (vx + 2.7), z + sz * along, d.id === 'marina');
        architecture.tree(x + sx * along, z + sz * (vz + 2.7), d.id === 'marina');
      }
      // Street lamps and planted verges are outside the driving corridor.
      for (const offset of [36, 80]) {
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
        architecture.building(px, pz, 14, 14, 'crown', 1, 1, 20, 1, d.accent);
        box(px, 66, pz, 10, 3, 10, CITY_COLORS.stone, 'building');
        box(px, 72, pz, 6, 3, 6, d.accent);
        box(px, 82, pz, 0.4, 7, 0.4, d.accent);
      } else if (d.id === 'foundry') {
        for (const a of [-8, 8]) for (const b of [-8, 8]) box(px + a, 15, pz + b, 1, 15, 1, d.accent, 'building');
        cylinder(px, 34, pz, 14, 6, d.color);
        box(px, 40.5, pz, 14, 0.5, 14, d.accent);
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
      } else {
        architecture.building(px, pz, 16, 12, 'marina', 1, 1, 9, 0, d.accent);
        box(px, 31, pz, 7, 2, 10, d.accent, 'building');
        box(px, 34, pz, 9, 0.3, 11, PALETTE.laneMark);
        for (const side of [-1, 1]) architecture.tree(px + side * 21, pz - 19, true);
      }
    }
    // Visible seawalls match the persistent boundary colliders.
    if (Math.abs(cx) === 3) box(Math.sign(cx) * CITY_HALF, 2, z, 1, 2, BLOCK / 2, PALETTE.kerb, 'boundary');
    if (Math.abs(cz) === 3) box(x, 2, Math.sign(cz) * CITY_HALF, BLOCK / 2, 2, 1, PALETTE.kerb, 'boundary');
    return { key: `${cx},${cz}`, x: cx, z: cz, statics };
  }

  sync(x: number, z: number): void {
    const cx = chunkCoord(x), cz = chunkCoord(z);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx; this.cz = cz;
    // Load before removal: even a reset across the map has ground + solids before physics.
    for (let iz = Math.max(-3, cz - 1); iz <= Math.min(3, cz + 1); iz++) {
      for (let ix = Math.max(-3, cx - 1); ix <= Math.min(3, cx + 1); ix++) {
        const key = `${ix},${iz}`;
        if (this.active.has(key)) continue;
        const chunk = this.generate(ix, iz);
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        for (const st of chunk.statics) {
          if ((st.tag !== 'building' && st.tag !== 'kerb') || st.shape.kind !== 'box') continue;
          const p = st.position, s = st.shape;
          this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz)
            .setTranslation(p.x, p.y, p.z).setFriction(1).setRestitution(st.tag === 'building' ? 1 : 0)
            .setCollisionGroups(st.tag === 'building' ? GROUPS_SOLID : GROUPS_TERRAIN), body);
        }
        this.active.set(key, { body, chunk }); this.loaded++;
      }
    }
    for (const [key, entry] of this.active) {
      if (Math.abs(entry.chunk.x - cx) > 2 || Math.abs(entry.chunk.z - cz) > 2) {
        this.world.removeRigidBody(entry.body); this.active.delete(key); this.unloaded++;
      }
    }
  }

  /** Project onto the closest driveable lane instead of resetting to a distant junction. */
  nearestRoad(x: number, z: number, out: SpawnPoint): SpawnPoint {
    let best = Infinity;
    for (const lane of this.graph.lanes) {
      const dx = lane.x1 - lane.x0, dz = lane.z1 - lane.z0;
      const t = Math.max(0, Math.min(1, ((x - lane.x0) * dx + (z - lane.z0) * dz) / (dx * dx + dz * dz)));
      const px = lane.x0 + dx * t, pz = lane.z0 + dz * t, dist = (x - px) ** 2 + (z - pz) ** 2;
      if (dist < best) { best = dist; out.position.x = px; out.position.z = pz; out.yaw = lane.yaw; }
    }
    return out;
  }
}
