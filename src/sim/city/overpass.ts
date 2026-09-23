/**
 * The highway's four overpasses (M5.5 slice 8; DESIGN.md §5, M4_PLAN §5 B):
 * at the ring's crossings with the central streets the carriageway climbs an
 * embankment between retaining walls, spans the street on a deck over a
 * girder and comes down the other side. Built from pitched boxes along the
 * road graph's height profile (`overpassProfile`): the road slabs are terrain
 * (the suspension rides them, as it rides the ground), the walls, parapets,
 * abutments and girder are solid, the lane lines are paint. The street runs
 * on under the deck to its stub by the sea.
 */
import { PALETTE } from '../palette';
import { IDENTITY_QUAT, type Quat, type StaticDesc } from '../scene';
import { BLOCK, HIGHWAY_HALF, OVERPASS, OVERPASS_NODES, overpassProfile } from './roads';

/** Metres: a ramp piece's length, the slab's half thickness, the walls' half thickness, the parapet over the road. */
const PIECE = 10;
const SLAB = 0.2;
const WALL = 0.3;
const PARAPET = 1;
/** The lane lines across the carriageway (m right of the ring's centreline) and their colours: the centre, the lane dashes, the edges. */
const LINES: ReadonlyArray<readonly [number, number]> = [
  [0, PALETTE.roadYellow], [-8, PALETTE.roadWhite], [8, PALETTE.roadWhite], [-(HIGHWAY_HALF - 3), PALETTE.roadWhite], [HIGHWAY_HALF - 3, PALETTE.roadWhite],
];

function axisAngle(x: number, y: number, z: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(angle / 2) };
}

export function overpassStatics(k: number): StaticDesc[] {
  const [gx, gz] = OVERPASS_NODES[k] as readonly [number, number];
  const cx = gx * BLOCK, cz = gz * BLOCK;
  const alongX = Math.abs(gz) === 3;
  const out: StaticDesc[] = [];
  const o = OVERPASS;
  /** A box in the overpass's frame (u along the ring, v across it), pitched by `phi` (rising toward +u). */
  const box = (u: number, y: number, v: number, hu: number, hy: number, hv: number, phi: number, color: number, tag: string): void => {
    const rotation = phi === 0 ? IDENTITY_QUAT : alongX ? axisAngle(0, 0, 1, phi) : axisAngle(1, 0, 0, -phi);
    out.push({
      shape: { kind: 'box', hx: alongX ? hu : hv, hy, hz: alongX ? hv : hu },
      position: { x: cx + (alongX ? u : v), y, z: cz + (alongX ? v : u) }, rotation, color, tag,
    });
  };
  /** A pitched box whose top face, at the piece's middle, stands `top` m over the road's profile. */
  const onRoad = (um: number, hm: number, phi: number, half: number, top: number, hy: number, v: number, hv: number, color: number, tag: string): void => {
    box(um + hy * Math.sin(phi), hm + top - hy * Math.cos(phi), v, half, hy, hv, phi, color, tag);
  };
  const piece = (ua: number, ub: number): void => {
    const ha = overpassProfile(ua), hb = overpassProfile(ub);
    const phi = Math.atan2(hb - ha, ub - ua);
    const half = Math.hypot(ub - ua, hb - ha) / 2 + 0.05;
    const um = (ua + ub) / 2, hm = (ha + hb) / 2;
    onRoad(um, hm, phi, half, 0, SLAB, 0, HIGHWAY_HALF, PALETTE.asphalt, 'kerb');
    // the retaining walls, from a metre under the ground to the parapet's top
    const wall = (hm + PARAPET + 1) / 2;
    for (const side of [-1, 1]) onRoad(um, hm, phi, half, PARAPET, wall, side * (HIGHWAY_HALF + WALL), WALL, PALETTE.concrete, 'building');
    for (const [v, color] of LINES) onRoad(um, hm, phi, half, 0.02, 0.01, v, 0.12, color, 'decor');
  };
  const end = o.deck + o.ramp;
  for (const sign of [-1, 1]) for (let d = o.deck; d < end - 1e-6; d += PIECE) {
    const a = sign * d, b = sign * Math.min(end, d + PIECE);
    piece(Math.min(a, b), Math.max(a, b));
  }
  // the deck over the crossing: the slab on a girder, parapets, no walls under it (the street passes)
  const H = o.height;
  box(0, H - SLAB, 0, o.deck + 0.05, SLAB, HIGHWAY_HALF, 0, PALETTE.asphalt, 'kerb');
  box(0, H - 2 * SLAB - 0.6, 0, o.deck + 0.05, 0.6, HIGHWAY_HALF + 2 * WALL, 0, PALETTE.concrete, 'building');
  for (const side of [-1, 1]) box(0, H + PARAPET / 2, side * (HIGHWAY_HALF + WALL), o.deck + 0.05, PARAPET / 2, WALL, 0, PALETTE.concrete, 'building');
  for (const [v, color] of LINES) box(0, H + 0.01, v, o.deck, 0.01, 0.12, 0, color, 'decor');
  // the abutments close the embankments' ends toward the crossing
  for (const sign of [-1, 1]) box(sign * (o.deck + 0.4), (H - 0.4) / 2, 0, 0.4, (H - 0.4) / 2, HIGHWAY_HALF + 2 * WALL, 0, PALETTE.concrete, 'building');
  return out;
}
