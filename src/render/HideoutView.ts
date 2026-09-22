/**
 * The drop-offs' roller doors (docs/STYLE.md, the hideout): a charcoal panel
 * with a carOrange bar along its bottom edge, unrolling down from the lintel
 * while the run's door closes and hidden while it is up, so an open door costs
 * no draw call. The garage walls are chunk statics; the totals are DOM.
 * Reads sim state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARAGE, PALETTE, type SimWorld } from '../sim';

export class HideoutView {
  private readonly doors: THREE.Mesh[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, sim: SimWorld) {
    this.geometry = doorGeometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const site of sim.run.dropOffs) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      // the panel hangs from the lintel: its top edge is the geometry's origin
      mesh.position.set(site.door.x, GARAGE.doorHeight, site.door.z);
      mesh.rotation.y = site.yaw;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = true;
      scene.add(mesh);
      this.doors.push(mesh);
    }
  }

  update(sim: SimWorld): void {
    const run = sim.run;
    for (let i = 0; i < this.doors.length; i++) {
      const door = this.doors[i] as THREE.Mesh;
      const p = run.dropOff === i ? run.doorProgress : 0;
      const visible = p > 0.001;
      if (door.visible !== visible) door.visible = visible;
      if (visible && door.scale.y !== p) door.scale.y = p;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** A unit-height panel from y = 0 down to y = -doorHeight, the bottom 7 % in carOrange. */
function doorGeometry(): THREE.BufferGeometry {
  const w = GARAGE.doorWidth, h = GARAGE.doorHeight, t = GARAGE.doorThickness;
  const bar = h * 0.07;
  const panel = new THREE.BoxGeometry(w, h - bar, t).translate(0, -(h - bar) / 2, 0);
  const stripe = new THREE.BoxGeometry(w, bar, t * 1.1).translate(0, -h + bar / 2, 0);
  const paint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  };
  const merged = mergeGeometries([paint(panel, PALETTE.charcoal), paint(stripe, PALETTE.carOrange)], false);
  panel.dispose();
  stripe.dispose();
  return merged;
}
