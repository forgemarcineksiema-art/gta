/**
 * The save (docs/M5_PLAN.md D1, D2): one versioned JSON document under one
 * key. This module is the format only: the type, the defaults, a stable
 * serializer, a parser that never throws, the migrations table, and
 * `collect` / `apply` between a document and a world. No storage, no clock,
 * no DOM: the IO is `app/save.ts`.
 *
 * Unknown input degrades to the defaults field by field, so a hand-edited or
 * truncated save loses only what is broken. A version above `SAVE_VERSION`
 * parses to the defaults here; the store keeps the raw text and never writes
 * over it (an older build must not destroy a newer save).
 */
import { CHIEF, RIVALS } from '../board/rivals';
import { HIDDEN_CARS } from '../city/stash';
import type { SimWorld } from '../SimWorld';
import { BODY_IDS, type BodyId } from '../traffic/bodies';
import { CAR_IDS, type CarId } from '../vehicle/presets';
import { DEFAULT_SETTINGS, QUALITY_SETTINGS, type Settings } from '../settings';

export const SAVE_VERSION = 6;

export type Tiers = [number, number, number];

export interface SaveDailies {
  /** The local date the three were drawn for, `YYYY-MM-DD`; '' before the first. */
  date: string;
  ids: [number, number, number];
  progress: [number, number, number];
  done: [boolean, boolean, boolean];
}

export interface SaveStreak {
  count: number;
  /** The last local date the streak counted, `YYYY-MM-DD`; '' never. */
  last: string;
  topper: boolean;
}

export interface SaveCaches {
  /** The local date the day's thirty were drawn for, `YYYY-MM-DD`; '' before the first. */
  date: string;
  /** Found today, as bits, base64; '' when none. */
  found: string;
}

/** A car's own kit (M6 slice 8): the wheels, the rims' colour, the spoiler, the stance; 0 is stock. */
export type SaveCarKit = [number, number, number, number];

export interface SaveKit {
  /** The driver's kit owned (M6 slices 6–7): a bit per item of the kit's catalogue, base64; '' for none. */
  owned: string;
  /** Worn per slot (topper, neon, horn, flame, smoke): the item's index in the catalogue, -1 for none. */
  on: [number, number, number, number, number];
}

/** Lifetime counts the wanted board's requirements read (M6 slice 1, DESIGN.md §14.2). */
export interface SaveCareer {
  races: number;
  zones: number;
  fares: number;
  hotFares: number;
  orders: number;
  takedowns: number;
  caches: number;
  /** Escapes by the level escaped from, 1..5. */
  escapes: [number, number, number, number, number];
  /** The street furniture the player smashed, lifetime (M8 slice 9). */
  smashed: number;
}

export interface SaveDoc {
  v: 6;
  /** The cold open was shown (started, completed or skipped): never again for this profile. */
  seen: boolean;
  /** Everything the player owns in money: the road coins are in it since v6 (M8.5 D1). */
  bank: number;
  /** The garage car: what boot and every drive-out put the player in (M6: a body, any owned car). */
  car: BodyId;
  /** Always contains 'muscle'. The catalogue's, the kept, the found and the won, in `BODY_IDS` order. */
  owned: BodyId[];
  /** 0xRRGGBB; absent = the car's own (`Garage.paintOf`). */
  paint: Partial<Record<BodyId, number>>;
  /** Power, grip, boost, each 0..3, per class; absent = all 0. */
  tiers: Partial<Record<CarId, Tiers>>;
  /** Bought for the next run, consumed at its end. */
  prep: { lawyer: boolean; fence: boolean };
  /** One escape from heat 5. */
  policeUnlocked: boolean;
  /** Most banked in one run. */
  bestRun: number;
  /** `Collectibles.smashed` as bits, base64; '' when none. */
  smashed: string;
  dailies: SaveDailies;
  streak: SaveStreak;
  /** Runs ended, and seconds driven: KPI rehearsal and the balance script. */
  runs: number;
  playSeconds: number;
  /** The day's caches (M5.5 slice 1). */
  caches: SaveCaches;
  /** The first quarter hour's chain (M5.5 slice 2): the six steps as bits, ticked in any order; the BORROW hint's appearances. */
  chain: number;
  borrowHints: number;
  /** The time trials' best medals (M5.5 slice 10), a digit 0..3 per trial in the defs' order; '' for none. */
  medals: string;
  /** The hunt's ramps found (M5.5 slice 14): `Jumps.found` as bits, base64; '' when none. */
  jumps: string;
  /** Per car (M6 slice 8); absent = stock. */
  carKit: Partial<Record<BodyId, SaveCarKit>>;
  /** The driver's kit (M6 slices 6–7). */
  kit: SaveKit;
  /** The wanted board (M6 slice 1): the rivals beaten as bits (bit 10 the Chief). */
  board: { beaten: number };
  career: SaveCareer;
  /** The pause screen's settings (M7 slice 3): the volumes, the quality, the radar. */
  settings: Settings;
}

