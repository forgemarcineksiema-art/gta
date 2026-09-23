/**
 * The garage on the wall behind every drop-off's door (docs/M5_PLAN.md
 * slice 4, D9; DESIGN.md §6.3): after the totals, pages for the cars, the
 * paint, the tuning, the prep items and the day's challenges. A place inside
 * the world, never a menu before gameplay; the same wall at all three doors.
 *
 * Keys through the existing actions, two levels: steer left and right move
 * between pages (or between the items of a page once inside it), throttle
 * confirms (on the totals page it drives out), brake backs out one level.
 * Every item is a DOM button with the same handler, so a click does what the
 * key does. The door's rewarded offer, when there is one, is answered first:
 * DOUBLE THE BAG (a video) or BANK IT, the same size, BANK IT focused.
 *
 * Reports intents through `GarageActions` and never writes the sim; reads it
 * to draw. Rebuilds only when the garage, the bank or the totals change.
 */
import { BALANCE, CAR_IDS, CAR_WORDS, MEDAL_WORDS, PALETTE, STATS, type CarId, type PrepItem, type SimWorld, type Stat } from '../sim';

export interface GarageActions {
  buy(car: CarId): void;
  /** Keep the car driven in (DESIGN.md §13.7). */
  keep(car: CarId): void;
  select(car: CarId): void;
  respray(car: CarId, paint: number): void;
  upgrade(car: CarId, stat: Stat): void;
  buyPrep(item: PrepItem): void;
  offer(kind: 'lawyer' | 'fence' | 'double'): void;
  driveOut(): void;
}

/** One frame's edges of the actions the wall reads (App maps its `ActionState` onto this; ui cannot import input). */
export interface WallNav {
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
}

export type WallPage = 'wall' | 'cars' | 'paint' | 'tune' | 'prep' | 'dailies';
const PAGE_TITLES: Record<WallPage, string> = { wall: 'TOTALS', cars: 'CARS', paint: 'PAINT', tune: 'TUNE', prep: 'PREP', dailies: 'DAILIES' };

/** The seven car paints of the palette (docs/STYLE.md): the respray is free. */
export const GARAGE_PAINTS: readonly number[] = [
  PALETTE.carRed, PALETTE.carLime, PALETTE.carBlue, PALETTE.carOrange, PALETTE.carMagenta, PALETTE.carWhite, PALETTE.carBlack,
];

const STAT_WORDS: Record<Stat, string> = { power: 'POWER', grip: 'GRIP', boost: 'BOOST' };
const PREP_WORDS: Record<PrepItem, [string, string]> = {
  lawyer: ['LAWYER', 'BUSTED: KEEP 3/4 OF THE BAG'],
  fence: ['FENCE', '+0.5 ON THE DOOR MULTIPLIER'],
};

interface Item {
  el: HTMLButtonElement;
  act: () => void;
  /** Hidden items (a video button with no ads) are skipped by the keys. */
  hidden: boolean;
}

export class GarageUi {
  readonly root: HTMLElement;
  private readonly tabs = new Map<WallPage, HTMLButtonElement>();
  private readonly pages = new Map<WallPage, HTMLElement>();
  private readonly items = new Map<WallPage, Item[]>();
  private readonly order: WallPage[];
  private readonly offerRow: HTMLElement;
  private readonly offerDouble: HTMLButtonElement;
  private readonly offerBank: HTMLButtonElement;
  private readonly bankValue: HTMLElement;
  private readonly driveButton: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly paintFor: HTMLElement;
  private readonly tuneFor: HTMLElement;
  private readonly dailiesBody: HTMLElement;
  private page: WallPage = 'wall';
  private level: 'pages' | 'items' = 'pages';
  private focus = 0;
  /** The door's double offer is up and unanswered. */
  private offerOpen = false;
  /** 0 = DOUBLE THE BAG, 1 = BANK IT. */
  private offerFocus = 1;
  private rewarded = true;
  private isOpen = false;
  private garageSerial = -1;
  private hot: CarId | null = null;
  private bank = -1;
  private dailySerial = -1;
  private keys = { left: 'A', right: 'D', confirm: 'W', back: 'S' };

