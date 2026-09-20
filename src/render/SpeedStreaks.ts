/**
 * Speed streaks as motion-blurred motes.
 *
 * A pool of specks lives in the world around the road ahead: some in the air
 * beside the road, some just above the tarmac like dust. They do not move; the
 * car passes them. Each is drawn as a thin quad stretched along the car's
 * velocity (a mote smeared by camera motion), brightest in the middle and fading
 * to nothing at both ends, with a constant on-screen width, brighter the closer
 * it is to the camera, tinted with the fog and leaning cyan under boost. They
 * parallax correctly, streak sideways in a drift, keep the centre of the screen
 * clear, and only appear above ~100 km/h. One geometry, one draw call.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTelemetry } from '../sim';

const COUNT = 56;
const AHEAD_MIN = 3;
const AHEAD_MAX = 42;
const FADE_FAR = 18;
const BEHIND = 10;
const LATERAL_MIN = 2.2;
const LATERAL_MAX = 8.5;
const SPEED_START = 27; // m/s (~97 km/h)
const SPEED_FULL = 60; // m/s (~216 km/h)
const VERTS_PER_MOTE = 6; // tail L/R, mid L/R, head L/R
const INDICES_PER_MOTE = 12; // two quads

export class SpeedStreaks {
  readonly object: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  /** x, y, z, brightness, dust flag per mote. */
  private readonly motes: Float32Array;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly tintCruise = new THREE.Color(PALETTE.fog).lerp(new THREE.Color(0xffffff), 0.35);
  private readonly tintBoost = new THREE.Color(PALETTE.carBlue).lerp(new THREE.Color(0xffffff), 0.45);
  private readonly tint = new THREE.Color();
  private readonly velDir = new THREE.Vector3(0, 0, 1);
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private seed = 987654321;
  private initialised = false;
  private boostMix = 0;

  constructor() {
    this.positions = new Float32Array(COUNT * VERTS_PER_MOTE * 3);
    this.colors = new Float32Array(COUNT * VERTS_PER_MOTE * 3);
    this.motes = new Float32Array(COUNT * 5);
    const index = new Uint16Array(COUNT * INDICES_PER_MOTE);
    for (let i = 0; i < COUNT; i++) {
      const v = i * VERTS_PER_MOTE;
      const o = i * INDICES_PER_MOTE;
      // tail(0,1) -> mid(2,3) -> head(4,5); two quads as four triangles (DoubleSide, so winding is free)
      index.set([v, v + 1, v + 3, v, v + 3, v + 2, v + 2, v + 3, v + 5, v + 2, v + 5, v + 4], o);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.object = new THREE.Mesh(g, this.material);
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
    const dust = this.rnd() < 0.4;
    // dust hugs the road surface and may sit closer to the car's line; air motes stay out of the centre
    const lateral = side * (dust ? 1.4 + this.rnd() * 4 : LATERAL_MIN + this.rnd() * (LATERAL_MAX - LATERAL_MIN));
    const height = dust ? 0.12 + this.rnd() * 0.45 : 0.6 + this.rnd() * 3.6;
    this.tmp.copy(carPos).addScaledVector(this.velDir, ahead).addScaledVector(this.right, lateral);
    const o = i * 5;
    this.motes[o] = this.tmp.x;
    this.motes[o + 1] = carPos.y + height;
    this.motes[o + 2] = this.tmp.z;
    this.motes[o + 3] = 0.35 + this.rnd() * 0.65;
    this.motes[o + 4] = dust ? 1 : 0;
  }

  /**
   * @param camPos camera position (for facing and on-screen width)
   * @param carPos interpolated car position (world)
   * @param carVel car velocity (world, m/s)
   */
  update(camPos: THREE.Vector3, carPos: THREE.Vector3, carVel: THREE.Vector3, tm: VehicleTelemetry, dt: number): void {
    const speed = Math.hypot(carVel.x, carVel.z);
    const s = Math.max(0, Math.min(1, (speed - SPEED_START) / (SPEED_FULL - SPEED_START)));
    const intensity = Math.min(0.7, s * 0.45 + (tm.boosting ? 0.25 : 0));
    if (intensity < 0.02) {
      this.object.visible = false;
      this.initialised = false;
      return;
    }
    this.object.visible = true;
    this.boostMix += ((tm.boosting ? 1 : 0) - this.boostMix) * Math.min(1, dt * 6);
    this.tint.copy(this.tintCruise).lerp(this.tintBoost, this.boostMix * 0.6);

    if (speed > 1) this.velDir.set(carVel.x, 0, carVel.z).normalize();
    this.right.crossVectors(this.up, this.velDir).normalize();

    if (!this.initialised) {
      for (let i = 0; i < COUNT; i++) this.spawn(i, carPos, true);
      this.initialised = true;
    }

    // blur length grows with speed: ~1.2 m at the threshold, ~6 m flat out, more with boost
    const halfLen = 0.6 + s * 2.4 + this.boostMix * 0.8;
    for (let i = 0; i < COUNT; i++) {
      const o = i * 5;
      const dx = (this.motes[o] as number) - carPos.x;
      const dz = (this.motes[o + 2] as number) - carPos.z;
      const along = dx * this.velDir.x + dz * this.velDir.z;
      if (along < -BEHIND || along > AHEAD_MAX + 4 || Math.abs(dx * this.right.x + dz * this.right.z) > LATERAL_MAX + 3) {
        this.spawn(i, carPos, false);
      }
      const mx = this.motes[o] as number;
      const my = this.motes[o + 1] as number;
      const mz = this.motes[o + 2] as number;
      const alongNow = (mx - carPos.x) * this.velDir.x + (mz - carPos.z) * this.velDir.z;
      const distFade = Math.min(1, Math.max(0, (AHEAD_MAX - alongNow) / FADE_FAR)) * Math.min(1, Math.max(0, (alongNow + BEHIND) / 3));
      const bright = this.motes[o + 3] as number;
      const dust = this.motes[o + 4] as number;
      this.mid.set(mx, my, mz);
      // facing: the quad's width runs across the streak axis and the view direction
      this.toCam.subVectors(camPos, this.mid);
      const dist = this.toCam.length();
      this.across.crossVectors(this.velDir, this.toCam).normalize();
      const halfW = 0.012 + dist * 0.0035; // roughly constant on screen
      const proximity = Math.min(1, Math.max(0.35, 1.25 - dist / 45));
      const b = intensity * bright * distFade * proximity * (dust ? 0.8 : 1);
      const len = halfLen * (0.6 + 0.8 * bright) * (dust ? 0.7 : 1);
      const r = this.tint.r * b;
      const gr = this.tint.g * b;
      const bl = this.tint.b * b;
      const p = i * VERTS_PER_MOTE * 3;
      const ax = this.velDir.x * len;
      const az = this.velDir.z * len;
      const wx = this.across.x * halfW;
      const wy = this.across.y * halfW;
      const wz = this.across.z * halfW;
      this.write(p, 0, mx - ax - wx, my - wy, mz - az - wz, 0, 0, 0);
      this.write(p, 1, mx - ax + wx, my + wy, mz - az + wz, 0, 0, 0);
      this.write(p, 2, mx - wx, my - wy, mz - wz, r, gr, bl);
      this.write(p, 3, mx + wx, my + wy, mz + wz, r, gr, bl);
      this.write(p, 4, mx + ax - wx, my - wy, mz + az - wz, 0, 0, 0);
      this.write(p, 5, mx + ax + wx, my + wy, mz + az + wz, 0, 0, 0);
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.object.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private write(p: number, k: number, x: number, y: number, z: number, cr: number, cg: number, cb: number): void {
    const i = p + k * 3;
    this.positions[i] = x;
    this.positions[i + 1] = y;
    this.positions[i + 2] = z;
    this.colors[i] = cr;
    this.colors[i + 1] = cg;
    this.colors[i + 2] = cb;
  }
}
