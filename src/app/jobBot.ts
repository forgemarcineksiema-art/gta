/**
 * The road bot on a job (`?bot=job`, the M5 e2e): on a delivery it drives
 * the shortest lane path into the drop-off; hunting an order it re-plans a
 * path to the wanted car every two seconds; with the stolen car it drives to
 * the fence. The swap itself is the test's (App glue: reads the sim, writes
 * controls only).
 */
import type { DropOff, SimWorld, VehicleControls } from '../sim';
import { routeToAgent, routeToDropOff, routeToPoint } from './doorRoute';
import { CITY_BOT_TUNING, TrackBot } from './trackBot';

const REPLAN_SECONDS = 2;

export class JobBot {
  readonly bot: TrackBot;
  private replan = 0;
  /** The job and state the current path was built for. */
  private planned = '';

  constructor(car: SimWorld['carId']) {
    this.bot = new TrackBot(car, CITY_BOT_TUNING);
  }

  get resets(): number {
    return this.bot.resets;
  }

  drive(sim: SimWorld, controls: VehicleControls, dt: number): void {
    const jobs = sim.jobs;
    const d = jobs.running;
    this.replan -= dt;
    const key = d ? `${d.id}:${jobs.state}` : '';
    if (d && jobs.state === 'hunting') {
      if (jobs.wantedAgent >= 0 && (this.replan <= 0 || key !== this.planned)) {
        this.replan = REPLAN_SECONDS;
        this.planned = key;
        this.bot.setPath(routeToAgent(sim, jobs.wantedAgent));
      }
    } else if (d && jobs.state === 'active' && key !== this.planned && d.kind !== 'escape') {
      this.planned = key;
      const site = sim.run.dropOffs.find((s: DropOff) => Math.hypot(s.door.x - d.targetX, s.door.z - d.targetZ) < 8);
      this.bot.setPath(site ? routeToDropOff(sim, site) : routeToPoint(sim, d.targetX, d.targetZ));
    }
    this.bot.drive(sim, controls, dt);
  }
}
