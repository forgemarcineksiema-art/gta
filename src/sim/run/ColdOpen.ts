/**
 * The cold open (docs/DESIGN.md §6.6): the first run as a script over the
 * normal game. The player starts in a beat-up van on the Crown diagonal with
 * two patrols behind; a muscle car is held alongside for the swap; a coin
 * line leads round the hideout's block: across the carriageway through a
 * billboard gate, to a delivery marker 600 m on, and back to the hideout
 * door. Verbs are taught in order by captions (state here, DOM in
 * `ui/coldOpen.ts`): steer, swap, boost, smash, takedown, deliver, escape.
 *
 * A verb is done when its thing happens, in any order; the caption is the
 * first verb not done, shown only while its cue holds (the swap keycap only
 * with a car in reach, the gate only when it is near, the ram only with a
 * unit close). The swap, boost, smash and takedown give up on their own so a
 * player who ignores one is never stuck. The door ends the script; `skip()`
 * ends it at once. Busted and the arrest are off while it runs. Once ended it
 * never starts again in this world (`seen`; the app keeps the session flag).
 * Never writes controls, never blocks input.
 */
import { BALANCE } from '../balance';
import type { VehicleControls } from '../controls';
import type { BillboardDesc } from '../city/collectibles';
import type { DropOff } from '../city/cover';
import { GARAGE } from '../city/cover';
import { alongLane, crawlInto, garageEntry, junctionCurve, laneAt, laneLength, laneSpan, resample, type Pt } from '../city/route';
import type { Lane, RoadGraph } from '../city/roads';
import type { SimEvent } from '../events';
import type { SimWorld } from '../SimWorld';
import type { TrackSample } from '../track';
import { AgentState } from '../traffic/Traffic';

export type ColdOpenVerb = 'steer' | 'swap' | 'boost' | 'smash' | 'takedown' | 'deliver' | 'escape';
export const COLD_OPEN_VERBS: readonly ColdOpenVerb[] = ['steer', 'swap', 'boost', 'smash', 'takedown', 'deliver', 'escape'];

/** The block loop the route drives after the diagonal, as grid junctions: round the hideout's block, anticlockwise. */
const LOOP: ReadonlyArray<readonly [number, number]> = [[-2, -2], [-2, -1], [-1, -1], [-1, -2], [-2, -2]];
/** A marker never sits in a junction box: metres it keeps from any graph node. */
const JUNCTION_CLEAR = 30;

export interface ColdOpenRoute {
  /** 3 m samples from the spawn into the middle of the hideout. */
  samples: TrackSample[];
  markerX: number;
  markerZ: number;
  markerYaw: number;
  /** Route distance of the marker and of the gate (-1 without one), m. */
  markerS: number;
  gateS: number;
  gate: BillboardDesc | null;
  /** The route distance where the garage entry leaves the lane. */
  entryS: number;
}

export class ColdOpen {
  active = false;
  /** Ended (completed or skipped): `start()` does nothing after this. */
  seen = false;
  /** The first verb not yet done, null once all are. */
  verb: ColdOpenVerb | null = null;
  /** Verbs in the order they were done (or given up on). */
  readonly done: ColdOpenVerb[] = [];
  /** What the caption shows now: `verb` while its cue holds, else null. */
  caption: ColdOpenVerb | null = null;
  /** The delivery marker. */
  markerX = 0;
  markerZ = 0;
  /** Seconds since `start()`. */
  elapsed = 0;
  route: ColdOpenRoute | null = null;
  /** The job def the marker starts, -1 outside the script. */
  job = -1;
  /** The muscle car held alongside, -1 once taken or let go. */
  candidate = -1;
  /** The furthest route distance the car has reached, m. */
  progressS = 0;

  private readonly sim: SimWorld;
  private cursor = 0;
  private candidateLeft = 0;
  private throttleTime = 0;
  private boostTime = 0;
  /** Seconds the current verb has been current. */
  private verbTime = 0;
  private progressIndex = 0;
  private readonly isDone = new Set<ColdOpenVerb>();

