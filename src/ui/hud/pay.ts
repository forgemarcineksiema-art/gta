/**
 * The pay over the nearest open sign (docs/M8.7_PLAN.md D5; DESIGN.md §20.3 rule 5): a label anchored in the world,
 * in the line's yellow type, shown only near a sign (its moment, never a standing place). The app places it from
 * the renderer's projection; DOM writes only on change.
 */
import { num } from '../lang';

export class PayLabel {
  readonly root: HTMLElement;
  private amount = -1;
  private visible = false;
  private x = NaN;
  private y = NaN;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pay';
    parent.appendChild(this.root);
  }

  /** At screen point (x, y) in CSS px: the label's foot over the sign. */
  show(x: number, y: number, amount: number): void {
    if (amount !== this.amount) {
      this.amount = amount;
      this.root.textContent = `+${num(amount)}`;
    }
    if (Math.abs(x - this.x) > 0.5 || Math.abs(y - this.y) > 0.5) {
      this.x = x;
      this.y = y;
      this.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) skewX(-10deg)`;
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

  /** The language changed: the number written again the next time it shows. */
  relabel(): void {
    this.amount = -1;
  }
}
