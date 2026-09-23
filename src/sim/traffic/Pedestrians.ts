/**
 * Pedestrians on the pavements. Records in typed arrays, no colliders: a
 * pedestrian is a point on a pavement path (a lane polyline shifted onto the
 * footway on its right), walking forward or back, turning right round the
 * block corners and never crossing a carriageway. A car whose predicted path
 * sweeps over a pedestrian makes it dive sideways, get up and walk on; if a
 * car centre still comes within `guaranteeDistance`, the pedestrian hops
 * clear, so "can never be hit" holds by construction (PEGI 12 slapstick).
 * `Fist` is the pose of a driver whose car the player has just taken.
 */
import { districtAt, type City } from '../city/City';
import type { RoadGraph } from '../city/roads';
import type { EventLog } from '../events';
import * as M from '../math';
import { CITY_COLORS, PED_TINTS } from '../palette';
import { mulberry32 } from '../random';
import type { Quat } from '../scene';
import type { TransformBuffer } from '../transforms';
import { AgentState, type PlayerProbe, type Traffic } from './Traffic';
import type { LanePose, LaneProjection } from './lanes';
import { PEDS, type PedTuning } from './tuning';

export enum PedPose { Walk = 0, Dive = 1, GetUp = 2, Fist = 3, Hail = 4 }
/** The four silhouettes (M5.5 slice 20; render/pedMesh.ts draws them). Appended, never renumbered. */
export enum PedLook { Coat = 0, Bag = 1, Worker = 2, Old = 3 }
export const PED_LOOKS = 4;
/** A place with no palette of its own dresses in the chalk of the city's facades. */
const ANY_TINTS: readonly number[] = [CITY_COLORS.chalk];
/** Metres of walking per full stride (two steps): the gait's phase runs 2π over it. */
export const STRIDE = 1.4;
/** Chance to turn round at a corner instead of continuing round the block. */
const TURN_AROUND = 0.3;
const CORNER_REACH = 40;
/** Half width of the footway strip, m; the path runs down its middle. */
const PAVEMENT_HALF = 2.25;
/** A pedestrian off its line (after a dive) walks back onto it at this rate on top of its walk, m/s. */
const RETURN_SPEED = 1.5;
/** Look-ahead applies to cars faster than this, m/s. */
const CAR_MIN_SPEED = 3;

export class Pedestrians {
  readonly tuning: PedTuning;
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly slot: Int16Array;
  readonly lane: Int16Array;
  /** +1 walks along the lane direction, -1 against it. */
  readonly dir: Int8Array;
  readonly s: Float32Array;
  readonly speed: Float32Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly pose: Uint8Array;
  readonly poseFor: Float32Array;
  readonly tint: Uint32Array;
  /** The silhouette (PedLook), drawn with the tint at spawn by the district. */
  readonly look: Uint8Array;
  /** Metres walked, for the walk cycle's phase (the body's bob here, the limbs' swing in the view). */
  readonly gait: Float32Array;
  /** Bumps when a tint is assigned so the view reuploads instance colours. */
  tintSerial = 0;
  /** Last-resort hops (a car centre inside `guaranteeDistance`). */
  guaranteeHops = 0;
  /** Dives triggered by the player this step (Life pays boost for them). */
  dodgesThisStep = 0;
  /** Test hook: disable the dive so the guarantee alone must keep pedestrians clear. */
  dodgeEnabled = true;

  private readonly transforms: TransformBuffer;
  private readonly target: number;
  private readonly rng: () => number;
  private readonly graph: RoadGraph;
  private readonly lanes: Traffic['lanes'];
  /** Pavement offset per lane (metres right of the lane polyline), or NaN when the lane has no footway. */
  private readonly pavement: Float32Array;
  private readonly walkable: Int16Array;
  private readonly incomingStart: Int32Array;
  private readonly incoming: Int16Array;
  private readonly diveX: Float32Array;
  private readonly diveZ: Float32Array;
  private readonly scored: Uint8Array;
  private readonly pose3: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly q: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly q2: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly q3: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private time = 0;