  constructor(sim: SimWorld) {
    this.sim = sim;
  }

  /** At boot when the session has not seen it: the van, heat 1, the candidate, the route's coins and marker. */
  start(): void {
    const sim = this.sim;
    const city = sim.city, traffic = sim.traffic, coins = sim.coins;
    if (this.seen || this.active || !city || !traffic || !coins) return;
    const spawn = city.spawns.find((s) => s.name === 'loop');
    const hideout = sim.run.dropOffs[0];
    if (!spawn || !hideout) return;
    const route = coldOpenRoute(sim, spawn.position.x, spawn.position.z, hideout);
    if (!route) return;
    const c = BALANCE.coldOpen;
    this.route = route;
    this.active = true;
    this.elapsed = 0;
    this.done.length = 0;
    this.isDone.clear();
    this.verbTime = 0;
    this.throttleTime = 0;
    this.boostTime = 0;
    this.progressIndex = 0;
    this.progressS = 0;

    // a beat-up van already rolling, with the heat on
    sim.spawnAt('loop');
    sim.setCar('heavy');
    sim.life.setDamage(c.damage);
    sim.vehicle.setVelocity(Math.sin(spawn.yaw) * c.startSpeed, 0, Math.cos(spawn.yaw) * c.startSpeed);
    traffic.clearAround(spawn.position.x, spawn.position.z, 30);
    if (sim.heat.points < c.heat) sim.heat.add(c.heat - sim.heat.points);

    // the candidate: a muscle car ahead beside the lane, held until it is alongside and taken
    const lane = city.nearestLane(spawn.position.x, spawn.position.z);
    const s0 = alongLane(city.graph.lanes[lane] as Lane, spawn.position.x, spawn.position.z).s;
    this.candidate = traffic.spawnAt(lane, s0 + c.candidateAhead, 'muscle', AgentState.Kinematic, c.candidateOffset);
    if (this.candidate >= 0) traffic.speed[this.candidate] = c.startSpeed;
    this.candidateLeft = c.candidateHold;

    coins.addExtra(routeCoins(sim, route, hideout));
    this.markerX = route.markerX;
    this.markerZ = route.markerZ;
    const fx = Math.sin(hideout.yaw), fz = Math.cos(hideout.yaw);
    this.job = sim.jobs.add({
      kind: 'delivery', x: route.markerX, z: route.markerZ, yaw: route.markerYaw,
      // four metres inside the door: any car through the opening passes within the ring
      targetX: hideout.door.x + fx * BALANCE.jobs.markerRadius, targetZ: hideout.door.z + fz * BALANCE.jobs.markerRadius,
      payout: c.payout, limitSeconds: c.limitSeconds, heat: 0,
    });
    this.cursor = sim.events.sequence;
    this.advance();
  }

  /** Before the player's car moves: count the held keys, keep the candidate alongside. */
  preStep(controls: VehicleControls, dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (controls.throttle > 0.5) this.throttleTime += dt;
    if (this.sim.vehicle.boosting) this.boostTime += dt;
    this.holdCandidate(dt);
  }

  /** After the run: the verbs from the ring, the cues, the caption. */
  postStep(dt: number): void {
    if (!this.active) return;
    this.cursor = this.sim.events.readFrom(this.cursor, this.onEvent);
    if (!this.active) return;
    this.track();
    const c = BALANCE.coldOpen;
    const route = this.route as ColdOpenRoute;
    if (this.throttleTime >= c.steerSeconds) this.complete('steer');
    if (this.boostTime >= c.boostSeconds) this.complete('boost');
    // the car has gone on past the gate, or there is none: nothing left to smash
    if (route.gateS < 0 || this.progressS > route.gateS + c.smashPass) this.complete('smash');
    if (this.sim.jobs.active === this.job && this.sim.jobs.state !== 'idle') this.complete('deliver');
    this.verbTime += dt;
    if (this.verb === 'boost' && this.verbTime >= c.boostTimeout) this.complete('boost');
    if (this.verb === 'takedown' && this.verbTime >= c.takedownTimeout) this.complete('takedown');
    this.advance();
    this.caption = this.verb !== null && this.cued(this.verb) ? this.verb : null;
  }

