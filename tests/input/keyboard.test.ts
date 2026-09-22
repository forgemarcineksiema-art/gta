/**
 * The keyboard device and the edge detection above it. `KeyboardEvent.code`
 * only (docs/BRIEF.md), and no press may be lost between two frames.
 */
import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/InputManager';
import { KeyboardDevice } from '../../src/input/KeyboardDevice';

type Listener = (e: { code: string; repeat?: boolean; preventDefault(): void }) => void;

/** Just enough of a Window for the device: three listeners and a way to fire them. */
function fakeWindow(): { target: Window; fire(type: string, code: string, repeat?: boolean): void; defaults: string[] } {
  const listeners = new Map<string, Listener[]>();
  const defaults: string[] = [];
  const target = {
    addEventListener(type: string, fn: Listener) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: Listener) {
      const list = listeners.get(type) ?? [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  } as unknown as Window;
  return {
    target,
    defaults,
    fire(type, code, repeat = false) {
      for (const fn of listeners.get(type) ?? []) fn({ code, repeat, preventDefault: () => defaults.push(code) });
    },
  };
}

function setup(): { input: InputManager; win: ReturnType<typeof fakeWindow> } {
  const win = fakeWindow();
  const input = new InputManager();
  input.addDevice(new KeyboardDevice(win.target));
  return { input, win };
}

describe('keyboard input', () => {
  it('reports a tap that starts and ends between two frames', () => {
    const { input, win } = setup();
    input.update();
    expect(input.state.pressed.pause).toBe(false);
    // Down and up with no frame in between: the pause screen is opened and
    // closed by exactly this, and a fast player taps in well under 16 ms.
    win.fire('keydown', 'KeyP');
    win.fire('keyup', 'KeyP');
    input.update();
    expect(input.state.pressed.pause).toBe(true);
    expect(input.state.value.pause).toBe(1);
    input.update();
    expect(input.state.pressed.pause).toBe(false);
    expect(input.state.released.pause).toBe(true);
    expect(input.state.value.pause).toBe(0);
  });

  it('reports a held key once and keeps its value until it is let go', () => {
    const { input, win } = setup();
    win.fire('keydown', 'KeyW');
    input.update();
    expect(input.state.pressed.throttle).toBe(true);
    for (let i = 0; i < 3; i++) {
      win.fire('keydown', 'KeyW', true); // autorepeat
      input.update();
      expect(input.state.pressed.throttle).toBe(false);
      expect(input.state.value.throttle).toBe(1);
    }
    win.fire('keyup', 'KeyW');
    input.update();
    expect(input.state.value.throttle).toBe(0);
    expect(input.state.released.throttle).toBe(true);
  });

  it('drops everything held when the window loses focus, and prevents default on the scrolling keys', () => {
    const { input, win } = setup();
    win.fire('keydown', 'ArrowUp');
    win.fire('keydown', 'KeyE');
    win.fire('blur', '');
    input.update();
    expect(input.state.value.throttle).toBe(0);
    expect(input.state.pressed.swap).toBe(false);
    expect(win.defaults).toContain('ArrowUp');
    expect(win.defaults).not.toContain('KeyE');
  });

  it('swallows what is pressed while blocked instead of replaying it afterwards', () => {
    const { input, win } = setup();
    input.blocked = true;
    win.fire('keydown', 'KeyE');
    win.fire('keyup', 'KeyE');
    input.update();
    expect(input.state.pressed.swap).toBe(false);
    // An ad ends; the tap made during it is gone, not queued.
    input.blocked = false;
    input.update();
    expect(input.state.pressed.swap).toBe(false);
    win.fire('keydown', 'KeyE');
    win.fire('keyup', 'KeyE');
    input.update();
    expect(input.state.pressed.swap).toBe(true);
  });
});
