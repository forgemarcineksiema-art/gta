/**
 * Smoke and fire as one pooled point cloud: grey smoke from a dented car,
 * dark smoke and short-lived fire points from a burning one, the same for
 * wrecked traffic nearby. A puff's size is a world diameter in metres (the
 * vertex shader projects it with the camera's real scale, so it reads the
 * same at every resolution); it fades in over its first moments and out over
 * its life. Smoke left behind a moving car hangs in the air the chase camera
 * drives through, so a puff fades out as it nears the camera instead of
 * filling the screen. Typed arrays updated in place; one draw call.
 */
import * as THREE from 'three';

const POOL = 160;
const HIDDEN_Y = -100;
/** Seconds a puff takes to fade in at the source. */
const FADE_IN = 0.12;

export type Puff = 'smoke' | 'dark' | 'fire' | 'tyre';

const VERT = `
uniform float uScale;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.5, -mv.z);
  // The chase camera sits 6.4-8 m behind the car's centre: puffs behind the
  // car's tail (under 4 m away) are gone, puffs over the bonnet are whole.
  vAlpha = aAlpha * smoothstep(3.5, 7.0, depth);
  gl_PointSize = aSize * uScale / depth;
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
  private readonly peak = new Float32Array(POOL);
  private readonly kind = new Uint8Array(POOL);
  private next = 0;
  private seed = 7;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

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
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 } },
    });
    this.object = new THREE.Points(g, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Pixels per metre at 1 m from the camera: the drawing buffer's height over the frustum's height at 1 m. */
  setViewport(bufferHeight: number, fovDegrees: number): void {
    (this.material.uniforms.uScale as THREE.IUniform<number>).value = bufferHeight / (2 * Math.tan((fovDegrees * Math.PI) / 360));
  }

  /**
   * Emit one puff at a point. `vx, vz` is the source's velocity (the puff
   * trails behind at a fraction of it). `density` (0-1] thins a puff: smoke
   * from a moving car is spread through more air per second, so it is fainter
   * and mixes away sooner.
   */
  emit(kind: Puff, x: number, y: number, z: number, vx = 0, vz = 0, density = 1, colour = -1): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    const r = (): number => this.rnd();
    this.positions[i * 3] = x + (r() - 0.5) * 0.3;
    this.positions[i * 3 + 1] = y + (r() - 0.5) * 0.2;
    this.positions[i * 3 + 2] = z + (r() - 0.5) * 0.3;
    this.vx[i] = vx * 0.25 + (r() - 0.5) * 0.8;
    this.vz[i] = vz * 0.25 + (r() - 0.5) * 0.8;
    const mix = 0.4 + 0.6 * density;
    if (kind === 'fire') {
      this.vy[i] = 1.5 + r() * 1.5;
      this.life[i] = (0.3 + r() * 0.2) * mix;
      this.sizes[i] = 0.2;
      this.grow[i] = 0.1;
      this.peak[i] = 0.9 * density;
      this.colors[i * 3] = 1.0; this.colors[i * 3 + 1] = 0.55 + r() * 0.35; this.colors[i * 3 + 2] = 0.1;
      this.kind[i] = 2;
    } else if (kind === 'tyre') {
      // a drift's tyre smoke (M6 slice 7): low, wide, quick to spread, in the kit's colour or a pale grey
      this.vy[i] = 0.35 + r() * 0.3;
      this.life[i] = (0.9 + r() * 0.5) * mix;
      this.sizes[i] = 0.5;
      this.grow[i] = 1.3;
      this.peak[i] = 0.5 * density;
      const c = colour >= 0 ? colour : 0xdcdce4;
      const shade = 0.9 + r() * 0.15;
      this.colors[i * 3] = ((c >> 16) & 255) / 255 * shade;
      this.colors[i * 3 + 1] = ((c >> 8) & 255) / 255 * shade;
      this.colors[i * 3 + 2] = (c & 255) / 255 * shade;
      this.kind[i] = 0;
    } else {
      const dark = kind === 'dark';
      this.vy[i] = 0.9 + r() * 0.6;
      this.life[i] = (1.3 + r() * 0.7) * mix;
      this.sizes[i] = dark ? 0.35 : 0.3;
      this.grow[i] = dark ? 0.8 : 0.6;
      this.peak[i] = (dark ? 0.7 : 0.45) * density;
      const tone = dark ? 0.16 + r() * 0.06 : 0.6 + r() * 0.15;
      this.colors[i * 3] = tone; this.colors[i * 3 + 1] = tone; this.colors[i * 3 + 2] = tone * 1.05;
      this.kind[i] = dark ? 1 : 0;
    }
    this.maxLife[i] = this.life[i];
    this.alphas[i] = 0;
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
      const left = this.life[i] as number, max = this.maxLife[i] as number;
      this.alphas[i] = (this.peak[i] as number) * Math.min(1, (max - left) / FADE_IN) * (left / max);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}
