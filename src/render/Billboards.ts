/**
 * The 50 billboards as one instanced mesh: a panel on two posts, both panel
 * faces in the instance colour, the edges and posts fixed. Chunks hand over
 * their descriptors as their render tiles are claimed; an id is added once
 * and never removed (fifty resident instances cost nothing, fog hides the far
 * ones). A smashed id gets a zero-scale matrix. Matrices upload only on add
 * or smash.
 */
import * as THREE from 'three';
import { BILLBOARD_BOTTOM, BILLBOARD_HEIGHT, BILLBOARD_WIDTH, type BillboardDesc, type Collectibles } from '../sim/city/collectibles';
import { PALETTE } from '../sim/palette';

const CAPACITY = 50;
const UP = new THREE.Vector3(0, 1, 0);

export class Billboards {
  readonly mesh: THREE.InstancedMesh;
  private readonly slotOf = new Map<number, number>();
  private readonly descs: BillboardDesc[] = [];
  private readonly hidden = new Uint8Array(CAPACITY);
  private count = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.InstancedMesh(buildBillboard(), material, CAPACITY);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Register a chunk's billboards (idempotent per id). */
  add(boards: readonly BillboardDesc[]): void {
    let changed = false;
    for (const b of boards) {
      if (this.slotOf.has(b.id) || this.count >= CAPACITY) continue;
      const slot = this.count++;
      this.slotOf.set(b.id, slot);
      this.descs[slot] = b;
      this.q.setFromAxisAngle(UP, b.yaw);
      this.p.set(b.x, 0, b.z);
      this.s.set(b.width / BILLBOARD_WIDTH, 1, 1);
      this.mesh.setMatrixAt(slot, this.m.compose(this.p, this.q, this.s));
      this.color.setHex(b.paint);
      this.mesh.setColorAt(slot, this.color);
      changed = true;
    }
    if (changed) {
      this.mesh.count = this.count;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Hide what was smashed since the last call. */
  update(collectibles: Collectibles): void {
    let changed = false;
    for (let slot = 0; slot < this.count; slot++) {
      if (this.hidden[slot]) continue;
      const b = this.descs[slot];
      if (!b || !collectibles.smashed[b.id]) continue;
      this.hidden[slot] = 1;
      this.mesh.setMatrixAt(slot, this.m.makeScale(0, 0, 0));
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  descOf(id: number): BillboardDesc | null {
    const slot = this.slotOf.get(id);
    return slot === undefined ? null : (this.descs[slot] ?? null);
  }
}

/** Panel and posts, origin at ground level under the panel's centre, normal ±Z. Paintable vertices are white. */
export function buildBillboard(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, colorOf: (nx: number, ny: number, nz: number) => number): void => {
    const faces: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [nx, ny, nz] of faces) {
      const color = colorOf(nx, ny, nz);
      if (color < 0) c.setRGB(1, 1, 1); else c.setHex(color);
      // a right-handed tangent frame (u, v, n) so the corners wind counter-clockwise seen from outside
      const ux = ny, uy = nz, uz = nx;
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
      const hu = Math.abs(ux) * hx + Math.abs(uy) * hy + Math.abs(uz) * hz;
      const hv = Math.abs(vx) * hx + Math.abs(vy) * hy + Math.abs(vz) * hz;
      const hn = Math.abs(nx) * hx + Math.abs(ny) * hy + Math.abs(nz) * hz;
      const corners: Array<[number, number, number]> = [];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
        corners.push([
          cx + nx * hn + ux * a * hu + vx * b * hv,
          cy + ny * hn + uy * a * hu + vy * b * hv,
          cz + nz * hn + uz * a * hu + vz * b * hv,
        ]);
      }
      const tri = (i: number, j: number, k: number): void => {
        for (const q of [corners[i], corners[j], corners[k]] as Array<[number, number, number]>) {
          pos.push(q[0], q[1], q[2]);
          nrm.push(nx, ny, nz);
          col.push(c.r, c.g, c.b);
        }
      };
      tri(0, 1, 2);
      tri(0, 2, 3);
    }
  };
  const midY = BILLBOARD_BOTTOM + BILLBOARD_HEIGHT / 2;
  // panel: both faces paintable, the edges charcoal
  box(0, midY, 0, BILLBOARD_WIDTH / 2, BILLBOARD_HEIGHT / 2, 0.15, (_nx, _ny, nz) => (nz !== 0 ? -1 : PALETTE.charcoal));
  // a dark stripe along the bottom of each face
  for (const z of [0.16, -0.16]) box(0, BILLBOARD_BOTTOM + 0.2, z, BILLBOARD_WIDTH / 2 - 0.2, 0.16, 0.01, () => PALETTE.ink);
  const post = BILLBOARD_WIDTH / 2 - 0.5;
  for (const x of [-post, post]) box(x, BILLBOARD_BOTTOM / 2, 0, 0.08, BILLBOARD_BOTTOM / 2, 0.08, () => PALETTE.steel);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
}
