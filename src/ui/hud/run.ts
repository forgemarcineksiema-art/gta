/**
 * The run on the HUD (docs/STYLE.md, the run HUD): the money block under the
 * stars (docs/M8.9_PLAN.md R4), the bank first with its coin (the road coins
 * land in it, M8.5 D1), the bag under it with its sack and the multiplier the
 * run is earning, so the bank never jumps; the busted bar while it fills, the
 * busted card and the wall of totals behind a shut door. Yellow is money that
 * is not yours yet. DOM writes only on change; reads sim state only.
 */
import { STEP, type RunState, type SimWorld } from '../../sim';
import { BALANCE } from '../../sim/balance';
import { DRIVE, drive, newDriveState, promptPlace, readDrive } from './corners';
import { glyphIcon } from '../glyph';
import { label, labelAria, num, relabel, t } from '../lang';
import { starText } from './stars';
import { cardLines, countsLine, doorLines, nextLine, type Line } from './totals';

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
  /** A car alongside while the ticket fills (M8.9 R5): its prompt on the ticket, one block (E BORROW). */
  private readonly ticketPrompt: HTMLElement;
  private readonly ticketKey: HTMLElement;
  private readonly ticketWord: HTMLElement;
  private ticketMode = '';
  private readonly card: HTMLElement;
  private readonly cardLines: HTMLElement;
  /** The panel behind the shut door: the garage's tabs and pages are added to it by `GarageUi`. */
  readonly wall: HTMLElement;
  /** TOTALS' title (BANKED, or GARAGE with nothing banked) and its NEW BEST tag (M8.5). */
  private readonly wallTitle: HTMLElement;
  private readonly wallBest: HTMLElement;
  private readonly wallLines: HTMLElement;
  /** The first door's line: how far the first new car is. */
  private readonly wallFirst: HTMLElement;
  /** The whole game in one line, under BANKED until the chain's escape step is done (DESIGN.md §13.4). */
  private readonly wallSentence: HTMLElement;
  private lastSerial = -1;
  private readonly wallCounts: HTMLElement;
  private readonly prompts: HTMLElement[] = [];
  /** The key the prompts name, kept to say it again in a new language. */
  private anyKey = '';
  private swapKey = 'E';
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
    // the money block: the bank, in ink with the coin (a road coin is in it the moment it is picked), then the bag
    const block = el('div', 'run__money');
    this.bankRow = el('div', 'run__coins');
    this.bankValue = el('span', 'run__coins-value', '0');
    this.bankRow.append(glyphIcon('coin', 'run__glyph run__glyph--coin'), this.bankValue);
    this.bag = el('div', 'run__bag');
    this.bagValue = el('span', 'run__bag-value', '0');
    this.mult = el('span', 'run__mult', '×1');
    this.bag.append(glyphIcon('sack', 'run__glyph run__glyph--sack'), this.bagValue, this.mult);
    labelAria(this.bag, 'Bag');
    block.append(this.bankRow, this.bag);
    // the busted bar is the officer's ticket book (M5.5 slice 18): three lines written as it fills
    this.bar = el('div', 'run__busted');
    const pad = el('div', 'run__ticket');
    pad.append(label(el('div', 'run__ticket-head'), 'BUSTED'));
    this.barLines = [0, 1, 2].map(() => {
      const line = el('div', 'run__ticket-line');
      const ink = el('div', 'run__ticket-ink');
      line.appendChild(ink);
      pad.appendChild(line);
      return ink;
    });
    this.ticketPrompt = el('div', 'run__ticket-prompt');
    this.ticketKey = el('kbd', 'key', 'E');
    this.ticketWord = el('span', 'run__ticket-word', '');
    this.ticketPrompt.append(this.ticketKey, this.ticketWord);
    this.bar.append(pad, this.ticketPrompt);
    this.card = el('div', 'run__card');
    this.cardLines = el('div', 'run__lines');
    this.card.append(label(el('div', 'run__title run__title--danger'), 'BUSTED'), this.cardLines, this.prompt());
    this.wall = el('div', 'run__wall');
    this.wallLines = el('div', 'run__lines');
    this.wallCounts = el('div', 'run__counts');
    this.wallFirst = el('div', 'run__first');
    // the totals page (DESIGN.md §17.5): the title, one line of sums, the sentence while it teaches, the next goal, the
    // counts; the bank is the footer's. The garage's pages sit beside it in the same panel
    const page = el('div', 'run__wall-page wall__page wall__page--wall');
    this.wallSentence = label(el('div', 'run__sentence'), 'CRIMES FILL THE BAG · STARS MULTIPLY IT · A GARAGE BANKS IT');
    this.wallTitle = el('span', '', t('BANKED'));
    this.wallBest = label(el('span', 'run__best'), 'NEW BEST');
    const title = el('div', 'run__title');
    title.append(this.wallTitle, this.wallBest);
    page.append(title, this.wallLines, this.wallSentence, this.wallFirst, this.wallCounts);
    this.wall.append(page);
    this.root.append(block, this.bar, this.card, this.wall);
    parent.appendChild(this.root);
    this.bag.classList.toggle('is-visible', sim.city !== null);
    this.bankRow.classList.toggle('is-visible', sim.city !== null);
    this.update(sim, 0);
  }

  /** The key that closes the card and opens the door: any; the label names one the player knows. The swap key: the ticket's prompt. */
  setKeys(k: { any: string; swap: string }): void {
    this.anyKey = k.any;
    this.swapKey = k.swap;
    this.ticketKey.textContent = k.swap;
    for (const p of this.prompts) p.replaceChildren(el('span', 'run__prompt-label', t('PRESS ANY KEY')));
  }

  /** The language changed (DESIGN.md §19): the labels, the prompt, and the card or the totals up now. */
  relabel(sim: SimWorld): void {
    relabel(this.root);
    this.setKeys({ any: this.anyKey, swap: this.swapKey });
    this.ticketMode = '';
    if (sim.run.state === 'busted') this.fillCard(sim);
    else if (sim.run.state === 'door') this.fillWall(sim);
  }

  update(sim: SimWorld, dt: number): void {
    const run = sim.run;
    const m = drive(readDrive(sim, 0, this.driveState));
    if (m !== this.mask) {
      this.mask = m;
      // hidden, never removed: the bag under the bank keeps its place, so the pops' lane under it never jumps
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
      this.mult.textContent = `×${num(mult)}`;
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
    // a car alongside: its prompt on the ticket (the intro's own caption teaches the swap)
    const c = sim.life.state.swapCandidate;
    const mode = promptPlace(c >= 0, barVisible, sim.coldOpen.caption === 'swap') !== 'ticket' ? '' : sim.traffic?.police[c] === 1 ? 'BORROW' : 'SWAP';
    if (mode !== this.ticketMode) {
      this.ticketMode = mode;
      this.ticketPrompt.classList.toggle('is-on', mode !== '');
      if (mode !== '') this.ticketWord.textContent = t(mode);
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
    this.cardLines.replaceChildren(...cardLines(sim.run).map(line));
  }

  private fillWall(sim: SimWorld): void {
    const run = sim.run;
    this.lastSerial = run.lastSerial;
    // BANKED with what the door banked, GARAGE when the bag came in empty; NEW BEST when this run beat every other
    this.wallTitle.textContent = t(run.lastBanked > 0 ? 'BANKED' : 'GARAGE');
    this.wallBest.classList.toggle('is-visible', run.lastBest);
    this.wallLines.replaceChildren(...doorLines(run).map(line));
    const next = nextLine(sim);
    starText(this.wallFirst, next);
    this.wallFirst.classList.toggle('is-visible', next !== '');
    this.wallSentence.classList.toggle('is-visible', (run.chain & (1 << STEP.escape)) === 0);
    this.wallCounts.textContent = countsLine(run.counts);
  }

  private prompt(): HTMLElement {
    const p = el('div', 'run__prompt');
    this.prompts.push(p);
    return p;
  }
}

function line(l: Line): HTMLElement {
  const row = el('div', l.strong ? 'run__line is-strong' : 'run__line');
  row.append(el('span', 'run__line-label', l.label), el('span', 'run__line-value', l.value));
  return row;
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


