/**
 * One instanced mesh per body (M5.5 slice 19: the player's five shells and
 * the city's eight). Live agents are packed into the front of their body's
 * instance buffer and `count` is the live number, so zero-scale slots are not
 * submitted and an empty body is not drawn. Colours upload when an agent moves
 * into a slot or its paint changes; the paint mask keeps glass and lights
 * their own colour.
 */
import * as THREE from 'three';
import { BODY_IDS, BODY_INDEX, PALETTE, bodyTuning, type TransformBuffer } from '../sim';
import { AgentState, type Traffic } from '../sim/traffic/Traffic';
import { BODY_PROFILES } from './bodyProfiles';
import { buildBodyGeometry, paintMaskMaterial } from './bodyMesh';

export class TrafficView {
  private readonly meshes: THREE.InstancedMesh[];
  private readonly packed: Int16Array[];
  private readonly counts: Int32Array;
  private readonly wrote: Uint8Array;
  private readonly scratchM = new THREE.Matrix4();
  private readonly scratchP = new THREE.Vector3();
  private readonly scratchQ = new THREE.Quaternion();
  private readonly scratchS = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private paintSerial = -1;
  /** Seconds of frames drawn (the lowrider's hop). */
  private clock = 0;

  constructor(scene: THREE.Scene, private readonly traffic: Traffic, private readonly civilians = true) {
    const material = paintMaskMaterial();
    this.packed = BODY_IDS.map(() => new Int16Array(traffic.capacity).fill(-1));
    this.counts = new Int32Array(BODY_IDS.length);
    this.wrote = new Uint8Array(BODY_IDS.length);
    this.meshes = BODY_IDS.map((id) => {
      const mesh = new THREE.InstancedMesh(buildBodyGeometry(BODY_PROFILES[id], bodyTuning(id)), material, traffic.capacity);
      mesh.name = `traffic-${id}`;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });
  }

  update(transforms: TransformBuffer, alpha: number): void {
    const traffic = this.traffic;
    this.clock += 1 / 60;
    const repaint = traffic.paintSerial !== this.paintSerial;
    const counts = this.counts;
    counts.fill(0);
    this.wrote.fill(0);
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] === AgentState.Free || (!this.civilians && !traffic.police[i])) continue;
      const b = traffic.body[i] as number;
      const mesh = this.meshes[b] as THREE.InstancedMesh;
      const pack = this.packed[b] as Int16Array;
      const n = counts[b] as number;
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
      // Neon Niko's lowrider hops on its hydraulics while it waits (M6)
      if (b === LOWRIDER) this.scratchP.y += lowriderBounce(this.clock, traffic.speed[i] as number, i);
      mesh.setMatrixAt(n, this.scratchM.compose(this.scratchP, this.scratchQ, this.scratchS));
      if (repaint || pack[n] !== i) {
        const wrecked = traffic.state[i] === AgentState.Wrecked;
        this.color.setHex(wrecked ? PALETTE.charcoal : traffic.police[i] ? PALETTE.policeWhite : (traffic.paint[i] as number));
        mesh.setColorAt(n, this.color);
        pack[n] = i;
        this.wrote[b] = 1;
      }
      counts[b] = n + 1;
    }
    for (let b = 0; b < this.meshes.length; b++) {
      const mesh = this.meshes[b] as THREE.InstancedMesh;
      const pack = this.packed[b] as Int16Array;
      const n = counts[b] as number;
      for (let k = n; k < traffic.capacity; k++) {
        if (pack[k] === -1) break;
        pack[k] = -1;
      }
      const visible = n > 0;
      if (mesh.visible !== visible) mesh.visible = visible;
      mesh.count = n;
      if (!visible) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (this.wrote[b] === 1 && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.paintSerial = traffic.paintSerial;
  }
}

const LOWRIDER = BODY_INDEX.lowrider;

/** The lowrider's hop (M6): up to 7 cm, twice a second, only while it stands still; `phase` offsets one car from another. */
export function lowriderBounce(time: number, speed: number, phase: number): number {
  if (speed > 0.8) return 0;
  const k = Math.sin(time * 6 + phase);
  return k > 0 ? k * 0.07 : 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
