/**
 * The run (docs/DESIGN.md §2): what a session is made of. Money earned from
 * crimes goes into the bag, which is at risk; a drop-off's door banks it
 * multiplied by the highest heat at which the police had the player; busted
 * banks a fine of half with no multiplier. Either ends the run: heat 0, the
 * pursuit over, the units off duty, the same city.
 *
 * The door race (D6): pulling into a garage under `door.enterSpeed` starts a
 * 3 s close with the player still driving; backing out over the door line
 * cancels it; busted keeps counting and is evaluated first, so a tie goes to
 * the police. The shut door is a game-made break until `openDoor()`.
 *
 * Reads the event ring with its own cursor; no allocation per step.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { BALANCE } from '../balance';
import { GARAGE, toDropOff, type DropOff } from '../city/cover';
import { GROUPS_SOLID } from '../collision';
import type { SimEvent } from '../events';
import * as M from '../math';
import { POLICE } from '../police/tuning';
import type { Quat } from '../scene';
import type { SimWorld } from '../SimWorld';
import type { PlayerProbe } from '../traffic/Traffic';
import { STEP } from './goal';

export type RunState = 'running' | 'closing' | 'door' | 'busted';

/** The run's story for the wall: what happened since the last door or busted card. */
export interface RunCounts {
  takedowns: number;
  escapes: number;
  billboards: number;
  coins: number;
}

export class Run {
  state: RunState = 'running';
  /** At risk until a door. */
  bag = 0;
  /** Safe. */
  bank = 0;
  /** Picked up on the road: the player's at once, never at risk (slice 3b). */
  coins = 0;
  /** The highest heat level at which the pursuit was active this run (D3): what the door multiplies by. */
  maxHeat = 0;
  /** 0..1 while the door closes. */
  doorProgress = 0;
  /** 0..1, the busted bar. */
  bustedProgress = 0;
  /** Runs ended (doors and busted cards closed). */
  runs = 0;
  /** Most banked in one run. */
  bestRun = 0;
  /** Seconds driven (running or closing) over every session: the save carries it. */
  playSeconds = 0;
  /**
   * The first quarter hour's chain (docs/DESIGN.md §13.4): six steps as bits (`goal.ts` CHAIN_STEPS), ticked
   * in any order from the ring, never inside the intro; the goal line shows the first undone. `chainSerial`
   * bumps on a tick and `chainLast` names it (the card). The save carries `chain`.
   */
  chain = 0;
  chainSerial = 0;
  chainLast = -1;
  /** The BORROW prompt's appearances so far: its second line teaches the disguise the first `chain.hintTimes`. */
  borrowHints = 0;
  private borrowPrev = false;
  /** Seconds of active pursuit toward the next bounty (DESIGN.md §13.9). */
  private chaseClock = 0;
  /** Seconds since a police car was last alongside: a candidate that flickers for a step is the same appearance. */
  private borrowGone = Infinity;
  /** True until the first door has been opened again: that door ends the cold open and gets no ad (M5 D10). */
  firstDoor = true;
  /** The drop-off being closed or shut, index into `dropOffs`; -1 otherwise. */
  dropOff = -1;
  /** For the wall and the card. */
  lastBag = 0;
  lastBanked = 0;
  lastMultiplier = 1;
  lastFine = 0;
  /** The door's rewarded offer doubled this door's bag (at most once a door). */
  lastDoubled = false;
  /** Prep items that paid out at the last run's end (the wall and the card name them). */
  lastLawyer = false;
  lastFence = false;
  /** Bumps when the last door's totals change after the door shut (the double). */
  lastSerial = 0;
  readonly counts: RunCounts = { takedowns: 0, escapes: 0, billboards: 0, coins: 0 };
  /** Hideout first; empty on the playground. */
  readonly dropOffs: readonly DropOff[];

  private readonly sim: SimWorld;
  /** One roller-door collider, moved to whichever drop-off shuts. */
  private readonly door: RAPIER.Collider | null;
  private cursor: number;
  /** False after a door or a card inside a garage: the entry boxes re-arm once the car has left them. */
  private armed = true;
  private readonly local = { along: 0, across: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly quat: Quat = { x: 0, y: 0, z: 0, w: 1 };

  constructor(sim: SimWorld) {
    this.sim = sim;
    this.dropOffs = sim.cover ? sim.cover.dropOffs : [];
    this.cursor = sim.events.sequence;
    if (this.dropOffs.length > 0) {
      const g = GARAGE;
      this.door = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(g.doorWidth / 2, g.doorHeight / 2, g.doorThickness / 2)
        .setTranslation(0, -50, 0)
        .setFriction(1)
        .setRestitution(1)
        .setCollisionGroups(GROUPS_SOLID));
      this.door.setEnabled(false);
    } else {
      this.door = null;
    }
  }

