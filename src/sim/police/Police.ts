/**
 * The police brain: units are traffic agents with a plan (decision 26), and
 * this planner writes those plans before `Traffic.step`. What a unit does
 * follows from the pursuit and the player (docs/DESIGN.md §2.10):
 *
 * - chase: route to where the player will be in 1.2 s; close in and shove a
 *   fast player (a saloon's ram, an interceptor's PIT);
 * - cut off: from heat 2 every second saloon routes to where the player will
 *   be in 4 s, so units arrive from ahead as well as from behind;
 * - arrest: a player under ~22 km/h is boxed. Units within 60 m take the
 *   slots behind, ahead and beside the player, braking to arrive, and hold
 *   there; two in reach fill the busted bar;
 * - search: sight lost, units drive to where the player was last seen and fan
 *   out through the junctions there until the escape timer runs out;
 * - react: a unit the player hits notices at once, and it costs heat.
 *
 * Units share Traffic's records, lane follower and body pool; nothing here
 * steps physics. No allocation per step.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { BALANCE } from '../balance';
import type { RoadGraph, Lane, RoadNode } from '../city/roads';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe, type Traffic } from '../traffic/Traffic';
import type { LanePose, LaneProjection } from '../traffic/lanes';
import { CAR_PRESETS } from '../vehicle/presets';
import { POLICE, type PoliceTuning } from './tuning';

/** Distance fields over the road graph: toward the player's near future, and toward where the player is heading. */
const CHASE = 0;
const AHEAD = 1;
/** Arrest slots: behind, ahead, left, right of the player; units beyond four stand by behind. */
const SLOTS = 4;

export class Police {
  readonly units: Int16Array;
  readonly tuning: PoliceTuning = POLICE;
  /** Units alive now, and the roster the current heat level pays for. */
  count = 0;
  budget = 0;
  ramsReceived = 0;
  /** True while the player is slow enough to be boxed and the units are taking their slots. */
  arresting = false;
  /** Test hook: false keeps new units from coming on duty (deterministic busted and door setups). */
  dispatching = true;

  private readonly sim: SimWorld;
  private readonly traffic: Traffic;
  private readonly graph: RoadGraph;
  private readonly seen: Uint8Array;
  private readonly withdrawing: Uint8Array;
  private readonly rammed: Uint8Array;
  private readonly ramCooldown: Float32Array;
  /** Per traffic record: a hit from the player that already cost heat. */
  private readonly assaultCooldown: Float32Array;
  /** Per unit: its arrest slot (0..3), a standby place (4 + n), or -1. */
  readonly slotOf: Int8Array;
  private readonly slotX = new Float64Array(SLOTS);
  private readonly slotZ = new Float64Array(SLOTS);
  private readonly slotOpen = new Uint8Array(SLOTS);
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly projection: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly fields: [Float64Array, Float64Array];
  private readonly targetLane = new Int16Array(2);
  private readonly targetS = new Float64Array(2);
  private readonly visited: Uint8Array;
  private readonly incoming: Int16Array;
  private readonly previousIncoming: Int16Array;
  private readonly laneCost: Float32Array;
  private readonly radius: number;
  private routeLeft = 0;
  private slotLeft = 0;
  private spawnLeft = 0;
  private hot = false;
  /** The player's velocity when last seen: where a search starts. */
  private lastVx = 0;
  private lastVz = 0;
  /** Bumped per lost sighting so the fan-out through the junctions differs each time. */
  private searchSalt = 0;

