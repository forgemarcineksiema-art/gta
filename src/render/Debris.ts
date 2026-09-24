/**
 * Debris: bumpers that fall off, planks from a smashed billboard, bits of a
 * taken-down car, and what a smashed prop throws by its material (M8 slice 5):
 * glass shards, paper, fruit, splinters, plastic and ceramic chunks, bolts. A
 * fixed pool with fake physics (gravity, one bounce on the ground, spin, a
 * fixed life), no Rapier: boxes in one instanced mesh, the round pieces (fruit)
 * in another, each hidden while it has nothing in flight. Dead pieces are
 * scaled to zero. Typed arrays, no allocation after construction.
 */
import * as THREE from 'three';
import { PALETTE, type PropMaterial } from '../sim';

export const DEBRIS_POOL = 96;
const POOL = DEBRIS_POOL;
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
  /** 1 for a round piece (the round mesh), and each piece's share of gravity (paper flutters down). */
  private readonly round = new Uint8Array(POOL);
  private readonly fall = new Float32Array(POOL).fill(1);
  /** The round pieces (fruit): their own instanced mesh. */
  readonly balls: THREE.InstancedMesh;
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
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), material, POOL);
    this.balls.frustumCulled = false;
    this.balls.castShadow = false;
    for (let i = 0; i < POOL; i++) { this.balls.setMatrixAt(i, this.m.makeScale(0, 0, 0)); this.balls.setColorAt(i, this.color); }
    this.balls.instanceMatrix.needsUpdate = true;
    this.balls.visible = false;
    scene.add(this.balls);
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Throw one piece. Velocity in m/s, size in metres, colour 0xRRGGBB; a round one, and its share of gravity. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, color: number, round = false, fall = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    // the slot leaves the other mesh for good
    if ((this.round[i] === 1) !== round) (round ? this.mesh : this.balls).setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.round[i] = round ? 1 : 0;
    this.fall[i] = fall;
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
    const mesh = round ? this.balls : this.mesh;
    mesh.setColorAt(i, this.color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * What a smashed prop throws, by its material, from where it stood, with the knock's way (`vx`, `vz`): shards of
   * glass, sheets of paper fluttering down, fruit rolling, splinters of wood, chunks of plastic in the thing's
   * colour, shards of ceramic, bolts from metal (its sparks are the Sparks view's).
   */
  smash(material: PropMaterial, x: number, y: number, z: number, vx: number, vz: number, color: number): void {
    const n = material === 'glass' ? 16 : material === 'paper' ? 14 : material === 'fruit' ? 12 : material === 'wood' ? 9 : material === 'metal' ? 4 : 7;
    for (let k = 0; k < n; k++) {
      const px = x + (this.rnd() - 0.5) * 0.6, py = y + this.rnd() * 0.6, pz = z + (this.rnd() - 0.5) * 0.6;
      const sx = (this.rnd() - 0.5), sz = (this.rnd() - 0.5), up = this.rnd();
      switch (material) {
        case 'glass':
          this.spawn(px, py + 0.8, pz, vx * 0.5 + sx * 5, 2 + up * 3, vz * 0.5 + sz * 5, 0.14 + this.rnd() * 0.12, 0.012, 0.08 + this.rnd() * 0.1, k % 3 ? PALETTE.glass : 0xe9f6ff);
          break;
        case 'paper':
          this.spawn(px, py + 0.6, pz, vx * 0.3 + sx * 3, 2.5 + up * 2.5, vz * 0.3 + sz * 3, 0.2, 0.006, 0.28, k % 4 ? PALETTE.carWhite : color, false, 0.18);
          break;
        case 'fruit':
          this.spawn(px, py + 0.5, pz, vx * 0.5 + sx * 4, 1.5 + up * 2.5, vz * 0.5 + sz * 4, 0.13, 0.13, 0.13, k % 3 === 0 ? PALETTE.carRed : k % 3 === 1 ? PALETTE.carOrange : PALETTE.carLime, true);
          break;
        case 'wood':
          this.spawn(px, py, pz, vx * 0.5 + sx * 4, 2 + up * 3, vz * 0.5 + sz * 4, 0.35 + this.rnd() * 0.25, 0.035, 0.05, k % 2 ? color : 0xc9a26b);
          break;
        case 'metal':
          this.spawn(px, py, pz, vx * 0.4 + sx * 3, 2 + up * 2, vz * 0.4 + sz * 3, 0.07, 0.07, 0.07, k % 2 ? PALETTE.steel : PALETTE.graphite);
          break;
        case 'ceramic':
          this.spawn(px, py, pz, vx * 0.5 + sx * 4, 2 + up * 2, vz * 0.5 + sz * 4, 0.09, 0.05, 0.09, k % 3 === 0 ? PALETTE.carRed : k % 3 === 1 ? PALETTE.carBlue : PALETTE.carWhite);
          break;
        default:
          this.spawn(px, py, pz, vx * 0.5 + sx * 4, 2 + up * 2.5, vz * 0.5 + sz * 4, 0.16, 0.1, 0.13, color);
      }
    }
  }

  /** Pieces in flight now (tests). */
  get alive(): number {
    let n = 0;
    for (let i = 0; i < POOL; i++) if ((this.life[i] as number) > 0) n++;
    return n;
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
    // pieces in flight at the frame's start, and after it: nothing in flight is no upload and no draw (the M7 gate)
    let moved = 0, movedBalls = 0, alive = 0, balls = 0;
    for (let i = 0; i < POOL; i++) {
      if ((this.life[i] as number) <= 0) continue;
      const ball = this.round[i] === 1, mesh = ball ? this.balls : this.mesh;
      if (ball) movedBalls++; else moved++;
      this.life[i] = (this.life[i] as number) - dt;
      this.vy[i] = (this.vy[i] as number) - GRAVITY * (this.fall[i] as number) * dt;
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
      mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      if ((this.life[i] as number) <= 0) mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      else if (ball) balls++;
      else alive++;
    }
    if (moved > 0) this.mesh.instanceMatrix.needsUpdate = true;
    if (movedBalls > 0) this.balls.instanceMatrix.needsUpdate = true;
    if (this.mesh.visible !== alive > 0) this.mesh.visible = alive > 0;
    if (this.balls.visible !== balls > 0) this.balls.visible = balls > 0;
  }
}
