/**
 * The line at the top centre (docs/M5_PLAN.md slice 1; DESIGN.md §13.4): the
 * running job (`DELIVERY 0:48 · 620 m · 12/48`, a card for its first 1.5 s,
 * the result while it holds), else the goal (`TAKE A JOB · 320 m`, `BANK IT ·
 * 540 m`, `LOSE THEM`, the chain's step) with a dot in the colour of the ring
 * the arrow points at. A step of the first quarter hour's chain ticked shows
 * its card once the job's card is gone; the first order's card stays until
 * the wanted car is ringed and says how to take it. Hidden inside the cold
 * open, behind a shut door, on the busted card and while the ticker has the
 * top centre. DOM writes only on change; reads sim state only. Every word in
 * the player's language (`lang.ts`, DESIGN.md §19).
 */
import {
  BALANCE, BODY_WORDS, CAR_WORDS, CHAIN_STEPS, CHIEF, MEDAL_WORDS, PLACE_WORDS, RIVALS, STEP, chainStep, copyGoal, goalFor, newGoal, paintName, posterNumber, reqText,
  trialTimes, unpackDescriptor, type Goal, type GoalKind, type JobDef, type RivalDef, type SimWorld,
} from '../../sim';
import { GLYPHS, GLYPH_ORDER, NO_GLYPH, digitSlot, glyphOf, goalGlyph, numberGlyphs, type GlyphId } from '../../sim/glyphs';
import { num, paintedCar, t } from '../lang';

const KIND_TITLE: Record<JobDef['kind'], string> = { delivery: 'DELIVERY', order: 'STEAL TO ORDER', escape: 'ESCAPE', trial: 'TIME TRIAL', race: 'STREET RACE', rage: 'TAKEDOWN RAGE', mayhem: 'MAYHEM', fare: 'FARE', duel: 'WANTED BOARD' };