  constructor(transforms: TransformBuffer, city: City, lanes: Traffic['lanes'], seed: number, tuning: PedTuning = PEDS, density = 1) {
    this.transforms = transforms;
    this.tuning = tuning;
    this.graph = city.graph;
    this.lanes = lanes;
    this.capacity = tuning.count;
    this.target = Math.max(0, Math.min(this.capacity, Math.round(tuning.count * density)));
    this.rng = mulberry32(seed ^ 0x9ed5);
    const n = this.capacity;
    this.active = new Uint8Array(n);
    this.slot = new Int16Array(n);
    this.lane = new Int16Array(n).fill(-1);
    this.dir = new Int8Array(n).fill(1);
    this.s = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.pose = new Uint8Array(n);
    this.poseFor = new Float32Array(n);
    this.tint = new Uint32Array(n);
    this.look = new Uint8Array(n);
    this.gait = new Float32Array(n);
    this.diveX = new Float32Array(n);
    this.diveZ = new Float32Array(n);
    this.scored = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.slot[i] = transforms.allocate();
    // pavement offsets and the walkable lane list
    const laneCount = this.graph.lanes.length;
    this.pavement = new Float32Array(laneCount);
    const walkable: number[] = [];
    for (let l = 0; l < laneCount; l++) {
      const offset = this.pavementOffset(l);
      this.pavement[l] = offset;
      if (!Number.isNaN(offset)) walkable.push(l);
    }
    this.walkable = Int16Array.from(walkable);
    // incoming lanes per node (for walking back round a corner)
    const nodes = this.graph.nodes.length;
    const counts = new Int32Array(nodes);
    for (let l = 0; l < laneCount; l++) {
      const to = this.graph.lanes[l]?.to ?? 0;
      counts[to] = (counts[to] as number) + 1;
    }
    this.incomingStart = new Int32Array(nodes + 1);
    for (let k = 0; k < nodes; k++) this.incomingStart[k + 1] = (this.incomingStart[k] as number) + (counts[k] as number);
    this.incoming = new Int16Array(laneCount);
    const fill = new Int32Array(nodes);
    for (let l = 0; l < laneCount; l++) {
      const to = this.graph.lanes[l]?.to ?? 0;
      this.incoming[(this.incomingStart[to] as number) + (fill[to] as number)] = l;
      fill[to] = (fill[to] as number) + 1;
    }
    for (let i = 0; i < n; i++) transforms.writeBoth(this.slot[i] as number, 0, -50, 0, 0, 0, 0, 1);
  }

  /** Metres right of the lane polyline to the middle of its footway; NaN on the highway's outer side. */
  private pavementOffset(lane: number): number {
    const l = this.graph.lanes[lane];
    if (!l) return NaN;
    let roadHalf = 12;
    let laneOffset = 4.5;
    if (l.highway) {
      roadHalf = 19;
      laneOffset = 6;
      // only the side that faces the island: the outer verge is parkland
      const mid = l.points[l.points.length >> 1] ?? l.points[0];
      if (!mid) return NaN;
      const rx = -Math.cos(l.yaw);
      const rz = Math.sin(l.yaw);
      if (rx * -mid.x + rz * -mid.z <= 0) return NaN;
    } else if (l.special) {
      for (const road of this.graph.special) {
        if (road.name !== l.special) continue;
        roadHalf = road.halfWidth;
        laneOffset = Math.min(4.5, road.halfWidth - 3.5);
      }
    }
    return roadHalf + PAVEMENT_HALF - laneOffset;
  }

