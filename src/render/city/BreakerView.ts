/**
 * The pursuit breakers (M5.5 slice 18): eight tall things at the kerb, an instanced mesh a kind. A standing one is
 * upright on its pavement; a falling one topples about its foot on the street side toward the carriageway over the
 * fall's time, easing in like something heavy going over; one down lies across the lane; a cleared one is gone until
 * the next run. The grid's are scaffold towers; the island's (M8.10 slice 15) what each place has to hand, each at its
 * foot's height: scaffolds, stacked containers, a rock stack, a flatcar's lashed load, a pallet rack, a lifeguard's hut.
 * Matrices are written only while something moves or changes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_COLORS, ISLAND_COLORS, PALETTE, type SimWorld } from '../../sim';
import { BREAKER, BreakerState, type BreakerDesc, type BreakerKind } from '../../sim/city/breakers';

const UP = new THREE.Vector3(0, 1, 0);

export class BreakerView {
  /** A mesh a kind among the sim's, and each breaker's mesh and slot in it. */
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly meshOf: THREE.InstancedMesh[] = [];
  private readonly slotOf: number[] = [];
  private readonly shown: Int8Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly axis = new THREE.Vector3();
  private readonly yawQ = new THREE.Quaternion();

  constructor(scene: THREE.Scene, descs: readonly BreakerDesc[]) {
    const count = descs.length;
    const kinds = [...new Set(descs.map((d) => d.kind ?? 'scaffold'))];
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const kind of kinds) {
      const of = descs.filter((d) => (d.kind ?? 'scaffold') === kind);
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), material, Math.max(1, of.length));
      mesh.name = 'breakers';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = of.length;
      this.meshes.push(mesh);
      scene.add(mesh);
    }
    descs.forEach((d, k) => {
      const i = kinds.indexOf(d.kind ?? 'scaffold'), mesh = this.meshes[i] as THREE.InstancedMesh;
      this.meshOf[k] = mesh;
      this.slotOf[k] = descs.slice(0, k).filter((e) => (e.kind ?? 'scaffold') === (d.kind ?? 'scaffold')).length;
    });
    this.shown = new Int8Array(count).fill(-1);
  }

  update(sim: SimWorld): void {
    const b = sim.breakers;
    if (!b) return;
    for (let k = 0; k < this.shown.length; k++) {
      const st = b.state[k] as BreakerState;
      if (st === this.shown[k] && st !== BreakerState.Falling) continue;
      this.shown[k] = st;
      const d = b.descs[k] as BreakerDesc, mesh = this.meshOf[k] as THREE.InstancedMesh, slot = this.slotOf[k] as number;
      mesh.instanceMatrix.needsUpdate = true;
      if (st === BreakerState.Cleared) {
        this.m.makeScale(0, 0, 0);
        mesh.setMatrixAt(slot, this.m);
        continue;
      }
      // toppling about the foot's street-side edge: the axis runs along the street
      const t = st === BreakerState.Standing ? 0 : st === BreakerState.Down ? 1 : Math.min(1, (sim.time - (b.fellAt[k] as number)) / BREAKER.fallSeconds);
      const angle = t * t * Math.PI / 2;
      // built facing +Z (its front toward the street): turned to face the normal
      const yaw = Math.atan2(d.nx, d.nz);
      this.axis.set(Math.cos(yaw), 0, -Math.sin(yaw));
      this.q.setFromAxisAngle(this.axis, angle);
      this.q.multiply(this.yawQ.setFromAxisAngle(UP, yaw));
      // the pivot is the foot's street-side edge: the thing's origin sits there, at its foot's height
      this.p.set(d.x + d.nx * BREAKER.halfDepth, d.y ?? 0, d.z + d.nz * BREAKER.halfDepth);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(slot, this.m);
    }
  }
}

