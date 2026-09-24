/**
 * The roadblock's props (docs/STYLE.md, roadblocks): the sawhorse in the gap
 * between the two cars, `barrier` white planks with `cone` orange stripes on
 * two trestles, and the spike strip before it across the open side, a low
 * `ink` bar with steel teeth. Both hidden while no roadblock stands. The
 * cars are traffic records with their light bars on. Reads sim state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, POLICE, type SimWorld } from '../../sim';

export class RoadblockView {
  private readonly sawhorse: THREE.Mesh;
  private readonly spike: THREE.Mesh;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private serial = -1;

  constructor(scene: THREE.Scene) {
    const r = POLICE.roadblock;
    this.sawhorse = new THREE.Mesh(sawhorseGeometry(r.sawhorseWidth), this.material);
    this.spike = new THREE.Mesh(spikeGeometry(r.spikeLength, r.spikeDepth), this.material);
    for (const m of [this.sawhorse, this.spike]) {
      m.visible = false;
      m.castShadow = false;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  update(sim: SimWorld): void {
    const rb = sim.roadblocks;
    if (!rb) return;
    if (rb.serial !== this.serial) {
      this.serial = rb.serial;
      this.sawhorse.position.set(rb.sawhorseX, 0, rb.sawhorseZ);
      this.sawhorse.rotation.y = rb.yaw;
      this.spike.position.set(rb.spikeX, 0, rb.spikeZ);
      this.spike.rotation.y = rb.spikeYaw;
    }
    if (this.sawhorse.visible !== rb.sawhorseUp) this.sawhorse.visible = rb.sawhorseUp;
    if (this.spike.visible !== rb.spikeUp) this.spike.visible = rb.spikeUp;
  }

  dispose(): void {
    this.sawhorse.geometry.dispose();
    this.spike.geometry.dispose();
    this.material.dispose();
  }
}

function painted(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const geometry = g.toNonIndexed();
  g.dispose();
  geometry.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = geometry.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Two planks across the gap on two trestles; the upper plank striped. The width runs across the road (local x). */
function sawhorseGeometry(width: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stripes = 5;
  for (let k = 0; k < stripes; k++) {
    const w = width / stripes;
    parts.push(painted(new THREE.BoxGeometry(w, 0.22, 0.06).translate(-width / 2 + w * (k + 0.5), 1.0, 0), k % 2 === 0 ? PALETTE.barrier : PALETTE.cone));
  }
  parts.push(painted(new THREE.BoxGeometry(width, 0.16, 0.06).translate(0, 0.55, 0), PALETTE.barrier));
  for (const side of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.08, 1.15, 0.08).rotateX(lean * 0.25).translate(side * (width / 2 - 0.2), 0.57, lean * 0.14);
      parts.push(painted(leg, PALETTE.steel));
    }
  }
  const out = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return out;
}

/** A low bar across the road with a row of teeth. */
function spikeGeometry(length: number, depth: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [painted(new THREE.BoxGeometry(length, 0.05, depth * 0.5).translate(0, 0.03, 0), PALETTE.ink)];
  const teeth = Math.round(length / 0.35);
  for (let k = 0; k < teeth; k++) {
    parts.push(painted(new THREE.ConeGeometry(0.05, 0.14, 4).translate(-length / 2 + (k + 0.5) * length / teeth, 0.12, 0), PALETTE.steel));
  }
  const out = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return out;
}
