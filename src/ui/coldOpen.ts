/**
 * The cold open's captions (docs/STYLE.md, cold open): top centre, keycaps
 * and one word for the keyed verbs, a short line for the rest, and the skip
 * key underneath. Never a modal, never over the car. One element per verb,
 * built once; a frame only toggles a class when the caption changes.
 * Reads sim state only.
 */
import type { ColdOpenVerb, SimWorld } from '../sim';

export interface ColdOpenKeys {
  throttle: string;
  steerLeft: string;
  brake: string;
  steerRight: string;
  swap: string;
  boost: string;
  skip: string;
}

const WORDS: Record<ColdOpenVerb, string> = {
  steer: 'DRIVE',
  swap: 'SWAP',
  boost: 'BOOST',
  smash: 'SMASH THE BILLBOARD',
  takedown: 'RAM THEM INTO A WALL',
  deliver: 'PICK UP THE PACKAGE',
  escape: 'GET IT TO THE HIDEOUT',
};

export class ColdOpenHud {
  readonly root: HTMLElement;
  private readonly captions = new Map<ColdOpenVerb, HTMLElement>();
  private readonly skipKey: HTMLElement;
  private shown: ColdOpenVerb | null = null;
  private active = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'cold');
    const line = el('div', 'cold__line');
    for (const verb of Object.keys(WORDS) as ColdOpenVerb[]) {
      const c = el('div', `cold__caption cold__caption--${verb}`);
      c.dataset['verb'] = verb;
      line.appendChild(c);
      this.captions.set(verb, c);
    }
    const skip = el('div', 'cold__skip');
    this.skipKey = el('kbd', 'key', 'N');
    skip.append(this.skipKey, el('span', 'cold__skip-label', 'SKIP'));
    this.root.append(line, skip);
    parent.appendChild(this.root);
  }

  setKeys(k: ColdOpenKeys): void {
    const keyed: Partial<Record<ColdOpenVerb, string[]>> = {
      steer: [k.throttle, k.steerLeft, k.brake, k.steerRight],
      swap: [k.swap],
      boost: [k.boost],
    };
    for (const [verb, c] of this.captions) {
      c.replaceChildren();
      for (const key of keyed[verb] ?? []) c.appendChild(el('kbd', 'key cold__key', key));
      c.appendChild(el('span', 'cold__word', WORDS[verb]));
    }
    this.skipKey.textContent = k.skip;
  }

  update(sim: SimWorld): void {
    const co = sim.coldOpen;
    if (co.active !== this.active) {
      this.active = co.active;
      this.root.classList.toggle('is-active', co.active);
    }
    const caption = co.active ? co.caption : null;
    if (caption === this.shown) return;
    if (this.shown) this.captions.get(this.shown)?.classList.remove('is-visible');
    if (caption) this.captions.get(caption)?.classList.add('is-visible');
    this.shown = caption;
  }

  dispose(): void {
    this.root.remove();
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
