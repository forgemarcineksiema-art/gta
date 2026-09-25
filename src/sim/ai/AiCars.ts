/**
 * The AI cars (M8.8 slices 22–23): a pool of `Vehicle`s, parked and switched off, that take over traffic records near
 * the player and drive them on the car model:
 *
 * - a physical race's rivals (a duel's) within `AI.physicalRadius` m of the player, given back to their lanes past
 *   `AI.releaseRadius`, as a lent body is, or when one has stalled off its lane for `AI.stallSeconds` out of sight;
 *   each drives its record's way to the finish: its lane, the race's exit off it and the one after, at the race's pace;
 * - on a chase, the `POLICE.physicalUnits` units nearest the player within `AI.unitRadius` m: along their plan's lanes
 *   at its speed, or straight at its aim point, a ram's or a PIT's at its speed, a box's slot braked into (the shoves'
 *   accelerations retire: a hit is two masses); given back past `AI.unitRelease` or when the chase is over.
 *
 * A record so driven is a `puppet`: drawn where its car is, the car's collider answering for it, its hits sensed as a
 * lent body's (the damage, the wreck, the rams the roster counts). No allocation per step but a path's rebuild at a new
 * lane.
 */
import * as M from '../math';
import { junctionCurve, laneLength, laneSpan, resample, type Pt } from '../city/route';
import type { Lane } from '../city/roads';
import { POLICE } from '../police/tuning';
import type { SimWorld } from '../SimWorld';
import { bodyTuning, type BodyId } from '../traffic/bodies';
import { AgentState, type PlayerProbe, type Traffic } from '../traffic/Traffic';
import { Vehicle } from '../vehicle/Vehicle';
import type { VehicleTuning } from '../vehicle/tuning';
import { Driver } from './Driver';

export interface AiTuning {
  pool: number;
  physicalRadius: number;
  releaseRadius: number;
  unitRadius: number;
  unitRelease: number;
  stallSpeed: number;
  stallSeconds: number;
  offLane: number;
  pathLeft: number;
}

export const AI: AiTuning = {
  /**
   * Cars kept for a race's rivals (the twins' two); the units' are `POLICE.physicalUnits` more. Both read when the world
   * is built; both 0 is slice 24's switch (the budget's): no car in the pool, every rival and unit a lane record, the
   * world as it was before the AI drove.
   */
  pool: 2,
  /** A rival nearer the player than this is taken over; one further than `releaseRadius` given back, m. */
  physicalRadius: 40,
  releaseRadius: 60,
  /** A unit on a chase nearer than this may be taken over, one further than `unitRelease` is given back, m. */
  unitRadius: 80,
  unitRelease: 110,
  /** Stalled: under `stallSpeed` m/s for `stallSeconds` s and `offLane` m off its lane; given back out of sight. */
  stallSpeed: 1,
  stallSeconds: 3,
  offLane: 4,
  /** A path is rebuilt when less than this is left of it, m. */
  pathLeft: 60,
};

/** Where a parked car waits, switched off. */
const PARK = { x: 0, y: -200, z: 0 };
const AXIS_Y = { x: 0, y: 1, z: 0 };

interface AiCar {
  vehicle: Vehicle;
  driver: Driver;
  /** The record it drives, -1 when parked, and whose it is. */
  agent: number;
  role: 'rival' | 'unit' | '';
  body: BodyId | '';
  /** The lane and the exit its path was laid for. */
  lane: number;
  next: number;
  stalled: number;
  /** Metres off its lane at the last step. */
  lateral: number;
}

/** The chassis origin's height over the ground at rest (render/cars/carMesh's `restHeight`). */
function restHeight(t: VehicleTuning): number {
  return t.wheelRadius + t.suspensionRestLength - (t.mass * (9.81 + t.extraGravity)) / 4 / t.suspensionStiffness - t.suspensionAttachY;
}

export class AiCars {
  readonly cars: AiCar[] = [];
  private readonly raw: Pt[] = [];
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  private readonly up = { x: 0, y: 0, z: 0 };
  private readonly at = { s: 0, lateral: 0 };
  private readonly aim = { x: 0, z: 0, speed: 0, free: false };
  /** The cars kept for rivals (the pool's first), and this step's nearest chasing units with their distances, nearest first. */
  private readonly rivals: number;
  private readonly near: Int16Array;
  private readonly nearD: Float32Array;
  private nearCount = 0;

  constructor(private readonly sim: SimWorld) {
    this.rivals = AI.pool;
    this.near = new Int16Array(POLICE.physicalUnits);
    this.nearD = new Float32Array(POLICE.physicalUnits);
    for (let k = 0; k < AI.pool + POLICE.physicalUnits; k++) {
      const vehicle = new Vehicle(sim.world, sim.transforms, bodyTuning('muscle'), PARK, 0);
      vehicle.body.setEnabled(false);
      this.cars.push({ vehicle, driver: new Driver(), agent: -1, role: '', body: '', lane: -1, next: -1, stalled: 0, lateral: 0 });
    }
  }

