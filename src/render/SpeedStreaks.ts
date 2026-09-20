/**
 * Cheap speed streaks: a fixed pool of line segments in camera space that rush
 * past the viewer. One draw call, no allocations per frame.
 */
import * as THREE from 'three';
import type { VehicleTelemetry } from '../sim';

const COUNT = 90;
const RADIUS = 6;
const DEPTH = 40;

export class SpeedStreaks {
  readonly object: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly seeds: Float32Array;
  private readonly material: THREE.LineBasicMaterial;
  private readonly tmp = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private phase = 0;

  constructor() {
    this.positions = new Float32Array(COUNT * 2 * 3);
    this.seeds = new Float32Array(COUNT * 3);
    let s = 1234567;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < COUNT; i++) {
      const a = rnd() * Math.PI * 2;
      const r = RADIUS * (0.35 + 0.65 * Math.sqrt(rnd()));
      this.seeds[i * 3] = Math.cos(a) * r;
      this.seeds[i * 3 + 1] = Math.sin(a) * r;
      this.seeds[i * 3 + 2] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.object = new THREE.LineSegments(g, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
  }

  update(camera: THREE.Camera, tm: VehicleTelemetry, dt: number): void {
    const speed = Math.abs(tm.speed);
    const strength = Math.max(0, (speed - 28) / 30) + (tm.boosting ? 0.35 : 0);
    const opacity = Math.min(0.55, strength * 0.5);
    this.material.opacity = opacity;
    this.object.visible = opacity > 0.01;
    if (!this.object.visible) return;

    this.phase += dt * (speed * 0.9 + (tm.boosting ? 20 : 0));
    camera.getWorldDirection(this.fwd);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const len = 1.5 + strength * 5;
    for (let i = 0; i < COUNT; i++) {
      const sx = this.seeds[i * 3] as number;
      const sy = this.seeds[i * 3 + 1] as number;
      const sz = this.seeds[i * 3 + 2] as number;
      const z = DEPTH - ((sz * DEPTH + this.phase) % DEPTH);
      this.tmp.copy(camera.position).addScaledVector(this.fwd, z).addScaledVector(this.right, sx).addScaledVector(this.up, sy);
      const o = i * 6;
      this.positions[o] = this.tmp.x;
      this.positions[o + 1] = this.tmp.y;
      this.positions[o + 2] = this.tmp.z;
      this.tmp.addScaledVector(this.fwd, len);
      this.positions[o + 3] = this.tmp.x;
      this.positions[o + 4] = this.tmp.y;
      this.positions[o + 5] = this.tmp.z;
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
