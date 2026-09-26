/**
 * Risk economy and hit classification. Damage, swap and takedowns land in
 * later slices; this one pays boost for a near miss and for the oncoming lane.
 */
import { BALANCE } from '../balance';
import { BILLBOARD_BOTTOM, BILLBOARD_HEIGHT } from '../city/collectibles';
import { bodySpec, isShell } from '../traffic/bodies';
import type { VehicleControls } from '../controls';
import { DAMAGE, ECONOMY, SWAP } from '../economy';
import * as M from '../math';
import type { SimWorld } from '../SimWorld';
import { AgentState, type SwapHandover, type Traffic } from '../traffic/Traffic';
import { PedPose } from '../traffic/Pedestrians';
import { POLICE } from '../police/tuning';

/** How far past the steamroller's drum a car still counts as touching it (m): the contact holds a car off it. */
const DRUM_REACH = 0.35;
/** A car crushed under the monster truck takes up its climb: what is left of its rise (m/s) and of its pitch and roll. */
const CRUSH_RISE = 1.0;
const CRUSH_SPIN = 0.3;

/** One axis of two ground rectangles' separation test: their spans on it overlap. */
function spansMeet(ux: number, uz: number, dx: number, dz: number,
  afx: number, afz: number, ahw: number, ahl: number, bfx: number, bfz: number, bhw: number, bhl: number): boolean {
  const ra = ahl * Math.abs(afx * ux + afz * uz) + ahw * Math.abs(-afz * ux + afx * uz);
  const rb = bhl * Math.abs(bfx * ux + bfz * uz) + bhw * Math.abs(-bfz * ux + bfx * uz);
  return Math.abs(dx * ux + dz * uz) <= ra + rb;
}

/** Whether two rectangles on the ground meet: centres, headings (+z forward at yaw 0) and half extents (across, along). */
function boxesMeet(ax: number, az: number, ayaw: number, ahw: number, ahl: number, bx: number, bz: number, byaw: number, bhw: number, bhl: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const afx = Math.sin(ayaw), afz = Math.cos(ayaw), bfx = Math.sin(byaw), bfz = Math.cos(byaw);
  return spansMeet(afx, afz, dx, dz, afx, afz, ahw, ahl, bfx, bfz, bhw, bhl)
    && spansMeet(-afz, afx, dx, dz, afx, afz, ahw, ahl, bfx, bfz, bhw, bhl)
    && spansMeet(bfx, bfz, dx, dz, afx, afz, ahw, ahl, bfx, bfz, bhw, bhl)
    && spansMeet(-bfz, bfx, dx, dz, afx, afz, ahw, ahl, bfx, bfz, bhw, bhl);
}

export interface LifeState {
  damage: number;
  stage: 0 | 1 | 2 | 3 | 4;
  wrecked: boolean;
  wreckedFor: number;
  swapCandidate: number;
  oncoming: boolean;
  slowMo: number;
  slowMoTarget: number;
  respawnIn: number;
}

export class Life {
  readonly state: LifeState = {
    damage: 0,
    stage: 0,
    wrecked: false,
    wreckedFor: 0,
    swapCandidate: -1,
    oncoming: false,
    slowMo: 0,
    slowMoTarget: -1,
    respawnIn: -1,
  };

  private readonly wasAhead: Uint8Array;
  private readonly cool: Float32Array;
  /** Agents already taken down (one takedown each); cleared when the agent is freed. */
  private readonly takenDown: Uint8Array;
  /** Under the monster truck's wheels (M8.8 slice 12): seconds running, and the step a wheel was last on each car. */
  private readonly underFor: Float32Array;
  private readonly underTick: Int32Array;
  /** A spike strip punctured the tyres: grip down and a pull at the rear until a swap, the door or a fresh car. */
  spiked = false;
  /** The pulls at the rear axle (N, + right) the vehicle takes the sum of: the puncture's and the hurt car's (M8.8 slice 7). */
  private spikePull = 0;
  private hurtPull = 0;
  /** The player's velocity before this step's physics, for closing speeds. */
  private prevVx = 0;
  private prevVz = 0;
  private lastHit = -10;
  /** Collider handle of the previous step's contact, so a hit is reported once per contact, not per step. */
  private lastHitHandle = -1;
  /** What the strongest contact of this step was: the damage rules and the skill chain read it. */
  hitKind: 'traffic' | 'wall' | 'terrain' | 'prop' | 'none' = 'none';
  private oncomingLeft = 0;
  private oncomingEvent = 0;
  private readonly proj = { x: 0, y: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  private readonly handover: SwapHandover = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, kind: 'muscle', body: 'muscle', paint: 0, police: false };
  private readonly oldPose = { x: 0, y: 0, z: 0, yaw: 0 };

