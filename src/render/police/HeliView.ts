/**
 * The police helicopter (M5.5 slice 9): a white airframe with the police
 * band, a spinning rotor over a faint blur disc, a blinking bar, and the
 * searchlight as an additive cone down to a warm spot on the ground (or on
 * the deck the car is on). Shown while the air unit is on duty; reads the
 * sim only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type SimWorld } from '../../sim';

function part(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = out.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** The airframe: cabin, nose, glazing, the police band, tail boom and fin, skids. +Z forward. */
export function buildHeliBody(): THREE.BufferGeometry {
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const parts = [
    box(1.7, 1.5, 3.0, PALETTE.policeWhite, 0, 0, 0),
    box(1.4, 1.1, 1.3, PALETTE.policeWhite, 0, -0.15, 2.05),
    box(1.42, 0.62, 1.1, PALETTE.glassDark, 0, 0.2, 2.1),
    box(1.72, 0.6, 1.4, PALETTE.glassDark, 0, 0.35, 0.7),
    box(1.74, 0.28, 3.02, PALETTE.policeBlue, 0, -0.35, 0),
    box(0.36, 0.36, 4.6, PALETTE.policeWhite, 0, 0.35, -3.7),
    box(0.12, 1.3, 0.9, PALETTE.policeBlue, 0, 1.0, -5.8),
    box(1.6, 0.1, 0.5, PALETTE.policeWhite, 0, 0.45, -5.5),
    box(0.3, 0.45, 0.3, PALETTE.graphite, 0, 0.95, 0),
    box(0.08, 0.08, 3.3, PALETTE.graphite, 0.85, -1.15, 0.1),
    box(0.08, 0.08, 3.3, PALETTE.graphite, -0.85, -1.15, 0.1),
    box(0.06, 0.45, 0.06, PALETTE.graphite, 0.8, -0.9, 0.8),
    box(0.06, 0.45, 0.06, PALETTE.graphite, -0.8, -0.9, 0.8),
    box(0.06, 0.45, 0.06, PALETTE.graphite, 0.8, -0.9, -0.8),
    box(0.06, 0.45, 0.06, PALETTE.graphite, -0.8, -0.9, -0.8),
    box(0.5, 0.35, 0.5, PALETTE.charcoal, 0, -0.9, 1.6),
  ];
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}

export class HeliView {
  private readonly root = new THREE.Group();
  private readonly rotor = new THREE.Group();
  private readonly tailRotor = new THREE.Group();
  private readonly bar: THREE.Mesh;
  private readonly barMaterial: THREE.MeshBasicMaterial;
  private readonly cone: THREE.Mesh;
  private readonly spot: THREE.Mesh;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private blink = 0;

  constructor(scene: THREE.Scene, private readonly sim: SimWorld) {
    const body = new THREE.Mesh(buildHeliBody(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.root.add(body);
    const blade = new THREE.MeshLambertMaterial({ color: PALETTE.charcoal, flatShading: true });
    for (const a of [0, Math.PI / 2]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.28), blade);
      b.rotation.y = a;
      this.rotor.add(b);
    }
    const blur = new THREE.Mesh(new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PALETTE.slate, transparent: true, opacity: 0.18, depthWrite: false }));
    this.rotor.add(blur);
    this.rotor.position.set(0, 1.2, 0);
    this.root.add(this.rotor);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.16), blade);
    this.tailRotor.add(tb);
    this.tailRotor.position.set(0.12, 0.9, -5.9);
    this.root.add(this.tailRotor);
    this.barMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.2), this.barMaterial);
    this.bar.position.set(0, -0.8, 0.4);
    this.root.add(this.bar);
    // the searchlight: an open cone with its apex at the aircraft, and the warm spot where it lands
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.cone.frustumCulled = false;
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.root.visible = false;
    this.cone.visible = false;
    this.spot.visible = false;
    scene.add(this.root, this.cone, this.spot);
  }

  update(dt: number): void {
    const heli = this.sim.police?.heli;
    const on = heli?.active ?? false;
    if (this.root.visible !== on) { this.root.visible = on; this.cone.visible = on; this.spot.visible = on; }
    if (!heli || !on) return;
    this.root.position.set(heli.x, heli.y, heli.z);
    this.root.rotation.set(0, heli.yaw, 0);
    // a nose-down lean with its speed
    this.root.rotateX(Math.min(0.25, Math.hypot(heli.vx, heli.vz) * 0.006));
    this.rotor.rotation.y += dt * 38;
    this.tailRotor.rotation.x += dt * 60;
    this.blink += dt;
    this.barMaterial.color.setHex(Math.floor(this.blink * 3) % 2 === 0 ? 0xff3b5c : PALETTE.policeBlue);
    // the light lands on the car's road (the deck it drives, the ground elsewhere)
    const spot = this.sim.police?.tuning.heli.spot ?? 14;
    const near = Math.hypot(this.sim.probe.x - heli.lightX, this.sim.probe.z - heli.lightZ) < spot * 2;
    const groundY = near ? Math.max(0.06, this.sim.probe.y - 0.45) : 0.06;
    this.spot.position.set(heli.lightX, groundY, heli.lightZ);
    this.spot.scale.setScalar(spot);
    (this.spot.material as THREE.MeshBasicMaterial).opacity = heli.sees ? 0.42 : 0.24;
    // the cone from under the aircraft to the spot
    const top = this.top.set(heli.x, heli.y - 1, heli.z);
    this.dir.set(heli.lightX - top.x, groundY - top.y, heli.lightZ - top.z);
    const length = this.dir.length();
    this.cone.position.copy(top);
    this.cone.quaternion.setFromUnitVectors(this.up, this.dir.multiplyScalar(-1 / length));
    this.cone.scale.set(spot, length, spot);
  }
}
