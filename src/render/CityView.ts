import * as THREE from 'three';
import { BLOCK, CITY_HALF, PALETTE, type City, type CityChunk, type StaticDesc } from '../sim';
import { SHADOW_HALF, fadeShadowEdges } from './shadows';
import { fadeRoadPaint } from './roadPaint';
import { gableGeometry, prismGeometry } from './geometry';

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
/**
 * Promote a chunk part to full detail inside this radius; demote beyond the
 * hysteresis band. Frames, sills and zebra stripes are under a pixel past
 * about 120 m from the driving camera, so the near level ends there.
 */
export const DETAIL_NEAR = 120, DETAIL_FAR = 150;
/** Order the shadow-caster prefix; trims and single-sided panels never enter the depth pass. */
const casts = (st: StaticDesc) => !st.face && st.tag !== 'wall' && st.tag !== 'road' && st.tag !== 'ground' && st.tag !== 'kerb' && st.tag !== 'trim';

/**
 * Quarter a chunk so frustum culling (camera and shadow passes) discards the
 * streets behind the player. Statics that straddle the chunk centre lines
 * (ground, road cross) form a fifth base part.
 */
export const PARTS = [{ ox: 0, oz: 0 }, { ox: -1, oz: -1 }, { ox: 1, oz: -1 }, { ox: -1, oz: 1 }, { ox: 1, oz: 1 }] as const;
/** A static tilted out of the horizontal (the overpass ramps' pieces): drawn with its whole rotation, not a yaw. */
export function staticPitched(st: StaticDesc): boolean {
  return st.rotation.x !== 0 || st.rotation.z !== 0;
}

/** Most city statics rotate about +Y only; their quaternion is read back as a yaw (0 for a pitched one). */
export function staticYaw(st: StaticDesc): number {
  const q = st.rotation;
  return (q.y === 0 && q.w === 1) || staticPitched(st) ? 0 : 2 * Math.atan2(q.y, q.w);
}

export function partIndex(st: StaticDesc, cx: number, cz: number): number {
  const shape = st.shape;
  const dx = st.position.x - cx, dz = st.position.z - cz;
  // The junction square (crossings, bands) is one piece: both halves of a crossing
  // must change detail level together, so they never belong to different quadrants.
  if (Math.abs(dx) < 20 && Math.abs(dz) < 20) return 0;
  let hx: number, hz: number;
  if (shape.kind === 'prism') {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const pt of shape.points) { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z); }
    hx = (maxX - minX) / 2; hz = (maxZ - minZ) / 2;
  } else {
    const round = shape.kind === 'cylinder' || shape.kind === 'wheel' || shape.kind === 'ball';
    // A rotated box straddles a centre line when its bounding circle does (a pitched one's bounding sphere).
    const pitched = !round && staticPitched(st);
    const rotated = !round && (pitched || staticYaw(st) !== 0);
    const radius = round ? shape.radius : pitched ? Math.hypot(shape.hx, shape.hy, shape.hz) : Math.hypot(shape.hx, shape.hz);
    hx = round ? shape.radius : rotated ? radius : shape.hx;
    hz = round ? shape.radius : rotated ? radius : shape.hz;
  }
  if (Math.abs(dx) <= hx || Math.abs(dz) <= hz) return 0;
  return 1 + (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0);
}

/** Raw vertex arrays of the unit shapes: the builder copies floats, never calls accessors. */
const RAW = (() => {
  const raw = (g: THREE.BufferGeometry) => ({ p: g.getAttribute('position').array as Float32Array, n: g.getAttribute('normal').array as Float32Array });
  return {
    box: raw(box), cylinder: raw(cylinder), gable: raw(gable),
    'x+': raw(faces['x+']), 'x-': raw(faces['x-']), 'z+': raw(faces['z+']), 'z-': raw(faces['z-']), top: raw(faces.top), bottom: raw(faces.bottom),
  };
})();
type Raw = { p: Float32Array; n: Float32Array };
const sourceList: Raw[] = [];
/** Prisms are already in world space; their vertex arrays are built once per descriptor. */
const prismRaw = new WeakMap<StaticDesc, Raw>();

/** Fill `sourceList` with the unit geometries a static needs; returns the vertex count. */
function sourcesOf(st: StaticDesc): number {
  sourceList.length = 0;
  if (st.shape.kind === 'prism') {
    let raw = prismRaw.get(st);
    if (!raw) {
      const g = prismGeometry(st.shape.points, st.shape.y0, st.shape.y1);
      raw = { p: g.getAttribute('position').array as Float32Array, n: g.getAttribute('normal').array as Float32Array };
      prismRaw.set(st, raw);
    }
    sourceList.push(raw);
  } else if (st.faces) for (const f of st.faces) sourceList.push(RAW[f]);
  else sourceList.push(st.face ? RAW[st.face] : st.shape.kind === 'gable' ? RAW.gable : st.shape.kind === 'box' ? RAW.box : RAW.cylinder);
  let count = 0;
  for (const src of sourceList) count += src.p.length / 3;
  return count;
}