/** The current document's type under the name the app and the tests used since M5. */
export type SaveV1 = SaveDoc;

function defaults(): SaveDoc {
  return {
    v: 6,
    seen: false,
    bank: 0,
    car: 'muscle',
    owned: ['muscle'],
    paint: {},
    tiers: {},
    prep: { lawyer: false, fence: false },
    policeUnlocked: false,
    bestRun: 0,
    smashed: '',
    dailies: { date: '', ids: [-1, -1, -1], progress: [0, 0, 0], done: [false, false, false] },
    streak: { count: 0, last: '', topper: false },
    runs: 0,
    playSeconds: 0,
    caches: { date: '', found: '' },
    chain: 0,
    borrowHints: 0,
    medals: '',
    jumps: '',
    carKit: {},
    kit: { owned: '', on: [-1, -1, -1, -1, -1] },
    board: { beaten: 0 },
    career: { races: 0, zones: 0, fares: 0, hotFares: 0, orders: 0, takedowns: 0, caches: 0, escapes: [0, 0, 0, 0, 0], smashed: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
}

function deepFreeze<T>(o: T): Readonly<T> {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export const DEFAULT_SAVE: Readonly<SaveDoc> = deepFreeze(defaults());

/** A fresh, mutable copy of the defaults. */
export function defaultSave(): SaveDoc {
  return defaults();
}

/** The document as JSON with a fixed key order (records in `BODY_IDS` / `CAR_IDS` order), so equal saves are equal strings. */
export function serialize(save: SaveDoc): string {
  const paint: Partial<Record<BodyId, number>> = {};
  const carKit: Partial<Record<BodyId, SaveCarKit>> = {};
  for (const id of BODY_IDS) {
    const p = save.paint[id];
    if (p !== undefined) paint[id] = p;
    const k = save.carKit[id];
    if (k !== undefined) carKit[id] = [k[0], k[1], k[2], k[3]];
  }
  const tiers: Partial<Record<CarId, Tiers>> = {};
  for (const id of CAR_IDS) {
    const t = save.tiers[id];
    if (t !== undefined) tiers[id] = [t[0], t[1], t[2]];
  }
  const d = save.dailies, s = save.streak, k = save.kit, c = save.career;
  return JSON.stringify({
    v: save.v,
    seen: save.seen,
    bank: save.bank,
    car: save.car,
    owned: BODY_IDS.filter((id) => save.owned.includes(id)),
    paint,
    tiers,
    prep: { lawyer: save.prep.lawyer, fence: save.prep.fence },
    policeUnlocked: save.policeUnlocked,
    bestRun: save.bestRun,
    smashed: save.smashed,
    dailies: { date: d.date, ids: [d.ids[0], d.ids[1], d.ids[2]], progress: [d.progress[0], d.progress[1], d.progress[2]], done: [d.done[0], d.done[1], d.done[2]] },
    streak: { count: s.count, last: s.last, topper: s.topper },
    runs: save.runs,
    playSeconds: save.playSeconds,
    caches: { date: save.caches.date, found: save.caches.found },
    chain: save.chain,
    borrowHints: save.borrowHints,
    medals: save.medals,
    jumps: save.jumps,
    carKit,
    kit: { owned: k.owned, on: [k.on[0], k.on[1], k.on[2], k.on[3], k.on[4]] },
    board: { beaten: save.board.beaten },
    career: {
      races: c.races, zones: c.zones, fares: c.fares, hotFares: c.hotFares, orders: c.orders, takedowns: c.takedowns, caches: c.caches,
      escapes: [c.escapes[0], c.escapes[1], c.escapes[2], c.escapes[3], c.escapes[4]], smashed: c.smashed,
    },
    settings: { music: save.settings.music, effects: save.settings.effects, quality: save.settings.quality, radarNorth: save.settings.radarNorth },
  });
}

/** The version a stored text declares: 0 for an object without one, null when it is not a save at all. */
export function versionOf(text: string | null): number | null {
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  return typeof raw['v'] === 'number' ? raw['v'] : 0;
}

/** Never throws: null, garbage, a non-object or a newer version give the defaults; anything else migrates. */
export function parse(text: string | null): SaveDoc {
  if (text === null) return defaults();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaults();
  }
  if (!isRecord(raw)) return defaults();
  return migrate(raw);
}

/** Version n → n + 1. Version 0 is "no save": an object without `v` (a hand-made or pre-release document). */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  0: (raw) => ({ ...raw, v: 1 }),
  // M5.5: the day's caches, the chain and the BORROW hint counter; an M5 save starts them empty
  1: (raw) => ({ ...raw, v: 2, caches: { date: '', found: '' }, chain: 0, borrowHints: 0 }),
  // M6: the garage keeps bodies; the hidden cars found join the owned, the one driven out becomes the car
  2: (raw) => {
    const hidden = typeof raw['hidden'] === 'string' ? raw['hidden'].split(',').filter((id) => id !== '') : [];
    const owned: unknown[] = Array.isArray(raw['owned']) ? [...(raw['owned'] as unknown[]), ...hidden] : hidden;
    const drive = raw['drive'];
    const car = typeof drive === 'string' && drive !== '' && hidden.includes(drive) ? drive : raw['car'];
    const out: Record<string, unknown> = { ...raw, v: 3, owned, car };
    delete out['hidden'];
    delete out['drive'];
    return out;
  },
  // M7: the settings; an M6 save starts on the defaults
  3: (raw) => ({ ...raw, v: 4, settings: { ...DEFAULT_SETTINGS } }),
  // M8: the career's smashed things; an M7 save starts at none (the sanitizer's 0)
  4: (raw) => ({ ...raw, v: 5 }),
  // M8.5: one purse; the road coins' pool folds into the bank (a broken field adds nothing)
  5: (raw) => {
    const out: Record<string, unknown> = { ...raw, v: 6, bank: amount(raw['bank']) + amount(raw['coins']) };
    delete out['coins'];
    return out;
  },
};

/** Walks the table from the document's version to `SAVE_VERSION`, then keeps every valid field. Unknown or newer versions give the defaults. */
export function migrate(raw: unknown): SaveDoc {
  if (!isRecord(raw)) return defaults();
  let doc = raw;
  let v = typeof doc['v'] === 'number' ? doc['v'] : 0;
  if (!Number.isInteger(v) || v < 0 || v > SAVE_VERSION) return defaults();
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return defaults();
    doc = step(doc);
    v++;
  }
  return sanitize(doc);
}