export class JobsHud {
  readonly root: HTMLElement;
  private readonly line: HTMLElement;
  /** The goal's badge (M8.7 D7): its pictogram in the way's cyan ring; the glyph it shows (`NO_GLYPH`: none). */
  private readonly lineBadge: HTMLElement;
  private badgeGlyph = NO_GLYPH;
  private goalId = -1;
  private goalDoor = -1;
  private readonly defOf = (id: number): JobDef | null => this.sim?.jobs.defOf(id) ?? null;
  private sim: SimWorld | null = null;
  private readonly lineKind: HTMLElement;
  private readonly lineTime: HTMLElement;
  private readonly lineDist: HTMLElement;
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
  /** The running fare's tips last shown. */
  private fareTips = 0;
  /** The running zone's count and out-of-zone flag last shown. */
  private zoneCount = -1;
  private zoneOut = false;
  private visible = false;
  private kindText = '';
  /** A class set on the line for the state: is-order, is-escape, is-done, is-failed, is-goal, is-lose. */
  private stateClass = '';
  /** Who has the line: a job, the goal, or nobody. */
  private mode: '' | 'job' | 'goal' = '';
  private goalKind: GoalKind = 'none';
  private goalRing = '';
  private goalAmount = -1;
  /** The goal's rival and requirement (M6), packed: the line's words change with them. */
  private goalWho = -1;
  /** Who has the card, and for how long the chain's card still shows. */
  private cardMode: '' | 'job' | 'chain' = '';
  private chainSeen = -1;
  private chainPending = -1;
  private chainLeft = 0;
  /** The chain's step on the card now, and the language changed under a card: filled again on the next frame. */
  private chainShown = -1;
  private cardStale = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'jobs');
    this.line = el('div', 'jobs__line');
    this.lineBadge = el('span', 'jobs__badge');
    this.lineKind = el('span', 'jobs__kind');
    this.lineTime = el('span', 'jobs__time');
    this.lineDist = el('span', 'jobs__dist');
    // no coin count (DESIGN.md §17.2): the coins are on the road, and a clean line's tip says itself at the end
    this.line.append(this.lineBadge, this.lineKind, this.lineTime, this.lineDist);
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

  /** True while the line is up. */
  get showing(): boolean {
    return this.visible;
  }

  /** True while a job's or a chain step's card is up (the key hints and the news wait, M7 slice 1). */
  get cardShowing(): boolean {
    return this.cardMode !== '';
  }

  /** The swap key's label, for the first order's card. */
  setSwapKey(key: string): void {
    this.cardKey.textContent = key;
  }

  /** The language changed (DESIGN.md §19): the line, the card and the chain's card said again. */
  relabel(): void {
    this.serial = -1;
    this.goalKind = 'none';
    this.kindText = '';
    this.lastSeconds = -2;
    this.lastDist = -2;
    this.cardStale = true;
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
    if (playing && !jobLine) {
      // the way's held goal (M8.7 D1); without a way, the straight line's
      if (sim.way) copyGoal(sim.way.goal, this.goal);
      else goalFor(sim, this.goal);
    }
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
      if (this.cardMode !== 'job' || this.cardStale) this.fillJobCard(sim, d);
      this.cardStale = false;
      this.card.classList.toggle('is-teach', teach);
      this.showCard('job');
      return;
    }
    if (this.cardMode === 'chain') {
      if (this.cardStale) this.fillChainCard(run.chain, this.chainShown);
      this.cardStale = false;
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
    }
    this.setBadge(glyphOf(d));
    if (jobs.serial !== this.serial) {
      this.serial = jobs.serial;
      this.lastSeconds = -2;
      this.lastDist = -2;
      this.fillJobLine(sim, d);
      if (this.cardMode === 'job') this.fillJobCard(sim, d);
    }
    if (jobs.state === 'done' || jobs.state === 'failed') return;
    // a fare's tips, live
    if (d.kind === 'fare' && jobs.state === 'active' && sim.fares.tips !== this.fareTips) {
      this.fareTips = sim.fares.tips;
      this.fillJobLine(sim, d);
    }
    // a zone's count and whether the car is in it, live
    if ((d.kind === 'rage' || d.kind === 'mayhem') && jobs.state === 'active' && (jobs.zoneCount !== this.zoneCount || !jobs.inZone !== this.zoneOut)) {
      this.zoneCount = jobs.zoneCount;
      this.zoneOut = !jobs.inZone;
      this.fillJobLine(sim, d);
    }
    // a race's place, live: the line's words when it changes (a rival's race too)
    if ((d.kind === 'race' || d.kind === 'duel') && jobs.state === 'active') {
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
        this.lineTime.textContent = `${clock(Math.floor(elapsed))} · ${t(MEDAL_WORDS[3 - next] ?? '')} ${clock(Math.round(times[next]))}`;
      } else {
        this.lineTime.textContent = seconds >= 0 ? clock(seconds) : '';
      }
      this.line.classList.toggle('is-hurry', seconds >= 0 && seconds <= 10);
    }
    const p = sim.probe;
    const dist = jobs.target(this.point) ? metres(sim, this.point.x - p.x, this.point.z - p.z) : -1;
    if (dist !== this.lastDist) {
      this.lastDist = dist;
      this.lineDist.textContent = dist >= 0 ? `${num(dist)} m` : '';
    }
  }

  /** The goal line: its words when the kind, the ring or the amount change, the distance when it moves 10 m. */
  private updateGoal(sim: SimWorld): void {
    const g = this.goal;
    if (this.mode !== 'goal') {
      this.mode = 'goal';
      this.goalKind = 'none';
      this.lastDist = -2;
      this.line.classList.remove('is-hurry');
    }
    const who = g.rival * 16 + g.req;
    this.sim = sim;
    if (g.kind !== this.goalKind || g.ring !== this.goalRing || g.amount !== this.goalAmount || who !== this.goalWho
      || g.id !== this.goalId || g.door !== this.goalDoor) {
      this.goalKind = g.kind;
      this.goalRing = g.ring;
      this.goalAmount = g.amount;
      this.goalWho = who;
      this.goalId = g.id;
      this.goalDoor = g.door;
      const { words, extra } = goalWords(sim, g);
      this.lineKind.textContent = words;
      this.kindText = words;
      this.lineTime.textContent = extra;
      this.setBadge(goalGlyph(g, this.defOf));
      this.setState(g.kind === 'lose' ? 'is-lose' : 'is-goal');
    }
    const p = sim.probe;
    const dist = g.hasTarget ? metres(sim, g.x - p.x, g.z - p.z) : -1;
    if (dist !== this.lastDist) {
      this.lastDist = dist;
      this.lineDist.textContent = dist >= 0 ? `${num(dist)} m` : '';
    }
  }

  /** The line's words and state for this state of this job. */
  private fillJobLine(sim: SimWorld, d: JobDef): void {
    const jobs = sim.jobs;
    let kind: string;
    let state = d.kind === 'order' ? 'is-order' : d.kind === 'escape' ? 'is-escape' : d.kind === 'trial' ? 'is-trial' : d.kind === 'race' ? 'is-race'
      : d.kind === 'rage' || d.kind === 'mayhem' ? 'is-zone' : d.kind === 'duel' ? 'is-duel' : '';
    const rival = d.kind === 'duel' ? (RIVALS[d.level] as RivalDef) : null;
    if (jobs.state === 'done' && rival) {
      // beaten: the purse, and the car the first time
      const cash = Math.round(jobs.lastPaid);
      kind = jobs.lastRematch ? t('REMATCH WON +{cash}', { cash }) : t('BEATEN +{cash} · THE {car} IS YOURS', { cash, car: t(BODY_WORDS[rival.body]) });
      state = 'is-done';
    } else if (jobs.state === 'failed' && rival) {
      const name = t(rival.name);
      kind = jobs.lastPlace !== 2 ? t('TOO LATE · TRY AGAIN') : rival.format === 'hunt' ? t('{name} GOT HOME · TRY AGAIN', { name })
        : t(rival.name.startsWith('THE TWINS') ? '{name} WIN · TRY AGAIN' : '{name} WINS · TRY AGAIN', { name });
      state = 'is-failed';
    } else if (rival) {
      kind = rival.format === 'chief' ? t('LOSE THE CHIEF') : rival.format === 'hunt' ? t('WRECK {name}', { name: t(rival.name) })
        : `${t(rival.name)} · ${t(PLACE_WORDS[this.racePlace] ?? '')}`;
    } else if (jobs.state === 'done') {
      const what = d.kind === 'order' ? t('SOLD') : d.kind === 'escape' ? t('BOUNTY') : d.kind === 'trial' ? t(MEDAL_WORDS[jobs.lastMedal] ?? '')
        : d.kind === 'race' ? t('{place} PLACE', { place: t(PLACE_WORDS[jobs.lastPlace] ?? '') })
          : t(d.kind === 'rage' ? 'RAGE DONE' : d.kind === 'mayhem' ? 'MAYHEM DONE' : d.kind === 'fare' ? 'FARE PAID' : 'DELIVERED');
      kind = `${what} +${money(jobs.lastPaid)}${jobs.lastTip ? ` · ${t('CLEAN LINE')}` : ''}`;
      state = 'is-done';
    } else if (jobs.state === 'failed') {
      kind = t(d.kind === 'trial' ? 'TOO SLOW · NO MEDAL' : d.kind === 'race' && jobs.lastPlace > 3 ? 'LAST · NO PRIZE' : 'TOO LATE');
      state = 'is-failed';
    } else if (d.kind === 'order') {
      const w = unpackDescriptor(d.descriptor);
      kind = jobs.state === 'hunting' ? t('FIND A {car}', { car: paintedCar(paintName(w.paint), CAR_WORDS[w.kind]) }) : t('DELIVER THE {car}', { car: t(CAR_WORDS[w.kind]) });
    } else if (d.kind === 'escape') {
      kind = t('ESCAPE {stars}', { stars: '★'.repeat(d.level) });
    } else if (d.kind === 'trial') {
      kind = t('TIME TRIAL · FOLLOW THE COINS');
    } else if (d.kind === 'race') {
      kind = t('RACE · {place}', { place: t(PLACE_WORDS[this.racePlace] ?? '') });
    } else if (d.kind === 'fare') {
      const fares = sim.fares;
      kind = `${t(fares.hot ? 'HOT FARE' : 'FARE')}${fares.chain > 0 ? ` ×${fares.chain + 1}` : ''}${this.fareTips > 0 ? ` · ${t('TIPS +{cash}', { cash: Math.round(this.fareTips) })}` : ''}`;
    } else if (d.kind === 'rage' || d.kind === 'mayhem') {
      const count = d.kind === 'rage' ? t('{n}/{of} TAKEDOWNS', { n: Math.min(this.zoneCount, d.level), of: d.level }) : `${money(Math.min(this.zoneCount, d.level))} / ${money(d.level)}`;
      kind = `${t(d.kind === 'rage' ? 'RAGE' : 'MAYHEM')} · ${count}${this.zoneOut ? ` · ${t('BACK INTO THE ZONE')}` : ''}`;
    } else {
      kind = t('DELIVERY');
    }
    if (kind !== this.kindText) {
      this.kindText = kind;
      this.lineKind.textContent = kind;
    }
    this.setState(state);
    if (jobs.state === 'done' || jobs.state === 'failed') {
      this.lineTime.textContent = '';
      this.lineDist.textContent = '';
    }
  }

  /** The card: what was taken on; the first order's says how to take the car. */
  private fillJobCard(sim: SimWorld, d: JobDef): void {
    this.cardTitle.textContent = t(KIND_TITLE[d.kind]);
    this.cardPay.textContent = money(d.payout);
    if (d.kind === 'duel') {
      // the rival's poster: the name and the line, the race (a hunt races until M6 slice 2), the purse and the car
      const r = RIVALS[d.level] as RivalDef;
      const n = posterNumber(d.level);
      const board = sim.board;
      const car = t(BODY_WORDS[r.body]), cash = Math.round(board.purse(d.level));
      this.cardTitle.textContent = n > 0 ? `#${n} ${t(r.name)}` : t(r.name);
      this.cardSub.textContent = t(r.line);
      this.cardLimit.textContent = r.format === 'chief' ? t('LOSE HIM AT ★★★★★') : r.format === 'hunt' ? t('WRECK THE {car} BEFORE IT GETS HOME', { car }) : t('FIRST TO THE FINISH · ANY ROUTE');
      this.cardPay.textContent = board.isBeaten(d.level) ? t('REMATCH · {cash}', { cash }) : t('{cash} + THE {car}', { cash, car });
    } else if (d.kind === 'order') {
      const w = unpackDescriptor(d.descriptor);
      const first = (sim.run.chain & (1 << STEP.order)) === 0 && sim.jobs.state === 'hunting';
      const car = paintedCar(paintName(w.paint), CAR_WORDS[w.kind]);
      this.cardSub.textContent = first ? t("WANTED: {car} · IT'S IN TRAFFIC · SWAP INTO IT", { car }) : t('WANTED: {car}', { car });
      this.cardLimit.textContent = t('{time} FROM THE SWAP · NO SCRATCHES', { time: clock(d.limitSeconds) });
    } else if (d.kind === 'escape') {
      this.cardSub.textContent = t('THE COPS HAVE YOU');
      this.cardLimit.textContent = t('LOSE THEM');
    } else if (d.kind === 'fare') {
      this.cardSub.textContent = t(sim.fares.hot ? 'A CROOK WITH A SUITCASE · DOUBLE PAY · MORE STARS' : 'TAKE THEM THERE · FOLLOW THE LINE');
      this.cardLimit.textContent = t('{time} · NEAR MISSES AND JUMPS TIP', { time: clock(d.limitSeconds) });
    } else if (d.kind === 'rage' || d.kind === 'mayhem') {
      const z = BALANCE.jobs.zone;
      this.cardSub.textContent = t(d.kind === 'rage' ? 'WRECK CARS INSIDE THE RING' : 'SMASH IT UP INSIDE THE RING');
      this.cardLimit.textContent = d.kind === 'rage' ? t('{n} TAKEDOWNS IN {s} S', { n: d.level, s: z.seconds }) : t('{cash} OF DAMAGE IN {s} S', { cash: Math.round(d.level), s: z.seconds });
    } else if (d.kind === 'race') {
      const pay = BALANCE.jobs.race.pay;
      this.cardSub.textContent = t('FIRST TO THE FINISH · ANY ROUTE');
      this.cardLimit.textContent = t('1ST {a} · 2ND {b} · 3RD {c}', { a: Math.round(pay[0] ?? 0), b: Math.round(pay[1] ?? 0), c: Math.round(pay[2] ?? 0) });
    } else if (d.kind === 'trial') {
      const [g, s, b] = trialTimes(d.limitSeconds);
      const best = sim.jobs.medals.get(d.id) ?? 0;
      this.cardSub.textContent = best > 0 ? t('FOLLOW THE COINS · YOUR BEST: {medal}', { medal: t(MEDAL_WORDS[best] ?? '') }) : t('FOLLOW THE COINS TO THE FINISH');
      this.cardLimit.textContent = t('GOLD {g} · SILVER {s} · BRONZE {b}', { g: clock(Math.round(g)), s: clock(Math.round(s)), b: clock(Math.round(b)) });
    } else {
      this.cardSub.textContent = t('DELIVER IT · FOLLOW THE LINE');
      this.cardLimit.textContent = t('{time} · FASTER PAYS MORE', { time: clock(d.limitSeconds) });
    }
    this.card.dataset['kind'] = d.kind;
  }

  /** A ticked step: which of six, what it was, what comes next. */
  private fillChainCard(chain: number, step: number): void {
    const next = chainStep(chain);
    this.chainShown = step;
    this.cardTitle.textContent = t('STEP {n} OF {of}', { n: step + 1, of: CHAIN_STEPS.length });
    this.cardSub.textContent = t(CHAIN_STEPS[step] ?? '');
    this.cardPay.textContent = t('DONE');
    this.cardLimit.textContent = next < 0 ? t('ALL DONE · THE CITY IS YOURS') : t('NEXT: {step}', { step: t(CHAIN_STEPS[next] ?? '') });
    this.card.dataset['kind'] = 'chain';
    this.card.classList.remove('is-teach');
  }

  /** The badge's pictogram, written only when it changes; none hides it. */
  private setBadge(glyph: number): void {
    if (glyph === this.badgeGlyph) return;
    this.badgeGlyph = glyph;
    this.lineBadge.classList.toggle('is-shown', glyph !== NO_GLYPH);
    this.lineBadge.innerHTML = glyph === NO_GLYPH ? '' : badgeMarkup(glyph);
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

/** The line's distance to the goal, to 10 m: by road along the way's route (M8.7 D2), else the straight line (dx, dz). */
function metres(sim: SimWorld, dx: number, dz: number): number {
  const road = sim.way?.length ?? NaN;
  return Math.round((Number.isFinite(road) ? road : Math.hypot(dx, dz)) / 10) * 10;
}

/**
 * The goal line's words and its yellow extra for a goal (DESIGN.md §13.4, M8.7 D7): a ring the way leads to by its
 * name and its pay (DELIVERY +1,200), a step, a door, a rival. Pure; `t` says it in the screen's language.
 */
export function goalWords(sim: SimWorld, g: Goal): { words: string; extra: string } {
  let words = '', extra = '';
  switch (g.kind) {
    case 'take': {
      // the ring the way leads to by its name and its pay (M8.7 D7): DELIVERY +1,200
      const d = sim.jobs.defOf(g.id);
      if (!d) { words = t('TAKE A JOB'); break; }
      words = t(KIND_TITLE[d.kind]);
      extra = `+${money(d.kind === 'duel' ? sim.board.purse(d.level) : d.payout)}`;
      break;
    }
    case 'bank': words = t('BANK IT'); break;
    case 'lose': words = t(g.hasTarget ? 'LOSE THEM OR BANK IT' : 'LOSE THEM'); break;
    case 'buy':
      words = t('BUY THE {car}', { car: t(CAR_WORDS.compact) });
      if (g.amount > 0) extra = t('{cash} TO GO', { cash: Math.round(g.amount) });
      break;
    case 'escape': words = t('ESCAPE THE COPS'); break;
    case 'order': words = t('STEAL TO ORDER'); break;
    case 'fill': words = t('FILL THE BAG'); extra = `${money(g.amount)}/${money(BALANCE.chain.bankGoal)}`; break;
    // the wanted board (M6): the rival ready, or what they want first
    case 'rival': {
      const r = RIVALS[g.rival];
      words = !r ? '' : g.rival === CHIEF ? t('FACE THE CHIEF') : t('CHALLENGE {name}', { name: t(r.name) });
      break;
    }
    case 'needs': {
      const r = RIVALS[g.rival], q = r?.reqs[g.req];
      if (!r || !q) break;
      words = t('#{n} NEEDS: {req}', { n: posterNumber(g.rival), req: reqText(q, t) });
      if (q.count > 1 && q.kind !== 'bestRun') extra = `${money(Math.min(g.amount, q.count))}/${money(q.count)}`;
      break;
    }
    default: break;
  }
  return { words, extra };
}

/** Each glyph's badge as inline SVG (the way's cyan ring, the ink face, the pictogram), made once. */
const BADGES = new Map<number, string>();
export function badgeMarkup(glyph: number): string {
  const made = BADGES.get(glyph);
  if (made) return made;
  const ids: readonly GlyphId[] = glyph >= 0 ? [GLYPH_ORDER[glyph] as GlyphId] : numberGlyphs(-glyph);
  let paths = '';
  ids.forEach((id, k) => {
    const slot = digitSlot(k, ids.length);
    for (const shape of GLYPHS[id]) {
      let d = '';
      for (const pts of [shape.outer, ...(shape.holes ?? [])]) {
        for (let i = 0; i < pts.length; i += 2) {
          d += `${i === 0 ? 'M' : 'L'}${(slot.cx + ((pts[i] as number) - 0.5) * slot.sx).toFixed(3)} ${(pts[i + 1] as number).toFixed(3)}`;
        }
        d += 'Z';
      }
      paths += `<path d="${d}" fill-rule="evenodd"/>`;
    }
  });
  const svg = '<svg class="jobs__badge-svg" viewBox="-0.25 -0.25 1.5 1.5" aria-hidden="true">'
    + '<circle class="jobs__badge-rim" cx="0.5" cy="0.5" r="0.72"/><circle class="jobs__badge-face" cx="0.5" cy="0.5" r="0.6"/>'
    + `<g class="jobs__badge-glyph" transform="translate(0.1 0.1) scale(0.8)">${paths}</g></svg>`;
  BADGES.set(glyph, svg);
  return svg;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function money(v: number): string {
  return num(Math.round(v));
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
