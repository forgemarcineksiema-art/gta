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
 * - react: a unit the player hits notices at once, and it costs heat;
 * - heavies and the Chief (slice 7): from level 4 half the roster is the heavy
 *   van with a harder shove; at level 5 one unit is the Chief, an interceptor
 *   whose PIT leads the player's turn;
 * - parked patrols (slice 6): from level 3 cars wait at the junctions near the
 *   player, lights on when close; one that sees the player pulls out and chases;
 * - identity (slice 5): a swap no unit saw ends the chase and the units box
 *   the abandoned car for a few seconds before they withdraw; in a police car
 *   the player is not detected until a unit sees a crime from it.
 *
 * Units share Traffic's records, lane follower and body pool; nothing here
 * steps physics. No allocation per step.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { BALANCE } from '../balance';
import { PALETTE } from '../palette';
import type { SimEvent } from '../events';
import type { ParkedJunction } from '../city/cover';
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
/** After a box: the leave point is this far past the empty car along the unit's lane (m), reached within this (m) or given up after this (s). */
const LEAVE_PAST = 14;
const LEAVE_REACHED = 4;
const LEAVE_SECONDS = 4;

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
  /** The Chief's agent at level 5, -1 otherwise; after a wreck another comes `chiefWait` seconds later. */
  chief = -1;
  chiefWait = 0;
  /** Parked patrols: the agent at each place (-1 none) and its index into `parkedJunctions`. */
  readonly parked: Int16Array;
  readonly parkedAt: Int16Array;
  private readonly parkedLos: Uint8Array;
  private readonly parkedJunctions: readonly ParkedJunction[];
  private readonly parkedTried: Uint8Array;
  private parkLeft = 0;
  /** A swap nobody saw: the units box the abandoned car at (boxX, boxZ); `boxLeft` runs while two are round it. */
  boxing = false;
  boxX = 0;
  boxZ = 0;
  boxLeft = 0;
  /** Seconds since the box began (capped by `box.maxSeconds`). */
  boxAge = 0;

  private readonly sim: SimWorld;
  private readonly traffic: Traffic;
  private readonly graph: RoadGraph;
  private readonly seen: Uint8Array;
  /** Per unit: a clear line to the player at its last sight tick, disguise or not (what sees a crime). */
  private readonly los: Uint8Array;
  /** Per unit: pulling out past the boxed car to (leaveX, leaveZ) before it withdraws; seconds left. */
  private readonly leaving: Float32Array;
  private readonly leaveX: Float64Array;
  private readonly leaveZ: Float64Array;
  /** The abandoned car's pose, in the shape the slot planner takes. */
  private readonly boxProbe: PlayerProbe = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, halfWidth: 1, halfLength: 2.3 };
  private cursor: number;
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
  private readonly spin = { x: 0, y: 0, z: 0 };
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
    this.los = new Uint8Array(this.units.length);
    this.parkedJunctions = sim.cover?.parkedJunctions ?? [];
    this.parked = new Int16Array(this.tuning.parked.count).fill(-1);
    this.parkedAt = new Int16Array(this.tuning.parked.count).fill(-1);
    this.parkedLos = new Uint8Array(this.tuning.parked.count);
    this.parkedTried = new Uint8Array(this.parkedJunctions.length);
    this.leaving = new Float32Array(this.units.length);
    this.leaveX = new Float64Array(this.units.length);
    this.leaveZ = new Float64Array(this.units.length);
    this.cursor = sim.events.sequence;
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
        if (agent === this.chief) {
          this.chief = -1;
          this.chiefWait = t.reinforceSeconds * t.chief.reinforceFactor;
        }
        this.units[u] = -1;
        this.seen[u] = 0;
        this.los[u] = 0;
        this.leaving[u] = 0;
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
    this.chiefWait = Math.max(0, this.chiefWait - dt);
    const assaulted = this.assaults(dt);
    // last step's crimes, judged by who could see the car when they happened
    this.cursor = this.sim.events.readFrom(this.cursor, this.onCrime);
    const level = this.sim.heat.level;
    const parkedSaw = this.stepParked(player, level, dt, cosHalf);
    if (level === 0) {
      this.hot = false;
      this.spawnLeft = 0;
      this.arresting = false;
      this.boxing = false;
      this.chiefWait = 0;
      this.leaving.fill(0);
      this.seen.fill(0);
      this.los.fill(0);
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
        const kind = this.wantedKind(level);
        if (kind === null) break;
        const agent = this.spawn(player, cosHalf, kind);
        if (agent < 0) break;
        if (kind === 'chief') this.chief = agent;
        this.units[u] = agent;
        this.seen[u] = 0;
        this.withdrawing[u] = 0;
        this.ramCooldown[u] = 0;
        this.slotOf[u] = -1;
        this.count++;
      }
    }

    // a unit the player hit sees the player, whatever its ray said; so does a parked patrol pulling out
    let visible = assaulted || parkedSaw;
    const every = Math.max(1, Math.round(t.sightEveryTicks));
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      const distance = Math.hypot(player.x - x, player.z - z);
      if (this.withdrawing[u] === 1) {
        this.seen[u] = 0;
        this.los[u] = 0;
        // Once it has really withdrawn, this same patrol may encounter the player again.
        if (distance >= t.withdrawRange && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) this.withdrawing[u] = 0;
        continue;
      }
      if (distance > t.sightRange) {
        this.seen[u] = 0;
        this.los[u] = 0;
      } else if (this.sim.tick % every === Math.floor(u * every / this.units.length)) {
        this.los[u] = this.lineOfSight(agent, player, distance) ? 1 : 0;
        this.seen[u] = this.los[u] === 1 && !pursuit.disguised ? 1 : 0;
      }
      if (this.seen[u] === 1) visible = true;
    }
    // boxing the abandoned car: nobody is looking for the player until it is over
    if (this.boxing) {
      this.boxAge += dt;
      // the clock runs while the box is made: two cars round it, or all there are
      if (this.unitsWithin(this.boxX, this.boxZ, t.box.range) >= Math.min(t.busted.units, this.count)) this.boxLeft -= dt;
      if (this.boxLeft > 0 && this.boxAge < t.box.maxSeconds) {
        pursuit.step(dt, level, false, player.x, player.z);
        this.stepBox(dt);
        return;
      }
      // then the withdraw rule: away, and blind to the player until out of view and far; a unit
      // boxed in behind the empty car first pulls out past it (traffic would queue behind it for good)
      this.boxing = false;
      this.withdrawing.fill(1);
      this.seen.fill(0);
      this.los.fill(0);
      this.slotOf.fill(-1);
      this.startLeaving();
      visible = false;
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
        if ((this.leaving[u] as number) > 0) {
          this.leave(u, agent, dt);
          continue;
        }
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
          if (agent === this.chief) this.chief = -1;
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
        this.driveToSlot(agent, slot, player, a.standby, a.detourSpeed);
        // a unit at the player's elbow sees the player
        this.seen[u] = 1;
        continue;
      }
      const pit = traffic.kindOf(agent) === 'sports';
      const isChief = agent === this.chief;
      const next = this.isCutter(u, agent, level) && gap > t.cutoff.breakRange ? this.routeExit(agent, AHEAD) : this.routeExit(agent, CHASE);
      // Close in, a unit drives its class speed; a street back it runs flat out to arrive at all.
      const speed = isChief ? t.chief.speed : gap > t.catchUpRange ? t.catchUpSpeed : pit ? t.interceptorSpeed : t.chaseSpeed;
      const range = isChief ? t.chief.pitRange : pit ? t.pitRange : t.ramRange;
      const ram = this.seen[u] === 1 && traffic.state[agent] === AgentState.Physical && gap <= range;
      if (!ram) {
        traffic.setPolicePlan(agent, next, speed);
        continue;
      }
      // A saloon shoves where the player will be; an interceptor puts its nose on the rear quarter.
      let aimX = player.x + player.vx * t.ramLeadSeconds;
      let aimZ = player.z + player.vz * t.ramLeadSeconds;
      if (pit) {
        // the Chief aims where the rear quarter will be once it arrives, the player's turn carried on
        let yaw = player.yaw, px = player.x, pz = player.z;
        if (isChief) {
          const lead = Math.min(1, gap / Math.max(1, speed - player.speed + t.ramClosingSpeed));
          yaw += this.sim.vehicle.body.angvel(this.spin).y * lead;
          px += player.vx * lead;
          pz += player.vz * lead;
        }
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const side = -dx * -fz - dz * fx >= 0 ? 1 : -1;
        aimX = px - fx * player.halfLength * 0.9 + -fz * side * t.pitSideOffset;
        aimZ = pz - fz * player.halfLength * 0.9 + fx * side * t.pitSideOffset;
      } else if (traffic.kindOf(agent) === 'heavy') {
        // a van shoves the rear corner on its own side: the car goes across the road, not just ahead
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        const side = -dx * -fz - dz * fx >= 0 ? 1 : -1;
        aimX += -fx * player.halfLength * 0.6 + -fz * side * t.heavy.aimSide;
        aimZ += -fz * player.halfLength * 0.6 + fx * side * t.heavy.aimSide;
      }
      const shove = isChief ? t.chief.pitAcceleration : pit ? t.pitAcceleration : traffic.kindOf(agent) === 'heavy' ? t.heavy.ramAcceleration : t.ramAcceleration;
      traffic.setPolicePlan(agent, next, speed, aimX, aimZ, Math.min(speed, player.speed + t.ramClosingSpeed), shove);
      this.rammed[u] = 1;
    }
  }

  /** True when any unit or parked patrol had a clear line to the player at its last sight tick, disguise or not: a crime now is seen. */
  crimeSeen(): boolean {
    for (let u = 0; u < this.units.length; u++) if ((this.units[u] as number) >= 0 && this.los[u] === 1) return true;
    for (let k = 0; k < this.parked.length; k++) if ((this.parked[k] as number) >= 0 && this.parkedLos[k] === 1) return true;
    return false;
  }

  /**
   * The parked patrols: from `parked.fromLevel` the `count` junctions nearest the player within `radius`
   * each get a car, put there out of view; lights on within `lightsRange`. Below the level, cars already
   * parked keep their places, dark, until nobody sees them go. A patrol that sees the player pulls out onto
   * its lane and joins the roster. Returns true when one did this step.
   */
  private stepParked(player: PlayerProbe, level: number, dt: number, cosHalf: number): boolean {
    const traffic = this.traffic;
    const t = this.tuning;
    const p = t.parked;
    const on = level >= p.fromLevel;
    // a car the player took, wrecked or knocked loose is no longer a parked patrol
    for (let k = 0; k < this.parked.length; k++) {
      const agent = this.parked[k] as number;
      if (agent < 0) continue;
      if (traffic.police[agent] !== 1 || traffic.state[agent] !== AgentState.Parked) {
        this.parked[k] = -1;
        this.parkedAt[k] = -1;
        this.parkedLos[k] = 0;
        continue;
      }
      const d = Math.hypot((traffic.x[agent] as number) - player.x, (traffic.z[agent] as number) - player.z);
      traffic.lights[agent] = on && d < p.lightsRange ? 1 : 0;
    }
    this.parkLeft -= dt;
    if (this.parkLeft <= 0) {
      this.parkLeft = t.routeSeconds;
      this.manageParked(player, on, cosHalf);
    }
    if (level === 0) {
      this.parkedLos.fill(0);
      return false;
    }
    let saw = false;
    const every = Math.max(1, Math.round(t.sightEveryTicks));
    for (let k = 0; k < this.parked.length; k++) {
      const agent = this.parked[k] as number;
      if (agent < 0) continue;
      const d = Math.hypot((traffic.x[agent] as number) - player.x, (traffic.z[agent] as number) - player.z);
      if (d > t.sightRange) { this.parkedLos[k] = 0; continue; }
      if (this.sim.tick % every !== Math.floor(k * every / this.parked.length)) continue;
      this.parkedLos[k] = this.lineOfSight(agent, player, d) ? 1 : 0;
      if (this.parkedLos[k] === 0 || this.sim.pursuit.disguised || this.boxing) continue;
      // seen: out onto its lane, into the chase
      const site = this.parkedJunctions[this.parkedAt[k] as number];
      if (site) traffic.unpark(agent, site.lane, site.s, site.offset);
      traffic.lights[agent] = 1;
      this.parked[k] = -1;
      this.parkedAt[k] = -1;
      this.parkedLos[k] = 0;
      if (this.enlist(agent) >= 0) saw = true;
    }
    return saw;
  }

  /** Fill the nearest places within reach out of view; send off the ones left behind, unseen. */
  private manageParked(player: PlayerProbe, on: boolean, cosHalf: number): void {
    const traffic = this.traffic;
    const t = this.tuning;
    const p = t.parked;
    const sites = this.parkedJunctions;
    for (let k = 0; k < this.parked.length; k++) {
      const agent = this.parked[k] as number;
      if (agent < 0) continue;
      const site = sites[this.parkedAt[k] as number];
      const far = !site || Math.hypot(site.x - player.x, site.z - player.z) > p.radius + 60;
      if ((far || !on) && traffic.outOfView(traffic.x[agent] as number, traffic.z[agent] as number, this.radius, player, t.viewNear, cosHalf)
        && Math.hypot((traffic.x[agent] as number) - player.x, (traffic.z[agent] as number) - player.z) > p.lightsRange) {
        traffic.releaseParked(agent);
        this.parked[k] = -1;
        this.parkedAt[k] = -1;
        this.parkedLos[k] = 0;
      }
    }
    if (!on) return;
    // the nearest junctions within reach, one car each, up to `count`; a place in view is passed over this time
    this.parkedTried.fill(0);
    for (let n = 0; n < sites.length; n++) {
      let best = -1, bestD = p.radius;
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i] as ParkedJunction;
        if (this.parkedTried[i] === 1) continue;
        let taken = false;
        for (let k = 0; k < this.parkedAt.length; k++) if (this.parkedAt[k] === i) { taken = true; break; }
        if (taken) continue;
        const d = Math.hypot(site.x - player.x, site.z - player.z);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return;
      this.parkedTried[best] = 1;
      let slot = -1;
      for (let k = 0; k < this.parked.length; k++) if ((this.parked[k] as number) < 0) { slot = k; break; }
      if (slot < 0) return;
      const site = sites[best] as ParkedJunction;
      // a car appears only where nobody is looking, and beyond its own sight: one placed in plain view of
      // the player would pull out at once and its place fill again, a unit a second
      if (!traffic.outOfView(site.x, site.z, this.radius, player, t.viewNear, cosHalf) || bestD <= t.sightRange) continue;
      const agent = traffic.spawnParkedPolice(site.x, site.z, site.yaw, 'police', player, t.viewNear, cosHalf);
      if (agent < 0) return;
      this.parked[slot] = agent;
      this.parkedAt[slot] = best;
      this.parkedLos[slot] = 0;
    }
  }

  /** The swap nobody saw: box the abandoned car at this pose for `box.seconds`. */
  box(x: number, z: number, yaw: number): void {
    this.boxing = true;
    this.boxX = x;
    this.boxZ = z;
    this.boxLeft = this.tuning.box.seconds;
    this.boxAge = 0;
    this.boxProbe.x = x;
    this.boxProbe.z = z;
    this.boxProbe.yaw = yaw;
    this.routeLeft = 0;
    this.slotLeft = 0;
    this.slotOf.fill(-1);
    this.arresting = false;
  }

  /** Put a police car already on the road into the roster (tests; slice 6's parked patrols joining in). Returns its unit or -1. */
  enlist(agent: number): number {
    if (this.traffic.police[agent] !== 1) return -1;
    for (let u = 0; u < this.units.length; u++) if (this.units[u] === agent) return u;
    for (let u = 0; u < this.units.length; u++) {
      if ((this.units[u] as number) >= 0) continue;
      this.units[u] = agent;
      this.seen[u] = 0;
      this.los[u] = 0;
      this.withdrawing[u] = 0;
      this.ramCooldown[u] = 0;
      this.slotOf[u] = -1;
      this.count++;
      return u;
    }
    return -1;
  }

  /** The units round the abandoned car: the arrest's slots on its pose, the rest held `box.range` back; far units drive there. */
  private stepBox(dt: number): void {
    const traffic = this.traffic;
    const t = this.tuning;
    const b = this.boxProbe;
    this.routeLeft -= dt;
    if (this.routeLeft <= 0) {
      this.route(CHASE, b.x, b.z, b.yaw);
      this.routeLeft = t.routeSeconds;
    }
    this.placeSlots(b);
    // an empty car cannot drive off: the front slot is dealt last, the second unit takes a side
    const fx = this.slotX[1] as number, fz = this.slotZ[1] as number;
    this.slotX[1] = this.slotX[3] as number; this.slotZ[1] = this.slotZ[3] as number;
    this.slotX[3] = fx; this.slotZ[3] = fz;
    this.slotLeft -= dt;
    if (this.slotLeft <= 0) {
      this.dealSlots(b);
      this.slotLeft = t.routeSeconds;
    }
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      const slot = this.slotOf[u] as number;
      const gap = Math.hypot(b.x - (traffic.x[agent] as number), b.z - (traffic.z[agent] as number));
      // by the lanes until the car is in the same street, then straight into a slot round it
      if (slot >= 0 && traffic.hasBody(agent) && gap < t.box.approach) this.driveToSlot(agent, slot, b, t.box.range, t.box.detourSpeed);
      else traffic.setPolicePlan(agent, this.routeExit(agent, CHASE), t.chaseSpeed);
    }
  }

  /** At the end of a box: each unit near the empty car gets a point 14 m past it along its own lane. */
  private startLeaving(): void {
    const traffic = this.traffic;
    const b = this.boxProbe;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      const lane = agent >= 0 ? traffic.lane[agent] as number : -1;
      if (lane < 0 || !traffic.hasBody(agent)) continue;
      if (Math.hypot(b.x - (traffic.x[agent] as number), b.z - (traffic.z[agent] as number)) > this.tuning.box.approach) continue;
      traffic.lanes.project(lane, b.x, b.z, this.projection);
      traffic.lanes.positionAt(lane, Math.min(traffic.lanes.length[lane] as number, this.projection.s + LEAVE_PAST), 0, this.pose);
      this.leaveX[u] = this.pose.x;
      this.leaveZ[u] = this.pose.z;
      this.leaving[u] = LEAVE_SECONDS;
    }
  }

  /** Round the empty car to the leave point at the box's detour speed, then back to the lane and away. */
  private leave(u: number, agent: number, dt: number): void {
    const traffic = this.traffic;
    const tx = this.leaveX[u] as number, tz = this.leaveZ[u] as number;
    const left = (this.leaving[u] as number) - dt;
    this.leaving[u] = left;
    if (left <= 0 || !traffic.hasBody(agent) || Math.hypot(tx - (traffic.x[agent] as number), tz - (traffic.z[agent] as number)) < LEAVE_REACHED) {
      this.leaving[u] = 0;
      return;
    }
    this.driveTo(agent, tx, tz, this.boxProbe, this.tuning.box.detourSpeed);
  }

  /** A crime event from the ring: from a police car in a unit's sight it blows the disguise. */
  private readonly onCrime = (e: SimEvent): void => {
    const kind = e.kind;
    if (kind !== 'takedown' && kind !== 'takedownTraffic' && kind !== 'billboard' && kind !== 'camera') return;
    if (this.sim.pursuit.disguised && this.crimeSeen()) this.sim.pursuit.markBlown(this.sim.probe.x, this.sim.probe.z);
  };

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
      // the car you rammed knows the police car that did it
      this.sim.pursuit.markBlown(this.sim.probe.x, this.sim.probe.z);
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

  /**
   * Brake to arrive on the slot and hold there, lights on; the player's own push can still move the car.
   * Units past the four stand by `standby` m behind; a slot beyond the car is reached round it at `detour` m/s.
   */
  private driveToSlot(agent: number, slot: number, player: PlayerProbe, standby: number, detour: number): void {
    let sx: number, sz: number;
    if (slot < SLOTS) {
      sx = this.slotX[slot] as number;
      sz = this.slotZ[slot] as number;
    } else {
      const back = standby + (slot - SLOTS) * 6;
      sx = player.x - Math.sin(player.yaw) * back;
      sz = player.z - Math.cos(player.yaw) * back;
    }
    this.driveTo(agent, sx, sz, player, detour);
  }

  /** Straight at a point, braking to arrive; a point beyond `player` (the player's car, or the boxed one) is reached round it at `detour` m/s. */
  private driveTo(agent: number, sx: number, sz: number, player: PlayerProbe, detour: number): void {
    const traffic = this.traffic;
    const t = this.tuning;
    const a = t.arrest;
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
    traffic.setPolicePlan(agent, this.routeExit(agent, CHASE), t.chaseSpeed, tx, tz, tx === sx ? arrive : Math.min(arrive, detour), a.accel, true);
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
        if (agent === this.chief) this.chief = -1;
        this.units[u] = -1;
        this.count--;
        continue;
      }
      traffic.setPolicePlan(agent, this.awayExit(agent, player), 0);
    }
  }

  /** A unit sees the player: a clear line and no disguise. */
  canSee(agent: number, player: PlayerProbe, distance: number): boolean {
    return !this.sim.pursuit.disguised && this.lineOfSight(agent, player, distance);
  }

  private lineOfSight(agent: number, player: PlayerProbe, distance: number): boolean {
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

  /** Heavy vans in the roster now. */
  get heavies(): number {
    let n = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent >= 0 && this.traffic.kindOf(agent) === 'heavy') n++;
    }
    return n;
  }

  /**
   * What the roster is short of, in order: the Chief at its level, the interceptors the level pays for
   * (the Chief is not one of them), the heavies' share of the roster from their level, then saloons.
   * Null while the Chief's place is kept for its replacement: nobody else fills it.
   */
  private wantedKind(level: number): 'chief' | 'sports' | 'heavy' | 'police' | null {
    const t = this.tuning;
    if (level >= t.chief.level && this.chief < 0) {
      if (this.chiefWait <= 0) return 'chief';
      if (this.count >= this.budget - 1) return null;
    }
    let interceptors = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent >= 0 && agent !== this.chief && this.traffic.kindOf(agent) === 'sports') interceptors++;
    }
    if (interceptors < (t.interceptors[level] ?? 0)) return 'sports';
    if (level >= t.heavy.fromLevel && this.heavies < Math.round(this.budget * t.heavy.share)) return 'heavy';
    return 'police';
  }

  private spawn(player: PlayerProbe, cosHalf: number, kind: 'chief' | 'sports' | 'heavy' | 'police'): number {
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
    if (bestLane < 0) return -1;
    return kind === 'chief'
      ? this.traffic.spawnPoliceAt(bestLane, bestS, 'sports', player, t.viewNear, cosHalf, t.spawnClearance, PALETTE.ink)
      : this.traffic.spawnPoliceAt(bestLane, bestS, kind, player, t.viewNear, cosHalf, t.spawnClearance);
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
