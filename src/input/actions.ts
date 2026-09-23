/** Abstract game actions. Devices map their keys/buttons/touches onto these. */
export const ACTIONS = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'boost',
  'reset',
  'pause',
  'camera',
  'debug',
  'swap',
  'mute',
  'skip',
  'map',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Per-frame snapshot: analog value per action plus edge flags for this frame. */
export class ActionState {
  readonly value: Record<Action, number>;
  readonly pressed: Record<Action, boolean>;
  readonly released: Record<Action, boolean>;

  constructor() {
    this.value = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<Action, number>;
    this.pressed = Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;
    this.released = Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;
  }

  /** Signed steering in [-1, 1]. */
  get steer(): number {
    return this.value.steerRight - this.value.steerLeft;
  }
}

export interface InputDevice {
  /** Merge this device's current state into `raw` (max of analog values). */
  read(raw: Record<Action, number>): void;
  /** Human-readable label for the primary binding of an action (for keycap overlays). */
  label(action: Action): string;
  dispose(): void;
}
