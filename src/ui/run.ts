/**
 * The run on the HUD (docs/STYLE.md, the run HUD): the bag under the stars
 * with the multiplier the run is earning, the bank under it (the road coins
 * land in it, M8.5 D1), the busted bar while it fills, the
 * busted card and the wall of totals behind a shut door. Yellow is money that
 * is not yours yet. DOM writes only on change; reads sim state only.
 */
import { CHAIN_STEPS, RIVALS, STEP, chainStep, posterNumber, reqText, type CarId, type RunState, type SimWorld } from '../sim';
import { BALANCE } from '../sim/balance';
import { DRIVE, drive, newDriveState, readDrive } from './corners';

const TWEEN_SECONDS = 0.3;
/** The coin counter's pop: on for the first half, off for the second, so a line's coins pulse one by one. */
const COIN_POP_SECONDS = 0.14;
const CAP_FLASH_SECONDS = 0.35;

export class RunHud {
  readonly root: HTMLElement;
  private readonly bag: HTMLElement;
  private readonly bagValue: HTMLElement;
  private readonly mult: HTMLElement;
  private readonly bankRow: HTMLElement;
  private readonly bankValue: HTMLElement;
  private lastBank = -1;
  private coinPopLeft = 0;
  private capFlashLeft = 0;
  private coinPop = false;
  private capFlash = false;
  private readonly bar: HTMLElement;
  /** The ticket book's three lines of ink. */
  private readonly barLines: HTMLElement[];
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
  /** The corners (DESIGN.md §17.2): the bag from its first money, its × from ×1.3, the bank while driving. */
  private readonly driveState = newDriveState();
  private mask = -1;

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.root = el('div', 'run');
    this.bag = el('div', 'run__bag');
    this.bagValue = el('span', 'run__bag-value', '0');
    this.mult = el('span', 'run__mult', '×1');
    this.bag.append(this.bagValue, this.mult);
    this.bag.setAttribute('aria-label', 'Bag');
    // the bank under the bag, white, with the coin: a road coin is in it the moment it is picked
    this.bankRow = el('div', 'run__coins');
    this.bankValue = el('span', 'run__coins-value', '0');
    this.bankRow.append(el('span', 'run__coin-glyph'), this.bankValue);
    // the busted bar is the officer's ticket book (M5.5 slice 18): three lines written as it fills
    this.bar = el('div', 'run__busted');
    const pad = el('div', 'run__ticket');
    pad.append(el('div', 'run__ticket-head', 'BUSTED'));
    this.barLines = [0, 1, 2].map(() => {
      const line = el('div', 'run__ticket-line');
      const ink = el('div', 'run__ticket-ink');
      line.appendChild(ink);
      pad.appendChild(line);
      return ink;
    });
    this.bar.append(pad);
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
    this.root.append(this.bag, this.bankRow, this.bar, this.card, this.wall);
    parent.appendChild(this.root);
    this.bag.classList.toggle('is-visible', sim.city !== null);
    this.bankRow.classList.toggle('is-visible', sim.city !== null);
    this.update(sim, 0);
  }

  /** The key that closes the card and opens the door: any; the label names one the player knows. */
  setKeys(k: { any: string }): void {
    for (const p of this.prompts) p.replaceChildren(el('kbd', 'key', k.any), el('span', 'run__prompt-label', 'ANY KEY'));
  }

  update(sim: SimWorld, dt: number): void {
    const run = sim.run;
    const m = drive(readDrive(sim, 0, this.driveState));
    if (m !== this.mask) {
      this.mask = m;
      // hidden, never removed: the bag keeps its place so the bank under it never jumps
      this.bag.classList.toggle('is-hidden', (m & DRIVE.bag) === 0);
      this.mult.classList.toggle('is-hidden', (m & DRIVE.mult) === 0);
      this.bankRow.classList.toggle('is-hidden', (m & DRIVE.bank) === 0);
    }
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
    if (run.bank !== this.lastBank) {
      this.bankValue.textContent = money(run.bank);
      // money in pops the number (a coin, a line's cap flashes); money spent behind the door does not
      if (this.lastBank >= 0 && run.bank > this.lastBank) {
        this.coinPopLeft = COIN_POP_SECONDS;
        if (run.bank - this.lastBank >= BALANCE.coin.cap) this.capFlashLeft = CAP_FLASH_SECONDS;
      }
      this.lastBank = run.bank;
    }
    if (this.coinPopLeft > 0 || this.coinPop) {
      this.coinPopLeft = Math.max(0, this.coinPopLeft - dt);
      const pop = this.coinPopLeft > COIN_POP_SECONDS / 2;
      if (pop !== this.coinPop) { this.coinPop = pop; this.bankRow.classList.toggle('is-pop', pop); }
    }
    if (this.capFlashLeft > 0 || this.capFlash) {
      this.capFlashLeft = Math.max(0, this.capFlashLeft - dt);
      const flash = this.capFlashLeft > 0;
      if (flash !== this.capFlash) { this.capFlash = flash; this.bankRow.classList.toggle('is-cap', flash); }
    }
    const mult = run.multiplier;
    if (mult !== this.lastMult) {
      this.mult.textContent = `×${mult}`;
      if (this.lastMult >= 0) this.popLeft = TWEEN_SECONDS;
      this.lastMult = mult;
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
      if (bar !== this.lastBar) {
        this.lastBar = bar;
        for (let k = 0; k < this.barLines.length; k++) {
          const f = Math.max(0, Math.min(1, (bar / 200) * this.barLines.length - k));
          (this.barLines[k] as HTMLElement).style.transform = `scaleX(${f})`;
        }
      }
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
    const firstCar = run.bank >= price ? `FIRST NEW CAR: ${money(price)} · IT IS YOURS IN CARS` : `FIRST NEW CAR: ${money(price)} · YOU HAVE ${money(run.bank)}`;
    const next = step >= 0 && step <= STEP.car && noCar ? firstCar
      : step >= 0 ? `NEXT: ${CHAIN_STEPS[step] ?? ''} · STEP ${step + 1} OF ${CHAIN_STEPS.length}`
        : noCar ? firstCar : boardLine(sim);
    this.wallFirst.textContent = next;
    this.wallFirst.classList.toggle('is-visible', next !== '');
    this.wallSentence.classList.toggle('is-visible', (run.chain & (1 << STEP.escape)) === 0);
    const c = run.counts;
    // the street furniture's bill (M8 slice 6): the city's, never the player's money, so not in yellow
    const damage = c.damage > 0 ? ` · CITY\u00a0DAMAGE\u00a0${money(c.damage)}` : '';
    this.wallCounts.textContent = `${plural(c.takedowns, 'TAKEDOWN')} · ${plural(c.escapes, 'ESCAPE')} · ${plural(c.billboards, 'BILLBOARD')} · ${plural(c.coins, 'COIN')}${damage}`;
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

/** After the chain (M6): the next rival on the wanted board and what they want first, or that they are ready. */
function boardLine(sim: SimWorld): string {
  const b = sim.board;
  const i = b.next();
  const r = RIVALS[i];
  if (!r) return '';
  const n = posterNumber(i);
  const who = n > 0 ? `#${n} ${r.name}` : r.name;
  const open = r.reqs[b.firstOpen(i)];
  return b.ready(i) || !open ? `NEXT ON THE BOARD: ${who} · READY FOR YOU` : `NEXT ON THE BOARD: ${who} · ${reqText(open)}`;
}
