/**
 * One instanced mesh for every pedestrian: a 72-triangle figure (torso, head,
 * two legs, two arms) with its origin at the feet. The sim writes the pose into
 * the transform (walk bob, dive pitch, fist shake), so the view only interpolates
 * transforms and uploads the shirt tint when it changes. Live pedestrians are
 * packed to the front of the instance buffer and `count` is the live number.
 */
import * as THREE from 'three';
import { CITY_COLORS, PALETTE } from '../sim/palette';
import type { Pedestrians } from '../sim/traffic/Pedestrians';
import type { TransformBuffer } from '../sim';

const PAINT = -1;

export class PedView {
  readonly mesh: THREE.InstancedMesh;
  private readonly packed: Int16Array;
  private readonly scratchM = new THREE.Matrix4();
  private readonly scratchP = new THREE.Vector3();
  private readonly scratchQ = new THREE.Quaternion();
  private readonly scratchS = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private tintSerial = -1;

  constructor(scene: THREE.Scene, private readonly peds: Pedestrians) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.InstancedMesh(buildFigure(), material, peds.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.packed = new Int16Array(peds.capacity).fill(-1);
    scene.add(this.mesh);
  }

  /** Pedestrian shadows only on the high tier. */
  setShadows(on: boolean): void {
    this.mesh.castShadow = on;
  }

  update(transforms: TransformBuffer, alpha: number): void {
    const peds = this.peds;
    const mesh = this.mesh;
    const retint = peds.tintSerial !== this.tintSerial;
    let n = 0;
    let wroteColor = false;
    for (let i = 0; i < peds.capacity; i++) {
      if (!peds.active[i]) continue;
      const slot = peds.slot[i] as number;
      const p = slot * 3;
      const r = slot * 4;
      this.scratchP.set(
        lerp(transforms.prevPos[p] as number, transforms.currPos[p] as number, alpha),
        lerp(transforms.prevPos[p + 1] as number, transforms.currPos[p + 1] as number, alpha),
        lerp(transforms.prevPos[p + 2] as number, transforms.currPos[p + 2] as number, alpha),
      );
      this.scratchQ.set(
        lerp(transforms.prevRot[r] as number, transforms.currRot[r] as number, alpha),
        lerp(transforms.prevRot[r + 1] as number, transforms.currRot[r + 1] as number, alpha),
        lerp(transforms.prevRot[r + 2] as number, transforms.currRot[r + 2] as number, alpha),
        lerp(transforms.prevRot[r + 3] as number, transforms.currRot[r + 3] as number, alpha),
      );
      this.scratchQ.normalize();
      mesh.setMatrixAt(n, this.scratchM.compose(this.scratchP, this.scratchQ, this.scratchS));
      if (retint || this.packed[n] !== i) {
        this.color.setHex(peds.tint[i] as number);
        mesh.setColorAt(n, this.color);
        this.packed[n] = i;
        wroteColor = true;
      }
      n++;
    }
    for (let k = n; k < peds.capacity; k++) {
      if (this.packed[k] === -1) break;
      this.packed[k] = -1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (wroteColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.tintSerial = peds.tintSerial;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Six boxes, feet at y = 0, facing +Z. Shirt vertices are white so the instance colour tints them. */
export function buildFigure(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: number): void => {
    if (color < 0) c.setRGB(1, 1, 1);
    else c.setHex(color);
    const faces: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [nx, ny, nz] of faces) {
      // two tangent axes for the face
      const ux = ny !== 0 ? 1 : 0, uy = 0, uz = ny !== 0 ? 0 : (nx !== 0 ? 0 : 1) * 0 + (nx !== 0 ? 0 : 0);
      const tx = nx !== 0 ? 0 : (nz !== 0 ? 1 : 1), ty = 0, tz = nx !== 0 ? 1 : 0;
      void ux; void uy; void uz; void tx; void ty; void tz;
      const corners: Array<[number, number, number]> = [];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
        let x: number, y: number, z: number;
        if (nx !== 0) { x = nx; y = a; z = b * nx; }
        else if (ny !== 0) { x = a; y = ny; z = -b * ny; }
        else { x = -a * nz; y = b; z = nz; }
        corners.push([cx + x * hx, cy + y * hy, cz + z * hz]);
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
  box(0, 1.2, 0, 0.2, 0.3, 0.12, PAINT);                 // torso (shirt, tinted)
  box(0, 1.68, 0, 0.11, 0.13, 0.11, CITY_COLORS.peach);   // head
  box(-0.1, 0.45, 0, 0.09, 0.45, 0.1, PALETTE.slate);     // legs
  box(0.1, 0.45, 0, 0.09, 0.45, 0.1, PALETTE.slate);
  box(-0.27, 1.2, 0, 0.06, 0.28, 0.07, PAINT);            // arms (shirt)
  box(0.27, 1.2, 0, 0.06, 0.28, 0.07, PAINT);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
}