/** Parts in their colours, merged: `box(w, h, d, colour, x, y, z)` about their middles, origin at the foot's front edge. */
function parts(build: (box: (w: number, h: number, d: number, colour: number, x: number, y: number, z: number, g?: THREE.BufferGeometry) => void) => void): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  build((w, h, d, colour, x, y, z, geometry) => {
    const g = geometry ?? new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const c = new THREE.Color(colour), n = g.getAttribute('position').count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    list.push(g.index ? g.toNonIndexed() : g);
  });
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged;
}

const GEOMETRY: Readonly<Record<BreakerKind, () => THREE.BufferGeometry>> = { scaffold, containers, rocks, flatcar, pallets, huts };

/**
 * A scaffold tower, its origin at the middle of its foot's front edge (the street side), +Z toward the street:
 * four steel poles, a board deck every 2.2 m, a brace across the back, a green debris net down the front.
 */
function scaffold(): THREE.BufferGeometry {
  const w = BREAKER.halfWidth, dpt = BREAKER.halfDepth * 2, h = BREAKER.height;
  return parts((box) => {
    for (const x of [-w, w]) for (const z of [0, -dpt]) box(0.08, h, 0.08, PALETTE.steel, x, h / 2, z);
    for (let y = 2.2; y < h; y += 2.2) box(w * 2 + 0.1, 0.06, dpt + 0.1, PALETTE.sand, 0, y, -dpt / 2);
    const brace = new THREE.BoxGeometry(0.06, Math.hypot(w * 2, 2.2) + 0.1, 0.06);
    brace.rotateZ(Math.atan2(w * 2, 2.2));
    for (let y = 1.1; y < h - 1; y += 4.4) box(0, 0, 0, PALETTE.steel, 0, y, -dpt, brace.clone());
    brace.dispose();
    box(w * 2, h * 0.62, 0.02, PALETTE.carLime, 0, h * 0.55, 0.05);
  });
}

/** Two containers stood on end, one on the other, lashed: ribbed sides, their doors' bars, the top one's roof. */
function containers(): THREE.BufferGeometry {
  const w = BREAKER.halfWidth, h = BREAKER.height / 2, d = w * 2;
  return parts((box) => {
    [PALETTE.carOrange, PALETTE.carBlue].forEach((colour, k) => {
      const y0 = k * h;
      box(w * 2, h - 0.05, d, colour, 0, y0 + h / 2, -d / 2);
      // the ribs down each face, a shade darker (steel)
      for (let r = -2; r <= 2; r++) for (const z of [0.02, -d - 0.02]) box(0.08, h - 0.4, 0.04, PALETTE.graphite, (r * w) / 2.6, y0 + h / 2, z);
      // the corner castings
      for (const x of [-w, w]) for (const z of [0, -d]) for (const y of [y0 + 0.15, y0 + h - 0.2]) box(0.25, 0.25, 0.25, PALETTE.charcoal, x, y, z);
    });
    // the lashing straps round both
    for (const y of [h - 0.4, h + 0.4]) box(w * 2 + 0.06, 0.1, d + 0.06, PALETTE.carLime, 0, y, -d / 2);
  });
}

/** The quarry's rock stack: boulders of the cliff's and the rock's colours, smaller up, each set a hand off the last. */
function rocks(): THREE.BufferGeometry {
  const sizes = [[2.8, 2.4, 1.7], [2.5, 2.3, 1.5], [2.2, 2.2, 1.4], [1.8, 2.0, 1.2], [1.3, 1.9, 1.0]] as const;
  return parts((box) => {
    let y = 0;
    sizes.forEach(([w, h, d], k) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY((k % 2 === 0 ? 0.25 : -0.3));
      g.rotateZ(k % 2 === 0 ? 0.06 : -0.08);
      box(0, 0, 0, k % 2 === 0 ? ISLAND_COLORS.rock : ISLAND_COLORS.cliff, (k % 2 === 0 ? 0.15 : -0.15), y + h / 2, -d / 2 - 0.1, g);
      y += h - 0.12;
    });
  });
}

