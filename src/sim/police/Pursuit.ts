import type { EventLog } from '../events';
import { POLICE, type PoliceTuning } from './tuning';

export type PursuitState = 'idle' | 'detected' | 'active' | 'lost';

/** Detection is separate from heat: escape clears the chase, never the stars. */
export class Pursuit {
  state: PursuitState = 'idle';
  visible = false;
  cooldown = 0;
  escapes = 0;
  lastX = 0;
  lastZ = 0;

  constructor(private readonly events: EventLog, private readonly tuning: PoliceTuning = POLICE) {}

  step(dt: number, level: number, seen: boolean, x: number, z: number): void {
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

  reset(): void {
    this.state = 'idle';
    this.visible = false;
    this.cooldown = 0;
  }
}