  /** What the door would pay the bag at now. */
  get multiplier(): number {
    return BALANCE.multiplier[this.maxHeat] ?? 1;
  }

  /** True while the roller door's collider is down (the totals are showing). */
  get doorShut(): boolean {
    return this.door?.isEnabled() ?? false;
  }

  step(probe: PlayerProbe, dt: number): void {
    // this step's crimes first: the bag must hold them before a door or a fine can end the run
    this.cursor = this.sim.events.readFrom(this.cursor, this.onEvent);
    // a save from before the chain may own a car already: that step is done, silently
    if ((this.chain & (1 << STEP.car)) === 0 && this.sim.garage.owned.size > 1) this.chain |= 1 << STEP.car;
    if (this.state === 'door' || this.state === 'busted') return;
    // a police car alongside: the BORROW prompt comes up (counted once per appearance)
    const cand = this.sim.life.state.swapCandidate;
    const borrow = cand >= 0 && this.sim.traffic !== null && this.sim.traffic.police[cand] === 1;
    if (borrow && !this.borrowPrev && this.borrowGone >= 1 && this.borrowHints < 9) this.borrowHints++;
    this.borrowGone = borrow ? 0 : this.borrowGone + dt;
    this.borrowPrev = borrow;
    this.playSeconds += dt;
    if (this.sim.pursuit.state === 'active') {
      this.maxHeat = Math.max(this.maxHeat, this.sim.heat.level);
      // a chase pays while it lasts: 100 × the level every 10 s, into the bag
      this.chaseClock += dt;
      if (this.chaseClock >= 10 - 1e-9) {
        this.chaseClock -= 10;
        const pay = BALANCE.bag.pursuitPer10s * this.sim.heat.level;
        this.bag += pay;
        this.sim.events.push('chase', pay, probe.x, 0, probe.z, -1);
      }
    }
    if (this.stepBusted(probe, dt)) return;
    this.stepDoor(probe, dt);
  }

  /** Any key at the door: the door rises, the car turned to face the street, a new run at heat 0. */
  openDoor(): void {
    if (this.state !== 'door') return;
    const site = this.dropOffs[this.dropOff];
    this.door?.setEnabled(false);
    this.door?.setTranslation({ x: 0, y: -50, z: 0 });
    if (site) {
      const v = this.sim.vehicle;
      const y = v.body.translation(this.pos).y;
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      // two metres behind the centre, nose to the door: no reversing out of a box under a clock
      this.pos.x = site.x + fx * 2;
      this.pos.y = y;
      this.pos.z = site.z + fz * 2;
      v.teleport(this.pos, site.yaw + Math.PI);
      this.sim.respawned = true;
    }
    this.state = 'running';
    this.doorProgress = 0;
    this.dropOff = -1;
    this.firstDoor = false;
    this.armed = false;
    this.startRun();
  }

  /**
   * What the garage can spend: the bank and the coins (DESIGN.md §3.3 counts both toward the first car; the
   * pools stay apart, D14: coins never enter the bank).
   */
  get funds(): number {
    return this.bank + this.coins;
  }

  /** The garage takes from the bank first, then the coins; false (and nothing taken) when both hold less. */
  spend(amount: number): boolean {
    if (!(amount >= 0) || this.funds < amount) return false;
    const fromBank = Math.min(this.bank, amount);
    this.bank -= fromBank;
    this.coins -= amount - fromBank;
    return true;
  }

  /** Dailies and the streak pay into the bank, never the bag (docs/M5_PLAN.md D14). */
  earn(amount: number): void {
    if (amount > 0 && Number.isFinite(amount)) this.bank += amount;
  }

  /** A wreck: `spill.share` of the bag leaves it as a pool of coins on the lane ahead (Life calls this). */
  spill(x: number, z: number, yaw: number): void {
    const coins = this.sim.coins;
    if (!coins || this.state === 'door' || this.state === 'busted') return;
    const amount = Math.round(this.bag * BALANCE.spill.share);
    if (amount <= 0) return;
    this.bag -= amount;
    coins.spill(x, z, yaw, amount, this.sim.events);
  }

  /** Any key at the busted card: drive on where you stand, heat 0. */
  closeCard(): void {
    if (this.state !== 'busted') return;
    this.state = 'running';
    // busted on a doorstep: the door must not drop on an empty bag the moment the card goes
    this.armed = false;
    this.startRun();
  }

