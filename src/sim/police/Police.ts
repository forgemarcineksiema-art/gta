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
 * - the beat (M5.5, docs/DESIGN.md §13.3): at heat 0 `budget[0]` units drive
 *   their lanes with the lights off and keep watching; a crime in their sight
 *   pays double and makes the player wanted (the heat's rule), speeding past
 *   one is a crime, and the roster beyond the beat goes off duty out of view;
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
import { QUERY_NOT_PROP } from '../collision';
import { BALANCE } from '../balance';
import { bodySpec } from '../traffic/bodies';
import type { SimEvent } from '../events';
import type { ParkedJunction } from '../city/cover';
import type { RoadGraph, Lane, RoadNode } from '../city/roads';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe, type Traffic } from '../traffic/Traffic';
import type { LanePose, LaneProjection } from '../traffic/lanes';
import { CAR_PRESETS } from '../vehicle/presets';
import { POLICE, type PoliceTuning } from './tuning';
import { DISPATCH, packSuspect } from './Pursuit';
import { Helicopter } from './Helicopter';
import { DONUT_SHOP } from './Donuts';

/**
 * A chasing unit's speed (docs/DESIGN.md §13.9): within `pressure.attack` its class's (the ram, the PIT); within
 * `pressure.within` the player's speed and a little more, up to the class's; beyond it the catch-up only where the
 * player cannot see the unit, else the class's speed.
 */
export function pressureSpeed(t: PoliceTuning, gap: number, inView: boolean, playerSpeed: number, classSpeed: number): number {
  // close enough to ram or PIT: it closes at its class's speed (the M4 attack)
  if (gap <= t.pressure.attack) return classSpeed;
  if (gap <= t.pressure.within) return Math.min(classSpeed, Math.max(t.pressure.min, playerSpeed + t.pressure.over));
  return inView ? classSpeed : Math.max(classSpeed, t.catchUpSpeed);
}

/** Distance fields over the road graph: toward the player's near future, and toward where the player is heading. */
/** The Chief's Cruiser in the chase in its own paint, the car the duel wins (M8.8 slice 0). */
const CHIEF_PAINT = bodySpec('chiefcar').paints[0] as number;
const CHASE = 0;
const AHEAD = 1;
/** Toward the donut shop (M5.5 slice 18): where the units that stand down head. */
const DONUT = 2;
/** Arrest slots: behind, ahead, left, right of the player; units beyond four stand by behind. */
const SLOTS = 4;
/**
 * The places a slot can stand on (M8.6 D5): its own four, then the diagonals rear-left, rear-right, front-left,
 * front-right; a slot whose place is shut (a wall, a wreck, a car standing there) takes a free diagonal beside it.
 */
const PLACES = 8;
/** Per slot, its two diagonals in the order tried. */
const DIAGONALS = new Int8Array([4, 5, 6, 7, 4, 6, 5, 7]);
/**
 * A PIT (M8.6 gate): alongside with the interceptor's nose this far up the car's rear quarter, then the swerve aimed this
 * far past the car's centre line, m.
 */
