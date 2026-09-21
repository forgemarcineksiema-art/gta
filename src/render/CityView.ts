import * as THREE from 'three';
import { BLOCK, CITY_HALF, type City, type StaticDesc } from '../sim';

export type QualityTier = 'low' | 'high';
export const QUALITY = {
  low: { far: 340, near: 100, dpr: 1, shadow: 1024 },
  high: { far: 580, near: 180, dpr: 1.5, shadow: 2048 },
} as const;

/** Direct buffer filling avoids hundreds of temporary Three geometries per streamed chunk. */
const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
const cylinder = new THREE.CylinderGeometry(1, 1, 2, 8).toNonIndexed();
const color = new THREE.Color();
export function cityGeometry(statics: StaticDesc[]): THREE.BufferGeometry {
  let count = 0;
  for (const st of statics) count += (st.shape.kind === 'box' ? box : cylinder).getAttribute('position').count;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  let index = 0;
  for (const st of statics) {
    const shape = st.shape;
    if (shape.kind === 'wheel') continue;
    const src = shape.kind === 'box' ? box : cylinder;
    const pos = src.getAttribute('position'), normal = src.getAttribute('normal');
    const sx = shape.kind === 'box' ? shape.hx : shape.radius;
    const sy = shape.kind === 'box' ? shape.hy : shape.halfHeight;
    const sz = shape.kind === 'box' ? shape.hz : shape.radius;
    color.setHex(st.color);
    for (let i = 0; i < pos.count; i++, index += 3) {
      positions[index] = st.position.x + pos.getX(i) * sx;
      positions[index + 1] = st.position.y + pos.getY(i) * sy;
      positions[index + 2] = st.position.z + pos.getZ(i) * sz;
      normals[index] = normal.getX(i); normals[index + 1] = normal.getY(i); normals[index + 2] = normal.getZ(i);
      colors[index] = color.r; colors[index + 1] = color.g; colors[index + 2] = color.b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  return g;
}

export class CityView {
  readonly meshes = new Map<string, THREE.Mesh>();
  private readonly tiles: Array<{ key: string; x: number; z: number; mesh: THREE.Mesh | null }> = [];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  loaded = 0;
  unloaded = 0;
  constructor(private readonly scene: THREE.Scene, private readonly city: City) {
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) this.tiles.push({ key: `${x},${z}`, x, z, mesh: null });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: 0x3fa7c9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; scene.add(sea);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2), new THREE.MeshLambertMaterial({ color: 0x7fae5a }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
  }

  sync(x: number, z: number, tier: QualityTier, immediate = false): void {
    const far = QUALITY[tier].far;
    // Centres can be 159 m from their furthest corner. Load before fog reveals geometry.
    const loadRadius = far + BLOCK * Math.SQRT1_2;
    const keepRadius = loadRadius + BLOCK;
    for (const tile of this.tiles) {
      const mesh = tile.mesh;
      if (!mesh) continue;
      const distance = Math.hypot(tile.x * BLOCK - x, tile.z * BLOCK - z);
      mesh.visible = distance <= loadRadius;
      mesh.castShadow = distance < 300;
      if (distance > keepRadius) { this.scene.remove(mesh); mesh.geometry.dispose(); this.meshes.delete(tile.key); tile.mesh = null; this.unloaded++; }
    }
    // One upload per normal frame; a teleport/start populates the new view before it is shown.
    const limit = immediate ? 49 : 1;
    for (let n = 0; n < limit; n++) {
      let best = loadRadius;
      let nearest: typeof this.tiles[number] | undefined;
      for (const tile of this.tiles) {
        if (tile.mesh) continue;
        const d = Math.hypot(tile.x * BLOCK - x, tile.z * BLOCK - z);
        if (d < best) { best = d; nearest = tile; }
      }
      if (!nearest) break;
      const key = nearest.key;
      const data = this.city.active.get(key)?.chunk ?? this.city.generate(nearest.x, nearest.z);
      const mesh = new THREE.Mesh(cityGeometry(data.statics), this.material);
      mesh.receiveShadow = true; mesh.castShadow = best < 300;
      nearest.mesh = mesh; this.meshes.set(key, mesh); this.scene.add(mesh); this.loaded++;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.meshes.clear(); this.material.dispose();
  }
}
