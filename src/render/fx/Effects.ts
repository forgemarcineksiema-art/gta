/**
 * The effects together: speed lines, sparks, debris, smoke and skid marks; what each sim event throws; the smoke off
 * the player's bonnet by damage stage and off wrecked traffic nearby. The smoke is made by the renderer first (its
 * points are sized by the viewport from the first resize) and handed in.
 */
import * as THREE from 'three';
import { AgentState } from '../../sim/traffic/Traffic';
import { PALETTE, PROP_KINDS, PROP_TYPES, type PropKind, type SimEvent, type SimWorld, type VehicleTelemetry } from '../../sim';
import { propParts } from '../props/propMesh';
import type { Billboards } from '../city/Billboards';
import { Debris } from './Debris';
import { SkidMarks } from './SkidMarks';
import type { Smoke } from './Smoke';
import { Sparks } from './Sparks';
import { SpeedLines } from './SpeedLines';

export class Effects {
  private readonly speedLines = new SpeedLines();
  private readonly sparks = new Sparks();
  private readonly debris: Debris;
  /** The tyres' marks on the ground (M7 slice 4). */
  private readonly skid: SkidMarks;
  private smokeAcc = 0;
  private fireAcc = 0;
  private readonly wreckSmokeAcc: Float32Array;
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly sim: SimWorld, private readonly smoke: Smoke, private readonly billboards: Billboards | null) {
    scene.add(this.speedLines.object);
    scene.add(this.sparks.object);
    scene.add(this.sparks.heads);
    this.debris = new Debris(scene);
    scene.add(smoke.object);
    this.skid = new SkidMarks(scene);
    this.wreckSmokeAcc = new Float32Array(sim.traffic?.capacity ?? 1);
  }

  /** The speed lines and the scrape's sparks from this frame's telemetry, before the events add theirs. */
  drive(tm: VehicleTelemetry, vel: THREE.Vector3, aspect: number, dt: number): void {
    this.speedLines.update(tm, Math.hypot(vel.x, vel.z), aspect, dt);
    this.sparks.update(tm, vel, dt);
  }

  /** What a sim event throws: parts fly off, a wreck bursts, a prop shatters. Returns the camera's jolt (0 none). */
  onEvent(e: SimEvent, car: THREE.Object3D, vel: THREE.Vector3): number {
    const paint = this.sim.carPaint;
    if (e.kind === 'damage') {
      this.tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
      const front = e.value === 1;
      const along = front ? 2.2 : e.value === 2 ? -2.2 : 0;
      this.tmpPos.copy(car.position).addScaledVector(this.tmpFwd, along);
      // thrown back off the car: its own velocity less 4 m/s along the nose, a little up, with spin
      const vx = vel.x - this.tmpFwd.x * 4, vz = vel.z - this.tmpFwd.z * 4;
      if (e.value <= 2) this.debris.spawn(this.tmpPos.x, this.tmpPos.y + 0.3, this.tmpPos.z, vx, 2.5, vz, 1.7, 0.09, 0.14, front ? PALETTE.silver : PALETTE.charcoal);
      else this.debris.burst(this.tmpPos.x, this.tmpPos.y + 0.9, this.tmpPos.z, vx, 1.5, vz, 3, 0.3, paint, 2.5);
    } else if (e.kind === 'wrecked') {
      this.debris.burst(e.x, e.y + 0.8, e.z, vel.x * 0.5, 4, vel.z * 0.5, 8, 0.45, paint, 4);
      for (let k = 0; k < 24; k++) this.smoke.emit(k % 3 ? 'fire' : 'dark', e.x, e.y + 0.9, e.z, vel.x, vel.z);
    } else if (e.kind === 'takedown' || e.kind === 'takedownTraffic') {
      const tint = e.target >= 0 && this.sim.traffic ? (this.sim.traffic.paint[e.target] as number) : PALETTE.charcoal;
      this.debris.burst(e.x, e.y + 0.6, e.z, 0, 3, 0, e.kind === 'takedownTraffic' ? 10 : 6, 0.4, tint, 4);
      for (let k = 0; k < 16; k++) this.smoke.emit(k % 2 ? 'fire' : 'dark', e.x, e.y + 0.8, e.z);
    } else if (e.kind === 'breaker') {
      // the tower comes down: boards and poles over the street, dust, a jolt
      this.debris.burst(e.x, e.y, e.z, vel.x * 0.3, 3, vel.z * 0.3, 16, 0.5, PALETTE.sand, 5);
      this.debris.burst(e.x, e.y * 0.6, e.z, 0, 2, 0, 8, 0.3, PALETTE.steel, 4);
      return 0.3;
    } else if (e.kind === 'smash') {
      // a prop knocked down (M8 slice 5): what its material throws from where it stood, with the knock's way; sparks off metal
      const props = this.sim.props, k = props ? props.kind[e.target] ?? 255 : 255;
      if (k !== 255) {
        const kind = PROP_KINDS[k] as PropKind, material = PROP_TYPES[kind].material;
        this.debris.smash(material, e.x, Math.min(e.y, 1.2), e.z, vel.x * 0.6, vel.z * 0.6, propParts(kind)[0]?.color ?? PALETTE.steel);
        if (material === 'metal') this.sparks.burst(e.x, 0.5, e.z, 24);
      }
    } else if (e.kind === 'billboard') {
      // planks in the panel's paint fly on with the car, and the camera takes a jolt
      const tint = this.billboards?.descOf(e.target)?.paint ?? PALETTE.charcoal;
      this.debris.burst(e.x, e.y, e.z, vel.x * 0.6, 4, vel.z * 0.6, 14, 0.5, tint, 5);
      this.debris.burst(e.x, e.y - 1, e.z, vel.x * 0.4, 3, vel.z * 0.4, 6, 0.25, PALETTE.steel, 3);
      return 0.35;
    }
    return 0;
  }

  /** Smoke and fire on the player's bonnet by damage stage, and dark smoke from wrecked traffic nearby. */
  emitSmoke(dt: number, car: THREE.Object3D, vel: THREE.Vector3): void {
    const stage = this.sim.life.state.stage;
    if (stage >= 2) {
      this.tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
      this.tmpPos.copy(car.position).addScaledVector(this.tmpFwd, 1.5);
      const y = this.tmpPos.y + 0.85;
      // The same leak spread through more air at speed: half as dense at 36 km/h, a quarter at 108.
      const density = 1 / (1 + Math.hypot(vel.x, vel.z) / 10);
      this.smokeAcc += (stage === 2 ? 10 : 24) * dt;
      while (this.smokeAcc >= 1) { this.smokeAcc -= 1; this.smoke.emit(stage === 2 ? 'smoke' : 'dark', this.tmpPos.x, y, this.tmpPos.z, vel.x, vel.z, density); }
      if (stage >= 3) {
        this.fireAcc += (stage === 3 ? 20 : 25) * dt;
        while (this.fireAcc >= 1) { this.fireAcc -= 1; this.smoke.emit('fire', this.tmpPos.x, y, this.tmpPos.z, vel.x, vel.z, Math.max(0.5, density)); }
      }
    } else { this.smokeAcc = 0; this.fireAcc = 0; }
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const px = car.position.x, pz = car.position.z;
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] !== AgentState.Wrecked) { this.wreckSmokeAcc[i] = 0; continue; }
      const dx = (traffic.x[i] as number) - px, dz = (traffic.z[i] as number) - pz;
      if (dx * dx + dz * dz > 120 * 120) continue;
      this.wreckSmokeAcc[i] = (this.wreckSmokeAcc[i] as number) + 10 * dt;
      while ((this.wreckSmokeAcc[i] as number) >= 1) {
        this.wreckSmokeAcc[i] = (this.wreckSmokeAcc[i] as number) - 1;
        this.smoke.emit('dark', traffic.x[i] as number, 1.1, traffic.z[i] as number);
      }
    }
  }

  /** The skid marks fade by `elapsed` (the renderer's clock, stopped while paused); debris and smoke move on. */
  update(dt: number, elapsed: number): void {
    this.skid.update(this.sim, elapsed);
    this.debris.update(dt);
    this.smoke.update(dt);
  }

  dispose(): void {
    this.skid.dispose();
  }
}
