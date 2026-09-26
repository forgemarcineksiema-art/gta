/**
 * Street races (M5.5 slice 11; DESIGN.md §4 item 4, Burnout Paradise's
 * point-to-point with free routing): a race marker puts three rivals on the
 * road just ahead of the player; everybody races to one finish by any route.
 * The rivals are traffic records on the lane follower in its driving mode
 * (they run the junction boxes and go round slower cars, like a unit on a
 * chase), steered at each junction onto the shortest way to the finish, at
 * the lane's limit times `pace`, rubber-banded: a rival well ahead eases
 * off, one well behind pushes. Places go by arrival; the player's place pays.
 * No allocation per step.
 */
import { BALANCE } from '../balance';
import { POLICE } from '../police/tuning';
import { PedPose } from '../traffic/Pedestrians';
import type { Lane } from '../city/roads';
import { alongLane } from '../city/route';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';
import type { BodyId } from '../traffic/bodies';
import { PALETTE } from '../palette';

/** The street race's field: the rivals' cars and paints. */
const FIELD: ReadonlyArray<readonly [BodyId, number]> = [['sports', PALETTE.carLime], ['muscle', PALETTE.carMagenta], ['sports', PALETTE.carBlue]];

/**
 * A wanted board's duel (M6): its rivals (one, the twins two), their pace on the lane's limit and their band; a
 * hunt's rival starts `lead` m ahead and carries `armour`.
 */
export interface RaceField {
  cars: ReadonlyArray<readonly [BodyId, number]>;
  pace: number;
  band: readonly [number, number];
  lead?: number;
  armour?: number;
  /** The twists the race plays itself (M6 slice 3): the twins' swap, Niko's towers, the Ghost off the radar. */
  twins?: boolean;
  breakers?: boolean;
  hidden?: boolean;
  /** Its rivals drive physical cars within `AI.physicalRadius` of the player (M8.8 slice 22: a duel's, a race or a hunt). */
  physical?: boolean;
}

export class Race {
  /** The rivals' traffic records, -1 when gone. */
  readonly rivals = new Int16Array(FIELD.length).fill(-1);
  /** Each rival's finishing place (0 still racing). */
  readonly placeOf = new Uint8Array(FIELD.length);
  /** Rivals in this race: three in a street race, one or two in a duel. */
  count = 0;
  /** This race's pace (a factor on the lane's limit) and band. */
  private pace = 1;
  private bandLow = 1;
  private bandHigh = 1;
  /** The rivals may drive physical cars near the player (M8.8 slice 22, `ai/AiCars.ts`). */
  physical = false;
  /** The twists (M6 slice 3); `hidden`: the maps draw no rival (the Ghost). */
  private twins = false;
  private breakers = false;
  hidden = false;
  /** Seconds until each twin may swap again, and the swaps so far. */
  private readonly swapLeft = new Float32Array(FIELD.length);
  swaps = 0;
  /** Rivals over the line so far. */
  finished = 0;
  running = false;
  private finishX = 0;
  private finishZ = 0;
  /** Metres from each lane's start to the finish by the best way on (Infinity where it cannot be reached). */
  private readonly dist: Float64Array;
  private readonly preds: number[][];
  private readonly done: Uint8Array;

  constructor(private readonly sim: SimWorld) {
    // the grid's streets or the island's (M8.10 slice 14)
    const lanes = sim.traffic?.streets.graph.lanes ?? [];
    this.dist = new Float64Array(lanes.length);
    this.done = new Uint8Array(lanes.length);
    this.preds = lanes.map(() => []);
    for (const lane of lanes) for (const n of lane.next) (this.preds[n] as number[]).push(lane.id);
  }

