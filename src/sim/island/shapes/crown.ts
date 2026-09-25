/**
 * Crown Heights' shapes in the ground (M8.10 slice 8, docs/M8.10_PLAN.md) and where its places stand, as plan data the
 * ground, the fill and the places read alike: the quarry's terraced pit (benches every 4 m down to its floor at 24 m, in
 * its northern part, where its tracks can reach); the summit's plaza levelled round the tower; a mound over the tunnel's
 * shallow end under the serpentine; the multi-storey car park's pad, level with the street at its door, and the
 * hideout's, level with its street. The places' boxes are world metres (+X west, +Z north), set by the streets slice 5
 * lays round them (Crown's grid lines x 200, 290, 470 and z 140; Crown Avenue). Reads the plan only.
 */
import { distanceToPolyline, inPolygon, type P2 } from '../geom';
import { PLACES, ROADS, naturalHeight } from '../plan';

/** A box of the world, its minima and maxima (m). */
export interface Box { x0: number; x1: number; z0: number; z1: number }

/**
 * The multi-storey car park (PLACES.carPark, the block between the z 140 street, the x 290 street and Crown Avenue): four
 * decks over the ground floor, the fourth its roof; a ramp between each two, up one lane and down the other, round the
 * core between them. `lanes` are the two lanes' middles (x), `ramps` where the ramps run (z), `floor` the ground floor's
 * height (the z 140 street's at its door), `rise` a level's.
 */
export const CAR_PARK = {
  x0: 243.5, x1: 264.5, z0: 156, z1: 199,
  floor: 15.3, rise: 3, decks: 4,
  lanes: [247, 261] as const, lane: 3,
  core: { x0: 250, x1: 258 },
  ramps: { z0: 167, z1: 188 },
  /** The ground levelled under it and its forecourt (off the avenue's embankment, see `carParkPad`). */
  pad: { x0: 214, x1: 268, z0: 153, z1: 202 },
} as const;

/**
 * The roof-to-roof jump: off the car park's roof over the z 140 street, from a kicker on the western lane's end, onto the
 * flat roof of an office block across the street (its box, `LANDING.floors` high, kept free of the fill's lots).
 */
export const KICKER = { length: 6, height: 1, half: 3 } as const;
export const LANDING: Box & { floors: number } = { x0: 246, x1: 272, z0: 76, z1: 124, floors: 2 };

/** The hideout: its garage beside the x 470 street under the summit, its door on the street (GARAGES' hideout). */
export const HIDEOUT = { x: 493.3, z: 265, yaw: Math.PI / 2, floor: 42.4, pad: { x0: 480, x1: 507, z0: 254, z1: 276 } } as const;

/**
 * The police headquarters (PLACES.headquarters, by the centre's roundabout): the building facing its yard, the yard's
 * walls and its gate on the west avenue, the bays where the units park (two rows along the walls, noses in).
 */
export const HQ = {
  building: { x0: 160, x1: 186, z0: 70, z1: 112, floors: 4 },
  yard: { x0: 124, x1: 160, z0: 66, z1: 114 },
  gate: { x0: 132, x1: 146 },
  bays: { rows: [127.25, 156.75] as const, z0: 76, pitch: 3.2, count: 10, depth: 5.5, width: 3 },
} as const;

/** The arcade: a glazed roof over the x 290 street between its crossings at z 410 and 500, on columns along its pavements. */
export const ARCADE = { x: 290, z0: 422, z1: 490, half: 13, column: 11.2, clear: 6.2, bays: 8 } as const;

/** The Crown Tower on the summit's plaza (PLACES.towerTop): its top over the plaza (m). */
export const TOWER = { top: 118 } as const;

/** The summit's plaza levelled at its ring road's height (its mean, m), flat to `flat` m round the tower, eased to `r`. */
export const PLAZA = { level: 48.5, flat: 60, r: 70 } as const;

/**
 * The mound over the tunnel's shallow end (its first 70 m from the south-western mouth stand out of the hill): the
 * serpentine's third hairpin crosses it there, so the ground rises `h` m round (x, z), eased out over `r` m, clear of
 * the highway at the mouth, and the hairpin runs over the tunnel's roof, not into it.
 */
export const MOUND = { x: 740, z: 302, h: 5.5, r: 55 } as const;

/**
 * The quarry's pit, its northern part (the quarry north of `south`): cut `depth` into the hill `reach` in from its edge,
 * never under `floor`, stepped into flat benches `step` high, each face no steeper than `face` (rise over run: the
 * benches as wide as the hill's fall leaves them), eased in over `lip` from the edge. Its floor is where the northern
 * track can reach within its grade; the southern part is the hill's own dirt, the way in from the serpentine.
 */
export const PIT = { floor: 24, depth: 24, reach: 80, step: 4, face: 0.85, lip: 8, south: 505 } as const;

/** The quarry's edge's jump: a kicker, its lip on the rim straight on from the serpentine's first hairpin, into the pit. */
export const QUARRY_KICKER = { x: 722, z: 437.7, yaw: Math.atan2(0.862, 0.507), length: 6, height: 1.1, half: 3 } as const;

