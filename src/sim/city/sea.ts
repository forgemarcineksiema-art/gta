/**
 * The sea (M8.8 slice 19): a surface at the rendered sea's level that only the hovercraft's rays meet, held in
 * `SEA.limit` m out from the seawall, and two slipways through Coral Quay's seawall down to it, on its south and east
 * edges clear of the piers. At a slipway the island's boundary is a gate every chassis but the hovercraft's stops at.
 */
import { PALETTE } from '../palette';
import { IDENTITY_QUAT, type StaticDesc } from '../scene';
import { CITY_HALF } from './roads';

/** The sea's surface (the rendered sea's height) and how far out from the seawall it holds the hovercraft, m. */
export const SEA = { level: -0.5, limit: 180 } as const;

/**
 * A slipway where it meets the seawall (`x`, `z` on the wall line) and its way out to sea (`nx`, `nz`). The ramp is
 * `width` m across and runs `run` m out from the parapet's inner face, from the promenade's deck (`top` m) down to
 * `foot` m, under the sea; the street furniture keeps `clear` m from its top.
 */
export interface Slipway { x: number; z: number; nx: number; nz: number }
export const SLIPWAY = { width: 8, run: 9, top: 0.18, foot: -1, thickness: 0.3, clear: 7 } as const;
/** The south one west of its pier, between a bench and a palm; the east one north of its pier, between two palms. */
export const SLIPWAYS: readonly Slipway[] = [
  { x: 497, z: CITY_HALF, nx: 0, nz: 1 },
  { x: CITY_HALF, z: 255, nx: 1, nz: 0 },
];

/** Where a slipway's top is on the promenade, `back` m in from the wall line. */
export function slipwayTop(s: Slipway, back = 4): { x: number; z: number } {
  return { x: s.x - s.nx * back, z: s.z - s.nz * back };
}

/** The slipways cutting a wall: the island's `axis` (0 the x = ±CITY_HALF walls, 1 the z ones) on its `sign` side, their places along it. */
export function slipwayGaps(axis: 0 | 1, sign: number): number[] {
  return SLIPWAYS.filter((s) => (axis === 0 ? s.nx : s.nz) === sign).map((s) => (axis === 0 ? s.z : s.x)).sort((a, b) => a - b);
}

/** A wall along [mid - half, mid + half] less a slipway's width at each gap: its pieces, each [middle, half length]. */
export function wallPieces(mid: number, half: number, gaps: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from = mid - half;
  for (const g of gaps) {
    const a = g - SLIPWAY.width / 2, b = g + SLIPWAY.width / 2;
    if (b <= from || a >= mid + half) continue;
    if (a > from) out.push([(from + a) / 2, (a - from) / 2]);
    from = Math.max(from, b);
  }
  if (mid + half > from) out.push([(from + mid + half) / 2, (mid + half - from) / 2]);
  return out;
}

/**
 * A slipway's statics: the ramp (a terrain box, tilted down to sea) and its two concrete kerbs, drawn by the chunk that
 * holds it.
 */
export function slipwayStatics(s: Slipway): StaticDesc[] {
  const w = SLIPWAY, drop = w.top - w.foot, length = Math.hypot(w.run, drop), tilt = Math.atan2(drop, w.run);
  const along = s.nz !== 0;
  // the parapet's inner face, where the ramp starts
  const x0 = s.x - s.nx, z0 = s.z - s.nz;
  // the surface's middle, and the box's middle half its thickness under it along the ramp's normal
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const mid = (w.top + w.foot) / 2;
  const half = w.thickness / 2;
  const cx = x0 + s.nx * (w.run / 2 - half * sin), cz = z0 + s.nz * (w.run / 2 - half * sin), cy = mid - half * cos;
  // tipped down toward the sea: about X for the south one, about Z for the east one
  const rotation = along ? { x: Math.sin(tilt / 2) * s.nz, y: 0, z: 0, w: Math.cos(tilt / 2) } : { x: 0, y: 0, z: -Math.sin(tilt / 2) * s.nx, w: Math.cos(tilt / 2) };
  // a box `offset` m across the ramp and `lift` m up its normal (which leans toward the sea) from the ramp's middle
  const box = (hx: number, hy: number, hz: number, offset: number, lift: number, color: number, tag: string): StaticDesc => ({
    shape: { kind: 'box', hx, hy, hz },
    position: { x: cx + (along ? offset : 0) + s.nx * sin * lift, y: cy + cos * lift, z: cz + (along ? 0 : offset) + s.nz * sin * lift },
    rotation, color, tag,
  });
  const ramp = box(along ? w.width / 2 : length / 2, half, along ? length / 2 : w.width / 2, 0, 0, PALETTE.kerb, 'kerb');
  const kerbs = [-1, 1].map((side) => box(along ? 0.2 : length / 2, 0.35, along ? length / 2 : 0.2, side * (w.width / 2 + 0.2), half + 0.35, PALETTE.lightGrey, 'decor'));
  return [ramp, ...kerbs];
}

/**
 * The sea trial (M8.8 slice 20): from its ring at the south slipway's top out past the first buoy, east along the
 * Quay's south shore, round the island's corner in two bends, north along the east shore and round the east pier's end,
 * to a finish off the east slipway: a kilometre with no turn sharper than 60° after the first. Each buoy counts when
 * passed within `reach` m, in order; the finish only after the last.
 */
export const SEA_TRIAL = {
  buoys: [
    { x: 497, z: 815 }, { x: 620, z: 835 }, { x: 740, z: 845 }, { x: 830, z: 855 }, { x: 875, z: 800 },
    { x: 880, z: 700 }, { x: 870, z: 560 }, { x: 895, z: 450 }, { x: 895, z: 350 }, { x: 850, z: 290 },
  ],
  finish: { x: 812, z: 255 },
  reach: 25,
} as const;

/** A buoy: a red float with a white band and a mast, on the sea's surface, drawn only (a hull goes through it). */
export function buoyStatics(b: { x: number; z: number }): StaticDesc[] {
  const at = (y: number, radius: number, halfHeight: number, color: number): StaticDesc => ({
    shape: { kind: 'cylinder', radius, halfHeight }, position: { x: b.x, y, z: b.z }, rotation: IDENTITY_QUAT, color, tag: 'decor',
  });
  return [
    at(SEA.level + 0.35, 0.7, 0.45, PALETTE.carRed),
    at(SEA.level + 0.85, 0.72, 0.1, PALETTE.carWhite),
    at(SEA.level + 1.6, 0.08, 0.7, PALETTE.lightGrey),
    at(SEA.level + 2.35, 0.25, 0.1, PALETTE.carRed),
  ];
}
