/**
 * Traffic lights at the downtown crossings (M5.5 slice 17; BACKLOG Life): which
 * grid nodes have them and where their four poles stand. Traffic keeps to the
 * right, so each arm's signal is on its near-right corner, facing the cars that
 * arrive along that arm. The traffic reads the phases (traffic/Traffic.ts
 * `signalPhase`); the renderer draws the poles, the heads and the lamps (no
 * collider, like the street lamps: the chunks' statics, which the job
 * placement reads, stay as they were).
 */
import { BLOCK, ROAD_HALF, type RoadGraph } from './roads';

/** The crossings within `within` blocks of the centre; a pole `inset` m in from both kerbs, `poleHeight` m, its head's half height and half width. */
export const SIGNAL = { within: 1, inset: 1.6, poleHeight: 3.2, headHalf: 0.55, headHalfWidth: 0.2 } as const;

/** The signalled nodes: the downtown grid crossings with no highway and no authored road at them. */
export function signalledNodes(graph: RoadGraph): number[] {
  const out: number[] = [];
  for (const node of graph.nodes) {
    const gx = Math.round(node.x / BLOCK), gz = Math.round(node.z / BLOCK);
    if (Math.abs(gx) > SIGNAL.within || Math.abs(gz) > SIGNAL.within) continue;
    if (graph.lanes.some((l) => (l.from === node.id || l.to === node.id) && (l.special !== undefined || l.highway))) continue;
    out.push(node.id);
  }
  return out;
}

/** A pole: where it stands, the axis of the traffic it serves (0 arriving along X, 1 along Z), the way its head faces. */
export interface SignalPole { x: number; z: number; axis: 0 | 1; fx: number; fz: number }

/** The four poles of the crossing at (x, z), one on each corner. */
export function signalPoles(x: number, z: number): SignalPole[] {
  const c = ROAD_HALF + SIGNAL.inset;
  const out: SignalPole[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // the cars that have this corner on their near right: heading -Z past (+,+), +Z past (-,-), -X past (+,-), +X past (-,+)
    const axis: 0 | 1 = sx === sz ? 1 : 0;
    out.push({ x: x + sx * c, z: z + sz * c, axis, fx: axis === 0 ? sx : 0, fz: axis === 1 ? sz : 0 });
  }
  return out;
}
