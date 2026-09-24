/**
 * The boot's watch (M7 slice 7, DESIGN.md §15.1: it loads every time). The boot runs through its phases; a phase
 * that takes more than `BOOT_NAME_AFTER` s puts its name on the loading screen (LOADING · CITY), and a boot that has
 * not given control after `BOOT_RETRY_AFTER` s offers a retry the player clicks (a reload is never automatic). Pure:
 * the app applies the words to the screen, in the player's language through `say` (DESIGN.md §19).
 */
import { english, type Say } from '../sim';

export type BootPhase = 'platform' | 'physics' | 'save' | 'sim' | 'renderer' | 'firstFrame';

export const BOOT_PHASES: readonly BootPhase[] = ['platform', 'physics', 'save', 'sim', 'renderer', 'firstFrame'];
export const BOOT_NAME_AFTER = 5;
export const BOOT_RETRY_AFTER = 20;

const WORDS: Readonly<Record<BootPhase, string>> = {
  platform: 'PLATFORM', physics: 'PHYSICS', save: 'SAVE', sim: 'CITY', renderer: 'GRAPHICS', firstFrame: 'FIRST FRAME',
};

export class BootWatch {
  private phase: BootPhase = 'platform';
  private since: number;
  private readonly start: number;

  /** `now` in seconds. */
  constructor(now: number) {
    this.start = now;
    this.since = now;
  }

  enter(phase: BootPhase, now: number): void {
    this.phase = phase;
    this.since = now;
  }

  get current(): BootPhase {
    return this.phase;
  }

  /** The loading screen's words at `now`, and whether a click retries. */
  label(now: number, say: Say = english): { text: string; retry: boolean } {
    if (now - this.start >= BOOT_RETRY_AFTER) return { text: say('STILL LOADING · CLICK TO RETRY'), retry: true };
    if (now - this.since >= BOOT_NAME_AFTER) return { text: say('LOADING · {phase}', { phase: say(WORDS[this.phase]) }), retry: false };
    return { text: say('LOADING'), retry: false };
  }
}