  constructor(parent: HTMLElement, private readonly sim: SimWorld, private readonly actions: GarageActions, pages: readonly WallPage[] = ['wall', 'cars', 'paint', 'tune', 'prep', 'dailies']) {
    this.order = [...pages];
    this.root = parent;
    const tabBar = el('div', 'wall__tabs');
    for (const p of this.order) {
      const tab = button('wall__tab', PAGE_TITLES[p]);
      tab.addEventListener('click', () => this.goPage(p, false));
      tabBar.appendChild(tab);
      this.tabs.set(p, tab);
    }
    parent.prepend(tabBar);

    // the totals page is RunHud's; the offer lives under it
    const wallPage = parent.querySelector<HTMLElement>('.run__wall-page') ?? el('div', 'run__wall-page');
    if (!wallPage.parentElement) parent.appendChild(wallPage);
    this.pages.set('wall', wallPage);
    this.offerRow = el('div', 'wall__offer');
    this.offerDouble = button('wall__btn wall__btn--video', '');
    this.offerDouble.append(videoIcon(), el('span', 'wall__btn-label', 'DOUBLE THE BAG'));
    this.offerBank = button('wall__btn', '');
    this.offerBank.append(el('span', 'wall__btn-label', 'BANK IT'));
    this.offerDouble.addEventListener('click', () => this.answerOffer(0));
    this.offerBank.addEventListener('click', () => this.answerOffer(1));
    this.offerRow.append(this.offerDouble, this.offerBank);
    wallPage.appendChild(this.offerRow);
    this.items.set('wall', []);

    // CARS: the five bodies
    const cars = this.newPage('cars');
    const grid = el('div', 'wall__cars');
    const carItems: Item[] = [];
    for (const id of CAR_IDS) {
      const b = button('wall__card', '');
      b.dataset['car'] = id;
      b.append(el('span', 'wall__card-swatch'), el('span', 'wall__card-name', CAR_WORDS[id]), el('span', 'wall__card-status'));
      grid.appendChild(b);
      carItems.push(this.item('cars', b, () => this.carAction(id)));
    }
    cars.appendChild(grid);
    this.items.set('cars', carItems);

    // PAINT: seven swatches for the garage car
    const paint = this.newPage('paint');
    this.paintFor = el('div', 'wall__for');
    const swatches = el('div', 'wall__swatches');
    const paintItems: Item[] = [];
    for (const hex of GARAGE_PAINTS) {
      const b = button('wall__swatch', '');
      b.style.setProperty('--swatch', `#${hex.toString(16).padStart(6, '0')}`);
      b.setAttribute('aria-label', `paint #${hex.toString(16)}`);
      swatches.appendChild(b);
      paintItems.push(this.item('paint', b, () => this.actions.respray(this.sim.garage.car, hex)));
    }
    paint.append(this.paintFor, swatches);
    this.items.set('paint', paintItems);

    // TUNE: three stats, three tiers
    const tune = this.newPage('tune');
    this.tuneFor = el('div', 'wall__for');
    const rows = el('div', 'wall__rows');
    const tuneItems: Item[] = [];
    for (const stat of STATS) {
      const b = button('wall__row', '');
      b.dataset['stat'] = stat;
      b.append(el('span', 'wall__row-name', STAT_WORDS[stat]), el('span', 'wall__dots'), el('span', 'wall__row-price'));
      rows.appendChild(b);
      tuneItems.push(this.item('tune', b, () => this.actions.upgrade(this.sim.garage.car, stat)));
    }
    tune.append(this.tuneFor, rows);
    this.items.set('tune', tuneItems);

    // PREP: the lawyer and the fence, cash or a video, the same size
    const prep = this.newPage('prep');
    const prepRows = el('div', 'wall__rows');
    const prepItems: Item[] = [];
    for (const it of ['lawyer', 'fence'] as const) {
      const row = el('div', 'wall__prep');
      row.dataset['prep'] = it;
      const text = el('div', 'wall__prep-text');
      text.append(el('span', 'wall__row-name', PREP_WORDS[it][0]), el('span', 'wall__prep-what', PREP_WORDS[it][1]));
      const cash = button('wall__btn wall__btn--cash', '');
      cash.append(el('span', 'wall__btn-label'));
      const video = button('wall__btn wall__btn--video', '');
      video.append(videoIcon(), el('span', 'wall__btn-label', 'FREE'));
      row.append(text, cash, video);
      prepRows.appendChild(row);
      prepItems.push(this.item('prep', cash, () => this.actions.buyPrep(it)));
      prepItems.push(this.item('prep', video, () => this.actions.offer(it)));
    }
    prep.appendChild(prepRows);
    this.items.set('prep', prepItems);

    // DAILIES: the day's three and the streak (slice 6 fills it)
    const dailies = this.newPage('dailies');
    this.dailiesBody = el('div', 'wall__dailies');
    dailies.appendChild(this.dailiesBody);
    this.items.set('dailies', []);

    const footer = el('div', 'wall__footer');
    this.hint = el('div', 'wall__hint');
    const bank = el('div', 'wall__bank');
    this.bankValue = el('span', 'wall__bank-value', '0');
    bank.append(el('span', 'wall__bank-label', 'CASH'), this.bankValue);
    this.driveButton = button('wall__drive', 'DRIVE OUT');
    this.driveButton.addEventListener('click', () => { if (!this.offerOpen) this.actions.driveOut(); });
    footer.append(this.hint, bank, this.driveButton);
    parent.appendChild(footer);
    this.show();
  }

