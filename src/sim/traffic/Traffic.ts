/**
 * Pooled traffic on the road graph with simulation LOD.
 *
 * Every agent is a record in typed arrays that follows a lane polyline and a
 * cached junction curve. The agents nearest the player borrow one of a small
 * pool of Rapier dynamic bodies: the body is steered along the same path with
 * velocity control (so a hit displaces it and the contact impulse reaches the
 * player's chassis), goes fully physical while disturbed, and either settles
 * back onto its lane or becomes a wreck. Path following (progress along lane
 * and connection, junction reservations, gaps to the leader and to the
 * player) is one code path for kinematic and lent agents.
 *
 * Junctions: a movement reserves one of four holder slots at its node; two
 * movements may hold the same node when their curves stay apart (they do not
 * conflict). Straight-through highway traffic never reserves; side streets
 * wait for a gap in it. A car that has waited `junctionWait` enters anyway
 * and keeps that right until it has left the node, so nothing deadlocks.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUP_DEFAULT, GROUP_TERRAIN, GROUPS_SOLID, interactionGroups } from '../collision';
import type { City } from '../city/City';
import type { RoadNode } from '../city/roads';
import type { EventLog } from '../events';
import * as M from '../math';
import { CITY_COLORS, PALETTE } from '../palette';
import { mulberry32 } from '../random';
import type { Quat } from '../scene';
import type { TransformBuffer } from '../transforms';
import { CAR_PRESETS, type CarId } from '../vehicle/presets';
import { LaneTables, type LanePose, type PathProjection } from './lanes';
import { TRAFFIC, type TrafficTuning } from './tuning';

export enum AgentState { Free = 0, Kinematic = 1, Physical = 2, Disturbed = 3, Wrecked = 4, Abandoned = 5 }

export interface PlayerProbe {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  speed: number;
  halfWidth: number;
  halfLength: number;
}

const KINDS: CarId[] = ['muscle', 'compact', 'heavy', 'sports', 'police'];
const KIND_INDEX: Record<CarId, number> = { muscle: 0, compact: 1, heavy: 2, sports: 3, police: 4 };
/** The player's paint per class (docs/STYLE.md): what an abandoned player car keeps. */
export const PLAYER_PAINT: Record<CarId, number> = {
  muscle: PALETTE.carRed, compact: PALETTE.carBlue, heavy: PALETTE.carOrange,
  sports: PALETTE.carLime, police: PALETTE.policeWhite,
};

export interface SwapHandover {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  kind: CarId;
}
const PAINTS = [
  PALETTE.carLime, PALETTE.carBlue, PALETTE.carOrange, PALETTE.carMagenta,
  PALETTE.carWhite, PALETTE.carBlack, CITY_COLORS.mint, CITY_COLORS.peach,
];
/** Centre spacing subtracted when one agent follows another on a lane. */
const CAR_GAP = 4.5;
/** Metres past the stop line a car may creep and still count as waiting at it. */
const STOP_TOLERANCE = 1.5;
const MAX_ON_LANE = 48;
/** Reservation slots per junction node. */
const HOLDERS = 4;
const WOBBLE_RAD = 5 * Math.PI / 180;
/** Look-ahead of the velocity controller along the path, m. */
const CARROT = 8;
/** Driving cars ignore the ground; a disturbed or wrecked car is switched onto GROUPS_SOLID so it can tumble and rest. */
const GROUPS_TRAFFIC = interactionGroups(GROUP_DEFAULT, 0xffff & ~GROUP_TERRAIN);
const ZERO = { x: 0, y: 0, z: 0 };

export class Traffic {
  readonly tuning: TrafficTuning;
  readonly capacity: number;
  readonly lanes: LaneTables;
  readonly state: Uint8Array;
  readonly kind: Uint8Array;
  /** Pursuit membership, independent of car class; retained on a police wreck until free or swap. */
  readonly police: Uint8Array;
  readonly paint: Uint32Array;
  readonly slot: Int16Array;
  readonly lane: Int16Array;
  readonly next: Int16Array;
  /** Distance along the lane; past the lane length it runs along the connection to `next`. */
  readonly s: Float32Array;
  readonly laneOffset: Float32Array;
  readonly speed: Float32Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly disturbedFor: Float32Array;
  readonly wreckedFor: Float32Array;
  readonly lastPlayerContactTick: Int32Array;
  readonly honkCooldown: Float32Array;
  /** Speed change (m/s) the lent body took from contacts this step; 0 without a body. Diagnostics and tests. */
  readonly contactDv: Float32Array;
  /** What bounded the agent's desired speed this step: 0 nothing, 1 leader, 2 player, 3 car ahead, 4 junction wait. */
  readonly blocker: Uint8Array;
  /** Speed change (m/s) a lent body took this step from the player's chassis, from fixed solids (walls, buildings) and from other cars. */
  readonly playerDv: Float32Array;
  readonly wallDv: Float32Array;
  readonly trafficDv: Float32Array;
  /** A lent body's speed before this step's physics: closing speeds are measured before the impact. */
  readonly prevSpeed: Float32Array;
  /** Collider handle of the player's chassis, so contacts can be attributed. The world refreshes it every step. */
  playerColliderHandle = -1;
  /** Bumps when paint or tint changes so the view reuploads instance colours. */
  paintSerial = 0;
  /** Agents that gave up waiting and entered a junction anyway. */
  waitedPast = 0;
  /** Wrecks towed away since the run began. */
  towedAway = 0;
  guardHops = 0;

