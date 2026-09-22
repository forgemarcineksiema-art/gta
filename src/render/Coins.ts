/**
 * Coins (docs/STYLE.md, the run HUD, coins and ramps): one instanced mesh of
 * upright octagons over the chunks the city view has claimed, carOrange, and
 * a second of twelve bigger carWhite ones for the spill pool. They spin in
 * the vertex shader from one time uniform, so a spinning coin costs no matrix
 * upload. Picked coins leave the packed list (the last live instance takes
 * their slot); nothing is uploaded unless a coin was added or picked.
 * Reads sim state only.
 */
import * as THREE from 'three';
import { PALETTE, type SimWorld } from '../sim';
import { EXTRA_COIN_BASE, type CoinDesc, type Coins as SimCoins } from '../sim/city/coins';

const CAPACITY = 4096;
const SPIN = 3;

export class Coins {
  private readonly mesh: THREE.InstancedMesh;
  private readonly spill: THREE.InstancedMesh;
  private readonly time = { value: 0 };
  /** Packed live instances: slot → coin, and coin id → slot. */
  private readonly slotCoin: CoinDesc[] = [];
  private readonly slotOf = new Map<number, number>();
  private readonly known = new Set<number>();
  private count = 0;
  private pickedSeen = 0;
  private spillSerial = -1;
  private extraSerial = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.CircleGeometry(0.42, 8).translate(0, 0.9, 0);
    this.mesh = new THREE.InstancedMesh(geometry, this.material(PALETTE.carOrange), CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    const big = new THREE.CircleGeometry(0.6, 8).translate(0, 1.0, 0);
    this.spill = new THREE.InstancedMesh(big, this.material(PALETTE.carWhite), 16);
    this.spill.count = 0;
    this.spill.frustumCulled = false;
    this.spill.castShadow = false;
    scene.add(this.spill);
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
      this.p.set(c.x, 0, c.z);
      this.mesh.setMatrixAt(slot, this.m.compose(this.p, this.q, this.s));
      changed = true;
    }
    if (changed) {
      this.mesh.count = this.count;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(sim: SimWorld, dt: number): void {
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
    if (coins.spillSerial !== this.spillSerial) {
      this.spillSerial = coins.spillSerial;
      let n = 0;
      for (let k = 0; k < coins.spillTtl.length; k++) {
        if ((coins.spillTtl[k] as number) <= 0) continue;
        this.p.set(coins.spillX[k] as number, 0, coins.spillZ[k]);
        this.spill.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
      }
      this.spill.count = n;
      this.spill.instanceMatrix.needsUpdate = true;
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
      }
      this.count--;
      slot--;
      changed = true;
    }
    if (changed) {
      this.mesh.count = this.count;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private material(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
    const time = this.time;
    // spin about the instance's own vertical axis, before the instance matrix places it
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = time;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float spinA = uTime * ${SPIN.toFixed(1)};
          float spinC = cos(spinA), spinS = sin(spinA);
          objectNormal = vec3(spinC * objectNormal.x + spinS * objectNormal.z, objectNormal.y, -spinS * objectNormal.x + spinC * objectNormal.z);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed = vec3(spinC * transformed.x + spinS * transformed.z, transformed.y, -spinS * transformed.x + spinC * transformed.z);`);
    };
    return material;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.spill.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.spill.material as THREE.Material).dispose();
  }
}
