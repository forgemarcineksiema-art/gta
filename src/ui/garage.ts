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
import {
  BALANCE, BODY_IDS, BODY_WORDS, CHIEF, DISTRICTS, KIT, MEDAL_WORDS, PALETTE, RIVALS, STATS, STREAK, isShell, posterNumber, reqText,
  type BodyId, type KitSlot, type PrepItem, type RivalDef, type SimWorld, type Stat,
} from '../sim';

export interface GarageActions {
  buy(car: BodyId): void;
  /** Keep the car driven in (DESIGN.md §13.7, any body since M6). */
  keep(car: BodyId): void;
  /** Any owned car as the drive-out: the catalogue's, a kept one, a hidden car found. */
  select(car: BodyId): void;
  respray(car: BodyId, paint: number): void;
  /** A driver's kit item (M6): worn or taken off when had, bought when for sale. */
  kit(item: number): void;
  /** The tiers of the car's class. */
  upgrade(car: BodyId, stat: Stat): void;
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

export type WallPage = 'wall' | 'board' | 'cars' | 'paint' | 'tune' | 'prep' | 'dailies';
const PAGE_TITLES: Record<WallPage, string> = { wall: 'TOTALS', board: 'BOARD', cars: 'CARS', paint: 'STYLE', tune: 'TUNE', prep: 'PREP', dailies: 'DAILIES' };

/** The driver's kit's slots on the STYLE page (M6), in order, and each row's heading. */
export const STYLE_SLOTS: readonly KitSlot[] = ['topper', 'neon', 'horn', 'flame', 'smoke'];
const SLOT_WORDS: Record<KitSlot, string> = { topper: 'ON THE ROOF · GOES INTO EVERY CAR YOU TAKE', neon: 'NEON', horn: 'HORN · H', flame: 'BOOST FLAME', smoke: 'TYRE SMOKE' };

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
  /** The STYLE page's kit cards (M6): the item's index in `KIT` beside each card. */
  private readonly kitCards: Array<{ el: HTMLButtonElement; item: number }> = [];
  private readonly tuneFor: HTMLElement;
  private readonly carsCount: HTMLElement;
  /** The BOARD page (M6): your place, a chip per poster, the next rival's poster. */
  private readonly boardYou: HTMLElement;
  private readonly boardChips: HTMLElement[] = [];
  private readonly boardNext: HTMLElement;
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
  private hot: BodyId | null = null;
  private bank = -1;
  private dailySerial = -1;
  private keys = { left: 'A', right: 'D', confirm: 'W', back: 'S' };

