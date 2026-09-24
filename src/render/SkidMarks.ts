/**
 * Skid marks (M7 slice 4, DESIGN.md §15.3): a drift, a hard stop or a burnout leaves dark marks on the ground where
 * the tyres were, fading after `SKID.fade` s. Read from the sim's wheels (their contact and slip), written nowhere
 * else; one mesh of a ring of quads in fixed buffers, each quad's age faded in the shader, so laying a mark
 * allocates nothing and old ones are simply overwritten.
 */
import * as THREE from 'three';
import type { SimWorld } from '../sim';

export const SKID = {
  /** Below this speed (m/s) nothing marks. */
  minSpeed: 3,
  /** Slip angle (rad) and slip ratio at which a mark starts, and the spans over which it darkens to full. */
  angle: (8 * Math.PI) / 180,
  angleSpan: (20 * Math.PI) / 180,
  ratio: 0.25,
  ratioSpan: 0.5,
  /** A mark's width (m), its lift over the ground (m), its colour and its darkest opacity. */
  width: 0.24,
  lift: 0.02,
  color: 0x17161b,
  alpha: 0.5,
  /** Seconds until a mark has faded out. */
  fade: 30,
  /** Quads in the ring. */
  capacity: 2048,
  /** A segment's length (m): longer at speed, so a long drift does not eat the ring. */
  stepMin: 0.3,
  stepMax: 1.2,
  stepPerSpeed: 0.04,
};

/** How dark a wheel marks the ground (0–1): nothing under the speed or the slip thresholds. */
export function skidStrength(slipAngle: number, slipRatio: number, speed: number): number {
  if (speed < SKID.minSpeed) return 0;
  const a = (Math.abs(slipAngle) - SKID.angle) / SKID.angleSpan;
  const r = (Math.abs(slipRatio) - SKID.ratio) / SKID.ratioSpan;
  const s = Math.max(a, r);
  return s <= 0 ? 0 : Math.min(1, 0.35 + 0.65 * s);
}

const VERTEX = /* glsl */ `
attribute float aBirth;
attribute float aStrength;
uniform float uTime;
uniform float uFade;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  float age = uTime - aBirth;
  vAlpha = aStrength * clamp(1.0 - age / uFade, 0.0, 1.0);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  if (vAlpha <= 0.0) discard;
  gl_FragColor = vec4(uColor, vAlpha * uAlpha);
  #include <fog_fragment>
}`;

