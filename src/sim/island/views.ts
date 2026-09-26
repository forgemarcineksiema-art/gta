/**
 * The ground read on its view's grid (M8.10 slice 18): `VIEW_GRID` points a side of a chunk, row by row (the view's
 * order); each point's surface's height, its distances to a steep shore and to a road's edge (no further than
 * `VIEW_FAR`), the steep shore's kind, the cover, the Gardens' marks. The heights and the distances in cm, each as the
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

export interface ViewReadings { h: Int16Array; steep: Int16Array; road: Int16Array; kind: Int8Array; surface: Uint8Array; laid: Uint8Array }

const probe: GroundProbe = { h: 0, steep: 0, steepKind: -1, road: Infinity, surface: GRASS };

/** A chunk's view readings: its corner (x0, z0), its side (m). */
export function readView(ground: Ground, x0: number, z0: number, side: number): ViewReadings {
  const n = VIEW_GRID * VIEW_GRID, step = side / (VIEW_GRID - 1), cm = (v: number): number => Math.round(Math.min(v, VIEW_FAR) * 100);
  const r: ViewReadings = { h: new Int16Array(n), steep: new Int16Array(n), road: new Int16Array(n), kind: new Int8Array(n), surface: new Uint8Array(n), laid: new Uint8Array(n) };
  let ph = 0, ps = 0, pr = 0;
  for (let k = 0; k < n; k++) {
    const x = x0 + (k % VIEW_GRID) * step, z = z0 + Math.floor(k / VIEW_GRID) * step;
    ground.probe(x, z, probe);
    const h = Math.round(probe.h * 100), s = cm(probe.steep), d = cm(probe.road);
    r.h[k] = h - ph; r.steep[k] = s - ps; r.road[k] = d - pr;
    ph = h; ps = s; pr = d;
    r.kind[k] = probe.steepKind;
    r.surface[k] = probe.surface;
    r.laid[k] = gardensGround(x, z);
  }
  return r;
}
