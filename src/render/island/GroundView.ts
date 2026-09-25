/**
 * The island's ground drawn (M8.10 slice 3): a mesh a chunk, coarse where the ground is plain and fine where it bends
 * (an RTIN over the chunk's points every `STEP` m, each point allowed its own miss: none over a road's strip, little
 * at the water's edge, more on the open hills, most under the sea), cut along the steep shores and the road banks over
 * the water and hung there with a wall face (a quay's, a cliff's, the rocks'), each corner coloured by what covers its
 * point (the grass blended by height, the verges, the beaches' sand, the quarry's dirt), a steep face all rock. The
 * roads' strips and the paved places are drawn over it (`IslandView`). A chunk's points are read a few columns a frame,
 * so no frame pays for a whole chunk. Reads the sim's island, never writes it.
 */
import * as THREE from 'three';
import { ASPHALT, DIRT, GRASS, ISLAND_COLORS, PALETTE, SAND, SEA } from '../../sim';
import { BLEND, COAST_KINDS, FOOT, SHOULDER, type GroundProbe } from '../../sim/island/ground';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0, Island } from '../../sim/island/Island';
import { canalEdge } from '../../sim/island/shapes/works';
import { LAID, LAWN, gardensGround } from '../../sim/island/shapes/gardens';
import { DECK } from '../../sim/island/structures';
import { Rtin } from './rtin';

/** The mesh's grid: points a side of a chunk, and the step between them (m). */
export const GRID = 65;
const STEP = CHUNK / (GRID - 1);
/** Columns of a chunk's points read a frame: a chunk in about six frames. */
const COLUMNS = 12;
/** A triangle across a cut is at most this many grid steps wide, so the cut follows its line. */
const CUT_SIZE = 2;
/** A chunk's ground over the budget (pin 3.1: under 2,400 triangles) is built again with its open ground's allowances this much coarser. */
const DENSE = 2399;
const COARSER = 1.6;
/** How far past a road's carriageway its bank over the water is drawn before it is cut (m). */
const BANK = SHOULDER + 3;
/** A wall face hangs from the cut's edge to under the sea's floor at a steep shore's foot (m). */
const FACE_BOTTOM = FOOT - 0.5;
/** How far a chunk's border skirt hangs (m): past the most two neighbours' meshes can part there. */
const SKIRT = 1.5;
/** The hill's ground is cut back this far into each of the tunnel's mouths, so the mouth shows (m). */
export const MOUTH = 10;
/** A point cut away at a tunnel's mouth: no wall face hangs from that cut. */
const IN_MOUTH = -2;
/** Where the ground turns to rock: a triangle's normal this far from straight up (its y below this). */
const ROCK_NORMAL_Y = 0.8;
/** The grass's colour by height (m), from the lowland's to the summit's. */
const BANDS: ReadonlyArray<readonly [number, number]> = [
  [0, ISLAND_COLORS.lowland], [8, ISLAND_COLORS.meadow], [18, ISLAND_COLORS.upland], [30, ISLAND_COLORS.dryGrass], [42, ISLAND_COLORS.summit],
];
/** Each shore kind's wall face (the order of `COAST_KINDS`). */
const FACE: Readonly<Record<string, number>> = {
  cliff: ISLAND_COLORS.cliff, quay: ISLAND_COLORS.quayWall, bay: PALETTE.kerb, beach: ISLAND_COLORS.rock, rocks: ISLAND_COLORS.rock, spit: ISLAND_COLORS.rock,
};

/** A chunk's points being read: its column and row, the next column to read, what each point holds (`laid`: the Gardens' marks, `gardensGround`). */
interface Reading { i: number; j: number; col: number; h: Float32Array; cut: Float32Array; kind: Int8Array; road: Float32Array; surface: Uint8Array; laid: Uint8Array }

/** A chunk's ground as arrays: three corners a triangle, a colour a corner, and its count. */
export interface ChunkMesh { positions: Float32Array; colors: Uint8Array; triangles: number }