  /** The rivals on the road ahead, the way to the finish worked out once; a duel brings its own field. */
  start(finishX: number, finishZ: number, probe: PlayerProbe, duel?: RaceField): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const streets = traffic.streets;
    this.stop();
    this.finishX = finishX;
    this.finishZ = finishZ;
    // the finish on the ground's road (the grid's 0, the island's hills), never a deck over it; the grid on the road under the car
    this.field(streets.nearestLane(finishX, finishZ, streets.groundAt(finishX, finishZ)));
    const lane = streets.nearestLane(probe.x, probe.z, probe.y - 0.5);
    if (lane < 0) return;
    const s0 = alongLane(streets.graph.lanes[lane] as Lane, probe.x, probe.z).s;
    const len = traffic.lanes.length[lane] as number;
    const r = BALANCE.jobs.race;
    const cars = duel ? duel.cars : FIELD;
    this.count = Math.min(cars.length, this.rivals.length);
    this.pace = r.pace * (duel ? duel.pace : 1);
    this.bandLow = duel ? duel.band[0] : (r.band[0] as number);
    this.bandHigh = duel ? duel.band[1] : (r.band[1] as number);
    this.twins = duel?.twins ?? false;
    this.breakers = duel?.breakers ?? false;
    this.hidden = duel?.hidden ?? false;
    this.physical = duel?.physical ?? false;
    this.swapLeft.fill(0);
    this.swaps = 0;
    const lead = duel?.lead ?? r.gridAhead;
    for (let k = 0; k < this.count; k++) {
      const [body, paint] = cars[k] as readonly [BodyId, number];
      const s = Math.min(len - 2, s0 + lead + r.gridAhead * k);
      const agent = traffic.spawnRacer(lane, s, body, paint, duel !== undefined);
      if (agent >= 0 && duel?.armour !== undefined) traffic.armour[agent] = duel.armour;
      this.rivals[k] = agent;
      this.placeOf[k] = 0;
    }
    this.finished = 0;
    this.running = true;
  }

  /** Each rival onto the best exit at its rubber-banded pace; the ones over the line take their places. */
  step(probe: PlayerProbe, dt = 1 / 60): void {
    if (!this.running) return;
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const r = BALANCE.jobs.race;
    const lanes = traffic.lanes;
    const mine = Math.hypot(this.finishX - probe.x, this.finishZ - probe.z);
    for (let k = 0; k < this.count; k++) {
      const agent = this.rivals[k] as number;
      if (agent < 0 || this.placeOf[k] !== 0) continue;
      if (!traffic.isRacer(agent)) { this.rivals[k] = -1; continue; }
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      const theirs = Math.hypot(this.finishX - x, this.finishZ - z);
      if (theirs <= r.finishRadius) {
        this.placeOf[k] = ++this.finished;
        traffic.endRace(agent);
        continue;
      }
      // the twins never drive the same car twice: one fallen far behind swaps, out of sight, into a car ahead
      if (this.twins) {
        this.swapLeft[k] = Math.max(0, (this.swapLeft[k] as number) - dt);
        if (theirs - mine > BALANCE.board.twins.behind && this.swapLeft[k] === 0) {
          const into = this.swapTarget(probe, mine);
          if (into >= 0) {
            this.swap(k, agent, into);
            continue;
          }
        }
      }
      // Neon Niko pulls the scaffold towers down behind him while the player is on his tail
      if (this.breakers && this.sim.breakers) {
        const b = BALANCE.board.breakers;
        const gap = Math.hypot(probe.x - x, probe.z - z);
        if (mine > theirs && gap <= b.behind) this.sim.breakers.pullAt(x, z, b.reach);
      }
      const lane = traffic.lane[agent] as number;
      if (lane < 0) continue;
      const next = this.bestExit(lane);
      // the rubber band: ahead of the player it eases off, behind it pushes
      const band = Math.max(this.bandLow, Math.min(this.bandHigh, 1 - (mine - theirs) / r.bandRange * (1 - this.bandLow)));
      traffic.setRacePlan(agent, next, (lanes.limit[lane] as number) * this.pace * band);
    }
  }

  /**
   * The car a twin swaps into: a driving civilian out of the player's sight, within `twins.within` m of the player
   * and at least `twins.ahead` m nearer the finish than them, the nearest to the player; -1 when there is none.
   */
  private swapTarget(probe: PlayerProbe, mine: number): number {
    const traffic = this.sim.traffic;
    if (!traffic) return -1;
    const tw = BALANCE.board.twins, p = POLICE;
    const cosHalf = Math.cos(p.viewHalfAngleDeg * Math.PI / 180);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < traffic.capacity; i++) {
      const st = traffic.state[i];
      if ((st !== AgentState.Kinematic && st !== AgentState.Physical) || traffic.police[i] !== 0 || traffic.racer[i] !== 0 || traffic.rival[i] !== 0 || i === traffic.wanted) continue;
      const x = traffic.x[i] as number, z = traffic.z[i] as number;
      const d = Math.hypot(x - probe.x, z - probe.z);
      if (d > tw.within || d >= bestD) continue;
      if (Math.hypot(this.finishX - x, this.finishZ - z) > mine - tw.ahead) continue;
      if (!traffic.outOfView(x, z, 3, probe, p.viewNear, cosHalf)) continue;
      best = i;
      bestD = d;
    }
    return best;
  }

  /** The twin leaves their car to the road and takes this one; its driver is left on the pavement shaking a fist. */
  private swap(k: number, from: number, into: number): void {
    const sim = this.sim, traffic = sim.traffic;
    if (!traffic) return;
    traffic.endRace(from);
    traffic.makeRacer(into);
    this.rivals[k] = into;
    this.swapLeft[k] = BALANCE.board.twins.every;
    this.swaps++;
    const x = traffic.x[into] as number, z = traffic.z[into] as number, yaw = traffic.yaw[into] as number;
    sim.peds?.spawnAt(x + Math.cos(yaw) * 2.4, z - Math.sin(yaw) * 2.4, yaw + Math.PI / 2, PedPose.Fist);
    sim.events.push('twinSwap', 0, x, 0, z, ((traffic.body[into] as number) << 24) | ((traffic.paint[into] as number) & 0xffffff));
  }

  /** A lane's exit whose way on to the finish is shortest, -1 for none. */
  bestExit(lane: number): number {
    const lanes = this.sim.traffic?.lanes;
    if (!lanes) return -1;
    let next = -1, best = Infinity;
    for (const out of lanes.outs(lane)) {
      const d = lanes.connectionLength(lane, out) + (this.dist[out] as number);
      if (d < best) { best = d; next = out; }
    }
    return next;
  }

  /** The player's place now: one plus the rivals over the line or nearer it. */
  place(probe: PlayerProbe): number {
    const traffic = this.sim.traffic;
    let ahead = this.finished;
    if (!traffic) return ahead + 1;
    const mine = Math.hypot(this.finishX - probe.x, this.finishZ - probe.z);
    for (let k = 0; k < this.count; k++) {
      const agent = this.rivals[k] as number;
      if (agent < 0 || this.placeOf[k] !== 0) continue;
      if (Math.hypot(this.finishX - (traffic.x[agent] as number), this.finishZ - (traffic.z[agent] as number)) < mine) ahead++;
    }
    return ahead + 1;
  }

  /** The race is over: the rivals still on it drive on as traffic. */
  stop(): void {
    const traffic = this.sim.traffic;
    for (let k = 0; k < this.rivals.length; k++) {
      const agent = this.rivals[k] as number;
      if (agent >= 0 && traffic?.isRacer(agent)) traffic.endRace(agent);
      this.rivals[k] = -1;
    }
    this.running = false;
    this.physical = false;
  }

  /** Dijkstra backward from the finish: each lane's distance from its start to the finish point. */
  private field(finishLane: number): void {
    const traffic = this.sim.traffic;
    if (!traffic || finishLane < 0) return;
    const lanes = traffic.lanes;
    this.dist.fill(Infinity);
    this.done.fill(0);
    this.dist[finishLane] = alongLane(traffic.streets.graph.lanes[finishLane] as Lane, this.finishX, this.finishZ).s;
    for (;;) {
      let lane = -1, d = Infinity;
      for (let i = 0; i < this.dist.length; i++) if (this.done[i] === 0 && (this.dist[i] as number) < d) { d = this.dist[i] as number; lane = i; }
      if (lane < 0) break;
      this.done[lane] = 1;
      for (const p of this.preds[lane] as number[]) {
        const c = (lanes.length[p] as number) + lanes.connectionLength(p, lane) + d;
        if (c < (this.dist[p] as number)) this.dist[p] = c;
      }
    }
  }
}
