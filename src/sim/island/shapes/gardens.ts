/**
 * Palm Gardens' shapes in the ground and its places' layout (M8.10 slice 10, docs/M8.10_PLAN.md §1.2): the botanic
 * garden (the Glasshouse's terrace on the top of its hill, the gravel paths, the crest's hump on the north path), the
 * golf course on the south-west headland (fairways, greens, tees, sand bunkers, the pond dug under the sea's level),
 * the dunes along its rocky shore with their jump, the beach's dune with its jump, and the boardwalk's line along the
 * beach road. The heights are shaped here before the roads are graded; what covers the ground (the gravel, the sand,
 * the terrace's paving) and where a place's own surface is drawn over it are read here too. The sketches' numbers
 * (x east, z south) are turned into the world's (+X west, +Z north) as `plan.ts` turns them. Reads the plan only; a
 * read allocates nothing.
 */
import { catmullRom, circle, type P2 } from '../geom';
import { GARDEN, ROADS, coastline, naturalHeight, onLand } from '../plan';

/** A capsule on the ground (a fairway): the segment a → b and its half width (m). */
export interface Capsule { ax: number; az: number; bx: number; bz: number; r: number }
/** An ellipse on the ground, its axes along the world's x and z (m). */
export interface Oval { x: number; z: number; rx: number; rz: number }
/**
 * A hump across a way, the ground's own jump: its middle, the way a car takes it (a unit vector, either way), its
 * height; along the way its flat top's half length and each ramp's length (a ramp steepening to the top's edge, the
 * lip); across it, its half width at full height and its sides' fall (m).
 */
export interface Hump { x: number; z: number; dx: number; dz: number; h: number; top: number; ramp: number; half: number; side: number }
/** A garden path: its line (closed for the loop round the Glasshouse). */
export interface GardenPath { id: string; pts: P2[]; closed: boolean }
/** A tee: its middle and the way to its green (a yaw, +Z turned toward +X). */
export interface Tee { x: number; z: number; yaw: number }
/** A dune: its middle, its height and its reach (m). */
export interface Dune { x: number; z: number; h: number; r: number }
/** A tree of the botanic garden: where it stands, and whether a palm. */
export interface GardenTree { x: number; z: number; palm: boolean }

/** A sketch point in the world. */
const W = (x: number, z: number): P2 => [-x, -z];
const Wo = (x: number, z: number, rx: number, rz: number): Oval => ({ x: -x, z: -z, rx, rz });
const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------- the botanic garden

/** The Glasshouse: its middle (the garden's), its half size; the terrace it stands on, raised over the hill's top. */
export const GLASSHOUSE = { x: GARDEN.x, z: GARDEN.z, half: 18, terrace: 30, blend: 14, lift: 1.5, paved: 28 } as const;
/**
 * The gravel paths (m): each 7 m wide; two straight paths across the garden 50 m north and south of the Glasshouse,
 * each from the parkway's inner edge to its other (the north one over the crest), and the loop round the Glasshouse
 * touching both at their middles.
 */
export const PATH = { half: 3.5, chord: 50, loop: 50, end: 158.5 } as const;
/** The crest on the north path, over the hill's top (the plan's jump there): a symmetric hump a car flies from. */
export const CREST: Hump = { x: GARDEN.x, z: GARDEN.z + PATH.chord, dx: 1, dz: 0, h: 2.6, top: 2, ramp: 14, half: 8, side: 6 };
/** The garden's trees: how many, the ring they stand in round the Glasshouse, apart from each other and off the paths (m). */
const TREES = { count: 110, inner: 62, outer: 148, apart: 9, offPath: 12, palmEvery: 3 } as const;

// ---------------------------------------------------------------- the golf course, the dunes, the beach