/** A flatcar stood at the kerb with its load of timber lashed high on its deck: the frame, the wheels, the planks, the straps. */
function flatcar(): THREE.BufferGeometry {
  const w = BREAKER.halfWidth, d = BREAKER.halfDepth * 2, h = BREAKER.height;
  return parts((box) => {
    box(w * 2 + 0.3, 0.35, d + 0.4, PALETTE.graphite, 0, 0.75, -d / 2);
    for (const x of [-w * 0.7, w * 0.7]) for (const z of [0.05, -d - 0.05]) box(0.6, 0.6, 0.12, PALETTE.charcoal, x, 0.3, z);
    for (let y = 0.95, k = 0; y < h - 0.3; y += 0.45, k++) box(w * 2 - (k % 3) * 0.1, 0.4, d - 0.05, k % 2 === 0 ? ISLAND_COLORS.timber : CITY_COLORS.soil, 0, y + 0.2, -d / 2);
    for (let y = 2; y < h; y += 2.5) box(w * 2 + 0.06, 0.12, d + 0.06, PALETTE.carOrange, 0, y, -d / 2);
    for (const x of [-w - 0.08, w + 0.08]) box(0.12, h - 1, 0.12, PALETTE.steel, x, (h + 1) / 2, -d / 2);
  });
}

/** The garden centre's pallet rack: red uprights, a shelf of pallets every 2.2 m, plants and pots on them. */
function pallets(): THREE.BufferGeometry {
  const w = BREAKER.halfWidth, dpt = BREAKER.halfDepth * 2, h = BREAKER.height;
  return parts((box) => {
    for (const x of [-w, w]) for (const z of [0, -dpt]) box(0.12, h, 0.12, PALETTE.carRed, x, h / 2, z);
    for (let y = 0.2, k = 0; y < h - 1; y += 2.2, k++) {
      box(w * 2 + 0.1, 0.1, dpt + 0.1, PALETTE.carOrange, 0, y, -dpt / 2);
      box(w * 2 - 0.2, 0.18, dpt - 0.1, ISLAND_COLORS.timber, 0, y + 0.14, -dpt / 2);
      for (const x of [-w * 0.55, 0, w * 0.55]) {
        box(0.5, 0.45, 0.5, k % 2 === 0 ? CITY_COLORS.brick : CITY_COLORS.soil, x, y + 0.45, -dpt / 2);
        box(0.8, 0.7, 0.7, (k + (x > 0 ? 1 : 0)) % 2 === 0 ? CITY_COLORS.hedge : CITY_COLORS.leaves, x, y + 1.0, -dpt / 2);
      }
    }
  });
}

/** A lifeguard's hut on its tall legs: white legs braced, the hut with its window and its red roof, a flag over it. */
function huts(): THREE.BufferGeometry {
  const w = BREAKER.halfWidth, dpt = BREAKER.halfDepth * 2, legs = 7.4, h = BREAKER.height;
  return parts((box) => {
    for (const x of [-w + 0.1, w - 0.1]) for (const z of [0, -dpt]) box(0.18, legs, 0.18, PALETTE.barrier, x, legs / 2, z);
    for (let y = 1.5; y < legs; y += 2.4) box(w * 2, 0.1, 0.1, PALETTE.barrier, 0, y, 0);
    box(w * 2 + 0.3, 2.3, dpt + 0.6, PALETTE.carRed, 0, legs + 1.15, -dpt / 2);
    box(w * 1.2, 0.8, 0.04, PALETTE.glassDark, 0, legs + 1.4, 0.32);
    box(w * 2 + 0.7, 0.35, dpt + 1.0, PALETTE.barrier, 0, legs + 2.45, -dpt / 2);
    box(0.08, h - legs - 2.6, 0.08, PALETTE.steel, 0, (legs + 2.6 + h) / 2, -dpt / 2);
    box(0.9, 0.5, 0.04, PALETTE.carOrange, 0.47, h - 0.4, -dpt / 2);
  });
}
