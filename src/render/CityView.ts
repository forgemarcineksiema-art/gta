import * as THREE from 'three';
import { BLOCK, CITY_HALF, PALETTE, type City, type StaticDesc } from '../sim';
import { SHADOW_HALF, fadeShadowEdges } from './shadows';
import { gableGeometry } from './geometry';

export type QualityTier = 'low' | 'high';
export const QUALITY = {
  low: { far: 340, near: 100, dpr: 1, shadow: 1024 },
  high: { far: 580, near: 180, dpr: 1.5, shadow: 2048 },
} as const;

/** Direct buffer filling avoids hundreds of temporary Three geometries per streamed chunk. */
const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
const cylinder = new THREE.CylinderGeometry(1, 1, 2, 8).toNonIndexed();
const gable = gableGeometry();
const faces = {
  'x+': new THREE.PlaneGeometry(2, 2).rotateY(Math.PI / 2).translate(1, 0, 0).toNonIndexed(),
  'x-': new THREE.PlaneGeometry(2, 2).rotateY(-Math.PI / 2).translate(-1, 0, 0).toNonIndexed(),
  'z+': new THREE.PlaneGeometry(2, 2).translate(0, 0, 1).toNonIndexed(),
  'z-': new THREE.PlaneGeometry(2, 2).rotateY(Math.PI).translate(0, 0, -1).toNonIndexed(),
  top: new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(0, 1, 0).toNonIndexed(),
  bottom: new THREE.PlaneGeometry(2, 2).rotateX(Math.PI / 2).translate(0, -1, 0).toNonIndexed(),
};
const color = new THREE.Color();
/** Promote a chunk part to full detail inside this radius; demote beyond the hysteresis band. */
export const DETAIL_NEAR = 180, DETAIL_FAR = 220;
/** Order the shadow-caster prefix; trims and single-sided panels never enter the depth pass. */
const casts = (st: StaticDesc) => !st.face && !st.farFace && st.tag !== 'road' && st.tag !== 'ground' && st.tag !== 'kerb' && st.tag !== 'trim';

/**
 * Quarter a chunk so frustum culling (camera and shadow passes) discards the
 * streets behind the player. Statics that straddle the chunk centre lines
 * (ground, road cross) form a fifth base part.
 */
export const PARTS = [{ ox: 0, oz: 0 }, { ox: -1, oz: -1 }, { ox: 1, oz: -1 }, { ox: -1, oz: 1 }, { ox: 1, oz: 1 }] as const;
export function partIndex(st: StaticDesc, cx: number, cz: number): number {
  const shape = st.shape;
  const hx = shape.kind === 'cylinder' || shape.kind === 'wheel' ? shape.radius : shape.hx;
  const hz = shape.kind === 'cylinder' || shape.kind === 'wheel' ? shape.radius : shape.hz;
  const dx = st.position.x - cx, dz = st.position.z - cz;
  if (Math.abs(dx) <= hx || Math.abs(dz) <= hz) return 0;
  return 1 + (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0);
}

