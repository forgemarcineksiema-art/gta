/**
 * The sim's own shapes (the test tracks' statics and dynamic bodies, the giant ball): built once from the sim's
 * descriptors, the dynamic ones placed each frame between the transform buffer's last two steps. `placeFromBuffer`
 * is that placing, for every object the renderer moves from the buffer.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type DynamicDesc, type ShapeDesc, type StaticDesc, type TransformBuffer } from '../sim';
import { gableGeometry, prismGeometry } from './geometry';

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/** Places an object `alpha` of the way from the buffer's previous step to its current one (0 = previous). */
export function placeFromBuffer(obj: THREE.Object3D, tb: TransformBuffer, slot: number, alpha: number): void {
  const p = slot * 3;
  const r = slot * 4;
  obj.position.set(
    lerp(tb.prevPos[p] as number, tb.currPos[p] as number, alpha),
    lerp(tb.prevPos[p + 1] as number, tb.currPos[p + 1] as number, alpha),
    lerp(tb.prevPos[p + 2] as number, tb.currPos[p + 2] as number, alpha),
  );
  qa.set(tb.prevRot[r] as number, tb.prevRot[r + 1] as number, tb.prevRot[r + 2] as number, tb.prevRot[r + 3] as number);
  qb.set(tb.currRot[r] as number, tb.currRot[r + 1] as number, tb.currRot[r + 2] as number, tb.currRot[r + 3] as number);
  obj.quaternion.slerpQuaternions(qa, qb, alpha);
}

export class ShapesView {
  private readonly dynamics: Array<{ object: THREE.Object3D; slot: number }> = [];

  constructor(private readonly scene: THREE.Scene, statics: readonly StaticDesc[]) {
    if (statics.length) this.buildStatics(statics);
  }

  addDynamic(d: DynamicDesc): void {
    const ball = d.shape.kind === 'ball';
    const g = d.shape.kind === 'ball' ? beachBall(d.shape.radius) : geometryFor(d.shape);
    const mesh = new THREE.Mesh(g, ball ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) : new THREE.MeshLambertMaterial({ color: d.color, flatShading: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.dynamics.push({ object: mesh, slot: d.slot });
  }

  /** Interpolate every dynamic body at `alpha` (0 = previous step, 1 = current). */
  update(tb: TransformBuffer, alpha: number): void {
    for (const d of this.dynamics) placeFromBuffer(d.object, tb, d.slot, alpha);
  }

  private buildStatics(statics: readonly StaticDesc[]): void {
    const geometries: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    for (const st of statics) {
      if (st.collisionOnly) continue;
      const g = geometryFor(st.shape);
      q.set(st.rotation.x, st.rotation.y, st.rotation.z, st.rotation.w);
      p.set(st.position.x, st.position.y, st.position.z);
      m.compose(p, q, sc);
      g.applyMatrix4(m);
      color.setHex(st.color);
      const n = g.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(g);
    }
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function geometryFor(shape: ShapeDesc): THREE.BufferGeometry {
  switch (shape.kind) {
    case 'box':
      return new THREE.BoxGeometry(shape.hx * 2, shape.hy * 2, shape.hz * 2);
    case 'gable':
      return gableGeometry().scale(shape.hx, shape.hy, shape.hz);
    case 'prism':
      return prismGeometry(shape.points, shape.y0, shape.y1);
    case 'cylinder':
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 10);
    case 'wheel': {
      const g = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.width, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }
    case 'ball':
      return new THREE.IcosahedronGeometry(shape.radius, 1);
  }
}

/** The giant ball (M5.5 slice 16): a beach ball, six gores in the palette's loud colours and white caps, flat-shaded. */
function beachBall(radius: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const gores = [PALETTE.carRed, PALETTE.coin, PALETTE.carBlue, PALETTE.carWhite, PALETTE.carLime, PALETTE.carOrange].map((h) => new THREE.Color(h));
  const cap = new THREE.Color(PALETTE.carWhite);
  for (let t = 0; t + 2 < pos.count; t += 3) {
    // the face's centroid picks its gore by longitude, or the cap near a pole
    const cx = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2);
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
    const gore = Math.floor((Math.atan2(cx, cz) / (Math.PI * 2) + 1) * 6) % 6;
    const c = Math.abs(cy) > radius * 0.8 ? cap : (gores[gore] as THREE.Color);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
