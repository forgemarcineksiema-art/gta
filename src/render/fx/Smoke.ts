/**
 * Smoke, fire, dust and spray as low-poly puffs: the art's own shape, a flat-shaded icosahedron lit by the sun and the
 * sky like everything else and fogged with the city, so a puff reads as a volume with a lit top and a shaded belly
 * instead of a soft disc stuck on the screen. Grey smoke from a dented car, dark smoke and fire from a burning one and
 * from wrecked traffic nearby, a drift's tyre smoke, the dust the wheels throw off dirt and grass, the spray off the
 * sea. A puff's size is a world diameter in metres; it tumbles slowly, grows, fades in over its first moments and out
 * over its life. Fire is its own light (it glows through the shading, so its facets still show): a tongue stretched
 * upwards, pale yellow going orange then deep red, shrinking as it rises. Smoke left behind a moving car hangs in the
 * air the chase camera drives through, so a puff fades out as it nears the camera instead of filling the screen.
 * One instanced mesh, one draw call: the live puffs are packed into its first slots each frame, and it is hidden while
 * there are none. Typed arrays updated in place, nothing allocated after construction.
 */
import * as THREE from 'three';

export const SMOKE_POOL = 256;
const POOL = SMOKE_POOL;
/** Seconds a puff takes to fade in at the source; a flame grows to its size in half that. */
const FADE_IN = 0.12;

export type Puff = 'smoke' | 'dark' | 'fire' | 'tyre' | 'dust' | 'spray';

const tmpColor = new THREE.Color();

/** The first `count` values of a per-puff attribute to the GPU. */
function upload(attr: THREE.InstancedBufferAttribute, count: number): void {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, count);
  attr.needsUpdate = true;
}

export class Smoke {
  readonly object: THREE.InstancedMesh;
  private readonly px = new Float32Array(POOL);
  private readonly py = new Float32Array(POOL);
  private readonly pz = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly vz = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly maxLife = new Float32Array(POOL);
  private readonly size = new Float32Array(POOL);
  private readonly grow = new Float32Array(POOL);
  private readonly peak = new Float32Array(POOL);
  /** Its share of gravity (the spray falls back; smoke rises on its own), the air's drag (1/s), the ground it stops on. */
  private readonly fall = new Float32Array(POOL);
  private readonly drag = new Float32Array(POOL);
  private readonly floor = new Float32Array(POOL);
  /** Its height over its width: smoke a little flat, dust flatter, a flame a tall tongue. */
  private readonly tall = new Float32Array(POOL);
  private readonly rotX = new Float32Array(POOL);
  private readonly rotY = new Float32Array(POOL);
  private readonly spinX = new Float32Array(POOL);
  private readonly spinY = new Float32Array(POOL);
  private readonly rgb = new Float32Array(POOL * 3);
  /** 1 for fire; how much of its own light a puff has (fire all, the sea's foam some: white in any light). */
  private readonly flame = new Uint8Array(POOL);
  private readonly glow = new Float32Array(POOL);
  private readonly alphas: Float32Array;
  private readonly glows: Float32Array;
  private readonly alphaAttr: THREE.InstancedBufferAttribute;
  private readonly glowAttr: THREE.InstancedBufferAttribute;
  private next = 0;
  private seed = 7;
  private shown = -1;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();

