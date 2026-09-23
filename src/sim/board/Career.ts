/**
 * The career (M6 slice 1, docs/DESIGN.md §14.2): lifetime counts the wanted
 * board's requirements read that nothing else keeps (the medals, the jumps,
 * the billboards, the best run and the cars are kept where they live). Read
 * from the event log once a step, after the jobs (a delivered fare's def and
 * a race's place are still there). The save carries them. No allocation per
 * step.
 */
import type { SimEvent } from '../events';
import type { SimWorld } from '../SimWorld';

export class Career {
  races = 0;
  zones = 0;
  fares = 0;
  hotFares = 0;
  orders = 0;
  takedowns = 0;
  caches = 0;
  /** Escapes by the level escaped from, 1..5 at 0..4. */
  readonly escapes = [0, 0, 0, 0, 0];
  /** Bumps on every count (the wall's BOARD page). */
  serial = 0;
  private cursor: number;

  constructor(private readonly sim: SimWorld) {
    this.cursor = sim.events.sequence;
  }

  step(): void {
    this.cursor = this.sim.events.readFrom(this.cursor, this.onEvent);
  }

  /** Escapes from `level` stars or more. */
  escapesFrom(level: number): number {
    let n = 0;
    for (let l = Math.max(1, level); l <= 5; l++) n += this.escapes[l - 1] as number;
    return n;
  }

  private readonly onEvent = (e: SimEvent): void => {
    switch (e.kind) {
      case 'jobDone': {
        const d = this.sim.jobs.defOf(e.target);
        if (!d) return;
        if (d.kind === 'race') {
          if (this.sim.jobs.lastPlace !== 1) return;
          this.races++;
        } else if (d.kind === 'rage' || d.kind === 'mayhem') {
          this.zones++;
        } else if (d.kind === 'order') {
          this.orders++;
        } else if (d.kind === 'fare') {
          this.fares++;
          if (this.sim.fares.lastHot) this.hotFares++;
        } else {
          return;
        }
        break;
      }
      case 'takedown':
      case 'takedownTraffic':
        this.takedowns++;
        break;
      case 'escape': {
        const level = Math.round(e.value);
        if (level < 1) return;
        const i = Math.min(5, level) - 1;
        this.escapes[i] = (this.escapes[i] as number) + 1;
        break;
      }
      case 'cache':
        this.caches++;
        break;
      default:
        return;
    }
    this.serial++;
  };
}
