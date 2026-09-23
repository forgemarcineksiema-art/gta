/**
 * Fares (M5.5 slice 13; DESIGN.md §4 item 1, Crazy Taxi): while the player
 * drives a taxi and runs no job, now and then a pedestrian on the pavement
 * ahead hails it. Stop alongside and they hop in: a fare job to a point
 * 300–900 m on by lane path, the arrow and a clock; near misses and jumps on
 * the way are tips; a delivered fare pays and its leftover time carries into
 * the next, whose passenger is already waving just up the road, and the chain
 * adds a share to each fare's pay. One fare in four is hot: a crook with a
 * suitcase, double pay, the heat rising while they ride. No allocation per
 * step but a fare's start.
 */
import { BALANCE } from '../balance';
import type { EventLog, SimEvent } from '../events';
import { mulberry32 } from '../random';
import type { SimWorld } from '../SimWorld';
import type { PlayerProbe } from '../traffic/Traffic';
import { PedPose } from '../traffic/Pedestrians';
import { lanePathTo } from './place';
import type { Lane } from '../city/roads';

export class Fares {
  /** The pedestrian waving the taxi down, -1 when none. */
  hailer = -1;
  /** The running fare's def id, -1 when none; whether it is hot; its tips so far; fares delivered in a row. */
  fare = -1;
  hot = false;
  /** Whether the last fare delivered was hot. */
  lastHot = false;
  tips = 0;
  chain = 0;
  /** Time left over from the last fare, carried into the next one's clock (0 once the chain breaks). */
  carry = 0;
  private hailLeft = 0;
  private readonly rng = mulberry32(0xfa2e);
  private cursor: number;

  constructor(private readonly sim: SimWorld, events: EventLog) {
    this.cursor = events.sequence;
  }

  /** Before the jobs' step: hail, pick up, tip, the hot fare's heat. */
  step(probe: PlayerProbe, dt: number): void {
    const sim = this.sim, peds = sim.peds, f = BALANCE.fares;
    this.cursor = sim.events.readFrom(this.cursor, this.onEvent);
    if (this.fare >= 0) {
      if (sim.jobs.active !== this.fare) {
        // the fare is over (delivered, failed, abandoned): the chain goes on only from a delivery
        this.fare = -1;
        this.hot = false;
      } else if (this.hot) {
        sim.heat.add(f.hot.heatPerSecond * dt);
      }
      return;
    }
    // out of the taxi the chain is over; busy (another job, a fare's result on the line), it waits
    if (sim.carBody !== 'taxi') { this.chain = 0; this.carry = 0; }
    if (!peds || sim.carBody !== 'taxi' || sim.jobs.state !== 'idle' || sim.coldOpen.active) {
      this.dropHailer();
      return;
    }
    if (this.hailer >= 0) {
      const h = this.hailer;
      if (!peds.active[h] || peds.pose[h] !== PedPose.Hail) { this.hailer = -1; return; }
      const d = Math.hypot((peds.x[h] as number) - probe.x, (peds.z[h] as number) - probe.z);
      if (d > f.giveUp) { this.dropHailer(); this.chain = 0; this.carry = 0; return; }
      if (d <= f.pickupRadius && probe.speed <= f.pickupSpeed) this.pickUp(h, probe);
      return;
    }
    this.hailLeft -= dt;
    if (this.hailLeft > 0) return;
    this.hailLeft = f.hailEvery;
    this.hail(probe, f.hailAhead[0] as number, f.hailAhead[1] as number);
  }

