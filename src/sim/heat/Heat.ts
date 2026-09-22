import { BALANCE } from '../balance';
import type { EventLog, SimEvent } from '../events';
import type { Traffic } from '../traffic/Traffic';

/** Heat survives an escape. Event consumers each own a cursor into the ring. */
export class Heat {
  private value = 0;
  private sequence = 0;

  constructor(private readonly events: EventLog, private readonly traffic: Traffic | null) {}

  get points(): number { return this.value; }

  get level(): number {
    let level = 0;
    for (const threshold of BALANCE.heatThresholds) if (this.value >= threshold) level++;
    return level;
  }

  add(points: number): void {
    if (points > 0 && Number.isFinite(points)) this.value = Math.min(100, this.value + points);
  }

  reset(): void {
    this.value = 0;
    this.sequence = this.events.sequence;
  }

  step(): void {
    this.sequence = this.events.readFrom(this.sequence, this.onEvent);
  }

  private readonly onEvent = (event: SimEvent): void => {
    const heat = BALANCE.heat;
    if (event.kind === 'takedown' || event.kind === 'takedownTraffic') {
      this.add(this.traffic?.police[event.target] ? heat.policeTakedown : heat.trafficTakedown);
    } else if (event.kind === 'billboard') {
      this.add(heat.billboard);
    } else if (event.kind === 'camera') {
      this.add(heat.camera);
    } else if (event.kind === 'roadblock') {
      this.add(heat.roadblock);
    }
  };
}
