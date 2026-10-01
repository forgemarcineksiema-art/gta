/**
 * The ground read on its view's grid (M8.10 slice 18): `VIEW_GRID` points a side of a chunk, row by row (the view's
 * order); each point's surface's height, its distances to a steep shore and to a road's edge (no further than
 * `VIEW_FAR`), the steep shore's kind, the cover, the Gardens' marks, and how far a point past a carriageway stands over
 * its edge (`drop`: the view's ground keeps under the road's strip). The heights and the distances in cm, each as the
 * step from the point before: the island's bake keeps every chunk's (a quarter of a MB), so the view starts drawing the
 * ground without reading it point by point.
 */
import { gardensGround } from './shapes/gardens';
import type { Ground, GroundProbe } from './ground';
import { GRASS } from '../city/surface';

/** Points a side of a chunk's view grid. */
export const VIEW_GRID = 65;
/** A distance to a steep shore or a road's edge is kept up to this (m): the view reads none further. */
export const VIEW_FAR = 300;
/** A point past a carriageway within this many grid steps of its edge (the finest triangle's reach) is drawn no higher than the edge (M8.10). */
const EDGE_STEPS = 1.5;

export interface ViewReadings { h: Int16Array; steep: Int16Array; road: Int16Array; kind: Int8Array; surface: Uint8Array; laid: Uint8Array; drop: Int16Array }

const probe: GroundProbe = { h: 0, steep: 0, steepKind: -1, road: Infinity, surface: GRASS };

/** The junctions as the view reads them: the ground under a point's asphalt (NaN: none), the ground at the nearest rim within reach (NaN: none). */
export interface JunctionCover { floor(x: number, z: number): number; rim(x: number, z: number, reach: number): number }

/**
 * A chunk's view readings: its corner (x0, z0), its side (m); a point in a junction's polygon reads as on a carriageway
 * and one past its rim as past a carriageway's edge (a corner's curve reaches past both roads' edges: the grass drawn
 * through its asphalt, and a grid point up a Crown bank beside a crossing lifted the ground 0.6 m over it, 2026-09-28).
 */
export function readView(ground: Ground, x0: number, z0: number, side: number, cover: JunctionCover | null = null): ViewReadings {
  const n = VIEW_GRID * VIEW_GRID, step = side / (VIEW_GRID - 1), cm = (v: number): number => Math.round(Math.min(v, VIEW_FAR) * 100), reach = EDGE_STEPS * step;
  const r: ViewReadings = { h: new Int16Array(n), steep: new Int16Array(n), road: new Int16Array(n), kind: new Int8Array(n), surface: new Uint8Array(n), laid: new Uint8Array(n), drop: new Int16Array(n) };
  let ph = 0, ps = 0, pr = 0;
  for (let k = 0; k < n; k++) {
    const x = x0 + (k % VIEW_GRID) * step, z = z0 + Math.floor(k / VIEW_GRID) * step;
    ground.probe(x, z, probe);
    // under a junction's asphalt: no higher than it, on its carriageway
    const floor = cover !== null ? cover.floor(x, z) : NaN;
    if (Number.isFinite(floor)) {
      probe.h = Math.min(probe.h, floor - 0.02);
      if (probe.road > -1) probe.road = -1;
    }
    const h = Math.round(probe.h * 100), s = cm(probe.steep), d = cm(probe.road);
    // over the nearest carriageway's edge (a bank rising from it), how far: the view lowers the point to the edge
    if (probe.road > 0 && probe.road < reach) {
      const edge = ground.edgeHeight(x, z, reach);
      if (Number.isFinite(edge)) r.drop[k] = Math.max(0, Math.min(30000, h - Math.round(edge * 100)));
    }
    // and to a junction's rim (its corners' curves past both roads' edges)
    if (probe.road > 0 && cover !== null) {
      const rim = cover.rim(x, z, reach);
      if (Number.isFinite(rim)) r.drop[k] = Math.max(r.drop[k] as number, Math.min(30000, h - Math.round(rim * 100)));
    }
    r.h[k] = h - ph; r.steep[k] = s - ps; r.road[k] = d - pr;
    ph = h; ps = s; pr = d;
    r.kind[k] = probe.steepKind;
    r.surface[k] = probe.surface;
    r.laid[k] = gardensGround(x, z);
  }
  return r;
}