function sanitize(raw: Record<string, unknown>): SaveDoc {
  const out = defaults();
  out.seen = bool(raw['seen'], false);
  out.bank = amount(raw['bank']);
  const owned = Array.isArray(raw['owned']) ? raw['owned'] : [];
  out.owned = BODY_IDS.filter((id) => id === 'muscle' || owned.includes(id));
  const car = raw['car'];
  out.car = isBodyId(car) && out.owned.includes(car) ? car : 'muscle';
  const paint = isRecord(raw['paint']) ? raw['paint'] : {};
  const carKit = isRecord(raw['carKit']) ? raw['carKit'] : {};
  for (const id of BODY_IDS) {
    const p = paint[id];
    if (typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 0xffffff) out.paint[id] = p;
    const k = carKit[id];
    if (Array.isArray(k) && k.length === 4) out.carKit[id] = [small(k[0]), small(k[1]), small(k[2]), small(k[3])];
  }
  const tiers = isRecord(raw['tiers']) ? raw['tiers'] : {};
  for (const id of CAR_IDS) {
    const t = tiers[id];
    if (Array.isArray(t) && t.length === 3) out.tiers[id] = [tier(t[0]), tier(t[1]), tier(t[2])];
  }
  const prep = isRecord(raw['prep']) ? raw['prep'] : {};
  out.prep = { lawyer: bool(prep['lawyer'], false), fence: bool(prep['fence'], false) };
  out.policeUnlocked = bool(raw['policeUnlocked'], false);
  out.bestRun = amount(raw['bestRun']);
  const smashed = raw['smashed'];
  out.smashed = typeof smashed === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(smashed) && smashed.length <= 64 ? smashed : '';
  const d = isRecord(raw['dailies']) ? raw['dailies'] : {};
  const date = dateString(d['date']);
  const ids = triple(d['ids'], (x) => (typeof x === 'number' && Number.isInteger(x) && x >= -1 ? x : -1), -1);
  const progress = triple(d['progress'], (x) => amount(x), 0);
  const done = triple(d['done'], (x) => bool(x, false), false);
  out.dailies = { date, ids, progress, done };
  const s = isRecord(raw['streak']) ? raw['streak'] : {};
  out.streak = { count: Math.floor(amount(s['count'])), last: dateString(s['last']), topper: bool(s['topper'], false) };
  out.runs = Math.floor(amount(raw['runs']));
  out.playSeconds = amount(raw['playSeconds']);
  const c = isRecord(raw['caches']) ? raw['caches'] : {};
  const found = c['found'];
  out.caches = { date: dateString(c['date']), found: typeof found === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(found) && found.length <= 12 ? found : '' };
  const chain = raw['chain'];
  out.chain = typeof chain === 'number' && Number.isInteger(chain) && chain >= 0 && chain <= 63 ? chain : 0;
  const hints = raw['borrowHints'];
  out.borrowHints = typeof hints === 'number' && Number.isInteger(hints) && hints >= 0 && hints <= 9 ? hints : 0;
  // added within v2: a document without it has no medals
  const medals = raw['medals'];
  out.medals = typeof medals === 'string' && /^[0-3]{0,16}$/.test(medals) ? medals : '';
  // added within v2: a document without it has found no ramps
  const jumps = raw['jumps'];
  out.jumps = typeof jumps === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(jumps) && jumps.length <= 8 ? jumps : '';
  const kit = isRecord(raw['kit']) ? raw['kit'] : {};
  const kitOwned = kit['owned'];
  const on = Array.isArray(kit['on']) ? kit['on'] : [];
  // a kit index, -1 never chosen, -2 taken off on purpose (`BARE`)
  const slot = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x >= -2 && x <= 255 ? x : -1);
  out.kit = {
    owned: typeof kitOwned === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(kitOwned) && kitOwned.length <= 32 ? kitOwned : '',
    on: [slot(on[0]), slot(on[1]), slot(on[2]), slot(on[3]), slot(on[4])],
  };
  const board = isRecord(raw['board']) ? raw['board'] : {};
  const beaten = board['beaten'];
  out.board = { beaten: typeof beaten === 'number' && Number.isInteger(beaten) && beaten >= 0 && beaten < 1 << 11 ? beaten : 0 };
  const cr = isRecord(raw['career']) ? raw['career'] : {};
  const count = (x: unknown): number => Math.floor(amount(x));
  const esc = Array.isArray(cr['escapes']) ? cr['escapes'] : [];
  out.career = {
    races: count(cr['races']), zones: count(cr['zones']), fares: count(cr['fares']), hotFares: count(cr['hotFares']),
    orders: count(cr['orders']), takedowns: count(cr['takedowns']), caches: count(cr['caches']),
    escapes: [count(esc[0]), count(esc[1]), count(esc[2]), count(esc[3]), count(esc[4])],
    smashed: count(cr['smashed']),
  };
  const st = isRecord(raw['settings']) ? raw['settings'] : {};
  const step = (x: unknown, d: number): number => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 10 ? x : d);
  const quality = st['quality'];
  out.settings = {
    music: step(st['music'], DEFAULT_SETTINGS.music),
    effects: step(st['effects'], DEFAULT_SETTINGS.effects),
    quality: QUALITY_SETTINGS.find((q) => q === quality) ?? DEFAULT_SETTINGS.quality,
    radarNorth: bool(st['radarNorth'], DEFAULT_SETTINGS.radarNorth),
  };
  return out;
}

