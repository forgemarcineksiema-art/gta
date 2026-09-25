/**
 * The AI cars (M8.8 slice 22): a pool of `Vehicle`s, parked and switched off, that take over a physical race's rivals
 * (a duel's) within `AI.physicalRadius` m of the player and hand them back to their lanes past `AI.releaseRadius`, as a
 * lent body is, or when one has stalled off its lane for `AI.stallSeconds` out of the player's sight. Each drives its
 * record's way to the finish with a `Driver`: the record's lane, the race's exit off it and the one after, at the
 * race's plan speed; the record is drawn where the car is and the car's collider answers for it. So a rival near the
 * player slides, hits and is hit as the player's car is. No allocation per step but a path's rebuild at a new lane.
 */
import * as M from '../math';
import { junctionCurve, laneLength, laneSpan, resample, type Pt } from '../city/route';
import type { Lane } from '../city/roads';
import type { SimWorld } from '../SimWorld';
import { bodyTuning, type BodyId } from '../traffic/bodies';
import type { PlayerProbe, Traffic } from '../traffic/Traffic';
import { Vehicle } from '../vehicle/Vehicle';
import type { VehicleTuning } from '../vehicle/tuning';
import { Driver } from './Driver';

export const AI = {
  /** Cars in the pool (the twins' two). */
  pool: 2,
  /** A rival nearer the player than this is taken over; one further than `releaseRadius` given back, m. */
  physicalRadius: 40,
  releaseRadius: 60,
  /** Stalled: under `stallSpeed` m/s for `stallSeconds` s and `offLane` m off its lane; given back out of sight. */
  stallSpeed: 1,
  stallSeconds: 3,
  offLane: 4,
  /** A path is rebuilt when less than this is left of it, m. */
  pathLeft: 60,
} as const;

/** Where a parked car waits, switched off. */
const PARK = { x: 0, y: -200, z: 0 };
const AXIS_Y = { x: 0, y: 1, z: 0 };

interface AiCar {
  vehicle: Vehicle;
  driver: Driver;
  /** The record it drives, -1 when parked. */
  agent: number;
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

  constructor(private readonly sim: SimWorld) {
    for (let k = 0; k < AI.pool; k++) {
      const vehicle = new Vehicle(sim.world, sim.transforms, bodyTuning('muscle'), PARK, 0);
      vehicle.body.setEnabled(false);
      this.cars.push({ vehicle, driver: new Driver(), agent: -1, body: '', lane: -1, next: -1, stalled: 0, lateral: 0 });
    }
  }

  /** The car driving record `agent`, or null. */
  carOf(agent: number): Vehicle | null {
    for (const car of this.cars) if (car.agent === agent) return car.vehicle;
    return null;
  }

  /** Before the physics: the rivals taken over or given back, and each car driven one step. */
  preStep(probe: PlayerProbe, dt: number): void {
    const traffic = this.sim.traffic, race = this.sim.jobs.race;
    if (!traffic) return;
    for (const car of this.cars) {
      const a = car.agent;
      if (a < 0) continue;
      if (traffic.puppet[a] !== 1 || !race.physical || !traffic.isRacer(a)) { this.release(car, traffic); continue; }
      const x = traffic.x[a] as number, z = traffic.z[a] as number;
      if (Math.hypot(x - probe.x, z - probe.z) > AI.releaseRadius) { this.release(car, traffic); continue; }
      // stalled off its lane (in a wall, on its roof): back to its lane where the player cannot see it happen
      car.stalled = Math.abs(car.vehicle.telemetry.speed) < AI.stallSpeed ? car.stalled + dt : 0;
      if (car.stalled > AI.stallSeconds && Math.abs(car.lateral) > AI.offLane
        && traffic.outOfView(x, z, 3, probe, this.sim.police?.tuning.viewNear ?? 60, Math.cos((this.sim.police?.tuning.viewHalfAngleDeg ?? 60) * Math.PI / 180))) {
        this.release(car, traffic);
      }
    }
    if (race.physical) {
      for (let k = 0; k < race.count; k++) {
        const a = race.rivals[k] as number;
        if (a < 0 || traffic.puppet[a] === 1 || !traffic.isRacer(a)) continue;
        if (Math.hypot((traffic.x[a] as number) - probe.x, (traffic.z[a] as number) - probe.z) > AI.physicalRadius) continue;
        for (const car of this.cars) {
          if (car.agent >= 0) continue;
          this.take(car, a, traffic);
          break;
        }
      }
    }
    for (const car of this.cars) {
      if (car.agent < 0) continue;
      this.path(car, traffic);
      car.driver.cap = traffic.planSpeed(car.agent);
      car.vehicle.update(car.driver.drive(car.vehicle), dt);
    }
  }

  /** After the physics: each car's transforms, and its record drawn where it is, on the lane it is on. */
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
      if (lane < 0) continue;
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
      traffic.puppetPose(a, gx, gy, gz, q, v.telemetry.speed, lane, this.at.s);
    }
  }

  private take(car: AiCar, agent: number, traffic: Traffic): void {
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
    car.lane = -1;
    car.next = -1;
    car.stalled = 0;
    car.lateral = 0;
  }

  private release(car: AiCar, traffic: Traffic): void {
    traffic.puppetOff(car.agent);
    car.agent = -1;
    car.vehicle.setVelocity(0, 0, 0);
    car.vehicle.teleport(PARK, 0);
    car.vehicle.body.setEnabled(false);
  }

  /** The car's path: from where it is on its lane, over the race's exit and the one after, laid again at a new lane or near its end. */
  private path(car: AiCar, traffic: Traffic): void {
    const graph = this.sim.city?.graph, race = this.sim.jobs.race, a = car.agent;
    const lane = traffic.lane[a] as number;
    if (!graph || lane < 0) return;
    const next = race.bestExit(lane);
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
      const after = race.bestExit(next);
      if (after >= 0) {
        const m = graph.lanes[after] as Lane;
        junctionCurve(n, m, raw);
        laneSpan(m, 0, laneLength(m), raw);
      }
    }
    car.driver.setPath(resample(raw), false);
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