  /** The keycaps the hint line names. */
  setKeys(k: { left: string; right: string; confirm: string; back: string }): void {
    this.keys = k;
    this.hintText();
  }

  /** The door shut: the totals page, the offer when there is one. */
  open(opts: { offer: boolean }): void {
    this.isOpen = true;
    this.page = 'wall';
    this.level = 'pages';
    this.focus = 0;
    this.offerOpen = opts.offer;
    this.offerFocus = 1;
    this.garageSerial = -1;
    this.bank = -1;
    this.dailySerial = -1;
    this.update(this.sim);
    this.show();
  }

  close(): void {
    this.isOpen = false;
    this.offerOpen = false;
  }

  get opened(): boolean {
    return this.isOpen;
  }

  /** The current page and whether a page's items have the keys (e2e and screenshots). */
  get where(): { page: WallPage; level: 'pages' | 'items'; focus: number; offer: boolean } {
    return { page: this.page, level: this.level, focus: this.focus, offer: this.offerOpen };
  }

  /** The double offer was answered by a video that finished or failed: gone either way (no second ad for one reward). */
  offerSettled(): void {
    this.offerOpen = false;
    this.show();
  }

  /** Video buttons hide, never disable, when the platform has no rewarded ad (docs/M5_PLAN.md D11). */
  setAdsAvailable(rewarded: boolean): void {
    this.rewarded = rewarded;
    for (const list of this.items.values()) {
      for (const it of list) {
        if (!it.el.classList.contains('wall__btn--video')) continue;
        it.hidden = !rewarded;
        it.el.hidden = !rewarded;
      }
    }
    this.offerDouble.hidden = !rewarded;
    if (!rewarded) this.offerFocus = 1;
    this.show();
  }

  navigate(nav: WallNav): void {
    if (!this.isOpen) return;
    if (this.offerOpen) {
      if (nav.left && this.rewarded) this.offerFocus = 0;
      if (nav.right) this.offerFocus = 1;
      if (nav.confirm) this.answerOffer(this.offerFocus);
      this.show();
      return;
    }
    const i = this.order.indexOf(this.page);
    if (this.level === 'pages') {
      if (nav.left && i > 0) this.goPage(this.order[i - 1] as WallPage, false);
      else if (nav.right && i < this.order.length - 1) this.goPage(this.order[i + 1] as WallPage, false);
      else if (nav.back && this.page !== 'wall') this.goPage('wall', false);
      else if (nav.confirm) {
        if (this.page === 'wall') this.actions.driveOut();
        else if (this.visibleItems().length > 0) this.enterItems();
      }
    } else {
      const list = this.visibleItems();
      if (nav.back) this.level = 'pages';
      else if (nav.left) this.focus = Math.max(0, this.focus - 1);
      else if (nav.right) this.focus = Math.min(list.length - 1, this.focus + 1);
      else if (nav.confirm) list[this.focus]?.act();
    }
    this.show();
  }

