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
import { coverSites, GARAGE, toDropOff, type DropOff } from '../city/cover';
import { GROUPS_SOLID } from '../collision';
import type { SimEvent } from '../events';
import * as M from '../math';
import { POLICE } from '../police/tuning';
import type { Quat } from '../scene';
import type { SimWorld } from '../SimWorld';
import type { PlayerProbe } from '../traffic/Traffic';

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
  /** True until the first door has been opened again: that door ends the cold open and gets no ad (M5 D10). */
  firstDoor = true;
  /** The drop-off being closed or shut, index into `dropOffs`; -1 otherwise. */
  dropOff = -1;
  /** For the wall and the card. */
  lastBag = 0;
  lastBanked = 0;
  lastMultiplier = 1;
  lastFine = 0;
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
    this.dropOffs = sim.city ? coverSites(sim.city).dropOffs : [];
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
    if (this.state === 'door' || this.state === 'busted') return;
    if (this.sim.pursuit.state === 'active') this.maxHeat = Math.max(this.maxHeat, this.sim.heat.level);
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
    const boxed = police !== null && this.sim.heat.level > 0 && probe.speed < b.speed
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

  private bankAt(site: DropOff): void {
    this.lastBag = this.bag;
    this.lastMultiplier = this.multiplier;
    this.lastBanked = Math.round(this.bag * this.lastMultiplier);
    this.lastFine = 0;
    this.bank += this.lastBanked;
    this.bestRun = Math.max(this.bestRun, this.lastBanked);
    this.bag = 0;
    this.endRun();
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
    this.lastBag = this.bag;
    this.lastMultiplier = 1;
    this.lastBanked = 0;
    this.lastFine = Math.round(this.bag * BALANCE.fine);
    this.bank += this.lastFine;
    this.bag = 0;
    this.endRun();
    this.state = 'busted';
    // on a doorstep the door goes back up
    this.doorProgress = 0;
    this.dropOff = -1;
    const p = this.sim.probe;
    this.sim.events.push('busted', this.lastFine, p.x, 0, p.z, -1);
  }

  /** Heat 0 and the chase over; the police read level 0 on the next step and stand down. */
  private endRun(): void {
    this.sim.heat.reset();
    this.sim.pursuit.reset();
    this.bustedProgress = 0;
  }

  private startRun(): void {
    this.runs++;
    this.maxHeat = 0;
    this.counts.takedowns = 0;
    this.counts.escapes = 0;
    this.counts.billboards = 0;
    this.counts.coins = 0;
  }

  private readonly onEvent = (e: SimEvent): void => {
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
        // value: the heat level escaped from
        this.bag += bag.escapePerLevel * e.value;
        this.counts.escapes++;
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
