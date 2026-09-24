/**
 * The destination arrow over the car (docs/M5_PLAN.md slice 1, DESIGN.md §4:
 * the Crazy Taxi arrow). One flat chevron in `carOrange`, 1.2 m long, fixed
 * size, floating 2.5 m above the roof. It points at the running job's target;
 * between jobs it points, dimmed to 40 %, at the nearest marker or at the
 * nearest door once the bag is worth banking. Hidden inside the cold open
 * until its delivery runs (the captions lead), behind the door and on the
 * busted card, and within a few metres of its target.
 *
 * A horizontal chevron is edge-on to a chase camera behind and below it, so
 * the chevron lies in a plane tipped 45° toward the camera and turns inside
 * that plane to the bearing: ahead points up the screen, behind points down,
 * a turn points sideways. Reads sim state only; no allocation per frame.
 */
import * as THREE from 'three';
import { PALETTE, type SimWorld } from '../../sim';
import { bearing } from '../../sim/math';

const LENGTH = 1.2;
const HALF_WIDTH = 0.55;
const THICKNESS = 0.12;
/** Metres above the car's body centre: its roof (about 0.8 m) and 2.5 m more. */
const LIFT = 3.3;
const IDLE_OPACITY = 0.4;
/** Closer than this to its target the arrow has nothing left to say (m). */
const HIDE_WITHIN = 6;

export class Arrow {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly target = { x: 0, z: 0, idle: false };
  private readonly toCam = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();

  constructor(scene: THREE.Scene, private readonly camera: THREE.Camera | null = null) {
    this.geometry = chevronGeometry();
    // unlit, like the markers: a signal, not a surface
    this.material = new THREE.MeshBasicMaterial({ color: PALETTE.carOrange, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(sim: SimWorld, carX: number, carY: number, carZ: number): void {
    const run = sim.run;
    const jobs = sim.jobs;
    const t = this.target;
    let show = run.state === 'running' && jobs.arrowTarget(t);
    // the cold open's captions lead until its delivery runs
    if (show && sim.coldOpen.active && (t.idle || jobs.active !== sim.coldOpen.job)) show = false;
    const dx = t.x - carX, dz = t.z - carZ;
    if (show && dx * dx + dz * dz < HIDE_WITHIN * HIDE_WITHIN) show = false;
    if (this.mesh.visible !== show) this.mesh.visible = show;
    if (!show) return;
    const opacity = t.idle ? IDLE_OPACITY : 1;
    if (this.material.opacity !== opacity) this.material.opacity = opacity;

    const y = carY + LIFT;
    this.mesh.position.set(carX, y, carZ);
    // the plane: tipped 45° toward the camera (behind the car when there is none)
    if (this.camera) {
      this.toCam.set(this.camera.position.x - carX, 0, this.camera.position.z - carZ);
    } else {
      this.toCam.set(-Math.sin(sim.probe.yaw), 0, -Math.cos(sim.probe.yaw));
    }
    if (this.toCam.lengthSq() < 1e-6) this.toCam.set(0, 0, -1);
    this.toCam.normalize();
    this.n.set(this.toCam.x, 1, this.toCam.z).normalize();
    // the bearing projected into that plane is where the tip points
    const b = bearing(carX, carZ, t.x, t.z);
    this.d.set(Math.sin(b), 0, Math.cos(b));
    this.d.addScaledVector(this.n, -this.d.dot(this.n));
    if (this.d.lengthSq() < 1e-6) this.d.set(0, 1, 0);
    this.d.normalize();
    this.e.crossVectors(this.n, this.d);
    this.basis.makeBasis(this.e, this.n, this.d);
    this.mesh.quaternion.setFromRotationMatrix(this.basis);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** A notched arrowhead in the local XZ plane, tip at +Z, extruded along Y: 2 + 2 faces and 4 sides, 12 triangles. */
function chevronGeometry(): THREE.BufferGeometry {
  const L = LENGTH / 2, W = HALF_WIDTH, h = THICKNESS / 2;
  const outline: Array<[number, number]> = [[0, L], [W, -L], [0, -L * 0.4], [-W, -L]];
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => { pos.push(...a, ...b, ...c); };
  const top = outline.map(([x, z]) => [x, h, z]);
  const bot = outline.map(([x, z]) => [x, -h, z]);
  const T = (i: number): number[] => top[i] as number[];
  const B = (i: number): number[] => bot[i] as number[];
  // two triangles each face: tip, right wing, notch; tip, notch, left wing
  tri(T(0), T(2), T(1)); tri(T(0), T(3), T(2));
  tri(B(0), B(1), B(2)); tri(B(0), B(2), B(3));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(T(i), T(j), B(j)); tri(T(i), B(j), B(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
