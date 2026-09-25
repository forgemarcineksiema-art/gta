/**
 * The car's corner, bottom right (docs/M8.9_PLAN.md R4): one round dial that mirrors the radar. The speed in its
 * middle and km/h under it; the boost as its outer arc (270°, open at the bottom, ink, the flame at its start; full,
 * it pulses once; boosting, it brightens); the damage as an inner arc in red, which the corners show for a few
 * seconds after a hit and keep from the third stage (`corners.ts`). No words: the intro's SHIFT NITRO teaches the arc.
 * DOM writes only on change; reads sim state only.
 */
import type { SimWorld } from '../../sim';
import { glyphMarkup } from '../glyph';
import { label } from '../lang';

/** The dial in its 100-unit box: the arcs' radii and widths, their sweep, the flame's size. */
export const GAUGE = {
  boost: { r: 42, width: 6 },
  damage: { r: 34, width: 3.5 },
  /** Degrees; the gap is at the bottom. */
  sweep: 270,
  flame: 15,
} as const;

/** The start of an arc of `sweep` degrees open at the bottom, as the screen's angle (y down, clockwise from +x). */
function startAngle(sweep: number): number {
  return ((90 + (360 - sweep) / 2) * Math.PI) / 180;
}

/** An arc of radius `r` about the box's centre, from its bottom-left end clockwise over the top. */
export function arcPath(r: number, sweep: number = GAUGE.sweep): string {
  const a0 = startAngle(sweep), a1 = a0 + (sweep * Math.PI) / 180;
  const x0 = 50 + r * Math.cos(a0), y0 = 50 + r * Math.sin(a0);
  const x1 = 50 + r * Math.cos(a1), y1 = 50 + r * Math.sin(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** The dash that draws `share` (0..1) of an arc of radius `r`: its length, then a gap longer than the arc. */
export function arcDash(r: number, share: number, sweep: number = GAUGE.sweep): string {
  const length = (r * sweep * Math.PI) / 180;
  const s = Math.max(0, Math.min(1, share));
  return `${(length * s).toFixed(2)} ${(length + 1).toFixed(2)}`;
}

/** Where the flame sits: just past the boost arc's start, in the gap, its box's top-left corner. */
function flameAt(): { x: number; y: number } {
  const a0 = startAngle(GAUGE.sweep), r = GAUGE.boost.r, back = 10;
  // one step back along the arc's tangent (the arc runs clockwise, so back is toward the gap)
  const x = 50 + r * Math.cos(a0) + Math.sin(a0) * back, y = 50 + r * Math.sin(a0) - Math.cos(a0) * back;
  return { x: x - GAUGE.flame / 2, y: y - GAUGE.flame / 2 };
}

function markup(): string {
  const { boost, damage } = GAUGE;
  const outer = arcPath(boost.r), inner = arcPath(damage.r), f = flameAt();
  return '<svg class="hud__gauge" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
    + `<g class="hud__boost"><path class="hud__boost-track" d="${outer}"/><path class="hud__boost-fill" d="${outer}" stroke-dasharray="${arcDash(boost.r, 0)}"/>`
    + `<g class="hud__boost-flame" transform="translate(${f.x.toFixed(2)} ${f.y.toFixed(2)}) scale(${GAUGE.flame})">${glyphMarkup('flame')}</g></g>`
    + `<g class="hud__damage"><path class="hud__damage-track" d="${inner}"/><path class="hud__damage-fill" d="${inner}" stroke-dasharray="${arcDash(damage.r, 0)}"/></g>`
    + '</svg>';
}

export class GaugeHud {
  readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly boost: SVGGElement;
  private readonly boostFill: SVGPathElement;
  private readonly damage: SVGGElement;
  private readonly damageFill: SVGPathElement;
  private lastSpeed = -1;
  private lastBoost = '';
  private lastDamage = '';
  private lastMeter = 0;
  private gainLeft = 0;
  private lastStage = -1;
  private lastWrecked = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud__speedo';
    this.root.innerHTML = markup();
    this.speed = document.createElement('div');
    this.speed.className = 'hud__speed';
    this.speed.textContent = '0';
    const unit = document.createElement('div');
    unit.className = 'hud__unit';
    this.root.append(this.speed, label(unit, 'km/h'));
    this.boost = this.root.querySelector('.hud__boost') as SVGGElement;
    this.boostFill = this.root.querySelector('.hud__boost-fill') as SVGPathElement;
    this.damage = this.root.querySelector('.hud__damage') as SVGGElement;
    this.damageFill = this.root.querySelector('.hud__damage-fill') as SVGPathElement;
    parent.appendChild(this.root);
  }

  /** The corners' bits: the speed (the dial) and the damage's arc. */
  show(dial: boolean, damage: boolean): void {
    this.root.classList.toggle('is-hidden', !dial);
    this.damage.classList.toggle('is-visible', damage);
  }

  update(sim: SimWorld, dt: number): void {
    const tm = sim.vehicle.telemetry;
    const kmh = Math.round(Math.abs(tm.speedKmh));
    if (kmh !== this.lastSpeed) {
      this.speed.textContent = String(kmh);
      this.lastSpeed = kmh;
    }
    const dash = arcDash(GAUGE.boost.r, tm.boost);
    if (dash !== this.lastBoost) { this.boostFill.setAttribute('stroke-dasharray', dash); this.lastBoost = dash; }
    this.boost.classList.toggle('is-active', tm.boosting);
    // full: one pulse as it fills (the class's animation runs once each time it is put on)
    this.boost.classList.toggle('is-full', tm.boost >= 0.999);
    if (tm.boost > this.lastMeter + 0.001) this.gainLeft = 0.3;
    this.lastMeter = tm.boost;
    if (this.gainLeft > 0) this.gainLeft -= dt;
    this.boost.classList.toggle('is-gain', this.gainLeft > 0);
    const life = sim.life.state;
    const hurt = arcDash(GAUGE.damage.r, life.damage);
    if (hurt !== this.lastDamage) { this.damageFill.setAttribute('stroke-dasharray', hurt); this.lastDamage = hurt; }
    if (life.stage !== this.lastStage || life.wrecked !== this.lastWrecked) {
      this.lastStage = life.stage;
      this.lastWrecked = life.wrecked;
      this.damage.classList.toggle('is-wrecked', life.stage >= 4);
    }
  }
}
