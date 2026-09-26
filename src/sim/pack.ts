/**
 * Plain data to bytes and back (M8.10: the island's bake): objects, arrays, `Map`s, `Set`s, typed arrays, strings,
 * booleans, null, undefined and every number (NaN, ±Infinity and −0 among them). An object or array met twice is
 * written once and met again as the same object, so shared parts stay shared and a cycle closes. A long array of
 * numbers and a typed array go into a block of bytes (a double keeps its every bit); the rest is JSON. Anything else (a
 * class instance, a function) throws: what is packed is data.
 *
 * The bytes: the JSON's length (4 bytes), the JSON, then each block 8-aligned after its length.
 */

// (the sim reads no DOM and no Node: these two are both's, the text's UTF-8)
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare const TextDecoder: new () => { decode(bytes: Uint8Array): string };

type Typed = Float32Array | Float64Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | Uint8ClampedArray;
const TYPED: Record<string, new (buffer: ArrayBuffer) => Typed> = {
  Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
};
/**
 * An array of numbers (or of booleans, or of rows of numbers all as long) this long or longer goes into a block; an
 * array of objects all of the same keys this long or longer goes a column a key.
 */
const BLOCK_MIN = 16;
const COLUMNS_MIN = 8;

function typedName(v: object): string | null {
  if (!ArrayBuffer.isView(v) || v instanceof DataView) return null;
  const name = (v as Typed).constructor.name;
  return name in TYPED ? name : null;
}

function allNumbers(a: readonly unknown[]): boolean {
  for (let i = 0; i < a.length; i++) if (typeof a[i] !== 'number') return false;
  return true;
}

