/**
 * What the ground throws up under the player's car: dust off dirt and grass behind a rolling wheel, thicker when the
 * wheel spins or slides; the hovercraft's cushion blowing spray off the sea (a mist at rest, a wall of it at speed)
 * and dust off dirt and grass; a landing's ring of dust (spray at sea) by how hard it came down onto the surface, with
 * sparks from the floor when the suspension bottoms out. Read from the sim's wheels (their ground, the sea, their slip)
 * at the drawn wheels' places, so a puff leaves the wheel the player sees; written nowhere else. The drift's tyre smoke
 * on the road is the player car's own (PlayerCar.emitTyreSmoke).
 */
import * as THREE from 'three';
import { CITY_COLORS, DIRT, GRASS, PALETTE, type VehicleTelemetry, type WheelState } from '../../sim';
import type { Smoke } from './Smoke';
import type { Sparks } from './Sparks';

export const KICKUP = {
  /** Below this speed (m/s) a wheel throws no dust; at `fullSpeed` and over, `rate` puffs a second a wheel on dirt. */
  minSpeed: 3,
  fullSpeed: 20,
  rate: 12,
  /** Grass throws this share of dirt's. */
  grass: 0.45,
  /** More a second from a wheel spinning or sliding hard (its slip past `slipFrom` over `slipSpan`). */
  slipRate: 14,
  slipFrom: 0.15,
  slipSpan: 0.4,
  /** The cushion's spray a second a skirt corner on the sea: at rest, per m/s, most. */
  sprayRest: 5,
  sprayPerSpeed: 1.6,
  sprayMax: 30,
  /** A landing's speed into the surface (m/s): the least that throws dust, the one that throws most, the one that bottoms out with sparks. */
  landMin: 3.5,
  landFull: 12,
  landSparks: 8,
};

/** Dust is the ground's colour gone pale in the air. */
const PALE = 0xefe6d2;
function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
export const DUST = {
  dirt: mixHex(CITY_COLORS.soil, PALE, 0.4),
  grass: mixHex(mixHex(PALETTE.grass, CITY_COLORS.soil, 0.5), PALE, 0.3),
  road: mixHex(PALETTE.concrete, PALE, 0.35),
  spray: 0xeef8fc,
};

/** The wheel's part of the sim's state the dust reads. */
export type GroundWheel = Pick<WheelState, 'grounded' | 'surface' | 'water' | 'contact' | 'normal' | 'slipAngle' | 'slipRatio'>;

export class Kickup {
  private readonly acc = new Float32Array(8);
  private seed = 0x2545f491;
  /** In the air since the last touchdown, with its velocity and place on the last frame up there. */
  private flying = false;
  private readonly airVel = new THREE.Vector3();
  private readonly airPos = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /**
   * Each frame. `wheels` are the sim's, `drawn` the drawn wheels in the same order, `car` the drawn car, `vel` its
   * velocity; `hover` for the hovercraft's cushion.
   */
  update(dt: number, wheels: readonly GroundWheel[], tm: Pick<VehicleTelemetry, 'airborne'>, hover: boolean, drawn: readonly THREE.Object3D[], car: THREE.Object3D, vel: THREE.Vector3, smoke: Smoke, sparks: Sparks): void {
    const K = KICKUP, speed = Math.hypot(vel.x, vel.z);
    const cx = car.position.x, cz = car.position.z;
    this.fwd.set(0, 0, 1).applyQuaternion(car.quaternion);
    const fx = this.fwd.x, fz = this.fwd.z;
    const n = Math.min(wheels.length, drawn.length, 8);
    for (let k = 0; k < n; k++) {
      const w = wheels[k] as GroundWheel, d = drawn[k] as THREE.Object3D;
      const onDirt = w.surface === DIRT || w.surface === GRASS;
      if (!w.grounded || (!w.water && !onDirt)) { this.acc[k] = 0; continue; }
      const x = d.position.x, z = d.position.z, y = w.contact.y;
      // out from under the car: the cushion blows every way from its middle
      let ox = x - cx, oz = z - cz;
      const ol = Math.hypot(ox, oz) || 1;
      ox /= ol; oz /= ol;
      if (w.water) {
        const rate = Math.min(K.sprayMax, K.sprayRest + K.sprayPerSpeed * speed);
        const strength = 0.45 + 0.55 * Math.min(1, speed / 12);
        this.acc[k] = (this.acc[k] as number) + rate * dt;
        while ((this.acc[k] as number) >= 1) {
          this.acc[k] = (this.acc[k] as number) - 1;
          const out = 1 + this.rnd() * 1.5 + speed * 0.08;
          smoke.kick('spray', x + ox * 0.5, y + 0.05, z + oz * 0.5, vel.x * 0.3 + ox * out, 1.4 + this.rnd() * 1.8 + speed * 0.06, vel.z * 0.3 + oz * out, strength, DUST.spray);
        }
        continue;
      }
      const moving = Math.max(0, Math.min(1, (speed - K.minSpeed) / (K.fullSpeed - K.minSpeed)));
      const slip = hover ? 0 : Math.max(0, Math.min(1, (Math.max(Math.abs(w.slipRatio), w.slipAngle) - K.slipFrom) / K.slipSpan));
      const grass = w.surface === GRASS;
      const rate = (K.rate * moving * (hover ? 1.5 : 1) + K.slipRate * slip) * (grass ? K.grass : 1);
      if (rate <= 0) { this.acc[k] = 0; continue; }
      this.acc[k] = (this.acc[k] as number) + rate * dt;
      while ((this.acc[k] as number) >= 1) {
        this.acc[k] = (this.acc[k] as number) - 1;
        // thrown back off the tread (a spinning wheel throws it harder), a cushion's out from its skirt
        const back = 0.5 + slip * 3, side = (this.rnd() - 0.5) * 1.6;
        const vx = vel.x * 0.3 - fx * back + (hover ? ox * 1.5 : fz * side);
        const vz = vel.z * 0.3 - fz * back + (hover ? oz * 1.5 : -fx * side);
        smoke.kick('dust', x - fx * 0.25, y + 0.05, z - fz * 0.25, vx, 0.4 + this.rnd() * 0.8, vz, (grass ? 0.7 : 1) * (0.55 + 0.45 * Math.max(moving, slip)), grass ? DUST.grass : DUST.dirt);
      }
    }
    this.land(wheels, tm, hover, drawn, car, vel, smoke, sparks);
  }

