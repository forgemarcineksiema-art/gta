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
import { PALETTE } from '../palette';
import { mulberry32 } from '../random';
import type { Quat } from '../scene';
import type { TransformBuffer } from '../transforms';
import { BALANCE } from '../balance';
import type { CarId } from '../vehicle/presets';
import { districtAt } from '../city/City';
import { BODIES, BODY_IDS, BODY_INDEX, CIVILIAN_PAINTS, pickBody, type BodyId, type RoadKind } from './bodies';
import { LaneTables, type LanePose, type PathProjection } from './lanes';
import { TRAFFIC, type TrafficTuning } from './tuning';

/** Appended, never renumbered: tests compare the numbers. `Parked` is a stopped police car (a roadblock, a patrol at a junction, a test setup). */
export enum AgentState { Free = 0, Kinematic = 1, Physical = 2, Disturbed = 3, Wrecked = 4, Abandoned = 5, Parked = 6 }

export interface PlayerProbe {
  x: number;
  /** The chassis centre's height: about 0.5 m on the road, more in the air. */
  y: number;
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
  /** The body taken (a civilian body keeps its paint; see Life.swap). */
  body: BodyId;
  paint: number;
}
const PAINTS = CIVILIAN_PAINTS;
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
/** A unit on a chase brakes and pulls away this much harder than traffic (POLICE.mode.accelFactor; traffic may not import police). */
const POLICE_ACCEL = 1.5;
/** A unit on a chase goes round a car this much slower (m/s) within this reach (m) (POLICE.mode). */
const POLICE_SLOWER_BY = 3;
const POLICE_LOOK = 25;
/** Driving cars ignore the ground; a disturbed or wrecked car is switched onto GROUPS_SOLID so it can tumble and rest. */
const GROUPS_TRAFFIC = interactionGroups(GROUP_DEFAULT, 0xffff & ~GROUP_TERRAIN);
const ZERO = { x: 0, y: 0, z: 0 };

export class Traffic {
  readonly tuning: TrafficTuning;
  readonly capacity: number;
  readonly lanes: LaneTables;
  readonly state: Uint8Array;
  readonly kind: Uint8Array;
  /** What the record looks like and how big it is (bodies.ts; M5.5 slice 19); `kind` is its body's class. */
  readonly body: Uint8Array;
  /** Ambient spawns by body, for the mix pins. */
  readonly bodySpawns = new Uint32Array(BODIES.length);
  /** Pursuit membership, independent of car class; retained on a police wreck until free or swap. */
  readonly police: Uint8Array;
  /** A street race's rival (M5.5 slice 11): drives in the police's driving mode while its race plan holds. */
  readonly racer: Uint8Array;
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
  /** The road's height under the record (the highway's overpasses; M5.5 slice 8) and its grade along, for the transform. */
  readonly y: Float32Array;
  readonly grade: Float32Array;
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
  /** Dents from contacts, 0..1; at 1 the car is a wreck (police take a fraction, `policeArmour`). */
  readonly damage: Float32Array;
  /** Set on the step a car was wrecked by its own damage or one big contact (not by a caller): Life reads it for takedowns. */
  readonly justWrecked: Uint8Array;
  /** 1 = the light bar is on (parked patrols near the player at heat 3+, roadblock cars); the view reads it. */
  readonly lights: Uint8Array;
  /** Collider handle of the player's chassis, so contacts can be attributed. The world refreshes it every step. */
  playerColliderHandle = -1;
  /** Bumps when paint or tint changes so the view reuploads instance colours. */
  paintSerial = 0;
  /** Agents that gave up waiting and entered a junction anyway. */
  waitedPast = 0;
  /** Wrecks towed away since the run began. */
  towedAway = 0;
  guardHops = 0;
  /** An order's wanted car (docs/M5_PLAN.md D7): never despawned or claimed while it is wanted; -1 none. */
  wanted = -1;
  /**
   * The drivers (docs/DESIGN.md §13.8): `pace` the share of the limit drawn at spawn, `gapT` the time gap kept
   * to what is ahead, `bad` a bad driver; `shift` metres to the right of the lane the car is (a flinch, a
   * pull-over, a pass round a dead car, the weave of a bad driver, a lane change easing over).
   */
  readonly pace: Float32Array;
  readonly gapT: Float32Array;
  readonly bad: Uint8Array;
  readonly shift: Float32Array;
  /** Seconds left of a flinch, a pull-over, an angry driver's temper. */
  readonly flinchLeft: Float32Array;
  readonly pullLeft: Float32Array;
  readonly angryLeft: Float32Array;
  /** Going round this dead car (-1 none), metres of the pass left. */
  readonly passAgent: Int16Array;
  /** Per lane: the other lane of the same carriageway (the highway), the lane the other way (a street); -1 none. */
  readonly parallel: Int16Array;
  readonly reverse: Int16Array;
  /** Traffic's share of its target now (the world sets it from the heat, `densityByLevel`). */
  densityScale = 1;
  /** Counters for the pins: lane changes into the fast lane, pull-overs, flinches, passes round a dead car, spawns and spawns with a clone near. */
  overtakes = 0;
  pullOvers = 0;
  flinches = 0;
  gawks = 0;
  spawns = 0;
  clones = 0;

  private readonly transforms: TransformBuffer;
  private readonly target: number;
  private readonly passLeft: Float32Array;
  private readonly stuck: Float32Array;
  private readonly laneCool: Float32Array;
  /** The car that bounded the plan last step: the leader on the lane, the one in the corridor ahead. */
  private readonly leaderAgent: Int16Array;
  private readonly aheadAgent: Int16Array;
  private clock = 0;
  private playerX = 0;
  private playerZ = 0;
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
  private readonly scratchQ2: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly scratchQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly world: RAPIER.World;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly bodyCollider: RAPIER.Collider[] = [];
  private readonly bodyAgent: Int16Array;
  private readonly bodyKind: Int8Array;
  /** Set by closestOn: the agent at the least s on the lane, -1 on an empty lane. */
  private closestAgent = -1;
  private readonly agentBody: Int16Array;
  private readonly reattachLeft: Float32Array;
  private readonly plannerLane: Int16Array;
  private readonly plannerNext: Int16Array;
  private readonly plannerSpeed: Float32Array;
  private readonly ramX: Float32Array;
  private readonly ramZ: Float32Array;
  private readonly ramSpeed: Float32Array;
  private readonly ramAccel: Float32Array;
  /** 1: the plan's point is a place to go to (an arrest slot), not a car to shove: lane gaps no longer hold the unit back. */
  private readonly freeSteer: Uint8Array;
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
    this.body = new Uint8Array(n);
    this.police = new Uint8Array(n);
    this.racer = new Uint8Array(n);
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
    this.y = new Float32Array(n);
    this.grade = new Float32Array(n);
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
    this.damage = new Float32Array(n);
    this.justWrecked = new Uint8Array(n);
    this.lights = new Uint8Array(n);
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
    this.halfW = new Float32Array(BODIES.length);
    this.halfL = new Float32Array(BODIES.length);
    for (let b = 0; b < BODIES.length; b++) {
      this.halfW[b] = (BODIES[b] as (typeof BODIES)[number]).halfWidth;
      this.halfL[b] = (BODIES[b] as (typeof BODIES)[number]).halfLength;
    }
    for (let i = 0; i < n; i++) this.slot[i] = transforms.allocate();
    this.agentBody = new Int16Array(n);
    this.reattachLeft = new Float32Array(n);
    this.agentBody.fill(-1);
    this.plannerLane = new Int16Array(n);
    this.plannerNext = new Int16Array(n);
    this.plannerSpeed = new Float32Array(n);
    this.pace = new Float32Array(n).fill(1);
    this.gapT = new Float32Array(n).fill(1.2);
    this.bad = new Uint8Array(n);
    this.shift = new Float32Array(n);
    this.flinchLeft = new Float32Array(n);
    this.pullLeft = new Float32Array(n);
    this.angryLeft = new Float32Array(n);
    this.passAgent = new Int16Array(n).fill(-1);
    this.passLeft = new Float32Array(n);
    this.stuck = new Float32Array(n);
    this.laneCool = new Float32Array(n);
    this.leaderAgent = new Int16Array(n).fill(-1);
    this.aheadAgent = new Int16Array(n).fill(-1);
    const graphLanes = city.graph.lanes;
    this.parallel = new Int16Array(graphLanes.length).fill(-1);
    this.reverse = new Int16Array(graphLanes.length).fill(-1);
    for (const lane of graphLanes) {
      for (const other of graphLanes) {
        if (other === lane) continue;
        if (lane.highway && other.highway && other.from === lane.from && other.to === lane.to) this.parallel[lane.id] = other.id;
        if (!lane.highway && !other.highway && other.from === lane.to && other.to === lane.from && other.special === lane.special) this.reverse[lane.id] = other.id;
      }
    }
    this.ramX = new Float32Array(n);
    this.ramZ = new Float32Array(n);
    this.ramSpeed = new Float32Array(n);
    this.ramAccel = new Float32Array(n);
    this.freeSteer = new Uint8Array(n);
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