const PIT_OVERLAP = 1.2;
const PIT_SWERVE = 0.8;
/** Seconds after a busted card that a unit stuck in the pile goes back to the pool out of view (M8.6 D7). */
const AFTER_BUST = 20;
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

  /** The wanted board's finale (M6 slice 2): the next arrival is the Chief himself, now. */
  summonChief(): void {
    this.chiefWait = 0;
    this.spawnLeft = 0;
  }

  /**
   * The Mayor's Nephew's escort (M6 slice 3): `count` saloons on the roster at once, on `lane` behind `s` (the
   * player's position), in view; the pursuit the duel forced sends them after the player. Returns how many came.
   */
  escort(lane: number, s: number, count: number): number {
    const t = this.tuning, player = this.sim.probe;
    const cosHalf = Math.cos(t.viewHalfAngleDeg * Math.PI / 180);
    const len = this.traffic.lanes.length[lane] as number;
    let n = 0;
    for (let u = 0; u < this.units.length && n < count; u++) {
      if ((this.units[u] as number) >= 0) continue;
      // behind the player first, then ahead of them, further out each time: whichever spot on the lane is clear
      let agent = -1;
      for (let k = 0; k < 8 && agent < 0; k++) {
        const along = s + (k % 2 === 0 ? -1 : 1) * (20 + 16 * (k >> 1) + 8 * n);
        if (along < 2 || along > len - 2) continue;
        agent = this.traffic.spawnPoliceAt(lane, along, 'police', player, t.viewNear, cosHalf, t.spawnClearance, -1, true);
      }
      if (agent < 0) break;
      this.units[u] = agent;
      this.seen[u] = 0;
      this.withdrawing[u] = 0;
      this.ramCooldown[u] = 0;
      this.slotOf[u] = -1;
      this.count++;
      n++;
    }
    return n;
  }
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
  private readonly boxProbe: PlayerProbe = { x: 0, y: 0.5, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, halfWidth: 1, halfLength: 2.3 };
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
  private readonly placeX = new Float64Array(PLACES);
  private readonly placeZ = new Float64Array(PLACES);
  private readonly placeOpen = new Uint8Array(PLACES);
  /** Per slot: the place it stands on (M8.6 D5), its own or a diagonal. */
  private readonly slotPlace = new Int8Array([0, 1, 2, 3]);
  /** Per unit, after a busted card: where it last moved 2 m from, and for how long it has not (M8.6 D7). */
  private readonly stuckFor: Float32Array;
  private readonly stuckX: Float64Array;
  private readonly stuckZ: Float64Array;
  private afterBust = 0;
  /** The round-an-obstacle point `obstacleOn` found, and how far along the unit's line the obstacle stands. */
  private detourX = 0;
  private detourZ = 0;
  private detourAt = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  /** The air unit from level 4 (M5.5 slice 9): its light is sight; it counts in the budget while on duty. */
  readonly heli: Helicopter;
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly spin = { x: 0, y: 0, z: 0 };
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly projection: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly fields: [Float64Array, Float64Array, Float64Array];
  private readonly targetLane = new Int16Array(3);
  private readonly targetS = new Float64Array(3);
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
  /** Speeding in a patrol's sight: the cooldown, the road's limit under the player and when it was last looked up. */
  private speedLeft = 0;
  private limitLeft = 0;
  private playerLimit = Infinity;
  /** Speeding offences seen so far (the pins). */
  speedings = 0;
  /** Units dispatched so far, and those that pulled out in the player's view (the arrival rule). */
  arrivals = 0;
  arrivalsInView = 0;
  /**
   * A contact's impulse is read two steps after the contact, when both cars have already slowed: these
   * decaying maxima (×0.8 a step) keep the speeds the cars had going in, for the fault rule.
   */
  private readonly copSpeedMax: Float32Array;
  private playerSpeedMax = 0;

  constructor(sim: SimWorld) {
    if (!sim.traffic) throw new Error('Police requires traffic');
    this.heli = new Helicopter(sim.world, sim.events, sim.traffic.streets.half);
    // the island's (M8.10 slice 15a): the aircraft keeps its altitude over the hill, a car under one of the plan's covers
    // is hidden from its light
    const island = sim.island;
    if (island) {
      this.heli.groundAt = (x, z) => island.ground.surfaceHeight(x, z);
      this.heli.covered = (x, y, z) => island.covered(x, y, z);
    }
    this.sim = sim;
    this.traffic = sim.traffic;
    this.graph = sim.traffic.streets.graph;
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
    this.stuckFor = new Float32Array(this.units.length);
    this.stuckX = new Float64Array(this.units.length);
    this.stuckZ = new Float64Array(this.units.length);
    this.assaultCooldown = new Float32Array(this.traffic.capacity);
    this.copSpeedMax = new Float32Array(this.traffic.capacity);
    this.fields = [new Float64Array(this.graph.nodes.length), new Float64Array(this.graph.nodes.length), new Float64Array(this.graph.nodes.length)];
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
    // the donut shop's field, once: the units that stand down head there (the grid's shop or the island's)
    const donut = sim.island?.donutShop ?? DONUT_SHOP;
    this.route(DONUT, donut.laneX, donut.laneZ, donut.laneYaw);
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
        const refill = t.refillSeconds[this.sim.heat.level] ?? t.reinforceSeconds;
        if (agent === this.chief) {
          this.chief = -1;
          this.chiefWait = refill * t.chief.reinforceFactor;
        }
        // the radio: a unit written off in a chase
        if (state === AgentState.Wrecked && this.sim.heat.level > 0) this.sim.events.push('dispatch', DISPATCH.unitDown, traffic.x[agent] as number, 0, traffic.z[agent] as number, -1);
        this.units[u] = -1;
        this.seen[u] = 0;
        this.los[u] = 0;
        this.leaving[u] = 0;
        this.rammed[u] = 0;
        this.slotOf[u] = -1;
        // A wrecked patrol is replaced, but the street gets a breather first: shorter as the heat grows.
        this.spawnLeft = Math.max(this.spawnLeft, refill);
        continue;
      }
      this.count++;
      this.ramCooldown[u] = Math.max(0, (this.ramCooldown[u] as number) - dt);
      if (this.rammed[u] === 1 && traffic.solid(agent) && (traffic.playerDv[agent] as number) >= t.ramContactDv && this.ramCooldown[u] === 0) {
        this.ramsReceived++;
        this.ramCooldown[u] = t.ramCooldown;
        // a ram or a PIT on a bike knocks it down (M8.8 slice 17): a tumble, not a wreck, unless the damage wrecks it
        this.sim.vehicle.tumble();
      }
      this.rammed[u] = 0;
      traffic.clearPolicePlan(agent);
    }
    this.chiefWait = Math.max(0, this.chiefWait - dt);
    const assaulted = this.assaults(dt);
    // last step's crimes, judged by who could see the car when they happened
    this.cursor = this.sim.events.readFrom(this.cursor, this.onCrime);
    // The card is up (M8.6 D7): the chase is over and every unit stands where it is until it closes. Driving on through
    // the card, the units shoved the car out from under the officer at its window.
    if (this.sim.run.state === 'busted') {
      for (let u = 0; u < this.units.length; u++) {
        const agent = this.units[u] as number;
        if (agent < 0) continue;
        traffic.setPolicePlan(agent, -1, 0, traffic.x[agent], traffic.z[agent], 0, t.arrest.accel, true);
        this.stuckFor[u] = 0;
        this.stuckX[u] = traffic.x[agent] as number;
        this.stuckZ[u] = traffic.z[agent] as number;
      }
      this.arresting = false;
      this.slotOf.fill(-1);
      this.afterBust = AFTER_BUST;
      this.heli.step(dt, 0, false, false, player, pursuit.lastX, pursuit.lastZ);
      return;
    }
    this.afterBust = Math.max(0, this.afterBust - dt);
    const level = this.sim.heat.level;
    const parkedSaw = this.stepParked(player, level, dt, cosHalf);
    // the beat is part of the traffic: a world without civilians (the tours, the sandboxes) has none
    this.budget = Math.min(this.units.length, level === 0 && this.sim.trafficDensity <= 0 ? 0 : (t.budget[level] ?? 0));
    // the helicopter's place is kept from its level on, up or not, so its arrival never sends a car home
    if (level >= t.heli.fromLevel) this.budget = Math.max(0, this.budget - 1);
    this.spawnLeft -= dt;
    if (level === 0) {
      // the beat: the roster beyond `budget[0]` goes off duty out of view, the rest drive their lanes with
      // the lights off and keep watching; a crime they see makes the player wanted (Heat's rule), nothing
      // else does, and speeding past one is a crime
      this.hot = false;
      this.arresting = false;
      this.boxing = false;
      this.chiefWait = 0;
      this.leaving.fill(0);
      this.seen.fill(0);
      this.withdrawing.fill(0);
      this.slotOf.fill(-1);
      pursuit.step(dt, level, false, player.x, player.z);
      this.heli.step(dt, level, false, false, player, pursuit.lastX, pursuit.lastZ);
      this.standDown(player, cosHalf, dt);
      this.dispatch(player, cosHalf, level);
      this.recycle(player, cosHalf);
      this.watch(player, cosHalf);
      this.speeding(player, dt);
      return;
    }
    if (!this.hot) {
      this.hot = true;
      this.spawnLeft = 0;
    }
    this.dispatch(player, cosHalf, level);

    // a unit the player hit sees the player, whatever its ray said; so does a parked patrol pulling out
    let visible = assaulted || parkedSaw;
    if (this.watch(player, cosHalf)) visible = true;
    this.speeding(player, dt);
    // boxing the abandoned car: nobody is looking for the player until it is over
    if (this.boxing) {
      this.boxAge += dt;
      // the clock runs while the box is made: two cars round it, or all there are
      if (this.unitsWithin(this.boxX, this.boxZ, t.box.range) >= Math.min(t.busted.units, this.count)) this.boxLeft -= dt;
      if (this.boxLeft > 0 && this.boxAge < t.box.maxSeconds) {
        pursuit.step(dt, level, false, player.x, player.z);
        // fooled too: the chase is over, the air unit goes home
        this.heli.step(dt, level, false, false, player, pursuit.lastX, pursuit.lastZ);
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
    // the air unit's light is sight too; the radio gives it the position while anybody has the car
    const known = pursuit.state === 'detected' || pursuit.state === 'active';
    if (this.heli.step(dt, level, pursuit.state !== 'idle', known, player, pursuit.lastX, pursuit.lastZ)) visible = true;
    if (visible) {
      this.lastVx = player.vx;
      this.lastVz = player.vz;
    }
    const before = pursuit.state;
    pursuit.step(dt, level, visible, player.x, player.z);
    if (before === 'idle' && pursuit.state !== 'idle') {
      const d = pursuit.descriptor;
      this.sim.events.push('dispatch', DISPATCH.suspect, player.x, 0, player.z, packSuspect(d.body, d.paint));
    }
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
          traffic.setPolicePlan(agent, this.withdrawExit(agent, player), 0);
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
      if (arresting && traffic.solid(agent) && gap < a.range) {
        // one not dealt yet (it came on duty since the last deal) waits on the first standby place and is dealt next
        // step (M8.6 D6): it used to ram the stopped car at its class's speed meanwhile
        if (slot < 0) this.slotLeft = 0;
        this.driveToSlot(agent, slot >= 0 ? slot : SLOTS, player, a.standby, a.detourSpeed);
        // a unit at the player's elbow sees the player
        this.seen[u] = 1;
        continue;
      }
      const isChief = agent === this.chief;
      // the Chief drives his own cruiser (M8.8 slice 0) and keeps the interceptor's PIT
      const pit = isChief || traffic.kindOf(agent) === 'sports';
      const next = this.isCutter(u, agent, level) && gap > t.cutoff.breakRange ? this.routeExit(agent, AHEAD) : this.routeExit(agent, CHASE);
      // pressure (DESIGN.md §13.9): close, the player's speed and a little more; far, the catch-up only out of view
      const classSpeed = isChief ? t.chief.speed : pit ? t.interceptorSpeed : t.chaseSpeed;
      const inView = !traffic.outOfView(traffic.x[agent] as number, traffic.z[agent] as number, this.radius, player, t.viewNear, cosHalf);
      const range = isChief ? t.chief.pitRange : pit ? t.pitRange : t.ramRange;
      // the cold open's chase is a lesson (M5.5 gate): the units follow, they never ram in the first minute
      const ram = !this.sim.coldOpen.active && this.seen[u] === 1 && traffic.state[agent] === AgentState.Physical && gap <= range;
      // a ram closes at its own rate on the class's speed
      const speed = ram ? classSpeed : isChief && gap > t.pressure.within ? t.chief.speed : pressureSpeed(t, gap, inView, player.speed, classSpeed);
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
        const across = -dx * -fz - dz * fx, side = across >= 0 ? 1 : -1;
        // M8.6 gate: rigid cars need a real PIT. Alongside first, its nose a metre up the rear quarter and clear of the
        // flank; then the swerve across it, aimed past the centre line over the rear wheel: a blow on the quarter panel
        // that swings the tail. Aimed at the rear corner (the old `pitSideOffset`), a rigid car only sat on the bumper
        // and pushed the car along; the tilting bodies' bounces had been the blows.
        const along = -(dx * fx + dz * fz), abreast = player.halfWidth + traffic.halfWidthOf(agent);
        const alongside = -player.halfLength - traffic.halfLengthOf(agent) + PIT_OVERLAP;
        const beside = Math.abs(along - alongside) < 1.2 && Math.abs(across) > abreast - 0.25 && Math.abs(across) < abreast + 1.5;
        const back = beside ? player.halfLength * 0.4 : -alongside;
        const reach = beside ? -PIT_SWERVE : abreast + 0.3;
        aimX = px - fx * back + -fz * side * reach;
        aimZ = pz - fz * back + fx * side * reach;
      } else if (traffic.kindOf(agent) === 'heavy') {
        // a van shoves the rear corner on its own side: the car goes across the road, not just ahead
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        const side = -dx * -fz - dz * fx >= 0 ? 1 : -1;
        aimX += -fx * player.halfLength * 0.6 + -fz * side * t.heavy.aimSide;
        aimZ += -fz * player.halfLength * 0.6 + fx * side * t.heavy.aimSide;
      }
      const shove = (isChief ? t.chief.pitAcceleration : pit ? t.pitAcceleration : traffic.kindOf(agent) === 'heavy' ? t.heavy.ramAcceleration : t.ramAcceleration)
        * (this.sim.vehicle.tuning.twoWheel > 0 ? t.bikeShove : 1);
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
        // today's patrols park only at today's junctions
        if (this.sim.cover && this.sim.cover.daily.parked[i] !== 1) continue;
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
      if (slot >= 0 && traffic.solid(agent) && gap < t.box.approach) this.driveToSlot(agent, slot, b, t.box.range, t.box.detourSpeed);
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
      if (lane < 0 || !traffic.solid(agent)) continue;
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
    if (left <= 0 || !traffic.solid(agent) || Math.hypot(tx - (traffic.x[agent] as number), tz - (traffic.z[agent] as number)) < LEAVE_REACHED) {
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
    this.playerSpeedMax = Math.max(this.sim.probe.speed, this.playerSpeedMax * 0.8);
    for (let i = 0; i < traffic.capacity; i++) {
      const cool = this.assaultCooldown[i] as number;
      if (cool > 0) this.assaultCooldown[i] = Math.max(0, cool - dt);
      // a car in a police livery the law takes for its own (Fake Frank, M6) counts as one
      if (traffic.police[i] !== 1 && traffic.badge[i] !== 1) continue;
      this.copSpeedMax[i] = Math.max(traffic.speed[i] as number, (this.copSpeedMax[i] as number) * 0.8);
      if (!idle || cool > 0 || !traffic.solid(i)) continue;
      const state = traffic.state[i];
      if (state === AgentState.Wrecked || state === AgentState.Free) continue;
      if ((traffic.playerDv[i] as number) < t.assaultDv) continue;
      // the faster car is at fault: a patrol that drives into a slower or stopped player pays nothing
      if ((this.copSpeedMax[i] as number) > this.playerSpeedMax + BALANCE.heat.faultMargin) continue;
      this.assaultCooldown[i] = t.assaultCooldown;
      // the car you rammed is the witness: a seen crime, and the player is wanted from here
      this.sim.heat.add(BALANCE.heat.policeHit, true);
      assaulted = true;
      // the car you rammed knows the police car that did it
      this.sim.pursuit.markBlown(this.sim.probe.x, this.sim.probe.z);
    }
    return assaulted;
  }

  /** The places round the player (the four and the diagonals), and each slot on the place it was dealt. */
  private placeSlots(player: PlayerProbe): void {
    const reach = slotReach(this.tuning.arrest, player.halfLength, player.halfWidth);
    const rear = reach.rear, front = reach.front, side = reach.side, diagonal = reach.diagonal;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    // right of the heading; +X is left when facing +Z
    const rx = -fz, rz = fx;
    const px = this.placeX, pz = this.placeZ;
    px[0] = player.x - fx * rear; pz[0] = player.z - fz * rear;
    px[1] = player.x + fx * front; pz[1] = player.z + fz * front;
    px[2] = player.x - rx * side; pz[2] = player.z - rz * side;
    px[3] = player.x + rx * side; pz[3] = player.z + rz * side;
    // the diagonals: rear-left, rear-right, front-left, front-right (M8.6 D5)
    px[4] = player.x - fx * diagonal - rx * side; pz[4] = player.z - fz * diagonal - rz * side;
    px[5] = player.x - fx * diagonal + rx * side; pz[5] = player.z - fz * diagonal + rz * side;
    px[6] = player.x + fx * diagonal - rx * side; pz[6] = player.z + fz * diagonal - rz * side;
    px[7] = player.x + fx * diagonal + rx * side; pz[7] = player.z + fz * diagonal + rz * side;
    for (let k = 0; k < SLOTS; k++) {
      const p = this.slotPlace[k] as number;
      this.slotX[k] = px[p] as number;
      this.slotZ[k] = pz[p] as number;
    }
  }

  /**
   * A place a unit can stand on (M8.6 D5): no fixed collider between the player and it (the car beyond a wall would grind
   * the wall), and no car standing there, a wreck, a parked or abandoned car or a civilian (a unit on duty moves off it):
   * the unit's length, read at three points along the player's heading, clear of every such car's footprint grown by
   * the unit's half width.
   */
  private placeFree(p: number, player: PlayerProbe): boolean {
    const traffic = this.traffic;
    const x = this.placeX[p] as number, z = this.placeZ[p] as number;
    const dx = x - player.x, dz = z - player.z;
    const reach = Math.hypot(dx, dz);
    this.ray.origin.x = player.x;
    this.ray.origin.y = this.pos.y + 0.6;
    this.ray.origin.z = player.z;
    this.ray.dir.x = dx / reach;
    this.ray.dir.y = 0;
    this.ray.dir.z = dz / reach;
    if (this.sim.world.castRay(this.ray, reach + 1.5, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_NOT_PROP) !== null) return false;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    for (let o = 0; o < traffic.capacity; o++) {
      const st = traffic.state[o];
      if (st === AgentState.Free) continue;
      if (traffic.police[o] === 1 && (st === AgentState.Kinematic || st === AgentState.Physical)) continue;
      const ox = traffic.x[o] as number, oz = traffic.z[o] as number;
      if (Math.abs(ox - x) > 9 || Math.abs(oz - z) > 9) continue;
      const yaw = traffic.yaw[o] as number, ofx = Math.sin(yaw), ofz = Math.cos(yaw);
      const hl = traffic.halfLengthOf(o) + 1.1, hw = traffic.halfWidthOf(o) + 1.1;
      for (let k = -1; k <= 1; k++) {
        const qx = x + fx * 1.8 * k - ox, qz = z + fz * 1.8 * k - oz;
        if (Math.abs(qx * ofx + qz * ofz) < hl && Math.abs(qx * -ofz + qz * ofx) < hw) return false;
      }
    }
    return true;
  }

  /** Deal the open slots to the nearest units, a unit keeping its own slot unless another is `keep` metres nearer. */
  private dealSlots(player: PlayerProbe): void {
    const traffic = this.traffic;
    const a = this.tuning.arrest;
    this.sim.vehicle.body.translation(this.pos);
    for (let p = 0; p < PLACES; p++) this.placeOpen[p] = this.placeFree(p, player) ? 1 : 0;
    // each slot on its own place, or on a free diagonal beside it not taken by another slot (M8.6 D5); a diagonal it
    // stands on stays its place while free, so a unit is not sent back and forth as the pile shifts
    let taken = 0;
    for (let k = 0; k < SLOTS; k++) {
      const held = this.slotPlace[k] as number;
      let pick = held >= SLOTS && this.placeOpen[held] === 1 && (taken & (1 << held)) === 0 ? held : this.placeOpen[k] === 1 ? k : -1;
      for (let j = 0; j < 2 && pick < 0; j++) {
        const alt = DIAGONALS[k * 2 + j] as number;
        if (this.placeOpen[alt] === 1 && (taken & (1 << alt)) === 0) pick = alt;
      }
      if (pick >= SLOTS) taken |= 1 << pick;
      this.slotOpen[k] = pick >= 0 ? 1 : 0;
      this.slotPlace[k] = pick >= 0 ? pick : k;
      this.slotX[k] = this.placeX[this.slotPlace[k] as number] as number;
      this.slotZ[k] = this.placeZ[this.slotPlace[k] as number] as number;
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
        if (agent < 0 || !traffic.solid(agent) || this.withdrawing[u] === 1) continue;
        const current = held[u] as number;
        if (current >= 0 && current < k) continue;
        const d = Math.hypot((traffic.x[agent] as number) - (this.slotX[k] as number), (traffic.z[agent] as number) - (this.slotZ[k] as number));
        if (Math.hypot((traffic.x[agent] as number) - player.x, (traffic.z[agent] as number) - player.z) > a.range) continue;
        const cost = slotCost(d, current === k, traffic.kindOf(agent) === 'heavy', a);
        if (cost < bestCost) { bestCost = cost; best = u; }
      }
      for (let u = 0; u < this.units.length; u++) if (held[u] === k && u !== best) held[u] = -1;
      if (best >= 0) held[best] = k;
    }
    // the rest stand by behind, one car length apart, ready to take a slot that opens
    let standby = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0 || !traffic.solid(agent) || ((held[u] as number) >= 0 && (held[u] as number) < SLOTS)) continue;
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
    let arrive = d < a.arrive ? 0 : Math.min(t.chaseSpeed, Math.sqrt(2 * a.decel * (d - a.arrive)));
    // beside the stopped car, whatever slot it is going to: a walking pace, never a rush past the door; and braked down
    // to it on the way in (M8.6 D6: a unit dealt the far slot came in at chase speed and rammed what stood round the car)
    const gap = Math.hypot(player.x - ux, player.z - uz);
    arrive = Math.min(arrive, Math.sqrt(a.nearSpeed * a.nearSpeed + 2 * a.decel * Math.max(0, gap - a.near)));
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
    // and round a car standing on the way there, a wreck, a parked car, a unit holding (M8.6 D6): not through it
    const wx = tx - ux, wz = tz - uz, w = Math.hypot(wx, wz);
    let past = detour;
    if (w > a.arrive && this.obstacleOn(agent, ux, uz, wx, wz, w)) {
      tx = this.detourX;
      tz = this.detourZ;
      // at the detour's pace by the time it is beside the obstacle, braked down to it on the way
      past = Math.min(Math.sqrt(detour * detour + 2 * a.decel * Math.max(0, this.detourAt - 8)), arrive);
    }
    // round the player's car at a walking pace: it is a detour past a stopped car, not a pass
    traffic.setPolicePlan(agent, this.routeExit(agent, CHASE), t.chaseSpeed, tx, tz, tx === sx ? arrive : Math.min(arrive, past), a.accel, true);
  }

  /**
   * The nearest car standing on a unit's straight line to its place within 25 m (M8.6 D6): a wreck, a parked or
   * abandoned car, a civilian or a unit, slower than 2 m/s; its round-point, beside it on the side the line passes,
   * into `detourX`/`detourZ`. False when the line is clear.
   */
  private obstacleOn(agent: number, ux: number, uz: number, vx: number, vz: number, d: number): boolean {
    const traffic = this.traffic;
    const own = traffic.halfWidthOf(agent) + 0.4;
    let best = Infinity;
    for (let o = 0; o < traffic.capacity; o++) {
      if (o === agent || traffic.state[o] === AgentState.Free || (traffic.speed[o] as number) > 2) continue;
      const ox = traffic.x[o] as number, oz = traffic.z[o] as number;
      const t = ((ox - ux) * vx + (oz - uz) * vz) / (d * d);
      if (t <= 0 || t >= 1 || t * d > 25 || t * d >= best) continue;
      const cx = ux + vx * t, cz = uz + vz * t;
      const miss = Math.hypot(cx - ox, cz - oz), clear = traffic.halfLengthOf(o) * 0.9 + own;
      if (miss >= clear) continue;
      best = t * d;
      let nx = cx - ox, nz = cz - oz;
      if (miss < 1e-3) { nx = -vz / d; nz = vx / d; } else { nx /= miss; nz /= miss; }
      this.detourX = ox + nx * (clear + 1.2);
      this.detourZ = oz + nz * (clear + 1.2);
    }
    this.detourAt = best;
    return best < Infinity;
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
   * Heat 0 after a door or busted: the roster beyond the beat goes off duty.
   * Each surplus unit drives away from the player and goes back to the pool
   * once it is `withdrawRange` away and out of view, so nobody pops out of
   * existence on screen and a heat-5 roster does not answer the next heat-1
   * crime. The first `budget` live units stay on the beat: no plan, lane
   * driving, lights off.
   */
  private standDown(player: PlayerProbe, cosHalf: number, dt: number): void {
    const traffic = this.traffic;
    const t = this.tuning;
    let kept = 0;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      if (this.afterBust > 0) {
        // stuck in the box's pile after a card (M8.6 D7): a unit that has not moved 2 m in 3 s goes back to the pool
        // the moment nobody sees it, beat or not; the dispatcher sends a fresh one where it is needed
        const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
        if (Math.hypot(x - (this.stuckX[u] as number), z - (this.stuckZ[u] as number)) > 2) {
          this.stuckX[u] = x;
          this.stuckZ[u] = z;
          this.stuckFor[u] = 0;
        } else this.stuckFor[u] = (this.stuckFor[u] as number) + dt;
        if ((this.stuckFor[u] as number) >= 3 && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)
          && (traffic.state[agent] === AgentState.Kinematic || traffic.state[agent] === AgentState.Physical)) {
          traffic.releasePolice(agent);
          if (agent === this.chief) this.chief = -1;
          this.units[u] = -1;
          this.count--;
          continue;
        }
      }
      if (kept < this.budget) {
        kept++;
        continue;
      }
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
      traffic.setPolicePlan(agent, this.withdrawExit(agent, player), 0);
    }
  }

  /**
   * A unit standing down heads for the donut shop (M5.5 slice 18), unless that way leads back toward the player:
   * then away, as ever.
   */
  private withdrawExit(agent: number, player: PlayerProbe): number {
    const toShop = this.routeExit(agent, DONUT);
    const lane = this.traffic.lane[agent] as number;
    if (toShop < 0 || lane < 0) return this.awayExit(agent, player);
    const here = this.graph.lanes[lane] as Lane, next = this.graph.lanes[toShop] as Lane;
    const now = Math.hypot(here.x1 - player.x, here.z1 - player.z), then = Math.hypot(next.x1 - player.x, next.z1 - player.z);
    return then < now - 20 ? this.awayExit(agent, player) : toShop;
  }

  /** Fill the roster up to the level's budget, out of view, one retry window at a time; now and then one pulls out ahead, in view. */
  private dispatch(player: PlayerProbe, cosHalf: number, level: number): void {
    const t = this.tuning;
    if (!this.dispatching || this.spawnLeft > 0) return;
    // the Chief comes back on its cadence even with the roster full, as one more (M8.6 gate: the roster used to thin by
    // wrecks that no longer happen, and a full one kept the Chief away for good)
    if (this.count >= this.budget && level >= t.chief.level && this.chief < 0 && this.chiefWait <= 0) {
      this.spawnLeft = t.spawnRetrySeconds;
      for (let u = 0; u < this.units.length; u++) {
        if ((this.units[u] as number) >= 0) continue;
        const agent = this.spawn(player, cosHalf, 'chief');
        if (agent < 0) return;
        this.arrivals++;
        this.chief = agent;
        this.units[u] = agent;
        this.seen[u] = 0;
        this.withdrawing[u] = 0;
        this.ramCooldown[u] = 0;
        this.slotOf[u] = -1;
        this.count++;
        return;
      }
      return;
    }
    if (this.count >= this.budget) return;
    this.spawnLeft = t.spawnRetrySeconds;
    for (let u = 0; u < this.units.length && this.count < this.budget; u++) {
      if ((this.units[u] as number) >= 0) continue;
      const kind = this.wantedKind(level);
      if (kind === null) break;
      const a = t.arriveInView;
      const ambush = kind !== 'chief' && level >= a.fromLevel && this.arrivals % a.every === a.every - 1;
      let agent = ambush ? this.spawnAhead(player, cosHalf, kind) : -1;
      if (agent >= 0) this.arrivalsInView++;
      else agent = this.spawn(player, cosHalf, kind);
      if (agent < 0) break;
      this.arrivals++;
      if (kind === 'chief') this.chief = agent;
      this.units[u] = agent;
      this.seen[u] = 0;
      this.withdrawing[u] = 0;
      this.ramCooldown[u] = 0;
      this.slotOf[u] = -1;
      this.count++;
    }
  }

  /**
   * The sight rays, staggered one unit a tick: `los` is a clear line whatever
   * the player drives (what sees a crime), `seen` is that without the
   * disguise (what starts a chase). True when any unit sees the player.
   */
  private watch(player: PlayerProbe, cosHalf: number): boolean {
    const traffic = this.traffic;
    const t = this.tuning;
    const pursuit = this.sim.pursuit;
    let visible = false;
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
    return visible;
  }

  /** Off duty across town: a beat car far from the player goes back to the depot, unseen, and another comes on duty near the player. */
  private recycle(player: PlayerProbe, cosHalf: number): void {
    const traffic = this.traffic;
    const t = this.tuning;
    for (let u = 0; u < this.units.length; u++) {
      const agent = this.units[u] as number;
      if (agent < 0) continue;
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      if (Math.hypot(player.x - x, player.z - z) <= t.patrolRecycle || !traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) continue;
      traffic.releasePolice(agent);
      if (agent === this.chief) this.chief = -1;
      this.units[u] = -1;
      this.seen[u] = 0;
      this.los[u] = 0;
      this.count--;
    }
  }

  /**
   * Speeding in a patrol's sight (DESIGN.md §13.3): a unit that sees the
   * player more than `speedingOverKmh` over the road's limit makes the player
   * wanted and pays `speedingSeen` flat, once per `speedingCooldown`. The
   * limit under the player is looked up every `routeSeconds` while someone
   * is watching.
   */
  private speeding(player: PlayerProbe, dt: number): void {
    const h = BALANCE.heat;
    this.speedLeft = Math.max(0, this.speedLeft - dt);
    this.limitLeft -= dt;
    if (this.speedLeft > 0) return;
    let watching = false;
    for (let u = 0; u < this.units.length; u++) if ((this.units[u] as number) >= 0 && this.seen[u] === 1) { watching = true; break; }
    if (!watching) return;
    if (this.limitLeft <= 0 || this.playerLimit === Infinity) {
      this.playerLimit = this.limitUnder(player.x, player.z);
      this.limitLeft = this.tuning.routeSeconds;
    }
    if ((player.speed - this.playerLimit) * 3.6 <= h.speedingOverKmh) return;
    this.speedLeft = h.speedingCooldown;
    this.speedings++;
    this.sim.heat.wanted(h.speedingSeen);
  }

  /** The limit of the nearest lane to a point (the lanes' own bound, as the route search uses it). */
  private limitUnder(x: number, z: number): number {
    const lanes = this.traffic.lanes;
    let best = Infinity, limit = Infinity;
    for (let i = 0; i < lanes.laneCount; i++) {
      if (Math.hypot((lanes.midX[i] as number) - x, (lanes.midZ[i] as number) - z) > (lanes.length[i] as number) / 2 + 40) continue;
      lanes.project(i, x, z, this.projection);
      if (this.projection.dist < best) {
        best = this.projection.dist;
        limit = lanes.limit[i] as number;
      }
    }
    return limit;
  }

  /** A unit sees the player: a clear line and no disguise. */
  canSee(agent: number, player: PlayerProbe, distance: number): boolean {
    return !this.sim.pursuit.disguised && this.lineOfSight(agent, player, distance);
  }

  private lineOfSight(agent: number, player: PlayerProbe, distance: number): boolean {
    if (distance === 0) return true;
    this.sim.vehicle.body.translation(this.pos);
    this.ray.origin.x = this.traffic.x[agent] as number;
    // from the unit's height: a patrol on an overpass looks from the deck, not from the ground under it
    this.ray.origin.y = (this.traffic.y[agent] as number) + this.tuning.sightHeight;
    this.ray.origin.z = this.traffic.z[agent] as number;
    const dx = player.x - this.ray.origin.x;
    const dz = player.z - this.ray.origin.z;
    const dy = this.pos.y - this.ray.origin.y;
    const length = Math.hypot(dx, dy, dz);
    this.ray.dir.x = dx / length;
    this.ray.dir.y = dy / length;
    this.ray.dir.z = dz / length;
    return this.sim.world.castRay(this.ray, length, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_NOT_PROP) === null;
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
      ? this.traffic.spawnPoliceAt(bestLane, bestS, 'police', player, t.viewNear, cosHalf, t.spawnClearance, CHIEF_PAINT, false, 'chiefcar')
      : this.traffic.spawnPoliceAt(bestLane, bestS, kind, player, t.viewNear, cosHalf, t.spawnClearance);
  }

  /**
   * The roadside ambush (DESIGN.md §13.9): a unit pulling out of a side street `arriveInView.ahead` m in front
   * of the player, on a lane that crosses the player's heading and drives toward the player's road, in view.
   * Returns its agent or -1.
   */
  spawnAhead(player: PlayerProbe, cosHalf: number, kind: 'sports' | 'heavy' | 'police'): number {
    const t = this.tuning;
    const lanes = this.traffic.lanes;
    const [near, far] = t.arriveInView.ahead;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const rx = -fz, rz = fx;
    let best = Infinity, bestLane = -1, bestS = 0;
    for (let lane = 0; lane < lanes.laneCount; lane++) {
      const len = lanes.length[lane] as number;
      if (Math.hypot((lanes.midX[lane] as number) - player.x, (lanes.midZ[lane] as number) - player.z) > far + len / 2) continue;
      for (let s = t.spawnEndInset; s <= len - t.spawnEndInset; s += t.spawnSample) {
        lanes.positionAt(lane, s, 0, this.pose);
        const dx = this.pose.x - player.x, dz = this.pose.z - player.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < near || ahead > far) continue;
        const across = dx * rx + dz * rz;
        if (Math.abs(across) > 45) continue;
        // a side street crossing the player's heading, driving toward the player's road
        const lx = Math.sin(this.pose.yaw), lz = Math.cos(this.pose.yaw);
        if (Math.abs(lx * fx + lz * fz) > 0.5) continue;
        if (across * (lx * rx + lz * rz) >= 0) continue;
        if (!this.traffic.canSpawnAt(lane, s, t.spawnClearance)) continue;
        const score = Math.abs(ahead - (near + far) / 2) + Math.abs(across);
        if (score >= best) continue;
        best = score;
        bestLane = lane;
        bestS = s;
      }
    }
    if (bestLane < 0) return -1;
    return this.traffic.spawnPoliceAt(bestLane, bestS, kind, player, t.viewNear, cosHalf, t.spawnClearance, -1, true);
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

/**
 * What a slot of the box costs a unit (lowest takes it): its distance, less `keep` for the slot it holds, and at
 * levels 4-5 (M7 slice 9) less `heavyFirst` for a heavy, so a heavy within reach takes a slot before a nearer saloon.
 */
/**
 * The arrest's slots from the player's middle (M8.8 slice 17): the tuning's for a car the compact's size or bigger; a
 * smaller body (the bike) is boxed as tight, each slot closing in by what its half length or half width lacks.
 */
export function slotReach(a: PoliceTuning['arrest'], halfLength: number, halfWidth: number): { rear: number; front: number; side: number; diagonal: number } {
  const inLength = Math.max(0, a.footLength - halfLength), inWidth = Math.max(0, a.footWidth - halfWidth);
  return { rear: a.rear - inLength, front: a.front - inLength, side: a.side - inWidth, diagonal: a.diagonal - inLength };
}

export function slotCost(distance: number, holding: boolean, heavy: boolean, arrest: { keep: number; heavyFirst: number }): number {
  return distance - (holding ? arrest.keep : 0) - (heavy ? arrest.heavyFirst : 0);
}