  count(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.active[i]) n++;
    return n;
  }

  /** Test and swap hook. Without a lane the pedestrian finds the nearest footway once it walks. */
  spawnAt(x: number, z: number, yaw: number, pose: PedPose = PedPose.Walk): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.active[i] = 1;
    this.lane[i] = -1;
    this.dir[i] = 1;
    this.s[i] = 0;
    this.x[i] = x;
    this.z[i] = z;
    this.yaw[i] = yaw;
    this.speed[i] = this.walkSpeed();
    this.pose[i] = pose;
    this.poseFor[i] = 0;
    this.scored[i] = 0;
    this.dress(i);
    if (pose === PedPose.Walk) this.attach(i);
    this.writeOne(i, true);
    return i;
  }

  /** The seconds the crowd has run (the fist's shake in the view). */
  get clock(): number {
    return this.time;
  }

  /** A fare (M5.5 slice 13): the walker stops and hails, facing `yaw` (the taxi). */
  hail(i: number, yaw: number): void {
    if (!this.active[i]) return;
    this.pose[i] = PedPose.Hail;
    this.poseFor[i] = 0;
    this.yaw[i] = yaw;
  }

  /** The arm goes down: walking on. */
  unhail(i: number): void {
    if (this.pose[i] !== PedPose.Hail) return;
    this.pose[i] = PedPose.Walk;
    this.poseFor[i] = 0;
  }

  /** In the taxi: gone from the pavement. */
  pickUp(i: number): void {
    this.active[i] = 0;
    this.writeOne(i, true);
  }

  /** A silhouette and clothes for where the pedestrian stands: the district's shares and palette. */
  private dress(i: number): void {
    const district = districtAt(this.x[i] as number, this.z[i] as number).id;
    const shares = this.tuning.looks[district] ?? [0.25, 0.25, 0.25, 0.25];
    let u = this.rng() * (shares[0] + shares[1] + shares[2] + shares[3]), look = 0;
    while (look < PED_LOOKS - 1 && u >= (shares[look] as number)) { u -= shares[look] as number; look++; }
    this.look[i] = look;
    const tints = PED_TINTS[district] ?? ANY_TINTS;
    this.tint[i] = tints[(this.rng() * tints.length) | 0] as number;
    this.gait[i] = this.rng() * STRIDE;
    this.tintSerial++;
  }

  /** True if any active pedestrian's centre is inside the player's chassis footprint. */
  overlapsPlayer(player: PlayerProbe): boolean {
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      const along = dx * fx + dz * fz;
      const side = dx * -fz + dz * fx;
      if (Math.abs(along) <= player.halfLength && Math.abs(side) <= player.halfWidth) return true;
    }
    return false;
  }

  step(player: PlayerProbe, traffic: Traffic | null, dt: number, events: EventLog): void {
    this.time += dt;
    this.dodgesThisStep = 0;
    this.despawn(player);
    this.spawn(player);
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const pose = this.pose[i];
      if (pose === PedPose.Walk) this.walk(i, dt);
      else if (pose === PedPose.Dive) this.dive(i, dt);
      else if (pose === PedPose.GetUp) this.getUp(i, dt);
      else if (pose === PedPose.Hail) this.poseFor[i] = (this.poseFor[i] as number) + dt;
      else this.fist(i, dt);
    }
    for (let i = 0; i < this.capacity; i++) {
      const pose = this.pose[i];
      if (this.active[i] && (pose === PedPose.Dive || pose === PedPose.GetUp)) this.tryScore(i, player, events);
    }
    if (this.dodgeEnabled) {
      this.dodgeFrom(player.x, player.z, player.vx, player.vz, true, player, events);
      if (traffic) {
        for (let a = 0; a < traffic.capacity; a++) {
          const st = traffic.state[a];
          if ((st !== AgentState.Physical && st !== AgentState.Disturbed) || !traffic.hasBody(a)) continue;
          const yaw = traffic.yaw[a] as number;
          const speed = traffic.speed[a] as number;
          this.dodgeFrom(traffic.x[a] as number, traffic.z[a] as number, Math.sin(yaw) * speed, Math.cos(yaw) * speed, false, player, events);
        }
      }
    }
    this.guarantee(player.x, player.z, player.vx, player.vz, player.yaw, player.halfWidth, player.halfLength);
    if (traffic) {
      for (let a = 0; a < traffic.capacity; a++) {
        if (traffic.state[a] === AgentState.Free || !traffic.hasBody(a)) continue;
        const yaw = traffic.yaw[a] as number;
        const speed = traffic.speed[a] as number;
        this.guarantee(traffic.x[a] as number, traffic.z[a] as number, Math.sin(yaw) * speed, Math.cos(yaw) * speed, yaw, traffic.halfWidthOf(a), traffic.halfLengthOf(a));
      }
    }
  }

  writeTransforms(): void {
    for (let i = 0; i < this.capacity; i++) this.writeOne(i, false);
  }

  private writeOne(i: number, both: boolean): void {
    const slot = this.slot[i] as number;
    const tb = this.transforms;
    if (!this.active[i]) {
      tb.writeBoth(slot, 0, -50, 0, 0, 0, 0, 1);
      return;
    }
    const pose = this.pose[i];
    let y = 0;
    let pitch = 0;
    let roll = 0;
    // highest with the legs together, lowest at the full stride
    if (pose === PedPose.Walk) y = (1 - Math.abs(Math.sin((this.gait[i] as number) * (Math.PI * 2 / STRIDE)))) * 0.04;
    else if (pose === PedPose.Dive) pitch = Math.min(1, (this.poseFor[i] as number) / 0.25) * 70 * M.DEG;
    else if (pose === PedPose.GetUp) pitch = Math.max(0, 1 - (this.poseFor[i] as number) / this.tuning.getUpTime) * 70 * M.DEG;
    else { roll = Math.sin(this.time * 25) * 8 * M.DEG; y = Math.abs(Math.sin(this.time * 12.5)) * 0.1; }
    M.quatSetAxisAngle(this.q, 0, 1, 0, this.yaw[i] as number);
    M.quatSetAxisAngle(this.q2, 1, 0, 0, pitch);
    M.quatMul(this.q3, this.q, this.q2);
    if (roll !== 0) {
      M.quatSetAxisAngle(this.q2, 0, 0, 1, roll);
      M.quatMul(this.q3, this.q3, this.q2);
    }
    const q = this.q3;
    if (both) tb.writeBoth(slot, this.x[i] as number, y, this.z[i] as number, q.x, q.y, q.z, q.w);
    else tb.write(slot, this.x[i] as number, y, this.z[i] as number, q.x, q.y, q.z, q.w);
  }

  // ---- walking ----------------------------------------------------------------

  private walk(i: number, dt: number): void {
    if ((this.lane[i] as number) < 0) this.attach(i);
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    const len = this.lanes.length[lane] as number;
    this.gait[i] = (this.gait[i] as number) + (this.speed[i] as number) * dt;
    let s = (this.s[i] as number) + (this.dir[i] as number) * (this.speed[i] as number) * dt;
    if (s > len || s < 0) {
      this.corner(i, s > len);
      s = Math.max(0, Math.min(len, this.s[i] as number));
    }
    this.s[i] = s;
    this.lanes.positionAt(this.lane[i] as number, s, this.pavement[this.lane[i] as number] as number, this.pose3);
    // converge onto the footway line (after a dive the pedestrian is off it)
    const dx = this.pose3.x - (this.x[i] as number);
    const dz = this.pose3.z - (this.z[i] as number);
    const d = Math.hypot(dx, dz);
    const step = ((this.speed[i] as number) + RETURN_SPEED) * dt;
    if (d <= step) {
      this.x[i] = this.pose3.x;
      this.z[i] = this.pose3.z;
    } else {
      this.x[i] = (this.x[i] as number) + dx / d * step;
      this.z[i] = (this.z[i] as number) + dz / d * step;
    }
    const facing = d > 0.5 ? Math.atan2(dx, dz) : ((this.dir[i] as number) > 0 ? this.pose3.yaw : this.pose3.yaw + Math.PI);
    this.yaw[i] = facing;
  }

  /** At a corner: continue round the block (the nearest footway on the same side) or turn round. */
  private corner(i: number, forward: boolean): void {
    const lane = this.lane[i] as number;
    if (this.rng() < TURN_AROUND) {
      this.dir[i] = -(this.dir[i] as number);
      this.s[i] = forward ? this.lanes.length[lane] as number : 0;
      return;
    }
    const l = this.graph.lanes[lane];
    if (!l) return;
    const x = this.x[i] as number;
    const z = this.z[i] as number;
    let best = CORNER_REACH * CORNER_REACH;
    let pick = -1;
    if (forward) {
      const outs = this.graph.nodes[l.to]?.outgoing ?? [];
      for (const c of outs) {
        const off = this.pavement[c] as number;
        if (Number.isNaN(off) || c === lane) continue;
        this.lanes.positionAt(c, 0, off, this.pose3);
        const d = (this.pose3.x - x) ** 2 + (this.pose3.z - z) ** 2;
        if (d < best) { best = d; pick = c; }
      }
      if (pick >= 0) { this.lane[i] = pick; this.s[i] = 0; return; }
    } else {
      const from = l.from;
      const start = this.incomingStart[from] as number;
      const end = this.incomingStart[from + 1] as number;
      for (let k = start; k < end; k++) {
        const c = this.incoming[k] as number;
        const off = this.pavement[c] as number;
        if (Number.isNaN(off) || c === lane) continue;
        this.lanes.positionAt(c, this.lanes.length[c] as number, off, this.pose3);
        const d = (this.pose3.x - x) ** 2 + (this.pose3.z - z) ** 2;
        if (d < best) { best = d; pick = c; }
      }
      if (pick >= 0) { this.lane[i] = pick; this.s[i] = this.lanes.length[pick] as number; return; }
    }
    // no footway continues here: walk back
    this.dir[i] = -(this.dir[i] as number);
    this.s[i] = forward ? this.lanes.length[lane] as number : 0;
  }

  /** Bind a pedestrian without a lane to the nearest footway line. */
  private attach(i: number): void {
    const x = this.x[i] as number;
    const z = this.z[i] as number;
    let best = Infinity;
    let pick = -1;
    let bestS = 0;
    for (let k = 0; k < this.walkable.length; k++) {
      const l = this.walkable[k] as number;
      this.lanes.project(l, x, z, this.proj, this.pavement[l]);
      if (this.proj.dist < best) { best = this.proj.dist; pick = l; bestS = this.proj.s; }
    }
    if (pick < 0) return;
    this.lane[i] = pick;
    this.s[i] = bestS;
    this.dir[i] = this.rng() < 0.5 ? 1 : -1;
  }

  // ---- dodging ------------------------------------------------------------------

  private dodgeFrom(cx: number, cz: number, vx: number, vz: number, isPlayer: boolean, player: PlayerProbe, events: EventLog): void {
    const t = this.tuning;
    const speed = Math.hypot(vx, vz);
    if (speed < CAR_MIN_SPEED) return;
    const ex = cx + vx * t.lookAhead;
    const ez = cz + vz * t.lookAhead;
    const sx = ex - cx;
    const sz = ez - cz;
    const len2 = sx * sx + sz * sz;
    const nx = -vz / speed;
    const nz = vx / speed;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i] || this.pose[i] !== PedPose.Walk) continue;
      const dx = (this.x[i] as number) - cx;
      const dz = (this.z[i] as number) - cz;
      const along = (dx * sx + dz * sz) / len2;
      if (along < 0 || along > 1) continue;
      const px = cx + sx * along;
      const pz = cz + sz * along;
      const off = Math.hypot((this.x[i] as number) - px, (this.z[i] as number) - pz);
      if (off > t.corridorHalfWidth) continue;
      // dive to the side the pedestrian is already on, away from the car's line
      const side = dx * nx + dz * nz >= 0 ? 1 : -1;
      this.diveX[i] = nx * side;
      this.diveZ[i] = nz * side;
      this.pose[i] = PedPose.Dive;
      this.poseFor[i] = 0;
      this.scored[i] = 0;
      this.yaw[i] = Math.atan2(this.diveX[i] as number, this.diveZ[i] as number);
      if (isPlayer) this.tryScore(i, player, events);
    }
  }

  private dive(i: number, dt: number): void {
    const t = this.tuning;
    this.x[i] = (this.x[i] as number) + (this.diveX[i] as number) * t.diveSpeed * dt;
    this.z[i] = (this.z[i] as number) + (this.diveZ[i] as number) * t.diveSpeed * dt;
    this.poseFor[i] = (this.poseFor[i] as number) + dt;
    if ((this.poseFor[i]) >= t.diveTime) {
      this.pose[i] = PedPose.GetUp;
      this.poseFor[i] = 0;
    }
  }

  private getUp(i: number, dt: number): void {
    this.poseFor[i] = (this.poseFor[i] as number) + dt;
    if ((this.poseFor[i]) >= this.tuning.getUpTime) {
      this.pose[i] = PedPose.Walk;
      this.poseFor[i] = 0;
    }
  }

  private fist(i: number, dt: number): void {
    this.poseFor[i] = (this.poseFor[i] as number) + dt;
    if ((this.poseFor[i]) >= this.tuning.fistTime) {
      this.pose[i] = PedPose.Walk;
      this.poseFor[i] = 0;
      this.lane[i] = -1;
    }
  }

  /** A diver the player's car passes within `scoreDistance` of its footprint scores once. Called on the dive and while down. */
  private tryScore(i: number, player: PlayerProbe, events: EventLog): void {
    if (this.scored[i]) return;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    const dx = (this.x[i] as number) - player.x;
    const dz = (this.z[i] as number) - player.z;
    const along = Math.max(0, Math.abs(dx * fx + dz * fz) - player.halfLength);
    const side = Math.max(0, Math.abs(dx * -fz + dz * fx) - player.halfWidth);
    if (Math.hypot(along, side) > this.tuning.scoreDistance) return;
    this.scored[i] = 1;
    this.dodgesThisStep++;
    events.push('nearMissPed', 0, this.x[i] as number, 0, this.z[i] as number, i);
  }

  /** Last resort: a pedestrian inside a car's footprint grown by `guaranteeDistance` hops `hopDistance` clear of its side. */
  private guarantee(cx: number, cz: number, vx: number, vz: number, yaw: number, halfWidth: number, halfLength: number): void {
    const t = this.tuning;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    const reachAlong = halfLength + t.guaranteeDistance;
    const reachSide = halfWidth + t.guaranteeDistance;
    void vx; void vz;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const dx = (this.x[i] as number) - cx;
      const dz = (this.z[i] as number) - cz;
      const along = dx * fx + dz * fz;
      const side = dx * rx + dz * rz;
      if (Math.abs(along) > reachAlong || Math.abs(side) > reachSide) continue;
      const dir = side >= 0 ? 1 : -1;
      // clear of the car's flank, plus the hop
      const target = dir * (reachSide + t.hopDistance);
      this.x[i] = (this.x[i] as number) + rx * (target - side);
      this.z[i] = (this.z[i] as number) + rz * (target - side);
      this.guaranteeHops++;
      if (this.pose[i] === PedPose.Walk) {
        this.pose[i] = PedPose.GetUp;
        this.poseFor[i] = 0;
      }
    }
  }

  // ---- pool -----------------------------------------------------------------------

  private findFree(): number {
    for (let i = 0; i < this.capacity; i++) if (!this.active[i]) return i;
    return -1;
  }

  private walkSpeed(): number {
    const [lo, hi] = this.tuning.walkSpeed;
    return lo + this.rng() * (hi - lo);
  }

  private despawn(player: PlayerProbe): void {
    const r2 = this.tuning.despawn * this.tuning.despawn;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      if (dx * dx + dz * dz > r2) this.active[i] = 0;
    }
  }

  private spawn(player: PlayerProbe): void {
    const t = this.tuning;
    let alive = this.count();
    for (let n = 0; n < 4 && alive < this.target; n++) {
      const lane = this.walkable[(this.rng() * this.walkable.length) | 0] as number;
      const s = this.rng() * (this.lanes.length[lane] as number);
      this.lanes.positionAt(lane, s, this.pavement[lane] as number, this.pose3);
      const dx = this.pose3.x - player.x;
      const dz = this.pose3.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < t.spawnMin || dist > t.spawnMax) continue;
      const behind = dx * player.vx + dz * player.vz < 0;
      if (!behind && dist < 160) continue;
      const i = this.findFree();
      if (i < 0) return;
      this.active[i] = 1;
      this.lane[i] = lane;
      this.dir[i] = this.rng() < 0.5 ? 1 : -1;
      this.s[i] = s;
      this.x[i] = this.pose3.x;
      this.z[i] = this.pose3.z;
      this.yaw[i] = this.dir[i] > 0 ? this.pose3.yaw : this.pose3.yaw + Math.PI;
      this.speed[i] = this.walkSpeed();
      this.pose[i] = PedPose.Walk;
      this.poseFor[i] = 0;
      this.scored[i] = 0;
      this.dress(i);
      this.writeOne(i, true);
      alive++;
    }
  }
}