const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The pit's outline: the quarry's, clipped at `PIT.south` (its edges crossing that line cut there). */
const PIT_OUTLINE: readonly P2[] = ((): P2[] => {
  const q = PLACES.quarry as readonly P2[], out: P2[] = [], s = PIT.south;
  for (let i = 0; i < q.length; i++) {
    const a = q[i] as P2, b = q[(i + 1) % q.length] as P2;
    if (a[1] >= s) out.push(a);
    if ((a[1] >= s) !== (b[1] >= s)) out.push([a[0] + ((s - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), s]);
  }
  return out;
})();
const PIT_RING: readonly P2[] = [...PIT_OUTLINE, PIT_OUTLINE[0] as P2];
const QX0 = Math.min(...PIT_OUTLINE.map((p) => p[0])), QX1 = Math.max(...PIT_OUTLINE.map((p) => p[0]));
const QZ1 = Math.max(...PIT_OUTLINE.map((p) => p[1]));

/** Crown Avenue's straight: a point's signed distance from its line (+ on the side away from the car park). */
const AVENUE = ((): { ax: number; az: number; nx: number; nz: number } => {
  const r = ROADS.find((q) => q.id === 'crown-avenue-up');
  const a: P2 = r?.points[0] ?? [32, 74], b: P2 = r?.points[r.points.length - 1] ?? [406, 352];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { ax: a[0], az: a[1], nx: -(b[1] - a[1]) / l, nz: (b[0] - a[0]) / l };
})();
export function avenueSide(x: number, z: number): number {
  return (x - AVENUE.ax) * AVENUE.nx + (z - AVENUE.az) * AVENUE.nz;
}

/** How far (x, z) is outside a box (0 inside). */
function outside(b: Box, x: number, z: number): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

/** The quarry's pit at (x, z), given the hill's height there. */
function pit(x: number, z: number, h: number): number {
  if (z < PIT.south || x < QX0 || x > QX1 || z > QZ1 || !inPolygon(x, z, PIT_OUTLINE)) return h;
  const inside = distanceToPolyline(x, z, PIT_RING);
  // cut evenly deeper in from the edge, so the benches come out alike
  const target = Math.max(PIT.floor, h - PIT.depth * Math.min(1, inside / PIT.reach));
  if (target >= h) return h;
  // a step's face takes the share of its run that keeps it at `face`: the hill's fall and the cut's together set the run
  const e = 0.5, fall = Math.hypot(naturalHeight(x + e, z) - naturalHeight(x - e, z), naturalHeight(x, z + e) - naturalHeight(x, z - e)) / (2 * e);
  const wall = Math.min(0.95, (fall + PIT.depth / PIT.reach) / PIT.face);
  const u = target / PIT.step, i = Math.floor(u), f = u - i;
  const benched = PIT.step * (i + Math.max(0, Math.min(1, (f - (1 - wall)) / wall)));
  return h + (Math.min(h, benched) - h) * smooth01(inside / PIT.lip) * smooth01(h - target);
}

/** A pad: the ground at `level` over `box`, eased back to the hill over `blend` m (and `fade`, a share, 1 by default). */
function pad(box: Box, level: number, blend: number, x: number, z: number, h: number, fade = 1): number {
  const out = outside(box, x, z);
  if (out >= blend || fade <= 0) return h;
  return h + (level - h) * (1 - smooth01(out / blend)) * fade;
}

/** The hills' height at (x, z) with Crown Heights' shapes: the quarry's pit, the plaza, the car park's and the hideout's pads. */
export function crownShape(x: number, z: number, h: number): number {
  let out = pit(x, z, h);
  const r = Math.hypot(x - PLACES.summitPlaza.x, z - PLACES.summitPlaza.z);
  if (r < PLAZA.r) out += (PLAZA.level - out) * (1 - smooth01((r - PLAZA.flat) / (PLAZA.r - PLAZA.flat)));
  const m = Math.hypot(x - MOUND.x, z - MOUND.z);
  if (m < MOUND.r) out += MOUND.h * (1 - smooth01(m / MOUND.r));
  const cp = CAR_PARK.pad;
  if (x > cp.x0 - 8 && x < cp.x1 + 8 && z > cp.z0 - 8 && z < cp.z1 + 8) {
    // off Crown Avenue's embankment: the pad fades out 16–24 m from its middle, so the avenue's profile is its own
    out = pad(cp, CAR_PARK.floor, 6, x, z, out, smooth01((-avenueSide(x, z) - 16) / 8));
  }
  const hp = HIDEOUT.pad;
  if (x > hp.x0 - 8 && x < hp.x1 + 8 && z > hp.z0 - 8 && z < hp.z1 + 8) out = pad(hp, HIDEOUT.floor, 6, x, z, out);
  return out;
}

/** Whether (x, z) is kept free of the fill's lots for Crown's places: the hideout's lot and the jump's landing block. */
export function crownReserved(x: number, z: number): boolean {
  return outside(HIDEOUT.pad, x, z) < 4 || outside(LANDING, x, z) < 6;
}
