/**
 * Track-following autopilot: pure pursuit on the track centreline with a speed
 * plan from the curvature ahead. Its lap time is a benchmark for every tuning
 * change, and its core (follow a polyline, brake for what is coming) is what the
 * road bot in the city will reuse.
 */
import type { CarId, SimWorld, TrackSample, VehicleControls } from '../sim';
import { AgentState } from '../sim/traffic/Traffic';

export interface TrackBotTuning {
  /** Lookahead distance = base + speed * perSpeed, clamped. */
  lookBase: number;
  lookPerSpeed: number;
  lookMin: number;
  lookMax: number;
  /** Steering gain on the pursuit angle (rad -> [-1, 1]). */
  steerGain: number;
  /** Lateral acceleration the plan allows in corners, m/s². */
  latAccel: number;
  /** Braking deceleration the plan assumes, m/s². */
  brakeAccel: number;
  /** How far ahead the speed plan looks, m. */
  planAhead: number;
  /** Speed cap on straights, m/s. */
  vMax: number;
  /** Use boost above this speed when the road ahead is straight (0 = never). */
  boostAbove: number;
}

export const DEFAULT_TRACK_BOT: TrackBotTuning = {
  lookBase: 5,
  lookPerSpeed: 0.5,
  lookMin: 7,
  lookMax: 34,
  steerGain: 2.6,
  latAccel: 17,
  brakeAccel: 9,
  planAhead: 90,
  vMax: 58,
  boostAbove: 0,
};

/**
 * Per-class overrides. The lateral budget is the largest that keeps the class on
 * the road and on four wheels on the test track (sweep in docs/PROGRESS.md);
 * above it the bot cuts corners or lifts the inside wheels and the lap time
 * stops measuring the car.
 */
export const TRACK_BOT_BY_CAR: Record<CarId, Partial<TrackBotTuning>> = {
  muscle: {},
  compact: { latAccel: 13 },
  heavy: { latAccel: 11, brakeAccel: 8 },
  // 19-23 m/s^2 make the sports car run wide out of the hairpin; the default holds.
  sports: {},
  police: { latAccel: 15 },
};

/** Conservative junction speeds; this is a coverage driver, not a racing opponent. */
export const CITY_BOT_TUNING: Partial<TrackBotTuning> = {
  latAccel: 7, brakeAccel: 7, vMax: 32, lookBase: 3, lookPerSpeed: 0.3, lookMin: 5, lookMax: 15,
};

export class TrackBot {
  tuning: TrackBotTuning;
  private idx = 0;
  /** A path of its own (the drive to a drop-off) instead of the map's loop; open paths end in a stop. */
  private path: TrackSample[] | null = null;
  private loop = true;
  private stuckTime = 0;
  readonly visitedLanes = new Set<number>();
  tourComplete = false;
  resets = 0;

  constructor(car: CarId = 'muscle', overrides: Partial<TrackBotTuning> = {}) {
    this.tuning = { ...DEFAULT_TRACK_BOT, ...TRACK_BOT_BY_CAR[car], ...overrides };
  }

  /** Follow `samples` from now on; `loop` false treats the last sample as the end of the road. */
  setPath(samples: TrackSample[], loop = false): void {
    this.path = samples.length > 1 ? samples : null;
    this.loop = loop || !this.path;
    this.idx = 0;
  }

  private at(i: number, m: number): number {
    return this.loop ? ((i % m) + m) % m : Math.max(0, Math.min(m - 1, i));
  }

  /** Fill `controls` for one fixed step. */
  drive(sim: SimWorld, controls: VehicleControls, dt: number): void {
    const t = this.tuning;
    const S = this.path ?? sim.track.samples;
    const m = S.length;
    const tp = sim.transforms.currPos;
    const px = tp[sim.vehicle.slot * 3] as number;
    const pz = tp[sim.vehicle.slot * 3 + 2] as number;
    const tm = sim.vehicle.telemetry;
    const speed = Math.max(0, tm.speed);

    // nearest sample: local search from the last index, with a global fallback
    let best = this.idx;
    let bestD = Infinity;
    for (let k = sim.city ? -4 : -8; k <= (sim.city ? 16 : 24); k++) {
      const i = this.at(this.idx + k, m);
      const s = S[i] as TrackSample;
      const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 40 * 40) {
      for (let i = 0; i < m; i++) {
        const s = S[i] as TrackSample;
        const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    this.idx = best;
    if (sim.city && !this.path) {
      const lane = sim.city.route.laneAtSample[best];
      if (lane !== undefined) this.visitedLanes.add(lane);
      this.tourComplete = this.visitedLanes.size === sim.city.graph.lanes.length;
    }

    // pursuit target: the sample `look` metres ahead along the track
    const look = Math.max(t.lookMin, Math.min(t.lookMax, t.lookBase + speed * t.lookPerSpeed));
    const target = S[this.at(best + Math.round(look / 3), m)] as TrackSample;
    const q = sim.transforms.currRot;
    const qi = sim.vehicle.slot * 4;
    const qx = q[qi] as number;
    const qy = q[qi + 1] as number;
    const qz = q[qi + 2] as number;
    const qw = q[qi + 3] as number;
    const yaw = Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
    const desired = Math.atan2(target.x - px, target.z - pz);
    let d = desired - yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // a positive yaw turns the nose left (+X); steer right is positive, so negate
    controls.steer = Math.max(-1, Math.min(1, -d * t.steerGain));

    // speed plan: the slowest allowed speed reachable with the assumed braking, over the road ahead
    let allowed = t.vMax;
    let dist = 0;
    for (let k = 0; dist < t.planAhead && (this.loop || best + k < m); k++) {
      const s = S[this.at(best + k, m)] as TrackSample;
      const r = 1 / Math.max(1e-4, Math.abs(s.curvature));
      const vCorner = Math.min(t.vMax, Math.sqrt(t.latAccel * r));
      const vHere = Math.sqrt(vCorner * vCorner + 2 * t.brakeAccel * dist);
      if (vHere < allowed) allowed = vHere;
      dist += 3;
    }
    controls.throttle = speed < allowed - 0.5 ? 1 : 0;
    controls.brake = speed > allowed + 1.5 ? 1 : 0;
    controls.handbrake = 0;
    controls.boost = t.boostAbove > 0 && speed > t.boostAbove && allowed >= t.vMax ? 1 : 0;
    if (sim.traffic && this.trafficAhead(sim, px, pz, yaw, speed)) {
      controls.throttle = 0;
      controls.brake = 1;
      controls.boost = 0;
    }

    // stuck: no progress while trying to drive
    if (speed < 0.8 && controls.throttle > 0) {
      this.stuckTime += dt;
      if (this.stuckTime > 2.5) {
        sim.spawnAt(sim.city ? 'city' : 'track');
        this.idx = 0;
        this.resets++;
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }
  }

  /** Brake for a slower car within 18 m ahead on the bot's heading. Never swaps. */
  private trafficAhead(sim: SimWorld, px: number, pz: number, yaw: number, speed: number): boolean {
    const traffic = sim.traffic;
    if (!traffic) return false;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] === AgentState.Free) continue;
      const dx = (traffic.x[i] as number) - px;
      const dz = (traffic.z[i] as number) - pz;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > 18) continue;
      const side = dx * -fz + dz * fx;
      if (Math.abs(side) > 2.6) continue;
      if ((traffic.speed[i] as number) < speed - 1) return true;
    }
    return false;
  }
}
