/**
 * Jobs (docs/M5_PLAN.md §3.3, slices 1–3; the M4 skeleton extended, nothing
 * renamed). A marker is a ring on the ground; driving into it starts its job.
 * One job at a time: markers do nothing while one runs (D6), and the door and
 * busted abandon it silently.
 *
 * - delivery: the clock starts at once, the job's heat is added once;
 *   arriving within the ring radius of the drop-off pays
 *   `payout × (1 + timeBonus × remaining / limit)`; the clock running out
 *   fails it.
 * - order (steal-to-order): hunting first. The traffic guarantees a car of
 *   the wanted class and paint 300–600 m away (`Traffic.ensure`), re-checked
 *   every `ensureSeconds` while there is none or it was wrecked or taken; the
 *   swap into it (`onSwap`) starts the clock and adds the heat; arriving at
 *   the fence in that class pays the class's payout less 10 % per damage
 *   stage. A wreck (stage 4) cannot arrive; the clock fails it.
 * - escape: the heat rises to the level's threshold and the police have the
 *   player at once; the `escape` event pays `bounty × level`. No clock.
 *
 * Money goes into the bag through the `jobDone` event (`Run` reads it). While
 * the cold open runs only its own marker is live. No allocation per step.
 */
import { BALANCE } from '../balance';
import type { SimEvent } from '../events';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';
import { CAR_IDS } from '../vehicle/presets';
import type { JobDef } from './catalog';
import { markerRingCoins } from './place';

export type { JobDef, JobKind } from './catalog';

export type JobState = 'idle' | 'hunting' | 'active' | 'done' | 'failed';

export class Jobs {
  readonly defs: JobDef[];
  state: JobState = 'idle';
  /** The running (or just finished) def's id, or -1. */
  active = -1;
  /** Seconds left on the clock; NaN while hunting and for an escape (no clock). */
  remaining = 0;
  /** An order's car to take while hunting; -1 otherwise. */
  wantedAgent = -1;
  /** Bumps whenever the defs or the state change, so the views can rebuild. */
  serial = 0;
  /** Seconds since the running job started (the card shows for the first `cardSeconds`). */
  elapsed = 0;
  /** The last job's pay into the bag (the HUD's result line). */
  lastPaid = 0;
  /** Ensures run so far for this hunt that repainted a car, and that spawned one (the slice-2 measurement). */
  repaints = 0;
  spawns = 0;
  private hold = 0;
  private nextId = 0;
  private ensureLeft = 0;
  private found = false;
  /** A marker the car was inside when its job ended: it re-arms once the car has left its ring. */
  private rearm = -1;
  private cursor: number;
  /** An `escape` event was read this step. */
  private escaped = false;
  /** The markers' coin rings are laid on the first step (once; the world's constructor leaves the extra coins to its callers). */
  private ringsLaid = false;

  constructor(private readonly sim: SimWorld, defs: JobDef[]) {
    this.defs = defs;
    for (const d of defs) this.nextId = Math.max(this.nextId, d.id + 1);
    this.cursor = sim.events.sequence;
  }

