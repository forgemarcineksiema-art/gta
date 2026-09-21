/** Seeded, independently reproducible chunks. Only nearby solid bodies live in Rapier. */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_SOLID, GROUPS_TERRAIN } from '../collision';
import { PALETTE } from '../palette';
import type { SpawnPoint } from '../playground';
import { IDENTITY_QUAT, type StaticDesc } from '../scene';
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
    const box = (px: number, py: number, pz: number, hx: number, hy: number, hz: number, color: number, tag = 'decor') => {
      statics.push({ shape: { kind: 'box', hx, hy, hz }, position: { x: px, y: py, z: pz }, rotation: IDENTITY_QUAT, color, tag });
    };
    const cylinder = (px: number, py: number, pz: number, radius: number, halfHeight: number, color: number) => {
      statics.push({ shape: { kind: 'cylinder', radius, halfHeight }, position: { x: px, y: py, z: pz }, rotation: IDENTITY_QUAT, color, tag: 'decor' });
    };
    const vx = Math.abs(cx) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const vz = Math.abs(cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    box(x, -0.06, z, BLOCK / 2, 0.05, BLOCK / 2, PALETTE.grass, 'ground');
    // Split the cross into disjoint rectangles: no z-fighting at intersections.
    box(x, 0, z, vx, 0.01, BLOCK / 2, PALETTE.asphalt, 'road');
    for (const side of [-1, 1]) {
      const half = (BLOCK / 2 - vx) / 2;
      box(x + side * (vx + half), 0, z, half, 0.01, vz, PALETTE.asphalt, 'road');
    }
    for (let d = -100; d <= 100; d += 12) {
      if (Math.abs(d) < 26) continue;
      box(x, 0.022, z + d, 0.12, 0.006, 2.8, PALETTE.laneMark);
      box(x + d, 0.022, z, 2.8, 0.006, 0.12, PALETTE.laneMark);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const d = districtAt(x + sx * 55, z + sz * 55);
      // Raised pavements start outside the drivable 24/38 m cross.
      const hx = (BLOCK / 2 - vx) / 2, hz = (BLOCK / 2 - vz) / 2;
      box(x + sx * (vx + hx), 0.07, z + sz * (vz + hz), hx, 0.07, hz, PALETTE.kerb, 'kerb');
      // Four lots in each quarter block. Each district has its own massing rules.
      for (const ox of [40, 85]) for (const oz of [40, 85]) {
        const px = x + sx * ox, pz = z + sz * oz;
        const edge = Math.abs(px) > 702 || Math.abs(pz) > 702;
        const park = edge || (d.id === 'gardens' && rnd() < 0.4) || rnd() < 0.07;
        if (park) {
          box(px, 0.15, pz, 16, 0.03, 16, PALETTE.grass);
          cylinder(px - 6, 2.2, pz, 0.5, 2, 0x9d745b);
          cylinder(px - 6, 5.8, pz, 4.8, 2, d.accent);
          cylinder(px + 7, 2.2, pz + 5, 0.5, 2, 0x9d745b);
          cylinder(px + 7, 5.8, pz + 5, 4.8, 2, 0x7fae5a);
          box(px + 6, 0.7, pz - 7, 3, 0.5, 0.6, d.color);
          continue;
        }
        const w = 10 + rnd() * 5, depth = 11 + rnd() * 4;
        const h = d.id === 'crown' ? 18 + rnd() * 40 : d.id === 'foundry' ? 9 + rnd() * 5 : d.id === 'gardens' ? 5 + rnd() * 6 : 10 + rnd() * 14;
        const color = rnd() < 0.3 ? d.accent : d.color;
        box(px, h / 2 + 0.14, pz, w, h / 2, depth, color, 'building');
        box(px, 1.8, pz, w + 0.15, 1.5, depth + 0.15, d.accent);
        box(px, h + 0.35, pz, w + 0.5, 0.35, depth + 0.5, PALETTE.kerb);
        if (d.id === 'crown') {
          box(px, h + 3, pz, w * 0.65, 3, depth * 0.65, color);
          for (const face of [-1, 1]) {
            box(px + face * (w + 0.02), h * 0.55, pz, 0.02, h * 0.32, depth * 0.58, 0x60758e);
            box(px, h * 0.55, pz + face * (depth + 0.02), w * 0.58, h * 0.32, 0.02, 0x60758e);
          }
        } else if (d.id === 'foundry') {
          box(px, h + 1, pz, w * 0.8, 1, depth * 0.8, 0x686678);
          box(px - sx * (w + 0.03), 3, pz, 0.03, 2.5, 4, 0x686678);
          cylinder(px + 5, h + 3, pz + 4, 1, 3, PALETTE.barrier);
        } else {
          for (const face of [-1, 1]) {
            box(px + face * (w + 0.03), h * 0.6, pz, 0.03, 1.2, depth * 0.6, PALETTE.glass);
            box(px, h * 0.6, pz + face * (depth + 0.03), w * 0.6, 1.2, 0.03, PALETTE.glass);
          }
          box(px, h + 1, pz, w * 0.75, 0.8, depth * 0.75, d.accent);
        }
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
    // Authored landmarks replace one lot, using its existing footprint.
    if (Math.abs(cx) === 2 && Math.abs(cz) === 2) {
      const px = x + 85, pz = z + 85, d = districtAt(x, z);
      for (let i = statics.length - 1; i >= 0; i--) {
        const p = (statics[i] as StaticDesc).position;
        if (Math.abs(p.x - px) < 20 && Math.abs(p.z - pz) < 20 && p.y > 0.14) statics.splice(i, 1);
      }
      if (d.id === 'crown') {
        box(px, 38, pz, 14, 38, 14, d.color, 'building');
        box(px, 86, pz, 10, 10, 10, d.accent, 'building');
        box(px, 107, pz, 0.6, 11, 0.6, d.accent);
        for (const s of [-1, 1]) box(px + s * 14.1, 42, pz, 0.1, 32, 5, 0x60758e);
      } else if (d.id === 'foundry') {
        for (const a of [-8, 8]) for (const b of [-8, 8]) box(px + a, 15, pz + b, 1, 15, 1, d.accent, 'building');
        cylinder(px, 34, pz, 14, 6, d.color);
        box(px, 40.5, pz, 14, 0.5, 14, d.accent);
      } else if (d.id === 'gardens') {
        box(px, 5, pz, 18, 5, 18, d.accent, 'building');
        cylinder(px, 12, pz, 17, 2, PALETTE.glass);
        cylinder(px, 15, pz, 12, 1, PALETTE.glass);
        cylinder(px, 17, pz, 6, 1, d.accent);
      } else {
        box(px, 17, pz, 16, 17, 12, d.color, 'building');
        for (let h = 8; h <= 32; h += 8) box(px, h, pz, 17, 0.5, 13, d.accent);
        box(px, 41, pz, 7, 7, 10, d.accent, 'building');
        box(px, 49, pz, 9, 1, 11, PALETTE.laneMark);
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