  /** `damageEnabled` false keeps the playground a handling lab: hits are classified and reported, nothing dents or wrecks. */
  constructor(private readonly sim: SimWorld, private readonly damageEnabled = true) {
    const n = sim.traffic?.capacity ?? 1;
    this.wasAhead = new Uint8Array(n);
    this.cool = new Float32Array(n);
    this.takenDown = new Uint8Array(n);
    this.underFor = new Float32Array(n);
    this.underTick = new Int32Array(n).fill(-10);
  }

  preStep(controls: VehicleControls, dt: number): void {
    const st = this.state;
    st.swapCandidate = this.findSwapCandidate();
    if (controls.swap && st.swapCandidate >= 0) {
      this.swap(st.swapCandidate);
      controls.swap = false;
      return;
    }
    if (st.wrecked) {
      st.wreckedFor += dt;
      st.respawnIn = Math.max(0, st.respawnIn - dt);
      if (controls.reset || st.respawnIn <= 0) {
        this.respawn();
        controls.reset = false;
      }
    } else if (controls.reset) {
      // any reset is a fresh car
      this.heal();
    }
  }

  postStep(dt: number): void {
    // slow motion runs on wall time: the loop scales its step by slowMoScale, so the timer counts dt / scale;
    // it counts down before this step's takedowns so a fresh takedown shows its full duration
    if (this.state.slowMo > 0) {
      this.state.slowMo = Math.max(0, this.state.slowMo - dt / ECONOMY.slowMoScale);
      if (this.state.slowMo === 0) this.state.slowMoTarget = -1;
    }
    this.hits();
    this.damageStep();
    this.flattenStep(dt);
    this.takedowns();
    this.billboards();
    this.nearMisses(dt);
    this.oncomingLane(dt);
    const dodges = this.sim.peds?.dodgesThisStep ?? 0;
    if (dodges > 0) this.grant(ECONOMY.pedDodgeBoost * dodges);
  }

