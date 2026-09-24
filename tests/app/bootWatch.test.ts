/**
 * The boot's watch (M7 slice 7): the loading screen says LOADING until a phase
 * has taken five seconds, then names it; twenty seconds in, whatever the
 * phase, it offers a retry the player clicks.
 */
import { describe, expect, it } from 'vitest';
import { BOOT_NAME_AFTER, BOOT_PHASES, BOOT_RETRY_AFTER, BootWatch } from '../../src/app/bootWatch';

describe('the boot watch', () => {
  it('M7 7.1 LOADING, then the slow phase by name after 5 s in it, then a retry after 20 s in all', () => {
    expect(BOOT_PHASES).toEqual(['platform', 'physics', 'save', 'sim', 'renderer', 'firstFrame']);
    const w = new BootWatch(100);
    expect(w.label(100.5)).toEqual({ text: 'LOADING', retry: false });
    w.enter('physics', 101);
    expect(w.label(101 + BOOT_NAME_AFTER - 0.1).text).toBe('LOADING');
    expect(w.label(101 + BOOT_NAME_AFTER)).toEqual({ text: 'LOADING · PHYSICS', retry: false });
    // a new phase starts its own clock
    w.enter('sim', 107);
    expect(w.label(108).text).toBe('LOADING');
    expect(w.label(112.5).text).toBe('LOADING · CITY');
    // the retry counts from the boot's start, whatever the phase
    expect(w.label(100 + BOOT_RETRY_AFTER)).toEqual({ text: 'STILL LOADING · CLICK TO RETRY', retry: true });
    expect(w.current).toBe('sim');
  });
});