export class GroundView {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<number, THREE.Mesh>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly rtin = new Rtin(GRID);
  private readonly probe: GroundProbe = { h: 0, steep: 0, steepKind: -1, road: Infinity, surface: GRASS };
  private readonly above = new Float32Array(GRID * GRID);
  private readonly below = new Float32Array(GRID * GRID);
  /** Each point's colour (`cornerColour`). */
  private readonly tint = new Uint32Array(GRID * GRID);
  private reading: Reading | null = null;
  private readonly color = new THREE.Color();
  /** The mesh being filled: grown as needed, copied out per chunk. */
  private pos = new Float32Array(4096 * 9);
  private col = new Uint8Array(4096 * 9);
  private tris = 0;

  /** The tunnel's mouths: each where it opens and the way into the hill. */
  private readonly mouths: Array<{ x: number; z: number; ux: number; uz: number }> = [];

  constructor(private readonly island: Island) {
    for (const s of island.structures) {
      if (s.kind !== 'tunnel') continue;
      for (const [p, sign] of [[s.pieces[0], 1], [s.pieces[s.pieces.length - 1], -1]] as const) {
        if (!p) continue;
        const ux = Math.sin(p.yaw) * sign, uz = Math.cos(p.yaw) * sign;
        this.mouths.push({ x: p.x + ux * (p.length / 2), z: p.z + uz * (p.length / 2), ux, uz });
      }
    }
  }

  /**
   * Show the chunks within `reach` of (x, z), free the far ones, and keep building the nearest missing one a few columns
   * a frame (all of them now when `snap`).
   */
  sync(x: number, z: number, reach: number, snap = false): void {
    let best = -1, bestD = Infinity;
    for (let j = 0; j < CHUNKS_Z; j++) for (let i = 0; i < CHUNKS_X; i++) {
      const d = Math.hypot(CHUNK_X0 + (i + 0.5) * CHUNK - x, CHUNK_Z0 + (j + 0.5) * CHUNK - z), k = j * CHUNKS_X + i;
      const mesh = this.chunks.get(k);
      if (mesh) {
        mesh.visible = d < reach;
        if (d > reach + CHUNK) this.free(k);
      } else if (d < reach) {
        if (snap) this.add(i, j, this.build(i, j));
        else if (d < bestD && !(this.reading && this.reading.i === i && this.reading.j === j)) { bestD = d; best = k; }
      }
    }
    if (snap) return;
    if (!this.reading && best >= 0) this.reading = this.startReading(best % CHUNKS_X, Math.floor(best / CHUNKS_X));
    const r = this.reading;
    if (!r) return;
    if (r.col < GRID) {
      this.readColumns(r, Math.min(GRID, r.col + COLUMNS));
      return;
    }
    this.reading = null;
    if (!this.chunks.has(Island.chunkIndex(r.i, r.j))) this.add(r.i, r.j, this.mesh(r));
  }

  /** A chunk's ground worked out now, whole (the pins, the start). */
  build(i: number, j: number): ChunkMesh {
    const r = this.startReading(i, j);
    this.readColumns(r, GRID);
    return this.mesh(r);
  }

  dispose(): void {
    for (const k of [...this.chunks.keys()]) this.free(k);
    this.group.removeFromParent();
    this.material.dispose();
  }

