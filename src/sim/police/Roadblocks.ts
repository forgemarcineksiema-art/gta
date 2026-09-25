/**
 * Roadblocks (docs/M4_PLAN.md slice 6, DESIGN.md §2.6 level 3): while the
 * pursuit is active at level 3 and up, one roadblock at a time at a
 * chokepoint on the player's road 150–300 m ahead, placed where the player
 * cannot see it go up. Two parked police cars across the lane with their
 * light bars on and a sawhorse in the gap; a spike strip before it across
 * the open side. The sawhorse is the weak point: driven through at any speed
 * it costs a little speed and pays the bag (the `roadblock` event), and the
 * two cars pull out and join the chase. The spike punctures the car (Life).
 * A heavy car at speed breaches the car half (Life's damage rule). The block
 * clears 150 m behind the player or when the chase ends.
 *
 * No allocation per step.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { QUERY_NOT_PROP } from '../collision';
import type { Chokepoint } from '../city/cover';
import type { Lane } from '../city/roads';
import type { EventLog } from '../events';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe, type Traffic } from '../traffic/Traffic';
import type { LaneProjection } from '../traffic/lanes';
import { POLICE } from './tuning';

/** The footprint a placement must be out of view with (m): the two cars and the gap. */
const FOOTPRINT = 7;
/** Seconds between placement attempts while the conditions hold. */
const ATTEMPT_SECONDS = 0.5;
/** The sawhorse's depth along the road (m) and the car's reach past its footprint. */
const SAWHORSE_DEPTH = 0.6;

export class Roadblocks {
  /** 0 or 1. */
  active = 0;
  x = 0;
  z = 0;
  yaw = 0;
  sawhorseX = 0;
  sawhorseZ = 0;
  sawhorseUp = false;
  readonly agents: [number, number] = [-1, -1];
  spikeX = 0;
  spikeZ = 0;
  /** The strip lies across the road: its long axis is perpendicular to this heading. */
  spikeYaw = 0;
  spikeUp = false;
  /** +1 or -1: the side the punctured car pulls to, fixed per strip. */
  spikeSide = 1;
  /** Bumps when a roadblock goes up or comes down, for the views. */
  serial = 0;
  /** Roadblocks put up and sawhorses broken this session (measurement). */
  placed = 0;
  broken = 0;

  private readonly sim: SimWorld;
  private readonly traffic: Traffic;
  /** Chokepoints per lane, ascending along it. */
  private readonly byLane = new Map<number, Chokepoint[]>();
  private site: Chokepoint | null = null;
  private retryLeft = 0;
  private attemptLeft = 0;
  private readonly projection: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  constructor(sim: SimWorld, readonly sites: readonly Chokepoint[]) {
    if (!sim.traffic) throw new Error('Roadblocks require city traffic');
    this.sim = sim;
    this.traffic = sim.traffic;
    for (const site of sites) {
      const list = this.byLane.get(site.lane) ?? [];
      list.push(site);
      this.byLane.set(site.lane, list);
    }
    for (const list of this.byLane.values()) list.sort((a, b) => a.s - b.s);
  }

  step(probe: PlayerProbe, dt: number, events: EventLog): void {
    const t = POLICE.roadblock;
    const level = this.sim.heat.level;
    if (this.active === 1) {
      this.stepActive(probe, events);
      return;
    }
    this.retryLeft -= dt;
    if (level < t.fromLevel || this.sim.pursuit.state !== 'active' || this.retryLeft > 0) return;
    this.attemptLeft -= dt;
    if (this.attemptLeft > 0) return;
    this.attemptLeft = ATTEMPT_SECONDS;
    const site = this.pick(probe);
    if (site) this.place(site, probe);
  }

  /** The lane a roadblock stands on while one is up, else -1 (the way goes round it, M8.7 D2). */
  get blockedLane(): number {
    return this.active === 1 && this.site ? this.site.lane : -1;
  }

  /** Test hook: put a roadblock up at this chokepoint now, whatever the heat and the view. */
  raise(site: Chokepoint): void {
    if (this.active === 1) this.release();
    this.place(site, this.sim.probe);
    if (this.active === 1) this.sim.events.push('dispatch', 1, site.x, 0, site.z, -1);
  }

