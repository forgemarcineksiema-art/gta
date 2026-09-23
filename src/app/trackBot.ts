/**
 * Track-following autopilot: pure pursuit on the track centreline with a speed
 * plan from the curvature ahead. Its lap time is a benchmark for every tuning
 * change, and its core (follow a polyline, brake for what is coming) is what the
 * road bot in the city will reuse.
 */
import type { CarId, SimWorld, TrackSample, VehicleControls } from '../sim';
import { AgentState, type Traffic } from '../sim/traffic/Traffic';

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
  /**
   * A careful driver (M5.5 gate): it brakes for a slower car over its stopping distance, waits in a queue instead
   * of taking it for a stuck car, and overtakes through an empty oncoming lane. Off by default, so the bot-driven
   * pins keep their baseline (the skilled bot's escapes need its speed); the delivery pin turns it on.
   */
  careful: boolean;
  /**
   * Backs off and goes round a car that will not move on for it (M6 gate): a careful driver always does; the cold
   * open's scripted bot turns it on. Off by default, so the other bot-driven pins keep their baseline.
   */
  unblock: boolean;
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
  careful: false,
  unblock: false,
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

/** A police car this close to a stopped bot is an arrest in progress: the bot waits it out instead of resetting (m). */
const BOXED_RANGE = 15;

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
  /** Overtaking (M5.5 gate): the lateral offset from the path (+ left), its target, and the car being passed. */
  private offset = 0;
  private pass = 0;
  private passing = -1;
  /** Blocked (M6 gate): seconds held up by a car that will not move on, seconds left backing off, the car gone round. */
  private blockedFor = 0;
  private backLeft = 0;
  private dodging = -1;
  private dodgeLeft = 0;
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
    this.offset = 0;
    this.pass = 0;
    this.passing = -1;
    this.blockedFor = 0;
    this.backLeft = 0;
    this.dodging = -1;
  }

  /** Metres left on an open path of its own; Infinity on the map's loop. */
  get pathLeft(): number {
    return this.path && !this.loop ? (this.path.length - 1 - this.idx) * 3 : Infinity;
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

    // pursuit target: the sample `look` metres ahead along the track, shifted across by an overtake's offset
    const look = Math.max(t.lookMin, Math.min(t.lookMax, t.lookBase + speed * t.lookPerSpeed));
    const target = S[this.at(best + Math.round(look / 3), m)] as TrackSample;
    const q = sim.transforms.currRot;
    const qi = sim.vehicle.slot * 4;
    const qx = q[qi] as number;
    const qy = q[qi + 1] as number;
    const qz = q[qi + 2] as number;
    const qw = q[qi + 3] as number;
    const yaw = Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
    this.offset += Math.max(-3 * dt, Math.min(3 * dt, this.pass - this.offset));
    const tx = target.x + Math.cos(target.yaw) * this.offset, tz = target.z - Math.sin(target.yaw) * this.offset;
    const desired = Math.atan2(tx - px, tz - pz);
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
    if (sim.traffic && t.careful) this.overtake(sim, S, best, px, pz, yaw, speed, allowed);
    if (sim.traffic && this.trafficAhead(sim, px, pz, yaw, speed)) {
      controls.throttle = 0;
      controls.brake = 1;
      controls.boost = 0;
    }
    // queued: a car within a few metres ahead waits (a junction, the lights): hold behind it, never push it,
    // and it is not a stuck car (a brake held at a standstill would reverse, so the car only coasts)
    const queued = t.careful && sim.traffic !== null && this.queuedBehind(sim, px, pz, yaw);
    if (queued) {
      controls.throttle = 0;
      controls.brake = speed > 0.5 ? 1 : 0;
      controls.boost = 0;
    }
    const boxed = (sim.police?.unitsWithin(px, pz, BOXED_RANGE) ?? 0) > 0;
    if (sim.traffic && (t.careful || t.unblock) && this.unblock(sim.traffic, controls, px, pz, yaw, speed, queued || boxed, dt)) return;

    // stuck: no progress while trying to drive; boxed in by the police is an arrest, not a stuck car
    if (speed < 0.8 && controls.throttle > 0 && !queued && !boxed) {
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

  /**
   * Blocked (M6 gate: a wreck the bot pushed at walking pace for a minute, a crossing car nose to nose in the middle
   * of a U-turn): held up for 1.5 s under 2 m/s by a car within 7 m ahead that will not move on for it (a dead car,
   * or one facing it), it backs off for 1.2 s with the wheel the other way, a three-point turn, then goes round it
   * 3 m to the side away from it until it is 6 m behind. A queue, and a stop the police box in, are not blocks.
   * True while it backs off (the controls are set).
   */
  private unblock(traffic: Traffic, controls: VehicleControls, px: number, pz: number, yaw: number, speed: number, waiting: boolean, dt: number): boolean {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (this.backLeft > 0) {
      this.backLeft -= dt;
      controls.throttle = 0;
      controls.brake = 1;
      controls.boost = 0;
      controls.steer = -controls.steer;
      return true;
    }
    if (this.dodging >= 0) {
      const i = this.dodging;
      this.dodgeLeft -= dt;
      const behind = traffic.state[i] === AgentState.Free || ((traffic.x[i] as number) - px) * fx + ((traffic.z[i] as number) - pz) * fz < -6;
      if (behind || this.dodgeLeft <= 0) {
        this.dodging = -1;
        this.pass = 0;
      }
    }
    let blocker = -1, side = 0;
    if (speed < 2 && !waiting) {
      for (let i = 0; i < traffic.capacity; i++) {
        const st = traffic.state[i];
        if (st === AgentState.Free) continue;
        const dx = (traffic.x[i] as number) - px, dz = (traffic.z[i] as number) - pz;
        const along = dx * fx + dz * fz, across = dx * -fz + dz * fx;
        if (along < 0.5 || along > 7 || Math.abs(across) > 2.6) continue;
        const driving = st === AgentState.Kinematic || st === AgentState.Physical;
        if (driving && Math.cos((traffic.yaw[i] as number) - yaw) > 0) continue;
        blocker = i;
        side = across;
        break;
      }
    }
    if (blocker < 0) {
      this.blockedFor = 0;
      return false;
    }
    this.blockedFor += dt;
    if (this.blockedFor < 1.5) return false;
    this.blockedFor = 0;
    this.backLeft = 1.2;
    this.passing = -1;
    this.dodging = blocker;
    this.dodgeLeft = 10;
    // round on the far side: a car on the left is passed on the right, one dead ahead or on the right on the left
    this.pass = side < -0.3 ? -3 : 3;
    return false;
  }

  /** A car within 8 m ahead in the bot's corridor, nearly stopped: the bot is in a queue behind it. */
  private queuedBehind(sim: SimWorld, px: number, pz: number, yaw: number): boolean {
    const traffic = sim.traffic;
    if (!traffic) return false;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (let i = 0; i < traffic.capacity; i++) {
      // a queue is driving cars waiting their turn; a wreck, a parked car or an abandoned one never moves on
      const st = traffic.state[i];
      if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
      const dx = (traffic.x[i] as number) - px;
      const dz = (traffic.z[i] as number) - pz;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > 8) continue;
      if (Math.abs(dx * -fz + dz * fx) > 2.2) continue;
      // a queue faces the bot's way: a car nose to nose (a U-turn in a junction) never moves on for it
      if (Math.cos((traffic.yaw[i] as number) - yaw) < 0.5) continue;
      if ((traffic.speed[i] as number) < 1.5) return true;
    }
    return false;
  }

  /**
   * Overtaking (M5.5 gate: the slice-3 drivers keep their own pace and a bot that never passes sat behind the
   * slowest for a whole street): on a straight, with a moving car ahead going 3 m/s or more under what the bot
   * may do and the oncoming lane empty 15 m back to 50 m ahead, it moves 3.8 m to its left and back once the
   * car is 6 m behind. An oncoming car in the lane ahead calls it off.
   */
  private overtake(sim: SimWorld, S: TrackSample[], best: number, px: number, pz: number, yaw: number, speed: number, allowed: number): void {
    const traffic = sim.traffic;
    if (!traffic) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const lx = fz, lz = -fx;
    const oncomingFree = (): boolean => {
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.state[i] === AgentState.Free || i === this.passing) continue;
        const dx = (traffic.x[i] as number) - px, dz = (traffic.z[i] as number) - pz;
        const along = dx * fx + dz * fz, left = dx * lx + dz * lz;
        if (along > -15 && along < 50 && left > 1.6 && left < 6.5) return false;
      }
      return true;
    };
    if (this.passing >= 0) {
      const i = this.passing;
      const gone = traffic.state[i] === AgentState.Free;
      const behind = gone || ((traffic.x[i] as number) - px) * fx + ((traffic.z[i] as number) - pz) * fz < -6;
      if (behind || !oncomingFree()) {
        this.pass = 0;
        this.passing = -1;
      }
      return;
    }
    if (Math.abs(this.offset) > 0.2 || this.dodging >= 0) return;
    // a straight ahead: no bend over the next 60 m, and not within 60 m of the path's end
    for (let k = 0; k < 20; k++) {
      const i = best + k;
      if (!this.loop && i >= S.length) return;
      if (Math.abs((S[this.at(i, S.length)] as TrackSample).curvature) > 0.01) return;
    }
    let slow = -1, slowAlong = Infinity;
    for (let i = 0; i < traffic.capacity; i++) {
      const st = traffic.state[i];
      if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
      const dx = (traffic.x[i] as number) - px, dz = (traffic.z[i] as number) - pz;
      const along = dx * fx + dz * fz;
      if (along < 3 || along > 30 || Math.abs(dx * -fz + dz * fx) > 2.2) continue;
      if ((traffic.speed[i] as number) > Math.min(allowed, speed + 2) - 3) continue;
      if (along < slowAlong) { slowAlong = along; slow = i; }
    }
    if (slow < 0 || !oncomingFree()) return;
    this.passing = slow;
    this.pass = 3.8;
  }

  /**
   * Brake for a slower car ahead on the bot's heading: within 18 m, or its braking distance and a car length at
   * speed (at 30 m/s 18 m was a ram into a car waiting at a junction). Never swaps; the car it is passing, it passes.
   */
  private trafficAhead(sim: SimWorld, px: number, pz: number, yaw: number, speed: number): boolean {
    const traffic = sim.traffic;
    if (!traffic) return false;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const reach = this.tuning.careful ? Math.max(18, (speed * speed) / (2 * this.tuning.brakeAccel) + 8) : 18;
    // the corridor follows an overtake across
    const ox = Math.cos(yaw) * this.offset, oz = -Math.sin(yaw) * this.offset;
    px += ox;
    pz += oz;
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] === AgentState.Free || i === this.passing || i === this.dodging) continue;
      const dx = (traffic.x[i] as number) - px;
      const dz = (traffic.z[i] as number) - pz;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > reach) continue;
      const side = dx * -fz + dz * fx;
      if (Math.abs(side) > 2.6) continue;
      if ((traffic.speed[i] as number) < speed - 1) return true;
    }
    return false;
  }
}