/** A sketch capsule in the world. */
const Wc = (ax: number, az: number, bx: number, bz: number, r: number): Capsule => ({ ax: -ax, az: -az, bx: -bx, bz: -bz, r });
/** The golf course's three holes (the sketch's three flags): fairways, greens, tees; its bunkers and its pond. */
export const FAIRWAYS: readonly Capsule[] = [Wc(-635, 732, -710, 697, 15), Wc(-790, 600, -834, 500, 16)];
export const GREENS: readonly Oval[] = [Wo(-728, 688, 13, 13), Wo(-845, 478, 13, 13), Wo(-660, 670, 11, 11)];
export const TEES: readonly Tee[] = ([[[-615, 740], 0], [[-740, 655], 1], [[-605, 700], 2]] as ReadonlyArray<readonly [[number, number], number]>).map(([t, g]) => {
  const [x, z] = W(...t), green = GREENS[g] as Oval;
  return { x, z, yaw: Math.atan2(green.x - x, green.z - z) };
});
/** A tee's half size across and along its hole (m). */
export const TEE = { across: 4, along: 6 } as const;
export const BUNKERS: readonly Oval[] = [
  Wo(-716, 707, 7, 5), Wo(-746, 674, 5, 6), Wo(-812, 585, 6, 8), Wo(-860, 494, 6, 5), Wo(-641, 684, 5, 4), Wo(-676, 718, 8, 5),
];
/** A bunker's sand lies this far under the grass round it (m). */
const BUNKER_DEPTH = 0.7;
/** The pond, dug under the sea's level (the sea's water fills it): its floor and its banks' run in from its rim (m). */
export const POND = { ...Wo(-780, 645, 22, 15), floor: -2.6, bank: 11 } as const;
/** The dunes: along the golf's rocky shore this far in from its line, one every `every` m, the sand this far round them (m). */
const DUNES = { inland: 15, every: 12, band: 16, clear: 60 } as const;
/** The dunes' jump (the plan's, on the golf's shore), taken along the shore. */
export const DUNE_JUMP: Hump = { ...pt(-760, 712), ...unit(-0.857, -0.514), h: 3, top: 3, ramp: 14, half: 10, side: 8 };
/** The beach's dune and its jump (the plan's), across the beach, taken along it. */
export const BEACH_JUMP: Hump = { ...pt(50, 781), dx: 1, dz: 0, h: 3, top: 3, ramp: 14, half: 5, side: 4 };
/** The boardwalk along the beach road's sea side (m): its middle off the road's, its half width, its ends and the slipway's gap (sketch x). */
export const BOARDWALK = { off: 17.8, half: 2.5, from: -455, to: 245, gap: [-408, -392] } as const;

function pt(x: number, z: number): { x: number; z: number } { return { x: -x, z: -z }; }
function unit(x: number, z: number): { dx: number; dz: number } { const l = Math.hypot(x, z); return { dx: x / l, dz: z / l }; }

// ---------------------------------------------------------------- reads

/** A hump's height at (x, z) over the ground under it: its ramps steepen to its lip, its sides ease down. */
export function humpAt(p: Hump, x: number, z: number): number {
  const rx = x - p.x, rz = z - p.z;
  const u = Math.abs(rx * p.dx + rz * p.dz), v = Math.abs(rz * p.dx - rx * p.dz);
  if (u >= p.top + p.ramp || v >= p.half + p.side) return 0;
  const along = u <= p.top ? 1 : (1 - (u - p.top) / p.ramp) ** 2;
  const across = v <= p.half ? 1 : 1 - smooth01((v - p.half) / p.side);
  return p.h * along * across;
}

/** Whether (x, z) is on a hump's footprint. */
function onHump(p: Hump, x: number, z: number, pad = 0): boolean {
  const rx = x - p.x, rz = z - p.z;
  return Math.abs(rx * p.dx + rz * p.dz) < p.top + p.ramp + pad && Math.abs(rz * p.dx - rx * p.dz) < p.half + p.side + pad;
}

