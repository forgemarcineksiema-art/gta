/**
 * The run on the HUD (docs/STYLE.md, the run HUD): the bag under the stars
 * with the multiplier the run is earning, the busted bar while it fills, the
 * busted card and the wall of totals behind a shut door. Yellow is money that
 * is not yours yet. DOM writes only on change; reads sim state only.
 */
import { CHAIN_STEPS, STEP, chainStep, type CarId, type RunState, type SimWorld } from '../sim';
import { BALANCE } from '../sim/balance';

const TWEEN_SECONDS = 0.3;
/** The coin counter's pop: on for the first half, off for the second, so a line's coins pulse one by one. */
const COIN_POP_SECONDS = 0.14;
const CAP_FLASH_SECONDS = 0.35;

export class RunHud {
  readonly root: HTMLElement;
  private readonly bag: HTMLElement;
  private readonly bagValue: HTMLElement;
  private readonly mult: HTMLElement;
  private readonly coinRow: HTMLElement;
  private readonly coinValue: HTMLElement;
  private lastCoins = -1;
  private coinPopLeft = 0;
  private capFlashLeft = 0;
  private coinPop = false;
  private capFlash = false;
  private readonly bar: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardLines: HTMLElement;
  /** The panel behind the shut door: the garage's tabs and pages are added to it by `GarageUi`. */
  readonly wall: HTMLElement;
  private readonly wallLines: HTMLElement;
  /** The first door's line: how far the first new car is. */
  private readonly wallFirst: HTMLElement;
  /** The whole game in one line, under BANKED until the chain's escape step is done (DESIGN.md §13.4). */
  private readonly wallSentence: HTMLElement;
  private lastSerial = -1;
  private readonly wallCounts: HTMLElement;
  /** The wanted poster: the car the police will look for (the descriptor's class and paint). */
  private readonly wanted: HTMLElement;
  private readonly wantedSwatch: HTMLElement;
  private readonly wantedCar: HTMLElement;
  private readonly prompts: HTMLElement[] = [];
  private shownBag = 0;
  private fromBag = 0;
  private toBag = 0;
  private tween = 1;
  private lastBagShown = -1;
  private lastMult = -1;
  private popLeft = 0;
  private lastBar = -1;
  private barVisible = false;
  private state: RunState = 'running';

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.root = el('div', 'run');
    this.bag = el('div', 'run__bag');
    this.bagValue = el('span', 'run__bag-value', '0');
    this.mult = el('span', 'run__mult', '×1');
    this.bag.append(this.bagValue, this.mult);
    this.bag.setAttribute('aria-label', 'Bag');
    // coins under the bag, white: they are the player's the moment they are picked
    this.coinRow = el('div', 'run__coins');
    this.coinValue = el('span', 'run__coins-value', '0');
    this.coinRow.append(el('span', 'run__coin-glyph'), this.coinValue);
    this.bar = el('div', 'run__busted');
    const track = el('div', 'run__busted-track');
    this.barFill = el('div', 'run__busted-fill');
    track.appendChild(this.barFill);
    this.bar.append(el('div', 'run__busted-label', 'BUSTED'), track);
    this.card = el('div', 'run__card');
    this.cardLines = el('div', 'run__lines');
    this.card.append(el('div', 'run__title run__title--danger', 'BUSTED'), this.cardLines, this.prompt());
    this.wall = el('div', 'run__wall');
    this.wallLines = el('div', 'run__lines');
    this.wallCounts = el('div', 'run__counts');
    this.wanted = el('div', 'run__wanted');
    this.wantedSwatch = el('span', 'run__wanted-swatch');
    this.wantedCar = el('span', 'run__wanted-car');
    this.wanted.append(el('span', 'run__wanted-title', 'WANTED'), this.wantedSwatch, this.wantedCar);
    this.wallFirst = el('div', 'run__first');
    // the totals page: the garage's pages sit beside it in the same panel
    const page = el('div', 'run__wall-page wall__page wall__page--wall');
    this.wallSentence = el('div', 'run__sentence', 'CRIMES FILL THE BAG · THE POLICE MULTIPLY IT · THE DOOR BANKS IT');
    page.append(el('div', 'run__title', 'BANKED'), this.wallLines, this.wallSentence, this.wallFirst, this.wallCounts, this.wanted);
    this.wall.append(page);
    this.root.append(this.bag, this.coinRow, this.bar, this.card, this.wall);
    parent.appendChild(this.root);
    this.bag.classList.toggle('is-visible', sim.city !== null);
    this.coinRow.classList.toggle('is-visible', sim.city !== null);
    this.update(sim, 0);
  }

  /** The key that closes the card and opens the door: any; the label names one the player knows. */
  setKeys(k: { any: string }): void {
    for (const p of this.prompts) p.replaceChildren(el('kbd', 'key', k.any), el('span', 'run__prompt-label', 'ANY KEY'));
  }

  update(sim: SimWorld, dt: number): void {
    const run = sim.run;
    // the bag counts up over 0.3 s to its new value
    if (run.bag !== this.toBag) {
      this.fromBag = this.shownBag;
      this.toBag = run.bag;
      this.tween = 0;
    }
    if (this.tween < 1) {
      this.tween = Math.min(1, this.tween + dt / TWEEN_SECONDS);
      this.shownBag = this.fromBag + (this.toBag - this.fromBag) * this.tween;
    }
    // compare numbers first: a string per frame is garbage on the frame path
    const shown = Math.round(this.shownBag);
    if (shown !== this.lastBagShown) {
      this.bagValue.textContent = money(shown);
      this.lastBagShown = shown;
    }
    if (run.coins !== this.lastCoins) {
      this.coinValue.textContent = money(run.coins);
      if (this.lastCoins >= 0) {
        this.coinPopLeft = COIN_POP_SECONDS;
        if (run.coins - this.lastCoins >= BALANCE.coin.cap) this.capFlashLeft = CAP_FLASH_SECONDS;
      }
      this.lastCoins = run.coins;
    }
    if (this.coinPopLeft > 0 || this.coinPop) {
      this.coinPopLeft = Math.max(0, this.coinPopLeft - dt);
      const pop = this.coinPopLeft > COIN_POP_SECONDS / 2;
      if (pop !== this.coinPop) { this.coinPop = pop; this.coinRow.classList.toggle('is-pop', pop); }
    }
    if (this.capFlashLeft > 0 || this.capFlash) {
      this.capFlashLeft = Math.max(0, this.capFlashLeft - dt);
      const flash = this.capFlashLeft > 0;
      if (flash !== this.capFlash) { this.capFlash = flash; this.coinRow.classList.toggle('is-cap', flash); }
    }
    const m = run.multiplier;
    if (m !== this.lastMult) {
      this.mult.textContent = `×${m}`;
      if (this.lastMult >= 0) this.popLeft = TWEEN_SECONDS;
      this.lastMult = m;
    }
    if (this.popLeft > 0) {
      this.popLeft -= dt;
      this.mult.classList.toggle('is-pop', this.popLeft > 0);
    }
    const barVisible = run.bustedProgress > 0 && (run.state === 'running' || run.state === 'closing');
    if (barVisible !== this.barVisible) {
      this.barVisible = barVisible;
      this.bar.classList.toggle('is-visible', barVisible);
    }
    if (barVisible) {
      const bar = Math.round(run.bustedProgress * 200);
      if (bar !== this.lastBar) { this.barFill.style.transform = `scaleX(${bar / 200})`; this.lastBar = bar; }
    }
    if (run.state === 'door' && run.lastSerial !== this.lastSerial) {
      // the double offer paid after the door shut: the totals again
      this.lastSerial = run.lastSerial;
      this.fillWall(sim);
    }
    if (run.state !== this.state) {
      this.state = run.state;
      if (run.state === 'busted') this.fillCard(sim);
      if (run.state === 'door') this.fillWall(sim);
      this.card.classList.toggle('is-visible', run.state === 'busted');
      this.wall.classList.toggle('is-visible', run.state === 'door');
      this.bag.classList.toggle('is-hidden', run.state === 'busted' || run.state === 'door');
      this.coinRow.classList.toggle('is-hidden', run.state === 'busted' || run.state === 'door');
    }
  }

  private fillCard(sim: SimWorld): void {
    const run = sim.run;
    this.cardLines.replaceChildren(
      line('BAG', money(run.lastBag)),
      line(run.lastLawyer ? 'THE LAWYER KEEPS' : 'YOU KEEP', money(run.lastFine), true),
      line('BANK', money(run.bank)),
    );
  }

  private fillWall(sim: SimWorld): void {
    const run = sim.run;
    this.lastSerial = run.lastSerial;
    this.wallLines.replaceChildren(
      line(run.lastDoubled ? 'BAG, DOUBLED' : 'BAG', money(run.lastBag)),
      line(run.lastFence ? 'MULTIPLIER + FENCE' : 'MULTIPLIER', `×${run.lastMultiplier}`),
      line('BANKED', money(run.lastBanked), true),
      line('BEST RUN', money(run.bestRun)),
      line('BANK', money(run.bank)),
    );
    // the next goal (DESIGN.md §13.4): the first new car while the chain's first three steps lead there, then the
    // chain's next step, then the first car again if it is still not bought
    const step = chainStep(run.chain);
    const noCar = !sim.garage.owned.has('compact');
    const price = BALANCE.prices.compact;
    const firstCar = run.funds >= price ? `FIRST NEW CAR: ${money(price)} · IT IS YOURS IN CARS` : `FIRST NEW CAR: ${money(price)} · YOU HAVE ${money(run.funds)}`;
    const next = step >= 0 && step <= STEP.car && noCar ? firstCar
      : step >= 0 ? `NEXT: ${CHAIN_STEPS[step] ?? ''} · STEP ${step + 1} OF ${CHAIN_STEPS.length}`
        : noCar ? firstCar : '';
    this.wallFirst.textContent = next;
    this.wallFirst.classList.toggle('is-visible', next !== '');
    this.wallSentence.classList.toggle('is-visible', (run.chain & (1 << STEP.escape)) === 0);
    const c = run.counts;
    this.wallCounts.textContent = `${plural(c.takedowns, 'TAKEDOWN')} · ${plural(c.escapes, 'ESCAPE')} · ${plural(c.billboards, 'BILLBOARD')} · ${plural(c.coins, 'COIN')}`;
    // the poster: the police remember the car, not the driver (the identity rule, taught without a line of text)
    const d = sim.pursuit.descriptor;
    this.wantedSwatch.style.background = `#${d.paint.toString(16).padStart(6, '0')}`;
    this.wantedCar.textContent = CAR_WORD[d.kind];
  }

  private prompt(): HTMLElement {
    const p = el('div', 'run__prompt');
    this.prompts.push(p);
    return p;
  }
}

const CAR_WORD: Record<CarId, string> = { muscle: 'MUSCLE CAR', compact: 'COMPACT', heavy: 'VAN', sports: 'SPORTS CAR', police: 'POLICE CAR' };

function line(label: string, value: string, strong = false): HTMLElement {
  const row = el('div', strong ? 'run__line is-strong' : 'run__line');
  row.append(el('span', 'run__line-label', label), el('span', 'run__line-value', value));
  return row;
}

/** A count and its word held together: the line may wrap only at the separators. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 'S'}`;
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
