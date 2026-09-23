/**
 * The running job on the HUD (docs/M5_PLAN.md slice 1; docs/STYLE.md, the
 * job card): a line at the top centre in the popup type with the job, its
 * clock and the distance to where it goes (`DELIVERY 0:48 · 620 m`), a card
 * for the first 1.5 s saying what was taken on (kind, payout, limit), and the
 * result on the line while the job holds done or failed. Hidden inside the
 * cold open, whose captions lead. DOM writes only on change; reads sim state
 * only.
 */
import { BALANCE, CAR_WORDS, paintName, unpackDescriptor, type JobDef, type SimWorld } from '../sim';

const KIND_TITLE: Record<JobDef['kind'], string> = { delivery: 'DELIVERY', order: 'STEAL TO ORDER', escape: 'ESCAPE' };

export class JobsHud {
  readonly root: HTMLElement;
  private readonly line: HTMLElement;
  private readonly lineKind: HTMLElement;
  private readonly lineTime: HTMLElement;
  private readonly lineDist: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardTitle: HTMLElement;
  private readonly cardSub: HTMLElement;
  private readonly cardPay: HTMLElement;
  private readonly cardLimit: HTMLElement;
  private readonly point = { x: 0, z: 0 };
  private serial = -1;
  private lastSeconds = -2;
  private lastDist = -2;
  private visible = false;
  private yielding = false;
  private cardVisible = false;
  private kindText = '';
  /** A class set on the line for the state: is-order, is-escape, is-done, is-failed. */
  private stateClass = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'jobs');
    this.line = el('div', 'jobs__line');
    this.lineKind = el('span', 'jobs__kind');
    this.lineTime = el('span', 'jobs__time');
    this.lineDist = el('span', 'jobs__dist');
    this.line.append(this.lineKind, this.lineTime, this.lineDist);
    this.card = el('div', 'jobs__card');
    this.cardTitle = el('div', 'jobs__card-title');
    this.cardSub = el('div', 'jobs__card-sub');
    this.cardPay = el('div', 'jobs__card-pay');
    this.cardLimit = el('div', 'jobs__card-limit');
    this.card.append(this.cardTitle, this.cardSub, this.cardPay, this.cardLimit);
    this.root.append(this.line, this.card);
    parent.appendChild(this.root);
  }

  /** True while the line is up (the key hints make room). */
  get showing(): boolean {
    return this.visible;
  }

  /** The ticker has the top centre: the line hides meanwhile. */
  setYield(v: boolean): void {
    if (v === this.yielding) return;
    this.yielding = v;
    this.root.classList.toggle('is-yield', v);
  }

  update(sim: SimWorld, _dt: number): void {
    const jobs = sim.jobs;
    const d = jobs.defOf(jobs.active);
    const visible = d !== null && jobs.state !== 'idle' && !sim.coldOpen.active
      && (sim.run.state === 'running' || sim.run.state === 'closing');
    if (visible !== this.visible) {
      this.visible = visible;
      this.root.classList.toggle('is-visible', visible);
    }
    if (!visible || !d) {
      this.setCard(false);
      return;
    }
    if (jobs.serial !== this.serial) {
      this.serial = jobs.serial;
      this.lastSeconds = -2;
      this.lastDist = -2;
      this.fill(sim, d);
    }
    this.setCard(jobs.state !== 'done' && jobs.state !== 'failed' && jobs.elapsed < BALANCE.jobs.cardSeconds);
    if (jobs.state === 'done' || jobs.state === 'failed') return;
    // the clock and the distance: compare numbers first, a string per frame is garbage
    const seconds = Number.isFinite(jobs.remaining) ? Math.ceil(jobs.remaining) : -1;
    if (seconds !== this.lastSeconds) {
      this.lastSeconds = seconds;
      this.lineTime.textContent = seconds >= 0 ? clock(seconds) : '';
      this.line.classList.toggle('is-hurry', seconds >= 0 && seconds <= 10);
    }
    const p = sim.probe;
    const dist = jobs.target(this.point) ? Math.round(Math.hypot(this.point.x - p.x, this.point.z - p.z) / 10) * 10 : -1;
    if (dist !== this.lastDist) {
      this.lastDist = dist;
      this.lineDist.textContent = dist >= 0 ? `${dist.toLocaleString('en-US')} m` : '';
    }
  }

  /** The line's words and the card for this state of this job. */
  private fill(sim: SimWorld, d: JobDef): void {
    const jobs = sim.jobs;
    let kind: string;
    let state = d.kind === 'order' ? 'is-order' : d.kind === 'escape' ? 'is-escape' : '';
    if (jobs.state === 'done') {
      kind = `${d.kind === 'order' ? 'SOLD' : d.kind === 'escape' ? 'BOUNTY' : 'DELIVERED'} +${money(jobs.lastPaid)}`;
      state = 'is-done';
    } else if (jobs.state === 'failed') {
      kind = 'TOO LATE';
      state = 'is-failed';
    } else if (d.kind === 'order') {
      const w = unpackDescriptor(d.descriptor);
      kind = jobs.state === 'hunting' ? `FIND A ${paintName(w.paint)} ${CAR_WORDS[w.kind]}` : `DELIVER THE ${CAR_WORDS[w.kind]}`;
    } else if (d.kind === 'escape') {
      kind = `ESCAPE ${'★'.repeat(d.level)}`;
    } else {
      kind = 'DELIVERY';
    }
    if (kind !== this.kindText) {
      this.kindText = kind;
      this.lineKind.textContent = kind;
    }
    if (state !== this.stateClass) {
      if (this.stateClass) this.line.classList.remove(this.stateClass);
      if (state) this.line.classList.add(state);
      this.stateClass = state;
    }
    if (jobs.state === 'done' || jobs.state === 'failed') {
      this.lineTime.textContent = '';
      this.lineDist.textContent = '';
      return;
    }
    // the card: what was taken on
    this.cardTitle.textContent = KIND_TITLE[d.kind];
    if (d.kind === 'order') {
      const w = unpackDescriptor(d.descriptor);
      this.cardSub.textContent = `WANTED: ${paintName(w.paint)} ${CAR_WORDS[w.kind]}`;
      this.cardLimit.textContent = `${clock(d.limitSeconds)} FROM THE SWAP · NO SCRATCHES`;
    } else if (d.kind === 'escape') {
      this.cardSub.textContent = 'THE POLICE HAVE YOU';
      this.cardLimit.textContent = 'LOSE THEM';
    } else {
      this.cardSub.textContent = 'GET IT TO THE DROP-OFF';
      this.cardLimit.textContent = `${clock(d.limitSeconds)} · FASTER PAYS MORE`;
    }
    this.cardPay.textContent = money(d.payout);
    this.card.dataset['kind'] = d.kind;
  }

  private setCard(v: boolean): void {
    if (v === this.cardVisible) return;
    this.cardVisible = v;
    this.card.classList.toggle('is-visible', v);
  }
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function money(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
