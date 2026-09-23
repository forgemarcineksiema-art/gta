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
import type { Lane } from '../city/roads';
import { alongLane } from '../city/route';
import type { SimWorld } from '../SimWorld';
import type { PlayerProbe } from '../traffic/Traffic';
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
    const lanes = sim.city?.graph.lanes ?? [];
    this.dist = new Float64Array(lanes.length);
    this.done = new Uint8Array(lanes.length);
    this.preds = lanes.map(() => []);
    for (const lane of lanes) for (const n of lane.next) (this.preds[n] as number[]).push(lane.id);
  }

  /** The rivals on the road ahead, the way to the finish worked out once; a duel brings its own field. */
  start(finishX: number, finishZ: number, probe: PlayerProbe, duel?: RaceField): void {
    const city = this.sim.city, traffic = this.sim.traffic;
    if (!city || !traffic) return;
    this.stop();
    this.finishX = finishX;
    this.finishZ = finishZ;
    this.field(city.nearestLane(finishX, finishZ, 0));
    const lane = city.nearestLane(probe.x, probe.z, probe.y - 0.5);
    const s0 = alongLane(city.graph.lanes[lane] as Lane, probe.x, probe.z).s;
    const len = traffic.lanes.length[lane] as number;
    const r = BALANCE.jobs.race;
    const cars = duel ? duel.cars : FIELD;
    this.count = Math.min(cars.length, this.rivals.length);
    this.pace = r.pace * (duel ? duel.pace : 1);
    this.bandLow = duel ? duel.band[0] : (r.band[0] as number);
    this.bandHigh = duel ? duel.band[1] : (r.band[1] as number);
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
  step(probe: PlayerProbe): void {
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
      const lane = traffic.lane[agent] as number;
      if (lane < 0) continue;
      // the exit whose way on to the finish is shortest
      let next = -1, best = Infinity;
      for (const out of lanes.outs(lane)) {
        const d = lanes.connectionLength(lane, out) + (this.dist[out] as number);
        if (d < best) { best = d; next = out; }
      }
      // the rubber band: ahead of the player it eases off, behind it pushes
      const band = Math.max(this.bandLow, Math.min(this.bandHigh, 1 - (mine - theirs) / r.bandRange * (1 - this.bandLow)));
      traffic.setRacePlan(agent, next, (lanes.limit[lane] as number) * this.pace * band);
    }
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
  }

  /** Dijkstra backward from the finish: each lane's distance from its start to the finish point. */
  private field(finishLane: number): void {
    const city = this.sim.city;
    const traffic = this.sim.traffic;
    if (!city || !traffic || finishLane < 0) return;
    const lanes = traffic.lanes;
    this.dist.fill(Infinity);
    this.done.fill(0);
    this.dist[finishLane] = alongLane(city.graph.lanes[finishLane] as Lane, this.finishX, this.finishZ).s;
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
