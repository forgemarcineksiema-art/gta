/**
 * The line at the top centre (docs/M5_PLAN.md slice 1; DESIGN.md §13.4): the
 * running job (`DELIVERY 0:48 · 620 m · 12/48`, a card for its first 1.5 s,
 * the result while it holds), else the goal (`TAKE A JOB · 320 m`, `BANK IT ·
 * 540 m`, `LOSE THEM`, the chain's step) with a dot in the colour of the ring
 * the arrow points at. A step of the first quarter hour's chain ticked shows
 * its card once the job's card is gone; the first order's card stays until
 * the wanted car is ringed and says how to take it. Hidden inside the cold
 * open, behind a shut door, on the busted card and while the ticker has the
 * top centre. DOM writes only on change; reads sim state only.
 */
import {
  BALANCE, CAR_WORDS, CHAIN_STEPS, MEDAL_WORDS, PLACE_WORDS, STEP, chainStep, goalFor, newGoal, paintName, trialTimes, unpackDescriptor,
  type GoalKind, type JobDef, type SimWorld,
} from '../sim';

const KIND_TITLE: Record<JobDef['kind'], string> = { delivery: 'DELIVERY', order: 'STEAL TO ORDER', escape: 'ESCAPE', trial: 'TIME TRIAL', race: 'STREET RACE' };

