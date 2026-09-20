import { ACTIONS, ActionState, type Action, type InputDevice } from './actions';

/**
 * Aggregates devices into one ActionState per frame with edge detection.
 * Devices are additive: keyboard now, touch later, without touching game code.
 */
export class InputManager {
  readonly state = new ActionState();
  private readonly devices: InputDevice[] = [];
  private readonly raw: Record<Action, number> = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<Action, number>;
  private readonly prev: Record<Action, number> = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<Action, number>;
  /** When true, all values read as zero (ad in progress, results screen). */
  blocked = false;

  addDevice(d: InputDevice): void {
    this.devices.push(d);
  }

  /** Call once per rendered frame before the sim steps. */
  update(): void {
    for (const a of ACTIONS) this.raw[a] = 0;
    if (!this.blocked) for (const d of this.devices) d.read(this.raw);
    for (const a of ACTIONS) {
      const v = this.raw[a];
      const was = this.prev[a] > 0.5;
      const is = v > 0.5;
      this.state.value[a] = v;
      this.state.pressed[a] = is && !was;
      this.state.released[a] = !is && was;
      this.prev[a] = v;
    }
  }

  label(action: Action): string {
    for (const d of this.devices) {
      const l = d.label(action);
      if (l) return l;
    }
    return '';
  }

  dispose(): void {
    for (const d of this.devices) d.dispose();
    this.devices.length = 0;
  }
}