  constructor(sim: SimWorld) {
    if (!sim.traffic || !sim.city) throw new Error('Police requires city traffic');
    this.sim = sim;
    this.traffic = sim.traffic;
    this.graph = sim.city.graph;
    this.units = new Int16Array(Math.max(...this.tuning.budget));
    this.units.fill(-1);
    this.seen = new Uint8Array(this.units.length);
    this.withdrawing = new Uint8Array(this.units.length);
    this.rammed = new Uint8Array(this.units.length);
    this.ramCooldown = new Float32Array(this.units.length);
    this.slotOf = new Int8Array(this.units.length);
    this.slotOf.fill(-1);
    this.assaultCooldown = new Float32Array(this.traffic.capacity);
    this.fields = [new Float64Array(this.graph.nodes.length), new Float64Array(this.graph.nodes.length)];
    this.targetLane.fill(-1);
    this.visited = new Uint8Array(this.graph.nodes.length);
    this.incoming = new Int16Array(this.graph.nodes.length);
    this.incoming.fill(-1);
    this.previousIncoming = new Int16Array(this.graph.lanes.length);
    this.laneCost = new Float32Array(this.graph.lanes.length);
    for (let i = 0; i < this.graph.lanes.length; i++) {
      const lane = this.graph.lanes[i] as Lane;
      this.previousIncoming[i] = this.incoming[lane.to] as number;
      this.incoming[lane.to] = i;
      const from = this.graph.nodes[lane.from] as RoadNode;
      const to = this.graph.nodes[lane.to] as RoadNode;
      this.laneCost[i] = (this.traffic.lanes.length[i] as number)
        + Math.hypot(lane.x0 - from.x, lane.z0 - from.z)
        + Math.hypot(lane.x1 - to.x, lane.z1 - to.z);
    }
    const extents = CAR_PRESETS.police.chassisHalfExtents;
    this.radius = Math.hypot(extents.x, extents.z);
  }

  /** Runs before Traffic.step; never steps traffic or physics itself. */
  preStep(player: PlayerProbe, dt: number): void {
    const traffic = this.traffic;
    const pursuit = this.sim.pursuit;
    const t = this.tuning;
    const cosHalf = Math.cos(t.viewHalfAngleDeg * Math.PI / 180);
    this.count = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      const state = traffic.state[agent];
      if (traffic.police[agent] !== 1 || state === AgentState.Free || state === AgentState.Wrecked || state === AgentState.Abandoned) {
        traffic.clearPolicePlan(agent);
        this.units[u] = -1;
        this.seen[u] = 0;
        this.rammed[u] = 0;
        this.slotOf[u] = -1;
        // A wrecked patrol is replaced, but the street gets a breather first.
        this.spawnLeft = Math.max(this.spawnLeft, t.reinforceSeconds);
        continue;
      }
      this.count++;
      this.ramCooldown[u] = Math.max(0, (this.ramCooldown[u] as number) - dt);
      if (this.rammed[u] === 1 && traffic.hasBody(agent) && (traffic.playerDv[agent] as number) >= t.ramContactDv && this.ramCooldown[u] === 0) {
        this.ramsReceived++;
        this.ramCooldown[u] = t.ramCooldown;
      }
      this.rammed[u] = 0;
      traffic.clearPolicePlan(agent);
    }
    const assaulted = this.assaults(dt);
    const level = this.sim.heat.level;
    if (level === 0) {
      this.hot = false;
      this.spawnLeft = 0;
      this.arresting = false;
      this.seen.fill(0);
      this.withdrawing.fill(0);
      this.slotOf.fill(-1);
      pursuit.step(dt, level, false, player.x, player.z);
      this.standDown(player, cosHalf);
      return;
    }
    if (!this.hot) {
      this.hot = true;
      this.spawnLeft = 0;
    }
    this.budget = Math.min(this.units.length, t.budget[level] ?? 0);
    this.spawnLeft -= dt;
    if (this.dispatching && this.count < this.budget && this.spawnLeft <= 0) {
      this.spawnLeft = t.spawnRetrySeconds;
      for (let u = 0; u < this.units.length && this.count < this.budget; u++) {
        if ((this.units[u] as number) >= 0) continue;
        const agent = this.spawn(player, cosHalf, this.interceptorsWanted(level));
        if (agent < 0) break;
        this.units[u] = agent;
        this.seen[u] = 0;
        this.withdrawing[u] = 0;
        this.ramCooldown[u] = 0;
        this.slotOf[u] = -1;
        this.count++;
      }
    }

