/**
 * The ticket book (M5.5 slice 18; BACKLOG Run structure): while the busted
 * bar fills, an officer steps out of the nearest unit and walks to the
 * driver's door, paced to get there as the bar fills, and writes the ticket
 * through the busted card. When the bar drains (or the card is closed) they
 * walk back to where their car stood and are gone. A pedestrian record in the
 * officer's look, moved by this rule; the HUD draws the bar as the ticket
 * book. No allocation per step.
 */
import { POLICE } from './tuning';
import type { SimWorld } from '../SimWorld';
import { PedPose } from '../traffic/Pedestrians';
import { AgentState } from '../traffic/Traffic';

/** Walking pace bounds (m/s), and how long a leaving officer may take before they are gone anyway (s). */
const PACE = { min: 0.9, max: 3.4, leave: 2.2, leaveFor: 6 } as const;

export class TicketOfficer {
  /** The officer's pedestrian record, -1 when none. */
  ped = -1;
  private leaving = false;
  private leaveLeft = 0;
  /** Where their car stood when they got out: where they walk back to. */
  private homeX = 0;
  private homeZ = 0;
  private readonly door = { x: 0, z: 0 };

  constructor(private readonly sim: SimWorld) {}

  /** After the run's step: the busted bar is this step's. */
  step(dt: number): void {
    const sim = this.sim, peds = sim.peds, traffic = sim.traffic, run = sim.run;
    if (!peds || !traffic) return;
    if (this.ped >= 0 && (!peds.active[this.ped] || (peds.pose[this.ped] !== PedPose.Approach && peds.pose[this.ped] !== PedPose.Ticket))) {
      // the crowd took the record back, or the officer dived out of a car's way: they are gone
      this.ped = -1;
      this.leaving = false;
    }
    if (run.state === 'door') {
      this.clear();
      return;
    }
    const p = run.bustedProgress;
    if (run.state === 'busted') {
      // at the window, writing, for as long as the card is up
      if (this.ped >= 0 && peds.pose[this.ped] !== PedPose.Ticket) {
        this.doorOf();
        peds.x[this.ped] = this.door.x;
        peds.z[this.ped] = this.door.z;
        peds.ticket(this.ped, Math.atan2(sim.probe.x - this.door.x, sim.probe.z - this.door.z));
      }
      return;
    }
    if (this.ped < 0) {
      if (p <= 0) return;
      const unit = this.nearestUnit();
      if (unit < 0) return;
      // out of the unit's driver's door (its left: traffic keeps right, the wheel is on the left)
      const yaw = traffic.yaw[unit] as number, reach = traffic.halfWidthOf(unit) + 0.6;
      const sx = (traffic.x[unit] as number) + Math.cos(yaw) * reach, sz = (traffic.z[unit] as number) - Math.sin(yaw) * reach;
      this.homeX = sx;
      this.homeZ = sz;
      this.doorOf();
      this.ped = peds.spawnOfficer(sx, sz, this.door.x, this.door.z, this.pace(sx, sz, p));
      this.leaving = false;
      return;
    }
    if (p <= 0 && !this.leaving) {
      // the bar drained (the player got away, or the card closed): back to the car
      this.leaving = true;
      this.leaveLeft = PACE.leaveFor;
    }
    if (this.leaving) {
      this.leaveLeft -= dt;
      peds.approach(this.ped, this.homeX, this.homeZ, PACE.leave);
      const d = Math.hypot((peds.x[this.ped] as number) - this.homeX, (peds.z[this.ped] as number) - this.homeZ);
      if (d < 0.4 || this.leaveLeft <= 0) this.clear();
      return;
    }
    // paced to reach the door as the bar fills; the door moves with a creeping car
    this.doorOf();
    peds.approach(this.ped, this.door.x, this.door.z, this.pace(peds.x[this.ped] as number, peds.z[this.ped] as number, p));
  }

  /** The player's driver's door, a step out from the car's left flank. */
  private doorOf(): void {
    const probe = this.sim.probe, reach = probe.halfWidth + 0.55;
    this.door.x = probe.x + Math.cos(probe.yaw) * reach;
    this.door.z = probe.z - Math.sin(probe.yaw) * reach;
  }

  /** The walking pace that reaches the door as the bar fills. */
  private pace(x: number, z: number, progress: number): number {
    const left = Math.max(0.3, (1 - progress) * POLICE.busted.seconds);
    const d = Math.hypot(this.door.x - x, this.door.z - z);
    return Math.max(PACE.min, Math.min(PACE.max, d / left));
  }

  /** The nearest police car to the player within the busted range: the ones the busted rule counts. */
  private nearestUnit(): number {
    const traffic = this.sim.traffic, probe = this.sim.probe;
    if (!traffic) return -1;
    let best = -1, bestD = POLICE.busted.range + 4;
    for (let a = 0; a < traffic.capacity; a++) {
      if (traffic.police[a] !== 1) continue;
      const st = traffic.state[a];
      if (st === AgentState.Free || st === AgentState.Wrecked || st === AgentState.Abandoned) continue;
      const d = Math.hypot((traffic.x[a] as number) - probe.x, (traffic.z[a] as number) - probe.z);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  private clear(): void {
    const peds = this.sim.peds;
    if (this.ped >= 0 && peds) peds.remove(this.ped);
    this.ped = -1;
    this.leaving = false;
  }
}
