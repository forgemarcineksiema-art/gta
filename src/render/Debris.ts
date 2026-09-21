/**
 * Debris: bumpers that fall off, planks from a smashed billboard, bits of a
 * taken-down car. A fixed pool of boxes in one instanced mesh with fake
 * physics (gravity, one bounce on the ground, spin, a fixed life), no Rapier.
 * Dead pieces are scaled to zero. Typed arrays, no allocation after construction.
 */
import * as THREE from 'three';

const POOL = 32;
const GRAVITY = 9.81;
const LIFE = 2.5;
const BOUNCE = 0.3;

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(POOL);
  private readonly py = new Float32Array(POOL);
  private readonly pz = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly vz = new Float32Array(POOL);
  private readonly sx = new Float32Array(POOL);
  private readonly sy = new Float32Array(POOL);
  private readonly sz = new Float32Array(POOL);
  private readonly ax = new Float32Array(POOL);
  private readonly ay = new Float32Array(POOL);
  private readonly az = new Float32Array(POOL);
  private readonly spinX = new Float32Array(POOL);
  private readonly spinY = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly bounced = new Uint8Array(POOL);
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private seed = 1;

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshLambertMaterial({ flatShading: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, POOL);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.s.set(0, 0, 0);
    for (let i = 0; i < POOL; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.color.setHex(0xffffff);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Throw one piece. Velocity in m/s, size in metres, colour 0xRRGGBB. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, color: number): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.sx[i] = sx; this.sy[i] = sy; this.sz[i] = sz;
    this.ax[i] = this.rnd() * Math.PI * 2;
    this.ay[i] = this.rnd() * Math.PI * 2;
    this.az[i] = 0;
    this.spinX[i] = (this.rnd() - 0.5) * 12;
    this.spinY[i] = (this.rnd() - 0.5) * 12;
    this.life[i] = LIFE;
    this.bounced[i] = 0;
    this.color.setHex(color);
    this.mesh.setColorAt(i, this.color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A burst of `count` pieces from a point, scattered around a base velocity. */
  burst(x: number, y: number, z: number, vx: number, vy: number, vz: number, count: number, size: number, color: number, spread = 3): void {
    for (let k = 0; k < count; k++) {
      this.spawn(
        x + (this.rnd() - 0.5) * 0.6, y + this.rnd() * 0.4, z + (this.rnd() - 0.5) * 0.6,
        vx + (this.rnd() - 0.5) * spread * 2, vy + 2 + this.rnd() * spread, vz + (this.rnd() - 0.5) * spread * 2,
        size * (0.6 + this.rnd() * 0.8), size * 0.12, size * (0.3 + this.rnd() * 0.5), color,
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if ((this.life[i] as number) <= 0) continue;
      this.life[i] = (this.life[i] as number) - dt;
      this.vy[i] = (this.vy[i] as number) - GRAVITY * dt;
      this.px[i] = (this.px[i] as number) + (this.vx[i] as number) * dt;
      this.py[i] = (this.py[i] as number) + (this.vy[i] as number) * dt;
      this.pz[i] = (this.pz[i] as number) + (this.vz[i] as number) * dt;
      const half = (this.sy[i] as number) * 0.5;
      if ((this.py[i] as number) < half) {
        this.py[i] = half;
        if (this.bounced[i] === 0 && (this.vy[i] as number) < -1) {
          this.vy[i] = -(this.vy[i] as number) * BOUNCE;
          this.bounced[i] = 1;
        } else {
          this.vy[i] = 0;
          this.vx[i] = (this.vx[i] as number) * 0.8;
          this.vz[i] = (this.vz[i] as number) * 0.8;
          this.spinX[i] = 0;
          this.spinY[i] = 0;
        }
      }
      this.ax[i] = (this.ax[i] as number) + (this.spinX[i] as number) * dt;
      this.ay[i] = (this.ay[i] as number) + (this.spinY[i] as number) * dt;
      const fade = Math.min(1, (this.life[i] as number) / 0.4);
      this.p.set(this.px[i] as number, this.py[i] as number, this.pz[i]);
      this.e.set(this.ax[i] as number, this.ay[i] as number, 0);
      this.q.setFromEuler(this.e);
      this.s.set((this.sx[i] as number) * fade, (this.sy[i] as number) * fade, (this.sz[i] as number) * fade);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      if ((this.life[i] as number) <= 0) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