/** sRGB → linear per palette entry, converted once instead of per static. */
const colourCache = new Map<number, [number, number, number]>();
function rgb(hex: number): [number, number, number] {
  let c = colourCache.get(hex);
  if (!c) { color.setHex(hex); c = [color.r, color.g, color.b]; colourCache.set(hex, c); }
  return c;
}

/**
 * An in-progress part geometry. Building a large part takes about 9 ms on the
 * desktop and four times that on a throttled CPU, so the builder is resumable:
 * `GeometryBuild.step` fills a bounded number of statics per call and the mesh
 * only receives the geometry once it is complete.
 */
export class GeometryBuild {
  private readonly order: StaticDesc[] = [];
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly colors: Float32Array;
  private readonly paint: Uint8Array;
  private cursor = 0;
  private index = 0;
  private shadowVertices = 0;
  private done = false;

  constructor(statics: StaticDesc[], readonly detailed: boolean) {
    // Shadow casters first, so they form a prefix of the buffer (onBeforeShadow draw range).
    let count = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const st of statics) {
        if (st.collisionOnly || st.shape.kind === 'wheel' || (!detailed && st.detailOnly) || (detailed && st.farOnly)) continue;
        if (casts(st) !== (pass === 0)) continue;
        this.order.push(st);
        const vertices = sourcesOf(st);
        count += vertices;
        if (pass === 0) this.shadowVertices += vertices;
      }
    }
    this.positions = new Float32Array(count * 3); this.normals = new Float32Array(count * 3); this.colors = new Float32Array(count * 3);
    this.paint = new Uint8Array(count * 4);
  }

  /** Fill up to `budget` statics; returns true once every static is written. */
  step(budget: number): boolean {
    const positions = this.positions, normals = this.normals, colors = this.colors;
    const stop = Math.min(this.order.length, this.cursor + budget);
    let index = this.index;
    for (; this.cursor < stop; this.cursor++) {
      const st = this.order[this.cursor] as StaticDesc;
      const shape = st.shape;
      if (shape.kind === 'wheel' || shape.kind === 'ball') continue;
      const absolute = shape.kind === 'prism';
      const rectangular = shape.kind === 'box' || shape.kind === 'gable';
      const sx = absolute ? 1 : rectangular ? shape.hx : shape.radius;
      const sy = absolute ? 1 : rectangular ? shape.hy : shape.halfHeight;
      const sz = absolute ? 1 : rectangular ? shape.hz : shape.radius;
      const px = absolute ? 0 : st.position.x, py = absolute ? 0 : st.position.y, pz = absolute ? 0 : st.position.z;
      const yaw = absolute ? 0 : staticYaw(st), rotated = yaw !== 0, cos = Math.cos(yaw), sin = Math.sin(yaw);
      // a pitched static takes its whole rotation, the matrix of its quaternion (the physics collider's own)
      const pitched = !absolute && staticPitched(st);
      let m00 = 1, m01 = 0, m02 = 0, m10 = 0, m11 = 1, m12 = 0, m20 = 0, m21 = 0, m22 = 1;
      if (pitched) {
        const { x: qx, y: qy, z: qz, w: qw } = st.rotation;
        m00 = 1 - 2 * (qy * qy + qz * qz); m01 = 2 * (qx * qy - qz * qw); m02 = 2 * (qx * qz + qy * qw);
        m10 = 2 * (qx * qy + qz * qw); m11 = 1 - 2 * (qx * qx + qz * qz); m12 = 2 * (qy * qz - qx * qw);
        m20 = 2 * (qx * qz - qy * qw); m21 = 2 * (qy * qz + qx * qw); m22 = 1 - 2 * (qx * qx + qy * qy);
      }
      const gableShape = shape.kind === 'gable';
      const [r, g, b] = rgb(st.color);
      const underlay = st.paint ? rgb(st.paint.underlay) : null;
      sourcesOf(st);
      for (const src of sourceList) {
        const sp = src.p, sn = src.n, n = sp.length;
        for (let i = 0; i < n; i += 3, index += 3) {
          let lx = (sp[i] as number) * sx, ly = (sp[i + 1] as number) * sy, lz = (sp[i + 2] as number) * sz;
          let nx = sn[i] as number, ny = sn[i + 1] as number, nz = sn[i + 2] as number;
          if (gableShape) {
            nx /= sx; ny /= sy; nz /= sz;
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= length; ny /= length; nz /= length;
          }
          if (pitched) {
            const rx = m00 * lx + m01 * ly + m02 * lz, ry = m10 * lx + m11 * ly + m12 * lz, rz = m20 * lx + m21 * ly + m22 * lz;
            lx = rx; ly = ry; lz = rz;
            const rnx = m00 * nx + m01 * ny + m02 * nz, rny = m10 * nx + m11 * ny + m12 * nz, rnz = m20 * nx + m21 * ny + m22 * nz;
            nx = rnx; ny = rny; nz = rnz;
          } else if (rotated) {
            // Rotation about +Y: local +Z maps to (sin yaw, cos yaw), matching quatFromYaw.
            const rx = cos * lx + sin * lz, rz = -sin * lx + cos * lz;
            lx = rx; lz = rz;
            const rnx = cos * nx + sin * nz, rnz = -sin * nx + cos * nz;
            nx = rnx; nz = rnz;
          }
          positions[index] = px + lx; positions[index + 1] = py + ly; positions[index + 2] = pz + lz;
          normals[index] = nx; normals[index + 1] = ny; normals[index + 2] = nz;
          colors[index] = r; colors[index + 1] = g; colors[index + 2] = b;
          if (underlay && st.paint) {
            const pi = index / 3 * 4;
            this.paint[pi] = Math.round(underlay[0] * 255);
            this.paint[pi + 1] = Math.round(underlay[1] * 255);
            this.paint[pi + 2] = Math.round(underlay[2] * 255);
            this.paint[pi + 3] = st.paint.fadeEnd;
          }
        }
      }
    }
    this.index = index;
    this.done = this.cursor >= this.order.length;
    return this.done;
  }

  finish(): THREE.BufferGeometry {
    if (!this.done) this.step(Infinity);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    out.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    out.setAttribute('roadPaint', new THREE.BufferAttribute(this.paint, 4, true));
    out.computeBoundingSphere();
    out.userData['shadowVertices'] = this.shadowVertices;
    return out;
  }
}

