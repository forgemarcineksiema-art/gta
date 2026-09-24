/**
 * Coins (docs/STYLE.md, the run HUD, coins and ramps): one instanced mesh of
 * upright gold octagonal prisms over the chunks the city view has claimed
 * (the cap a line ends on half as big again), a second of bigger carWhite
 * ones for the spill pool. They spin in the vertex shader from one time
 * uniform and a per-instance phase, so a line ripples away from the player
 * and a spinning coin costs no matrix upload. Picked coins leave the packed
 * list (the last live instance takes their slot) and fly into the car's
 * bonnet from a small pool driven by the 'coin' events: the catch. Nothing is
 * uploaded unless a coin was added, picked or is flying. Reads sim state only.
 */
import * as THREE from 'three';
import { BALANCE } from '../sim/balance';
import { PALETTE, type SimEvent, type SimWorld } from '../sim';
import { COIN_HEIGHT, EXTRA_COIN_BASE, type CoinDesc, type Coins as SimCoins } from '../sim/city/coins';

const CAPACITY = 4096;
const SPIN = 3.5;
/** Radians between neighbours on a line: the ripple runs down it at about 30 m/s. */
const RIPPLE = 0.55;
const RADIUS = 0.5;
const THICKNESS = 0.16;
const CAP_SCALE = 1.5;
const SPILL_SCALE = 1.7;
const FLY_SECONDS = 0.16;
const FLY_POOL = 16;
/**
 * The spill's burst (M7 slice 4): the coins fly out of the wreck to their places on the lane, one after another
 * (`BURST_STAGGER` s apart), each in `BURST_FLIGHT` s on an arc `BURST_ARC` m high.
 */
export const BURST_STAGGER = 0.02;
export const BURST_FLIGHT = 0.28;
export const BURST_ARC = 2.2;

/** Where the `k`-th spilled coin is `elapsed` s into the burst, from the wreck (ox, oz) to its place (sx, sz). */
export function burstPoint(ox: number, oz: number, sx: number, sz: number, k: number, elapsed: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const u = Math.max(0, Math.min(1, (elapsed - k * BURST_STAGGER) / BURST_FLIGHT));
  const e = 1 - (1 - u) * (1 - u);
  out.x = ox + (sx - ox) * e;
  out.z = oz + (sz - oz) * e;
  out.y = COIN_HEIGHT + BURST_ARC * 4 * u * (1 - u);
  return out;
}

