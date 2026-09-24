/**
 * The driver's kit (M6 slices 6–7, docs/DESIGN.md §14.4): what the player
 * wears into every car they drive, a swap included: a topper on the roof,
 * neon under the sills, a horn, the boost's flame and the tyres' smoke. Some
 * items are sold on the wall's STYLE page, some are won from the wanted
 * board's rivals, the cone from the streak's seventh day. One known item a day
 * is at `pickShare` of its price (the brief's daily crate without the dice:
 * PEGI 12, no gambling). Nothing here touches handling, heat or the police's
 * descriptor. No allocation per step (nothing steps).
 */
import { BALANCE } from '../balance';
import { CITY_COLORS, PALETTE } from '../palette';
import type { SimWorld } from '../SimWorld';
import { bodySpec, type BodyId } from '../traffic/bodies';

export type KitSlot = 'topper' | 'neon' | 'horn' | 'flame' | 'smoke' | CarSlot;
/** The driver's slots: worn into every car. */
export const KIT_SLOTS: readonly KitSlot[] = ['topper', 'neon', 'horn', 'flame', 'smoke'];
/** The car's kit (M6 slice 8): fitted to one car in the garage, bought once and fitted to any. */
export type CarSlot = 'wheels' | 'spoiler' | 'stance';
export const CAR_SLOTS: readonly CarSlot[] = ['wheels', 'spoiler', 'stance'];
/** Where each car slot's option sits in a car's fitting (the save's `[wheels, rim, spoiler, stance]`; the rim unused). */
const FITTING: Record<CarSlot, number> = { wheels: 0, spoiler: 2, stance: 3 };

/** `won`: the rival (a `RIVALS` index) whose win gives it, `STREAK` for the streak's seventh day, -1 for the shop's. */
export const STREAK = -2;

export interface KitItem {
  id: string;
  slot: KitSlot;
  name: string;
  /** Cash on the STYLE page; 0 for an item only won. */
  price: number;
  won: number;
  /** Its colour (a neon's, a flame's, a smoke's; a topper's main one for the page's swatch). */
  colour: number;
  /** A second colour: the tail's half of the twins' two-tone neon. */
  colour2?: number;
}

function sold(id: string, slot: KitSlot, name: string, price: number, colour: number): KitItem {
  return { id, slot, name, price, won: -1, colour };
}

function won(id: string, slot: KitSlot, name: string, rival: number, colour: number): KitItem {
  return { id, slot, name, price: 0, won: rival, colour };
}

