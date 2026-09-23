import type { EventLog } from '../events';
import type { CarId } from '../vehicle/presets';
import { BODY_INDEX, type BodyId } from '../traffic/bodies';
import { POLICE, type PoliceTuning } from './tuning';

/** The radio's lines (the `dispatch` event's value; docs/DESIGN.md §13.9). */
export const DISPATCH = { roadblock: 1, unitDown: 2, suspect: 3 } as const;

/** The descriptor as one number for an event's target: the body's index over the paint (a class's index is its own shell's). */
export function packSuspect(body: BodyId, paint: number): number {
  return (BODY_INDEX[body] << 24) | (paint & 0xffffff);
}

export type PursuitState = 'idle' | 'detected' | 'active' | 'lost';

/** What the police are looking for: the class, the body and the paint of the player's car (docs/DESIGN.md §2.5). */
export interface Descriptor {
  kind: CarId;
  body: BodyId;
  paint: number;
}

/**
 * Detection is separate from heat: escape clears the chase, never the stars.
 *
 * Identity (slice 5): the descriptor follows the player's car through every
 * swap. A swap no unit saw loses the police at once (`lose()`); one they saw
 * only changes the descriptor. A police car is a disguise until a crime is
 * committed in a unit's sight (`markBlown()`).
 */
export class Pursuit {
  state: PursuitState = 'idle';
  visible = false;
  cooldown = 0;
  escapes = 0;
  /** Of those, the ones won by a swap nobody saw. */
  swapEscapes = 0;
  lastX = 0;
  lastZ = 0;
  readonly descriptor: Descriptor = { kind: 'muscle', body: 'muscle', paint: 0 };
  /** A crime was seen from the police car the player drives: the disguise no longer holds. */
  blown = false;
  /** Seconds until the dispatcher notices the stolen police car (the slice-5 measurement's fallback, DESIGN.md §12). */
  coverLeft = 0;
  /** Seconds the radio still gives the police the player's position (a forced chase, M5's escape job). */
  radioLeft = 0;
  private level = 0;

  constructor(private readonly events: EventLog, private readonly tuning: PoliceTuning = POLICE) {}

  /** 0..1 of the cooldown run down while the police search (the HUD's ring, the radar's disc); 0 otherwise. */
  get escapeProgress(): number {
    if (this.state !== 'lost') return 0;
    const total = this.tuning.escapeSeconds[this.level] ?? 15;
    return total > 0 ? Math.max(0, Math.min(1, 1 - this.cooldown / total)) : 1;
  }

  /** The radar's search disc round the last fix (m): it grows as the search goes on. */
  get searchRadius(): number {
    const s = this.tuning.search;
    return s.discMin + (s.discMax - s.discMin) * this.escapeProgress;
  }

  /** In a police car nobody has seen misbehave: no unit detects the player. */
  get disguised(): boolean {
    return this.descriptor.kind === 'police' && !this.blown;
  }

  step(dt: number, level: number, seen: boolean, x: number, z: number): void {
    this.level = level;
    if (this.radioLeft > 0) {
      this.radioLeft -= dt;
      seen = true;
    }
    if (this.disguised) {
      this.coverLeft -= dt;
      if (this.coverLeft <= 0) this.markBlown(x, z);
    }
    this.visible = level > 0 && seen;
    if (level === 0) {
      this.reset();
      return;
    }
    if (this.visible) {
      this.lastX = x;
      this.lastZ = z;
      this.cooldown = this.tuning.escapeSeconds[level] ?? 15;
      this.state = this.state === 'idle' ? 'detected' : 'active';
      return;
    }
    if (this.state === 'idle') return;
    if (this.state !== 'lost') {
      this.state = 'lost';
      this.cooldown = this.tuning.escapeSeconds[level] ?? 15;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    // Fixed 60 Hz subtraction must finish on step 360, not 361 from rounding.
    if (this.cooldown <= 1e-9) {
      this.cooldown = 0;
      this.state = 'idle';
      this.escapes++;
      this.events.push('escape', level, x, 0, z);
    }
  }

  /**
   * The player changed cars. The descriptor becomes the new car, which
   * carries no blown cover. Returns true when the swap lost the police: a
   * chase was on and no unit saw it happen.
   */
  onSwap(seenNow: boolean, kind: CarId, paint: number, body: BodyId = kind): boolean {
    this.descriptor.kind = kind;
    this.descriptor.body = body;
    this.descriptor.paint = paint;
    this.blown = false;
    this.coverLeft = this.tuning.disguise.seconds;
    // seen: the radio names the new car (the identity rule, taught by the police themselves)
    if (seenNow && this.state !== 'idle') this.events.push('dispatch', DISPATCH.suspect, 0, 0, 0, packSuspect(body, paint));
    if (seenNow || this.state === 'idle') return false;
    this.lose();
    return true;
  }

  /** The chase ends at once: idle, no cooldown, an escape at the current level (target 1: by a swap). */
  lose(): void {
    if (this.state === 'idle') return;
    this.state = 'idle';
    this.visible = false;
    this.cooldown = 0;
    this.escapes++;
    this.swapEscapes++;
    this.events.push('escape', this.level, this.lastX, 0, this.lastZ, 1);
  }

  /**
   * Straight into a chase (M5's pursuit escape job, tests): active and seen
   * this step, and for `radioSeconds` more the police know where the player
   * is, so the units close in before the escape timer can start.
   */
  force(radioSeconds = 0): void {
    this.state = 'active';
    this.visible = true;
    this.radioLeft = radioSeconds;
  }

  /** A crime from the police car with a unit watching. */
  markBlown(x: number, z: number): void {
    if (this.blown || this.descriptor.kind !== 'police') return;
    this.blown = true;
    this.events.push('blown', 0, x, 0, z);
  }

  reset(): void {
    this.state = 'idle';
    this.visible = false;
    this.cooldown = 0;
    this.radioLeft = 0;
  }
}
