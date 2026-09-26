/**
 * Stunt jumps (docs/M4_PLAN.md slice 6, DESIGN.md §4 and §7): twenty `ramp`
 * red kickers on the park strip outside the highway ring, where the edge parks
 * leave a clear lane between their two rows of lots (trees and benches stand
 * 13 m or more off it) and nothing but grass lies for a kilometre: eight on
 * the west side, eight on the north, four on the east short of the Coral Quay
 * promenade, 170 m apart, each facing along its side, the seed shifting them a
 * few metres. The surface is `rampProfile`: collision-only slabs follow it
 * (terrain, so the wheels ride them) and the view draws it.
 *
 * `Jumps.step`: a car that leaves the ground within a moment of being on a
 * ramp is flying from it; the M3 slow motion runs through the flight, and a
 * landing after `jumps.minAirSeconds` pushes `jump` with the airtime (the bag
 * pays from the ring). A hop off a kerb pays nothing. The first paid jump off
 * each ramp counts for the hunt (`found`, M5.5 slice 14): a `hunt` event, and
 * the last of the twenty pays the set's reward. No allocation per step.
 */
import { BALANCE } from '../balance';
import { ECONOMY } from '../economy';
import type { EventLog } from '../events';
import { PALETTE } from '../palette';
import { mulberry32 } from '../random';
import { quatFromAxisAngle, quatFromYaw, type StaticDesc } from '../scene';
import type { SimWorld } from '../SimWorld';
import type { PlayerProbe } from '../traffic/Traffic';
import { BLOCK, HIGHWAY_HALF } from './roads';

export interface JumpDesc {
  id: number;
  /** The ridge (the launch point) and the heading a car jumps along. */
  x: number;
  z: number;
  yaw: number;
  /** Up-slope length and ridge height, m. */
  length: number;
  height: number;
  /**
   * The mega-ramp's own surfaces (M8.8 slice 21), (along, height) from the lip: the launch ramp up to it, and the
   * landing slope beyond the street; half its width. A kicker has none.
   */
  profile?: ReadonlyArray<{ along: number; y: number }>;
  landing?: ReadonlyArray<{ along: number; y: number }>;
  halfWidth?: number;
  /** The mega-ramp (M8.8 slice 21): its apex's slow motion alone, its own pay. */
  mega?: boolean;
  /**
   * The island's (M8.10 slice 15): the ground's height at the foot, so a car over or under it (a deck, a street below)
   * is not on it; and how far past the lip its footprint reaches (a hump or a gap taken either way: its whole length).
   * The grid's stand on the flat ground, their footprint ending a metre past the lip.
   */
  y?: number;
  back?: number;
}

/**
 * The mega-ramp (M8.8 slice 21): on Coral Quay's east strip (the Works' strips have a kicker before every crossing
 * street), heading south up a port crane's side to a 12.9 m lip at 22°, over the street at z 225 onto a long landing
 * slope: about 3.5 s in the air at the muscle car's full-boost speed, its apex in `apexSlowMo` s of the takedown's slow
 * motion (control stays); the twenty-first jump, paying `bag.megaJump`.
 */
export const MEGA = { x: 737.5, z: 196, yaw: 0, halfWidth: 4, apexSlowMo: 0.6 } as const;
/** The launch: six 10 m pieces steepening 2° to 22°, then the back face down; and the landing mound past the street. */
const MEGA_LAUNCH = [
  { along: -60, y: 0 }, { along: -50, y: 0.35 }, { along: -40, y: 1.58 }, { along: -30, y: 3.71 }, { along: -20, y: 6.77 },
  { along: -10, y: 10.81 }, { along: 0, y: 15.91 }, { along: 0.6, y: 0 },
] as const;
const MEGA_LANDING = [
  { along: 44, y: 0 }, { along: 54, y: 6 }, { along: 70, y: 8 }, { along: 100, y: 7 }, { along: 130, y: 5.5 },
  { along: 160, y: 3.5 }, { along: 190, y: 1.5 }, { along: 220, y: 0 },
] as const;

/** The mega-ramp's desc, `id` after the kickers'. */
export function megaRamp(id: number): JumpDesc {
  return { id, x: MEGA.x, z: MEGA.z, yaw: MEGA.yaw, length: 60, height: 12.94, profile: MEGA_LAUNCH, landing: MEGA_LANDING, halfWidth: MEGA.halfWidth, mega: true };
}

