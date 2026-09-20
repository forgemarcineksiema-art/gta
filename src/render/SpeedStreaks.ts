/**
 * Speed streaks as motion-blurred air motes.
 *
 * A pool of specks lives in the world around the road ahead of the car. They do
 * not move; the car passes them. Each is drawn as a short line stretched along
 * the car's velocity (the way a dust mote smears in a photo taken from a fast
 * car), tapered to nothing at both ends, tinted with the fog colour and blended
 * additively. They parallax correctly, streak sideways in a drift, never sit in
 * the centre of the screen, and only appear above ~100 km/h. One draw call.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTelemetry } from '../sim';

const COUNT = 48;
const AHEAD_MIN = 3;
const AHEAD_MAX = 42;
const FADE_FAR = 18; // metres before AHEAD_MAX over which a mote fades in
const LATERAL_MIN = 2.2;
const LATERAL_MAX = 8.5;
const HEIGHT_MIN = 0.2;
const HEIGHT_MAX = 4.6;
// motes live on until they are behind the chase camera, so they pass beside and above the viewer
const BEHIND = 10;
const SPEED_START = 27; // m/s (~97 km/h)
const SPEED_FULL = 60; // m/s (~216 km/h)

export class SpeedStreaks {
  readonly object: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly motes: Float32Array; // x, y, z, brightness per mote
  private readonly material: THREE.LineBasicMaterial;
  private readonly tint = new THREE.Color(PALETTE.fog).lerp(new THREE.Color(0xffffff), 0.3);
  private readonly velDir = new THREE.Vector3(0, 0, 1);
  private readonly right = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private seed = 987654321;
  private initialised = false;

  constructor() {
    // 3 vertices per mote (tail, mid, head) -> 2 segments -> 4 line vertices
    this.positions = new Float32Array(COUNT * 4 * 3);
    this.colors = new Float32Array(COUNT * 4 * 3);
    this.motes = new Float32Array(COUNT * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.object = new THREE.LineSegments(g, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    this.object.visible = false;
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private spawn(i: number, carPos: THREE.Vector3, nearOnly: boolean): void {
    const ahead = nearOnly ? AHEAD_MIN + this.rnd() * (AHEAD_MAX - AHEAD_MIN) : AHEAD_MAX - FADE_FAR * this.rnd();
    const side = this.rnd() < 0.5 ? -1 : 1;
    const lateral = side * (LATERAL_MIN + this.rnd() * (LATERAL_MAX - LATERAL_MIN));
    const height = HEIGHT_MIN + this.rnd() * (HEIGHT_MAX - HEIGHT_MIN);
    this.tmp.copy(carPos).addScaledVector(this.velDir, ahead).addScaledVector(this.right, lateral);
    const o = i * 4;
    this.motes[o] = this.tmp.x;
    this.motes[o + 1] = carPos.y + height;
    this.motes[o + 2] = this.tmp.z;
    this.motes[o + 3] = 0.35 + this.rnd() * 0.65;
  }

  /**
   * @param carPos interpolated car position (world)
   * @param carVel car velocity (world, m/s)
   */
  update(carPos: THREE.Vector3, carVel: THREE.Vector3, tm: VehicleTelemetry): void {
    const speed = Math.hypot(carVel.x, carVel.z);
    const s = Math.max(0, Math.min(1, (speed - SPEED_START) / (SPEED_FULL - SPEED_START)));
    const intensity = Math.min(0.6, s * 0.42 + (tm.boosting ? 0.2 : 0));
    if (intensity < 0.02) {
      this.object.visible = false;
      this.initialised = false;
      return;
    }
    this.object.visible = true;

    if (speed > 1) {
      this.velDir.set(carVel.x, 0, carVel.z).normalize();
    }
    this.right.crossVectors(this.up, this.velDir).normalize();

    if (!this.initialised) {
      for (let i = 0; i < COUNT; i++) this.spawn(i, carPos, true);
      this.initialised = true;
    }

    // blur length grows with speed: ~1.2 m at the threshold, ~6 m flat out, more with boost
    const halfLen = 0.6 + s * 2.4 + (tm.boosting ? 0.8 : 0);
    for (let i = 0; i < COUNT; i++) {
      const o = i * 4;
      const dx = (this.motes[o] as number) - carPos.x;
      const dz = (this.motes[o + 2] as number) - carPos.z;
      const along = dx * this.velDir.x + dz * this.velDir.z;
      if (along < -BEHIND || along > AHEAD_MAX + 4 || Math.abs(dx * this.right.x + dz * this.right.z) > LATERAL_MAX + 3) {
        this.spawn(i, carPos, false);
      }
      const mx = this.motes[o] as number;
      const my = this.motes[o + 1] as number;
      const mz = this.motes[o + 2] as number;
      // fade in ahead and out behind so nothing pops
      const alongNow = (mx - carPos.x) * this.velDir.x + (mz - carPos.z) * this.velDir.z;
      const distFade = Math.min(1, Math.max(0, (AHEAD_MAX - alongNow) / FADE_FAR)) * Math.min(1, Math.max(0, (alongNow + BEHIND) / 3));
      const bright = this.motes[o + 3] as number;
      const b = intensity * bright * distFade;
      const len = halfLen * (0.6 + 0.8 * bright);
      const p = i * 12;
      const c = i * 12;
      // tail
      this.positions[p] = mx - this.velDir.x * len;
      this.positions[p + 1] = my;
      this.positions[p + 2] = mz - this.velDir.z * len;
      this.colors[c] = 0;
      this.colors[c + 1] = 0;
      this.colors[c + 2] = 0;
      // mid (shared by both segments)
      this.positions[p + 3] = mx;
      this.positions[p + 4] = my;
      this.positions[p + 5] = mz;
      this.colors[c + 3] = this.tint.r * b;
      this.colors[c + 4] = this.tint.g * b;
      this.colors[c + 5] = this.tint.b * b;
      this.positions[p + 6] = mx;
      this.positions[p + 7] = my;
      this.positions[p + 8] = mz;
      this.colors[c + 6] = this.tint.r * b;
      this.colors[c + 7] = this.tint.g * b;
      this.colors[c + 8] = this.tint.b * b;
      // head
      this.positions[p + 9] = mx + this.velDir.x * len;
      this.positions[p + 10] = my;
      this.positions[p + 11] = mz + this.velDir.z * len;
      this.colors[c + 9] = 0;
      this.colors[c + 10] = 0;
      this.colors[c + 11] = 0;
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.object.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