  constructor(parent: HTMLElement, private readonly sim: SimWorld, private readonly actions: GarageActions, pages: readonly WallPage[] = ['wall', 'board', 'cars', 'paint', 'tune', 'prep', 'dailies']) {
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

    // BOARD (M6 slice 1): the wanted board, the player's place on it and the next rival's poster
    const boardPage = this.newPage('board');
    this.boardYou = el('div', 'wall__for');
    const strip = el('div', 'wall__board');
    for (let i = 0; i < RIVALS.length; i++) {
      const chip = el('div', 'wall__chip');
      chip.append(el('span', 'wall__chip-swatch'), el('span', 'wall__chip-num', i === CHIEF ? '★' : `#${posterNumber(i)}`));
      (chip.firstElementChild as HTMLElement).style.background = `#${((RIVALS[i] as RivalDef).paints[0] as number).toString(16).padStart(6, '0')}`;
      strip.appendChild(chip);
      this.boardChips.push(chip);
    }
    this.boardNext = el('div', 'wall__dailies wall__poster');
    boardPage.append(this.boardYou, strip, this.boardNext);
    this.items.set('board', []);

    // CARS (M6 slice 0): the catalogue's five always, then every other car once it is owned or driven in
    const cars = this.newPage('cars');
    this.carsCount = el('div', 'wall__for');
    const grid = el('div', 'wall__cars');
    const carItems: Item[] = [];
    for (const id of BODY_IDS) {
      const b = button(isShell(id) ? 'wall__card' : 'wall__card wall__card--body', '');
      b.dataset['car'] = id;
      b.append(el('span', 'wall__card-swatch'), el('span', 'wall__card-name', BODY_WORDS[id]), el('span', 'wall__card-status'));
      grid.appendChild(b);
      const it = this.item('cars', b, () => this.carAction(id));
      if (!isShell(id)) {
        it.hidden = true;
        b.hidden = true;
      }
      carItems.push(it);
    }
    cars.append(this.carsCount, grid);
    this.items.set('cars', carItems);

    // STYLE (M6 slice 6; PAINT before): the car's paint, then the driver's kit a row a slot
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
    for (const slot of STYLE_SLOTS) {
      const row = el('div', 'wall__cars wall__kit');
      for (let i = 0; i < KIT.length; i++) {
        const k = KIT[i];
        if (!k || k.slot !== slot) continue;
        const b = button('wall__card', '');
        b.dataset['kit'] = k.id;
        const sw = el('span', 'wall__card-swatch');
        sw.style.background = `#${k.colour.toString(16).padStart(6, '0')}`;
        b.append(sw, el('span', 'wall__card-name', k.name), el('span', 'wall__card-status'));
        row.appendChild(b);
        paintItems.push(this.item('paint', b, () => this.actions.kit(i)));
        this.kitCards.push({ el: b, item: i });
      }
      paint.append(el('div', 'wall__for', SLOT_WORDS[slot]), row);
    }
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
    if (g.serial + sim.kit.serial * 4096 === this.garageSerial && funds === this.bank && sim.dailies.serial === this.dailySerial && sim.run.hot === this.hot) return;
    this.hot = sim.run.hot;
    this.garageSerial = g.serial + sim.kit.serial * 4096;
    this.bank = funds;
    this.dailySerial = sim.dailies.serial;
    this.bankValue.textContent = money(funds);
    // CARS: how many of the city's cars are yours, then a card per car
    this.carsCount.textContent = `CARS ${g.owned.size}/${BODY_IDS.length} · DRIVE ANY CAR HOME TO KEEP IT`;
    const cars = this.items.get('cars') ?? [];
    for (let k = 0; k < BODY_IDS.length; k++) {
      const id = BODY_IDS[k] as BodyId;
      const it = cars[k] as Item;
      const b = it.el;
      const owned = g.owned.has(id);
      // the car you drove in: its card offers to keep it for a share of its price
      const hot = sim.run.hot === id && !owned;
      if (!isShell(id)) {
        it.hidden = !owned && !hot;
        b.hidden = it.hidden;
      }
      const status = b.querySelector('.wall__card-status') as HTMLElement;
      const paint = hot ? sim.run.hotPaint : g.paintOf(id);
      (b.querySelector('.wall__card-swatch') as HTMLElement).style.background = `#${paint.toString(16).padStart(6, '0')}`;
      const can = g.canBuy(id);
      const locked = isShell(id) && can === 'locked';
      b.classList.toggle('is-selected', g.car === id);
      b.classList.toggle('is-owned', owned);
      b.classList.toggle('is-locked', locked);
      b.classList.toggle('is-hot', hot && !locked);
      b.classList.toggle('is-short', hot ? funds < g.keepPrice(id) : can === 'cash');
      status.textContent = g.car === id ? 'SELECTED' : owned ? 'OWNED' : locked ? 'ESCAPE HEAT 5 FIRST'
        : hot ? `HOT · KEEP IT ${money(g.keepPrice(id))}` : money(g.price(id));
    }
    // STYLE: the paint, and each kit card: worn, had, today's pick, its price, or who has it
    this.paintFor.textContent = `PAINT: ${BODY_WORDS[g.car]} · FREE`;
    const paint = this.items.get('paint') ?? [];
    for (let k = 0; k < GARAGE_PAINTS.length; k++) (paint[k] as Item).el.classList.toggle('is-selected', g.paintOf(g.car) === GARAGE_PAINTS[k]);
    const kit = sim.kit, pick = kit.pick(sim.dailies.date);
    for (const { el: b, item } of this.kitCards) {
      const k = KIT[item];
      if (!k) continue;
      const has = kit.has(item), worn = kit.worn(k.slot) === item, price = kit.priceOf(item);
      const status = b.querySelector('.wall__card-status') as HTMLElement;
      b.classList.toggle('is-selected', worn);
      b.classList.toggle('is-owned', has);
      b.classList.toggle('is-locked', !has && k.price <= 0);
      b.classList.toggle('is-hot', !has && item === pick);
      b.classList.toggle('is-short', !has && k.price > 0 && funds < price);
      status.textContent = worn ? 'WORN' : has ? 'WEAR IT'
        : k.won === STREAK ? '7-DAY STREAK' : k.won >= 0 ? `BEAT ${RIVALS[k.won]?.name ?? ''}`
          : item === pick ? `TODAY ${money(price)}` : money(price);
    }
    // TUNE: the tiers belong to the car's class, so every car of the class drives with them
    this.tuneFor.textContent = `TUNING: ${BODY_WORDS[g.car]}`;
    const tune = this.items.get('tune') ?? [];
    const tiers = g.tiers[g.classOf(g.car)];
    for (let k = 0; k < STATS.length; k++) {
      const stat = STATS[k] as Stat;
      const b = (tune[k] as Item).el;
      const tier = tiers[k] as number;
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
    this.fillBoard(sim);
    this.show();
  }

  /** The BOARD page: your place, the posters beaten and the next, the next rival's requirements and prize. */
  private fillBoard(sim: SimWorld): void {
    const board = sim.board;
    const next = board.next();
    this.boardYou.textContent = next < 0 ? 'YOU ARE #1 · THE BOARD IS YOURS'
      : board.rank > 10 ? 'YOU ARE NOT ON THE WANTED BOARD YET' : `YOU ARE #${board.rank} ON THE WANTED BOARD`;
    for (let i = 0; i < this.boardChips.length; i++) {
      const chip = this.boardChips[i] as HTMLElement;
      chip.classList.toggle('is-beaten', board.isBeaten(i));
      chip.classList.toggle('is-next', i === next);
    }
    const rows: HTMLElement[] = [];
    if (next < 0) {
      rows.push(el('div', 'wall__streak', 'EVERY RIVAL BEATEN · A REMATCH PAYS A QUARTER'));
    } else {
      const r = RIVALS[next] as RivalDef;
      const n = posterNumber(next);
      const where = r.turf === 'highway' ? 'THE HIGHWAY' : DISTRICTS.find((d) => d.id === r.turf)?.name ?? '';
      const head = el('div', 'wall__daily');
      head.append(el('span', 'wall__daily-text', n > 0 ? `NEXT: #${n} ${r.name}` : `LAST: ${r.name}`), el('span', 'wall__daily-progress', where),
        el('span', 'wall__daily-reward', `${money(r.purse)} + THE ${BODY_WORDS[r.body]}`));
      rows.push(head, el('div', 'wall__streak wall__medals', r.line));
      for (const q of r.reqs) {
        const have = board.have(q);
        const done = have >= q.count;
        const row = el('div', done ? 'wall__daily is-done' : 'wall__daily');
        row.append(el('span', 'wall__daily-text', reqText(q)), el('span', 'wall__daily-progress', done ? 'DONE'
          : q.kind === 'bestRun' ? `BEST ${money(have)}` : `${money(Math.min(have, q.count))}/${money(q.count)}`), el('span', 'wall__daily-reward', ''));
        rows.push(row);
      }
      rows.push(el('div', 'wall__streak', board.ready(next) ? 'READY · THE CYAN RING IS ON THE MAP' : 'DO BOTH AND THE RING APPEARS'));
    }
    this.boardNext.replaceChildren(...rows);
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
    // the hunts (M5.5 slice 14): how many of each set
    if (sim.jumps || sim.collectibles) {
      const hunts = el('div', 'wall__streak wall__medals');
      const parts: string[] = [];
      if (sim.jumps) parts.push(`JUMPS ${sim.jumps.foundCount}/${sim.jumps.descs.length}`);
      if (sim.collectibles) parts.push(`BILLBOARDS ${sim.collectibles.smashedCount}/${sim.collectibles.total}`);
      hunts.textContent = `HUNTS: ${parts.join(' · ')}`;
      rows.push(hunts);
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
      // the car just driven in, else the next to buy, else the one selected
      const ids = list.map((it) => it.el.dataset['car'] as BodyId);
      const hot = this.sim.run.hot;
      let k = hot !== null && !g.owned.has(hot) ? ids.indexOf(hot) : -1;
      if (k < 0) k = ids.findIndex((id) => g.canBuy(id) === 'ok');
      if (k < 0) k = ids.findIndex((id) => isShell(id) && !g.owned.has(id) && g.canBuy(id) !== 'locked');
      if (k < 0) k = ids.indexOf(g.car);
      this.focus = Math.max(0, k);
    } else if (this.page === 'paint') {
      this.focus = Math.max(0, GARAGE_PAINTS.indexOf(g.paintOf(g.car)));
    }
    this.focus = Math.min(this.focus, Math.max(0, list.length - 1));
  }

  private carAction(id: BodyId): void {
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
    // the cars' row and the kit's rows scroll: the focused card is brought into view
    const focused = this.level === 'items' && (this.page === 'cars' || this.page === 'paint') ? list[this.focus]?.el : undefined;
    if (focused && typeof focused.scrollIntoView === 'function') focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