/** Half the ramp's width (m); the ramps sit in the gap between the edge parks' two rows of lots. */
export const RAMP_HALF_WIDTH = 2.6;
const STRIP = 3 * BLOCK + HIGHWAY_HALF + 43.5;
const PITCH = 170;
/** How far the seed may shift a ramp along its side (m). */
const JITTER = 12;
/** A launch this soon after the wheels were on a ramp counts as a launch from it (s). */
const LAUNCH_GRACE = 0.25;
/** A car's middle is on a ramp of the island's between this far under its foot and this far over its top (m). */
const JUMP_BELOW = 2;
const JUMP_ABOVE = 3;

/** Twenty ramps on the park strip: west (heading +z), north (+x), east (−z) short of the quay. */
export function placeJumps(seed: number, count: number): JumpDesc[] {
  const j = BALANCE.jumps;
  const rnd = mulberry32(seed ^ 0x6a75);
  const out: JumpDesc[] = [];
  const side = (n: number, first: number, place: (along: number) => { x: number; z: number; yaw: number }): void => {
    for (let k = 0; k < n && out.length < count; k++) {
      const p = place(first + k * PITCH + (rnd() * 2 - 1) * JITTER);
      out.push({ id: out.length, x: p.x, z: p.z, yaw: p.yaw, length: j.length, height: j.height });
    }
  };
  side(8, -600, (a) => ({ x: -STRIP, z: a, yaw: 0 }));
  side(8, -600, (a) => ({ x: a, z: -STRIP, yaw: Math.PI / 2 }));
  side(4, 90, (a) => ({ x: STRIP, z: -a, yaw: Math.PI }));
  return out;
}

/**
 * The ramp's surface along its heading, from the foot of the way up to the end of the way down, as
 * (along, height) points with along measured from the ridge: three slabs ease in (a half, the full and
 * one and a half times the mean slope, so the suspension is not hammered at the foot and the springs do
 * not throw the car), then one slab down. The collision slabs and the rendered ramp both follow it.
 */
export function rampProfile(jd: JumpDesc): Array<{ along: number; y: number }> {
  if (jd.profile) return jd.profile.map((p) => ({ along: p.along, y: p.y }));
  const tan = jd.height / jd.length;
  const seg = jd.length / 3;
  const out = [{ along: -jd.length, y: 0 }];
  let y = 0;
  for (let k = 0; k < 3; k++) {
    y += tan * (k + 1) / 2 * seg;
    out.push({ along: -jd.length + seg * (k + 1), y });
  }
  out.push({ along: jd.length, y: 0 });
  return out;
}

/** The collision slabs under the rendered ramp (and a mega-ramp's landing): terrain, so the wheels ride them and the chassis does not. */
export function jumpStatics(jd: JumpDesc): StaticDesc[] {
  const out = slabs(jd, rampProfile(jd));
  if (jd.landing) out.push(...slabs(jd, jd.landing));
  return out;
}

function slabs(jd: JumpDesc, profile: ReadonlyArray<{ along: number; y: number }>): StaticDesc[] {
  const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
  const thick = 0.15, width = jd.halfWidth ?? RAMP_HALF_WIDTH;
  const out: StaticDesc[] = [];
  for (let k = 0; k + 1 < profile.length; k++) {
    const a = profile[k] as { along: number; y: number }, b = profile[k + 1] as { along: number; y: number };
    const angle = Math.atan2(b.y - a.y, b.along - a.along);
    const half = Math.hypot(b.along - a.along, b.y - a.y) / 2;
    const along = (a.along + b.along) / 2, midY = (a.y + b.y) / 2;
    // centred under the surface's midpoint, sunk by its half thickness, pitched nose up by `angle`
    const q = mulQuat(quatFromYaw(jd.yaw), quatFromAxisAngle(1, 0, 0, -angle));
    out.push({
      shape: { kind: 'box', hx: width, hy: thick, hz: half },
      position: { x: jd.x + fx * (along + thick * Math.sin(angle)), y: midY - thick * Math.cos(angle), z: jd.z + fz * (along + thick * Math.sin(angle)) },
      rotation: q, color: PALETTE.ramp, tag: 'kerb', collisionOnly: true,
    });
  }
  return out;
}

