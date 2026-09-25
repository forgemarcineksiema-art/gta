/**
 * The highway's structures (M8.10 slice 6a, docs/M8.10_PLAN.md): where the highway leaves the ground, what carries it.
 * The viaduct over the port's basin and the bridge over the bay's mouth are decks on piers; an overpass carries it over
 * each road that passes under it (the road dips beneath); the tunnel runs it under Crown's hill between two portals.
 * Each is a run of pieces along the highway's loop, a sample apart: where the deck's top (the lanes' height) is, which
 * way it runs and climbs, how long. The island builds their colliders (a deck and its railings; the tunnel's floor,
 * walls, roof and the lid over it), the render their meshes.
 */
import type { SpanKind } from './plan';

/** A piece of a structure: its middle at the deck's top, its heading and climb (rad), its length (m). */
export interface Piece { x: number; y: number; z: number; yaw: number; pitch: number; length: number }
/** A structure: its kind and its pieces, in the highway's order. */
export interface Structure { kind: Exclude<SpanKind, 'ground'>; pieces: Piece[] }

/** The deck's half width (the highway's, with its kerbs), its depth; the railings' height; the tunnel's clear height (m). */
export const DECK = { half: 20, depth: 0.8, railing: 1.1, clear: 7 } as const;

/**
 * The structures along a loop of points with heights, each point's span: a run of points off the ground makes one,
 * from the point before it (on the ground's edge) to the point after.
 */
export function structures(pts: ReadonlyArray<{ x: number; z: number; y?: number }>, span: readonly SpanKind[]): Structure[] {
  const out: Structure[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const kind = span[i] as SpanKind, prev = span[(i - 1 + n) % n] as SpanKind;
    if (kind === 'ground' || prev === kind) continue;
    const pieces: Piece[] = [];
    let k = i - 1;
    // from the edge before the run to the edge after it
    do {
      const a = pts[(k + n) % n] as { x: number; z: number; y?: number }, b = pts[(k + 1 + n) % n] as { x: number; z: number; y?: number };
      const dx = b.x - a.x, dz = b.z - a.z, run = Math.hypot(dx, dz), ya = a.y ?? 0, yb = b.y ?? 0;
      pieces.push({ x: (a.x + b.x) / 2, y: (ya + yb) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(dx, dz), pitch: Math.atan2(yb - ya, run), length: Math.hypot(run, yb - ya) });
      k++;
    } while (span[(k + n) % n] === kind);
    out.push({ kind, pieces });
  }
  return out;
}
