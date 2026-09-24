/**
 * The label over the nearest open sign (docs/M8.7_PLAN.md D5; docs/M8.9_PLAN.md R7): anchored in the world, the
 * sign's kind in words with its pay in the line's yellow (UCIECZKA +3000), so a pictogram that does not say itself
 * (the police light, the crash star, the hammer) is named where the choice is made. Shown only near a sign (its
 * moment, never a standing place). The app places it from the renderer's projection; DOM writes only on change.
 */
import { RIVALS, type JobDef } from '../../sim';
import { num, t } from '../lang';
import { KIND_TITLE } from './jobs';

/** A move worth a DOM write: over half a pixel, and always from the first (unplaced) point. */
export function moved(prevX: number, prevY: number, x: number, y: number): boolean {
  return !(Math.abs(x - prevX) <= 0.5 && Math.abs(y - prevY) <= 0.5);
}

/** The English key of a marker's kind as the label names it: a rival's name for a duel, else the kind's title. */
export function payKindKey(d: Pick<JobDef, 'kind' | 'level'>): string {
  if (d.kind === 'duel') return RIVALS[d.level]?.name ?? KIND_TITLE.duel;
  return KIND_TITLE[d.kind];
}

export class PayLabel {
  readonly root: HTMLElement;
  private readonly kindEl: HTMLElement;
  private readonly cashEl: HTMLElement;
  private kindKey = '';
  private amount = -1;
  private visible = false;
  private x = NaN;
  private y = NaN;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pay';
    this.kindEl = document.createElement('span');
    this.kindEl.className = 'pay__kind';
    this.cashEl = document.createElement('span');
    this.cashEl.className = 'pay__cash';
    this.root.append(this.kindEl, this.cashEl);
    parent.appendChild(this.root);
  }

  /** At screen point (x, y) in CSS px: the label's foot over the sign of marker `d`, paying `amount`. */
  show(x: number, y: number, d: Pick<JobDef, 'kind' | 'level'>, amount: number): void {
    const key = payKindKey(d);
    if (key !== this.kindKey) {
      this.kindKey = key;
      this.kindEl.textContent = t(key);
    }
    if (amount !== this.amount) {
      this.amount = amount;
      this.cashEl.textContent = `+${num(amount)}`;
    }
    if (moved(this.x, this.y, x, y)) {
      this.x = x;
      this.y = y;
      this.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    if (!this.visible) {
      this.visible = true;
      this.root.classList.add('is-visible');
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.remove('is-visible');
  }

  /** The language changed: the words written again the next time it shows. */
  relabel(): void {
    this.kindKey = '';
    this.amount = -1;
  }
}