  /** Take the block down now (the run ended). */
  clear(): void {
    if (this.active === 0) return;
    this.release();
  }

  private stepActive(probe: PlayerProbe, events: EventLog): void {
    const t = POLICE.roadblock;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const past = (probe.x - this.x) * fx + (probe.z - this.z) * fz;
    if (past > t.clearPast || this.sim.pursuit.state === 'idle' || this.sim.heat.level < t.fromLevel) {
      this.release();
      return;
    }
    // a car of the block flattened by the steamroller (M8.8 slice 11) breaches it as the sawhorse does
    const a0 = this.agents[0], a1 = this.agents[1];
    const flattened = (a0 >= 0 && this.traffic.flat[a0] === 1) || (a1 >= 0 && this.traffic.flat[a1] === 1);
    if (flattened || (this.sawhorseUp && this.touches(probe, this.sawhorseX, this.sawhorseZ, this.yaw, t.sawhorseWidth / 2, SAWHORSE_DEPTH / 2))) {
      // through the weak point: planks fly, a little speed goes, the bag pays, and the cars pull out
      this.sawhorseUp = false;
      this.broken++;
      const v = this.sim.vehicle;
      const tm = v.telemetry;
      const keep = 1 - t.sawhorseLoss;
      v.setVelocity(tm.vx * keep, tm.vy, tm.vz * keep);
      events.push('roadblock', 1, this.sawhorseX, 0.8, this.sawhorseZ, -1);
      this.release();
      return;
    }
    if (this.spikeUp && !this.sim.life.spiked && this.touches(probe, this.spikeX, this.spikeZ, this.spikeYaw, t.spikeLength / 2, t.spikeDepth / 2)) {
      this.sim.life.puncture(this.spikeSide);
    }
  }

  /** The chassis footprint over a box across the road (half extents: across, along). */
  private touches(probe: PlayerProbe, cx: number, cz: number, yaw: number, halfAcross: number, halfAlong: number): boolean {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const dx = probe.x - cx, dz = probe.z - cz;
    const along = dx * fx + dz * fz;
    const across = -dx * fz + dz * fx;
    // the car's extent in the box's frame, from its own heading
    const a = probe.yaw - yaw;
    const reachAlong = probe.halfLength * Math.abs(Math.cos(a)) + probe.halfWidth * Math.abs(Math.sin(a));
    const reachAcross = probe.halfLength * Math.abs(Math.sin(a)) + probe.halfWidth * Math.abs(Math.cos(a));
    return Math.abs(along) <= halfAlong + reachAlong && Math.abs(across) <= halfAcross + reachAcross;
  }

  /** The first chokepoint on the player's road ahead within the window, far enough and out of sight. */
  private pick(probe: PlayerProbe): Chokepoint | null {
    const t = POLICE.roadblock;
    const lanes = this.traffic.lanes;
    let lane = -1, best = Infinity, s0 = 0;
    for (let i = 0; i < lanes.laneCount; i++) {
      if (Math.hypot((lanes.midX[i] as number) - probe.x, (lanes.midZ[i] as number) - probe.z) > (lanes.length[i] as number) / 2 + 25) continue;
      lanes.project(i, probe.x, probe.z, this.projection);
      const cost = this.projection.dist + (1 - Math.cos(this.projection.yaw - probe.yaw)) * 20;
      if (cost < best) { best = cost; lane = i; s0 = this.projection.s; }
    }
    if (lane < 0 || best > 12) return null;
    const cosHalf = Math.cos(POLICE.viewHalfAngleDeg * Math.PI / 180);
    let ahead = -s0;
    for (let hop = 0; hop < 8 && ahead <= t.maxAhead; hop++) {
      const list = this.byLane.get(lane);
      if (list) for (let i = 0; i < list.length; i++) {
        const site = list[i] as Chokepoint;
        // today's roadblocks stand only at today's sites
        if (this.sim.cover && this.sim.cover.daily.chokepoints[site.id] !== 1) continue;
        const d = ahead + site.s;
        if (d < t.minAhead || d > t.maxAhead) continue;
        if (Math.hypot(site.x - probe.x, site.z - probe.z) < t.minDistance) continue;
        if (!this.hidden(site, probe, cosHalf)) continue;
        return site;
      }
      const next = this.onward(lane);
      if (next < 0) break;
      ahead += (lanes.length[lane] as number) + lanes.connectionLength(lane, next);
      lane = next;
    }
    return null;
  }

