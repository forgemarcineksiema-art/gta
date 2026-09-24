/**
 * The ticket book (M5.5 slice 18; BACKLOG Run structure): while the busted
 * bar fills, an officer steps out of the nearest unit and walks to the
 * driver's window, paced to get there as the bar fills, and writes the ticket
 * through the busted card. When the bar drains (or the card is closed) they
 * walk back to where their car stood and are gone. A pedestrian record in the
 * officer's look, moved by this rule; the HUD draws the bar as the ticket
 * book. No allocation per step.
 *
 * Never inside a car (M8.6 D8; DESIGN.md §18.2 rule 6): they step out of the
 * unit's side that is clear, go round the player's car by its corners when the
 * straight way crosses it, slide along any car they meet, and write at the
 * driver's window or, when a car stands there, the passenger's (behind the car
 * when both are taken); the window moves with the car. Walking straight
 * through the car, and staying where they stood when a unit shoved it, they
 * were inside the player's car on 6.5 % of their steps.
 */
import { POLICE } from './tuning';
import type { SimWorld } from '../SimWorld';
import { PedPose } from '../traffic/Pedestrians';
import { AgentState } from '../traffic/Traffic';

/** Walking pace bounds (m/s), and how long a leaving officer may take before they are gone anyway (s). */
const PACE = { min: 0.9, max: 3.4, leave: 2.2, leaveFor: 6 } as const;
/** A window's point a step out from the car's flank; the officer's half width kept clear of every car; a corner's slack (m). */
const WINDOW = 0.55;
const BODY = 0.35;
const CORNER = 0.25;
/** Cars further than this from the officer are not looked at (m). */
const NEAR = 9;

/** True when the segment (a0, c0)–(a1, c1) meets the box |a| ≤ ha, |c| ≤ hc (a slab test, in the box's frame). */
export function segmentMeetsBox(a0: number, c0: number, a1: number, c1: number, ha: number, hc: number): boolean {
  let lo = 0, hi = 1;
  const da = a1 - a0, dc = c1 - c0;
  for (let k = 0; k < 2; k++) {
    const p = k === 0 ? a0 : c0, d = k === 0 ? da : dc, h = k === 0 ? ha : hc;
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return false;
      continue;
    }
    let t0 = (-h - p) / d, t1 = (h - p) / d;
    if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}

