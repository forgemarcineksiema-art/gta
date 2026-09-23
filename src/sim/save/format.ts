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
import type { SimWorld } from '../SimWorld';
import { CAR_IDS, type CarId } from '../vehicle/presets';

export const SAVE_VERSION = 1;

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

export interface SaveV1 {
  v: 1;
  /** The cold open was completed or skipped. */
  seen: boolean;
  bank: number;
  coins: number;
  /** The garage car: what boot and every drive-out put the player in. */
  car: CarId;
  /** Always contains 'muscle'. */
  owned: CarId[];
  /** 0xRRGGBB; absent = the class default (`PLAYER_PAINT`). */
  paint: Partial<Record<CarId, number>>;
  /** Power, grip, boost, each 0..3; absent = all 0. */
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
}

function defaults(): SaveV1 {
  return {
    v: 1,
    seen: false,
    bank: 0,
    coins: 0,
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
  };
}

function deepFreeze<T>(o: T): Readonly<T> {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export const DEFAULT_SAVE: Readonly<SaveV1> = deepFreeze(defaults());

/** A fresh, mutable copy of the defaults. */
export function defaultSave(): SaveV1 {
  return defaults();
}

/** The document as JSON with a fixed key order (records in `CAR_IDS` order), so equal saves are equal strings. */
export function serialize(save: SaveV1): string {
  const paint: Partial<Record<CarId, number>> = {};
  const tiers: Partial<Record<CarId, Tiers>> = {};
  for (const id of CAR_IDS) {
    const p = save.paint[id];
    if (p !== undefined) paint[id] = p;
    const t = save.tiers[id];
    if (t !== undefined) tiers[id] = [t[0], t[1], t[2]];
  }
  const d = save.dailies, s = save.streak;
  return JSON.stringify({
    v: save.v,
    seen: save.seen,
    bank: save.bank,
    coins: save.coins,
    car: save.car,
    owned: CAR_IDS.filter((id) => save.owned.includes(id)),
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
export function parse(text: string | null): SaveV1 {
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
};

/** Walks the table from the document's version to `SAVE_VERSION`, then keeps every valid field. Unknown or newer versions give the defaults. */
export function migrate(raw: unknown): SaveV1 {
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

function sanitize(raw: Record<string, unknown>): SaveV1 {
  const out = defaults();
  out.seen = bool(raw['seen'], false);
  out.bank = amount(raw['bank']);
  out.coins = amount(raw['coins']);
  const owned = Array.isArray(raw['owned']) ? raw['owned'] : [];
  out.owned = CAR_IDS.filter((id) => id === 'muscle' || owned.includes(id));
  const car = raw['car'];
  out.car = isCarId(car) && out.owned.includes(car) ? car : 'muscle';
  const paint = isRecord(raw['paint']) ? raw['paint'] : {};
  const tiers = isRecord(raw['tiers']) ? raw['tiers'] : {};
  for (const id of CAR_IDS) {
    const p = paint[id];
    if (typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 0xffffff) out.paint[id] = p;
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
  return out;
}

/**
 * The world's persistent state into `into` (the store's own document). Reuses
 * `into`'s arrays and records; allocates only a car's tier triple the first
 * time it is upgraded.
 */
export function collect(sim: SimWorld, into: SaveV1): void {
  const run = sim.run, garage = sim.garage, dailies = sim.dailies;
  into.v = 1;
  into.seen = sim.coldOpen.seen;
  into.bank = run.bank;
  into.coins = run.coins;
  into.bestRun = run.bestRun;
  into.runs = run.runs;
  into.playSeconds = run.playSeconds;
  into.car = garage.car;
  into.owned.length = 0;
  for (let i = 0; i < CAR_IDS.length; i++) {
    const id = CAR_IDS[i] as CarId;
    if (garage.owned.has(id)) into.owned.push(id);
    const p = garage.paint.get(id);
    if (p === undefined) delete into.paint[id];
    else into.paint[id] = p;
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
}

/** A document into a freshly built world, once, before the first step: the garage car is driven out at once. */
export function apply(sim: SimWorld, save: SaveV1): void {
  const run = sim.run, garage = sim.garage, dailies = sim.dailies;
  sim.coldOpen.seen = save.seen;
  run.bank = save.bank;
  run.coins = save.coins;
  run.bestRun = save.bestRun;
  run.runs = save.runs;
  run.playSeconds = save.playSeconds;
  garage.owned.clear();
  garage.owned.add('muscle');
  for (const id of save.owned) garage.owned.add(id);
  garage.car = garage.owned.has(save.car) ? save.car : 'muscle';
  garage.paint.clear();
  for (const id of CAR_IDS) {
    const p = save.paint[id];
    if (p !== undefined) garage.paint.set(id, p);
    const t = save.tiers[id], out = garage.tiers[id];
    out[0] = t ? t[0] : 0; out[1] = t ? t[1] : 0; out[2] = t ? t[2] : 0;
  }
  garage.prep.lawyer = save.prep.lawyer;
  garage.prep.fence = save.prep.fence;
  garage.policeUnlocked = save.policeUnlocked;
  garage.serial++;
  garage.applyToVehicle();
  const c = sim.collectibles;
  if (c) {
    decodeBits(save.smashed, c.smashed);
    let n = 0;
    for (let i = 0; i < c.smashed.length; i++) if (c.smashed[i]) n++;
    c.smashedCount = n;
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

function isCarId(v: unknown): v is CarId {
  return typeof v === 'string' && (CAR_IDS as string[]).includes(v);
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