/** The distance from (x, z) to a capsule's segment. */
function toCapsule(c: Capsule, x: number, z: number): number {
  const dx = c.bx - c.ax, dz = c.bz - c.az;
  const t = Math.max(0, Math.min(1, ((x - c.ax) * dx + (z - c.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - c.ax - dx * t, z - c.az - dz * t);
}

/** An oval's normalised radius at (x, z): under 1 inside. */
function inOval(o: Oval, x: number, z: number, pad = 0): number {
  return Math.hypot((x - o.x) / (o.rx + pad), (z - o.z) / (o.rz + pad));
}

/** On a tee's rectangle (`pad` m round it). */
function onTee(t: Tee, x: number, z: number, pad = 0): boolean {
  const rx = x - t.x, rz = z - t.z, s = Math.sin(t.yaw), c = Math.cos(t.yaw);
  return Math.abs(rx * s + rz * c) < TEE.along + pad && Math.abs(rx * c - rz * s) < TEE.across + pad;
}

/** A box round the golf's things and the dunes, the garden's shaped middle, the beach's dune; worked out once. */
interface Layout {
  dunes: Dune[];
  duneLine: P2[];
  golf: { x0: number; x1: number; z0: number; z1: number };
  /** The dunes' sand every metre over the golf's box (1: within the band of their line). */
  sand: Uint8Array;
  sandNx: number;
  beach: { x0: number; x1: number; z0: number; z1: number };
  terraceTop: number;
}
let layoutCache: Layout | null = null;

/** A small seeded stream (mulberry32): the dunes' and the trees' places. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layout(): Layout {
  if (layoutCache) return layoutCache;
  // the dunes' line: the golf's shore (the sketch's south-west headland, one run of the coast's samples) moved in by
  // `inland`, from the beach's end round to the headland's north
  const coast = coastline(), shore: P2[] = [];
  for (let i = 0; i < coast.length; i++) {
    const p = coast[i] as P2;
    if (p[0] < 625 || p[1] > -445) continue;
    const a = coast[(i - 1 + coast.length) % coast.length] as P2, b = coast[(i + 1) % coast.length] as P2;
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    let nx = -tz / l, nz = tx / l;
    if (!onLand(p[0] + nx * 5, p[1] + nz * 5)) { nx = -nx; nz = -nz; }
    shore.push([p[0] + nx * DUNES.inland, p[1] + nz * DUNES.inland]);
  }
  const rnd = stream(0x9a2d);
  const dunes: Dune[] = [];
  let run = 0;
  for (let i = 1; i < shore.length; i++) {
    const a = shore[i - 1] as P2, b = shore[i] as P2;
    run += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run < DUNES.every) continue;
    run = 0;
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    const along = (rnd() - 0.5) * 4, across = (rnd() - 0.5) * 6;
    const d: Dune = { x: b[0] + (tx / l) * along - (tz / l) * across, z: b[1] + (tz / l) * along + (tx / l) * across, h: 1 + rnd() * 1.4, r: 7 + rnd() * 3 };
    // none on the golf's things, and the jump's run-up and landing clear
    const near = FAIRWAYS.some((c) => toCapsule(c, d.x, d.z) < c.r + d.r + 3) || [...GREENS, ...BUNKERS].some((o) => inOval(o, d.x, d.z, d.r + 3) < 1)
      || TEES.some((t) => onTee(t, d.x, d.z, d.r + 3)) || inOval(POND, d.x, d.z, d.r + 4) < 1 || Math.hypot(d.x - DUNE_JUMP.x, d.z - DUNE_JUMP.z) < DUNES.clear;
    if (!near) dunes.push(d);
  }
  // the golf's box: its things, the dunes and the jump, with their reach
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const grow = (x: number, z: number, r: number): void => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
  for (const c of FAIRWAYS) { grow(c.ax, c.az, c.r + 2); grow(c.bx, c.bz, c.r + 2); }
  for (const o of [...GREENS, ...BUNKERS, POND]) grow(o.x, o.z, Math.max(o.rx, o.rz) + 2);
  for (const t of TEES) grow(t.x, t.z, TEE.along + 2);
  for (const p of shore) grow(p[0], p[1], DUNES.band + 2);
  grow(DUNE_JUMP.x, DUNE_JUMP.z, DUNE_JUMP.top + DUNE_JUMP.ramp + DUNE_JUMP.half + DUNE_JUMP.side);
  // the dunes' sand: every metre's cell within the band of their line
  const sandNx = Math.ceil(x1 - x0), sandNz = Math.ceil(z1 - z0), sand = new Uint8Array(sandNx * sandNz);
  for (let k = 0; k + 1 < shore.length; k++) {
    const a = shore[k] as P2, c = shore[k + 1] as P2, dx = c[0] - a[0], dz = c[1] - a[1];
    const i0 = Math.max(0, Math.floor(Math.min(a[0], c[0]) - DUNES.band - x0)), i1 = Math.min(sandNx - 1, Math.ceil(Math.max(a[0], c[0]) + DUNES.band - x0));
    const j0 = Math.max(0, Math.floor(Math.min(a[1], c[1]) - DUNES.band - z0)), j1 = Math.min(sandNz - 1, Math.ceil(Math.max(a[1], c[1]) + DUNES.band - z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i + 0.5, z = z0 + j + 0.5;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < DUNES.band) sand[j * sandNx + i] = 1;
    }
  }
  const b = BEACH_JUMP, reach = Math.max(b.top + b.ramp, b.half + b.side) + 1;
  layoutCache = {
    dunes, duneLine: shore, golf: { x0, x1, z0, z1 }, sand, sandNx,
    beach: { x0: b.x - reach, x1: b.x + reach, z0: b.z - reach, z1: b.z + reach },
    terraceTop: naturalHeight(GLASSHOUSE.x, GLASSHOUSE.z) + GLASSHOUSE.lift,
  };
  return layoutCache;
}

const inBox = (b: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): boolean => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
/** The garden's shaped middle: the terrace and the crest. */
const inMiddle = (x: number, z: number): boolean => Math.abs(x - GARDEN.x) < 60 && z - GARDEN.z > -60 && z - GARDEN.z < PATH.chord + CREST.half + CREST.side + 1;

/** On the dunes' sand (within the golf's box), by its metre's cell. */
function onDunes(L: Layout, x: number, z: number): boolean {
  return L.sand[Math.floor(z - L.golf.z0) * L.sandNx + Math.floor(x - L.golf.x0)] === 1;
}

/**
 * The Gardens' shapes in the hills (before the roads are graded): the Glasshouse's terrace raised flat over the hill's
 * top and eased back into it, the crest's hump on the north path, the bunkers' hollows, the pond dug under the sea's
 * level, the dunes and their jump, the beach's dune.
 */
export function gardensShape(x: number, z: number, h: number): number {
  if (inMiddle(x, z)) {
    const L = layout(), g = GLASSHOUSE, r = Math.hypot(x - g.x, z - g.z);
    if (r < g.terrace + g.blend) h += (L.terraceTop - h) * (r <= g.terrace ? 1 : 1 - smooth01((r - g.terrace) / g.blend));
    return h + humpAt(CREST, x, z);
  }
  const L = layout();
  if (inBox(L.golf, x, z)) {
    for (const b of BUNKERS) {
      const q = inOval(b, x, z);
      if (q < 1) h -= BUNKER_DEPTH * (1 - smooth01((q - 0.5) / 0.5));
    }
    const q = inOval(POND, x, z);
    if (q < 1) h += (POND.floor - h) * smooth01(((1 - q) * POND.rz) / POND.bank);
    for (const d of L.dunes) {
      const dx = x - d.x, dz = z - d.z;
      if (Math.abs(dx) >= d.r || Math.abs(dz) >= d.r) continue;
      const r = Math.hypot(dx, dz);
      if (r < d.r) h += d.h * (1 - smooth01(r / d.r));
    }
    return h + humpAt(DUNE_JUMP, x, z);
  }
  if (inBox(L.beach, x, z)) return h + humpAt(BEACH_JUMP, x, z);
  return h;
}

/** What the Gardens lay on the ground at (x, z), for the wheels: the paths' gravel, the sand, the terrace's paving. */
export type GardensCover = 'gravel' | 'sand' | 'paved' | null;

export function gardensCover(x: number, z: number): GardensCover {
  const gx = x - GARDEN.x, gz = z - GARDEN.z;
  if (Math.abs(gx) < PATH.end && Math.abs(gz) < PATH.end) {
    const r = Math.hypot(gx, gz);
    if (r < GLASSHOUSE.paved) return 'paved';
    if (Math.abs(r - PATH.loop) < PATH.half) return 'gravel';
    if (r < PATH.end && Math.abs(Math.abs(gz) - PATH.chord) < PATH.half) return 'gravel';
    return null;
  }
  const L = layout();
  if (!inBox(L.golf, x, z)) return null;
  for (const b of BUNKERS) if (inOval(b, x, z) < 1) return 'sand';
  if (onHump(DUNE_JUMP, x, z) || onDunes(L, x, z)) return 'sand';
  return null;
}

/** What the ground's look reads at (x, z): `LAID`, a Gardens' own surface drawn over it; `LAWN`, the botanic garden's mown grass. */
export const LAID = 1;
export const LAWN = 2;
export function gardensGround(x: number, z: number): number {
  return (gardensLaid(x, z) ? LAID : 0) | (Math.hypot(x - GARDEN.x, z - GARDEN.z) < PATH.end - 3 ? LAWN : 0);
}

/**
 * Whether a Gardens' surface of its own is drawn over the ground at (x, z) (the paths, the terrace, the fairways, the
 * greens, the tees, the bunkers), a metre round each: the ground's mesh keeps under it there.
 */
export function gardensLaid(x: number, z: number): boolean {
  const gx = x - GARDEN.x, gz = z - GARDEN.z;
  if (Math.abs(gx) < PATH.end + 1 && Math.abs(gz) < PATH.end + 1) {
    const r = Math.hypot(gx, gz), pad = PATH.half + 1;
    return r < GLASSHOUSE.paved + 1 || Math.abs(r - PATH.loop) < pad || (r < PATH.end && Math.abs(Math.abs(gz) - PATH.chord) < pad);
  }
  if (!inBox(layout().golf, x, z)) return false;
  for (const c of FAIRWAYS) if (toCapsule(c, x, z) < c.r + 1) return true;
  for (const o of GREENS) if (inOval(o, x, z, 1) < 1) return true;
  for (const o of BUNKERS) if (inOval(o, x, z, 1) < 1) return true;
  for (const t of TEES) if (onTee(t, x, z, 1)) return true;
  return false;
}

// ---------------------------------------------------------------- the lines the places and the views build on

/** The garden's paths: the north one over the crest, the south one, the loop round the Glasshouse. */
export function gardenPaths(): GardenPath[] {
  const reach = Math.sqrt((PATH.end - 0.5) ** 2 - PATH.chord ** 2);
  const chord = (id: string, dz: number): GardenPath => {
    const pts: P2[] = [], n = Math.ceil(reach);
    for (let k = 0; k <= n; k++) pts.push([GARDEN.x + reach - (2 * reach * k) / n, GARDEN.z + dz]);
    return { id, pts, closed: false };
  };
  return [chord('crest', PATH.chord), chord('south', -PATH.chord), { id: 'loop', pts: circle(GARDEN.x, GARDEN.z, PATH.loop, 160), closed: true }];
}

/** The dunes and their line (the band of sand round it). */
export function gardenDunes(): { dunes: readonly Dune[]; line: readonly P2[]; band: number } {
  const L = layout();
  return { dunes: L.dunes, line: L.duneLine, band: DUNES.band };
}

/** The botanic garden's trees: seeded, in the ring round the Glasshouse's terrace, off the paths and the crest. */
export function gardenTrees(): GardenTree[] {
  const rnd = stream(0x51a7), out: GardenTree[] = [];
  for (let tries = 0; out.length < TREES.count && tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2, r = TREES.inner + Math.sqrt(rnd()) * (TREES.outer - TREES.inner);
    const x = GARDEN.x + Math.cos(a) * r, z = GARDEN.z + Math.sin(a) * r, gz = z - GARDEN.z;
    if (Math.abs(Math.abs(gz) - PATH.chord) < TREES.offPath || onHump(CREST, x, z, 8)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < TREES.apart)) continue;
    out.push({ x, z, palm: out.length % TREES.palmEvery === 0 });
  }
  return out;
}

/**
 * The boardwalk's line: the beach road's centreline moved `off` m to its sea side, from its west end to its east
 * (the sketch's x), in runs broken at the slipway's gap.
 */
export function boardwalkRuns(): P2[][] {
  const road = ROADS.find((r) => r.id === 'beach-road');
  if (!road) return [];
  const line = catmullRom(road.points, false, 6), runs: P2[][] = [];
  let cur: P2[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i] as P2, a = line[Math.max(0, i - 1)] as P2, b = line[Math.min(line.length - 1, i + 1)] as P2;
    const sx = -p[0];
    const inside = sx >= BOARDWALK.from && sx <= BOARDWALK.to && (sx < BOARDWALK.gap[0] || sx > BOARDWALK.gap[1]);
    if (!inside) { if (cur.length > 1) runs.push(cur); cur = []; continue; }
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    // the sea's side: the world's −Z (the sketch's south)
    let nx = -tz / l, nz = tx / l;
    if (nz > 0) { nx = -nx; nz = -nz; }
    cur.push([p[0] + nx * BOARDWALK.off, p[1] + nz * BOARDWALK.off]);
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