/** An octagonal prism on edge, its axis along z: 16 side triangles and two six-triangle caps, flat normals. */
function coinGeometry(radius: number, thickness: number): THREE.BufferGeometry {
  const n = 8, h = thickness / 2;
  const pos: number[] = [], nor: number[] = [];
  const ring = (k: number): [number, number] => {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  };
  const tri = (a: number[], b: number[], c: number[], nx: number, ny: number, nz: number): void => {
    pos.push(...a, ...b, ...c);
    nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };
  for (let k = 0; k < n; k++) {
    const [x0, y0] = ring(k), [x1, y1] = ring(k + 1);
    const a = ((k + 0.5) / n) * Math.PI * 2 + Math.PI / n;
    const nx = Math.cos(a), ny = Math.sin(a);
    tri([x0, y0, h], [x1, y1, -h], [x1, y1, h], nx, ny, 0);
    tri([x0, y0, h], [x0, y0, -h], [x1, y1, -h], nx, ny, 0);
  }
  const [fx, fy] = ring(0);
  for (let k = 1; k + 1 < n; k++) {
    const [x0, y0] = ring(k), [x1, y1] = ring(k + 1);
    tri([fx, fy, h], [x0, y0, h], [x1, y1, h], 0, 0, 1);
    tri([fx, fy, -h], [x1, y1, -h], [x0, y0, -h], 0, 0, -1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geometry;
}

interface Pool {
  mesh: THREE.InstancedMesh;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  scale: Float32Array;
  left: Float32Array;
}

export class Coins {
  private readonly mesh: THREE.InstancedMesh;
  private readonly phase: THREE.InstancedBufferAttribute;
  private readonly spill: THREE.InstancedMesh;
  private readonly flyGold: Pool;
  private readonly flyWhite: Pool;
  private readonly time = { value: 0 };
  /** Packed live instances: slot → coin, and coin id → slot. */
  private readonly slotCoin: CoinDesc[] = [];
  private readonly slotOf = new Map<number, number>();
  private readonly known = new Set<number>();
  private count = 0;
  private pickedSeen = 0;
  private spillSerial = -1;
  private extraSerial = 0;
  private eventSeq = 0;
  private readonly onEvent = (e: SimEvent): void => this.handleEvent(e);
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly target = new THREE.Vector3();
  /** The spill's burst: seconds into it (-1 none) and the wreck it flies out of. */
  private burst = -1;
  private burstX = 0;
  private burstZ = 0;
  private readonly bp = { x: 0, y: 0, z: 0 };

  constructor(scene: THREE.Scene) {
    const geometry = coinGeometry(RADIUS, THICKNESS);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    this.phase.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPhase', this.phase);
    this.mesh = new THREE.InstancedMesh(geometry, this.material(PALETTE.coin), CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    const spillGeometry = coinGeometry(RADIUS, THICKNESS);
    const spillPhase = new THREE.InstancedBufferAttribute(new Float32Array(16), 1);
    for (let k = 0; k < 16; k++) spillPhase.setX(k, k);
    spillGeometry.setAttribute('aPhase', spillPhase);
    this.spill = new THREE.InstancedMesh(spillGeometry, this.material(PALETTE.carWhite), 16);
    this.spill.count = 0;
    this.spill.frustumCulled = false;
    this.spill.castShadow = false;
    scene.add(this.spill);
    this.flyGold = this.pool(scene, PALETTE.coin);
    this.flyWhite = this.pool(scene, PALETTE.carWhite);
  }

  private pool(scene: THREE.Scene, color: number): Pool {
    const geometry = coinGeometry(RADIUS, THICKNESS);
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(FLY_POOL), 1));
    const mesh = new THREE.InstancedMesh(geometry, this.material(color), FLY_POOL);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    scene.add(mesh);
    return { mesh, x: new Float32Array(FLY_POOL), y: new Float32Array(FLY_POOL), z: new Float32Array(FLY_POOL), scale: new Float32Array(FLY_POOL), left: new Float32Array(FLY_POOL) };
  }

  /** Register a claimed chunk's coins (idempotent per id; picked ones are skipped). */
  add(coins: readonly CoinDesc[], sim: SimWorld): void {
    const picked = sim.coins?.picked;
    let changed = false;
    for (const c of coins) {
      if (this.known.has(c.id) || this.count >= CAPACITY) continue;
      this.known.add(c.id);
      if (picked && picked[c.id] === 1) continue;
      const slot = this.count++;
      this.slotOf.set(c.id, slot);
      this.slotCoin[slot] = c;
      this.p.set(c.x, c.y, c.z);
      const scale = c.value >= BALANCE.coin.cap ? CAP_SCALE : 1;
      this.s.set(scale, scale, scale);
      this.mesh.setMatrixAt(slot, this.m.compose(this.p, this.q, this.s));
      this.phase.setX(slot, c.phase);
      changed = true;
    }
    if (changed) {
      this.mesh.count = this.count;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.phase.needsUpdate = true;
    }
  }

  /** `car` is the render car's interpolated position: what a picked coin flies into. */
  update(sim: SimWorld, dt: number, car: THREE.Vector3): void {
    this.time.value += dt;
    const coins = sim.coins;
    if (!coins) return;
    if (coins.extraSerial !== this.extraSerial) {
      this.extraSerial = coins.extraSerial;
      this.replaceExtra(coins, sim);
    }
    if (coins.pickedCount !== this.pickedSeen) {
      this.pickedSeen = coins.pickedCount;
      this.removePicked(coins);
    }
    // the events first: a spill this frame starts its burst before the coins are packed
    this.eventSeq = sim.events.readFrom(this.eventSeq, this.onEvent);
    const bursting = this.burst >= 0;
    if (bursting) this.burst += dt;
    if (coins.spillSerial !== this.spillSerial || bursting) {
      this.spillSerial = coins.spillSerial;
      const flying = this.burst >= 0 && this.burst < BURST_STAGGER * coins.spillTtl.length + BURST_FLIGHT;
      if (!flying) this.burst = -1;
      let n = 0;
      this.s.set(SPILL_SCALE, SPILL_SCALE, SPILL_SCALE);
      for (let k = 0; k < coins.spillTtl.length; k++) {
        if ((coins.spillTtl[k] as number) <= 0) continue;
        if (flying) {
          const b = burstPoint(this.burstX, this.burstZ, coins.spillX[k] as number, coins.spillZ[k] as number, k, this.burst, this.bp);
          this.p.set(b.x, b.y, b.z);
        } else {
          this.p.set(coins.spillX[k] as number, COIN_HEIGHT, coins.spillZ[k]);
        }
        this.spill.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
      }
      this.spill.count = n;
      this.spill.instanceMatrix.needsUpdate = true;
    }
    this.target.set(car.x, car.y + 0.8, car.z);
    this.fly(this.flyGold, dt);
    this.fly(this.flyWhite, dt);
    // three issues a draw call for an instanced mesh of no instances: an empty one is hidden (the M7 gate's A/B)
    Coins.show(this.mesh);
    Coins.show(this.spill);
    Coins.show(this.flyGold.mesh);
    Coins.show(this.flyWhite.mesh);
  }

  private static show(mesh: THREE.InstancedMesh): void {
    const visible = mesh.count > 0;
    if (mesh.visible !== visible) mesh.visible = visible;
  }

  /** A picked coin starts its flight where it lay; a spilled one (target -2) is white; a spill starts the burst. */
  private handleEvent(e: SimEvent): void {
    if (e.kind === 'spill') {
      this.burst = 0;
      this.burstX = e.x;
      this.burstZ = e.z;
      return;
    }
    if (e.kind !== 'coin') return;
    const pool = e.target === -2 ? this.flyWhite : this.flyGold;
    const scale = e.target === -2 ? SPILL_SCALE : e.value >= BALANCE.coin.cap ? CAP_SCALE : 1;
    let slot = -1, oldest = -1, oldestLeft = Infinity;
    for (let k = 0; k < FLY_POOL; k++) {
      const left = pool.left[k] as number;
      if (left <= 0) { slot = k; break; }
      if (left < oldestLeft) { oldestLeft = left; oldest = k; }
    }
    if (slot < 0) slot = oldest;
    pool.x[slot] = e.x;
    pool.y[slot] = e.y;
    pool.z[slot] = e.z;
    pool.scale[slot] = scale;
    pool.left[slot] = FLY_SECONDS;
  }

  /** Every flying coin closes on the bonnet with an ease-in, swelling a little and shrinking to nothing as it lands. */
  private fly(pool: Pool, dt: number): void {
    let n = 0;
    for (let k = 0; k < FLY_POOL; k++) {
      const left = pool.left[k] as number;
      if (left <= 0) continue;
      const next = left - dt;
      pool.left[k] = next > 0 ? next : 0;
      if (next <= 0) continue;
      const t = 1 - next / FLY_SECONDS;
      const ease = t * t;
      this.p.set(
        (pool.x[k] as number) + (this.target.x - (pool.x[k] as number)) * ease,
        (pool.y[k] as number) + (this.target.y - (pool.y[k] as number)) * ease,
        (pool.z[k] as number) + (this.target.z - (pool.z[k] as number)) * ease,
      );
      const scale = (pool.scale[k] as number) * (1 + 0.3 * Math.sin(Math.PI * t)) * (1 - t * t * t);
      this.s.set(scale, scale, scale);
      pool.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
    }
    if (n > 0 || pool.mesh.count > 0) {
      pool.mesh.count = n;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** The run-time coins changed (laid or cleared): drop every extra slot and register the current ones. */
  private replaceExtra(coins: SimCoins, sim: SimWorld): void {
    this.removeWhere(coins, true);
    for (const id of this.known) if (id >= EXTRA_COIN_BASE) this.known.delete(id);
    this.add(coins.extra, sim);
  }

  /** Swap-remove every live slot whose coin was picked since the last look. */
  private removePicked(coins: SimCoins): void {
    this.removeWhere(coins, false);
  }

  /** Swap-remove the picked coins, or every run-time coin (`extra`); no closure, so nothing is allocated. */
  private removeWhere(coins: SimCoins, extra: boolean): void {
    let changed = false;
    for (let slot = 0; slot < this.count; slot++) {
      const c = this.slotCoin[slot] as CoinDesc;
      if (extra ? c.id < EXTRA_COIN_BASE : coins.picked[c.id] !== 1) continue;
      const last = this.count - 1;
      const moved = this.slotCoin[last] as CoinDesc;
      this.slotOf.delete(c.id);
      if (slot !== last) {
        this.slotCoin[slot] = moved;
        this.slotOf.set(moved.id, slot);
        this.mesh.getMatrixAt(last, this.m);
        this.mesh.setMatrixAt(slot, this.m);
        this.phase.setX(slot, this.phase.getX(last));
      }
      this.count--;
      slot--;
      changed = true;
    }
    if (changed) {
      this.mesh.count = this.count;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.phase.needsUpdate = true;
    }
  }

  /** Lit from within so a coin never goes dark in shadow; spun and bobbed in the vertex shader, phase per instance. */
  private material(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35, flatShading: true });
    const time = this.time;
    // spin about the instance's own vertical axis, before the instance matrix places it
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = time;
      shader.vertexShader = `uniform float uTime;\nattribute float aPhase;\n${shader.vertexShader}`
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float spinA = uTime * ${SPIN.toFixed(2)} - aPhase * ${RIPPLE.toFixed(2)};
          float spinC = cos(spinA), spinS = sin(spinA);
          objectNormal = vec3(spinC * objectNormal.x + spinS * objectNormal.z, objectNormal.y, -spinS * objectNormal.x + spinC * objectNormal.z);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed = vec3(spinC * transformed.x + spinS * transformed.z, transformed.y + 0.06 * sin(uTime * 2.6 - aPhase * ${RIPPLE.toFixed(2)}), -spinS * transformed.x + spinC * transformed.z);`);
    };
    return material;
  }

  dispose(): void {
    for (const mesh of [this.mesh, this.spill, this.flyGold.mesh, this.flyWhite.mesh]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
