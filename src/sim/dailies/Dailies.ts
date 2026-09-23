/**
 * Daily challenges and the login streak (docs/M5_PLAN.md slice 6). The state
 * lives here so the save carries it from slice 0; the draw, the progress and
 * the streak arrive with slice 6.
 */
import type { SimWorld } from '../SimWorld';

export class Dailies {
  /** The local date the three were drawn for, `YYYY-MM-DD`; '' before the first. */
  date = '';
  readonly ids: [number, number, number] = [-1, -1, -1];
  readonly progress: [number, number, number] = [0, 0, 0];
  readonly done: [boolean, boolean, boolean] = [false, false, false];
  readonly streak = { count: 0, last: '', topper: false };

  constructor(private readonly sim: SimWorld) {}

  /** Slice 6. */
  setDate(_local: string): void {
    void this.sim;
  }

  /** Slice 6. */
  step(): void {
    // nothing yet
  }

  /** Slice 6. */
  onRunEnd(_banked: number, _maxHeat: number, _busted: boolean): void {
    // nothing yet
  }
}
