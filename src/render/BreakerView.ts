/**
 * The pursuit breakers (M5.5 slice 18): eight scaffold towers, one instanced
 * mesh. A standing tower is upright on its pavement; a falling one topples
 * about its foot on the street side toward the carriageway over the fall's
 * time, easing in like something heavy going over; one down lies across the
 * lane; a cleared one is gone until the next run. Matrices are written only
 * while something moves or changes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type SimWorld } from '../sim';
import { BREAKER, BreakerState, type BreakerDesc } from '../sim/city/breakers';

const UP = new THREE.Vector3(0, 1, 0);

export class BreakerView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly shown: Int8Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly axis = new THREE.Vector3();
  private readonly yawQ = new THREE.Quaternion();

  constructor(scene: THREE.Scene, private readonly count: number) {
    this.mesh = new THREE.InstancedMesh(scaffold(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.max(1, count));
    this.mesh.name = 'breakers';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = count;
    this.shown = new Int8Array(count).fill(-1);
    scene.add(this.mesh);
  }

  update(sim: SimWorld): void {
    const b = sim.breakers;
    if (!b) return;
    let dirty = false;
    for (let k = 0; k < this.count; k++) {
      const st = b.state[k] as BreakerState;
      if (st === this.shown[k] && st !== BreakerState.Falling) continue;
      this.shown[k] = st;
      dirty = true;
      const d = b.descs[k] as BreakerDesc;
      if (st === BreakerState.Cleared) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(k, this.m);
        continue;
      }
      // toppling about the foot's street-side edge: the axis runs along the street
      const t = st === BreakerState.Standing ? 0 : st === BreakerState.Down ? 1 : Math.min(1, (sim.time - (b.fellAt[k] as number)) / BREAKER.fallSeconds);
      const angle = t * t * Math.PI / 2;
      // the tower is built facing +Z (its front toward the street): turn it to face the normal
      const yaw = Math.atan2(d.nx, d.nz);
      this.axis.set(Math.cos(yaw), 0, -Math.sin(yaw));
      this.q.setFromAxisAngle(this.axis, angle);
      this.q.multiply(this.yawQ.setFromAxisAngle(UP, yaw));
      // the pivot is the foot's street-side edge: the tower's origin sits there
      this.p.set(d.x + d.nx * BREAKER.halfDepth, 0, d.z + d.nz * BREAKER.halfDepth);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k, this.m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A scaffold tower, its origin at the middle of its foot's front edge (the street side), +Z toward the street:
 * four steel poles, a board deck every 2.2 m, a brace across the back, a green debris net down the front.
 */
function scaffold(): THREE.BufferGeometry {
  const w = BREAKER.halfWidth, dpt = BREAKER.halfDepth * 2, h = BREAKER.height;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): void => {
    g.translate(x, y, z);
    const c = new THREE.Color(color), n = g.getAttribute('position').count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  for (const x of [-w, w]) for (const z of [0, -dpt]) add(new THREE.BoxGeometry(0.08, h, 0.08), PALETTE.steel, x, h / 2, z);
  for (let y = 2.2; y < h; y += 2.2) add(new THREE.BoxGeometry(w * 2 + 0.1, 0.06, dpt + 0.1), PALETTE.sand, 0, y, -dpt / 2);
  const brace = new THREE.BoxGeometry(0.06, Math.hypot(w * 2, 2.2) + 0.1, 0.06);
  brace.rotateZ(Math.atan2(w * 2, 2.2));
  for (let y = 1.1; y < h - 1; y += 4.4) add(brace.clone(), PALETTE.steel, 0, y, -dpt);
  brace.dispose();
  add(new THREE.BoxGeometry(w * 2, h * 0.62, 0.02), PALETTE.carLime, 0, h * 0.55, 0.05);
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}