/**
 * The world's persistent state into `into` (the store's own document). Reuses
 * `into`'s arrays and records; allocates only a car's tier triple the first
 * time it is upgraded.
 */
export function collect(sim: SimWorld, into: SaveDoc): void {
  const run = sim.run, garage = sim.garage, dailies = sim.dailies;
  into.v = 6;
  // shown once per profile: a cold open that has started counts, so a reload mid-way never repeats it
  into.seen = sim.coldOpen.seen || sim.coldOpen.active;
  into.bank = run.bank;
  into.bestRun = run.bestRun;
  into.runs = run.runs;
  into.playSeconds = run.playSeconds;
  into.car = garage.car;
  into.owned.length = 0;
  for (let i = 0; i < BODY_IDS.length; i++) {
    const id = BODY_IDS[i] as BodyId;
    if (garage.owned.has(id)) into.owned.push(id);
    const p = garage.paint.get(id);
    if (p === undefined) delete into.paint[id];
    else into.paint[id] = p;
  }
  for (let i = 0; i < CAR_IDS.length; i++) {
    const id = CAR_IDS[i] as CarId;
    const t = garage.tiers[id];
    if (t[0] === 0 && t[1] === 0 && t[2] === 0) {
      delete into.tiers[id];
    } else {
      const out = into.tiers[id] ?? (into.tiers[id] = [0, 0, 0]);
      out[0] = t[0]; out[1] = t[1]; out[2] = t[2];
    }
  }
  into.prep.lawyer = garage.prep.lawyer;
  into.prep.fence = garage.prep.fence;
  into.policeUnlocked = garage.policeUnlocked;
  if (sim.collectibles) into.smashed = encodeBits(sim.collectibles.smashed);
  const d = into.dailies;
  d.date = dailies.date;
  for (let i = 0; i < 3; i++) {
    d.ids[i] = dailies.ids[i] as number;
    d.progress[i] = dailies.progress[i] as number;
    d.done[i] = dailies.done[i] as boolean;
  }
  into.streak.count = dailies.streak.count;
  into.streak.last = dailies.streak.last;
  into.streak.topper = dailies.streak.topper;
  if (sim.caches) {
    into.caches.date = sim.caches.date;
    into.caches.found = sim.caches.count > 0 ? encodeBits(sim.caches.found) : '';
  }
  into.chain = run.chain;
  into.borrowHints = run.borrowHints;
  let medals = '';
  for (const d of sim.jobs.defs) if (d.kind === 'trial') medals += String(sim.jobs.medals.get(d.id) ?? 0);
  into.medals = medals.replace(/0+$/, '');
  if (sim.jumps) into.jumps = encodeBits(sim.jumps.found);
  into.board.beaten = sim.board.beaten;
  // the car's kits (M6 slice 8): the cars with anything fitted
  for (let i = 0; i < BODY_IDS.length; i++) {
    const id = BODY_IDS[i] as BodyId;
    const k = garage.carKit.get(id);
    if (!k || (k[0] === 0 && k[1] === 0 && k[2] === 0 && k[3] === 0)) delete into.carKit[id];
    else into.carKit[id] = [k[0], k[1], k[2], k[3]];
  }
  // the driver's kit: bought as bits, worn per slot
  into.kit.owned = encodeBits(sim.kit.owned);
  for (let i = 0; i < 5; i++) into.kit.on[i] = sim.kit.on[i] as number;
  const c = sim.career, out = into.career;
  out.races = c.races; out.zones = c.zones; out.fares = c.fares; out.hotFares = c.hotFares;
  out.orders = c.orders; out.takedowns = c.takedowns; out.caches = c.caches;
  for (let i = 0; i < 5; i++) out.escapes[i] = c.escapes[i] as number;
  out.smashed = c.smashed;
  const st = sim.settings, so = into.settings;
  so.music = st.music; so.effects = st.effects; so.quality = st.quality; so.radarNorth = st.radarNorth;
}

