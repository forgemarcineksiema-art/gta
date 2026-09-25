/**
 * The island drawn (M8.10 slice 2): the ground a chunk at a time, flat-shaded, coloured by its height and slope (sand at
 * the water, grass, the hill's dry grass, rock where it is steep); the graded roads as strips on it; the sea; the Crown
 * Tower on the summit as the one landmark for now. The ground's finer look, the coast's edges and the surfaces are slice
 * 3's. Reads the sim's island, never writes it.
 */
import * as THREE from 'three';
import { PALETTE } from '../../sim';
import { SEA } from '../../sim/city/sea';
import { HALF_WIDTH } from '../../sim/island/ground';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0, type Island } from '../../sim/island/Island';
import { PLACES } from '../../sim/island/plan';
import { QUALITY, type QualityTier } from '../quality';

/** The ground's mesh: a vertex every `STEP` m. */
const STEP = CHUNK / 40;
const N = CHUNK / STEP;
/** The colours by height (m) and where the ground turns to rock (rise over run). */
const SAND_TOP = 1.3;
const ROCK_GRADE = 0.55;
const BANDS: ReadonlyArray<readonly [number, number]> = [[0, 0x8fa878], [10, 0x97a970], [22, 0xa8a96b], [34, 0xb9a86c], [44, 0xc6ab73]];
const SAND = 0xe3c48a, ROCK = 0x8a7f72, SEA_FLOOR = 0x2f6f7f;
/** Road strips sit this far over the ground so the two never fight. */
const LIFT = 0.06;

export class IslandView {
  private readonly group = new THREE.Group();
  private readonly chunks = new Map<number, THREE.Mesh>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene, private readonly island: Island) {
    scene.add(this.group);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: PALETTE.water }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA.level;
    this.group.add(sea);
    this.group.add(this.roads());
    this.group.add(this.tower());
  }

  /** Build the ground's chunks within sight of (x, z), one a frame (all of them when `snap`); hide the far ones. */
  sync(x: number, z: number, quality: QualityTier, snap = false): void {
    const reach = QUALITY[quality].far + CHUNK * 0.75;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < CHUNKS_Z; j++) for (let i = 0; i < CHUNKS_X; i++) {
      const cx = CHUNK_X0 + (i + 0.5) * CHUNK, cz = CHUNK_Z0 + (j + 0.5) * CHUNK;
      const d = Math.hypot(cx - x, cz - z), k = j * CHUNKS_X + i;
      const mesh = this.chunks.get(k);
      if (mesh) mesh.visible = d < reach;
      else if (d < reach) {
        if (snap) this.build(i, j);
        else if (d < bestD) { bestD = d; best = k; }
      }
    }
    if (best >= 0) this.build(best % CHUNKS_X, Math.floor(best / CHUNKS_X));
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose(); });
    this.material.dispose();
  }

  /** A chunk's ground: a grid of (N + 1)² points, two triangles a cell, the colour by the ground's height and slope. */
  private build(i: number, j: number): void {
    const x0 = CHUNK_X0 + i * CHUNK, z0 = CHUNK_Z0 + j * CHUNK, n = N + 1;
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = this.island.heightAt(x0 + c * STEP, z0 + r * STEP);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const k = r * n + c, y = h[k] as number;
      pos[k * 3] = x0 + c * STEP; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z0 + r * STEP;
      const gx = ((h[r * n + Math.min(n - 1, c + 1)] as number) - (h[r * n + Math.max(0, c - 1)] as number)) / (2 * STEP);
      const gz = ((h[Math.min(n - 1, r + 1) * n + c] as number) - (h[Math.max(0, r - 1) * n + c] as number)) / (2 * STEP);
      let hex = SEA_FLOOR;
      if (y > 0) {
        if (Math.hypot(gx, gz) > ROCK_GRADE) hex = ROCK;
        else if (y < SAND_TOP) hex = SAND;
        else for (const [top, band] of BANDS) if (y >= top) hex = band;
      }
      this.color.setHex(hex);
      col[k * 3] = this.color.r; col[k * 3 + 1] = this.color.g; col[k * 3 + 2] = this.color.b;
    }
    const index: number[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const a = r * n + c, b = a + 1, d = a + n, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    this.chunks.set(j * CHUNKS_X + i, mesh);
    this.group.add(mesh);
  }

  /** The graded roads as strips a hair over the ground: asphalt, the taxiways' concrete, the quarry's dirt. */
  private roads(): THREE.Mesh {
    const pos: number[] = [], col: number[] = [];
    const c = this.color;
    for (const road of this.island.ground.roads) {
      c.setHex(road.cls === 'dirt' ? 0x8a6a48 : road.cls === 'taxiway' ? 0x6a6a78 : PALETTE.asphalt);
      const n = road.pts.length, last = road.closed ? n : n - 1, hw = HALF_WIDTH[road.cls];
      const edge = (k: number): [number, number, number, number, number, number] => {
        const p = road.pts[(k + n) % n] as readonly [number, number];
        const prev = road.pts[road.closed ? (k - 1 + n) % n : Math.max(0, k - 1)] as readonly [number, number];
        const next = road.pts[road.closed ? (k + 1) % n : Math.min(n - 1, k + 1)] as readonly [number, number];
        const tx = next[0] - prev[0], tz = next[1] - prev[1], l = Math.hypot(tx, tz) || 1;
        const nx = -tz / l, nz = tx / l, y = (road.h[(k + n) % n] as number) + LIFT;
        return [p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw];
      };
      for (let k = 0; k < last; k++) {
        const [ax, ay, az, bx, by, bz] = edge(k), [cx, cy, cz, dx, dy, dz] = edge(k + 1);
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, bx, by, bz, dx, dy, dz, cx, cy, cz);
        for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /** The Crown Tower on the summit: until the summit's plaza is built (slice 8), the island's one landmark. */
  private tower(): THREE.Group {
    const g = new THREE.Group();
    const base = this.island.heightAt(PLACES.towerTop.x, PLACES.towerTop.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(28, 94, 28), new THREE.MeshLambertMaterial({ color: 0xd8cbb0, flatShading: true }));
    body.position.set(PLACES.towerTop.x, base + 47, PLACES.towerTop.z);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshLambertMaterial({ color: 0xf5cd75, flatShading: true }));
    crown.position.set(PLACES.towerTop.x, base + 100, PLACES.towerTop.z);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 18, 0.8), new THREE.MeshLambertMaterial({ color: 0xf5cd75 }));
    mast.position.set(PLACES.towerTop.x, base + 115, PLACES.towerTop.z);
    body.castShadow = true;
    g.add(body, crown, mast);
    return g;
  }
}
