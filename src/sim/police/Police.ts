/** Two graph patrols, sharing Traffic's agent records, steering and physical body pool. */
import RAPIER from '@dimforge/rapier3d-compat';
import type { RoadGraph, Lane, RoadNode } from '../city/roads';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe, type Traffic } from '../traffic/Traffic';
import type { LanePose, LaneProjection } from '../traffic/lanes';
import { CAR_PRESETS } from '../vehicle/presets';
import { POLICE, type PoliceTuning } from './tuning';

export class Police {
  readonly units: Int16Array;
  readonly tuning: PoliceTuning = POLICE;
  /** Units alive now, and the roster the current heat level pays for. */
  count = 0;
  budget = 0;
  ramsReceived = 0;
  /** Test hook: false keeps new units from coming on duty (deterministic busted and door setups). */
  dispatching = true;

  private readonly sim: SimWorld;
  private readonly traffic: Traffic;
  private readonly graph: RoadGraph;
  private readonly seen: Uint8Array;
  private readonly withdrawing: Uint8Array;
  private readonly rammed: Uint8Array;
  private readonly ramCooldown: Float32Array;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly projection: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly distance: Float64Array;
  private readonly visited: Uint8Array;
  private readonly incoming: Int16Array;
  private readonly previousIncoming: Int16Array;
  private readonly laneCost: Float32Array;
  private readonly radius: number;
  private targetLane = -1;
  private targetS = 0;
  private routeLeft = 0;
  private spawnLeft = 0;
  private hot = false;

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
    this.distance = new Float64Array(this.graph.nodes.length);
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
    const level = this.sim.heat.level;
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
    if (level === 0) {
      this.hot = false;
      this.spawnLeft = 0;
      this.seen.fill(0);
      this.withdrawing.fill(0);
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
        this.count++;
      }
    }

    let visible = false;
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
    const before = pursuit.state;
    pursuit.step(dt, level, visible, player.x, player.z);
    if (before === 'lost' && pursuit.state === 'idle') {
      this.withdrawing.fill(1);
      this.seen.fill(0);
    }
    const chasing = pursuit.state === 'detected' || pursuit.state === 'active';
    this.routeLeft -= dt;
    if (chasing && (this.routeLeft <= 0 || this.targetLane < 0 || before === 'idle' || before === 'lost')) {
      this.route(player);
      this.routeLeft = t.routeSeconds;
    }
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      if (!chasing) {
        // Lost means ordinary lane driving, not omniscient navigation to the player.
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
      const next = this.routeExit(agent);
      const pit = traffic.kindOf(agent) === 'sports';
      const dx = player.x - (traffic.x[agent] as number);
      const dz = player.z - (traffic.z[agent] as number);
      const gap = Math.hypot(dx, dz);
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

  /** Reverse Dijkstra on the authored road graph, using constructor-owned arrays. */
  private route(player: PlayerProbe): void {
    const lanes = this.traffic.lanes;
    const x = player.x + player.vx * this.tuning.projectSeconds;
    const z = player.z + player.vz * this.tuning.projectSeconds;
    let best = Infinity;
    this.targetLane = -1;
    for (let i = 0; i < lanes.laneCount; i++) {
      // Same bound as the dispatch: the player is on one of the lanes near the player.
      if (Math.hypot((lanes.midX[i] as number) - x, (lanes.midZ[i] as number) - z) > (lanes.length[i] as number) / 2 + 40) continue;
      lanes.project(i, x, z, this.projection);
      const heading = Math.cos(this.projection.yaw - player.yaw);
      const cost = this.projection.dist + (1 - heading) * this.tuning.targetHeadingWeight;
      if (cost < best) {
        best = cost;
        this.targetLane = i;
        this.targetS = this.projection.s;
      }
    }
    this.distance.fill(Infinity);
    this.visited.fill(0);
    if (this.targetLane < 0) return;
    const target = this.graph.lanes[this.targetLane] as Lane;
    this.distance[target.from] = this.targetS;
    for (let pass = 0; pass < this.distance.length; pass++) {
      let node = -1, cost = Infinity;
      for (let n = 0; n < this.distance.length; n++) {
        if (this.visited[n] === 0 && (this.distance[n] as number) < cost) { node = n; cost = this.distance[n] as number; }
      }
      if (node < 0) break;
      this.visited[node] = 1;
      for (let lane = this.incoming[node] as number; lane >= 0; lane = this.previousIncoming[lane] as number) {
        const from = (this.graph.lanes[lane] as Lane).from;
        const candidate = cost + (this.laneCost[lane] as number);
        if (candidate < (this.distance[from] as number)) this.distance[from] = candidate;
      }
    }
  }

  private routeExit(agent: number): number {
    const lane = this.traffic.lane[agent] as number;
    if (lane < 0 || this.targetLane < 0) return -1;
    const outs = this.traffic.lanes.outs(lane);
    let best = Infinity, next = -1;
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i] as number;
      const cost = out === this.targetLane ? this.targetS
        : (this.laneCost[out] as number) + (this.distance[(this.graph.lanes[out] as Lane).to] as number);
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
