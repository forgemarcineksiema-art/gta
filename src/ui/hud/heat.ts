import type { SimWorld } from '../../sim';
import { BALANCE } from '../../sim/balance';

/** The HUD's star in its 24-unit box, clockwise from the top point. */
const STAR = [12, 2, 15, 8.4, 22, 9.3, 16.9, 14.2, 18.2, 21.2, 12, 17.8, 5.8, 21.2, 7.1, 14.2, 2, 9.3, 9, 8.4];
const STAR_TOP = 2;
const STAR_FOOT = 21.2;
/** The next star's fill is written in this many steps (a write per step, not per frame). */
const FILL_STEPS = 24;

/**
 * The next star's share (docs/M8.9_PLAN.md R4): 0 at a level's start, rising to 1 at the next level's threshold;
 * 0 at the top level, which has no next star. The heat ratchets, so it only rises within a run.
 */
export function heatFill(points: number, thresholds: readonly number[] = BALANCE.heatThresholds): number {
  let lo = 0;
  for (const hi of thresholds) {
    if (points < hi) return Math.max(0, Math.min(1, (points - lo) / (hi - lo)));
    lo = hi;
  }
  return 0;
}

/** The star's outline filled from its foot to `share` of its height: the path's `d` ('' for none). */
export function starFillPath(share: number): string {
  if (!(share > 0)) return '';
  const cut = STAR_FOOT - (STAR_FOOT - STAR_TOP) * Math.min(1, share);
  // the star's polygon kept below the cut (Sutherland–Hodgman against one edge)
  let d = '';
  const n = STAR.length / 2;
  const put = (x: number, y: number): void => { d += `${d === '' ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`; };
  for (let i = 0; i < n; i++) {
    const ax = STAR[i * 2] as number, ay = STAR[i * 2 + 1] as number;
    const j = (i + 1) % n;
    const bx = STAR[j * 2] as number, by = STAR[j * 2 + 1] as number;
    const aIn = ay >= cut, bIn = by >= cut;
    if (aIn) put(ax, ay);
    if (aIn !== bIn) put(ax + ((cut - ay) / (by - ay)) * (bx - ax), cut);
  }
  return d === '' ? '' : `${d}Z`;
}

const FULL = starFillPath(1);
const SVG = 'http://www.w3.org/2000/svg';

/**
 * The stars (docs/M8.9_PLAN.md R4): five outlined over the world, no panel. The filled ones are ink and flash red
 * and blue while the police see the player; the next one fills from its foot as the heat rises (no `+n`: the star
 * says it). A star that fills scales up once. While the police search, a bar under them drains.
 */
export class HeatHud {
  readonly root: HTMLElement;
  private readonly stars: SVGSVGElement[] = [];
  private readonly fills: SVGPathElement[] = [];
  /** Under the stars while the police search: drains as the cooldown runs (DESIGN.md §13.9). */
  private readonly escape: HTMLElement;
  private readonly escapeFill: HTMLElement;
  private escapeStep = -1;
  private level = -1;
  private fillStep = -1;
  private state = '';
  private popLeft = 0;
  private popped = -1;
  private away = false;

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.root = document.createElement('div');
    this.root.className = 'hud__heat';
    this.root.setAttribute('role', 'img');
    const outline = `M${STAR.slice(0, 2).join(' ')} ${STAR.slice(2).join(' ')}Z`;
    for (let i = 0; i < 5; i++) {
      const star = document.createElementNS(SVG, 'svg');
      star.setAttribute('viewBox', '0 0 24 24');
      star.setAttribute('aria-hidden', 'true');
      star.setAttribute('focusable', 'false');
      star.classList.add('hud__heat-star');
      const shape = document.createElementNS(SVG, 'path');
      shape.setAttribute('class', 'hud__heat-shape');
      shape.setAttribute('d', outline);
      const fill = document.createElementNS(SVG, 'path');
      fill.setAttribute('class', 'hud__heat-fill');
      star.append(shape, fill);
      this.root.appendChild(star);
      this.stars.push(star);
      this.fills.push(fill);
    }
    this.escape = document.createElement('div');
    this.escape.className = 'hud__heat-escape';
    this.escapeFill = document.createElement('div');
    this.escapeFill.className = 'hud__heat-escape-fill';
    this.escape.appendChild(this.escapeFill);
    this.root.appendChild(this.escape);
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
    if (this.popLeft > 0) {
      this.popLeft -= dt;
      if (this.popLeft <= 0 && this.popped >= 0) {
        this.stars[this.popped]?.classList.remove('is-pop');
        this.popped = -1;
      }
    }
    // the search: the bar drains and the stars pulse slower as the cooldown runs down (twenty steps, not a write a frame)
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
    const fillStep = Math.floor(heatFill(heat.points) * FILL_STEPS);
    if (level !== this.level || fillStep !== this.fillStep) {
      for (let i = 0; i < this.stars.length; i++) {
        this.stars[i]?.classList.toggle('is-filled', i < level);
        this.fills[i]?.setAttribute('d', i < level ? FULL : i === level ? starFillPath(fillStep / FILL_STEPS) : '');
      }
      if (level > this.level && this.level >= 0) {
        if (this.popped >= 0) this.stars[this.popped]?.classList.remove('is-pop');
        this.popped = level - 1;
        this.stars[this.popped]?.classList.add('is-pop');
        this.popLeft = 0.3;
      }
      this.fillStep = fillStep;
    }
    if (level === this.level && state === this.state) return;
    this.root.classList.toggle('is-active', state === 'active');
    this.root.classList.toggle('is-lost', state === 'lost');
    this.root.setAttribute('aria-label', `Heat ${level} of 5. Pursuit ${state}.`);
    this.level = level;
    this.state = state;
  }
}