/** Pack a value into bytes. */
export function pack(root: unknown): Uint8Array {
  // the objects met more than once get an id where first written
  const seen = new Map<object, number>();
  const count = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    const n = seen.get(v);
    seen.set(v, (n ?? 0) + 1);
    if (n !== undefined || typedName(v) !== null) return;
    if (Array.isArray(v)) { if (v.length < BLOCK_MIN || !allNumbers(v)) for (const x of v) count(x); return; }
    if (v instanceof Map) { for (const [k, x] of v) { count(k); count(x); } return; }
    if (v instanceof Set) { for (const x of v) count(x); return; }
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`pack: not plain data (${(proto as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'})`);
    for (const k of Object.keys(v)) count((v as Record<string, unknown>)[k]);
  };
  count(root);
  const alone = (x: unknown): boolean => (seen.get(x as object) ?? 0) <= 1;
  /** Rows (arrays met once) of numbers all as long: their length, else 0. */
  const grid = (v: readonly unknown[]): number => {
    if (v.length < BLOCK_MIN || !Array.isArray(v[0])) return 0;
    const L = (v[0] as unknown[]).length;
    if (L === 0) return 0;
    for (const row of v) if (!Array.isArray(row) || row.length !== L || !alone(row) || !allNumbers(row)) return 0;
    return L;
  };
  /** Objects (plain, met once, no value undefined) all of the same keys in the same order: their keys, else null. */
  const columns = (v: readonly unknown[]): string[] | null => {
    if (v.length < COLUMNS_MIN) return null;
    const first = v[0];
    if (first === null || typeof first !== 'object' || Array.isArray(first) || Object.getPrototypeOf(first) !== Object.prototype) return null;
    const keys = Object.keys(first);
    if (keys.length === 0 || keys.some((k) => k.startsWith('$'))) return null;
    for (const o of v) {
      if (o === null || typeof o !== 'object' || Array.isArray(o) || Object.getPrototypeOf(o) !== Object.prototype || !alone(o)) return null;
      const ok = Object.keys(o);
      if (ok.length !== keys.length) return null;
      for (let i = 0; i < ok.length; i++) if (ok[i] !== keys[i] || (o as Record<string, unknown>)[ok[i] as string] === undefined) return null;
    }
    return keys;
  };
  const ids = new Map<object, number>();
  const blocks: Uint8Array[] = [];
  const block = (t: Typed): number => {
    blocks.push(new Uint8Array(t.buffer, t.byteOffset, t.byteLength));
    return blocks.length - 1;
  };
  const num = (v: number): unknown => (Number.isNaN(v) ? { $n: 'nan' } : v === Infinity ? { $n: 'inf' } : v === -Infinity ? { $n: '-inf' } : Object.is(v, -0) ? { $n: '-0' } : v);
  const out = (v: unknown): unknown => {
    if (v === undefined) return { $u: 1 };
    if (typeof v === 'number') return num(v);
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') throw new Error(`pack: a ${typeof v}`);
      return v;
    }
    const id = ids.get(v);
    if (id !== undefined) return { $r: id };
    const shared = (seen.get(v) ?? 0) > 1;
    const mine = shared ? ids.size : -1;
    if (shared) ids.set(v, mine);
    const tag = (o: Record<string, unknown>): Record<string, unknown> => (shared ? { $id: mine, ...o } : o);
    const tn = typedName(v);
    if (tn !== null) return tag({ $t: tn, b: block((v as Typed).slice()) });
    if (Array.isArray(v)) {
      if (v.length >= BLOCK_MIN && allNumbers(v)) return tag({ $f: block(Float64Array.from(v as number[])) });
      if (v.length >= BLOCK_MIN && v.every((x) => typeof x === 'boolean')) return tag({ $b: block(Uint8Array.from(v, (x) => (x ? 1 : 0))) });
      // rows of numbers all as long: one block
      const L = grid(v);
      if (L > 0) {
        const flat = new Float64Array(v.length * L);
        (v as number[][]).forEach((row, i) => flat.set(row, i * L));
        return tag({ $g: block(flat), L });
      }
      // objects all of the same keys: a column a key
      const keys = columns(v);
      if (keys) return tag({ $c: keys, v: keys.map((k) => out((v as Array<Record<string, unknown>>).map((o) => o[k]))) });
      const a = v.map(out);
      return shared ? { $id: mine, $a: a } : a;
    }
    if (v instanceof Map) return tag({ $m: [...v].map(([k, x]) => [out(k), out(x)]) });
    if (v instanceof Set) return tag({ $s: [...v].map(out) });
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) o[k] = out(x);
    }
    // a key of the markers' own (none in the island's data) would be read as one
    for (const k of Object.keys(o)) if (k.startsWith('$')) throw new Error(`pack: a key "${k}"`);
    return tag(o);
  };
  const json = new TextEncoder().encode(JSON.stringify(out(root)));
  let size = 4 + json.length;
  for (const b of blocks) size = align(size) + 8 + b.length;
  const bytes = new Uint8Array(align(size)), view = new DataView(bytes.buffer);
  view.setUint32(0, json.length, true);
  bytes.set(json, 4);
  let at = 4 + json.length;
  for (const b of blocks) {
    at = align(at);
    view.setFloat64(at, b.length, true);
    bytes.set(b, at + 8);
    at += 8 + b.length;
  }
  return bytes;
}

function align(n: number): number {
  return (n + 7) & ~7;
}