  /** A def added at run time (the cold open's takes id 0 when it is free); returns its id. */
  add(def: Omit<JobDef, 'id' | 'level' | 'descriptor'> & Partial<Pick<JobDef, 'level' | 'descriptor'>>, id = -1): number {
    const use = id >= 0 && !this.defOf(id) ? id : this.nextId++;
    this.defs.push({ level: 0, descriptor: -1, ...def, id: use });
    this.serial++;
    return use;
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

  /** The running def (hunting or active), or null. */
  get running(): JobDef | null {
    return this.state === 'hunting' || this.state === 'active' ? this.defOf(this.active) : null;
  }

  /** A marker the player can start now: idle, and during the cold open only its own. */
  live(d: JobDef): boolean {
    const co = this.sim.coldOpen;
    return co.active ? d.id === co.job : d.id !== co.job;
  }

  step(probe: PlayerProbe, dt: number): void {
    if (!this.ringsLaid) {
      this.ringsLaid = true;
      // a ring of coins round every placed marker (DESIGN.md §3.2); not the cold open's, whose line leads there
      this.sim.coins?.addExtra(markerRingCoins(this.defs.filter((d) => d.id !== 0)));
    }
    this.escaped = false;
    this.cursor = this.sim.events.readFrom(this.cursor, this.onEvent);
    const r = BALANCE.jobs.markerRadius;
    if (this.rearm >= 0) {
      const d = this.defOf(this.rearm);
      if (!d || (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 > r * r) this.rearm = -1;
    }
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
        if (d.id === this.rearm || !this.live(d)) continue;
        if ((d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 > r * r) continue;
        this.start(d);
        return;
      }
      return;
    }
    const d = this.defOf(this.active);
    if (!d) {
      this.abandon();
      return;
    }
    this.elapsed += dt;
    if (this.state === 'hunting') {
      this.hunt(d, probe, dt);
      return;
    }
    if (d.kind === 'escape') {
      // the chase was lost (by the cooldown or a swap nobody saw): the bounty
      if (!this.escaped) return;
      this.lastPaid = d.payout;
      this.finish('done', probe);
      this.sim.events.push('jobDone', d.payout, probe.x, 0, probe.z, d.id);
      return;
    }
    if ((d.targetX - probe.x) ** 2 + (d.targetZ - probe.z) ** 2 <= r * r && this.canArrive(d)) {
      const paid = d.kind === 'order'
        ? Math.round(d.payout * Math.max(0, 1 - BALANCE.jobs.order.stagePenalty * this.sim.life.state.stage))
        : Math.round(d.payout * (1 + BALANCE.jobs.timeBonus * Math.max(0, this.remaining) / d.limitSeconds));
      this.lastPaid = paid;
      this.finish('done', probe);
      this.sim.events.push('jobDone', paid, d.targetX, 0, d.targetZ, d.id);
      return;
    }
    this.remaining -= dt;
    // Fixed 60 Hz subtraction must finish on the limit's last step, not one after from rounding.
    if (this.remaining > 1e-9) return;
    this.remaining = 0;
    this.finish('failed', probe);
    this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
  }

  /** The running job's target: the drop-off or fence, the wanted car while it exists; false for none (idle, an escape). */
  target(out: { x: number; z: number }): boolean {
    const d = this.running;
    if (!d) return false;
    if (this.state === 'hunting') {
      const traffic = this.sim.traffic;
      if (!traffic || this.wantedAgent < 0) return false;
      out.x = traffic.x[this.wantedAgent] as number;
      out.z = traffic.z[this.wantedAgent] as number;
      return true;
    }
    if (d.kind === 'escape') return false;
    out.x = d.targetX;
    out.z = d.targetZ;
    return true;
  }

  /**
   * Between jobs (DESIGN.md §4): the nearest live marker by straight line, or
   * the nearest drop-off's door once the bag is above the door offer's
   * threshold. False while a job runs or there is nothing to point at.
   */
  idleTarget(out: { x: number; z: number }): boolean {
    if (this.state === 'hunting' || this.state === 'active') return false;
    const p = this.sim.probe;
    const run = this.sim.run;
    if (run.bag > BALANCE.offer.doorThreshold && run.dropOffs.length > 0) {
      let best = Infinity;
      for (let i = 0; i < run.dropOffs.length; i++) {
        const door = (run.dropOffs[i] as (typeof run.dropOffs)[number]).door;
        const d = (door.x - p.x) ** 2 + (door.z - p.z) ** 2;
        if (d < best) { best = d; out.x = door.x; out.z = door.z; }
      }
      return true;
    }
    let best = Infinity;
    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i] as JobDef;
      if (!this.live(d)) continue;
      const dist = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
      if (dist < best) { best = dist; out.x = d.x; out.z = d.z; }
    }
    return best < Infinity;
  }

  /** What the arrow points at: the running job's target, else the idle target. `idle` reports which. */
  arrowTarget(out: { x: number; z: number; idle: boolean }): boolean {
    if (this.target(out)) {
      out.idle = false;
      return true;
    }
    out.idle = true;
    return this.idleTarget(out);
  }

  /** The door and busted: back to idle with no event. */
  abandon(): void {
    if (this.state === 'idle') return;
    this.release();
    this.state = 'idle';
    this.active = -1;
    this.remaining = 0;
    this.hold = 0;
    this.wantedAgent = -1;
    this.serial++;
  }

  /** Life's swap, before the record changes hands: taking the wanted car starts the order's clock. */
  onSwap(agent: number): void {
    if (this.state !== 'hunting' || agent !== this.wantedAgent || agent < 0) return;
    const d = this.defOf(this.active);
    if (!d) return;
    this.state = 'active';
    this.remaining = d.limitSeconds;
    this.wantedAgent = -1;
    if (this.sim.traffic) this.sim.traffic.wanted = -1;
    this.sim.heat.add(d.heat);
    this.serial++;
  }

  private start(d: JobDef): void {
    this.active = d.id;
    this.elapsed = 0;
    this.serial++;
    this.sim.events.push('jobStart', d.payout, d.x, 0, d.z, d.id);
    if (d.kind === 'order') {
      this.state = 'hunting';
      this.remaining = NaN;
      this.wantedAgent = -1;
      this.ensureLeft = 0;
      this.found = false;
      this.repaints = 0;
      this.spawns = 0;
      return;
    }
    this.state = 'active';
    if (d.kind === 'escape') {
      // straight into a chase at the level: the heat to its threshold (the ratchet never lowers), the police on the player now
      this.remaining = NaN;
      const threshold = BALANCE.heatThresholds[d.level - 1] ?? 0;
      this.sim.heat.add(Math.max(0, threshold - this.sim.heat.points));
      this.sim.pursuit.force(BALANCE.jobs.escape.radioSeconds);
      return;
    }
    this.remaining = d.limitSeconds;
    this.sim.heat.add(d.heat);
  }

  /** The wanted car: kept while it is the class and paint and still a driving civilian, else found again. */
  private hunt(d: JobDef, probe: PlayerProbe, dt: number): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const kind = CAR_IDS[(d.descriptor >>> 24) & 0xff] ?? 'compact';
    const paint = d.descriptor & 0xffffff;
    const w = this.wantedAgent;
    if (w >= 0) {
      const st = traffic.state[w];
      const gone = (st !== AgentState.Kinematic && st !== AgentState.Physical && st !== AgentState.Disturbed)
        || traffic.police[w] === 1 || traffic.kindOf(w) !== kind || traffic.paintOf(w) !== paint;
      if (gone) {
        this.wantedAgent = -1;
        traffic.wanted = -1;
        this.ensureLeft = 0;
      }
    }
    if (this.wantedAgent >= 0) {
      // it cruises, so a hunter can close on it; the guide holds per lane and is renewed every step
      const lane = traffic.lane[this.wantedAgent] as number;
      if (lane >= 0) traffic.setGuidePlan(this.wantedAgent, (traffic.lanes.limit[lane] as number) * BALANCE.jobs.order.cruise);
      return;
    }
    this.ensureLeft -= dt;
    if (this.ensureLeft > 0) return;
    this.ensureLeft = BALANCE.jobs.order.ensureSeconds;
    const police = this.sim.police;
    const cosHalf = Math.cos((police?.tuning.viewHalfAngleDeg ?? 60) * Math.PI / 180);
    const before = traffic.aliveCount;
    const agent = traffic.ensure(kind, paint, probe, police?.tuning.viewNear ?? 60, cosHalf);
    if (agent < 0) return;
    if (traffic.aliveCount > before) this.spawns++;
    else this.repaints++;
    this.wantedAgent = agent;
    traffic.wanted = agent;
    if (!this.found) {
      this.found = true;
      this.sim.events.push('orderFound', 0, traffic.x[agent] as number, 0, traffic.z[agent] as number, agent);
    }
  }

  /** An order arrives in its own class and not as a wreck; a delivery always. */
  private canArrive(d: JobDef): boolean {
    if (d.kind !== 'order') return true;
    const kind = CAR_IDS[(d.descriptor >>> 24) & 0xff];
    return this.sim.carId === kind && this.sim.life.state.stage < 4 && !this.sim.life.state.wrecked;
  }

  /** The wanted car goes back to being traffic. */
  private release(): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    if (this.wantedAgent >= 0 && traffic.police[this.wantedAgent] !== 1) traffic.clearPolicePlan(this.wantedAgent);
    traffic.wanted = -1;
  }

  private finish(state: 'done' | 'failed', probe: PlayerProbe): void {
    this.release();
    const d = this.defOf(this.active);
    if (d && (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 <= BALANCE.jobs.markerRadius ** 2) this.rearm = d.id;
    this.state = state;
    this.hold = BALANCE.jobs.holdSeconds;
    this.wantedAgent = -1;
    this.serial++;
  }

  private readonly onEvent = (e: SimEvent): void => {
    if (e.kind === 'escape') this.escaped = true;
  };
}