  private add(i: number, j: number, m: ChunkMesh): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(m.colors, 3, true));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.chunks.set(Island.chunkIndex(i, j), mesh);
    this.group.add(mesh);
  }

  private free(k: number): void {
    const mesh = this.chunks.get(k);
    if (!mesh) return;
    mesh.geometry.dispose();
    mesh.removeFromParent();
    this.chunks.delete(k);
  }

  private startReading(i: number, j: number): Reading {
    const n = GRID * GRID;
    return { i, j, col: 0, h: new Float32Array(n), cut: new Float32Array(n), kind: new Int8Array(n), road: new Float32Array(n), surface: new Uint8Array(n), laid: new Uint8Array(n) };
  }

  /** Read the chunk's points up to column `to` (not included). */
  private readColumns(r: Reading, to: number): void {
    const x0 = CHUNK_X0 + r.i * CHUNK, z0 = CHUNK_Z0 + r.j * CHUNK, p = this.probe, ground = this.island.ground;
    for (let c = r.col; c < to; c++) for (let row = 0; row < GRID; row++) {
      const k = row * GRID + c;
      ground.probe(x0 + c * STEP, z0 + row * STEP, p);
      r.h[k] = p.h;
      // kept: the land behind a steep shore's line, and a road's bank out over the water; not the hill in a tunnel's mouth,
      // nor the dry canal (its concrete lining is drawn over its channel, slice 9)
      const x = x0 + c * STEP, z = z0 + row * STEP, mouth = this.inMouth(x, z), canal = canalEdge(x, z);
      r.cut[k] = mouth ? -5 : Math.min(canal, Math.max(p.steep, BANK - p.road));
      r.kind[k] = mouth || canal < 0 ? IN_MOUTH : p.steepKind;
      r.road[k] = p.road;
      r.surface[k] = p.surface;
      r.laid[k] = gardensGround(x, z);
    }
    r.col = to;
  }

  /** In a tunnel's mouth: up to `MOUTH` m into the hill, within the tunnel's width. */
  private inMouth(x: number, z: number): boolean {
    for (const m of this.mouths) {
      const dx = x - m.x, dz = z - m.z, along = dx * m.ux + dz * m.uz, across = Math.abs(dz * m.ux - dx * m.uz);
      if (along > -1 && along < MOUTH && across < DECK.half + 2) return true;
    }
    return false;
  }

  /**
   * The chunk's mesh from its points: each point's allowance, the RTIN, the cut and its faces, the colours. A chunk
   * where the places' shapes pile up (a canal's end by a highway's rise and the sea) over the budget, `DENSE`, is built
   * again with its open ground `COARSER` (its roads, pavements and places' surfaces as tight): the budget holds.
   */
  private mesh(r: Reading): ChunkMesh {
    const n = GRID * GRID;
    for (let k = 0; k < n; k++) {
      const h = r.h[k] as number, road = r.road[k] as number;
      // (the botanic garden's lawn its own green; under a place's surface the grass's, which its edges show)
      this.tint[k] = ((r.laid[k] as number) & LAWN) !== 0 && h > SEA.level ? ISLAND_COLORS.lawn : cornerColour(((r.laid[k] as number) & LAID) !== 0 ? GRASS : (r.surface[k] as number), road, h);
    }
    const x0 = CHUNK_X0 + r.i * CHUNK, z0 = CHUNK_Z0 + r.j * CHUNK;
    for (const loose of [1, COARSER]) {
      for (let k = 0; k < n; k++) {
        const h = r.h[k] as number, road = r.road[k] as number;
        let a: number, b: number;
        if ((r.cut[k] as number) < -3) a = b = 1e6;
        // under a road's strip or a paved place's slab (4 cm over the ground, 3.5 the slabs) or a place's own surface
        // (the Gardens' paths and golf, 5 cm over): never over it
        else if (road < 0 || r.surface[k] === ASPHALT || ((r.laid[k] as number) & LAID) !== 0) { a = 0.036; b = 0.6; }
        else if (road < SHOULDER + 1) { a = 0.1; b = 0.3; }
        else if (h < SEA.level - 0.6) a = b = 3 * loose;
        else if (Math.abs(h - SEA.level) < 0.6) a = b = 0.08 * loose;
        else a = b = 0.3 * loose;
        this.above[k] = a;
        this.below[k] = b;
      }
      this.rtin.update(r.h, this.above, this.below, r.cut, CUT_SIZE);
      this.tris = 0;
      this.rtin.extract((ax, ay, bx, by, cx, cy) => this.triangle(r, x0, z0, ay * GRID + ax, by * GRID + bx, cy * GRID + cx));
      if (this.tris <= DENSE) break;
    }
    return { positions: this.pos.slice(0, this.tris * 9), colors: this.col.slice(0, this.tris * 9), triangles: this.tris };
  }

  /** The chunks built so far (the pins read how many are drawn). */
  get built(): number {
    return this.chunks.size;
  }

  /** One triangle of the RTIN (grid indices a, b, c): whole, dropped, or cut to its kept part with a face on the cut. */
  private triangle(r: Reading, x0: number, z0: number, a: number, b: number, c: number): void {
    const ka = (r.cut[a] as number) >= 0, kb = (r.cut[b] as number) >= 0, kc = (r.cut[c] as number) >= 0;
    if (!ka && !kb && !kc) return;
    const X = (k: number): number => x0 + (k % GRID) * STEP, Z = (k: number): number => z0 + Math.floor(k / GRID) * STEP;
    const tint = this.tint;
    if (ka && kb && kc) {
      const steep = this.face(X(a), r.h[a] as number, Z(a), X(b), r.h[b] as number, Z(b), X(c), r.h[c] as number, Z(c), tint[a] as number, tint[b] as number, tint[c] as number);
      // a skirt under an edge on the chunk's border hides the crack a coarser neighbour leaves
      for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
        const px = p % GRID, py = Math.floor(p / GRID), qx = q % GRID, qy = Math.floor(q / GRID);
        const out = px === qx && (px === 0 || px === GRID - 1) ? [px === 0 ? -1 : 1, 0] : py === qy && (py === 0 || py === GRID - 1) ? [0, py === 0 ? -1 : 1] : null;
        if (!out) continue;
        const cp = steep ? ISLAND_COLORS.rock : (tint[p] as number), cq = steep ? ISLAND_COLORS.rock : (tint[q] as number);
        this.hang(X(p), r.h[p] as number, Z(p), X(q), r.h[q] as number, Z(q), (r.h[p] as number) - SKIRT, (r.h[q] as number) - SKIRT, out[0] as number, out[1] as number, cp, cq);
      }
      return;
    }
    // the kept part: walk the corners in order, a crossing where the sign changes (its colour its kept end's)
    const ring: number[] = [], hue: number[] = [], cross: number[] = [];
    let first = -1;
    const corners = [a, b, c];
    for (let q = 0; q < 3; q++) {
      const p = corners[q] as number, s = corners[(q + 1) % 3] as number;
      const cp = r.cut[p] as number, cs = r.cut[s] as number;
      if (cp >= 0) { ring.push(X(p), r.h[p] as number, Z(p)); hue.push(tint[p] as number); if (first < 0) first = p; }
      if ((cp >= 0) !== (cs >= 0)) {
        const t = cp / (cp - cs);
        const x = X(p) + (X(s) - X(p)) * t, y = (r.h[p] as number) + ((r.h[s] as number) - (r.h[p] as number)) * t, z = Z(p) + (Z(s) - Z(p)) * t;
        ring.push(x, y, z);
        hue.push(tint[cp >= 0 ? p : s] as number);
        cross.push(x, y, z);
      }
    }
    for (let q = 1; q + 1 < hue.length; q++) {
      const o = q * 3;
      this.face(ring[0] as number, ring[1] as number, ring[2] as number, ring[o] as number, ring[o + 1] as number, ring[o + 2] as number, ring[o + 3] as number, ring[o + 4] as number, ring[o + 5] as number, hue[0] as number, hue[q] as number, hue[q + 1] as number);
    }
    if (cross.length === 6) this.wall(r, cross, first, a, b, c);
  }

  /**
   * The wall face under a cut's edge (the two crossings in `cross`), from the edge down to under the water, facing away
   * from the kept corners; none where the edge is at or under the water (a beach's).
   */
  private wall(r: Reading, cross: number[], kept: number, a: number, b: number, c: number): void {
    const [px, py, pz, qx, qy, qz] = cross as [number, number, number, number, number, number];
    if (Math.max(py, qy) <= SEA.level + 0.05) return;
    // a tunnel's mouth is cut open, no face
    for (const k of [a, b, c]) if ((r.cut[k] as number) < 0 && r.kind[k] === IN_MOUTH) return;
    // away from the kept corners: from their middle toward the edge's
    let kx = 0, kz = 0, kn = 0;
    const x0 = CHUNK_X0 + r.i * CHUNK, z0 = CHUNK_Z0 + r.j * CHUNK;
    for (const k of [a, b, c]) if ((r.cut[k] as number) >= 0) { kx += x0 + (k % GRID) * STEP; kz += z0 + Math.floor(k / GRID) * STEP; kn++; }
    const colour = FACE[COAST_KINDS[r.kind[kept] as number] ?? 'rocks'] ?? ISLAND_COLORS.rock;
    this.hang(px, py, pz, qx, qy, qz, FACE_BOTTOM, FACE_BOTTOM, (px + qx) / 2 - kx / kn, (pz + qz) / 2 - kz / kn, colour, colour);
  }

  /** A face hanging under the edge p → q down to the feet `pb`, `qb`, looking toward (ox, oz); each end its colour. */
  private hang(px: number, py: number, pz: number, qx: number, qy: number, qz: number, pb: number, qb: number, ox: number, oz: number, cp: number, cq: number): void {
    // the order p, q, q's foot faces right of p → q; the other order when that looks away from (ox, oz)
    if ((qz - pz) * ox - (qx - px) * oz >= 0) {
      this.push(px, py, pz, qx, qy, qz, qx, qb, qz, cp, cq, cq);
      this.push(px, py, pz, qx, qb, qz, px, pb, pz, cp, cq, cp);
    } else {
      this.push(qx, qy, qz, px, py, pz, px, pb, pz, cq, cp, cp);
      this.push(qx, qy, qz, px, pb, pz, qx, qb, qz, cq, cp, cq);
    }
  }

  /** A ground triangle, each corner its point's colour, all rock where the face is steep; whether it is. */
  private face(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, ca: number, cb: number, cc: number): boolean {
    // the face's normal's height share: how flat it lies
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const steep = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) < ROCK_NORMAL_Y && (ay + by + cy) / 3 > SEA.level;
    if (steep) this.push(ax, ay, az, bx, by, bz, cx, cy, cz, ISLAND_COLORS.rock, ISLAND_COLORS.rock, ISLAND_COLORS.rock);
    else this.push(ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc);
    return steep;
  }

  private push(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, ha: number, hb: number, hc: number): void {
    if ((this.tris + 1) * 9 > this.pos.length) {
      const pos = new Float32Array(this.pos.length * 2), col = new Uint8Array(this.col.length * 2);
      pos.set(this.pos);
      col.set(this.col);
      this.pos = pos;
      this.col = col;
    }
    const o = this.tris * 9;
    const p = this.pos;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz; p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    this.rgb(o, ha);
    this.rgb(o + 3, hb);
    this.rgb(o + 6, hc);
    this.tris++;
  }

  /** A colour into the mesh's bytes at `o` (linear, as the vertex colours are read). */
  private rgb(o: number, hex: number): void {
    this.color.setHex(hex);
    this.col[o] = Math.round(this.color.r * 255);
    this.col[o + 1] = Math.round(this.color.g * 255);
    this.col[o + 2] = Math.round(this.color.b * 255);
  }
}