  /** The car driving record `agent`, or null. */
  carOf(agent: number): Vehicle | null {
    for (const car of this.cars) if (car.agent === agent) return car.vehicle;
    return null;
  }

  /** Cars driving now. */
  get busy(): number {
    let n = 0;
    for (const car of this.cars) if (car.agent >= 0) n++;
    return n;
  }

  /** Before the physics: the records taken over or given back, and each car driven one step. */
  preStep(probe: PlayerProbe, dt: number): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const race = this.sim.jobs.race, police = this.sim.police;
    // on a chase, a box, an arrest, and under the busted card (the units stand where they are till it closes)
    const chase = police !== null && (this.sim.pursuit.state !== 'idle' || police.arresting || police.boxing || this.sim.run.state === 'busted');
    this.nearest(probe, traffic, chase);
    for (const car of this.cars) {
      const a = car.agent;
      if (a < 0) continue;
      if (traffic.puppet[a] !== 1) { this.release(car, traffic); continue; }
      const x = traffic.x[a] as number, z = traffic.z[a] as number, d = Math.hypot(x - probe.x, z - probe.z);
      if (car.role === 'rival') {
        if (!race.physical || !traffic.isRacer(a) || d > AI.releaseRadius) { this.release(car, traffic); continue; }
      } else if (!chase || traffic.police[a] !== 1 || (d > AI.unitRelease && !this.isNear(a))) {
        this.release(car, traffic);
        continue;
      }
      // stalled off its lane (in a wall, on its roof): back to its lane where the player cannot see it happen
      car.stalled = Math.abs(car.vehicle.telemetry.speed) < AI.stallSpeed ? car.stalled + dt : 0;
      if (car.stalled > AI.stallSeconds && Math.abs(car.lateral) > AI.offLane && traffic.outOfView(x, z, 3, probe, POLICE.viewNear, Math.cos(POLICE.viewHalfAngleDeg * Math.PI / 180))) {
        this.release(car, traffic);
      }
    }
    if (race.physical) {
      for (let k = 0; k < race.count; k++) {
        const a = race.rivals[k] as number;
        if (a < 0 || traffic.puppet[a] === 1 || !traffic.isRacer(a)) continue;
        if (Math.hypot((traffic.x[a] as number) - probe.x, (traffic.z[a] as number) - probe.z) > AI.physicalRadius) continue;
        this.take(a, 'rival', traffic);
      }
    }
    for (let k = 0; k < this.nearCount; k++) {
      const a = this.near[k] as number;
      if (traffic.puppet[a] !== 1) this.take(a, 'unit', traffic);
    }
    for (const car of this.cars) {
      const a = car.agent;
      if (a < 0) continue;
      if (car.role === 'unit' && traffic.planAim(a, this.aim)) {
        car.driver.aim(this.aim.x, this.aim.z, this.aim.speed, this.aim.free);
      } else {
        car.driver.follow();
        this.path(car, traffic);
        const plan = traffic.planSpeed(a), lane = traffic.lane[a] as number;
        car.driver.cap = plan > 0 ? plan : lane >= 0 ? (traffic.lanes.limit[lane] as number) : 10;
      }
      car.vehicle.update(car.driver.drive(car.vehicle), dt);
    }
  }

  /** After the physics: each car's transforms; its record drawn where it is, on the lane it is on, its hits sensed. */
  postStep(): void {
    const traffic = this.sim.traffic, graph = this.sim.city?.graph;
    if (!traffic || !graph) return;
    for (const car of this.cars) {
      const a = car.agent;
      if (a < 0) continue;
      const v = car.vehicle;
      v.writeTransforms();
      const p = v.body.translation(this.pos), q = v.body.rotation(this.rot);
      M.rotate(this.up, q, AXIS_Y);
      // the record's origin is on the road, under the chassis
      const h = restHeight(v.tuning);
      const gx = p.x - this.up.x * h, gy = p.y - this.up.y * h, gz = p.z - this.up.z * h;
      let lane = traffic.lane[a] as number;
      if (lane >= 0) {
        let l = graph.lanes[lane] as Lane;
        this.project(l, p.x, p.z);
        // past its lane's end: on the exit its path was laid for
        if (this.at.s >= laneLength(l) - 0.5 && car.next >= 0) {
          const n = graph.lanes[car.next] as Lane;
          const lateral = this.at.lateral;
          this.project(n, p.x, p.z);
          if (Math.abs(this.at.lateral) <= Math.abs(lateral) + 2) { lane = car.next; l = n; } else this.project(l, p.x, p.z);
        }
        car.lateral = this.at.lateral;
      }
      traffic.puppetPose(a, gx, gy, gz, q, v.telemetry.speed, lane, this.at.s);
      traffic.sensePuppet(a, v.collider);
    }
  }

  /** The chasing units nearest the player within `unitRadius`, nearest first, up to `physicalUnits`. */
  private nearest(probe: PlayerProbe, traffic: Traffic, chase: boolean): void {
    this.nearCount = 0;
    const police = this.sim.police;
    if (!chase || !police || this.near.length === 0) return;
    for (let u = 0; u < police.units.length; u++) {
      const a = police.units[u] as number;
      if (a < 0) continue;
      const st = traffic.state[a];
      if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
      const d = Math.hypot((traffic.x[a] as number) - probe.x, (traffic.z[a] as number) - probe.z);
      if (d > AI.unitRadius) continue;
      let k = this.nearCount < this.near.length ? this.nearCount++ : this.near.length;
      if (k === this.near.length && d >= (this.nearD[k - 1] as number)) continue;
      if (k === this.near.length) k--;
      while (k > 0 && (this.nearD[k - 1] as number) > d) {
        this.near[k] = this.near[k - 1] as number;
        this.nearD[k] = this.nearD[k - 1] as number;
        k--;
      }
      this.near[k] = a;
      this.nearD[k] = d;
    }
  }

  private isNear(agent: number): boolean {
    for (let k = 0; k < this.nearCount; k++) if (this.near[k] === agent) return true;
    return false;
  }

  private take(agent: number, role: 'rival' | 'unit', traffic: Traffic): void {
    let car: AiCar | null = null;
    for (let k = role === 'rival' ? 0 : this.rivals; k < (role === 'rival' ? this.rivals : this.cars.length); k++) {
      const c = this.cars[k] as AiCar;
      if (c.agent < 0) { car = c; break; }
    }
    if (!car) return;
    const v = car.vehicle, body = traffic.bodyOf(agent);
    if (car.body !== body) {
      v.tuning = bodyTuning(body);
      v.applyTuning();
      car.body = body;
    }
    v.body.setEnabled(true);
    const yaw = traffic.yaw[agent] as number, speed = traffic.speed[agent] as number;
    v.teleport({ x: traffic.x[agent] as number, y: (traffic.y[agent] as number) + restHeight(v.tuning) + 0.05, z: traffic.z[agent] as number }, yaw);
    v.setVelocity(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    traffic.puppetOn(agent, v.collider.handle);
    car.agent = agent;
    car.role = role;
    car.lane = -1;
    car.next = -1;
    car.stalled = 0;
    car.lateral = 0;
  }

  private release(car: AiCar, traffic: Traffic): void {
    traffic.puppetOff(car.agent);
    car.agent = -1;
    car.role = '';
    car.vehicle.setVelocity(0, 0, 0);
    car.vehicle.teleport(PARK, 0);
    car.vehicle.body.setEnabled(false);
  }

  /**
   * The car's path: from where it is on its lane over the exit it takes and the one after (a rival's the race's best, a
   * unit's its plan's, then straight on), laid again at a new lane or near its end.
   */
  private path(car: AiCar, traffic: Traffic): void {
    const graph = this.sim.city?.graph, a = car.agent;
    const lane = traffic.lane[a] as number;
    if (!graph || lane < 0) return;
    const next = this.exit(car, lane, traffic);
    if (lane === car.lane && next === car.next && car.driver.left > AI.pathLeft) return;
    car.lane = lane;
    car.next = next;
    const raw = this.raw;
    raw.length = 0;
    const l = graph.lanes[lane] as Lane;
    laneSpan(l, Math.max(0, (traffic.s[a] as number) - 6), laneLength(l), raw);
    if (next >= 0) {
      const n = graph.lanes[next] as Lane;
      junctionCurve(l, n, raw);
      laneSpan(n, 0, laneLength(n), raw);
      const after = this.exit(car, next, traffic);
      if (after >= 0) {
        const m = graph.lanes[after] as Lane;
        junctionCurve(n, m, raw);
        laneSpan(m, 0, laneLength(m), raw);
      }
    }
    car.driver.setPath(resample(raw), false);
  }

  /** The exit a car takes off a lane: a rival's the race's best, a unit's its plan's off its own lane, else straight on. */
  private exit(car: AiCar, lane: number, traffic: Traffic): number {
    if (car.role === 'rival') return this.sim.jobs.race.bestExit(lane);
    if (lane === traffic.lane[car.agent]) {
      const planned = traffic.planNext(car.agent);
      if (planned >= 0) return planned;
    }
    const outs = traffic.lanes.outs(lane);
    for (const o of outs) if (traffic.lanes.straightThrough(lane, o)) return o;
    return outs[0] ?? -1;
  }

  /** The car's place along a lane and across it (alongLane's, into `at`). */
  private project(lane: Lane, x: number, z: number): void {
    let best = Infinity, travelled = 0;
    const pts = lane.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as Pt, b = pts[i + 1] as Pt;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best) {
        best = d;
        this.at.s = travelled + t * len;
        this.at.lateral = ((x - px) * -dz + (z - pz) * dx) / (len || 1);
      }
      travelled += len;
    }
  }
}
