/**
 * The save's IO (docs/history/M5_PLAN.md D1): one key through the platform adapter,
 * loaded before the sim boots, written at most once per
 * `BALANCE.save.debounceSeconds` while something changed, and at once at the
 * breaks (the door, the busted card, the drive-out) and when the page is
 * hidden or left. The format and its pins live in `sim/save/format.ts`.
 *
 * A stored document of a newer version is kept verbatim in `unknownRaw` and
 * never overwritten: an old build must not destroy a new save.
 */
import type { Platform } from '../platform';
import { BALANCE, collect, defaultSave, parse, serialize, versionOf, SAVE_VERSION, type SaveV1, type SimWorld } from '../sim';

export class SaveStore {
  /** The text of a save written by a newer build; while set, nothing is written. */
  unknownRaw: string | null = null;
  /** Writes issued (the debug line, the tests). */
  writes = 0;
  private readonly doc: SaveV1 = defaultSave();
  private lastText = '';
  private lastBytes = 0;
  private dirty = false;
  private lastWrite = -Infinity;
  private busy = false;

  constructor(private readonly platform: Platform, private readonly key: string = BALANCE.save.key, private readonly now: () => number = () => performance.now() / 1000) {}

  /** Last serialized length in bytes (UTF-16 code units: the document is ASCII). */
  get bytes(): number {
    return this.lastBytes;
  }

  /** Never rejects: a platform that fails gives the defaults. */
  async load(): Promise<SaveV1> {
    let text: string | null = null;
    try {
      text = await this.platform.loadData(this.key);
    } catch (e) {
      console.warn('save: load failed', e);
      return defaultSave();
    }
    const v = versionOf(text);
    if (text !== null && v !== null && v > SAVE_VERSION) {
      this.unknownRaw = text;
      console.warn(`save: version ${v} is newer than this build's ${SAVE_VERSION}; playing on defaults, not writing`);
    }
    const save = parse(text);
    this.lastText = text !== null && this.unknownRaw === null ? serialize(save) : '';
    this.lastBytes = this.lastText.length;
    return save;
  }

  /** Something the save carries changed: a write follows within the debounce. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Drives the debounce from the frame loop. */
  tick(sim: SimWorld, _dt: number): void {
    if (!this.dirty || this.busy) return;
    if (this.now() - this.lastWrite < BALANCE.save.debounceSeconds) return;
    void this.flush(sim);
  }

  /** Collect, serialize and write now; nothing when the text is unchanged or a newer save is protected. */
  async flush(sim: SimWorld): Promise<void> {
    this.dirty = false;
    if (this.unknownRaw !== null) return;
    collect(sim, this.doc);
    const text = serialize(this.doc);
    if (text === this.lastText) return;
    if (text.length > BALANCE.save.maxBytes) console.warn(`save: ${text.length} bytes is over the ${BALANCE.save.maxBytes} guard`);
    this.lastText = text;
    this.lastBytes = text.length;
    this.lastWrite = this.now();
    this.writes++;
    this.busy = true;
    try {
      await this.platform.saveData(this.key, text);
    } catch (e) {
      console.warn('save: write failed', e);
    } finally {
      this.busy = false;
    }
  }

  /** `pagehide` and `visibilitychange` to hidden flush at once. Returns the unbinding. */
  bindLifecycle(target: Window, sim: SimWorld): () => void {
    const onHide = (): void => void this.flush(sim);
    const onVisibility = (): void => {
      if (target.document.visibilityState === 'hidden') void this.flush(sim);
    };
    target.addEventListener('pagehide', onHide);
    target.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      target.removeEventListener('pagehide', onHide);
      target.document.removeEventListener('visibilitychange', onVisibility);
    };
  }
}