export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly birth: Float32Array;
  private readonly strength: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly birthAttr: THREE.BufferAttribute;
  private readonly strengthAttr: THREE.BufferAttribute;
  private readonly uniforms: { uTime: { value: number }; uFade: { value: number }; uColor: { value: THREE.Color }; uAlpha: { value: number } };
  /** The next quad to write; how many written in all. */
  private next = 0;
  laid = 0;
  /** Per wheel: marking now, and the last point of its strip. */
  private readonly marking = new Uint8Array(8);
  private readonly last = new Float32Array(8 * 3);
  /** This frame's first and last quad written, for the upload. */
  private dirtyFrom = -1;
  private dirtyTo = -1;

  constructor(scene: THREE.Scene, capacity = SKID.capacity) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 4 * 3);
    this.birth = new Float32Array(capacity * 4).fill(-1e6);
    this.strength = new Float32Array(capacity * 4);
    const index = new Uint32Array(capacity * 6);
    for (let q = 0; q < capacity; q++) {
      const v = q * 4, i = q * 6;
      index[i] = v; index[i + 1] = v + 1; index[i + 2] = v + 2;
      index[i + 3] = v + 2; index[i + 4] = v + 1; index[i + 5] = v + 3;
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.birthAttr = new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage);
    this.strengthAttr = new THREE.BufferAttribute(this.strength, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aBirth', this.birthAttr);
    g.setAttribute('aStrength', this.strengthAttr);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    // the marks are everywhere the car went: never culled as one box
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = { uTime: { value: 0 }, uFade: { value: SKID.fade }, uColor: { value: new THREE.Color(SKID.color) }, uAlpha: { value: SKID.alpha } };
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.uniforms]),
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    // `merge` cloned the uniforms: keep the material's own
    this.uniforms = material.uniforms as typeof this.uniforms;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Each frame: every grounded wheel slipping past the thresholds extends its strip; `time` is the renderer's clock. */
  update(sim: SimWorld, time: number): void {
    this.uniforms.uTime.value = time;
    const wheels = sim.vehicle.wheels;
    const speed = sim.vehicle.telemetry.speed;
    const step = Math.min(SKID.stepMax, Math.max(SKID.stepMin, speed * SKID.stepPerSpeed));
    for (let k = 0; k < wheels.length && k < 8; k++) {
      const w = wheels[k];
      if (!w) continue;
      // the rears mark in a drift or a burnout; a front only when it is locked
      const s = w.grounded && w.normal.y > 0.9 && (!w.isFront || w.slipRatio < -SKID.ratio) ? skidStrength(w.slipAngle, w.slipRatio, speed) : 0;
      const c = w.contact, o = k * 3;
      if (s <= 0) { this.marking[k] = 0; continue; }
      if (this.marking[k] === 0) {
        this.marking[k] = 1;
        this.last[o] = c.x; this.last[o + 1] = c.y; this.last[o + 2] = c.z;
        continue;
      }
      const dx = c.x - (this.last[o] as number), dz = c.z - (this.last[o + 2] as number);
      const len = Math.hypot(dx, dz);
      if (len < step) continue;
      // a jump (a teleport, a respawn) starts a new strip instead of a streak across the city
      if (len > 6) { this.last[o] = c.x; this.last[o + 1] = c.y; this.last[o + 2] = c.z; continue; }
      this.quad(this.last[o] as number, this.last[o + 1] as number, this.last[o + 2] as number, c.x, c.y, c.z, dx / len, dz / len, s, time);
      this.last[o] = c.x; this.last[o + 1] = c.y; this.last[o + 2] = c.z;
    }
    this.upload();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }

  /** One quad from (ax, ay, az) to (bx, by, bz), `width` across, into the ring. */
  private quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, fx: number, fz: number, s: number, time: number): void {
    const q = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.laid++;
    const hw = SKID.width / 2, rx = fz * hw, rz = -fx * hw, lift = SKID.lift;
    const p = this.pos, v = q * 12;
    p[v] = ax - rx; p[v + 1] = ay + lift; p[v + 2] = az - rz;
    p[v + 3] = ax + rx; p[v + 4] = ay + lift; p[v + 5] = az + rz;
    p[v + 6] = bx - rx; p[v + 7] = by + lift; p[v + 8] = bz - rz;
    p[v + 9] = bx + rx; p[v + 10] = by + lift; p[v + 11] = bz + rz;
    for (let j = 0; j < 4; j++) {
      this.birth[q * 4 + j] = time;
      this.strength[q * 4 + j] = s;
    }
    if (this.dirtyFrom < 0 || q < this.dirtyFrom) this.dirtyFrom = q;
    if (q > this.dirtyTo) this.dirtyTo = q;
  }

  /** The quads written this frame to the GPU: their range only (the frame the ring wraps uploads it whole, once). */
  private upload(): void {
    if (this.dirtyFrom < 0) return;
    const from = this.dirtyFrom, count = this.dirtyTo - this.dirtyFrom + 1;
    this.posAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(from * 12, count * 12);
    this.posAttr.needsUpdate = true;
    this.birthAttr.clearUpdateRanges();
    this.birthAttr.addUpdateRange(from * 4, count * 4);
    this.birthAttr.needsUpdate = true;
    this.strengthAttr.clearUpdateRanges();
    this.strengthAttr.addUpdateRange(from * 4, count * 4);
    this.strengthAttr.needsUpdate = true;
    this.dirtyFrom = -1;
    this.dirtyTo = -1;
  }

  /** A quad's first vertex (tests): the ring's `q`-th slot. */
  vertex(q: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const v = (q % this.capacity) * 12;
    out.x = this.pos[v] as number; out.y = this.pos[v + 1] as number; out.z = this.pos[v + 2] as number;
    return out;
  }
}