export function cityGeometry(statics: StaticDesc[], detailed = true): THREE.BufferGeometry {
  const visible = statics.filter((st) => !st.collisionOnly && st.shape.kind !== 'wheel' && (detailed || !st.detailOnly));
  const sources = (st: StaticDesc): THREE.BufferGeometry[] => {
    if (!detailed && st.farFace) return [faces[st.farFace]];
    if (st.faces) return st.faces.map((f) => faces[f]);
    return [st.face ? faces[st.face] : st.shape.kind === 'gable' ? gable : st.shape.kind === 'box' ? box : cylinder];
  };
  // Keep actual shadow casters in a prefix of the same buffer. Window / paving
  // panels receive shadows but don't need another draw in the depth pass.
  // Building cores, roofs, slabs and parapets provide the shadow silhouette;
  // repeated window reveals would mostly redraw depth already covered by the core.
  const ordered = [...visible.filter(casts), ...visible.filter((st) => !casts(st))];
  let count = 0;
  for (const st of ordered) for (const source of sources(st)) count += source.getAttribute('position').count;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  let index = 0, shadowVertices = 0;
  for (const st of ordered) {
    const shape = st.shape;
    if (shape.kind === 'wheel') continue;

    const rectangular = shape.kind === 'box' || shape.kind === 'gable';
    const sx = rectangular ? shape.hx : shape.radius;
    const sy = rectangular ? shape.hy : shape.halfHeight;
    const sz = rectangular ? shape.hz : shape.radius;
    color.setHex(st.color);
    for (const src of sources(st)) {
      const pos = src.getAttribute('position'), normal = src.getAttribute('normal');
      if (casts(st)) shadowVertices += pos.count;
      for (let i = 0; i < pos.count; i++, index += 3) {
        positions[index] = st.position.x + pos.getX(i) * sx;
        positions[index + 1] = st.position.y + pos.getY(i) * sy;
        positions[index + 2] = st.position.z + pos.getZ(i) * sz;
        normals[index] = normal.getX(i); normals[index + 1] = normal.getY(i); normals[index + 2] = normal.getZ(i);
        if (shape.kind === 'gable') {
          const nx = normal.getX(i) / sx, ny = normal.getY(i) / sy, nz = normal.getZ(i) / sz;
          const length = Math.hypot(nx, ny, nz);
          normals[index] = nx / length; normals[index + 1] = ny / length; normals[index + 2] = nz / length;
        }
        colors[index] = color.r; colors[index + 1] = color.g; colors[index + 2] = color.b;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  g.userData['shadowVertices'] = shadowVertices;
  return g;
}

interface Part { mesh: THREE.Mesh; index: number; x: number; z: number; detailed: boolean }
interface Tile { key: string; x: number; z: number; parts: Part[] | null }

export class CityView {
  /** Chunk key -> its five part meshes (base + four quadrants). */
  readonly meshes = new Map<string, THREE.Mesh[]>();
  private readonly tiles: Tile[] = [];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  loaded = 0;
  unloaded = 0;
  constructor(private readonly scene: THREE.Scene, private readonly city: City) {
    fadeShadowEdges(this.material);
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) this.tiles.push({ key: `${x},${z}`, x, z, parts: null });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: 0x3fa7c9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; scene.add(sea);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2), new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
  }

  /** Regenerating is cheap and keeps chunk descriptors out of the resident heap. */
  private partition(tile: Tile): StaticDesc[][] {
    const cx = tile.x * BLOCK, cz = tile.z * BLOCK;
    const data = this.city.active.get(tile.key)?.chunk ?? this.city.generate(tile.x, tile.z);
    const groups = PARTS.map((): StaticDesc[] => []);
    for (const st of data.statics) groups[partIndex(st, cx, cz)]?.push(st);
    return groups;
  }

  private buildPart(tile: Tile, part: Part, detailed: boolean): void {
    const geometry = cityGeometry(this.partition(tile)[part.index] ?? [], detailed);
    part.mesh.geometry.dispose();
    part.mesh.geometry = geometry;
    part.detailed = detailed;
  }

  private unload(tile: Tile): void {
    for (const part of tile.parts ?? []) { this.scene.remove(part.mesh); part.mesh.geometry.dispose(); }
    this.meshes.delete(tile.key); tile.parts = null; this.unloaded++;
  }

  sync(x: number, z: number, tier: QualityTier, immediate = false): void {
    const far = QUALITY[tier].far;
    // Centres can be 159 m from their furthest corner. Load before fog reveals geometry.
    const loadRadius = far + BLOCK * Math.SQRT1_2;
    const keepRadius = loadRadius + BLOCK;
    // Per-part culling by distance keeps Three's per-object work (matrices,
    // frustum tests, shadow candidates) to what fog and the shadow map can show.
    const partRadius = BLOCK * 0.25 * Math.SQRT2 + 12;
    const visibleRadius = far + partRadius, casterRadius = SHADOW_HALF + partRadius;
    for (const tile of this.tiles) {
      if (!tile.parts) continue;
      const distance = Math.hypot(tile.x * BLOCK - x, tile.z * BLOCK - z);
      if (distance > keepRadius) { this.unload(tile); continue; }
      for (const part of tile.parts) {
        const d = Math.hypot(part.x - x, part.z - z);
        part.mesh.visible = d <= visibleRadius;
        part.mesh.castShadow = d <= casterRadius;
      }
    }
    // One chunk upload per normal frame; a teleport/start populates the new view before it is shown.
    const limit = immediate ? 49 : 1;
    let uploads = 0;
    for (let n = 0; n < limit; n++) {
      let best = loadRadius;
      let nearest: Tile | undefined;
      for (const tile of this.tiles) {
        if (tile.parts) continue;
        const d = Math.hypot(tile.x * BLOCK - x, tile.z * BLOCK - z);
        if (d < best) { best = d; nearest = tile; }
      }
      if (!nearest) break;
      const cx = nearest.x * BLOCK, cz = nearest.z * BLOCK;
      const groups = this.partition(nearest);
      nearest.parts = PARTS.map((offset, index) => {
        const px = cx + offset.ox * BLOCK / 4, pz = cz + offset.oz * BLOCK / 4;
        const detailed = Math.hypot(px - x, pz - z) < DETAIL_NEAR;
        const mesh = new THREE.Mesh(cityGeometry(groups[index] ?? [], detailed), this.material);
        // Vertices are already in world space: no per-frame matrix work for city parts.
        mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
        mesh.receiveShadow = true;
        const d = Math.hypot(px - x, pz - z);
        mesh.visible = d <= visibleRadius; mesh.castShadow = d <= casterRadius;
        mesh.onBeforeShadow = () => { mesh.geometry.setDrawRange(0, mesh.geometry.userData['shadowVertices'] as number); };
        mesh.onAfterShadow = () => { mesh.geometry.setDrawRange(0, Infinity); };
        this.scene.add(mesh);
        return { mesh, index, x: px, z: pz, detailed };
      });
      this.meshes.set(nearest.key, nearest.parts.map((part) => part.mesh)); this.loaded++; uploads++;
    }
    // Detail is spatial, identical on both quality tiers: frames and sills are
    // sub-pixel past DETAIL_NEAR at DPR 1.5. Rebuild one part within the same
    // upload allowance; hysteresis prevents toggling at a part boundary.
    for (const tile of this.tiles) {
      if (uploads >= limit) break;
      for (const part of tile.parts ?? []) {
        if (uploads >= limit) break;
        const distance = Math.hypot(part.x - x, part.z - z);
        const detailed = immediate ? distance < DETAIL_NEAR : part.detailed ? distance < DETAIL_FAR : distance < DETAIL_NEAR;
        if (detailed === part.detailed) continue;
        this.buildPart(tile, part, detailed); uploads++;
      }
    }
  }

  dispose(): void {
    for (const tile of this.tiles) if (tile.parts) this.unload(tile);
    this.meshes.clear(); this.material.dispose();
  }
}