    // a unit the player hit sees the player, whatever its ray said
    let visible = assaulted;
    const every = Math.max(1, Math.round(t.sightEveryTicks));
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      const distance = Math.hypot(player.x - x, player.z - z);
      if (this.withdrawing[u] === 1) {
        this.seen[u] = 0;
        // Once it has really withdrawn, this same patrol may encounter the player again.
        if (distance >= t.withdrawRange && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) this.withdrawing[u] = 0;
        continue;
      }
      if (distance > t.sightRange) this.seen[u] = 0;
      else if (this.sim.tick % every === Math.floor(u * every / this.units.length)) this.seen[u] = this.canSee(agent, player, distance) ? 1 : 0;
      if (this.seen[u] === 1) visible = true;
    }
    if (visible) {
      this.lastVx = player.vx;
      this.lastVz = player.vz;
    }
    const before = pursuit.state;
    pursuit.step(dt, level, visible, player.x, player.z);
    if (before === 'lost' && pursuit.state === 'idle') {
      this.withdrawing.fill(1);
      this.seen.fill(0);
    }
    const chasing = pursuit.state === 'detected' || pursuit.state === 'active';
    const searching = pursuit.state === 'lost';
    if (searching && before !== 'lost') this.searchSalt++;
    this.routeLeft -= dt;
    const refresh = this.routeLeft <= 0 || (this.targetLane[CHASE] as number) < 0 || before === 'idle' || before !== pursuit.state;
    if (chasing && refresh) {
      this.route(CHASE, player.x + player.vx * t.projectSeconds, player.z + player.vz * t.projectSeconds, player.yaw);
      if (level >= t.cutoff.fromLevel) this.route(AHEAD, player.x + player.vx * t.cutoff.seconds, player.z + player.vz * t.cutoff.seconds, player.yaw);
      this.routeLeft = t.routeSeconds;
    } else if (searching && refresh) {
      // the radio's last fix: where the player was, a moment down the road it was taking
      this.route(CHASE, pursuit.lastX + this.lastVx * t.projectSeconds, pursuit.lastZ + this.lastVz * t.projectSeconds, Math.atan2(this.lastVx, this.lastVz));
      this.routeLeft = t.routeSeconds;
    }

    // arrest: a slow player is boxed; the slots are re-dealt twice a second
    const a = t.arrest;
    // the cold open has no busted, so nobody boxes: the units chase and ram
    const arresting = chasing && !this.sim.coldOpen.active
      && (player.speed < a.playerSpeed || (this.arresting && player.speed < a.releaseSpeed));
    if (arresting !== this.arresting) this.slotLeft = 0;
    this.arresting = arresting;
    if (arresting) {
      this.placeSlots(player);
      this.slotLeft -= dt;
      if (this.slotLeft <= 0) {
        this.dealSlots(player);
        this.slotLeft = t.routeSeconds;
      }
    } else {
      this.slotOf.fill(-1);
    }

    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      if (!chasing && !searching) {
        // Idle means ordinary lane driving, not omniscient navigation to the player.
        if (this.withdrawing[u] === 1) {
          traffic.setPolicePlan(agent, this.awayExit(agent, player), 0);
          continue;
        }
        // Off duty across town: that car goes back to the depot and another comes on
        // duty near the player, so the level's presence is where the player is without
        // anyone being chased. It only happens where nobody can see it.
        const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
        if (Math.hypot(player.x - x, player.z - z) > t.patrolRecycle
          && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) {
          traffic.releasePolice(agent);
          this.units[u] = -1;
          this.seen[u] = 0;
          this.count--;
        }
        continue;
      }
      if (searching) {
        // to the last fix at chase speed, then a different exit per unit at every junction around it
        const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
        const toFix = Math.hypot(pursuit.lastX - x, pursuit.lastZ - z);
        traffic.setPolicePlan(agent, toFix > t.search.reach ? this.routeExit(agent, CHASE) : this.searchExit(agent, u), t.chaseSpeed);
        continue;
      }
      const dx = player.x - (traffic.x[agent] as number);
      const dz = player.z - (traffic.z[agent] as number);
      const gap = Math.hypot(dx, dz);
      const slot = this.slotOf[u] as number;
      if (arresting && slot >= 0 && traffic.hasBody(agent) && gap < a.range) {
        this.driveToSlot(u, agent, slot, player);
        continue;
      }
      const pit = traffic.kindOf(agent) === 'sports';
      const next = this.isCutter(u, agent, level) && gap > t.cutoff.breakRange ? this.routeExit(agent, AHEAD) : this.routeExit(agent, CHASE);
      // Close in, a unit drives its class speed; a street back it runs flat out to arrive at all.
      const speed = gap > t.catchUpRange ? t.catchUpSpeed : pit ? t.interceptorSpeed : t.chaseSpeed;
      const range = pit ? t.pitRange : t.ramRange;
      const ram = this.seen[u] === 1 && traffic.state[agent] === AgentState.Physical && gap <= range;
      if (!ram) {
        traffic.setPolicePlan(agent, next, speed);
        continue;
      }
      // A saloon shoves where the player will be; an interceptor puts its nose on the rear quarter.
      let aimX = player.x + player.vx * t.ramLeadSeconds;
      let aimZ = player.z + player.vz * t.ramLeadSeconds;
      if (pit) {
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        const side = -dx * -fz - dz * fx >= 0 ? 1 : -1;
        aimX = player.x - fx * player.halfLength * 0.9 + -fz * side * t.pitSideOffset;
        aimZ = player.z - fz * player.halfLength * 0.9 + fx * side * t.pitSideOffset;
      }
      traffic.setPolicePlan(agent, next, speed, aimX, aimZ,
        Math.min(speed, player.speed + t.ramClosingSpeed), pit ? t.pitAcceleration : t.ramAcceleration);
      this.rammed[u] = 1;
    }
  }

  /**
   * Live police cars (pursuit units, parked patrols, roadblock cars) within
   * `range` of a point: what boxes the player in. A wreck or a car the player
   * took no longer counts; a civilian never does.
   */
  unitsWithin(x: number, z: number, range: number): number {
    const traffic = this.traffic;
    const r2 = range * range;
    let n = 0;
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.police[i] !== 1) continue;
      const state = traffic.state[i];
      if (state === AgentState.Free || state === AgentState.Wrecked || state === AgentState.Abandoned) continue;
      const dx = (traffic.x[i] as number) - x, dz = (traffic.z[i] as number) - z;
      if (dx * dx + dz * dz <= r2) n++;
    }
    return n;
  }

  /**
   * A police car the player hits while nobody is chasing: it costs heat and,
   * from heat 1, the car has seen who did it. During a chase the contacts are
   * the pursuit's own rams and cost nothing.
   */
  private assaults(dt: number): boolean {
    const traffic = this.traffic;
    const t = this.tuning;
    let assaulted = false;
    const idle = this.sim.pursuit.state === 'idle';
    for (let i = 0; i < traffic.capacity; i++) {
      const cool = this.assaultCooldown[i] as number;
      if (cool > 0) this.assaultCooldown[i] = Math.max(0, cool - dt);
      if (traffic.police[i] !== 1 || !idle || cool > 0 || !traffic.hasBody(i)) continue;
      const state = traffic.state[i];
      if (state === AgentState.Wrecked || state === AgentState.Free) continue;
      if ((traffic.playerDv[i] as number) < t.assaultDv) continue;
      this.assaultCooldown[i] = t.assaultCooldown;
      this.sim.heat.add(BALANCE.heat.policeHit);
      assaulted = true;
    }
    return assaulted;
  }

  /** The four slots around the player, and which of them a car can reach (no fixed collider between). */
  private placeSlots(player: PlayerProbe): void {
    const a = this.tuning.arrest;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    // right of the heading; +X is left when facing +Z
    const rx = -fz, rz = fx;
    this.slotX[0] = player.x - fx * a.rear; this.slotZ[0] = player.z - fz * a.rear;
    this.slotX[1] = player.x + fx * a.front; this.slotZ[1] = player.z + fz * a.front;
    this.slotX[2] = player.x - rx * a.side; this.slotZ[2] = player.z - rz * a.side;
    this.slotX[3] = player.x + rx * a.side; this.slotZ[3] = player.z + rz * a.side;
  }

  /** Deal the open slots to the nearest units, a unit keeping its own slot unless another is `keep` metres nearer. */
  private dealSlots(player: PlayerProbe): void {
    const traffic = this.traffic;
    const a = this.tuning.arrest;
    this.sim.vehicle.body.translation(this.pos);
    for (let k = 0; k < SLOTS; k++) {
      const dx = (this.slotX[k] as number) - player.x, dz = (this.slotZ[k] as number) - player.z;
      const reach = Math.hypot(dx, dz);
      this.ray.origin.x = player.x;
      this.ray.origin.y = this.pos.y + 0.6;
      this.ray.origin.z = player.z;
      this.ray.dir.x = dx / reach;
      this.ray.dir.y = 0;
      this.ray.dir.z = dz / reach;
      // a slot behind a wall or inside a building is no slot: the car beyond it would grind the wall
      this.slotOpen[k] = this.sim.world.castRay(this.ray, reach + 1.5, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) === null ? 1 : 0;
    }
    const held = this.slotOf;
    for (let k = 0; k < SLOTS; k++) {
      if (this.slotOpen[k] === 0) {
        for (let u = 0; u < this.units.length; u++) if (held[u] === k) held[u] = -1;
        continue;
      }
      let best = -1, bestCost = Infinity;
      for (let u = 0; u < this.units.length; u++) {
        const agent = this.units[u] as number;
        if (agent < 0 || !traffic.hasBody(agent) || this.withdrawing[u] === 1) continue;
        const current = held[u] as number;
        if (current >= 0 && current < k) continue;
        const d = Math.hypot((traffic.x[agent] as number) - (this.slotX[k] as number), (traffic.z[agent] as number) - (this.slotZ[k] as number));
        if (Math.hypot((traffic.x[agent] as number) - player.x, (traffic.z[agent] as number) - player.z) > a.range) continue;
        const cost = d - (current === k ? a.keep : 0);
        if (cost < bestCost) { bestCost = cost; best = u; }
      }
      for (let u = 0; u < this.units.length; u++) if (held[u] === k && u !== best) held[u] = -1;
      if (best >= 0) held[best] = k;
    }
    // the rest stand by behind, one car length apart, ready to take a slot that opens
    let standby = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0 || !traffic.hasBody(agent) || ((held[u] as number) >= 0 && (held[u] as number) < SLOTS)) continue;
      held[u] = SLOTS + standby;
      standby++;
    }
  }

  /** Brake to arrive on the slot and hold there, lights on; the player's own push can still move the car. */
  private driveToSlot(u: number, agent: number, slot: number, player: PlayerProbe): void {
    const traffic = this.traffic;
    const t = this.tuning;
    const a = t.arrest;
    let sx: number, sz: number;
    if (slot < SLOTS) {
      sx = this.slotX[slot] as number;
      sz = this.slotZ[slot] as number;
    } else {
      const back = a.standby + (slot - SLOTS) * 6;
      sx = player.x - Math.sin(player.yaw) * back;
      sz = player.z - Math.cos(player.yaw) * back;
    }
    const ux = traffic.x[agent] as number, uz = traffic.z[agent] as number;
    const d = Math.hypot(sx - ux, sz - uz);
    // v² = 2 a d: a stopped player is reached at walking pace, never at chase speed
    const arrive = d < a.arrive ? 0 : Math.min(t.chaseSpeed, Math.sqrt(2 * a.decel * (d - a.arrive)));
    // a slot on the far side of the player is reached round the car, not through it
    let tx = sx, tz = sz;
    const vx = sx - ux, vz = sz - uz;
    const along = d > 1e-6 ? Math.max(0, Math.min(1, ((player.x - ux) * vx + (player.z - uz) * vz) / (d * d))) : 0;
    const cx = ux + vx * along, cz = uz + vz * along;
    const miss = Math.hypot(cx - player.x, cz - player.z);
    if (d > a.clear && along > 0 && along < 1 && miss < a.clear) {
      let nx = cx - player.x, nz = cz - player.z;
      if (miss < 1e-3) { nx = -vz / d; nz = vx / d; } else { nx /= miss; nz /= miss; }
      tx = player.x + nx * (a.clear + 1.5);
      tz = player.z + nz * (a.clear + 1.5);
    }
    // round the player's car at a walking pace: it is a detour past a stopped car, not a pass
    traffic.setPolicePlan(agent, this.routeExit(agent, CHASE), t.chaseSpeed, tx, tz, tx === sx ? arrive : Math.min(arrive, a.detourSpeed), a.accel, true);
    this.seen[u] = 1;
  }

  /** From heat 2 every second saloon heads for where the player is going instead of where the player is. */
  private isCutter(u: number, agent: number, level: number): boolean {
    return level >= this.tuning.cutoff.fromLevel && u % 2 === 1 && this.traffic.kindOf(agent) !== 'sports';
  }

  /** At a junction near the last fix each unit takes a different road out. */
  private searchExit(agent: number, u: number): number {
    const lane = this.traffic.lane[agent] as number;
    if (lane < 0) return -1;
    const outs = this.traffic.lanes.outs(lane);
    const uturn = this.traffic.lanes.uturn(lane);
    let choices = 0;
    for (let i = 0; i < outs.length; i++) if (outs[i] !== uturn) choices++;
    if (choices === 0) return outs[0] ?? -1;
    const pick = (u + this.searchSalt) % choices;
    let seen = 0;
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i] as number;
      if (out === uturn) continue;
      if (seen === pick) return out;
      seen++;
    }
    return -1;
  }

  /**
   * Heat 0 after a door or busted: the roster goes off duty. Each unit drives
   * away from the player and goes back to the pool once it is `withdrawRange`
   * away and out of view, so nobody pops out of existence on screen and a
   * heat-5 roster does not answer the next heat-1 crime.
   */
  private standDown(player: PlayerProbe, cosHalf: number): void {
    const traffic = this.traffic;
    const t = this.tuning;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      const state = traffic.state[agent];
      if ((state === AgentState.Kinematic || state === AgentState.Physical)
        && Math.hypot(player.x - x, player.z - z) >= t.withdrawRange
        && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) {
        traffic.releasePolice(agent);
        this.units[u] = -1;
        this.count--;
        continue;
      }
      traffic.setPolicePlan(agent, this.awayExit(agent, player), 0);
    }
  }

  private canSee(agent: number, player: PlayerProbe, distance: number): boolean {
    if (distance === 0) return true;
    this.sim.vehicle.body.translation(this.pos);
    this.ray.origin.x = this.traffic.x[agent] as number;
    this.ray.origin.y = this.tuning.sightHeight;
    this.ray.origin.z = this.traffic.z[agent] as number;
    const dx = player.x - this.ray.origin.x;
    const dz = player.z - this.ray.origin.z;
    const dy = this.pos.y - this.ray.origin.y;
    const length = Math.hypot(dx, dy, dz);
    this.ray.dir.x = dx / length;
    this.ray.dir.y = dy / length;
    this.ray.dir.z = dz / length;
    return this.sim.world.castRay(this.ray, length, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) === null;
  }

  /** True while the roster is short of the interceptors this level pays for. */
  private interceptorsWanted(level: number): boolean {
    const want = this.tuning.interceptors[level] ?? 0;
    let live = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent >= 0 && this.traffic.kindOf(agent) === 'sports') live++;
    }
    return live < want;
  }

  private spawn(player: PlayerProbe, cosHalf: number, interceptor: boolean): number {
    const t = this.tuning;
    const lanes = this.traffic.lanes;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const behindX = player.x - fx * t.spawnBehind, behindZ = player.z - fz * t.spawnBehind;
    let best = Infinity, bestLane = -1, bestS = 0;
    for (let lane = 0; lane < lanes.laneCount; lane++) {
      const len = lanes.length[lane] as number;
      // The lane's midpoint bounds it: nothing on a lane a kilometre away can be a spawn.
      if (Math.hypot((lanes.midX[lane] as number) - player.x, (lanes.midZ[lane] as number) - player.z) > t.spawnMax + len / 2) continue;
      for (let s = t.spawnEndInset; s <= len - t.spawnEndInset; s += t.spawnSample) {
        lanes.positionAt(lane, s, 0, this.pose);
        const dx = this.pose.x - player.x, dz = this.pose.z - player.z;
        const distance = Math.hypot(dx, dz);
        if (distance < t.spawnMin || distance > t.spawnMax) continue;
        if (!this.traffic.outOfView(this.pose.x, this.pose.z, this.radius, player, t.viewNear, cosHalf)) continue;
        const toward = -(dx * Math.sin(this.pose.yaw) + dz * Math.cos(this.pose.yaw)) / distance;
        const score = Math.hypot(this.pose.x - behindX, this.pose.z - behindZ) + (1 - toward) * t.spawnHeadingWeight;
        if (score >= best || !this.traffic.canSpawnAt(lane, s, t.spawnClearance)) continue;
        best = score;
        bestLane = lane;
        bestS = s;
      }
    }
    return bestLane < 0 ? -1
      : this.traffic.spawnPoliceAt(bestLane, bestS, interceptor ? 'sports' : 'police', player, t.viewNear, cosHalf, t.spawnClearance);
  }

  /** Reverse Dijkstra on the authored road graph toward the lane under a point, into one of the two fields. */
  private route(field: number, x: number, z: number, heading: number): void {
    const lanes = this.traffic.lanes;
    const distance = this.fields[field] as Float64Array;
    let best = Infinity;
    let targetLane = -1, targetS = 0;
    for (let i = 0; i < lanes.laneCount; i++) {
      // Same bound as the dispatch: the point is on one of the lanes near it.
      if (Math.hypot((lanes.midX[i] as number) - x, (lanes.midZ[i] as number) - z) > (lanes.length[i] as number) / 2 + 40) continue;
      lanes.project(i, x, z, this.projection);
      const along = Math.cos(this.projection.yaw - heading);
      const cost = this.projection.dist + (1 - along) * this.tuning.targetHeadingWeight;
      if (cost < best) {
        best = cost;
        targetLane = i;
        targetS = this.projection.s;
      }
    }
    this.targetLane[field] = targetLane;
    this.targetS[field] = targetS;
    distance.fill(Infinity);
    this.visited.fill(0);
    if (targetLane < 0) return;
    const target = this.graph.lanes[targetLane] as Lane;
    distance[target.from] = targetS;
    for (let pass = 0; pass < distance.length; pass++) {
      let node = -1, cost = Infinity;
      for (let n = 0; n < distance.length; n++) {
        if (this.visited[n] === 0 && (distance[n] as number) < cost) { node = n; cost = distance[n] as number; }
      }
      if (node < 0) break;
      this.visited[node] = 1;
      for (let lane = this.incoming[node] as number; lane >= 0; lane = this.previousIncoming[lane] as number) {
        const from = (this.graph.lanes[lane] as Lane).from;
        const candidate = cost + (this.laneCost[lane] as number);
        if (candidate < (distance[from] as number)) distance[from] = candidate;
      }
    }
  }

  private routeExit(agent: number, field: number): number {
    const lane = this.traffic.lane[agent] as number;
    const targetLane = this.targetLane[field] as number;
    if (lane < 0 || targetLane < 0) return -1;
    const distance = this.fields[field] as Float64Array;
    const outs = this.traffic.lanes.outs(lane);
    let best = Infinity, next = -1;
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i] as number;
      const cost = out === targetLane ? (this.targetS[field] as number)
        : (this.laneCost[out] as number) + (distance[(this.graph.lanes[out] as Lane).to] as number);
      if (cost < best) { best = cost; next = out; }
    }
    return next;
  }

  private awayExit(agent: number, player: PlayerProbe): number {
    const lane = this.traffic.lane[agent] as number;
    if (lane < 0) return -1;
    const outs = this.traffic.lanes.outs(lane);
    let farthest = -1, next = -1;
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i] as number;
      const end = this.graph.lanes[out] as Lane;
      const distance = (end.x1 - player.x) ** 2 + (end.z1 - player.z) ** 2;
      if (distance > farthest) { farthest = distance; next = out; }
    }
    return next;
  }
}
