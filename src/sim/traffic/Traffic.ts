/**
 * Pooled traffic on the road graph. This slice is kinematic: agents follow
 * lane polylines and cached junction curves. Rapier bodies arrive with the
 * simulation LOD.
 *
 * Straight-through highway traffic does not take a junction reservation.
 * Every agent still brakes for a car sitting ahead of it inside 14 m, so a
 * pair the reservation does not cover cannot overlap.
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
import { LaneTables, type LanePose, type LaneProjection } from './lanes';
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

const KINDS: CarId[] = ['muscle', 'compact', 'heavy'];
const KIND_INDEX: Record<CarId, number> = { muscle: 0, compact: 1, heavy: 2 };
const PAINTS = [
  PALETTE.carLime, PALETTE.carBlue, PALETTE.carOrange, PALETTE.carMagenta,
  PALETTE.carWhite, PALETTE.carBlack, CITY_COLORS.mint, CITY_COLORS.peach,
];
/** Centre spacing subtracted when one agent follows another on a lane. */
const CAR_GAP = 4.5;
const MAX_ON_LANE = 48;
const WOBBLE_RAD = 5 * Math.PI / 180;
/** Driving cars ignore the ground; a disturbed car is switched onto GROUPS_SOLID so it can tumble. */
const GROUPS_TRAFFIC = interactionGroups(GROUP_DEFAULT, 0xffff & ~GROUP_TERRAIN);

export class Traffic {
  readonly tuning: TrafficTuning;
  readonly capacity: number;
  readonly lanes: LaneTables;
  readonly state: Uint8Array;
  readonly kind: Uint8Array;
  readonly paint: Uint32Array;
  readonly slot: Int16Array;
  readonly lane: Int16Array;
  readonly next: Int16Array;
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
  /** Bumps when paint is assigned so the view reuploads instance colours. */
  paintSerial = 0;
  /** Agents that gave up waiting and entered a junction anyway. */
  waitedPast = 0;
  guardHops = 0;

