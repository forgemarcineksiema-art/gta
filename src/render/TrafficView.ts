/**
 * One instanced mesh per vehicle class. Live agents are packed into the
 * front of the instance buffer and `count` is the live number, so zero-scale
 * slots are not submitted. Colours upload when an agent moves into a slot
 * or its paint changes.
 */
import * as THREE from 'three';
import { CAR_IDS, CAR_PRESETS, PALETTE, type TransformBuffer } from '../sim';
import { AgentState, type Traffic } from '../sim/traffic/Traffic';
import { CAR_PROFILES } from './carProfiles';
import { buildTrafficGeometry } from './trafficMesh';

export class TrafficView {
  private readonly meshes: THREE.InstancedMesh[];
  private readonly packed: Int16Array[];
  private readonly scratchM = new THREE.Matrix4();
  private readonly scratchP = new THREE.Vector3();
  private readonly scratchQ = new THREE.Quaternion();
  private readonly scratchS = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private paintSerial = -1;

  constructor(scene: THREE.Scene, private readonly traffic: Traffic) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.packed = CAR_IDS.map(() => {
      const ids = new Int16Array(traffic.capacity);
      ids.fill(-1);
      return ids;
    });
    this.meshes = CAR_IDS.map((id) => {
      const mesh = new THREE.InstancedMesh(buildTrafficGeometry(CAR_PROFILES[id], CAR_PRESETS[id]), material, traffic.capacity);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    });
  }

  update(transforms: TransformBuffer, alpha: number): void {
    const traffic = this.traffic;
    const repaint = traffic.paintSerial !== this.paintSerial;
    for (let kind = 0; kind < this.meshes.length; kind++) {
      const mesh = this.meshes[kind] as THREE.InstancedMesh;
      const pack = this.packed[kind] as Int16Array;
      let n = 0;
      let wroteColor = false;
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.state[i] === AgentState.Free || traffic.kind[i] !== kind) continue;
        const slot = traffic.slot[i] as number;
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
        if (repaint || pack[n] !== i) {
          const wrecked = traffic.state[i] === AgentState.Wrecked;
          this.color.setHex(wrecked ? PALETTE.charcoal : (traffic.paint[i] as number));
          mesh.setColorAt(n, this.color);
          pack[n] = i;
          wroteColor = true;
        }
        n++;
      }
      for (let k = n; k < traffic.capacity; k++) {
        if (pack[k] === -1) break;
        pack[k] = -1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (wroteColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.paintSerial = traffic.paintSerial;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
