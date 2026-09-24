/**
 * The street furniture that is down (M8, docs/M8_PLAN.md D5): a flying, lying or arcing prop is drawn by its kind's
 * instanced mesh from the sim's poses (the flying ones between the last step's pose and this one's), while its
 * standing self is collapsed out of its chunk's mesh (CityView). A kind with nothing down is hidden: an instanced
 * mesh with no instances still costs a draw call (the M7 gate, pin G.3). No allocation per frame; a kind's mesh
 * grows (doubles) the rare time more of it lie at once than it holds.
 */
import * as THREE from 'three';
import { PROPS, PROP_KINDS, PROP_TYPES, PropState, type PropKind, type SimWorld, type StaticDesc } from '../sim';
import { cityGeometry } from './CityView';
import { propStatics } from './propMesh';

/** Instances a kind's mesh holds at first. */
const START = 32;

interface KindMesh { mesh: THREE.InstancedMesh; capacity: number; count: number }

/** A kind's model as one geometry about the middle of its shape (where the sim's pose puts it). */
export function propGeometry(kind: PropKind): THREE.BufferGeometry {
  const statics: StaticDesc[] = [];
  propStatics({ id: 0, kind, x: 0, z: 0, yaw: 0 }, statics);
  const s = PROP_TYPES[kind].shape, half = s.kind === 'box' ? s.hy : s.halfHeight;
  for (const st of statics) {
    delete st.prop;
    st.detailOnly = false;
    st.position = { x: st.position.x, y: st.position.y - half, z: st.position.z };
  }
  return cityGeometry(statics, true);
}

export class PropsView {
  private readonly meshes: Array<KindMesh | null> = PROP_KINDS.map(() => null);
  private readonly geometries: Array<THREE.BufferGeometry | null> = PROP_KINDS.map(() => null);
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly size = new THREE.Vector3();
  private readonly upright = new THREE.Quaternion();
  /** A broken hydrant's water: a column over each jet, its height with the jet's life (slice 5 makes it spray). */
  private readonly columns: THREE.InstancedMesh;

  constructor(private readonly scene: THREE.Scene, private readonly sim: SimWorld) {
    const column = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    this.columns = new THREE.InstancedMesh(column, new THREE.MeshLambertMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.7 }), PROPS.jet.max);
    this.columns.name = 'props-water';
    this.columns.frustumCulled = false;
    this.columns.count = 0;
    this.columns.visible = false;
    scene.add(this.columns);
  }

  /** This frame's poses: every prop that is down, by kind; `alpha` between the last step and this one; `time` (s) moves the water. */
  update(sim: SimWorld = this.sim, alpha = 1, time = 0): void {
    const props = sim.props;
    if (!props) return;
    for (const km of this.meshes) if (km) km.count = 0;
    const pose = props.pose, prev = props.prev;
    for (let i = 0; i < props.downCount; i++) {
      const id = props.down[i] as number;
      const k = props.kind[id] as number;
      if (k === 255) continue;
      const km = this.meshFor(k, 1);
      const o = id * 7;
      const moving = props.state[id] === PropState.Flying || props.state[id] === PropState.Ballistic;
      const a = moving ? alpha : 1;
      this.p.set(
        (prev[o] as number) + ((pose[o] as number) - (prev[o] as number)) * a,
        (prev[o + 1] as number) + ((pose[o + 1] as number) - (prev[o + 1] as number)) * a,
        (prev[o + 2] as number) + ((pose[o + 2] as number) - (prev[o + 2] as number)) * a,
      );
      this.q.set(pose[o + 3] as number, pose[o + 4] as number, pose[o + 5] as number, pose[o + 6] as number);
      if (moving) {
        this.qb.set(prev[o + 3] as number, prev[o + 4] as number, prev[o + 5] as number, prev[o + 6] as number);
        this.q.copy(this.qb.slerp(this.q, a));
      }
      this.m.compose(this.p, this.q, this.one);
      km.mesh.setMatrixAt(km.count++, this.m);
    }
    for (const km of this.meshes) {
      if (!km) continue;
      km.mesh.count = km.count;
      km.mesh.visible = km.count > 0;
      if (km.count > 0) km.mesh.instanceMatrix.needsUpdate = true;
    }
    let jets = 0;
    const jet = PROPS.jet;
    for (let j = 0; j < jet.max; j++) {
      const left = props.jets[j * 3 + 2] as number;
      if (left <= 0) continue;
      // full for most of its life, sinking over its last three seconds; its top never still
      const h = 7 * Math.min(1, left / 3) * (0.94 + 0.06 * Math.sin(time * 9 + j * 1.7));
      this.p.set(props.jets[j * 3] as number, 0, props.jets[j * 3 + 1]);
      this.size.set(0.35, h, 0.35);
      this.m.compose(this.p, this.upright, this.size);
      this.columns.setMatrixAt(jets++, this.m);
    }
    this.columns.count = jets;
    this.columns.visible = jets > 0;
    if (jets > 0) this.columns.instanceMatrix.needsUpdate = true;
  }

  /** A kind's mesh with room for `more` instances past its count (made the first time, doubled when full). */
  private meshFor(k: number, more: number): KindMesh {
    const km = this.meshes[k] ?? null;
    if (km && km.count + more <= km.capacity) return km;
    const kind = PROP_KINDS[k] as PropKind;
    const geometry = this.geometries[k] ?? propGeometry(kind);
    this.geometries[k] = geometry;
    const capacity = km ? km.capacity * 2 : START;
    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    mesh.name = `props-${kind}`;
    mesh.frustumCulled = false;
    mesh.castShadow = PROP_TYPES[kind].tall;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.count = 0;
    if (km) {
      // carry the instances written so far this frame
      for (let i = 0; i < km.count; i++) { km.mesh.getMatrixAt(i, this.m); mesh.setMatrixAt(i, this.m); }
      this.scene.remove(km.mesh);
      km.mesh.dispose();
    }
    this.scene.add(mesh);
    const next: KindMesh = { mesh, capacity, count: km ? km.count : 0 };
    this.meshes[k] = next;
    return next;
  }

  dispose(): void {
    this.scene.remove(this.columns);
    this.columns.dispose();
    for (const km of this.meshes) if (km) { this.scene.remove(km.mesh); km.mesh.dispose(); }
    for (const g of this.geometries) g?.dispose();
    this.material.dispose();
  }
}