  update(sim: SimWorld): void {
    if (!this.isOpen) return;
    const g = sim.garage;
    const funds = sim.run.funds;
    if (g.serial === this.garageSerial && funds === this.bank && sim.dailies.serial === this.dailySerial && sim.run.hot === this.hot) return;
    this.hot = sim.run.hot;
    this.garageSerial = g.serial;
    this.bank = funds;
    this.dailySerial = sim.dailies.serial;
    this.bankValue.textContent = money(funds);
    // CARS
    const cars = this.items.get('cars') ?? [];
    for (let k = 0; k < CAR_IDS.length; k++) {
      const id = CAR_IDS[k] as CarId;
      const b = (cars[k] as Item).el;
      const status = b.querySelector('.wall__card-status') as HTMLElement;
      (b.querySelector('.wall__card-swatch') as HTMLElement).style.background = `#${g.paintOf(id).toString(16).padStart(6, '0')}`;
      const can = g.canBuy(id);
      // the car you drove in: the class's card offers to keep it for a share of its price
      const hot = sim.run.hot === id && !g.owned.has(id);
      b.classList.toggle('is-selected', g.car === id);
      b.classList.toggle('is-owned', g.owned.has(id));
      b.classList.toggle('is-locked', can === 'locked');
      b.classList.toggle('is-hot', hot && can !== 'locked');
      b.classList.toggle('is-short', hot ? funds < g.keepPrice(id) : can === 'cash');
      status.textContent = g.car === id ? 'SELECTED' : g.owned.has(id) ? 'OWNED' : can === 'locked' ? 'ESCAPE HEAT 5 FIRST'
        : hot ? `HOT · KEEP IT ${money(g.keepPrice(id))}` : money(g.price(id));
    }
    // PAINT
    this.paintFor.textContent = `PAINT: ${CAR_WORDS[g.car]} · FREE`;
    const paint = this.items.get('paint') ?? [];
    for (let k = 0; k < GARAGE_PAINTS.length; k++) (paint[k] as Item).el.classList.toggle('is-selected', g.paintOf(g.car) === GARAGE_PAINTS[k]);
    // TUNE
    this.tuneFor.textContent = `TUNING: ${CAR_WORDS[g.car]}`;
    const tune = this.items.get('tune') ?? [];
    for (let k = 0; k < STATS.length; k++) {
      const stat = STATS[k] as Stat;
      const b = (tune[k] as Item).el;
      const tier = g.tiers[g.car][k] as number;
      (b.querySelector('.wall__dots') as HTMLElement).textContent = '●'.repeat(tier) + '○'.repeat(3 - tier);
      const price = g.tierPrice(g.car, stat);
      (b.querySelector('.wall__row-price') as HTMLElement).textContent = Number.isFinite(price) ? money(price) : 'MAX';
      b.classList.toggle('is-short', Number.isFinite(price) && funds < price);
      b.classList.toggle('is-max', !Number.isFinite(price));
    }
    // PREP
    const prep = this.items.get('prep') ?? [];
    let n = 0;
    for (const it of ['lawyer', 'fence'] as const) {
      const cash = (prep[n++] as Item).el, video = (prep[n++] as Item).el;
      const bought = g.prep[it];
      (cash.querySelector('.wall__btn-label') as HTMLElement).textContent = bought ? 'BOUGHT' : money(BALANCE.prep[it]);
      cash.classList.toggle('is-bought', bought);
      cash.classList.toggle('is-short', !bought && funds < BALANCE.prep[it]);
      video.classList.toggle('is-bought', bought);
    }
    this.fillDailies(sim);
    this.show();
  }

  /** The DAILIES page: the day's three with their progress, the streak. */
  private fillDailies(sim: SimWorld): void {
    const d = sim.dailies;
    const rows: HTMLElement[] = [];
    for (let i = 0; i < 3; i++) {
      const text = d.text(i);
      if (!text) continue;
      const row = el('div', d.done[i] ? 'wall__daily is-done' : 'wall__daily');
      row.append(el('span', 'wall__daily-text', text), el('span', 'wall__daily-progress', d.done[i] ? 'DONE' : d.progressText(i)), el('span', 'wall__daily-reward', `+${money(d.reward(i))}`));
      rows.push(row);
    }
    const streak = el('div', 'wall__streak');
    streak.textContent = d.streak.count > 0 ? `STREAK: DAY ${d.streak.count}${d.streak.topper ? ' · TOPPER ON' : ''}` : 'COME BACK TOMORROW FOR A STREAK';
    rows.push(streak);
    // the time trials' medals (M5.5 slice 10): the best one for each, a dash for none yet
    const trials = sim.jobs.defs.filter((j) => j.kind === 'trial');
    if (trials.length > 0) {
      const medals = el('div', 'wall__streak wall__medals');
      medals.textContent = `TIME TRIALS: ${trials.map((j) => MEDAL_WORDS[sim.jobs.medals.get(j.id) ?? 0] || '—').join(' · ')}`;
      rows.push(medals);
    }
    this.dailiesBody.replaceChildren(...rows);
  }