/**
 * A ground point's colour: the seabed under the water, the beaches' sand (wet at the water), the quarry's dirt, the
 * verges beside the roads and under them (the strip draws the road; the paved places draw themselves), else the grass
 * by height, blended from the lowland's green to the summit's dry gold.
 */
export function cornerColour(surface: number, road: number, h: number): number {
  if (h < SEA.level - 0.15) return ISLAND_COLORS.seabed;
  if (surface === SAND) return h < SEA.level + 0.35 ? ISLAND_COLORS.wetSand : PALETTE.sand;
  if (surface === DIRT) return ISLAND_COLORS.dirt;
  if (road < SHOULDER + BLEND / 4) return ISLAND_COLORS.verge;
  return grassAt(h);
}

/** The grass's colour at a height: the bands' colours blended between their heights. */
function grassAt(h: number): number {
  const last = BANDS[BANDS.length - 1] as readonly [number, number];
  if (h >= last[0]) return last[1];
  for (let i = 0; i + 1 < BANDS.length; i++) {
    const [h0, c0] = BANDS[i] as readonly [number, number], [h1, c1] = BANDS[i + 1] as readonly [number, number];
    if (h > h1) continue;
    const t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
    const mix = (shift: number): number => Math.round(((c0 >> shift) & 255) * (1 - t) + ((c1 >> shift) & 255) * t);
    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
  }
  return (BANDS[0] as readonly [number, number])[1];
}