export class JobsHud {
  readonly root: HTMLElement;
  private readonly line: HTMLElement;
  private readonly lineDot: HTMLElement;
  private readonly lineKind: HTMLElement;
  private readonly lineTime: HTMLElement;
  private readonly lineDist: HTMLElement;
  /** The route's coins taken of laid (M5.5): `12/48`. */
  private readonly lineCoins: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardTitle: HTMLElement;
  private readonly cardSub: HTMLElement;
  private readonly cardKey: HTMLElement;
  private readonly cardPay: HTMLElement;
  private readonly cardLimit: HTMLElement;
  private readonly point = { x: 0, z: 0 };
  private readonly goal = newGoal();
  private serial = -1;
  private lastSeconds = -2;
  private lastDist = -2;
  /** The running race's place last shown. */
  private racePlace = 0;
  private lastRoute = -1;
  private visible = false;
  private yielding = false;
  private kindText = '';
  /** A class set on the line for the state: is-order, is-escape, is-done, is-failed, is-goal, is-lose. */
  private stateClass = '';
  /** Who has the line: a job, the goal, or nobody. */
  private mode: '' | 'job' | 'goal' = '';
  private goalKind: GoalKind = 'none';
  private goalRing = '';
  private goalAmount = -1;
  /** Who has the card, and for how long the chain's card still shows. */
  private cardMode: '' | 'job' | 'chain' = '';
  private chainSeen = -1;
  private chainPending = -1;
  private chainLeft = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'jobs');
    this.line = el('div', 'jobs__line');
    this.lineDot = el('span', 'jobs__dot');
    this.lineKind = el('span', 'jobs__kind');
    this.lineTime = el('span', 'jobs__time');
    this.lineDist = el('span', 'jobs__dist');
    this.lineCoins = el('span', 'jobs__coins');
    this.line.append(this.lineDot, this.lineKind, this.lineTime, this.lineDist, this.lineCoins);
    this.card = el('div', 'jobs__card');
    this.cardTitle = el('div', 'jobs__card-title');
    this.cardSub = el('div', 'jobs__card-sub');
    this.cardKey = el('kbd', 'key jobs__card-key', 'E');
    this.cardPay = el('div', 'jobs__card-pay');
    this.cardLimit = el('div', 'jobs__card-limit');
    this.card.append(this.cardTitle, this.cardSub, this.cardKey, this.cardPay, this.cardLimit);
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

  /** The swap key's label, for the first order's card. */
  setSwapKey(key: string): void {
    this.cardKey.textContent = key;
  }

  update(sim: SimWorld, dt: number): void {
    const run = sim.run;
    if (this.chainSeen < 0) this.chainSeen = run.chainSerial;
    if (run.chainSerial !== this.chainSeen) {
      this.chainSeen = run.chainSerial;
      if (run.chainLast >= 0) this.chainPending = run.chainLast;
    }
    const jobs = sim.jobs;
    const d = jobs.defOf(jobs.active);
    const playing = !sim.coldOpen.active && (run.state === 'running' || run.state === 'closing');
    const jobLine = playing && d !== null && jobs.state !== 'idle';
    if (playing && !jobLine) goalFor(sim, this.goal);
    else this.goal.kind = 'none';
    const visible = jobLine || (playing && this.goal.kind !== 'none');
    if (visible !== this.visible) {
      this.visible = visible;
      this.root.classList.toggle('is-visible', visible);
    }
    if (!visible) {
      this.showCard('');
      this.mode = '';
      return;
    }
    if (jobLine && d) this.updateJob(sim, d);
    else this.updateGoal(sim);
    // the card: the job's while it asks for it, else a ticked step of the chain for its 1.5 s
    const teach = jobLine && d !== null && this.teaching(sim, d);
    const jobCard = jobLine && d !== null && jobs.state !== 'done' && jobs.state !== 'failed' && (jobs.elapsed < BALANCE.jobs.cardSeconds || teach);
    if (jobCard && d) {
      if (this.cardMode !== 'job') this.fillJobCard(sim, d);
      this.card.classList.toggle('is-teach', teach);
      this.showCard('job');
      return;
    }
    if (this.cardMode === 'chain') {
      this.chainLeft -= dt;
      if (this.chainLeft > 0) return;
    }
    if (this.chainPending >= 0) {
      this.fillChainCard(run.chain, this.chainPending);
      this.chainPending = -1;
      this.chainLeft = BALANCE.jobs.cardSeconds;
      this.showCard('chain');
      return;
    }
    this.showCard('');
  }

  /** The first order (the chain's step not done yet): its card stays until the wanted car is ringed. */
  private teaching(sim: SimWorld, d: JobDef): boolean {
    const jobs = sim.jobs;
    if (d.kind !== 'order' || jobs.state !== 'hunting' || (sim.run.chain & (1 << STEP.order)) !== 0) return false;
    const traffic = sim.traffic;
    const w = jobs.wantedAgent;
    if (!traffic || w < 0) return true;
    const p = sim.probe;
    return Math.hypot((traffic.x[w] as number) - p.x, (traffic.z[w] as number) - p.z) > BALANCE.jobs.order.ringRange;
  }

  private updateJob(sim: SimWorld, d: JobDef): void {
    const jobs = sim.jobs;
    if (this.mode !== 'job') {
      this.mode = 'job';
      this.serial = -1;
      this.lastRoute = -1;
      this.lineDot.dataset['ring'] = '';
    }
    if (jobs.serial !== this.serial) {
      this.serial = jobs.serial;
      this.lastSeconds = -2;
      this.lastDist = -2;
      this.fillJobLine(sim, d);
      if (this.cardMode === 'job') this.fillJobCard(sim, d);
    }
    if (jobs.state === 'done' || jobs.state === 'failed') return;
    // a race's place, live: the line's words when it changes
    if (d.kind === 'race' && jobs.state === 'active') {
      const place = jobs.race.place(sim.probe);
      if (place !== this.racePlace) {
        this.racePlace = place;
        this.fillJobLine(sim, d);
      }
    }
    // the clock and the distance: compare numbers first, a string per frame is garbage
    const seconds = Number.isFinite(jobs.remaining) ? Math.ceil(jobs.remaining) : -1;
    if (seconds !== this.lastSeconds) {
      this.lastSeconds = seconds;
      if (d.kind === 'trial' && seconds >= 0) {
        // the time run, and the best medal still in reach with its time
        const elapsed = d.limitSeconds - jobs.remaining;
        const times = trialTimes(d.limitSeconds);
        const next = times[0] > elapsed ? 0 : times[1] > elapsed ? 1 : 2;
        this.lineTime.textContent = `${clock(Math.floor(elapsed))} · ${MEDAL_WORDS[3 - next]} ${clock(Math.round(times[next]))}`;
      } else {
        this.lineTime.textContent = seconds >= 0 ? clock(seconds) : '';
      }
      this.line.classList.toggle('is-hurry', seconds >= 0 && seconds <= 10);
    }
    const p = sim.probe;
    const dist = jobs.target(this.point) ? Math.round(Math.hypot(this.point.x - p.x, this.point.z - p.z) / 10) * 10 : -1;
    if (dist !== this.lastDist) {
      this.lastDist = dist;
      this.lineDist.textContent = dist >= 0 ? `${dist.toLocaleString('en-US')} m` : '';
    }
    const coins = sim.coins;
    const route = coins && coins.routeTotal > 0 ? coins.routePicked * 1024 + coins.routeTotal : -1;
    if (route !== this.lastRoute) {
      this.lastRoute = route;
      this.lineCoins.textContent = coins && route >= 0 ? `${coins.routePicked}/${coins.routeTotal}` : '';
    }
  }

  /** The goal line: its words when the kind, the ring or the amount change, the distance when it moves 10 m. */
  private updateGoal(sim: SimWorld): void {
    const g = this.goal;
    if (this.mode !== 'goal') {
      this.mode = 'goal';
      this.goalKind = 'none';
      this.lastDist = -2;
      this.lineCoins.textContent = '';
      this.line.classList.remove('is-hurry');
    }
    if (g.kind !== this.goalKind || g.ring !== this.goalRing || g.amount !== this.goalAmount) {
      this.goalKind = g.kind;
      this.goalRing = g.ring;
      this.goalAmount = g.amount;
      let words = '', extra = '';
      switch (g.kind) {
        case 'take': words = 'TAKE A JOB'; break;
        case 'bank': words = 'BANK IT'; break;
        case 'lose': words = g.hasTarget ? 'LOSE THEM OR BANK IT' : 'LOSE THEM'; break;
        case 'buy':
          words = `BUY THE ${CAR_WORDS.compact}`;
          if (g.amount > 0) extra = `${money(g.amount)} TO GO`;
          break;
        case 'escape': words = 'ESCAPE THE COPS'; break;
        case 'order': words = 'STEAL TO ORDER'; break;
        case 'fill': words = 'FILL THE BAG'; extra = `${money(g.amount)}/${money(BALANCE.chain.bankGoal)}`; break;
        default: break;
      }
      this.lineKind.textContent = words;
      this.kindText = words;
      this.lineTime.textContent = extra;
      this.lineDot.dataset['ring'] = g.ring;
      this.setState(g.kind === 'lose' ? 'is-lose' : 'is-goal');
    }
    const p = sim.probe;
    const dist = g.hasTarget ? Math.round(Math.hypot(g.x - p.x, g.z - p.z) / 10) * 10 : -1;
    if (dist !== this.lastDist) {
      this.lastDist = dist;
      this.lineDist.textContent = dist >= 0 ? `${dist.toLocaleString('en-US')} m` : '';
    }
  }

  /** The line's words and state for this state of this job. */
  private fillJobLine(sim: SimWorld, d: JobDef): void {
    const jobs = sim.jobs;
    let kind: string;
    let state = d.kind === 'order' ? 'is-order' : d.kind === 'escape' ? 'is-escape' : d.kind === 'trial' ? 'is-trial' : d.kind === 'race' ? 'is-race' : '';
    if (jobs.state === 'done') {
      const what = d.kind === 'order' ? 'SOLD' : d.kind === 'escape' ? 'BOUNTY' : d.kind === 'trial' ? MEDAL_WORDS[jobs.lastMedal]
        : d.kind === 'race' ? `${PLACE_WORDS[jobs.lastPlace] ?? ''} PLACE` : 'DELIVERED';
      kind = `${what} +${money(jobs.lastPaid)}${jobs.lastTip ? ' · CLEAN LINE' : ''}`;
      state = 'is-done';
    } else if (jobs.state === 'failed') {
      kind = d.kind === 'trial' ? 'TOO SLOW · NO MEDAL' : d.kind === 'race' && jobs.lastPlace > 3 ? 'LAST · NO PRIZE' : 'TOO LATE';
      state = 'is-failed';
    } else if (d.kind === 'order') {
      const w = unpackDescriptor(d.descriptor);
      kind = jobs.state === 'hunting' ? `FIND A ${paintName(w.paint)} ${CAR_WORDS[w.kind]}` : `DELIVER THE ${CAR_WORDS[w.kind]}`;
    } else if (d.kind === 'escape') {
      kind = `ESCAPE ${'★'.repeat(d.level)}`;
    } else if (d.kind === 'trial') {
      kind = 'TIME TRIAL · FOLLOW THE COINS';
    } else if (d.kind === 'race') {
      kind = `RACE · ${PLACE_WORDS[this.racePlace] ?? ''}`;
    } else {
      kind = 'DELIVERY';
    }
    if (kind !== this.kindText) {
      this.kindText = kind;
      this.lineKind.textContent = kind;
    }
    this.setState(state);
    if (jobs.state === 'done' || jobs.state === 'failed') {
      this.lineTime.textContent = '';
      this.lineDist.textContent = '';
      this.lineCoins.textContent = '';
      this.lastRoute = -1;
    }
  }

  /** The card: what was taken on; the first order's says how to take the car. */
  private fillJobCard(sim: SimWorld, d: JobDef): void {
    this.cardTitle.textContent = KIND_TITLE[d.kind];
    if (d.kind === 'order') {
      const w = unpackDescriptor(d.descriptor);
      const first = (sim.run.chain & (1 << STEP.order)) === 0 && sim.jobs.state === 'hunting';
      this.cardSub.textContent = first ? `WANTED: ${paintName(w.paint)} ${CAR_WORDS[w.kind]} · IT'S IN TRAFFIC · SWAP INTO IT` : `WANTED: ${paintName(w.paint)} ${CAR_WORDS[w.kind]}`;
      this.cardLimit.textContent = `${clock(d.limitSeconds)} FROM THE SWAP · NO SCRATCHES`;
    } else if (d.kind === 'escape') {
      this.cardSub.textContent = 'THE POLICE HAVE YOU';
      this.cardLimit.textContent = 'LOSE THEM';
    } else if (d.kind === 'race') {
      const pay = BALANCE.jobs.race.pay;
      this.cardSub.textContent = 'FIRST TO THE FINISH · ANY ROUTE';
      this.cardLimit.textContent = `1ST ${money(pay[0] ?? 0)} · 2ND ${money(pay[1] ?? 0)} · 3RD ${money(pay[2] ?? 0)}`;
    } else if (d.kind === 'trial') {
      const [g, s, b] = trialTimes(d.limitSeconds);
      const best = sim.jobs.medals.get(d.id) ?? 0;
      this.cardSub.textContent = best > 0 ? `FOLLOW THE COINS · YOUR BEST: ${MEDAL_WORDS[best]}` : 'FOLLOW THE COINS TO THE FINISH';
      this.cardLimit.textContent = `GOLD ${clock(Math.round(g))} · SILVER ${clock(Math.round(s))} · BRONZE ${clock(Math.round(b))}`;
    } else {
      this.cardSub.textContent = 'GET IT TO THE DROP-OFF';
      this.cardLimit.textContent = `${clock(d.limitSeconds)} · FASTER PAYS MORE`;
    }
    this.cardPay.textContent = money(d.payout);
    this.card.dataset['kind'] = d.kind;
  }

  /** A ticked step: which of six, what it was, what comes next. */
  private fillChainCard(chain: number, step: number): void {
    const next = chainStep(chain);
    this.cardTitle.textContent = `STEP ${step + 1} OF ${CHAIN_STEPS.length}`;
    this.cardSub.textContent = CHAIN_STEPS[step] ?? '';
    this.cardPay.textContent = 'DONE';
    this.cardLimit.textContent = next < 0 ? 'ALL DONE · THE CITY IS YOURS' : `NEXT: ${CHAIN_STEPS[next] ?? ''}`;
    this.card.dataset['kind'] = 'chain';
    this.card.classList.remove('is-teach');
  }

  private setState(state: string): void {
    if (state === this.stateClass) return;
    if (this.stateClass) this.line.classList.remove(this.stateClass);
    if (state) this.line.classList.add(state);
    this.stateClass = state;
  }

  private showCard(mode: '' | 'job' | 'chain'): void {
    if (mode === this.cardMode) return;
    const was = this.cardMode !== '';
    this.cardMode = mode;
    if (was !== (mode !== '')) this.card.classList.toggle('is-visible', mode !== '');
    else if (mode !== '') {
      // one card straight after another: replay its slide-in
      this.card.classList.remove('is-visible');
      void this.card.offsetWidth;
      this.card.classList.add('is-visible');
    }
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