  private newPage(p: WallPage): HTMLElement {
    const page = el('div', `wall__page wall__page--${p}`);
    this.root.appendChild(page);
    this.pages.set(p, page);
    return page;
  }

  private item(p: WallPage, b: HTMLButtonElement, act: () => void): Item {
    const it: Item = { el: b, act, hidden: false };
    b.addEventListener('click', () => {
      if (!this.isOpen || this.offerOpen) return;
      this.page = p;
      this.level = 'items';
      this.focus = Math.max(0, this.visibleItems().indexOf(it));
      act();
      this.show();
    });
    return it;
  }

  private visibleItems(): Item[] {
    return (this.items.get(this.page) ?? []).filter((it) => !it.hidden);
  }

  private goPage(p: WallPage, items: boolean): void {
    if (this.offerOpen || !this.order.includes(p)) return;
    this.page = p;
    this.level = 'pages';
    if (items) this.enterItems();
    this.show();
  }

  /** Into a page's items: the car to buy next, the current paint, the first row. */
  private enterItems(): void {
    this.level = 'items';
    const g = this.sim.garage;
    const list = this.visibleItems();
    this.focus = 0;
    if (this.page === 'cars') {
      let k = CAR_IDS.findIndex((id) => g.canBuy(id) === 'ok');
      if (k < 0) k = CAR_IDS.findIndex((id) => !g.owned.has(id) && g.canBuy(id) !== 'locked');
      if (k < 0) k = CAR_IDS.indexOf(g.car);
      this.focus = Math.max(0, k);
    } else if (this.page === 'paint') {
      this.focus = Math.max(0, GARAGE_PAINTS.indexOf(g.paintOf(g.car)));
    }
    this.focus = Math.min(this.focus, Math.max(0, list.length - 1));
  }

  private carAction(id: CarId): void {
    const g = this.sim.garage;
    if (g.owned.has(id)) this.actions.select(id);
    else if (this.sim.run.hot === id) this.actions.keep(id);
    else this.actions.buy(id);
  }

  private answerOffer(choice: number): void {
    if (!this.offerOpen) return;
    if (choice === 0 && this.rewarded) {
      this.actions.offer('double');
      return;
    }
    // BANK IT: the bag is in the bank already; the offer goes and the wall is the player's
    this.offerOpen = false;
    this.show();
  }

  /** Classes for the current page, level, focus and offer; one pass over a few dozen elements. */
  private show(): void {
    for (const [p, page] of this.pages) page.classList.toggle('is-current', p === this.page);
    for (const [p, tab] of this.tabs) {
      tab.classList.toggle('is-current', p === this.page);
      tab.classList.toggle('is-focus', p === this.page && this.level === 'pages' && !this.offerOpen);
    }
    const list = this.visibleItems();
    for (const items of this.items.values()) for (const it of items) it.el.classList.toggle('is-focus', this.level === 'items' && list[this.focus] === it && !this.offerOpen);
    this.offerRow.classList.toggle('is-open', this.offerOpen);
    this.offerDouble.classList.toggle('is-focus', this.offerOpen && this.offerFocus === 0);
    this.offerBank.classList.toggle('is-focus', this.offerOpen && this.offerFocus === 1);
    this.root.classList.toggle('is-offer', this.offerOpen);
    this.driveButton.classList.toggle('is-focus', !this.offerOpen && this.page === 'wall' && this.level === 'pages');
    this.hintText();
  }

  private hintText(): void {
    const k = this.keys;
    const text = this.offerOpen ? `${k.left} ${k.right} CHOOSE · ${k.confirm} OK`
      : this.level === 'items' ? `${k.left} ${k.right} PICK · ${k.confirm} OK · ${k.back} BACK`
        : this.page === 'wall' ? `${k.right} GARAGE · ${k.confirm} DRIVE OUT`
          : `${k.left} ${k.right} PAGES · ${k.confirm} OPEN · ${k.back} TOTALS`;
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }
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

function button(className: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.tabIndex = -1;
  if (text) b.textContent = text;
  return b;
}

/** The video icon on every rewarded button (docs/CRAZYGAMES.md A6): a play triangle in a rounded frame. */
function videoIcon(): HTMLElement {
  const i = el('span', 'wall__video');
  i.setAttribute('aria-label', 'watch a video');
  return i;
}