  /** The way the road goes on: straight through, the same highway lane if there is one, else the gentlest turn. */
  private onward(lane: number): number {
    const lanes = this.traffic.lanes;
    const city = this.sim.city;
    if (!city) return -1;
    const from = city.graph.lanes[lane] as Lane;
    const uturn = lanes.uturn(lane);
    let best = -1, bestCost = Infinity;
    const outs = lanes.outs(lane);
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i] as number;
      if (out === uturn) continue;
      const to = city.graph.lanes[out] as Lane;
      const cost = Math.abs(lanes.headingChange(lane, out)) + (to.highway === from.highway ? 0 : 1) + (to.offset === from.offset ? 0 : 0.2);
      if (cost < bestCost) { bestCost = cost; best = out; }
    }
    return best;
  }

  /** Out of the view cone, or behind a building from the driver's eye. */
  private hidden(site: Chokepoint, probe: PlayerProbe, cosHalf: number): boolean {
    if (this.traffic.outOfView(site.x, site.z, FOOTPRINT, probe, POLICE.viewNear, cosHalf)) return true;
    const dx = site.x - probe.x, dz = site.z - probe.z, dy = 1 - 1.3;
    const len = Math.hypot(dx, dy, dz);
    this.ray.origin.x = probe.x;
    this.ray.origin.y = 1.3;
    this.ray.origin.z = probe.z;
    this.ray.dir.x = dx / len;
    this.ray.dir.y = dy / len;
    this.ray.dir.z = dz / len;
    return this.sim.world.castRay(this.ray, len, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_NOT_PROP) !== null;
  }

  private place(site: Chokepoint, probe: PlayerProbe): void {
    const t = POLICE.roadblock;
    const cosHalf = Math.cos(POLICE.viewHalfAngleDeg * Math.PI / 180);
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    // right of the road's heading is (-fz, fx); the cars stand along the lane either side of the gap, facing the player
    const rx = -fz, rz = fx;
    const half = t.gap / 2;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      const x = site.x + rx * side * half, z = site.z + rz * side * half;
      const agent = this.traffic.spawnParkedPolice(x, z, site.yaw + Math.PI, 'police', probe, POLICE.viewNear, cosHalf);
      this.agents[k] = agent;
      if (agent >= 0) this.traffic.lights[agent] = 1;
    }
    if (this.agents[0] < 0 && this.agents[1] < 0) return;
    this.site = site;
    this.active = 1;
    this.placed++;
    this.serial++;
    this.x = site.x;
    this.z = site.z;
    this.yaw = site.yaw;
    this.sawhorseX = site.x;
    this.sawhorseZ = site.z;
    this.sawhorseUp = true;
    this.spikeX = site.spikeX;
    this.spikeZ = site.spikeZ;
    this.spikeYaw = site.yaw;
    this.spikeUp = true;
    // the pull goes toward the block's side of the road: a punctured car drifts into it
    const toBlock = (site.x - site.spikeX) * rx + (site.z - site.spikeZ) * rz;
    this.spikeSide = toBlock >= 0 ? 1 : -1;
  }

  /** The cars pull out onto the block's lane and join the roster; the sawhorse and strip go. */
  private release(): void {
    const site = this.site;
    const police = this.sim.police;
    for (let k = 0; k < 2; k++) {
      const agent = this.agents[k] as number;
      this.agents[k] = -1;
      if (agent < 0 || this.traffic.police[agent] !== 1 || this.traffic.state[agent] !== AgentState.Parked) continue;
      this.traffic.lights[agent] = 0;
      if (site) {
        const lanes = this.traffic.lanes;
        lanes.project(site.lane, this.traffic.x[agent] as number, this.traffic.z[agent] as number, this.projection);
        this.traffic.unpark(agent, site.lane, this.projection.s, this.projection.lateral);
      }
      police?.enlist(agent);
    }
    this.active = 0;
    this.site = null;
    this.sawhorseUp = false;
    this.spikeUp = false;
    this.serial++;
    this.retryLeft = POLICE.roadblock.retryAfter;
  }
}
