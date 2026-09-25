/**
 * Sunset Works' shapes in the ground (M8.10 slice 9, docs/M8.10_PLAN.md): the dry canal and the pads its places stand
 * on. The canal runs the plan's line from its west end to the sea, `CANAL.depth` deep with sloped concrete sides and a
 * ramp at each end; its floor stays over the sea's level, so the land along it is raised into a broad embankment
 * (`worksShape`, before the roads are graded: they climb it and cross the canal level, on the bridges' decks). The
 * channel itself is dug after the roads (`canalBed`, read by the ground's physics and drawn height), so no road dives
 * into it. The Waterworks' and the scrapyard's pads are levelled. Reads the plan only; a read allocates nothing.
 */
import type { P2 } from '../geom';
import { CAUSEWAY, GARAGES, PLACES, naturalHeight, onLand } from '../plan';

/**
 * The canal (m): its top's half width (the plan's), its floor's half width, its depth under the banks, its floor's least
 * height (over the sea at −0.5), its ramps' lengths (the west one on the hill's foot, the east one short of the
 * highway's deck), how far inside the coast its east end stops, the coping past its top. The sides rise one in one from
 * the floor's edge to the banks.
 */
export const CANAL = { half: PLACES.canalWidth / 2, floorHalf: PLACES.canalWidth / 2 - 6, depth: 6, floorMin: 0.3, rampWest: 80, rampEast: 64, coastClear: 12, coping: 1.5 } as const;
/** The embankment: the land within `PLATEAU` of the canal raised whole, falling back to the hills over `FALL` (m). */
const PLATEAU = 45;
const FALL = 200;
/** The embankment keeps off the airfield's causeway (M8.10 slice 12's runway), faded in over this far past it (m). */
const AIRFIELD_CLEAR = 20;
/** The Waterworks' pad (m): levelled within `r`, blended back over `blend`. */
export const WATERWORKS_PAD = { r: 36, blend: 16 } as const;
/**
 * The scrapyard's yard (world m): a rectangle behind the plan's garage door, the door on its front edge; levelled, dirt
 * underfoot.
 */
const SCRAP_DOOR = (GARAGES.find((g) => g.name === 'scrapyard') as { at: P2 }).at;
export const SCRAPYARD = { x0: SCRAP_DOOR[0] - 44, x1: SCRAP_DOOR[0] + 44, z0: SCRAP_DOOR[1] - 2, z1: SCRAP_DOOR[1] + 60, door: SCRAP_DOOR } as const;
const SCRAP_BLEND = 14;

const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The canal's centreline from its west end to where it stops short of the coast, each point's station, its box (m). */
interface Line { pts: P2[]; s: number[]; length: number; x0: number; x1: number; z0: number; z1: number }
let line: Line | null = null;
/** Along the centreline every `TABLE` m: the embankment's raise, the banks' height, the floor's (before the ramps). */
const TABLE = 2;
let raise = new Float64Array(0);
let bank = new Float64Array(0);
let floor = new Float64Array(0);