  /** A touchdown: a ring of dust off every wheel down by its speed into the surface; sparks off the floor when it bottoms out. */
  private land(wheels: readonly GroundWheel[], tm: Pick<VehicleTelemetry, 'airborne'>, hover: boolean, drawn: readonly THREE.Object3D[], car: THREE.Object3D, vel: THREE.Vector3, smoke: Smoke, sparks: Sparks): void {
    const K = KICKUP;
    if (tm.airborne) {
      this.flying = true;
      this.airVel.copy(vel);
      this.airPos.copy(car.position);
      return;
    }
    if (!this.flying) return;
    this.flying = false;
    // a respawn or a teleport out of the air is no landing
    if (this.airPos.distanceToSquared(car.position) > 30 * 30) return;
    const n = Math.min(wheels.length, drawn.length, 8);
    let first = -1;
    for (let k = 0; k < n && first < 0; k++) if ((wheels[k] as GroundWheel).grounded) first = k;
    if (first < 0) return;
    // the speed into the surface, not the fall: onto a landing slope's pitch it is small
    const nrm = (wheels[first] as GroundWheel).normal;
    const into = -(this.airVel.x * nrm.x + this.airVel.y * nrm.y + this.airVel.z * nrm.z);
    if (into < K.landMin) return;
    const s = Math.min(1, (into - K.landMin) / (K.landFull - K.landMin));
    const cx = car.position.x, cz = car.position.z;
    let floorY = 0, down = 0, sea = false;
    for (let k = 0; k < n; k++) {
      const w = wheels[k] as GroundWheel, d = drawn[k] as THREE.Object3D;
      if (!w.grounded) continue;
      down++;
      floorY += w.contact.y;
      sea ||= w.water;
      const x = d.position.x, z = d.position.z, y = w.contact.y;
      const base = Math.atan2(z - cz, x - cx);
      const count = (w.water ? 4 : 2) + Math.round((w.water ? 8 : 5) * s);
      for (let j = 0; j < count; j++) {
        const a = base + (this.rnd() - 0.5) * 2.2, out = 1.5 + 3 * s + this.rnd();
        const vx = vel.x * 0.4 + Math.cos(a) * out, vz = vel.z * 0.4 + Math.sin(a) * out;
        if (w.water) smoke.kick('spray', x, y + 0.05, z, vx, 2 + this.rnd() * 2 + 3 * s, vz, 1, DUST.spray);
        else smoke.kick('dust', x, y + 0.05, z, vx, 0.3 + this.rnd() * (0.6 + s), vz, 0.7 + 0.3 * s, w.surface === DIRT ? DUST.dirt : w.surface === GRASS ? DUST.grass : DUST.road);
      }
    }
    // the floor meets the road: a landing past the suspension's travel scrapes the chassis
    if (!hover && !sea && into >= K.landSparks && down > 0) sparks.burst(cx, floorY / down + 0.15, cz, Math.round(10 + 20 * s));
  }
}