/** The catalogue. Appended, never reordered: the save keeps the owned as bits by index and the worn as indices. */
export const KIT: readonly KitItem[] = [
  // toppers (slice 6): the streak's cone, nine for sale, seven won
  won('cone', 'topper', 'TRAFFIC CONE', STREAK, PALETTE.cone),
  sold('duck', 'topper', 'RUBBER DUCK', 2500, PALETTE.coin),
  sold('shark', 'topper', 'SHARK FIN', 3000, PALETTE.slate),
  sold('crown', 'topper', 'CROWN', 6000, PALETTE.carGold),
  sold('signal', 'topper', 'TRAFFIC LIGHT', 4000, PALETTE.carLime),
  sold('donut', 'topper', 'GIANT DONUT', 3500, PALETTE.iceCream),
  sold('dish', 'topper', 'SATELLITE DISH', 2000, PALETTE.lightGrey),
  sold('mattress', 'topper', 'MATTRESS', 1500, PALETTE.carWhite),
  sold('trophy', 'topper', 'TROPHY', 8000, PALETTE.carGold),
  sold('flamingo', 'topper', 'FLAMINGO', 5000, PALETTE.iceCream),
  won('flowerpots', 'topper', 'FLOWER POTS', 0, PALETTE.grass),
  won('pizza', 'topper', 'PIZZA SLICE', 1, PALETTE.coin),
  won('beacon', 'topper', 'AMBER BEACON', 2, PALETTE.cone),
  won('discoBar', 'topper', 'DISCO LIGHT BAR', 4, PALETTE.carMagenta),
  won('flags', 'topper', 'FLAGS', 7, PALETTE.carRed),
  won('propeller', 'topper', 'PROPELLER CAP', 8, PALETTE.carLime),
  won('goldStar', 'topper', 'GOLD STAR', 10, PALETTE.carGold),
  // neon (slice 7): six for sale, the twins' two-tone and Niko's pink won
  sold('neonCyan', 'neon', 'CYAN NEON', 3000, PALETTE.carBlue),
  sold('neonLime', 'neon', 'LIME NEON', 3000, PALETTE.carLime),
  sold('neonRed', 'neon', 'RED NEON', 3000, PALETTE.carRed),
  sold('neonGold', 'neon', 'GOLD NEON', 4000, PALETTE.coin),
  sold('neonWhite', 'neon', 'WHITE NEON', 2500, PALETTE.carWhite),
  sold('neonViolet', 'neon', 'VIOLET NEON', 3500, 0x8b5cf6),
  { ...won('twoTone', 'neon', 'TWO-TONE NEON', 3, CITY_COLORS.mint), colour2: CITY_COLORS.peach },
  won('pinkNeon', 'neon', 'PINK NEON', 6, PALETTE.carMagenta),
  // horns (slice 7): five of our own, Bernie's air horn won
  sold('clown', 'horn', 'CLOWN HORN', 1000, PALETTE.carRed),
  sold('goose', 'horn', 'GOOSE', 1500, PALETTE.carWhite),
  sold('doorbell', 'horn', 'DOORBELL', 1200, PALETTE.coin),
  sold('twoToneHorn', 'horn', 'TWO-TONE', 2000, PALETTE.carBlue),
  sold('kazoo', 'horn', 'KAZOO', 800, PALETTE.carLime),
  won('airHorn', 'horn', 'AIR HORN', 5, PALETTE.steel),
  // the boost's flame (slice 7)
  sold('flameBlue', 'flame', 'BLUE FLAME', 2000, PALETTE.carBlue),
  sold('flameGreen', 'flame', 'GREEN FLAME', 2000, PALETTE.carLime),
  sold('flamePink', 'flame', 'PINK FLAME', 2500, PALETTE.carMagenta),
  sold('flameWhite', 'flame', 'WHITE FLAME', 3000, PALETTE.carWhite),
  sold('flameGold', 'flame', 'GOLD FLAME', 4000, PALETTE.coin),
  // the tyres' smoke (slice 7): five for sale, the Ghost's black won
  sold('smokeRed', 'smoke', 'RED SMOKE', 1500, PALETTE.carRed),
  sold('smokeBlue', 'smoke', 'BLUE SMOKE', 1500, PALETTE.carBlue),
  sold('smokeGreen', 'smoke', 'GREEN SMOKE', 1500, PALETTE.carLime),
  sold('smokePink', 'smoke', 'PINK SMOKE', 2000, PALETTE.iceCream),
  sold('smokeGold', 'smoke', 'GOLD SMOKE', 3000, PALETTE.coin),
  won('ghostSmoke', 'smoke', 'GHOST SMOKE', 9, PALETTE.ink),
  // the car's kit (slice 8): four wheels, three spoilers, two stances, fitted per car
  sold('wheelStar', 'wheels', 'CHROME STARS', 2500, PALETTE.chrome),
  sold('wheelDish', 'wheels', 'DEEP DISH', 3500, PALETTE.ink),
  sold('wheelWire', 'wheels', 'GOLD WIRES', 5000, PALETTE.carGold),
  sold('wheelDisc', 'wheels', 'WHITE DISCS', 2000, PALETTE.carWhite),
  sold('spoilerLip', 'spoiler', 'LIP SPOILER', 1500, PALETTE.charcoal),
  sold('spoilerWing', 'spoiler', 'WING', 3500, PALETTE.charcoal),
  sold('spoilerGiant', 'spoiler', 'GIANT WING', 6000, PALETTE.carRed),
  sold('stanceLow', 'stance', 'SLAMMED', 1200, PALETTE.slate),
  sold('stanceHigh', 'stance', 'LIFTED', 1200, PALETTE.sand),
];

export const KIT_INDEX: Readonly<Record<string, number>> = Object.fromEntries(KIT.map((k, i) => [k.id, i]));

export function isCarSlot(slot: KitSlot): slot is CarSlot {
  return slot === 'wheels' || slot === 'spoiler' || slot === 'stance';
}

/** A car part's option number in its slot (1 for the slot's first item in `KIT`): what a car's fitting stores. */
export function slotOption(i: number): number {
  const k = KIT[i];
  if (!k) return 0;
  let n = 0;
  for (let j = 0; j <= i; j++) if (KIT[j]?.slot === k.slot) n++;
  return n;
}

/** The item for a car slot's option number (the inverse of `slotOption`), -1 for none. */
export function slotItem(slot: CarSlot, opt: number): number {
  let n = 0;
  for (let j = 0; j < KIT.length; j++) if (KIT[j]?.slot === slot && ++n === opt) return j;
  return -1;
}

/** The worn value that means "chosen: nothing" (a slot left bare on purpose); -1 is "never chosen". */
export const BARE = -2;