export function cityGeometry(statics: StaticDesc[], detailed = true): THREE.BufferGeometry {
  return new GeometryBuild(statics, detailed).finish();
}

/** Statics written per resumable build step: about 2.5 ms on the desktop, 10 ms at CPU ×4. */
export const BUILD_SLICE = 1200;
/** One shared placeholder for parts whose geometry is still queued (never disposed). */
const EMPTY = new THREE.BufferGeometry();
EMPTY.userData['shadowVertices'] = 0;

/** Both detail levels are built once per part; the mesh swaps between them by distance. */
interface Part { mesh: THREE.Mesh; index: number; x: number; z: number; detailed: boolean; near: THREE.BufferGeometry | null; far: THREE.BufferGeometry | null }
/** `groups` holds the partitioned descriptors only while geometries are still being built. */
interface Tile { key: string; x: number; z: number; parts: Part[] | null; groups: StaticDesc[][] | null; queue: Array<{ part: Part; detailed: boolean }>; build: GeometryBuild | null }

export class CityView {
  /** Chunk key -> its five part meshes (base + four quadrants). */
  readonly meshes = new Map<string, THREE.Mesh[]>();
  /** Called once per tile claim with the chunk it generated (the billboards view registers its panels). */
  onChunk: ((chunk: CityChunk) => void) | null = null;
  private readonly tiles: Tile[] = [];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  loaded = 0;
  unloaded = 0;
  /** Frames left of the faster catch-up after a synchronous (near ring only) load. */
  private burst = 0;
  constructor(private readonly scene: THREE.Scene, private readonly city: City) {
    fadeShadowEdges(this.material);
    fadeRoadPaint(this.material);
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) this.tiles.push({ key: `${x},${z}`, x, z, parts: null, groups: null, queue: [], build: null });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: 0x3fa7c9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; scene.add(sea);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2), new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
  }

  /** One chunk generation per tile claim; the descriptors are dropped once both levels exist. */
  private partition(tile: Tile): StaticDesc[][] {
    const cx = tile.x * BLOCK, cz = tile.z * BLOCK;
    const data = this.city.chunk(tile.x, tile.z);
    this.onChunk?.(data);
    const groups = PARTS.map((): StaticDesc[] => []);
    for (const st of data.statics) groups[partIndex(st, cx, cz)]?.push(st);
    return groups;
  }

  private unload(tile: Tile): void {
    for (const part of tile.parts ?? []) { this.scene.remove(part.mesh); part.near?.dispose(); part.far?.dispose(); }
    this.meshes.delete(tile.key); tile.parts = null; tile.groups = null; tile.queue = []; tile.build = null; this.unloaded++;
  }

  /**
   * One build step for a tile: start the queued geometry if none is in progress,
   * write one slice, and hand the finished geometry to its part. Drops the
   * descriptors once the queue is empty.
   */
  private buildNext(tile: Tile): void {
    const job = tile.queue[0];
    if (!job || !tile.groups) return;
    tile.build ??= new GeometryBuild(tile.groups[job.part.index] ?? [], job.detailed);
    if (!tile.build.step(BUILD_SLICE)) return;
    const geometry = tile.build.finish();
    tile.build = null; tile.queue.shift();
    if (job.detailed) job.part.near = geometry; else job.part.far = geometry;
    if (job.detailed === job.part.detailed || job.part.mesh.geometry === EMPTY) {
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
    // Squared distances and no temporaries: this runs for every part every frame,
    // and Math.hypot allocates its argument list.
    const visible2 = visibleRadius * visibleRadius, caster2 = casterRadius * casterRadius, keep2 = keepRadius * keepRadius;
    for (const tile of this.tiles) {
      if (!tile.parts) continue;
      const tx = tile.x * BLOCK - x, tz = tile.z * BLOCK - z;
      if (tx * tx + tz * tz > keep2) { this.unload(tile); continue; }
      for (const part of tile.parts) {
        const dx = part.x - x, dz = part.z - z, d2 = dx * dx + dz * dz;
        part.mesh.visible = d2 <= visible2;
        part.mesh.castShadow = d2 <= caster2;
      }
    }
    // A tile is claimed with five empty part meshes (one chunk generation), then
    // its parts are built one per normal frame, nearest tile first: the work of a
    // chunk spreads over five frames and never lands in one. A teleport/start
    // populates everything in front of the fog before it is shown; the fogged
    // outer ring follows at three parts a frame.
    // During the burst after a synchronous load, claims (a chunk generation each)
    // and build slices alternate frames, so the first second never stacks both.
    const claims = immediate ? 49 : this.burst > 0 && this.burst % 2 === 1 ? 0 : 1;
    let builds = immediate ? Infinity : this.burst > 0 ? 2 : 1;
    if (!immediate && this.burst > 0) this.burst--;
    if (immediate) this.burst = 60;
    const syncRadius = QUALITY[tier].near + BLOCK * Math.SQRT1_2 + 40;
    for (let n = 0; n < claims; n++) {
      let best = loadRadius;
      let nearest: Tile | undefined;
      for (const tile of this.tiles) {
        if (tile.parts) continue;
        const d = Math.sqrt((tile.x * BLOCK - x) ** 2 + (tile.z * BLOCK - z) ** 2);
        if (d < best) { best = d; nearest = tile; }
      }
      if (!nearest || (immediate && best > syncRadius)) break;
      const cx = nearest.x * BLOCK, cz = nearest.z * BLOCK;
      nearest.groups = this.partition(nearest);
      nearest.parts = PARTS.map((offset, index) => {
        const px = cx + offset.ox * BLOCK / 4, pz = cz + offset.oz * BLOCK / 4;
        const d = Math.sqrt((px - x) ** 2 + (pz - z) ** 2);
        const mesh = new THREE.Mesh(EMPTY, this.material);
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
      // A claim may have generated a chunk; a build on top of it would double this frame's cost.
      if (!immediate) builds = 0;
    }
    // Build from the nearest tile that still has queued geometries. A synchronous
    // load builds only the level each part needs now; the other level follows in
    // the burst frames, so a teleport costs one level, not two.
    for (let uploads = 0; uploads < builds;) {
      let best = Infinity;
      let tile: Tile | undefined;
      for (const t of this.tiles) {
        if (!t.groups) continue;
        const head = t.queue[0];
        if (!head || (immediate && head.detailed !== head.part.detailed)) continue;
        const d2 = (t.x * BLOCK - x) ** 2 + (t.z * BLOCK - z) ** 2;
        if (d2 < best) { best = d2; tile = t; }
      }
      if (!tile) break;
      this.buildNext(tile); uploads++;
    }
    // Detail is spatial, identical on both quality tiers: frames and sills are
    // sub-pixel past DETAIL_NEAR at DPR 1.5. Swapping is free once both levels
    // exist; hysteresis prevents toggling at a part boundary.
    const near2 = DETAIL_NEAR * DETAIL_NEAR, far2 = DETAIL_FAR * DETAIL_FAR;
    for (const tile of this.tiles) {
      if (!tile.parts) continue;
      for (const part of tile.parts) {
        const d2 = (part.x - x) ** 2 + (part.z - z) ** 2;
        const detailed = immediate ? d2 < near2 : part.detailed ? d2 < far2 : d2 < near2;
        CityView.swap(part, detailed);
      }
    }
  }

  dispose(): void {
    for (const tile of this.tiles) if (tile.parts) this.unload(tile);
    this.meshes.clear(); this.material.dispose();
  }
}
