import type { Action, InputDevice } from './actions';

/**
 * Keyboard input keyed by `KeyboardEvent.code` (physical position), so WASD works
 * on AZERTY/QWERTZ without configuration. Arrow keys always work too. Labels are
 * resolved through `navigator.keyboard.getLayoutMap()` where available so the
 * on-screen keycaps show what is printed on the player's keys.
 */
const BINDINGS: Record<string, Action> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'steerLeft',
  ArrowLeft: 'steerLeft',
  KeyD: 'steerRight',
  ArrowRight: 'steerRight',
  Space: 'handbrake',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyR: 'reset',
  KeyP: 'pause',
  KeyC: 'camera',
  Backquote: 'debug',
  KeyE: 'swap',
  KeyM: 'mute',
  Enter: 'skip',
};

/** Primary key shown in overlays, per action. */
const PRIMARY: Partial<Record<Action, string>> = {
  throttle: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  handbrake: 'Space',
  boost: 'ShiftLeft',
  reset: 'KeyR',
  pause: 'KeyP',
  camera: 'KeyC',
  debug: 'Backquote',
  swap: 'KeyE',
  mute: 'KeyM',
  skip: 'Enter',
};

const FALLBACK_LABEL: Record<string, string> = {
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  Backquote: '`',
  Enter: 'ENTER',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Keys whose default browser behaviour (scrolling) must be suppressed while playing. */
const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

interface KeyboardLayoutMapLike {
  get(code: string): string | undefined;
}

export class KeyboardDevice implements InputDevice {
  private readonly down = new Set<string>();
  /** Keys that went down since the last read, so a tap shorter than a frame is reported once instead of never. */
  private readonly tapped = new Set<string>();
  private layout: KeyboardLayoutMapLike | null = null;
  private readonly target: Window;
  private readonly onDown: (e: KeyboardEvent) => void;
  private readonly onUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(target: Window = window) {
    this.target = target;
    this.onDown = (e) => {
      if (e.repeat) {
        if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
        return;
      }
      if (e.code in BINDINGS) {
        this.down.add(e.code);
        this.tapped.add(e.code);
        if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      }
    };
    this.onUp = (e) => {
      this.down.delete(e.code);
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    };
    this.onBlur = () => { this.down.clear(); this.tapped.clear(); };
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
    void this.resolveLayout();
  }

  private async resolveLayout(): Promise<void> {
    try {
      const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<KeyboardLayoutMapLike> } }).keyboard;
      if (kb?.getLayoutMap) this.layout = await kb.getLayoutMap();
    } catch {
      this.layout = null;
    }
  }

  read(raw: Record<Action, number>): void {
    for (const code of this.down) {
      const action = BINDINGS[code];
      if (action) raw[action] = 1;
    }
    for (const code of this.tapped) {
      const action = BINDINGS[code];
      if (action) raw[action] = 1;
    }
    this.tapped.clear();
  }

  label(action: Action): string {
    const code = PRIMARY[action];
    if (!code) return '';
    const fallback = FALLBACK_LABEL[code];
    if (fallback) return fallback;
    const mapped = this.layout?.get(code);
    if (mapped) return mapped.toUpperCase();
    return code.replace(/^Key/, '').toUpperCase();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