  private readonly transforms: TransformBuffer;
  private readonly target: number;
  private readonly rng: () => number;
  private readonly nodes: RoadNode[];
  private readonly nodeHolder: Int32Array;
  private readonly nodeHoldFor: Float32Array;
  private readonly wait: Float32Array;
  private readonly wobble: Float32Array;
  private readonly turn: Uint8Array;
  private readonly laneFill: Uint8Array;
  private readonly laneIndex: Int16Array;
  private readonly halfW: Float32Array;
  private readonly halfL: Float32Array;
  private readonly colliderAgent = new Map<number, number>();
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0 };
  private readonly scratchQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly world: RAPIER.World;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly bodyCollider: RAPIER.Collider[] = [];
  private readonly bodyAgent: Int16Array;
  private readonly bodyKind: Int8Array;
  private readonly agentBody: Int16Array;
  private readonly reattachLeft: Float32Array;
  private readonly lin = { x: 0, y: 0, z: 0 };
  private readonly ang = { x: 0, y: 0, z: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  private contactSum = 0;
  private currentCol: RAPIER.Collider | null = null;
  private readonly onTrafficManifold = (m: RAPIER.TempContactManifold, _flipped: boolean): void => {
    const n = m.numContacts();
    for (let i = 0; i < n; i++) this.contactSum += m.contactImpulse(i);
  };
  private readonly onTrafficPair = (other: RAPIER.Collider): void => {
    const parent = other.parent();
    const fixed = parent === null || parent.isFixed();
    // The ground and kerbs support the car every step. Only a chassis, a wall or another car counts.
    if (fixed && other.restitution() < 0.99) return;
    const col = this.currentCol;
    if (col) this.world.contactPair(col, other, this.onTrafficManifold);
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
    this.wobble = new Float32Array(n);
    this.turn = new Uint8Array(n);
    this.laneFill = new Uint8Array(this.lanes.laneCount);
    this.laneIndex = new Int16Array(this.lanes.laneCount * MAX_ON_LANE);
    this.nodeHolder = new Int32Array(this.nodes.length);
    this.nodeHoldFor = new Float32Array(this.nodes.length);
    this.nodeHolder.fill(-1);
    this.next.fill(-1);
    this.lane.fill(-1);
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
        .setAngularDamping(tuning.angularDamping)
        .setAdditionalMass(tuning.mass.compact));
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
      .setFriction(this.tuning.friction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
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

  /** Test hook: yaw the lent body without moving it. */
  setFacing(agent: number, yaw: number): void {
    this.yaw[agent] = yaw;
    const slot = this.agentBody[agent] as number;
    if (slot < 0) return;
    const body = this.bodies[slot] as RAPIER.RigidBody;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    body.setRotation(q, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  spawnAt(lane: number, s: number, kind: CarId, state: AgentState = AgentState.Kinematic): number {
    const i = this.findFree();
    if (i < 0) return -1;
    this.place(i, lane, s, KIND_INDEX[kind], 0, state, PAINTS[0] as number);
    return i;
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
    this.spawn(player);
    this.releaseNodes(dt);
    this.buildLaneLists();
    for (let i = 0; i < this.capacity; i++) {
      if (this.agentBody[i] !== undefined && (this.agentBody[i] as number) >= 0) this.pullPose(i);
      if (this.state[i] === AgentState.Free) continue;
      this.chooseNext(i);
      if (this.state[i] !== AgentState.Kinematic) continue;
      this.integrate(i, player, dt, events);
      this.honk(i, player, dt, events);
    }
    this.unstick();
    this.guard(player, events);
    this.syncBodies(player, dt);
    this.unstick();
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

  private pullPose(i: number): void {
    const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
    body.translation(this.pos);
    body.rotation(this.rot);
    this.x[i] = this.pos.x;
    this.z[i] = this.pos.z;
    this.yaw[i] = M.yawOf(this.rot);
    body.linvel(this.lin);
    this.speed[i] = Math.hypot(this.lin.x, this.lin.z);
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    this.lanes.project(lane, this.pos.x, this.pos.z, this.proj);
    this.s[i] = this.proj.s;
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

  private syncBodies(player: PlayerProbe, dt: number): void {
    const t = this.tuning;
    for (let i = 0; i < this.capacity; i++) {
      const b = this.agentBody[i] as number;
      if (b < 0) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > t.physicsRelease) {
        this.releaseBody(i, this.state[i] !== AgentState.Physical);
        continue;
      }
      if (this.state[i] === AgentState.Wrecked) {
        this.wreckedFor[i] = (this.wreckedFor[i] as number) + dt;
        if ((this.wreckedFor[i] as number) > t.wreckLinger) this.releaseBody(i, true);
        continue;
      }
    }
    for (let n = 0; n < this.capacity; n++) {
      const i = this.nearestKinematic(player);
      if (i < 0) break;
      let slot = this.freeBody();
      if (slot < 0) {
        const far = this.farthestUndisturbed(player, i);
        if (far < 0) break;
        this.releaseBody(far, false);
        slot = this.freeBody();
        if (slot < 0) break;
      }
      this.lend(i, slot);
    }
    for (let i = 0; i < this.capacity; i++) {
      const b = this.agentBody[i] as number;
      if (b < 0) continue;
      if (this.state[i] === AgentState.Disturbed) this.settle(i, dt);
      else if (this.state[i] === AgentState.Physical) this.driveBody(i, player, dt);
      this.senseImpact(i);
    }
  }

  private nearestKinematic(player: PlayerProbe): number {
    const t = this.tuning;
    const px = player.x + player.vx * 0.5;
    const pz = player.z + player.vz * 0.5;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] !== AgentState.Kinematic || (this.agentBody[i] as number) >= 0) continue;
      const dx = (this.x[i] as number) - player.x;
      const dz = (this.z[i] as number) - player.z;
      const dist = Math.hypot(dx, dz);
      const ex = (this.x[i] as number) - px;
      const ez = (this.z[i] as number) - pz;
      const predicted = ex * ex + ez * ez < 64;
      if (dist > t.physicsRadius && !predicted) continue;
      if (dist < bestD) { bestD = dist; best = i; }
    }
    return best;
  }

  private freeBody(): number {
    for (let b = 0; b < this.bodyAgent.length; b++) if ((this.bodyAgent[b] as number) < 0) return b;
    return -1;
  }

  private farthestUndisturbed(player: PlayerProbe, than: number): number {
    const thanD = Math.hypot((this.x[than] as number) - player.x, (this.z[than] as number) - player.z);
    let far = -1;
    let farD = thanD;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.agentBody[i] as number) < 0 || this.state[i] !== AgentState.Physical) continue;
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
    col.setCollisionGroups(GROUPS_TRAFFIC);
    this.colliderAgent.set(col.handle, i);
    body.userData = i;
    const yaw = this.yaw[i] as number;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
    body.setEnabled(true);
    body.setEnabledTranslations(true, false, true, true);
    body.setTranslation({ x: this.x[i] as number, y: 0.03, z: this.z[i] as number }, true);
    body.setRotation(q, true);
    const speed = this.speed[i] as number;
    body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.bodyAgent[slot] = i;
    this.agentBody[i] = slot;
    this.state[i] = AgentState.Physical;
  }

  private releaseBody(i: number, stop: boolean): void {
    const slot = this.agentBody[i] as number;
    if (slot < 0) return;
    const body = this.bodies[slot] as RAPIER.RigidBody;
    const col = this.bodyCollider[slot] as RAPIER.Collider;
    this.colliderAgent.delete(col.handle);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: 0, y: -50, z: 0 }, true);
    body.setEnabled(false);
    this.bodyAgent[slot] = -1;
    this.agentBody[i] = -1;
    this.reattachLeft[i] = 0;
    this.state[i] = AgentState.Kinematic;
    if (stop) this.speed[i] = 0;
    const lane = this.lane[i] as number;
    if (lane >= 0) {
      this.lanes.project(lane, this.x[i] as number, this.z[i] as number, this.proj);
      this.s[i] = this.proj.s;
      this.laneOffset[i] = this.proj.lateral;
      this.reposition(i);
    }
  }

  private driveBody(i: number, player: PlayerProbe, dt: number): void {
    const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
    const lane = this.lane[i] as number;
    if (lane < 0) return;
    const nxt = this.next[i] as number;
    this.lanes.positionAt(lane, (this.s[i] as number) + 8, this.laneOffset[i] as number, this.pose, nxt);
    const dx = this.pose.x - (this.x[i] as number);
    const dz = this.pose.z - (this.z[i] as number);
    const len = Math.hypot(dx, dz) || 1;
    let limit = this.lanes.limit[lane] as number;
    if (nxt >= 0 && this.turn[i] === 1) limit = this.tuning.speedJunction;
    let gap = this.leaderGap(i);
    gap = Math.min(gap, this.playerGapOf(i, player));
    gap = Math.min(gap, this.aheadGap(i));
    let desired = limit;
    if (gap < 1e8) desired = Math.min(limit, Math.sqrt(2 * this.tuning.brake * Math.max(0, gap - this.tuning.gapMin)));
    body.linvel(this.lin);
    const blend = (this.reattachLeft[i] as number) > 0 ? 1 - (this.reattachLeft[i] as number) / this.tuning.reattachBlend : 1;
    if ((this.reattachLeft[i] as number) > 0) this.reattachLeft[i] = Math.max(0, (this.reattachLeft[i] as number) - dt);
    const k = Math.min(1, 6 * dt) * Math.max(0, Math.min(1, blend));
    this.lin.x += (dx / len * desired - this.lin.x) * k;
    this.lin.z += (dz / len * desired - this.lin.z) * k;
    body.setLinvel(this.lin, true);
    body.angvel(this.ang);
    let err = this.pose.yaw - (this.yaw[i] as number);
    err = Math.atan2(Math.sin(err), Math.cos(err));
    this.ang.y = 4 * err - 2 * this.ang.y;
    body.setAngvel(this.ang, true);
  }

  private senseImpact(i: number): void {
    const col = this.bodyCollider[this.agentBody[i] as number] as RAPIER.Collider;
    this.contactSum = 0;
    this.currentCol = col;
    this.world.contactPairsWith(col, this.onTrafficPair);
    this.currentCol = null;
    const id = KINDS[this.kind[i] as number] as CarId;
    const mass = this.tuning.mass[id];
    if (this.contactSum / mass > this.tuning.disturbedImpact && this.state[i] !== AgentState.Wrecked) {
      if (this.state[i] !== AgentState.Disturbed) {
        const body = this.bodies[this.agentBody[i] as number] as RAPIER.RigidBody;
        col.setCollisionGroups(GROUPS_SOLID);
        body.setEnabledTranslations(true, true, true, true);
      }
      this.state[i] = AgentState.Disturbed;
      this.disturbedFor[i] = this.tuning.disturbedTime;
    }
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
      this.lanes.project(lane, this.x[i] as number, this.z[i] as number, this.proj);
      lateral = Math.abs(this.proj.lateral - (this.laneOffset[i] as number));
    }
    if (up > 0.7 && speed < 6 && lateral < this.tuning.reattachDistance) {
      this.state[i] = AgentState.Physical;
      this.reattachLeft[i] = this.tuning.reattachBlend;
      this.s[i] = this.proj.s;
      const col = this.bodyCollider[this.agentBody[i] as number] as RAPIER.Collider;
      col.setCollisionGroups(GROUPS_TRAFFIC);
      body.setEnabledTranslations(true, false, true, true);
      body.setTranslation({ x: this.x[i] as number, y: 0.03, z: this.z[i] as number }, true);
    } else {
      this.state[i] = AgentState.Wrecked;
      this.wreckedFor[i] = 0;
    }
  }

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
    this.kind[i] = kind;
    this.paint[i] = paint;
    this.lane[i] = lane;
    this.next[i] = -1;
    this.s[i] = s;
    this.laneOffset[i] = offset;
    this.speed[i] = this.lanes.limit[lane] as number;
    this.wait[i] = 0;
    this.wobble[i] = 0;
    this.turn[i] = 0;
    this.honkCooldown[i] = 0;
    this.disturbedFor[i] = 0;
    this.wreckedFor[i] = 0;
    this.lanes.positionAt(lane, s, offset, this.pose);
    this.x[i] = this.pose.x;
    this.z[i] = this.pose.z;
    this.yaw[i] = this.pose.yaw;
    this.paintSerial++;
    const q = M.quatSetAxisAngle(this.scratchQ, 0, 1, 0, this.pose.yaw);
    this.transforms.writeBoth(this.slot[i] as number, this.pose.x, 0.03, this.pose.z, q.x, q.y, q.z, q.w);
  }

  private free(i: number): void {
    if ((this.agentBody[i] as number) >= 0) this.releaseBody(i, true);
    const lane = this.lane[i] as number;
    if (lane >= 0) {
      const node = this.lanes.toNode[lane] as number;
      if (this.nodeHolder[node] === i) this.nodeHolder[node] = -1;
    }
    this.state[i] = AgentState.Free;
    this.next[i] = -1;
    this.lane[i] = -1;
  }

  private despawn(player: PlayerProbe): void {
    const r2 = this.tuning.despawn * this.tuning.despawn;
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] === AgentState.Free) continue;
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
      const highway = (lanes.limit[lane] as number) === t.speedHighway;
      const offset = highway ? (this.rng() < 0.5 ? -2 : 6) : 0;
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

  private releaseNodes(dt: number): void {
    const clear = this.tuning.junctionClear;
    for (let n = 0; n < this.nodeHolder.length; n++) {
      const holder = this.nodeHolder[n] as number;
      if (holder < 0) continue;
      this.nodeHoldFor[n] = (this.nodeHoldFor[n] as number) + dt;
      const passed = this.state[holder] === AgentState.Kinematic
        && (this.next[holder] as number) < 0
        && (this.s[holder] as number) >= clear;
      if (passed || (this.nodeHoldFor[n] as number) > 8 || this.state[holder] !== AgentState.Kinematic) {
        this.nodeHolder[n] = -1;
        this.nodeHoldFor[n] = 0;
      }
    }
  }

  private buildLaneLists(): void {
    this.laneFill.fill(0);
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] !== AgentState.Kinematic) continue;
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

  private chooseNext(i: number): void {
    if ((this.next[i] as number) >= 0) return;
    const lane = this.lane[i] as number;
    const len = this.lanes.length[lane] as number;
    if ((this.s[i] as number) < len - 6 || (this.s[i] as number) > len) return;
    const outs = this.lanes.outs(lane);
    const uturn = this.lanes.uturn(lane);
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

  private integrate(i: number, player: PlayerProbe, dt: number, events: EventLog): void {
    const t = this.tuning;
    const lane = this.lane[i] as number;
    const len = this.lanes.length[lane] as number;
    const nxt = this.next[i] as number;
    let limit = this.lanes.limit[lane] as number;
    if (nxt >= 0 && (this.s[i] as number) >= len - 6 && this.turn[i] === 1) limit = t.speedJunction;
    let gap = this.leaderGap(i);
    gap = Math.min(gap, this.playerGapOf(i, player));
    gap = Math.min(gap, this.aheadGap(i));
    let desired = limit;
    if (gap < 1e8) desired = Math.min(limit, Math.sqrt(2 * t.brake * Math.max(0, gap - t.gapMin)));
    const entering = nxt >= 0 && (this.s[i] as number) <= len;
    if (entering && !this.mayEnter(i, player)) {
      if ((this.wait[i] as number) < t.junctionWait && (this.wait[i] as number) + dt >= t.junctionWait) {
        this.waitedPast++;
        events.push('honk', 0, this.x[i] as number, 0.03, this.z[i] as number, i);
      }
      this.wait[i] = (this.wait[i] as number) + dt;
      if ((this.wait[i]) < t.junctionWait) {
        desired = Math.min(desired, Math.sqrt(2 * t.brake * Math.max(0, len - (this.s[i] as number))));
      }
    } else if (nxt >= 0 && (this.s[i] as number) >= len - 6) {
      this.claimNode(i);
      this.wait[i] = 0;
    }
    const speed = this.speed[i] as number;
    this.speed[i] = speed < desired ? Math.min(desired, speed + t.accel * dt) : Math.max(0, Math.max(desired, speed - t.brake * dt));
    this.advance(i, dt);
  }

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
      return remain + this.lanes.connectionLength(lane, nxt) + (this.s[other] as number) - CAR_GAP;
    }
    return Infinity;
  }

  /** Along-lane distance to the player when the player is the leader. The stop band is `gapMin`. */
  private playerGapOf(i: number, player: PlayerProbe): number {
    this.lanes.project(this.lane[i] as number, player.x, player.z, this.proj);
    const along = this.proj.s - (this.s[i] as number);
    const lateral = this.proj.lateral - (this.laneOffset[i] as number);
    if (along > 0 && along < this.tuning.playerGap && Math.abs(lateral) < this.tuning.playerLateral) return along;
    return Infinity;
  }

  private aheadGap(i: number): number {
    const x = this.x[i] as number;
    const z = this.z[i] as number;
    const yaw = this.yaw[i] as number;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let gap = Infinity;
    for (let j = 0; j < this.capacity; j++) {
      if (j === i || this.state[j] === AgentState.Free) continue;
      const dx = (this.x[j] as number) - x;
      const dz = (this.z[j] as number) - z;
      if (dx * fx + dz * fz < 2) continue;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > 14 * 14) continue;
      const spare = Math.sqrt(dist2) - CAR_GAP;
      if (spare < gap) gap = spare;
    }
    return gap;
  }

  private mayEnter(i: number, player: PlayerProbe): boolean {
    const t = this.tuning;
    if ((this.wait[i] as number) >= t.junctionWait) return true;
    const lane = this.lane[i] as number;
    const nxt = this.next[i] as number;
    if (nxt < 0) return true;
    const node = this.lanes.toNode[lane] as number;
    if (this.playerNear(node, player)) return false;
    const fromHighway = (this.lanes.limit[lane] as number) === t.speedHighway;
    if (!fromHighway && this.highwayNode(node) && this.highwayApproaching(node)) return false;
    if (this.turn[i] === 0 && fromHighway) return true;
    const holder = this.nodeHolder[node] as number;
    return holder < 0 || holder === i;
  }

  private claimNode(i: number): void {
    const lane = this.lane[i] as number;
    const fromHighway = (this.lanes.limit[lane] as number) === this.tuning.speedHighway;
    if (this.turn[i] === 0 && fromHighway) return;
    const node = this.lanes.toNode[lane] as number;
    if ((this.nodeHolder[node] as number) < 0) {
      this.nodeHolder[node] = i;
      this.nodeHoldFor[node] = 0;
    }
  }

  private advance(i: number, dt: number): void {
    const lane = this.lane[i] as number;
    let s = (this.s[i] as number) + (this.speed[i] as number) * dt;
    const nxt = this.next[i] as number;
    const len = this.lanes.length[lane] as number;
    const holding = nxt >= 0 && (this.wait[i] as number) > 0 && (this.wait[i] as number) < this.tuning.junctionWait;
    if (holding) {
      if (s > len - 0.2) {
        s = len - 0.2;
        this.speed[i] = 0;
      }
    } else if (nxt >= 0 && s >= len) {
      const conn = this.lanes.connectionLength(lane, nxt);
      if (s >= len + conn) {
        const over = Math.max(0, s - len - conn);
        const closest = this.closestOn(nxt);
        if (closest < over + CAR_GAP + 0.3) {
          s = len + conn - Math.max(0.3, CAR_GAP + 0.3 - closest);
          this.speed[i] = 0;
        } else {
          s = over;
          this.retargetOffset(i, nxt);
          this.lane[i] = nxt;
          this.next[i] = -1;
          this.turn[i] = 0;
          this.wait[i] = 0;
        }
      }
    } else if (nxt < 0 && s > len) {
      s = len;
      this.speed[i] = 0;
    }
    this.s[i] = Math.max(0, s);
    const useLane = this.lane[i] as number;
    this.lanes.positionAt(useLane, this.s[i], this.laneOffset[i] as number, this.pose, this.next[i]);
    this.x[i] = this.pose.x;
    this.z[i] = this.pose.z;
    this.yaw[i] = this.pose.yaw;
  }

  /** Push a car back along its lane when another car is inside the 4.5 m spacing. */
  private unstick(): void {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < this.capacity; i++) {
        if (this.state[i] !== AgentState.Kinematic) continue;
        for (let j = 0; j < this.capacity; j++) {
          if (j === i || this.state[j] !== AgentState.Kinematic) continue;
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
      if (this.state[j] !== AgentState.Kinematic || this.lane[j] !== lane) continue;
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

  private retargetOffset(i: number, lane: number): void {
    const highway = (this.lanes.limit[lane] as number) === this.tuning.speedHighway;
    const offset = this.laneOffset[i] as number;
    if (highway) {
      if (offset !== -2 && offset !== 6) this.laneOffset[i] = this.rng() < 0.5 ? -2 : 6;
    } else this.laneOffset[i] = 0;
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
      if (this.state[i] !== AgentState.Kinematic) continue;
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
}
