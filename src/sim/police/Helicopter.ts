/**
 * The police helicopter (M5.5 slice 9; docs/M4_PLAN.md §5 C, DESIGN.md §5):
 * from heat level 4, while there is a pursuit, one air unit flies in from the
 * island's edge and holds its spotlight on the player. The light is its sight:
 * the player is seen when the lit spot is on the car and nothing solid stands
 * between the aircraft and it, so a covered street's roof or an overpass's
 * deck hides the car and nothing else does (outrunning it takes longer than a
 * car has road). Lost, it circles the last fix sweeping the light; the
 * pursuit's cooldown only runs while it does. It counts in the unit budget.
 * Kinematic, above everything; the world is only read (one ray a step).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { EventLog } from '../events';
import type { PlayerProbe } from '../traffic/Traffic';
import { CITY_HALF } from '../city/roads';
import { POLICE, type PoliceTuning } from './tuning';

/** The radio's line when it arrives (the `dispatch` event's value, next to Pursuit's DISPATCH). */
export const DISPATCH_AIR = 4;

export class Helicopter {
  /** On duty: flying in, tracking or searching. */
  active = false;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  yaw = 0;
  /** Where the spotlight falls, and whether the player is in it and in its line of sight this step. */
  lightX = 0;
  lightZ = 0;
  sees = false;
  /** Arrivals, for the pins and the radio. */
  arrivals = 0;
  /** Seconds it has not seen the player (0 while it does). */
  lostFor = 0;
  private sweep = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(private readonly world: RAPIER.World, private readonly events: EventLog, private readonly tuning: PoliceTuning = POLICE) {}

  /**
   * One step. `chasing`: a pursuit is on (detected, active or lost); `known`: somebody saw the player last
   * step (a unit or the light itself), so the radio has the position; `lastX/Z` the last fix. Returns whether
   * the air unit sees the player this step.
   */
  step(dt: number, level: number, chasing: boolean, known: boolean, player: PlayerProbe, lastX: number, lastZ: number): boolean {
    const h = this.tuning.heli;
    this.sees = false;
    if (level < h.fromLevel || !chasing) {
      this.active = false;
      return false;
    }
    if (!this.active) this.arrive(player);
    // where the light should be: on the car while the radio has it, else a spiral round the last fix (out to
    // the circle and back through the middle)
    let lx = player.x, lz = player.z;
    const far = Math.hypot(lastX - this.x, lastZ - this.z) > h.circle * 2;
    if (!known) {
      // the spiral starts from the fix itself once the aircraft is there
      if (!far) this.sweep += h.sweepRate * dt;
      const r = h.circle * Math.abs(Math.sin(this.sweep * 1.5));
      lx = lastX + Math.cos(this.sweep * 1.7) * r;
      lz = lastZ + Math.sin(this.sweep * 1.7) * r;
    }
    // fly over the light's target (a little ahead of a moving car), so the beam falls almost straight down and
    // only a roof or a deck hides the car, not the street's walls; flat out to it, slower while it searches
    const tx = known ? lx + player.vx * h.lead : lx, tz = known ? lz + player.vz * h.lead : lz;
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.min(known || far ? h.speed : h.searchSpeed, d * 1.5);
    const ax = dx / d * want - this.vx, az = dz / d * want - this.vz;
    const a = Math.hypot(ax, az), cap = h.accel * dt;
    const k = a > cap ? cap / a : 1;
    this.vx += ax * k;
    this.vz += az * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = h.altitude;
    if (Math.hypot(this.vx, this.vz) > 1) this.yaw = Math.atan2(this.vx, this.vz);
    // the beam turns to its target at its rate, never beyond its reach from under the aircraft
    const rx = lx - this.x, rz = lz - this.z, reach = Math.hypot(rx, rz);
    if (reach > h.reach) { lx = this.x + rx / reach * h.reach; lz = this.z + rz / reach * h.reach; }
    const turn = Math.min(1, h.lightRate * dt);
    this.lightX += (lx - this.lightX) * turn;
    this.lightZ += (lz - this.lightZ) * turn;
    // seen: the spot on the car and nothing solid between the aircraft and it
    if (Math.hypot(player.x - this.lightX, player.z - this.lightZ) <= h.spot && this.clear(player)) this.sees = true;
    this.lostFor = this.sees ? 0 : this.lostFor + dt;
    return this.sees;
  }

  /** Over the player at once, the light on them (M6 slice 3: Professor Pip's race). The level and the chase keep it. */
  overhead(player: PlayerProbe): void {
    this.arrive(player);
    this.x = player.x;
    this.z = player.z;
    this.lightX = player.x;
    this.lightZ = player.z;
  }

  /** In from the island's edge on the far side of the player from the centre, at its height, the light on the player. */
  private arrive(player: PlayerProbe): void {
    const h = this.tuning.heli;
    const r = Math.hypot(player.x, player.z) || 1;
    const out = Math.min(CITY_HALF, r + h.arriveFrom) / r;
    this.x = player.x * out;
    this.z = player.z * out;
    if (r < 1) { this.x = h.arriveFrom; this.z = 0; }
    this.y = h.altitude;
    this.vx = 0;
    this.vz = 0;
    // the light starts under the aircraft and swings onto the car as it closes
    this.lightX = this.x;
    this.lightZ = this.z;
    this.lostFor = 0;
    this.sweep = 0;
    this.active = true;
    this.arrivals++;
    this.events.push('dispatch', DISPATCH_AIR, this.x, this.y, this.z, -1);
  }

  /** Nothing solid (a roof, a deck, a building) between the aircraft and the car. */
  private clear(player: PlayerProbe): boolean {
    const ray = this.ray;
    ray.origin.x = this.x; ray.origin.y = this.y; ray.origin.z = this.z;
    const dx = player.x - this.x, dy = player.y + 0.6 - this.y, dz = player.z - this.z;
    const len = Math.hypot(dx, dy, dz);
    ray.dir.x = dx / len; ray.dir.y = dy / len; ray.dir.z = dz / len;
    return this.world.castRay(ray, len, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) === null;
  }
}