/** A document into a freshly built world, once, before the first step: the garage car is driven out at once. */
export function apply(sim: SimWorld, save: SaveDoc): void {
  const run = sim.run, garage = sim.garage, dailies = sim.dailies;
  sim.coldOpen.seen = save.seen;
  run.bank = save.bank;
  run.bestRun = save.bestRun;
  run.runs = save.runs;
  run.playSeconds = save.playSeconds;
  run.chain = save.chain;
  run.borrowHints = save.borrowHints;
  let k = 0;
  for (const d of sim.jobs.defs) {
    if (d.kind !== 'trial') continue;
    const m = Number(save.medals[k++] ?? '0');
    if (m > 0) sim.jobs.medals.set(d.id, m);
  }
  garage.owned.clear();
  garage.owned.add('muscle');
  for (const id of save.owned) garage.owned.add(id);
  garage.car = garage.owned.has(save.car) ? save.car : 'muscle';
  garage.paint.clear();
  for (const id of BODY_IDS) {
    const p = save.paint[id];
    if (p !== undefined) garage.paint.set(id, p);
  }
  for (const id of CAR_IDS) {
    const t = save.tiers[id], out = garage.tiers[id];
    out[0] = t ? t[0] : 0; out[1] = t ? t[1] : 0; out[2] = t ? t[2] : 0;
  }
  garage.prep.lawyer = save.prep.lawyer;
  garage.prep.fence = save.prep.fence;
  garage.policeUnlocked = save.policeUnlocked;
  // a hidden car owned is one found: its stash stays empty
  sim.stash.found.clear();
  for (const id of HIDDEN_CARS) if (garage.owned.has(id)) sim.stash.found.add(id);
  // the car's kits (M6 slice 8)
  garage.carKit.clear();
  for (const id of BODY_IDS) {
    const k = save.carKit[id];
    if (k) garage.carKit.set(id, [k[0], k[1], k[2], k[3]]);
  }
  // the driver's kit (M6 slice 6)
  decodeBits(save.kit.owned, sim.kit.owned);
  for (let i = 0; i < 5; i++) sim.kit.on[i] = save.kit.on[i] as number;
  sim.kit.serial++;
  // the wanted board: the rivals beaten own their cars (their bodies may be newer than the save)
  sim.board.beaten = save.board.beaten;
  for (let i = 0; i <= CHIEF && i < RIVALS.length; i++) if (sim.board.isBeaten(i)) sim.board.ownCar(i);
  const cr = save.career, career = sim.career;
  career.races = cr.races; career.zones = cr.zones; career.fares = cr.fares; career.hotFares = cr.hotFares;
  career.orders = cr.orders; career.takedowns = cr.takedowns; career.caches = cr.caches;
  for (let i = 0; i < 5; i++) career.escapes[i] = cr.escapes[i] as number;
  career.smashed = cr.smashed;
  Object.assign(sim.settings, save.settings);
  garage.serial++;
  garage.applyToVehicle();
  const c = sim.collectibles;
  if (c) {
    decodeBits(save.smashed, c.smashed);
    let n = 0;
    for (let i = 0; i < c.smashed.length; i++) if (c.smashed[i]) n++;
    c.smashedCount = n;
  }
  const j = sim.jumps;
  if (j) {
    decodeBits(save.jumps, j.found);
    let n = 0;
    for (let i = 0; i < j.found.length; i++) if (j.found[i]) n++;
    j.foundCount = n;
  }
  const d = save.dailies;
  dailies.date = d.date;
  for (let i = 0; i < 3; i++) {
    dailies.ids[i] = d.ids[i] as number;
    dailies.progress[i] = d.progress[i] as number;
    dailies.done[i] = d.done[i] as boolean;
  }
  dailies.streak.count = save.streak.count;
  dailies.streak.last = save.streak.last;
  dailies.streak.topper = save.streak.topper;
  if (sim.caches) {
    const found = new Uint8Array(sim.caches.total);
    decodeBits(save.caches.found, found);
    sim.caches.restore(save.caches.date, found);
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One bit per flag, eight flags a byte, base64 with padding; '' when every flag is clear. */
export function encodeBits(flags: Uint8Array): string {
  let any = false;
  for (let i = 0; i < flags.length; i++) if (flags[i]) { any = true; break; }
  if (!any) return '';
  const bytes = new Uint8Array(Math.ceil(flags.length / 8));
  for (let i = 0; i < flags.length; i++) if (flags[i]) bytes[i >> 3] = (bytes[i >> 3] as number) | (1 << (i & 7));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] as string;
    out += B64[(n >> 12) & 63] as string;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] as string : '=';
    out += i + 2 < bytes.length ? B64[n & 63] as string : '=';
  }
  return out;
}