  /** True when the bar filled this step. */
  private stepBusted(probe: PlayerProbe, dt: number): boolean {
    const b = POLICE.busted;
    const police = this.sim.police;
    // Wanted, stopped and boxed. Two cruisers within six metres see the player by construction;
    // the pursuit's sampled sight would only add a lag.
    // never inside the cold open: the first minute teaches the verbs, not the fine
    const boxed = police !== null && this.sim.heat.level > 0 && probe.speed < b.speed && !this.sim.coldOpen.active
      && police.unitsWithin(probe.x, probe.z, b.range) >= b.units;
    this.bustedProgress = boxed
      ? Math.min(1, this.bustedProgress + dt / b.seconds)
      : Math.max(0, this.bustedProgress - dt * b.drainPerSecond);
    // Fixed 60 Hz additions must land on step 180, not 181, from rounding.
    if (this.bustedProgress < 1 - 1e-9) return false;
    this.bust();
    return true;
  }

  private stepDoor(probe: PlayerProbe, dt: number): void {
    if (this.state === 'running') {
      if (!this.armed) {
        if (this.entryAt(probe) < 0) this.armed = true;
        return;
      }
      if (probe.speed >= BALANCE.door.enterSpeed) return;
      const i = this.entryAt(probe);
      if (i < 0) return;
      this.state = 'closing';
      this.dropOff = i;
      this.doorProgress = 0;
    }
    const site = this.dropOffs[this.dropOff] as DropOff;
    toDropOff(site, probe.x, probe.z, this.local);
    if (this.local.along < -GARAGE.depth / 2) {
      // backed out over the door line: the door goes back up
      this.state = 'running';
      this.doorProgress = 0;
      this.dropOff = -1;
      return;
    }
    this.doorProgress = Math.min(1, this.doorProgress + dt / BALANCE.door.closeSeconds);
    // a car straddling the doorway never meets the collider: the door holds at 1 until it is clear
    if (this.doorProgress >= 1 - 1e-9 && this.clearOfDoor(site, probe)) this.bankAt(site);
  }

  /** The drop-off whose entry box holds the car's centre, or -1. */
  private entryAt(probe: PlayerProbe): number {
    for (let i = 0; i < this.dropOffs.length; i++) {
      const site = this.dropOffs[i] as DropOff;
      toDropOff(site, probe.x, probe.z, this.local);
      if (Math.abs(this.local.along) < site.entry.along && Math.abs(this.local.across) < site.entry.across) return i;
    }
    return -1;
  }

  /** The whole chassis is inside the door line, with the door's half thickness and a margin. */
  private clearOfDoor(site: DropOff, probe: PlayerProbe): boolean {
    const a = probe.yaw - site.yaw;
    const reach = probe.halfLength * Math.abs(Math.cos(a)) + probe.halfWidth * Math.abs(Math.sin(a));
    return this.local.along - reach > -GARAGE.depth / 2 + GARAGE.doorThickness / 2 + 0.1;
  }

  /**
   * The door's rewarded offer, after the video finished: the bag doubled before the multiplier, so the bank
   * gains the banked amount again (docs/M5_PLAN.md D10). Once a door; false otherwise.
   */
  doubleLastBag(): boolean {
    if (this.state !== 'door' || this.lastDoubled || this.lastBag <= 0) return false;
    const extra = Math.round(this.lastBanked * (BALANCE.offer.doorMultiplier - 1));
    this.lastDoubled = true;
    this.lastBag *= BALANCE.offer.doorMultiplier;
    this.lastBanked += extra;
    this.bank += extra;
    this.bestRun = Math.max(this.bestRun, this.lastBanked);
    this.lastSerial++;
    return true;
  }

  private bankAt(site: DropOff): void {
    const prep = this.sim.garage.prep;
    this.lastFence = prep.fence;
    this.lastLawyer = false;
    this.lastDoubled = false;
    this.lastBag = this.bag;
    // the fence adds to the multiplier this run earned
    this.lastMultiplier = this.multiplier + (prep.fence ? BALANCE.prep.fenceBonus : 0);
    this.lastBanked = Math.round(this.bag * this.lastMultiplier);
    this.lastFine = 0;
    this.bank += this.lastBanked;
    // new tyres behind the door
    this.sim.life.mend();
    this.bestRun = Math.max(this.bestRun, this.lastBanked);
    this.bag = 0;
    this.endRun(false);
    this.state = 'door';
    this.doorProgress = 1;
    if (this.door) {
      const g = GARAGE;
      this.pos.x = site.door.x;
      this.pos.y = g.doorHeight / 2;
      this.pos.z = site.door.z;
      this.door.setTranslation(this.pos);
      this.door.setRotation(M.quatSetAxisAngle(this.quat, 0, 1, 0, site.yaw));
      this.door.setEnabled(true);
    }
    // after the heat reset, so nothing counts these; the bag's events were read at the top of the step
    this.sim.events.push('door', this.dropOff, site.door.x, 0, site.door.z, this.dropOff);
    this.sim.events.push('banked', this.lastBanked, site.x, 0, site.z, this.dropOff);
  }

