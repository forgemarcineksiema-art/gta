/**
 * Covered streets (M5.5 slice 7; docs/M4_PLAN.md §5 A, DESIGN.md §5): one per
 * district over the middle of a grid street near the district's drop-off (the
 * landmark in the Gardens, which has none): an arcade under a frontage row in
 * Crown Heights, a factory gantry in Sunset Works, a tree-canopy tunnel in
 * Palm Gardens, a warehouse pass-through on the Coral Quay. Static boxes only,
 * the road graph untouched: a roof over the carriageway and both pavements,
 * walls along the building lines, both ends open. The roof and walls are
 * solid ('building'), so the police's sight rays and the camera's boom meet
 * them; inside, nothing sees in but along the street.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import { IDENTITY_QUAT, quatFromYaw, type StaticDesc } from '../scene';
import { BLOCK, ROAD_HALF, distanceToPolyline, type RoadGraph } from './roads';

export type CoverStyle = 'arcade' | 'gantry' | 'canopy' | 'warehouse';

export interface CoverDesc {
  district: string;
  style: CoverStyle;
  /** Centre on the street's axis, and the axis it runs along. */
  x: number;
  z: number;
  axis: 'x' | 'z';
}

/** Metres: the covered length, the half width to the inner face of the walls (carriageway and pavements), the roof's underside. */
export const COVER = { length: 64, half: ROAD_HALF + 4.5, height: 6.4, wall: 0.3, clear: 45 } as const;

const STYLE: Record<string, CoverStyle> = { crown: 'arcade', foundry: 'gantry', gardens: 'canopy', marina: 'warehouse' };

/** A point the cover keeps clear of (a door, a ramp, a camera pole, a landmark's plaza), with its radius. */
export interface CoverAvoid { x: number; z: number; r: number }

/**
 * One covered street per district: the grid street segment between two inner junctions whose middle is
 * nearest the district's anchor (its drop-off door, or its landmark) with the covered stretch clear of the
 * authored roads and of every avoid point.
 */
