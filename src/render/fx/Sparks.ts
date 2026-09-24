/**
 * Sparks where the body scrapes a wall. A fixed pool: each spark is a bright
 * point (a few pixels, so it reads at any resolution) with a streak along its
 * own velocity behind it; two draw calls for the whole pool. Sparks are thrown
 * from the contact point along the wall behind the car, falling under gravity
 * and dying on the ground. Emission follows `telemetry.scrape`; a hit adds a
 * burst scaled by the speed lost. Colours run hot white-yellow to orange.
 * Nothing is drawn in front of the car: the contact point is on its flank.
 */
import * as THREE from 'three';
import type { VehicleTelemetry } from '../../sim';

const POOL = 192;
const GRAVITY = 12;
const HIDDEN_Y = -100;

export interface SparkTuning {
  /** Sparks per second at full scrape (plus a floor while touching). */
  rate: number;
  rateFloor: number;
  /** Burst size per m/s of impact, and its cap. */
  burstPerImpact: number;
  burstMax: number;
  lifeMin: number;
  lifeMax: number;
  /** Share of the car's speed along the wall the sparks keep. */
  carry: number;
  spread: number;
  /** Streak length in seconds of travel. */
  streak: number;
}

export const DEFAULT_SPARKS: SparkTuning = {
  rate: 300,
  rateFloor: 60,
  burstPerImpact: 4,
  burstMax: 70,
  lifeMin: 0.18,
  lifeMax: 0.5,
  carry: 0.35,
  spread: 4.5,
  streak: 0.03,
};

const HOT = new THREE.Color(1.0, 0.96, 0.72);
const COOL = new THREE.Color(1.0, 0.42, 0.08);

export class Sparks {
  /** Add both to the scene: the streaks and the heads. */
  readonly object: THREE.LineSegments;
  readonly heads: THREE.Points;
  tuning: SparkTuning = { ...DEFAULT_SPARKS };
  private readonly px = new Float32Array(POOL);
  private readonly py = new Float32Array(POOL);
  private readonly pz = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly vz = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly maxLife = new Float32Array(POOL);
  private readonly positions: Float32Array;
  private readonly headPos: Float32Array;
  private readonly headCol: Float32Array;
  private readonly headPosAttr: THREE.BufferAttribute;
  private readonly headColAttr: THREE.BufferAttribute;
  private readonly colors: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private next = 0;
  private emitAcc = 0;
  private seed = 0x9e3779b9;
  private alive = 0;

  constructor() {
    this.positions = new Float32Array(POOL * 6);
    this.colors = new Float32Array(POOL * 6);
    this.positions.fill(HIDDEN_Y);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.object = new THREE.LineSegments(g, m);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    this.headPos = new Float32Array(POOL * 3);
    this.headCol = new Float32Array(POOL * 3);
    this.headPos.fill(HIDDEN_Y);
    const hg = new THREE.BufferGeometry();
    this.headPosAttr = new THREE.BufferAttribute(this.headPos, 3);
    this.headColAttr = new THREE.BufferAttribute(this.headCol, 3);
    this.headPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.headColAttr.setUsage(THREE.DynamicDrawUsage);
    hg.setAttribute('position', this.headPosAttr);
    hg.setAttribute('color', this.headColAttr);
    const hm = new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.heads = new THREE.Points(hg, hm);
    this.heads.frustumCulled = false;
    this.heads.renderOrder = 6;
  }

  private rand(): number {
    // xorshift32: cheap, deterministic, good enough for sparks
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  private emit(tm: VehicleTelemetry, carVel: THREE.Vector3, count: number): void {
    const t = this.tuning;
    const nx = tm.contactNx;
    const ny = tm.contactNy;
    const nz = tm.contactNz;
    // car velocity along the wall (the tangential part)
    const vn = carVel.x * nx + carVel.y * ny + carVel.z * nz;
    const tx = carVel.x - nx * vn;
    const ty = carVel.y - ny * vn;
    const tz = carVel.z - nz * vn;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      this.px[i] = tm.contactX + (this.rand() - 0.5) * 0.3;
      this.py[i] = tm.contactY + (this.rand() - 0.5) * 0.2;
      this.pz[i] = tm.contactZ + (this.rand() - 0.5) * 0.3;
      const carry = t.carry * (0.4 + 1.2 * this.rand());
      const s = t.spread;
      this.vx[i] = tx * carry + (this.rand() - 0.5) * s + nx * (0.5 + this.rand() * 1.5);
      this.vy[i] = ty * carry + this.rand() * s * 0.8 + 1.0;
      this.vz[i] = tz * carry + (this.rand() - 0.5) * s + nz * (0.5 + this.rand() * 1.5);
      const l = t.lifeMin + (t.lifeMax - t.lifeMin) * this.rand();
      this.life[i] = l;
      this.maxLife[i] = l;
    }
  }

