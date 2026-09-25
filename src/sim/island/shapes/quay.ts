/**
 * Coral Quay's shapes (M8.10 slice 11, docs/M8.10_PLAN.md): the stadium's floor held level over its footprint (the
 * oval, the stands and the infield on one height, eased back into the hills past its rim); the reef raised from the
 * bay's floor, still under the water; and the Quay's decks: the marina's four piers and the boardwalk across their heads
 * with its gap, the pleasure pier and its wheel's platform. Where a deck leaves the land the island's wall opens, and the
 * wheels read its boards as a road (as they do the stadium's concourse). Reads the plan only; world axes (+X west, +Z
 * north), the sketch's numbers turned by `W` as the plan's are.
 */
import type { P2 } from '../geom';
import { PLACES, PLACE_RINGS, naturalHeight, type PlanRing } from '../plan';

/** A sketch point in the world (the plan's half turn). */
const W = (x: number, z: number): P2 => [-x, -z];

// ---------------------------------------------------------------- the stadium's floor

const ST = PLACES.stadium;
/** The stadium's oval: the lane's line, one way round (its half axes `r` along x and `rz` along z). */
export const OVAL = PLACE_RINGS.find((r) => r.id === 'stadium-oval') as PlanRing & { rz: number };
/** The stadium's floor: the plan's hills at its middle, over its whole footprint (m). */
export const STADIUM_LEVEL = naturalHeight(ST.x, ST.z);
/** Past its rim the floor eases back into the hills over this far (m). */
const BOWL = 20;
/**
 * The stands round the oval, off its line along its outward normal (m): past the track's outer edge (its half width, 7)
 * a paved apron, the stands' front at `front`, their back wall at `back` (the plan's footprint: 80 + 24 by 48 + 24).
 */
export const STANDS = { edge: 7, front: 10, back: 24 } as const;

// ---------------------------------------------------------------- the reef

/**
 * The reef's patches in the bay's south (sketch numbers: their middles and radii, m): each a dome raised off the bay's
 * floor to `REEF_TOP` at its middle, 1.7 m under the sea's surface (−0.5), so a car that sinks onto it is under the sea
 * and goes back to the road as anywhere in the water.
 */