  /**
   * A car the player touched inside `takedownWindow` that then slams a wall or
   * another car hard, flips, or took the player's own hit at closing speed:
   * it wrecks at once, pays boost and starts the takedown slow motion.
   */
  private takedowns(): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const tm = this.sim.vehicle.telemetry;
    const window = ECONOMY.takedownWindow * 60;
    for (let i = 0; i < traffic.capacity; i++) {
      const st = traffic.state[i];
      if (st === AgentState.Free) { this.takenDown[i] = 0; continue; }
      if (this.takenDown[i]) continue;
      if (this.sim.tick - (traffic.lastPlayerContactTick[i] as number) > window) continue;
      // a police car is built for contact: the same slam has to be harder by its armour
      const armour = traffic.police[i] === 1 ? traffic.tuning.policeArmour : 1;
      const deltaV = ECONOMY.takedownDeltaV * armour;
      let wall: boolean, other: boolean, flipped: boolean, direct = false;
      if (st === AgentState.Wrecked) {
        // written off by its own damage (or one big contact) this step, inside the window: the player's takedown
        if (traffic.justWrecked[i] !== 1) continue;
        other = (traffic.trafficDv[i] as number) > (traffic.wallDv[i] as number);
        wall = !other;
        flipped = false;
      } else {
        // a lent body, or an AI car's (M8.8 slice 23)
        if (!traffic.solid(i)) continue;
        wall = (traffic.wallDv[i] as number) >= deltaV;
        other = (traffic.trafficDv[i] as number) >= deltaV;
        flipped = traffic.upOf(i) < 0.3;
        if ((traffic.playerDv[i] as number) >= deltaV) {
          // closing speed before the impact, from the player's and the car's previous velocities
          const ayaw = traffic.yaw[i] as number;
          const speed = traffic.prevSpeed[i] as number;
          direct = Math.hypot(this.prevVx - Math.sin(ayaw) * speed, this.prevVz - Math.cos(ayaw) * speed) >= ECONOMY.takedownClosingSpeed * armour;
        }
        if (!wall && !other && !flipped && !direct) continue;
      }
      this.takenDown[i] = 1;
      traffic.wreck(i);
      const boost = other ? ECONOMY.takedownTrafficBoost : ECONOMY.takedownBoost;
      this.grant(boost);
      this.sim.events.push(other ? 'takedownTraffic' : 'takedown', boost, traffic.x[i] as number, 0.5, traffic.z[i] as number, i);
      this.state.slowMo = ECONOMY.slowMoSeconds;
      this.state.slowMoTarget = i;
    }
    this.prevVx = tm.vx;
    this.prevVz = tm.vz;
  }

  /**
   * The steamroller's drum (M8.8 slice 11): every car whose footprint meets it is flattened, at any speed, a parked unit
   * and a roadblock's cars too; a driver climbs out beside the pancake shaking a fist; a unit is the player's takedown.
   */
  private flattenStep(dt: number): void {
    const traffic = this.sim.traffic;
    if (!traffic || this.state.wrecked) return;
    const spec = bodySpec(this.sim.carBody);
    if (spec.drum) this.drumStep(traffic, spec.drum);
    if (spec.crush !== undefined) this.wheelStep(traffic, spec.crush, dt);
  }

  private drumStep(traffic: Traffic, drum: { halfWidth: number; length: number }): void {
    const v = this.sim.vehicle;
    const p = v.body.translation(this.proj);
    const yaw = M.yawOf(v.body.rotation(this.rot));
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // the drum across the front of the chassis, a hand's breadth of reach round it (the cars meet it, never enter it)
    const along = v.tuning.chassisHalfExtents.z - drum.length / 2;
    const cx = p.x + fx * along, cz = p.z + fz * along;
    for (let i = 0; i < traffic.capacity; i++) {
      const st = traffic.state[i];
      if (st === AgentState.Free || traffic.flat[i] === 1) continue;
      const x = traffic.x[i] as number, z = traffic.z[i] as number;
      if ((x - cx) ** 2 + (z - cz) ** 2 > 81) continue;
      if (!boxesMeet(cx, cz, yaw, drum.halfWidth + DRUM_REACH, drum.length / 2 + DRUM_REACH, x, z, traffic.yaw[i] as number, traffic.halfWidthOf(i), traffic.halfLengthOf(i))) continue;
      this.squash(traffic, i, cx, cz, p.x, p.z);
    }
  }

  /**
   * The monster truck (M8.8 slice 12): its wheels' rays stand on a car's roof as on the road, so it climbs one; a car a
   * wheel has been on for `crush` s running is flattened under it.
   */
  private wheelStep(traffic: Traffic, crush: number, dt: number): void {
    const tick = this.sim.tick;
    const v = this.sim.vehicle;
    const p = v.body.translation(this.proj);
    let crushed = false;
    for (const w of v.wheels) {
      if (!w.grounded || w.hitHandle < 0) continue;
      const a = traffic.agentForCollider(w.hitHandle);
      if (a < 0 || traffic.flat[a] === 1 || this.underTick[a] === tick) continue;
      const under = this.underTick[a] === tick - 1 ? (this.underFor[a] as number) + dt : dt;
      this.underFor[a] = under;
      this.underTick[a] = tick;
      if (under >= crush - 1e-6) {
        this.squash(traffic, a, p.x, p.z, p.x, p.z);
        crushed = true;
      }
    }
    if (!crushed) return;
    // the car gives way under it: the crush takes up the climb's spring, so the truck settles instead of taking off
    const lin = v.body.linvel(), ang = v.body.angvel();
    if (lin.y > CRUSH_RISE) v.body.setLinvel({ x: lin.x, y: CRUSH_RISE, z: lin.z }, true);
    v.body.setAngvel({ x: ang.x * CRUSH_SPIN, y: ang.y, z: ang.z * CRUSH_SPIN }, true);
  }

  /**
   * A car flattened (M8.8 slices 11–12): the pancake and its `flatten` event; its driver climbs out on the side away
   * from (`fromX`, `fromZ`) and shakes a fist at the player (at `px`, `pz`); a unit is the player's takedown.
   */
  private squash(traffic: Traffic, i: number, fromX: number, fromZ: number, px: number, pz: number): void {
    const st = traffic.state[i];
    const unit = traffic.police[i] === 1;
    const driven = st === AgentState.Kinematic || st === AgentState.Physical || st === AgentState.Disturbed;
    const x = traffic.x[i] as number, z = traffic.z[i] as number, yaw = traffic.yaw[i] as number;
    if (!traffic.flatten(i)) return;
    this.sim.events.push('flatten', 0, x, 0.3, z, i);
    if (driven || unit) {
      const lx = Math.cos(yaw), lz = -Math.sin(yaw);
      const side = (x - fromX) * lx + (z - fromZ) * lz >= 0 ? 1 : -1;
      const out = traffic.halfWidthOf(i) + 1.2;
      const dx = x + lx * side * out, dz = z + lz * side * out;
      this.sim.peds?.spawnAt(dx, dz, Math.atan2(px - dx, pz - dz), PedPose.Fist);
    }
    // a unit flattened is a takedown (read below, this step)
    if (unit) {
      traffic.justWrecked[i] = 1;
      traffic.lastPlayerContactTick[i] = this.sim.tick;
    }
  }

  /** A billboard the footprint crosses at speed smashes: boost, a small speed loss, one `billboard` event, once per id. */
  private billboards(): void {
    const c = this.sim.collectibles;
    if (!c) return;
    const id = c.step(this.sim.probe, ECONOMY.billboardMinSpeed);
    if (id < 0) return;
    this.grant(ECONOMY.billboardBoost);
    const v = this.sim.vehicle;
    const tm = v.telemetry;
    const keep = 1 - ECONOMY.billboardSpeedLoss;
    v.setVelocity(tm.vx * keep, tm.vy, tm.vz * keep);
    const board = c.descOf(id);
    this.sim.events.push('billboard', ECONOMY.billboardBoost, board ? board.x : this.sim.probe.x, (board?.y ?? 0) + BILLBOARD_BOTTOM + BILLBOARD_HEIGHT / 2, board ? board.z : this.sim.probe.z, id);
    // the fiftieth (M5.5 slice 14): the hunt's reward for the set, into the bank through the ring
    if (c.smashedCount === c.total) this.sim.events.push('hunt', BALANCE.hunts.billboards, this.sim.probe.x, 0, this.sim.probe.z, 1);
  }

  /** Damage from this step's strongest contact: walls at full weight, traffic at `trafficFactor`, props and terrain never. */
  private damageStep(): void {
    const st = this.state;
    if (!this.damageEnabled || st.wrecked) return;
    const kind = this.hitKind;
    if (kind !== 'wall' && kind !== 'traffic') return;
    const tm = this.sim.vehicle.telemetry;
    const over = tm.impact - DAMAGE.threshold;
    if (over <= 0) return;
    // a body's own armour (M8.8 slice 5: the Wrecker's twice) takes its share of every hit
    const delta = over * DAMAGE.perMetrePerSecond * (kind === 'traffic' ? this.trafficFactor(tm.hitHandle) : 1) / (bodySpec(this.sim.carBody).armour ?? 1);
    st.damage = Math.min(1, st.damage + delta);
    let stage = 0;
    for (let k = 0; k < DAMAGE.stages.length; k++) if (st.damage >= (DAMAGE.stages[k] as number)) stage = k + 1;
    if (stage === st.stage) return;
    st.stage = stage as LifeState['stage'];
    this.sim.events.push('damage', stage, tm.contactX, tm.contactY, tm.contactZ, -1);
    this.hurt(stage, tm.contactX, tm.contactZ);
    if (stage >= 4) this.wreck();
  }

  /**
   * The car says it is hurt (M8.8 slice 7): from stage 2 the engine gives its share of the torque and the car pulls
   * toward the side of the hit at (`x`, `z`) that raised the stage; mild, and nothing on the screen.
   */
  hurt(stage: number, x: number, z: number): void {
    const h = DAMAGE.handling;
    const v = this.sim.vehicle;
    v.torqueMul = h.torque[stage] ?? 1;
    const p = v.body.translation(this.proj);
    const yaw = M.yawOf(v.body.rotation(this.rot));
    const right = (x - p.x) * -Math.cos(yaw) + (z - p.z) * Math.sin(yaw) >= 0 ? 1 : -1;
    // a push to the right at the rear swings the nose left: the hit's side takes the opposite sign
    this.hurtPull = -right * (h.pull[stage] ?? 0) * v.tuning.mass;
    this.pull();
  }

  private pull(): void {
    this.sim.vehicle.lateralPull = this.spikePull + this.hurtPull;
  }

  /**
   * Traffic weighs `trafficFactor`; a roadblock car is braced (`carDamageFactor`) unless the breach class
   * hits it at `breachSpeed`: then the player takes `breachDamageFactor` and the car is shoved aside.
   */
  private trafficFactor(handle: number): number {
    const traffic = this.sim.traffic;
    const agent = traffic ? traffic.agentForCollider(handle) : -1;
    const blocks = this.sim.roadblocks;
    if (!traffic || agent < 0 || !blocks || (blocks.agents[0] !== agent && blocks.agents[1] !== agent)) return DAMAGE.trafficFactor;
    const r = POLICE.roadblock;
    if (this.sim.carId === r.breachClass && Math.hypot(this.prevVx, this.prevVz) >= r.breachSpeed) {
      traffic.disturb(agent);
      return r.breachDamageFactor;
    }
    return r.carDamageFactor;
  }

  /** Over a spike strip: the tyres go, the car pulls to `side` (+1 right). */
  puncture(side: number): void {
    if (this.spiked) return;
    this.spiked = true;
    this.sim.vehicle.gripMul = POLICE.spike.grip;
    this.spikePull = side * POLICE.spike.pull;
    this.pull();
  }

  /** New tyres: the door, a swap, a fresh car. */
  mend(): void {
    this.spiked = false;
    this.sim.vehicle.gripMul = 1;
    this.spikePull = 0;
    this.pull();
  }

  private wreck(): void {
    const st = this.state;
    st.wrecked = true;
    st.wreckedFor = 0;
    st.respawnIn = DAMAGE.wreckRespawn;
    this.sim.vehicle.engineCut = true;
    const p = this.sim.vehicle.body.translation(this.proj);
    this.sim.events.push('wrecked', 1, p.x, p.y, p.z, -1);
    // the rings rule: part of the bag bursts out on the lane ahead, ten seconds to scramble it back (the lane at the
    // wreck's own level: not a deck over it)
    this.sim.run.spill(p.x, p.z, M.yawOf(this.sim.vehicle.body.rotation(this.rot)), p.y);
  }

  /** A fresh car: no damage, no wreck, new tyres (a reset, a swap, a respawn, the garage's drive-out). */
  heal(): void {
    this.hurtPull = 0;
    this.sim.vehicle.torqueMul = 1;
    this.mend();
    const st = this.state;
    st.damage = 0;
    st.stage = 0;
    st.wrecked = false;
    st.wreckedFor = 0;
    st.respawnIn = -1;
    this.sim.vehicle.engineCut = false;
  }

  /** A fresh car of the same class, rolling on the nearest road, with the boost meter kept. */
  private respawn(): void {
    const v = this.sim.vehicle;
    const pose = v.resetPose;
    v.teleport(pose.position, pose.yaw);
    v.setVelocity(Math.sin(pose.yaw) * DAMAGE.respawnSpeed, 0, Math.cos(pose.yaw) * DAMAGE.respawnSpeed);
    this.sim.traffic?.clearAround(pose.position.x, pose.position.z, DAMAGE.respawnClear);
    this.heal();
    this.sim.respawned = true;
    this.sim.events.push('respawn', 0, pose.position.x, pose.position.y, pose.position.z, -1);
  }

  /** The nearest traffic car alongside, within `SWAP.range` along and `SWAP.lateral` across, not much faster or slower. */
  private findSwapCandidate(): number {
    const traffic = this.sim.traffic;
    if (!traffic) return -1;
    const tm = this.sim.vehicle.telemetry;
    if (!SWAP.airborneAllowed && tm.groundedWheels < 2) return -1;
    const p = this.sim.vehicle.body.translation(this.proj);
    const yaw = M.yawOf(this.sim.vehicle.body.rotation(this.rot));
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < traffic.capacity; i++) {
      // a wanted board's rival's car is won in the duel, never taken (M6 D9)
      if (traffic.state[i] === AgentState.Free || traffic.rival[i] === 1) continue;
      const dx = (traffic.x[i] as number) - p.x;
      const dz = (traffic.z[i] as number) - p.z;
      const along = dx * fx + dz * fz;
      const side = dx * rx + dz * rz;
      if (Math.abs(along) > SWAP.range || Math.abs(side) > SWAP.lateral) continue;
      const ayaw = traffic.yaw[i] as number;
      const speed = traffic.speed[i] as number;
      if (Math.hypot(tm.vx - Math.sin(ayaw) * speed, tm.vz - Math.cos(ayaw) * speed) > SWAP.maxRelativeSpeed) continue;
      const d = along * along + side * side;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Take the candidate's car: retune the vehicle in place, carry the speed, leave the old car and its driver behind. */
  private swap(agent: number): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const v = this.sim.vehicle;
    const p = v.body.translation(this.proj);
    const oldYaw = M.yawOf(v.body.rotation(this.rot));
    // the road the player's car is on: the grid's flat 0; on the island the ground, or what its wheels stand on (a
    // roof, a deck: M8.10 slice 15), so the car left there stays there and the taken one is driven off at its height
    const road = this.roadUnder(p.x, p.z);
    this.oldPose.x = p.x;
    this.oldPose.y = road;
    this.oldPose.z = p.z;
    this.oldPose.yaw = oldYaw;
    // an order's wanted car taken: its clock starts before the record becomes the car left behind
    this.sim.jobs.onSwap(agent);
    traffic.takeOver(agent, this.sim.carBody, this.sim.carPaint, this.oldPose, this.state.wrecked, this.handover);
    const h = this.handover;
    this.sim.carId = h.kind;
    this.sim.carBody = h.body;
    // a car taken on the road has no kit of the garage's (M6 slice 8)
    this.sim.garageDriven = false;
    // a civilian body keeps the paint it had (the yellow taxi stays yellow); a class's own shell takes the garage's
    // and a police car keeps its colours: the disguise is the livery (M8.8 slice 1)
    this.sim.carPaint = isShell(h.body) && !h.police ? this.sim.garage.paintOf(h.kind) : h.paint;
    // the class's upgrades drive every body of the class (DESIGN.md §14.6), a car taken on the street too (M8.8 slice 0)
    v.tuning = this.sim.garage.tuningFor(h.body);
    v.applyTuning();
    // as high over the taken car's road as the player's car was over its own (the grid's flat: the same height); `p`
    // is `proj`, read before it is moved
    const over = p.y - road;
    this.proj.x = h.x;
    this.proj.y = h.y - 0.03 + over;
    this.proj.z = h.z;
    v.teleport(this.proj, h.yaw);
    v.setVelocity(h.vx, 0, h.vz);
    this.heal();
    // the driver you left standing in the road, shaking a fist at you
    const lx = Math.cos(oldYaw);
    const lz = -Math.sin(oldYaw);
    const px = this.oldPose.x + lx * 2.2;
    const pz = this.oldPose.z + lz * 2.2;
    this.sim.peds?.spawnAt(px, pz, Math.atan2(h.x - px, h.z - pz), PedPose.Fist);
    this.sim.events.push('swap', 0, h.x, h.y, h.z, agent);
    this.state.swapCandidate = -1;
    // identity (docs/DESIGN.md §2.5): a swap no unit saw loses them, and they box the car you left
    const police = this.sim.police;
    if (this.sim.pursuit.onSwap(police?.crimeSeen() ?? false, h.kind, this.sim.carPaint, h.body, h.police)) police?.box(this.oldPose.x, this.oldPose.z, oldYaw);
  }

  /**
   * The road under the player's car at (x, z): the street map's ground (the grid's flat 0); on the island where its
   * grounded wheels touch (a roof, a deck over the ground: M8.10 slice 15), the ground's with none down.
   */
  private roadUnder(x: number, z: number): number {
    const ground = this.sim.traffic?.streets.groundAt(x, z) ?? 0;
    if (!this.sim.island) return ground;
    let sum = 0, n = 0;
    for (const w of this.sim.vehicle.wheels) {
      if (!w.grounded) continue;
      sum += w.contact.y;
      n++;
    }
    return n > 0 ? sum / n : ground;
  }

  /** Set the damage directly (the cold open's beat-up van); the stage follows, silently, and a wreck is never set this way. */
  setDamage(damage: number): void {
    const st = this.state;
    st.damage = Math.max(0, Math.min(DAMAGE.stages[3] - 0.01, damage));
    let stage = 0;
    for (let k = 0; k < DAMAGE.stages.length; k++) if (st.damage >= (DAMAGE.stages[k] as number)) stage = k + 1;
    st.stage = stage as LifeState['stage'];
    // a tired engine, but no hit to pull toward
    this.sim.vehicle.torqueMul = DAMAGE.handling.torque[stage] ?? 1;
  }

  skipSlowMo(): void {
    this.state.slowMo = 0;
    this.state.slowMoTarget = -1;
  }

  /** Traffic, a fixed restitution-1 solid (building or boundary), other fixed colliders, or a dynamic prop. */
  classify(handle: number): 'traffic' | 'wall' | 'terrain' | 'prop' | 'none' {
    if (handle < 0) return 'none';
    if (this.sim.traffic && this.sim.traffic.agentForCollider(handle) >= 0) return 'traffic';
    const col = this.sim.world.getCollider(handle);
    if (!col) return 'none';
    const parent = col.parent();
    const fixed = parent === null || parent.isFixed();
    if (!fixed) return 'prop';
    return col.restitution() >= 0.99 ? 'wall' : 'terrain';
  }

  private hits(): void {
    const tm = this.sim.vehicle.telemetry;
    this.hitKind = 'none';
    if (tm.hitHandle < 0 || tm.impact <= 0) {
      this.lastHitHandle = -1;
      return;
    }
    const kind = this.classify(tm.hitHandle);
    if (kind === 'none') return;
    this.hitKind = kind;
    this.lastHit = this.sim.time;
    const agent = kind === 'traffic' ? (this.sim.traffic?.agentForCollider(tm.hitHandle) ?? -1) : -1;
    if (agent >= 0 && this.sim.traffic) this.sim.traffic.lastPlayerContactTick[agent] = this.sim.tick;
    // One event per contact, plus one for every real hit inside a sustained contact (a scrape is not a stream of hits).
    const fresh = tm.hitHandle !== this.lastHitHandle;
    this.lastHitHandle = tm.hitHandle;
    if (!fresh && tm.impact < this.sim.vehicle.tuning.wallHitSpeed) return;
    this.sim.events.push('hit', tm.impact, tm.contactX, tm.contactY, tm.contactZ, agent);
  }

  private nearMisses(dt: number): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const tm = this.sim.vehicle.telemetry;
    const px = this.sim.vehicle.body.translation(this.proj);
    const playerX = px.x;
    const playerZ = px.z;
    const speed = Math.hypot(tm.vx, tm.vz);
    const recentHit = this.sim.time - this.lastHit < 0.5;
    for (let i = 0; i < traffic.capacity; i++) {
      if ((this.cool[i] as number) > 0) this.cool[i] = (this.cool[i] as number) - dt;
      if (traffic.state[i] === AgentState.Free) continue;
      const ax = traffic.x[i] as number;
      const az = traffic.z[i] as number;
      const ox = ax - playerX;
      const oz = az - playerZ;
      const dist = Math.hypot(ox, oz);
      const ahead = ox * tm.vx + oz * tm.vz > 0;
      if (ahead) this.wasAhead[i] = 1;
      else if (dist > 12) this.wasAhead[i] = 0; // passed wide: nothing to score later from behind
      if (dist > 12 || recentHit || (this.cool[i] as number) > 0 || this.wasAhead[i] !== 1 || ahead) continue;
      const agentHw = traffic.halfWidthOf(i);
      const clearance = dist - this.sim.vehicle.tuning.chassisHalfExtents.x - agentHw;
      if (clearance > ECONOMY.nearMissGap) {
        if (!ahead) this.wasAhead[i] = 0;
        continue;
      }
      const avx = Math.sin(traffic.yaw[i] as number) * (traffic.speed[i] as number);
      const avz = Math.cos(traffic.yaw[i] as number) * (traffic.speed[i] as number);
      if (Math.hypot(tm.vx - avx, tm.vz - avz) < ECONOMY.nearMissSpeed) continue;
      const heading = Math.sin(traffic.yaw[i] as number) * tm.vx + Math.cos(traffic.yaw[i] as number) * tm.vz;
      const oncoming = speed > 1 && heading / speed < -0.5;
      const boost = oncoming ? ECONOMY.nearMissOncomingBoost : ECONOMY.nearMissBoost;
      this.grant(boost);
      this.sim.events.push(oncoming ? 'nearMissOncoming' : 'nearMiss', boost, ax, 0.03, az, i);
      this.cool[i] = ECONOMY.nearMissCooldown;
      this.wasAhead[i] = 0;
    }
  }

  private oncomingLane(dt: number): void {
    const traffic = this.sim.traffic;
    const tm = this.sim.vehicle.telemetry;
    const speed = Math.hypot(tm.vx, tm.vz);
    let opposed = false;
    if (traffic && speed >= ECONOMY.oncomingSpeed) {
      const pos = this.sim.vehicle.body.translation(this.proj);
      const x = pos.x;
      const z = pos.z;
      // the nearest lane through the city's lane bounds, then one projection for its heading
      // the road under the car: under an overpass the highway above is not the car's lane
      const lane = this.sim.city ? this.sim.city.nearestLane(x, z, pos.y - 0.5) : -1;
      let best = Infinity;
      let yaw = 0;
      if (lane >= 0) {
        traffic.lanes.project(lane, x, z, this.proj);
        best = Math.abs(this.proj.lateral);
        yaw = this.proj.yaw;
      }
      if (best <= ECONOMY.oncomingLaneDistance) {
        const dot = Math.sin(yaw) * tm.vx + Math.cos(yaw) * tm.vz;
        opposed = dot / speed < -0.7;
      }
    }
    if (opposed) this.oncomingLeft = ECONOMY.oncomingHysteresis;
    else this.oncomingLeft = Math.max(0, this.oncomingLeft - dt);
    const active = this.oncomingLeft > 0 && speed >= ECONOMY.oncomingSpeed;
    this.state.oncoming = active;
    if (!active) { this.oncomingEvent = 0; return; }
    const gained = ECONOMY.oncomingBoostPerSecond * dt;
    this.grant(gained);
    this.oncomingEvent += dt;
    if (this.oncomingEvent >= 1) {
      this.oncomingEvent -= 1;
      const pos = this.sim.vehicle.body.translation(this.proj);
      this.sim.events.push('oncoming', ECONOMY.oncomingBoostPerSecond, pos.x, pos.y, pos.z, -1);
    }
  }

  private grant(amount: number): void {
    const meter = this.sim.vehicle.boostMeter;
    this.sim.vehicle.boostMeter = Math.min(1, meter + amount);
  }
}