/** The inverse of `encodeBits` into `flags` (cleared first); bits past its length are ignored. */
export function decodeBits(text: string, flags: Uint8Array): void {
  flags.fill(0);
  let bit = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n = (B64.indexOf(text[i] ?? 'A') << 18) | (B64.indexOf(text[i + 1] ?? 'A') << 12)
      | (Math.max(0, B64.indexOf(text[i + 2] ?? 'A')) << 6) | Math.max(0, B64.indexOf(text[i + 3] ?? 'A'));
    const bytes = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const valid = text[i + 2] === '=' ? 1 : text[i + 3] === '=' ? 2 : 3;
    for (let k = 0; k < valid; k++) {
      const byte = bytes[k] as number;
      for (let j = 0; j < 8; j++, bit++) if (bit < flags.length && (byte >> j) & 1) flags[bit] = 1;
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isBodyId(v: unknown): v is BodyId {
  return typeof v === 'string' && (BODY_IDS as readonly string[]).includes(v);
}

/** A small kit index, 0..15. */
function small(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) ? Math.max(0, Math.min(15, v)) : 0;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** A finite, non-negative number to the cent. */
function amount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;
}

function tier(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) ? Math.max(0, Math.min(3, v)) : 0;
}

function dateString(v: unknown): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function triple<T>(v: unknown, map: (x: unknown) => T, fallback: T): [T, T, T] {
  const a = Array.isArray(v) ? v : [];
  return [a.length > 0 ? map(a[0]) : fallback, a.length > 1 ? map(a[1]) : fallback, a.length > 2 ? map(a[2]) : fallback];
}