function mulQuat(a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number; w: number } {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export class Jumps {
  /** The ramp the car is flying from, -1 on the ground. */
  flying = -1;
  flightTime = 0;
  /** Paid jumps this session. */
  landed = 0;
  /** The hunt (M5.5 slice 14): the ramps a paid jump has been made from, by id; the save carries them. */
  readonly found: Uint8Array;
  foundCount = 0;
  private lastRamp = -1;
  private sinceRamp = Infinity;
  /** A flight's time so far when a wheel grazed the ramp on the way off (M8.10 slice 15), carried on if it flies on. */
  private carried = 0;
  /** The mega-ramp's flight has had its apex (its slow motion). */
  private apexed = false;

  constructor(private readonly sim: SimWorld, readonly descs: readonly JumpDesc[]) {
    this.found = new Uint8Array(descs.length);
  }

  step(probe: PlayerProbe, airborne: boolean, dt: number, events: EventLog): void {
    if (this.flying >= 0) {
      this.flightTime += dt;
      if (this.descs[this.flying]?.mega !== true) {
        // the slow motion rides the whole flight and runs out after the landing
        this.sim.life.state.slowMo = ECONOMY.slowMoSeconds;
        this.sim.life.state.slowMoTarget = -1;
      } else if (!this.apexed && this.sim.vehicle.telemetry.vy <= 0) {
        // the mega-ramp's (M8.8 slice 21): the apex alone, as long as a takedown's
        this.apexed = true;
        this.sim.life.state.slowMo = MEGA.apexSlowMo;
        this.sim.life.state.slowMoTarget = -1;
      }
      if (airborne) return;
      const ramp = this.flying;
      this.flying = -1;
      if (this.flightTime >= BALANCE.jumps.minAirSeconds) {
        this.landed++;
        events.push('jump', this.flightTime, probe.x, 0, probe.z, ramp);
        if (!this.found[ramp]) {
          // a new ramp for the hunt; the last of the set pays its reward into the bank
          this.found[ramp] = 1;
          this.foundCount++;
          events.push('hunt', this.foundCount === this.descs.length ? BALANCE.hunts.jumps : 0, probe.x, 0, probe.z, 0);
        }
      } else {
        // too short for a jump: a wheel grazed the lip (a kicker with no back to roll down, the car pitching off it) on
        // the way off; off the ground again within the grace, it is the same flight from the same ramp
        this.lastRamp = ramp;
        this.sinceRamp = 0;
        this.carried = this.flightTime;
      }
      return;
    }
    if (!airborne) {
      const on = this.rampUnder(probe);
      if (on >= 0) { this.lastRamp = on; this.sinceRamp = 0; this.carried = 0; }
      else this.sinceRamp += dt;
      return;
    }
    this.sinceRamp += dt;
    if (this.lastRamp >= 0 && this.sinceRamp <= LAUNCH_GRACE) {
      this.flying = this.lastRamp;
      this.flightTime = this.carried;
      this.carried = 0;
      this.apexed = false;
      if (this.descs[this.flying]?.mega !== true) {
        this.sim.life.state.slowMo = ECONOMY.slowMoSeconds;
        this.sim.life.state.slowMoTarget = -1;
      }
    }
    this.lastRamp = -1;
  }

  /** The ramp whose footprint holds the car's centre (on the island at its height, not over or under it), -1 for none. */
  private rampUnder(probe: PlayerProbe): number {
    for (let i = 0; i < this.descs.length; i++) {
      const jd = this.descs[i] as JumpDesc;
      const dx = probe.x - jd.x, dz = probe.z - jd.z, reach = jd.length + (jd.back ?? 0) + 21;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      if (jd.y !== undefined && (probe.y < jd.y - JUMP_BELOW || probe.y > jd.y + jd.height + JUMP_ABOVE)) continue;
      const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
      const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
      if (along >= -jd.length && along <= (jd.back ?? 1) && Math.abs(across) <= (jd.halfWidth ?? RAMP_HALF_WIDTH) + 0.5) return jd.id;
    }
    return -1;
  }
}