  /** A walker on the pavement ahead, in reach, raises an arm. */
  private hail(probe: PlayerProbe, near: number, far: number): void {
    const peds = this.sim.peds;
    if (!peds) return;
    const fx = Math.sin(probe.yaw), fz = Math.cos(probe.yaw);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < peds.capacity; i++) {
      if (!peds.active[i] || peds.pose[i] !== PedPose.Walk) continue;
      const dx = (peds.x[i] as number) - probe.x, dz = (peds.z[i] as number) - probe.z;
      const along = dx * fx + dz * fz, d = Math.hypot(dx, dz);
      if (along < near || d > far || Math.abs(dx * -fz + dz * fx) > 25) continue;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    peds.hail(best, Math.atan2(probe.x - (peds.x[best] as number), probe.z - (peds.z[best] as number)));
    this.hailer = best;
  }

  private dropHailer(): void {
    const peds = this.sim.peds;
    if (this.hailer >= 0 && peds && peds.pose[this.hailer] === PedPose.Hail) peds.unhail(this.hailer);
    this.hailer = -1;
  }

  /** In they hop: the destination, the clock (with the chain's carry), the pay, and whether they are hot. */
  private pickUp(h: number, probe: PlayerProbe): void {
    const sim = this.sim, city = sim.city, traffic = sim.traffic, peds = sim.peds, f = BALANCE.fares;
    if (!city || !traffic || !peds) return;
    const x = peds.x[h] as number, z = peds.z[h] as number;
    // a lane's middle 250–750 m off in a straight line, 300–900 m by path, picked by the fare's own dice
    let target: { x: number; z: number; lane: number; s: number } | null = null, length = 0;
    const lanes = traffic.lanes;
    const start = (this.rng() * lanes.laneCount) | 0;
    const near = (f.path[0] as number), far = (f.path[1] as number);
    for (let k = 0; k < lanes.laneCount && !target; k++) {
      const lane = (start + k) % lanes.laneCount;
      const lx = lanes.midX[lane] as number, lz = lanes.midZ[lane] as number;
      const straight = Math.hypot(lx - x, lz - z);
      if (straight < near * 0.8 || straight > far * 0.8) continue;
      if ((city.graph.lanes[lane] as Lane).highway && lanes.heightAt(lane, (lanes.length[lane] as number) / 2) > 0.05) continue;
      const t = { x: lx, z: lz, lane, s: (lanes.length[lane] as number) / 2 };
      const p = lanePathTo(city, lanes, x, z, t);
      if (p.length < near || p.length > far) continue;
      target = t;
      length = p.length;
    }
    if (!target) { this.dropHailer(); return; }
    peds.pickUp(h);
    this.hailer = -1;
    this.hot = this.rng() < f.hot.share;
    this.tips = 0;
    const base = Math.round(length * f.payPerM / 10) * 10 * (1 + f.chainBonus * this.chain);
    const payout = Math.round(base * (this.hot ? f.hot.pay : 1) / 10) * 10;
    const limit = Math.round(length / f.speed + f.slack + this.carry);
    this.carry = 0;
    const id = sim.jobs.add({ kind: 'fare', x: probe.x, z: probe.z, yaw: probe.yaw, targetX: target.x, targetZ: target.z, payout, limitSeconds: limit, heat: 0 });
    this.fare = id;
    sim.jobs.startFare(id);
  }

  /** The jobs' word on a delivered fare: the chain grows, the leftover carries, the next passenger waves up the road. */
  delivered(remaining: number): void {
    // the career counts the hot ones (M6): read after this, when `hot` is cleared
    this.lastHot = this.hot;
    this.chain++;
    this.carry = Math.max(0, remaining);
    this.hailLeft = 0;
    this.fare = -1;
    this.hot = false;
  }

  /** The chain broke (a fare failed or was dropped). */
  broken(): void {
    this.chain = 0;
    this.carry = 0;
    this.fare = -1;
    this.hot = false;
  }

  private readonly onEvent = (e: SimEvent): void => {
    if (this.fare < 0) return;
    const t = BALANCE.fares.tips;
    if (e.kind === 'nearMiss' || e.kind === 'nearMissOncoming') this.tips += t.nearMiss;
    else if (e.kind === 'jump') this.tips += t.jump;
  };
}
