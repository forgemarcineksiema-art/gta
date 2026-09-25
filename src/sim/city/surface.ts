/**
 * The ground under the wheels (M8.8 slice 9): a grid of 2 m cells over the island, each asphalt, grass or dirt. A
 * chunk lays its flat ground statics into it the first time the city generates it, the topmost over each cell's
 * centre deciding: the grass of the ground under the blocks, the parks, the Gardens' lawns and the parkway's verges;
 * the dirt of the quarters' soil; asphalt for everything else that is paved (the roads, the kerbs, the yards, the
 * plazas, the promenade, a garage's floor). A cell no chunk has laid reads asphalt; so does the playground, which has
 * no map. The wheels read it in O(1) with no allocation.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import type { StaticDesc } from '../scene';
import { CITY_HALF } from './roads';

export const ASPHALT = 0;
export const GRASS = 1;
export const DIRT = 2;
/** The island's beaches (M8.10 slice 3): a grip between dirt's and the road's, dirt's drag. */
export const SAND = 3;
export type SurfaceKind = typeof ASPHALT | typeof GRASS | typeof DIRT | typeof SAND;

/** What the wheels read: the surface at a point of the ground. */
export interface SurfaceReader {
  at(x: number, z: number): SurfaceKind;
}

const CELL = 2;
const SIDE = Math.ceil((2 * CITY_HALF) / CELL);
/** A ground static is flat and low: at most this thick and its top at most this high (m). */
const FLAT = 0.3;
const LOW = 0.4;
/** A cell nothing was laid on. */
const NONE = -32768;

/** The surface a flat static's colour stands for. */
function kindOf(color: number): SurfaceKind {
  return color === PALETTE.grass ? GRASS : color === CITY_COLORS.soil ? DIRT : ASPHALT;
}

export class SurfaceMap implements SurfaceReader {
  /** Each cell's surface, row by row along x (788 × 788). */
  readonly kinds = new Uint8Array(SIDE * SIDE);
  /** The top of the static that decided it, mm (NONE: nothing laid). */
  private readonly tops = new Int16Array(SIDE * SIDE).fill(NONE);

  at(x: number, z: number): SurfaceKind {
    const i = Math.floor((x + CITY_HALF) / CELL), j = Math.floor((z + CITY_HALF) / CELL);
    if (i < 0 || j < 0 || i >= SIDE || j >= SIDE) return ASPHALT;
    return this.kinds[j * SIDE + i] as SurfaceKind;
  }

  /** Lay a chunk's flat ground statics: a cell whose centre one covers takes its surface if its top is the highest yet. */
  lay(statics: readonly StaticDesc[]): void {
    for (const st of statics) {
      const s = st.shape;
      if (s.kind === 'box') {
        const q = st.rotation;
        // turned about the vertical only (a ramp's pitched slab is not ground)
        if (2 * s.hy > FLAT || st.position.y + s.hy > LOW || Math.abs(q.x) > 1e-4 || Math.abs(q.z) > 1e-4) continue;
        this.box(st.position.x, st.position.z, s.hx, s.hz, 2 * Math.atan2(q.y, q.w), st.position.y + s.hy, kindOf(st.color));
      } else if (s.kind === 'prism') {
        if (s.y1 - s.y0 > FLAT || s.y1 > LOW) continue;
        this.polygon(s.points, s.y1, kindOf(st.color));
      }
    }
  }

  private put(i: number, j: number, top: number, kind: SurfaceKind): void {
    const c = j * SIDE + i;
    const was = this.tops[c] as number;
    // the higher wins; on a tie asphalt before grass before dirt, so the order the chunks come in never matters
    if (top > was || (top === was && kind < (this.kinds[c] as number))) {
      this.tops[c] = top;
      this.kinds[c] = kind;
    }
  }

  private box(x: number, z: number, hx: number, hz: number, yaw: number, top: number, kind: SurfaceKind): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const mm = Math.round(top * 1000);
    const i0 = Math.max(0, Math.ceil((x - ex + CITY_HALF) / CELL - 0.5)), i1 = Math.min(SIDE - 1, Math.floor((x + ex + CITY_HALF) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((z - ez + CITY_HALF) / CELL - 0.5)), j1 = Math.min(SIDE - 1, Math.floor((z + ez + CITY_HALF) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) {
      const dz = (j + 0.5) * CELL - CITY_HALF - z;
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * CELL - CITY_HALF - x;
        // into the box's frame: a yaw turns local +z toward world +x
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) this.put(i, j, mm, kind);
      }
    }
  }

  private polygon(points: ReadonlyArray<{ x: number; z: number }>, top: number, kind: SurfaceKind): void {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const mm = Math.round(top * 1000);
    const i0 = Math.max(0, Math.ceil((minX + CITY_HALF) / CELL - 0.5)), i1 = Math.min(SIDE - 1, Math.floor((maxX + CITY_HALF) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((minZ + CITY_HALF) / CELL - 0.5)), j1 = Math.min(SIDE - 1, Math.floor((maxZ + CITY_HALF) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) {
      const pz = (j + 0.5) * CELL - CITY_HALF;
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * CELL - CITY_HALF;
        // even-odd crossings
        let inside = false;
        for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
          const pa = points[a] as { x: number; z: number }, pb = points[b] as { x: number; z: number };
          if ((pa.z > pz) !== (pb.z > pz) && px < ((pb.x - pa.x) * (pz - pa.z)) / (pb.z - pa.z) + pa.x) inside = !inside;
        }
        if (inside) this.put(i, j, mm, kind);
      }
    }
  }
}
