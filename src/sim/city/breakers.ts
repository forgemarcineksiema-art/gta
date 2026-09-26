/**
 * Pursuit breakers (M5.5 slice 18; DESIGN.md §8, NFS Most Wanted's): eight
 * scaffold towers on the pavements, two a district, mid-block where nothing
 * taller than a kerb stands within a metre and a half and no billboard within
 * 30 m (the pin checks both). Driven through at speed, one topples across its
 * side of the street behind the car: once the car is clear of where it lands,
 * a fixed barrier the height of a car stands there for `seconds` s. The chasing
 * units crash into it, and each police car written off on it is the player's
 * takedown. The next run puts them back up. No allocation per step.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_SOLID } from '../collision';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';

/** What comes down (M8.10 slice 15): the grid's are scaffold towers; the island's what each place has to hand. */
export type BreakerKind = 'scaffold' | 'containers' | 'rocks' | 'flatcar' | 'pallets' | 'huts';

export interface BreakerDesc {
  id: number;
  /** The tower's foot on the pavement. */
  x: number;
  z: number;
  /** Unit vector toward the street's centre: the way it falls. */
  nx: number;
  nz: number;
  /** The island's (M8.10 slice 15): the height its foot stands at, and what it is; the grid's are scaffolds at 0. */
  y?: number;
  kind?: BreakerKind;
}

/** Street spots (x or z street, the pavement point, the side's normal toward the carriageway). */
export const BREAKERS: readonly BreakerDesc[] = [
  { id: 0, x: -112.5, z: -239.2, nx: 0, nz: 1 },
  { id: 1, x: -239.2, z: -112.5, nx: 1, nz: 0 },
  { id: 2, x: 112.5, z: -435.8, nx: 0, nz: -1 },
  { id: 3, x: 435.8, z: -112.5, nx: 1, nz: 0 },
  { id: 4, x: -337.5, z: 239.2, nx: 0, nz: -1 },
  { id: 5, x: -14.2, z: 337.5, nx: 1, nz: 0 },
  { id: 6, x: 112.5, z: 464.2, nx: 0, nz: -1 },
  { id: 7, x: 337.5, z: 210.8, nx: 0, nz: 1 },
];

/**
 * The tower: half its width along the street and half its depth, its height; the speed that brings it down
 * (m/s); what it leaves across the lane (lying, its height long); how clear of it the car must be before it
 * lands (m); how long it lies there (s); how near a written-off police car must be to count (m).
 */
export const BREAKER = {
  halfWidth: 1.2, halfDepth: 0.6, height: 11, minSpeed: 8,
  fallen: { halfWidth: 1.4, height: 1.3 },
  clear: 1.5, seconds: 25, credit: 14, fallSeconds: 0.7,
} as const;

export enum BreakerState { Standing = 0, Falling = 1, Down = 2, Cleared = 3 }

/** A car's middle meets an island's breaker between this far under its foot and this far over its top (m). */
const BREAKER_BELOW = 2;
/** An island's barrier lies from its foot's height (a kerb's top) this far down into the road beside it (m). */
const BARRIER_SINK = 0.3;

export class Breakers {
  readonly state: Uint8Array;
  /** Sim time the fall started (the view topples it over `fallSeconds`). */
  readonly fellAt: Float32Array;
  private readonly left: Float32Array;
  private readonly colliders: Array<RAPIER.Collider | null>;
  /** Police records already credited to a barrier. */
  private readonly credited: Uint8Array;
  private runs = -1;

  /** The grid's eight towers, or the island's eight (M8.10 slice 15) at their heights. */
  constructor(private readonly sim: SimWorld, readonly descs: readonly BreakerDesc[] = BREAKERS) {
    this.state = new Uint8Array(descs.length);
    this.fellAt = new Float32Array(descs.length);
    this.left = new Float32Array(descs.length);
    this.colliders = descs.map(() => null);
    this.credited = new Uint8Array(sim.traffic?.capacity ?? 0);
  }

  /**
   * The barrier's box once down, from the tower's street-side edge its height out: its centre and the half extents of
   * the box that holds it on the world's axes (the grid's streets run on them, so there it is the barrier itself; the
   * island's run any way, and the barrier lies turned with its normal, as the tests below take it).
   */
  static barrier(d: BreakerDesc, out: { x: number; z: number; hx: number; hz: number }): { x: number; z: number; hx: number; hz: number } {
    const half = BREAKER.height / 2, w = BREAKER.fallen.halfWidth, from = BREAKER.halfDepth + half;
    out.x = d.x + d.nx * from;
    out.z = d.z + d.nz * from;
    out.hx = Math.abs(d.nx) * half + Math.abs(d.nz) * w;
    out.hz = Math.abs(d.nz) * half + Math.abs(d.nx) * w;
    return out;
  }

  private readonly box = { x: 0, z: 0, hx: 0, hz: 0 };

  /** A point within `margin` m of breaker `d`'s barrier, the barrier turned with its normal (its height along it). */
  private static onBarrier(d: BreakerDesc, x: number, z: number, margin: number): boolean {
    const from = BREAKER.halfDepth + BREAKER.height / 2, dx = x - d.x - d.nx * from, dz = z - d.z - d.nz * from;
    return Math.abs(dx * d.nx + dz * d.nz) < BREAKER.height / 2 + margin && Math.abs(dz * d.nx - dx * d.nz) < BREAKER.fallen.halfWidth + margin;
  }

