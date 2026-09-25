/**
 * One instanced mesh per body (M5.5 slice 19: the player's five shells and
 * the city's eight), built the first time a car of that body spawns (M7 slice
 * 6: most of the 28 never do in a session). Live agents are packed into the front of their body's
 * instance buffer and `count` is the live number, so zero-scale slots are not
 * submitted and an empty body is not drawn. Colours upload when an agent moves
 * into a slot or its paint changes; the paint mask keeps glass and lights
 * their own colour.
 */
import * as THREE from 'three';
import { BODY_IDS, BODY_INDEX, PALETTE, bodyTuning, type BodyId, type TransformBuffer } from '../../sim';
import { AgentState, type Traffic } from '../../sim/traffic/Traffic';
import { BODIES } from '../../sim/traffic/bodies';
import { BODY_PROFILES } from '../cars/bodyProfiles';
import { buildBodyGeometry, paintMaskMaterial } from '../cars/bodyMesh';
import { bikeShapeOf, bikeTrafficGeometry, riderTrafficGeometry } from '../cars/bikeMesh';
import { FADE, blocks, fadeTarget, stepFade } from '../camera/fade';

export class TrafficView {
  private readonly meshes: Array<THREE.InstancedMesh | null>;
  private readonly material: THREE.Material;
  private readonly packed: Int16Array[];
  private readonly counts: Int32Array;
  private readonly wrote: Uint8Array;
  /** Per body, 1 for a two-wheeler (M8.8 slice 16): a driven one carries a courier, drawn from `riders`. */
  private readonly twoWheel: Uint8Array;
  /** The couriers, an instanced mesh per two-wheeled body built with its first rider, and how many ride this frame. */
  private readonly riders: Array<THREE.InstancedMesh | null>;
  private readonly riderCounts: Int32Array;
  private readonly scratchM = new THREE.Matrix4();
  private readonly scratchP = new THREE.Vector3();
  private readonly scratchQ = new THREE.Quaternion();
  private readonly scratchS = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private paintSerial = -1;
  /** Seconds of frames drawn (the lowrider's hop). */
  private clock = 0;
  /** Per record: how much of the car is drawn (M8.6 D9), 1 whole, `FADE.floor` thinned in the camera's way. */
  readonly fade: Float32Array;

  constructor(private readonly scene: THREE.Scene, private readonly traffic: Traffic, private readonly civilians = true) {
    this.material = paintMaskMaterial();
    this.packed = BODY_IDS.map(() => new Int16Array(traffic.capacity).fill(-1));
    this.fade = new Float32Array(traffic.capacity).fill(1);
    this.counts = new Int32Array(BODY_IDS.length);
    this.wrote = new Uint8Array(BODY_IDS.length);
    this.meshes = BODY_IDS.map(() => null);
    this.twoWheel = Uint8Array.from(BODY_IDS, (id) => (bodyTuning(id).twoWheel > 0 ? 1 : 0));
    this.riders = BODY_IDS.map(() => null);
    this.riderCounts = new Int32Array(BODY_IDS.length);
  }

