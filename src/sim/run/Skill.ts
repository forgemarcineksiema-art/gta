/**
 * The skill chain (M5.5 slice 14; DESIGN.md §7 and §3.3, Forza Horizon's):
 * near misses, the oncoming lane, drifts and airtime are tricks. Each adds its
 * points (50–300) to the running chain, and every `multEvery` tricks raise the
 * multiplier by one, to ×`maxMult`. The chain lives `window` s after its last
 * trick and is held open while a drift, a flight or the oncoming lane lasts.
 * When the window runs out it banks: the points × the multiplier into the bag,
 * through a `skill` event the run reads. A wall hit at `crashImpact` m/s or
 * more, a wreck or busted loses it (`skillLost`); pulling into a door banks it
 * at once, before the door banks the bag. A smash of the street furniture is a trick too (M8 slice 6): the thing's
 * points and its name as the chain's word; smashes within `smashGroup` s of their group's first count as one trick
 * toward the multiplier, all their points added; an anchored thing that holds against the car loses the chain as a
 * wall does. No allocation per step.
 */
import { BALANCE } from '../balance';
import { PROP_KINDS, PROP_TYPES } from '../city/props';
import type { SimEvent } from '../events';
import type { SimWorld } from '../SimWorld';

/** The last trick, for the HUD's word. */
export enum Trick { None = -1, NearMiss = 0, OncomingMiss = 1, Oncoming = 2, Drift = 3, Air = 4, Smash = 5 }
export const TRICK_WORDS: readonly string[] = ['NEAR MISS', 'ONCOMING MISS', 'ONCOMING', 'DRIFT', 'AIR', 'SMASH'];

export class Skill {
  /** The running chain's points before the multiplier, and its tricks; both 0 with no chain. */
  points = 0;
  tricks = 0;
  /** Seconds before the chain banks. */
  left = 0;
  /** The last trick and its word (a smash's is the thing's name). `serial` bumps on every trick, bank and loss: the HUD redraws on it. */
  last: Trick = Trick.None;
  word = '';
  serial = 0;
  /** How the last chain ended: what it paid, or what it would have paid when lost. */
  lastPay = 0;
  lastLost = false;
  /** The current drift's and flight's points (each capped at `perTrickCap`); whether the drift has counted as a trick. */
  private driftPoints = 0;
  private driftCounted = false;
  private airPoints = 0;
  /** Seconds off the ground in the current flight. */
  private flight = 0;
  private lose = false;
  private cursor: number;
  /** The chain's clock (s) and when the current group of smashes began (-Infinity: none). */
  private clock = 0;
  private smashGroupAt = -Infinity;

  constructor(private readonly sim: SimWorld) {
    this.cursor = sim.events.sequence;
  }

  /** ×1, one more every `multEvery` tricks, up to ×`maxMult`. */
  get multiplier(): number {
    const s = BALANCE.skill;
    return Math.min(s.maxMult, 1 + Math.floor(this.tricks / s.multEvery));
  }

  /** What the chain would bank now. */
  get value(): number {
    return Math.round(this.points * this.multiplier / 10) * 10;
  }

  /** After the jumps, before the run: this step's tricks, the window, the bank or the loss. */
  step(dt: number): void {
    const sim = this.sim, s = BALANCE.skill, tm = sim.vehicle.telemetry;
    this.clock += dt;
    this.cursor = sim.events.readFrom(this.cursor, this.onEvent);
    const run = sim.run.state;
    // a wall hit hard, a lamp post that held, a wreck, busted: the chain is gone
    if (sim.life.hitKind === 'wall' && tm.impact >= s.crashImpact) this.lose = true;
    const props = sim.props;
    if (props && props.held >= 0 && props.heldClosing >= s.holdCrash) this.lose = true;
    if (this.lose || run === 'busted') {
      this.lose = false;
      this.end(false);
      return;
    }
    // into a door: the chain banks before the bag does
    if (run !== 'running') {
      this.end(true);
      return;
    }
    const speed = Math.hypot(tm.vx, tm.vz);
    // a drift at speed: points by the second, a trick once it has lasted `driftTrick` s
    const drifting = tm.drifting && speed >= s.minSpeed;
    if (drifting) {
      const add = Math.min(s.perTrickCap - this.driftPoints, s.driftPerSecond * dt);
      if (add > 0) { this.driftPoints += add; this.points += add; }
      if (!this.driftCounted && tm.driftTime >= s.driftTrick) {
        this.driftCounted = true;
        this.trick(Trick.Drift, 0);
      }
    } else {
      this.driftPoints = 0;
      this.driftCounted = false;
    }
    // a flight: points by the second past `airMin`, a trick on a landing after `airTrick` s
    const flying = tm.groundedWheels === 0;
    if (flying) {
      this.flight += dt;
      if (this.flight >= s.airMin) {
        const add = Math.min(s.perTrickCap - this.airPoints, s.airPerSecond * dt);
        if (add > 0) { this.airPoints += add; this.points += add; }
      }
    } else {
      if (this.flight >= s.airTrick && this.airPoints > 0) this.trick(Trick.Air, 0);
      this.flight = 0;
      this.airPoints = 0;
    }
    if (this.points <= 0) return;
    if ((drifting && this.driftPoints > 0) || (flying && this.airPoints > 0) || sim.life.state.oncoming) {
      this.left = s.window;
      return;
    }
    this.left -= dt;
    if (this.left <= 0) this.end(true);
  }

  private trick(kind: Trick, points: number, word = TRICK_WORDS[kind] ?? ''): void {
    this.points += points;
    this.tricks++;
    this.last = kind;
    this.word = word;
    this.left = BALANCE.skill.window;
    this.serial++;
  }

  /** A smash: its points always; a trick toward the multiplier only when it opens a group. */
  private smash(id: number): void {
    const k = this.sim.props?.kind[id] ?? 255;
    if (k === 255) return;
    const t = PROP_TYPES[PROP_KINDS[k] as keyof typeof PROP_TYPES];
    if (this.clock - this.smashGroupAt >= BALANCE.skill.smashGroup) {
      this.smashGroupAt = this.clock;
      this.trick(Trick.Smash, t.points, t.name);
      return;
    }
    this.points += t.points;
    this.last = Trick.Smash;
    this.word = t.name;
    this.left = BALANCE.skill.window;
    this.serial++;
  }

  /** The chain's end: banked into the bag through the ring, or lost. */
  private end(bank: boolean): void {
    this.driftPoints = 0;
    this.airPoints = 0;
    if (this.points <= 0) return;
    const value = this.value, p = this.sim.probe;
    this.sim.events.push(bank ? 'skill' : 'skillLost', value, p.x, 0, p.z, this.tricks);
    this.lastPay = value;
    this.lastLost = !bank;
    this.points = 0;
    this.tricks = 0;
    this.left = 0;
    this.last = Trick.None;
    this.word = '';
    this.smashGroupAt = -Infinity;
    this.serial++;
  }

  private readonly onEvent = (e: SimEvent): void => {
    const s = BALANCE.skill;
    switch (e.kind) {
      case 'nearMiss':
        this.trick(Trick.NearMiss, s.nearMiss);
        break;
      case 'nearMissOncoming':
        this.trick(Trick.OncomingMiss, s.oncomingMiss);
        break;
      case 'oncoming':
        this.trick(Trick.Oncoming, s.oncoming);
        break;
      case 'wrecked':
        this.lose = true;
        break;
      case 'smash':
        // the player's (a bill), never a chasing unit's
        if (e.value > 0) this.smash(e.target);
        break;
      default:
        break;
    }
  };
}
