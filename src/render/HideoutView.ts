/**
 * The drop-offs' roller doors (docs/STYLE.md, the hideout): a charcoal panel
 * with a carOrange bar along its bottom edge, unrolling down from the lintel
 * while the run's door closes and hidden while it is up, so an open door costs
 * no draw call. And the garage's things along its walls (M5.5, DESIGN.md §13.6):
 * a pegboard with tools over a workbench and its lamp, a stack of tyres by the
 * door, an oil drum, a hose on its hook, a shelf of boxes, the wanted poster on
 * the back wall: one merged mesh a garage, no shadows, the floor the car needs
 * left clear. The garage walls are chunk statics; the totals are DOM. Reads sim
 * state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARAGE, PALETTE, type SimWorld } from '../sim';

export class HideoutView {
  private readonly doors: THREE.Mesh[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly propsGeometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, sim: SimWorld) {
    this.geometry = doorGeometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.propsGeometry = propsGeometry();
    for (const site of sim.run.dropOffs) {
      const props = new THREE.Mesh(this.propsGeometry, this.material);
      props.position.set(site.x, GARAGE.floorTop, site.z);
      props.rotation.y = site.yaw;
      props.castShadow = false;
      props.receiveShadow = false;
      props.updateMatrix();
      props.matrixAutoUpdate = false;
      scene.add(props);
    }
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
    this.propsGeometry.dispose();
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

/** A geometry in one vertex colour. */
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * The garage's things in its own frame: `along` from the door (-10) to the back wall (+10), `across` to the right
 * of the way in, `y` up from the floor. The mesh's local +x is the left, so a thing at `across` sits at x = -across.
 * Everything stands against a side wall (inner faces at ±6.7) or on the back wall; nothing past ±5.9 across.
 */
export function propsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, along: number, across: number, y: number, hex: number): void => {
    // w across, h up, d along; (along, across, y) is the box's centre
    parts.push(paint(new THREE.BoxGeometry(w, h, d).translate(-across, y, along), hex));
  };
  const drum = (r: number, h: number, along: number, across: number, y: number, hex: number, onWall = false): void => {
    const g = new THREE.CylinderGeometry(r, r, h, 12);
    if (onWall) g.rotateZ(Math.PI / 2);
    parts.push(paint(g.translate(-across, y, along), hex));
  };
  const wallL = -6.7, wallR = 6.7;
  // the workbench on the left wall: a top, two legs, a shelf, and its lamp
  box(0.75, 0.08, 4, 3.5, wallL + 0.38, 0.9, PALETTE.graphite);
  for (const a of [1.7, 5.3]) box(0.08, 0.86, 0.08, a, wallL + 0.66, 0.43, PALETTE.steel);
  box(0.7, 0.05, 3.8, 3.5, wallL + 0.38, 0.3, PALETTE.charcoal);
  box(0.25, 0.35, 0.3, 4.6, wallL + 0.3, 1.12, PALETTE.carOrange);
  box(0.12, 0.08, 0.5, 4.6, wallL + 0.45, 1.33, PALETTE.carOrange);
  // the pegboard over it, and its tools
  box(0.05, 1.2, 3, 3.5, wallL + 0.03, 1.85, PALETTE.sand);
  const tools: Array<[number, number, number, number, number]> = [
    // along, y, height, length along, colour
    [2.3, 2.1, 0.5, 0.08, PALETTE.steel], [2.7, 2.0, 0.35, 0.3, PALETTE.carRed], [3.2, 2.15, 0.55, 0.06, PALETTE.silver],
    [3.7, 1.9, 0.25, 0.4, PALETTE.charcoal], [4.3, 2.05, 0.45, 0.1, PALETTE.carBlue], [4.75, 1.75, 0.3, 0.3, PALETTE.steel],
  ];
  for (const [a, y, h, d, c] of tools) box(0.06, h, d, a, wallL + 0.08, y, c);
  // four tyres stacked by the door on the left
  for (let k = 0; k < 4; k++) drum(0.34, 0.24, -6.8, wallL + 0.5, 0.13 + k * 0.25, PALETTE.rubber);
  // on the right: an oil drum, the hose coiled on its hook, a shelf of boxes
  drum(0.3, 0.9, 5.2, wallR - 0.4, 0.45, PALETTE.carRed);
  box(0.02, 0.06, 0.62, 5.2, wallR - 0.4, 0.62, PALETTE.ink);
  drum(0.35, 0.12, 2.2, wallR - 0.08, 1.6, PALETTE.carLime, true);
  box(0.12, 0.12, 0.12, 2.2, wallR - 0.07, 2.0, PALETTE.steel);
  box(0.45, 0.05, 2.4, -1.2, wallR - 0.25, 1.4, PALETTE.graphite);
  box(0.45, 0.05, 2.4, -1.2, wallR - 0.25, 2.1, PALETTE.graphite);
  for (const [a, y, w] of [[-2.0, 1.62, 0.4], [-1.4, 1.6, 0.35], [-0.6, 1.67, 0.42], [-1.8, 2.3, 0.38], [-0.9, 2.28, 0.34]] as const) {
    box(0.36, w, w * 1.2, a, wallR - 0.25, y, PALETTE.sand);
  }
  // the wanted poster on the back wall, facing the door: the card, its red band, the car's swatch
  box(1.2, 1.6, 0.02, 9.68, 0, 2.4, PALETTE.carWhite);
  box(1.0, 0.25, 0.03, 9.66, 0, 2.95, PALETTE.carRed);
  box(0.8, 0.55, 0.03, 9.66, 0, 2.3, PALETTE.charcoal);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