  /** The skip action: the script ends where it stands; the chase goes on. */
  skip(): void {
    if (this.active) this.finish();
    this.seen = true;
  }

  private finish(): void {
    this.active = false;
    this.seen = true;
    this.verb = null;
    this.caption = null;
    this.release();
    if (this.job >= 0) this.sim.jobs.remove(this.job);
    this.job = -1;
  }

  private complete(verb: ColdOpenVerb): void {
    if (this.isDone.has(verb)) return;
    this.isDone.add(verb);
    this.done.push(verb);
  }

  /** The current verb is the first not done; a new one starts its clock. */
  private advance(): void {
    let next: ColdOpenVerb | null = null;
    for (let i = 0; i < COLD_OPEN_VERBS.length; i++) {
      const v = COLD_OPEN_VERBS[i] as ColdOpenVerb;
      if (!this.isDone.has(v)) { next = v; break; }
    }
    if (next !== this.verb) this.verbTime = 0;
    this.verb = next;
  }

  private cued(verb: ColdOpenVerb): boolean {
    const c = BALANCE.coldOpen;
    const route = this.route as ColdOpenRoute;
    switch (verb) {
      case 'swap': return this.sim.life.state.swapCandidate >= 0;
      case 'smash': return route.gateS >= 0 && route.gateS - this.progressS <= c.smashCue;
      case 'takedown': {
        const p = this.sim.probe;
        return (this.sim.police?.unitsWithin(p.x, p.z, c.takedownRange) ?? 0) > 0;
      }
      case 'deliver': return route.markerS - this.progressS <= c.deliverCue;
      default: return true;
    }
  }

  private holdCandidate(dt: number): void {
    const agent = this.candidate;
    const traffic = this.sim.traffic;
    if (agent < 0 || !traffic) return;
    this.candidateLeft -= dt;
    const state = traffic.state[agent];
    if (this.candidateLeft <= 0 || traffic.police[agent] === 1 || traffic.kindOf(agent) !== 'muscle'
      || (state !== AgentState.Kinematic && state !== AgentState.Physical)) {
      this.release();
      if (!this.isDone.has('swap')) this.complete('swap');
      return;
    }
    // the player's speed, nudged by the gap along the road: it waits for a slow car and keeps up with a fast one
    const c = BALANCE.coldOpen;
    const p = this.sim.probe;
    const yaw = traffic.yaw[agent] as number;
    const along = ((traffic.x[agent] as number) - p.x) * Math.sin(yaw) + ((traffic.z[agent] as number) - p.z) * Math.cos(yaw);
    const nudge = Math.max(-c.candidateSpread, Math.min(c.candidateSpread, -c.candidateGain * along));
    traffic.setGuidePlan(agent, p.speed + nudge);
  }

  private release(): void {
    if (this.candidate >= 0) this.sim.traffic?.clearPolicePlan(this.candidate);
    this.candidate = -1;
  }

