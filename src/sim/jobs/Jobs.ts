/**
 * Jobs: the M4 skeleton of docs/M5_PLAN.md §3.3 (one `delivery` kind). A
 * marker is a ring on the ground; driving into it starts the job, adds its
 * heat once and starts the clock; arriving within the ring radius of the
 * target pays `payout × (1 + timeBonus × remaining / limit)` (the bag takes
 * it from the `jobDone` event in `Run`); the clock running out fails it.
 * One job at a time: markers do nothing while one runs. The door and busted
 * abandon it silently. M5 adds placement, the order and escape kinds and the
 * arrow on the same class.
 *
 * No allocation per step.
 */
import { BALANCE } from '../balance';
import type { SimWorld } from '../SimWorld';
import type { PlayerProbe } from '../traffic/Traffic';

export type JobKind = 'delivery';

export interface JobDef {
  id: number;
  kind: JobKind;
  /** The marker ring's centre and facing. */
  x: number;
  z: number;
  yaw: number;
  targetX: number;
  targetZ: number;
  payout: number;
  limitSeconds: number;
  /** Heat added once when the job starts. */
  heat: number;
}

export type JobState = 'idle' | 'active' | 'done' | 'failed';

export class Jobs {
  readonly defs: JobDef[];
  state: JobState = 'idle';
  /** The running (or just finished) def's id, or -1. */
  active = -1;
  /** Seconds left on the clock while active. */
  remaining = 0;
  /** Bumps whenever the defs or the state change, so the views can rebuild. */
  serial = 0;
  private hold = 0;
  private nextId = 0;

  constructor(private readonly sim: SimWorld, defs: JobDef[]) {
    this.defs = defs;
    for (const d of defs) this.nextId = Math.max(this.nextId, d.id + 1);
  }

  /** A def added at run time (the cold open's); returns its id. */
  add(def: Omit<JobDef, 'id'>): number {
    const id = this.nextId++;
    this.defs.push({ ...def, id });
    this.serial++;
    return id;
  }

  /** Removes a def; abandons it first when it is the running one. */
  remove(id: number): void {
    if (this.active === id) this.abandon();
    const i = this.defs.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.defs.splice(i, 1);
    this.serial++;
  }

  defOf(id: number): JobDef | null {
    for (let i = 0; i < this.defs.length; i++) if ((this.defs[i] as JobDef).id === id) return this.defs[i] as JobDef;
    return null;
  }

  step(probe: PlayerProbe, dt: number): void {
    const r = BALANCE.jobs.markerRadius;
    if (this.state === 'done' || this.state === 'failed') {
      this.hold -= dt;
      if (this.hold > 0) return;
      this.state = 'idle';
      this.active = -1;
      this.serial++;
    }
    if (this.state === 'idle') {
      for (let i = 0; i < this.defs.length; i++) {
        const d = this.defs[i] as JobDef;
        if ((d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 > r * r) continue;
        this.state = 'active';
        this.active = d.id;
        this.remaining = d.limitSeconds;
        this.serial++;
        this.sim.heat.add(d.heat);
        this.sim.events.push('jobStart', d.payout, d.x, 0, d.z, d.id);
        return;
      }
      return;
    }
    const d = this.defOf(this.active);
    if (!d) {
      this.abandon();
      return;
    }
    if ((d.targetX - probe.x) ** 2 + (d.targetZ - probe.z) ** 2 <= r * r) {
      const paid = Math.round(d.payout * (1 + BALANCE.jobs.timeBonus * Math.max(0, this.remaining) / d.limitSeconds));
      this.finish('done');
      this.sim.events.push('jobDone', paid, d.targetX, 0, d.targetZ, d.id);
      return;
    }
    this.remaining -= dt;
    // Fixed 60 Hz subtraction must finish on the limit's last step, not one after from rounding.
    if (this.remaining > 1e-9) return;
    this.remaining = 0;
    this.finish('failed');
    this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
  }

  /** The running job's target; false when none runs. */
  target(out: { x: number; z: number }): boolean {
    if (this.state !== 'active') return false;
    const d = this.defOf(this.active);
    if (!d) return false;
    out.x = d.targetX;
    out.z = d.targetZ;
    return true;
  }

  /** The door and busted: back to idle with no event. */
  abandon(): void {
    if (this.state === 'idle') return;
    this.state = 'idle';
    this.active = -1;
    this.remaining = 0;
    this.hold = 0;
    this.serial++;
  }

  private finish(state: 'done' | 'failed'): void {
    this.state = state;
    this.hold = BALANCE.jobs.holdSeconds;
    this.serial++;
  }
}
