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
/** City statics rotate about +Y only; the quaternion is read back as a yaw. */
export function staticYaw(st: StaticDesc): number {
  const q = st.rotation;
  return q.y === 0 && q.w === 1 ? 0 : 2 * Math.atan2(q.y, q.w);
}

export function partIndex(st: StaticDesc, cx: number, cz: number): number {
  const shape = st.shape;
  const round = shape.kind === 'cylinder' || shape.kind === 'wheel';
  // A rotated box straddles a centre line when its bounding circle does.
  const rotated = !round && staticYaw(st) !== 0;
  const hx = round ? shape.radius : rotated ? Math.hypot(shape.hx, shape.hz) : shape.hx;
  const hz = round ? shape.radius : rotated ? Math.hypot(shape.hx, shape.hz) : shape.hz;
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
    const yaw = staticYaw(st), cos = Math.cos(yaw), sin = Math.sin(yaw);
    color.setHex(st.color);
    for (const src of sources(st)) {
      const pos = src.getAttribute('position'), normal = src.getAttribute('normal');
      if (casts(st)) shadowVertices += pos.count;
      for (let i = 0; i < pos.count; i++, index += 3) {
        const lx = pos.getX(i) * sx, lz = pos.getZ(i) * sz;
        let nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
        if (shape.kind === 'gable') {
          nx /= sx; ny /= sy; nz /= sz;
          const length = Math.hypot(nx, ny, nz);
          nx /= length; ny /= length; nz /= length;
        }
        // Rotation about +Y: local +Z maps to (sin yaw, cos yaw), matching quatFromYaw.
        positions[index] = st.position.x + cos * lx + sin * lz;
        positions[index + 1] = st.position.y + pos.getY(i) * sy;
        positions[index + 2] = st.position.z - sin * lx + cos * lz;
        normals[index] = cos * nx + sin * nz; normals[index + 1] = ny; normals[index + 2] = -sin * nx + cos * nz;
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

/** Both detail levels are built once per part; the mesh swaps between them by distance. */
interface Part { mesh: THREE.Mesh; index: number; x: number; z: number; detailed: boolean; near: THREE.BufferGeometry | null; far: THREE.BufferGeometry | null }
/** `groups` holds the partitioned descriptors only while geometries are still being built. */
interface Tile { key: string; x: number; z: number; parts: Part[] | null; groups: StaticDesc[][] | null; queue: Array<{ part: Part; detailed: boolean }> }

export class CityView {
  /** Chunk key -> its five part meshes (base + four quadrants). */
  readonly meshes = new Map<string, THREE.Mesh[]>();
  private readonly tiles: Tile[] = [];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  loaded = 0;
  unloaded = 0;
  /** Frames left of the faster catch-up after a synchronous (near ring only) load. */
  private burst = 0;
  constructor(private readonly scene: THREE.Scene, private readonly city: City) {
    fadeShadowEdges(this.material);
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) this.tiles.push({ key: `${x},${z}`, x, z, parts: null, groups: null, queue: [] });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: 0x3fa7c9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; scene.add(sea);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2), new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
  }

  /** One chunk generation per tile claim; the descriptors are dropped once both levels exist. */
  private partition(tile: Tile): StaticDesc[][] {
    const cx = tile.x * BLOCK, cz = tile.z * BLOCK;
    const data = this.city.active.get(tile.key)?.chunk ?? this.city.generate(tile.x, tile.z);
    const groups = PARTS.map((): StaticDesc[] => []);
    for (const st of data.statics) groups[partIndex(st, cx, cz)]?.push(st);
    return groups;
  }

  private unload(tile: Tile): void {
    for (const part of tile.parts ?? []) { this.scene.remove(part.mesh); part.near?.dispose(); part.far?.dispose(); }
    this.meshes.delete(tile.key); tile.parts = null; tile.groups = null; tile.queue = []; this.unloaded++;
  }

  /** Build the next queued geometry of a tile; drops the descriptors once the queue is empty. */
  private buildNext(tile: Tile): void {
    const job = tile.queue.shift();
    if (!job || !tile.groups) return;
    const geometry = cityGeometry(tile.groups[job.part.index] ?? [], job.detailed);
    if (job.detailed) job.part.near = geometry; else job.part.far = geometry;
    if (job.detailed === job.part.detailed || job.part.mesh.geometry.getAttribute('position') === undefined) {
      job.part.mesh.geometry = geometry; job.part.detailed = job.detailed;
    }
    if (tile.queue.length === 0) tile.groups = null;
  }

  /** Swap a part to the detail level its distance asks for, if that level exists. */
  private static swap(part: Part, detailed: boolean): void {
    const geometry = detailed ? part.near : part.far;
    if (!geometry || part.detailed === detailed) return;
    part.mesh.geometry = geometry; part.detailed = detailed;
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
    // A tile is claimed with five empty part meshes (one chunk generation), then
    // its parts are built one per normal frame, nearest tile first: the work of a
    // chunk spreads over five frames and never lands in one. A teleport/start
    // populates everything in front of the fog before it is shown; the fogged
    // outer ring follows at three parts a frame.
    const claims = immediate ? 49 : 1;
    const builds = immediate ? Infinity : this.burst > 0 ? 2 : 1;
    if (!immediate && this.burst > 0) this.burst--;
    if (immediate) this.burst = 60;
    const syncRadius = QUALITY[tier].near + BLOCK * Math.SQRT1_2 + 40;
    for (let n = 0; n < claims; n++) {
      let best = loadRadius;
      let nearest: Tile | undefined;
      for (const tile of this.tiles) {
        if (tile.parts) continue;
        const d = Math.hypot(tile.x * BLOCK - x, tile.z * BLOCK - z);
        if (d < best) { best = d; nearest = tile; }
      }
      if (!nearest || (immediate && best > syncRadius)) break;
      const cx = nearest.x * BLOCK, cz = nearest.z * BLOCK;
      nearest.groups = this.partition(nearest);
      nearest.parts = PARTS.map((offset, index) => {
        const px = cx + offset.ox * BLOCK / 4, pz = cz + offset.oz * BLOCK / 4;
        const d = Math.hypot(px - x, pz - z);
        const empty = new THREE.BufferGeometry(); empty.userData['shadowVertices'] = 0;
        const mesh = new THREE.Mesh(empty, this.material);
        // Vertices are already in world space: no per-frame matrix work for city parts.
        mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
        mesh.receiveShadow = true;
        mesh.visible = d <= visibleRadius; mesh.castShadow = d <= casterRadius;
        mesh.onBeforeShadow = () => { mesh.geometry.setDrawRange(0, mesh.geometry.userData['shadowVertices'] as number); };
        mesh.onAfterShadow = () => { mesh.geometry.setDrawRange(0, Infinity); };
        this.scene.add(mesh);
        return { mesh, index, x: px, z: pz, detailed: d < DETAIL_NEAR, near: null, far: null };
      });
      // The level needed now for every part first, then the other level.
      for (const part of nearest.parts) nearest.queue.push({ part, detailed: part.detailed });
      for (const part of nearest.parts) nearest.queue.push({ part, detailed: !part.detailed });
      this.meshes.set(nearest.key, nearest.parts.map((part) => part.mesh)); this.loaded++;
    }
    let uploads = 0;
    const pending = this.tiles.filter((tile) => tile.groups)
      .sort((a, b) => Math.hypot(a.x * BLOCK - x, a.z * BLOCK - z) - Math.hypot(b.x * BLOCK - x, b.z * BLOCK - z));
    for (const tile of pending) {
      // A synchronous load builds only the level each part needs now; the other
      // level follows in the burst frames, so a teleport costs one level, not two.
      const wanted = (tile: Tile) => !immediate || (tile.queue[0] ? tile.queue[0].detailed === tile.queue[0].part.detailed : false);
      while (tile.groups && uploads < builds && wanted(tile)) { this.buildNext(tile); uploads++; }
      if (uploads >= builds) break;
    }
    // Detail is spatial, identical on both quality tiers: frames and sills are
    // sub-pixel past DETAIL_NEAR at DPR 1.5. Swapping is free once both levels
    // exist; hysteresis prevents toggling at a part boundary.
    for (const tile of this.tiles) {
      for (const part of tile.parts ?? []) {
        const distance = Math.hypot(part.x - x, part.z - z);
        const detailed = immediate ? distance < DETAIL_NEAR : part.detailed ? distance < DETAIL_FAR : distance < DETAIL_NEAR;
        CityView.swap(part, detailed);
      }
    }
  }

  dispose(): void {
    for (const tile of this.tiles) if (tile.parts) this.unload(tile);
    this.meshes.clear(); this.material.dispose();
  }
}