  step(probe: PlayerProbe, dt: number): void {
    const sim = this.sim, traffic = sim.traffic;
    // a new run: whatever came down is back up
    if (sim.run.runs !== this.runs) {
      this.runs = sim.run.runs;
      for (let k = 0; k < this.descs.length; k++) if (this.state[k] === BreakerState.Cleared) this.state[k] = BreakerState.Standing;
    }
    for (let k = 0; k < this.descs.length; k++) {
      const d = this.descs[k] as BreakerDesc;
      const st = this.state[k];
      if (st === BreakerState.Standing) {
        if (probe.speed < BREAKER.minSpeed || Math.abs(probe.x - d.x) > 12 || Math.abs(probe.z - d.z) > 12) continue;
        if (d.y !== undefined && (probe.y < d.y - BREAKER_BELOW || probe.y > d.y + BREAKER.height)) continue;
        if (!this.touches(probe, d)) continue;
        this.state[k] = BreakerState.Falling;
        this.fellAt[k] = sim.time;
        sim.events.push('breaker', k, d.x, (d.y ?? 0) + BREAKER.height / 2, d.z, k);
      } else if (st === BreakerState.Falling) {
        // it lands once the car is clear of where it lands (and the fall has had its time)
        if (sim.time - (this.fellAt[k] as number) < BREAKER.fallSeconds || this.near(probe, d, BREAKER.clear)) continue;
        this.land(k);
      } else if (st === BreakerState.Down) {
        this.left[k] = (this.left[k] as number) - dt;
        if (traffic) this.credit(k);
        if ((this.left[k] as number) <= 0) {
          const c = this.colliders[k];
          if (c) sim.world.removeCollider(c, false);
          this.colliders[k] = null;
          this.state[k] = BreakerState.Cleared;
        }
      }
    }
  }

  /**
   * A standing tower within `reach` m of a point falls (M6 slice 3: Neon Niko pulls them down behind him); it lands
   * across its lane as when the player drives through one. Returns whether one fell.
   */
  pullAt(x: number, z: number, reach: number): boolean {
    const sim = this.sim;
    for (let k = 0; k < this.descs.length; k++) {
      const d = this.descs[k] as BreakerDesc;
      if (this.state[k] !== BreakerState.Standing || Math.hypot(d.x - x, d.z - z) > reach) continue;
      this.state[k] = BreakerState.Falling;
      this.fellAt[k] = sim.time;
      sim.events.push('breaker', k, d.x, (d.y ?? 0) + BREAKER.height / 2, d.z, k);
      return true;
    }
    return false;
  }

  /** The car's footprint over the tower's. */
  private touches(probe: PlayerProbe, d: BreakerDesc): boolean {
    const fx = Math.sin(probe.yaw), fz = Math.cos(probe.yaw);
    // the tower as a box (its depth along the normal, its width along the street), tested at its corners and centre
    // against the car; the street's way is the normal turned a quarter
    const dn = BREAKER.halfDepth, ds = BREAKER.halfWidth, sx = -d.nz, sz = d.nx;
    for (const [a, b] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const px = d.x + d.nx * dn * a + sx * ds * b - probe.x, pz = d.z + d.nz * dn * a + sz * ds * b - probe.z;
      const along = px * fx + pz * fz, side = px * -fz + pz * fx;
      if (Math.abs(along) <= probe.halfLength + 0.2 && Math.abs(side) <= probe.halfWidth + 0.2) return true;
    }
    return false;
  }

  /** The car within `margin` m of breaker `d`'s barrier. */
  private near(probe: PlayerProbe, d: BreakerDesc, margin: number): boolean {
    return Breakers.onBarrier(d, probe.x, probe.z, Math.hypot(probe.halfWidth, probe.halfLength) + margin);
  }

  /** Down across the lane: the barrier's collider, and anything standing where it lands is crushed. */
  private land(k: number): void {
    const sim = this.sim, traffic = sim.traffic, d = this.descs[k] as BreakerDesc;
    const b = Breakers.barrier(d, this.box), h = BREAKER.fallen.height / 2, yaw = Math.atan2(d.nx, d.nz);
    // lying along its normal (the grid's on the axes); on the island from its foot's height (a kerb's top) down a hand
    // into the road beside it
    const sink = d.y === undefined ? 0 : BARRIER_SINK;
    this.colliders[k] = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(BREAKER.fallen.halfWidth, h + sink / 2, BREAKER.height / 2)
      .setTranslation(b.x, (d.y ?? 0) + h - sink / 2, b.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setFriction(1)
      .setRestitution(1)
      .setCollisionGroups(GROUPS_SOLID));
    this.state[k] = BreakerState.Down;
    this.left[k] = BREAKER.seconds;
    if (!traffic) return;
    for (let i = 0; i < traffic.capacity; i++) {
      const st = traffic.state[i];
      if (st === AgentState.Free || st === AgentState.Wrecked) continue;
      if (!Breakers.onBarrier(d, traffic.x[i] as number, traffic.z[i] as number, 0.5)) continue;
      traffic.wreck(i);
      traffic.justWrecked[i] = 1;
    }
    this.credit(k);
  }

  /** Each police car written off at the barrier while it stands: the player's takedown, once. */
  private credit(k: number): void {
    const sim = this.sim, traffic = sim.traffic;
    if (!traffic) return;
    const d = this.descs[k] as BreakerDesc, r = BREAKER.credit;
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] === AgentState.Free) { this.credited[i] = 0; continue; }
      if (traffic.police[i] !== 1 || traffic.justWrecked[i] !== 1 || this.credited[i] === 1) continue;
      if (!Breakers.onBarrier(d, traffic.x[i] as number, traffic.z[i] as number, r)) continue;
      this.credited[i] = 1;
      sim.events.push('takedown', 0, traffic.x[i] as number, (d.y ?? 0) + 0.5, traffic.z[i] as number, i);
    }
  }
}