  /** The furthest route sample the car has reached: a local search ahead of the last one. */
  private track(): void {
    const samples = (this.route as ColdOpenRoute).samples;
    const p = this.sim.probe;
    let best = this.progressIndex, bestD = Infinity;
    for (let k = -6; k <= 20; k++) {
      const i = this.progressIndex + k;
      if (i < 0 || i >= samples.length) continue;
      const s = samples[i] as TrackSample;
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    // off the route (a respawn, a detour): only a sample close by counts as progress
    if (bestD > 25 * 25) return;
    this.progressIndex = best;
    this.progressS = Math.max(this.progressS, (samples[best] as TrackSample).s);
  }

  private readonly onEvent = (e: SimEvent): void => {
    if (!this.active) return;
    switch (e.kind) {
      case 'swap':
        this.complete('swap');
        if (e.target === this.candidate) this.candidate = -1;
        break;
      case 'billboard':
        this.complete('smash');
        break;
      case 'takedown':
      case 'takedownTraffic':
        if (this.sim.traffic?.police[e.target] === 1) this.complete('takedown');
        break;
      case 'door':
        this.complete('escape');
        this.finish();
        break;
      default:
        break;
    }
  };
}

function nodeAt(gx: number, gz: number): number {
  return (gz + 3) * 7 + (gx + 3);
}

/** The grid lane between two junctions (not an authored road, not the highway), or null. */
function gridLane(graph: RoadGraph, a: readonly [number, number], b: readonly [number, number]): Lane | null {
  const from = nodeAt(a[0], a[1]), to = nodeAt(b[0], b[1]);
  return graph.lanes.find((l) => l.from === from && l.to === to && !l.special && !l.highway) ?? null;
}

/**
 * The route: the spawn's lane to the tower junction, then round the block:
 * the first leg swerves through its billboard gate when it has one, the
 * marker sits `markerAt` m along (moved out of any junction box), and the
 * last leg turns off into the hideout's door. Null if the city has no such
 * loop (another map).
 */
export function coldOpenRoute(sim: SimWorld, x: number, z: number, hideout: DropOff): ColdOpenRoute | null {
  const city = sim.city;
  if (!city) return null;
  const graph = city.graph;
  const first = graph.lanes[city.nearestLane(x, z)] as Lane;
  const legs: Lane[] = [];
  for (let i = 0; i + 1 < LOOP.length; i++) {
    const lane = gridLane(graph, LOOP[i] as readonly [number, number], LOOP[i + 1] as readonly [number, number]);
    if (!lane) return null;
    legs.push(lane);
  }
  const loopStart = LOOP[0] as readonly [number, number];
  if (first.to !== nodeAt(loopStart[0], loopStart[1])) return null;
  const gate = gateOn(sim, legs[0] as Lane);
  const raw: Pt[] = [];
  laneSpan(first, alongLane(first, x, z).s, laneLength(first), raw);
  junctionCurve(first, legs[0] as Lane, raw);
  let gateAlong = -1;
  for (let i = 0; i < legs.length; i++) {
    const lane = legs[i] as Lane;
    if (i === 0 && gate) {
      const g = alongLane(lane, gate.x, gate.z);
      gateAlong = g.s;
      laneSpan(lane, 0, laneLength(lane), raw, g.lateral, g.s, BALANCE.coldOpen.gatePlateau, BALANCE.coldOpen.gateRamp);
    } else {
      laneSpan(lane, 0, laneLength(lane), raw);
    }
    junctionCurve(lane, (legs[i + 1] ?? legs[0]) as Lane, raw);
  }
  // round again onto the first leg, off it 20 m before the door, and in
  const last = legs[0] as Lane;
  const doorS = alongLane(last, hideout.door.x, hideout.door.z).s;
  const entryAt = raw.length;
  laneSpan(last, 0, doorS - 20, raw);
  const turn = raw[raw.length - 1] as Pt;
  garageEntry(hideout, turn, laneAt(last, doorS - 20).yaw, raw);
  const samples = resample(raw);

  // route distances of the gate and of the entry turn, and the marker out of the junction boxes
  let gateS = -1;
  if (gate && gateAlong >= 0) {
    // the first pass: the nearest sample within the first half of the route
    let best = Infinity;
    for (const q of samples) {
      if (q.s > samples.length * 1.5) break;
      const d = (q.x - gate.x) ** 2 + (q.z - gate.z) ** 2;
      if (d < best) { best = d; gateS = q.s; }
    }
  }
  // the entry leg starts where the first leg did: its distance is the polyline's length up to it, not a nearest sample
  let entryS = 0;
  for (let i = 0; i < entryAt; i++) entryS += Math.hypot((raw[i + 1] as Pt).x - (raw[i] as Pt).x, (raw[i + 1] as Pt).z - (raw[i] as Pt).z);
  // a driver (the bot) brakes to a crawl through the door on the last pass, not the first
  crawlInto(samples, hideout, entryS);
  let m = Math.min(samples.length - 1, Math.round(BALANCE.coldOpen.markerAt / 3));
  const nearNode = (q: TrackSample): boolean => graph.nodes.some((n) => (n.x - q.x) ** 2 + (n.z - q.z) ** 2 < JUNCTION_CLEAR * JUNCTION_CLEAR);
  while (m < samples.length - 1 && nearNode(samples[m] as TrackSample)) m++;
  const marker = samples[m] as TrackSample;
  return { samples, markerX: marker.x, markerZ: marker.z, markerYaw: marker.yaw, markerS: marker.s, gateS, gate, entryS };
}

/** The billboard gate beside a lane (within 25 m of it, clear of its ends), or null. */
function gateOn(sim: SimWorld, lane: Lane): BillboardDesc | null {
  const city = sim.city;
  if (!city) return null;
  const len = laneLength(lane);
  let best: BillboardDesc | null = null, bestLateral = Infinity;
  const cx = new Set<string>();
  for (const p of lane.points) cx.add(`${Math.round(p.x / 225)},${Math.round(p.z / 225)}`);
  for (const key of cx) {
    const [gx, gz] = key.split(',').map(Number) as [number, number];
    // the chunks round the spawn are loaded already; generating one is the slow path
    const chunk = city.active.get(key)?.chunk ?? city.generate(gx, gz);
    for (const b of chunk.billboards) {
      const a = alongLane(lane, b.x, b.z);
      if (a.s < 20 || a.s > len - 20 || Math.abs(a.lateral) > 25) continue;
      if (Math.abs(a.lateral) < bestLateral) { bestLateral = Math.abs(a.lateral); best = b; }
    }
  }
  return best;
}

/** Coins along the route every `coinPitch` m, from 4 m ahead of the spawn to the door, where no coin already lies within 3 m. */
function routeCoins(sim: SimWorld, route: ColdOpenRoute, hideout: DropOff): Pt[] {
  const city = sim.city;
  if (!city) return [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of route.samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const existing: Pt[] = [];
  for (const c of city.laneCoins) {
    if (c.x < minX - 6 || c.x > maxX + 6 || c.z < minZ - 6 || c.z > maxZ + 6) continue;
    for (const s of route.samples) {
      if (Math.abs(s.x - c.x) < 6 && Math.abs(s.z - c.z) < 6) { existing.push(c); break; }
    }
  }
  if (route.gate) {
    // the gate's own line (placeCoins): along its normal at 2.5 m
    const g = route.gate, n = BALANCE.coin.billboardLine;
    for (let k = 0; k < n; k++) {
      const d = (k - (n - 1) / 2) * 2.5;
      if (Math.abs(d) >= 1) existing.push({ x: g.x + Math.sin(g.yaw) * d, z: g.z + Math.cos(g.yaw) * d });
    }
  }
  const out: Pt[] = [];
  const pitch = BALANCE.coldOpen.coinPitch;
  const fx = Math.sin(hideout.yaw), fz = Math.cos(hideout.yaw);
  for (let s = 4; ; s += pitch) {
    const i = Math.round(s / 3);
    const q = route.samples[i];
    if (!q) break;
    // stop at the door: the garage is the goal, not a coin run
    const along = (q.x - hideout.x) * fx + (q.z - hideout.z) * fz;
    if (q.s > route.entryS && along > -GARAGE.depth / 2 - 2) break;
    if (existing.some((e) => (e.x - q.x) ** 2 + (e.z - q.z) ** 2 < 9)) continue;
    out.push({ x: q.x, z: q.z });
  }
  return out;
}
