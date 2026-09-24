/**
 * The crowd (M5.5 slice 20): one instanced mesh per silhouette (pedMesh.ts).
 * The sim writes the body's pose into the transform (the walk's bob, the
 * dive's pitch, the fist's shake); the view interpolates the transforms,
 * uploads the tint when it changes and sets each instance's `anim` (the
 * gait's phase, the pose and how far into it) for the limbs. Live
 * pedestrians are packed to the front of their silhouette's buffer and
 * `count` is the live number.
 */
import * as THREE from 'three';
import { PED_LOOKS, PedPose, STRIDE, type Pedestrians } from '../../sim/traffic/Pedestrians';
import type { TransformBuffer } from '../../sim';
import { buildPed, pedMaterial } from './pedMesh';

const PHASE_PER_METRE = (Math.PI * 2) / STRIDE;
/** The fist's shake, rad/s (the sim's body shake runs at 25). */
const FIST_RATE = 25;

export class PedView {
  readonly meshes: THREE.InstancedMesh[];
  private readonly anims: THREE.InstancedBufferAttribute[];
  private readonly packed: Int16Array[];
  private readonly counts: Int32Array;
  private readonly wrote: Uint8Array;
  private readonly scratchM = new THREE.Matrix4();
  private readonly scratchP = new THREE.Vector3();
  private readonly scratchQ = new THREE.Quaternion();
  private readonly scratchS = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private tintSerial = -1;

  constructor(scene: THREE.Scene, private readonly peds: Pedestrians) {
    const material = pedMaterial();
    this.anims = [];
    this.packed = [];
    this.counts = new Int32Array(PED_LOOKS);
    this.wrote = new Uint8Array(PED_LOOKS);
    this.meshes = [];
    for (let look = 0; look < PED_LOOKS; look++) {
      const geometry = buildPed(look);
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(peds.capacity * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('anim', anim);
      const mesh = new THREE.InstancedMesh(geometry, material, peds.capacity);
      mesh.name = `peds-${look}`;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.anims.push(anim);
      this.packed.push(new Int16Array(peds.capacity).fill(-1));
    }
  }

  /** Pedestrian shadows only on the high tier. */
  setShadows(on: boolean): void {
    for (const mesh of this.meshes) mesh.castShadow = on;
  }

  update(transforms: TransformBuffer, alpha: number): void {
    const peds = this.peds;
    const retint = peds.tintSerial !== this.tintSerial;
    const counts = this.counts;
    counts.fill(0);
    this.wrote.fill(0);
    const clock = peds.clock;
    for (let i = 0; i < peds.capacity; i++) {
      if (!peds.active[i]) continue;
      const look = peds.look[i] as number;
      const mesh = this.meshes[look] as THREE.InstancedMesh;
      const pack = this.packed[look] as Int16Array;
      const n = counts[look] as number;
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
      // the limbs: the gait's phase and a stride's swing when walking, the pose and how far into it otherwise
      const pose = peds.pose[i] as PedPose, t = peds.poseFor[i] as number;
      const a = this.anims[look] as THREE.InstancedBufferAttribute;
      const k = n * 3;
      const arr = a.array as Float32Array;
      if (pose === PedPose.Walk || pose === PedPose.Approach) {
        arr[k] = (peds.gait[i] as number) * PHASE_PER_METRE;
        arr[k + 1] = Math.min(1.2, (peds.speed[i] as number) / 1.35);
        arr[k + 2] = 0;
      } else if (pose === PedPose.Dive) {
        arr[k] = 0;
        arr[k + 1] = Math.min(1, t / 0.2);
        arr[k + 2] = 1;
      } else if (pose === PedPose.GetUp) {
        arr[k] = 0;
        arr[k + 1] = Math.max(0, 1 - t / peds.tuning.getUpTime);
        arr[k + 2] = 2;
      } else if (pose === PedPose.Hail) {
        // the arm up and still, waving the taxi down
        arr[k] = 0;
        arr[k + 1] = 1;
        arr[k + 2] = 4;
      } else if (pose === PedPose.Ticket) {
        // writing the ticket (M5.5 slice 18)
        arr[k] = clock * 9 + i;
        arr[k + 1] = 1;
        arr[k + 2] = 5;
      } else {
        arr[k] = clock * FIST_RATE + i;
        arr[k + 1] = 1;
        arr[k + 2] = 3;
      }
      if (retint || pack[n] !== i) {
        this.color.setHex(peds.tint[i] as number);
        mesh.setColorAt(n, this.color);
        pack[n] = i;
        this.wrote[look] = 1;
      }
      counts[look] = n + 1;
    }
    for (let look = 0; look < PED_LOOKS; look++) {
      const mesh = this.meshes[look] as THREE.InstancedMesh;
      const pack = this.packed[look] as Int16Array;
      const n = counts[look] as number;
      for (let k = n; k < peds.capacity; k++) {
        if (pack[k] === -1) break;
        pack[k] = -1;
      }
      const visible = n > 0;
      if (mesh.visible !== visible) mesh.visible = visible;
      mesh.count = n;
      if (!visible) continue;
      mesh.instanceMatrix.needsUpdate = true;
      (this.anims[look] as THREE.InstancedBufferAttribute).needsUpdate = true;
      if (this.wrote[look] === 1 && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.tintSerial = peds.tintSerial;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