export class Kit {
  /** Bought, a flag per `KIT` index (the won ones are the board's and the streak's, never stored here). */
  readonly owned = new Uint8Array(KIT.length);
  /** Worn per slot (`KIT_SLOTS` order): a `KIT` index, -1 never chosen, `BARE` taken off. */
  readonly on = new Int16Array(KIT_SLOTS.length).fill(-1);
  /** Bumps on every change (the wall, the car's topper). */
  serial = 0;

  constructor(private readonly sim: SimWorld) {}

  /** Whether the player has item `i`: bought, won from its rival, or the streak's. */
  has(i: number): boolean {
    const k = KIT[i];
    if (!k) return false;
    if (this.owned[i] === 1) return true;
    if (k.won === STREAK) return this.sim.dailies.streak.topper;
    return k.won >= 0 && this.sim.board.isBeaten(k.won);
  }

  /** The item fitted to a car in the garage for a car slot (M6 slice 8), -1 for stock. */
  fitted(body: BodyId, slot: CarSlot): number {
    const opt = this.sim.garage.carKit.get(body)?.[FITTING[slot]] ?? 0;
    return opt > 0 ? slotItem(slot, opt) : -1;
  }

  /**
   * The item worn in a slot, -1 for none. A slot never chosen wears the streak's cone when it is had (the M5
   * topper, worn since the day it was won). A car slot reads the garage car's fitting while the player drives it,
   * and stock in any car taken on the road.
   */
  worn(slot: KitSlot): number {
    if (isCarSlot(slot)) return this.sim.garageDriven ? this.fitted(this.sim.carBody, slot) : -1;
    const s = KIT_SLOTS.indexOf(slot);
    const v = this.on[s] as number;
    if (v >= 0) return this.has(v) ? v : -1;
    if (v === -1 && slot === 'topper' && this.has(0)) return 0;
    return -1;
  }

  /** The day's pick: one item for sale not bought yet, the same all day (the date's own number), -1 when none is left or no date. */
  pick(date: string): number {
    if (!date) return -1;
    let h = 0;
    for (let c = 0; c < date.length; c++) h = (h * 31 + date.charCodeAt(c)) >>> 0;
    const n = KIT.length;
    for (let k = 0; k < n; k++) {
      const i = (h + k * 7) % n;
      const item = KIT[i] as KitItem;
      if (item.price > 0 && !this.has(i)) return i;
    }
    return -1;
  }

  /** What item `i` costs today: the whole, or `pickShare` of it when it is the day's pick. */
  priceOf(i: number): number {
    const k = KIT[i];
    if (!k) return Infinity;
    return i === this.pick(this.sim.dailies.date) ? Math.round(k.price * BALANCE.kit.pickShare) : k.price;
  }

  /** Buys an item for sale: 'owned', 'locked' (won only, or a car part the garage car cannot take), 'cash', or 'ok' (paid, bought, worn or fitted, a 'purchase' event). */
  buy(i: number): 'ok' | 'cash' | 'locked' | 'owned' {
    const k = KIT[i];
    if (!k) return 'locked';
    if (this.has(i)) return 'owned';
    if (k.price <= 0 || !this.fits(i, this.sim.garage.car)) return 'locked';
    const price = this.priceOf(i);
    if (this.sim.run.bank < price) return 'cash';
    this.sim.run.spend(price);
    this.owned[i] = 1;
    if (isCarSlot(k.slot)) this.fit(i, this.sim.garage.car);
    else this.on[KIT_SLOTS.indexOf(k.slot)] = i;
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, -1);
    return 'ok';
  }

  /** Whether a car part goes on a body: the big ones (the vans, the trucks, the buses) take no spoiler. */
  fits(i: number, body: BodyId): boolean {
    const k = KIT[i];
    if (!k) return false;
    return k.slot !== 'spoiler' || !(bodySpec(body).big || bodySpec(body).car === 'heavy');
  }

  /** Fits a car part to a car in the garage, or back to stock when it is the one fitted. */
  fit(i: number, body: BodyId): boolean {
    const k = KIT[i];
    if (!k || !isCarSlot(k.slot) || !this.has(i) || !this.fits(i, body)) return false;
    const opts = this.sim.garage.carKitOf(body);
    const s = FITTING[k.slot];
    const opt = slotOption(i);
    opts[s] = opts[s] === opt ? 0 : opt;
    this.sim.garage.serial++;
    this.serial++;
    return true;
  }

  /** Wears an item had (or takes it off when it is the one worn); a car part fits (or comes off) the garage car. False for one not had. */
  wear(i: number): boolean {
    const k = KIT[i];
    if (!k || !this.has(i)) return false;
    if (isCarSlot(k.slot)) return this.fit(i, this.sim.garage.car);
    const s = KIT_SLOTS.indexOf(k.slot);
    this.on[s] = this.worn(k.slot) === i ? BARE : i;
    this.serial++;
    return true;
  }
}
