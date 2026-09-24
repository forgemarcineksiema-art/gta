import type { SimWorld } from '../../sim';

/**
 * Heat persists after escape; only the active pursuit makes the filled stars
 * pulse. Every discrete gain pops a small red `+n` under the stars and the
 * star that fills scales up once (docs/DESIGN.md §13.3): the number is the
 * one teacher the ratchet needs.
 */
export class HeatHud {
  readonly root: HTMLElement;
  private readonly stars: SVGSVGElement[] = [];
  private readonly gain: HTMLElement;
  /** Under the stars while the police search: drains as the cooldown runs (DESIGN.md §13.9). */
  private readonly escape: HTMLElement;
  private readonly escapeFill: HTMLElement;
  private escapeStep = -1;
  private level = -1;
  private state = '';
  private gainSerial: number;
  private gainLeft = 0;
  private popLeft = 0;
  private popped = -1;
  private away = false;

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
    this.gain = document.createElement('div');
    this.gain.className = 'hud__heat-gain';
    this.root.appendChild(this.gain);
    this.escape = document.createElement('div');
    this.escape.className = 'hud__heat-escape';
    this.escapeFill = document.createElement('div');
    this.escapeFill.className = 'hud__heat-escape-fill';
    this.escape.appendChild(this.escapeFill);
    this.root.appendChild(this.escape);
    this.gainSerial = sim.heat.gainSerial;
    parent.appendChild(this.root);
    this.update(sim, 0);
  }

  /** `shown` is the corners' stars bit (DESIGN.md §17.2): off behind a shut door, on the busted card and on the test track. */
  update(sim: SimWorld, dt: number, shown = true): void {
    const away = !shown;
    if (away !== this.away) {
      this.away = away;
      this.root.classList.toggle('is-hidden', away);
    }
    const heat = sim.heat;
    if (heat.gainSerial !== this.gainSerial) {
      this.gainSerial = heat.gainSerial;
      if (heat.lastGain > 0) {
        this.gain.textContent = `+${Math.round(heat.lastGain)}`;
        // restart the animation for a gain that lands while the last one shows
        this.gain.classList.remove('is-on');
        void this.gain.offsetWidth;
        this.gain.classList.add('is-on');
        this.gainLeft = 0.6;
      }
    }
    if (this.gainLeft > 0) {
      this.gainLeft -= dt;
      if (this.gainLeft <= 0) this.gain.classList.remove('is-on');
    }
    if (this.popLeft > 0) {
      this.popLeft -= dt;
      if (this.popLeft <= 0 && this.popped >= 0) {
        this.stars[this.popped]?.classList.remove('is-pop');
        this.popped = -1;
      }
    }
    // the search: the ring drains and the stars pulse slower as the cooldown runs down (twenty steps, not a write a frame)
    const step = sim.pursuit.state === 'lost' ? Math.round(sim.pursuit.escapeProgress * 20) : -1;
    if (step !== this.escapeStep) {
      this.escapeStep = step;
      this.escape.classList.toggle('is-on', step >= 0);
      if (step >= 0) {
        this.escapeFill.style.transform = `scaleX(${(1 - step / 20).toFixed(2)})`;
        this.root.style.setProperty('--heat-pulse', `${(0.6 + step * 0.07).toFixed(2)}s`);
      }
    }
    const level = heat.level, state = sim.pursuit.state;
    if (level === this.level && state === this.state) return;
    if (level !== this.level) {
      for (let i = 0; i < this.stars.length; i++) this.stars[i]?.classList.toggle('is-filled', i < level);
      if (level > this.level && this.level >= 0) {
        if (this.popped >= 0) this.stars[this.popped]?.classList.remove('is-pop');
        this.popped = level - 1;
        this.stars[this.popped]?.classList.add('is-pop');
        this.popLeft = 0.3;
      }
    }
    this.root.classList.toggle('is-active', state === 'active');
    this.root.classList.toggle('is-lost', state === 'lost');
    this.root.setAttribute('aria-label', `Heat ${level} of 5. Pursuit ${state}.`);
    this.level = level;
    this.state = state;
  }
}