  /** A burst from a point, thrown every way and up (a lamp post's base giving, a meter sheared: M8 slice 5). */
  burst(x: number, y: number, z: number, count: number): void {
    const t = this.tuning;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      this.px[i] = x + (this.rand() - 0.5) * 0.3;
      this.py[i] = y + this.rand() * 0.3;
      this.pz[i] = z + (this.rand() - 0.5) * 0.3;
      const a = this.rand() * Math.PI * 2, s = t.spread * (0.6 + this.rand());
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = 1.5 + this.rand() * s;
      this.vz[i] = Math.sin(a) * s;
      const l = t.lifeMin + (t.lifeMax - t.lifeMin) * this.rand();
      this.life[i] = l;
      this.maxLife[i] = l;
    }
  }

  /** Per frame. `carVel` is the car's world velocity. */
  update(tm: VehicleTelemetry, carVel: THREE.Vector3, dt: number): void {
    const t = this.tuning;
    if (tm.contactSide !== 0) {
      this.emitAcc += (t.rateFloor + t.rate * tm.scrape) * dt;
      const n = Math.floor(this.emitAcc);
      if (n > 0) {
        this.emitAcc -= n;
        this.emit(tm, carVel, Math.min(n, 40));
      }
      if (tm.impact > 3) this.emit(tm, carVel, Math.min(t.burstMax, Math.floor(tm.impact * t.burstPerImpact)));
    } else {
      this.emitAcc = 0;
    }

    let alive = 0;
    for (let i = 0; i < POOL; i++) {
      const o = i * 6;
      let life = this.life[i] as number;
      if (life <= 0) {
        if (this.positions[o + 1] !== HIDDEN_Y) {
          this.positions[o + 1] = HIDDEN_Y;
          this.positions[o + 4] = HIDDEN_Y;
          this.headPos[i * 3 + 1] = HIDDEN_Y;
        }
        continue;
      }
      alive++;
      life -= dt;
      const vx = this.vx[i] as number;
      const vy = (this.vy[i] as number) - GRAVITY * dt;
      const vz = this.vz[i] as number;
      const x = (this.px[i] as number) + vx * dt;
      const y = (this.py[i] as number) + vy * dt;
      const z = (this.pz[i] as number) + vz * dt;
      if (y < 0.02) life = 0;
      this.life[i] = life;
      this.vy[i] = vy;
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      const k = Math.max(0, life / (this.maxLife[i] as number));
      const fade = k * k;
      const streak = t.streak * (0.5 + 0.5 * k);
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.positions[o + 3] = x - vx * streak;
      this.positions[o + 4] = y - vy * streak;
      this.positions[o + 5] = z - vz * streak;
      const cr = (COOL.r + (HOT.r - COOL.r) * k) * fade;
      const cg = (COOL.g + (HOT.g - COOL.g) * k) * fade;
      const cb = (COOL.b + (HOT.b - COOL.b) * k) * fade;
      this.colors[o] = cr;
      this.colors[o + 1] = cg;
      this.colors[o + 2] = cb;
      this.colors[o + 3] = cr * 0.3;
      this.colors[o + 4] = cg * 0.3;
      this.colors[o + 5] = cb * 0.3;
      this.headPos[i * 3] = x;
      this.headPos[i * 3 + 1] = y;
      this.headPos[i * 3 + 2] = z;
      this.headCol[i * 3] = cr;
      this.headCol[i * 3 + 1] = cg;
      this.headCol[i * 3 + 2] = cb;
    }
    if (alive > 0 || this.alive > 0) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.headPosAttr.needsUpdate = true;
      this.headColAttr.needsUpdate = true;
    }
    this.alive = alive;
    this.object.visible = alive > 0;
    this.heads.visible = alive > 0;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.heads.geometry.dispose();
    (this.heads.material as THREE.Material).dispose();
  }
}