function canalLine(): Line {
  if (line) return line;
  const plan = PLACES.canal as readonly P2[];
  // walk the plan's line a metre at a time until it leaves the land, then stop `coastClear` short of there
  let run = 0, coast = Infinity;
  for (let i = 0; i + 1 < plan.length && coast === Infinity; i++) {
    const a = plan[i] as P2, b = plan[i + 1] as P2, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 1; d <= l; d++) {
      if (!onLand(a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l)) { coast = run + d; break; }
    }
    run += l;
  }
  const end = coast - CANAL.coastClear, pts: P2[] = [plan[0] as P2];
  run = 0;
  for (let i = 0; i + 1 < plan.length; i++) {
    const a = plan[i] as P2, b = plan[i + 1] as P2, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run + l >= end) {
      const t = (end - run) / l;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      break;
    }
    pts.push(b);
    run += l;
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push((s[i - 1] as number) + Math.hypot((pts[i] as P2)[0] - (pts[i - 1] as P2)[0], (pts[i] as P2)[1] - (pts[i - 1] as P2)[1]));
  const reach = PLATEAU + FALL, xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const built: Line = { pts, s, length: s[s.length - 1] as number, x0: Math.min(...xs) - reach, x1: Math.max(...xs) + reach, z0: Math.min(...zs) - reach, z1: Math.max(...zs) + reach };
  line = built;
  // the banks: the hills along the line, raised to the floor's least height and the depth; the floor under them
  const n = Math.ceil(built.length / TABLE) + 2;
  raise = new Float64Array(n);
  bank = new Float64Array(n);
  floor = new Float64Array(n);
  const p = { x: 0, z: 0 };
  for (let k = 0; k < n; k++) {
    pointAt(Math.min(built.length, k * TABLE), p);
    const h = naturalHeight(p.x, p.z), b = Math.max(h, CANAL.floorMin + CANAL.depth);
    raise[k] = b - h;
    bank[k] = b;
    floor[k] = b - CANAL.depth;
  }
  return built;
}

/** The centreline's point at station `s` (into `out`). */
export function pointAt(s: number, out: { x: number; z: number }): { x: number; z: number } {
  const l = line ?? canalLine();
  let i = 0;
  while (i + 2 < l.s.length && (l.s[i + 1] as number) < s) i++;
  const a = l.pts[i] as P2, b = l.pts[i + 1] as P2, s0 = l.s[i] as number, s1 = l.s[i + 1] as number;
  const t = Math.max(0, Math.min(1, (s - s0) / (s1 - s0 || 1)));
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  return out;
}

/** The canal's length from the top of its west ramp to the top of its east one (m). */
export function canalLength(): number {
  return (line ?? canalLine()).length;
}

/** The nearest point of the centreline to the point last read: its distance, its station, how far past an end. */
const near = { d: Infinity, s: 0, past: 0 };
/** Where (x, z) is from the canal's centreline (into `out`): its distance, station and how far past an end. */
export function canalStation(x: number, z: number, out: { d: number; s: number; past: number }): { d: number; s: number; past: number } {
  nearest(x, z);
  out.d = near.d;
  out.s = near.s;
  out.past = near.past;
  return out;
}
function nearest(x: number, z: number): void {
  const l = line ?? canalLine();
  near.d = Infinity;
  near.s = 0;
  near.past = 0;
  const n = l.pts.length;
  for (let i = 0; i + 1 < n; i++) {
    const a = l.pts[i] as P2, b = l.pts[i + 1] as P2, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    const u = ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len), t = Math.max(0, Math.min(1, u));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < near.d) {
      near.d = d;
      near.s = (l.s[i] as number) + t * len;
      near.past = i === 0 && u < 0 ? -u * len : i === n - 2 && u > 1 ? (u - 1) * len : 0;
    }
  }
}

/** A table's value at station `s`. */
function tableAt(table: Float64Array, s: number): number {
  const f = Math.max(0, Math.min(table.length - 1, s / TABLE)), k = Math.min(table.length - 2, Math.floor(f));
  return (table[k] as number) + ((table[k + 1] as number) - (table[k] as number)) * (f - k);
}

/** The canal's floor at station `s`: its least height, raised up each end's ramp to the banks. */
export function floorAt(s: number): number {
  const l = line ?? canalLine();
  const f = tableAt(floor, s), b = tableAt(bank, s);
  return f + (b - f) * smooth01(Math.max(0, 1 - s / CANAL.rampWest, 1 - (l.length - s) / CANAL.rampEast));
}

/** The banks' height at station `s` (the embankment's top on the centreline). */
export function bankAt(s: number): number {
  canalLine();
  return tableAt(bank, s);
}

/**
 * The canal's channel at (x, z): its floor, and the sides rising one in one from the floor's edge (on up past the
 * banks, so the ground's own surface takes over where it is lower); Infinity away from it and past its ends.
 */