  private colliderDesc(body: number): RAPIER.ColliderDesc {
    const spec = BODIES[body] as (typeof BODIES)[number];
    const mass = this.massOfBody(body);
    // Tall enough to meet the player's chassis (a truck's and a bus's to their shoulders). The body origin stays on the road for the mesh.
    const hy = spec.stretch ? 1.1 : 0.7;
    const w = spec.halfWidth * 2;
    const h = hy * 2;
    const l = spec.halfLength * 2;
    return RAPIER.ColliderDesc.cuboid(spec.halfWidth, hy, spec.halfLength)
      .setTranslation(0, hy, 0)
      // Min wins over the ground's 1.0: a shoved car slides on its tyres, not like a crate
      .setFriction(this.tuning.friction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(this.tuning.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setCollisionGroups(GROUPS_TRAFFIC)
      .setMassProperties(mass, { x: 0, y: hy * 0.5, z: 0 }, {
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

  bodyOf(agent: number): BodyId {
    return BODY_IDS[this.body[agent] as number] as BodyId;
  }

  halfWidthOf(agent: number): number {
    return this.halfW[this.body[agent] as number] as number;
  }

  halfLengthOf(agent: number): number {
    return this.halfL[this.body[agent] as number] as number;
  }

  /** Kg: the body's, or the traffic tuning's class mass for the player's shells. */
  private massOfBody(body: number): number {
    const spec = BODIES[body] as (typeof BODIES)[number];
    return spec.mass > 0 ? spec.mass : this.tuning.mass[spec.car];
  }

  /** Centre spacing two cars keep in a queue: the old fixed gap, longer when their bodies need it (a bus). */
  private spacing(i: number, j: number): number {
    return Math.max(CAR_GAP, (this.halfL[this.body[i] as number] as number) + (this.halfL[this.body[j] as number] as number));
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
  spawnAt(lane: number, s: number, body: BodyId, state: AgentState = AgentState.Kinematic, offset = 0): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.place(i, lane, s, BODY_INDEX[body], offset, state, PAINTS[0] as number);
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

  /** Records in use. */
  get aliveCount(): number {
    return this.alive();
  }

  paintOf(agent: number): number {
    return this.paint[agent] as number;
  }

  /**
   * Guarantees a car of this class and paint `ensureMin`–`ensureMax` m from the
   * player and out of view (docs/M5_PLAN.md D7): an unseen driving civilian of
   * the class in that band is repainted (the nearest, for the shorter hunt),
   * else one is spawned on a lane there through the police spawner's
   * out-of-view search. Returns the agent or -1 (the caller retries).
   */
  ensure(kind: CarId, paint: number, player: PlayerProbe, near: number, cosHalf: number): number {
    const o = BALANCE.jobs.order;
    const min2 = o.ensureMin * o.ensureMin, max2 = o.ensureMax * o.ensureMax;
    const index = KIND_INDEX[kind];
    const radius = Math.hypot(this.halfW[index] as number, this.halfL[index] as number);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.capacity; i++) {
      // the class's own shell: the order names the model the wall shows
      if (this.police[i] !== 0 || this.state[i] !== AgentState.Kinematic || this.body[i] !== index || (this.lane[i] as number) < 0) continue;
      if ((this.plannerLane[i] as number) >= 0) continue;
      const x = this.x[i] as number, z = this.z[i] as number;
      const d = (x - player.x) ** 2 + (z - player.z) ** 2;
      if (d < min2 || d > max2 || d >= bestD) continue;
      if (!this.outOfView(x, z, radius, player, near, cosHalf)) continue;
      best = i;
      bestD = d;
    }
    if (best >= 0) {
      if (this.paint[best] !== paint) {
        this.paint[best] = paint;
        this.paintSerial++;
      }
      return best;
    }
    const lanes = this.lanes;
    for (let attempt = 0; attempt < 96; attempt++) {
      const lane = (this.rng() * lanes.laneCount) | 0;
      const s = this.rng() * (lanes.length[lane] as number);
      lanes.positionAt(lane, s, 0, this.pose);
      const d = (this.pose.x - player.x) ** 2 + (this.pose.z - player.z) ** 2;
      if (d < min2 || d > max2) continue;
      if (!this.outOfView(this.pose.x, this.pose.z, radius, player, near, cosHalf)) continue;
      if (this.nearWorld(this.pose.x, this.pose.z, this.tuning.gapMin + 4)) continue;
      const agent = this.claim(player, near, cosHalf);
      if (agent < 0) return -1;
      this.place(agent, lane, s, index, 0, AgentState.Kinematic, paint);
      return agent;
    }
    return -1;
  }

  /** Only an unseen, undisturbed civilian may give up a full agent slot. `inView`: the roadside ambush, placed where the player sees it. */
  spawnPoliceAt(lane: number, s: number, kind: 'police' | 'sports' | 'heavy', player: PlayerProbe, near: number, cosHalf: number, clearance: number, paint = -1, inView = false): number {
    if (!this.canSpawnAt(lane, s, clearance)) return -1;
    const index = KIND_INDEX[kind];
    const radius = Math.hypot(this.halfW[index] as number, this.halfL[index] as number);
    if (!inView && !this.outOfView(this.pose.x, this.pose.z, radius, player, near, cosHalf)) return -1;
    const agent = this.claim(player, near, cosHalf);
    if (agent < 0) return -1;
    // a heavy in the pursuit is a police van: white like the saloons, with the livery on top
    this.place(agent, lane, s, index, 0, AgentState.Kinematic, paint >= 0 ? paint : kind === 'heavy' ? PLAYER_PAINT.police : PLAYER_PAINT[kind]);
    this.police[agent] = 1;
    return agent;
  }

  /** A free record, or the farthest unseen driving civilian's, freed. -1 when there is neither. */
  claim(player: PlayerProbe, near: number, cosHalf: number): number {
    let agent = this.findFree();
    if (agent >= 0) return agent;
    let farthest = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.police[i] !== 0 || this.racer[i] === 1 || i === this.wanted || (this.state[i] !== AgentState.Kinematic && this.state[i] !== AgentState.Physical)) continue;
      const x = this.x[i] as number, z = this.z[i] as number;
      const r = Math.hypot(this.halfWidthOf(i), this.halfLengthOf(i));
      if (!this.outOfView(x, z, r, player, near, cosHalf)) continue;
      const d = (x - player.x) ** 2 + (z - player.z) ** 2;
      if (d > farthest) { farthest = d; agent = i; }
    }
    if (agent >= 0) this.free(agent);
    return agent;
  }

  /** Knocked loose: a parked car shoved by a breach tumbles with full physics and settles or wrecks like any hit car. */
  disturb(agent: number): void {
    const st = this.state[agent];
    if (st !== AgentState.Parked && st !== AgentState.Abandoned && st !== AgentState.Physical) return;
    this.state[agent] = AgentState.Disturbed;
    this.disturbedFor[agent] = this.tuning.disturbedTime;
    this.lights[agent] = 0;
  }

  /** A parked police car off duty: only when nobody is watching (the caller's check). */
  releaseParked(agent: number): void {
    if (this.police[agent] !== 1 || this.state[agent] !== AgentState.Parked) return;
    this.free(agent);
  }

  /** Off duty: the record goes back to the pool. The caller must have checked nobody is watching. */
  releasePolice(agent: number): void {
    if (this.police[agent] !== 1) return;
    const state = this.state[agent];
    if (state !== AgentState.Kinematic && state !== AgentState.Physical) return;
    this.free(agent);
  }

  /** Bounded planner inputs: a connected exit, speed, and an optional physical ram target. */
  setPolicePlan(agent: number, next: number, speed: number, ramX = 0, ramZ = 0, ramSpeed = 0, ramAccel = 0, free = false): void {
    if (this.police[agent] !== 1) return;
    this.freeSteer[agent] = free ? 1 : 0;
    const lane = this.lane[agent] as number;
    this.plannerLane[agent] = lane;
    this.plannerNext[agent] = lane >= 0 && this.lanes.outs(lane).includes(next) ? next : -1;
    // a unit set on an exit it has not reached yet (a random pick before the plan came) takes the route's instead
    const planned = this.plannerNext[agent];
    if (planned >= 0 && this.next[agent] !== planned && (this.s[agent] as number) < (this.lanes.length[lane] as number)) {
      this.next[agent] = planned;
      this.turn[agent] = this.lanes.straightThrough(lane, planned) ? 0 : 1;
    }
    this.plannerSpeed[agent] = Math.max(0, speed);
    this.ramX[agent] = ramX;
    this.ramZ[agent] = ramZ;
    this.ramSpeed[agent] = Math.max(0, ramSpeed);
    this.ramAccel[agent] = Math.max(0, ramAccel);
  }

  /**
   * A civilian held to a speed (the cold open's candidate alongside the player): the lane limit is replaced
   * by `speed` and the leader and junction rules still apply. `clearPolicePlan` ends it.
   */
  setGuidePlan(agent: number, speed: number): void {
    if (this.police[agent] === 1 || this.state[agent] === AgentState.Free) return;
    this.plannerLane[agent] = this.lane[agent] as number;
    this.plannerNext[agent] = -1;
    // 0 would read as no plan and send it off at the limit
    this.plannerSpeed[agent] = Math.max(0.1, speed);
    this.ramSpeed[agent] = 0;
    this.ramAccel[agent] = 0;
    this.freeSteer[agent] = 0;
  }

  /** A street race's rival on a lane (M5.5 slice 11): a civilian record in the race's paint, the race's plan to follow. */
  spawnRacer(lane: number, s: number, body: BodyId, paint: number): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.place(i, lane, s, BODY_INDEX[body], 0, AgentState.Kinematic, paint);
    this.racer[i] = 1;
    this.bad[i] = 0;
    // a standing start, and a racer's short gap to the car ahead
    this.speed[i] = 0;
    this.gapT[i] = 0.5;
    return i;
  }

  isRacer(agent: number): boolean {
    return this.racer[agent] === 1 && this.state[agent] !== AgentState.Free;
  }

  /** A rival's route and speed for this step: the exit toward the finish, the rubber-banded pace. */
  setRacePlan(agent: number, next: number, speed: number): void {
    if (this.racer[agent] !== 1 || this.state[agent] === AgentState.Free) return;
    const lane = this.lane[agent] as number;
    this.plannerLane[agent] = lane;
    this.plannerNext[agent] = lane >= 0 && this.lanes.outs(lane).includes(next) ? next : -1;
    const planned = this.plannerNext[agent];
    if (planned >= 0 && this.next[agent] !== planned && (this.s[agent] as number) < (this.lanes.length[lane] as number)) {
      this.next[agent] = planned;
      this.turn[agent] = this.lanes.straightThrough(lane, planned) ? 0 : 1;
    }
    this.plannerSpeed[agent] = Math.max(0.1, speed);
  }

  /** The race is over for a rival: it drives on as traffic. */
  endRace(agent: number): void {
    this.racer[agent] = 0;
    this.plannerLane[agent] = -1;
    this.plannerNext[agent] = -1;
    this.plannerSpeed[agent] = 0;
  }

  /** The driving mode (DESIGN.md §13.9): a unit on a chase or a rival in a race runs the junction box, pulls away ×1.5 and goes round slower cars. */
  private fast(i: number): boolean {
    return (this.police[i] === 1 || this.racer[i] === 1) && (this.plannerSpeed[i] as number) > 0;
  }

  /** The speed a unit's plan asks for (0 without a plan). Tests. */
  planSpeed(agent: number): number {
    return this.plannerSpeed[agent] as number;
  }

  clearPolicePlan(agent: number): void {
    this.plannerLane[agent] = -1;
    this.plannerNext[agent] = -1;
    this.plannerSpeed[agent] = 0;
    this.ramSpeed[agent] = 0;
    this.ramAccel[agent] = 0;
    this.freeSteer[agent] = 0;
  }

  /** Test hook: a stopped car (wreck or abandoned) at a point, off the lane graph. */
  spawnAtPoint(x: number, z: number, yaw: number, body: BodyId, state: AgentState.Wrecked | AgentState.Abandoned): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.placeAtPoint(i, x, z, yaw, BODY_INDEX[body], state, PAINTS[0] as number);
    return i;
  }

  /**
   * A stopped police car at a point, off the lane graph: solid when near the
   * player (a lent body like any obstacle), a swap candidate, and counted by
   * the busted rule. Roadblocks and parked patrols (slice 6) and the busted
   * and door-race pins use it.
   */
  spawnParkedPolice(x: number, z: number, yaw: number, kind: 'police' | 'sports' | 'heavy', player: PlayerProbe | null = null, near = 0, cosHalf = 1): number {
    const i = player ? this.claim(player, near, cosHalf) : this.findFree();
    if (i < 0) return -1;
    this.placeAtPoint(i, x, z, yaw, KIND_INDEX[kind], AgentState.Parked, PLAYER_PAINT.police);
    this.police[i] = 1;
    return i;
  }

  /**
   * A parked car drives off along `lane` from `s`, `offset` m to its right (where it
   * stood, so nothing jumps). With a lent body it becomes a driving body in place and
   * turns onto the lane itself; without one the lane follower places it.
   */
  unpark(agent: number, lane: number, s: number, offset = 0): void {
    if (this.state[agent] !== AgentState.Parked) return;
    this.lane[agent] = lane;
    this.next[agent] = -1;
    this.s[agent] = s;
    this.laneOffset[agent] = offset;
    this.speed[agent] = 0;
    this.wait[agent] = 0;
    this.forced[agent] = 0;
    this.turn[agent] = 0;
    const slot = this.agentBody[agent] as number;
    if (slot < 0) {
      this.state[agent] = AgentState.Kinematic;
      return;
    }
    const body = this.bodies[slot] as RAPIER.RigidBody;
    (this.bodyCollider[slot] as RAPIER.Collider).setCollisionGroups(GROUPS_TRAFFIC);
    body.setEnabledTranslations(true, false, true, true);
    body.setAngvel(ZERO, true);
    this.state[agent] = AgentState.Physical;
  }

  private placeAtPoint(i: number, x: number, z: number, yaw: number, body: number, state: AgentState, paint: number): void {
    this.state[i] = state;
    this.racer[i] = 0;
    this.lights[i] = 0;
    this.police[i] = 0;
    this.clearPolicePlan(i);
    this.setBody(i, body);
    this.paint[i] = paint;
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
    this.damage[i] = 0;
    this.justWrecked[i] = 0;
    this.lastPlayerContactTick[i] = -100000;
    this.paintSerial++;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    this.transforms.writeBoth(this.slot[i] as number, x, 0.03, z, q.x, q.y, q.z, q.w);
  }

  /**
   * Car-swap. The agent's car goes to the player (`out` receives its pose,
   * velocity and class); the agent's record becomes the player's old car,
   * standing where the player was: abandoned, or a wreck if the player's car
   * was one. It keeps no lane and is lent a body next step like any obstacle.
   */
  takeOver(agent: number, oldBody: BodyId, oldPaint: number, oldPose: { x: number; y: number; z: number; yaw: number }, oldWrecked: boolean, out: SwapHandover): void {
    const yaw = this.yaw[agent] as number;
    out.x = this.x[agent] as number;
    out.z = this.z[agent] as number;
    out.y = 0.03;
    out.yaw = yaw;
    out.kind = this.kindOf(agent);
    out.body = this.bodyOf(agent);
    out.paint = this.paint[agent] as number;
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
    this.lights[agent] = 0;
    this.clearPolicePlan(agent);
    this.state[agent] = oldWrecked ? AgentState.Wrecked : AgentState.Abandoned;
    this.setBody(agent, BODY_INDEX[oldBody]);
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
    this.damage[agent] = 0;
    this.justWrecked[agent] = 0;
    this.lastPlayerContactTick[agent] = -100000;
    this.shift[agent] = 0;
    this.passAgent[agent] = -1;
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
    this.clock += dt;
    this.playerX = player.x;
    this.playerZ = player.z;
    this.justWrecked.fill(0);
    this.despawn(player);
    this.tow(player, dt);
    this.spawn(player);
    this.releaseNodes(dt);
    for (let i = 0; i < this.capacity; i++) if ((this.agentBody[i] as number) >= 0) this.pullPose(i);
    this.buildLaneLists();
    for (let i = 0; i < this.capacity; i++) {
      const st = this.state[i];
      if (st === AgentState.Free) continue;
      if (st === AgentState.Kinematic || st === AgentState.Physical) this.behave(i, player, dt, events);
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
      const grade = this.grade[i] as number;
      if (grade !== 0) {
        // nose up on a climb: a turn about the car's own left axis
        M.quatSetAxisAngle(this.scratchQ2, 1, 0, 0, -Math.atan(grade));
        M.quatMul(q, q, this.scratchQ2);
      }
      tb.write(slot, this.x[i] as number, (this.y[i] as number) + 0.03, this.z[i] as number, q.x, q.y, q.z, q.w);
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
    const civilian = this.police[i] === 0 && !chasing;
    if (chasing) limit = this.plannerSpeed[i] as number;
    // the driver (DESIGN.md §13.8): their share of the limit and the class's, or an angry one's
    else if (this.police[i] === 0) limit *= this.drive(i);
    if (nxt >= 0 && s >= len - 6 && this.turn[i] === 1) limit = t.speedJunction;
    const yaw = this.yaw[i] as number;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let gap = this.leaderGap(i);
    let blocker = gap < 1e8 ? 1 : 0;
    let aheadSpeed = gap < 1e8 ? this.speedAlong(this.leaderAgent[i] as number, fx, fz) : 0;
    const pGap = chasing && this.hasBody(i) ? Infinity : this.playerGapOf(i, player);
    if (pGap < gap) { gap = pGap; blocker = 2; aheadSpeed = Math.max(0, player.vx * fx + player.vz * fz); }
    const aGap = this.aheadGap(i);
    if (aGap < gap) { gap = aGap; blocker = 3; aheadSpeed = this.speedAlong(this.aheadAgent[i] as number, fx, fz); }
    let desired = limit;
    if (gap < 1e8) {
      // stop in time for what is ahead at its speed, and keep this driver's time gap behind it
      const room = Math.max(0, gap - t.gapMin);
      desired = Math.min(limit, Math.sqrt(aheadSpeed * aheadSpeed + 2 * t.brake * room), room / (this.gapT[i] as number));
    }
    if (desired >= limit) blocker = 0;
    if (civilian && (this.flinchLeft[i] as number) > 0) {
      desired = 0;
      blocker = 2;
    } else if (civilian && (this.pullLeft[i] as number) > 0 && desired > t.pullOver.speed) {
      desired = t.pullOver.speed;
    } else if (civilian && (this.passAgent[i] as number) >= 0 && -(this.shift[i] as number) < 2.5 && desired > 2) {
      // going round a dead car: a crawl until it is out beside it
      desired = 2;
    }
    // A lent body braking for the line creeps a little past it; within the tolerance it is still at the line.
    const entering = nxt >= 0 && s <= len + STOP_TOLERANCE;
    if (!entering) this.wait[i] = 0;
    const waitLimit = this.bad[i] === 1 ? t.temper.badClaimAfter : t.junctionWait;
    if (entering && !this.mayEnter(i, player)) {
      const w = this.wait[i] as number;
      if (w < waitLimit && w + dt >= waitLimit) {
        this.waitedPast++;
        events.push('honk', 0, this.x[i] as number, 0.03, this.z[i] as number, i);
      }
      this.wait[i] = w + dt;
      if (w + dt < waitLimit) {
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
    const unit = this.fast(i) ? POLICE_ACCEL : 1;
    const brake = ((this.flinchLeft[i] as number) > 0 ? t.flinch.brake : t.brake) * unit;
    this.speed[i] = speed < desired ? Math.min(desired, speed + t.accel * unit * dt) : Math.max(0, Math.max(desired, speed - brake * dt));
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
        const gap = this.closestAgent >= 0 ? this.spacing(i, this.closestAgent) : CAR_GAP;
        if (closest < over + gap + 0.3) {
          s = len + conn - Math.max(0.3, gap + 0.3 - closest);
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
    // a pass round a dead car is on the lane it was stopped on
    this.passAgent[i] = -1;
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
      // a ram still keeps its lane gaps; a unit driving to an arrest slot steers straight there
      desired = this.freeSteer[i] === 1 ? (this.ramSpeed[i] as number) : Math.min(desired, this.ramSpeed[i] as number);
    } else {
      this.lanes.positionAt(lane, (this.s[i] as number) + CARROT, this.laneOffset[i] as number, this.pose, this.next[i]);
      this.addShift(i, this.pose);
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
    // on an overpass's ramp the body rides at the road's height: its height is held, not simulated
    const h = this.lanes.heightAt(lane, this.s[i] as number);
    this.y[i] = h;
    body.translation(this.pos);
    if (Math.abs(this.pos.y - (h + 0.03)) > 0.001) {
      this.pos.y = h + 0.03;
      body.setTranslation(this.pos, true);
    }
    // Heading: a first-order controller with a rate cap (stable while yawGain × dt < 1).
    // Moving, the nose follows the motion so the car never crabs; stopped, it turns toward the path.
    body.angvel(this.ang);
    // a unit parked on its arrest slot holds its heading instead of turning to face a point under its own nose
    const arrived = ramming && len < 1.5;
    const moving = !turningBack && !arrived && Math.hypot(this.lin.x, this.lin.z) > 1.5;
    const headTarget = arrived ? yaw : moving ? Math.atan2(this.lin.x, this.lin.z) : Math.atan2(dx, dz);
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
    this.leaderAgent[i] = -1;
    let self = -1;
    for (let k = 0; k < count; k++) if (this.laneIndex[base + k] === i) { self = k; break; }
    if (self >= 0) {
      for (let k = self + 1; k < count; k++) {
        const other = this.laneIndex[base + k] as number;
        if (this.passable(i, other)) continue;
        this.leaderAgent[i] = other;
        return (this.s[other] as number) - (this.s[i] as number) - this.spacing(i, other);
      }
    }
    const nxt = this.next[i] as number;
    if (nxt < 0) return Infinity;
    const nCount = this.laneFill[nxt] as number;
    const nBase = nxt * MAX_ON_LANE;
    for (let k = 0; k < nCount; k++) {
      const other = this.laneIndex[nBase + k] as number;
      if ((this.s[other] as number) > 20) break;
      if (this.passable(i, other)) continue;
      const remain = (this.lanes.length[lane] as number) - (this.s[i] as number);
      this.leaderAgent[i] = other;
      return remain + this.lanes.connectionLength(lane, nxt, this.laneOffset[i]) + (this.s[other] as number) - this.spacing(i, other);
    }
    return Infinity;
  }

  /** What a car does not wait behind: the dead car it is going round; for a unit on a chase, a car pulling over for it. */
  private passable(i: number, other: number): boolean {
    if (other === this.passAgent[i]) return true;
    return this.fast(i) && this.police[other] === 0
      && (this.pullLeft[other] as number) > 0 && (this.shift[other] as number) >= 1;
  }

  /** An agent's speed along a heading, never below 0 (a car crossing is not going our way); 0 for none. */
  private speedAlong(j: number, fx: number, fz: number): number {
    if (j < 0) return 0;
    const st = this.state[j];
    if (st !== AgentState.Kinematic && st !== AgentState.Physical) return 0;
    const yaw = this.yaw[j] as number;
    return Math.max(0, (this.speed[j] as number) * (Math.sin(yaw) * fx + Math.cos(yaw) * fz));
  }

  /** Along-lane distance to the player when the player is the leader. The stop band is `gapMin`. */
  private playerGapOf(i: number, player: PlayerProbe): number {
    const lane = this.lane[i] as number;
    this.lanes.projectPath(lane, this.next[i] as number, player.x, player.z, this.proj);
    if (this.proj.switched) return Infinity;
    const along = this.proj.s - (this.s[i] as number);
    const lateral = this.proj.lateral - (this.laneOffset[i] as number) - (this.shift[i] as number);
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
    this.aheadAgent[i] = -1;
    for (let j = 0; j < this.capacity; j++) {
      if (j === i || this.state[j] === AgentState.Free || this.passable(i, j)) continue;
      const dx = (this.x[j] as number) - x;
      const dz = (this.z[j] as number) - z;
      const along = dx * fx + dz * fz;
      if (along < 2 || along > 14) continue;
      if (Math.abs(dx * rx + dz * rz) > half) continue;
      const spare = along - this.spacing(i, j);
      if (spare < gap) { gap = spare; this.aheadAgent[i] = j; }
    }
    return gap;
  }

  // ---- junctions -------------------------------------------------------------------

  private mayEnter(i: number, player: PlayerProbe): boolean {
    const t = this.tuning;
    if (this.forced[i] === 1) return true;
    // the police driving mode (DESIGN.md §13.9): a unit on a chase runs the box, and so does a racing rival
    if (this.fast(i)) return true;
    if ((this.wait[i] as number) >= (this.bad[i] === 1 ? t.temper.badClaimAfter : t.junctionWait)) {
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
    // an angry driver takes the way out nearest the player (DESIGN.md §13.8)
    if ((this.angryLeft[i] as number) > 0 && this.police[i] === 0) {
      let best = -1, bestD = Infinity;
      for (let k = 0; k < outs.length; k++) {
        const id = outs[k] as number;
        if (id === uturn) continue;
        const d = ((this.lanes.midX[id] as number) - this.playerX) ** 2 + ((this.lanes.midZ[id] as number) - this.playerZ) ** 2;
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best >= 0) {
        this.next[i] = best;
        this.turn[i] = this.lanes.straightThrough(lane, best) ? 0 : 1;
        return;
      }
    }
    // the bus goes straight on where it can (GTA's buses avoid junction turns)
    if ((BODIES[this.body[i] as number] as (typeof BODIES)[number]).keepsLane) {
      for (let k = 0; k < outs.length; k++) {
        const id = outs[k] as number;
        if (id === uturn || !this.lanes.straightThrough(lane, id)) continue;
        this.next[i] = id;
        this.turn[i] = 0;
        return;
      }
    }
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
      } else if (st === AgentState.Abandoned || st === AgentState.Parked) {
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
      if (st !== AgentState.Kinematic && st !== AgentState.Wrecked && st !== AgentState.Abandoned && st !== AgentState.Parked) continue;
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
    const shape = this.body[i] as number;
    let col = this.bodyCollider[slot] as RAPIER.Collider;
    if ((this.bodyKind[slot] as number) !== shape) {
      this.colliderAgent.delete(col.handle);
      this.world.removeCollider(col, false);
      col = this.world.createCollider(this.colliderDesc(shape), body);
      this.bodyCollider[slot] = col;
      this.bodyKind[slot] = shape;
    }
    this.colliderAgent.set(col.handle, i);
    body.userData = i;
    const yaw = this.yaw[i] as number;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    const driving = this.state[i] === AgentState.Kinematic;
    body.setEnabled(true);
    this.pos.x = this.x[i] as number;
    this.pos.y = (this.y[i] as number) + 0.03;
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
    const mass = this.massOfBody(this.body[i] as number);
    const dv = this.contactSum / mass;
    this.contactDv[i] = dv;
    this.playerDv[i] = this.playerSum / mass;
    this.wallDv[i] = this.wallSum / mass;
    this.trafficDv[i] = this.trafficSum / mass;
    const st = this.state[i];
    if (st === AgentState.Wrecked || st === AgentState.Abandoned || st === AgentState.Parked) return;
    const t = this.tuning;
    // a police car takes a harder hit to shake and a much harder one to kill
    const armour = this.police[i] === 1 ? t.policeArmour : 1;
    if (dv > t.damageThreshold) this.damage[i] = Math.min(1, (this.damage[i] as number) + (dv - t.damageThreshold) * t.damagePerDv / armour);
    if (dv >= t.wreckImpact * armour || (this.damage[i] as number) >= 1) {
      this.wreck(i);
      this.justWrecked[i] = 1;
      return;
    }
    if (dv > t.disturbedImpact * armour) {
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

  /**
   * After a disturbance an upright car that has stopped spinning drives back
   * onto its path at whatever speed (the controller blends in over
   * `reattachBlend`). A car on its side, pushed far off its road, or still
   * tumbling after `disturbedMax` is a wreck. A shove is not a kill.
   */
  private settle(i: number, dt: number): void {
    const t = this.tuning;
    this.disturbedFor[i] = (this.disturbedFor[i] as number) - dt;
    if ((this.disturbedFor[i]) > 0) return;
    const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
    const r = body.rotation(this.rot);
    const up = 1 - 2 * (r.x * r.x + r.z * r.z);
    body.angvel(this.ang);
    const spin = Math.abs(this.ang.y);
    const lane = this.lane[i] as number;
    let lateral = Infinity;
    if (lane >= 0) {
      this.lanes.projectPath(lane, this.next[i] as number, this.x[i] as number, this.z[i] as number, this.proj, this.laneOffset[i]);
      lateral = Math.abs(this.proj.lateral);
    }
    const overdue = -this.disturbedFor[i] > t.disturbedMax - t.disturbedTime;
    if (up > 0.7 && spin > t.settleSpin && !overdue) return;
    if (up > 0.7 && lateral < t.reattachDistance) {
      this.state[i] = AgentState.Physical;
      this.reattachLeft[i] = this.tuning.reattachBlend;
      if (this.proj.switched) this.switchLane(i, this.proj.s);
      else this.s[i] = this.proj.s;
      const col = this.bodyCollider[this.agentBody[i] as number] as RAPIER.Collider;
      col.setCollisionGroups(GROUPS_TRAFFIC);
      body.setEnabledTranslations(true, false, true, true);
      this.pos.x = this.x[i] as number;
      this.pos.y = (lane >= 0 ? this.lanes.heightAt(lane, this.s[i] as number) : 0) + 0.03;
      this.pos.z = this.z[i] as number;
      body.setTranslation(this.pos, true);
      // back on four wheels: keep the heading, drop the lean and the roll
      body.setRotation(M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, this.yaw[i] as number), true);
      this.ang.x = 0;
      this.ang.z = 0;
      body.setAngvel(this.ang, true);
    } else if (up <= 0.7 && up > 0.3 && !overdue) {
      // tilted but not over (a wheel on a kerb, a landing): give it a moment
      return;
    } else {
      this.wreck(i);
      this.justWrecked[i] = 1;
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

  /** The record's body and, with it, its class. */
  private setBody(i: number, body: number): void {
    this.body[i] = body;
    this.kind[i] = KIND_INDEX[(BODIES[body] as (typeof BODIES)[number]).car];
  }

  private place(i: number, lane: number, s: number, body: number, offset: number, state: AgentState, paint: number): void {
    this.state[i] = state;
    this.racer[i] = 0;
    this.drawDriver(i);
    this.lights[i] = 0;
    this.police[i] = 0;
    this.clearPolicePlan(i);
    this.contactDv[i] = 0;
    this.playerDv[i] = 0;
    this.wallDv[i] = 0;
    this.trafficDv[i] = 0;
    this.setBody(i, body);
    this.paint[i] = paint;
    this.lane[i] = lane;
    this.next[i] = -1;
    this.s[i] = s;
    this.laneOffset[i] = offset;
    const stopped = state === AgentState.Wrecked || state === AgentState.Abandoned || state === AgentState.Parked;
    this.speed[i] = stopped ? 0 : (this.lanes.limit[lane] as number);
    this.wait[i] = 0;
    this.forced[i] = 0;
    this.wobble[i] = 0;
    this.turn[i] = 0;
    this.honkCooldown[i] = 0;
    this.disturbedFor[i] = 0;
    this.wreckedFor[i] = 0;
    this.damage[i] = 0;
    this.justWrecked[i] = 0;
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
    this.racer[i] = 0;
    this.lights[i] = 0;
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
      // a race's rivals race on however far behind the player is
      if (this.state[i] === AgentState.Free || this.police[i] === 1 || this.racer[i] === 1 || i === this.wanted) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      if (dx * dx + dz * dz > r2) this.free(i);
    }
  }

  private spawn(player: PlayerProbe): void {
    for (let n = 0; n < 4 && this.alive() < this.target * this.densityScale; n++) {
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
      // the city's own cars (DESIGN.md §13.11): buses on the avenues, trucks in the Works, taxis round the tower
      const id = pickBody(this.rng(), districtAt(lanes.midX[lane] as number, lanes.midZ[lane] as number).id, this.roadKind(lane), t.bodies);
      const body = BODY_INDEX[id];
      const spec = BODIES[body] as (typeof BODIES)[number];
      const extra = Math.max(0, spec.halfLength - CAR_GAP / 2);
      if (this.nearOnLane(lane, s, t.gapMin + 8 + extra)) continue;
      const offset = this.pickOffset(lane);
      lanes.positionAt(lane, s, offset, this.pose);
      if (this.nearWorld(this.pose.x, this.pose.z, 10 + extra)) continue;
      const i = this.findFree();
      if (i < 0) return false;
      const paints = spec.paints;
      let paint = paints[(this.rng() * paints.length) | 0] as number;
      // no two of a body in one paint near each other (GTA's clone cap); a taxi is yellow like every taxi
      if (paints.length > 1) {
        for (let r = 0; r < 6 && this.cloneNear(body, paint, this.pose.x, this.pose.z); r++) paint = paints[(this.rng() * paints.length) | 0] as number;
        if (this.cloneNear(body, paint, this.pose.x, this.pose.z)) this.clones++;
      }
      this.spawns++;
      this.bodySpawns[body] = (this.bodySpawns[body] as number) + 1;
      this.place(i, lane, s, body, offset, AgentState.Kinematic, paint);
      return true;
    }
    return false;
  }

  /** The road a lane belongs to, read off its limit (every kind has its own). */
  private roadKind(lane: number): RoadKind {
    const t = this.tuning, limit = this.lanes.limit[lane] as number;
    return limit === t.speedHighway ? 'highway' : limit === t.speedAvenue ? 'avenue' : limit === t.speedService ? 'service'
      : limit === t.speedParkway ? 'parkway' : limit === t.speedQuay ? 'quay' : 'street';
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
          const gap = this.spacing(i, j);
          if (dist >= gap || Math.abs((this.y[i] as number) - (this.y[j] as number)) > 3) continue;
          // side by side (a pass, a pull-over, a lane change easing over): not in each other's spacing
          const across = Math.abs(dx * -Math.cos(this.yaw[i] as number) + dz * Math.sin(this.yaw[i] as number));
          if (across > (this.halfW[this.body[i] as number] as number) + (this.halfW[this.body[j] as number] as number) + 0.3) continue;
          const same = this.lane[i] === this.lane[j];
          const jAhead = same
            ? ((this.s[j] as number) > (this.s[i] as number) || ((this.s[j] as number) === (this.s[i] as number) && j < i))
            : dx * Math.sin(this.yaw[i] as number) + dz * Math.cos(this.yaw[i] as number) > 0;
          if (!jAhead) continue;
          const deficit = gap - dist + 0.2;
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

  /** The least `s` on a lane; `closestAgent` is whose it is (-1 on an empty lane). */
  private closestOn(lane: number): number {
    let best = Infinity;
    this.closestAgent = -1;
    for (let j = 0; j < this.capacity; j++) {
      if (this.state[j] === AgentState.Free || this.lane[j] !== lane) continue;
      const sj = this.s[j] as number;
      if (sj < best) { best = sj; this.closestAgent = j; }
    }
    return best;
  }

  private reposition(i: number): void {
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    this.lanes.positionAt(lane, this.s[i] as number, this.laneOffset[i] as number, this.pose, this.next[i]);
    this.addShift(i, this.pose);
    this.x[i] = this.pose.x;
    this.z[i] = this.pose.z;
    this.yaw[i] = this.pose.yaw;
    this.y[i] = this.pose.y ?? 0;
    this.grade[i] = this.pose.grade ?? 0;
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
    const body = this.body[i] as number;
    return Math.abs(side) <= (this.halfW[body] as number) + player.halfWidth
      && Math.abs(along) <= (this.halfL[body] as number) + player.halfLength
      // the player on a bridge over it (or under one) is not on top of it
      && Math.abs(player.y - 0.5 - (this.y[i] as number)) < 2.5;
  }

  /** Metres to the right of a pose, the car's shift across its lane. */
  private addShift(i: number, pose: LanePose): void {
    const sh = this.shift[i] as number;
    if (sh === 0) return;
    pose.x -= Math.cos(pose.yaw) * sh;
    pose.z += Math.sin(pose.yaw) * sh;
  }

  /** The driver at spawn: the pace, the time gap, a bad one now and then. */
  private drawDriver(i: number): void {
    const t = this.tuning;
    const roll = this.rng();
    let acc = 0, pace = t.pace.values[t.pace.values.length - 1] ?? 1;
    for (let k = 0; k < t.pace.values.length; k++) {
      acc += t.pace.weights[k] ?? 0;
      if (roll < acc) { pace = t.pace.values[k] ?? 1; break; }
    }
    this.pace[i] = pace;
    const bad = this.rng() < t.temper.badShare;
    this.bad[i] = bad ? 1 : 0;
    this.gapT[i] = bad ? t.temper.badGap : t.temper.gapTime[0] + this.rng() * (t.temper.gapTime[1] - t.temper.gapTime[0]);
    this.shift[i] = 0;
    this.flinchLeft[i] = 0;
    this.pullLeft[i] = 0;
    this.angryLeft[i] = 0;
    this.passAgent[i] = -1;
    this.passLeft[i] = 0;
    this.stuck[i] = 0;
    this.laneCool[i] = 0;
    this.leaderAgent[i] = -1;
    this.aheadAgent[i] = -1;
  }

  /** This driver's share of the lane's limit: the pace drawn at spawn and the class's, or the angry driver's. */
  private drive(i: number): number {
    const t = this.tuning;
    if ((this.angryLeft[i] as number) > 0) return t.angry.pace;
    const spec = BODIES[this.body[i] as number] as (typeof BODIES)[number];
    return (this.pace[i] as number) * (spec.pace > 0 ? spec.pace : t.classPace[spec.car] ?? 1);
  }

  /** A car nobody drives any more: a wreck, an abandoned car. */
  private dead(j: number): boolean {
    const st = this.state[j];
    return st === AgentState.Wrecked || st === AgentState.Abandoned;
  }

  /**
   * A driver's reactions this step (DESIGN.md §13.8), before the plan: the flinch at the player coming
   * head-on, the pull-over for a lit unit behind, the angry driver, the pass round a dead car, the
   * overtake on the highway; they set where across its lane the car wants to be, and the caps the plan
   * reads. A unit on a chase only swings out round a car pulling over for it; a guided car keeps its lane.
   */
  private behave(i: number, player: PlayerProbe, dt: number, events: EventLog): void {
    const t = this.tuning;
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    const len = this.lanes.length[lane] as number;
    const s = this.s[i] as number;
    if (this.police[i] === 1 || (this.plannerSpeed[i] as number) > 0) {
      let target = 0;
      if (this.fast(i)) {
        // the police driving mode (DESIGN.md §13.9): round a slower car on the oncoming side (or the other lane
        // of the highway), round a car pulling over for it
        const pass = this.passAgent[i] as number;
        if (pass >= 0) {
          this.passLeft[i] = (this.passLeft[i] as number) - (this.speed[i] as number) * dt;
          if ((this.passLeft[i]) <= 0 || this.state[pass] === AgentState.Free) this.passAgent[i] = -1;
        } else {
          const lead = this.leaderAgent[i] as number;
          if (lead >= 0 && this.police[lead] === 0 && this.lane[lead] === lane) {
            const gapL = (this.s[lead] as number) - s;
            if (gapL > 0 && gapL < POLICE_LOOK && (this.plannerSpeed[i] as number) - (this.speed[lead] as number) > POLICE_SLOWER_BY) {
              const par = this.parallel[lane] as number;
              const rev = this.reverse[lane] as number;
              if (par >= 0) {
                const sp = s * (this.lanes.length[par] as number) / len;
                if ((this.next[i] as number) < 0 && this.laneClear(par, sp, (this.speed[i] as number) * 0.8 + 8)) this.changeLane(i, par, sp);
              } else if (rev >= 0 && this.oncomingClear(rev, (this.lanes.length[rev] as number) - s, 60)) {
                this.passAgent[i] = lead;
                this.passLeft[i] = gapL + 15;
              }
            }
          }
        }
        if ((this.passAgent[i] as number) >= 0) target = -2 * (this.lanes.offset[this.lane[i] as number] as number);
        else if (this.pullingAhead(i, lane, s)) target = -t.pullOver.offset;
      }
      this.ease(i, target, dt);
      return;
    }
    this.flinchLeft[i] = Math.max(0, (this.flinchLeft[i] as number) - dt);
    this.pullLeft[i] = Math.max(0, (this.pullLeft[i] as number) - dt);
    this.angryLeft[i] = Math.max(0, (this.angryLeft[i] as number) - dt);
    this.laneCool[i] = Math.max(0, (this.laneCool[i] as number) - dt);
    const yaw = this.yaw[i] as number;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const x = this.x[i] as number, z = this.z[i] as number;
    const speed = this.speed[i] as number;

    // the flinch: the player coming at it head-on in its lane
    const dx = player.x - x, dz = player.z - z;
    const along = dx * fx + dz * fz;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw) - (this.shift[i] as number);
    const toward = -(player.vx * fx + player.vz * fz);
    if (along > 3 && along < 60 && Math.abs(side) < 2.8 && toward > 4 && along / (speed + toward) < t.flinch.seconds) {
      if ((this.flinchLeft[i]) <= 0) {
        this.flinches++;
        if ((this.honkCooldown[i] as number) <= 0) {
          events.push('honk', 0, x, 0.03, z, i);
          this.honkCooldown[i] = t.honkCooldown;
        }
      }
      this.flinchLeft[i] = t.flinch.hold;
    }

    // the pull-over: a lit police car close behind on its lane
    if (this.litBehind(i, lane, s)) {
      if ((this.pullLeft[i]) <= 0) this.pullOvers++;
      this.pullLeft[i] = t.pullOver.hold;
    }

    // the angry driver: bumped by the player, one in ten goes after them
    if ((this.playerDv[i] as number) > 1.5 && (this.angryLeft[i]) <= 0 && this.rng() < t.angry.share) {
      this.angryLeft[i] = t.angry.seconds;
      this.honkCooldown[i] = 0;
    }
    if ((this.angryLeft[i]) > 0 && (this.honkCooldown[i] as number) <= 0 && dx * dx + dz * dz < 40 * 40) {
      events.push('honk', 0, x, 0.03, z, i);
      this.honkCooldown[i] = t.angry.honkEvery;
    }

    // the gawk: stopped behind a dead car, then round it on the oncoming side when that is clear
    const pass = this.passAgent[i] as number;
    if (pass >= 0) {
      this.passLeft[i] = (this.passLeft[i] as number) - speed * dt;
      if ((this.passLeft[i]) <= 0 || !this.dead(pass)) this.passAgent[i] = -1;
    } else {
      const b = this.blocker[i] === 1 ? this.leaderAgent[i] as number : this.blocker[i] === 3 ? this.aheadAgent[i] as number : -1;
      const at = b >= 0 && this.dead(b) ? ((this.x[b] as number) - x) * fx + ((this.z[b] as number) - z) * fz - this.spacing(i, b) : Infinity;
      if (speed < 2 && at < t.gapMin + 2.5) {
        this.stuck[i] = (this.stuck[i] as number) + dt;
        const rev = this.reverse[lane] as number;
        if ((this.stuck[i]) >= t.gawk.wait && rev >= 0 && this.oncomingClear(rev, (this.lanes.length[rev] as number) - s, t.gawk.clearAhead)) {
          const ahead = ((this.x[b] as number) - x) * fx + ((this.z[b] as number) - z) * fz;
          this.passAgent[i] = b;
          this.passLeft[i] = Math.max(0, ahead) + 12;
          this.stuck[i] = 0;
          this.gawks++;
        }
      } else {
        this.stuck[i] = 0;
      }
    }

    // the overtake: two lanes a direction; into the other lane past a slower car, back when clear
    const spec = BODIES[this.body[i] as number] as (typeof BODIES)[number];
    const other = spec.keepsLane ? -1 : this.parallel[lane] as number;
    if (other >= 0 && (this.laneCool[i]) <= 0 && (this.flinchLeft[i]) <= 0 && (this.pullLeft[i]) <= 0
      && (this.passAgent[i] as number) < 0 && s > 10 && s < len - t.overtake.endClear && (this.next[i] as number) < 0) {
      const slowLane = (this.lanes.offset[lane] as number) > (this.lanes.offset[other] as number);
      const want = (this.lanes.limit[lane] as number) * this.drive(i);
      const so = s * (this.lanes.length[other] as number) / len;
      const room = Math.max(speed, want) * t.overtake.clear + 8;
      const slowerBy = t.overtake.slowerBy * spec.hops;
      if (slowLane) {
        if (this.slowerAhead(lane, s, want - slowerBy, t.overtake.look) && this.laneClear(other, so, room)) {
          this.changeLane(i, other, so);
          this.overtakes++;
        }
      } else if (this.laneClear(other, so, room) && !this.slowerAhead(other, so, want - slowerBy, t.overtake.look)) {
        this.changeLane(i, other, so);
      }
    }

    // where across the lane it wants to be
    let target = 0;
    if ((this.passAgent[i] as number) >= 0) target = -2 * (this.lanes.offset[this.lane[i] as number] as number);
    else if ((this.flinchLeft[i]) > 0) target = t.flinch.offset;
    else if ((this.pullLeft[i]) > 0 && !spec.big) target = t.pullOver.offset;
    else if (this.bad[i] === 1) target = t.temper.badDrift * Math.sin(this.clock * 0.9 + i * 1.7);
    this.ease(i, target, dt);
  }

  /** The shift toward where the car wants to be across its lane, at `shiftRate`. */
  private ease(i: number, target: number, dt: number): void {
    const cur = this.shift[i] as number;
    if (cur === target) return;
    const step = this.tuning.shiftRate * dt;
    this.shift[i] = cur + Math.max(-step, Math.min(step, target - cur));
  }

  /** A lit police car (a light bar on, or a unit on a plan) behind on this lane within `pullOver.behind`. */
  private litBehind(i: number, lane: number, s: number): boolean {
    const count = this.laneFill[lane] as number;
    const base = lane * MAX_ON_LANE;
    const reach = this.tuning.pullOver.behind;
    for (let k = 0; k < count; k++) {
      const j = this.laneIndex[base + k] as number;
      if (j === i) break;
      if (s - (this.s[j] as number) > reach) continue;
      if (this.police[j] !== 1) continue;
      const st = this.state[j];
      if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
      if (this.lights[j] === 1 || (this.plannerSpeed[j] as number) > 0) return true;
    }
    return false;
  }

  /** A civilian pulling over just ahead of this unit on its lane: the unit swings out round it. */
  private pullingAhead(i: number, lane: number, s: number): boolean {
    const count = this.laneFill[lane] as number;
    const base = lane * MAX_ON_LANE;
    for (let k = 0; k < count; k++) {
      const j = this.laneIndex[base + k] as number;
      if (j === i || this.police[j] === 1) continue;
      const d = (this.s[j] as number) - s;
      if (d > 0 && d < 25 && (this.pullLeft[j] as number) > 0) return true;
    }
    return false;
  }

  /** Nothing on the lane the other way from `sAt` (in that lane's metres) to `ahead` m before it. */
  private oncomingClear(rev: number, sAt: number, ahead: number): boolean {
    const count = this.laneFill[rev] as number;
    const base = rev * MAX_ON_LANE;
    for (let k = 0; k < count; k++) {
      const s = this.s[this.laneIndex[base + k] as number] as number;
      if (s > sAt - ahead && s < sAt + 5) return false;
    }
    return true;
  }

  /** A car on a lane within `look` m ahead of `s` slower than `below`. */
  private slowerAhead(lane: number, s: number, below: number, look: number): boolean {
    const count = this.laneFill[lane] as number;
    const base = lane * MAX_ON_LANE;
    for (let k = 0; k < count; k++) {
      const j = this.laneIndex[base + k] as number;
      const d = (this.s[j] as number) - s;
      if (d <= 1 || d > look) continue;
      if ((this.speed[j] as number) < below) return true;
    }
    return false;
  }

  /** Nothing on a lane within `room` m of `s`, ahead or behind. */
  private laneClear(lane: number, s: number, room: number): boolean {
    const count = this.laneFill[lane] as number;
    const base = lane * MAX_ON_LANE;
    for (let k = 0; k < count; k++) {
      if (Math.abs((this.s[this.laneIndex[base + k] as number] as number) - s) < room) return false;
    }
    return true;
  }

  /** Over to the other lane of the carriageway, where it is: the shift eases it across. */
  private changeLane(i: number, to: number, s: number): void {
    const from = this.lane[i] as number;
    this.shift[i] = (this.shift[i] as number) + (this.lanes.offset[from] as number) - (this.lanes.offset[to] as number);
    this.releaseHolds(i);
    this.lane[i] = to;
    this.s[i] = s;
    this.next[i] = -1;
    this.turn[i] = 0;
    this.wait[i] = 0;
    this.laneCool[i] = this.tuning.overtake.cooldown;
  }

  /** A car of this class in this paint within `cloneDistance` of a point. */
  private cloneNear(body: number, paint: number, x: number, z: number): boolean {
    const r2 = this.tuning.cloneDistance * this.tuning.cloneDistance;
    for (let j = 0; j < this.capacity; j++) {
      if (this.state[j] === AgentState.Free || this.body[j] !== body || this.paint[j] !== paint) continue;
      const dx = (this.x[j] as number) - x, dz = (this.z[j] as number) - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
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
    const body = this.body[i] as number;
    const ex = Math.max(0, Math.abs(side) - (this.halfW[body] as number) - player.halfWidth);
    const ez = Math.max(0, Math.abs(along) - (this.halfL[body] as number) - player.halfLength);
    if (ex * ex + ez * ez > 4) return;
    const rel = Math.hypot(player.vx - (this.speed[i] as number) * fx, player.vz - (this.speed[i] as number) * fz);
    if (rel <= 8) return;
    events.push('honk', 0, this.x[i] as number, 0.03, this.z[i] as number, i);
    this.honkCooldown[i] = this.tuning.honkCooldown;
    this.wobble[i] = this.tuning.wobbleTime;
  }
}
