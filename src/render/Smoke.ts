/**
 * Smoke and fire as one pooled point cloud: grey smoke from a dented car,
 * dark smoke and short-lived fire points from a burning one, the same for
 * wrecked traffic nearby. Points are sized by distance in the vertex shader
 * and fade out through vertex alpha. Typed arrays updated in place; two
 * attributes uploaded per frame; one draw call. Nothing is drawn in front of
 * the camera: emitters sit on the cars.
 */
import * as THREE from 'three';

const POOL = 160;
const HIDDEN_Y = -100;

export type Puff = 'smoke' | 'dark' | 'fire';

const VERT = `
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - r * r));
}`;

export class Smoke {
  readonly object: THREE.Points;
  private readonly positions = new Float32Array(POOL * 3);
  private readonly colors = new Float32Array(POOL * 3);
  private readonly sizes = new Float32Array(POOL);
  private readonly alphas = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly vz = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly maxLife = new Float32Array(POOL);
  private readonly grow = new Float32Array(POOL);
  private readonly kind = new Uint8Array(POOL);
  private next = 0;
  private seed = 7;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;

  constructor() {
    const g = new THREE.BufferGeometry();
    for (let i = 0; i < POOL; i++) this.positions[i * 3 + 1] = HIDDEN_Y;
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, transparent: true, depthWrite: false });
    this.object = new THREE.Points(g, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Emit one puff at a point. `vx, vz` is the source's velocity (the puff trails behind at a fraction of it). */
  emit(kind: Puff, x: number, y: number, z: number, vx = 0, vz = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    const r = (): number => this.rnd();
    this.positions[i * 3] = x + (r() - 0.5) * 0.3;
    this.positions[i * 3 + 1] = y + (r() - 0.5) * 0.2;
    this.positions[i * 3 + 2] = z + (r() - 0.5) * 0.3;
    this.vx[i] = vx * 0.25 + (r() - 0.5) * 0.8;
    this.vz[i] = vz * 0.25 + (r() - 0.5) * 0.8;
    if (kind === 'fire') {
      this.vy[i] = 1.5 + r() * 1.5;
      this.life[i] = 0.3 + r() * 0.2;
      this.sizes[i] = 0.35;
      this.grow[i] = 0.2;
      this.colors[i * 3] = 1.0; this.colors[i * 3 + 1] = 0.55 + r() * 0.35; this.colors[i * 3 + 2] = 0.1;
      this.kind[i] = 2;
    } else {
      const dark = kind === 'dark';
      this.vy[i] = 1.2 + r() * 0.8;
      this.life[i] = 1.4 + r() * 0.8;
      this.sizes[i] = 0.5;
      this.grow[i] = dark ? 1.3 : 1.0;
      const tone = dark ? 0.16 + r() * 0.06 : 0.6 + r() * 0.15;
      this.colors[i * 3] = tone; this.colors[i * 3 + 1] = tone; this.colors[i * 3 + 2] = tone * 1.05;
      this.kind[i] = dark ? 1 : 0;
    }
    this.maxLife[i] = this.life[i];
    this.alphas[i] = 0.8;
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if ((this.life[i] as number) <= 0) continue;
      this.life[i] = (this.life[i] as number) - dt;
      if ((this.life[i] as number) <= 0) {
        this.positions[i * 3 + 1] = HIDDEN_Y;
        this.alphas[i] = 0;
        continue;
      }
      this.positions[i * 3] = (this.positions[i * 3] as number) + (this.vx[i] as number) * dt;
      this.positions[i * 3 + 1] = (this.positions[i * 3 + 1] as number) + (this.vy[i] as number) * dt;
      this.positions[i * 3 + 2] = (this.positions[i * 3 + 2] as number) + (this.vz[i] as number) * dt;
      this.sizes[i] = (this.sizes[i] as number) + (this.grow[i] as number) * dt;
      const t = (this.life[i] as number) / (this.maxLife[i] as number);
      this.alphas[i] = this.kind[i] === 2 ? 0.9 * t : 0.7 * t;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}