  /** The couriers on a two-wheeled body, built the first time one rides. */
  private riderFor(b: number): THREE.InstancedMesh {
    const built = this.riders[b];
    if (built) return built;
    const id = BODY_IDS[b] as BodyId;
    const geometry = riderTrafficGeometry(bikeShapeOf(id));
    geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(this.traffic.capacity).fill(1), 1));
    const mesh = new THREE.InstancedMesh(geometry, this.material, this.traffic.capacity);
    mesh.name = `traffic-${id}-rider`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    this.riders[b] = mesh;
    return mesh;
  }

  /** The body's mesh, built the first time a car of it is drawn. */
  private meshFor(b: number): THREE.InstancedMesh {
    const built = this.meshes[b];
    if (built) return built;
    const id = BODY_IDS[b] as (typeof BODY_IDS)[number];
    const geometry = trafficBodyGeometry(id);
    // what is drawn of each instance (M8.6 D9): the material's screen door reads it
    geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(this.traffic.capacity).fill(1), 1));
    const mesh = new THREE.InstancedMesh(geometry, this.material, this.traffic.capacity);
    mesh.name = `traffic-${id}`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    this.meshes[b] = mesh;
    return mesh;
  }

  /** How many bodies have a mesh built (M7 slice 6's pin). */
  get built(): number {
    let n = 0;
    for (const m of this.meshes) if (m) n++;
    return n;
  }

  /** How many two-wheeled bodies have their couriers' mesh built (M8.8 slice 16). */
  get ridersBuilt(): number {
    let n = 0;
    for (const m of this.riders) if (m) n++;
    return n;
  }

  /**
   * `eye` is the camera and `target` the player's car: a car whose box meets the line between them, or within
   * `FADE.near` of the camera, is thinned (M8.6 D9).
   */
  update(transforms: TransformBuffer, alpha: number, dt = 1 / 60, eye: THREE.Vector3 | null = null, target: THREE.Vector3 | null = null): void {
    const traffic = this.traffic;
    this.clock += 1 / 60;
    const repaint = traffic.paintSerial !== this.paintSerial;
    const counts = this.counts;
    counts.fill(0);
    this.wrote.fill(0);
    this.riderCounts.fill(0);
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] === AgentState.Free || (!this.civilians && !traffic.police[i])) continue;
      const b = traffic.body[i] as number;
      const mesh = this.meshFor(b);
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
      // a car the steamroller flattened (M8.8 slice 11): a quarter of its height, a tenth wider and longer
      const flat = traffic.flat[i] === 1;
      if (flat) this.scratchS.set(FLAT_SPREAD, FLAT_HEIGHT, FLAT_SPREAD);
      mesh.setMatrixAt(n, this.scratchM.compose(this.scratchP, this.scratchQ, this.scratchS));
      if (flat) this.scratchS.set(1, 1, 1);
      let fade = 1;
      if (eye && target) {
        const p = this.scratchP, q = this.scratchQ, spec = BODIES[b] as (typeof BODIES)[number];
        const inWay = blocks(eye.x, eye.y, eye.z, target.x, target.y + 0.6, target.z, p.x, p.y, p.z, q.x, q.y, q.z, q.w,
          spec.halfWidth, spec.stretch ? 1.15 : 0.75, spec.halfLength, FADE.grow);
        fade = stepFade(this.fade[i] as number, fadeTarget(inWay, Math.hypot(p.x - eye.x, p.y + 0.7 - eye.y, p.z - eye.z)), dt);
      }
      this.fade[i] = fade;
      (mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).setX(n, fade);
      // a courier rides a driven two-wheeler (M8.8 slice 16); a parked, left or wrecked one stands empty
      const state = traffic.state[i];
      if (this.twoWheel[b] === 1 && (state === AgentState.Kinematic || state === AgentState.Physical || state === AgentState.Disturbed)) {
        const rider = this.riderFor(b), k = this.riderCounts[b] as number;
        rider.setMatrixAt(k, this.scratchM);
        (rider.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).setX(k, fade);
        this.riderCounts[b] = k + 1;
      }
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
      const mesh = this.meshes[b];
      if (!mesh) continue;
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
      (mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).needsUpdate = true;
      if (this.wrote[b] === 1 && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let b = 0; b < this.riders.length; b++) {
      const rider = this.riders[b];
      if (!rider) continue;
      const n = this.riderCounts[b] as number;
      if (rider.visible !== n > 0) rider.visible = n > 0;
      rider.count = n;
      if (n === 0) continue;
      rider.instanceMatrix.needsUpdate = true;
      (rider.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.paintSerial = traffic.paintSerial;
  }
}

/** A body's instanced geometry: its loft, or a two-wheeler standing on its wheels without its rider (M8.8 slices 15–16). */
export function trafficBodyGeometry(id: BodyId): THREE.BufferGeometry {
  const t = bodyTuning(id);
  return t.twoWheel > 0 ? bikeTrafficGeometry(t, bikeShapeOf(id)) : buildBodyGeometry(BODY_PROFILES[id], t);
}

const LOWRIDER = BODY_INDEX.lowrider;
/** A flattened car's scale (M8.8 slice 11): its height, and its width and length. */
const FLAT_HEIGHT = 0.25;
const FLAT_SPREAD = 1.1;

/** The lowrider's hop (M6): up to 7 cm, twice a second, only while it stands still; `phase` offsets one car from another. */
export function lowriderBounce(time: number, speed: number, phase: number): number {
  if (speed > 0.8) return 0;
  const k = Math.sin(time * 6 + phase);
  return k > 0 ? k * 0.07 : 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
