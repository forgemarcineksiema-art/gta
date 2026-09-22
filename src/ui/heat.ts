import type { SimWorld } from '../sim';

/** Heat persists after escape; only the active pursuit makes the filled stars pulse. */
export class HeatHud {
  readonly root: HTMLElement;
  private readonly stars: SVGSVGElement[] = [];
  private level = -1;
  private state = '';

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.root = document.createElement('div');
    this.root.className = 'hud__heat';
    this.root.setAttribute('role', 'img');
    for (let i = 0; i < 5; i++) {
      const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      star.setAttribute('viewBox', '0 0 24 24');
      star.setAttribute('aria-hidden', 'true');
      star.setAttribute('focusable', 'false');
      star.classList.add('hud__heat-star');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shape.setAttribute('d', 'M12 2 15 8.4 22 9.3 16.9 14.2 18.2 21.2 12 17.8 5.8 21.2 7.1 14.2 2 9.3 9 8.4Z');
      star.appendChild(shape);
      this.root.appendChild(star);
      this.stars.push(star);
    }
    parent.appendChild(this.root);
    this.update(sim);
  }

  update(sim: SimWorld): void {
    const level = sim.heat.level, state = sim.pursuit.state;
    if (level === this.level && state === this.state) return;
    if (level !== this.level) for (let i = 0; i < this.stars.length; i++) this.stars[i]?.classList.toggle('is-filled', i < level);
    this.root.classList.toggle('is-active', state === 'active');
    this.root.setAttribute('aria-label', `Heat ${level} of 5. Pursuit ${state}.`);
    this.level = level;
    this.state = state;
  }
}