export const REEF: ReadonlyArray<{ x: number; z: number; r: number }> = ([
  [455, 640, 18], [500, 692, 22], [560, 650, 16], [604, 702, 20], [656, 690, 14], [472, 662, 12], [530, 612, 10],
] as ReadonlyArray<readonly [number, number, number]>).map(([x, z, r]) => { const [wx, wz] = W(x, z); return { x: wx, z: wz, r }; });
export const REEF_TOP = -2.2;
/** How far the dome falls from its middle to its rim (m): the bay's floor is 4 m down. */
const REEF_RISE = 1.8;
/** The reef's bounds (world), for a quick miss. */
const REEF_BOX = REEF.reduce((b, p) => ({ x0: Math.min(b.x0, p.x - p.r), x1: Math.max(b.x1, p.x + p.r), z0: Math.min(b.z0, p.z - p.r), z1: Math.max(b.z1, p.z + p.r) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });

// ---------------------------------------------------------------- the decks

/** A deck: its centreline from `a` to `b` (world) and its half width (m). */
export interface Deck { id: string; ax: number; az: number; bx: number; bz: number; half: number }

/**
 * The marina (sketch numbers): the boardwalk across the bay at the piers' heads, from the west shore to the east (the
 * lighthouse road), with its gap between the second pier and the third (the plan's jump); the four piers from the north
 * shore, their roots `rootZ` a few metres inland (clear of the lots along the Quay's sweep), out to the plan's ends.
 */
export const MARINA = {
  walk: { z: 440, x0: 380, x1: 752, half: 4 },
  /** The gap's two lips (sketch x): the kickers' ridges. */
  gap: { x0: 538, x1: 552 },
  pier: { half: 3, rootZ: [372, 360, 358, 365] },
  /** The pleasure pier's deck from the beach's top (sketch x), and the wheel's platform at its end. */
  pleasure: { x0: 328, half: (PLACES.pleasurePier.z1 - PLACES.pleasurePier.z0) / 2 },
  platform: { length: 22, half: 12.5 },
} as const;

const decks: Deck[] = [];
{
  const add = (id: string, a: P2, b: P2, half: number): void => { decks.push({ id, ax: a[0], az: a[1], bx: b[0], bz: b[1], half }); };
  const m = MARINA;
  add('walk-west', W(m.walk.x0, m.walk.z), W(m.gap.x0, m.walk.z), m.walk.half);
  add('walk-east', W(m.gap.x1, m.walk.z), W(m.walk.x1, m.walk.z), m.walk.half);
  PLACES.marinaPiers.forEach((p, k) => add(`pier-${k}`, [p.from[0], -(m.pier.rootZ[k] as number)], p.to, m.pier.half));
  const pp = PLACES.pleasurePier, mid = (pp.z0 + pp.z1) / 2;
  // from the beach's top out to the rectangle's far end over the water (the world's −x), then the wheel's platform
  add('pleasure', [-m.pleasure.x0, mid], [pp.x0, mid], m.pleasure.half);
  add('platform', [pp.x0, mid], [pp.x0 - m.platform.length, mid], m.platform.half);
}
/** The Quay's decks (world): the boardwalk's two halves, the four piers, the pleasure pier and its platform. */
export const DECKS: readonly Deck[] = decks;
const DECK_BOX = DECKS.reduce((b, d) => ({ x0: Math.min(b.x0, d.ax - d.half, d.bx - d.half), x1: Math.max(b.x1, d.ax + d.half, d.bx + d.half), z0: Math.min(b.z0, d.az - d.half, d.bz - d.half), z1: Math.max(b.z1, d.az + d.half, d.bz + d.half) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });

/** How far past its side a deck's footprint reaches (0 its own; the wall opens a little wider). */
function onDeck(x: number, z: number, margin: number): boolean {
  if (x < DECK_BOX.x0 - margin || x > DECK_BOX.x1 + margin || z < DECK_BOX.z0 - margin || z > DECK_BOX.z1 + margin) return false;
  for (const d of DECKS) {
    const dx = d.bx - d.ax, dz = d.bz - d.az, len2 = dx * dx + dz * dz;
    const t = ((x - d.ax) * dx + (z - d.az) * dz) / len2;
    if (t < 0 || t > 1) continue;
    if (Math.abs((x - d.ax) * dz - (z - d.az) * dx) / Math.sqrt(len2) <= d.half + margin) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the district's reads

/** The hills at (x, z) with the Quay's shapes: the stadium's floor levelled. */
export function quayShape(x: number, z: number, h: number): number {
  const dx = (x - ST.x) / ST.rx, dz = (z - ST.z) / ST.rz, e = Math.sqrt(dx * dx + dz * dz);
  if (e <= 1) return STADIUM_LEVEL;
  // about how far past the rim (short along the long axis: the ease is wider there)
  const out = (e - 1) * ST.rz;
  if (out >= BOWL) return h;
  const t = out / BOWL;
  return STADIUM_LEVEL + (h - STADIUM_LEVEL) * t * t * (3 - 2 * t);
}

/** The bay's floor at (x, z) with the reef raised off it. */
export function quaySeabed(x: number, z: number, h: number): number {
  if (x < REEF_BOX.x0 || x > REEF_BOX.x1 || z < REEF_BOX.z0 || z > REEF_BOX.z1) return h;
  for (const p of REEF) {
    const d2 = ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z)) / (p.r * p.r);
    if (d2 < 1) h = Math.max(h, REEF_TOP - REEF_RISE * d2);
  }
  return h;
}

/** Whether the Quay paves (x, z): a deck's boards, or the stadium's apron and concourse under its stands. */
export function quayPaved(x: number, z: number): boolean {
  if (onDeck(x, z, 0)) return true;
  const dx = x - OVAL.x, dz = z - OVAL.z;
  // between the track's outer edge and the back wall (the band off the oval's line, as ovals of its half axes widened)
  const inside = (off: number): boolean => (dx / (OVAL.r + off)) ** 2 + (dz / (OVAL.rz + off)) ** 2 < 1;
  return inside(STANDS.back) && !inside(STANDS.edge + 0.3);
}

/** Whether the island's wall opens at (x, z) on a shore: where a deck leaves the land. */
export function quayShore(x: number, z: number): boolean {
  return onDeck(x, z, 1.5);
}