export class TicketOfficer {
  /** The officer's pedestrian record, -1 when none. */
  ped = -1;
  private leaving = false;
  private leaveLeft = 0;
  /** Where their car stood when they got out: where they walk back to. */
  private homeX = 0;
  private homeZ = 0;
  /** The window they write at: 1 the driver's (the car's left), -1 the passenger's, 0 behind the car. */
  private side = 1;
  private readonly door = { x: 0, z: 0 };
  /** The next point of the walk: the window, or a corner of the player's car on the way round it. */
  private readonly way = { x: 0, z: 0 };
  /** The length of the walk left from the officer through `way` to the window, for the pace. */
  private wayLength = 0;

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
      if (this.ped < 0) return;
      // at the window, writing, for as long as the card is up; the window moves with the car
      this.doorOf();
      const x = peds.x[this.ped] as number, z = peds.z[this.ped] as number;
      if (peds.pose[this.ped] === PedPose.Ticket || Math.hypot(this.door.x - x, this.door.z - z) < 1.5) {
        peds.x[this.ped] = this.door.x;
        peds.z[this.ped] = this.door.z;
        const face = Math.atan2(sim.probe.x - this.door.x, sim.probe.z - this.door.z);
        if (peds.pose[this.ped] !== PedPose.Ticket) peds.ticket(this.ped, face);
        else peds.yaw[this.ped] = face;
        return;
      }
      // still on the way round when the bar filled: they walk on to the window, briskly, and write there
      this.route(x, z);
      peds.approach(this.ped, this.way.x, this.way.z, PACE.max);
      this.keepOut();
      return;
    }
    if (this.ped < 0) {
      if (p <= 0) return;
      const unit = this.nearestUnit();
      if (unit < 0) return;
      // out of the unit's side that is clear: its driver's door (its left: traffic keeps right, the wheel is on the
      // left) unless a car stands there, the passenger's then
      const yaw = traffic.yaw[unit] as number, reach = traffic.halfWidthOf(unit) + 0.6;
      const lx = Math.cos(yaw) * reach, lz = -Math.sin(yaw) * reach;
      const ux = traffic.x[unit] as number, uz = traffic.z[unit] as number;
      const left = this.clearance(ux + lx, uz + lz, unit), right = this.clearance(ux - lx, uz - lz, unit);
      const sx = left >= BODY || left >= right ? ux + lx : ux - lx, sz = left >= BODY || left >= right ? uz + lz : uz - lz;
      this.homeX = sx;
      this.homeZ = sz;
      this.side = this.freeSide();
      this.doorOf();
      this.route(sx, sz);
      this.ped = peds.spawnOfficer(sx, sz, this.way.x, this.way.z, this.pace(p));
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
      this.keepOut();
      const d = Math.hypot((peds.x[this.ped] as number) - this.homeX, (peds.z[this.ped] as number) - this.homeZ);
      if (d < 0.4 || this.leaveLeft <= 0) this.clear();
      return;
    }
    // paced to reach the window as the bar fills; the window moves with a creeping car, and goes to the other side
    // when a car comes to stand at it
    if (this.clearance(this.door.x, this.door.z, -1) < BODY) this.side = this.freeSide();
    this.doorOf();
    this.route(peds.x[this.ped] as number, peds.z[this.ped] as number);
    peds.approach(this.ped, this.way.x, this.way.z, this.pace(p));
    this.keepOut();
  }

  /** The window on `side` of the player's car, a step out from its flank (or its tail). */
  private doorOf(): void {
    const probe = this.sim.probe;
    if (this.side === 0) {
      const reach = probe.halfLength + WINDOW;
      this.door.x = probe.x - Math.sin(probe.yaw) * reach;
      this.door.z = probe.z - Math.cos(probe.yaw) * reach;
      return;
    }
    const reach = (probe.halfWidth + WINDOW) * this.side;
    this.door.x = probe.x + Math.cos(probe.yaw) * reach;
    this.door.z = probe.z - Math.sin(probe.yaw) * reach;
  }

  /** The driver's window unless a car stands there; the passenger's; behind the car when both are taken. */
  private freeSide(): number {
    for (let k = 0; k < SIDES.length; k++) {
      this.side = SIDES[k] as number;
      this.doorOf();
      if (this.clearance(this.door.x, this.door.z, -1) >= BODY) return this.side;
    }
    return 1;
  }

  /**
   * The next point of the walk from (x, z) to the window: the window itself when the straight way does not cross the
   * player's car (grown by the officer's half width), else a corner of it: the one on the window's side of the end
   * nearer the walk when the way there is clear, the one on the officer's side of that end before it. The length left
   * goes to the pace.
   */
  private route(x: number, z: number): void {
    const probe = this.sim.probe;
    const fx = Math.sin(probe.yaw), fz = Math.cos(probe.yaw), lx = fz, lz = -fx;
    const ha = probe.halfLength + BODY, hc = probe.halfWidth + BODY;
    const oa = (x - probe.x) * fx + (z - probe.z) * fz, oc = (x - probe.x) * lx + (z - probe.z) * lz;
    const wa = (this.door.x - probe.x) * fx + (this.door.z - probe.z) * fz, wc = (this.door.x - probe.x) * lx + (this.door.z - probe.z) * lz;
    if (!segmentMeetsBox(oa, oc, wa, wc, ha, hc)) {
      this.way.x = this.door.x;
      this.way.z = this.door.z;
      this.wayLength = Math.hypot(wa - oa, wc - oc);
      return;
    }
    // round the end nearer the walk: the window's corner of it when the way there is clear, the officer's before it
    const end = oa + wa >= 0 ? 1 : -1, ca = end * (ha + CORNER);
    const oSide = oc >= 0 ? 1 : -1, wSide = wc > 1e-6 ? 1 : wc < -1e-6 ? -1 : oSide;
    const c1 = oSide * (hc + CORNER), c2 = wSide * (hc + CORNER);
    const tc = segmentMeetsBox(oa, oc, ca, c2, ha, hc) ? c1 : c2;
    this.way.x = probe.x + fx * ca + lx * tc;
    this.way.z = probe.z + fz * ca + lz * tc;
    this.wayLength = Math.hypot(ca - oa, tc - oc) + Math.abs(c2 - tc) + Math.hypot(wa - ca, wc - c2);
  }

  /** The walking pace that reaches the window as the bar fills. */
  private pace(progress: number): number {
    const left = Math.max(0.3, (1 - progress) * POLICE.busted.seconds);
    return Math.max(PACE.min, Math.min(PACE.max, this.wayLength / left));
  }

  /**
   * Out of every car the officer stands in, the player's and the traffic's (grown by his half width): along the car's
   * nearer side, so a walk into a car becomes a walk along it.
   */
  private keepOut(): void {
    const sim = this.sim, peds = sim.peds, traffic = sim.traffic;
    if (!peds || !traffic || this.ped < 0) return;
    const probe = sim.probe;
    this.pushOut(probe.x, probe.z, probe.yaw, probe.halfWidth, probe.halfLength);
    const x = peds.x[this.ped] as number, z = peds.z[this.ped] as number;
    for (let a = 0; a < traffic.capacity; a++) {
      if (traffic.state[a] === AgentState.Free) continue;
      const ax = traffic.x[a] as number, az = traffic.z[a] as number;
      if (Math.abs(ax - x) > NEAR || Math.abs(az - z) > NEAR) continue;
      this.pushOut(ax, az, traffic.yaw[a] as number, traffic.halfWidthOf(a), traffic.halfLengthOf(a));
    }
  }

  private pushOut(cx: number, cz: number, yaw: number, hw: number, hl: number): void {
    const peds = this.sim.peds;
    if (!peds) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = fz, lz = -fx;
    const dx = (peds.x[this.ped] as number) - cx, dz = (peds.z[this.ped] as number) - cz;
    const a = dx * fx + dz * fz, c = dx * lx + dz * lz;
    const ha = hl + BODY, hc = hw + BODY;
    const inA = ha - Math.abs(a), inC = hc - Math.abs(c);
    if (inA <= 0 || inC <= 0) return;
    if (inC <= inA) {
      const out = (c >= 0 ? 1 : -1) * inC;
      peds.x[this.ped] = (peds.x[this.ped] as number) + lx * out;
      peds.z[this.ped] = (peds.z[this.ped] as number) + lz * out;
    } else {
      const out = (a >= 0 ? 1 : -1) * inA;
      peds.x[this.ped] = (peds.x[this.ped] as number) + fx * out;
      peds.z[this.ped] = (peds.z[this.ped] as number) + fz * out;
    }
  }

  /** How far (x, z) stands outside the nearest car's footprint, the player's among them, `skip` left out (m, ≤ 0 inside). */
  private clearance(x: number, z: number, skip: number): number {
    const traffic = this.sim.traffic, probe = this.sim.probe;
    let least = outside(x - probe.x, z - probe.z, probe.yaw, probe.halfWidth, probe.halfLength);
    if (!traffic) return least;
    for (let a = 0; a < traffic.capacity; a++) {
      if (a === skip || traffic.state[a] === AgentState.Free) continue;
      const ax = traffic.x[a] as number, az = traffic.z[a] as number;
      if (Math.abs(ax - x) > NEAR || Math.abs(az - z) > NEAR) continue;
      const out = outside(x - ax, z - az, traffic.yaw[a] as number, traffic.halfWidthOf(a), traffic.halfLengthOf(a));
      if (out < least) least = out;
    }
    return least;
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

/** The windows in the order tried: the driver's, the passenger's, behind the car. */
const SIDES = [1, -1, 0] as const;

/** How far a point (dx, dz from a car's centre) stands outside the car's footprint (m, ≤ 0 inside). */
function outside(dx: number, dz: number, yaw: number, hw: number, hl: number): number {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const along = Math.abs(dx * fx + dz * fz) - hl, across = Math.abs(dx * fz - dz * fx) - hw;
  return along > 0 && across > 0 ? Math.hypot(along, across) : Math.max(along, across);
}