  private bust(): void {
    const prep = this.sim.garage.prep;
    this.lastLawyer = prep.lawyer;
    this.lastFence = false;
    this.lastDoubled = false;
    this.lastBag = this.bag;
    this.lastMultiplier = 1;
    this.lastBanked = 0;
    // the lawyer keeps three quarters instead of half
    this.lastFine = Math.round(this.bag * (prep.lawyer ? BALANCE.prep.lawyerKeep : BALANCE.fine));
    this.bank += this.lastFine;
    this.bag = 0;
    this.endRun(true);
    this.state = 'busted';
    // on a doorstep the door goes back up
    this.doorProgress = 0;
    this.dropOff = -1;
    const p = this.sim.probe;
    this.sim.events.push('busted', this.lastFine, p.x, 0, p.z, -1);
  }

  /** Heat 0, the chase over and any job dropped, the prep spent; the police read level 0 on the next step and stand down. */
  private endRun(busted: boolean): void {
    const prep = this.sim.garage.prep;
    if (prep.lawyer || prep.fence) {
      prep.lawyer = false;
      prep.fence = false;
      this.sim.garage.serial++;
    }
    // the day's run challenges read the totals before the heat and the multiplier reset
    this.sim.dailies.onRunEnd(busted ? this.lastFine : this.lastBanked, this.maxHeat, busted);
    this.sim.heat.reset();
    this.sim.pursuit.reset();
    this.sim.jobs.abandon();
    this.sim.roadblocks?.clear();
    // a new run: the police car you still sit in is a clean disguise again
    this.sim.pursuit.blown = false;
    this.bustedProgress = 0;
  }

  private startRun(): void {
    this.runs++;
    this.maxHeat = 0;
    this.chaseClock = 0;
    this.counts.takedowns = 0;
    this.counts.escapes = 0;
    this.counts.billboards = 0;
    this.counts.coins = 0;
  }

  /** The chain's steps from the ring, at the door too (the bank, the purchases); never the intro's own events. */
  private chainEvent(e: SimEvent): void {
    const co = this.sim.coldOpen;
    if (co.active || e.tick <= co.endTick) return;
    switch (e.kind) {
      case 'jobStart':
        this.tickStep(STEP.take);
        break;
      case 'banked':
        if (e.value > 0) this.tickStep(STEP.bank);
        if (e.value >= BALANCE.chain.bankGoal) this.tickStep(STEP.big);
        break;
      case 'purchase':
        if (this.sim.garage.owned.size > 1) this.tickStep(STEP.car);
        break;
      case 'escape':
        if (e.value >= BALANCE.chain.escapeLevel) this.tickStep(STEP.escape);
        break;
      case 'jobDone':
        if (this.sim.jobs.defOf(e.target)?.kind === 'order') this.tickStep(STEP.order);
        break;
      default:
        break;
    }
  }

  private tickStep(step: number): void {
    const bit = 1 << step;
    if ((this.chain & bit) !== 0) return;
    this.chain |= bit;
    this.chainLast = step;
    this.chainSerial++;
  }

  private readonly onEvent = (e: SimEvent): void => {
    this.chainEvent(e);
    if (this.state === 'door' || this.state === 'busted') return;
    const bag = BALANCE.bag;
    switch (e.kind) {
      case 'billboard':
        this.bag += bag.billboard;
        this.counts.billboards++;
        break;
      case 'camera':
        // value: km/h over the limit
        this.bag += Math.round(bag.camera + bag.cameraPerKmh * e.value);
        break;
      case 'roadblock':
        this.bag += bag.roadblock;
        break;
      case 'jump':
        // value: seconds of airtime
        this.bag += Math.round(bag.jump + bag.jumpPerSecond * e.value);
        break;
      case 'takedown':
      case 'takedownTraffic':
        // a police car by its record, not its class: a swapped-into cruiser pays civilian money
        this.bag += this.sim.traffic?.police[e.target] === 1 ? bag.policeTakedown : bag.trafficTakedown;
        this.counts.takedowns++;
        break;
      case 'escape':
        // value: the heat level escaped from; one escape from level 5 opens the police car in the garage
        this.bag += bag.escapePerLevel * e.value;
        this.counts.escapes++;
        if (e.value >= 5 && !this.sim.garage.policeUnlocked) {
          this.sim.garage.policeUnlocked = true;
          this.sim.garage.serial++;
        }
        break;
      case 'jobDone':
        // value: the payout with its time bonus, already rounded
        this.bag += e.value;
        break;
      case 'cache':
        // every tenth cache of the day pays its bonus straight into the bank (never at risk)
        this.bank += e.value;
        break;
      case 'coin':
        // a spilled coin (target -2) was the bag's and goes back into it; a road coin is the player's for good
        if (e.target === -2) this.bag += e.value;
        else {
          this.coins += e.value;
          this.counts.coins++;
        }
        break;
      default:
        break;
    }
  };
}