export function canalBed(x: number, z: number): number {
  const l = line ?? canalLine();
  if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) return Infinity;
  nearest(x, z);
  if (near.past > 0 || near.d > CANAL.half + 12) return Infinity;
  return floorAt(near.s) + Math.max(0, near.d - CANAL.floorHalf);
}

/**
 * The signed distance to the edge of the canal's concrete (its coping's outer line and its two ends): negative inside,
 * a large positive number away from it. The render cuts the ground's mesh there and draws the lining instead.
 */
export function canalEdge(x: number, z: number): number {
  const l = line ?? canalLine();
  if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) return 1e3;
  nearest(x, z);
  return Math.max(near.d - CANAL.half - CANAL.coping, near.past > 0 ? near.past : Math.max(-near.s, near.s - l.length));
}

/** Inside the canal's concrete (the wheels read it as paving). */
export function inCanal(x: number, z: number): boolean {
  return canalEdge(x, z) < 0;
}

/** How much the embankment raises the ground at (x, z) (m). */
function lift(x: number, z: number): number {
  const l = line ?? canalLine();
  if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) return 0;
  nearest(x, z);
  if (near.d >= PLATEAU + FALL) return 0;
  // none on the airfield's causeway across the water (its runway level), faded in over `AIRFIELD_CLEAR` m past it
  const c = CAUSEWAY, off = Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
  return tableAt(raise, near.s) * (near.d <= PLATEAU ? 1 : smooth01(1 - (near.d - PLATEAU) / FALL)) * smooth01(off / AIRFIELD_CLEAR);
}

/** The Waterworks' pad's and the scrapyard's levels: the embanked hills at their middles. */
let pads: { waterworks: number; scrapyard: number } | null = null;
function padLevels(): { waterworks: number; scrapyard: number } {
  if (pads) return pads;
  // the scrapyard's at its door's, on its street's height: the garage's floor meets the pavement (slice 14)
  const w = PLACES.waterworks, [sx, sz] = SCRAPYARD.door;
  pads = { waterworks: naturalHeight(w.x, w.z) + lift(w.x, w.z), scrapyard: naturalHeight(sx, sz) + lift(sx, sz) };
  return pads;
}

/** Sunset Works' shapes: the canal's embankment, the Waterworks' and the scrapyard's levelled pads. */
export function worksShape(x: number, z: number, h: number): number {
  let out = h + lift(x, z);
  const w = PLACES.waterworks, dw = Math.hypot(x - w.x, z - w.z);
  if (dw < WATERWORKS_PAD.r + WATERWORKS_PAD.blend) {
    const k = dw <= WATERWORKS_PAD.r ? 1 : 1 - smooth01((dw - WATERWORKS_PAD.r) / WATERWORKS_PAD.blend);
    out += (padLevels().waterworks - out) * k;
  }
  const ox = Math.max(SCRAPYARD.x0 - x, 0, x - SCRAPYARD.x1), oz = Math.max(SCRAPYARD.z0 - z, 0, z - SCRAPYARD.z1), ds = Math.hypot(ox, oz);
  if (ds < SCRAP_BLEND) out += (padLevels().scrapyard - out) * (1 - smooth01(ds / SCRAP_BLEND));
  return out;
}

/** On the scrapyard's yard (dirt underfoot). */
export function inScrapyard(x: number, z: number): boolean {
  return x > SCRAPYARD.x0 && x < SCRAPYARD.x1 && z > SCRAPYARD.z0 && z < SCRAPYARD.z1;
}

/** The Waterworks' plaza's half side (m): paved, round the landmark. */
export const WATERWORKS_PLAZA = 24;
/** On the Waterworks' paved plaza. */
export function onWaterworksPlaza(x: number, z: number): boolean {
  const w = PLACES.waterworks;
  return Math.abs(x - w.x) < WATERWORKS_PLAZA && Math.abs(z - w.z) < WATERWORKS_PLAZA;
}