  constructor() {
    const g = new THREE.IcosahedronGeometry(0.5, 0);
    this.alphas = new Float32Array(POOL);
    this.glows = new Float32Array(POOL);
    this.alphaAttr = new THREE.InstancedBufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    this.glowAttr = new THREE.InstancedBufferAttribute(this.glows, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setAttribute('aGlow', this.glowAttr);
    const material = new THREE.MeshLambertMaterial({ flatShading: true, transparent: true, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', 'attribute float aAlpha;\nattribute float aGlow;\nvarying float vAlpha;\nvarying float vGlow;\n#include <common>')
        .replace('#include <project_vertex>', `#include <project_vertex>
  // The chase camera sits 6.4-8 m behind the car's centre: puffs behind the car's tail (under 4 m away) are gone,
  // puffs over the bonnet are whole. By the puff's centre, so a puff fades as one.
  vec4 puffCentre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vAlpha = aAlpha * smoothstep(3.5, 7.0, -puffCentre.z);
  vGlow = aGlow;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying float vAlpha;\nvarying float vGlow;\n#include <common>')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vAlpha;')
        // fire lights itself, the foam partly: its colour, the facets turned up a little brighter than the ones turned down
        .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb * (0.82 + 0.3 * normal.y), vGlow);\n  #include <opaque_fragment>');
    };
    material.customProgramCacheKey = () => 'smoke-puffs';
    this.object = new THREE.InstancedMesh(g, material, POOL);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    this.object.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    this.object.count = 0;
    // shown until the first frame, so the renderer's warm-up compiles its program (a first puff mid-drive would cost a
    // 60 ms frame); every frame after draws it only while a puff lives
    this.object.frustumCulled = false;
    this.object.castShadow = false;
    this.object.receiveShadow = false;
    this.object.renderOrder = 5;
    this.object.name = 'smoke';
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Puffs alive now (tests). */
  get live(): number {
    let n = 0;
    for (let i = 0; i < POOL; i++) if ((this.life[i] as number) > 0) n++;
    return n;
  }

  /**
   * Emit one puff at a point. `vx, vz` is the source's velocity (the puff trails behind at a fraction of it).
   * `density` (0-1] thins a puff: smoke from a moving car is spread through more air per second, so it is fainter
   * and mixes away sooner. `colour` (0xRRGGBB) tints the tyre smoke; -1 is its own pale grey.
   */
  emit(kind: Puff, x: number, y: number, z: number, vx = 0, vz = 0, density = 1, colour = -1): void {
    const r = (): number => this.rnd();
    const i = this.slot(x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.3);
    this.vx[i] = vx * 0.25 + (r() - 0.5) * 0.8;
    this.vz[i] = vz * 0.25 + (r() - 0.5) * 0.8;
    const mix = 0.4 + 0.6 * density;
    if (kind === 'fire') {
      this.vy[i] = 1.5 + r() * 1.5;
      this.life[i] = (0.3 + r() * 0.2) * mix;
      this.size[i] = 0.3 + r() * 0.2;
      this.grow[i] = 0;
      this.peak[i] = Math.min(1, 0.6 + 0.5 * density);
      this.tall[i] = 1.5;
      this.spinY[i] = (r() - 0.5) * 8;
      this.flame[i] = 1;
      this.glow[i] = 1;
      this.tint(i, 0xfff0a0, 1);
    } else if (kind === 'tyre') {
      // a drift's tyre smoke (M6 slice 7): low, wide, quick to spread, in the kit's colour or a pale grey
      this.vy[i] = 0.35 + r() * 0.3;
      this.life[i] = (0.9 + r() * 0.5) * mix;
      this.size[i] = 0.45;
      this.grow[i] = 1.4;
      this.peak[i] = 0.45 * density;
      this.drag[i] = 1.2;
      this.tall[i] = 0.75;
      this.tint(i, colour >= 0 ? colour : 0xe4e4ea, 0.92 + r() * 0.12);
    } else if (kind === 'dust' || kind === 'spray') {
      // the wheels' dust and the cushion's spray come through `kick` with their own throw; here, a still one
      this.kickInit(i, kind, 0, 0.5, 0, density, colour);
      return;
    } else {
      const dark = kind === 'dark';
      this.vy[i] = 0.9 + r() * 0.6;
      this.life[i] = (1.3 + r() * 0.7) * mix;
      this.size[i] = dark ? 0.35 : 0.3;
      this.grow[i] = dark ? 0.8 : 0.6;
      this.peak[i] = (dark ? 0.62 : 0.42) * density;
      this.drag[i] = 0.3;
      this.tall[i] = 0.85;
      const tone = dark ? 0.16 + r() * 0.06 : 0.62 + r() * 0.14;
      this.store(i, tmpColor.setRGB(tone, tone, tone * 1.04, THREE.SRGBColorSpace));
    }
    this.maxLife[i] = this.life[i];
  }

  /**
   * Throw dust or spray from a point with its own velocity (m/s): what a wheel kicks up off dirt or grass, the
   * hovercraft's cushion off the sea, a landing's ring. `strength` (0-1] is how thick it is; `colour` the ground's.
   */
  kick(kind: 'dust' | 'spray', x: number, y: number, z: number, vx: number, vy: number, vz: number, strength = 1, colour = -1): void {
    const r = (): number => this.rnd();
    const i = this.slot(x + (r() - 0.5) * 0.2, y + r() * 0.1, z + (r() - 0.5) * 0.2);
    this.kickInit(i, kind, vx, vy, vz, strength, colour);
  }

  private kickInit(i: number, kind: 'dust' | 'spray', vx: number, vy: number, vz: number, strength: number, colour: number): void {
    const r = (): number => this.rnd();
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.floor[i] = (this.py[i] as number) - 0.15;
    if (kind === 'spray') {
      // foam and droplets: thrown up and out, falling back to the water, gone in well under a second
      this.life[i] = 0.45 + r() * 0.35;
      this.size[i] = 0.22 + r() * 0.12;
      this.grow[i] = 1.6;
      this.peak[i] = 0.8 * strength;
      this.fall[i] = 0.7;
      this.drag[i] = 1.4;
      this.tall[i] = 0.8;
      this.glow[i] = 0.45;
      this.tint(i, colour >= 0 ? colour : 0xeef8fc, 0.95 + r() * 0.08);
    } else {
      // dust: low and wide, slowed quickly by the air, settling
      this.life[i] = 0.7 + r() * 0.5;
      this.size[i] = 0.3 + r() * 0.15;
      this.grow[i] = 1.8;
      this.peak[i] = 0.6 * strength;
      this.fall[i] = 0.06;
      this.drag[i] = 2.4;
      this.tall[i] = 0.6;
      this.tint(i, colour >= 0 ? colour : 0xc9c3b3, 0.93 + r() * 0.1);
    }
    this.maxLife[i] = this.life[i];
  }

  /** The next slot, reset and placed at a point. */
  private slot(x: number, y: number, z: number): number {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.fall[i] = 0;
    this.drag[i] = 0;
    this.floor[i] = -1e3;
    this.flame[i] = 0;
    this.glow[i] = 0;
    this.rotX[i] = this.rnd() * Math.PI * 2;
    this.rotY[i] = this.rnd() * Math.PI * 2;
    this.spinX[i] = (this.rnd() - 0.5) * 1.6;
    this.spinY[i] = (this.rnd() - 0.5) * 1.6;
    return i;
  }

  /** A colour 0xRRGGBB (sRGB) a shade lighter or darker, kept in the renderer's linear space. */
  private tint(i: number, hex: number, shade: number): void {
    tmpColor.setRGB(
      Math.min(1, ((hex >> 16) & 255) / 255 * shade), Math.min(1, ((hex >> 8) & 255) / 255 * shade), Math.min(1, (hex & 255) / 255 * shade),
      THREE.SRGBColorSpace,
    );
    this.store(i, tmpColor);
  }

  private store(i: number, c: THREE.Color): void {
    this.rgb[i * 3] = c.r; this.rgb[i * 3 + 1] = c.g; this.rgb[i * 3 + 2] = c.b;
  }

  update(dt: number): void {
    const mesh = this.object, matrices = mesh.instanceMatrix.array as Float32Array;
    const colours = mesh.instanceColor?.array as Float32Array;
    let n = 0;
    for (let i = 0; i < POOL; i++) {
      let left = this.life[i] as number;
      if (left <= 0) continue;
      left -= dt;
      this.life[i] = left;
      if (left <= 0) continue;
      const k = 1 - left / (this.maxLife[i] as number), age = (this.maxLife[i] as number) - left;
      const slow = Math.exp(-(this.drag[i] as number) * dt);
      this.vx[i] = (this.vx[i] as number) * slow;
      this.vz[i] = (this.vz[i] as number) * slow;
      this.vy[i] = (this.vy[i] as number) * (this.fall[i] ? slow : 1) - 9.81 * (this.fall[i] as number) * dt;
      this.px[i] = (this.px[i] as number) + (this.vx[i] as number) * dt;
      this.py[i] = Math.max(this.floor[i] as number, (this.py[i] as number) + (this.vy[i] as number) * dt);
      this.pz[i] = (this.pz[i] as number) + (this.vz[i] as number) * dt;
      this.rotX[i] = (this.rotX[i] as number) + (this.spinX[i] as number) * dt;
      this.rotY[i] = (this.rotY[i] as number) + (this.spinY[i] as number) * dt;
      let width: number, alpha: number;
      const o = n * 3, c = i * 3;
      if (this.flame[i]) {
        // a tongue of flame: grown in a moment, shrinking as it rises, pale yellow to orange to deep red
        width = (this.size[i] as number) * Math.min(1, age / (FADE_IN * 0.5)) * (1 - k * k);
        alpha = (this.peak[i] as number) * Math.min(1, (1 - k) * 4);
        const a = Math.min(1, k * 2), b = Math.max(0, k * 2 - 1);
        tmpColor.setRGB(1 - 0.25 * b, 0.92 - 0.42 * a - 0.35 * b, 0.55 - 0.47 * a, THREE.SRGBColorSpace);
        colours[o] = tmpColor.r;
        colours[o + 1] = tmpColor.g;
        colours[o + 2] = tmpColor.b;
      } else {
        this.size[i] = (this.size[i] as number) + (this.grow[i] as number) * dt;
        width = this.size[i] as number;
        alpha = (this.peak[i] as number) * Math.min(1, age / FADE_IN) * (1 - k);
        colours[o] = this.rgb[c] as number;
        colours[o + 1] = this.rgb[c + 1] as number;
        colours[o + 2] = this.rgb[c + 2] as number;
      }
      this.p.set(this.px[i] as number, this.py[i] as number, this.pz[i]);
      this.q.setFromEuler(this.e.set(this.rotX[i] as number, this.rotY[i] as number, 0));
      this.s.set(width, width * (this.tall[i] as number), width);
      // a flame stands up: its tongue along the world's up, turning about it
      if (this.flame[i]) this.q.setFromEuler(this.e.set(0, this.rotY[i] as number, 0));
      this.m.compose(this.p, this.q, this.s).toArray(matrices, n * 16);
      this.alphas[n] = alpha;
      this.glows[n] = this.glow[i] as number;
      n++;
    }
    mesh.count = n;
    const visible = n > 0;
    if (mesh.visible !== visible) mesh.visible = visible;
    if (n > 0 || this.shown > 0) {
      const up = Math.max(n, 1);
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, up * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, up * 3);
        mesh.instanceColor.needsUpdate = true;
      }
      upload(this.alphaAttr, up);
      upload(this.glowAttr, up);
    }
    this.shown = n;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
  }
}