/** Unpack bytes `pack` wrote. */
export function unpack(bytes: Uint8Array): unknown {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(0, true);
  const root = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as unknown;
  // the blocks, each copied into a buffer of its own (aligned for its type)
  const blocks: ArrayBuffer[] = [];
  for (let at = align(4 + length); at + 8 <= bytes.byteLength;) {
    const n = view.getFloat64(at, true);
    if (!Number.isFinite(n) || n < 0) break;
    const start = bytes.byteOffset + at + 8;
    blocks.push(bytes.buffer.slice(start, start + n) as ArrayBuffer);
    at = align(at + 8 + n);
  }
  const ids: unknown[] = [];
  // a marker is an object whose first key starts with `$` (a plain object's keys never do: `pack` checks)
  const read = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const x: unknown = v[i];
        if (x !== null && typeof x === 'object') v[i] = read(x);
      }
      return v;
    }
    const o = v as Record<string, unknown>;
    let first = '';
    for (const k in o) { first = k; break; }
    if (first.charCodeAt(0) !== 36) {
      for (const k in o) {
        const x = o[k];
        if (x !== null && typeof x === 'object') o[k] = read(x);
      }
      return o;
    }
    if (first === '$r') return ids[o['$r'] as number];
    if (first === '$n') return o['$n'] === 'nan' ? NaN : o['$n'] === 'inf' ? Infinity : o['$n'] === '-inf' ? -Infinity : -0;
    if (first === '$u') return undefined;
    let id = -1, kind = first;
    if (first === '$id') {
      id = o['$id'] as number;
      delete o['$id'];
      kind = '';
      for (const k in o) { kind = k; break; }
    }
    const keep = <T>(x: T): T => { if (id >= 0) ids[id] = x; return x; };
    switch (kind) {
      case '$t': return keep(new (TYPED[o['$t'] as string] as new (b: ArrayBuffer) => Typed)(blocks[o['b'] as number] as ArrayBuffer));
      case '$f': return keep(Array.from(new Float64Array(blocks[o['$f'] as number] as ArrayBuffer)));
      case '$b': return keep(Array.from(new Uint8Array(blocks[o['$b'] as number] as ArrayBuffer), (x) => x === 1));
      case '$g': {
        const flat = new Float64Array(blocks[o['$g'] as number] as ArrayBuffer), L = o['L'] as number, rows = keep(new Array<number[]>(flat.length / L));
        for (let i = 0; i < rows.length; i++) rows[i] = Array.from(flat.subarray(i * L, (i + 1) * L));
        return rows;
      }
      case '$c': {
        const keys = o['$c'] as string[], rows = keep<Array<Record<string, unknown>>>([]);
        const cols = (o['v'] as unknown[]).map((c) => read(c) as unknown[]), n = cols[0]?.length ?? 0;
        for (let i = 0; i < n; i++) {
          const row: Record<string, unknown> = {};
          for (let k = 0; k < keys.length; k++) row[keys[k] as string] = (cols[k] as unknown[])[i];
          rows.push(row);
        }
        return rows;
      }
      case '$a': {
        const a = keep(o['$a'] as unknown[]);
        for (let i = 0; i < a.length; i++) a[i] = read(a[i]);
        return a;
      }
      case '$m': {
        const m = keep(new Map<unknown, unknown>());
        for (const [k, x] of o['$m'] as Array<[unknown, unknown]>) m.set(read(k), read(x));
        return m;
      }
      case '$s': {
        const set = keep(new Set<unknown>());
        for (const x of o['$s'] as unknown[]) set.add(read(x));
        return set;
      }
      default: {
        // a shared plain object: its id taken off, its fields read
        ids[id] = o;
        for (const k in o) {
          const x = o[k];
          if (x !== null && typeof x === 'object') o[k] = read(x);
        }
        return o;
      }
    }
  };
  return read(root);
}

/**
 * Values packed one after another (M8.10 slice 18: the island's bake read as it arrives): each its bytes' length (4
 * bytes) then `pack`'s bytes. An object shared between two is written in each: what is split must share nothing.
 */
export function packSections(values: readonly unknown[]): Uint8Array {
  const parts = values.map(pack);
  const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.length, 0)), view = new DataView(out.buffer);
  let at = 0;
  for (const p of parts) {
    view.setUint32(at, p.length, true);
    out.set(p, at + 4);
    at += 4 + p.length;
  }
  return out;
}

/** `packSections`' bytes read as they come: `feed` each piece, and get back every section it completed, unpacked. */
export class SectionReader {
  private readonly pieces: Uint8Array[] = [];
  private have = 0;

  feed(piece: Uint8Array): unknown[] {
    this.pieces.push(piece);
    this.have += piece.length;
    const out: unknown[] = [];
    while (this.have >= 4) {
      const head = this.bytes(4, false), n = new DataView(head.buffer, head.byteOffset, 4).getUint32(0, true);
      if (this.have < 4 + n) break;
      out.push(unpack(this.bytes(4 + n, true).subarray(4)));
    }
    return out;
  }

  /** Whether every byte fed was read. */
  get done(): boolean {
    return this.have === 0;
  }

  /** The first `n` bytes fed and not yet read (taken off when `take`). */
  private bytes(n: number, take: boolean): Uint8Array {
    const first = this.pieces[0] as Uint8Array;
    if (first.length >= n && !take) return first.subarray(0, n);
    const out = new Uint8Array(n);
    let at = 0, i = 0;
    while (at < n) {
      const p = this.pieces[i] as Uint8Array, k = Math.min(p.length, n - at);
      out.set(p.subarray(0, k), at);
      at += k;
      if (!take) { i++; continue; }
      if (k === p.length) this.pieces.shift();
      else this.pieces[0] = p.subarray(k);
    }
    if (take) this.have -= n;
    return out;
  }
}