  private readonly transforms: TransformBuffer;
  private readonly target: number;
  private readonly rng: () => number;
  private readonly nodes: RoadNode[];
  private readonly nodeHolders: Int32Array;
  private readonly nodeHoldFor: Float32Array;
  private readonly wait: Float32Array;
  private readonly forced: Uint8Array;
  private readonly wobble: Float32Array;
  private readonly turn: Uint8Array;
  private readonly laneFill: Uint8Array;
  private readonly laneIndex: Int16Array;
  private readonly halfW: Float32Array;
  private readonly halfL: Float32Array;
  private readonly colliderAgent = new Map<number, number>();
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly proj: PathProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0, switched: false };
  private readonly scratchQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly world: RAPIER.World;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly bodyCollider: RAPIER.Collider[] = [];
  private readonly bodyAgent: Int16Array;
  private readonly bodyKind: Int8Array;
  private readonly agentBody: Int16Array;
  private readonly reattachLeft: Float32Array;
  private readonly plannerLane: Int16Array;
  private readonly plannerNext: Int16Array;
  private readonly plannerSpeed: Float32Array;
  private readonly ramX: Float32Array;
  private readonly ramZ: Float32Array;
  private readonly ramSpeed: Float32Array;
  private readonly ramAccel: Float32Array;
  private readonly lin = { x: 0, y: 0, z: 0 };
  private readonly ang = { x: 0, y: 0, z: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  private contactSum = 0;
  private pairSum = 0;
  private playerSum = 0;
  private wallSum = 0;
  private trafficSum = 0;
  private currentCol: RAPIER.Collider | null = null;
  private readonly onTrafficManifold = (m: RAPIER.TempContactManifold, _flipped: boolean): void => {
    const n = m.numContacts();
    for (let i = 0; i < n; i++) this.pairSum += m.contactImpulse(i);
  };
  private readonly onTrafficPair = (other: RAPIER.Collider): void => {
    const parent = other.parent();
    const fixed = parent === null || parent.isFixed();
    // The ground and kerbs support the car every step. Only a chassis, a wall or another car counts.
    if (fixed && other.restitution() < 0.99) return;
    const col = this.currentCol;
    if (!col) return;
    this.pairSum = 0;
    this.world.contactPair(col, other, this.onTrafficManifold);
    this.contactSum += this.pairSum;
    if (other.handle === this.playerColliderHandle) this.playerSum += this.pairSum;
    else if (fixed) this.wallSum += this.pairSum;
    else if (this.colliderAgent.has(other.handle)) this.trafficSum += this.pairSum;
  };

  constructor(world: RAPIER.World, transforms: TransformBuffer, city: City, seed: number, tuning: TrafficTuning = TRAFFIC, density = 1) {
    this.world = world;
    this.transforms = transforms;
    this.tuning = tuning;
    this.capacity = tuning.agents;
    this.target = Math.max(0, Math.min(this.capacity, Math.round(tuning.agents * density)));
    this.lanes = new LaneTables(city.graph, tuning);
    this.nodes = city.graph.nodes;
    this.rng = mulberry32(seed ^ 0x7a11);
    const n = this.capacity;
    this.state = new Uint8Array(n);
    this.kind = new Uint8Array(n);
    this.police = new Uint8Array(n);
    this.paint = new Uint32Array(n);
    this.slot = new Int16Array(n);
    this.lane = new Int16Array(n);
    this.next = new Int16Array(n);
    this.s = new Float32Array(n);
    this.laneOffset = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.disturbedFor = new Float32Array(n);
    this.wreckedFor = new Float32Array(n);
    this.lastPlayerContactTick = new Int32Array(n);
    this.honkCooldown = new Float32Array(n);
    this.wait = new Float32Array(n);
    this.forced = new Uint8Array(n);
    this.contactDv = new Float32Array(n);
    this.blocker = new Uint8Array(n);
    this.playerDv = new Float32Array(n);
    this.wallDv = new Float32Array(n);
    this.trafficDv = new Float32Array(n);
    this.prevSpeed = new Float32Array(n);
    this.wobble = new Float32Array(n);
    this.turn = new Uint8Array(n);
    this.laneFill = new Uint8Array(this.lanes.laneCount);
    this.laneIndex = new Int16Array(this.lanes.laneCount * MAX_ON_LANE);
    this.nodeHolders = new Int32Array(this.nodes.length * HOLDERS);
    this.nodeHoldFor = new Float32Array(this.nodes.length * HOLDERS);
    this.nodeHolders.fill(-1);
    this.next.fill(-1);
    this.lane.fill(-1);
    this.lastPlayerContactTick.fill(-100000);
    this.halfW = new Float32Array(KINDS.length);
    this.halfL = new Float32Array(KINDS.length);
    for (let k = 0; k < KINDS.length; k++) {
      const id = KINDS[k] as CarId;
      this.halfW[k] = CAR_PRESETS[id].chassisHalfExtents.x;
      this.halfL[k] = CAR_PRESETS[id].chassisHalfExtents.z;
    }
    for (let i = 0; i < n; i++) this.slot[i] = transforms.allocate();
    this.agentBody = new Int16Array(n);
    this.reattachLeft = new Float32Array(n);
    this.agentBody.fill(-1);
    this.plannerLane = new Int16Array(n);
    this.plannerNext = new Int16Array(n);
    this.plannerSpeed = new Float32Array(n);
    this.ramX = new Float32Array(n);
    this.ramZ = new Float32Array(n);
    this.ramSpeed = new Float32Array(n);
    this.ramAccel = new Float32Array(n);
    this.plannerLane.fill(-1);
    this.plannerNext.fill(-1);
    this.bodyAgent = new Int16Array(tuning.physicsBodies);
    this.bodyAgent.fill(-1);
    this.bodyKind = new Int8Array(tuning.physicsBodies);
    this.bodyKind.fill(-1);
    for (let b = 0; b < tuning.physicsBodies; b++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, -50, 0)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(tuning.linearDamping)
        .setAngularDamping(tuning.angularDamping));
      body.setEnabled(false);
      const col = world.createCollider(this.colliderDesc(0), body);
      this.bodies.push(body);
      this.bodyCollider.push(col);
    }
  }

  private colliderDesc(kind: number): RAPIER.ColliderDesc {
    const id = KINDS[kind] as CarId;
    const he = CAR_PRESETS[id].chassisHalfExtents;
    const mass = this.tuning.mass[id];
    // Tall enough to meet the player's chassis. The body origin stays on the road for the mesh.
    const hy = 0.7;
    const w = he.x * 2;
    const h = hy * 2;
    const l = he.z * 2;
    return RAPIER.ColliderDesc.cuboid(he.x, hy, he.z)
      .setTranslation(0, hy, 0)
      // Min wins over the ground's 1.0: a shoved car slides on its tyres, not like a crate
      .setFriction(this.tuning.friction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(this.tuning.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setCollisionGroups(GROUPS_TRAFFIC)
      .setMassProperties(mass, { x: 0, y: 0.35, z: 0 }, {
        x: (mass / 12) * (h * h + l * l),
        y: (mass / 12) * (w * w + l * l),
        z: (mass / 12) * (w * w + h * h),
      }, { x: 0, y: 0, z: 0, w: 1 });
  }

  count(state: AgentState): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.state[i] === state) n++;
    return n;
  }

  kindOf(agent: number): CarId {
    return KINDS[this.kind[agent] as number] as CarId;
  }

  halfWidthOf(agent: number): number {
    return this.halfW[this.kind[agent] as number] as number;
  }

  halfLengthOf(agent: number): number {
    return this.halfL[this.kind[agent] as number] as number;
  }

  /** True when the agent currently owns a Rapier body. */
  hasBody(agent: number): boolean {
    return (this.agentBody[agent] as number) >= 0;
  }

  /** Yaw rate of the agent's lent body (rad/s), 0 without a body. Tests and the review harness. */
  bodyYawRate(agent: number): number {
    const slot = this.agentBody[agent] as number;
    if (slot < 0) return 0;
    (this.bodies[slot] as RAPIER.RigidBody).angvel(this.ang);
    return this.ang.y;
  }

  /** Seconds the agent has been waiting at a junction, 0 when not waiting. */
  waiting(agent: number): number {
    return this.wait[agent] as number;
  }

  /** World-up component of the lent body's up axis (1 level, 0 on its side, -1 on its roof); 1 without a body. */
  upOf(agent: number): number {
    const slot = this.agentBody[agent] as number;
    if (slot < 0) return 1;
    const r = (this.bodies[slot] as RAPIER.RigidBody).rotation(this.rot);
    return 1 - 2 * (r.x * r.x + r.z * r.z);
  }

  agentForCollider(handle: number): number {
    return this.colliderAgent.get(handle) ?? -1;
  }

  nearest(x: number, z: number, radius: number): number {
    let best = -1;
    let bestD = radius * radius;
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free) continue;
      const dx = (this.x[i] as number) - x;
      const dz = (this.z[i] as number) - z;
      const d = dx * dx + dz * dz;
      if (d <= bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Test hook: yaw the agent (and its lent body) without moving it. */
  setFacing(agent: number, yaw: number): void {
    this.yaw[agent] = yaw;
    const slot = this.agentBody[agent] as number;
    if (slot < 0) return;
    const body = this.bodies[slot] as RAPIER.RigidBody;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    body.setRotation(q, true);
    body.setLinvel(ZERO, true);
    body.setAngvel(ZERO, true);
  }

  /** Test and e2e hook: deterministic placement. Wrecked and Abandoned agents start stopped. */
  spawnAt(lane: number, s: number, kind: CarId, state: AgentState = AgentState.Kinematic, offset = 0): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.place(i, lane, s, KIND_INDEX[kind], offset, state, PAINTS[0] as number);
    return i;
  }

  /** A clear graph pose; police use the same records and the same body lender as civilians. */
  canSpawnAt(lane: number, s: number, clearance: number): boolean {
    this.lanes.positionAt(lane, s, 0, this.pose);
    return !this.nearWorld(this.pose.x, this.pose.z, clearance);
  }

  /** Includes the whole car footprint and the near exclusion, not just its centre. */
  outOfView(x: number, z: number, radius: number, player: PlayerProbe, near: number, cosHalf: number): boolean {
    const dx = x - player.x, dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= near + radius) return false;
    const along = dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw);
    const boundary = cosHalf * Math.sqrt(distance * distance - radius * radius)
      - Math.sqrt(1 - cosHalf * cosHalf) * radius;
    return along < boundary;
  }

  /** Only an unseen, undisturbed civilian may give up a full agent slot. */
  spawnPoliceAt(lane: number, s: number, kind: 'police' | 'sports', player: PlayerProbe, near: number, cosHalf: number, clearance: number): number {
    if (!this.canSpawnAt(lane, s, clearance)) return -1;
    const index = KIND_INDEX[kind];
    const radius = Math.hypot(this.halfW[index] as number, this.halfL[index] as number);
    if (!this.outOfView(this.pose.x, this.pose.z, radius, player, near, cosHalf)) return -1;
    let agent = this.findFree();
    if (agent < 0) {
      let farthest = 0;
      for (let i = 0; i < this.capacity; i++) {
        if (this.police[i] !== 0 || (this.state[i] !== AgentState.Kinematic && this.state[i] !== AgentState.Physical)) continue;
        const x = this.x[i] as number, z = this.z[i] as number;
        const r = Math.hypot(this.halfWidthOf(i), this.halfLengthOf(i));
        if (!this.outOfView(x, z, r, player, near, cosHalf)) continue;
        const d = (x - player.x) ** 2 + (z - player.z) ** 2;
        if (d > farthest) { farthest = d; agent = i; }
      }
      if (agent < 0) return -1;
      this.free(agent);
    }
    this.place(agent, lane, s, index, 0, AgentState.Kinematic, PLAYER_PAINT[kind]);
    this.police[agent] = 1;
    return agent;
  }

  /** Off duty: the record goes back to the pool. The caller must have checked nobody is watching. */
  releasePolice(agent: number): void {
    if (this.police[agent] !== 1) return;
    const state = this.state[agent];
    if (state !== AgentState.Kinematic && state !== AgentState.Physical) return;
    this.free(agent);
  }

  /** Bounded planner inputs: a connected exit, speed, and an optional physical ram target. */
  setPolicePlan(agent: number, next: number, speed: number, ramX = 0, ramZ = 0, ramSpeed = 0, ramAccel = 0): void {
    if (this.police[agent] !== 1) return;
    const lane = this.lane[agent] as number;
    this.plannerLane[agent] = lane;
    this.plannerNext[agent] = lane >= 0 && this.lanes.outs(lane).includes(next) ? next : -1;
    this.plannerSpeed[agent] = Math.max(0, speed);
    this.ramX[agent] = ramX;
    this.ramZ[agent] = ramZ;
    this.ramSpeed[agent] = Math.max(0, ramSpeed);
    this.ramAccel[agent] = Math.max(0, ramAccel);
  }

  clearPolicePlan(agent: number): void {
    this.plannerLane[agent] = -1;
    this.plannerNext[agent] = -1;
    this.plannerSpeed[agent] = 0;
    this.ramSpeed[agent] = 0;
    this.ramAccel[agent] = 0;
  }

  /** Test hook: a stopped car (wreck or abandoned) at a point, off the lane graph. */
  spawnAtPoint(x: number, z: number, yaw: number, kind: CarId, state: AgentState.Wrecked | AgentState.Abandoned): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.state[i] = state;
    this.police[i] = 0;
    this.clearPolicePlan(i);
    this.kind[i] = KIND_INDEX[kind];
    this.paint[i] = PAINTS[0] as number;
    this.lane[i] = -1;
    this.next[i] = -1;
    this.s[i] = 0;
    this.laneOffset[i] = 0;
    this.speed[i] = 0;
    this.x[i] = x;
    this.z[i] = z;
    this.yaw[i] = yaw;
    this.wait[i] = 0;
    this.forced[i] = 0;
    this.wobble[i] = 0;
    this.turn[i] = 0;
    this.honkCooldown[i] = 0;
    this.disturbedFor[i] = 0;
    this.wreckedFor[i] = 0;
    this.lastPlayerContactTick[i] = -100000;
    this.paintSerial++;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    this.transforms.writeBoth(this.slot[i] as number, x, 0.03, z, q.x, q.y, q.z, q.w);
    return i;
  }

  /**
   * Car-swap. The agent's car goes to the player (`out` receives its pose,
   * velocity and class); the agent's record becomes the player's old car,
   * standing where the player was: abandoned, or a wreck if the player's car
   * was one. It keeps no lane and is lent a body next step like any obstacle.
   */
  takeOver(agent: number, oldKind: CarId, oldPaint: number, oldPose: { x: number; y: number; z: number; yaw: number }, oldWrecked: boolean, out: SwapHandover): void {
    const yaw = this.yaw[agent] as number;
    out.x = this.x[agent] as number;
    out.z = this.z[agent] as number;
    out.y = 0.03;
    out.yaw = yaw;
    out.kind = this.kindOf(agent);
    const slot = this.agentBody[agent] as number;
    if (slot >= 0) {
      (this.bodies[slot] as RAPIER.RigidBody).linvel(this.lin);
      out.vx = this.lin.x;
      out.vz = this.lin.z;
      this.releaseBody(agent);
    } else {
      const speed = this.speed[agent] as number;
      out.vx = Math.sin(yaw) * speed;
      out.vz = Math.cos(yaw) * speed;
    }
    this.releaseHolds(agent);
    this.police[agent] = 0;
    this.clearPolicePlan(agent);
    this.state[agent] = oldWrecked ? AgentState.Wrecked : AgentState.Abandoned;
    this.kind[agent] = KIND_INDEX[oldKind];
    this.paint[agent] = oldPaint;
    this.lane[agent] = -1;
    this.next[agent] = -1;
    this.s[agent] = 0;
    this.laneOffset[agent] = 0;
    this.speed[agent] = 0;
    this.x[agent] = oldPose.x;
    this.z[agent] = oldPose.z;
    this.yaw[agent] = oldPose.yaw;
    this.wait[agent] = 0;
    this.forced[agent] = 0;
    this.wobble[agent] = 0;
    this.turn[agent] = 0;
    this.wreckedFor[agent] = 0;
    this.lastPlayerContactTick[agent] = -100000;
    this.paintSerial++;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, oldPose.yaw);
    this.transforms.writeBoth(this.slot[agent] as number, oldPose.x, 0.03, oldPose.z, q.x, q.y, q.z, q.w);
  }

  clearAround(x: number, z: number, radius: number): void {
    const r2 = radius * radius;
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free) continue;
      const dx = (this.x[i] as number) - x;
      const dz = (this.z[i] as number) - z;
      if (dx * dx + dz * dz <= r2) this.free(i);
    }
  }

  step(player: PlayerProbe, dt: number, events: EventLog): void {
    this.despawn(player);
    this.tow(player, dt);
    this.spawn(player);
    this.releaseNodes(dt);
    for (let i = 0; i < this.capacity; i++) if ((this.agentBody[i] as number) >= 0) this.pullPose(i);
    this.buildLaneLists();
    for (let i = 0; i < this.capacity; i++) {
      const st = this.state[i];
      if (st === AgentState.Free) continue;
      this.chooseNext(i);
      if (st === AgentState.Kinematic) this.moveKinematic(i, this.plan(i, player, dt, events), dt);
      if (st === AgentState.Kinematic || st === AgentState.Physical) this.honk(i, player, dt, events);
    }
    this.unstick();
    this.guard(player, events);
    this.syncBodies(player, dt, events);
  }

  writeTransforms(): void {
    const tb = this.transforms;
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slot[i] as number;
      if (this.state[i] === AgentState.Free) {
        tb.writeBoth(slot, 0, -50, 0, 0, 0, 0, 1);
        continue;
      }
      const bodyIndex = this.agentBody[i] as number;
      if (bodyIndex >= 0) {
        const body = this.bodies[bodyIndex] as RAPIER.RigidBody;
        body.translation(this.pos);
        body.rotation(this.rot);
        this.x[i] = this.pos.x;
        this.z[i] = this.pos.z;
        this.yaw[i] = M.yawOf(this.rot);
        tb.write(slot, this.pos.x, this.pos.y, this.pos.z, this.rot.x, this.rot.y, this.rot.z, this.rot.w);
        continue;
      }
      let yaw = this.yaw[i] as number;
      if ((this.wobble[i] as number) > 0) yaw += Math.sin((this.wobble[i] as number) * 18) * WOBBLE_RAD;
      const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
      tb.write(slot, this.x[i] as number, 0.03, this.z[i] as number, q.x, q.y, q.z, q.w);
    }
  }

  // ---- path following, shared by kinematic and lent agents --------------------

  /** Desired speed this step from the lane limit, the leader, the player and the junction rules. */
  private plan(i: number, player: PlayerProbe, dt: number, events: EventLog): number {
    const t = this.tuning;
    const lane = this.lane[i] as number;
    const len = this.lanes.length[lane] as number;
    const nxt = this.next[i] as number;
    const s = this.s[i] as number;
    let limit = this.lanes.limit[lane] as number;
    const chasing = (this.plannerSpeed[i] as number) > 0;
    if (chasing) limit = this.plannerSpeed[i] as number;
    if (nxt >= 0 && s >= len - 6 && this.turn[i] === 1) limit = t.speedJunction;
    let gap = this.leaderGap(i);
    let blocker = gap < 1e8 ? 1 : 0;
    const pGap = chasing && this.hasBody(i) ? Infinity : this.playerGapOf(i, player);
    if (pGap < gap) { gap = pGap; blocker = 2; }
    const aGap = this.aheadGap(i);
    if (aGap < gap) { gap = aGap; blocker = 3; }
    let desired = limit;
    if (gap < 1e8) desired = Math.min(limit, Math.sqrt(2 * t.brake * Math.max(0, gap - t.gapMin)));
    if (desired >= limit) blocker = 0;
    // A lent body braking for the line creeps a little past it; within the tolerance it is still at the line.
    const entering = nxt >= 0 && s <= len + STOP_TOLERANCE;
    if (!entering) this.wait[i] = 0;
    if (entering && !this.mayEnter(i, player)) {
      const w = this.wait[i] as number;
      if (w < t.junctionWait && w + dt >= t.junctionWait) {
        this.waitedPast++;
        events.push('honk', 0, this.x[i] as number, 0.03, this.z[i] as number, i);
      }
      this.wait[i] = w + dt;
      if (w + dt < t.junctionWait) {
        const stop = Math.sqrt(2 * t.brake * Math.max(0, len - 0.2 - s));
        if (stop < desired) { desired = stop; blocker = 4; }
      }
    } else if (entering && s >= len - 6) {
      // Claim only on the approach: a car already in the box does not re-claim after its release.
      this.claimNode(i);
      this.wait[i] = 0;
    }
    this.blocker[i] = blocker;
    return desired;
  }

  private moveKinematic(i: number, desired: number, dt: number): void {
    const t = this.tuning;
    const speed = this.speed[i] as number;
    this.speed[i] = speed < desired ? Math.min(desired, speed + t.accel * dt) : Math.max(0, Math.max(desired, speed - t.brake * dt));
    const lane = this.lane[i] as number;
    const len = this.lanes.length[lane] as number;
    const nxt = this.next[i] as number;
    let s = (this.s[i] as number) + (this.speed[i]) * dt;
    // Only a car still on the approach holds at the line; one already in the box (a returned body) drives on.
    const holding = nxt >= 0 && (this.s[i] as number) <= len && (this.wait[i] as number) > 0 && (this.wait[i] as number) < t.junctionWait && this.forced[i] === 0;
    if (holding) {
      if (s > len - 0.2) {
        s = len - 0.2;
        this.speed[i] = 0;
      }
    } else if (nxt >= 0 && s >= len) {
      const conn = this.lanes.connectionLength(lane, nxt, this.laneOffset[i]);
      if (s >= len + conn) {
        const over = Math.max(0, s - len - conn);
        const closest = this.closestOn(nxt);
        if (closest < over + CAR_GAP + 0.3) {
          s = len + conn - Math.max(0.3, CAR_GAP + 0.3 - closest);
          this.speed[i] = 0;
        } else {
          this.switchLane(i, over);
          s = over;
        }
      }
    } else if (nxt < 0 && s > len) {
      s = len;
      this.speed[i] = 0;
    }
    this.s[i] = Math.max(0, s);
    this.reposition(i);
  }

  /** The agent has left its connection: continue on the chosen lane. */
  private switchLane(i: number, s: number): void {
    const nxt = this.next[i] as number;
    this.retargetOffset(i, nxt);
    this.lane[i] = nxt;
    this.next[i] = -1;
    this.turn[i] = 0;
    this.wait[i] = 0;
    this.forced[i] = 0;
    this.s[i] = Math.max(0, s);
  }

  /** Read a lent body back into the record: pose, speed and progress along the path. */
  private pullPose(i: number): void {
    const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
    body.translation(this.pos);
    body.rotation(this.rot);
    this.x[i] = this.pos.x;
    this.z[i] = this.pos.z;
    this.yaw[i] = M.yawOf(this.rot);
    body.linvel(this.lin);
    this.prevSpeed[i] = this.speed[i] as number;
    this.speed[i] = Math.hypot(this.lin.x, this.lin.z);
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    this.lanes.projectPath(lane, this.next[i] as number, this.pos.x, this.pos.z, this.proj, this.laneOffset[i]);
    if (this.proj.switched) this.switchLane(i, this.proj.s);
    else this.s[i] = this.proj.s;
  }

  /** Steer a lent body along its path: velocity toward a point 8 m ahead, nose along the motion. */
  private driveBody(i: number, player: PlayerProbe, dt: number, events: EventLog): void {
    const t = this.tuning;
    const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    let desired = this.plan(i, player, dt, events);
    const ramming = (this.ramAccel[i] as number) > 0;
    if (ramming) {
      this.pose.x = this.ramX[i] as number;
      this.pose.z = this.ramZ[i] as number;
      desired = Math.min(desired, this.ramSpeed[i] as number);
    } else {
      this.lanes.positionAt(lane, (this.s[i] as number) + CARROT, this.laneOffset[i] as number, this.pose, this.next[i]);
    }
    const dx = this.pose.x - (this.x[i] as number);
    const dz = this.pose.z - (this.z[i] as number);
    const len = Math.hypot(dx, dz) || 1;
    const yaw = this.yaw[i] as number;
    // A car spun round by a hit turns back on the spot before it drives on, so it never reverses along its path.
    let toCarrot = Math.atan2(dx, dz) - yaw;
    toCarrot = Math.atan2(Math.sin(toCarrot), Math.cos(toCarrot));
    const turningBack = !ramming && Math.abs(toCarrot) > Math.PI / 3;
    const speedTarget = turningBack ? 0 : desired;
    body.linvel(this.lin);
    const left = this.reattachLeft[i] as number;
    const blend = left > 0 ? 1 - left / t.reattachBlend : 1;
    if (left > 0) this.reattachLeft[i] = Math.max(0, left - dt);
    const k = Math.min(1, 6 * dt) * Math.max(0, Math.min(1, blend));
    const dvx = dx / len * speedTarget - this.lin.x;
    const dvz = dz / len * speedTarget - this.lin.z;
    // A ram accelerates only the patrol's lent body. Rapier contacts deliver the shove.
    const gain = ramming ? Math.min(k, (this.ramAccel[i] as number) * dt / (Math.hypot(dvx, dvz) || 1)) : k;
    this.lin.x += dvx * gain;
    this.lin.z += dvz * gain;
    body.setLinvel(this.lin, true);
    // Heading: a first-order controller with a rate cap (stable while yawGain × dt < 1).
    // Moving, the nose follows the motion so the car never crabs; stopped, it turns toward the path.
    body.angvel(this.ang);
    const moving = !turningBack && Math.hypot(this.lin.x, this.lin.z) > 1.5;
    const headTarget = moving ? Math.atan2(this.lin.x, this.lin.z) : Math.atan2(dx, dz);
    let err = headTarget - yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    this.ang.y = M.clamp(err * t.yawGain, -t.yawRateMax, t.yawRateMax);
    body.setAngvel(this.ang, true);
  }

  // ---- gaps ---------------------------------------------------------------------

  private leaderGap(i: number): number {
    const lane = this.lane[i] as number;
    const count = this.laneFill[lane] as number;
    const base = lane * MAX_ON_LANE;
    let self = -1;
    for (let k = 0; k < count; k++) if (this.laneIndex[base + k] === i) { self = k; break; }
    if (self >= 0 && self + 1 < count) {
      const other = this.laneIndex[base + self + 1] as number;
      return (this.s[other] as number) - (this.s[i] as number) - CAR_GAP;
    }
    const nxt = this.next[i] as number;
    if (nxt < 0) return Infinity;
    const nCount = this.laneFill[nxt] as number;
    const nBase = nxt * MAX_ON_LANE;
    for (let k = 0; k < nCount; k++) {
      const other = this.laneIndex[nBase + k] as number;
      if ((this.s[other] as number) > 20) break;
      const remain = (this.lanes.length[lane] as number) - (this.s[i] as number);
      return remain + this.lanes.connectionLength(lane, nxt, this.laneOffset[i]) + (this.s[other] as number) - CAR_GAP;
    }
    return Infinity;
  }

  /** Along-lane distance to the player when the player is the leader. The stop band is `gapMin`. */
  private playerGapOf(i: number, player: PlayerProbe): number {
    const lane = this.lane[i] as number;
    this.lanes.projectPath(lane, this.next[i] as number, player.x, player.z, this.proj);
    if (this.proj.switched) return Infinity;
    const along = this.proj.s - (this.s[i] as number);
    const lateral = this.proj.lateral - (this.laneOffset[i] as number);
    if (along > 0 && along < this.tuning.playerGap && Math.abs(lateral) < this.tuning.playerLateral) return along;
    return Infinity;
  }

  /** Nearest car in the agent's own corridor ahead (within 14 m, at most `playerLateral` to either side). */
  private aheadGap(i: number): number {
    const x = this.x[i] as number;
    const z = this.z[i] as number;
    const yaw = this.yaw[i] as number;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const half = this.tuning.playerLateral;
    let gap = Infinity;
    for (let j = 0; j < this.capacity; j++) {
      if (j === i || this.state[j] === AgentState.Free) continue;
      const dx = (this.x[j] as number) - x;
      const dz = (this.z[j] as number) - z;
      const along = dx * fx + dz * fz;
      if (along < 2 || along > 14) continue;
      if (Math.abs(dx * rx + dz * rz) > half) continue;
      const spare = along - CAR_GAP;
      if (spare < gap) gap = spare;
    }
    return gap;
  }

  // ---- junctions -------------------------------------------------------------------

  private mayEnter(i: number, player: PlayerProbe): boolean {
    const t = this.tuning;
    if (this.forced[i] === 1) return true;
    if ((this.wait[i] as number) >= t.junctionWait) {
      this.forced[i] = 1;
      return true;
    }
    const lane = this.lane[i] as number;
    const nxt = this.next[i] as number;
    if (nxt < 0) return true;
    const node = this.lanes.toNode[lane] as number;
    // A holder is already committed: it keeps going (gaps still stop it behind anyone in the box).
    if (this.isHolder(node, i)) return true;
    if ((this.plannerSpeed[i] as number) <= 0 && this.playerNear(node, player)) return false;
    const fromHighway = (this.lanes.limit[lane] as number) === t.speedHighway;
    if (!fromHighway && this.highwayNode(node) && this.highwayApproaching(node)) return false;
    if (this.turn[i] === 0 && fromHighway) return true;
    // First come, first served across the arms: a platoon from one lane must
    // not starve a car that has been waiting longer on a conflicting movement.
    if (this.waitingLonger(i, node, lane, nxt)) return false;
    const base = node * HOLDERS;
    let freeSlot = false;
    for (let k = 0; k < HOLDERS; k++) {
      const h = this.nodeHolders[base + k] as number;
      if (h < 0) { freeSlot = true; continue; }
      const hNext = this.next[h] as number;
      if (hNext < 0) continue; // the holder has left its connection; the slot frees on the next release pass
      if (this.lanes.conflicts(lane, nxt, this.lane[h] as number, hNext)) return false;
    }
    return freeSlot;
  }

  /** A conflicting car at the same node that is not a holder and has waited at least 1 s longer than `i`. */
  private waitingLonger(i: number, node: number, lane: number, nxt: number): boolean {
    const mine = this.wait[i] as number;
    for (let k = 0; k < this.capacity; k++) {
      if (k === i) continue;
      const st = this.state[k];
      if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
      if ((this.wait[k] as number) < mine + 1 || this.forced[k] === 1) continue;
      const kLane = this.lane[k] as number;
      const kNext = this.next[k] as number;
      if (kLane < 0 || kNext < 0 || (this.lanes.toNode[kLane] as number) !== node) continue;
      if (this.isHolder(node, k)) continue;
      if (this.lanes.conflicts(lane, nxt, kLane, kNext)) return true;
    }
    return false;
  }

  private isHolder(node: number, agent: number): boolean {
    const base = node * HOLDERS;
    for (let k = 0; k < HOLDERS; k++) if (this.nodeHolders[base + k] === agent) return true;
    return false;
  }

  private claimNode(i: number): void {
    const lane = this.lane[i] as number;
    const fromHighway = (this.lanes.limit[lane] as number) === this.tuning.speedHighway;
    if (this.turn[i] === 0 && fromHighway) return;
    const node = this.lanes.toNode[lane] as number;
    const base = node * HOLDERS;
    let free = -1;
    for (let k = 0; k < HOLDERS; k++) {
      const h = this.nodeHolders[base + k] as number;
      if (h === i) return;
      if (h < 0 && free < 0) free = k;
    }
    if (free < 0) return;
    this.nodeHolders[base + free] = i;
    this.nodeHoldFor[base + free] = 0;
  }

  private releaseNodes(dt: number): void {
    const clear = this.tuning.junctionClear;
    for (let n = 0; n < this.nodes.length; n++) {
      const base = n * HOLDERS;
      for (let k = 0; k < HOLDERS; k++) {
        const h = this.nodeHolders[base + k] as number;
        if (h < 0) continue;
        this.nodeHoldFor[base + k] = (this.nodeHoldFor[base + k] as number) + dt;
        const lane = this.lane[h] as number;
        const nxt = this.next[h] as number;
        // The box is clear once the holder is past the node centre on its
        // connection (55 % of the curve), or on the next lane, or after 8 s.
        const leaving = lane >= 0 && nxt >= 0 && (this.lanes.toNode[lane] as number) === n
          && (this.s[h] as number) - (this.lanes.length[lane] as number) >= 0.55 * this.lanes.connectionLength(lane, nxt, this.laneOffset[h]);
        const gone = this.state[h] === AgentState.Free || lane < 0 || leaving
          || ((this.lanes.toNode[lane] as number) !== n && (this.s[h] as number) >= clear)
          || (this.nodeHoldFor[base + k] as number) > 8;
        if (gone) {
          this.nodeHolders[base + k] = -1;
          this.nodeHoldFor[base + k] = 0;
        }
      }
    }
  }

  private releaseHolds(i: number): void {
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    const base = (this.lanes.toNode[lane] as number) * HOLDERS;
    for (let k = 0; k < HOLDERS; k++) if (this.nodeHolders[base + k] === i) this.nodeHolders[base + k] = -1;
  }

  private highwayNode(node: number): boolean {
    const n = this.nodes[node] as RoadNode;
    return Math.abs(n.x) === 675 || Math.abs(n.z) === 675;
  }

  private playerNear(node: number, player: PlayerProbe): boolean {
    const n = this.nodes[node] as RoadNode;
    const dx = n.x - player.x;
    const dz = n.z - player.z;
    return dx * dx + dz * dz < 12 * 12;
  }

  private highwayApproaching(node: number): boolean {
    const n = this.nodes[node] as RoadNode;
    const reach = this.tuning.highwayGap;
    for (let i = 0; i < this.capacity; i++) {
      const st = this.state[i];
      if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
      const lane = this.lane[i] as number;
      if (lane < 0 || (this.lanes.limit[lane] as number) !== this.tuning.speedHighway) continue;
      const dx = n.x - (this.x[i] as number);
      const dz = n.z - (this.z[i] as number);
      const dist2 = dx * dx + dz * dz;
      if (dist2 > reach * reach || dist2 < 1) continue;
      const fx = Math.sin(this.yaw[i] as number);
      const fz = Math.cos(this.yaw[i] as number);
      if (dx * fx + dz * fz > 0) return true;
    }
    return false;
  }

  private chooseNext(i: number): void {
    if ((this.next[i] as number) >= 0) return;
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    const len = this.lanes.length[lane] as number;
    if ((this.s[i] as number) < len - 6) return;
    const planned = this.plannerNext[i] as number;
    if (this.plannerLane[i] === lane && planned >= 0) {
      this.next[i] = planned;
      this.turn[i] = this.lanes.straightThrough(lane, planned) ? 0 : 1;
      return;
    }
    const outs = this.lanes.outs(lane);
    const uturn = this.lanes.uturn(lane);
    // Highway cars mostly keep their lane: a uniform pick weaves across the carriageway and drains the loop.
    if (this.isHighway(lane) && this.rng() < this.tuning.highwayKeepLane) {
      const off = this.lanes.offset[lane] as number;
      for (let k = 0; k < outs.length; k++) {
        const id = outs[k] as number;
        if (id === uturn || !this.isHighway(id)) continue;
        if (Math.abs((this.lanes.offset[id] as number) - off) > 0.01) continue;
        this.next[i] = id;
        this.turn[i] = this.lanes.straightThrough(lane, id) ? 0 : 1;
        return;
      }
    }
    let choices = 0;
    for (let k = 0; k < outs.length; k++) if (outs[k] !== uturn) choices++;
    let pick = -1;
    if (choices === 0) pick = outs[0] ?? -1;
    else {
      const which = (this.rng() * choices) | 0;
      let seen = 0;
      for (let k = 0; k < outs.length; k++) {
        const id = outs[k] as number;
        if (id === uturn) continue;
        if (seen === which) { pick = id; break; }
        seen++;
      }
    }
    if (pick < 0) return;
    this.next[i] = pick;
    this.turn[i] = this.lanes.straightThrough(lane, pick) ? 0 : 1;
  }

  // ---- bodies ----------------------------------------------------------------------

  private syncBodies(player: PlayerProbe, dt: number, events: EventLog): void {
    const t = this.tuning;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) < 0) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      // A unit chasing from a street away keeps its body; a civilian that far back does not need one.
      const release = t.physicsRelease + (this.police[i] === 1 ? t.policeBodyReach : 0);
      if (dx * dx + dz * dz > release * release) this.releaseBody(i);
    }
    for (let n = 0; n < this.capacity; n++) {
      const i = this.nearestNeedingBody(player);
      if (i < 0) break;
      let slot = this.freeBody();
      if (slot < 0) {
        let victim = this.lingeringWreck();
        // Police take a body from the traffic, never from each other, and never past their share of the pool.
        if (victim < 0 && this.police[i] === 1 && this.policeBodies() < t.policeBodies) victim = this.farthestCivilian(player);
        if (victim < 0) victim = this.farthestUndisturbed(player, i);
        if (victim < 0) break;
        this.releaseBody(victim);
        slot = this.freeBody();
        if (slot < 0) break;
      }
      this.lend(i, slot);
    }
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) < 0) continue;
      const st = this.state[i];
      if (st === AgentState.Disturbed) {
        this.settle(i, dt);
        this.senseImpact(i);
      } else if (st === AgentState.Physical) {
        this.driveBody(i, player, dt, events);
        this.senseImpact(i);
      } else if (st === AgentState.Wrecked) {
        this.senseImpact(i);
      } else if (st === AgentState.Abandoned) {
        this.senseImpact(i);
      }
    }
  }

  /**
   * Kinematic cars inside the radius (or about to be reached), and wrecks near
   * the player without a body. A pursuit unit counts as `policeBodyReach` metres
   * nearer than it is, so it is served first and from further out: a patrol two
   * streets back still shoves when it arrives.
   */
  private nearestNeedingBody(player: PlayerProbe): number {
    const t = this.tuning;
    const px = player.x + player.vx * 0.5;
    const pz = player.z + player.vz * 0.5;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) >= 0) continue;
      const st = this.state[i];
      if (st !== AgentState.Kinematic && st !== AgentState.Wrecked && st !== AgentState.Abandoned) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      const dist = Math.hypot(dx, dz);
      const reach = this.police[i] === 1 ? t.policeBodyReach : 0;
      const ex = (this.x[i] as number) - px;
      const ez = (this.z[i] as number) - pz;
      const predicted = ex * ex + ez * ez < 64;
      if (dist > t.physicsRadius + reach && !predicted) continue;
      if (dist - reach < bestD) { bestD = dist - reach; best = i; }
    }
    return best;
  }

  /** Bodies currently lent to the pursuit. */
  policeBodies(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.police[i] === 1 && (this.agentBody[i] as number) >= 0) n++;
    return n;
  }

  /** The civilian driving body furthest from the player: what a patrol takes when the pool is full. */
  private farthestCivilian(player: PlayerProbe): number {
    let far = -1;
    let farD = 0;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) < 0 || this.state[i] !== AgentState.Physical || this.police[i] === 1) continue;
      if ((this.reattachLeft[i] as number) > 0) continue;
      const d = Math.hypot((this.x[i] as number) - player.x, (this.z[i] as number) - player.z);
      if (d > farD) { farD = d; far = i; }
    }
    return far;
  }

  private freeBody(): number {
    for (let b = 0; b < this.bodyAgent.length; b++) if ((this.bodyAgent[b] as number) < 0) return b;
    return -1;
  }

  /** A wreck that has had its body longer than `wreckLinger`: it gives the body up when a driving car needs it. */
  private lingeringWreck(): number {
    let oldest = -1;
    let age = this.tuning.wreckLinger;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) < 0 || this.state[i] !== AgentState.Wrecked) continue;
      if ((this.wreckedFor[i] as number) > age) { age = this.wreckedFor[i] as number; oldest = i; }
    }
    return oldest;
  }

  /** Never a pursuit unit: the chase keeps its bodies until it is over. */
  private farthestUndisturbed(player: PlayerProbe, than: number): number {
    const thanD = Math.hypot((this.x[than] as number) - player.x, (this.z[than] as number) - player.z);
    let far = -1;
    let farD = thanD;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) < 0 || this.state[i] !== AgentState.Physical || this.police[i] === 1) continue;
      if ((this.reattachLeft[i] as number) > 0) continue;
      const d = Math.hypot((this.x[i] as number) - player.x, (this.z[i] as number) - player.z);
      if (d > farD) { farD = d; far = i; }
    }
    return far;
  }

  private lend(i: number, slot: number): void {
    const body = this.bodies[slot] as RAPIER.RigidBody;
    const kind = this.kind[i] as number;
    let col = this.bodyCollider[slot] as RAPIER.Collider;
    if ((this.bodyKind[slot] as number) !== kind) {
      this.colliderAgent.delete(col.handle);
      this.world.removeCollider(col, false);
      col = this.world.createCollider(this.colliderDesc(kind), body);
      this.bodyCollider[slot] = col;
      this.bodyKind[slot] = kind;
    }
    this.colliderAgent.set(col.handle, i);
    body.userData = i;
    const yaw = this.yaw[i] as number;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    const driving = this.state[i] === AgentState.Kinematic;
    body.setEnabled(true);
    this.pos.x = this.x[i] as number;
    this.pos.y = 0.03;
    this.pos.z = this.z[i] as number;
    body.setTranslation(this.pos, true);
    body.setRotation(q, true);
    if (driving) {
      col.setCollisionGroups(GROUPS_TRAFFIC);
      body.setEnabledTranslations(true, false, true, true);
      const speed = this.speed[i] as number;
      this.lin.x = Math.sin(yaw) * speed;
      this.lin.y = 0;
      this.lin.z = Math.cos(yaw) * speed;
      body.setLinvel(this.lin, true);
      this.state[i] = AgentState.Physical;
    } else {
      // a wreck or an abandoned car: an obstacle that can be pushed and can tumble
      col.setCollisionGroups(GROUPS_SOLID);
      body.setEnabledTranslations(true, true, true, true);
      body.setLinvel(ZERO, true);
    }
    body.setAngvel(ZERO, true);
    this.bodyAgent[slot] = i;
    this.agentBody[i] = slot;
    this.reattachLeft[i] = 0;
  }

  /** Return the body. Driving and disturbed cars go back to kinematic; wrecks and abandoned cars keep their state and stop. */
  private releaseBody(i: number): void {
    const slot = this.agentBody[i] as number;
    if (slot < 0) return;
    const body = this.bodies[slot] as RAPIER.RigidBody;
    const col = this.bodyCollider[slot] as RAPIER.Collider;
    this.colliderAgent.delete(col.handle);
    body.setLinvel(ZERO, true);
    body.setAngvel(ZERO, true);
    this.pos.x = 0;
    this.pos.y = -50;
    this.pos.z = 0;
    body.setTranslation(this.pos, true);
    body.setEnabled(false);
    this.bodyAgent[slot] = -1;
    this.agentBody[i] = -1;
    this.reattachLeft[i] = 0;
    const st = this.state[i];
    if (st === AgentState.Physical) this.state[i] = AgentState.Kinematic;
    else if (st === AgentState.Disturbed) { this.state[i] = AgentState.Kinematic; this.speed[i] = 0; }
    else this.speed[i] = 0;
    const lane = this.lane[i] as number;
    if (lane >= 0) {
      this.lanes.projectPath(lane, this.next[i] as number, this.x[i] as number, this.z[i] as number, this.proj, this.laneOffset[i]);
      if (this.proj.switched) this.switchLane(i, this.proj.s);
      else this.s[i] = this.proj.s;
      // Far from the player (this is where bodies are returned): snap back onto the lane.
      this.reposition(i);
    }
  }

  private senseImpact(i: number): void {
    const col = this.bodyCollider[this.agentBody[i] as number] as RAPIER.Collider;
    this.contactSum = 0;
    this.playerSum = 0;
    this.wallSum = 0;
    this.trafficSum = 0;
    this.currentCol = col;
    this.world.contactPairsWith(col, this.onTrafficPair);
    this.currentCol = null;
    const id = KINDS[this.kind[i] as number] as CarId;
    const mass = this.tuning.mass[id];
    const dv = this.contactSum / mass;
    this.contactDv[i] = dv;
    this.playerDv[i] = this.playerSum / mass;
    this.wallDv[i] = this.wallSum / mass;
    this.trafficDv[i] = this.trafficSum / mass;
    const st = this.state[i];
    if (st === AgentState.Wrecked || st === AgentState.Abandoned) return;
    if (dv >= this.tuning.wreckImpact) {
      this.wreck(i);
      return;
    }
    if (dv > this.tuning.disturbedImpact) {
      if (st !== AgentState.Disturbed) this.loosen(i);
      this.state[i] = AgentState.Disturbed;
      this.disturbedFor[i] = this.tuning.disturbedTime;
    }
  }

  /** Let the lent body tumble: collide with the ground, free vertical motion. */
  private loosen(i: number): void {
    const slot = this.agentBody[i] as number;
    if (slot < 0) return;
    (this.bodyCollider[slot] as RAPIER.Collider).setCollisionGroups(GROUPS_SOLID);
    (this.bodies[slot] as RAPIER.RigidBody).setEnabledTranslations(true, true, true, true);
  }

  /** The agent is a wreck from now on: a stopped obstacle until it despawns. */
  wreck(i: number): void {
    if (this.state[i] === AgentState.Wrecked) return;
    this.loosen(i);
    this.state[i] = AgentState.Wrecked;
    this.wreckedFor[i] = 0;
    this.speed[i] = 0;
    this.releaseHolds(i);
    this.paintSerial++;
  }

  private settle(i: number, dt: number): void {
    this.disturbedFor[i] = (this.disturbedFor[i] as number) - dt;
    if ((this.disturbedFor[i]) > 0) return;
    const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
    const r = body.rotation(this.rot);
    const up = 1 - 2 * (r.x * r.x + r.z * r.z);
    body.linvel(this.lin);
    const speed = Math.hypot(this.lin.x, this.lin.z);
    const lane = this.lane[i] as number;
    let lateral = Infinity;
    if (lane >= 0) {
      this.lanes.projectPath(lane, this.next[i] as number, this.x[i] as number, this.z[i] as number, this.proj, this.laneOffset[i]);
      lateral = Math.abs(this.proj.lateral);
    }
    if (up > 0.7 && speed < 6 && lateral < this.tuning.reattachDistance) {
      this.state[i] = AgentState.Physical;
      this.reattachLeft[i] = this.tuning.reattachBlend;
      if (this.proj.switched) this.switchLane(i, this.proj.s);
      else this.s[i] = this.proj.s;
      const col = this.bodyCollider[this.agentBody[i] as number] as RAPIER.Collider;
      col.setCollisionGroups(GROUPS_TRAFFIC);
      body.setEnabledTranslations(true, false, true, true);
      this.pos.x = this.x[i] as number;
      this.pos.y = 0.03;
      this.pos.z = this.z[i] as number;
      body.setTranslation(this.pos, true);
    } else {
      this.wreck(i);
    }
  }

  // ---- pool bookkeeping -------------------------------------------------------------

  private findFree(): number {
    for (let i = 0; i < this.capacity; i++) if (this.state[i] === AgentState.Free) return i;
    return -1;
  }

  private alive(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.state[i] !== AgentState.Free) n++;
    return n;
  }

  private place(i: number, lane: number, s: number, kind: number, offset: number, state: AgentState, paint: number): void {
    this.state[i] = state;
    this.police[i] = 0;
    this.clearPolicePlan(i);
    this.contactDv[i] = 0;
    this.playerDv[i] = 0;
    this.wallDv[i] = 0;
    this.trafficDv[i] = 0;
    this.kind[i] = kind;
    this.paint[i] = paint;
    this.lane[i] = lane;
    this.next[i] = -1;
    this.s[i] = s;
    this.laneOffset[i] = offset;
    const stopped = state === AgentState.Wrecked || state === AgentState.Abandoned;
    this.speed[i] = stopped ? 0 : (this.lanes.limit[lane] as number);
    this.wait[i] = 0;
    this.forced[i] = 0;
    this.wobble[i] = 0;
    this.turn[i] = 0;
    this.honkCooldown[i] = 0;
    this.disturbedFor[i] = 0;
    this.wreckedFor[i] = 0;
    this.lastPlayerContactTick[i] = -100000;
    this.lanes.positionAt(lane, s, offset, this.pose);
    this.x[i] = this.pose.x;
    this.z[i] = this.pose.z;
    this.yaw[i] = this.pose.yaw;
    this.paintSerial++;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, this.pose.yaw);
    this.transforms.writeBoth(this.slot[i] as number, this.pose.x, 0.03, this.pose.z, q.x, q.y, q.z, q.w);
  }

  private free(i: number): void {
    if ((this.agentBody[i] as number) >= 0) this.releaseBody(i);
    this.releaseHolds(i);
    this.state[i] = AgentState.Free;
    this.police[i] = 0;
    this.clearPolicePlan(i);
    this.next[i] = -1;
    this.lane[i] = -1;
  }

  /**
   * Tow-away: a wreck older than `wreckTow` is freed the first step the player is
   * not looking at it. The sight test is instantaneous on purpose: a hidden-for
   * timer never fires for a player circling one junction.
   */
  private tow(player: PlayerProbe, dt: number): void {
    const t = this.tuning;
    const near2 = t.wreckTowNear * t.wreckTowNear;
    const cosHalf = Math.cos(t.wreckTowConeDeg * Math.PI / 180);
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] !== AgentState.Wrecked) continue;
      const age = (this.wreckedFor[i] as number) + dt;
      this.wreckedFor[i] = age;
      if (age < t.wreckTow) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < near2 || dx * fx + dz * fz >= cosHalf * Math.sqrt(d2)) continue;
      this.free(i);
      this.towedAway++;
    }
  }

  private despawn(player: PlayerProbe): void {
    const r2 = this.tuning.despawn * this.tuning.despawn;
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free || this.police[i] === 1) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      if (dx * dx + dz * dz > r2) this.free(i);
    }
  }

  private spawn(player: PlayerProbe): void {
    for (let n = 0; n < 4 && this.alive() < this.target; n++) {
      if (!this.trySpawn(player)) return;
    }
  }

  private trySpawn(player: PlayerProbe): boolean {
    const lanes = this.lanes;
    const t = this.tuning;
    for (let attempt = 0; attempt < 8; attempt++) {
      const lane = (this.rng() * lanes.laneCount) | 0;
      const dx = (lanes.midX[lane] as number) - player.x;
      const dz = (lanes.midZ[lane] as number) - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < t.spawnMin || dist > t.spawnMax) continue;
      const behind = dx * player.vx + dz * player.vz < 0;
      if (!behind && dist < 230) continue;
      const len = lanes.length[lane] as number;
      const s = this.rng() * len;
      if (this.nearOnLane(lane, s, t.gapMin + 8)) continue;
      const offset = this.pickOffset(lane);
      lanes.positionAt(lane, s, offset, this.pose);
      if (this.nearWorld(this.pose.x, this.pose.z, 10)) continue;
      const i = this.findFree();
      if (i < 0) return false;
      const roll = this.rng();
      const w = t.kindWeights;
      const kind = roll < w.compact ? KIND_INDEX.compact : roll < w.compact + w.muscle ? KIND_INDEX.muscle : KIND_INDEX.heavy;
      const paint = PAINTS[(this.rng() * PAINTS.length) | 0] as number;
      this.place(i, lane, s, kind, offset, AgentState.Kinematic, paint);
      return true;
    }
    return false;
  }

  private isHighway(lane: number): boolean {
    return (this.lanes.limit[lane] as number) === this.tuning.speedHighway;
  }

  private pickOffset(lane: number): number {
    const list = this.isHighway(lane) ? this.tuning.subLaneOffsets.highway : this.tuning.subLaneOffsets.street;
    return list[(this.rng() * list.length) | 0] ?? 0;
  }

  private retargetOffset(i: number, lane: number): void {
    const list = this.isHighway(lane) ? this.tuning.subLaneOffsets.highway : this.tuning.subLaneOffsets.street;
    const offset = this.laneOffset[i] as number;
    for (let k = 0; k < list.length; k++) if (list[k] === offset) return;
    this.laneOffset[i] = list[(this.rng() * list.length) | 0] ?? 0;
  }

  private nearOnLane(lane: number, s: number, radius: number): boolean {
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free || this.lane[i] !== lane) continue;
      if (Math.abs((this.s[i] as number) - s) < radius) return true;
    }
    return false;
  }

  private nearWorld(x: number, z: number, radius: number): boolean {
    const r2 = radius * radius;
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free) continue;
      const dx = (this.x[i] as number) - x;
      const dz = (this.z[i] as number) - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  /** Per-lane lists in `s` order of every agent that occupies a lane (any state but Free). */
  private buildLaneLists(): void {
    this.laneFill.fill(0);
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free) continue;
      const lane = this.lane[i] as number;
      if (lane < 0) continue;
      const count = this.laneFill[lane] as number;
      if (count >= MAX_ON_LANE) continue;
      const base = lane * MAX_ON_LANE;
      let j = count;
      const si = this.s[i] as number;
      while (j > 0 && (this.s[this.laneIndex[base + j - 1] as number] as number) > si) {
        this.laneIndex[base + j] = this.laneIndex[base + j - 1] as number;
        j--;
      }
      this.laneIndex[base + j] = i;
      this.laneFill[lane] = count + 1;
    }
  }

  /** Push a kinematic car back along its lane when any car ahead of it is inside the 4.5 m spacing. */
  private unstick(): void {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < this.capacity; i++) {
        if (this.state[i] !== AgentState.Kinematic) continue;
        for (let j = 0; j < this.capacity; j++) {
          if (j === i || this.state[j] === AgentState.Free) continue;
          const dx = (this.x[j] as number) - (this.x[i] as number);
          const dz = (this.z[j] as number) - (this.z[i] as number);
          const dist = Math.hypot(dx, dz);
          if (dist >= CAR_GAP) continue;
          const same = this.lane[i] === this.lane[j];
          const jAhead = same
            ? ((this.s[j] as number) > (this.s[i] as number) || ((this.s[j] as number) === (this.s[i] as number) && j < i))
            : dx * Math.sin(this.yaw[i] as number) + dz * Math.cos(this.yaw[i] as number) > 0;
          if (!jAhead) continue;
          const deficit = CAR_GAP - dist + 0.2;
          const nextS = Math.max(0, (this.s[i] as number) - deficit);
          if (nextS === (this.s[i] as number)) continue;
          this.s[i] = nextS;
          if ((this.speed[i] as number) > (this.speed[j] as number)) this.speed[i] = this.speed[j] as number;
          this.reposition(i);
          moved = true;
        }
      }
      if (!moved) return;
    }
  }

  private closestOn(lane: number): number {
    let best = Infinity;
    for (let j = 0; j < this.capacity; j++) {
      if (this.state[j] === AgentState.Free || this.lane[j] !== lane) continue;
      const sj = this.s[j] as number;
      if (sj < best) best = sj;
    }
    return best;
  }

  private reposition(i: number): void {
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    this.lanes.positionAt(lane, this.s[i] as number, this.laneOffset[i] as number, this.pose, this.next[i]);
    this.x[i] = this.pose.x;
    this.z[i] = this.pose.z;
    this.yaw[i] = this.pose.yaw;
  }

  /** Last resort when the body pool is exhausted and a kinematic car overlaps the player. */
  private guard(player: PlayerProbe, events: EventLog): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] !== AgentState.Kinematic) continue;
      if (!this.overlapsPlayer(i, player)) continue;
      const fx = Math.sin(player.yaw);
      const fz = Math.cos(player.yaw);
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      const side = dx * -fz - dz * -fx;
      this.laneOffset[i] = (this.laneOffset[i] as number) + (side >= 0 ? 3 : -3);
      this.reposition(i);
      this.guardHops++;
      events.push('honk', 0, this.x[i] as number, 0.03, this.z[i] as number, i);
    }
  }

  private overlapsPlayer(i: number, player: PlayerProbe): boolean {
    const yaw = this.yaw[i] as number;
    const dx = player.x - (this.x[i] as number);
    const dz = player.z - (this.z[i] as number);
    const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const side = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
    const kind = this.kind[i] as number;
    return Math.abs(side) <= (this.halfW[kind] as number) + player.halfWidth
      && Math.abs(along) <= (this.halfL[kind] as number) + player.halfLength;
  }

  private honk(i: number, player: PlayerProbe, dt: number, events: EventLog): void {
    if ((this.honkCooldown[i] as number) > 0) this.honkCooldown[i] = (this.honkCooldown[i] as number) - dt;
    if ((this.wobble[i] as number) > 0) this.wobble[i] = Math.max(0, (this.wobble[i] as number) - dt);
    if ((this.honkCooldown[i] as number) > 0) return;
    const yaw = this.yaw[i] as number;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = player.x - (this.x[i] as number);
    const dz = player.z - (this.z[i] as number);
    const along = dx * fx + dz * fz;
    const side = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
    const kind = this.kind[i] as number;
    const ex = Math.max(0, Math.abs(side) - (this.halfW[kind] as number) - player.halfWidth);
    const ez = Math.max(0, Math.abs(along) - (this.halfL[kind] as number) - player.halfLength);
    if (ex * ex + ez * ez > 4) return;
    const rel = Math.hypot(player.vx - (this.speed[i] as number) * fx, player.vz - (this.speed[i] as number) * fz);
    if (rel <= 8) return;
    events.push('honk', 0, this.x[i] as number, 0.03, this.z[i] as number, i);
    this.honkCooldown[i] = this.tuning.honkCooldown;
    this.wobble[i] = this.tuning.wobbleTime;
  }
}