export function placeCovers(graph: RoadGraph, anchors: Record<string, { x: number; z: number }>, avoid: readonly CoverAvoid[]): CoverDesc[] {
  const seen = new Set<string>();
  const candidates: Array<{ x: number; z: number; axis: 'x' | 'z' }> = [];
  for (const lane of graph.lanes) {
    if (lane.highway || lane.special || lane.points.length !== 2) continue;
    const a = graph.nodes[lane.from], b = graph.nodes[lane.to];
    if (!a || !b) continue;
    // both ends inner junctions, one block apart
    if (Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)) > 2 * BLOCK + 1) continue;
    if (Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - BLOCK) > 1) continue;
    const key = lane.from < lane.to ? `${lane.from}-${lane.to}` : `${lane.to}-${lane.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, axis: Math.abs(b.x - a.x) > Math.abs(b.z - a.z) ? 'x' : 'z' });
  }
  const out: CoverDesc[] = [];
  for (const [district, anchor] of Object.entries(anchors)) {
    const sx = district === 'foundry' || district === 'marina' ? 1 : -1, sz = district === 'gardens' || district === 'marina' ? 1 : -1;
    let best: CoverDesc | null = null, bestD = Infinity;
    for (const c of candidates) {
      // inside the district's quadrant, off its border streets
      if (c.x * sx < COVER.half + 10 || c.z * sz < COVER.half + 10) continue;
      if (!clearOf(c, graph, avoid)) continue;
      const d = Math.hypot(c.x - anchor.x, c.z - anchor.z);
      if (d < bestD) { bestD = d; best = { district, style: STYLE[district] ?? 'arcade', x: c.x, z: c.z, axis: c.axis }; }
    }
    if (best) out.push(best);
  }
  return out;
}

function clearOf(c: { x: number; z: number; axis: 'x' | 'z' }, graph: RoadGraph, avoid: readonly CoverAvoid[]): boolean {
  const L = COVER.length / 2;
  const ax = c.axis === 'x' ? 1 : 0, az = 1 - ax;
  // the stretch as a segment; a point's distance to it
  const dist = (px: number, pz: number): number => {
    const u = Math.max(-L, Math.min(L, (px - c.x) * ax + (pz - c.z) * az));
    return Math.hypot(px - (c.x + ax * u), pz - (c.z + az * u));
  };
  for (const p of avoid) if (dist(p.x, p.z) < p.r) return false;
  for (const road of graph.special) {
    for (let u = -L; u <= L; u += 8) {
      if (distanceToPolyline(road.centre, c.x + ax * u, c.z + az * u) < road.halfWidth + COVER.half + 12) return false;
    }
  }
  return true;
}

/** Inside a cover's footprint grown by `margin` m (trees and lamps stay out of it). */
export function insideCover(covers: readonly CoverDesc[], x: number, z: number, margin = 0): boolean {
  for (const c of covers) {
    const u = c.axis === 'x' ? x - c.x : z - c.z, v = c.axis === 'x' ? z - c.z : x - c.x;
    if (Math.abs(u) <= COVER.length / 2 + margin && Math.abs(v) <= COVER.half + COVER.wall + margin) return true;
  }
  return false;
}

/** The cover's boxes in world space. Solid parts are 'building' (colliders); the dressing is 'decor'. */
export function coverStatics(c: CoverDesc): StaticDesc[] {
  const out: StaticDesc[] = [];
  const alongX = c.axis === 'x';
  /** A box in the cover's frame: u along the street, v across it. */
  const box = (u: number, y: number, v: number, hu: number, hy: number, hv: number, color: number, solid = true): void => {
    out.push({
      shape: { kind: 'box', hx: alongX ? hu : hv, hy, hz: alongX ? hv : hu },
      position: { x: c.x + (alongX ? u : v), y, z: c.z + (alongX ? v : u) },
      rotation: IDENTITY_QUAT, color, tag: solid ? 'building' : 'decor',
    });
  };
  const L = COVER.length / 2, W = COVER.half, H = COVER.height, t = COVER.wall;
  switch (c.style) {
    case 'arcade': {
      // the frontage row carried over the street: stone walls with dark arches, two storeys above, a cornice
      for (const s of [-1, 1]) {
        box(0, H / 2, s * (W + t), L, H / 2, t, CITY_COLORS.stone);
        for (let u = -L + 4; u < L; u += 8) box(u, 2.6, s * (W - 0.02), 2.6, 2.3, 0.02, CITY_COLORS.shop, false);
      }
      box(0, H + 3.2, 0, L, 3.2, W + 0.6, CITY_COLORS.stone);
      for (const e of [-1, 1]) {
        for (const y of [H + 1.6, H + 4.6]) box(e * (L + 0.01), y, 0, 0.02, 0.7, W - 1.5, CITY_COLORS.window, false);
        box(e * (L + 0.05), H + 0.15, 0, 0.08, 0.15, W + 0.6, CITY_COLORS.lavender, false);
      }
      box(0, H * 2 + 0.2, 0, L + 0.3, 0.2, W + 0.9, CITY_COLORS.lavender, false);
      for (let u = -L + 12; u < L; u += 16) box(u, H - 0.08, 0, 0.6, 0.06, 0.6, PALETTE.laneMark, false);
      break;
    }
    case 'gantry': {
      // portal frames of steel, sheet walls to head height, a corrugated roof, a yellow crane bridge
      for (let u = -L; u <= L; u += 8) {
        for (const s of [-1, 1]) box(u, H / 2, s * (W + 0.25), 0.25, H / 2, 0.25, PALETTE.steel);
        box(u, H - 0.25, 0, 0.2, 0.25, W + 0.5, PALETTE.slate, false);
      }
      for (const s of [-1, 1]) box(0, 1.5, s * (W + 0.3), L, 1.5, 0.08, CITY_COLORS.brick);
      box(0, H + 0.2, 0, L + 0.5, 0.2, W + 1, PALETTE.graphite);
      for (let u = -L + 2; u < L; u += 4) box(u, H + 0.45, 0, 0.5, 0.05, W + 1, PALETTE.steel, false);
      for (const s of [-1, 1]) box(0, H - 0.8, s * (W - 1.5), L, 0.15, 0.15, PALETTE.slate, false);
      box(10, H - 1.15, 0, 0.4, 0.35, W - 1.2, PALETTE.coin, false);
      box(10, H - 1.9, 3, 0.2, 0.4, 0.2, PALETTE.charcoal, false);
      break;
    }
    case 'canopy': {
      // plane trees planted close either side, a clipped hedge between them, the crowns grown into one roof
      for (let u = -L; u <= L; u += 8) for (const s of [-1, 1]) box(u, 3.4, s * (W + 0.4), 0.35, 3.4, 0.35, 0x8b7966);
      for (const s of [-1, 1]) box(0, 1.1, s * (W + 0.4), L, 1.1, 0.5, CITY_COLORS.hedge);
      box(0, H + 0.6, 0, L + 1, 0.6, W + 2.5, CITY_COLORS.leaves);
      const lumps: Array<[number, number, number, number]> = [[-24, 0.9, -6, 5], [-9, 1.1, 5, 6], [7, 0.8, -4, 5.5], [22, 1, 6, 5], [-18, 0.7, 9, 4], [15, 0.9, -10, 4.5]];
      for (const [u, h, v, r] of lumps) box(u, H + 1.2 + h / 2, v, r, h, r * 0.8, CITY_COLORS.hedge, false);
      for (let u = -L + 4; u < L; u += 8) for (const s of [-1, 1]) box(u, H - 0.35, s * (W - 0.6), 1.6, 0.4, 0.7, CITY_COLORS.hedge, false);
      break;
    }
    case 'warehouse': {
      // a brick shed the quay road runs through: full walls with high windows, lintels over the open ends, a gable roof
      for (const s of [-1, 1]) {
        box(0, (H + 1) / 2, s * (W + t), L, (H + 1) / 2, t, CITY_COLORS.brick);
        box(0, H - 0.6, s * (W - 0.02), L - 2, 0.45, 0.02, CITY_COLORS.windowLight, false);
      }
      for (const e of [-1, 1]) {
        box(e * L, H - 0.2, 0, 0.4, 1.2, W + 0.6, CITY_COLORS.brick);
        box(e * (L + 0.41), H - 1.3, 0, 0.02, 0.12, W, CITY_COLORS.trim, false);
      }
      box(0, H + 1.1, 0, L, 0.2, W + 0.6, CITY_COLORS.roof);
      out.push({
        // the ridge runs down the street: along X unturned, turned a quarter for a street along Z
        shape: { kind: 'gable', hx: L + 0.4, hy: 1.6, hz: W + 1 },
        position: { x: c.x, y: H + 2.9, z: c.z }, rotation: alongX ? IDENTITY_QUAT : quatFromYaw(Math.PI / 2), color: CITY_COLORS.roof, tag: 'decor',
      });
      for (let u = -L + 10; u < L; u += 14) box(u, H - 0.05, 0, 0.5, 0.05, 0.5, PALETTE.laneMark, false);
      break;
    }
  }
  return out;
}
